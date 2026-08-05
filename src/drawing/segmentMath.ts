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

export { closestPointOnSegment };
export type { SegmentProjection };
