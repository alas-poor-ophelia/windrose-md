import { describe, it, expect } from 'vitest';
import {
  flattenWallPath,
  quadPoint,
  arcSubdivisions,
  collectWallPathImagePaths,
  wrapAngle,
  miterClipPoly,
  MITER_MIN_TURN,
  MITER_LIMIT,
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

describe('wrapAngle', () => {
  it('wraps into (-PI, PI]', () => {
    expect(wrapAngle(0)).toBe(0);
    expect(wrapAngle(Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-Math.PI)).toBeCloseTo(Math.PI); // -PI maps to +PI
    expect(wrapAngle(3 * Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe('miterClipPoly', () => {
  const halfW = 10;
  const segLen = 100;
  const overlap = 0.5;

  it('returns null when both joints are straight enough to skip', () => {
    expect(miterClipPoly(0, 0, segLen, halfW, overlap)).toBeNull();
    expect(miterClipPoly(MITER_MIN_TURN * 0.9, -MITER_MIN_TURN * 0.9, segLen, halfW, overlap)).toBeNull();
  });

  it('slants the end edge along the bisector for a 90° turn', () => {
    // turnOut = +90°: seam offset at y is -y·tan(45°) = -y.
    const poly = miterClipPoly(0, Math.PI / 2, segLen, halfW, overlap);
    expect(poly).not.toBeNull();
    const [[xs0], [xeTop, yTop], [xeBot, yBot], [xs1]] = poly!;
    expect(yTop).toBe(-halfW);
    expect(yBot).toBe(halfW);
    expect(xeTop).toBeCloseTo(segLen + halfW);  // outer side keeps the corner
    expect(xeBot).toBeCloseTo(segLen - halfW);  // inner side yields the wedge
    // Unclipped start edge sits before the drawn rect (x=0).
    expect(xs0).toBeLessThan(0);
    expect(xs1).toBeLessThan(0);
  });

  it('slants the start edge for a 45° incoming turn', () => {
    // turnIn = +45°: seam offset at y is y·tan(22.5°).
    const k = Math.tan(Math.PI / 8);
    const poly = miterClipPoly(Math.PI / 4, 0, segLen, halfW, overlap)!;
    expect(poly[0][0]).toBeCloseTo(-halfW * k); // top (y=-halfW)
    expect(poly[3][0]).toBeCloseTo(halfW * k);  // bottom (y=+halfW)
    // Unclipped end edge extends past segLen + overlap.
    expect(poly[1][0]).toBeGreaterThan(segLen + overlap);
  });

  it('clamps near-U-turn seams to the miter limit (bevel fallback)', () => {
    const poly = miterClipPoly(0, Math.PI * 0.98, segLen, halfW, overlap)!;
    const maxOff = MITER_LIMIT * halfW;
    expect(Math.abs(poly[1][0] - segLen)).toBeLessThanOrEqual(maxOff + 1e-9);
    expect(Math.abs(poly[2][0] - segLen)).toBeLessThanOrEqual(maxOff + 1e-9);
  });

  it('mirrors the seam for a negative (left) turn', () => {
    // Left turn swaps which side keeps the corner vs. a right turn.
    const left = miterClipPoly(0, -Math.PI / 2, segLen, halfW, overlap)!;
    expect(left[1][0]).toBeCloseTo(segLen - halfW);
    expect(left[2][0]).toBeCloseTo(segLen + halfW);
  });
});

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
