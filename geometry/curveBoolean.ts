/**
 * curveBoolean.ts
 *
 * Boolean subtraction of grid cells from freehand curves using the
 * polygon-clipping library (Martinez-Rueda-Feito algorithm).
 *
 * After erasure, the curve's path data (start + segments) IS the modified
 * geometry. No secondary data structures like "erasedCells" or flat hole
 * arrays. Inner rings from boolean holes are stored as coordinate-pair
 * arrays on `curve.innerRings`.
 */

import type { Curve, BezierSegment } from '#types/core/curve.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { difference } = await requireModuleByName("polygonClipping.ts") as {
  difference: (
    subject: [number, number][][] | [number, number][][][],
    ...clips: ([number, number][][] | [number, number][][][])[]
  ) => [number, number][][][]
};

/** A 2D point as [x, y] tuple */
type Pt = [number, number];

// polygon-clipping format types
type Ring = Pt[];
type Polygon = Ring[];
type MultiPolygon = Polygon[];

// =========================================================================
// Bezier flattening
// =========================================================================

/**
 * Evaluate a cubic bezier at parameter t.
 */
function evalBezier(
  p0x: number, p0y: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  p3x: number, p3y: number,
  t: number
): Pt {
  const mt = 1 - t;
  const mt2 = mt * mt;
  const mt3 = mt2 * mt;
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    mt3 * p0x + 3 * mt2 * t * p1x + 3 * mt * t2 * p2x + t3 * p3x,
    mt3 * p0y + 3 * mt2 * t * p1y + 3 * mt * t2 * p2y + t3 * p3y
  ];
}

/**
 * Check if a cubic bezier segment is effectively linear.
 * Returns true when both control points lie on (or very close to)
 * the line between the start and end points.
 */
function isLinearBezier(
  p0x: number, p0y: number,
  cp1x: number, cp1y: number,
  cp2x: number, cp2y: number,
  p3x: number, p3y: number,
  epsilon: number = 0.1
): boolean {
  // Distance from control points to the line (p0 → p3)
  const dx = p3x - p0x;
  const dy = p3y - p0y;
  const lenSq = dx * dx + dy * dy;

  if (lenSq < epsilon * epsilon) {
    // Degenerate: start ≈ end, check if control points are also close
    return (
      (cp1x - p0x) * (cp1x - p0x) + (cp1y - p0y) * (cp1y - p0y) < epsilon * epsilon &&
      (cp2x - p0x) * (cp2x - p0x) + (cp2y - p0y) * (cp2y - p0y) < epsilon * epsilon
    );
  }

  // Perpendicular distance of cp1 from line p0→p3
  const d1 = Math.abs(dx * (p0y - cp1y) - dy * (p0x - cp1x)) / Math.sqrt(lenSq);
  // Perpendicular distance of cp2 from line p0→p3
  const d2 = Math.abs(dx * (p0y - cp2y) - dy * (p0x - cp2x)) / Math.sqrt(lenSq);

  return d1 < epsilon && d2 < epsilon;
}

/**
 * Flatten a curve's bezier segments into a dense polygon ring.
 * Returns array of [x, y] points suitable for polygon-clipping.
 * The ring is closed (last point equals first point) as required by GeoJSON.
 *
 * Linear bezier segments (from previous boolean subtractions) are emitted
 * as a single endpoint to prevent vertex count explosion.
 */
function flattenCurve(curve: Curve, stepsPerSegment: number = 16): Pt[] {
  const pts: Pt[] = [];
  let px = curve.start[0];
  let py = curve.start[1];
  pts.push([px, py]);

  const segs = curve.segments;
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];

    if (isLinearBezier(px, py, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5])) {
      // Linear segment: emit only the endpoint
      pts.push([seg[4], seg[5]]);
    } else {
      // True curve: subdivide
      for (let step = 1; step <= stepsPerSegment; step++) {
        const t = step / stepsPerSegment;
        const pt = evalBezier(px, py, seg[0], seg[1], seg[2], seg[3], seg[4], seg[5], t);
        pts.push(pt);
      }
    }
    px = seg[4];
    py = seg[5];
  }

  // Close the ring (GeoJSON requirement: first == last)
  if (pts.length > 1) {
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      pts.push([first[0], first[1]]);
    }
  }

  return pts;
}

// =========================================================================
// Point-in-polygon (ray casting)
// =========================================================================

/**
 * Test if point (px, py) is inside a polygon using ray casting.
 * Polygon is given as array of [x, y] points (assumed closed).
 */
function pointInPolygon(px: number, py: number, poly: Pt[]): boolean {
  let inside = false;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    if (((yi > py) !== (yj > py)) &&
        (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// =========================================================================
// Cell overlap detection
// =========================================================================

/**
 * Check if a cell rectangle overlaps with a curve's filled region.
 * Tests cell center and corners against the outer polygon,
 * then excludes cells that fall entirely within an inner ring (hole).
 */
function cellOverlapsCurve(
  cellX: number, cellY: number, cellSize: number,
  outerPoly: Pt[],
  innerRings?: Pt[][]
): boolean {
  const x0 = cellX * cellSize;
  const y0 = cellY * cellSize;
  const cx = x0 + cellSize * 0.5;
  const cy = y0 + cellSize * 0.5;

  // Quick check: is cell center inside outer polygon?
  let centerInside = pointInPolygon(cx, cy, outerPoly);

  if (!centerInside) {
    // Check corners — cell might straddle the boundary
    const x1 = x0 + cellSize;
    const y1 = y0 + cellSize;
    if (!pointInPolygon(x0, y0, outerPoly) &&
        !pointInPolygon(x1, y0, outerPoly) &&
        !pointInPolygon(x0, y1, outerPoly) &&
        !pointInPolygon(x1, y1, outerPoly)) {
      // Check if any polygon edge intersects the cell rect
      if (!polygonIntersectsRect(outerPoly, x0, y0, x1, y1)) {
        return false;
      }
    }
    // At least one corner or edge intersects — cell overlaps
  } else {
    // Center is inside outer polygon — check it's not inside a hole
    if (innerRings) {
      for (let h = 0; h < innerRings.length; h++) {
        if (pointInPolygon(cx, cy, innerRings[h])) {
          return false; // Cell center is inside a hole
        }
      }
    }
  }

  return true;
}

/**
 * Check if any edge of a polygon intersects an axis-aligned rectangle.
 */
function polygonIntersectsRect(poly: Pt[], rx0: number, ry0: number, rx1: number, ry1: number): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (segmentIntersectsRect(poly[i][0], poly[i][1], poly[j][0], poly[j][1], rx0, ry0, rx1, ry1)) {
      return true;
    }
  }
  return false;
}

/**
 * Cohen-Sutherland segment vs AABB intersection test.
 */
function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  rx0: number, ry0: number, rx1: number, ry1: number
): boolean {
  function outcode(x: number, y: number): number {
    let code = 0;
    if (x < rx0) code |= 1;
    else if (x > rx1) code |= 2;
    if (y < ry0) code |= 4;
    else if (y > ry1) code |= 8;
    return code;
  }

  let oc1 = outcode(x1, y1);
  let oc2 = outcode(x2, y2);

  for (let iter = 0; iter < 20; iter++) {
    if ((oc1 | oc2) === 0) return true;
    if ((oc1 & oc2) !== 0) return false;

    const ocOut = oc1 !== 0 ? oc1 : oc2;
    let x: number, y: number;

    if (ocOut & 8) {
      x = x1 + (x2 - x1) * (ry1 - y1) / (y2 - y1);
      y = ry1;
    } else if (ocOut & 4) {
      x = x1 + (x2 - x1) * (ry0 - y1) / (y2 - y1);
      y = ry0;
    } else if (ocOut & 2) {
      y = y1 + (y2 - y1) * (rx1 - x1) / (x2 - x1);
      x = rx1;
    } else {
      y = y1 + (y2 - y1) * (rx0 - x1) / (x2 - x1);
      x = rx0;
    }

    if (ocOut === oc1) {
      x1 = x; y1 = y;
      oc1 = outcode(x1, y1);
    } else {
      x2 = x; y2 = y;
      oc2 = outcode(x2, y2);
    }
  }

  return false;
}

// =========================================================================
// Polygon winding utilities
// =========================================================================

/**
 * Compute the signed area of a polygon ring.
 * Positive = CCW, Negative = CW (standard math orientation).
 */
function signedArea(ring: Pt[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  }
  return area / 2;
}

/**
 * Ensure a ring has counter-clockwise winding.
 * polygon-clipping expects CCW outer rings.
 */
function ensureCCW(ring: Pt[]): Pt[] {
  if (signedArea(ring) > 0) {
    return ring.slice().reverse();
  }
  return ring;
}

/**
 * Ensure a ring has clockwise winding.
 * polygon-clipping expects CW inner rings (holes).
 */
function ensureCW(ring: Pt[]): Pt[] {
  if (signedArea(ring) < 0) {
    return ring.slice().reverse();
  }
  return ring;
}

// =========================================================================
// Polygon simplification
// =========================================================================

/**
 * Remove collinear points from a polygon ring.
 * Keeps the ring's shape but eliminates redundant vertices that lie
 * on straight edges. Prevents vertex count from growing unboundedly
 * across repeated boolean subtractions.
 */
function simplifyRing(ring: Pt[], epsilon: number = 0.1): Pt[] {
  if (ring.length < 4) return ring; // Need at least 3 unique + closing

  // Check if ring is closed
  const isClosed = ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];

  // Work with open ring (remove closing point temporarily)
  const open = isClosed ? ring.slice(0, -1) : ring.slice();
  if (open.length < 3) return ring;

  const result: Pt[] = [];
  const n = open.length;

  for (let i = 0; i < n; i++) {
    const prev = open[(i - 1 + n) % n];
    const curr = open[i];
    const next = open[(i + 1) % n];

    // Cross product to detect collinearity
    const cross = (curr[0] - prev[0]) * (next[1] - prev[1]) -
                  (curr[1] - prev[1]) * (next[0] - prev[0]);

    if (Math.abs(cross) > epsilon) {
      result.push(curr);
    }
  }

  if (result.length < 3) return ring; // Degenerate, keep original

  // Re-close if was closed
  if (isClosed) {
    result.push([result[0][0], result[0][1]]);
  }

  return result;
}

// =========================================================================
// Curve ↔ Polygon conversion
// =========================================================================

/**
 * Build a polygon-clipping-compatible Polygon from a Curve.
 * Returns [outerRing, ...innerRings] where outer is CCW and inners are CW.
 */
function curveToPolygon(curve: Curve): Polygon {
  const outer = ensureCCW(flattenCurve(curve));
  const rings: Ring[] = [outer];

  if (curve.innerRings) {
    for (let i = 0; i < curve.innerRings.length; i++) {
      const ring = curve.innerRings[i];
      if (ring.length < 3) continue;
      // Ensure closed ring
      let closed = ring;
      const first = ring[0];
      const last = ring[ring.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        closed = [...ring, [first[0], first[1]]];
      }
      rings.push(ensureCW(closed));
    }
  }

  return rings;
}

/**
 * Convert a polygon-clipping result polygon (one element of MultiPolygon)
 * back to a Curve object.
 *
 * The outer ring becomes start + segments (degenerate linear beziers).
 * Any inner rings are stored as curve.innerRings.
 */
function polygonToCurve(
  rings: Polygon,
  template: Curve,
  newId?: string
): Curve {
  const outerRing = rings[0];
  // Remove closing point if present (we store open rings in segments)
  let outer = outerRing;
  if (outer.length > 1) {
    const first = outer[0];
    const last = outer[outer.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      outer = outer.slice(0, -1);
    }
  }

  if (outer.length < 3) {
    // Degenerate polygon — return a minimal placeholder
    const start: Pt = outer.length > 0 ? [outer[0][0], outer[0][1]] : [0, 0];
    return {
      id: newId || template.id,
      start,
      segments: [],
      closed: true,
      color: template.color,
      opacity: template.opacity,
      strokeColor: template.strokeColor,
      strokeWidth: template.strokeWidth
    };
  }

  const start: Pt = [outer[0][0], outer[0][1]];
  const segments: BezierSegment[] = [];

  for (let i = 1; i < outer.length; i++) {
    const prev = outer[i - 1];
    const curr = outer[i];
    // Linear bezier: control points at 1/3 and 2/3 along the line
    const cp1x = prev[0] + (curr[0] - prev[0]) / 3;
    const cp1y = prev[1] + (curr[1] - prev[1]) / 3;
    const cp2x = prev[0] + 2 * (curr[0] - prev[0]) / 3;
    const cp2y = prev[1] + 2 * (curr[1] - prev[1]) / 3;
    segments.push([cp1x, cp1y, cp2x, cp2y, curr[0], curr[1]]);
  }

  // Collect inner rings (holes), removing closing points
  let innerRings: Pt[][] | undefined;
  if (rings.length > 1) {
    innerRings = [];
    for (let r = 1; r < rings.length; r++) {
      let ring = rings[r];
      if (ring.length > 1) {
        const first = ring[0];
        const last = ring[ring.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) {
          ring = ring.slice(0, -1);
        }
      }
      if (ring.length >= 3) {
        innerRings.push(ring);
      }
    }
    if (innerRings.length === 0) {
      innerRings = undefined;
    }
  }

  const curve: Curve = {
    id: newId || template.id,
    start,
    segments,
    closed: true,
    color: template.color,
    opacity: template.opacity,
    strokeColor: template.strokeColor,
    strokeWidth: template.strokeWidth
  };

  if (innerRings) {
    curve.innerRings = innerRings;
  }

  return curve;
}

// =========================================================================
// Polygon area filter (remove degenerate slivers)
// =========================================================================

/**
 * Compute the absolute area of a polygon (with holes).
 */
function polygonArea(rings: Polygon): number {
  let area = Math.abs(signedArea(rings[0]));
  for (let i = 1; i < rings.length; i++) {
    area -= Math.abs(signedArea(rings[i]));
  }
  return Math.abs(area);
}

// =========================================================================
// Main API
// =========================================================================

/**
 * Subtract a grid cell from a single curve using boolean polygon subtraction.
 *
 * @returns Array of resulting curves (0 if fully erased, 1 if modified, 2+ if split)
 */
function subtractCellFromCurve(
  curve: Curve,
  cellX: number, cellY: number,
  cellSize: number
): Curve[] {
  if (!curve.closed) return [curve];

  // Build subject polygon from curve
  const subject = curveToPolygon(curve);
  if (subject[0].length < 4) return [curve]; // Need at least 3 points + closing

  // Build clip polygon (cell rectangle, CCW)
  const rx0 = cellX * cellSize;
  const ry0 = cellY * cellSize;
  const rx1 = rx0 + cellSize;
  const ry1 = ry0 + cellSize;

  const cellPoly: Polygon = [[
    [rx0, ry0],
    [rx1, ry0],
    [rx1, ry1],
    [rx0, ry1],
    [rx0, ry0]
  ]];

  // Boolean difference
  let result: MultiPolygon;
  try {
    result = difference(subject, cellPoly);
  } catch {
    // polygon-clipping can throw on degenerate input — preserve original
    return [curve];
  }

  if (!result || result.length === 0) {
    return []; // Fully erased
  }

  // Minimum area threshold to filter degenerate slivers
  const minArea = cellSize * cellSize * 0.01;

  // Convert results back to Curve objects, simplifying rings first
  const resultCurves: Curve[] = [];
  for (let i = 0; i < result.length; i++) {
    const poly = result[i];
    if (polygonArea(poly) < minArea) continue;

    // Simplify all rings to remove collinear vertices from cell subtraction
    const simplified: Polygon = poly.map(ring => simplifyRing(ring));

    const id = i === 0
      ? curve.id
      : curve.id + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);

    resultCurves.push(polygonToCurve(simplified, curve, id));
  }

  return resultCurves.length > 0 ? resultCurves : [];
}

/**
 * Find which curve (if any) contains a grid cell.
 * Returns the index of the first overlapping curve, or -1.
 * Accounts for inner rings (holes) — cells inside holes are not found.
 */
function findCurveAtCell(
  curves: Curve[],
  cellX: number, cellY: number,
  cellSize: number
): number {
  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (!curve || !curve.closed) continue;

    const outerPoly = flattenCurve(curve);
    if (outerPoly.length < 3) continue;

    // Build inner ring polygons for hole checking
    let innerPolys: Pt[][] | undefined;
    if (curve.innerRings && curve.innerRings.length > 0) {
      innerPolys = curve.innerRings.filter(r => r.length >= 3);
    }

    if (cellOverlapsCurve(cellX, cellY, cellSize, outerPoly, innerPolys)) {
      return i;
    }
  }
  return -1;
}

/**
 * Erase a cell from the curves array using boolean polygon subtraction.
 *
 * @param curves - Current array of curves
 * @param cellX - Grid column to erase
 * @param cellY - Grid row to erase
 * @param cellSize - Grid cell size in world units
 * @returns New curves array with the cell erased, or null if no curve was affected
 */
function eraseCellFromCurves(
  curves: Curve[],
  cellX: number, cellY: number,
  cellSize: number
): Curve[] | null {
  if (!curves || curves.length === 0) return null;

  const idx = findCurveAtCell(curves, cellX, cellY, cellSize);
  if (idx === -1) return null;

  const affected = curves[idx];
  const resultCurves = subtractCellFromCurve(affected, cellX, cellY, cellSize);

  // Build new curves array: replace affected curve with result(s)
  const newCurves: Curve[] = [];
  for (let i = 0; i < curves.length; i++) {
    if (i === idx) {
      for (let j = 0; j < resultCurves.length; j++) {
        newCurves.push(resultCurves[j]);
      }
    } else {
      newCurves.push(curves[i]);
    }
  }

  return newCurves;
}

/**
 * Subtract a world-coordinate rectangle from all curves using boolean polygon subtraction.
 *
 * @param curves - Current array of curves
 * @param worldMinX - Left edge in world coordinates
 * @param worldMinY - Top edge in world coordinates
 * @param worldMaxX - Right edge in world coordinates
 * @param worldMaxY - Bottom edge in world coordinates
 * @returns New curves array with the rectangle subtracted, or null if no curves were affected
 */
function eraseRectangleFromCurves(
  curves: Curve[],
  worldMinX: number, worldMinY: number,
  worldMaxX: number, worldMaxY: number
): Curve[] | null {
  if (!curves || curves.length === 0) return null;

  const rectPoly: Polygon = [[
    [worldMinX, worldMinY],
    [worldMaxX, worldMinY],
    [worldMaxX, worldMaxY],
    [worldMinX, worldMaxY],
    [worldMinX, worldMinY]
  ]];

  let changed = false;
  const newCurves: Curve[] = [];

  for (let i = 0; i < curves.length; i++) {
    const curve = curves[i];
    if (!curve.closed) {
      newCurves.push(curve);
      continue;
    }

    const subject = curveToPolygon(curve);
    if (subject[0].length < 4) {
      newCurves.push(curve);
      continue;
    }

    let result: MultiPolygon;
    try {
      result = difference(subject, rectPoly);
    } catch {
      newCurves.push(curve);
      continue;
    }

    if (!result || result.length === 0) {
      changed = true;
      continue;
    }

    const minArea = 1.0;
    let anyKept = false;
    for (let j = 0; j < result.length; j++) {
      const poly = result[j];
      if (polygonArea(poly) < minArea) continue;
      const simplified: Polygon = poly.map(ring => simplifyRing(ring));
      const id = j === 0
        ? curve.id
        : curve.id + '-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6);
      newCurves.push(polygonToCurve(simplified, curve, id));
      anyKept = true;
    }

    if (!anyKept || result.length !== 1 || subject[0].length !== result[0][0].length) {
      changed = true;
    }
  }

  return changed ? newCurves : null;
}

return {
  flattenCurve,
  isLinearBezier,
  simplifyRing,
  pointInPolygon,
  cellOverlapsCurve,
  curveToPolygon,
  polygonToCurve,
  subtractCellFromCurve,
  findCurveAtCell,
  eraseCellFromCurves,
  eraseRectangleFromCurves
};
