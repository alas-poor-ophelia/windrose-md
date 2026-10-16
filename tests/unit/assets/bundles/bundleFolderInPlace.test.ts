/**
 * bundleFolderInPlace: a loose tileset folder becomes a bundle in the SAME
 * folder (same tileset path, same tile ids), and the loose files are trashed
 * only after a byte-identical read-back from the bundle.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeVault, putFile, fakeImage, markIndexed } from './fakeVault';
import type { FakeVault } from './fakeVault';

const notices: string[] = [];

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return {
    ...orig,
    Notice: class {
      constructor(message: string) { notices.push(message); }
    },
  };
});
vi.mock('../../../../src/assets/bundles/bundleThumbs', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../../../../src/assets/bundles/bundleThumbs')>();
  const { fakeImage: img } = await import('./fakeVault');
  const thumb = img('png', 40, 99);
  return {
    ...orig,
    decodeTile: () => Promise.resolve({ dims: { w: 128, h: 128 }, thumb }),
  };
});

const { bundleFolderInPlace } = await import('../../../../src/assets/bundles/bundleFolderInPlace');
const { scanTilesetFolder } = await import('../../../../src/assets/tilesetScan');
const { _resetBundleRegistryForTests, entriesFor, getBundleState, isBundleWriteInProgress } =
  await import('../../../../src/assets/bundles/bundleRegistry');
const { clearTileBytesNegativeCache } = await import('../../../../src/assets/tileBytes');

const FOLDER = 'Assets/Hex Samples';
const LOOSE: Array<[string, Uint8Array]> = [
  [`${FOLDER}/forest/Oak.png`, fakeImage('png', 300, 1)],
  [`${FOLDER}/forest/Pine.webp`, fakeImage('webp', 260, 2)],
  [`${FOLDER}/Plains.png`, fakeImage('png', 220, 3)],
];

function seed(fv: FakeVault): void {
  for (const [path, bytes] of LOOSE) {
    putFile(fv, path, bytes);
    markIndexed(fv, path);
  }
  markIndexed(fv, `${FOLDER}/forest`);
}

function filesUnder(fv: FakeVault, prefix: string): string[] {
  return [...fv.files.keys()].filter(k => k.startsWith(prefix + '/')).sort();
}

describe('bundleFolderInPlace', () => {
  let fv: FakeVault;
  beforeEach(() => {
    _resetBundleRegistryForTests();
    clearTileBytesNegativeCache();
    notices.length = 0;
    fv = makeFakeVault();
    seed(fv);
  });

  it('bundles a loose folder into itself and trashes every loose file after read-back', async () => {
    const before = await scanTilesetFolder(fv.app, FOLDER);
    const progress: number[] = [];
    const result = await bundleFolderInPlace(fv.app, FOLDER, { onProgress: done => progress.push(done) });

    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.folder).toBe(FOLDER);
    expect(result.bundled).toBe(3);
    expect(result.replaced).toBe(3);
    expect(result.kept).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.shards).toBeGreaterThan(0);
    expect(progress).toEqual([1, 2, 3]);

    const left = filesUnder(fv, FOLDER);
    expect(left).toContain(`${FOLDER}/bundle.wrbundle`);
    expect(left.some(f => f.startsWith(`${FOLDER}/index/`) && f.endsWith('.wridx'))).toBe(true);
    expect(left.some(f => f.startsWith(`${FOLDER}/shards/`) && f.endsWith('.wrshard'))).toBe(true);
    expect(left.some(f => f.startsWith(`${FOLDER}/thumbs/`) && f.endsWith('.wrshard'))).toBe(true);
    expect(left.some(f => /\.(png|webp)$/.test(f))).toBe(false);
    for (const [path, bytes] of LOOSE) {
      expect(fv.trashed).toContain(path);
      expect(fv.files.get(`.trash/${path}`)).toEqual(bytes);
    }
    // Nothing written next to the folder.
    expect([...fv.files.keys()].some(k => k.startsWith(`${FOLDER} (bundled)`))).toBe(false);

    expect(getBundleState(FOLDER)).toBe('mounted');
    expect(isBundleWriteInProgress(FOLDER)).toBe(false);
    const after = await scanTilesetFolder(fv.app, FOLDER);
    const ids = (tiles: typeof before) => tiles.map(t => `${t.id}|${t.vaultPath}`).sort();
    expect(ids(after)).toEqual(ids(before));
  });

  it('refuses a folder that already holds an index and writes nothing', async () => {
    putFile(fv, `${FOLDER}/index/0123456789abcdef.wridx`, new Uint8Array([1, 2, 3]));
    const filesBefore = filesUnder(fv, FOLDER);
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('refused');
    if (result.status !== 'refused') return;
    expect(result.reason).toBe('has-index');
    expect(result.message).toContain('already a tile bundle');
    expect(filesUnder(fv, FOLDER)).toEqual(filesBefore);
    expect(fv.trashed).toEqual([]);
  });

  it('keeps a loose file whose bytes the bundle does not serve', async () => {
    const [changedPath] = LOOSE[0];
    // Swap the bytes on disk between the bundle write and the read-back gate.
    const original = fv.app.vault.adapter.list.bind(fv.app.vault.adapter);
    let swapped = false;
    fv.app.vault.adapter.list = async (p: string) => {
      if (!swapped && fv.files.has(`${FOLDER}/bundle.wrbundle`) && [...fv.files.keys()].some(k => k.endsWith('.wridx'))) {
        swapped = true;
        fv.files.set(changedPath, fakeImage('png', 300, 42));
      }
      return original(p);
    };
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.replaced).toBe(2);
    expect(result.kept).toEqual([{ path: 'forest/Oak.png', reason: 'differs' }]);
    expect(fv.files.has(changedPath)).toBe(true);
    expect(fv.trashed).not.toContain(changedPath);
  });

  it("keeps every loose file when the trash setting is 'none'", async () => {
    fv.config.trashOption = 'none';
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.bundled).toBe(3);
    expect(result.replaced).toBe(0);
    expect(result.keptPermanentDelete).toBe(3);
    expect(fv.trashed).toEqual([]);
    for (const [path] of LOOSE) expect(fv.files.has(path)).toBe(true);
    expect(entriesFor(FOLDER).entries).toHaveLength(3);
  });

  it('refuses a second run on the same folder while one is in flight', async () => {
    const first = bundleFolderInPlace(fv.app, FOLDER);
    const second = await bundleFolderInPlace(fv.app, FOLDER);
    expect(second.status).toBe('refused');
    if (second.status === 'refused') expect(second.reason).toBe('in-progress');
    expect((await first).status).toBe('done');
  });

  it('keeps ids for a rock.png + rock.webp stem collision before and after', async () => {
    putFile(fv, `${FOLDER}/rock.png`, fakeImage('png', 150, 7));
    putFile(fv, `${FOLDER}/rock.webp`, fakeImage('webp', 160, 8));
    markIndexed(fv, `${FOLDER}/rock.png`);
    markIndexed(fv, `${FOLDER}/rock.webp`);
    const before = await scanTilesetFolder(fv.app, FOLDER);
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.bundled).toBe(5);
    expect(result.replaced).toBe(5);
    const after = await scanTilesetFolder(fv.app, FOLDER);
    const ids = (tiles: typeof before) => tiles.map(t => `${t.id}|${t.vaultPath}`).sort();
    expect(ids(after)).toEqual(ids(before));
  });

  it('bundles and retires an image subfolder named thumbs', async () => {
    putFile(fv, `${FOLDER}/thumbs/x.png`, fakeImage('png', 180, 9));
    markIndexed(fv, `${FOLDER}/thumbs/x.png`);
    markIndexed(fv, `${FOLDER}/thumbs`);
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.bundled).toBe(4);
    expect(result.replaced).toBe(4);
    expect(fv.trashed).toContain(`${FOLDER}/thumbs/x.png`);
    expect(fv.files.has(`${FOLDER}/thumbs/x.png`)).toBe(false);
    expect(entriesFor(FOLDER).entries).toHaveLength(4);
  });

  it('resumes an interrupted run (marker and a shard, no index) to a mounted bundle', async () => {
    await bundleFolderInPlace(fv.app, FOLDER);
    // Simulate the interruption: drop the index and restore the loose files.
    for (const k of [...fv.files.keys()]) if (k.startsWith(`${FOLDER}/index/`)) fv.files.delete(k);
    for (const [path, bytes] of LOOSE) { putFile(fv, path, bytes); markIndexed(fv, path); }
    fv.trashed.length = 0;
    _resetBundleRegistryForTests();
    const second = await bundleFolderInPlace(fv.app, FOLDER);
    expect(second.status).toBe('done');
    if (second.status !== 'done') return;
    expect(second.bundled).toBe(3);
    expect(second.replaced).toBe(3);
    expect(getBundleState(FOLDER)).toBe('mounted');
    for (const [path] of LOOSE) expect(fv.files.has(path)).toBe(false);
  });

  it('keeps a file whose trash fails and reports it', async () => {
    const [stuck] = LOOSE[2];
    fv.trashFails.add(stuck);
    const result = await bundleFolderInPlace(fv.app, FOLDER);
    expect(result.status).toBe('done');
    if (result.status !== 'done') return;
    expect(result.replaced).toBe(2);
    expect(result.kept).toEqual([{ path: 'Plains.png', reason: 'trash-failed' }]);
    expect(fv.files.has(stuck)).toBe(true);
  });
});
