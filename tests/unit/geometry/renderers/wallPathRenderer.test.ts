import { describe, it, expect } from 'vitest';
import {
  flattenWallPath,
  quadPoint,
  arcSubdivisions,
  collectWallPathImagePaths,
} from '../../../../src/geometry/renderers/wallPathRenderer';
import type { WallPath } from '../../../../types/core/wallpath.types';
import type { TilesetDef, TileMetadataStore } from '../../../../types/tiles/tile.types';

function makeWall(overrides: Partial<WallPath> = {}): WallPath {
  return {
    id: 'w1',
    vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }],
    closed: false,
    tilesetId: 'ts1',
    tileId: 't1',
    kind: 'wall',
    widthScale: 1,
    ...overrides,
  };
}

describe('quadPoint', () => {
  it('hits endpoints at t=0 and t=1', () => {
    expect(quadPoint(0, 0, 50, 100, 100, 0, 0)).toEqual([0, 0]);
    expect(quadPoint(0, 0, 50, 100, 100, 0, 1)).toEqual([100, 0]);
  });

  it('bows toward the control point at t=0.5', () => {
    // Quadratic at t=0.5: 0.25*P0 + 0.5*C + 0.25*P1 = (50, 50) for C=(50,100)
    const [x, y] = quadPoint(0, 0, 50, 100, 100, 0, 0.5);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(50);
  });
});

describe('arcSubdivisions', () => {
  it('gives more pieces for deeper bows', () => {
    const shallow = arcSubdivisions(0, 0, 50, 10, 100, 0);
    const deep = arcSubdivisions(0, 0, 50, 120, 100, 0);
    expect(deep).toBeGreaterThan(shallow);
    expect(shallow).toBeGreaterThanOrEqual(8);
    expect(deep).toBeLessThanOrEqual(48);
  });
});

describe('flattenWallPath', () => {
  it('passes straight polylines through unchanged', () => {
    const wp = makeWall({
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
    });
    const flat = flattenWallPath(wp);
    expect(flat.points).toEqual([[0, 0], [100, 0], [100, 50]]);
    expect(flat.totalLength).toBeCloseTo(150);
  });

  it('subdivides arc segments', () => {
    const wp = makeWall({
      vertices: [{ x: 0, y: 0, arc: [50, 80] }, { x: 100, y: 0 }],
    });
    const flat = flattenWallPath(wp);
    expect(flat.points.length).toBeGreaterThan(5);
    expect(flat.points[0]).toEqual([0, 0]);
    expect(flat.points[flat.points.length - 1]).toEqual([100, 0]);
    // Curved length must exceed the 100-unit chord
    expect(flat.totalLength).toBeGreaterThan(100);
  });

  it('closes loops with an implicit final segment', () => {
    const wp = makeWall({
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }],
      closed: true,
    });
    const flat = flattenWallPath(wp);
    const last = flat.points[flat.points.length - 1];
    expect(last).toEqual([0, 0]);
    // 100 + 100 + hypot(100,100)
    expect(flat.totalLength).toBeCloseTo(200 + Math.hypot(100, 100));
  });

  it('curves the closing segment via the last vertex arc', () => {
    const wp = makeWall({
      vertices: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100, arc: [0, 100] }],
      closed: true,
    });
    const flat = flattenWallPath(wp);
    const last = flat.points[flat.points.length - 1];
    expect(last[0]).toBeCloseTo(0);
    expect(last[1]).toBeCloseTo(0);
    // Closing leg is curved, so total exceeds the straight-closed perimeter
    expect(flat.totalLength).toBeGreaterThan(200 + Math.hypot(100, 100));
  });

  it('returns empty for degenerate paths', () => {
    const wp = makeWall({ vertices: [{ x: 0, y: 0 }] });
    expect(flattenWallPath(wp).points).toEqual([]);
  });
});

describe('collectWallPathImagePaths', () => {
  const tilesets = [{
    id: 'ts1',
    name: 'Pack',
    tileWidth: 64,
    tileHeight: 64,
    source: 'folder',
    folderPath: 'packs/p1',
    hexHeight: 64,
    overflowTop: 0,
    overflowBottom: 0,
    tiles: [
      { id: 't1', filename: 'Wall_A.webp', vaultPath: 'packs/p1/walls/Wall_A.webp' },
      { id: 't2', filename: 'Path_B.webp', vaultPath: 'packs/p1/paths/Path_B.webp' },
    ],
  }] as unknown as TilesetDef[];

  const metadata: TileMetadataStore = {
    'packs/p1/walls/Wall_A.webp': {
      ddSourceType: 'walls',
      wallEndCapPath: 'packs/p1/walls/Wall_A_end.webp',
    },
  };

  it('collects strip paths and end caps, deduped', () => {
    const walls = [
      makeWall({ tilesetId: 'ts1', tileId: 't1' }),
      makeWall({ id: 'w2', tilesetId: 'ts1', tileId: 't1' }),
      makeWall({ id: 'w3', tilesetId: 'ts1', tileId: 't2' }),
    ];
    const paths = collectWallPathImagePaths(walls, tilesets, metadata);
    expect(paths.sort()).toEqual([
      'packs/p1/paths/Path_B.webp',
      'packs/p1/walls/Wall_A.webp',
      'packs/p1/walls/Wall_A_end.webp',
    ]);
  });

  it('skips unresolvable refs', () => {
    const walls = [makeWall({ tilesetId: 'missing', tileId: 'nope' })];
    expect(collectWallPathImagePaths(walls, tilesets, metadata)).toEqual([]);
  });
});
