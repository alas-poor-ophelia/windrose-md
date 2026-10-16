/**
 * wallEditGeometry.ts
 *
 * Pure geometry of wall editing (no Preact, no canvas): handle positions,
 * handle hit-testing with the edit-mode precedence, corridor picking, chord
 * projection, bow arcs, and applying an edit-drag to a working copy.
 *
 * Every distance here is in WORLD px. Screen-px constants are divided by the
 * live zoom at the call site (or by the helpers that take `zoom`).
 */

import type { WallPath } from '#types/core/wallpath.types';

import { quadPoint } from './wallPathFlatten';
import { distanceToWallPath } from './wallPathOperations';
import { gapHandleAnchors, resolveGapEdgeResize, resolveGapMove } from './wallGapOperations';
import { assertNever } from '../utils/assertNever';

/** Hide edit handles below this zoom: too small to grab, pure clutter. */
const MIN_HANDLE_ZOOM = 0.3;
/** Screen-px pick radius for edit handles, vertices and wall corridors (divided by live zoom). */
const HANDLE_HIT_PX = 22;

/**
 * Perpendicular offset (screen px) of a gap's CENTER handle off the centerline.
 * Moves it clear of the segment-midpoint bow diamond so a mid-segment door and
 * its bow are both grabbable (geometry F5). MUST exceed the handle hit radius
 * (HANDLE_HIT_PX) or the offset handle's hit circle still covers the centerline
 * midpoint and masks the bow, so clicking the bow would select the gap instead.
 */
const GAP_CENTER_PERP = 30;

/**
 * Screen-px distance from the chord under which a bow gesture straightens the
 * segment instead of arcing it. The edit-mode bow diamond uses a tighter band
 * than the draw-mode press-drag because the diamond starts ON the chord: a
 * wider band would swallow small deliberate bows.
 */
const EDIT_BOW_STRAIGHTEN_PX = 4;
/** Draw-mode press-drag straighten band (screen px); see EDIT_BOW_STRAIGHTEN_PX. */
const DRAW_BOW_STRAIGHTEN_PX = 6;

/** Minimum wall-corridor half-width as a fraction of a cell. */
const CORRIDOR_CELL_FRACTION = 0.4;

type Point = { x: number; y: number };

type WallDragState =
  | { type: 'vertex'; wallId: string; index: number }
  | { type: 'bow'; wallId: string; index: number }
  | { type: 'gapMove'; wallId: string; gapId: string }
  | { type: 'gapEdge'; wallId: string; gapId: string; edge: 'lo' | 'hi' };

type WallBounds = { minX: number; minY: number; maxX: number; maxY: number };

/** Openings only cut kind 'wall' strips; paths are not openable (spec 5.1). */
function isOpenableWall(wall: WallPath): boolean {
  return wall.kind === 'wall';
}

/** World-px pick corridor around a wall centerline at the given zoom. */
function wallHitCorridor(cellSize: number, zoom: number): number {
  return Math.max(cellSize * CORRIDOR_CELL_FRACTION, HANDLE_HIT_PX / zoom);
}

/** A gap center handle sits offset perpendicular to the wall tangent. */
function gapCenterHandlePos(
  anchor: { x: number; y: number; angle: number },
  perpWorld: number,
): Point {
  return {
    x: anchor.x - Math.sin(anchor.angle) * perpWorld,
    y: anchor.y + Math.cos(anchor.angle) * perpWorld,
  };
}

function segmentCount(wall: WallPath): number {
  return wall.closed ? wall.vertices.length : wall.vertices.length - 1;
}

/** Midpoint of segment i (curve point at t=0.5 when arced, else chord midpoint). */
function segmentMidpoint(wall: WallPath, i: number): Point {
  const a = wall.vertices[i];
  const b = wall.vertices[(i + 1) % wall.vertices.length];
  if (a.arc != null) {
    const [x, y] = quadPoint(a.x, a.y, a.arc[0], a.arc[1], b.x, b.y, 0.5);
    return { x, y };
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** True if two walls differ geometrically (vertex count, position, or arc). */
function wallGeometryChanged(a: WallPath, b: WallPath): boolean {
  if (a.vertices.length !== b.vertices.length) return true;
  for (let i = 0; i < a.vertices.length; i++) {
    const va = a.vertices[i];
    const vb = b.vertices[i];
    if (Math.abs(va.x - vb.x) > 1e-3 || Math.abs(va.y - vb.y) > 1e-3) return true;
    const aa = va.arc;
    const ab = vb.arc;
    if ((aa == null) !== (ab == null)) return true;
    if (aa != null && ab != null && (Math.abs(aa[0] - ab[0]) > 1e-3 || Math.abs(aa[1] - ab[1]) > 1e-3)) return true;
  }
  return false;
}

/**
 * Axis-aligned bounds over a wall's vertices and arc control points. Control
 * points are included because an arc can bow beyond the vertex hull; the
 * flattened polyline stays inside {vertices and control points}.
 */
function wallBounds(wall: WallPath): WallBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of wall.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.arc != null) {
      if (v.arc[0] < minX) minX = v.arc[0];
      if (v.arc[1] < minY) minY = v.arc[1];
      if (v.arc[0] > maxX) maxX = v.arc[0];
      if (v.arc[1] > maxY) maxY = v.arc[1];
    }
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Nearest wall whose centerline lies strictly within `corridor` of the point.
 * A cheap bbox pre-filter skips the polyline flatten for any wall whose bounds
 * (plus the corridor margin) cannot contain the point. `accept` filters
 * candidates (opening mode only considers kind 'wall').
 */
function nearestWallInCorridor(
  walls: readonly WallPath[],
  wx: number,
  wy: number,
  corridor: number,
  accept?: (wall: WallPath) => boolean,
): WallPath | null {
  let best: WallPath | null = null;
  let bestDist = Infinity;
  for (const w of walls) {
    if (accept != null && !accept(w)) continue;
    const bb = wallBounds(w);
    if (wx < bb.minX - corridor || wx > bb.maxX + corridor ||
        wy < bb.minY - corridor || wy > bb.maxY + corridor) continue;
    const d = distanceToWallPath(w, wx, wy);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best != null && bestDist < corridor ? best : null;
}

/**
 * Distance from (px, py) to the chord a-b (clamped projection). Returns null
 * for a zero-length chord so each caller keeps its own degenerate fallback.
 */
function chordDistance(a: Point, b: Point, px: number, py: number): number | null {
  const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (len2 <= 0) return null;
  const t = Math.max(0, Math.min(1, ((px - a.x) * (b.x - a.x) + (py - a.y) * (b.y - a.y)) / len2));
  return Math.hypot(px - (a.x + t * (b.x - a.x)), py - (a.y + t * (b.y - a.y)));
}

/** Quadratic control point that makes the a-b curve pass through (mx, my) at t=0.5. */
function bowArcThrough(a: Point, b: Point, mx: number, my: number): [number, number] {
  return [2 * mx - (a.x + b.x) / 2, 2 * my - (a.y + b.y) / 2];
}

/**
 * Index of the segment whose chord is nearest the point (chord projection, so
 * arcs are measured against their straight chord). -1 for a wall with no segments.
 */
function nearestSegmentIndex(wall: WallPath, px: number, py: number): number {
  let bestSeg = -1;
  let bestDist = Infinity;
  for (let i = 0; i < segmentCount(wall); i++) {
    const a = wall.vertices[i];
    const b = wall.vertices[(i + 1) % wall.vertices.length];
    const d = chordDistance(a, b, px, py) ?? Math.hypot(px - a.x, py - a.y);
    if (d < bestDist) { bestDist = d; bestSeg = i; }
  }
  return bestSeg;
}

/**
 * Gap handle hit-test on one wall. Edges win over centers where they overlap:
 * every gap's lo then hi edge is tested before any center handle.
 */
function hitTestGapHandles(
  wall: WallPath,
  px: number,
  py: number,
  zoom: number,
  cellSize: number,
): WallDragState | null {
  const gaps = wall.gaps ?? [];
  if (gaps.length === 0) return null;
  const hitR = HANDLE_HIT_PX / zoom;
  for (const g of gaps) {
    const a = gapHandleAnchors(wall, g, cellSize);
    if (a == null) continue;
    if (Math.hypot(px - a.lo.x, py - a.lo.y) < hitR) {
      return { type: 'gapEdge', wallId: wall.id, gapId: g.id, edge: 'lo' };
    }
    if (Math.hypot(px - a.hi.x, py - a.hi.y) < hitR) {
      return { type: 'gapEdge', wallId: wall.id, gapId: g.id, edge: 'hi' };
    }
  }
  const perpWorld = GAP_CENTER_PERP / zoom;
  for (const g of gaps) {
    const a = gapHandleAnchors(wall, g, cellSize);
    if (a == null) continue;
    const cp = gapCenterHandlePos(a.center, perpWorld);
    if (Math.hypot(px - cp.x, py - cp.y) < hitR) {
      return { type: 'gapMove', wallId: wall.id, gapId: g.id };
    }
  }
  return null;
}

/**
 * Handle hit-test on the selected wall. Precedence (geometry F5):
 * gap-edge, gap-center, vertex, bow. `gapsOnly` (opening mode) skips vertex
 * and bow handles, which opening mode neither draws nor drags. Returns null
 * below MIN_HANDLE_ZOOM, where handles are hidden.
 */
function hitTestWallHandles(
  wall: WallPath,
  px: number,
  py: number,
  zoom: number,
  cellSize: number,
  opts?: { gapsOnly?: boolean },
): WallDragState | null {
  if (zoom < MIN_HANDLE_ZOOM) return null;
  const gapHit = hitTestGapHandles(wall, px, py, zoom, cellSize);
  if (gapHit != null || opts?.gapsOnly === true) return gapHit;
  const hitR = HANDLE_HIT_PX / zoom;
  for (let i = 0; i < wall.vertices.length; i++) {
    const v = wall.vertices[i];
    if (Math.hypot(px - v.x, py - v.y) < hitR) return { type: 'vertex', wallId: wall.id, index: i };
  }
  for (let i = 0; i < segmentCount(wall); i++) {
    const m = segmentMidpoint(wall, i);
    if (Math.hypot(px - m.x, py - m.y) < hitR) return { type: 'bow', wallId: wall.id, index: i };
  }
  return null;
}

/**
 * Apply one pointer-move of an edit-drag to the working copy. Pure: returns
 * the next working wall, or null when the drag target no longer exists.
 * `snap` is the caller's grid/hex snap (vertex drags only).
 */
function applyWallDrag(
  base: WallPath,
  drag: WallDragState,
  px: number,
  py: number,
  zoom: number,
  cellSize: number,
  snap: (wx: number, wy: number) => Point,
): WallPath | null {
  switch (drag.type) {
    case 'gapMove':
    case 'gapEdge': {
      const gaps = base.gaps;
      if (gaps == null) return null;
      const gi = gaps.findIndex(g => g.id === drag.gapId);
      if (gi < 0) return null;
      const nextGap = drag.type === 'gapMove'
        ? resolveGapMove(base, gaps[gi], px, py, cellSize)
        : resolveGapEdgeResize(base, gaps[gi], drag.edge, px, py, cellSize);
      const nextGaps = gaps.slice();
      nextGaps[gi] = nextGap;
      return { ...base, gaps: nextGaps };
    }
    case 'vertex': {
      const snapped = snap(px, py);
      const nextVerts = base.vertices.slice();
      nextVerts[drag.index] = { ...nextVerts[drag.index], x: snapped.x, y: snapped.y };
      return { ...base, vertices: nextVerts };
    }
    case 'bow': {
      // Arc passes through the cursor; near the chord straightens.
      const a = base.vertices[drag.index];
      const b = base.vertices[(drag.index + 1) % base.vertices.length];
      const chordDist = chordDistance(a, b, px, py) ?? Infinity;
      const nextVerts = base.vertices.slice();
      const va = { ...a };
      if (chordDist > EDIT_BOW_STRAIGHTEN_PX / zoom) {
        va.arc = bowArcThrough(a, b, px, py);
      } else {
        delete va.arc;
      }
      nextVerts[drag.index] = va;
      return { ...base, vertices: nextVerts };
    }
    default:
      return assertNever(drag, 'wall drag type');
  }
}

export {
  MIN_HANDLE_ZOOM,
  HANDLE_HIT_PX,
  GAP_CENTER_PERP,
  EDIT_BOW_STRAIGHTEN_PX,
  DRAW_BOW_STRAIGHTEN_PX,
  isOpenableWall,
  wallHitCorridor,
  gapCenterHandlePos,
  segmentCount,
  segmentMidpoint,
  wallGeometryChanged,
  wallBounds,
  nearestWallInCorridor,
  chordDistance,
  bowArcThrough,
  nearestSegmentIndex,
  hitTestGapHandles,
  hitTestWallHandles,
  applyWallDrag,
};
export type { WallDragState, WallBounds };
