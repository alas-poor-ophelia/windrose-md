import { describe, it, expect } from 'vitest';
import { migrateMapData, createNewMap } from '../../../src/persistence/fileOperations';
import { createWallPath, createWallPathId } from '../../../src/drawing/wallPathOperations';
import type { MapData } from '../../../types/core/map.types';
import type { WallPath } from '../../../types/core/wallpath.types';

function mapWithLayerData(layerData: Record<string, unknown>): MapData {
  const map = createNewMap('test', 'grid');
  Object.assign(map.layers[0], layerData);
  return map;
}

describe('wallPaths migration (migrateMapData)', () => {
  it('initializes wallPaths to [] when absent', () => {
    const map = mapWithLayerData({});
    delete (map.layers[0] as unknown as Record<string, unknown>).wallPaths;
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths).toEqual([]);
  });

  it('preserves valid wall paths', () => {
    const wall: WallPath = {
      id: 'wall-1',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
      closed: false,
      tilesetId: 'ts1',
      tileId: 't1',
      kind: 'wall',
      widthScale: 1,
    };
    const map = mapWithLayerData({ wallPaths: [wall] });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths).toHaveLength(1);
    expect(migrated.layers[0].wallPaths?.[0].id).toBe('wall-1');
  });

  it('drops wall paths with fewer than 2 vertices or invalid vertices', () => {
    const valid: WallPath = {
      id: 'ok',
      vertices: [{ x: 0, y: 0 }, { x: 5, y: 5 }],
      closed: false,
      tilesetId: 'ts1',
      tileId: 't1',
      kind: 'wall',
      widthScale: 1,
    };
    const map = mapWithLayerData({
      wallPaths: [
        valid,
        { ...valid, id: 'short', vertices: [{ x: 0, y: 0 }] },
        { ...valid, id: 'nullVerts', vertices: null },
      ],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.map(w => w.id)).toEqual(['ok']);
  });

  it('round-trips through JSON serialization (arc control points intact)', () => {
    const wall: WallPath = {
      id: 'wall-arc',
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 0, arc: [150, 50] },
        { x: 200, y: 100 },
      ],
      closed: true,
      tilesetId: 'ts1',
      tileId: 't1',
      kind: 'path',
      widthScale: 1.5,
      tint: 'aabbcc',
      flip: true,
    };
    const map = mapWithLayerData({ wallPaths: [wall] });
    const roundTripped = migrateMapData(JSON.parse(JSON.stringify(map)) as MapData);
    expect(roundTripped.layers[0].wallPaths?.[0]).toEqual(wall);
  });
});

describe('createWallPath', () => {
  it('applies defaults', () => {
    const wp = createWallPath({
      vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      tilesetId: 'ts',
      tileId: 't',
      kind: 'wall',
    });
    expect(wp.closed).toBe(false);
    expect(wp.widthScale).toBe(1);
    expect(wp.tint).toBeUndefined();
    expect(wp.flip).toBeUndefined();
    expect(wp.id).toMatch(/^wall-\d+-[a-z0-9]+$/);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createWallPathId()));
    expect(ids.size).toBe(50);
  });
});
