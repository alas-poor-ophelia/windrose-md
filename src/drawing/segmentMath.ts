/**
 * segmentMath.ts
 *
 * Shared point-to-segment primitive. Route hit-testing and wall-path
 * projection both need "closest point on segment AB to P" — keep the one
 * implementation here so the two can't drift.
 */

interface SegmentProjection {
  /** Clamped in-segment parameter: 0 at A, 1 at B */
  t: number;
  /** Closest point on the segment */
  x: number;
  y: number;
  /** Distance from P to that point */
  dist: number;
}

/** Project point P onto segment AB (all in the same coordinate space). */
function closestPointOnSegment(
  ax: number, ay: number,
  bx: number, by: number,
  px: number, py: number
): SegmentProjection {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0
    ? 0
    : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return { t, x, y, dist: Math.hypot(px - x, py - y) };
}

/** Nearest-point projection of a world point onto a flattened polyline. */
interface PolylineProjection {
  /** Index of the sub-segment the nearest point lies on (points[i-1] -> points[i]). */
  segIndex: number;
  /** 0..1 parameter of the nearest point within that sub-segment. */
  t: number;
  /** Nearest point coordinates. */
  x: number;
  y: number;
  /** Distance from (wx, wy) to the nearest point. */
  dist: number;
}

/**
 * Project a world point onto a flattened polyline, returning WHICH sub-segment
 * the nearest point falls on, its in-segment parameter, and the distance.
 * The load-bearing primitive behind distanceToWallPath and (via wallGapOperations)
 * projectToWall. Returns null for a degenerate polyline (< 2 points).
 */
function projectPointToPolyline(
  points: ReadonlyArray<readonly [number, number]>,
  wx: number,
  wy: number,
): PolylineProjection | null {
  if (points.length < 2) return null;
  let best: PolylineProjection | null = null;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1];
    const [x1, y1] = points[i];
    const proj = closestPointOnSegment(x0, y0, x1, y1, wx, wy);
    if (best == null || proj.dist < best.dist) {
      best = { segIndex: i, t: proj.t, x: proj.x, y: proj.y, dist: proj.dist };
    }
  }
  return best;
}

export { closestPointOnSegment, projectPointToPolyline };
export type { SegmentProjection, PolylineProjection };
