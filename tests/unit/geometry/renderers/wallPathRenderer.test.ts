import { describe, it, expect } from 'vitest';
import {
  flattenWallPath,
  quadPoint,
  arcSubdivisions,
  collectWallPathImagePaths,
  computeGapSpans,
  solidWallPolylines,
  seatedLeafSize,
  renderWallPaths,
  wrapAngle,
  miterClipPoly,
  MITER_MIN_TURN,
  MITER_LIMIT,
} from '../../../../src/geometry/renderers/wallPathRenderer';
import { buildGapFlatten, pointAtLength } from '../../../../src/drawing/wallGapOperations';
import type { WallGap, WallPath } from '../../../../types/core/wallpath.types';
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

  it('enumerates seated gap-tile art (I-F8)', () => {
    const walls = [makeWall({
      tilesetId: 'ts1', tileId: 't1',
      gaps: [
        { id: 'g1', seg: 0, t: 0.5, widthCells: 1, tile: { tilesetId: 'ts1', tileId: 't2' } },
        { id: 'g2', seg: 0, t: 0.8, widthCells: 1 }, // bare — no art path
      ],
    })];
    const paths = collectWallPathImagePaths(walls, tilesets, metadata);
    expect(paths).toContain('packs/p1/paths/Path_B.webp'); // t2 seated art
    expect(paths).toContain('packs/p1/walls/Wall_A.webp');  // strip
  });
});

// ===========================================
// Gap rendering (P2)
// ===========================================

/** A fake decoded image identity for draw-call assertions. */
function fakeImg(id: string, w: number, h: number): HTMLImageElement {
  return { id, naturalWidth: w, naturalHeight: h } as unknown as HTMLImageElement;
}

interface DrawOp { m: string; args: unknown[] }

// The renderer builds a miter clip with `new Path2D()` at wall corners (closed
// loops always turn). jsdom/node has no Path2D, so stub a no-op one; straight-wall
// tests never reach this path, corner/closed-loop tests do.
if (typeof (globalThis as { Path2D?: unknown }).Path2D === 'undefined') {
  (globalThis as { Path2D?: unknown }).Path2D = class {
    moveTo(): void {}
    lineTo(): void {}
    closePath(): void {}
  };
}

/** Recording 2D context: logs every mutating call for immutability/identity checks. */
function recordingCtx(): { ctx: CanvasRenderingContext2D; ops: DrawOp[] } {
  const ops: DrawOp[] = [];
  const rec = (m: string) => (...args: unknown[]): void => { ops.push({ m, args }); };
  const ctx = {
    save: rec('save'), restore: rec('restore'),
    translate: rec('translate'), rotate: rec('rotate'), scale: rec('scale'),
    clip: rec('clip'), drawImage: rec('drawImage'),
    imageSmoothingEnabled: true, globalAlpha: 1, filter: 'none',
  } as unknown as CanvasRenderingContext2D;
  return { ctx, ops };
}

const GAP_TS = [{
  id: 'ts1', name: 'Pack', tileWidth: 256, tileHeight: 256, source: 'folder',
  folderPath: 'packs/p1', hexHeight: 256, overflowTop: 0, overflowBottom: 0,
  tiles: [
    { id: 'wall', filename: 'Wall.webp', vaultPath: 'packs/p1/walls/Wall.webp' },
    { id: 'door', filename: 'Door.webp', vaultPath: 'packs/p1/portals/Door.webp' },
  ],
}] as unknown as TilesetDef[];

const GAP_META: TileMetadataStore = {
  'packs/p1/walls/Wall.webp': { ddSourceType: 'walls', wallEndCapPath: 'packs/p1/walls/Wall_end.webp' },
};

const STRIP_IMG = fakeImg('strip', 64, 32);
const CAP_IMG = fakeImg('cap', 8, 32);
const DOOR_IMG = fakeImg('door', 256, 256);

function gapGetImage(path: string): HTMLImageElement | null {
  if (path === 'packs/p1/walls/Wall.webp') return STRIP_IMG;
  if (path === 'packs/p1/walls/Wall_end.webp') return CAP_IMG;
  if (path === 'packs/p1/portals/Door.webp') return DOOR_IMG;
  return null;
}

function renderOne(wall: WallPath, cellSize = 50): DrawOp[] {
  const { ctx, ops } = recordingCtx();
  renderWallPaths(ctx, [wall], GAP_TS, { x: 0, y: 0, zoom: 1 }, cellSize, {
    getCachedImage: gapGetImage,
    tileMetadata: GAP_META,
  });
  return ops;
}

function stripWall(overrides: Partial<WallPath> = {}): WallPath {
  return {
    id: 'w', vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }], closed: false,
    tilesetId: 'ts1', tileId: 'wall', kind: 'wall', widthScale: 1, ...overrides,
  };
}

describe('computeGapSpans', () => {
  it('returns the clamped [lo,hi] world-arc span for each gap', () => {
    // cellSize 50, widthCells 1 → world width 50, centered at t=0.5 of a 200-long seg.
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1 }] });
    const flat = buildGapFlatten(wall);
    expect(computeGapSpans(wall, flat, 50)).toEqual([[75, 125]]);
  });

  it('clamps an over-wide gap to its segment without touching stored widthCells', () => {
    // widthCells 10 → world 500 > seg 200; span caps to the whole segment.
    const gap: WallGap = { id: 'g', seg: 0, t: 0.5, widthCells: 10 };
    const wall = stripWall({ gaps: [gap] });
    const flat = buildGapFlatten(wall);
    expect(computeGapSpans(wall, flat, 50)).toEqual([[0, 200]]);
    expect(gap.widthCells).toBe(10); // stored value untouched
  });

  it('is independent of wall.flip (immutable flatten, geometry F1)', () => {
    const gaps: WallGap[] = [{ id: 'g', seg: 0, t: 0.3, widthCells: 1 }];
    const unflipped = stripWall({ gaps });
    const flipped = stripWall({ gaps, flip: true });
    expect(computeGapSpans(flipped, buildGapFlatten(flipped), 50))
      .toEqual(computeGapSpans(unflipped, buildGapFlatten(unflipped), 50));
  });
});

describe('solidWallPolylines', () => {
  function polylineLength(pts: Array<[number, number]>): number {
    let total = 0;
    for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return total;
  }

  it('returns the wall unbroken when it has no gaps', () => {
    const wall = stripWall();
    const polys = solidWallPolylines(wall, 50);
    expect(polys).toHaveLength(1);
    expect(polys[0][0]).toEqual([0, 0]);
    expect(polys[0][polys[0].length - 1]).toEqual([200, 0]);
  });

  it('cuts a mid-wall gap into two solid pieces flanking the hole', () => {
    // widthCells 1, cellSize 50 -> world width 50, centered at t=0.5 of a 200-long seg -> span [75,125].
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1 }] });
    const polys = solidWallPolylines(wall, 50);
    expect(polys).toHaveLength(2);
    const [a, b] = polys.sort((p, q) => p[0][0] - q[0][0]);
    expect(a[0][0]).toBeCloseTo(0);
    expect(a[a.length - 1][0]).toBeCloseTo(75);
    expect(b[0][0]).toBeCloseTo(125);
    expect(b[b.length - 1][0]).toBeCloseTo(200);
    // Nothing bridges the gap: total solid length excludes the 50-unit hole.
    expect(polylineLength(a) + polylineLength(b)).toBeCloseTo(150);
  });

  it('a gap flush with one end leaves a single shortened piece', () => {
    // t=0's raw center (0) clamps to half=25 so the span stays inside the
    // segment (invariant 3) -> span [0,50], leaving [50,200] solid.
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0, widthCells: 1 }] });
    const polys = solidWallPolylines(wall, 50);
    expect(polys).toHaveLength(1);
    expect(polys[0][0][0]).toBeCloseTo(50);
    expect(polys[0][polys[0].length - 1][0]).toBeCloseTo(200);
  });

  it('respects the clamp-at-derive width when the gap is wider than its segment', () => {
    // widthCells 10 -> world 500 > seg 200; the derived span caps to the whole
    // segment (invariant 3), so the wall is fully open — no solid pieces.
    const gap: WallGap = { id: 'g', seg: 0, t: 0.5, widthCells: 10 };
    const wall = stripWall({ gaps: [gap] });
    expect(solidWallPolylines(wall, 50)).toEqual([]);
    expect(gap.widthCells).toBe(10); // stored value untouched
  });

  it('two non-overlapping gaps on one wall cut three solid pieces', () => {
    // Segment length 200; two 1-cell (50-wide) gaps centered at t=0.25 and t=0.75.
    const wall = stripWall({
      gaps: [
        { id: 'g1', seg: 0, t: 0.25, widthCells: 1 },
        { id: 'g2', seg: 0, t: 0.75, widthCells: 1 },
      ],
    });
    const polys = solidWallPolylines(wall, 50).sort((p, q) => p[0][0] - q[0][0]);
    expect(polys).toHaveLength(3);
    expect(polys[0][0][0]).toBeCloseTo(0);
    expect(polys[0][polys[0].length - 1][0]).toBeCloseTo(25);
    expect(polys[1][0][0]).toBeCloseTo(75);
    expect(polys[1][polys[1].length - 1][0]).toBeCloseTo(125);
    expect(polys[2][0][0]).toBeCloseTo(175);
    expect(polys[2][polys[2].length - 1][0]).toBeCloseTo(200);
  });

  it('is independent of wall.flip (immutable flatten, geometry F1)', () => {
    const gaps: WallGap[] = [{ id: 'g', seg: 0, t: 0.3, widthCells: 1 }];
    const unflipped = solidWallPolylines(stripWall({ gaps }), 50);
    const flipped = solidWallPolylines(stripWall({ gaps, flip: true }), 50);
    expect(flipped).toEqual(unflipped);
  });
});

describe('seatedLeafSize', () => {
  it('fills the gap width (aspect preserved) at widthScale 1', () => {
    const { w, h } = seatedLeafSize(50, 256, 256, 1, undefined);
    expect(w).toBe(50);
    expect(h).toBeCloseTo(50); // square door → square leaf
  });

  it('perpendicular leaf height tracks the host wall widthScale (geometry F3)', () => {
    const thin = seatedLeafSize(50, 256, 256, 1, undefined);
    const thick = seatedLeafSize(50, 256, 256, 2, undefined);
    expect(thick.w).toBe(thin.w);           // along-wall unchanged
    expect(thick.h).toBeCloseTo(thin.h * 2); // leaf height doubles with the wall
  });

  it('applies heightScale on top of the widthScale default', () => {
    const base = seatedLeafSize(50, 256, 256, 2, undefined);
    const tall = seatedLeafSize(50, 256, 256, 2, 1.5);
    expect(tall.h).toBeCloseTo(base.h * 1.5);
  });
});

describe('renderWallPaths — gap rendering', () => {
  it('cuts the strip into solid pieces flanking the gap', () => {
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1 }] });
    const ops = renderOne(wall);
    const stripDraws = ops.filter(o => o.m === 'drawImage' && o.args[0] === STRIP_IMG);
    // Two solid runs: [0,75] and [125,200] in segment-local dest x (args[5]).
    const destX = stripDraws.map(o => o.args[5] as number).sort((a, b) => a - b);
    expect(destX[0]).toBeCloseTo(0);
    expect(destX.some(x => x >= 125 - 1e-6)).toBe(true);
    // Nothing is drawn starting inside the hole (75..125), exclusive of the right edge.
    expect(stripDraws.some(o => {
      const x = o.args[5] as number;
      return x > 75 + 1e-6 && x < 125 - 1e-6;
    })).toBe(false);
  });

  it('frames the gap with edge caps and seats the door on top', () => {
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1, tile: { tilesetId: 'ts1', tileId: 'door' } }] });
    const ops = renderOne(wall);
    const capDraws = ops.filter(o => o.m === 'drawImage' && o.args[0] === CAP_IMG);
    // 2 terminus caps (open wall) + 2 gap-edge caps.
    expect(capDraws.length).toBe(4);
    const doorDraws = ops.filter(o => o.m === 'drawImage' && o.args[0] === DOOR_IMG);
    expect(doorDraws.length).toBe(1);
    // Seated leaf spans the 50-unit gap centered on origin (dest [-25..25]).
    expect(doorDraws[0].args[1]).toBeCloseTo(-25); // -w/2
    expect(doorDraws[0].args[3]).toBeCloseTo(50);  // w
  });

  it('a bare gap (no tile) draws holes + caps but no seated art', () => {
    const wall = stripWall({ gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1 }] });
    const ops = renderOne(wall);
    expect(ops.some(o => o.m === 'drawImage' && o.args[0] === DOOR_IMG)).toBe(false);
    expect(ops.filter(o => o.m === 'drawImage' && o.args[0] === CAP_IMG).length).toBe(4);
  });

  it('two consecutive renders of a flipped wall are byte-identical (flatten immutability, geometry F1)', () => {
    const wall = stripWall({
      flip: true,
      vertices: [{ x: 0, y: 0, arc: [100, 60] }, { x: 200, y: 0 }],
      gaps: [{ id: 'g', seg: 0, t: 0.5, widthCells: 1, tile: { tilesetId: 'ts1', tileId: 'door' } }],
    });
    const first = renderOne(wall);
    const second = renderOne(wall);
    expect(second).toEqual(first);
  });

  it('flipped and unflipped walls place the gap + seated art identically (only texture-u differs)', () => {
    const gaps: WallGap[] = [{ id: 'g', seg: 0, t: 0.4, widthCells: 1, tile: { tilesetId: 'ts1', tileId: 'door' } }];
    const doorXform = (ops: DrawOp[]): unknown[] => {
      const i = ops.findIndex(o => o.m === 'drawImage' && o.args[0] === DOOR_IMG);
      // capture the translate() immediately preceding the seated drawImage
      const t = [...ops.slice(0, i)].reverse().find(o => o.m === 'translate');
      return t?.args ?? [];
    };
    const un = renderOne(stripWall({ gaps }));
    const fl = renderOne(stripWall({ gaps, flip: true }));
    expect(doorXform(fl)).toEqual(doorXform(un));
  });

  it('flipped strip overlap bleeds forward, never into a gap start (matches unflipped intervals)', () => {
    // Reviewer scenario: 200-unit wall, worldScale = 50/256 ≈ 0.195, srcW = 64,
    // a 50-unit gap at t=0.5 → hole [75,125]. The solid piece AFTER the gap needs
    // 2+ texture chunks; its first chunk's CHUNK_OVERLAP must extend forward (+arc)
    // like the unflipped path, not backward into the [75,125] hole.
    const gaps: WallGap[] = [{ id: 'g', seg: 0, t: 0.5, widthCells: 1 }];

    // Segment-local dest x-interval each strip chunk actually paints. Unflipped
    // draws at args[5] with width args[7]; flipped mirrors about the translate that
    // precedes it (dest = [tx - w, tx]).
    const stripIntervals = (ops: DrawOp[], flip: boolean): Array<[number, number]> => {
      const out: Array<[number, number]> = [];
      for (let i = 0; i < ops.length; i++) {
        const o = ops[i];
        if (o.m !== 'drawImage' || o.args[0] !== STRIP_IMG) continue;
        const w = o.args[7] as number;
        if (flip) {
          const tr = [...ops.slice(0, i)].reverse().find(op => op.m === 'translate');
          const tx = tr!.args[0] as number;
          out.push([tx - w, tx]);
        } else {
          const x = o.args[5] as number;
          out.push([x, x + w]);
        }
      }
      return out.sort((a, b) => a[0] - b[0]);
    };

    const un = stripIntervals(renderOne(stripWall({ gaps })), false);
    const fl = stripIntervals(renderOne(stripWall({ gaps, flip: true })), true);

    // No strip chunk (flipped OR unflipped) paints inside the open hole (75,125):
    // every interval sits entirely at/left of 75 or at/right of 125. The old flip
    // bled the post-gap piece's first chunk back to x=124.5.
    const clearsHole = ([lo, hi]: [number, number]): boolean => hi <= 75 + 1e-6 || lo >= 125 - 1e-6;
    expect(fl.every(clearsHole)).toBe(true);
    expect(un.every(clearsHole)).toBe(true);

    // Flip and unflip paint the SAME solid intervals (only the source-u differs).
    expect(fl.length).toBe(un.length);
    for (let i = 0; i < fl.length; i++) {
      expect(fl[i][0]).toBeCloseTo(un[i][0]);
      expect(fl[i][1]).toBeCloseTo(un[i][1]);
    }
  });
});

describe('renderWallPaths — closed-loop caps (§4.3)', () => {
  // Closing segment is index V-1 = 2 (vertices[2] -> vertices[0]).
  const closedVerts = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 200 }];

  it('draws no terminus caps and exactly 2 gap-edge caps for a gap on the closing segment', () => {
    const wall = stripWall({
      vertices: closedVerts, closed: true,
      gaps: [{ id: 'g', seg: 2, t: 0.5, widthCells: 1 }],
    });
    const caps = renderOne(wall).filter(o => o.m === 'drawImage' && o.args[0] === CAP_IMG);
    // Closed loops get NO terminus caps; the one gap contributes exactly 2 edge caps.
    expect(caps.length).toBe(2);
  });

  it('a closed loop with no gaps draws zero caps (no termini to cap)', () => {
    const wall = stripWall({ vertices: closedVerts, closed: true });
    const caps = renderOne(wall).filter(o => o.m === 'drawImage' && o.args[0] === CAP_IMG);
    expect(caps.length).toBe(0);
  });
});

describe('gap world position — no bow-depth jitter (geometry F6)', () => {
  it('gap center moves smoothly (no quantization steps) as a bow deepens', () => {
    const gap: WallGap = { id: 'g', seg: 0, t: 0.7, widthCells: 1 };
    const centers: Array<{ x: number; y: number }> = [];
    // Sweep the arc control-point depth across arcSubdivisions quantization
    // boundaries (dev steps of 4 in the adaptive count).
    for (let depth = 20; depth <= 60; depth += 1) {
      const wall = stripWall({ vertices: [{ x: 0, y: 0, arc: [100, depth] }, { x: 200, y: 0 }], gaps: [gap] });
      const flat = buildGapFlatten(wall);
      const [lo, hi] = computeGapSpans(wall, flat, 50)[0];
      centers.push(pointAtLength(flat, (lo + hi) / 2));
    }
    // Every adjacent step must be a small continuous move — no discrete jump
    // that a quantized (adaptive) flatten would produce at a subdivision boundary.
    let maxStep = 0;
    for (let i = 1; i < centers.length; i++) {
      maxStep = Math.max(maxStep, Math.hypot(centers[i].x - centers[i - 1].x, centers[i].y - centers[i - 1].y));
    }
    expect(maxStep).toBeLessThan(2);
  });
});
