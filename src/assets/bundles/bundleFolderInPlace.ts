/**
 * bundleFolderInPlace.ts
 * Turn a registered plain image folder into a tile bundle IN the same folder,
 * then retire its loose images through the shared read-back gate.
 *
 * Public API
 *   bundleFolderInPlace(app, folder, { onProgress? }) -> BundleFolderResult
 *
 * The folder path does not change, so the tileset id does not change, and the
 * scan's tile ids are stored in the index verbatim: placed maps keep resolving
 * every tile. Exact mode only (the original bytes, 4 MiB shards), with a
 * <= 64 px thumb per tile from bundleThumbs (a failed thumb skips only the
 * thumb). Memory stays at one open shard plus one image.
 *
 * Refused (nothing written) when the folder already holds an index segment,
 * when another bundle write to it is running, or when it has no images. An
 * interrupted run (marker and shards but no index) may run again: same bytes
 * give the same file names and the writer rewrites a wrong-size file.
 *
 * Loose files move to the trash only after the mounted bundle serves
 * byte-identical bytes for their path (retireLooseImages); when Obsidian's
 * trash setting deletes permanently, every loose file stays.
 */

import type { App } from 'obsidian';

import { scanTilesetFolder } from '../tilesetScan';
import { isTileReadFailure, readTileBytes } from '../tileBytes';
import { BundleWriter } from './bundleWriter';
import { decodeTile } from './bundleThumbs';
import { INDEX_DIR, INDEX_EXT } from './bundleFormat';
import { beginBundleWrite, endBundleWrite, isBundleWriteInProgress, mountBundleFolder } from './bundleRegistry';
import type { LooseKeptReason } from './bundleRetire';
import { listLooseImages, retireLooseImages, trashOptionOf } from './bundleRetire';

const TARGET_SHARD_BYTES = 4 * 1024 * 1024;

interface BundleFolderOptions {
  /** Called after each tile is read and added (or skipped). */
  onProgress?(done: number, total: number): void;
}

type BundleFolderRefusal = 'has-index' | 'in-progress' | 'no-images';

type BundleFolderResult =
  | { status: 'refused'; folder: string; reason: BundleFolderRefusal; message: string }
  | {
    status: 'done';
    folder: string;
    /** Tiles the committed index serves. */
    bundled: number;
    /** Tiles left out of the bundle (read or decode failure, writer refusal). */
    skipped: Array<{ key: string; reason: string }>;
    /** Loose files moved to the trash after a byte-identical read-back. */
    replaced: number;
    /** Loose files left in place, with the gate's reason. */
    kept: Array<{ path: string; reason: LooseKeptReason }>;
    /** Loose files left because the trash setting deletes permanently. */
    keptPermanentDelete: number;
    /** Shard, thumb and index bytes written. */
    bytes: number;
    /** Main shard files. */
    shards: number;
  };

/** One run per folder at a time. */
const runsInFlight = new Map<string, Promise<BundleFolderResult>>();

function normalize(folder: string): string {
  return folder.trim().replace(/\/+$/, '');
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'tiles';
}

async function hasIndex(app: App, folder: string): Promise<boolean> {
  try {
    return (await app.vault.adapter.list(`${folder}/${INDEX_DIR}`)).files.some(f => f.endsWith(INDEX_EXT));
  } catch {
    return false;
  }
}

async function runUnlocked(app: App, folder: string, opts: BundleFolderOptions): Promise<BundleFolderResult> {
  if (await hasIndex(app, folder)) {
    return { status: 'refused', folder, reason: 'has-index', message: `${folder} is already a tile bundle.` };
  }
  // The vault watcher stays out of the folder until the bundle is committed,
  // mounted and the replaced loose files are gone.
  beginBundleWrite(folder);
  try {
    const entries = await scanTilesetFolder(app, folder);
    if (entries.length === 0) {
      return { status: 'refused', folder, reason: 'no-images', message: `${folder} has no images to bundle.` };
    }
    entries.sort((a, b) =>
      (a.category ?? '').localeCompare(b.category ?? '') || a.filename.localeCompare(b.filename));

    const baseName = folder.slice(folder.lastIndexOf('/') + 1);
    const writer = new BundleWriter(app, folder, {
      packId: slugify(baseName), name: baseName, mode: 'exact', targetShardBytes: TARGET_SHARD_BYTES,
    });
    const readFailures: Array<{ key: string; reason: string }> = [];
    const added = new Set<string>();
    let done = 0;
    for (const entry of entries) {
      const key = entry.vaultPath.slice(folder.length + 1);
      const res = await readTileBytes(app, entry.vaultPath);
      if (isTileReadFailure(res)) {
        readFailures.push({ key, reason: `read failed (${res.kind})` });
      } else {
        const decoded = await decodeTile(res.bytes, res.mime);
        if (decoded == null) {
          readFailures.push({ key, reason: 'image failed to decode' });
        } else {
          await writer.add(key, new Uint8Array(res.bytes), res.mime, entry.id, decoded.dims, decoded.thumb ?? undefined);
          added.add(key);
        }
      }
      opts.onProgress?.(++done, entries.length);
    }
    const written = await writer.finish();
    for (const s of written.skipped) added.delete(s.key);
    const skipped = [...readFailures, ...written.skipped];
    if (skipped.length > 0) {
      const lines = skipped.map(x => `  ${x.key}: ${x.reason}`).join('\n');
      console.warn(`[Windrose] ${skipped.length} tile(s) left out of the bundle in ${folder}:\n${lines}`);
    }
    await mountBundleFolder(app, folder);

    let replaced = 0;
    let kept: Array<{ path: string; reason: LooseKeptReason }> = [];
    let keptPermanentDelete = 0;
    const loose = await listLooseImages(app, folder);
    if (loose.length > 0 && written.indexFile !== '') {
      if (trashOptionOf(app) === 'none') {
        // "Permanently delete" in Obsidian's settings: trashFile would destroy the originals.
        keptPermanentDelete = loose.length;
      } else {
        try {
          ({ replaced, kept } = await retireLooseImages(app, folder, loose, added));
        } catch (e) {
          console.warn('[Windrose] Retiring loose files failed for', folder, e);
        }
        if (replaced > 0) {
          // Clears the registry's loose-shadow answers for the trashed paths.
          try {
            await mountBundleFolder(app, folder);
          } catch (e) {
            console.warn('[Windrose] Remount after retiring loose files failed for', folder, e);
          }
        }
      }
    }
    return {
      status: 'done', folder, bundled: written.entryCount, skipped, replaced, kept, keptPermanentDelete,
      bytes: written.bytes, shards: written.shards.length,
    };
  } finally {
    endBundleWrite(folder);
  }
}

/** Bundle a loose tileset folder into itself; see the file header. */
async function bundleFolderInPlace(app: App, folderIn: string, opts: BundleFolderOptions = {}): Promise<BundleFolderResult> {
  const folder = normalize(folderIn);
  if (runsInFlight.has(folder) || isBundleWriteInProgress(folder)) {
    return {
      status: 'refused', folder, reason: 'in-progress',
      message: `${folder} is already being bundled or imported; wait for it to finish.`,
    };
  }
  const run = runUnlocked(app, folder, opts);
  runsInFlight.set(folder, run);
  try {
    return await run;
  } finally {
    runsInFlight.delete(folder);
  }
}

export { bundleFolderInPlace };
export type { BundleFolderResult };
