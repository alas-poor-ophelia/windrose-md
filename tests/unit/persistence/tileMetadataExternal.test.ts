// @vitest-environment happy-dom
// Wave-5 findings 1 and 2: external writers merge deltas into the shared
// store after their await, and a corrupt store file can never be overwritten
// (the 2026-07-30 wipe class).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  updateTileMetadata,
  ensureTileMetadataLoaded,
  getTileMetadataForRender,
  isTileMetadataLoaded,
  isTileMetadataCorrupt,
  commitTileMetadataDelta,
  mergeTileMetadataDelta,
  resetTileMetadataStore,
  toggleStar,
  bulkSetDepthAffinity,
  bulkSetDetectionSignals,
} from '../../../src/persistence/tileMetadata';
import type { TileMetadataStore } from '../../../types/tiles/tile.types';

const FILE = 'windrose-tile-metadata.json';

function makeApp(initial: string | null): { app: App; files: Map<string, string>; writes: () => number } {
  const files = new Map<string, string>();
  if (initial != null) files.set(FILE, initial);
  let writeCount = 0;
  const fileFor = (path: string): TFile | null => {
    if (!files.has(path)) return null;
    const f = new TFile();
    (f as unknown as { path: string }).path = path;
    return f;
  };
  const pathOf = (f: TFile): string => (f as unknown as { path: string }).path;
  const vault = {
    getAbstractFileByPath: (path: string) => fileFor(path),
    read: (f: TFile) => Promise.resolve(files.get(pathOf(f)) ?? ''),
    modify: (f: TFile, data: string) => { writeCount++; files.set(pathOf(f), data); return Promise.resolve(); },
    create: (path: string, data: string) => { writeCount++; files.set(path, data); return Promise.resolve(fileFor(path)); },
  };
  return { app: { vault } as unknown as App, files, writes: () => writeCount };
}

type Saved = Record<string, Record<string, unknown>>;
const onDisk = (files: Map<string, string>): Saved => JSON.parse(files.get(FILE) ?? '{}') as Saved;

describe('external tile-metadata writers (finding 1)', () => {
  beforeEach(() => { vi.useFakeTimers(); resetTileMetadataStore(); });
  afterEach(() => { resetTileMetadataStore(); vi.useRealTimers(); });

  it('a mutation committed during a slow scan survives the scan save', async () => {
    const { app, files } = makeApp(JSON.stringify({ 'a.png': { userTags: ['old'] } }));

    // External writer: snapshot, then a slow scan (an unresolved await).
    const base = await ensureTileMetadataLoaded(app);
    let finishScan: () => void = () => {};
    const scan = new Promise<void>(r => { finishScan = r; });
    const writer = (async () => {
      await scan;
      const next = bulkSetDetectionSignals(
        bulkSetDepthAffinity(base, [{ vaultPath: 'b.png', depth: 'ground' }]),
        [{ vaultPath: 'a.png', signals: { alphaCoverage: 1, opaqueW: 8, opaqueH: 8, naturalW: 8, naturalH: 8 } }],
      );
      return commitTileMetadataDelta(app, base, next);
    })();

    // Meanwhile the user stars a.png and c.png through the shared store.
    updateTileMetadata(app, s => toggleStar(s, 'a.png'));
    updateTileMetadata(app, s => toggleStar(s, 'c.png'));

    finishScan();
    expect(await writer).toBe(true);

    const mem = getTileMetadataForRender();
    expect(mem['a.png']).toMatchObject({ starred: true, userTags: ['old'], alphaCoverage: 1, srcW: 8 });
    expect(mem['c.png']?.starred).toBe(true);
    expect(mem['b.png']?.depthAffinity).toBe('ground');

    const disk = onDisk(files);
    expect(disk['a.png']).toMatchObject({ starred: true, alphaCoverage: 1 });
    expect(disk['c.png']?.starred).toBe(true);
    expect(disk['b.png']?.depthAffinity).toBe('ground');
  });

  it('mergeTileMetadataDelta applies removals and leaves untouched fields alone', () => {
    const base: TileMetadataStore = { 'a.png': { hexArt: 'flat', srcW: 4 } };
    const next: TileMetadataStore = { 'a.png': { srcW: 4 } };
    const live: TileMetadataStore = { 'a.png': { hexArt: 'flat', srcW: 4, starred: true } };
    expect(mergeTileMetadataDelta(live, base, next)).toEqual({ 'a.png': { srcW: 4, starred: true } });
    expect(mergeTileMetadataDelta(live, base, base)).toBe(live);
  });
});

describe('corrupt tile-metadata file (finding 2, the 2026-07-30 wipe class)', () => {
  beforeEach(() => { vi.useFakeTimers(); resetTileMetadataStore(); });
  afterEach(() => { resetTileMetadataStore(); vi.useRealTimers(); });

  it('corrupt at load: mutations refused, repair picked up on the next ensure, nothing overwritten', async () => {
    const library = { 'keep.png': { starred: true, depthAffinity: 'ground' } };
    const { app, files, writes } = makeApp('{ "keep.png": { "starred": tru');

    await ensureTileMetadataLoaded(app);
    expect(isTileMetadataLoaded()).toBe(false);
    expect(isTileMetadataCorrupt()).toBe(true);

    // The idle depth-prediction / detection-scan / a user star all try to write.
    updateTileMetadata(app, s => bulkSetDepthAffinity(s, [{ vaultPath: 'new.png', depth: 'props' }]));
    updateTileMetadata(app, s => toggleStar(s, 'other.png'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(await commitTileMetadataDelta(app, {}, { 'scan.png': { srcW: 1 } })).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes()).toBe(0);

    // The user repairs the file in-session (no vault event).
    files.set(FILE, JSON.stringify(library));
    await ensureTileMetadataLoaded(app);
    expect(isTileMetadataCorrupt()).toBe(false);
    expect(isTileMetadataLoaded()).toBe(true);
    expect(getTileMetadataForRender()).toEqual(library);

    // Nothing was overwritten, and no stale mutation replays over the repair.
    await vi.advanceTimersByTimeAsync(5000);
    expect(writes()).toBe(0);
    expect(onDisk(files)).toEqual(library);

    // Normal saving resumes and merges with the repaired library.
    updateTileMetadata(app, s => toggleStar(s, 'after.png'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(onDisk(files)).toEqual({ ...library, 'after.png': { starred: true } });
  });
});
