/**
 * bundleCleanup.ts
 * "Clean up": list and trash bundle files no index segment on disk references.
 * Desktop only, always user-initiated, never automatic.
 *
 * Public API
 *   listBundleOrphans(app, folder)                          -> BundleOrphan[]
 *   cleanupBundleOrphans(app, folder, { olderThanMs?, now? }) -> BundleCleanupResult
 *
 * References come from DISK, never the registry snapshot: every `.wridx`
 * directly under index/ is read and parsed (loaded by the registry or not),
 * and every shard and thumb file a parsed index lists is referenced. An
 * orphan is a `.wridx` that is garbage (does not inflate, is not JSON, or
 * names no `format`; one that names a format but does not validate may be a
 * newer plugin's and aborts the run), or a `.wrshard` directly under
 * shards/ or thumbs/ no parsed index lists (leftovers of an interrupted
 * write, a superseded compact pass, or a failed trash). An index file that
 * cannot be READ (busy, half-synced) stops the whole listing.
 *
 * Age: an orphan is old only when BOTH its mtime and its ctime are older than
 * the threshold (7 days by default). Sync can deliver a file carrying the
 * source device's old mtime while ctime says when it landed here, and a writer
 * on another device writes its shards before the index that references them.
 *
 * Before every single trash index/ is re-scanned; a new or unreadable index,
 * or one that now lists the file, stops the loop (`stopped`).
 *
 * Nothing is listed or trashed while a bundle write is in flight. The clean-up
 * forces a remount first (a stale registry record is never trusted) and
 * refuses unless the fresh state is `mounted`, or `partial` only because of
 * index files that do not parse (no other bad segment, no entry pending).
 */

import type { App } from 'obsidian';
import { Platform, TFile } from 'obsidian';

import { inflateSync, strFromU8 } from 'fflate';

import { decodeIndexSegment, INDEX_DIR, INDEX_EXT, SHARDS_DIR, SHARD_EXT, THUMBS_DIR } from './bundleFormat';
import type { BundleState } from './bundleRegistry';
import {
  beginBundleWrite, endBundleWrite, entriesFor, getBundleState, getBundleStateInfo, isBundleWriteInProgress,
  mountBundleFolder,
} from './bundleRegistry';

const ORPHAN_MIN_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface BundleOrphan {
  path: string;
  size: number;
  /** Modification time (ms since epoch). */
  mtime: number;
  /** Creation time on this device (ms since epoch); 0 when the adapter does not report it. */
  ctime: number;
}

interface BundleCleanupResult {
  folder: string;
  /** Orphans moved to the trash. */
  trashed: BundleOrphan[];
  /** Orphans younger than the threshold, left in place. */
  keptYoung: BundleOrphan[];
  /** Orphans the trash refused. */
  failed: BundleOrphan[];
  /** Set when nothing ran (mobile, not mounted, write in flight, unreadable or newer index). */
  refused?: string;
  /** Index files changed mid-run: the loop stopped before the remaining orphans. */
  stopped?: boolean;
}

interface IndexScan {
  /** Index files that were read but do not parse. */
  unparsable: string[];
  /** Shard and thumb paths some parsed index lists. */
  referenced: Set<string>;
  /** Every index file that was scanned. */
  files: string[];
}

function normalize(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

function notReadable(folder: string): string {
  return `${folder} is not a fully readable tile bundle, so it cannot be cleaned up.`;
}

function upFrontRefusal(folder: string): string | null {
  if (Platform.isMobile) return 'Cleaning up a bundle is only available on desktop.';
  if (isBundleWriteInProgress(folder)) return `${folder} is being written to; wait for it to finish.`;
  return null;
}

async function listDir(app: App, path: string, ext: string): Promise<string[]> {
  try {
    return (await app.vault.adapter.list(path)).files.filter(f => f.endsWith(ext)).sort();
  } catch {
    return [];
  }
}

/**
 * A segment that failed decodeIndexSegment: 'garbage' only when it does not
 * inflate, is not JSON, or carries no `format` field. Anything that names a
 * format (ours with a newer major, an unknown mode or shape, or another one)
 * may be a newer plugin's file: never an orphan.
 */
function classifyUndecodable(bytes: Uint8Array): 'garbage' | 'foreign' {
  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(inflateSync(bytes)));
  } catch {
    return 'garbage';
  }
  if (raw === null || typeof raw !== 'object' || !('format' in raw)) return 'garbage';
  return 'foreign';
}

/**
 * Parse every index file on disk. 'unreadable' when one cannot be read at
 * all, 'newer' when one names a format but does not validate (touch nothing
 * in either case).
 */
async function scanIndexes(app: App, folder: string): Promise<IndexScan | 'unreadable' | 'newer'> {
  const unparsable: string[] = [];
  const referenced = new Set<string>();
  const files = await listDir(app, `${folder}/${INDEX_DIR}`, INDEX_EXT);
  for (const path of files) {
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await app.vault.adapter.readBinary(path));
    } catch {
      return 'unreadable';
    }
    try {
      const seg = decodeIndexSegment(bytes);
      for (const s of seg.shards) referenced.add(`${folder}/${SHARDS_DIR}/${s.name}`);
      for (const s of seg.thumbShards ?? []) referenced.add(`${folder}/${THUMBS_DIR}/${s.name}`);
    } catch {
      if (classifyUndecodable(bytes) === 'foreign') return 'newer';
      unparsable.push(path);
    }
  }
  return { unparsable, referenced, files };
}

function scanRefusal(folder: string, scan: 'unreadable' | 'newer'): string {
  return scan === 'newer'
    ? `Clean up skipped: ${folder} has bundle files from a newer version of the plugin.`
    : `${folder} has an index file that could not be read; nothing was moved.`;
}

/**
 * Whether `state` (the registry's current view) allows a clean-up: `mounted`,
 * or `partial` whose every bad segment is an index file `scan` found unparsable
 * and with no pending entry (no bad shard).
 */
function stateAllowsCleanup(folder: string, state: BundleState, scan: IndexScan): boolean {
  if (state === 'mounted') return true;
  if (state !== 'partial') return false;
  const bad = (getBundleStateInfo(folder)?.badSegments ?? []).map(b => {
    const cut = b.indexOf(': ');
    return cut < 0 ? b : b.slice(0, cut);
  });
  if (bad.length === 0 || entriesFor(folder).entries.some(e => e.pending)) return false;
  return bad.every(p => scan.unparsable.includes(p));
}

async function statOrphan(app: App, path: string): Promise<BundleOrphan | null> {
  try {
    const st = await app.vault.adapter.stat(path);
    return st?.type === 'file' ? { path, size: st.size, mtime: st.mtime, ctime: st.ctime ?? 0 } : null;
  } catch {
    return null; // Vanished meanwhile.
  }
}

async function collectOrphans(app: App, folder: string, scan: IndexScan): Promise<BundleOrphan[]> {
  const candidates = [...scan.unparsable];
  for (const dir of [SHARDS_DIR, THUMBS_DIR]) {
    for (const path of await listDir(app, `${folder}/${dir}`, SHARD_EXT)) {
      if (!scan.referenced.has(path)) candidates.push(path);
    }
  }
  const out: BundleOrphan[] = [];
  for (const path of candidates) {
    const o = await statOrphan(app, path);
    if (o != null) out.push(o);
  }
  return out;
}

/** Unreferenced index, shard and thumb files (list, parse every index, stat); [] when a clean-up would be refused. */
async function listBundleOrphans(app: App, folderIn: string): Promise<BundleOrphan[]> {
  const folder = normalize(folderIn);
  if (upFrontRefusal(folder) != null) return [];
  const scan = await scanIndexes(app, folder);
  if (typeof scan === 'string' || !stateAllowsCleanup(folder, getBundleState(folder), scan)) return [];
  return collectOrphans(app, folder, scan);
}

/** Split orphans by age: `old` (mtime AND ctime past the threshold) may be trashed, `young` are kept. */
function partitionOrphans(
  orphans: readonly BundleOrphan[],
  olderThanMs = ORPHAN_MIN_AGE_MS,
  now = Date.now(),
): { old: BundleOrphan[]; young: BundleOrphan[] } {
  const old: BundleOrphan[] = [];
  const young: BundleOrphan[] = [];
  for (const o of orphans) (now - Math.max(o.mtime, o.ctime) >= olderThanMs ? old : young).push(o);
  return { old, young };
}

/** Trash the orphans older than `olderThanMs`, from a forced remount and a fresh disk listing. */
async function cleanupBundleOrphans(
  app: App,
  folderIn: string,
  opts: { olderThanMs?: number; now?: number } = {},
): Promise<BundleCleanupResult> {
  const folder = normalize(folderIn);
  const upFront = upFrontRefusal(folder);
  if (upFront != null) return { folder, trashed: [], keptYoung: [], failed: [], refused: upFront };
  beginBundleWrite(folder);
  try {
    const state = await mountBundleFolder(app, folder);
    const scan = await scanIndexes(app, folder);
    if (typeof scan === 'string') return { folder, trashed: [], keptYoung: [], failed: [], refused: scanRefusal(folder, scan) };
    if (!stateAllowsCleanup(folder, state, scan)) return { folder, trashed: [], keptYoung: [], failed: [], refused: notReadable(folder) };
    const { old, young } = partitionOrphans(await collectOrphans(app, folder, scan), opts.olderThanMs, opts.now);
    const trashed: BundleOrphan[] = [];
    const failed: BundleOrphan[] = [];
    const scanned = new Set(scan.files);
    for (const o of old) {
      // Re-scan before every trash: an index that arrived since (Sync, another
      // device importing the same content) may reference this very file.
      const again = await scanIndexes(app, folder);
      if (typeof again === 'string' || again.files.some(f => !scanned.has(f)) || again.referenced.has(o.path)) {
        console.warn(`[Windrose] Cleaning up ${folder}: index files changed during the run; stopped before ${o.path}.`);
        return { folder, trashed, keptYoung: young, failed, stopped: true };
      }
      const file = app.vault.getAbstractFileByPath(o.path);
      if (!(file instanceof TFile)) { failed.push(o); continue; }
      try {
        await app.fileManager.trashFile(file);
        trashed.push(o);
      } catch (e) {
        console.error('[Windrose] Could not move an unused bundle file to the trash:', o.path, e);
        failed.push(o);
      }
    }
    return { folder, trashed, keptYoung: young, failed };
  } finally {
    endBundleWrite(folder);
  }
}

export { listBundleOrphans, cleanupBundleOrphans, partitionOrphans, ORPHAN_MIN_AGE_MS };
export type { BundleOrphan, BundleCleanupResult };
