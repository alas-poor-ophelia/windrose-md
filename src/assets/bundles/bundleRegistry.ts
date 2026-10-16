/**
 * bundleRegistry.ts
 * Module-singleton registry of mounted tile bundles (format: bundleFormat.ts).
 *
 * Public API
 *   type BundleState = 'loose' | 'mounted' | 'partial' | 'unmounted-corrupt'
 *                    | 'unsupported-version' | 'not-on-device'
 *   mountBundleFolder(app, folder): Promise<BundleState>   (forced (re)mount)
 *   ensureMounted(app, folder): Promise<BundleState>       (reuses a serving record or an in-flight mount)
 *   unmountBundleFolder(folder): void
 *   remountOnRename(oldPath, newPath): Promise<void>   (also handles renamed ancestors)
 *   getBundleState(folder): BundleState                ('loose' when never mounted)
 *   getBundleStateInfo(folder): { state, reason, badSegments } | null
 *   entriesFor(folder): { state, reason, entries: BundleEntryView[] }
 *       entries is [] for every state but 'mounted' | 'partial'. Callers MUST
 *       branch on `state`: an empty list from a non-serving state is not
 *       "a folder with zero tiles".
 *   lookupEntry(vaultPath): ResolvedEntry | null       (longest-prefix over serving roots)
 *   readEntryBytes(app, vaultPath, opts?): Promise<BundleBytes | BundleReadFailure>
 *   isBundleReadFailure(x)
 *   markLooseShadow(vaultPath) / isLooseShadowed(vaultPath)
 *       per-path "a loose file sits on top of this bundle entry" answers
 *       (tileBytes.ts); cleared for a folder's prefix whenever it (re|un)mounts.
 *   getBundleSegments(folder): BundleSegmentInfo[]   (loaded segments of a serving folder; [] otherwise)
 *   getBundleModes(folder): BundleMode[]             (distinct modes of the segments that win at least one key)
 *   getBundleMarker(folder): BundleMarker | null
 *   readSegmentEntryBytes(app, folder, segment, key, opts?)
 *       one key resolved within ONE segment (no union, no runner-up fallback,
 *       no negative cache or pending marks): the read-back a writer runs
 *       before it retires the segments a new one supersedes.
 *   getBundleRegistryVersion(): number; subscribeBundleRegistry(cb): () => void
 *   _resetBundleRegistryForTests()
 *
 * Invariants
 *   - A failed or partial mount never presents an empty-but-valid entry set.
 *   - Every mount takes a per-folder monotonic token; a mount whose token is no
 *     longer the latest (a newer mount or an unmount started) discards its result.
 *   - Mount stats every referenced shard: a missing or wrong-size shard makes the
 *     folder 'partial' and its entries pending up front (or serves the key's
 *     runner-up segment entry when that one's shard is fine). Bytes-level damage
 *     (truncation after mount, a header that disagrees with the index) is found at
 *     first read and treated the same way.
 *   - Read failures are negative-cached on the folder record, so a remount starts
 *     clean and an in-flight read that lands after a remount cannot poison it.
 *   - Shard bytes go through ShardCache: LRU 3 shards / 12 MiB desktop,
 *     2 / 8 MiB mobile; one in-flight read per shard; on mobile at most one
 *     shard read in flight globally. A buffer is cached only after it passed the
 *     size and header checks. A forced remount keeps cached shards the new union
 *     still references at the same size (header table re-checked); unmount and
 *     rename drop them.
 */

import type { App } from 'obsidian';
import { Platform } from 'obsidian';

import {
  INDEX_DIR, INDEX_EXT, MARKER_FILE, MAX_MOBILE_SHARD_BYTES, SHARDS_DIR, SHARD_EXT, THUMBS_DIR,
  BUNDLE_MAJOR,
  compareSegmentPrecedence, contentName, decodeIndexSegment, decodeShardHeader, parseMarker, sniffImageMime,
} from './bundleFormat';
import type { BundleMarker, BundleMode, SegmentPrecedence } from './bundleFormat';

// ===========================================
// Types
// ===========================================

export type BundleState =
  | 'loose'
  | 'mounted'
  | 'partial'
  | 'unmounted-corrupt'
  | 'unsupported-version'
  | 'not-on-device';

export interface BundleEntryView {
  key: string;
  id: string;
  vaultPath: string;
  mime: string;
  w: number;
  h: number;
  /** True once the entry is known unreadable (shard missing/corrupt). */
  pending: boolean;
}

interface ShardLoc {
  path: string;
  size: number;
  o: number;
  l: number;
}

export interface ResolvedEntry {
  folder: string;
  key: string;
  id: string;
  vaultPath: string;
  mime: string;
  w: number;
  h: number;
  mode: BundleMode;
  segment: string;
  main: ShardLoc;
  thumb?: ShardLoc;
}

export type BundleReadFailureKind =
  | 'shard-missing'
  | 'shard-size-mismatch'
  | 'shard-table-mismatch'
  | 'slice-out-of-range'
  | 'bad-magic'
  | 'shard-too-large'
  | 'not-mounted';

export interface BundleReadFailure {
  ok: false;
  kind: BundleReadFailureKind;
  detail: string;
}

export interface BundleBytes {
  ok: true;
  bytes: ArrayBuffer;
  mime: string;
}

type Candidate = ResolvedEntry & SegmentPrecedence;

/** One loaded index segment, as getBundleSegments reports it. */
export interface BundleSegmentInfo {
  /** File stem (sha16). */
  hash: string;
  /** Vault path of the .wridx file. */
  file: string;
  mode: BundleMode;
  createdAt: string;
  /** Size of the index file in bytes. */
  indexBytes: number;
  /** Folder-relative keys the segment holds (sorted). */
  keys: string[];
  /** Main and thumb shard files the segment lists (vault paths, sizes from the index). */
  files: Array<{ path: string; size: number }>;
  /** True when the segment wins the union for at least one key. */
  serving: boolean;
}

interface SegmentRecord {
  hash: string;
  file: string;
  mode: BundleMode;
  createdAt: string;
  indexBytes: number;
  files: Array<{ path: string; size: number }>;
  entries: Map<string, Candidate>;
}

/** One index reference into a shard, checked against the shard's own table. */
interface ShardRefCheck {
  key: string;
  o: number;
  l: number;
}

interface FolderRecord {
  folder: string;
  app: App;
  token: number;
  state: BundleState;
  reason: string;
  marker: BundleMarker | null;
  badSegments: string[];
  entries: Map<string, Candidate>;
  /** Second-best segment entry per key, served when the winner's shard is bad. */
  runnerUps: Map<string, Candidate>;
  pending: Set<string>;
  /** Shard path -> failure (mount-time stat or first failed load). */
  badShards: Map<string, BundleReadFailure>;
  /** vaultPath (or vaultPath + '#thumb') -> failure. */
  negative: Map<string, BundleReadFailure>;
  /** Shard path -> every index reference into it (all segments). */
  shardRefs: Map<string, ShardRefCheck[]>;
  /** Every good segment by file stem, with its own entries. */
  segments: Map<string, SegmentRecord>;
}

// ===========================================
// Module state
// ===========================================

const _folders = new Map<string, FolderRecord>();
const _mountTokens = new Map<string, number>();
const _mountInflight = new Map<string, { token: number; promise: Promise<BundleState> }>();
const _looseShadowed = new Set<string>();
let _version = 0;
const _listeners = new Set<() => void>();

function bump(): void {
  _version++;
  for (const cb of _listeners) cb();
}

export function getBundleRegistryVersion(): number {
  return _version;
}

export function subscribeBundleRegistry(cb: () => void): () => void {
  _listeners.add(cb);
  return () => { _listeners.delete(cb); };
}

function normFolder(folder: string): string {
  return folder.replace(/\\/g, '/').replace(/\/+$/, '');
}

function isServing(state: BundleState): boolean {
  return state === 'mounted' || state === 'partial';
}

function nextToken(folder: string): number {
  const t = (_mountTokens.get(folder) ?? 0) + 1;
  _mountTokens.set(folder, t);
  return t;
}

function fail(kind: BundleReadFailureKind, detail: string): BundleReadFailure {
  return { ok: false, kind, detail };
}

// ===========================================
// Write-in-progress guard (importers writing a bundle into a folder)
// ===========================================

const _writesInProgress = new Map<string, number>();

/**
 * Mark a bundle write as running in `folder`. The vault watcher in main.ts
 * ignores marker/index/shard events for the folder until the matching
 * endBundleWrite, and the scan stays quiet about `index-missing` meanwhile:
 * the importer mounts and broadcasts itself once the index is committed.
 * Calls nest (a counter per folder).
 */
export function beginBundleWrite(folder: string): void {
  const f = normFolder(folder);
  _writesInProgress.set(f, (_writesInProgress.get(f) ?? 0) + 1);
}

/** End a write started with beginBundleWrite (call from a finally). */
export function endBundleWrite(folder: string): void {
  const f = normFolder(folder);
  const n = (_writesInProgress.get(f) ?? 0) - 1;
  if (n > 0) _writesInProgress.set(f, n);
  else _writesInProgress.delete(f);
}

/** True when a bundle write is running in `folder` or in a folder containing it. */
export function isBundleWriteInProgress(folder: string): boolean {
  if (_writesInProgress.size === 0) return false;
  const f = normFolder(folder);
  for (const w of _writesInProgress.keys()) {
    if (f === w || f.startsWith(w + '/')) return true;
  }
  return false;
}

// ===========================================
// Loose-shadow answers (positive only; see tileBytes.ts)
// ===========================================

export function markLooseShadow(vaultPath: string): void {
  _looseShadowed.add(vaultPath);
}

export function isLooseShadowed(vaultPath: string): boolean {
  return _looseShadowed.has(vaultPath);
}

// ===========================================
// Shard cache
// ===========================================

class ShardLoadError extends Error {
  constructor(readonly failure: BundleReadFailure) {
    super(failure.detail);
  }
}

class ShardCache {
  /** Cumulative adapter reads (perf recorder). */
  reads = 0;
  readBytes = 0;
  get cachedCount(): number { return this.lru.size; }
  get cachedBytes(): number { return this.bytes; }
  private lru = new Map<string, ArrayBuffer>();
  private bytes = 0;
  private inflight = new Map<string, Promise<ArrayBuffer>>();
  private mobileQueue: Promise<unknown> = Promise.resolve();

  private budget(): { count: number; bytes: number } {
    return Platform.isMobile
      ? { count: 2, bytes: 8 * 1024 * 1024 }
      : { count: 3, bytes: 12 * 1024 * 1024 };
  }

  /**
   * Load a shard. `validate` runs once per load, before the buffer is cached;
   * a failing buffer rejects with ShardLoadError and is never cached.
   */
  get(app: App, path: string, validate: (buf: ArrayBuffer) => BundleReadFailure | null): Promise<ArrayBuffer> {
    const hit = this.lru.get(path);
    if (hit) {
      this.lru.delete(path);
      this.lru.set(path, hit);
      return Promise.resolve(hit);
    }
    const existing = this.inflight.get(path);
    if (existing) return existing;
    const read = (): Promise<ArrayBuffer> => {
      this.reads++;
      return app.vault.adapter.readBinary(path).then(buf => { this.readBytes += buf.byteLength; return buf; });
    };
    let p: Promise<ArrayBuffer>;
    if (Platform.isMobile) {
      p = this.mobileQueue.then(read, read);
      this.mobileQueue = p.catch(() => undefined);
    } else {
      p = read();
    }
    const tracked: Promise<ArrayBuffer> = p.then(buf => {
      const bad = validate(buf);
      if (bad) throw new ShardLoadError(bad);
      // A dropPrefix while this read was in flight means a remount: do not cache.
      if (this.inflight.get(path) === tracked) this.put(path, buf);
      return buf;
    }).finally(() => {
      if (this.inflight.get(path) === tracked) this.inflight.delete(path);
    });
    this.inflight.set(path, tracked);
    return tracked;
  }

  private put(path: string, buf: ArrayBuffer): void {
    const prev = this.lru.get(path);
    if (prev) this.bytes -= prev.byteLength;
    this.lru.set(path, buf);
    this.bytes += buf.byteLength;
    const { count, bytes } = this.budget();
    while (this.lru.size > 1 && (this.lru.size > count || this.bytes > bytes)) {
      const oldest = this.lru.keys().next().value as string;
      this.bytes -= this.lru.get(oldest)?.byteLength ?? 0;
      this.lru.delete(oldest);
    }
  }

  /**
   * Drop every cached buffer and in-flight load under `prefix`. `keep`, when
   * given, spares a cached buffer it approves (a forced remount keeps shards
   * whose name and size are unchanged); in-flight loads are always dropped.
   */
  dropPrefix(prefix: string, keep?: (path: string, buf: ArrayBuffer) => boolean): void {
    for (const [k, v] of this.lru) {
      if (k.startsWith(prefix) && keep?.(k, v) !== true) {
        this.bytes -= v.byteLength;
        this.lru.delete(k);
      }
    }
    for (const k of [...this.inflight.keys()]) if (k.startsWith(prefix)) this.inflight.delete(k);
  }

  clear(): void {
    this.lru.clear();
    this.bytes = 0;
    this.inflight.clear();
    this.mobileQueue = Promise.resolve();
  }
}

const _shards = new ShardCache();

// ===========================================
// Mount / unmount
// ===========================================

async function safeExists(app: App, path: string): Promise<boolean> {
  try {
    return await app.vault.adapter.exists(path);
  } catch {
    return false;
  }
}

async function safeStat(app: App, path: string): Promise<{ size: number } | null> {
  try {
    return await app.vault.adapter.stat(path);
  } catch {
    return null;
  }
}

async function listFiles(app: App, path: string, ext: string): Promise<string[]> {
  if (!(await safeExists(app, path))) return [];
  try {
    const listing = await app.vault.adapter.list(path);
    return listing.files.filter(f => f.endsWith(ext)).sort();
  } catch {
    return [];
  }
}

function stemOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(0, dot) : base;
}

/**
 * Forget per-folder caches. With `next` (the record a forced remount is about
 * to install), cached shard buffers the new union still references at the same
 * size, on a shard it did not mark bad, and whose header table agrees with the
 * new references are kept: names are content hashes, so the bytes are the same
 * and re-reading them is pure memory and I/O churn on mobile.
 */
function clearCachesFor(folder: string, next?: FolderRecord): void {
  const prefix = folder + '/';
  for (const k of [..._looseShadowed]) if (k.startsWith(prefix)) _looseShadowed.delete(k);
  if (!next) {
    _shards.dropPrefix(prefix);
    return;
  }
  const sizes = new Map<string, number>();
  for (const map of [next.entries, next.runnerUps]) {
    for (const e of map.values()) {
      sizes.set(e.main.path, e.main.size);
      if (e.thumb) sizes.set(e.thumb.path, e.thumb.size);
    }
  }
  _shards.dropPrefix(prefix, (path, buf) =>
    !next.badShards.has(path)
    && sizes.get(path) === buf.byteLength
    && checkShardTable(path, new Uint8Array(buf), next.shardRefs.get(path) ?? []) === null);
}

function newRecord(app: App, folder: string, token: number): FolderRecord {
  return {
    folder, app, token, state: 'loose', reason: '', marker: null,
    badSegments: [], entries: new Map(), runnerUps: new Map(), pending: new Set(),
    badShards: new Map(), negative: new Map(), shardRefs: new Map(), segments: new Map(),
  };
}

function addRef(rec: FolderRecord, path: string, ref: ShardRefCheck): void {
  const list = rec.shardRefs.get(path);
  if (list) list.push(ref);
  else rec.shardRefs.set(path, [ref]);
}

/** Bundle files (by extension) under index/, shards/ and thumbs/. */
async function bundleFilesPresent(app: App, folder: string): Promise<{ index: number; shards: number }> {
  const [index, shards, thumbs] = await Promise.all([
    listFiles(app, `${folder}/${INDEX_DIR}`, INDEX_EXT),
    listFiles(app, `${folder}/${SHARDS_DIR}`, SHARD_EXT),
    listFiles(app, `${folder}/${THUMBS_DIR}`, SHARD_EXT),
  ]);
  return { index: index.length, shards: shards.length + thumbs.length };
}

/**
 * Build one folder's record. State rules:
 *   folder absent                               -> not-on-device ('folder-absent')
 *   no marker, but index/shards/thumbs files    -> not-on-device ('marker-missing'):
 *       Sync may deliver those before the marker
 *   no marker and no bundle files               -> loose
 *   marker unreadable / not a bundle marker     -> unmounted-corrupt
 *   marker.major !== 1                          -> unsupported-version
 *   zero index segments and zero shards         -> not-on-device ('no-index-no-shards')
 *   zero index segments but shards present      -> not-on-device ('index-missing'):
 *       the index is the commit point and syncs last; an interrupted import looks the same
 *   every index segment unreadable / misnamed   -> unmounted-corrupt
 *   some segments unreadable, or a referenced shard missing/wrong size -> partial
 *   otherwise                                   -> mounted
 */
async function buildRecord(app: App, folder: string, token: number): Promise<FolderRecord> {
  const rec = newRecord(app, folder, token);
  const done = (state: BundleState, reason = ''): FolderRecord => {
    rec.state = state;
    rec.reason = reason;
    return rec;
  };

  if (!(await safeExists(app, folder))) return done('not-on-device', 'folder-absent');
  const markerPath = `${folder}/${MARKER_FILE}`;
  if (!(await safeExists(app, markerPath))) {
    const present = await bundleFilesPresent(app, folder);
    return present.index + present.shards > 0 ? done('not-on-device', 'marker-missing') : done('loose');
  }
  try {
    rec.marker = parseMarker(new Uint8Array(await app.vault.adapter.readBinary(markerPath)));
  } catch (err) {
    return done('unmounted-corrupt', `marker unreadable: ${(err as Error).message}`);
  }
  if (rec.marker.major !== BUNDLE_MAJOR) {
    return done('unsupported-version', `bundle major ${rec.marker.major}; this version reads major ${BUNDLE_MAJOR}`);
  }

  const indexFiles = await listFiles(app, `${folder}/${INDEX_DIR}`, INDEX_EXT);
  if (indexFiles.length === 0) {
    const present = await bundleFilesPresent(app, folder);
    return done('not-on-device', present.shards === 0 ? 'no-index-no-shards' : 'index-missing');
  }

  let goodSegments = 0;
  let hashMismatches = 0;
  for (const file of indexFiles) {
    const hash = stemOf(file);
    let seg;
    let indexBytes = 0;
    try {
      const bytes = new Uint8Array(await app.vault.adapter.readBinary(file));
      indexBytes = bytes.byteLength;
      if (hash !== await contentName(bytes)) {
        hashMismatches++;
        rec.badSegments.push(`${file}: index-hash-mismatch`);
        continue;
      }
      seg = decodeIndexSegment(bytes);
    } catch (err) {
      rec.badSegments.push(`${file}: ${(err as Error).message}`);
      continue;
    }
    goodSegments++;
    const prec: SegmentPrecedence = { mode: seg.mode, createdAt: seg.createdAt, hash };
    const segRec: SegmentRecord = {
      hash, file, mode: seg.mode, createdAt: seg.createdAt, indexBytes, entries: new Map(),
      files: [
        ...seg.shards.map(s => ({ path: `${folder}/${SHARDS_DIR}/${s.name}`, size: s.size })),
        ...(seg.thumbShards ?? []).map(s => ({ path: `${folder}/${THUMBS_DIR}/${s.name}`, size: s.size })),
      ],
    };
    rec.segments.set(hash, segRec);
    for (const [key, e] of Object.entries(seg.entries)) {
      // decodeIndexSegment guarantees shard indexes are in range.
      const shard = seg.shards[e.shard];
      const thumbShard = e.thumb ? seg.thumbShards?.[e.thumb.shard] : undefined;
      const main: ShardLoc = { path: `${folder}/${SHARDS_DIR}/${shard.name}`, size: shard.size, o: e.o, l: e.l };
      const thumb: ShardLoc | undefined = e.thumb && thumbShard
        ? { path: `${folder}/${THUMBS_DIR}/${thumbShard.name}`, size: thumbShard.size, o: e.thumb.o, l: e.thumb.l }
        : undefined;
      addRef(rec, main.path, { key, o: main.o, l: main.l });
      if (thumb) addRef(rec, thumb.path, { key, o: thumb.o, l: thumb.l });
      const candidate: Candidate = {
        folder, key, id: e.id, vaultPath: `${folder}/${key}`,
        mime: typeof e.mime === 'string' ? e.mime : 'application/octet-stream',
        w: typeof e.w === 'number' ? e.w : 0,
        h: typeof e.h === 'number' ? e.h : 0,
        segment: hash,
        ...prec,
        main,
        thumb,
      };
      segRec.entries.set(key, candidate);
      const current = rec.entries.get(key);
      if (!current || compareSegmentPrecedence(candidate, current) > 0) {
        if (current) rec.runnerUps.set(key, current);
        rec.entries.set(key, candidate);
      } else {
        const ru = rec.runnerUps.get(key);
        if (!ru || compareSegmentPrecedence(candidate, ru) > 0) rec.runnerUps.set(key, candidate);
      }
    }
  }

  if (goodSegments === 0) {
    rec.entries.clear();
    rec.runnerUps.clear();
    rec.segments.clear();
    return done('unmounted-corrupt',
      hashMismatches === rec.badSegments.length ? 'index-hash-mismatch' : 'all index segments unreadable');
  }

  await checkShardsAtMount(app, rec);

  if (rec.badSegments.length > 0 || rec.badShards.size > 0) {
    return done('partial', `${rec.badSegments.length} bad segment(s), ${rec.badShards.size} missing or damaged shard(s)`);
  }
  return done('mounted');
}

/** Stat every shard the union references; bad ones fall back to runner-ups or go pending. */
async function checkShardsAtMount(app: App, rec: FolderRecord): Promise<void> {
  const expected = new Map<string, number>();
  for (const map of [rec.entries, rec.runnerUps]) {
    for (const e of map.values()) {
      expected.set(e.main.path, e.main.size);
      if (e.thumb) expected.set(e.thumb.path, e.thumb.size);
    }
  }
  await Promise.all([...expected].map(async ([path, size]) => {
    const st = await safeStat(app, path);
    if (!st) rec.badShards.set(path, fail('shard-missing', `${path} is not on this device`));
    else if (st.size !== size) rec.badShards.set(path, fail('shard-size-mismatch', `${path} is ${st.size} bytes; index says ${size}`));
  }));
  if (rec.badShards.size === 0) return;
  for (const [key, e] of rec.entries) {
    if (!rec.badShards.has(e.main.path)) continue;
    const ru = rec.runnerUps.get(key);
    if (ru && !rec.badShards.has(ru.main.path)) {
      rec.entries.set(key, ru);
      rec.runnerUps.delete(key);
    } else {
      rec.pending.add(key);
    }
  }
}

/**
 * Mount (or force a remount of) one folder; state rules on buildRecord. A
 * result superseded by a newer mount or an unmount of the same folder is
 * discarded, and the call resolves to the newer outcome.
 */
export async function mountBundleFolder(app: App, folderIn: string): Promise<BundleState> {
  const folder = normFolder(folderIn);
  const token = nextToken(folder);
  const promise = (async (): Promise<BundleState> => {
    const rec = await buildRecord(app, folder, token);
    if (_mountTokens.get(folder) !== token) {
      const newer = _mountInflight.get(folder);
      return newer && newer.token !== token ? newer.promise : getBundleState(folder);
    }
    clearCachesFor(folder, rec);
    _folders.set(folder, rec);
    bump();
    return rec.state;
  })();
  const slot = { token, promise };
  _mountInflight.set(folder, slot);
  const cleanup = (): void => { if (_mountInflight.get(folder) === slot) _mountInflight.delete(folder); };
  promise.then(cleanup, cleanup);
  return promise;
}

/**
 * Current state without re-reading when the folder is already serving
 * ('mounted' | 'partial'); joins an in-flight mount; mounts otherwise.
 */
export async function ensureMounted(app: App, folderIn: string): Promise<BundleState> {
  const folder = normFolder(folderIn);
  const rec = _folders.get(folder);
  if (rec && isServing(rec.state)) return rec.state;
  const inflight = _mountInflight.get(folder);
  if (inflight) return inflight.promise;
  return mountBundleFolder(app, folder);
}

export function unmountBundleFolder(folderIn: string): void {
  const folder = normFolder(folderIn);
  nextToken(folder);
  _mountInflight.delete(folder);
  if (!_folders.has(folder)) return;
  clearCachesFor(folder);
  _folders.delete(folder);
  bump();
}

/**
 * Remount every registered folder at or under `oldPath` at its new location.
 * Per folder the new path mounts first and the old one unmounts after, so
 * there is no window where neither resolves.
 */
export async function remountOnRename(oldPathIn: string, newPathIn: string): Promise<void> {
  const oldPath = normFolder(oldPathIn);
  const newPath = normFolder(newPathIn);
  const moves: { from: string; to: string; app: App }[] = [];
  for (const rec of _folders.values()) {
    if (rec.folder === oldPath || rec.folder.startsWith(oldPath + '/')) {
      moves.push({ from: rec.folder, to: newPath + rec.folder.slice(oldPath.length), app: rec.app });
    }
  }
  for (const m of moves) {
    await mountBundleFolder(m.app, m.to);
    if (m.from !== m.to) unmountBundleFolder(m.from);
  }
}

// ===========================================
// Queries
// ===========================================

export function getBundleState(folder: string): BundleState {
  return _folders.get(normFolder(folder))?.state ?? 'loose';
}

export function getBundleStateInfo(folder: string): { state: BundleState; reason: string; badSegments: string[] } | null {
  const rec = _folders.get(normFolder(folder));
  return rec ? { state: rec.state, reason: rec.reason, badSegments: [...rec.badSegments] } : null;
}

export function entriesFor(folderIn: string): { state: BundleState; reason: string; entries: BundleEntryView[] } {
  const rec = _folders.get(normFolder(folderIn));
  if (!rec) return { state: 'loose', reason: 'not registered', entries: [] };
  if (!isServing(rec.state)) return { state: rec.state, reason: rec.reason, entries: [] };
  const keys = [...rec.entries.keys()].sort();
  const entries = keys.map(k => {
    const e = rec.entries.get(k) as ResolvedEntry;
    return { key: e.key, id: e.id, vaultPath: e.vaultPath, mime: e.mime, w: e.w, h: e.h, pending: rec.pending.has(k) };
  });
  return { state: rec.state, reason: rec.reason, entries };
}

function servingRecord(folderIn: string): FolderRecord | null {
  const rec = _folders.get(normFolder(folderIn));
  return rec && isServing(rec.state) ? rec : null;
}

/** Loaded segments of a serving folder (sorted by file); [] for every other state. */
export function getBundleSegments(folderIn: string): BundleSegmentInfo[] {
  const rec = servingRecord(folderIn);
  if (!rec) return [];
  const winners = new Set<string>();
  for (const e of rec.entries.values()) winners.add(e.segment);
  return [...rec.segments.values()]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(s => ({
      hash: s.hash, file: s.file, mode: s.mode, createdAt: s.createdAt, indexBytes: s.indexBytes,
      keys: [...s.entries.keys()].sort(), files: s.files.map(f => ({ ...f })), serving: winners.has(s.hash),
    }));
}

/** Distinct modes of the segments that serve at least one key; [] when not serving. */
export function getBundleModes(folderIn: string): BundleMode[] {
  const rec = servingRecord(folderIn);
  if (!rec) return [];
  const modes = new Set<BundleMode>();
  for (const e of rec.entries.values()) modes.add(e.mode);
  return [...modes].sort();
}

/** The folder's parsed marker (a copy), or null when it has none or never mounted. */
export function getBundleMarker(folderIn: string): BundleMarker | null {
  const m = _folders.get(normFolder(folderIn))?.marker;
  return m ? { ...m } : null;
}

function servingRecordFor(vaultPath: string): FolderRecord | null {
  let best: FolderRecord | null = null;
  for (const rec of _folders.values()) {
    if (!isServing(rec.state)) continue;
    if (!vaultPath.startsWith(rec.folder + '/')) continue;
    if (!best || rec.folder.length > best.folder.length) best = rec;
  }
  return best;
}

/** Longest-prefix match of `vaultPath` against serving bundle roots. */
export function lookupEntry(vaultPath: string): ResolvedEntry | null {
  const rec = servingRecordFor(vaultPath);
  if (!rec) return null;
  return rec.entries.get(vaultPath.slice(rec.folder.length + 1)) ?? null;
}

// ===========================================
// Reads
// ===========================================

export function isBundleReadFailure(x: unknown): x is BundleReadFailure {
  return x !== null && typeof x === 'object' && (x as { ok?: unknown }).ok === false;
}

function isCurrent(rec: FolderRecord): boolean {
  return _folders.get(rec.folder) === rec;
}

function markPending(rec: FolderRecord, key: string): void {
  if (!isCurrent(rec)) return;
  const wasPending = rec.pending.has(key);
  rec.pending.add(key);
  if (rec.state === 'mounted') {
    rec.state = 'partial';
    rec.reason = 'one or more shards unreadable';
  }
  if (!wasPending) bump();
}

/**
 * Read one entry's image bytes (or its thumbnail with `{ thumb: true }`).
 * The returned ArrayBuffer is a private copy the caller may keep.
 */
export async function readEntryBytes(
  app: App,
  vaultPath: string,
  opts: { thumb?: boolean } = {},
): Promise<BundleBytes | BundleReadFailure> {
  const thumb = opts.thumb === true;
  const rec = servingRecordFor(vaultPath);
  if (!rec) return fail('not-mounted', `no mounted bundle entry for ${vaultPath}`);
  const cacheKey = thumb ? `${vaultPath}#thumb` : vaultPath;
  const cached = rec.negative.get(cacheKey);
  if (cached) return cached;
  const key = vaultPath.slice(rec.folder.length + 1);
  const entry = rec.entries.get(key);
  if (!entry) return fail('not-mounted', `no mounted bundle entry for ${vaultPath}`);
  const loc = thumb ? entry.thumb : entry.main;
  if (!loc) return fail('not-mounted', `no thumbnail for ${vaultPath}`);

  let result = await readSlice(app, rec, loc);
  let served: ResolvedEntry = entry;
  if (!result.ok && !thumb) {
    const ru = rec.runnerUps.get(key);
    if (ru && rec.entries.get(key) === entry) {
      const alt = await readSlice(app, rec, ru.main);
      if (alt.ok && isCurrent(rec) && rec.entries.get(key) === entry) {
        rec.entries.set(key, ru);
        rec.runnerUps.delete(key);
        bump();
        result = alt;
        served = ru;
      }
    }
  }
  if (!result.ok) {
    // The record captured before the awaits is the one written: if a remount
    // replaced it meanwhile, these writes land on a discarded record.
    if (isCurrent(rec)) {
      rec.negative.set(cacheKey, result);
      if (!thumb) markPending(rec, key);
    }
    return result;
  }
  const mime = thumb ? sniffImageMime(new Uint8Array(result.bytes)) ?? served.mime : served.mime;
  return { ok: true, bytes: result.bytes, mime };
}

/**
 * Read `key` as ONE segment stores it (main image, or thumb with
 * `{ thumb: true }`). No union winner, no runner-up, and no negative-cache or
 * pending writes: a failure here says only that this segment cannot serve the
 * key. Shard loads share the cache and its size and table checks.
 */
export async function readSegmentEntryBytes(
  app: App,
  folderIn: string,
  segment: string,
  key: string,
  opts: { thumb?: boolean } = {},
): Promise<BundleBytes | BundleReadFailure> {
  const rec = servingRecord(folderIn);
  const entry = rec?.segments.get(segment)?.entries.get(key);
  if (!rec || !entry) return fail('not-mounted', `segment ${segment} has no entry ${key}`);
  const loc = opts.thumb === true ? entry.thumb : entry.main;
  if (!loc) return fail('not-mounted', `segment ${segment} has no thumbnail for ${key}`);
  const result = await readSlice(app, rec, loc);
  if (!result.ok) return result;
  const mime = opts.thumb === true ? sniffImageMime(new Uint8Array(result.bytes)) ?? entry.mime : entry.mime;
  return { ok: true, bytes: result.bytes, mime };
}

/** Header check on first load: magic, major, and agreement with every index reference. */
function checkShardTable(path: string, bytes: Uint8Array, refs: readonly ShardRefCheck[]): BundleReadFailure | null {
  let header;
  try {
    header = decodeShardHeader(bytes);
  } catch (err) {
    return fail('shard-table-mismatch', `${path}: ${(err as Error).message}`);
  }
  if (header.major !== BUNDLE_MAJOR) return fail('shard-table-mismatch', `${path}: shard major ${header.major}`);
  const byKey = new Map(header.entries.map(e => [e.key, e]));
  const spans = new Set(header.entries.map(e => `${e.offset}:${e.length}`));
  for (const r of refs) {
    const row = byKey.get(r.key);
    // Deduplicated sources point at another key's row: match by span then.
    const agrees = row ? row.offset === r.o && row.length === r.l : spans.has(`${r.o}:${r.l}`);
    if (!agrees) return fail('shard-table-mismatch', `${path}: index entry ${r.key} [${r.o}, +${r.l}) disagrees with the shard table`);
  }
  return null;
}

async function readSlice(app: App, rec: FolderRecord, loc: ShardLoc): Promise<BundleBytes | BundleReadFailure> {
  const dead = rec.badShards.get(loc.path);
  if (dead) return dead;
  if (Platform.isMobile && loc.size > MAX_MOBILE_SHARD_BYTES) {
    const f = fail('shard-too-large', `${loc.path} is ${loc.size} bytes; mobile reads shards up to ${MAX_MOBILE_SHARD_BYTES}`);
    rec.badShards.set(loc.path, f);
    return f;
  }
  let buf: ArrayBuffer;
  try {
    buf = await _shards.get(app, loc.path, b => {
      if (b.byteLength !== loc.size) {
        return fail('shard-size-mismatch', `${loc.path} is ${b.byteLength} bytes; index says ${loc.size}`);
      }
      return checkShardTable(loc.path, new Uint8Array(b), rec.shardRefs.get(loc.path) ?? []);
    });
  } catch (err) {
    const f = err instanceof ShardLoadError
      ? err.failure
      : fail('shard-missing', `${loc.path}: ${(err as Error)?.message ?? String(err)}`);
    rec.badShards.set(loc.path, f);
    return f;
  }
  if (loc.l === 0 || loc.o + loc.l > buf.byteLength) {
    return fail('slice-out-of-range', `${loc.path} [${loc.o}, +${loc.l}) exceeds ${buf.byteLength}`);
  }
  try {
    const slice = new Uint8Array(buf, loc.o, loc.l);
    if (sniffImageMime(slice) === null) {
      return fail('bad-magic', `${loc.path} [${loc.o}, +${loc.l}) is not a recognised image`);
    }
    return { ok: true, bytes: buf.slice(loc.o, loc.o + loc.l), mime: '' };
  } catch (err) {
    return fail('slice-out-of-range', `${loc.path} [${loc.o}, +${loc.l}): ${(err as Error)?.message ?? String(err)}`);
  }
}

/** Read-only snapshot for the performance recorder. */
export function getBundleRegistryStats(): {
  mountedFolders: number; shardCacheCount: number; shardCacheBytes: number; shardReads: number; shardReadBytes: number;
} {
  let mountedFolders = 0;
  for (const rec of _folders.values()) if (rec.state === 'mounted' || rec.state === 'partial') mountedFolders++;
  return {
    mountedFolders,
    shardCacheCount: _shards.cachedCount,
    shardCacheBytes: _shards.cachedBytes,
    shardReads: _shards.reads,
    shardReadBytes: _shards.readBytes,
  };
}

// ===========================================
// Test support
// ===========================================

export function _resetBundleRegistryForTests(): void {
  _folders.clear();
  _mountTokens.clear();
  _mountInflight.clear();
  _looseShadowed.clear();
  _writesInProgress.clear();
  _shards.clear();
  _listeners.clear();
  _version = 0;
}
