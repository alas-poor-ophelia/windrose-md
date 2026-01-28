/**
 * pathSimplify.ts
 *
 * Ramer-Douglas-Peucker (RDP) path simplification algorithm.
 * Reduces the number of points in a path while preserving its shape
 * within a specified tolerance (epsilon).
 *
 * Used for:
 * - Compressing freehand input (typically 80-90% reduction)
 * - Reducing storage size for curves
 * - Improving rendering performance
 *
 * Algorithm overview:
 * 1. Find the point furthest from the line between start and end
 * 2. If distance > epsilon, recursively simplify both halves
 * 3. Otherwise, discard all intermediate points
 */

import type { CurvePoint } from '#types/core/curve.types';

// =============================================================================
// Distance Calculation
// =============================================================================

/**
 * Calculate perpendicular distance from a point to a line segment.
 *
 * Uses the formula: |cross product| / |line length|
 * For a line from A to B and point P:
 *   distance = |(B-A) × (P-A)| / |B-A|
 *
 * @param point - The point to measure from
 * @param lineStart - Start of the line segment
 * @param lineEnd - End of the line segment
 * @returns Perpendicular distance from point to line
 */
function perpendicularDistance(
  point: CurvePoint,
  lineStart: CurvePoint,
  lineEnd: CurvePoint
): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  // Line vector
  const dx = x2 - x1;
  const dy = y2 - y1;

  // Line length squared
  const lineLengthSq = dx * dx + dy * dy;

  // Handle degenerate case: line has zero length
  if (lineLengthSq === 0) {
    // Return distance to the single point
    const dpx = px - x1;
    const dpy = py - y1;
    return Math.sqrt(dpx * dpx + dpy * dpy);
  }

  // Vector from line start to point
  const apx = px - x1;
  const apy = py - y1;

  // Cross product magnitude (2D): (B-A) × (P-A) = dx*apy - dy*apx
  const crossProduct = Math.abs(dx * apy - dy * apx);

  // Distance = |cross product| / |line length|
  return crossProduct / Math.sqrt(lineLengthSq);
}

// =============================================================================
// RDP Algorithm
// =============================================================================

/**
 * Simplify a path using the Ramer-Douglas-Peucker algorithm.
 *
 * Recursively removes points that are within epsilon tolerance of the line
 * between their neighbors, preserving the path's essential shape.
 *
 * @param points - Array of points to simplify
 * @param epsilon - Distance tolerance (points closer than this to the line are removed)
 * @returns Simplified array of points
 *
 * @example
 * // Simplify freehand input with 2-pixel tolerance
 * const simplified = simplifyPath(rawPoints, 2);
 */
function simplifyPath(points: CurvePoint[], epsilon: number): CurvePoint[] {
  // Handle edge cases
  if (points.length <= 2) {
    return [...points];
  }

  // Find the point with maximum distance from line between first and last
  let maxDistance = 0;
  let maxIndex = 0;

  const first = points[0];
  const last = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], first, last);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  // If max distance exceeds epsilon, recursively simplify both halves
  if (maxDistance > epsilon) {
    // Simplify left segment (start to maxIndex, inclusive)
    const leftSegment = simplifyPath(points.slice(0, maxIndex + 1), epsilon);
    // Simplify right segment (maxIndex to end, inclusive)
    const rightSegment = simplifyPath(points.slice(maxIndex), epsilon);

    // Combine results (remove duplicate point at maxIndex)
    return [...leftSegment.slice(0, -1), ...rightSegment];
  }

  // All intermediate points are within tolerance - return just endpoints
  return [first, last];
}

// =============================================================================
// Exports
// =============================================================================

return {
  perpendicularDistance,
  simplifyPath,
};
