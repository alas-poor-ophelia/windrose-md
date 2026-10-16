/**
 * useMapListActions: the new-map flow parks the dialog's ladder preset so the
 * map's first load (by whichever host opens it) builds a ladder map (TEST-09 #7).
 * preact/hooks is stubbed; the file operations are real, over an in-memory vault.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

vi.mock('preact/hooks', () => ({
  useState: (init: unknown) => [typeof init === 'function' ? (init as () => unknown)() : init, () => {}],
  useRef: (init: unknown) => ({ current: init }),
  useEffect: () => {},
  useCallback: (fn: unknown) => fn,
}));

type NewMapCallback = (id: string, name: string, type: string, ladderM?: number) => void;
const modal = vi.hoisted(() => ({ onCreate: null as null | ((id: string, name: string, type: string, ladderM?: number) => void) }));
vi.mock('../../../../src/components/modals/NewMapModal', () => ({
  NewMapModal: class { constructor(_app: unknown, cb: NewMapCallback) { modal.onCreate = cb; } open(): void { /* captured */ } },
}));
vi.mock('../../../../src/settings/modals/ConfirmModal', () => ({ ConfirmModal: class {} }));
vi.mock('../../../../src/settings/modals/InsertDungeonModal', () => ({ InsertDungeonModal: class {} }));

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../../src/core/settingsAccessor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/core/settingsAccessor')>();
  return { ...actual, getSettings };
});

const { useMapListActions } = await import('../../../../src/hooks/app/useMapListActions');
const { loadMapData } = await import('../../../../src/persistence/fileOperations');

function makeApp(): App {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();
  const setFile = (path: string, data: string): void => {
    if (!files.has(path)) {
      const f = new TFile();
      f.path = path;
      files.set(path, f);
    }
    contents.set(path, data);
  };
  const store = new Map<string, string>();
  // An existing empty store, as the new-map flow leaves it before the first load.
  setFile('windrose-md-data.json', JSON.stringify({ maps: {} }));
  return {
    saveLocalStorage: (k: string, d: unknown) => { if (d == null) store.delete(k); else store.set(k, String(d)); },
    loadLocalStorage: (k: string) => store.get(k) ?? null,
    vault: {
      getAbstractFileByPath: (p: string) => files.get(p) ?? null,
      read: async (f: TFile) => contents.get(f.path) ?? '',
      modify: async (f: TFile, d: string) => { contents.set(f.path, d); },
      create: async (p: string, d: string) => { setFile(p, d); },
      createFolder: async () => { /* unused */ },
    },
  } as unknown as App;
}

function openNewMapDialog(app: App, onMapChange = vi.fn()): { create: NewMapCallback; onMapChange: ReturnType<typeof vi.fn> } {
  const actions = useMapListActions({
    app, fullPane: true, mapId: 'cur', mapName: 'Cur', mapType: 'hex', rootMapName: 'Cur',
    markDeleted: () => {}, onMapChange, setMapDeleted: () => {},
  });
  actions.handleNewMap();
  if (modal.onCreate == null) throw new Error('NewMapModal was not opened');
  return { create: modal.onCreate, onMapChange };
}

describe('useMapListActions: new-map flow and the ladder preset', () => {
  beforeEach(() => {
    modal.onCreate = null;
    getSettings.mockReset();
    getSettings.mockReturnValue({ lodLadder: true });
  });

  it('a hex map created with a ladder preset loads with lod', async () => {
    const app = makeApp();
    const { create, onMapChange } = openNewMapDialog(app);
    create('new-ladder', 'Ladder', 'hex', 4);
    expect(onMapChange).toHaveBeenCalledWith('new-ladder', 'Ladder', 'hex', 4);

    const loaded = await loadMapData(app, 'new-ladder', 'Ladder', 'hex');
    expect(loaded.lod).toEqual(expect.objectContaining({ m: 4 }));
  });

  it('a hex map created without a preset is a classic map', async () => {
    const app = makeApp();
    const { create } = openNewMapDialog(app);
    create('new-classic', 'Classic', 'hex');

    const loaded = await loadMapData(app, 'new-classic', 'Classic', 'hex');
    expect(loaded.lod).toBeUndefined();
  });

  it('a preset on a non-hex map is not parked', async () => {
    const app = makeApp();
    const { create } = openNewMapDialog(app);
    create('new-grid', 'Grid', 'grid', 4);

    const loaded = await loadMapData(app, 'new-grid', 'Grid', 'grid');
    expect(loaded.lod).toBeUndefined();
  });

  it('the preset is ignored while the capability is off', async () => {
    getSettings.mockReturnValue({ lodLadder: false });
    const app = makeApp();
    const { create } = openNewMapDialog(app);
    create('new-off', 'Off', 'hex', 4);

    const loaded = await loadMapData(app, 'new-off', 'Off', 'hex');
    expect(loaded.lod).toBeUndefined();
  });
});
