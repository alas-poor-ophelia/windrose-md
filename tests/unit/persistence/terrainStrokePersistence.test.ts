import { describe, it, expect } from 'vitest';
import { migrateMapData, createNewMap } from '../../../src/persistence/fileOperations';
import { createTerrainStroke, createTerrainStrokeId } from '../../../src/drawing/terrainStrokeOperations';
import type { MapData } from '../../../types/core/map.types';
import type { TerrainStroke } from '../../../types/core/terrainstroke.types';

function mapWithLayerData(layerData: Record<string, unknown>): MapData {
  const map = createNewMap('test', 'grid');
  Object.assign(map.layers[0], layerData);
  return map;
}

function stroke(over?: Partial<TerrainStroke>): TerrainStroke {
  return {
    id: 'ts-1',
    points: [0, 0, 50, 50, 100, 60],
    radius: 40,
    tilesetId: 'ts1',
    tileId: 'grass',
    ...over,
  };
}

describe('terrainStrokes migration (migrateMapData)', () => {
  it('initializes terrainStrokes to [] when absent', () => {
    const map = mapWithLayerData({});
    delete (map.layers[0] as unknown as Record<string, unknown>).terrainStrokes;
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].terrainStrokes).toEqual([]);
  });

  it('preserves valid strokes (single-point dab included)', () => {
    const map = mapWithLayerData({
      terrainStrokes: [stroke(), stroke({ id: 'dab', points: [5, 5] })],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].terrainStrokes?.map(s => s.id)).toEqual(['ts-1', 'dab']);
  });

  it('drops strokes with odd-length or missing points', () => {
    const map = mapWithLayerData({
      terrainStrokes: [
        stroke(),
        stroke({ id: 'odd', points: [0, 0, 5] }),
        stroke({ id: 'empty', points: [] }),
        { ...stroke({ id: 'nullPts' }), points: null as unknown as number[] },
      ],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].terrainStrokes?.map(s => s.id)).toEqual(['ts-1']);
  });

  it('drops strokes with non-finite or non-positive radius', () => {
    const map = mapWithLayerData({
      terrainStrokes: [
        stroke(),
        stroke({ id: 'zero', radius: 0 }),
        stroke({ id: 'neg', radius: -5 }),
        stroke({ id: 'nan', radius: NaN }),
      ],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].terrainStrokes?.map(s => s.id)).toEqual(['ts-1']);
  });

  it('drops strokes missing texture references', () => {
    const map = mapWithLayerData({
      terrainStrokes: [
        stroke(),
        { ...stroke({ id: 'noTs' }), tilesetId: undefined as unknown as string },
      ],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].terrainStrokes?.map(s => s.id)).toEqual(['ts-1']);
  });

  it('hardens sub-hex map layers too', () => {
    const map = createNewMap('test', 'hex');
    map.subHexMaps = {
      '0,0': {
        mapData: (() => {
          const sub = createNewMap('sub', 'hex');
          Object.assign(sub.layers[0], {
            terrainStrokes: [stroke(), stroke({ id: 'bad', points: [1] })],
          });
          return sub;
        })(),
      },
    } as unknown as MapData['subHexMaps'];
    const migrated = migrateMapData(map);
    const subStrokes = migrated.subHexMaps?.['0,0']?.mapData?.layers[0]?.terrainStrokes;
    expect(subStrokes?.map(s => s.id)).toEqual(['ts-1']);
  });

  it('round-trips through JSON serialization', () => {
    const s = stroke({ depth: 'props', opacity: 0.8 });
    const map = mapWithLayerData({ terrainStrokes: [s] });
    const roundTripped = migrateMapData(JSON.parse(JSON.stringify(map)) as MapData);
    expect(roundTripped.layers[0].terrainStrokes?.[0]).toEqual(s);
  });
});

describe('createTerrainStroke', () => {
  it('applies defaults and omits ground depth / full opacity', () => {
    const s = createTerrainStroke({ points: [0, 0, 10, 10], radius: 30, tilesetId: 'ts', tileId: 't' });
    expect(s.depth).toBeUndefined();
    expect(s.opacity).toBeUndefined();
    expect(s.id).toMatch(/^tstroke-\d+-[a-z0-9]+$/);
  });

  it('keeps explicit non-default depth and opacity', () => {
    const s = createTerrainStroke({ points: [0, 0], radius: 10, tilesetId: 'ts', tileId: 't', depth: 'props', opacity: 0.5 });
    expect(s.depth).toBe('props');
    expect(s.opacity).toBe(0.5);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createTerrainStrokeId()));
    expect(ids.size).toBe(50);
  });
});
