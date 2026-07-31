/**
 * Unit tests for wallGapOperations — the pure gap-math module (projectToWall,
 * reprojectGap, insert/delete remap, invariant sweep, clamp, subtractIntervals).
 * All geometry is world-space; no Obsidian.
 */

import { describe, it, expect } from 'vitest';
import {
  GAP_ARC_SUBDIVISIONS,
  MIN_GAP_CELLS,
  buildGapFlatten,
  gapCenterWorld,
  projectToWall,
  reprojectGap,
  clampWidthCells,
  clampGapToSegment,
  sweepGapInvariants,
  remapGapsAfterInsertVertex,
  remapGapsAfterDeleteVertex,
  snapInsertPointOutsideGaps,
  subtractIntervals,
  createWallGap,
  planGapInsert,
  gapHandleAnchors,
  findGapOnWallAtPoint,
  resolveGapMove,
  resolveGapEdgeResize,
} from '../../../src/drawing/wallGapOperations';
import type { WallGap, WallPath, WallVertex } from '../../../types/core/wallpath.types';

const CELL = 50;

function wall(vertices: WallVertex[], closed = false): Pick<WallPath, 'vertices' | 'closed'> {
  return { vertices, closed };
}

function gap(seg: number, t: number, widthCells: number, over: Partial<WallGap> = {}): WallGap {
  return { id: 'g-' + seg + '-' + t, seg, t, widthCells, ...over };
}

// ---------------------------------------------------------------------------
// projectToWall
// ---------------------------------------------------------------------------

describe('projectToWall', () => {
  it('projects onto a straight single segment (center)', () => {
    const p = projectToWall(wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]), 50, 10);
    expect(p).not.toBeNull();
    expect(p!.seg).toBe(0);
    expect(p!.t).toBeCloseTo(0.5, 6);
    expect(p!.lenAlong).toBeCloseTo(50, 6);
    expect(p!.dist).toBeCloseTo(10, 6);
  });

  it('selects the correct segment on a multi-segment wall', () => {
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const p = projectToWall(w, 100, 50);
    expect(p!.seg).toBe(1);
    expect(p!.t).toBeCloseTo(0.5, 6);
    expect(p!.lenAlong).toBeCloseTo(150, 6);
  });

  it('projects onto a single-arc segment near the apex', () => {
    // segment 0 bows up via vertex[0].arc; apex near (50, 25) for control (50,50)
    const w = wall([{ x: 0, y: 0, arc: [50, 50] }, { x: 100, y: 0 }]);
    const p = projectToWall(w, 50, 30);
    expect(p!.seg).toBe(0);
    expect(p!.t).toBeCloseTo(0.5, 1);
  });

  it('handles a multi-arc wall', () => {
    const w = wall([
      { x: 0, y: 0, arc: [50, 40] },
      { x: 100, y: 0, arc: [150, -40] },
      { x: 200, y: 0 },
    ]);
    const p = projectToWall(w, 150, -20);
    expect(p!.seg).toBe(1);
  });

  it('projects onto the closing segment of a closed loop', () => {
    // triangle; closing segment is index 2 (v2 -> v0)
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }], true);
    const p = projectToWall(w, 25, 50); // near the v2->v0 edge
    expect(p!.seg).toBe(2);
  });

  it('clamps a point beyond the end to t=1', () => {
    const p = projectToWall(wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]), 500, 0);
    expect(p!.seg).toBe(0);
    expect(p!.t).toBeCloseTo(1, 6);
  });
});

// ---------------------------------------------------------------------------
// reprojectGap + round-trip stability
// ---------------------------------------------------------------------------

describe('reprojectGap', () => {
  it('is an identity when old and new flatten match', () => {
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
    const flat = buildGapFlatten(w);
    const g = gap(1, 0.5, 1);
    const r = reprojectGap(g, flat, flat);
    expect(r.seg).toBe(1);
    expect(r.t).toBeCloseTo(0.5, 6);
    expect(r.widthCells).toBe(1);
  });

  it('preserves the gap center world point across a geometry change', () => {
    const oldW = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const newW = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]); // merged
    const oldFlat = buildGapFlatten(oldW);
    const newFlat = buildGapFlatten(newW);
    const g = gap(1, 0.5, 1); // world center (150, 0)
    const before = gapCenterWorld(g, oldFlat);
    const r = reprojectGap(g, oldFlat, newFlat);
    const after = gapCenterWorld(r, newFlat);
    expect(after.x).toBeCloseTo(before.x, 4);
    expect(after.y).toBeCloseTo(before.y, 4);
    expect(r.widthCells).toBe(1);
  });

  it('round-trips arc-length ↔ {seg,t} (projectToWall of a gap center returns the gap)', () => {
    const w = wall([{ x: 0, y: 0 }, { x: 100, y: 0, arc: [150, 60] }, { x: 200, y: 0 }]);
    const flat = buildGapFlatten(w);
    const g = gap(1, 0.4, 1);
    const c = gapCenterWorld(g, flat);
    const p = projectToWall(w, c.x, c.y);
    expect(p!.seg).toBe(1);
    expect(p!.t).toBeCloseTo(0.4, 3);
  });

  it('gap stays put under an unrelated-segment vertex drag (class A, no remap)', () => {
    const g = gap(1, 0.5, 1);
    const flatA = buildGapFlatten(wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]));
    const flatB = buildGapFlatten(wall([{ x: 0, y: 80 }, { x: 100, y: 0 }, { x: 200, y: 0 }]));
    // seg 1 endpoints unchanged → same seg/t maps to the same world point.
    const a = gapCenterWorld(g, flatA);
    const b = gapCenterWorld(g, flatB);
    expect(b.x).toBeCloseTo(a.x, 6);
    expect(b.y).toBeCloseTo(a.y, 6);
  });
});

// ---------------------------------------------------------------------------
// Stable parameterization (geometry F6)
// ---------------------------------------------------------------------------

describe('stable gap flatten (geometry F6)', () => {
  it('uses a fixed subdivision count regardless of bow depth', () => {
    const shallow = buildGapFlatten(wall([{ x: 0, y: 0, arc: [50, 2] }, { x: 100, y: 0 }]));
    const deep = buildGapFlatten(wall([{ x: 0, y: 0, arc: [50, 400] }, { x: 100, y: 0 }]));
    // one arced logical segment → GAP_ARC_SUBDIVISIONS sub-points + the start point
    expect(shallow.points.length).toBe(GAP_ARC_SUBDIVISIONS + 1);
    expect(deep.points.length).toBe(GAP_ARC_SUBDIVISIONS + 1);
  });

  it('moves a mid-arc gap smoothly (no jitter) as the bow deepens', () => {
    const g = gap(0, 0.4, 1);
    let prevX = Infinity;
    const deltas: number[] = [];
    let lastCenter: number | null = null;
    for (let bow = 0; bow <= 120; bow += 5) {
      const flat = buildGapFlatten(wall([{ x: 0, y: 0, arc: [50, bow] }, { x: 100, y: 0 }]));
      const c = gapCenterWorld(g, flat);
      if (lastCenter != null) deltas.push(Math.abs(c.y - lastCenter));
      lastCenter = c.y;
      prevX = c.x;
    }
    expect(Number.isFinite(prevX)).toBe(true);
    // Every step is small and comparable — no discrete quantization jump.
    const maxDelta = Math.max(...deltas);
    expect(maxDelta).toBeLessThan(5);
  });
});

// ---------------------------------------------------------------------------
// Insert-vertex remap
// ---------------------------------------------------------------------------

describe('remapGapsAfterInsertVertex', () => {
  it('re-homes gaps onto the correct split half (both sides), preserving world center', () => {
    const oldW = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const newW = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const oldFlat = buildGapFlatten(oldW);
    const newFlat = buildGapFlatten(newW);
    const gaps = [gap(0, 0.25, 1), gap(0, 0.75, 1)]; // world x=50, x=150
    const worlds = gaps.map(g => gapCenterWorld(g, oldFlat));
    const remapped = remapGapsAfterInsertVertex(gaps, oldW, newW, CELL);
    expect(remapped).toHaveLength(2);
    expect(remapped[0].seg).toBe(0);
    expect(remapped[1].seg).toBe(1);
    remapped.forEach((r, i) => {
      const after = gapCenterWorld(r, newFlat);
      expect(after.x).toBeCloseTo(worlds[i].x, 3);
    });
  });

  it('reprojects across a bowed segment whose arc is flattened by the insert (geometry F4)', () => {
    // The insert path deletes the split segment's arc; new geometry is the chord.
    const oldW = wall([{ x: 0, y: 0, arc: [100, 80] }, { x: 200, y: 0 }]);
    const newW = wall([{ x: 0, y: 0 }, { x: 100, y: 40 }, { x: 200, y: 0 }]); // arc removed
    const remapped = remapGapsAfterInsertVertex([gap(0, 0.5, 1)], oldW, newW, CELL);
    expect(remapped).toHaveLength(1);
    // Reprojected onto the new (flattened) geometry — lands on a real segment.
    expect(remapped[0].seg === 0 || remapped[0].seg === 1).toBe(true);
    expect(remapped[0].t).toBeGreaterThanOrEqual(0);
    expect(remapped[0].t).toBeLessThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Delete-vertex remap
// ---------------------------------------------------------------------------

describe('remapGapsAfterDeleteVertex', () => {
  it('merges segments and preserves the gap world center', () => {
    const oldW = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const newW = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]); // vertex 1 deleted
    const oldFlat = buildGapFlatten(oldW);
    const newFlat = buildGapFlatten(newW);
    const g = gap(1, 0.5, 1); // world x=150
    const before = gapCenterWorld(g, oldFlat);
    const remapped = remapGapsAfterDeleteVertex([g], oldW, newW, CELL);
    expect(remapped).toHaveLength(1);
    expect(remapped[0].seg).toBe(0);
    expect(gapCenterWorld(remapped[0], newFlat).x).toBeCloseTo(before.x, 3);
  });

  it('nudges two near-corner gaps apart after the corner is deleted (integrity F3)', () => {
    // Gap A on seg0 (world 85), Gap B on seg1 (world 115), each 1 cell (50 world)
    // wide. Each fits its own segment; after merging into one long segment their
    // spans [60,110] and [90,140] overlap → the sweep must nudge B clear of A.
    const oldW = wall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 200, y: 0 }]);
    const newW = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const gaps = [gap(0, 0.85, 1, { id: 'A' }), gap(1, 0.15, 1, { id: 'B' })];
    const remapped = remapGapsAfterDeleteVertex(gaps, oldW, newW, CELL);
    expect(remapped).toHaveLength(2);
    const newFlat = buildGapFlatten(newW);
    const spans = remapped
      .map(g => clampGapToSegment(g, newFlat, CELL))
      .sort((a, b) => a.lo - b.lo);
    // No overlap survives.
    for (let i = 1; i < spans.length; i++) {
      expect(spans[i].lo).toBeGreaterThanOrEqual(spans[i - 1].hi - 1e-6);
    }
  });
});

// ---------------------------------------------------------------------------
// Invariant sweep + clamp
// ---------------------------------------------------------------------------

describe('sweepGapInvariants', () => {
  it('leaves a well-placed non-overlapping gap untouched', () => {
    const flat = buildGapFlatten(wall([{ x: 0, y: 0 }, { x: 500, y: 0 }]));
    const g = gap(0, 0.5, 1);
    const out = sweepGapInvariants([g], flat, CELL);
    expect(out).toHaveLength(1);
    expect(out[0].t).toBeCloseTo(0.5, 6);
  });

  it('nudges an overlapping later gap along the segment', () => {
    const flat = buildGapFlatten(wall([{ x: 0, y: 0 }, { x: 500, y: 0 }]));
    // both centered at world 100 & 120, 1 cell (50) wide → spans overlap
    const out = sweepGapInvariants([gap(0, 0.2, 1, { id: 'A' }), gap(0, 0.24, 1, { id: 'B' })], flat, CELL);
    expect(out).toHaveLength(2);
    const spans = out.map(g => clampGapToSegment(g, flat, CELL)).sort((a, b) => a.lo - b.lo);
    expect(spans[1].lo).toBeGreaterThanOrEqual(spans[0].hi - 1e-6);
  });
});

describe('clampGapToSegment (invariant 3, clamp-never-drop)', () => {
  it('caps derived width to the segment while preserving stored widthCells (round-trip)', () => {
    const shortW = wall([{ x: 0, y: 0 }, { x: 50, y: 0 }]); // segLenCells = 1
    const g = gap(0, 0.5, 3); // door far wider than segment
    const shortFlat = buildGapFlatten(shortW);
    const derived = clampGapToSegment(g, shortFlat, CELL);
    expect(derived.derivedWidthCells).toBe(1); // capped to segment
    expect(derived.clamped).toBe(true);
    expect(g.widthCells).toBe(3); // stored value untouched

    // Re-lengthen the wall → full stored width returns.
    const longFlat = buildGapFlatten(wall([{ x: 0, y: 0 }, { x: 500, y: 0 }]));
    const restored = clampGapToSegment(g, longFlat, CELL);
    expect(restored.derivedWidthCells).toBe(3);
    expect(restored.clamped).toBe(false);
  });

  it('keeps the span inside the segment (never straddles a corner)', () => {
    const flat = buildGapFlatten(wall([{ x: 0, y: 0 }, { x: 100, y: 0 }]));
    const derived = clampGapToSegment(gap(0, 0.98, 1), flat, CELL); // 50-wide near the end
    expect(derived.lo).toBeGreaterThanOrEqual(-1e-6);
    expect(derived.hi).toBeLessThanOrEqual(100 + 1e-6);
  });
});

describe('clampWidthCells', () => {
  it('clamps into [MIN_GAP_CELLS, segLenCells]', () => {
    expect(clampWidthCells(5, 3)).toBe(3);
    expect(clampWidthCells(0.1, 3)).toBe(MIN_GAP_CELLS);
    expect(clampWidthCells(1, 3)).toBe(1);
  });

  it('resolves lo>hi to the upper bound (fit-to-segment, G-F8)', () => {
    // segment shorter than the minimum floor
    expect(clampWidthCells(1, 0.2)).toBe(0.2);
    expect(clampWidthCells(0.01, 0.2)).toBe(0.2);
  });
});

// ---------------------------------------------------------------------------
// subtractIntervals
// ---------------------------------------------------------------------------

describe('subtractIntervals', () => {
  it('returns the whole chunk when there are no skips', () => {
    expect(subtractIntervals(0, 100, [])).toEqual([[0, 100]]);
  });

  it('subtracts a skip touching the low edge', () => {
    expect(subtractIntervals(0, 100, [[0, 40]])).toEqual([[40, 100]]);
  });

  it('subtracts a skip touching the high edge', () => {
    expect(subtractIntervals(0, 100, [[60, 100]])).toEqual([[0, 60]]);
  });

  it('subtracts a skip fully inside', () => {
    expect(subtractIntervals(0, 100, [[40, 60]])).toEqual([[0, 40], [60, 100]]);
  });

  it('subtracts multiple skips', () => {
    expect(subtractIntervals(0, 100, [[10, 20], [40, 60]])).toEqual([[0, 10], [20, 40], [60, 100]]);
  });

  it('returns nothing when a skip covers the whole chunk', () => {
    expect(subtractIntervals(0, 100, [[-10, 200]])).toEqual([]);
  });

  it('clips a skip spanning the chunk seam and normalizes unsorted/overlapping skips', () => {
    // gap extends beyond the chunk end; a second, unsorted, overlapping skip
    expect(subtractIntervals(0, 100, [[80, 150], [10, 30], [20, 40]]))
      .toEqual([[0, 10], [40, 80]]);
  });

  it('returns nothing for a degenerate chunk', () => {
    expect(subtractIntervals(50, 50, [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// gapHandleAnchors (P5 handle placement)
// ---------------------------------------------------------------------------

describe('gapHandleAnchors', () => {
  const straight = wall([{ x: 0, y: 0 }, { x: 300, y: 0 }]);

  it('anchors center between the two edges, span = widthCells * cellSize', () => {
    const a = gapHandleAnchors(straight, gap(0, 0.5, 1), CELL);
    expect(a).not.toBeNull();
    expect(a!.center.x).toBeCloseTo(150, 6);
    expect(a!.lo.x).toBeCloseTo(125, 6);
    expect(a!.hi.x).toBeCloseTo(175, 6);
    expect(a!.widthWorld).toBeCloseTo(50, 6);
    expect(a!.center.angle).toBeCloseTo(0, 6);
  });

  it('reflects the clamped span for an over-wide door (invariant 3)', () => {
    // 10-cell door on a 6-cell segment → clamped to fill it (edges at 0 and 300).
    const a = gapHandleAnchors(straight, gap(0, 0.5, 10), CELL);
    expect(a!.widthWorld).toBeCloseTo(300, 6);
    expect(a!.lo.x).toBeCloseTo(0, 4);
    expect(a!.hi.x).toBeCloseTo(300, 4);
  });
});

// ---------------------------------------------------------------------------
// resolveGapMove (P5 gapMove handle)
// ---------------------------------------------------------------------------

describe('resolveGapMove', () => {
  const straight = wall([{ x: 0, y: 0 }, { x: 300, y: 0 }]);

  it('moves the gap center to the projected pointer, keeping widthCells', () => {
    const moved = resolveGapMove(straight, gap(0, 0.5, 1), 90, 12, CELL);
    expect(moved.seg).toBe(0);
    expect(moved.t).toBeCloseTo(0.3, 4); // 90/300
    expect(moved.widthCells).toBe(1);
  });

  it('re-centers so the span stays inside the segment near an end', () => {
    // Drag toward the far end; a 1-cell door (half 25) cannot center past 275.
    const moved = resolveGapMove(straight, gap(0, 0.5, 1), 299, 0, CELL);
    expect(moved.t * 300).toBeLessThanOrEqual(275 + 1e-6);
  });

  it('re-anchors seg when the door migrates across a corner', () => {
    const L = wall([{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }]);
    const moved = resolveGapMove(L, gap(0, 0.5, 1), 300, 150, CELL);
    expect(moved.seg).toBe(1);
    expect(moved.t).toBeCloseTo(0.5, 3);
  });
});

// ---------------------------------------------------------------------------
// resolveGapEdgeResize (P5 gapEdge handle — geometry F7 + G-F8)
// ---------------------------------------------------------------------------

describe('resolveGapEdgeResize', () => {
  const straight = wall([{ x: 0, y: 0 }, { x: 300, y: 0 }]); // 6 cells at CELL=50

  it('grows width from the dragged hi edge, holding the lo edge fixed', () => {
    // gap [125,175]; drag hi edge to x=225 → lo stays 125, width 2 cells.
    const r = resolveGapEdgeResize(straight, gap(0, 0.5, 1), 'hi', 225, 0, CELL);
    expect(r.widthCells).toBeCloseTo(2, 6);
    expect(r.widthLocked).toBe(true);
    expect(r.t * 300).toBeCloseTo(175, 4); // new center = 125 + 50
  });

  it('grows width from the dragged lo edge, holding the hi edge fixed', () => {
    // gap [125,175]; drag lo edge to x=75 → hi stays 175, width 2 cells.
    const r = resolveGapEdgeResize(straight, gap(0, 0.5, 1), 'lo', 75, 0, CELL);
    expect(r.widthCells).toBeCloseTo(2, 6);
    expect(r.t * 300).toBeCloseTo(125, 4); // new center = 175 - 50
  });

  it('floors width at MIN_GAP_CELLS and never inverts when dragged past the fixed edge', () => {
    // Drag hi edge to x=100, past the fixed lo edge (125) → no inversion.
    const r = resolveGapEdgeResize(straight, gap(0, 0.5, 1), 'hi', 100, 0, CELL);
    expect(r.widthCells).toBe(MIN_GAP_CELLS);
    expect(r.widthCells).toBeGreaterThan(0);
  });

  it('fits-to-segment (upper bound) on a segment shorter than the floor (G-F8)', () => {
    const tiny = wall([{ x: 0, y: 0 }, { x: 10, y: 0 }]); // 0.2 cells < MIN_GAP_CELLS
    const r = resolveGapEdgeResize(tiny, gap(0, 0.5, 0.2), 'hi', 20, 0, CELL);
    expect(r.widthCells).toBeCloseTo(0.2, 6); // fills the segment, not the floor
  });
});

// ---------------------------------------------------------------------------
// createWallGap
// ---------------------------------------------------------------------------

describe('createWallGap', () => {
  it('mints an id and omits absent optional fields', () => {
    const g = createWallGap({ seg: 1, t: 0.5, widthCells: 1 });
    expect(g.id).toMatch(/^gap-\d+-[a-z0-9]+$/);
    expect(g.widthLocked).toBeUndefined();
    expect(g.tile).toBeUndefined();
  });

  it('carries widthLocked and a tile binding when provided', () => {
    const g = createWallGap({
      seg: 0, t: 0.5, widthCells: 1, widthLocked: true,
      tile: { tilesetId: 'ts', tileId: 'portals/Door' },
    });
    expect(g.widthLocked).toBe(true);
    expect(g.tile?.tileId).toBe('portals/Door');
  });
});

// ---------------------------------------------------------------------------
// planGapInsert (placement flow — §5.2)
// ---------------------------------------------------------------------------

describe('planGapInsert', () => {
  // Straight wall: one segment, arc length 300 world = 6 cells at CELL=50.
  const straight = { vertices: [{ x: 0, y: 0 }, { x: 300, y: 0 }], closed: false };

  it('centers a 1-cell gap at the click and embeds the tile binding', () => {
    const tile = { tilesetId: 'ts', tileId: 'portals/Door' };
    const plan = planGapInsert(straight, 150, 8, 1, CELL, tile);
    expect(plan).not.toBeNull();
    expect(plan!.gap.seg).toBe(0);
    expect(plan!.gap.t).toBeCloseTo(0.5, 6);
    expect(plan!.gap.widthCells).toBeCloseTo(1, 6);
    expect(plan!.gap.tile).toEqual(tile);
  });

  it('omits the tile for a bare threshold (no tile arg)', () => {
    const plan = planGapInsert(straight, 150, 0, 1, CELL);
    expect(plan!.gap.tile).toBeUndefined();
  });

  it('clamps a too-wide gap to the host segment length (invariant 3)', () => {
    // 100 cells requested, segment is only 6 cells long.
    const plan = planGapInsert(straight, 150, 0, 100, CELL);
    expect(plan!.gap.widthCells).toBeCloseTo(6, 6);
    expect(plan!.gap.t).toBeCloseTo(0.5, 6); // full-width gap centers on the segment
  });

  it('clamps the center so the span stays inside the segment (near an end)', () => {
    // Click near the far end; a 2-cell gap (100 world, half 50) cannot center past 250.
    const plan = planGapInsert(straight, 295, 0, 2, CELL);
    const centerWorld = plan!.gap.t * 300;
    expect(centerWorld).toBeLessThanOrEqual(250 + 1e-6);
    expect(centerWorld).toBeCloseTo(250, 4);
  });

  it('nudges a new gap off an existing one rather than overlapping (invariant 4)', () => {
    const withGap = { ...straight, gaps: [gap(0, 0.5, 1)] }; // occupies [125,175]
    const plan = planGapInsert(withGap, 150, 0, 1, CELL);
    expect(plan).not.toBeNull();
    expect(plan!.gap.t).not.toBeCloseTo(0.5, 3); // moved off the occupied center
    // New span must not overlap the existing [125,175] span.
    const c = plan!.gap.t * 300;
    const lo = c - 25;
    const hi = c + 25;
    expect(hi <= 125 + 1e-6 || lo >= 175 - 1e-6).toBe(true);
  });

  it('aborts (returns null) when the segment cannot fit the gap', () => {
    const full = { ...straight, gaps: [gap(0, 0.5, 6)] }; // gap fills the whole segment
    expect(planGapInsert(full, 150, 0, 1, CELL)).toBeNull();
  });

  it('returns null for degenerate width or cellSize', () => {
    expect(planGapInsert(straight, 150, 0, 0, CELL)).toBeNull();
    expect(planGapInsert(straight, 150, 0, 1, 0)).toBeNull();
  });

  it('anchors to the clicked segment on a multi-segment wall', () => {
    const w = { vertices: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }], closed: false };
    const plan = planGapInsert(w, 300, 150, 1, CELL); // near the vertical segment
    expect(plan!.gap.seg).toBe(1);
    expect(plan!.gap.t).toBeCloseTo(0.5, 4);
  });
});

// ---------------------------------------------------------------------------
// snapInsertPointOutsideGaps (§2.3 insert row — invariant 3 forbids straddling)
// ---------------------------------------------------------------------------

describe('snapInsertPointOutsideGaps', () => {
  // [0,200] world segment, 1-cell (50 world) door centered at t=0.5 -> span [75,125].
  const withDoor = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
  const w = { ...withDoor, gaps: [gap(0, 0.5, 1)] };

  it('snaps a click at the exact gap center to the far (hi) edge on a tie (repro)', () => {
    const p = snapInsertPointOutsideGaps(w, 0, 100, 0, CELL);
    expect(p.x).toBeCloseTo(125, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it('snaps to the lo edge when the click is closer to it', () => {
    const p = snapInsertPointOutsideGaps(w, 0, 90, 0, CELL);
    expect(p.x).toBeCloseTo(75, 6);
  });

  it('snaps to the hi edge when the click is closer to it', () => {
    const p = snapInsertPointOutsideGaps(w, 0, 115, 0, CELL);
    expect(p.x).toBeCloseTo(125, 6);
  });

  it('leaves the point unchanged when it lands outside the gap span', () => {
    const p = snapInsertPointOutsideGaps(w, 0, 20, 0, CELL);
    expect(p.x).toBeCloseTo(20, 6);
  });

  it('leaves the point unchanged when exactly on an edge (not strictly inside)', () => {
    const p = snapInsertPointOutsideGaps(w, 0, 75, 0, CELL);
    expect(p.x).toBeCloseTo(75, 6);
  });

  it('ignores gaps on other segments', () => {
    const multi = { vertices: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 400, y: 0 }], closed: false, gaps: [gap(0, 0.5, 1)] };
    const p = snapInsertPointOutsideGaps(multi, 1, 300, 0, CELL); // seg 1, no gap there
    expect(p.x).toBeCloseTo(300, 6);
  });

  it('is a no-op when the wall has no gaps', () => {
    const noGaps = wall([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const p = snapInsertPointOutsideGaps(noGaps, 0, 100, 0, CELL);
    expect(p.x).toBeCloseTo(100, 6);
  });
});

// ---------------------------------------------------------------------------
// findGapOnWallAtPoint (opening-mode click-to-edit hit-test)
// ---------------------------------------------------------------------------

describe('findGapOnWallAtPoint', () => {
  // Straight wall 0,0 → 400,0; gap centered at world 200, 2 cells wide (span 150..250).
  const g = gap(0, 0.5, 2);
  const w = { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }], closed: false, gaps: [g] };

  it('hits a point inside the gap span within the perpendicular corridor', () => {
    expect(findGapOnWallAtPoint(w, 200, 10, CELL, 20)).toBe(g.id);
  });

  it('misses a point on the wall but outside the gap span', () => {
    expect(findGapOnWallAtPoint(w, 100, 0, CELL, 20)).toBeNull();
  });

  it('misses a point inside the span but beyond maxPerp', () => {
    expect(findGapOnWallAtPoint(w, 200, 40, CELL, 20)).toBeNull();
  });

  it('hits exactly on the span edge (inclusive)', () => {
    expect(findGapOnWallAtPoint(w, 150, 0, CELL, 20)).toBe(g.id);
  });

  it('returns the gap under the pointer when several share the wall', () => {
    const gA = gap(0, 0.25, 1);
    const gB = gap(0, 0.75, 1);
    const multi = { vertices: [{ x: 0, y: 0 }, { x: 400, y: 0 }], closed: false, gaps: [gA, gB] };
    expect(findGapOnWallAtPoint(multi, 300, 5, CELL, 20)).toBe(gB.id);
    expect(findGapOnWallAtPoint(multi, 100, 5, CELL, 20)).toBe(gA.id);
  });

  it('returns null for a wall without gaps', () => {
    expect(findGapOnWallAtPoint(wall([{ x: 0, y: 0 }, { x: 400, y: 0 }]), 200, 0, CELL, 20)).toBeNull();
  });

  it('finds a gap seated on an arc segment', () => {
    // Bowed segment; the gap sits at the arc's parametric center.
    const arcWall = { vertices: [{ x: 0, y: 0, arc: [200, 100] as [number, number] }, { x: 400, y: 0 }], closed: false, gaps: [gap(0, 0.5, 2)] };
    // Apex of the quadratic at t=0.5 is (200, 50); the gap center sits there.
    expect(findGapOnWallAtPoint(arcWall, 200, 55, CELL, 20)).not.toBeNull();
  });
});
