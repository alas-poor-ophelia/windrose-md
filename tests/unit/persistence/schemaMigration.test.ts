/**
 * Version-stepped schema migration (DATA-01) and recursive per-map
 * migration through nested sub-hex maps (DATA-07 / DUP-18 / STRUCT-B-17).
 */

import { describe, it, expect, vi } from 'vitest';

import { migrateMapData, createNewMap } from '../../../src/persistence/fileOperations';
import { migrations, runSchemaMigrations, detectSchemaVersion, sanitizeLayer, stampSchemaVersions, LADDER_SCHEMA_VERSION } from '../../../src/persistence/schemaMigration';
import { needsMigration, migrateToLayerSchema, LAYER_SCHEMA_VERSION } from '../../../src/persistence/layerAccessor';
import { SCHEMA_VERSION } from '../../../src/core/dmtConstants';
import type { MapData, MapLayer } from '../../../types/core/map.types';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** A v2 map with two real layers of content. */
function richV2Map(): MapData {
  const map = createNewMap('Rich', 'grid');
  map.layers[0].id = 'L1';
  map.layers[0].cells = [{ x: 1, y: 2, color: '#123456' }] as MapLayer['cells'];
  map.layers.push({
    ...clone(map.layers[0]),
    id: 'L2',
    name: '2',
    order: 1,
    cells: [{ x: 5, y: 5, color: '#abcdef' }] as MapLayer['cells'],
  });
  map.activeLayerId = 'L1';
  return map;
}

describe('schema migration registry', () => {
  it('has a step registered for every version from 2 to SCHEMA_VERSION', () => {
    for (let v = 2; v <= SCHEMA_VERSION; v++) {
      expect(typeof migrations[v], `migrations[${String(v)}]`).toBe('function');
    }
  });
});

describe('runSchemaMigrations / migrateMapData (DATA-01)', () => {
  it('v1 -> v2: root-level content moves into one layer', () => {
    const v1 = {
      name: 'Old',
      mapType: 'grid',
      cells: [{ x: 0, y: 0, color: '#fff' }, { x: 1, y: 0, color: '#fff' }],
      objects: [{ id: 'o1', type: 'chest', position: { x: 0, y: 0 } }],
      textLabels: [],
      edges: [],
    } as unknown as MapData;

    const migrated = migrateMapData(v1);

    expect(migrated.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(migrated.layers).toHaveLength(1);
    expect(migrated.layers[0].cells).toHaveLength(2);
    expect(migrated.layers[0].objects).toHaveLength(1);
  });

  it('a current v2 map keeps its layers exactly', () => {
    const map = migrateMapData(richV2Map());
    const before = clone(map.layers);

    const again = migrateMapData(clone(map));

    expect(again.layers).toEqual(before);
    expect(again.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
  });

  it('layers present but schemaVersion missing: stamped, layers intact (never rebuilt)', () => {
    const map = richV2Map();
    delete (map as Partial<MapData>).schemaVersion;

    const migrated = migrateMapData(map);

    expect(migrated.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(migrated.layers.map(l => l.id)).toEqual(['L1', 'L2']);
    expect(migrated.layers[0].cells).toEqual([{ x: 1, y: 2, color: '#123456' }]);
    expect(migrated.layers[1].cells).toEqual([{ x: 5, y: 5, color: '#abcdef' }]);
  });

  it('layers present with an understated schemaVersion: stamped, layers intact', () => {
    const map = richV2Map();
    map.schemaVersion = 1;

    const migrated = migrateMapData(map);

    expect(migrated.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(migrated.layers.map(l => l.id)).toEqual(['L1', 'L2']);
  });

  it('schemaVersion newer than this plugin: returned untouched (no rebuild, no defaults, no downgrade), with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const map = richV2Map();
    map.schemaVersion = SCHEMA_VERSION + 5;
    delete (map as Partial<MapData>).partyPins;
    const before = clone(map);

    const migrated = migrateMapData(map);

    expect(migrated).toEqual(before);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a newer map with a NON-array layers field is not read as v1 (Parallax #1)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const future = { schemaVersion: SCHEMA_VERSION + 1, chunks: { '0,0': { cells: [1, 2, 3] } }, layers: { byId: {} } } as unknown as MapData;
    const before = clone(future);

    expect(detectSchemaVersion(future)).toBe(SCHEMA_VERSION + 1);
    const migrated = migrateMapData(future);

    expect(migrated).toEqual(before);
    warn.mockRestore();
  });

  it('migrateToLayerSchema never rebuilds an existing layers array', () => {
    const map = richV2Map();
    delete (map as Partial<MapData>).schemaVersion;
    const out = migrateToLayerSchema(map) as MapData;
    expect(out.layers.map(l => l.id)).toEqual(['L1', 'L2']);
    expect(out.schemaVersion).toBe(2);
  });

  it('detectSchemaVersion judges by shape first', () => {
    expect(detectSchemaVersion({ cells: [] } as unknown as MapData)).toBe(1);
    expect(detectSchemaVersion({ schemaVersion: 2, cells: [] } as unknown as MapData)).toBe(1);
    expect(detectSchemaVersion({ layers: [] } as unknown as MapData)).toBe(2);
    expect(detectSchemaVersion({ layers: [], schemaVersion: 7 } as unknown as MapData)).toBe(7);
    // A claimed future version wins over shape inference.
    expect(detectSchemaVersion({ schemaVersion: SCHEMA_VERSION + 1, chunks: {} } as unknown as MapData)).toBe(SCHEMA_VERSION + 1);
  });

  it('needsMigration is false for a current map and true without layers', () => {
    expect(needsMigration(createNewMap('x', 'grid'))).toBe(false);
    expect(needsMigration({ schemaVersion: SCHEMA_VERSION } as unknown as MapData)).toBe(true);
  });

  it('runSchemaMigrations is a no-op on a current map', () => {
    const map = createNewMap('x', 'grid');
    expect(runSchemaMigrations(map)).toBe(map);
  });
});

describe('migrateMapData reaches nested sub-hex maps (DATA-07)', () => {
  /** A layer carrying both legacy shapes plus a crash-filter victim. */
  function legacyLayer(): MapLayer {
    const layer = createNewMap('sub', 'hex').layers[0];
    delete (layer as Partial<MapLayer>).boardId;
    return {
      ...layer,
      tiles: [{ q: 3, r: 4, layer: 'base', tilesetId: 'ts', tileId: 't' }],
      curves: [{ id: 'c1', start: [0, 0], segments: [], holes: [[0, 0, 1, 0, 1, 1]] }],
      wallPaths: [{ id: 'bad', vertices: [{ x: 0, y: 0 }], tilesetId: 'ts', tileId: 'w' }],
    } as unknown as MapLayer;
  }

  function mapWithDepth2(): MapData {
    const root = createNewMap('root', 'hex');
    const depth1 = createNewMap('d1', 'hex');
    const depth2 = createNewMap('d2', 'hex');
    depth2.layers = [legacyLayer()];
    delete (depth2 as Partial<MapData>).boards;
    delete (depth2 as Partial<MapData>).shapeOverlays;
    depth1.layers = [legacyLayer()];
    depth1.subHexMaps = { '2,-1': { subdivisionRings: 7, mapData: depth2, lastModified: '' } };
    root.subHexMaps = { '0,0': { subdivisionRings: 7, mapData: depth1, lastModified: '' } };
    return root;
  }

  it('applies tile, curve and wall migrations plus per-map defaults at depth 1 and depth 2', () => {
    const migrated = migrateMapData(mapWithDepth2());
    const d1 = migrated.subHexMaps?.['0,0']?.mapData as MapData;
    const d2 = d1.subHexMaps?.['2,-1']?.mapData as MapData;

    for (const m of [d1, d2]) {
      const layer = m.layers[0];
      const tile = layer.tiles?.[0] as unknown as Record<string, unknown>;
      expect(tile.col).toBe(3);
      expect(tile.row).toBe(4);
      expect('q' in tile).toBe(false);
      expect('layer' in tile).toBe(false);

      const curve = layer.curves[0] as unknown as Record<string, unknown>;
      expect(curve.innerRings).toEqual([[[0, 0], [1, 0], [1, 1]]]);
      expect('holes' in curve).toBe(false);

      expect(layer.wallPaths).toEqual([]);
      expect(layer.terrainStrokes).toEqual([]);
      expect(layer.boardId).toBeDefined();
      expect(m.boards?.length).toBeGreaterThan(0);
      expect(m.shapeOverlays).toEqual([]);
      expect(m.savedRoutes).toEqual([]);
    }
  });
});

describe('sanitizeLayer: visibleLevels (kgc.31)', () => {
  it('keeps non-negative integers deduped and sorted, deletes empty or non-array sets', () => {
    const layer = {
      objects: [
        { id: 'a', visibleLevels: [3, 1, 1, -2, 1.5, 'x', 0] },
        { id: 'b', visibleLevels: [] },
        { id: 'c', visibleLevels: 'all' },
        { id: 'd' }
      ],
      textLabels: [{ id: 't', visibleLevels: [-1] }, { id: 'u', visibleLevels: [2] }]
    } as unknown as MapLayer;
    sanitizeLayer(layer);
    const objs = layer.objects as unknown as Array<Record<string, unknown>>;
    expect(objs[0].visibleLevels).toEqual([0, 1, 3]);
    expect('visibleLevels' in objs[1]).toBe(false);
    expect('visibleLevels' in objs[2]).toBe(false);
    expect('visibleLevels' in objs[3]).toBe(false);
    const labels = layer.textLabels as unknown as Array<Record<string, unknown>>;
    expect('visibleLevels' in labels[0]).toBe(false);
    expect(labels[1].visibleLevels).toEqual([2]);
  });
});

describe('the v3 ladder fence (DATA-05)', () => {
  /** A v2-stamped hex map that carries ladder data (written before the fence existed). */
  function unfencedLadderMap(): MapData {
    const map = createNewMap('Ladder', 'hex');
    map.schemaVersion = 2;
    map.lod = { m: 4, minCellPx: 64, maxLevel: 3 };
    map.layers[0].levels = { 1: [{ q: 4, r: 0, color: '#123456' }] } as MapLayer['levels'];
    return map;
  }

  it('v3 step never rebuilds layers', () => {
    const map = unfencedLadderMap();
    const layers = map.layers;
    const firstLayer = map.layers[0];
    const stepped = migrations[LADDER_SCHEMA_VERSION](map);
    expect(stepped).toBe(map);
    expect(stepped.layers).toBe(layers);
    expect(stepped.layers[0]).toBe(firstLayer);
    // And through the runner on a classic v2 map: same layers array, same layer objects.
    const classic = richV2Map();
    const classicLayers = classic.layers;
    const ids = classic.layers.map(l => l.id);
    const run = runSchemaMigrations(classic);
    expect(run.layers).toBe(classicLayers);
    expect(run.layers.map(l => l.id)).toEqual(ids);
  });

  it('an unfenced v2 ladder map loads and re-saves as 3', () => {
    const loaded = migrateMapData(unfencedLadderMap());
    expect(loaded.schemaVersion).toBe(LADDER_SCHEMA_VERSION);
    expect(loaded.layers[0].levels).toEqual({ 1: [{ q: 4, r: 0, color: '#123456' }] });
    const written = JSON.parse(JSON.stringify(stampSchemaVersions(loaded))) as MapData;
    expect(written.schemaVersion).toBe(LADDER_SCHEMA_VERSION);
  });

  it('a classic map loads and writes as 2; the stamp is copy-on-write', () => {
    const loaded = migrateMapData(richV2Map());
    expect(loaded.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(stampSchemaVersions(loaded)).toBe(loaded);
    const live = { ...loaded, schemaVersion: SCHEMA_VERSION };
    const written = stampSchemaVersions(live);
    expect(written).not.toBe(live);
    expect(live.schemaVersion).toBe(SCHEMA_VERSION);
    expect(written.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    // The key keeps its place, so the classic bytes do not move.
    expect(Object.keys(written)).toEqual(Object.keys(live));
  });

  it('a homeLevel alone, or ladder data in a nested sub-hex map, fences the entry', () => {
    const homed = createNewMap('Homed', 'hex');
    homed.layers[0].objects = [{ id: 'o', type: 'chest', position: { x: 1, y: 1 }, homeLevel: 2 }] as MapLayer['objects'];
    expect(stampSchemaVersions(homed).schemaVersion).toBe(LADDER_SCHEMA_VERSION);

    const parent = createNewMap('Parent', 'hex');
    const ladderChild = unfencedLadderMap();
    const classicChild = createNewMap('Plain', 'hex');
    parent.subHexMaps = {
      '0,0': { subdivisionRings: 7, mapData: ladderChild, lastModified: '' },
      '1,0': { subdivisionRings: 7, mapData: classicChild, lastModified: '' },
    } as MapData['subHexMaps'];
    const stamped = stampSchemaVersions(parent);
    expect(stamped.schemaVersion).toBe(LADDER_SCHEMA_VERSION);
    expect(stamped.subHexMaps?.['0,0'].mapData.schemaVersion).toBe(LADDER_SCHEMA_VERSION);
    expect(stamped.subHexMaps?.['1,0'].mapData.schemaVersion).toBe(LAYER_SCHEMA_VERSION);
    expect(stamped.subHexMaps?.['1,0'].mapData).toBe(classicChild);
    expect(parent.subHexMaps?.['0,0'].mapData.schemaVersion).toBe(2);
  });

  it('never downgrades a newer stamp', () => {
    const future = { ...createNewMap('F', 'grid'), schemaVersion: SCHEMA_VERSION + 1 };
    expect(stampSchemaVersions(future)).toBe(future);
  });
});

describe('element sanitation on load (DATA-08, DATA-09)', () => {
  it("homeLevel 1.5, '2', -1 and 0 removed; 2 kept", () => {
    const layer = createNewMap('x', 'hex').layers[0];
    const obj = (id: string, homeLevel: unknown): Record<string, unknown> => ({ id, type: 'chest', position: { x: 0, y: 0 }, homeLevel });
    layer.objects = [obj('a', 1.5), obj('b', '2'), obj('c', -1), obj('d', 0), obj('e', 2)] as unknown as MapLayer['objects'];
    layer.textLabels = [{ id: 't1', content: 'x', position: { x: 0, y: 0 }, homeLevel: 1.5 }, { id: 't2', content: 'y', position: { x: 0, y: 0 }, homeLevel: 3 }] as unknown as MapLayer['textLabels'];
    layer.tiles = [{ col: 0, row: 0, tilesetId: 's', tileId: 't', homeLevel: '2' }, { col: 1, row: 0, tilesetId: 's', tileId: 't', homeLevel: 1 }] as unknown as MapLayer['tiles'];

    sanitizeLayer(layer);

    const homes = (els: readonly unknown[] | undefined): unknown[] => (els ?? []).map(e => (e as { homeLevel?: unknown }).homeLevel);
    expect(homes(layer.objects)).toEqual([undefined, undefined, undefined, undefined, 2]);
    expect(layer.objects?.some(o => 'homeLevel' in o && o.homeLevel === undefined)).toBe(false);
    expect(homes(layer.textLabels)).toEqual([undefined, 3]);
    expect(homes(layer.tiles)).toEqual([undefined, 1]);
  });

  it('null object entry does not throw', () => {
    const layer = createNewMap('x', 'hex').layers[0];
    layer.objects = [null, { id: 'o', type: 'chest', position: { x: 0, y: 0 }, visibleLevels: [2, 1, 1] }] as unknown as MapLayer['objects'];
    layer.textLabels = [null] as unknown as MapLayer['textLabels'];
    expect(() => sanitizeLayer(layer)).not.toThrow();
    expect(layer.objects?.[0]).toBeNull();
    expect((layer.objects?.[1] as { visibleLevels?: number[] }).visibleLevels).toEqual([1, 2]);
  });
});
