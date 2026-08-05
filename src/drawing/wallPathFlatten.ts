/**
 * wallPathFlatten.ts
 *
 * Pure wall-path flattening: vertices (straight or quadratic-arc segments)
 * to a cached world-space polyline. Lives in drawing/ so both interaction
 * math (wallPathOperations) and the canvas renderer (wallPathRenderer) can
 * consume it without the renderer sitting inside a drawing-layer import
 * cycle — drawing feeds renderers, never the reverse.
 */

import type { WallPath } from '#types/core/wallpath.types';

interface FlattenedPath {
  /** Flattened polyline points in world coords. */
  points: Array<[number, number]>;
  /** Total arc length in world units. */
  totalLength: number;
}

/** Evaluate a quadratic bezier at t. */
function quadPoint(
  p0x: number, p0y: number,
  cx: number, cy: number,
  p1x: number, p1y: number,
  t: number,
): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * p0x + 2 * mt * t * cx + t * t * p1x,
    mt * mt * p0y + 2 * mt * t * cy + t * t * p1y,
  ];
}

/**
 * Subdivision count for a quadratic arc, scaled to how far the control point
 * bows the segment. Flat-ish arcs get few pieces, deep bows get more.
 */
function arcSubdivisions(
  p0x: number, p0y: number,
  cx: number, cy: number,
  p1x: number, p1y: number,
): number {
  const midX = (p0x + p1x) / 2;
  const midY = (p0y + p1y) / 2;
  const dev = Math.hypot(cx - midX, cy - midY);
  return Math.max(8, Math.min(48, Math.ceil(dev / 4) * 4));
}

/**
 * Per-object flatten cache, keyed by WallPath reference. Mutations replace the
 * WallPath object (immutable updates), so a changed wall misses and re-flattens
 * while unchanged walls reuse across frames; entries are GC'd with their walls.
 * Mirrors curveRenderer's `path2DCache`.
 */
const flattenCache = new WeakMap<WallPath, FlattenedPath>();

/**
 * Flatten a wall path to a polyline. Straight segments contribute their two
 * endpoints; arc segments subdivide. Closed paths append the closing segment
 * (which may itself arc via the last vertex's `arc`).
 */
function flattenWallPath(wallPath: WallPath): FlattenedPath {
  const cached = flattenCache.get(wallPath);
  if (cached != null) return cached;
  const result = computeFlattenWallPath(wallPath);
  flattenCache.set(wallPath, result);
  return result;
}

function computeFlattenWallPath(wallPath: WallPath): FlattenedPath {
  const verts = wallPath.vertices;
  const points: Array<[number, number]> = [];
  if (verts.length < 2) return { points, totalLength: 0 };

  points.push([verts[0].x, verts[0].y]);

  const segCount = wallPath.closed ? verts.length : verts.length - 1;
  for (let i = 0; i < segCount; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % verts.length];
    if (a.arc != null) {
      const [cx, cy] = a.arc;
      const n = arcSubdivisions(a.x, a.y, cx, cy, b.x, b.y);
      for (let s = 1; s <= n; s++) {
        points.push(quadPoint(a.x, a.y, cx, cy, b.x, b.y, s / n));
      }
    } else {
      points.push([b.x, b.y]);
    }
  }

  let totalLength = 0;
  for (let i = 1; i < points.length; i++) {
    totalLength += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]);
  }
  return { points, totalLength };
}

export { quadPoint, arcSubdivisions, flattenWallPath };
export type { FlattenedPath };
