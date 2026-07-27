/**
 * Unit tests for WallGap load-migration and save-time canonicalization.
 *
 * Load migration drops ONLY structurally-invalid gaps (integrity F1) and NEVER
 * destroys a gap.tile binding (integrity F2). Geometric invariants (door wider
 * than segment, overlap) are clamp/nudge-at-derive, not migration's job (§2.5).
 * canonicalizeTileIds rewrites gap.tile.tileId resolve-only, top-level and
 * sub-hex (integrity F7).
 */

import { describe, it, expect } from 'vitest';
import { migrateMapData, canonicalizeTileIds, createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';
import type { TilesetDef } from '../../../types/tiles/tile.types';
import type { WallGap, WallPath } from '../../../types/core/wallpath.types';

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

function wallWith(gaps: unknown[], over: Partial<WallPath> = {}): WallPath {
  return {
    id: 'wp-1',
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }],
    closed: false,
    tilesetId: 'ts1',
    tileId: 'walls/Brick',
    kind: 'wall',
    widthScale: 1,
    gaps: gaps as WallGap[],
    ...over,
  };
}

function mapWith(tilesets: TilesetDef[], layerData: Record<string, unknown>): MapData {
  const map = createNewMap('test', 'grid');
  map.tilesets = tilesets;
  Object.assign(map.layers[0], layerData);
  return map;
}

const goodGap = (over: Partial<WallGap> = {}): WallGap =>
  ({ id: 'g1', seg: 0, t: 0.5, widthCells: 1, ...over });

describe('WallGap load migration (sanitizeWallGaps)', () => {
  it('keeps structurally-valid gaps', () => {
    const map = mapWith([], { wallPaths: [wallWith([goodGap()])] });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.[0].gaps).toHaveLength(1);
  });

  it('drops only structurally-invalid gaps (bad t / widthCells<=0 / seg out of range)', () => {
    const map = mapWith([], {
      wallPaths: [wallWith([
        goodGap({ id: 'ok' }),
        goodGap({ id: 'badT', t: 1.5 }),
        goodGap({ id: 'nanT', t: Number.NaN }),
        goodGap({ id: 'zeroW', widthCells: 0 }),
        goodGap({ id: 'negW', widthCells: -2 }),
        goodGap({ id: 'segOOR', seg: 5 }),        // segCount = 2 (3 verts, open)
        { seg: 0, t: 0.5, widthCells: 1 },         // missing id → dropped
        null,
      ])],
    });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.[0].gaps?.map(g => g.id)).toEqual(['ok']);
  });

  it('does NOT drop an invariant-3 violation (door wider than segment) and keeps its tile', () => {
    const map = mapWith([], {
      wallPaths: [wallWith([
        goodGap({ id: 'wide', widthCells: 999, tile: { tilesetId: 'ts1', tileId: 'portals/Door' } }),
      ])],
    });
    const migrated = migrateMapData(map);
    const gaps = migrated.layers[0].wallPaths?.[0].gaps;
    expect(gaps).toHaveLength(1);
    expect(gaps?.[0].widthCells).toBe(999); // stored verbatim
    expect(gaps?.[0].tile?.tileId).toBe('portals/Door');
  });

  it('normalizes an empty gaps array to undefined', () => {
    const map = mapWith([], { wallPaths: [wallWith([])] });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.[0].gaps).toBeUndefined();
  });

  it('removes a gaps field that is not an array', () => {
    const map = mapWith([], { wallPaths: [wallWith('nope' as unknown as unknown[])] });
    const migrated = migrateMapData(map);
    expect(migrated.layers[0].wallPaths?.[0].gaps).toBeUndefined();
  });

  it('is idempotent', () => {
    const map = mapWith([], { wallPaths: [wallWith([goodGap({ tile: { tilesetId: 'ts1', tileId: 'portals/Door' } })])] });
    const once = migrateMapData(map);
    const twice = migrateMapData(JSON.parse(JSON.stringify(once)) as MapData);
    expect(twice.layers[0].wallPaths?.[0].gaps).toEqual(once.layers[0].wallPaths?.[0].gaps);
  });

  it('sanitizes gaps in sub-hex layers too', () => {
    const map = mapWith([], {});
    const sub = createNewMap('sub', 'grid');
    Object.assign(sub.layers[0], {
      wallPaths: [wallWith([goodGap({ id: 'ok' }), goodGap({ id: 'segOOR', seg: 9 })])],
    });
    map.subHexMaps = { '0,0': { mapData: sub } } as unknown as MapData['subHexMaps'];
    const migrated = migrateMapData(map);
    const gaps = migrated.subHexMaps?.['0,0']?.mapData?.layers[0].wallPaths?.[0].gaps;
    expect(gaps?.map(g => g.id)).toEqual(['ok']);
  });

  it('keeps gapless walls byte-identical through a JSON round-trip', () => {
    const wall: WallPath = {
      id: 'wall-plain',
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0, arc: [150, 50] }, { x: 200, y: 100 }],
      closed: true,
      tilesetId: 'ts1',
      tileId: 'walls/Brick',
      kind: 'wall',
      widthScale: 1.5,
      tint: 'aabbcc',
      flip: true,
    };
    const map = mapWith([], { wallPaths: [wall] });
    const before = JSON.stringify(map);
    const roundTripped = migrateMapData(JSON.parse(JSON.stringify(map)) as MapData);
    expect(roundTripped.layers[0].wallPaths?.[0]).toEqual(wall);
    expect(roundTripped.layers[0].wallPaths?.[0]).not.toHaveProperty('gaps');
    // migration must not have mutated the original either
    expect(JSON.stringify(map)).toBe(before);
  });
});

describe('canonicalizeTileIds — gap.tile.tileId', () => {
  it('rewrites a legacy basename gap tile id to its folder-relative form (resolve-only)', () => {
    const map = mapWith(
      [tileset('ts1', ['walls/Brick', 'portals/Door_256'])],
      { wallPaths: [wallWith([goodGap({ tile: { tilesetId: 'ts1', tileId: 'Door_256' } })])] },
    );
    canonicalizeTileIds(map);
    expect(map.layers[0].wallPaths?.[0].gaps?.[0].tile?.tileId).toBe('portals/Door_256');
  });

  it('never nulls an unresolved gap tile binding (kept verbatim)', () => {
    const map = mapWith(
      [tileset('ts1', ['walls/Brick'])],
      { wallPaths: [wallWith([goodGap({ tile: { tilesetId: 'ts1', tileId: 'portals/Ghost' } })])] },
    );
    canonicalizeTileIds(map);
    const tile = map.layers[0].wallPaths?.[0].gaps?.[0].tile;
    expect(tile).toBeDefined();
    expect(tile?.tileId).toBe('portals/Ghost');
  });

  it('leaves a bare gap (no tile) alone', () => {
    const map = mapWith(
      [tileset('ts1', ['walls/Brick', 'portals/Door_256'])],
      { wallPaths: [wallWith([goodGap()])] },
    );
    expect(() => canonicalizeTileIds(map)).not.toThrow();
    expect(map.layers[0].wallPaths?.[0].gaps?.[0].tile).toBeUndefined();
  });

  it('canonicalizes gap tile ids in sub-hex layers', () => {
    const map = mapWith([tileset('ts1', ['portals/Door_256'])], {});
    const sub = createNewMap('sub', 'grid');
    sub.tilesets = [];
    Object.assign(sub.layers[0], {
      wallPaths: [wallWith([goodGap({ tile: { tilesetId: 'ts1', tileId: 'Door_256' } })])],
    });
    map.subHexMaps = { '0,0': { mapData: sub } } as unknown as MapData['subHexMaps'];
    canonicalizeTileIds(map);
    expect(map.subHexMaps?.['0,0']?.mapData?.layers[0].wallPaths?.[0].gaps?.[0].tile?.tileId)
      .toBe('portals/Door_256');
  });
});
