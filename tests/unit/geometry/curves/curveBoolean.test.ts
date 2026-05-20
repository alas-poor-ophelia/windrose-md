/**
 * curveBoolean Unit Tests
 *
 * Tests boolean polygon subtraction for curve erasure.
 * Mocks the polygonClipping wrapper to use the npm package directly.
 */

import { describe, it, expect, vi, beforeAll } from "vitest";
import polygonClipping from "polygon-clipping";

// Mock the Datacore polygonClipping wrapper to use the npm package
vi.mock("../../../../src/geometry/curves/polygonClipping.ts", () => ({
  difference: polygonClipping.difference
}));

import {
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
  eraseRectangleFromCurves,
  eraseWorldPolygonFromCurves,
  openCurveOverlapsRect,
  openCurveOverlapsPolygon,
} from "../../../../src/geometry/curves/curveBoolean";

import type { Curve, BezierSegment } from "#types/core/curve.types";

// =========================================================================
// Test Helpers
// =========================================================================

const CELL_SIZE = 40;

/**
 * Create a simple rectangular curve (as degenerate linear beziers).
 * Rectangle from (x0, y0) to (x1, y1).
 */
function makeRectCurve(
  x0: number, y0: number, x1: number, y1: number,
  id: string = "test-curve"
): Curve {
  // Linear bezier segments: control points at 1/3 and 2/3
  function lineSeg(
    fx: number, fy: number, tx: number, ty: number
  ): BezierSegment {
    return [
      fx + (tx - fx) / 3, fy + (ty - fy) / 3,
      fx + 2 * (tx - fx) / 3, fy + 2 * (ty - fy) / 3,
      tx, ty
    ];
  }

  return {
    id,
    start: [x0, y0],
    segments: [
      lineSeg(x0, y0, x1, y0), // top edge
      lineSeg(x1, y0, x1, y1), // right edge
      lineSeg(x1, y1, x0, y1), // bottom edge
      lineSeg(x0, y1, x0, y0), // left edge (close)
    ],
    closed: true,
    color: "#ff0000",
    opacity: 1,
    strokeColor: "#000000",
    strokeWidth: 2,
  };
}

/**
 * Create a large square curve covering a grid region.
 * E.g., makeLargeCurve(0, 0, 5, 5, 40) covers cells (0,0) through (4,4).
 */
function makeLargeCurve(
  gridX0: number, gridY0: number,
  gridX1: number, gridY1: number,
  cellSize: number,
  id: string = "large-curve"
): Curve {
  return makeRectCurve(
    gridX0 * cellSize, gridY0 * cellSize,
    gridX1 * cellSize, gridY1 * cellSize,
    id
  );
}

// =========================================================================
// flattenCurve
// =========================================================================

describe("flattenCurve", () => {
  it("flattens a rectangular curve to polygon points", () => {
    const curve = makeRectCurve(0, 0, 100, 100);
    const pts = flattenCurve(curve, 4);

    // Linear beziers produce 1 point per segment (fast-path),
    // so a rectangle = start + 4 endpoints + closing = 5 points
    expect(pts.length).toBeGreaterThanOrEqual(5);

    // First point should be start
    expect(pts[0]).toEqual([0, 0]);

    // Last point should equal first (closed ring)
    const last = pts[pts.length - 1];
    expect(last[0]).toBeCloseTo(0, 5);
    expect(last[1]).toBeCloseTo(0, 5);
  });

  it("produces points within the curve bounds", () => {
    const curve = makeRectCurve(10, 20, 50, 60);
    const pts = flattenCurve(curve, 8);

    for (const [x, y] of pts) {
      expect(x).toBeGreaterThanOrEqual(9.9);
      expect(x).toBeLessThanOrEqual(50.1);
      expect(y).toBeGreaterThanOrEqual(19.9);
      expect(y).toBeLessThanOrEqual(60.1);
    }
  });
});

// =========================================================================
// pointInPolygon
// =========================================================================

describe("pointInPolygon", () => {
  const square: [number, number][] = [
    [0, 0], [100, 0], [100, 100], [0, 100]
  ];

  it("returns true for point inside", () => {
    expect(pointInPolygon(50, 50, square)).toBe(true);
  });

  it("returns false for point outside", () => {
    expect(pointInPolygon(150, 50, square)).toBe(false);
    expect(pointInPolygon(-10, 50, square)).toBe(false);
  });
});

// =========================================================================
// cellOverlapsCurve
// =========================================================================

describe("cellOverlapsCurve", () => {
  const largePoly: [number, number][] = [
    [0, 0], [200, 0], [200, 200], [0, 200]
  ];

  it("returns true for cell fully inside", () => {
    expect(cellOverlapsCurve(2, 2, CELL_SIZE, largePoly)).toBe(true);
  });

  it("returns false for cell fully outside", () => {
    expect(cellOverlapsCurve(10, 10, CELL_SIZE, largePoly)).toBe(false);
  });

  it("returns false for cell inside a hole", () => {
    const hole: [number, number][] = [
      [60, 60], [140, 60], [140, 140], [60, 140]
    ];
    // Cell (2,2) at 40px = world (80,80)-(120,120), center (100,100) is inside hole
    expect(cellOverlapsCurve(2, 2, CELL_SIZE, largePoly, [hole])).toBe(false);
  });
});

// =========================================================================
// curveToPolygon / polygonToCurve
// =========================================================================

describe("curveToPolygon", () => {
  it("produces a closed ring with correct format", () => {
    const curve = makeRectCurve(0, 0, 100, 100);
    const poly = curveToPolygon(curve);

    // Should have at least one ring (outer)
    expect(poly.length).toBeGreaterThanOrEqual(1);

    // Outer ring should be closed
    const outer = poly[0];
    expect(outer[0][0]).toBeCloseTo(outer[outer.length - 1][0], 5);
    expect(outer[0][1]).toBeCloseTo(outer[outer.length - 1][1], 5);
  });

  it("includes inner rings when present", () => {
    const curve: Curve = {
      ...makeRectCurve(0, 0, 200, 200),
      innerRings: [
        [[50, 50], [100, 50], [100, 100], [50, 100]]
      ]
    };
    const poly = curveToPolygon(curve);

    // Should have outer ring + 1 inner ring
    expect(poly.length).toBe(2);
  });
});

describe("polygonToCurve", () => {
  it("round-trips a simple polygon", () => {
    const rings: [number, number][][] = [
      [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]
    ];
    const template = makeRectCurve(0, 0, 100, 100);
    const curve = polygonToCurve(rings, template);

    expect(curve.id).toBe(template.id);
    expect(curve.start).toEqual([0, 0]);
    expect(curve.segments.length).toBe(3); // 4 points - 1 (start) = 3 segments
    expect(curve.closed).toBe(true);
    expect(curve.color).toBe(template.color);
    expect(curve.innerRings).toBeUndefined();
  });

  it("preserves inner rings", () => {
    const rings: [number, number][][] = [
      [[0, 0], [200, 0], [200, 200], [0, 200], [0, 0]],
      [[50, 50], [100, 50], [100, 100], [50, 100], [50, 50]]
    ];
    const template = makeRectCurve(0, 0, 200, 200);
    const curve = polygonToCurve(rings, template);

    expect(curve.innerRings).toBeDefined();
    expect(curve.innerRings!.length).toBe(1);
    expect(curve.innerRings![0].length).toBe(4); // closing point removed
  });
});

// =========================================================================
// subtractCellFromCurve — The core boolean subtraction
// =========================================================================

describe("subtractCellFromCurve", () => {
  it("subtracts an interior cell, creating a hole", () => {
    // 5x5 cell curve, erase cell (2,2) which is fully interior
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);

    expect(result.length).toBe(1);
    const modified = result[0];

    // The path data must have changed
    expect(modified.segments).not.toEqual(curve.segments);

    // Should have an inner ring (the hole)
    expect(modified.innerRings).toBeDefined();
    expect(modified.innerRings!.length).toBe(1);

    // Style properties preserved
    expect(modified.color).toBe(curve.color);
    expect(modified.id).toBe(curve.id);
  });

  it("subtracts a boundary cell, modifying the outer path", () => {
    // 5x5 cell curve, erase cell (0,0) on the corner
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 0, 0, CELL_SIZE);

    expect(result.length).toBe(1);
    const modified = result[0];

    // Path data changed (boundary modified)
    expect(modified.start).not.toEqual(curve.start);
  });

  it("returns empty array when entire curve is erased", () => {
    // 1x1 cell curve — erasing it should fully remove it
    const curve = makeRectCurve(0, 0, CELL_SIZE, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 0, 0, CELL_SIZE);

    expect(result.length).toBe(0);
  });

  it("returns original curve when cell doesn't overlap", () => {
    const curve = makeLargeCurve(0, 0, 3, 3, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 10, 10, CELL_SIZE);

    // polygon-clipping won't touch it, so the result should be equivalent
    expect(result.length).toBe(1);
  });

  it("removes open (non-closed) curves entirely", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    curve.closed = false;
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);

    expect(result.length).toBe(0);
  });

  it("splits a thin shape when bisected", () => {
    // Create a 1-cell-wide horizontal strip: 5 cells wide, 1 cell tall
    const curve = makeLargeCurve(0, 0, 5, 1, CELL_SIZE);
    // Erase the middle cell (2, 0) — should split into two pieces
    const result = subtractCellFromCurve(curve, 2, 0, CELL_SIZE);

    expect(result.length).toBe(2);
    // First piece keeps original id
    expect(result[0].id).toBe(curve.id);
    // Second piece gets a new id
    expect(result[1].id).not.toBe(curve.id);
    // Both should be closed
    expect(result[0].closed).toBe(true);
    expect(result[1].closed).toBe(true);
  });
});

// =========================================================================
// Sequential erasures
// =========================================================================

describe("sequential erasures", () => {
  it("can erase multiple interior cells", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);

    // Erase cell (1,1)
    const r1 = subtractCellFromCurve(curve, 1, 1, CELL_SIZE);
    expect(r1.length).toBe(1);

    // Erase cell (3,3) from the result
    const r2 = subtractCellFromCurve(r1[0], 3, 3, CELL_SIZE);
    expect(r2.length).toBe(1);

    // Should have two holes now
    expect(r2[0].innerRings).toBeDefined();
    expect(r2[0].innerRings!.length).toBe(2);
  });

  it("can erase adjacent cells to merge holes into boundary", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);

    // Erase corner cell
    const r1 = subtractCellFromCurve(curve, 0, 0, CELL_SIZE);
    expect(r1.length).toBe(1);

    // Erase adjacent cell
    const r2 = subtractCellFromCurve(r1[0], 1, 0, CELL_SIZE);
    expect(r2.length).toBe(1);
  });
});

// =========================================================================
// findCurveAtCell
// =========================================================================

describe("findCurveAtCell", () => {
  it("finds the curve containing a cell", () => {
    const curves = [makeLargeCurve(0, 0, 5, 5, CELL_SIZE)];
    const idx = findCurveAtCell(curves, 2, 2, CELL_SIZE);
    expect(idx).toBe(0);
  });

  it("returns -1 when no curve contains the cell", () => {
    const curves = [makeLargeCurve(0, 0, 3, 3, CELL_SIZE)];
    const idx = findCurveAtCell(curves, 10, 10, CELL_SIZE);
    expect(idx).toBe(-1);
  });

  it("skips open curves", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    curve.closed = false;
    const idx = findCurveAtCell([curve], 2, 2, CELL_SIZE);
    expect(idx).toBe(-1);
  });

  it("does not find cell inside a hole", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    // Create a curve with a hole at (2,2)
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);
    expect(result.length).toBe(1);

    // Cell (2,2) should not be found anymore
    const idx = findCurveAtCell(result, 2, 2, CELL_SIZE);
    expect(idx).toBe(-1);
  });
});

// =========================================================================
// eraseCellFromCurves — Integration
// =========================================================================

describe("eraseCellFromCurves", () => {
  it("returns null when no curves are affected", () => {
    const curves = [makeLargeCurve(0, 0, 3, 3, CELL_SIZE)];
    const result = eraseCellFromCurves(curves, 10, 10, CELL_SIZE);
    expect(result).toBeNull();
  });

  it("returns null for empty curves array", () => {
    expect(eraseCellFromCurves([], 0, 0, CELL_SIZE)).toBeNull();
  });

  it("modifies curves array when erasing from a curve", () => {
    const curves = [makeLargeCurve(0, 0, 5, 5, CELL_SIZE)];
    const result = eraseCellFromCurves(curves, 2, 2, CELL_SIZE);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);

    // The curve's path should differ from the original
    expect(result![0].segments).not.toEqual(curves[0].segments);
  });

  it("preserves other curves when erasing from one", () => {
    const curves = [
      makeLargeCurve(0, 0, 3, 3, CELL_SIZE, "curve-a"),
      makeLargeCurve(5, 5, 8, 8, CELL_SIZE, "curve-b"),
    ];
    const result = eraseCellFromCurves(curves, 1, 1, CELL_SIZE);

    expect(result).not.toBeNull();
    // First curve modified, second preserved
    expect(result!.length).toBe(2);
    expect(result![1].id).toBe("curve-b");
  });

  it("produces split curves when bisecting", () => {
    const curves = [makeLargeCurve(0, 0, 5, 1, CELL_SIZE)];
    const result = eraseCellFromCurves(curves, 2, 0, CELL_SIZE);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
  });

  it("removes curve entirely when fully erased", () => {
    const curves = [makeRectCurve(0, 0, CELL_SIZE, CELL_SIZE)];
    const result = eraseCellFromCurves(curves, 0, 0, CELL_SIZE);

    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });
});

// =========================================================================
// Data integrity: no 'holes' field
// =========================================================================

describe("data integrity", () => {
  it("never produces a 'holes' field on the result", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);

    for (const c of result) {
      expect((c as any).holes).toBeUndefined();
    }
  });

  it("result curves are JSON-serializable", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);

    for (const c of result) {
      const json = JSON.stringify(c);
      const parsed = JSON.parse(json);
      expect(parsed.id).toBe(c.id);
      expect(parsed.start).toEqual(c.start);
      expect(parsed.segments.length).toBe(c.segments.length);
      if (c.innerRings) {
        expect(parsed.innerRings.length).toBe(c.innerRings.length);
      }
    }
  });
});

// =========================================================================
// isLinearBezier
// =========================================================================

describe("isLinearBezier", () => {
  it("detects linear bezier with control points on line", () => {
    // Line from (0,0) to (100,0) with control points at 1/3 and 2/3
    expect(isLinearBezier(0, 0, 33.33, 0, 66.67, 0, 100, 0)).toBe(true);
  });

  it("detects exact linear bezier from polygonToCurve", () => {
    // polygonToCurve generates: cp1 = prev + (curr-prev)/3, cp2 = prev + 2*(curr-prev)/3
    const px = 10, py = 20, cx = 50, cy = 60;
    const cp1x = px + (cx - px) / 3;
    const cp1y = py + (cy - py) / 3;
    const cp2x = px + 2 * (cx - px) / 3;
    const cp2y = py + 2 * (cy - py) / 3;
    expect(isLinearBezier(px, py, cp1x, cp1y, cp2x, cp2y, cx, cy)).toBe(true);
  });

  it("rejects curved bezier", () => {
    // Control points significantly off the line
    expect(isLinearBezier(0, 0, 0, 50, 100, 50, 100, 0)).toBe(false);
  });

  it("handles degenerate zero-length segment", () => {
    expect(isLinearBezier(5, 5, 5, 5, 5, 5, 5, 5)).toBe(true);
  });
});

// =========================================================================
// simplifyRing
// =========================================================================

describe("simplifyRing", () => {
  it("removes collinear points from a rectangle", () => {
    // A rectangle with extra points on the edges
    const ring: [number, number][] = [
      [0, 0], [50, 0], [100, 0],  // top edge with midpoint
      [100, 50], [100, 100],       // right edge with midpoint
      [50, 100], [0, 100],         // bottom edge with midpoint
      [0, 50],                      // left edge with midpoint
      [0, 0]                        // closing
    ];
    const simplified = simplifyRing(ring);
    // Should keep only the 4 corners + closing = 5 points
    expect(simplified.length).toBe(5);
    expect(simplified[0]).toEqual([0, 0]);
    expect(simplified[simplified.length - 1]).toEqual([0, 0]);
  });

  it("preserves non-collinear points", () => {
    const triangle: [number, number][] = [
      [0, 0], [100, 0], [50, 100], [0, 0]
    ];
    const simplified = simplifyRing(triangle);
    expect(simplified.length).toBe(4); // 3 points + closing
  });

  it("handles ring with fewer than 4 points", () => {
    const tiny: [number, number][] = [[0, 0], [1, 1], [2, 2]];
    expect(simplifyRing(tiny)).toEqual(tiny);
  });
});

// =========================================================================
// Vertex count stability across erasures
// =========================================================================

describe("vertex count stability", () => {
  it("vertex count does not explode with repeated erasures", () => {
    const curve = makeLargeCurve(0, 0, 8, 8, CELL_SIZE);

    // Track vertex counts across 10 sequential interior erasures
    let current = curve;
    const vertexCounts: number[] = [];

    const cellsToErase = [
      [2, 2], [3, 3], [4, 4], [5, 5],
      [2, 5], [5, 2], [3, 4], [4, 3],
      [1, 1], [6, 6]
    ];

    for (const [cx, cy] of cellsToErase) {
      const result = subtractCellFromCurve(current, cx, cy, CELL_SIZE);
      if (result.length === 0) break;
      current = result[0];

      const poly = curveToPolygon(current);
      const outerVertices = poly[0].length;
      vertexCounts.push(outerVertices);
    }

    // After 10 erasures, vertex count should be bounded.
    // Each cell adds ~4-8 vertices. With simplification, should stay under ~100.
    // Without the fix, this would be 300+ after just 2 erasures.
    const maxCount = Math.max(...vertexCounts);
    expect(maxCount).toBeLessThan(200);

    // Verify the growth is roughly linear, not exponential
    if (vertexCounts.length >= 3) {
      const last = vertexCounts[vertexCounts.length - 1];
      const first = vertexCounts[0];
      // The last count should be within 10x the first (linear growth)
      expect(last).toBeLessThan(first * 10);
    }
  });

  it("flattenCurve produces minimal points for post-subtraction curves", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);
    expect(result.length).toBe(1);

    // Flatten the result — should NOT re-subdivide linear segments
    const flattened = flattenCurve(result[0]);

    // A rectangle minus one interior cell = ~12-20 vertices (not 300+)
    expect(flattened.length).toBeLessThan(50);
  });
});

// =========================================================================
// Sequential erasure round-trip correctness
// =========================================================================

describe("sequential erasure round-trip", () => {
  it("10 sequential interior erasures all produce valid output", () => {
    let curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];

    const cellsToErase = [
      [2, 2], [3, 3], [4, 4], [5, 5], [2, 5],
      [5, 2], [3, 4], [4, 3], [1, 1], [6, 6]
    ];

    for (const [cx, cy] of cellsToErase) {
      const newCurves = eraseCellFromCurves(curves, cx, cy, CELL_SIZE);
      if (newCurves === null) continue; // Cell may already be erased
      curves = newCurves;

      // At least one curve must remain
      expect(curves.length).toBeGreaterThan(0);

      // Each curve must be valid
      for (const c of curves) {
        expect(c.start).toBeDefined();
        expect(c.segments).toBeDefined();
        expect(c.closed).toBe(true);
      }
    }

    // After 10 erasures, the erased cells should not be found
    for (const [cx, cy] of cellsToErase) {
      const idx = findCurveAtCell(curves, cx, cy, CELL_SIZE);
      expect(idx).toBe(-1);
    }

    // Non-erased interior cells should still be found
    const idx = findCurveAtCell(curves, 0, 0, CELL_SIZE);
    expect(idx).not.toBe(-1);
  });

  it("boundary erasure followed by interior erasure works", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);

    // Erase boundary cell
    const r1 = subtractCellFromCurve(curve, 0, 0, CELL_SIZE);
    expect(r1.length).toBe(1);

    // Erase interior cell from modified curve
    const r2 = subtractCellFromCurve(r1[0], 2, 2, CELL_SIZE);
    expect(r2.length).toBe(1);
    expect(r2[0].innerRings).toBeDefined();
    expect(r2[0].innerRings!.length).toBeGreaterThanOrEqual(1);

    // Erase another boundary cell
    const r3 = subtractCellFromCurve(r2[0], 4, 4, CELL_SIZE);
    expect(r3.length).toBe(1);
  });

  it("curveToPolygon round-trips with innerRings", () => {
    const curve = makeLargeCurve(0, 0, 5, 5, CELL_SIZE);

    // Create curve with a hole
    const erased = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);
    expect(erased.length).toBe(1);
    const withHole = erased[0];
    expect(withHole.innerRings).toBeDefined();

    // Convert to polygon and back
    const poly = curveToPolygon(withHole);
    expect(poly.length).toBe(2); // outer + 1 hole

    const roundTripped = polygonToCurve(poly, withHole);
    expect(roundTripped.start).toBeDefined();
    expect(roundTripped.segments.length).toBeGreaterThan(0);
    expect(roundTripped.innerRings).toBeDefined();
    expect(roundTripped.innerRings!.length).toBe(1);
  });
});

// =========================================================================
// Open Curve Erasure Tests
// =========================================================================

/** Build a simple open curve (a line from (x0, y0) to (x1, y1)). */
function makeOpenCurve(x0: number, y0: number, x1: number, y1: number, id = "open-1"): Curve {
  const cpx1 = x0 + (x1 - x0) / 3;
  const cpy1 = y0 + (y1 - y0) / 3;
  const cpx2 = x0 + 2 * (x1 - x0) / 3;
  const cpy2 = y0 + 2 * (y1 - y0) / 3;
  return {
    id,
    start: [x0, y0],
    segments: [[cpx1, cpy1, cpx2, cpy2, x1, y1]],
    closed: false,
    color: "transparent",
    opacity: 1,
    strokeColor: "#ff0000",
    strokeWidth: 2,
  };
}

/** Build a simple closed square curve. */
function makeClosedSquareOpen(
  x: number, y: number, size: number, id = "closed-1"
): Curve {
  const x1 = x + size;
  const y1 = y + size;
  const pts: [number, number][] = [
    [x, y], [x1, y], [x1, y1], [x, y1], [x, y],
  ];
  const segments: BezierSegment[] = [];
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    segments.push([
      px + (cx - px) / 3, py + (cy - py) / 3,
      px + 2 * (cx - px) / 3, py + 2 * (cy - py) / 3,
      cx, cy,
    ]);
  }
  return {
    id,
    start: pts[0],
    segments,
    closed: true,
    color: "#00ff00",
    opacity: 1,
    strokeColor: "#000000",
    strokeWidth: 1,
  };
}

describe("curveBoolean — open curve erasure", () => {
  describe("openCurveOverlapsRect", () => {
    it("returns true when curve passes through the rectangle", () => {
      const curve = makeOpenCurve(10, 50, 200, 50);
      expect(openCurveOverlapsRect(curve, 80, 40, 120, 60)).toBe(true);
    });

    it("returns false when curve is entirely outside the rectangle", () => {
      const curve = makeOpenCurve(10, 50, 60, 50);
      expect(openCurveOverlapsRect(curve, 200, 200, 300, 300)).toBe(false);
    });

    it("returns true when curve starts inside the rectangle", () => {
      const curve = makeOpenCurve(100, 100, 200, 200);
      expect(openCurveOverlapsRect(curve, 90, 90, 110, 110)).toBe(true);
    });

    it("returns true when curve ends inside the rectangle", () => {
      const curve = makeOpenCurve(10, 10, 100, 100);
      expect(openCurveOverlapsRect(curve, 90, 90, 110, 110)).toBe(true);
    });
  });

  describe("openCurveOverlapsPolygon", () => {
    it("returns true when curve passes through the polygon", () => {
      const curve = makeOpenCurve(0, 50, 200, 50);
      const poly: [number, number][] = [[80, 0], [120, 0], [120, 100], [80, 100], [80, 0]];
      expect(openCurveOverlapsPolygon(curve, poly)).toBe(true);
    });

    it("returns false when curve is outside the polygon", () => {
      const curve = makeOpenCurve(0, 50, 60, 50);
      const poly: [number, number][] = [[200, 200], [300, 200], [300, 300], [200, 300], [200, 200]];
      expect(openCurveOverlapsPolygon(curve, poly)).toBe(false);
    });
  });

  describe("findCurveAtCell", () => {
    it("finds an open curve passing through the cell", () => {
      const curve = makeOpenCurve(0, 20, 200, 20);
      const idx = findCurveAtCell([curve], 2, 0, CELL_SIZE);
      expect(idx).toBe(0);
    });

    it("returns -1 for open curves not in the cell", () => {
      const curve = makeOpenCurve(0, 20, 60, 20);
      const idx = findCurveAtCell([curve], 5, 5, CELL_SIZE);
      expect(idx).toBe(-1);
    });

    it("still finds closed curves as before", () => {
      const curve = makeClosedSquareOpen(0, 0, 120);
      const idx = findCurveAtCell([curve], 1, 1, CELL_SIZE);
      expect(idx).toBe(0);
    });
  });

  describe("eraseCellFromCurves — open curves", () => {
    it("removes an open curve when erasing a cell it passes through", () => {
      const open = makeOpenCurve(0, 20, 200, 20);
      const result = eraseCellFromCurves([open], 2, 0, CELL_SIZE);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(0);
    });

    it("does not affect an open curve when erasing a distant cell", () => {
      const open = makeOpenCurve(0, 20, 60, 20);
      const result = eraseCellFromCurves([open], 10, 10, CELL_SIZE);
      expect(result).toBeNull();
    });

    it("leaves other curves untouched when removing an open curve", () => {
      const open = makeOpenCurve(0, 20, 200, 20, "open-1");
      const closed = makeClosedSquareOpen(200, 200, 120, "closed-1");
      const result = eraseCellFromCurves([open, closed], 2, 0, CELL_SIZE);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].id).toBe("closed-1");
    });
  });

  describe("eraseRectangleFromCurves — open curves", () => {
    it("removes an open curve overlapping the rectangle", () => {
      const open = makeOpenCurve(0, 20, 200, 20);
      const result = eraseRectangleFromCurves([open], 80, 0, 120, 40);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(0);
    });

    it("preserves an open curve outside the rectangle", () => {
      const open = makeOpenCurve(0, 20, 60, 20);
      const result = eraseRectangleFromCurves([open], 200, 200, 300, 300);
      expect(result).toBeNull();
    });

    it("removes only the overlapping open curve, keeps others", () => {
      const open1 = makeOpenCurve(0, 20, 200, 20, "open-1");
      const open2 = makeOpenCurve(0, 300, 200, 300, "open-2");
      const result = eraseRectangleFromCurves([open1, open2], 80, 0, 120, 40);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].id).toBe("open-2");
    });

    it("still performs boolean subtraction on closed curves", () => {
      const closed = makeClosedSquareOpen(0, 0, 120);
      const result = eraseRectangleFromCurves([closed], 40, 40, 80, 80);
      expect(result).not.toBeNull();
      expect(result!.length).toBeGreaterThan(0);
    });
  });

  describe("eraseWorldPolygonFromCurves — open curves", () => {
    it("removes an open curve overlapping the polygon", () => {
      const open = makeOpenCurve(0, 50, 200, 50);
      const poly: [number, number][] = [[80, 0], [120, 0], [120, 100], [80, 100]];
      const result = eraseWorldPolygonFromCurves([open], poly);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(0);
    });

    it("preserves an open curve outside the polygon", () => {
      const open = makeOpenCurve(0, 50, 60, 50);
      const poly: [number, number][] = [[200, 200], [300, 200], [300, 300], [200, 300]];
      const result = eraseWorldPolygonFromCurves([open], poly);
      expect(result).toBeNull();
    });

    it("removes only the overlapping open curve, keeps others", () => {
      const open1 = makeOpenCurve(0, 50, 200, 50, "open-1");
      const open2 = makeOpenCurve(0, 400, 200, 400, "open-2");
      const poly: [number, number][] = [[80, 0], [120, 0], [120, 100], [80, 100]];
      const result = eraseWorldPolygonFromCurves([open1, open2], poly);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].id).toBe("open-2");
    });
  });
});
