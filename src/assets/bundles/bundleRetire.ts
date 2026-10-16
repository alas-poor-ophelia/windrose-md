/**
 * bundleRetire.ts
 * The proven loose-file retirement gate shared by every writer that turns a
 * loose tile folder into a bundle in place (Dungeondraft import, "Bundle
 * folder"): list the loose images, optionally index them by content, and
 * trash each one only after the mounted bundle serves byte-identical bytes
 * for its path. Callers bracket the whole run with beginBundleWrite /
 * endBundleWrite and skip retirement when trashOptionOf(app) === 'none'.
 *
 * Public API
 *   listLooseImages(app, basePath)                 -> vault paths (sorted)
 *   indexLooseByContent(app, basePath, paths)      -> { sizes, byHash }
 *   retireLooseImages(app, basePath, paths, keys)  -> { replaced, kept }
 *   trashOptionOf(app)                             -> 'system' | 'local' | 'none' | null
 *   sameBytes(a, b)
 */

import type { App } from 'obsidian';
import { Notice, TFile, TFolder } from 'obsidian';
import { INDEX_EXT, MARKER_FILE, SHARD_EXT, isSafeBundleKey, sha256Hex } from './bundleFormat';
import { isBundleReadFailure, readEntryBytes } from './bundleRegistry';

/**
 * Loose images from an earlier import, indexed by content: sha256 -> their
 * folder-relative keys (sorted), plus the set of byte lengths so textures
 * of any other length are never read twice. Unreadable files and keys a
 * bundle cannot hold are left out (default routing applies and retirement
 * keeps them).
 */
async function indexLooseByContent(
  app: App,
  basePath: string,
  loosePaths: string[],
): Promise<{ sizes: Set<number>; byHash: Map<string, string[]> }> {
  const sizes = new Set<number>();
  const byHash = new Map<string, string[]>();
  for (const path of loosePaths) {
    const key = path.slice(basePath.length + 1);
    if (!isSafeBundleKey(key)) continue;
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await app.vault.adapter.readBinary(path));
    } catch {
      continue;
    }
    if (bytes.byteLength === 0) continue;
    sizes.add(bytes.byteLength);
    const hash = await sha256Hex(bytes);
    const keys = byHash.get(hash);
    if (keys != null) keys.push(key);
    else byHash.set(hash, [key]);
  }
  for (const keys of byHash.values()) keys.sort();
  return { sizes, byHash };
}

const LOOSE_IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

/**
 * Loose image files under basePath (an earlier loose import of this pack).
 * Every directory is walked, including user image folders named index, shards
 * or thumbs; the bundle's own files are excluded by extension (.wridx,
 * .wrshard) and the marker, never by directory. Vault paths.
 */
async function listLooseImages(app: App, basePath: string): Promise<string[]> {
  const out: string[] = [];
  const queue = [basePath];
  while (queue.length > 0) {
    const dir = queue.pop();
    if (dir == null) continue;
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await app.vault.adapter.list(dir);
    } catch {
      continue;
    }
    for (const sub of listing.folders) queue.push(sub);
    for (const f of listing.files) {
      if (f === `${basePath}/${MARKER_FILE}` || f.endsWith(INDEX_EXT) || f.endsWith(SHARD_EXT)) continue;
      if (LOOSE_IMAGE_RE.test(f)) out.push(f);
    }
  }
  return out.sort();
}

/** Why a loose image from an earlier import was left in place. */
type LooseKeptReason = 'differs' | 'not-in-bundle' | 'not-indexed' | 'not-served' | 'trash-failed';

/** Same length and every byte equal. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Obsidian's "Deleted files" setting (`system` | `local` | `none`), or null
 * when this build does not expose vault.getConfig (mobile, older API): the
 * caller then retires through fileManager.trashFile, which uses `.trash`.
 */
function trashOptionOf(app: App): string | null {
  const vault = app.vault as unknown as { getConfig?: (key: string) => unknown };
  if (typeof vault.getConfig !== 'function') return null;
  try {
    const v = vault.getConfig('trashOption');
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/**
 * Move loose images to the trash once the mounted bundle serves the SAME
 * bytes for their paths. Each candidate is read back through readEntryBytes
 * (a real shard read, not an index lookup) and compared byte-for-byte with
 * the loose file; anything else stays, loose-wins keeps it in force, and it
 * is reported with a reason: `differs` (pack update or user override),
 * `not-in-bundle` (this run bundled nothing at that key and no mounted
 * segment serves it), `not-served` (the bundle has the key but the read
 * failed, or the loose file could not be read),
 * `not-indexed` (the vault has no TFile for it), `trash-failed`. Folders left
 * empty below basePath are trashed too. fileManager.trashFile honours the
 * user's trash setting; the caller skips this entirely when that setting
 * deletes permanently.
 */
async function retireLooseImages(
  app: App,
  basePath: string,
  loosePaths: string[],
  /** Folder-relative keys this run bundled. */
  bundledKeys: ReadonlySet<string>,
): Promise<{ replaced: number; kept: Array<{ path: string; reason: LooseKeptReason }> }> {
  const kept: Array<{ path: string; reason: LooseKeptReason }> = [];
  if (loosePaths.length === 0) return { replaced: 0, kept };
  let replaced = 0;
  const touchedDirs = new Set<string>();
  for (const path of loosePaths) {
    const rel = path.slice(basePath.length + 1);
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      kept.push({ path: rel, reason: 'not-indexed' });
      continue;
    }
    const served = await readEntryBytes(app, path);
    if (isBundleReadFailure(served)) {
      kept.push({ path: rel, reason: bundledKeys.has(rel) ? 'not-served' : 'not-in-bundle' });
      continue;
    }
    let looseBytes: Uint8Array;
    try {
      looseBytes = new Uint8Array(await app.vault.adapter.readBinary(path));
    } catch {
      kept.push({ path: rel, reason: 'not-served' });
      continue;
    }
    if (!sameBytes(new Uint8Array(served.bytes), looseBytes)) {
      kept.push({ path: rel, reason: 'differs' });
      continue;
    }
    try {
      await app.fileManager.trashFile(file);
      replaced++;
      touchedDirs.add(path.slice(0, path.lastIndexOf('/')));
    } catch (e) {
      kept.push({ path: rel, reason: 'trash-failed' });
      console.error('[Windrose] Could not move the loose tile to the trash:', path, e);
    }
  }
  // Deepest first, walking up to (never including) basePath.
  const dirs = new Set<string>();
  for (let d of touchedDirs) {
    while (d.startsWith(basePath + '/')) {
      dirs.add(d);
      d = d.slice(0, d.lastIndexOf('/'));
    }
  }
  for (const dir of [...dirs].sort((a, b) => b.split('/').length - a.split('/').length)) {
    try {
      const listing = await app.vault.adapter.list(dir);
      if (listing.files.length > 0 || listing.folders.length > 0) continue;
      const folder = app.vault.getAbstractFileByPath(dir);
      if (folder instanceof TFolder) await app.fileManager.trashFile(folder);
    } catch (e) {
      console.warn('[Windrose] Could not remove the empty folder', dir, e);
    }
  }
  if (kept.length > 0) {
    const groups = new Map<LooseKeptReason, string[]>();
    for (const k of kept) {
      const g = groups.get(k.reason);
      if (g != null) g.push(k.path);
      else groups.set(k.reason, [k.path]);
    }
    const lines = [...groups].map(([reason, paths]) => `  ${reason} (${paths.length}):\n    ${paths.join('\n    ')}`);
    console.warn(`[Windrose] ${kept.length} loose file(s) in ${basePath} kept:\n${lines.join('\n')}`);
    const names = kept.slice(0, 3).map(k => k.path.split('/').pop() ?? k.path);
    const more = kept.length > 3 ? ', and more' : '';
    new Notice(
      `Windrose: kept ${kept.length} loose ${kept.length === 1 ? 'file' : 'files'} the new bundle does not replace ` +
      `(${names.join(', ')}${more}). See the developer console for details.`,
      10_000,
    );
  }
  return { replaced, kept };
}

export { listLooseImages, indexLooseByContent, retireLooseImages, trashOptionOf, sameBytes };
export type { LooseKeptReason };
