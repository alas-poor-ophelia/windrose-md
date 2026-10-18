/**
 * bundleDevCommand.ts
 * Developer shortcut for "Bundle folder": pick a registered tileset folder
 * and bundle it in place (bundleFolderInPlace), without opening settings.
 *
 * Public API
 *   openBundleTileFolderDev(host)   // host = the plugin (app, settings)
 */

import type { App } from 'obsidian';
import { Notice, Platform, SuggestModal } from 'obsidian';
import type { PluginSettings } from '#types/settings/settings.types';

import { bundleFolderInPlace } from './bundleFolderInPlace';
import { formatBundleFolderResult } from '../../settings/helpers/bundleStatus';

export interface BundleDevHost {
  app: App;
  settings: PluginSettings;
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

async function bundleFolder(host: BundleDevHost, folder: string): Promise<void> {
  const progress = new Notice(`Bundling ${folder}…`, 0);
  try {
    const result = await bundleFolderInPlace(host.app, folder, {
      onProgress: (done, total) => progress.setMessage(`Bundling ${folder}: ${done} of ${total} files…`),
    });
    progress.hide();
    new Notice(formatBundleFolderResult(result), 10_000);
  } catch (err) {
    progress.hide();
    throw err;
  }
}

/** Open the folder picker; on pick, bundle the folder in place. */
export function openBundleTileFolderDev(host: BundleDevHost): void {
  if (!Platform.isDesktopApp) {
    new Notice('Bundling a tile folder needs the desktop app.');
    return;
  }
  const folders = (host.settings.tilesetFolders ?? []).map(f => f.trim().replace(/\/+$/, '')).filter(f => f !== '');
  if (folders.length === 0) {
    new Notice('No tileset folders registered.');
    return;
  }
  new TilesetFolderSuggestModal(host.app, folders, (folder) => {
    void bundleFolder(host, folder).catch((err: unknown) => {
      console.error('[bundleDevCommand] bundling failed', err);
      new Notice(`Bundling ${folder} failed: ${(err as Error)?.message ?? String(err)}`);
    });
  }).open();
}
