/**
 * unbundleFolder: every served entry is written back loose at <folder>/<key>,
 * read back and verified; only then are the bundle files trashed and the
 * folder unmounted. A conflicting existing file keeps the whole bundle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeVault, putFile, fakeImage, markIndexed } from './fakeVault';
import type { FakeVault } from './fakeVault';

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return { ...orig, Notice: class { constructor(_m: string) { /* silent */ } } };
});

const { unbundleFolder } = await import('../../../../src/assets/bundles/bundleUnbundle');
const { BundleWriter } = await import('../../../../src/assets/bundles/bundleWriter');
const { scanTilesetFolder, _resetBundleNoticesForTests } = await import('../../../../src/assets/tilesetScan');
const { clearTileBytesNegativeCache } = await import('../../../../src/assets/tileBytes');
const { formatUnbundleResult, unbundleConfirmMessage } = await import('../../../../src/settings/helpers/bundleStatus');
const reg = await import('../../../../src/assets/bundles/bundleRegistry');

const FOLDER = 'Packs/Forest';

interface Tile { key: string; id: string; bytes: Uint8Array }
const TILES: Tile[] = [
  { key: 'Plains.png', id: 'Plains', bytes: fakeImage('png', 300, 1) },
  { key: 'forest/Oak.png', id: 'forest/Oak', bytes: fakeImage('png', 400, 2) },
  { key: 'forest/deep/Pine.webp', id: 'forest/deep/Pine', bytes: fakeImage('webp', 350, 3) },
];

async function seed(fv: FakeVault, mode: 'exact' | 'compact' = 'exact'): Promise<void> {
  const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode, targetShardBytes: 64 * 1024 });
  for (const t of TILES) {
    const mime = t.key.endsWith('.webp') ? 'image/webp' : 'image/png';
    await w.add(t.key, t.bytes, mime, t.id, { w: 64, h: 64 }, fakeImage('png', 40, 9));
  }
  await w.finish();
  for (const k of fv.files.keys()) if (k.startsWith(FOLDER + '/')) markIndexed(fv, k);
  for (const d of fv.folders) if (d.startsWith(FOLDER + '/')) markIndexed(fv, d);
  await reg.mountBundleFolder(fv.app, FOLDER);
}

function bundleFiles(fv: FakeVault): string[] {
  return [...fv.files.keys()].filter(k => k.startsWith(FOLDER + '/') && /\.(wridx|wrshard|wrbundle)$/.test(k)).sort();
}

const ids = (tiles: Array<{ id: string; vaultPath: string }>): string[] => tiles.map(t => `${t.id}|${t.vaultPath}`).sort();

describe('unbundleFolder', () => {
  let fv: FakeVault;
  beforeEach(() => {
    reg._resetBundleRegistryForTests();
    _resetBundleNoticesForTests();
    clearTileBytesNegativeCache();
    fv = makeFakeVault();
    fv.config.trashOption = 'local';
  });

  it('exports and verifies every file, trashes the bundle files, and the scan yields the same ids', async () => {
    await seed(fv);
    const before = await scanTilesetFolder(fv.app, FOLDER);
    const bundleBefore = bundleFiles(fv);
    expect(bundleBefore.length).toBeGreaterThanOrEqual(3);
    const progress: number[] = [];

    const result = await unbundleFolder(fv.app, FOLDER, { onProgress: d => progress.push(d) });

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ total: 3, written: 3, identical: 0, conflicts: [], failed: [], retired: true, compact: false, idMismatches: [] });
    expect(progress).toEqual([1, 2, 3]);
    for (const t of TILES) expect(fv.files.get(`${FOLDER}/${t.key}`)).toEqual(t.bytes);
    expect(bundleFiles(fv)).toEqual([]);
    for (const f of bundleBefore) expect(fv.files.has(`.trash/${f}`)).toBe(true);
    // Index files go first (the commit points), the marker last.
    const order = fv.trashed.filter(p => /\.(wridx|wrshard|wrbundle)$/.test(p));
    expect(order[0]).toMatch(/\.wridx$/);
    expect(order[order.length - 1]).toBe(`${FOLDER}/bundle.wrbundle`);
    expect(reg.getBundleStateInfo(FOLDER)).toBeNull();
    expect(reg.isBundleWriteInProgress(FOLDER)).toBe(false);
    expect(formatUnbundleResult(result)).toBe(`Unbundled ${FOLDER}: 3 files written, bundle files moved to the trash.`);

    for (const k of fv.files.keys()) if (k.startsWith(FOLDER + '/')) markIndexed(fv, k);
    const after = await scanTilesetFolder(fv.app, FOLDER);
    expect(reg.getBundleState(FOLDER)).toBe('loose');
    expect(ids(after)).toEqual(ids(before));
    expect(ids(after)).toEqual(TILES.map(t => `${t.id}|${FOLDER}/${t.key}`).sort());
  });

  it('sweeps a shard no index lists once the last index is gone', async () => {
    await seed(fv);
    const orphan = `${FOLDER}/shards/0000000000000000.wrshard`;
    putFile(fv, orphan, new Uint8Array(32));
    markIndexed(fv, orphan);

    const result = await unbundleFolder(fv.app, FOLDER);

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.retired).toBe(true);
    expect(fv.files.has(orphan)).toBe(false);
    expect(fv.files.has(`.trash/${orphan}`)).toBe(true);
    expect(bundleFiles(fv)).toEqual([]);
    expect(reg.getBundleStateInfo(FOLDER)).toBeNull();
  });

  it('keeps a conflicting existing file and does NOT delete the bundle', async () => {
    await seed(fv);
    const mine = fakeImage('png', 500, 42);
    putFile(fv, `${FOLDER}/forest/Oak.png`, mine);
    putFile(fv, `${FOLDER}/Plains.png`, TILES[0].bytes);
    const bundleBefore = bundleFiles(fv);

    const result = await unbundleFolder(fv.app, FOLDER);

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ written: 1, identical: 1, conflicts: ['forest/Oak.png'], retired: false, keptPermanentDelete: false });
    expect(fv.files.get(`${FOLDER}/forest/Oak.png`)).toEqual(mine);
    expect(fv.files.get(`${FOLDER}/forest/deep/Pine.webp`)).toEqual(TILES[2].bytes);
    expect(bundleFiles(fv)).toEqual(bundleBefore);
    expect(fv.trashed).toEqual([]);
    expect(reg.getBundleState(FOLDER)).toBe('mounted');
    const text = formatUnbundleResult(result);
    expect(text).toContain('Kept 1 conflicting file (see developer console).');
    expect(text).toContain('bundle files kept.');
  });

  it("exports but keeps the bundle files when the trash setting is 'none'", async () => {
    await seed(fv);
    fv.config.trashOption = 'none';
    const bundleBefore = bundleFiles(fv);

    const result = await unbundleFolder(fv.app, FOLDER);

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ written: 3, retired: false, keptPermanentDelete: true });
    for (const t of TILES) expect(fv.files.get(`${FOLDER}/${t.key}`)).toEqual(t.bytes);
    expect(bundleFiles(fv)).toEqual(bundleBefore);
    expect(fv.trashed).toEqual([]);
    expect(formatUnbundleResult(result)).toBe(
      `Unbundled ${FOLDER}: 3 files written. The bundle files were left in place because your trash setting deletes files permanently. ` +
      "When the loose files look right, delete the folder's bundle.wrbundle file and its index, shards and thumbs folders.",
    );
  });

  it('says the exported files of a compact bundle are the re-encoded copies', async () => {
    await seed(fv, 'compact');
    expect(unbundleConfirmMessage(3, true)).toBe(
      'Write the 3 images of this bundle back as loose files and move the bundle files to the trash? ' +
      'This bundle is compact: the files will be the re-encoded copies, not the original pack images.',
    );
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.compact).toBe(true);
    expect(formatUnbundleResult(result)).toContain('The exported files are the re-encoded copies, not the original pack images.');
  });

  it('refuses a partial bundle and writes nothing', async () => {
    await seed(fv);
    const shard = bundleFiles(fv).find(p => p.includes('/shards/')) as string;
    fv.files.set(shard, new Uint8Array(10));
    await reg.mountBundleFolder(fv.app, FOLDER);
    expect(reg.getBundleState(FOLDER)).toBe('partial');
    const filesBefore = [...fv.files.keys()].sort();

    const result = await unbundleFolder(fv.app, FOLDER);

    expect(result.status).toBe('refused');
    if (result.status !== 'refused') return;
    expect(result.message).toContain('not a fully readable tile bundle');
    expect([...fv.files.keys()].sort()).toEqual(filesBefore);
  });

  it('keeps the bundle when an index segment arrives during the run', async () => {
    await seed(fv);
    const late = `${FOLDER}/index/00000000000000ff.wridx`;
    const result = await unbundleFolder(fv.app, FOLDER, {
      onProgress: (d, total) => { if (d === total) putFile(fv, late, new Uint8Array(64)); },
    });
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ written: 3, retired: false, newSegment: true });
    expect(fv.trashed).toEqual([]);
    expect(formatUnbundleResult(result)).toContain('unbundle again to export them');
  });

  it('refuses a folder that is not mounted', async () => {
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('refused');
  });

  it('removes a written file that does not read back identical and keeps the bundle', async () => {
    await seed(fv);
    const adapter = fv.app.vault.adapter as unknown as { readBinary: (p: string) => Promise<ArrayBuffer> };
    const real = adapter.readBinary.bind(adapter);
    adapter.readBinary = async (p: string) => {
      const buf = await real(p);
      if (p === `${FOLDER}/Plains.png`) new Uint8Array(buf)[20] ^= 0xff;
      return buf;
    };
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.failed).toEqual([{ key: 'Plains.png', reason: 'did not read back identical' }]);
    expect(result.written).toBe(2);
    expect(result.retired).toBe(false);
    expect(fv.files.has(`${FOLDER}/Plains.png`)).toBe(false);
    expect(reg.getBundleState(FOLDER)).toBe('mounted');
  });
  async function seedTiles(tiles: Tile[]): Promise<void> {
    const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode: 'exact', targetShardBytes: 64 * 1024 });
    for (const t of tiles) await w.add(t.key, t.bytes, 'image/png', t.id, { w: 64, h: 64 }, fakeImage('png', 40, 9));
    await w.finish();
    for (const k of fv.files.keys()) if (k.startsWith(FOLDER + '/')) markIndexed(fv, k);
    await reg.mountBundleFolder(fv.app, FOLDER);
  }

  it('keeps the bundle when a stem collision would mint the ids in the other order', async () => {
    // Stored: rock.webp owns the stem; the loose walk lists rock.png first and would give it "rock".
    await seedTiles([
      { key: 'rock.png', id: 'rock.png', bytes: fakeImage('png', 300, 1) },
      { key: 'rock.webp', id: 'rock', bytes: fakeImage('webp', 300, 2) },
    ]);
    const bundleBefore = bundleFiles(fv);
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ written: 2, retired: false, idMismatches: ['rock.png', 'rock.webp'] });
    expect(bundleFiles(fv)).toEqual(bundleBefore);
    expect(fv.trashed).toEqual([]);
    expect(reg.getBundleState(FOLDER)).toBe('mounted');
    expect(formatUnbundleResult(result)).toBe(
      `Unbundled ${FOLDER}: 2 files written. Kept the bundle: 2 tiles would get different ids as loose files (see developer console).`,
    );
  });

  it('keeps the bundle when a served key has an extension the loose scan does not list', async () => {
    await seedTiles([
      { key: 'Plains.png', id: 'Plains', bytes: fakeImage('png', 300, 1) },
      { key: 'Tree.tif', id: 'Tree', bytes: fakeImage('png', 300, 2) },
    ]);
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ retired: false, idMismatches: ['Tree.tif'] });
    expect(fv.trashed).toEqual([]);
  });

  it('removes a truncated file a failed write left behind and keeps the bundle', async () => {
    await seed(fv);
    const vault = fv.app.vault as unknown as { createBinary: (p: string, d: ArrayBuffer) => Promise<void> };
    const real = vault.createBinary.bind(vault);
    vault.createBinary = async (p: string, d: ArrayBuffer) => {
      if (p !== `${FOLDER}/Plains.png`) return real(p, d);
      fv.files.set(p, new Uint8Array(d.slice(0, 10)));
      throw new Error('ENOSPC');
    };
    const bundleBefore = bundleFiles(fv);
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.failed).toEqual([{ key: 'Plains.png', reason: 'write failed (ENOSPC)' }]);
    expect(result).toMatchObject({ written: 2, retired: false });
    expect(fv.files.has(`${FOLDER}/Plains.png`)).toBe(false);
    expect(bundleFiles(fv)).toEqual(bundleBefore);
    expect(fv.trashed).toEqual([]);
  });

  it('leaves an index segment that arrives while retiring, every shard and the marker untouched', async () => {
    await seed(fv);
    const late = `${FOLDER}/index/00000000000000ff.wridx`;
    const shardsBefore = bundleFiles(fv).filter(p => p.endsWith('.wrshard'));
    fv.trashHook = (path) => { if (path.endsWith('.wridx') && !fv.files.has(late)) putFile(fv, late, new Uint8Array(64)); };
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result).toMatchObject({ retired: false, newSegment: true, trashFailed: 0 });
    expect(fv.files.has(late)).toBe(true);
    for (const p of shardsBefore) expect(fv.files.has(p)).toBe(true);
    expect(fv.files.has(`${FOLDER}/bundle.wrbundle`)).toBe(true);
    expect(fv.trashed.every(p => p.endsWith('.wridx'))).toBe(true);
  });
  it('never removes a file that appeared between the exists check and the write', async () => {
    await seed(fv);
    const theirs = fakeImage('png', 120, 77);
    const vault = fv.app.vault as unknown as { createBinary: (p: string, d: ArrayBuffer) => Promise<void> };
    const real = vault.createBinary.bind(vault);
    vault.createBinary = async (p: string, d: ArrayBuffer) => {
      if (p !== `${FOLDER}/Plains.png`) return real(p, d);
      fv.files.set(p, theirs); // Sync or the user, in the gap; smaller than ours.
      throw new Error('File already exists.');
    };
    const bundleBefore = bundleFiles(fv);
    const result = await unbundleFolder(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.failed).toEqual([{ key: 'Plains.png', reason: 'write failed (File already exists.)' }]);
    expect(result.retired).toBe(false);
    expect(fv.files.get(`${FOLDER}/Plains.png`)).toEqual(theirs);
    expect(bundleFiles(fv)).toEqual(bundleBefore);
    expect(fv.trashed).toEqual([]);
  });
});
