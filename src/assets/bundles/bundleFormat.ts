/**
 * bundleFormat.ts
 * Tile bundle format v1: constants, types, shard and index-segment codecs,
 * content-hash naming, the union winner rule and image magic sniffing.
 * Pure module: no Obsidian imports, no I/O.
 *
 * Public API
 *   constants   BUNDLE_FORMAT, BUNDLE_MAJOR, BUNDLE_MINOR, MARKER_FILE, INDEX_DIR,
 *               SHARDS_DIR, THUMBS_DIR, INDEX_EXT, SHARD_EXT, SHARD_MAGIC,
 *               MAX_TILE_BYTES, MAX_MOBILE_SHARD_BYTES, MIME_CODES, SHARD_FILE_RE
 *   isSafeBundleKey(key)                -> false for '..' segments, a leading '/', backslash or NUL
 *   types       BundleMode, BundleMarker, IndexEntry, IndexSegment, ShardRef,
 *               ShardTableEntry, ShardItem, SegmentPrecedence
 *   sha256Hex(bytes)                    -> Promise<hex>
 *   contentName(bytes)                  -> Promise<first 16 hex of SHA-256>
 *   encodeMarker / parseMarker
 *   shardHeaderSize(keys)               -> byte length of header + entry table
 *   encodeShard(items)                  -> { bytes, table } (absolute offsets)
 *   decodeShardHeader(bytes)            -> { major, minor, entries } (throws on bad input)
 *   encodeIndexSegment(seg) / decodeIndexSegment(bytes) (throws on bad shape)
 *   compareSegmentPrecedence(a, b)      -> >0 when a wins (exact > compact > tiny,
 *                                          then newer createdAt, then greater hash)
 *   sniffImageMime(bytes)               -> mime | null
 *   mimeFromPath(path)                  -> mime | null (by extension)
 */

import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate';

// ===========================================
// Constants
// ===========================================

export const BUNDLE_FORMAT = 'windrose-tiles';
export const BUNDLE_MAJOR = 1;
export const BUNDLE_MINOR = 0;
export const MARKER_FILE = 'bundle.wrbundle';
export const INDEX_DIR = 'index';
export const SHARDS_DIR = 'shards';
export const THUMBS_DIR = 'thumbs';
export const INDEX_EXT = '.wridx';
export const SHARD_EXT = '.wrshard';
export const SHARD_MAGIC = 'WRSH';
/** Tiles above this stay loose (writer refuses). */
export const MAX_TILE_BYTES = 16 * 1024 * 1024;
/**
 * Largest shard mobile will read: one MAX_TILE_BYTES tile in its own shard
 * plus the worst-case header (fixed 12 + row 11 + a 0xffff-byte key). A
 * multi-entry shard never exceeds the writer's target (clamped to 12 MiB).
 */
export const MAX_MOBILE_SHARD_BYTES = MAX_TILE_BYTES + 12 + 11 + 0xffff;
/** Content-addressed shard file name: 16 lowercase hex + .wrshard. */
export const SHARD_FILE_RE = /^[0-9a-f]{16}\.wrshard$/;
const U32_MAX = 0xffffffff;

export const MIME_CODES: Readonly<Record<number, string>> = {
  1: 'image/webp',
  2: 'image/png',
  3: 'image/jpeg',
  4: 'image/gif',
};

function mimeToCode(mime: string): number {
  for (const [code, m] of Object.entries(MIME_CODES)) {
    if (m === mime) return Number(code);
  }
  throw new Error(`Unsupported bundle mime: ${mime}`);
}

// ===========================================
// Types
// ===========================================

export type BundleMode = 'exact' | 'compact' | 'tiny';

export interface BundleMarker {
  format: string;
  major: number;
  packId: string;
  name: string;
  createdAt: string;
}

export interface ShardRef {
  shard: number;
  o: number;
  l: number;
}

export interface IndexEntry extends ShardRef {
  /** Minted tile id, STORED, never recomputed. */
  id: string;
  mime: string;
  w: number;
  h: number;
  /** `shard` indexes IndexSegment.thumbShards. */
  thumb?: ShardRef;
  src?: { sha256: string; bytes: number; mime: string };
}

export interface IndexSegment {
  format: 'windrose-tiles';
  major: 1;
  minor: number;
  packId: string;
  createdAt: string;
  mode: BundleMode;
  shards: { name: string; size: number }[];
  /** Thumbnail shards (thumbs/ folder). Absent when the segment has no thumbs. */
  thumbShards?: { name: string; size: number }[];
  entries: Record<string, IndexEntry>;
}

export interface ShardTableEntry {
  key: string;
  offset: number;
  length: number;
  mime: string;
}

export interface ShardItem {
  key: string;
  bytes: Uint8Array;
  mime: string;
}

// ===========================================
// Hashing
// ===========================================

/**
 * SHA-256 hex. Duplicate of the private helper in
 * src/content-packs/downloadService.ts (sha256Hex): importing that module would
 * drag requestUrl and the pack-install graph into this pure codec.
 */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const digest = await crypto.subtle.digest('SHA-256', copy);
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/** Content-addressed file stem: first 16 hex chars of the SHA-256 of the bytes. */
export async function contentName(data: Uint8Array): Promise<string> {
  return (await sha256Hex(data)).slice(0, 16);
}

// ===========================================
// Marker
// ===========================================

export function encodeMarker(marker: BundleMarker): Uint8Array {
  return strToU8(JSON.stringify(marker));
}

/** Parse a marker file. Throws when it is not JSON or lacks the required fields. */
export function parseMarker(bytes: Uint8Array): BundleMarker {
  const raw: unknown = JSON.parse(strFromU8(bytes));
  if (raw === null || typeof raw !== 'object') throw new Error('marker is not an object');
  const m = raw as Record<string, unknown>;
  if (m.format !== BUNDLE_FORMAT) throw new Error(`marker format is not ${BUNDLE_FORMAT}`);
  if (typeof m.major !== 'number') throw new Error('marker major missing');
  if (typeof m.packId !== 'string') throw new Error('marker packId missing');
  return {
    format: m.format,
    major: m.major,
    packId: m.packId,
    name: typeof m.name === 'string' ? m.name : m.packId,
    createdAt: typeof m.createdAt === 'string' ? m.createdAt : '',
  };
}

// ===========================================
// Shard codec (little-endian)
// magic 'WRSH' | u16 major | u16 minor | u32 count |
// count x { u16 keyLen | key utf8 | u32 offset | u32 length | u8 mimeCode } | bytes
// ===========================================

const SHARD_FIXED_HEADER = 12;
const SHARD_ROW_FIXED = 2 + 4 + 4 + 1;

export function shardHeaderSize(keys: readonly string[]): number {
  let size = SHARD_FIXED_HEADER;
  for (const key of keys) size += SHARD_ROW_FIXED + strToU8(key).byteLength;
  return size;
}

export function encodeShard(items: readonly ShardItem[]): { bytes: Uint8Array; table: ShardTableEntry[] } {
  const keyBytes = items.map(it => strToU8(it.key));
  for (const kb of keyBytes) if (kb.byteLength > 0xffff) throw new Error('shard key too long');
  let headerSize = SHARD_FIXED_HEADER;
  for (const kb of keyBytes) headerSize += SHARD_ROW_FIXED + kb.byteLength;
  const dataSize = items.reduce((n, it) => n + it.bytes.byteLength, 0);
  // Offsets and lengths are u32: refuse before allocating rather than wrap.
  if (headerSize + dataSize > U32_MAX) throw new Error(`shard of ${headerSize + dataSize} bytes exceeds the u32 limit`);
  for (const it of items) if (it.bytes.byteLength > U32_MAX) throw new Error('shard entry exceeds the u32 limit');
  const out = new Uint8Array(headerSize + dataSize);
  const view = new DataView(out.buffer);
  out.set(strToU8(SHARD_MAGIC), 0);
  view.setUint16(4, BUNDLE_MAJOR, true);
  view.setUint16(6, BUNDLE_MINOR, true);
  view.setUint32(8, items.length, true);
  let p = SHARD_FIXED_HEADER;
  let dataOffset = headerSize;
  const table: ShardTableEntry[] = [];
  items.forEach((it, i) => {
    const kb = keyBytes[i];
    view.setUint16(p, kb.byteLength, true); p += 2;
    out.set(kb, p); p += kb.byteLength;
    view.setUint32(p, dataOffset, true); p += 4;
    view.setUint32(p, it.bytes.byteLength, true); p += 4;
    view.setUint8(p, mimeToCode(it.mime)); p += 1;
    out.set(it.bytes, dataOffset);
    table.push({ key: it.key, offset: dataOffset, length: it.bytes.byteLength, mime: it.mime });
    dataOffset += it.bytes.byteLength;
  });
  return { bytes: out, table };
}

export function decodeShardHeader(bytes: Uint8Array): { major: number; minor: number; entries: ShardTableEntry[] } {
  if (bytes.byteLength < SHARD_FIXED_HEADER) throw new Error('shard too small');
  if (strFromU8(bytes.subarray(0, 4)) !== SHARD_MAGIC) throw new Error('bad shard magic');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const major = view.getUint16(4, true);
  const minor = view.getUint16(6, true);
  const count = view.getUint32(8, true);
  const entries: ShardTableEntry[] = [];
  let p = SHARD_FIXED_HEADER;
  for (let i = 0; i < count; i++) {
    if (p + 2 > bytes.byteLength) throw new Error('shard table truncated');
    const keyLen = view.getUint16(p, true); p += 2;
    if (p + keyLen + 9 > bytes.byteLength) throw new Error('shard table truncated');
    const key = strFromU8(bytes.subarray(p, p + keyLen)); p += keyLen;
    const offset = view.getUint32(p, true); p += 4;
    const length = view.getUint32(p, true); p += 4;
    const mime = MIME_CODES[view.getUint8(p)] ?? 'application/octet-stream'; p += 1;
    entries.push({ key, offset, length, mime });
  }
  return { major, minor, entries };
}

// ===========================================
// Index segment codec
// ===========================================

export function encodeIndexSegment(seg: IndexSegment): Uint8Array {
  return deflateSync(strToU8(JSON.stringify(seg)));
}

function isUint(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isShardList(v: unknown): v is { name: string; size: number }[] {
  return Array.isArray(v) && v.every(s => {
    if (s === null || typeof s !== 'object') return false;
    const r = s as Record<string, unknown>;
    return typeof r.name === 'string' && SHARD_FILE_RE.test(r.name) && isUint(r.size);
  });
}

/** Entry keys are folder-relative paths from untrusted index JSON. */
export function isSafeBundleKey(key: string): boolean {
  if (key === '' || key.startsWith('/') || key.includes('\\') || key.includes('\0')) return false;
  return !key.split('/').some(part => part === '..');
}

function isRef(v: unknown, shardCount: number): boolean {
  if (v === null || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return isUint(r.shard) && r.shard < shardCount && isUint(r.o) && isUint(r.l);
}

/**
 * Inflate and validate an index segment. Throws on any shape problem: a
 * segment is accepted or rejected whole, so a reader never serves rows from a
 * half-valid segment.
 */
export function decodeIndexSegment(bytes: Uint8Array): IndexSegment {
  if (bytes.byteLength === 0) throw new Error('index segment is empty');
  const raw: unknown = JSON.parse(strFromU8(inflateSync(bytes)));
  if (raw === null || typeof raw !== 'object') throw new Error('index segment is not an object');
  const s = raw as Record<string, unknown>;
  if (s.format !== BUNDLE_FORMAT) throw new Error('index segment format mismatch');
  if (s.major !== BUNDLE_MAJOR) throw new Error(`index segment major ${String(s.major)} unsupported`);
  if (s.mode !== 'exact' && s.mode !== 'compact' && s.mode !== 'tiny') throw new Error('index segment mode invalid');
  if (!isShardList(s.shards)) throw new Error('index segment shards invalid');
  if (s.thumbShards !== undefined && !isShardList(s.thumbShards)) throw new Error('index segment thumbShards invalid');
  if (s.entries === null || typeof s.entries !== 'object' || Array.isArray(s.entries)) {
    throw new Error('index segment entries invalid');
  }
  const thumbCount = s.thumbShards?.length ?? 0;
  for (const [key, e] of Object.entries(s.entries as Record<string, unknown>)) {
    if (!isSafeBundleKey(key)) throw new Error(`index entry key unsafe: ${JSON.stringify(key)}`);
    const r = e as Record<string, unknown> | null;
    if (r === null || typeof r !== 'object' || typeof r.id !== 'string' || !isRef(r, s.shards.length)
      || (r.w !== undefined && !isUint(r.w)) || (r.h !== undefined && !isUint(r.h))
      || (r.size !== undefined && !isUint(r.size))
      || (r.thumb !== undefined && !isRef(r.thumb, thumbCount))) {
      throw new Error(`index entry invalid: ${key}`);
    }
    const src = r.src as Record<string, unknown> | undefined;
    if (src !== undefined && (src === null || typeof src !== 'object' || !isUint(src.bytes))) {
      throw new Error(`index entry src invalid: ${key}`);
    }
  }
  return {
    format: BUNDLE_FORMAT,
    major: BUNDLE_MAJOR,
    minor: typeof s.minor === 'number' ? s.minor : 0,
    packId: typeof s.packId === 'string' ? s.packId : '',
    createdAt: typeof s.createdAt === 'string' ? s.createdAt : '',
    mode: s.mode,
    shards: s.shards,
    thumbShards: s.thumbShards,
    entries: s.entries as Record<string, IndexEntry>,
  };
}

// ===========================================
// Union winner rule
// ===========================================

export interface SegmentPrecedence {
  mode: BundleMode;
  createdAt: string;
  /** Segment file stem (sha16). */
  hash: string;
}

const MODE_RANK: Readonly<Record<BundleMode, number>> = { exact: 3, compact: 2, tiny: 1 };

/** > 0 when `a` wins over `b`, < 0 when `b` wins, 0 only for the same segment. */
export function compareSegmentPrecedence(a: SegmentPrecedence, b: SegmentPrecedence): number {
  const rank = MODE_RANK[a.mode] - MODE_RANK[b.mode];
  if (rank !== 0) return rank;
  if (a.createdAt !== b.createdAt) return a.createdAt > b.createdAt ? 1 : -1;
  if (a.hash !== b.hash) return a.hash > b.hash ? 1 : -1;
  return 0;
}

// ===========================================
// Mime helpers
// ===========================================

/** Identify image bytes by magic: RIFF....WEBP, PNG 8-byte, JPEG FFD8, GIF8. */
export function sniffImageMime(b: Uint8Array): string | null {
  if (b.byteLength >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46
    && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  if (b.byteLength >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47
    && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'image/png';
  if (b.byteLength >= 2 && b[0] === 0xff && b[1] === 0xd8) return 'image/jpeg';
  if (b.byteLength >= 4 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return 'image/gif';
  return null;
}

const EXT_MIME: Readonly<Record<string, string>> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  avif: 'image/avif',
};

export function mimeFromPath(path: string): string | null {
  const dot = path.lastIndexOf('.');
  if (dot < 0 || dot < path.lastIndexOf('/')) return null;
  return EXT_MIME[path.slice(dot + 1).toLowerCase()] ?? null;
}
