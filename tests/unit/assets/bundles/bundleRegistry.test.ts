import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform } from 'obsidian';
import { strToU8 } from 'fflate';

import { BundleWriter } from '../../../../src/assets/bundles/bundleWriter';
import {
  _resetBundleRegistryForTests, entriesFor, getBundleRegistryVersion, getBundleState, lookupEntry,
  mountBundleFolder, readEntryBytes, remountOnRename, subscribeBundleRegistry, unmountBundleFolder,
} from '../../../../src/assets/bundles/bundleRegistry';
import { contentName, encodeIndexSegment, encodeShard } from '../../../../src/assets/bundles/bundleFormat';
import type { BundleMode } from '../../../../src/assets/bundles/bundleFormat';
import { readTileBytes } from '../../../../src/assets/tileBytes';
import { fakeImage, makeFakeVault, putFile } from './fakeVault';
import type { FakeVault } from './fakeVault';

const FOLDER = 'packs/demo';
const MiB = 1024 * 1024;
const KiB = 1024;

async function writeBundle(
  fv: FakeVault,
  tiles: { key: string; bytes: Uint8Array; mime?: string; thumb?: Uint8Array }[],
  opts: { target?: number; mode?: BundleMode; createdAt?: string; packId?: string } = {},
) {
  const w = new BundleWriter(fv.app, FOLDER, {
    packId: opts.packId ?? 'demo', name: 'Demo', mode: opts.mode ?? 'exact',
    targetShardBytes: opts.target ?? 64 * KiB, createdAt: opts.createdAt,
  });
  for (const [i, t] of tiles.entries()) {
    await w.add(t.key, t.bytes, t.mime ?? 'image/png', `id-${t.key}`, { w: 10 + i, h: 20 + i }, t.thumb);
  }
  return w.finish();
}

function sampleTiles() {
  return [
    // The writer clamps targetShardBytes to >= 64 KiB: tiles are sized so the
    // default 64 KiB target still splits them across several shards.
    { key: 'walls/a.png', bytes: fakeImage('png', 40_000, 1) },
    { key: 'walls/b.webp', bytes: fakeImage('webp', 36_000, 2), mime: 'image/webp' },
    { key: 'floors/c.jpg', bytes: fakeImage('jpeg', 60_000, 3), mime: 'image/jpeg' },
    { key: 'floors/d.gif', bytes: fakeImage('gif', 32_000, 4), mime: 'image/gif' },
    { key: 'misc/e.png', bytes: fakeImage('png', 48_000, 5), thumb: fakeImage('png', 16, 9) },
  ];
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

describe('round trip', () => {
  it('writer -> mount -> readTileBytes is byte-equal with ids, mime and dims preserved', async () => {
    const tiles = sampleTiles();
    const res = await writeBundle(fv, tiles);
    expect(res.entryCount).toBe(5);
    expect(res.shards.length).toBeGreaterThan(1);
    expect(res.skipped).toEqual([]);
    expect(fv.files.has(`${FOLDER}/bundle.wrbundle`)).toBe(true);
    expect(res.indexFile).toMatch(/^packs\/demo\/index\/[0-9a-f]{16}\.wridx$/);
    for (const s of res.shards) expect(s).toMatch(/\/shards\/[0-9a-f]{16}\.wrshard$/);

    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    const listed = entriesFor(FOLDER);
    expect(listed.state).toBe('mounted');
    expect(listed.entries.map(e => e.key)).toEqual(tiles.map(t => t.key).sort());

    for (const [i, t] of tiles.entries()) {
      const view = listed.entries.find(e => e.key === t.key);
      expect(view).toMatchObject({ id: `id-${t.key}`, vaultPath: `${FOLDER}/${t.key}`, w: 10 + i, h: 20 + i, pending: false });
      const got = await readTileBytes(fv.app, `${FOLDER}/${t.key}`);
      if ('ok' in got) throw new Error(got.reason);
      expect(got.source).toBe('bundle');
      expect(got.mime).toBe(t.mime ?? 'image/png');
      expect(new Uint8Array(got.bytes)).toEqual(t.bytes);
    }
    const thumb = await readEntryBytes(fv.app, `${FOLDER}/misc/e.png`, { thumb: true });
    expect(thumb.ok).toBe(true);
    if (thumb.ok) expect(new Uint8Array(thumb.bytes)).toEqual(tiles[4].thumb);
  });

  it('dedups byte-identical sources into one stored copy', async () => {
    const img = fakeImage('png', 100, 7);
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: img }, { key: 'b.png', bytes: img }], { target: 10_000 });
    expect(res.entryCount).toBe(2);
    await mountBundleFolder(fv.app, FOLDER);
    expect(lookupEntry(`${FOLDER}/a.png`)?.main).toEqual(lookupEntry(`${FOLDER}/b.png`)?.main);
    const b = await readTileBytes(fv.app, `${FOLDER}/b.png`);
    expect('ok' in b ? null : new Uint8Array(b.bytes)).toEqual(img);
  });

  it('refuses a marker owned by another pack', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await expect(writeBundle(fv, [{ key: 'b.png', bytes: fakeImage('png', 50, 2) }], { packId: 'other' })).rejects.toThrow(/belongs to pack demo/);
  });
});

describe('overflow and skips', () => {
  it('gives a tile larger than the target its own shard and skips > 16 MiB', async () => {
    const big = fakeImage('png', 5 * MiB, 1);
    const huge = fakeImage('png', 17 * MiB, 2);
    const res = await writeBundle(fv, [
      { key: 'small1.png', bytes: fakeImage('png', 1000, 3) },
      { key: 'big.png', bytes: big },
      { key: 'huge.png', bytes: huge },
      { key: 'zero.png', bytes: new Uint8Array(0) },
      { key: 'small2.png', bytes: fakeImage('png', 1000, 4) },
    ], { target: MiB });
    expect(res.skipped.map(s => s.key)).toEqual(['huge.png', 'zero.png']);
    expect(res.skipped[0].reason).toMatch(/left loose/);
    expect(res.shards.length).toBe(3);
    await mountBundleFolder(fv.app, FOLDER);
    const bigEntry = lookupEntry(`${FOLDER}/big.png`);
    const otherShards = ['small1.png', 'small2.png'].map(k => lookupEntry(`${FOLDER}/${k}`)?.main.path);
    expect(otherShards).not.toContain(bigEntry?.main.path);
    const got = await readTileBytes(fv.app, `${FOLDER}/big.png`);
    expect('ok' in got ? null : got.bytes.byteLength).toBe(5 * MiB);
  });
});

describe('union across segments', () => {
  it('resolves the same key by mode, then createdAt', async () => {
    const tiny = fakeImage('png', 60, 1);
    const exactOld = fakeImage('png', 60, 2);
    const exactNew = fakeImage('png', 60, 3);
    await writeBundle(fv, [{ key: 'a.png', bytes: tiny }], { mode: 'tiny', createdAt: '2026-09-01' });
    await writeBundle(fv, [{ key: 'a.png', bytes: exactOld }, { key: 'b.png', bytes: exactOld }], { mode: 'exact', createdAt: '2026-01-01' });
    await writeBundle(fv, [{ key: 'b.png', bytes: exactNew }], { mode: 'exact', createdAt: '2026-05-01' });
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    const a = await readTileBytes(fv.app, `${FOLDER}/a.png`);
    const b = await readTileBytes(fv.app, `${FOLDER}/b.png`);
    expect('ok' in a ? null : new Uint8Array(a.bytes)).toEqual(exactOld);
    expect('ok' in b ? null : new Uint8Array(b.bytes)).toEqual(exactNew);
  });
});

describe('mount states and corruption', () => {
  it('folder with no marker is loose; absent folder is not-on-device', async () => {
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('loose');
    expect(await mountBundleFolder(fv.app, 'nowhere')).toBe('not-on-device');
    expect(entriesFor('nowhere')).toMatchObject({ state: 'not-on-device', reason: 'folder-absent', entries: [] });
  });

  it('marker + no index + no shards -> not-on-device', async () => {
    putFile(fv, `${FOLDER}/bundle.wrbundle`, strToU8(JSON.stringify({ format: 'windrose-tiles', major: 1, packId: 'demo' })));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('not-on-device');
    expect(entriesFor(FOLDER).reason).toBe('no-index-no-shards');
  });

  it('marker major 2 -> unsupported-version', async () => {
    putFile(fv, `${FOLDER}/bundle.wrbundle`, strToU8(JSON.stringify({ format: 'windrose-tiles', major: 2, packId: 'demo' })));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('unsupported-version');
    expect(entriesFor(FOLDER).entries).toEqual([]);
  });

  it('garbage marker -> unmounted-corrupt', async () => {
    putFile(fv, `${FOLDER}/bundle.wrbundle`, strToU8('not json'));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('unmounted-corrupt');
  });

  it('0-byte index: corrupt when alone, partial alongside a good one', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    const good = [...fv.files.keys()].find(k => k.endsWith('.wridx')) as string;
    const goodBytes = fv.files.get(good) as Uint8Array;
    fv.files.delete(good);
    putFile(fv, `${FOLDER}/index/0000000000000000.wridx`, new Uint8Array(0));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('unmounted-corrupt');
    expect(entriesFor(FOLDER).entries).toEqual([]);

    fv.files.set(good, goodBytes);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('partial');
    expect(entriesFor(FOLDER).entries.map(e => e.key)).toEqual(['a.png']);
  });

  it('truncated shard -> shard-size-mismatch for its entries only', async () => {
    const res = await writeBundle(fv, sampleTiles());
    await mountBundleFolder(fv.app, FOLDER);
    const victim = lookupEntry(`${FOLDER}/walls/a.png`)?.main.path as string;
    fv.files.set(victim, (fv.files.get(victim) as Uint8Array).subarray(0, 40));
    for (const t of sampleTiles()) {
      const got = await readTileBytes(fv.app, `${FOLDER}/${t.key}`);
      const onVictim = lookupEntry(`${FOLDER}/${t.key}`)?.main.path === victim;
      if (onVictim) expect(got).toMatchObject({ ok: false, kind: 'shard-size-mismatch' });
      else expect('ok' in got).toBe(false);
    }
    expect(res.shards).toContain(victim);
    expect(getBundleState(FOLDER)).toBe('partial');
    expect(entriesFor(FOLDER).entries.find(e => e.key === 'walls/a.png')?.pending).toBe(true);
  });

  it('missing shard after mount -> shard-missing, entries pending, state partial', async () => {
    const res = await writeBundle(fv, sampleTiles());
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    for (const s of res.shards) fv.files.delete(s);
    const got = await readTileBytes(fv.app, `${FOLDER}/walls/a.png`);
    expect(got).toMatchObject({ ok: false, kind: 'shard-missing' });
    expect(getBundleState(FOLDER)).toBe('partial');
    for (const t of sampleTiles()) await readTileBytes(fv.app, `${FOLDER}/${t.key}`);
    expect(entriesFor(FOLDER).entries.every(e => e.pending)).toBe(true);
  });

  it('bad magic and out-of-range slices are typed failures', async () => {
    const { bytes: shardBytes, table } = encodeShard([
      { key: 'ok.png', bytes: fakeImage('png', 64), mime: 'image/png' },
      { key: 'magic.png', bytes: strToU8('not an image'), mime: 'image/png' },
      { key: 'range.png', bytes: fakeImage('png', 16, 2), mime: 'image/png' },
    ]);
    // Corrupt range.png's table length so table and index agree but point past the end.
    const rangeLenAt = 12 + (2 + 6 + 4 + 4 + 1) + (2 + 9 + 4 + 4 + 1) + 2 + 9 + 4;
    new DataView(shardBytes.buffer).setUint32(rangeLenAt, 9999, true);
    const shardName = `${await contentName(shardBytes)}.wrshard`;
    putFile(fv, `${FOLDER}/bundle.wrbundle`, strToU8(JSON.stringify({ format: 'windrose-tiles', major: 1, packId: 'demo' })));
    putFile(fv, `${FOLDER}/shards/${shardName}`, shardBytes);
    const ref = (i: number, l = table[i].length) => ({ shard: 0, o: table[i].offset, l, mime: 'image/png', w: 1, h: 1 });
    const idx = encodeIndexSegment({
      format: 'windrose-tiles', major: 1, minor: 0, packId: 'demo', createdAt: 'x', mode: 'exact',
      shards: [{ name: shardName, size: shardBytes.byteLength }],
      entries: { 'ok.png': { id: 'ok', ...ref(0) }, 'magic.png': { id: 'm', ...ref(1) }, 'range.png': { id: 'r', ...ref(2, 9999) } },
    });
    putFile(fv, `${FOLDER}/index/${await contentName(idx)}.wridx`, idx);
    await mountBundleFolder(fv.app, FOLDER);
    expect((await readTileBytes(fv.app, `${FOLDER}/ok.png`) as { source?: string }).source).toBe('bundle');
    expect(await readTileBytes(fv.app, `${FOLDER}/magic.png`)).toMatchObject({ kind: 'bad-magic' });
    expect(await readTileBytes(fv.app, `${FOLDER}/range.png`)).toMatchObject({ kind: 'slice-out-of-range' });
  });
});

describe('negative cache', () => {
  it('a second read of a failing entry does no I/O', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await mountBundleFolder(fv.app, FOLDER);
    fv.files.delete(res.shards[0]);
    fv.reads.length = 0;
    await readEntryBytes(fv.app, `${FOLDER}/a.png`);
    const after1 = fv.reads.length;
    expect(after1).toBe(1);
    const second = await readEntryBytes(fv.app, `${FOLDER}/a.png`);
    expect(second).toMatchObject({ ok: false, kind: 'shard-missing' });
    expect(fv.reads.length).toBe(after1);
  });

  it('remount clears the negative cache', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    const shard = fv.files.get(res.shards[0]) as Uint8Array;
    await mountBundleFolder(fv.app, FOLDER);
    fv.files.delete(res.shards[0]);
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(false);
    fv.files.set(res.shards[0], shard);
    await mountBundleFolder(fv.app, FOLDER);
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
  });
});

describe('remount shard retention', () => {
  it('a forced remount with the same shard set does not re-read the shard', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await mountBundleFolder(fv.app, FOLDER);
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
    await mountBundleFolder(fv.app, FOLDER);
    fv.reads.length = 0;
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
    expect(fv.reads.filter(p => p === res.shards[0])).toEqual([]);
  });

  it('drops a cached shard whose size changed on disk', async () => {
    const res = await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    await mountBundleFolder(fv.app, FOLDER);
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
    const shard = fv.files.get(res.shards[0]) as Uint8Array;
    fv.files.set(res.shards[0], shard.slice(0, shard.length - 3));
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('partial');
    expect(await readEntryBytes(fv.app, `${FOLDER}/a.png`)).toMatchObject({ ok: false, kind: 'shard-size-mismatch' });
    fv.files.set(res.shards[0], shard);
    expect(await mountBundleFolder(fv.app, FOLDER)).toBe('mounted');
    fv.reads.length = 0;
    expect((await readEntryBytes(fv.app, `${FOLDER}/a.png`)).ok).toBe(true);
    expect(fv.reads).toContain(res.shards[0]);
  });
});

describe('shard cache concurrency', () => {
  it('dedupes concurrent reads of one shard', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50, 1) }, { key: 'b.png', bytes: fakeImage('png', 50, 2) }], { target: 10_000 });
    await mountBundleFolder(fv.app, FOLDER);
    fv.reads.length = 0;
    fv.readDelayMs = 5;
    await Promise.all([readEntryBytes(fv.app, `${FOLDER}/a.png`), readEntryBytes(fv.app, `${FOLDER}/b.png`)]);
    expect(fv.reads.length).toBe(1);
  });

  it('mobile serializes reads of different shards (max concurrency 1)', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 70_000, 1) }, { key: 'b.png', bytes: fakeImage('png', 70_000, 2) }, { key: 'c.png', bytes: fakeImage('png', 70_000, 3) }]);
    await mountBundleFolder(fv.app, FOLDER);
    Platform.isMobile = true;
    fv.readDelayMs = 5;
    fv.inFlight.max = 0;
    const results = await Promise.all(['a', 'b', 'c'].map(k => readEntryBytes(fv.app, `${FOLDER}/${k}.png`)));
    expect(results.every(r => r.ok)).toBe(true);
    expect(fv.inFlight.max).toBe(1);
  });

  it('desktop reads different shards in parallel', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 70_000, 1) }, { key: 'b.png', bytes: fakeImage('png', 70_000, 2) }]);
    await mountBundleFolder(fv.app, FOLDER);
    fv.readDelayMs = 5;
    fv.inFlight.max = 0;
    await Promise.all(['a', 'b'].map(k => readEntryBytes(fv.app, `${FOLDER}/${k}.png`)));
    expect(fv.inFlight.max).toBe(2);
  });
});

describe('lifecycle', () => {
  it('bumps the version, notifies, unmounts and remounts on rename', async () => {
    await writeBundle(fv, [{ key: 'a.png', bytes: fakeImage('png', 50) }]);
    let calls = 0;
    const off = subscribeBundleRegistry(() => { calls++; });
    const v0 = getBundleRegistryVersion();
    await mountBundleFolder(fv.app, FOLDER);
    expect(getBundleRegistryVersion()).toBeGreaterThan(v0);
    expect(calls).toBe(1);

    // Simulate the folder rename on disk.
    for (const [k, v] of [...fv.files]) {
      if (k.startsWith('packs/')) { fv.files.delete(k); fv.files.set(k.replace('packs/', 'renamed/'), v); }
    }
    for (const f of [...fv.folders]) if (f.startsWith('packs')) fv.folders.add(f.replace('packs', 'renamed'));
    await remountOnRename('packs', 'renamed');
    expect(getBundleState(FOLDER)).toBe('loose');
    expect(getBundleState('renamed/demo')).toBe('mounted');
    expect(lookupEntry('renamed/demo/a.png')?.id).toBe('id-a.png');

    unmountBundleFolder('renamed/demo');
    expect(lookupEntry('renamed/demo/a.png')).toBeNull();
    off();
  });

  it('longest-prefix wins for nested roots', async () => {
    await writeBundle(fv, [{ key: 'inner/a.png', bytes: fakeImage('png', 50, 1) }]);
    const inner = new BundleWriter(fv.app, `${FOLDER}/inner`, { packId: 'inner', name: 'Inner', mode: 'exact', targetShardBytes: 1000 });
    fv.folders.add(`${FOLDER}/inner`);
    await inner.add('a.png', fakeImage('png', 50, 2), 'image/png', 'inner-a', { w: 1, h: 1 });
    await inner.finish();
    await mountBundleFolder(fv.app, FOLDER);
    await mountBundleFolder(fv.app, `${FOLDER}/inner`);
    expect(lookupEntry(`${FOLDER}/inner/a.png`)?.id).toBe('inner-a');
  });
});
