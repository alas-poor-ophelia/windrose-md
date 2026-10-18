/**
 * Byte oracle (H-1082, design section 12 item 3 and section 2.2 invariant 2).
 *
 * A classic map (no `lod` block) must serialise byte-identically whether the
 * lattice ladder capability is on or off, across load, edit and save, and no
 * `lod` / `levels` key or empty container may ever be written. This is what
 * proves dormancy rather than asserting it. It is deliberately trivial while
 * nothing consults the flag; every later phase must keep it green.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings };
});

const { createNewMap, loadMapData, saveMapData, createEmptyDataFile } = await import('../../../src/persistence/fileOperations');
const { isLodLadderEnabled } = await import('../../../src/core/lodFlags');
const { setLevelCells } = await import('../../../src/persistence/layerAccessor');

const DATA_PATH = 'windrose-md-data.json';

interface Harness {
  app: App;
  read: () => string;
}

// An existing empty store: saveMapData refuses to create a missing data file
// (missing-store guard), so the harness starts from one, as a new-map flow does.
function makeApp(initialContent: string | null = JSON.stringify({ maps: {} })): Harness {
  const store = new Map<string, string>();
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();

  const setFile = (content: string): void => {
    if (!files.has(DATA_PATH)) {
      const file = new TFile();
      file.path = DATA_PATH;
      files.set(DATA_PATH, file);
    }
    contents.set(DATA_PATH, content);
  };
  if (initialContent != null) setFile(initialContent);

  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) store.delete(key);
      else store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      read: async (file: TFile) => contents.get(file.path) ?? '',
      modify: async (file: TFile, data: string) => { contents.set(file.path, data); },
      create: async (path: string, data: string) => { setFile(data); void path; },
    },
  } as unknown as App;

  return { app, read: () => contents.get(DATA_PATH) ?? '' };
}

/** load -> paint one hex cell -> save, returning the bytes on disk afterwards. */
async function loadEditSave(initial: string): Promise<string> {
  const h = makeApp(initial);
  const loaded = await loadMapData(h.app, 'oracle', 'Oracle', 'hex');
  const layer = loaded.layers[0];
  layer.cells = [...layer.cells, { x: 3, y: 4, color: '#4a7c59' }];
  const result = await saveMapData(h.app, 'oracle', loaded);
  expect(result.status).toBe('saved');
  return h.read();
}

describe('ladder byte oracle: a classic map is byte-identical with the capability on and off', () => {
  let initial: string;

  beforeEach(async () => {
    getSettings.mockReset();
    getSettings.mockReturnValue({});
    const h = makeApp();
    const fresh = createNewMap('Oracle', 'hex');
    const result = await saveMapData(h.app, 'oracle', fresh);
    expect(result.status).toBe('saved');
    initial = h.read();
    expect(initial.length).toBeGreaterThan(0);
  });

  it('flag off and flag on produce the same bytes after load, edit, save', async () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLodLadderEnabled()).toBe(false);
    const off = await loadEditSave(initial);

    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLodLadderEnabled()).toBe(true);
    const on = await loadEditSave(initial);

    expect(on).toBe(off);
    expect(off).toContain('"x":3,"y":4');
  });

  it('classic map saves schemaVersion 2 byte-identical, flag on and off', async () => {
    const versionOf = (bytes: string): unknown => (JSON.parse(bytes) as { maps: Record<string, { schemaVersion?: unknown }> }).maps.oracle.schemaVersion;
    expect(versionOf(initial)).toBe(2);

    getSettings.mockReturnValue({ lodLadder: false });
    const off = await loadEditSave(initial);
    getSettings.mockReturnValue({ lodLadder: true });
    const on = await loadEditSave(initial);

    expect(on).toBe(off);
    expect(versionOf(off)).toBe(2);
    // Once load-time defaults have settled, load + save with no edit leaves
    // the classic bytes exactly as they were.
    const h = makeApp(initial);
    expect((await saveMapData(h.app, 'oracle', await loadMapData(h.app, 'oracle', 'Oracle', 'hex'))).status).toBe('saved');
    const settled = h.read();
    const loaded = await loadMapData(h.app, 'oracle', 'Oracle', 'hex');
    expect(loaded.schemaVersion).toBe(2);
    expect((await saveMapData(h.app, 'oracle', loaded)).status).toBe('saved');
    expect(h.read()).toBe(settled);
    expect(versionOf(settled)).toBe(2);
  });

  it('never writes a lod block, a levels key, or an empty container', async () => {
    getSettings.mockReturnValue({ lodLadder: true });
    const on = await loadEditSave(initial);
    expect(on).not.toMatch(/"lod"\s*:/);
    expect(on).not.toMatch(/"levels"\s*:/);
  });
});

/** A classic hex map carrying every element kind and a sub-hex child (TEST-06 b). */
function richClassicMap(): MapData {
  const base = createNewMap('Oracle', 'hex');
  const child = createNewMap('Child', 'hex');
  child.layers[0].cells = [{ q: 0, r: 0, color: '#123456' } as never];
  const layer = base.layers[0];
  layer.cells = [{ q: 1, r: 0, color: '#8b5a2b' } as never];
  layer.objects = [{ id: 'o1', type: 'entrance', position: { x: 1, y: 0 }, size: { width: 1, height: 1 } } as never];
  layer.textLabels = [{ id: 't1', position: { x: 10, y: 20 }, content: 'Keep', fontSize: 16, fontFace: 'sans-serif', color: '#ffffff' } as never];
  layer.tiles = [{ col: 1, row: 0, tilesetId: 'ts', tileId: 'floor' } as never];
  return { ...base, subHexMaps: { '1,0': { subdivisionRings: 7, mapData: child, lastModified: '2026-01-01T00:00:00.000Z' } } };
}

describe('ladder byte oracle: a classic map with objects, labels, tiles and a sub-hex stays classic', () => {
  beforeEach(() => {
    getSettings.mockReset();
    getSettings.mockReturnValue({});
  });

  async function settle(): Promise<string> {
    const h = makeApp();
    expect((await saveMapData(h.app, 'oracle', richClassicMap())).status).toBe('saved');
    return h.read();
  }

  async function loadResave(initial: string): Promise<string> {
    const h = makeApp(initial);
    const loaded = await loadMapData(h.app, 'oracle', 'Oracle', 'hex');
    expect((await saveMapData(h.app, 'oracle', loaded)).status).toBe('saved');
    return h.read();
  }

  it('flag on and flag off produce the same bytes, with no ladder fields anywhere', async () => {
    getSettings.mockReturnValue({ lodLadder: false });
    const initial = await settle();
    const off = await loadResave(initial);
    getSettings.mockReturnValue({ lodLadder: true });
    const on = await loadResave(initial);

    expect(on).toBe(off);
    expect(off).toContain('"Keep"');
    expect(off).toContain('"floor"');
    expect(off).toContain('subHexMaps');
    for (const key of ['homeLevel', 'visibleLevels', 'depthMode', '"lod"', '"levels"']) {
      expect(off).not.toContain(key);
    }
    const parsed = JSON.parse(off) as { maps: Record<string, { schemaVersion?: unknown }> };
    expect(parsed.maps.oracle.schemaVersion).toBe(2);
  });

  it('flag on, store missing: creating the store and a classic map writes the flag-off bytes', async () => {
    const createFromMissing = async (): Promise<string> => {
      const h = makeApp(null);
      expect(await createEmptyDataFile(h.app)).toBe(true);
      const fresh = await loadMapData(h.app, 'oracle', 'Oracle', 'hex');
      expect((await saveMapData(h.app, 'oracle', fresh)).status).toBe('saved');
      // Minted layer ids carry a timestamp; everything else must match byte for byte.
      return h.read().replace(/layer-\d+-[a-z0-9]+/g, 'layer-ID');
    };
    getSettings.mockReturnValue({ lodLadder: false });
    const off = await createFromMissing();
    getSettings.mockReturnValue({ lodLadder: true });
    const on = await createFromMissing();

    expect(on).toBe(off);
    expect(on).not.toMatch(/"lod"\s*:/);
    expect(on).not.toMatch(/"levels"\s*:/);
  });
});

describe('ladder byte oracle: a LADDER map round-trips byte-identically', () => {
  beforeEach(() => {
    getSettings.mockReset();
    getSettings.mockReturnValue({ lodLadder: true });
  });

  it('save -> load -> save is byte-identical, and erasing the last rung removes levels', async () => {
    const fresh = createNewMap('Oracle', 'hex');
    const withLod = { ...fresh, lod: { m: 4, minCellPx: 64, maxLevel: 3 } };
    const ladder = setLevelCells(withLod, withLod.layers[0].id, 2, [{ x: 16, y: 0, color: '#8b5a2b' }]);

    // First save, then one load/save so load-time defaults (tiles, wallPaths,
    // ...) settle; that settled file is the oracle's reference bytes.
    const h1 = makeApp();
    expect((await saveMapData(h1.app, 'oracle', ladder)).status).toBe('saved');
    const settled = await loadMapData(h1.app, 'oracle', 'Oracle', 'hex');
    expect((await saveMapData(h1.app, 'oracle', settled)).status).toBe('saved');
    const first = h1.read();
    expect(first).toMatch(/"lod"\s*:/);
    expect(first).toMatch(/"levels"\s*:\s*\{\s*"2"\s*:/);

    const h2 = makeApp(first);
    const loaded = await loadMapData(h2.app, 'oracle', 'Oracle', 'hex');
    expect((await saveMapData(h2.app, 'oracle', loaded)).status).toBe('saved');
    expect(h2.read()).toBe(first);

    const erased = setLevelCells(loaded, loaded.layers[0].id, 2, []);
    expect('levels' in erased.layers[0]).toBe(false);
    expect((await saveMapData(h2.app, 'oracle', erased)).status).toBe('saved');
    expect(h2.read()).not.toContain('"levels"');
    expect(h2.read()).toMatch(/"lod"\s*:/);
  });

  it('ladder map saves schemaVersion 3', async () => {
    const versionOf = (bytes: string): unknown => (JSON.parse(bytes) as { maps: Record<string, { schemaVersion?: unknown }> }).maps.oracle.schemaVersion;
    const fresh = createNewMap('Oracle', 'hex');
    expect(fresh.schemaVersion).toBe(2);
    const withLod = { ...fresh, lod: { m: 4, minCellPx: 64, maxLevel: 3 } };
    const ladder = setLevelCells(withLod, withLod.layers[0].id, 2, [{ x: 16, y: 0, color: '#8b5a2b' }]);
    // The live tree is still stamped 2; the writer stamps by content.
    expect(ladder.schemaVersion).toBe(2);

    const h = makeApp();
    expect((await saveMapData(h.app, 'oracle', ladder)).status).toBe('saved');
    expect(versionOf(h.read())).toBe(3);
    expect(ladder.schemaVersion).toBe(2);
    const loaded = await loadMapData(h.app, 'oracle', 'Oracle', 'hex');
    expect(loaded.schemaVersion).toBe(3);
  });
});
