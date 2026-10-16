/**
 * bundleUnbundle.ts
 * "Unbundle": write every tile a mounted bundle serves back to the folder as
 * a loose file, then retire the bundle files. Desktop only.
 *
 * Public API
 *   unbundleRefusal(app, folder)                    -> message | null (the up-front checks)
 *   unbundleFolder(app, folder, { onProgress? })    -> UnbundleResult
 *
 * Each served entry goes to `<folder>/<key>` through vault.createBinary (the
 * same path the scan would list, so the tileset path and the folder-relative
 * ids stay as they were). A file already at that path is kept when it holds
 * the same bytes, and otherwise refused and reported as a conflict: loose
 * wins at the same key, so its tile is the user's file, not the bundle's.
 * After the writes every written file is read back and compared (sha256 and
 * length) with the served bytes; one that differs is removed again, since a
 * loose file would shadow the bundle's good copy.
 *
 * A failed createBinary removes a file it left at the path only when it is
 * shorter than the bytes written (a truncated file of ours would shadow the
 * bundle) and the error is not "already exists"; the bundle is kept.
 *
 * Id parity: before anything is trashed the folder is listed exactly as the
 * loose scan will walk it once the bundle is gone (listLooseImagePaths +
 * mintIdsForLayout from tilesetScan), and every served key must mint its
 * stored id; a mismatch (rock.png + rock.webp in a flipped order, a key the
 * scan would not list) keeps the bundle and is reported in `idMismatches`.
 *
 * The bundle files go to the trash only when EVERY served key exists loose
 * with the served bytes and the same id: any conflict, read failure, failed
 * verification or id mismatch keeps the whole bundle, which stays harmless
 * because loose files shadow it with identical bytes. index/ is re-listed
 * right before the trash: an index file that was not loaded when the run
 * started (Sync) keeps the bundle. Then the loaded index files go first (the
 * commit points), index/ is re-listed again, and only the shards and thumbs
 * the loaded segments list and no index still on disk lists are trashed (when
 * no index remains at all, every shard and thumb file in the folder goes, so a
 * leftover from an earlier failed trash cannot keep the folder reading as a
 * bundle "not on this device yet"); the marker goes last, only when no index
 * file remains. With trashOption 'none'
 * the export still runs and the bundle files are left in place. A fully
 * retired folder is unmounted so the registry forgets it.
 *
 * Refused up front: mobile, a folder that is not 'mounted' (partial
 * included), and a bundle write in flight. One run per folder; the whole run
 * sits inside beginBundleWrite / endBundleWrite.
 */

import type { App } from 'obsidian';
import { Platform, TFile, TFolder } from 'obsidian';

import type { IndexSegment } from './bundleFormat';
import { decodeIndexSegment, INDEX_DIR, INDEX_EXT, MARKER_FILE, SHARDS_DIR, THUMBS_DIR, sha256Hex } from './bundleFormat';
import {
  beginBundleWrite, endBundleWrite, entriesFor, getBundleModes, getBundleSegments, getBundleState, isBundleReadFailure,
  isBundleWriteInProgress, mountBundleFolder, readEntryBytes, unmountBundleFolder,
} from './bundleRegistry';
import { sameBytes, trashOptionOf } from './bundleRetire';
import { clearTileBytesNegativeCache } from '../tileBytes';
import { isTileImagePath, listLooseImagePaths, mintIdsForLayout } from '../tilesetScan';

interface UnbundleOptions {
  /** Called after each entry is written (or refused). */
  onProgress?(done: number, total: number): void;
}

type UnbundleResult =
  | { status: 'refused'; folder: string; message: string }
  | {
    status: 'done';
    folder: string;
    /** Served entries. */
    total: number;
    /** Loose files this run created. */
    written: number;
    /** Keys that already had a loose file with the served bytes. */
    identical: number;
    /** Keys with a different loose file already there (kept; the bundle stays). */
    conflicts: string[];
    /** Keys that could not be read, written or verified (the bundle stays). */
    failed: Array<{ key: string; reason: string }>;
    /** True when the bundle files went to the trash and the folder was unmounted. */
    retired: boolean;
    /** The trash setting deletes permanently, so the bundle files were left in place. */
    keptPermanentDelete: boolean;
    /** Bundle files that could not be moved to the trash. */
    trashFailed: number;
    /** A serving segment was compact: the files are the re-encoded copies. */
    compact: boolean;
    /** An index segment appeared on disk during the run (Sync): its tiles were not exported, so the bundle stayed. */
    newSegment: boolean;
    /** Served keys whose loose-scan id would differ from the stored id (or that the scan would not list): the bundle stays. */
    idMismatches: string[];
  };

const runsInFlight = new Map<string, Promise<UnbundleResult>>();

function normalize(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Why the action may not run on `folder` right now, or null. */
function unbundleRefusal(_app: App, folderIn: string): string | null {
  const folder = normalize(folderIn);
  if (Platform.isMobile) return 'Unbundling is only available on desktop.';
  if (runsInFlight.has(folder) || isBundleWriteInProgress(folder)) {
    return `${folder} is already being unbundled, compacted, bundled or imported; wait for it to finish.`;
  }
  if (getBundleState(folder) !== 'mounted') return `${folder} is not a fully readable tile bundle, so it cannot be unbundled.`;
  return null;
}

/** Create every missing parent folder of `path` (createBinary needs them). */
async function ensureParents(app: App, folder: string, path: string): Promise<void> {
  const parts = path.slice(folder.length + 1).split('/');
  let dir = folder;
  for (let i = 0; i < parts.length - 1; i++) {
    dir += `/${parts[i]}`;
    if (!(await app.vault.adapter.exists(dir))) await app.vault.createFolder(dir);
  }
}

async function readDisk(app: App, path: string): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await app.vault.adapter.readBinary(path));
  } catch {
    return null;
  }
}

/** Index segment files directly under `<folder>/index/`, sorted (a fresh disk listing). */
async function listIndexFiles(app: App, folder: string): Promise<string[]> {
  try {
    return (await app.vault.adapter.list(`${folder}/${INDEX_DIR}`)).files.filter(f => f.endsWith(INDEX_EXT)).sort();
  } catch {
    return []; // No index directory.
  }
}

/** Vault paths of the files directly under <folder>/<sub> ([] when absent). */
async function listDirFiles(app: App, folder: string, sub: string): Promise<string[]> {
  try {
    return (await app.vault.adapter.list(`${folder}/${sub}`)).files.sort();
  } catch {
    return [];
  }
}

async function readSegmentFromDisk(app: App, path: string): Promise<IndexSegment | null> {
  try {
    return decodeIndexSegment(new Uint8Array(await app.vault.adapter.readBinary(path)));
  } catch {
    return null;
  }
}

/**
 * Served keys whose id would change once the bundle is gone: the folder is
 * listed exactly as the scan walks it (walk order, image extensions only, so
 * no marker/index/shard/thumb file) and ids are minted with the scan's own
 * fresh seen-set. A key the scan would not list counts as a mismatch too.
 */
async function idMismatchesOf(
  app: App, folder: string, entries: ReadonlyArray<{ key: string; id: string }>,
): Promise<string[]> {
  const minted = mintIdsForLayout((await listLooseImagePaths(app, folder)).map(p => p.slice(folder.length + 1)));
  const out: string[] = [];
  const detail: string[] = [];
  for (const e of entries) {
    const loose = isTileImagePath(e.key) ? minted.get(e.key) : undefined;
    if (loose === e.id) continue;
    out.push(e.key);
    detail.push(`  ${e.key}: stored "${e.id}", loose ${loose == null ? 'not listed by the scan' : `"${loose}"`}`);
  }
  if (out.length > 0) {
    console.warn(`[Windrose] Unbundling ${folder}: ${out.length} tile(s) would get different ids as loose files; the bundle was kept:\n${detail.join('\n')}`);
  }
  return out;
}

async function trashPath(app: App, path: string): Promise<boolean> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return !(await app.vault.adapter.exists(path));
  try {
    await app.fileManager.trashFile(file);
    return true;
  } catch (e) {
    console.error('[Windrose] Could not move a bundle file to the trash:', path, e);
    return false;
  }
}

/** Trash index/, shards/ and thumbs/ when they are left empty. */
async function trashEmptyDirs(app: App, folder: string): Promise<void> {
  for (const dir of [INDEX_DIR, SHARDS_DIR, THUMBS_DIR]) {
    const path = `${folder}/${dir}`;
    try {
      const listing = await app.vault.adapter.list(path);
      if (listing.files.length > 0 || listing.folders.length > 0) continue;
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFolder) await app.fileManager.trashFile(f);
    } catch {
      // Missing or busy: leave it.
    }
  }
}

async function runUnlocked(app: App, folder: string, opts: UnbundleOptions): Promise<UnbundleResult> {
  const entries = entriesFor(folder).entries;
  const segments = getBundleSegments(folder);
  const loadedIndexFiles = new Set(segments.map(s => s.file));
  const compact = getBundleModes(folder).includes('compact');
  const conflicts: string[] = [];
  const failed: Array<{ key: string; reason: string }> = [];
  /** path -> sha256 + length of the served bytes, for the paths this run wrote. */
  const toVerify = new Map<string, { key: string; sha: string; len: number }>();
  let identical = 0;
  let done = 0;
  for (const e of entries) {
    const res = await readEntryBytes(app, e.vaultPath);
    if (isBundleReadFailure(res)) {
      failed.push({ key: e.key, reason: `read failed (${res.kind})` });
    } else {
      const bytes = new Uint8Array(res.bytes);
      if (await app.vault.adapter.exists(e.vaultPath)) {
        const disk = await readDisk(app, e.vaultPath);
        if (disk != null && sameBytes(disk, bytes)) identical++;
        else conflicts.push(e.key);
      } else {
        try {
          await ensureParents(app, folder, e.vaultPath);
          await app.vault.createBinary(e.vaultPath, bytes.slice().buffer);
          toVerify.set(e.vaultPath, { key: e.key, sha: await sha256Hex(bytes), len: bytes.byteLength });
        } catch (err) {
          const message = (err as Error)?.message ?? String(err);
          failed.push({ key: e.key, reason: `write failed (${message})` });
          // A partial write (disk full, quit) would shadow the bundle's good copy: remove it, but only when
          // it is ours. "Already exists" means a file landed between the check and the write (Sync, the
          // user); a file at least as large as ours is not a truncated write of ours. Either stays.
          try {
            const st = /already exists/i.test(message) ? null : await app.vault.adapter.stat(e.vaultPath);
            if (st?.type === 'file' && st.size < bytes.byteLength) await app.vault.adapter.remove(e.vaultPath);
          } catch (rmErr) {
            console.error('[Windrose] Could not remove a partially written unbundled file:', e.vaultPath, rmErr);
          }
        }
      }
    }
    opts.onProgress?.(++done, entries.length);
  }
  clearTileBytesNegativeCache(folder);

  // Read-back gate: every written file against the served bytes.
  // A file that does not match would shadow the bundle (loose wins), so it goes.
  let written = 0;
  for (const [path, want] of toVerify) {
    const disk = await readDisk(app, path);
    if (disk != null && disk.byteLength === want.len && await sha256Hex(disk) === want.sha) {
      written++;
      continue;
    }
    failed.push({ key: want.key, reason: 'did not read back identical' });
    try {
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await app.fileManager.trashFile(f);
      else await app.vault.adapter.remove(path);
    } catch (e) {
      console.error('[Windrose] Could not remove an unverified unbundled file:', path, e);
    }
  }

  if (conflicts.length > 0) {
    console.warn(`[Windrose] Unbundling ${folder}: kept ${conflicts.length} existing file(s) that differ from the bundle:\n  ${conflicts.join('\n  ')}`);
  }
  if (failed.length > 0) {
    console.warn(`[Windrose] Unbundling ${folder}: ${failed.length} tile(s) not exported:\n${failed.map(f => `  ${f.key}: ${f.reason}`).join('\n')}`);
  }

  const base = { status: 'done' as const, folder, total: entries.length, written, identical, conflicts, failed, compact };
  const kept = { retired: false, keptPermanentDelete: false, trashFailed: 0, newSegment: false, idMismatches: [] as string[] };
  if (conflicts.length > 0 || failed.length > 0) return { ...base, ...kept };
  // Id parity: once the bundle is gone the loose scan mints the ids; every
  // placed reference survives only if each minted id equals the stored one.
  const idMismatches = await idMismatchesOf(app, folder, entries);
  if (idMismatches.length > 0) return { ...base, ...kept, idMismatches };
  if (trashOptionOf(app) === 'none') return { ...base, ...kept, keptPermanentDelete: true };

  // Re-list index/ right before trashing: every index file on disk must be one
  // this run exported from (a segment synced in mid-run may hold tiles nobody wrote loose).
  const lateSegment = (files: readonly string[]): boolean => files.some(f => !loadedIndexFiles.has(f));
  const indexFiles = await listIndexFiles(app, folder);
  if (lateSegment(indexFiles)) {
    console.warn(`[Windrose] Unbundling ${folder}: a new index segment appeared during the run; the bundle files were kept.`);
    return { ...base, ...kept, newSegment: true };
  }

  // Index files first (the commit points), then only the shards and thumbs the
  // loaded segments list, then the marker.
  let trashFailed = 0;
  for (const path of indexFiles) {
    if (!(await trashPath(app, path))) trashFailed++;
  }
  // Whatever index is on disk now (a failed trash, or a segment that arrived
  // meanwhile) keeps every shard it lists; one that cannot be read keeps them all.
  const remaining = await listIndexFiles(app, folder);
  const newSegment = lateSegment(remaining);
  const protectedShards = new Set<string>();
  let keepAllShards = false;
  for (const path of remaining) {
    const seg = await readSegmentFromDisk(app, path);
    if (seg == null) { keepAllShards = true; continue; }
    for (const sh of seg.shards) protectedShards.add(`${folder}/${SHARDS_DIR}/${sh.name}`);
    for (const sh of seg.thumbShards ?? []) protectedShards.add(`${folder}/${THUMBS_DIR}/${sh.name}`);
  }
  if (!keepAllShards) {
    // With no index left on this device nothing can reference a shard, so the
    // sweep takes every shard and thumb file in the folder: a leftover from an
    // earlier failed trash would otherwise keep the folder reading as a bundle
    // that is "not on this device yet", with no button to clear it.
    const listed = remaining.length === 0
      ? [...await listDirFiles(app, folder, SHARDS_DIR), ...await listDirFiles(app, folder, THUMBS_DIR)]
      : [...new Set(segments.flatMap(s => s.files.map(f => f.path)))].sort();
    for (const path of listed) {
      if (protectedShards.has(path)) continue;
      if (!(await trashPath(app, path))) trashFailed++;
    }
  }
  if (remaining.length === 0 && !(await trashPath(app, `${folder}/${MARKER_FILE}`))) trashFailed++;
  await trashEmptyDirs(app, folder);
  const retired = trashFailed === 0 && remaining.length === 0;
  if (newSegment) console.warn(`[Windrose] Unbundling ${folder}: a new index segment appeared while retiring; it and its shards were kept.`);
  if (retired) unmountBundleFolder(folder);
  else await mountBundleFolder(app, folder);
  return { ...base, ...kept, retired, trashFailed, newSegment };
}

/** Export a mounted bundle as loose files and retire it; see the file header. */
async function unbundleFolder(app: App, folderIn: string, opts: UnbundleOptions = {}): Promise<UnbundleResult> {
  const folder = normalize(folderIn);
  const refusal = unbundleRefusal(app, folder);
  if (refusal != null) return { status: 'refused', folder, message: refusal };
  beginBundleWrite(folder);
  const run = runUnlocked(app, folder, opts).finally(() => endBundleWrite(folder));
  runsInFlight.set(folder, run);
  try {
    return await run;
  } finally {
    runsInFlight.delete(folder);
  }
}

export { unbundleFolder, unbundleRefusal };
export type { UnbundleResult };
