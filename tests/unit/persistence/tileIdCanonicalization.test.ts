/**
 * Unit tests for save-time tile-id canonicalization (canonicalizeTileIds)
 * and the wallPath tileId load filter in migrateMapData.
 */

import { describe, it, expect } from 'vitest';
import { canonicalizeTileIds, migrateMapData, createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';
import type { TilesetDef, TileAssignment } from '../../../types/tiles/tile.types';
import type { WallPath } from '../../../types/core/wallpath.types';

function tileset(id: string, tileIds: string[]): TilesetDef {
  return {
    id,
    name: id,
    tiles: tileIds.map(tid => ({
      id: tid,
      filename: tid.split('/').pop() + '.webp',
      vaultPath: 'Pack/' + tid + '.webp',
    })),
    tileWidth: 256,
    tileHeight: 256,
  } as unknown as TilesetDef;
}

function placement(tilesetId: string, tileId: string, over?: Partial<TileAssignment>): TileAssignment {
  return { col: 0, row: 0, tilesetId, tileId, ...over } as TileAssignment;
}

function wallPath(tilesetId: string, tileId: string): WallPath {
  return {
    id: 'wp-1',
    tilesetId,
    tileId,
    vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
  } as unknown as WallPath;
}

function mapWith(tilesets: TilesetDef[], layerData: Record<string, unknown>): MapData {
  const map = createNewMap('test', 'grid');
  map.tilesets = tilesets;
  Object.assign(map.layers[0], layerData);
  return map;
}

describe('canonicalizeTileIds', () => {
  it('rewrites legacy basename ids to folder-relative ids', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/Stone', 'props/Barrel'])],
      { tiles: [placement('ts1', 'Stone'), placement('ts1', 'Barrel')] }
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.map(t => t.tileId))
      .toEqual(['terrain/Natural/Stone', 'props/Barrel']);
  });

  it('is idempotent: canonical ids stay unchanged', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/Stone'])],
      { tiles: [placement('ts1', 'terrain/Natural/Stone')] }
    );
    canonicalizeTileIds(map);
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.[0].tileId).toBe('terrain/Natural/Stone');
  });

  it('no-ops against a stale registry still holding old-style ids', () => {
    // Before the rescan completes, the registry exact-matches every stored id —
    // nothing may rewrite (the 304-tile RCA guard).
    const map = mapWith(
      [tileset('ts1', ['Stone'])],
      { tiles: [placement('ts1', 'Stone')] }
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.[0].tileId).toBe('Stone');
  });

  it('leaves unresolvable ids untouched', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/Stone'])],
      { tiles: [placement('ts1', 'Ghost'), placement('missing-ts', 'Stone')] }
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.map(t => t.tileId)).toEqual(['Ghost', 'Stone']);
  });

  it('no-ops when the map has no tilesets', () => {
    const map = mapWith([], { tiles: [placement('ts1', 'Stone')] });
    map.tilesets = undefined as unknown as TilesetDef[];
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.[0].tileId).toBe('Stone');
  });

  it('upgrades terrainStrokes and wallPaths too', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/Stone', 'walls/Brick'])],
      {
        terrainStrokes: [{ id: 's1', points: [0, 0, 5, 5], radius: 10, tilesetId: 'ts1', tileId: 'Stone' }],
        wallPaths: [wallPath('ts1', 'Brick')],
      }
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].terrainStrokes?.[0].tileId).toBe('terrain/Natural/Stone');
    expect(map.layers[0].wallPaths?.[0].tileId).toBe('walls/Brick');
  });

  it('picks the first twin for ambiguous legacy ids (matches render behavior)', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/X', 'patterns/normal/Natural/X'])],
      { tiles: [placement('ts1', 'X')] }
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].tiles?.[0].tileId).toBe('terrain/Natural/X');
  });

  it('upgrades sub-hex map layers', () => {
    const map = mapWith(
      [tileset('ts1', ['terrain/Natural/Stone'])],
      {}
    );
    const sub = createNewMap('sub', 'grid');
    sub.tilesets = [];
    Object.assign(sub.layers[0], { tiles: [placement('ts1', 'Stone')] });
    map.subHexMaps = { '0,0': { mapData: sub } } as unknown as MapData['subHexMaps'];
    canonicalizeTileIds(map);
    expect(map.subHexMaps?.['0,0']?.mapData?.layers[0].tiles?.[0].tileId)
      .toBe('terrain/Natural/Stone');
  });
});

describe('wallPath tileId load filter (migrateMapData)', () => {
  it('drops wallPaths missing tilesetId or tileId', () => {
    const map = mapWith([], {
      wallPaths: [
        wallPath('ts1', 'Brick'),
        { ...wallPath('ts1', 'NoTile'), tileId: undefined as unknown as string },
        { ...wallPath('none', 'Brick'), tilesetId: 42 as unknown as string },
      ],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.map(w => w.tileId)).toEqual(['Brick']);
  });

  it('keeps valid wallPaths intact', () => {
    const map = mapWith([], { wallPaths: [wallPath('ts1', 'Brick')] });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths).toHaveLength(1);
  });
});
