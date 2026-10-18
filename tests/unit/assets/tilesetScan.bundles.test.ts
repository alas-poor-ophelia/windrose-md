import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const notices = vi.hoisted(() => [] as string[]);
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Notice: vi.fn(function (this: unknown, message: string) { notices.push(message); }),
  };
});

import { BundleWriter } from '../../../src/assets/bundles/bundleWriter';
import {
  _resetBundleRegistryForTests, getBundleState, beginBundleWrite, endBundleWrite,
} from '../../../src/assets/bundles/bundleRegistry';
import { _resetBundleNoticesForTests, scanTilesetFolder } from '../../../src/assets/tilesetScan';
import { fakeImage, makeFakeVault, putFile } from './bundles/fakeVault';
import type { FakeVault } from './bundles/fakeVault';

const FOLDER = 'packs/mixed';

async function writeBundle(fv: FakeVault, tiles: { key: string; id: string }[]) {
  const w = new BundleWriter(fv.app, FOLDER, {
    packId: 'mixed', name: 'Mixed', mode: 'exact', targetShardBytes: 256,
  });
  for (const [i, t] of tiles.entries()) {
    await w.add(t.key, fakeImage('png', 64 + i, i + 1), 'image/png', t.id, { w: 8, h: 8 });
  }
  return w.finish();
}

let fv: FakeVault;
let warn: { mock: { calls: unknown[][] }; mockRestore(): void };
beforeEach(() => {
  _resetBundleRegistryForTests();
  _resetBundleNoticesForTests();
  notices.length = 0;
  fv = makeFakeVault();
  fv.folders.add('packs');
  fv.folders.add(FOLDER);
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

async function mixedFolder(): Promise<void> {
  await writeBundle(fv, [
    { key: 'walls/a.png', id: 'stored-walls-a' },
    { key: 'floors/c.jpg', id: 'floors/c' }, // the stem a loose mint would want
    { key: 'top.png', id: 'stored-top' },
  ]);
  // Loose file at a bundled key (loose wins) and loose files beside the bundle.
  putFile(fv, `${FOLDER}/walls/a.png`, fakeImage('png', 50, 9));
  putFile(fv, `${FOLDER}/floors/c.png`, fakeImage('png', 50, 10));
  putFile(fv, `${FOLDER}/props/barrel.webp`, fakeImage('webp', 50, 11));
}

describe('scanTilesetFolder with a tile bundle', () => {
  it('preserves bundle ids verbatim and derives categories/tags from the key', async () => {
    await mixedFolder();
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    expect(getBundleState(FOLDER)).toBe('mounted');
    const top = tiles.find(t => t.vaultPath === `${FOLDER}/top.png`);
    expect(top).toMatchObject({ id: 'stored-top', filename: 'top.png', category: undefined, tags: undefined });
    const c = tiles.find(t => t.vaultPath === `${FOLDER}/floors/c.jpg`);
    expect(c).toMatchObject({ id: 'floors/c', filename: 'c.jpg', category: 'floors', tags: ['floors'] });
  });

  it('a loose file at the same key replaces the bundle entry in place', async () => {
    await mixedFolder();
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    const walls = tiles.filter(t => t.vaultPath === `${FOLDER}/walls/a.png`);
    expect(walls).toHaveLength(1);
    expect(walls[0].id).toBe('stored-walls-a');
    expect(tiles.indexOf(walls[0])).toBeLessThan(3); // still in the bundle block
    expect(tiles).toHaveLength(5);
  });

  it('loose id minting does not collide with bundle ids', async () => {
    await mixedFolder();
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    const ids = tiles.map(t => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const looseC = tiles.find(t => t.vaultPath === `${FOLDER}/floors/c.png`);
    expect(looseC?.id).toBe('floors/c.png');
    expect(tiles.find(t => t.vaultPath === `${FOLDER}/props/barrel.webp`)?.id).toBe('props/barrel');
  });

  it('order is stable across two scans', async () => {
    await mixedFolder();
    const first = await scanTilesetFolder(fv.app, FOLDER);
    const second = await scanTilesetFolder(fv.app, FOLDER);
    expect(second.map(t => [t.id, t.vaultPath])).toEqual(first.map(t => [t.id, t.vaultPath]));
  });

  it('corrupt bundle -> loose entries only, state reported, one notice per folder', async () => {
    await mixedFolder();
    for (const p of [...fv.files.keys()]) {
      if (p.endsWith('.wridx')) fv.files.set(p, new Uint8Array([1, 2, 3, 4]));
    }
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    expect(getBundleState(FOLDER)).toBe('unmounted-corrupt');
    expect(tiles.map(t => t.vaultPath).sort()).toEqual([
      `${FOLDER}/floors/c.png`, `${FOLDER}/props/barrel.webp`, `${FOLDER}/walls/a.png`,
    ]);
    await scanTilesetFolder(fv.app, FOLDER);
    const notices = warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('[tilesetScan]'));
    expect(notices).toHaveLength(1);
  });

  it('index-missing stays silent while an import writes the folder, then reads as an unfinished import', async () => {
    await mixedFolder();
    for (const p of [...fv.files.keys()]) if (p.endsWith('.wridx')) fv.files.delete(p);
    beginBundleWrite(FOLDER);
    await scanTilesetFolder(fv.app, FOLDER);
    expect(getBundleState(FOLDER)).toBe('not-on-device');
    expect(notices).toEqual([]);
    endBundleWrite(FOLDER);
    await scanTilesetFolder(fv.app, FOLDER);
    expect(notices).toEqual([`Tile bundle in ${FOLDER} is incomplete (bundling did not finish).`]);
  });

  it('a folder with no bundle scans exactly as before', async () => {
    putFile(fv, `${FOLDER}/a.png`, fakeImage('png', 40, 1));
    putFile(fv, `${FOLDER}/sub/a.png`, fakeImage('png', 40, 2));
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    expect(getBundleState(FOLDER)).toBe('loose');
    expect(tiles.map(t => t.id).sort()).toEqual(['a', 'sub/a']);
  });

  it('an absent folder is silent: no notice, no warning, zero tiles', async () => {
    const tiles = await scanTilesetFolder(fv.app, 'packs/gone');
    expect(tiles).toEqual([]);
    expect(notices).toEqual([]);
    expect(warn.mock.calls).toHaveLength(0);
  });

  it('a plain loose folder raises no notice or warning', async () => {
    putFile(fv, `${FOLDER}/a.png`, fakeImage('png', 40, 1));
    await scanTilesetFolder(fv.app, FOLDER);
    await scanTilesetFolder(fv.app, FOLDER);
    expect(notices).toEqual([]);
    expect(warn.mock.calls).toHaveLength(0);
  });

  it('two consecutive scans of a mounted folder mount once', async () => {
    await mixedFolder();
    const markerReads = (): number => fv.reads.filter(r => r === `${FOLDER}/bundle.wrbundle`).length;
    await scanTilesetFolder(fv.app, FOLDER);
    const afterFirst = markerReads();
    expect(afterFirst).toBe(1);
    await scanTilesetFolder(fv.app, FOLDER);
    expect(markerReads()).toBe(afterFirst);
  });

  it('duplicate stored ids keep the first entry and notice once per folder', async () => {
    // The writer refuses a repeated id within one run, so the duplicate
    // arrives as a second index segment (two imports into one folder).
    await writeBundle(fv, [{ key: 'a.png', id: 'dup' }, { key: 'c.png', id: 'unique' }]);
    const w2 = new BundleWriter(fv.app, FOLDER, {
      packId: 'mixed', name: 'Mixed', mode: 'exact', targetShardBytes: 256,
    });
    await w2.add('b.png', fakeImage('png', 90, 7), 'image/png', 'dup', { w: 8, h: 8 });
    await w2.finish();
    const tiles = await scanTilesetFolder(fv.app, FOLDER);
    expect(tiles.filter(t => t.id === 'dup')).toHaveLength(1);
    expect(tiles.map(t => t.id).sort()).toEqual(['dup', 'unique']);
    await scanTilesetFolder(fv.app, FOLDER);
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('"dup"');
    expect(notices[0]).toContain(FOLDER);
  });
});
