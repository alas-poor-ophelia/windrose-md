/**
 * bundleCompactExisting.ts
 * "Compact bundle": turn a mounted exact bundle into a compact one in place.
 *
 * Public API
 *   compactBundleRefusal(app, folder)                 -> message | null (the up-front checks)
 *   compactExistingBundle(app, folder, { onProgress?, signal?, codec? }) -> CompactBundleResult
 *
 * Every entry the union serves is read back through readEntryBytes and run
 * through compactEncode (same 64 KB floor, skip rules and verify as a compact
 * import). One NEW segment with mode 'compact' is written: re-encoded entries
 * carry `src` (the original sha256 / size / mime); kept-exact entries are
 * copied byte-for-byte, so the segment is complete on its own. Ids and keys
 * come from the mounted entries verbatim (never re-minted). Thumbs are the
 * existing thumb slices, or re-rendered (bundleThumbs.decodeTile) when absent.
 *
 * An exact segment outranks a compact one, so the superseded exact segments
 * must go. After finish() + remount: every key the exact segments hold must be
 * in the new segment; the new index, read from DISK, must carry each key with
 * the id, w and h the union served before the run; every key is read back
 * from THAT segment only (readSegmentEntryBytes: magic sniff, then the stored
 * length and sha256 must match what was written). Only then are the exact
 * index files moved to the trash; then index/*.wridx is re-listed from disk
 * and only the old shards no on-disk segment references are trashed (a shard
 * the new segment shares, or one a segment that arrived mid-run lists, stays);
 * then the folder remounts and `retired` holds only if no exact segment still
 * serves. A failed index trash trashes no shard. Nothing is trashed before
 * the read-back: an interrupted or failed run leaves both segments and exact
 * keeps winning. When nothing re-encoded, the new segment is dropped instead
 * (its index, then its unshared shards) and the exact segment stays.
 * Trash failures are logged and counted as `orphaned`.
 *
 * Refused up front: mobile, a folder that is not 'mounted' (partial included),
 * no serving exact segment, a bundle write in flight, and a trash setting that
 * deletes permanently (the exact bytes would be gone for good). One run per
 * folder; the whole run sits inside beginBundleWrite / endBundleWrite.
 */

import type { App } from 'obsidian';
import { Platform, TFile } from 'obsidian';

import { decodeIndexSegment, INDEX_DIR, INDEX_EXT, SHARDS_DIR, sha256Hex, sniffImageMime, THUMBS_DIR } from './bundleFormat';
import type { IndexEntry, IndexSegment } from './bundleFormat';
import { BundleWriter } from './bundleWriter';
import { COMPACT_FLOOR_BYTES, COMPACT_QUALITY, compactEncode } from './bundleCompact';
import type { CompactCodec } from './bundleCompact';
import { decodeTile } from './bundleThumbs';
import {
  beginBundleWrite, endBundleWrite, entriesFor, getBundleMarker, getBundleModes, getBundleSegments, getBundleState,
  isBundleReadFailure, isBundleWriteInProgress, mountBundleFolder, readEntryBytes, readSegmentEntryBytes,
} from './bundleRegistry';
import type { BundleSegmentInfo } from './bundleRegistry';
import { trashOptionOf } from './bundleRetire';

const TARGET_SHARD_BYTES = 4 * 1024 * 1024;

/** What the run is doing when onProgress fires. */
type CompactPhase = 'encoding' | 'verifying' | 'retiring';

interface CompactBundleOptions {
  /**
   * Called after each entry is encoded (or skipped), each key is read back,
   * and each file is moved to the trash. Callers that only show
   * `done of total` may ignore `phase`.
   */
  onProgress?(done: number, total: number, phase: CompactPhase): void;
  /** Checked between entries and before anything is trashed. */
  signal?: AbortSignal;
  /** Test hook for compactEncode. */
  codec?: CompactCodec;
}

type CompactBundleResult =
  | { status: 'refused'; folder: string; message: string }
  | { status: 'cancelled'; folder: string; message: string }
  | {
    status: 'done';
    folder: string;
    /** Entries stored as a WebP re-encode. */
    reencoded: number;
    /** Entries copied byte-for-byte. */
    keptExact: number;
    /** Entries that could not be read or written (the exact copy keeps them; nothing retired then). */
    skipped: Array<{ key: string; reason: string }>;
    /** True when the superseded exact segments went to the trash and no exact segment serves after the remount. */
    retired: boolean;
    /** Why the exact segments stayed, when retired is false. */
    keptReason: string;
    /** Bundle files that could not be moved to the trash (each logged with its path). */
    orphaned: number;
    /** Extra sentence for the result notice ('' when there is nothing to add). */
    message: string;
    /** Bundle bytes (index, shard and thumb files) before and after. */
    bytesBefore: number;
    bytesAfter: number;
  };

const runsInFlight = new Map<string, Promise<CompactBundleResult>>();

function normalize(folder: string): string {
  return folder.trim().replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Unique bundle files (index + shards + thumbs) of `segments`, with sizes. */
function bundleBytes(segments: readonly BundleSegmentInfo[]): number {
  const sizes = new Map<string, number>();
  for (const s of segments) {
    sizes.set(s.file, s.indexBytes);
    for (const f of s.files) sizes.set(f.path, f.size);
  }
  let n = 0;
  for (const v of sizes.values()) n += v;
  return n;
}

/** Why the action may not run on `folder` right now, or null. */
function compactBundleRefusal(app: App, folderIn: string): string | null {
  const folder = normalize(folderIn);
  if (Platform.isMobile) return 'Compacting a bundle is only available on desktop.';
  if (runsInFlight.has(folder) || isBundleWriteInProgress(folder)) {
    return `${folder} is already being compacted, bundled or imported; wait for it to finish.`;
  }
  if (getBundleState(folder) !== 'mounted') return `${folder} is not a fully readable tile bundle, so it cannot be compacted.`;
  if (!getBundleModes(folder).includes('exact')) return `${folder} is already compact.`;
  if (trashOptionOf(app) === 'none') {
    return `Cannot compact ${folder}: your trash setting deletes files permanently, so the exact copy could not be recovered. ` +
      'Change "Deleted files" in the Files and links settings first.';
  }
  return null;
}

function aborted(opts: CompactBundleOptions): boolean {
  return opts.signal?.aborted === true;
}

/** Decode the index segment at `path` straight from disk, or null when it cannot be read or parsed. */
async function readSegmentFromDisk(app: App, path: string): Promise<IndexSegment | null> {
  try {
    return decodeIndexSegment(new Uint8Array(await app.vault.adapter.readBinary(path)));
  } catch {
    return null;
  }
}

/** Vault paths of the main and thumb shards `seg` lists. */
function shardPathsOf(folder: string, seg: IndexSegment): string[] {
  return [
    ...seg.shards.map(s => `${folder}/${SHARDS_DIR}/${s.name}`),
    ...(seg.thumbShards ?? []).map(s => `${folder}/${THUMBS_DIR}/${s.name}`),
  ];
}

/**
 * Every shard path referenced by an index segment currently ON DISK (a fresh
 * listing, not the registry record, so a segment that arrived mid-run counts).
 * Null when any index file cannot be read or parsed: then no shard is safe to trash.
 */
async function shardsReferencedOnDisk(app: App, folder: string): Promise<Set<string> | null> {
  const dir = `${folder}/${INDEX_DIR}`;
  const refs = new Set<string>();
  if (!(await app.vault.adapter.exists(dir))) return refs;
  const listing = await app.vault.adapter.list(dir);
  for (const path of listing.files) {
    if (!path.endsWith(INDEX_EXT)) continue;
    const seg = await readSegmentFromDisk(app, path);
    if (seg == null) {
      console.warn(`[Windrose] Compacting ${folder}: could not read ${path}; no shard files were moved to the trash.`);
      return null;
    }
    for (const p of shardPathsOf(folder, seg)) refs.add(p);
  }
  return refs;
}

async function runUnlocked(app: App, folder: string, opts: CompactBundleOptions): Promise<CompactBundleResult> {
  const before = getBundleSegments(folder);
  const superseded = before.filter(s => s.mode === 'exact');
  const marker = getBundleMarker(folder);
  if (marker == null) return { status: 'refused', folder, message: `${folder} has no readable bundle marker.` };
  const entries = entriesFor(folder).entries;
  const bytesBefore = bundleBytes(before);

  const writer = new BundleWriter(app, folder, {
    packId: marker.packId, name: marker.name, mode: 'compact', targetShardBytes: TARGET_SHARD_BYTES,
  });
  /** key -> sha256 + length of the bytes handed to the writer (the read-back target). */
  const expected = new Map<string, { sha: string; len: number }>();
  /** key -> id the pre-run union served, and the dims handed to the writer. */
  const expectedMeta = new Map<string, { id: string; w: number; h: number }>();
  const skipped: Array<{ key: string; reason: string }> = [];
  let reencoded = 0;
  let keptExact = 0;
  let done = 0;
  for (const e of entries) {
    if (aborted(opts)) return { status: 'cancelled', folder, message: `Compacting ${folder} was cancelled; nothing changed.` };
    const res = await readEntryBytes(app, e.vaultPath);
    if (isBundleReadFailure(res)) {
      skipped.push({ key: e.key, reason: `read failed (${res.kind})` });
    } else {
      const source = new Uint8Array(res.bytes);
      const enc = await compactEncode(source, res.mime, {
        quality: COMPACT_QUALITY, floorBytes: COMPACT_FLOOR_BYTES, codec: opts.codec,
      });
      let thumb: Uint8Array | undefined;
      const t = await readEntryBytes(app, e.vaultPath, { thumb: true });
      if (!isBundleReadFailure(t)) thumb = new Uint8Array(t.bytes);
      let dims = { w: e.w, h: e.h };
      if (thumb == null) {
        const decoded = await decodeTile(res.bytes, res.mime);
        if (decoded != null) {
          thumb = decoded.thumb ?? undefined;
          if (dims.w === 0 || dims.h === 0) dims = decoded.dims;
        }
      }
      let stored: Uint8Array = source;
      let src: IndexEntry['src'];
      if (enc.kind === 'compact') {
        stored = enc.bytes;
        src = { sha256: await sha256Hex(source), bytes: source.byteLength, mime: sniffImageMime(source) ?? res.mime };
      }
      await writer.add(e.key, stored, enc.kind === 'compact' ? enc.mime : res.mime, e.id, dims, thumb, src);
      expected.set(e.key, { sha: await sha256Hex(stored), len: stored.byteLength });
      expectedMeta.set(e.key, { id: e.id, w: dims.w, h: dims.h });
      if (enc.kind === 'compact') reencoded++;
      else keptExact++;
    }
    opts.onProgress?.(++done, entries.length, 'encoding');
  }
  if (aborted(opts)) return { status: 'cancelled', folder, message: `Compacting ${folder} was cancelled; nothing changed.` };

  const written = await writer.finish();
  for (const s of written.skipped) {
    skipped.push(s);
    expected.delete(s.key);
    expectedMeta.delete(s.key);
  }

  let orphaned = 0;
  const trash = async (path: string): Promise<boolean> => {
    const file = app.vault.getAbstractFileByPath(path);
    try {
      if (!(file instanceof TFile)) throw new Error('not in the vault index');
      await app.fileManager.trashFile(file);
      return true;
    } catch (e) {
      console.warn('[Windrose] Could not move a bundle file to the trash:', path, e);
      return false;
    }
  };
  /** Trash the `candidates` no on-disk segment references; each failure counts as orphaned. */
  const trashUnreferenced = async (candidates: readonly string[], total: number, start: number): Promise<void> => {
    let n = start;
    const refs = await shardsReferencedOnDisk(app, folder);
    if (refs == null) return;
    for (const path of new Set(candidates)) {
      if (refs.has(path)) continue;
      if (!(await trash(path))) orphaned++;
      opts.onProgress?.(++n, total, 'retiring');
    }
  };
  const notice = (): string => (orphaned > 0
    ? `${orphaned} shard ${orphaned === 1 ? 'file' : 'files'} could not be moved to the trash (see developer console).`
    : '');
  const keep = (keptReason: string): CompactBundleResult => ({
    status: 'done', folder, reencoded, keptExact, skipped, retired: false, keptReason, orphaned, message: notice(),
    bytesBefore, bytesAfter: bundleBytes(getBundleSegments(folder)),
  });

  if (written.indexFile === '') {
    await mountBundleFolder(app, folder);
    return keep('nothing was written');
  }

  // Nothing compressed: the new segment would only duplicate the exact one, so drop it
  // (index first; then its shards no on-disk segment shares).
  if (reencoded === 0) {
    const mine = await readSegmentFromDisk(app, written.indexFile);
    if (!before.some(s => s.file === written.indexFile)) {
      if (await trash(written.indexFile)) {
        if (mine != null) {
          const files = shardPathsOf(folder, mine);
          await trashUnreferenced(files, files.length, 0);
        }
      } else {
        orphaned++;
      }
    }
    await mountBundleFolder(app, folder);
    return keep('nothing to compact (all images stayed exact)');
  }

  await mountBundleFolder(app, folder);
  if (skipped.length > 0) {
    const lines = skipped.map(x => `  ${x.key}: ${x.reason}`).join('\n');
    console.warn(`[Windrose] Compacting ${folder}: ${skipped.length} tile(s) not in the compact copy:\n${lines}`);
    return keep('some tiles could not be copied');
  }
  const stem = written.indexFile.slice(written.indexFile.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  const fresh = getBundleSegments(folder).find(s => s.hash === stem);
  if (getBundleState(folder) !== 'mounted' || fresh == null) return keep('the compact copy did not mount');

  // Read-back gate, part 1: the new segment as stored on disk holds every key the
  // exact segments hold, each with the id and dims the union served before the run.
  const freshKeys = new Set(fresh.keys);
  for (const s of superseded) {
    if (s.keys.some(k => !freshKeys.has(k))) return keep('the compact copy is missing tiles the exact copy holds');
  }
  const stored = await readSegmentFromDisk(app, written.indexFile);
  if (stored == null) return keep('the compact copy did not read back (index)');
  for (const [key, want] of expectedMeta) {
    const got = stored.entries[key] as IndexEntry | undefined;
    if (got == null || got.id !== want.id || got.w !== want.w || got.h !== want.h) {
      console.warn(`[Windrose] Compacting ${folder}: ${key} stored as ` +
        `${got == null ? 'nothing' : `id ${got.id} ${got.w}x${got.h}`}, expected id ${want.id} ${want.w}x${want.h}.`);
      return keep(`the compact copy has a different id or size for ${key}`);
    }
  }
  // Part 2: every key's bytes from the NEW segment only, against what was written.
  let verified = 0;
  for (const key of fresh.keys) {
    const want = expected.get(key);
    const got = await readSegmentEntryBytes(app, folder, stem, key);
    if (want == null || isBundleReadFailure(got)) return keep(`the compact copy did not read back (${key})`);
    const bytes = new Uint8Array(got.bytes);
    if (sniffImageMime(bytes) == null || bytes.byteLength !== want.len || await sha256Hex(bytes) !== want.sha) {
      return keep(`the compact copy did not read back (${key})`);
    }
    opts.onProgress?.(++verified, fresh.keys.length, 'verifying');
  }
  if (aborted(opts)) return keep('cancelled before the exact copy was retired');

  // Index files first (the commit points), then a fresh on-disk listing decides
  // which shards no segment references any more, then remount.
  const candidates = [...new Set(superseded.flatMap(s => s.files.map(f => f.path)))];
  const total = superseded.length + candidates.length;
  let step = 0;
  let allIndexTrashed = true;
  for (const s of superseded) {
    if (!(await trash(s.file))) allIndexTrashed = false;
    opts.onProgress?.(++step, total, 'retiring');
  }
  // A failed index trash leaves that segment listing its shards: trash no shard then.
  if (allIndexTrashed) await trashUnreferenced(candidates, total, step);
  await mountBundleFolder(app, folder);
  if (!allIndexTrashed) return keep('an exact index file could not be moved to the trash');
  if (getBundleModes(folder).includes('exact')) return keep('an exact segment still serves this bundle; run Compact again');
  return {
    status: 'done', folder, reencoded, keptExact, skipped, retired: true, keptReason: '', orphaned, message: notice(),
    bytesBefore, bytesAfter: bundleBytes(getBundleSegments(folder)),
  };
}


/** Compact a mounted exact bundle in place; see the file header. */
async function compactExistingBundle(
  app: App,
  folderIn: string,
  opts: CompactBundleOptions = {},
): Promise<CompactBundleResult> {
  const folder = normalize(folderIn);
  const refusal = compactBundleRefusal(app, folder);
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

export { compactExistingBundle, compactBundleRefusal };
export type { CompactBundleResult, CompactPhase };
