/**
 * storeCache.ts
 *
 * A cache of the multi-map store as last WRITTEN by this session, so an
 * autosave does not re-read, re-parse and re-stringify every map in the file
 * (MEM-12 / OBS-06, M option). Each entry is kept as its compact JSON text;
 * a save stringifies only the changed entry and splices the rest.
 *
 * Safety contract (the failure designed against: a stale cache writing an old
 * map over a newer file synced in from another device):
 * - Only the data-file mutex holders in fileOperations.ts read or fill it.
 * - It is valid only while a fresh adapter stat of the store matches the
 *   mtime AND byte size recorded right after this session's own write. Any
 *   doubt (no stat API, stat fails, size of the written text differs) means no
 *   cache and a full re-read.
 * - It is filled only after a successful write, never from a read, and is
 *   dropped before every write, on any store modify/delete/rename event whose
 *   stat differs, on restore, on corrupt reads and on store creation.
 */

import type { App, TAbstractFile } from 'obsidian';
import { TFile } from 'obsidian';

import type { MapType } from '#types/core/map.types';

import { getDataFilePath } from '../core/settingsAccessor';

interface CachedEntry {
  /** Compact JSON text of the entry exactly as written to disk. */
  json: string;
  /** listMaps fields, so a list never parses an entry. */
  name: string;
  type: MapType;
}

interface StoreSnapshot {
  /** Top-level keys other than `maps`, preserved verbatim. */
  rest: Record<string, unknown>;
  entries: Map<string, CachedEntry>;
}

interface CachedStore extends StoreSnapshot {
  path: string;
  mtime: number;
  size: number;
  /**
   * Git's racy-timestamp rule: a coarse-granularity filesystem (mtime on a
   * whole second) can show the same mtime+size for a later write. Until this
   * wall-clock time the stat cannot vouch for the file. 0 = not racy.
   */
  racyUntil: number;
}

/** Window after a whole-second mtime during which the stat is not trusted. */
const RACY_WINDOW_MS = 2500;

let cache: CachedStore | null = null;

/**
 * Bumps on every vault create / modify / delete / rename event of the data file,
 * whoever wrote it. Read-only consumers that keep something derived from
 * the stored maps (the weather zone resolver's closed-map cache) key it on
 * getDataFileStamp(); it never gates a write.
 */
let dataFileGeneration = 0;

/** The data file's path plus its modification generation; changes whenever a cached read may be stale. */
function getDataFileStamp(): string {
  return `${getDataFilePath()}#${dataFileGeneration}`;
}

/** Drop the cache. Always safe; the next operation re-reads the file. */
function invalidateStoreCache(): void {
  cache = null;
}

/** listMaps fields for one stored entry (same fallbacks as the list ever had). */
function entryMeta(id: string, value: unknown): { name: string; type: MapType } {
  if (value == null || typeof value !== 'object') return { name: id, type: 'grid' };
  const v = value as { name?: unknown; mapType?: unknown };
  const name = typeof v.name === 'string' && v.name !== '' ? v.name : id;
  const type = typeof v.mapType === 'string' && v.mapType !== '' ? (v.mapType as MapType) : 'grid';
  return { name, type };
}

function cachedEntry(id: string, value: unknown): CachedEntry {
  return { json: JSON.stringify(value), ...entryMeta(id, value) };
}

/**
 * Split a parsed store into its cacheable form. Returns null when the document
 * is not a store (root not an object, or `maps` present but not an object).
 * A missing `maps` is an empty store. Throws only if an entry cannot be
 * stringified (never for parsed JSON).
 */
function snapshotFromParsed(data: unknown): StoreSnapshot | null {
  if (data == null || typeof data !== 'object' || Array.isArray(data)) return null;
  const { maps, ...rest } = data as Record<string, unknown>;
  if (maps != null && (typeof maps !== 'object' || Array.isArray(maps))) return null;
  const entries = new Map<string, CachedEntry>();
  if (maps != null) {
    for (const [id, value] of Object.entries(maps as Record<string, unknown>)) {
      entries.set(id, cachedEntry(id, value));
    }
  }
  return { rest, entries };
}

/** The compact store text. Equivalent JSON to JSON.stringify({...rest, maps}). */
function serializeStore(snapshot: StoreSnapshot): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(snapshot.rest)) {
    const text = JSON.stringify(value) as string | undefined;
    if (text !== undefined) parts.push(`${JSON.stringify(key)}:${text}`);
  }
  const mapParts: string[] = [];
  for (const [id, entry] of snapshot.entries) mapParts.push(`${JSON.stringify(id)}:${entry.json}`);
  parts.push(`"maps":{${mapParts.join(',')}}`);
  return `{${parts.join(',')}}`;
}

/** Bytes `s` occupies as UTF-8 (what the adapter stat reports after a write). */
function utf8ByteLength(s: string): number {
  let bytes = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) bytes += 1;
    else if (c < 0x800) bytes += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { bytes += 4; i++; } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

async function statStore(app: App, path: string): Promise<{ mtime: number; size: number } | null> {
  const adapter = (app.vault as { adapter?: { stat?: (p: string) => Promise<{ type: string; mtime: number; size: number } | null> } }).adapter;
  if (adapter == null || typeof adapter.stat !== 'function') return null;
  try {
    const stat = await adapter.stat(path);
    if (stat == null || stat.type !== 'file') return null;
    return { mtime: stat.mtime, size: stat.size };
  } catch {
    return null;
  }
}

/**
 * The cached store for `path` if the file on disk is still the one this
 * session last wrote; otherwise null (and the cache is dropped). Call inside
 * the data-file mutex. The returned entries map must not be mutated.
 */
async function getValidStoreCache(app: App, path: string): Promise<StoreSnapshot | null> {
  const current = cache;
  if (current == null || current.path !== path) return null;
  if (Date.now() < current.racyUntil) return null; // stat cannot yet prove freshness
  const stat = await statStore(app, path);
  if (cache !== current) return null; // dropped by an event while we awaited
  if (stat == null || stat.mtime !== current.mtime || stat.size !== current.size) {
    cache = null;
    return null;
  }
  return current;
}

/**
 * Record `snapshot` as the store just written (`written` is the exact text).
 * Call inside the mutex right after a successful write. Stats the file: if
 * its byte size is not the size of `written`, something else wrote in between
 * and nothing is cached.
 */
async function commitStoreCache(app: App, path: string, snapshot: StoreSnapshot, written: string): Promise<void> {
  cache = null;
  const stat = await statStore(app, path);
  if (stat == null || stat.size !== utf8ByteLength(written)) return;
  const racyUntil = stat.mtime % 1000 === 0 ? stat.mtime + RACY_WINDOW_MS : 0;
  cache = { path, mtime: stat.mtime, size: stat.size, racyUntil, rest: snapshot.rest, entries: snapshot.entries };
}

/**
 * Vault 'modify' handler: drop the cache when the store changed and the new
 * stat is not the one recorded after our own write. Own-write events (stat
 * matches) keep it. Safe outside the mutex: it only ever drops.
 */
function noteStoreFileModified(file: TAbstractFile): void {
  if (file.path === getDataFilePath()) dataFileGeneration++;
  const current = cache;
  if (current == null || file.path !== current.path) return;
  if (!(file instanceof TFile) || file.stat.mtime !== current.mtime || file.stat.size !== current.size) {
    cache = null;
  }
}

/**
 * Vault 'create' handler: the data file appearing (first use, a restore, a
 * sync bringing it in) moves the stamp like any other change. A cache is
 * kept only when the stat is our own just-committed write.
 */
function noteStoreFileCreated(file: TAbstractFile): void {
  noteStoreFileModified(file);
}

/** Vault 'delete' / 'rename' handler: any store path change drops the cache. */
function noteStoreFilePathGone(path: string): void {
  if (path === getDataFilePath()) dataFileGeneration++;
  if (cache != null && cache.path === path) cache = null;
}

/** Test hook: whether a cache is currently held. */
function hasStoreCache(): boolean {
  return cache != null;
}

export type { CachedEntry, StoreSnapshot };
export {
  invalidateStoreCache, snapshotFromParsed, serializeStore, cachedEntry, utf8ByteLength,
  getValidStoreCache, commitStoreCache, noteStoreFileModified, noteStoreFileCreated, noteStoreFilePathGone, hasStoreCache,
  getDataFileStamp,
};
