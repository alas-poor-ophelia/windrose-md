/**
 * bundleDevCommand.ts
 * Developer command: bundle a registered loose tileset folder into a sibling
 * "<folder> (bundled)" folder and register the sibling as a tileset folder.
 *
 * Public API
 *   openBundleTileFolderDev(host)   // host = the plugin (app, settings, saveSettings)
 *
 * Phase 0 spike tooling: exact mode, 4 MiB shards, ids carried over verbatim
 * from the loose scan so the bundled set resolves the same tile ids.
 *
 * Each tile also gets a thumbnail (<= 64 px, cropped to its opaque pixels the
 * same way thumbnailCache crops, PNG) in thumbs/, so browsing a bundled set
 * decodes 64 px thumbs instead of full-size art. A tile whose thumb fails to
 * render is still bundled, just without a thumb.
 *
 * Re-running into an existing target is allowed when it has no index (an
 * interrupted run): its orphaned shards and thumbs go to the trash first.
 * A target with an index is refused. Skipped tiles are listed by name in
 * one grouped console warning.
 */

import type { App } from 'obsidian';
import { Notice, SuggestModal, TFile } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';

import { scanTilesetFolder } from '../tilesetScan';
import { isTileReadFailure, readTileBytes } from '../tileBytes';
import { BundleWriter } from './bundleWriter';
import { decodeTile } from './bundleThumbs';
import { INDEX_DIR, INDEX_EXT, SHARDS_DIR, THUMBS_DIR } from './bundleFormat';

const TARGET_SHARD_BYTES = 4 * 1024 * 1024;

export interface BundleDevHost {
  app: App;
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

class TilesetFolderSuggestModal extends SuggestModal<string> {
  constructor(app: App, private readonly folders: string[], private readonly onPick: (folder: string) => void) {
    super(app);
    this.setPlaceholder('Pick a tileset folder to bundle');
  }

  getSuggestions(query: string): string[] {
    const q = query.toLowerCase();
    return this.folders.filter(f => f.toLowerCase().includes(q));
  }

  renderSuggestion(folder: string, el: HTMLElement): void {
    el.setText(folder);
  }

  onChooseSuggestion(folder: string): void {
    this.onPick(folder);
  }
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tiles';
}

async function listOrEmpty(app: App, dir: string): Promise<string[]> {
  try {
    return (await app.vault.adapter.list(dir)).files;
  } catch {
    return [];
  }
}

/**
 * Prepare the target folder. Returns false (after a Notice) when it already
 * holds a committed bundle; trashes orphaned shards/thumbs of an interrupted run.
 */
async function prepareTarget(app: App, target: string): Promise<boolean> {
  if (!(await app.vault.adapter.exists(target))) return true;
  const index = (await listOrEmpty(app, `${target}/${INDEX_DIR}`)).filter(f => f.endsWith(INDEX_EXT));
  if (index.length > 0) {
    new Notice(`${target} already holds a bundle; remove it first.`);
    return false;
  }
  for (const dir of [SHARDS_DIR, THUMBS_DIR]) {
    for (const path of await listOrEmpty(app, `${target}/${dir}`)) {
      const file = app.vault.getAbstractFileByPath(path);
      if (file instanceof TFile) await app.fileManager.trashFile(file);
    }
  }
  return true;
}

async function bundleFolder(host: BundleDevHost, folderIn: string): Promise<void> {
  const { app } = host;
  const folder = folderIn.endsWith('/') ? folderIn.slice(0, -1) : folderIn;
  const target = `${folder} (bundled)`;
  if (!(await prepareTarget(app, target))) return;

  const entries = await scanTilesetFolder(app, folder);
  entries.sort((a, b) =>
    (a.category ?? '').localeCompare(b.category ?? '') || a.filename.localeCompare(b.filename));
  new Notice(`Bundling ${entries.length} tiles from ${folder}…`);

  const baseName = folder.slice(folder.lastIndexOf('/') + 1);
  const writer = new BundleWriter(app, target, {
    packId: slugify(baseName), name: baseName, mode: 'exact', targetShardBytes: TARGET_SHARD_BYTES,
  });
  const readFailures: { key: string; reason: string }[] = [];
  let thumbCount = 0;
  let thumbBytes = 0;
  for (const entry of entries) {
    const key = entry.vaultPath.slice(folder.length + 1);
    const res = await readTileBytes(app, entry.vaultPath);
    if (isTileReadFailure(res)) { readFailures.push({ key, reason: `read failed (${res.kind})` }); continue; }
    const decoded = await decodeTile(res.bytes, res.mime);
    if (decoded == null) { readFailures.push({ key, reason: 'image failed to decode' }); continue; }
    if (decoded.thumb) { thumbCount++; thumbBytes += decoded.thumb.byteLength; }
    await writer.add(key, new Uint8Array(res.bytes), res.mime, entry.id, decoded.dims, decoded.thumb ?? undefined);
  }
  const result = await writer.finish();

  const folders = host.settings.tilesetFolders ?? [];
  if (!folders.includes(target)) host.settings.tilesetFolders = [...folders, target];
  // saveSettings dispatches windrose-settings-changed, so tilesets rebuild.
  await host.saveSettings();

  const mb = (result.bytes / (1024 * 1024)).toFixed(1);
  const skipped = [...readFailures, ...result.skipped];
  new Notice(`Bundled ${result.entryCount} tiles into ${result.shards.length} shards (${mb} MB), ${skipped.length} skipped.`);
  if (thumbCount > 0) {
    console.debug(`[bundleDevCommand] ${thumbCount} thumbs, ${Math.round(thumbBytes / thumbCount)} bytes average`);
  }
  if (skipped.length > 0) {
    const lines = skipped.map(x => `  ${x.key}: ${x.reason}`).join('\n');
    console.warn(`[bundleDevCommand] ${skipped.length} tile(s) skipped from ${folder}:\n${lines}`);
  }
}

/** Open the folder picker; on pick, bundle the folder to its sibling. */
export function openBundleTileFolderDev(host: BundleDevHost): void {
  const folders = (host.settings.tilesetFolders ?? []).filter(f => f !== '' && !f.endsWith(' (bundled)'));
  if (folders.length === 0) {
    new Notice('No loose tileset folders registered.');
    return;
  }
  new TilesetFolderSuggestModal(host.app, folders, (folder) => {
    void bundleFolder(host, folder).catch((err: unknown) => {
      console.error('[bundleDevCommand] bundling failed', err);
      new Notice(`Bundling ${folder} failed: ${(err as Error)?.message ?? String(err)}`);
    });
  }).open();
}
