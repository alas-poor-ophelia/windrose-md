/**
 * curveMath.ts
 *
 * Pure math functions for curve operations:
 * - Point simplification (Ramer-Douglas-Peucker algorithm)
 * - Catmull-Rom spline to Bezier conversion
 * - Distance/hit testing calculations
 * - Bounding box calculation
 *
 * All functions are stateless and side-effect free.
 */

import type { CurvePoint, BezierSegment, CurveBounds } from '#types/core/curve.types';

// ===========================================================================
// Point Simplification (Ramer-Douglas-Peucker)
// ===========================================================================

/**
 * Simplify a path using the Ramer-Douglas-Peucker algorithm.
 *
 * This reduces the number of points in a path while preserving its shape.
 * Points that are within epsilon distance of the line between their
 * neighbors are removed.
 *
 * @param points - Array of points to simplify
 * @param epsilon - Distance threshold (larger = more simplification)
 * @returns Simplified array of points
 */
function simplifyPath(points: CurvePoint[], epsilon: number): CurvePoint[] {
  if (points.length < 3) {
    return [...points];
  }

  return rdpSimplify(points, 0, points.length - 1, epsilon);
}

/**
 * Recursive RDP implementation.
 */
function rdpSimplify(
  points: CurvePoint[],
  startIdx: number,
  endIdx: number,
  epsilon: number
): CurvePoint[] {
  // Find the point with maximum distance from the line
  let maxDist = 0;
  let maxIdx = startIdx;

  const start = points[startIdx];
  const end = points[endIdx];

  for (let i = startIdx + 1; i < endIdx; i++) {
    const dist = perpendicularDistance(points[i], start, end);
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  // If max distance is greater than epsilon, recursively simplify
  if (maxDist > epsilon) {
    // Recursive call on both sides
    const left = rdpSimplify(points, startIdx, maxIdx, epsilon);
    const right = rdpSimplify(points, maxIdx, endIdx, epsilon);

    // Concatenate results (exclude duplicate point at maxIdx)
    return [...left.slice(0, -1), ...right];
  }

  // All points between start and end are within epsilon
  return [start, end];
}

/**
 * Calculate perpendicular distance from a point to a line segment.
 */
function perpendicularDistance(
  point: CurvePoint,
  lineStart: CurvePoint,
  lineEnd: CurvePoint
): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Start and end are the same point
    return Math.hypot(point[0] - lineStart[0], point[1] - lineStart[1]);
  }

  // Calculate cross product to get area of parallelogram
  const cross = Math.abs(
    (point[0] - lineStart[0]) * dy - (point[1] - lineStart[1]) * dx
  );

  // Divide by base length to get height (perpendicular distance)
  return cross / Math.sqrt(lenSq);
}

// ===========================================================================
// Catmull-Rom to Bezier Conversion
// ===========================================================================

/**
 * Convert Catmull-Rom spline control points to cubic Bezier segments.
 *
 * Catmull-Rom splines pass through all control points, making them
 * ideal for freehand drawing. This converts them to Bezier curves
 * for Canvas rendering.
 *
 * @param points - Control points the curve passes through
 * @param tension - Smoothness factor (0 = sharp corners, 1 = very smooth)
 * @param closed - Whether the curve forms a closed loop
 * @returns Array of cubic Bezier segments
 */
function catmullRomToBezier(
  points: CurvePoint[],
  tension: number,
  closed: boolean
): BezierSegment[] {
  if (points.length < 2) {
    return [];
  }

  if (points.length === 2) {
    // Two points = straight line, use linear interpolation
    return [{
      start: points[0],
      cp1: [
        points[0][0] + (points[1][0] - points[0][0]) / 3,
        points[0][1] + (points[1][1] - points[0][1]) / 3,
      ],
      cp2: [
        points[0][0] + (points[1][0] - points[0][0]) * 2 / 3,
        points[0][1] + (points[1][1] - points[0][1]) * 2 / 3,
      ],
      end: points[1],
    }];
  }

  const segments: BezierSegment[] = [];
  const n = points.length;

  // Alpha factor for Catmull-Rom to Bezier conversion
  // Higher tension = more influence from tangent vectors
  const alpha = tension / 6;

  const numSegments = closed ? n : n - 1;

  for (let i = 0; i < numSegments; i++) {
    // Get the four control points for this segment
    // For Catmull-Rom, we need point before, current, next, and after next
    const p0 = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[closed ? (i + 2) % n : Math.min(n - 1, i + 2)];

    // Calculate Bezier control points using Catmull-Rom formulas
    const cp1: CurvePoint = [
      p1[0] + alpha * (p2[0] - p0[0]),
      p1[1] + alpha * (p2[1] - p0[1]),
    ];

    const cp2: CurvePoint = [
      p2[0] - alpha * (p3[0] - p1[0]),
      p2[1] - alpha * (p3[1] - p1[1]),
    ];

    segments.push({
      start: p1,
      cp1,
      cp2,
      end: p2,
    });
  }

  return segments;
}

// ===========================================================================
// Bounding Box Calculation
// ===========================================================================

/**
 * Calculate axis-aligned bounding box for a set of points.
 *
 * @param points - Points to calculate bounds for
 * @returns Bounding box or null if no points
 */
function getCurveBounds(points: CurvePoint[]): CurveBounds | null {
  if (points.length === 0) {
    return null;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of points) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }

  return { minX, minY, maxX, maxY };
}

// ===========================================================================
// Distance Calculations
// ===========================================================================

/**
 * Calculate distance from a point to a line segment.
 *
 * Returns the shortest distance from the point to any point on the
 * line segment (not the infinite line).
 *
 * @param point - The query point
 * @param lineStart - Start of line segment
 * @param lineEnd - End of line segment
 * @returns Distance from point to nearest point on segment
 */
function distanceToLineSegment(
  point: CurvePoint,
  lineStart: CurvePoint,
  lineEnd: CurvePoint
): number {
  const [px, py] = point;
  const [x1, y1] = lineStart;
  const [x2, y2] = lineEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    return Math.hypot(px - x1, py - y1);
  }

  // Calculate projection parameter t
  // t = 0 -> closest to start, t = 1 -> closest to end
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to segment

  // Calculate closest point on segment
  const closestX = x1 + t * dx;
  const closestY = y1 + t * dy;

  return Math.hypot(px - closestX, py - closestY);
}

// ===========================================================================
// Bezier Curve Evaluation
// ===========================================================================

/**
 * Evaluate a cubic Bezier curve at parameter t.
 *
 * Uses De Casteljau's algorithm for numerical stability.
 *
 * @param segment - Bezier segment to evaluate
 * @param t - Parameter (0 = start, 1 = end)
 * @returns Point on curve at parameter t
 */
function evaluateBezier(segment: BezierSegment, t: number): CurvePoint {
  // Clamp t to [0, 1]
  const tc = Math.max(0, Math.min(1, t));
  const mt = 1 - tc;

  // Cubic Bezier formula: B(t) = (1-t)³P0 + 3(1-t)²tP1 + 3(1-t)t²P2 + t³P3
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = tc * tc;
  const t3 = t2 * tc;

  const x =
    mt3 * segment.start[0] +
    3 * mt2 * tc * segment.cp1[0] +
    3 * mt * t2 * segment.cp2[0] +
    t3 * segment.end[0];

  const y =
    mt3 * segment.start[1] +
    3 * mt2 * tc * segment.cp1[1] +
    3 * mt * t2 * segment.cp2[1] +
    t3 * segment.end[1];

  return [x, y];
}

// ===========================================================================
// Hit Testing
// ===========================================================================

/**
 * Find the closest point on a Bezier segment to a query point.
 *
 * Uses iterative subdivision for reasonable accuracy.
 *
 * @param segment - Bezier segment to test
 * @param point - Query point
 * @returns Closest point, distance, and parameter t
 */
function closestPointOnBezier(
  segment: BezierSegment,
  point: CurvePoint
): { point: CurvePoint; distance: number; t: number } {
  const SUBDIVISIONS = 20;
  let minDist = Infinity;
  let minT = 0;
  let minPoint: CurvePoint = segment.start;

  // Sample the curve at regular intervals
  for (let i = 0; i <= SUBDIVISIONS; i++) {
    const t = i / SUBDIVISIONS;
    const curvePoint = evaluateBezier(segment, t);
    const dist = Math.hypot(
      point[0] - curvePoint[0],
      point[1] - curvePoint[1]
    );

    if (dist < minDist) {
      minDist = dist;
      minT = t;
      minPoint = curvePoint;
    }
  }

  // Refine with binary search around the best t
  let low = Math.max(0, minT - 1 / SUBDIVISIONS);
  let high = Math.min(1, minT + 1 / SUBDIVISIONS);

  for (let i = 0; i < 10; i++) {
    const mid1 = low + (high - low) / 3;
    const mid2 = low + (high - low) * 2 / 3;

    const p1 = evaluateBezier(segment, mid1);
    const p2 = evaluateBezier(segment, mid2);

    const d1 = Math.hypot(point[0] - p1[0], point[1] - p1[1]);
    const d2 = Math.hypot(point[0] - p2[0], point[1] - p2[1]);

    if (d1 < d2) {
      high = mid2;
      if (d1 < minDist) {
        minDist = d1;
        minT = mid1;
        minPoint = p1;
      }
    } else {
      low = mid1;
      if (d2 < minDist) {
        minDist = d2;
        minT = mid2;
        minPoint = p2;
      }
    }
  }

  return {
    point: minPoint,
    distance: minDist,
    t: minT,
  };
}

/**
 * Check if a point is within threshold distance of a curve.
 *
 * @param curvePoints - Control points of the curve
 * @param point - Query point
 * @param threshold - Maximum distance to consider "near"
 * @param tension - Curve smoothing (for Catmull-Rom conversion)
 * @returns True if point is near curve
 */
function isPointNearCurve(
  curvePoints: CurvePoint[],
  point: CurvePoint,
  threshold: number,
  tension: number
): boolean {
  if (curvePoints.length === 0) {
    return false;
  }

  if (curvePoints.length === 1) {
    const dist = Math.hypot(
      point[0] - curvePoints[0][0],
      point[1] - curvePoints[0][1]
    );
    return dist <= threshold;
  }

  // Convert to Bezier and check each segment
  const segments = catmullRomToBezier(curvePoints, tension, false);

  for (const segment of segments) {
    const { distance } = closestPointOnBezier(segment, point);
    if (distance <= threshold) {
      return true;
    }
  }

  return false;
}

// ===========================================================================
// Exports (Datacore module format)
// ===========================================================================

return {
  simplifyPath,
  catmullRomToBezier,
  getCurveBounds,
  distanceToLineSegment,
  closestPointOnBezier,
  isPointNearCurve,
  evaluateBezier,
};
