/**
 * bundleWriter.ts
 * Writes one index segment (plus its shards) into a bundle folder.
 *
 * Public API
 *   new BundleWriter(app, folder, { packId, name, mode, targetShardBytes, createdAt? })
 *   await writer.add(key, bytes, mime, id, { w, h }, thumb?)   // async: may flush a shard
 *   await writer.finish(): Promise<BundleWriteResult>
 *
 * Order of writes: marker (only if absent; an existing marker with another
 * packId throws) -> shards/thumbs as they fill -> index segment LAST (the
 * commit point: a crash before it leaves orphan shards, never a dangling
 * index). Shard and index files are named by the first 16 hex of the SHA-256
 * of their bytes; an existing file with that name and the expected size is
 * reused, while a wrong-size one (an interrupted write, a Sync partial) is
 * removed and rewritten. An unparseable existing marker is treated as absent.
 *
 * targetShardBytes must be a finite integer; it is clamped to [64 KiB, 12 MiB].
 * Two different keys may not share an id within one writer (add() throws).
 *
 * Memory ceiling: one open main shard + one open thumb shard. Entries keep
 * insertion order inside shards (callers sort by category, then name). A tile
 * larger than targetShardBytes gets its own shard; tiles > MAX_TILE_BYTES,
 * zero-byte inputs, unrecognised image bytes and duplicate keys are skipped
 * and reported. Byte-identical sources share one stored copy.
 */

import type { App } from 'obsidian';

import {
  BUNDLE_FORMAT, BUNDLE_MAJOR, BUNDLE_MINOR, INDEX_DIR, INDEX_EXT, MARKER_FILE, MAX_TILE_BYTES,
  SHARDS_DIR, SHARD_EXT, THUMBS_DIR,
  contentName, encodeIndexSegment, encodeMarker, encodeShard, parseMarker, sha256Hex,
  shardHeaderSize, sniffImageMime,
} from './bundleFormat';
import type { BundleMarker, BundleMode, IndexEntry, IndexSegment, ShardItem, ShardRef } from './bundleFormat';

export const MIN_TARGET_SHARD_BYTES = 64 * 1024;
export const MAX_TARGET_SHARD_BYTES = 12 * 1024 * 1024;
const EMPTY_HEADER = shardHeaderSize([]);

export interface BundleWriterOptions {
  packId: string;
  name: string;
  mode: BundleMode;
  targetShardBytes: number;
  /** ISO timestamp; defaults to now. */
  createdAt?: string;
}

export interface BundleWriteResult {
  /** Vault path of the index segment, or '' when nothing was written. */
  indexFile: string;
  /** Vault paths of main shards referenced by the segment, in shard-index order. */
  shards: string[];
  entryCount: number;
  /** Total bytes of shard, thumb and index files referenced by this segment. */
  bytes: number;
  skipped: { key: string; reason: string }[];
}

/** A stored blob whose shard position is filled in at flush. */
interface Slot { shard: number; o: number; l: number }

interface PendingShard {
  items: ShardItem[];
  slots: Slot[];
  dataBytes: number;
}

class ShardStream {
  readonly files: { name: string; size: number }[] = [];
  private open: PendingShard = { items: [], slots: [], dataBytes: 0 };
  /** Running header + entry-table size of the open shard. */
  private headerBytes = EMPTY_HEADER;

  constructor(
    private readonly writer: BundleWriter,
    private readonly dir: string,
    private readonly target: number,
  ) {}

  async push(key: string, bytes: Uint8Array, mime: string): Promise<Slot> {
    const slot: Slot = { shard: -1, o: -1, l: bytes.byteLength };
    const rowBytes = shardHeaderSize([key]) - EMPTY_HEADER;
    const projected = this.headerBytes + rowBytes + this.open.dataBytes + bytes.byteLength;
    if (this.open.items.length > 0 && projected > this.target) await this.flush();
    this.open.items.push({ key, bytes, mime });
    this.open.slots.push(slot);
    this.open.dataBytes += bytes.byteLength;
    this.headerBytes += rowBytes;
    // Overflow rule: a tile at or above the target gets its own shard.
    if (bytes.byteLength >= this.target) await this.flush();
    return slot;
  }

  async flush(): Promise<void> {
    if (this.open.items.length === 0) return;
    const { bytes, table } = encodeShard(this.open.items);
    const name = (await contentName(bytes)) + SHARD_EXT;
    await this.writer.writeFileOnce(`${this.dir}/${name}`, bytes);
    const index = this.files.length;
    this.files.push({ name, size: bytes.byteLength });
    table.forEach((row, i) => {
      const slot = this.open.slots[i];
      slot.shard = index;
      slot.o = row.offset;
      slot.l = row.length;
    });
    this.open = { items: [], slots: [], dataBytes: 0 };
    this.headerBytes = EMPTY_HEADER;
  }

  get totalBytes(): number {
    return this.files.reduce((n, f) => n + f.size, 0);
  }
}

interface PendingEntry {
  id: string;
  mime: string;
  w: number;
  h: number;
  main: Slot;
  thumb?: Slot;
}

export class BundleWriter {
  private readonly main: ShardStream;
  private readonly thumbs: ShardStream;
  private readonly entries = new Map<string, PendingEntry>();
  private readonly bySource = new Map<string, Slot>();
  /** id -> key, so two keys can never share a minted id. */
  private readonly ids = new Map<string, string>();
  private readonly skipped: { key: string; reason: string }[] = [];
  private readonly createdAt: string;
  private markerChecked = false;
  private finished = false;

  constructor(
    private readonly app: App,
    private readonly folder: string,
    private readonly opts: BundleWriterOptions,
  ) {
    this.folder = folder.replace(/\\/g, '/').replace(/\/+$/, '');
    const t = opts.targetShardBytes;
    if (!Number.isFinite(t) || !Number.isInteger(t)) throw new Error('targetShardBytes must be a finite integer');
    const target = Math.min(MAX_TARGET_SHARD_BYTES, Math.max(MIN_TARGET_SHARD_BYTES, t));
    this.createdAt = opts.createdAt ?? new Date().toISOString();
    this.main = new ShardStream(this, `${this.folder}/${SHARDS_DIR}`, target);
    this.thumbs = new ShardStream(this, `${this.folder}/${THUMBS_DIR}`, target);
  }

  async add(
    key: string,
    bytes: Uint8Array,
    mime: string,
    id: string,
    dims: { w: number; h: number },
    thumb?: Uint8Array,
  ): Promise<void> {
    if (this.finished) throw new Error('BundleWriter already finished');
    if (this.entries.has(key)) { this.skipped.push({ key, reason: 'duplicate key' }); return; }
    const idOwner = this.ids.get(id);
    if (idOwner !== undefined && idOwner !== key) {
      throw new Error(`BundleWriter: id ${id} is already used by ${idOwner}; cannot reuse it for ${key}`);
    }
    if (bytes.byteLength === 0) { this.skipped.push({ key, reason: 'zero-byte file' }); return; }
    if (bytes.byteLength > MAX_TILE_BYTES) {
      this.skipped.push({ key, reason: `larger than ${MAX_TILE_BYTES} bytes; left loose` });
      return;
    }
    const sniffed = sniffImageMime(bytes);
    if (sniffed === null) { this.skipped.push({ key, reason: `unrecognised image bytes (declared ${mime})` }); return; }
    await this.ensureMarker();

    const hash = await sha256Hex(bytes);
    let mainSlot = this.bySource.get(hash);
    if (!mainSlot) {
      mainSlot = await this.main.push(key, bytes, sniffed);
      this.bySource.set(hash, mainSlot);
    }
    let thumbSlot: Slot | undefined;
    if (thumb && thumb.byteLength > 0) {
      const thumbMime = sniffImageMime(thumb);
      if (thumbMime !== null) thumbSlot = await this.thumbs.push(key, thumb, thumbMime);
    }
    this.ids.set(id, key);
    this.entries.set(key, { id, mime: sniffed, w: dims.w, h: dims.h, main: mainSlot, thumb: thumbSlot });
  }

  async finish(): Promise<BundleWriteResult> {
    if (this.finished) throw new Error('BundleWriter already finished');
    this.finished = true;
    await this.main.flush();
    await this.thumbs.flush();
    const shardPaths = this.main.files.map(f => `${this.folder}/${SHARDS_DIR}/${f.name}`);
    if (this.entries.size === 0) {
      return { indexFile: '', shards: [], entryCount: 0, bytes: 0, skipped: [...this.skipped] };
    }

    const entries: Record<string, IndexEntry> = {};
    for (const [key, e] of this.entries) {
      const ref = (s: Slot): ShardRef => ({ shard: s.shard, o: s.o, l: s.l });
      entries[key] = { id: e.id, ...ref(e.main), mime: e.mime, w: e.w, h: e.h, ...(e.thumb ? { thumb: ref(e.thumb) } : {}) };
    }
    const segment: IndexSegment = {
      format: BUNDLE_FORMAT,
      major: BUNDLE_MAJOR,
      minor: BUNDLE_MINOR,
      packId: this.opts.packId,
      createdAt: this.createdAt,
      mode: this.opts.mode,
      shards: this.main.files,
      ...(this.thumbs.files.length > 0 ? { thumbShards: this.thumbs.files } : {}),
      entries,
    };
    const indexBytes = encodeIndexSegment(segment);
    const indexFile = `${this.folder}/${INDEX_DIR}/${await contentName(indexBytes)}${INDEX_EXT}`;
    await this.writeFileOnce(indexFile, indexBytes);
    return {
      indexFile,
      shards: shardPaths,
      entryCount: this.entries.size,
      bytes: this.main.totalBytes + this.thumbs.totalBytes + indexBytes.byteLength,
      skipped: [...this.skipped],
    };
  }

  /**
   * @internal Write a content-addressed file unless an identical one exists.
   * "Exists" is not "identical": an interrupted non-atomic write or a Sync
   * partial leaves a short file under the right name, so the size is checked
   * and a mismatching file is removed and rewritten.
   */
  async writeFileOnce(path: string, bytes: Uint8Array): Promise<void> {
    const adapter = this.app.vault.adapter;
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    if (await adapter.exists(path)) {
      const st = await adapter.stat(path);
      if (st?.size === bytes.byteLength) return;
      await this.rewrite(path, buf);
      return;
    }
    await this.ensureFolder(path.slice(0, path.lastIndexOf('/')));
    await this.app.vault.createBinary(path, buf);
  }

  /** Replace a damaged file in place (remove, then write through the adapter). */
  private async rewrite(path: string, buf: ArrayBuffer): Promise<void> {
    const adapter = this.app.vault.adapter;
    await adapter.remove(path);
    await adapter.writeBinary(path, buf);
  }

  private async ensureFolder(path: string): Promise<void> {
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const p = parts.slice(0, i).join('/');
      if (p === '' || await this.app.vault.adapter.exists(p)) continue;
      await this.app.vault.createFolder(p);
    }
  }

  private async ensureMarker(): Promise<void> {
    if (this.markerChecked) return;
    const markerPath = `${this.folder}/${MARKER_FILE}`;
    const fresh = encodeMarker({
      format: BUNDLE_FORMAT,
      major: BUNDLE_MAJOR,
      packId: this.opts.packId,
      name: this.opts.name,
      createdAt: this.createdAt,
    });
    if (await this.app.vault.adapter.exists(markerPath)) {
      let existing: BundleMarker | null = null;
      try {
        existing = parseMarker(new Uint8Array(await this.app.vault.adapter.readBinary(markerPath)));
      } catch {
        // Truncated or unparseable (interrupted write, Sync partial): treat as
        // absent so the import is not stuck behind a marker it cannot read.
        existing = null;
      }
      if (existing === null) {
        const buf = fresh.buffer.slice(fresh.byteOffset, fresh.byteOffset + fresh.byteLength) as ArrayBuffer;
        await this.rewrite(markerPath, buf);
      } else if (existing.packId !== this.opts.packId) {
        throw new Error(`Bundle folder ${this.folder} belongs to pack ${existing.packId}, not ${this.opts.packId}`);
      }
    } else {
      await this.writeFileOnce(markerPath, fresh);
    }
    this.markerChecked = true;
  }
}
