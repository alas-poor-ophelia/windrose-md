/**
 * buildMapEntry / createMapEntry (OBS-05 / DATA-12 / STRUCT-B-24): the
 * generated-dungeon writer now builds from createNewMap + overrides and
 * persists through saveMapData's guarded path.
 */

import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { buildMapEntry, createMapEntry, createNewMap, getEntryGeneration } from '../../../src/persistence/fileOperations';
import { DEFAULTS, SCHEMA_VERSION } from '../../../src/core/dmtConstants';
import { DEFAULT_BOARD_ID } from '../../../src/persistence/layerAccessor';
import type { MapData, MapLayer } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(initial: string | null): { app: App; files: Map<string, string> } {
  const files = new Map<string, string>();
  const handles = new Map<string, TFile>();
  const put = (path: string, data: string): void => {
    if (!handles.has(path)) {
      const f = new TFile();
      f.path = path;
      handles.set(path, f);
    }
    files.set(path, data);
  };
  if (initial != null) put(DATA_PATH, initial);
  const app = {
    vault: {
      getAbstractFileByPath: (p: string) => handles.get(p) ?? null,
      read: async (f: TFile) => files.get(f.path) ?? '',
      modify: async (f: TFile, data: string) => { files.set(f.path, data); },
      create: async (p: string, data: string) => { put(p, data); },
    },
  } as unknown as App;
  return { app, files };
}

/** The overrides main.ts's buildGeneratedDungeonMap passes. */
const cells = [{ x: 2, y: 3, color: '#111' }, { x: 6, y: 9, color: '#111' }];
const objects = [{ id: 'obj-1', type: 'chest', position: { x: 2, y: 3 } }];
const edges = [{ x: 2, y: 3, side: 'right', color: '#000' }];
const fog = { enabled: true, foggedCells: [{ col: 6, row: 9 }] };
const generation = { preset: 'medium', configOverrides: {}, distancePerCell: 5, distanceUnit: 'ft', stockingMetadata: null };

function built(): MapData {
  return buildMapEntry('Dungeon', 'grid', {
    generationSettings: generation as unknown as MapData['generationSettings'],
    settings: { useGlobalSettings: false, overrides: { distancePerCellGrid: 5, distanceUnitGrid: 'ft' } } as unknown as MapData['settings'],
    viewState: { zoom: 1.5, center: { x: 4, y: 6 } },
  }, {
    name: 'Layer 1',
    cells: cells as unknown as MapLayer['cells'],
    edges: edges as MapLayer['edges'],
    objects: objects as unknown as MapLayer['objects'],
    textLabels: [],
    fogOfWar: fog as MapLayer['fogOfWar'],
  });
}

describe('buildMapEntry matches the old generated-dungeon literal', () => {
  it('keeps every field of the old literal and only adds createNewMap defaults', () => {
    const map = built();
    const layerId = map.layers[0].id;

    // The literal saveDungeonToJson used to write (layer id aside).
    const oldLiteral = {
      name: 'Dungeon',
      description: '',
      mapType: 'grid',
      northDirection: 0,
      customColors: [],
      expandedState: false,
      generationSettings: generation,
      settings: { useGlobalSettings: false, overrides: { distancePerCellGrid: 5, distanceUnitGrid: 'ft' } },
      uiPreferences: { rememberPanZoom: true, rememberSidebarState: true, rememberExpandedState: false },
      lastTextLabelSettings: null,
      schemaVersion: SCHEMA_VERSION,
      activeLayerId: layerId,
      layerPanelVisible: false,
      layers: [{
        id: layerId, name: 'Layer 1', order: 0, visible: true,
        cells, edges, objects, textLabels: [], fogOfWar: fog,
      }],
      gridSize: DEFAULTS.gridSize,
      dimensions: { ...DEFAULTS.dimensions },
      viewState: { zoom: 1.5, center: { x: 4, y: 6 } },
    };

    // Intentional, documented additions (load-time migration backfilled
    // these for generated maps anyway):
    const { boards, activeBoardId, layers, ...rest } = map;
    const { curves, boardId, ...layerRest } = layers[0];
    expect(boards).toEqual([{ id: DEFAULT_BOARD_ID, name: 'Ground Floor', order: 0 }]);
    expect(activeBoardId).toBe(DEFAULT_BOARD_ID);
    expect(curves).toEqual([]);
    expect(boardId).toBe(DEFAULT_BOARD_ID);

    const { layers: oldLayers, ...oldRest } = oldLiteral;
    expect(rest).toEqual(oldRest);
    expect(layerRest).toEqual(oldLayers[0]);
  });

  it('sets activeLayerId to the overridden layer', () => {
    const map = buildMapEntry('x', 'grid', {}, { id: 'custom-layer' });
    expect(map.activeLayerId).toBe('custom-layer');
    expect(createNewMap('x', 'grid').layers).toHaveLength(1);
  });
});

describe('createMapEntry persists through the guarded save path', () => {
  it('merges into the existing store as compact JSON, rotates a backup and bumps the generation', async () => {
    const existing = JSON.stringify({ maps: { other: createNewMap('Other', 'grid') } }, null, 2);
    const { app, files } = makeApp(existing);

    await createMapEntry(app, 'gen-dungeon', built());

    const written = files.get(DATA_PATH) as string;
    expect(written.includes('\n')).toBe(false);
    const parsed = JSON.parse(written) as { maps: Record<string, MapData> };
    expect(Object.keys(parsed.maps).sort()).toEqual(['gen-dungeon', 'other']);
    expect(files.get('windrose-md-data.bak1.json')).toBe(existing);
    expect(getEntryGeneration('gen-dungeon')).toBe(1);
  });

  it('refuses to write over an unparseable store and throws', async () => {
    const { app, files } = makeApp('{"maps": {"trunc');
    await expect(createMapEntry(app, 'gen-bad', built())).rejects.toThrow();
    expect(files.get(DATA_PATH)).toBe('{"maps": {"trunc');
  });

  it('creates the store when absent on first use (fresh module session, no prior store)', async () => {
    vi.resetModules();
    const fresh = await import('../../../src/persistence/fileOperations');
    const { app, files } = makeApp(null);
    await fresh.createMapEntry(app, 'gen-new', built());
    expect(Object.keys((JSON.parse(files.get(DATA_PATH) as string) as { maps: object }).maps)).toEqual(['gen-new']);
  });

  it('refuses to create a one-map store once this session has seen the store', async () => {
    // The earlier tests in this file wrote the store at DATA_PATH this session.
    const { app, files } = makeApp(null);
    await expect(createMapEntry(app, 'gen-orphan', built())).rejects.toThrow();
    expect(files.has(DATA_PATH)).toBe(false);
  });
});
