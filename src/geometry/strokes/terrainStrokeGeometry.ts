/**
 * terrainStrokeGeometry.ts
 *
 * Pure math for terrain brush strokes (no canvas, no Preact): pointer-sample
 * thinning, commit-time simplification, world bounds, and polyline distance
 * for the erase hit test. Rendering sweeps the polyline with round caps, so a
 * stroke's coverage is the capsule union of its segments at `radius`.
 */

import type { TerrainStroke } from '#types/core/terrainstroke.types';

import { rdpSimplify } from '../curves/curveFitting';

/** Sanity cap on persisted points per stroke (long drags get simplified anyway). */
const MAX_STROKE_POINTS = 2000;

/**
 * Append (x, y) to a flat pair array only when it is at least `minDist` from
 * the previous point. Returns true when appended. Mutates `points` (the live
 * in-progress stroke buffer).
 */
function appendPointIfFar(points: number[], x: number, y: number, minDist: number): boolean {
  const n = points.length;
  if (n >= 2) {
    const dx = x - points[n - 2];
    const dy = y - points[n - 1];
    if (Math.hypot(dx, dy) < minDist) return false;
  }
  if (n >= MAX_STROKE_POINTS * 2) return false;
  points.push(x, y);
  return true;
}

/**
 * Commit-time cleanup: dedupe consecutive points, RDP-simplify at `tolerance`
 * (world units), and return a fresh flat array. A single point passes through
 * unchanged (renders as a dab).
 */
function finalizeStrokePoints(points: number[], tolerance: number): number[] {
  if (points.length <= 2) return [...points];

  const tuples: Array<[number, number]> = [];
  for (let i = 0; i + 1 < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    const prev = tuples[tuples.length - 1];
    if (prev == null || prev[0] !== x || prev[1] !== y) tuples.push([x, y]);
  }
  if (tuples.length === 1) return [tuples[0][0], tuples[0][1]];

  const simplified = rdpSimplify(tuples, tolerance);
  const out: number[] = [];
  for (const [x, y] of simplified) out.push(x, y);
  return out;
}

/** World-space bounding box of the stroke's capsule coverage (points ± radius). */
function strokeBoundsWorld(stroke: TerrainStroke): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const pts = stroke.points;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    if (pts[i] < minX) minX = pts[i];
    if (pts[i] > maxX) maxX = pts[i];
    if (pts[i + 1] < minY) minY = pts[i + 1];
    if (pts[i + 1] > maxY) maxY = pts[i + 1];
  }
  return {
    minX: minX - stroke.radius,
    minY: minY - stroke.radius,
    maxX: maxX + stroke.radius,
    maxY: maxY + stroke.radius,
  };
}

/**
 * Shortest distance from a point to a flat-pair polyline (segment-projected,
 * so beyond-endpoint queries measure to the round cap center). A single-point
 * polyline measures to that point.
 */
function distancePointToPolyline(px: number, py: number, points: number[]): number {
  if (points.length < 2) return Infinity;
  if (points.length === 2) return Math.hypot(px - points[0], py - points[1]);

  let best = Infinity;
  for (let i = 0; i + 3 < points.length; i += 2) {
    const x1 = points[i], y1 = points[i + 1];
    const x2 = points[i + 2], y2 = points[i + 3];
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
    t = Math.max(0, Math.min(1, t));
    const d = Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    if (d < best) best = d;
  }
  return best;
}

export {
  appendPointIfFar,
  finalizeStrokePoints,
  strokeBoundsWorld,
  distancePointToPolyline,
  MAX_STROKE_POINTS,
};
