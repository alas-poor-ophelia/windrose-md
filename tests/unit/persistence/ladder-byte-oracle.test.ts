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

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings };
});

const { createNewMap, loadMapData, saveMapData } = await import('../../../src/persistence/fileOperations');
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

  it('never writes a lod block, a levels key, or an empty container', async () => {
    getSettings.mockReturnValue({ lodLadder: true });
    const on = await loadEditSave(initial);
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
});
