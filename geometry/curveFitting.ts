/**
 * curveFitting.ts
 *
 * Converts raw pointer input points into smooth cubic bezier curves.
 * Uses Ramer-Douglas-Peucker simplification followed by Schneider's
 * iterative least-squares bezier fitting algorithm.
 */

import type { BezierSegment } from '#types/core/curve.types';

/** A 2D point as [x, y] tuple for internal use */
type Vec2 = [number, number];

// ============================================================================
// VECTOR MATH
// ============================================================================

function vAdd(a: Vec2, b: Vec2): Vec2 {
  return [a[0] + b[0], a[1] + b[1]];
}

function vSub(a: Vec2, b: Vec2): Vec2 {
  return [a[0] - b[0], a[1] - b[1]];
}

function vScale(v: Vec2, s: number): Vec2 {
  return [v[0] * s, v[1] * s];
}

function vDot(a: Vec2, b: Vec2): number {
  return a[0] * b[0] + a[1] * b[1];
}

function vLen(v: Vec2): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1]);
}

function vNorm(v: Vec2): Vec2 {
  const len = vLen(v);
  if (len < 1e-10) return [0, 0];
  return [v[0] / len, v[1] / len];
}

function vDist(a: Vec2, b: Vec2): number {
  return vLen(vSub(a, b));
}

// ============================================================================
// RAMER-DOUGLAS-PEUCKER SIMPLIFICATION
// ============================================================================

/**
 * Simplify a polyline by removing points that don't contribute
 * significant deviation from the line between their neighbors.
 */
function rdpSimplify(points: Vec2[], tolerance: number): Vec2[] {
  if (points.length <= 2) return points;

  // Find the point with maximum distance from the line (first -> last)
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = 0;

  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), tolerance);
    const right = rdpSimplify(points.slice(maxIdx), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [first, last];
  }
}

function perpendicularDistance(point: Vec2, lineStart: Vec2, lineEnd: Vec2): number {
  const dx = lineEnd[0] - lineStart[0];
  const dy = lineEnd[1] - lineStart[1];
  const lenSq = dx * dx + dy * dy;

  if (lenSq < 1e-10) return vDist(point, lineStart);

  let t = ((point[0] - lineStart[0]) * dx + (point[1] - lineStart[1]) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));

  const proj: Vec2 = [lineStart[0] + t * dx, lineStart[1] + t * dy];
  return vDist(point, proj);
}

// ============================================================================
// SCHNEIDER'S BEZIER FITTING
// ============================================================================

/** Maximum iterations for Newton-Raphson refinement */
const MAX_ITERATIONS = 4;

/**
 * Fit a sequence of points to one or more cubic bezier curves.
 * Returns array of BezierSegment tuples.
 *
 * @param points - Simplified point array (at least 2 points)
 * @param error - Maximum allowed fitting error (squared)
 */
function fitCubicBezier(points: Vec2[], error: number): BezierSegment[] {
  if (points.length < 2) return [];
  if (points.length === 2) {
    return [lineToBezier(points[0], points[1])];
  }

  // Compute left and right tangent vectors
  const tHat1 = computeLeftTangent(points, 0);
  const tHat2 = computeRightTangent(points, points.length - 1);

  return fitCubicBezierImpl(points, tHat1, tHat2, error);
}

function fitCubicBezierImpl(
  points: Vec2[],
  tHat1: Vec2,
  tHat2: Vec2,
  error: number
): BezierSegment[] {
  if (points.length === 2) {
    return [lineToBezier(points[0], points[1])];
  }

  // Parameterize points by chord length
  let u = chordLengthParameterize(points);

  // Generate bezier curve and check fit
  let bezCurve = generateBezier(points, u, tHat1, tHat2);
  let { maxError, splitPoint } = computeMaxError(points, bezCurve, u);

  if (maxError < error) {
    return [bezierToSegment(bezCurve)];
  }

  // If error is not too large, try reparameterization
  const iterationError = error * 4;
  if (maxError < iterationError) {
    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const uPrime = reparameterize(points, u, bezCurve);
      bezCurve = generateBezier(points, uPrime, tHat1, tHat2);
      const result = computeMaxError(points, bezCurve, uPrime);
      maxError = result.maxError;
      splitPoint = result.splitPoint;

      if (maxError < error) {
        return [bezierToSegment(bezCurve)];
      }
      u = uPrime;
    }
  }

  // Fitting failed — split at point of max error and fit each half
  const tHatCenter = computeCenterTangent(points, splitPoint);
  const left = fitCubicBezierImpl(
    points.slice(0, splitPoint + 1),
    tHat1,
    vScale(tHatCenter, -1),
    error
  );
  const right = fitCubicBezierImpl(
    points.slice(splitPoint),
    tHatCenter,
    tHat2,
    error
  );

  return [...left, ...right];
}

function lineToBezier(p0: Vec2, p1: Vec2): BezierSegment {
  const dist = vDist(p0, p1) / 3;
  const dir = vNorm(vSub(p1, p0));
  return [
    p0[0] + dir[0] * dist, p0[1] + dir[1] * dist,
    p1[0] - dir[0] * dist, p1[1] - dir[1] * dist,
    p1[0], p1[1]
  ];
}

function bezierToSegment(b: Vec2[]): BezierSegment {
  return [b[1][0], b[1][1], b[2][0], b[2][1], b[3][0], b[3][1]];
}

// ============================================================================
// TANGENT COMPUTATION
// ============================================================================

function computeLeftTangent(points: Vec2[], end: number): Vec2 {
  return vNorm(vSub(points[end + 1], points[end]));
}

function computeRightTangent(points: Vec2[], end: number): Vec2 {
  return vNorm(vSub(points[end - 1], points[end]));
}

function computeCenterTangent(points: Vec2[], center: number): Vec2 {
  const v1 = vSub(points[center - 1], points[center]);
  const v2 = vSub(points[center], points[center + 1]);
  const avg: Vec2 = [(v1[0] + v2[0]) / 2, (v1[1] + v2[1]) / 2];
  return vNorm(avg);
}

// ============================================================================
// PARAMETERIZATION
// ============================================================================

function chordLengthParameterize(points: Vec2[]): number[] {
  const u = [0];
  for (let i = 1; i < points.length; i++) {
    u.push(u[i - 1] + vDist(points[i], points[i - 1]));
  }
  const totalLen = u[u.length - 1];
  if (totalLen > 0) {
    for (let i = 1; i < u.length; i++) {
      u[i] /= totalLen;
    }
  }
  return u;
}

function reparameterize(points: Vec2[], u: number[], bezCurve: Vec2[]): number[] {
  return u.map((uVal, i) => newtonRaphsonRootFind(bezCurve, points[i], uVal));
}

function newtonRaphsonRootFind(bez: Vec2[], point: Vec2, u: number): number {
  // Q(u)
  const q = bezierEval(3, bez, u);
  // Q'(u) - first derivative
  const q1 = bezierDerivatives(bez);
  const q1u = bezierEval(2, q1, u);
  // Q''(u) - second derivative
  const q2 = bezierDerivatives(q1);
  const q2u = bezierEval(1, q2, u);

  const diff = vSub(q, point);
  const numerator = vDot(diff, q1u);
  const denominator = vDot(q1u, q1u) + vDot(diff, q2u);

  if (Math.abs(denominator) < 1e-12) return u;

  return u - numerator / denominator;
}

function bezierDerivatives(bez: Vec2[]): Vec2[] {
  const d: Vec2[] = [];
  const degree = bez.length - 1;
  for (let i = 0; i < degree; i++) {
    d.push(vScale(vSub(bez[i + 1], bez[i]), degree));
  }
  return d;
}

// ============================================================================
// BEZIER GENERATION & EVALUATION
// ============================================================================

function generateBezier(
  points: Vec2[],
  uPrime: number[],
  tHat1: Vec2,
  tHat2: Vec2
): Vec2[] {
  const first = points[0];
  const last = points[points.length - 1];
  const nPts = points.length;

  // Compute A matrix (precomputed Bernstein basis)
  const A: [Vec2, Vec2][] = [];
  for (let i = 0; i < nPts; i++) {
    const u = uPrime[i];
    const b1 = 3 * u * (1 - u) * (1 - u);
    const b2 = 3 * u * u * (1 - u);
    A.push([vScale(tHat1, b1), vScale(tHat2, b2)]);
  }

  // Create C and X matrices
  const C: [[number, number], [number, number]] = [[0, 0], [0, 0]];
  const X: [number, number] = [0, 0];

  for (let i = 0; i < nPts; i++) {
    C[0][0] += vDot(A[i][0], A[i][0]);
    C[0][1] += vDot(A[i][0], A[i][1]);
    C[1][0] = C[0][1];
    C[1][1] += vDot(A[i][1], A[i][1]);

    const u = uPrime[i];
    const b0 = (1 - u) * (1 - u) * (1 - u);
    const b1 = 3 * u * (1 - u) * (1 - u);
    const b2 = 3 * u * u * (1 - u);
    const b3 = u * u * u;

    const tmp = vSub(
      points[i],
      vAdd(
        vAdd(vScale(first, b0), vScale(first, b1)),
        vAdd(vScale(last, b2), vScale(last, b3))
      )
    );

    X[0] += vDot(A[i][0], tmp);
    X[1] += vDot(A[i][1], tmp);
  }

  // Compute determinants of C and X
  const det_C0_C1 = C[0][0] * C[1][1] - C[1][0] * C[0][1];
  const det_C0_X = C[0][0] * X[1] - C[1][0] * X[0];
  const det_X_C1 = X[0] * C[1][1] - X[1] * C[0][1];

  // Derive alpha values
  const alpha_l = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_X_C1 / det_C0_C1;
  const alpha_r = Math.abs(det_C0_C1) < 1e-12 ? 0 : det_C0_X / det_C0_C1;

  // If alpha is negative or unreasonably large, use the Wu/Barsky heuristic.
  // Large alphas occur when the C matrix determinant is near-zero (nearly-parallel
  // tangents), placing control points far from the curve and creating spike artifacts.
  const segLength = vDist(first, last);
  const epsilon = 1e-6 * segLength;
  const maxAlpha = segLength;

  if (alpha_l < epsilon || alpha_r < epsilon ||
      alpha_l > maxAlpha || alpha_r > maxAlpha) {
    const dist = segLength / 3;
    return [
      first,
      vAdd(first, vScale(tHat1, dist)),
      vAdd(last, vScale(tHat2, dist)),
      last
    ];
  }

  return [
    first,
    vAdd(first, vScale(tHat1, alpha_l)),
    vAdd(last, vScale(tHat2, alpha_r)),
    last
  ];
}

function bezierEval(degree: number, V: Vec2[], t: number): Vec2 {
  const tmp: Vec2[] = V.slice(0, degree + 1).map(v => [...v] as Vec2);

  for (let i = 1; i <= degree; i++) {
    for (let j = 0; j <= degree - i; j++) {
      tmp[j] = [
        (1 - t) * tmp[j][0] + t * tmp[j + 1][0],
        (1 - t) * tmp[j][1] + t * tmp[j + 1][1]
      ];
    }
  }
  return tmp[0];
}

// ============================================================================
// ERROR COMPUTATION
// ============================================================================

function computeMaxError(
  points: Vec2[],
  bezCurve: Vec2[],
  u: number[]
): { maxError: number; splitPoint: number } {
  let maxDist = 0;
  let splitPoint = Math.floor(points.length / 2);

  for (let i = 1; i < points.length - 1; i++) {
    const p = bezierEval(3, bezCurve, u[i]);
    const diff = vSub(p, points[i]);
    const dist = vDot(diff, diff); // squared distance
    if (dist >= maxDist) {
      maxDist = dist;
      splitPoint = i;
    }
  }

  return { maxError: maxDist, splitPoint };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/** Default simplification tolerance in world units */
const DEFAULT_SIMPLIFY_TOLERANCE = 2;

/** Default fitting error (squared) in world units */
const DEFAULT_FIT_ERROR = 16; // 4px squared

/**
 * Convert an array of raw input points to fitted cubic bezier segments.
 *
 * @param rawPoints - Array of {x, y} from pointer events
 * @param simplifyTolerance - RDP tolerance in world units (default 2)
 * @param fitError - Max fitting error squared (default 16 = 4px^2)
 * @returns Object with start point and bezier segments
 */
function fitPointsToBezier(
  rawPoints: { x: number; y: number }[],
  simplifyTolerance: number = DEFAULT_SIMPLIFY_TOLERANCE,
  fitError: number = DEFAULT_FIT_ERROR
): { start: [number, number]; segments: BezierSegment[] } | null {
  if (rawPoints.length < 2) return null;

  // Convert to Vec2 tuples
  const pts: Vec2[] = rawPoints.map(p => [p.x, p.y]);

  // Remove exact duplicates (common with pointer events)
  const deduped: Vec2[] = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i][0] !== pts[i - 1][0] || pts[i][1] !== pts[i - 1][1]) {
      deduped.push(pts[i]);
    }
  }

  if (deduped.length < 2) return null;

  // Simplify
  const simplified = rdpSimplify(deduped, simplifyTolerance);
  if (simplified.length < 2) return null;

  // Fit to bezier curves
  const segments = fitCubicBezier(simplified, fitError);

  return {
    start: simplified[0],
    segments
  };
}

return {
  fitPointsToBezier,
  rdpSimplify,
  fitCubicBezier
};
