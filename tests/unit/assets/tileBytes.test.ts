import { describe, it, expect, beforeEach } from 'vitest';

import { BundleWriter } from '../../../src/assets/bundles/bundleWriter';
import { _resetBundleRegistryForTests, mountBundleFolder } from '../../../src/assets/bundles/bundleRegistry';
import { clearTileBytesNegativeCache, isTileReadFailure, readTileBlob, readTileBytes, readTileThumbBlob } from '../../../src/assets/tileBytes';
import { fakeImage, makeFakeVault, markIndexed, putFile } from './bundles/fakeVault';
import type { FakeVault } from './bundles/fakeVault';

let fv: FakeVault;
beforeEach(() => {
  _resetBundleRegistryForTests();
  clearTileBytesNegativeCache();
  fv = makeFakeVault();
});

async function bundleAt(folder: string, key: string, seed = 1): Promise<void> {
  fv.folders.add(folder);
  const w = new BundleWriter(fv.app, folder, { packId: 'p', name: 'P', mode: 'exact', targetShardBytes: 65536 });
  await w.add(key, fakeImage('png', 40, seed), 'image/png', key, { w: 1, h: 1 });
  await w.finish();
  await mountBundleFolder(fv.app, folder);
}

describe('readTileBytes', () => {
  it('reads an indexed vault file via vault.readBinary with an extension mime', async () => {
    const img = fakeImage('jpeg', 30);
    putFile(fv, 'tiles/a.jpg', img);
    fv.indexed.add('tiles/a.jpg');
    const got = await readTileBytes(fv.app, 'tiles/a.jpg');
    expect(isTileReadFailure(got)).toBe(false);
    if (!isTileReadFailure(got)) {
      expect(got).toMatchObject({ source: 'vault', mime: 'image/jpeg' });
      expect(new Uint8Array(got.bytes)).toEqual(img);
    }
  });

  it('falls back to the adapter for files the index has not caught up with', async () => {
    putFile(fv, 'tiles/b.webp', fakeImage('webp', 30));
    const got = await readTileBytes(fv.app, 'tiles/b.webp');
    expect(got).toMatchObject({ source: 'vault', mime: 'image/webp' });
  });

  it('returns a typed not-found failure', async () => {
    expect(await readTileBytes(fv.app, 'tiles/none.png')).toMatchObject({ ok: false, kind: 'not-found' });
    expect(await readTileBlob(fv.app, 'tiles/none.png')).toBeNull();
  });

  it('a loose indexed file beats a bundle entry at the same path', async () => {
    fv.folders.add('pack');
    const w = new BundleWriter(fv.app, 'pack', { packId: 'p', name: 'P', mode: 'exact', targetShardBytes: 1000 });
    await w.add('a.png', fakeImage('png', 40, 1), 'image/png', 'a', { w: 1, h: 1 });
    await w.finish();
    await mountBundleFolder(fv.app, 'pack');
    const bundled = await readTileBytes(fv.app, 'pack/a.png');
    expect(bundled).toMatchObject({ source: 'bundle', mime: 'image/png' });

    const loose = fakeImage('png', 40, 2);
    putFile(fv, 'pack/a.png', loose);
    fv.indexed.add('pack/a.png');
    const got = await readTileBytes(fv.app, 'pack/a.png');
    expect(got).toMatchObject({ source: 'vault' });
    if (!isTileReadFailure(got)) expect(new Uint8Array(got.bytes)).toEqual(loose);
  });

  it('a loose file on disk but not yet indexed still wins over the bundle', async () => {
    await bundleAt('pack', 'a.png');
    const loose = fakeImage('png', 40, 2);
    putFile(fv, 'pack/a.png', loose);
    const got = await readTileBytes(fv.app, 'pack/a.png');
    expect(got).toMatchObject({ source: 'vault' });
    if (!isTileReadFailure(got)) expect(new Uint8Array(got.bytes)).toEqual(loose);
    // The positive answer is cached: no second exists() for the shadowed path.
    const calls = fv.existsCalls.filter(p => p === 'pack/a.png').length;
    await readTileBytes(fv.app, 'pack/a.png');
    expect(fv.existsCalls.filter(p => p === 'pack/a.png').length).toBe(calls);
    markIndexed(fv, 'pack/a.png');
    expect(await readTileBytes(fv.app, 'pack/a.png')).toMatchObject({ source: 'vault' });
  });

  it('a loose file created after a bundle read wins once the negative cache is cleared', async () => {
    await bundleAt('pack', 'a.png');
    expect(await readTileBytes(fv.app, 'pack/a.png')).toMatchObject({ source: 'bundle' });
    putFile(fv, 'pack/a.png', fakeImage('png', 40, 3));
    clearTileBytesNegativeCache('pack/a.png');
    expect(await readTileBytes(fv.app, 'pack/a.png')).toMatchObject({ source: 'vault' });
  });

  it('negative-caches loose misses until cleared by path or prefix', async () => {
    expect(await readTileBytes(fv.app, 'tiles/late.png')).toMatchObject({ kind: 'not-found' });
    expect(await readTileBytes(fv.app, 'tiles/late.png')).toMatchObject({ kind: 'not-found' });
    expect(fv.existsCalls.filter(p => p === 'tiles/late.png')).toHaveLength(1);
    putFile(fv, 'tiles/late.png', fakeImage('png', 30));
    clearTileBytesNegativeCache('tiles');
    expect(await readTileBytes(fv.app, 'tiles/late.png')).toMatchObject({ source: 'vault' });
  });

  it('readTileBlob carries the mime', async () => {
    putFile(fv, 'tiles/c.png', fakeImage('png', 30));
    const blob = await readTileBlob(fv.app, 'tiles/c.png');
    expect(blob?.type).toBe('image/png');
    expect(blob?.size).toBe(30);
  });
});

describe('readTileThumbBlob', () => {
  async function bundleWithThumb(folder: string): Promise<{ thumb: Uint8Array }> {
    fv.folders.add(folder);
    const thumb = fakeImage('png', 24, 7);
    const w = new BundleWriter(fv.app, folder, { packId: 'p', name: 'P', mode: 'exact', targetShardBytes: 65536 });
    await w.add('t.png', fakeImage('png', 400, 1), 'image/png', 't', { w: 8, h: 8 }, thumb);
    await w.add('nothumb.png', fakeImage('png', 400, 2), 'image/png', 'n', { w: 8, h: 8 });
    await w.finish();
    await mountBundleFolder(fv.app, folder);
    return { thumb };
  }

  it('returns the thumb slice for a bundled entry that has one', async () => {
    const { thumb } = await bundleWithThumb('packs/th');
    const blob = await readTileThumbBlob(fv.app, 'packs/th/t.png');
    expect(blob).not.toBeNull();
    expect(blob?.type).toBe('image/png');
    expect(new Uint8Array(await (blob as Blob).arrayBuffer())).toEqual(thumb);
  });

  it('returns null without a thumb, for loose tiles, and when a loose file shadows the entry', async () => {
    await bundleWithThumb('packs/th');
    expect(await readTileThumbBlob(fv.app, 'packs/th/nothumb.png')).toBeNull();
    putFile(fv, 'tiles/loose.png', fakeImage('png', 30));
    fv.indexed.add('tiles/loose.png');
    expect(await readTileThumbBlob(fv.app, 'tiles/loose.png')).toBeNull();
    putFile(fv, 'packs/th/t.png', fakeImage('png', 30, 3));
    expect(await readTileThumbBlob(fv.app, 'packs/th/t.png')).toBeNull();
  });
});
