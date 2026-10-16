/**
 * wallEditGeometry.test.ts
 *
 * Pure wall-edit geometry: handle hit-testing (precedence), corridor picking,
 * segment split target, bow arcs, and applying edit-drags (vertex, bow, gap).
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_HANDLE_ZOOM,
  GAP_CENTER_PERP,
  HANDLE_HIT_PX,
  applyWallDrag,
  bowArcThrough,
  chordDistance,
  hitTestGapHandles,
  hitTestWallHandles,
  isOpenableWall,
  nearestSegmentIndex,
  nearestWallInCorridor,
  segmentCount,
  segmentMidpoint,
  wallBounds,
  wallGeometryChanged,
  wallHitCorridor,
} from '../../../src/drawing/wallEditGeometry';
import { quadPoint } from '../../../src/drawing/wallPathFlatten';
import type { WallGap, WallPath, WallVertex } from '../../../types/core/wallpath.types';

const CELL = 50;

function makeWall(vertices: WallVertex[], over: Partial<WallPath> = {}): WallPath {
  return {
    id: 'w1', vertices, closed: false, tilesetId: 'ts', tileId: 'tile', kind: 'wall', widthScale: 1, ...over,
  };
}

function gap(id: string, seg: number, t: number, widthCells: number): WallGap {
  return { id, seg, t, widthCells };
}

const identitySnap = (x: number, y: number): { x: number; y: number } => ({ x, y });

// Straight 200px wall; one 1-cell gap centered at x=100 (edges at 75 and 125).
const gapWall = makeWall([{ x: 0, y: 0 }, { x: 200, y: 0 }], { gaps: [gap('g1', 0, 0.5, 1)] });
const plainWall = makeWall([{ x: 0, y: 0 }, { x: 200, y: 0 }]);

describe('hitTestWallHandles', () => {
  it('hits a gap edge (lo, then hi)', () => {
    expect(hitTestWallHandles(gapWall, 76, 2, 1, CELL)).toEqual({ type: 'gapEdge', wallId: 'w1', gapId: 'g1', edge: 'lo' });
    expect(hitTestWallHandles(gapWall, 124, -2, 1, CELL)).toEqual({ type: 'gapEdge', wallId: 'w1', gapId: 'g1', edge: 'hi' });
  });

  it('hits the gap center handle at its perpendicular offset', () => {
    expect(hitTestWallHandles(gapWall, 100, GAP_CENTER_PERP, 1, CELL)).toEqual({ type: 'gapMove', wallId: 'w1', gapId: 'g1' });
  });

  it('does not let the offset gap center mask the bow diamond (geometry F5)', () => {
    expect(hitTestWallHandles(gapWall, 100, 0, 1, CELL)).toEqual({ type: 'bow', wallId: 'w1', index: 0 });
  });

  it('prefers a vertex over the bow and centerline', () => {
    expect(hitTestWallHandles(plainWall, 3, 3, 1, CELL)).toEqual({ type: 'vertex', wallId: 'w1', index: 0 });
    expect(hitTestWallHandles(plainWall, 199, 0, 1, CELL)).toEqual({ type: 'vertex', wallId: 'w1', index: 1 });
  });

  it('prefers a gap edge over a vertex where both are in range', () => {
    // A gap whose lo edge sits near vertex 0.
    const w = makeWall([{ x: 0, y: 0 }, { x: 200, y: 0 }], { gaps: [gap('g', 0, 0.15, 1)] });
    const hit = hitTestWallHandles(w, 4, 0, 1, CELL);
    expect(hit?.type).toBe('gapEdge');
  });

  it('gapsOnly skips vertex and bow handles (opening mode)', () => {
    expect(hitTestWallHandles(plainWall, 0, 0, 1, CELL, { gapsOnly: true })).toBeNull();
    expect(hitTestWallHandles(gapWall, 76, 0, 1, CELL, { gapsOnly: true })?.type).toBe('gapEdge');
  });

  it('returns null below MIN_HANDLE_ZOOM', () => {
    expect(hitTestWallHandles(plainWall, 0, 0, MIN_HANDLE_ZOOM / 2, CELL)).toBeNull();
  });

  it('scales the hit radius with zoom', () => {
    const r = HANDLE_HIT_PX / 2;
    expect(hitTestWallHandles(plainWall, r - 1, 0, 2, CELL)?.type).toBe('vertex');
    expect(hitTestWallHandles(plainWall, r + 1, 0, 2, CELL)).toBeNull();
  });

  it('misses empty space', () => {
    expect(hitTestWallHandles(plainWall, 60, 80, 1, CELL)).toBeNull();
    expect(hitTestGapHandles(plainWall, 100, 0, 1, CELL)).toBeNull();
  });
});

describe('nearestWallInCorridor', () => {
  const a = makeWall([{ x: 0, y: 0 }, { x: 100, y: 0 }], { id: 'a' });
  const b = makeWall([{ x: 0, y: 40 }, { x: 100, y: 40 }], { id: 'b', kind: 'path' });

  it('picks the nearest wall within the corridor', () => {
    expect(nearestWallInCorridor([a, b], 50, 30, 20)?.id).toBe('b');
    expect(nearestWallInCorridor([a, b], 50, 5, 20)?.id).toBe('a');
  });

  it('returns null outside every corridor', () => {
    expect(nearestWallInCorridor([a, b], 50, 200, 20)).toBeNull();
  });

  it('honours the accept filter (paths are not openable)', () => {
    expect(nearestWallInCorridor([a, b], 50, 30, 40, isOpenableWall)?.id).toBe('a');
    expect(nearestWallInCorridor([b], 50, 40, 20, isOpenableWall)).toBeNull();
  });

  it('corridor is at least 0.4 cell and at least the screen hit radius', () => {
    expect(wallHitCorridor(CELL, 1)).toBe(HANDLE_HIT_PX);
    expect(wallHitCorridor(CELL, 10)).toBe(CELL * 0.4);
  });
});

describe('segment split target', () => {
  const lShape = makeWall([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);

  it('finds the nearest segment by chord projection', () => {
    expect(nearestSegmentIndex(lShape, 50, 5)).toBe(0);
    expect(nearestSegmentIndex(lShape, 95, 60)).toBe(1);
  });

  it('includes the closing segment of a closed wall', () => {
    const closed = { ...lShape, closed: true };
    expect(segmentCount(closed)).toBe(3);
    expect(nearestSegmentIndex(closed, 45, 55)).toBe(2);
  });

  it('returns -1 for a wall with no segments', () => {
    expect(nearestSegmentIndex(makeWall([{ x: 0, y: 0 }]), 0, 0)).toBe(-1);
  });

  it('chordDistance clamps to the endpoints and is null for a zero chord', () => {
    expect(chordDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, 5, 3)).toBeCloseTo(3);
    expect(chordDistance({ x: 0, y: 0 }, { x: 10, y: 0 }, 13, 4)).toBeCloseTo(5);
    expect(chordDistance({ x: 1, y: 1 }, { x: 1, y: 1 }, 5, 5)).toBeNull();
  });
});

describe('bow arc', () => {
  it('bowArcThrough makes the curve pass through the point at t=0.5', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 100, y: 0 };
    const [cx, cy] = bowArcThrough(a, b, 50, 30);
    const [x, y] = quadPoint(a.x, a.y, cx, cy, b.x, b.y, 0.5);
    expect(x).toBeCloseTo(50);
    expect(y).toBeCloseTo(30);
  });

  it('segmentMidpoint follows the arc', () => {
    const w = makeWall([{ x: 0, y: 0, arc: bowArcThrough({ x: 0, y: 0 }, { x: 100, y: 0 }, 50, 30) }, { x: 100, y: 0 }]);
    const m = segmentMidpoint(w, 0);
    expect(m.x).toBeCloseTo(50);
    expect(m.y).toBeCloseTo(30);
  });

  it('wallBounds includes arc control points', () => {
    const w = makeWall([{ x: 0, y: 0, arc: [50, 60] }, { x: 100, y: 0 }]);
    expect(wallBounds(w)).toEqual({ minX: 0, minY: 0, maxX: 100, maxY: 60 });
  });
});

describe('applyWallDrag', () => {
  it('moves a vertex through the snap function', () => {
    const snap = (x: number, y: number): { x: number; y: number } => ({ x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 });
    const next = applyWallDrag(plainWall, { type: 'vertex', wallId: 'w1', index: 1 }, 203, 48, 1, CELL, snap);
    expect(next?.vertices[1]).toEqual({ x: 200, y: 50 });
    expect(plainWall.vertices[1]).toEqual({ x: 200, y: 0 });
  });

  it('bows a segment through the cursor, and straightens near the chord', () => {
    const drag = { type: 'bow', wallId: 'w1', index: 0 } as const;
    const bowed = applyWallDrag(plainWall, drag, 100, 40, 1, CELL, identitySnap);
    expect(bowed?.vertices[0].arc).toEqual([100, 80]);
    const straight = applyWallDrag(bowed!, drag, 100, 2, 1, CELL, identitySnap);
    expect(straight?.vertices[0].arc).toBeUndefined();
    expect(wallGeometryChanged(plainWall, bowed!)).toBe(true);
    expect(wallGeometryChanged(plainWall, straight!)).toBe(false);
  });

  it('slides a gap (opening placement) along the wall', () => {
    const next = applyWallDrag(gapWall, { type: 'gapMove', wallId: 'w1', gapId: 'g1' }, 60, 5, 1, CELL, identitySnap);
    const g = next?.gaps?.[0];
    expect(g?.id).toBe('g1');
    expect(g?.t).toBeLessThan(0.5);
    expect(g?.widthCells).toBe(1);
  });

  it('resizes a gap from its hi edge', () => {
    const next = applyWallDrag(gapWall, { type: 'gapEdge', wallId: 'w1', gapId: 'g1', edge: 'hi' }, 150, 0, 1, CELL, identitySnap);
    expect(next?.gaps?.[0].widthCells).toBeGreaterThan(1);
  });

  it('returns null when the dragged gap is gone', () => {
    expect(applyWallDrag(plainWall, { type: 'gapMove', wallId: 'w1', gapId: 'nope' }, 60, 0, 1, CELL, identitySnap)).toBeNull();
    expect(applyWallDrag(gapWall, { type: 'gapMove', wallId: 'w1', gapId: 'nope' }, 60, 0, 1, CELL, identitySnap)).toBeNull();
  });

  it('throws on an unknown drag type (assertNever)', () => {
    const bad = { type: 'spin', wallId: 'w1', index: 0 } as unknown as Parameters<typeof applyWallDrag>[1];
    expect(() => applyWallDrag(plainWall, bad, 0, 0, 1, CELL, identitySnap)).toThrow(/wall drag type/);
  });
});
