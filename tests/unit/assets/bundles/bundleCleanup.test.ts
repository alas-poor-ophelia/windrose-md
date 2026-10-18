/**
 * listBundleOrphans / cleanupBundleOrphans: only index, shard and thumb files
 * no mounted segment references are listed; only those older than the
 * threshold are trashed; referenced files never are.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeVault, putFile, fakeImage, markIndexed } from './fakeVault';
import type { FakeVault } from './fakeVault';

vi.mock('obsidian', async (importOriginal) => {
  const orig = await importOriginal<typeof import('obsidian')>();
  return { ...orig, Notice: class { constructor(_m: string) { /* silent */ } } };
});

const { listBundleOrphans, cleanupBundleOrphans, ORPHAN_MIN_AGE_MS } = await import('../../../../src/assets/bundles/bundleCleanup');
const { BundleWriter } = await import('../../../../src/assets/bundles/bundleWriter');
const { cleanupConfirmMessage, formatCleanupResult } = await import('../../../../src/settings/helpers/bundleStatus');
const reg = await import('../../../../src/assets/bundles/bundleRegistry');
const { deflateSync, strToU8 } = await import('fflate');

const FOLDER = 'Packs/Forest';
const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

const ORPHAN_INDEX = `${FOLDER}/index/00000000000000aa.wridx`;
const ORPHAN_SHARD = `${FOLDER}/shards/00000000000000bb.wrshard`;
const ORPHAN_THUMB = `${FOLDER}/thumbs/00000000000000cc.wrshard`;
const USER_IMAGE = `${FOLDER}/shards/notes.png`;

/** Mount a one-tile bundle, add orphans, and give every file an mtime. */
async function seed(fv: FakeVault, mtimes: Record<string, number>): Promise<string[]> {
  const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode: 'exact', targetShardBytes: 64 * 1024 });
  await w.add('Oak.png', fakeImage('png', 300, 1), 'image/png', 'Oak', { w: 64, h: 64 }, fakeImage('png', 40, 2));
  await w.finish();
  await reg.mountBundleFolder(fv.app, FOLDER);
  const referenced = [...fv.files.keys()].filter(k => /\.(wridx|wrshard)$/.test(k)).sort();
  putFile(fv, ORPHAN_INDEX, new Uint8Array(100));
  putFile(fv, ORPHAN_SHARD, new Uint8Array(2 * 1024 * 1024));
  putFile(fv, ORPHAN_THUMB, new Uint8Array(500));
  putFile(fv, USER_IMAGE, fakeImage('png', 50, 3));
  for (const k of fv.files.keys()) markIndexed(fv, k);
  const adapter = fv.app.vault.adapter as unknown as {
    stat: (p: string) => Promise<{ type: string; size: number; mtime: number } | null>;
  };
  const real = adapter.stat.bind(adapter);
  adapter.stat = async (p: string) => {
    const st = await real(p);
    return st == null ? null : { ...st, mtime: mtimes[p] ?? NOW - 30 * DAY };
  };
  return referenced;
}

describe('bundle orphan clean-up', () => {
  let fv: FakeVault;
  beforeEach(() => {
    reg._resetBundleRegistryForTests();
    fv = makeFakeVault();
  });

  it('lists exactly the unreferenced index, shard and thumb files with size and mtime', async () => {
    const referenced = await seed(fv, { [ORPHAN_THUMB]: NOW - DAY });
    expect(referenced.length).toBe(3);
    const orphans = await listBundleOrphans(fv.app, FOLDER);
    expect(orphans.map(o => o.path)).toEqual([ORPHAN_INDEX, ORPHAN_SHARD, ORPHAN_THUMB]);
    expect(orphans.find(o => o.path === ORPHAN_SHARD)).toEqual({ path: ORPHAN_SHARD, size: 2 * 1024 * 1024, mtime: NOW - 30 * DAY, ctime: 0 });
    expect(orphans.find(o => o.path === ORPHAN_THUMB)?.mtime).toBe(NOW - DAY);
  });

  it('trashes only orphans older than 7 days and never a referenced file', async () => {
    const referenced = await seed(fv, { [ORPHAN_THUMB]: NOW - DAY });
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { olderThanMs: ORPHAN_MIN_AGE_MS, now: NOW });
    expect(result.refused).toBeUndefined();
    expect(result.trashed.map(o => o.path)).toEqual([ORPHAN_INDEX, ORPHAN_SHARD]);
    expect(result.keptYoung.map(o => o.path)).toEqual([ORPHAN_THUMB]);
    expect(fv.trashed).toEqual([ORPHAN_INDEX, ORPHAN_SHARD]);
    for (const p of referenced) expect(fv.files.has(p)).toBe(true);
    expect(fv.files.has(ORPHAN_THUMB)).toBe(true);
    expect(fv.files.has(USER_IMAGE)).toBe(true);
    expect(reg.isBundleWriteInProgress(FOLDER)).toBe(false);
    expect(formatCleanupResult(result)).toBe(
      `Cleaned up ${FOLDER}: moved 2 unused bundle files (2.0 MB) to the trash. Kept 1 file younger than 7 days.`,
    );
  });

  it('lists nothing while a bundle write is in flight or when the folder is not mounted', async () => {
    await seed(fv, {});
    reg.beginBundleWrite(FOLDER);
    try {
      expect(await listBundleOrphans(fv.app, FOLDER)).toEqual([]);
      expect((await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW })).refused).toBeDefined();
    } finally {
      reg.endBundleWrite(FOLDER);
    }
    reg.unmountBundleFolder(FOLDER);
    expect(await listBundleOrphans(fv.app, FOLDER)).toEqual([]);
    expect(fv.trashed).toEqual([]);
  });

  it('builds the confirm sentence with count, size and the kept young files', () => {
    const old = [{ path: 'a', size: 1024 * 1024, mtime: 0, ctime: 0 }, { path: 'b', size: 1024 * 1024, mtime: 0, ctime: 0 }];
    const young = [{ path: 'c', size: 1024 * 1024, mtime: 0, ctime: 0 }];
    expect(cleanupConfirmMessage(old, young)).toBe(
      'Found 3 unused bundle files (3.0 MB). Move the ones older than 7 days to the trash? 1 of them is younger than 7 days and will be kept.',
    );
  });
  it('keeps shards whose index has not arrived yet while their ctime is young, even with an old synced mtime', async () => {
    await seed(fv, {});
    // Another device wrote these before its index; Sync kept the source mtime (30 days), ctime is recent.
    fv.times.set(ORPHAN_SHARD, { ctime: NOW - 60 * 60 * 1000 });
    fv.times.set(ORPHAN_THUMB, { ctime: NOW - 2 * DAY });
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
    expect(result.refused).toBeUndefined();
    expect(result.keptYoung.map(o => o.path)).toEqual([ORPHAN_SHARD, ORPHAN_THUMB]);
    expect(result.trashed.map(o => o.path)).toEqual([ORPHAN_INDEX]);
    expect(fv.files.has(ORPHAN_SHARD)).toBe(true);
    expect(fv.files.has(ORPHAN_THUMB)).toBe(true);
  });

  it('an index on disk the registry has not loaded protects its shards', async () => {
    await seed(fv, {});
    const before = new Set(fv.files.keys());
    const w = new BundleWriter(fv.app, FOLDER, { packId: 'forest', name: 'Forest', mode: 'exact', targetShardBytes: 64 * 1024 });
    await w.add('Birch.png', fakeImage('png', 320, 7), 'image/png', 'Birch', { w: 64, h: 64 }, fakeImage('png', 40, 8));
    await w.finish();
    const added = [...fv.files.keys()].filter(k => !before.has(k) && /\.(wridx|wrshard)$/.test(k));
    expect(added.some(k => k.endsWith('.wridx'))).toBe(true);
    for (const k of added) markIndexed(fv, k);
    // The registry still holds the one-segment record from seed().
    const listed = (await listBundleOrphans(fv.app, FOLDER)).map(o => o.path);
    for (const k of added) expect(listed).not.toContain(k);
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
    expect(result.refused).toBeUndefined();
    for (const k of added) expect(fv.files.has(k)).toBe(true);
    expect(result.trashed.map(o => o.path)).toEqual([ORPHAN_INDEX, ORPHAN_SHARD, ORPHAN_THUMB]);
  });

  it('trashes an index that does not parse once it is older than 7 days, after a forced remount', async () => {
    await seed(fv, {});
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
    // The forced remount sees the corrupt index as a bad segment; that alone does not block the clean-up.
    expect(result.refused).toBeUndefined();
    expect(result.trashed.map(o => o.path)).toContain(ORPHAN_INDEX);
    expect(fv.files.has(ORPHAN_INDEX)).toBe(false);
  });

  it('refuses the whole clean-up when the fresh mount finds a damaged shard', async () => {
    const referenced = await seed(fv, {});
    const shard = referenced.find(p => p.includes('/shards/')) as string;
    fv.files.set(shard, new Uint8Array(10));
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
    expect(result.refused).toContain('not a fully readable tile bundle');
    expect(fv.trashed).toEqual([]);
  });
  /** A deflated index segment JSON (any shape; for newer-version and late-arrival cases). */
  function rawSegment(fields: Record<string, unknown>): Uint8Array {
    return deflateSync(strToU8(JSON.stringify({
      format: 'windrose-tiles', major: 1, minor: 0, packId: 'forest', createdAt: '2026-10-15T00:00:00Z', mode: 'exact',
      shards: [], entries: {}, ...fields,
    })));
  }

  for (const [label, fields] of [['a newer major version', { major: 2 }], ['an unknown mode', { mode: 'lossy' }]] as const) {
    it(`refuses the whole clean-up and trashes nothing when an index has ${label}`, async () => {
      await seed(fv, {});
      const newer = `${FOLDER}/index/00000000000000dd.wridx`;
      putFile(fv, newer, rawSegment({ ...fields, shards: [{ name: '00000000000000bb.wrshard', size: 2 * 1024 * 1024 }] }));
      markIndexed(fv, newer);
      const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
      expect(result.refused).toBe(`Clean up skipped: ${FOLDER} has bundle files from a newer version of the plugin.`);
      expect(fv.trashed).toEqual([]);
      expect(fv.files.has(newer)).toBe(true);
      expect(await listBundleOrphans(fv.app, FOLDER)).toEqual([]);
    });
  }

  it('stops before trashing when an index referencing the orphan arrives after the scan', async () => {
    await seed(fv, {});
    const late = `${FOLDER}/index/00000000000000ee.wridx`;
    const adapter = fv.app.vault.adapter as unknown as { stat: (p: string) => Promise<unknown> };
    const prevStat = adapter.stat.bind(adapter);
    adapter.stat = async (p: string) => {
      // The orphan listing stats each candidate; the late index lands right after.
      if (p === ORPHAN_THUMB && !fv.files.has(late)) {
        putFile(fv, late, rawSegment({ shards: [{ name: '00000000000000bb.wrshard', size: 2 * 1024 * 1024 }] }));
        markIndexed(fv, late);
      }
      return prevStat(p);
    };
    const result = await cleanupBundleOrphans(fv.app, FOLDER, { now: NOW });
    expect(result.refused).toBeUndefined();
    expect(result.stopped).toBe(true);
    expect(fv.files.has(ORPHAN_SHARD)).toBe(true);
    expect(fv.files.has(late)).toBe(true);
    expect(fv.trashed).toEqual([]);
    expect(formatCleanupResult(result)).toContain('Stopped early because new bundle files arrived during the clean-up; run it again later.');
  });
});
