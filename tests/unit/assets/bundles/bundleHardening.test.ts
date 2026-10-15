/** Hardening wave: interrupted writes, mount races, untrusted index input, shard checks. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform } from 'obsidian';
import { deflateSync, strToU8 } from 'fflate';

import { BundleWriter } from '../../../../src/assets/bundles/bundleWriter';
import {
  _resetBundleRegistryForTests, ensureMounted, entriesFor, getBundleState, getBundleStateInfo, lookupEntry,
  mountBundleFolder, readEntryBytes, remountOnRename,
} from '../../../../src/assets/bundles/bundleRegistry';
import {
  MAX_TILE_BYTES, contentName, decodeIndexSegment, encodeIndexSegment, encodeShard, parseMarker,
} from '../../../../src/assets/bundles/bundleFormat';
import type { BundleMode, IndexSegment, ShardItem } from '../../../../src/assets/bundles/bundleFormat';
import { readTileBytes } from '../../../../src/assets/tileBytes';
import { fakeImage, makeFakeVault, putFile } from './fakeVault';
import type { FakeVault } from './fakeVault';

const FOLDER = 'packs/demo';
const MiB = 1024 * 1024;

async function writeBundle(
  fv: FakeVault,
  tiles: { key: string; bytes: Uint8Array; id?: string }[],
  opts: { target?: number; mode?: BundleMode; createdAt?: string } = {},
) {
  const w = new BundleWriter(fv.app, FOLDER, {
    packId: 'demo', name: 'Demo', mode: opts.mode ?? 'exact',
    targetShardBytes: opts.target ?? 64 * 1024, createdAt: opts.createdAt ?? '2026-01-01T00:00:00Z',
  });
  for (const t of tiles) await w.add(t.key, t.bytes, 'image/png', t.id ?? `id-${t.key}`, { w: 1, h: 1 });
  return w.finish();
}

async function until(cond: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise(r => setTimeout(r, 1));
  if (!cond()) throw new Error('condition never became true');
}

function gate(): { promise: Promise<void>; release: () => void; reject: (e: Error) => void } {
  let release!: () => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => { release = res; reject = rej; });
  return { promise, release, reject };
}

let fv: FakeVault;
beforeEach(() => {
  _resetBundleRegistryForTests();
  fv = makeFakeVault();
  fv.folders.add('packs');
  fv.folders.add(FOLDER);
});
afterEach(() => {
  Platform.isMobile = false;
});

describe('writer: exists is not identical', () => {
  const tiles = () => [{ key: 'a.png', bytes: fakeImage('png', 500, 1) }, { key: 'b.png', bytes: fakeImage('png', 500, 2) }];

  it('rewrites a truncated existing shard', async () => {
    const res = await writeBundle(fv, tiles());
    const full = (fv.files.get(res.shards[0]) as Uint8Array).slice();
    fv.files.set(res.shards[0], full.slice(0, 10));
    await writeBundle(fv, tiles());
    expect(fv.files.get(res.shards[0])).toEqual(full);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
  });

  it('rewrites a truncated existing index file', async () => {
    const res = await writeBundle(fv, tiles());
    const full = (fv.files.get(res.indexFile) as Uint8Array).slice();
    fv.files.set(res.indexFile, full.slice(0, 5));
    await writeBundle(fv, tiles());
    expect(fv.files.get(res.indexFile)).toEqual(full);
  });

  it('an unparseable existing marker is rewritten instead of failing the import', async () => {
    putFile(fv, `${FOLDER}/bundle.wrbundle`, strToU8('{"format":"windr'));
    const res = await writeBundle(fv, tiles());
    expect(res.entryCount).toBe(2);
    expect(parseMarker(fv.files.get(`${FOLDER}/bundle.wrbundle`) as Uint8Array).packId).toBe('demo');
  });
});

describe('writer: limits and ids', () => {
  it('throws when one id is reused for a different key; a duplicate key is still skipped', async () => {
    const w = new BundleWriter(fv.app, FOLDER, { packId: 'demo', name: 'D', mode: 'exact', targetShardBytes: 65536 });
    await w.add('a.png', fakeImage('png', 50, 1), 'image/png', 'same', { w: 1, h: 1 });
    await w.add('a.png', fakeImage('png', 50, 2), 'image/png', 'same', { w: 1, h: 1 });
    await expect(w.add('b.png', fakeImage('png', 50, 3), 'image/png', 'same', { w: 1, h: 1 })).rejects.toThrow(/already used/);
    expect((await w.finish()).skipped).toEqual([{ key: 'a.png', reason: 'duplicate key' }]);
  });

  it('rejects a non-integer targetShardBytes and clamps tiny targets to 64 KiB', async () => {
    for (const bad of [1.5, NaN, Infinity]) {
      expect(() => new BundleWriter(fv.app, FOLDER, { packId: 'demo', name: 'D', mode: 'exact', targetShardBytes: bad })).toThrow(/finite integer/);
    }
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 1000, 1) }, { key: 'b.png', bytes: fakeImage('png', 1000, 2) }], { target: 100 });
    expect(res.shards).toHaveLength(1);
  });

  it('encodeShard throws past the u32 limit instead of wrapping', () => {
    const huge = { key: 'k.png', bytes: { byteLength: 0x1_0000_0000 } as Uint8Array, mime: 'image/png' } as ShardItem;
    expect(() => encodeShard([huge])).toThrow(/u32/);
  });

  it('mobile reads a tile of exactly MAX_TILE_BYTES in its own shard', async () => {
    await writeBundle(fv, [{ key: 'max.png', bytes: fakeImage('png', MAX_TILE_BYTES, 1) }], { target: MiB });
    await mountBundleFolder(fv.app, FOLDER);
    Platform.isMobile = true;
    const got = await readEntryBytes(fv.app, `${FOLDER}/max.png`);
    expect(got.ok).toBe(true);
  });
});

describe('index segment is untrusted input', () => {
  const NAME = '0123456789abcdef.wrshard';
  const base = (): IndexSegment => ({
    format: 'windrose-tiles', major: 1, minor: 0, packId: 'p', createdAt: 'x', mode: 'exact',
    shards: [{ name: NAME, size: 100 }],
    thumbShards: [{ name: NAME, size: 100 }],
    entries: { 'a.png': { id: 'a', shard: 0, o: 20, l: 10, mime: 'image/png', w: 1, h: 2, thumb: { shard: 0, o: 1, l: 1 } } },
  });
  const enc = (v: unknown) => deflateSync(strToU8(JSON.stringify(v)));
  const withEntry = (patch: Record<string, unknown>) => {
    const s = base();
    return enc({ ...s, entries: { 'a.png': { ...s.entries['a.png'], ...patch } } });
  };

  it('accepts a well-formed segment', () => {
    expect(decodeIndexSegment(encodeIndexSegment(base())).entries['a.png'].id).toBe('a');
  });

  it.each(['../x.wrshard', 'ABCDEF0123456789.wrshard', '0123456789abcdef.png', 'a/0123456789abcdef.wrshard'])('rejects shard name %s', name => {
    expect(() => decodeIndexSegment(enc({ ...base(), shards: [{ name, size: 100 }] }))).toThrow();
    expect(() => decodeIndexSegment(enc({ ...base(), thumbShards: [{ name, size: 100 }] }))).toThrow();
  });

  it.each(['../a.png', 'x/../../a.png', '/a.png', 'a\\b.png', 'a\0.png', ''])('rejects key %j', key => {
    const s = base();
    expect(() => decodeIndexSegment(enc({ ...s, entries: { [key]: s.entries['a.png'] } }))).toThrow();
  });

  it.each([
    { o: 1.5 }, { l: -1 }, { shard: 1 }, { shard: 0.5 }, { w: 2.5 }, { h: -3 },
    { thumb: { shard: 0, o: 0.5, l: 1 } }, { thumb: { shard: 3, o: 0, l: 1 } },
  ])('rejects entry field %o', patch => {
    expect(() => decodeIndexSegment(withEntry(patch))).toThrow();
  });

  it('rejects a fractional shard size', () => {
    expect(() => decodeIndexSegment(enc({ ...base(), shards: [{ name: NAME, size: 99.5 }] }))).toThrow();
  });
});

describe('mount: state rules', () => {
  it('no marker but index or shard files -> not-on-device (marker-missing), never loose', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    fv.files.delete(`${FOLDER}/bundle.wrbundle`);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('not-on-device');
    expect(getBundleStateInfo(FOLDER)?.reason).toBe('marker-missing');
    fv.files.delete(res.indexFile);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('not-on-device');
  });

  it('a loose folder with ordinary images in a thumbs/ subfolder stays loose', async () => {
    putFile(fv, `${FOLDER}/thumbs/a.png`, fakeImage('png', 20));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('loose');
  });

  it('index synced before its shards -> partial with every entry pending at mount, no shard reads', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50, 1) }, { key: 'b.png', bytes: fakeImage('png', 50, 2) }]);
    for (const s of res.shards) fv.files.delete(s);
    fv.reads.length = 0;
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('partial');
    expect(entriesFor(FOLDER).entries.map(e => e.pending)).toEqual([true, true]);
    expect(await readEntryBytes(fv.app, `${FOLDER}/a.png`)).toMatchObject({ ok: false, kind: 'shard-missing' });
    expect(fv.reads.some(r => r.includes('/shards/'))).toBe(false);
  });

  it('an index file whose stem is not its content hash is rejected (index-hash-mismatch)', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    const bytes = fv.files.get(res.indexFile) as Uint8Array;
    fv.files.delete(res.indexFile);
    putFile(fv, `${FOLDER}/index/ffffffffffffffff.wridx`, bytes);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('unmounted-corrupt');
    expect(getBundleStateInfo(FOLDER)?.reason).toBe('index-hash-mismatch');
  });
});

describe('mount: union runner-up', () => {
  const tinyBytes = fakeImage('png', 60, 1);
  const exactBytes = fakeImage('png', 60, 2);
  async function twoSegments() {
    await writeBundle(fv, [{ key: 'a.png', bytes: tinyBytes }], { mode: 'tiny' });
    return writeBundle(fv, [{ key: 'a.png', bytes: exactBytes }, { key: 'b.png', bytes: fakeImage('png', 60, 3) }], { mode: 'exact' });
  }

  it('serves the runner-up when the winner shard is missing at mount', async () => {
    const exact = await twoSegments();
    fv.files.delete(exact.shards[0]);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('partial');
    const a = await readTileBytes(fv.app, `${FOLDER}/a.png`);
    expect('ok' in a ? a : new Uint8Array(a.bytes)).toEqual(tinyBytes);
    expect(entriesFor(FOLDER).entries.map(e => [e.key, e.pending])).toEqual([['a.png', false], ['b.png', true]]);
  });

  it('serves the runner-up when the winner shard disappears after mount', async () => {
    const exact = await twoSegments();
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    fv.files.delete(exact.shards[0]);
    const a = await readTileBytes(fv.app, `${FOLDER}/a.png`);
    expect('ok' in a ? a : new Uint8Array(a.bytes)).toEqual(tinyBytes);
  });
});

describe('shard header check', () => {
  it('an index that disagrees with the shard table -> shard-table-mismatch, entries pending', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50, 1) }, { key: 'b.png', bytes: fakeImage('png', 50, 2) }]);
    const seg = decodeIndexSegment(fv.files.get(res.indexFile) as Uint8Array);
    // Point a.png at b.png's bytes: a valid image slice, but not what the shard table says.
    seg.entries['a.png'] = { ...seg.entries['a.png'], o: seg.entries['b.png'].o };
    const bytes = encodeIndexSegment(seg);
    fv.files.delete(res.indexFile);
    putFile(fv, `${FOLDER}/index/${await contentName(bytes)}.wridx`, bytes);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    expect(await readEntryBytes(fv.app, `${FOLDER}/a.png`)).toMatchObject({ ok: false, kind: 'shard-table-mismatch' });
    expect(await readEntryBytes(fv.app, `${FOLDER}/b.png`)).toMatchObject({ ok: false, kind: 'shard-table-mismatch' });
    expect(getBundleState(FOLDER)).toBe('partial');
  });
});

describe('mount races', () => {
  it('overlapping mounts: an older mount finishing last loses', async () => {
    const first = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50, 1) }]);
    const g = gate();
    fv.readHook = p => (p === first.indexFile ? g.promise : Promise.resolve());
    const older = mountBundleFolder(fv.app, FOLDER);
    await until(() => fv.reads.includes(first.indexFile));
    fv.readHook = null;
    fv.files.delete(first.indexFile);
    await writeBundle(fv, [{ key: 'b.png', bytes: fakeImage('png', 50, 2) }], { createdAt: '2026-02-01T00:00:00Z' });
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    g.release();
    expect(await older).toBe('mounted');
    expect(getBundleState(FOLDER)).toBe('mounted');
    expect(entriesFor(FOLDER).entries.map(e => e.key)).toEqual(['b.png']);
  });

  it('an in-flight read failing after a remount does not re-poison the new record', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await mountBundleFolder(fv.app, FOLDER);
    const shard = res.shards[0];
    const g = gate();
    fv.readHook = p => (p === shard ? g.promise : Promise.resolve());
    const inflight = readEntryBytes(fv.app, `${FOLDER}/a.png`);
    await until(() => fv.reads.includes(shard));
    fv.readHook = null;
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    g.reject(new Error('EIO'));
    expect(await inflight).toMatchObject({ ok: false, kind: 'shard-missing' });
    expect(getBundleState(FOLDER)).toBe('mounted');
    expect(entriesFor(FOLDER).entries[0].pending).toBe(false);
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
  });

  it('rename mounts the new path before unmounting the old: no not-found window', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await mountBundleFolder(fv.app, FOLDER);
    for (const [k, v] of [...fv.files]) { fv.files.delete(k); fv.files.set(k.replace('packs/', 'renamed/'), v); }
    for (const f of [...fv.folders]) if (f.startsWith('packs')) fv.folders.add(f.replace('packs', 'renamed'));
    const g = gate();
    fv.readHook = p => (p.startsWith('renamed/') && p.endsWith('.wridx') ? g.promise : Promise.resolve());
    const moving = remountOnRename('packs', 'renamed');
    await until(() => fv.reads.some(r => r.startsWith('renamed/') && r.endsWith('.wridx')));
    expect(lookupEntry(`${FOLDER}/a.png`)).not.toBeNull();
    g.release();
    await moving;
    expect(lookupEntry(`${FOLDER}/a.png`)).toBeNull();
    expect(lookupEntry('renamed/demo/a.png')?.id).toBe('id-a.png');
  });

  it('ensureMounted reuses a serving record without re-reading', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    expect(await ensureMounted(fv.app, FOLDER)).toBe('mounted');
    fv.reads.length = 0;
    expect(await ensureMounted(fv.app, FOLDER)).toBe('mounted');
    expect(fv.reads).toEqual([]);
  });

  it('concurrent ensureMounted calls share one mount', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    fv.reads.length = 0;
    const states = await Promise.all([ensureMounted(fv.app, FOLDER), ensureMounted(fv.app, FOLDER)]);
    expect(states).toEqual(['mounted', 'mounted']);
    expect(fv.reads.filter(r => r.endsWith('.wridx'))).toHaveLength(1);
  });
});
