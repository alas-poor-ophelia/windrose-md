/**
 * compactExistingBundle: a mounted exact bundle gets a complete compact
 * segment (ids and keys verbatim, src on re-encodes, kept-exact bytes and
 * thumbs carried over), then the superseded exact index and the shards only
 * it listed go to the trash after a segment-scoped read-back.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeFakeVault, putFile, fakeImage, markIndexed } from './fakeVault';
import type { FakeVault } from './fakeVault';
import type { CompactCodec } from '../../../../src/assets/bundles/bundleCompact';

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return { ...orig, Notice: class { constructor(_m: string) { /* silent */ } } };
});
vi.mock('../../../../src/assets/bundles/bundleThumbs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../../src/assets/bundles/bundleThumbs')>();
  const { fakeImage: img } = await import('./fakeVault');
  const thumb = img('png', 40, 77);
  return { ...orig, decodeTile: () => Promise.resolve({ dims: { w: 128, h: 128 }, thumb }) };
});

const { compactExistingBundle } = await import('../../../../src/assets/bundles/bundleCompactExisting');
const { BundleWriter } = await import('../../../../src/assets/bundles/bundleWriter');
const { contentName, decodeIndexSegment, encodeIndexSegment } = await import('../../../../src/assets/bundles/bundleFormat');
const reg = await import('../../../../src/assets/bundles/bundleRegistry');

const FOLDER = 'Packs/Forest';

/** A PNG of `size` bytes with a real IHDR (8-bit) and one IDAT of seeded noise. */
function png(size: number, seed: number): Uint8Array {
  const out = fakeImage('png', size, seed);
  const head = [0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 64, 0, 0, 0, 64, 8, 6, 0, 0, 0, 0, 0, 0, 0];
  out.set(head, 8);
  const idat = size - 8 - head.length - 12;
  out.set([(idat >>> 24) & 255, (idat >>> 16) & 255, (idat >>> 8) & 255, idat & 255, 73, 68, 65, 84], 8 + head.length);
  return out;
}

/** Encoder: a 1000-byte WebP seeded by the source, decoded back to the same pixels. */
const codec: CompactCodec = {
  encode: (bytes) => {
    const source = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(200) };
    const webp = fakeImage('webp', 1000, bytes[200] + 1);
    return Promise.resolve({ source, blob: new Blob([webp.slice()], { type: 'image/webp' }) });
  },
  decode: () => Promise.resolve({ width: 2, height: 2, data: new Uint8ClampedArray(16).fill(200) }),
};

interface Tile { key: string; bytes: Uint8Array; thumb?: Uint8Array }

const BIG_A: Tile = { key: 'trees/Oak.png', bytes: png(100_000, 1), thumb: fakeImage('png', 50, 11) };
const BIG_B: Tile = { key: 'trees/Pine.png', bytes: png(120_000, 2), thumb: fakeImage('png', 52, 12) };
const SMALL: Tile = { key: 'rocks/Pebble.png', bytes: png(2_000, 3), thumb: fakeImage('png', 48, 13) };
const SMALL_2: Tile = { key: 'rocks/Stone.png', bytes: png(3_000, 4), thumb: fakeImage('png', 46, 14) };

/** Write an exact segment (sorted keys, as entriesFor lists them), index every file, mount. */
async function seedExact(fv: FakeVault, tiles: Tile[], targetShardBytes = 4 * 1024 * 1024): Promise<void> {
  const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode: 'exact', targetShardBytes });
  for (const t of [...tiles].sort((a, b) => a.key.localeCompare(b.key))) {
    await w.add(t.key, t.bytes, 'image/png', `id:${t.key}`, { w: 64, h: 64 }, t.thumb);
  }
  await w.finish();
  indexAll(fv);
  await reg.mountBundleFolder(fv.app, FOLDER);
}

function indexAll(fv: FakeVault): void {
  for (const k of fv.files.keys()) if (k.startsWith(FOLDER + '/')) markIndexed(fv, k);
}

/** Index every bundle file right after a writer finishes (what vault.createBinary does in Obsidian). */
function indexOnFinish(fv: FakeVault): void {
  const orig = BundleWriter.prototype.finish;
  vi.spyOn(BundleWriter.prototype, 'finish').mockImplementation(async function (this: InstanceType<typeof BundleWriter>) {
    const r = await orig.call(this);
    indexAll(fv);
    return r;
  });
}

function liveFiles(fv: FakeVault, dir: string): string[] {
  return [...fv.files.keys()].filter(k => k.startsWith(`${FOLDER}/${dir}/`)).sort();
}

async function serves(fv: FakeVault, key: string, thumb = false): Promise<Uint8Array> {
  const r = await reg.readEntryBytes(fv.app, `${FOLDER}/${key}`, { thumb });
  if (reg.isBundleReadFailure(r)) throw new Error(`${key}: ${r.kind}`);
  return new Uint8Array(r.bytes);
}

describe('compactExistingBundle', () => {
  let fv: FakeVault;
  beforeEach(() => {
    reg._resetBundleRegistryForTests();
    fv = makeFakeVault();
  });
  afterEach(() => { vi.restoreAllMocks(); });

  it('writes a complete compact segment and retires the superseded exact segment', async () => {
    await seedExact(fv, [BIG_A, BIG_B, SMALL], 64 * 1024);
    const idsBefore = reg.entriesFor(FOLDER).entries.map(e => `${e.key}|${e.id}`);
    const exact = reg.getBundleSegments(FOLDER);
    expect(exact.map(s => s.mode)).toEqual(['exact']);
    const oldThumbs = liveFiles(fv, 'thumbs');
    const oldShards = liveFiles(fv, 'shards');

    const progress: string[] = [];
    const result = await compactExistingBundle(fv.app, FOLDER, {
      codec, onProgress: (d, t, phase) => progress.push(`${phase}:${d}/${t}`),
    });

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ reencoded: 2, keptExact: 1, retired: true, skipped: [], orphaned: 0, message: '' });
    expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
    expect(progress.filter(p => p.startsWith('encoding'))).toEqual(['encoding:1/3', 'encoding:2/3', 'encoding:3/3']);
    expect(progress.filter(p => p.startsWith('verifying'))).toEqual(['verifying:1/3', 'verifying:2/3', 'verifying:3/3']);
    expect(progress.filter(p => p.startsWith('retiring')).length).toBeGreaterThan(1);
    expect(progress.at(-1)?.startsWith('retiring')).toBe(true);

    // One compact segment serves everything; ids and keys are verbatim.
    const segs = reg.getBundleSegments(FOLDER);
    expect(segs.map(s => s.mode)).toEqual(['compact']);
    expect(reg.getBundleModes(FOLDER)).toEqual(['compact']);
    expect(reg.entriesFor(FOLDER).entries.map(e => `${e.key}|${e.id}`)).toEqual(idsBefore);
    const seg = decodeIndexSegment(fv.files.get(segs[0].file) as Uint8Array);
    expect(seg.mode).toBe('compact');
    expect(seg.entries[BIG_A.key].src).toEqual({ sha256: expect.any(String), bytes: 100_000, mime: 'image/png' });
    expect(seg.entries[BIG_B.key].src?.bytes).toBe(120_000);
    expect(seg.entries[SMALL.key].src).toBeUndefined();

    // Kept-exact bytes copied verbatim; re-encodes served as WebP.
    expect(await serves(fv, SMALL.key)).toEqual(SMALL.bytes);
    expect((await serves(fv, BIG_A.key)).byteLength).toBe(1000);

    // The exact index and its main shards are in the trash; the shared thumb shard stayed.
    expect(fv.trashed).toContain(exact[0].file);
    expect(fv.files.has(`.trash/${exact[0].file}`)).toBe(true);
    for (const s of oldShards) expect(fv.trashed).toContain(s);
    expect(oldThumbs).toHaveLength(1);
    expect(fv.trashed).not.toContain(oldThumbs[0]);
    expect(segs[0].files.map(f => f.path)).toContain(oldThumbs[0]);
    // Index first, then shards.
    expect(fv.trashed[0]).toBe(exact[0].file);
    expect(reg.isBundleWriteInProgress(FOLDER)).toBe(false);
    expect(reg.getBundleState(FOLDER)).toBe('mounted');
  });

  it('nothing re-encoded: drops the new segment, keeps the exact one and the shards it shares', async () => {
    await seedExact(fv, [SMALL, SMALL_2]);
    const oldFiles = [...liveFiles(fv, 'shards'), ...liveFiles(fv, 'thumbs')];
    const exact = reg.getBundleSegments(FOLDER)[0];
    indexOnFinish(fv);
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', reencoded: 0, keptExact: 2, retired: false, orphaned: 0 });
    if (result.status === 'done') expect(result.keptReason).toBe('nothing to compact (all images stayed exact)');
    // Only the new (unreferenced) index went; its shards equal the exact ones, so they stay.
    expect(fv.trashed).toHaveLength(1);
    expect(fv.trashed[0]).not.toBe(exact.file);
    expect(fv.trashed[0]).toMatch(/\/index\/[0-9a-f]{16}\.wridx$/);
    for (const f of oldFiles) expect(fv.files.has(f)).toBe(true);
    expect(reg.getBundleSegments(FOLDER).map(s => s.file)).toEqual([exact.file]);
    expect(reg.getBundleModes(FOLDER)).toEqual(['exact']);
    expect(await serves(fv, SMALL_2.key)).toEqual(SMALL_2.bytes);
  });

  it('carries existing thumbs over and renders one where the exact entry had none', async () => {
    const bare: Tile = { key: 'trees/Birch.png', bytes: png(90_000, 5) };
    await seedExact(fv, [BIG_A, SMALL, bare]);
    await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(await serves(fv, BIG_A.key, true)).toEqual(BIG_A.thumb);
    expect(await serves(fv, SMALL.key, true)).toEqual(SMALL.thumb);
    expect(await serves(fv, bare.key, true)).toEqual(fakeImage('png', 40, 77));
  });

  it("refuses when the trash setting deletes permanently, writing nothing", async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    fv.config.trashOption = 'none';
    const files = [...fv.files.keys()].sort();
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') return;
    expect(result.message).toContain('deletes files permanently');
    expect([...fv.files.keys()].sort()).toEqual(files);
    expect(fv.trashed).toEqual([]);
  });

  it('refuses a bundle that is already compact', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    await compactExistingBundle(fv.app, FOLDER, { codec });
    const again = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(again).toMatchObject({ status: 'refused' });
    if (again.status === 'refused') expect(again.message).toContain('already compact');
  });

  it('refuses a folder that is not mounted', async () => {
    putFile(fv, `${FOLDER}/loose.png`, png(80_000, 9));
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result.status).toBe('refused');
  });

  it('an interrupted run (finish throws) trashes nothing and exact keeps serving', async () => {
    await seedExact(fv, [BIG_A, BIG_B, SMALL]);
    vi.spyOn(BundleWriter.prototype, 'finish').mockRejectedValueOnce(new Error('disk full'));
    await expect(compactExistingBundle(fv.app, FOLDER, { codec })).rejects.toThrow('disk full');
    expect(fv.trashed).toEqual([]);
    expect(reg.isBundleWriteInProgress(FOLDER)).toBe(false);
    await reg.mountBundleFolder(fv.app, FOLDER);
    expect(reg.getBundleModes(FOLDER)).toEqual(['exact']);
    expect(await serves(fv, BIG_A.key)).toEqual(BIG_A.bytes);
  });

  it('keeps the exact segment when the compact copy fails its read-back', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    const oldShards = new Set(liveFiles(fv, 'shards'));
    let corrupted = false;
    // Flip the last byte of the new shard right before the read-back gate loads it.
    fv.readHook = (p: string) => {
      if (!corrupted && p.includes('/shards/') && !oldShards.has(p) && reg.getBundleSegments(FOLDER).length === 2) {
        corrupted = true;
        const bad = (fv.files.get(p) as Uint8Array).slice();
        bad[bad.length - 1] ^= 0xff;
        fv.files.set(p, bad);
      }
      return Promise.resolve();
    };
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: false });
    if (result.status === 'done') expect(result.keptReason).toContain('did not read back');
    expect(corrupted).toBe(true);
    expect(fv.trashed).toEqual([]);
    expect(reg.getBundleModes(FOLDER)).toEqual(['exact']);
  });

  it('keeps the exact segment when the compact copy stores a different id', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    const add = BundleWriter.prototype.add;
    vi.spyOn(BundleWriter.prototype, 'add').mockImplementation(function (
      this: InstanceType<typeof BundleWriter>, ...args: Parameters<typeof add>
    ) {
      if (args[0] === BIG_A.key) args[3] = 'id:minted-again';
      return add.apply(this, args);
    });
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: false });
    if (result.status === 'done') expect(result.keptReason).toContain('different id or size');
    expect(fv.trashed).toEqual([]);
    expect(reg.getBundleModes(FOLDER)).toEqual(['exact']);
    expect(reg.entriesFor(FOLDER).entries.find(e => e.key === BIG_A.key)?.id).toBe(`id:${BIG_A.key}`);
  });

  it('keeps old shards an index segment that appeared mid-run still lists, and reports exact still serving', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    const exact = reg.getBundleSegments(FOLDER)[0];
    const oldShards = liveFiles(fv, 'shards');
    // A second exact segment (another device, Sync) listing the same old shards.
    const seg = decodeIndexSegment(fv.files.get(exact.file) as Uint8Array);
    const lateBytes = encodeIndexSegment({ ...seg, createdAt: '2099-01-01T00:00:00.000Z' });
    const latePath = `${FOLDER}/index/${await contentName(lateBytes)}.wridx`;
    fv.trashHook = (p) => {
      if (p === exact.file && !fv.files.has(latePath)) {
        putFile(fv, latePath, lateBytes);
        markIndexed(fv, latePath);
      }
    };
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: false });
    if (result.status === 'done') expect(result.keptReason).toBe('an exact segment still serves this bundle; run Compact again');
    expect(fv.trashed).toEqual([exact.file]);
    for (const s of oldShards) expect(fv.files.has(s)).toBe(true);
    expect(reg.getBundleModes(FOLDER)).toContain('exact');
    expect(await serves(fv, BIG_A.key)).toEqual(BIG_A.bytes);
  });

  it('retires several exact segments together', async () => {
    await seedExact(fv, [BIG_A]);
    await seedExact(fv, [BIG_B, SMALL]);
    const exact = reg.getBundleSegments(FOLDER);
    expect(exact.map(s => s.mode)).toEqual(['exact', 'exact']);
    const oldShards = liveFiles(fv, 'shards');
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', reencoded: 2, keptExact: 1, retired: true, orphaned: 0 });
    for (const s of exact) expect(fv.trashed).toContain(s.file);
    for (const s of oldShards) expect(fv.trashed).toContain(s);
    expect(reg.getBundleModes(FOLDER)).toEqual(['compact']);
    expect(reg.getBundleSegments(FOLDER)).toHaveLength(1);
    expect(await serves(fv, SMALL.key)).toEqual(SMALL.bytes);
  });

  it('leaves an older compact segment and its shards alone', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode: 'compact', targetShardBytes: 64 * 1024 });
    await w.add(BIG_B.key, BIG_B.bytes, 'image/png', `id:${BIG_B.key}`, { w: 64, h: 64 }, BIG_B.thumb);
    const older = await w.finish();
    indexAll(fv);
    await reg.mountBundleFolder(fv.app, FOLDER);
    const olderSeg = reg.getBundleSegments(FOLDER).find(s => s.file === older.indexFile);
    expect(olderSeg?.mode).toBe('compact');
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: true, orphaned: 0 });
    expect(fv.trashed).not.toContain(older.indexFile);
    expect(fv.files.has(older.indexFile)).toBe(true);
    for (const f of olderSeg?.files ?? []) {
      expect(fv.trashed).not.toContain(f.path);
      expect(fv.files.has(f.path)).toBe(true);
    }
    expect(reg.getBundleModes(FOLDER)).toEqual(['compact']);
  });

  it('one exact index failing to trash: retired false and no shard trashed', async () => {
    await seedExact(fv, [BIG_A]);
    await seedExact(fv, [BIG_B, SMALL]);
    const [first, second] = reg.getBundleSegments(FOLDER);
    fv.trashFails.add(first.file);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: false });
    if (result.status === 'done') expect(result.keptReason).toBe('an exact index file could not be moved to the trash');
    expect(fv.trashed).toEqual([second.file]);
  });

  it('counts and logs shard files that could not be moved to the trash', async () => {
    await seedExact(fv, [BIG_A, SMALL]);
    const [shard] = liveFiles(fv, 'shards');
    fv.trashFails.add(shard);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await compactExistingBundle(fv.app, FOLDER, { codec });
    expect(result).toMatchObject({ status: 'done', retired: true, orphaned: 1 });
    if (result.status === 'done') {
      expect(result.message).toBe('1 shard file could not be moved to the trash (see developer console).');
    }
    expect(warn.mock.calls.some(c => c.includes(shard))).toBe(true);
    expect(fv.files.has(shard)).toBe(true);
  });
});
