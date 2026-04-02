/**
 * curveCellOverlap Unit Tests
 *
 * Tests the spatial merge index that identifies where same-color
 * freehand curves and painted grid cells overlap, enabling border
 * suppression at render time.
 */

import { describe, it, expect, vi } from "vitest";
import polygonClipping from "polygon-clipping";

// Mock the Datacore polygonClipping wrapper to use the npm package
vi.mock("../../../../src/geometry/curves/polygonClipping.ts", () => ({
  difference: polygonClipping.difference
}));

import { buildMergeIndex } from "../../../../src/geometry/curves/curveCellOverlap.ts";

import type { Curve, BezierSegment } from "#types/core/curve.types";

// =========================================================================
// Test Helpers
// =========================================================================

const CELL_SIZE = 40;

/**
 * Create a simple rectangular curve (as degenerate linear beziers).
 * Rectangle from (x0, y0) to (x1, y1) in world coordinates.
 */
function makeRectCurve(
  x0: number, y0: number, x1: number, y1: number,
  id: string = "test-curve",
  color: string = "#ff0000"
): Curve {
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
      lineSeg(x0, y0, x1, y0),
      lineSeg(x1, y0, x1, y1),
      lineSeg(x1, y1, x0, y1),
      lineSeg(x0, y1, x0, y0),
    ],
    closed: true,
    color,
    opacity: 1,
    strokeColor: "#000000",
    strokeWidth: 2,
  };
}

/**
 * Create a rectangular curve spanning grid coordinates.
 * E.g., makeGridCurve(0, 0, 3, 3) covers cells (0,0) through (2,2).
 */
function makeGridCurve(
  gridX0: number, gridY0: number,
  gridX1: number, gridY1: number,
  id: string = "test-curve",
  color: string = "#ff0000"
): Curve {
  return makeRectCurve(
    gridX0 * CELL_SIZE, gridY0 * CELL_SIZE,
    gridX1 * CELL_SIZE, gridY1 * CELL_SIZE,
    id,
    color
  );
}

/** Helper to make a cell object */
function makeCell(x: number, y: number, color: string = "#ff0000") {
  return { x, y, color };
}

// =========================================================================
// buildMergeIndex - empty inputs
// =========================================================================

describe("buildMergeIndex", () => {
  describe("empty inputs", () => {
    it("returns empty index for no cells", () => {
      const curve = makeGridCurve(0, 0, 3, 3);
      const result = buildMergeIndex([], [curve], CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });

    it("returns empty index for no curves", () => {
      const cells = [makeCell(1, 1)];
      const result = buildMergeIndex(cells, [], CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });

    it("returns empty index for null-ish inputs", () => {
      const result = buildMergeIndex(null as any, null as any, CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });
  });

  // =========================================================================
  // Same-color cell fully inside curve
  // =========================================================================

  describe("same-color cell fully inside curve", () => {
    it("suppresses all 4 borders for a cell fully inside a curve", () => {
      // Curve covers cells (0,0) through (4,4)
      const curve = makeGridCurve(0, 0, 5, 5, "big-curve", "#ff0000");
      // Cell at (2,2) is well inside the curve
      const cells = [makeCell(2, 2, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      const suppressed = result.cellBordersToSuppress.get("2,2");
      expect(suppressed).toBeDefined();
      expect(suppressed!.size).toBe(4);
      expect(suppressed!.has("top")).toBe(true);
      expect(suppressed!.has("right")).toBe(true);
      expect(suppressed!.has("bottom")).toBe(true);
      expect(suppressed!.has("left")).toBe(true);
    });

    it("records cell rect in curveCellRects", () => {
      const curve = makeGridCurve(0, 0, 5, 5, "big-curve", "#ff0000");
      const cells = [makeCell(2, 2, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      const rects = result.curveCellRects.get(0);
      expect(rects).toBeDefined();
      expect(rects!.length).toBe(1);
      expect(rects![0]).toEqual({
        x: 2 * CELL_SIZE,
        y: 2 * CELL_SIZE,
        w: CELL_SIZE,
        h: CELL_SIZE
      });
    });
  });

  // =========================================================================
  // Different-color cell
  // =========================================================================

  describe("different-color cell", () => {
    it("does not suppress any borders for different-color cell", () => {
      const curve = makeGridCurve(0, 0, 5, 5, "curve", "#ff0000");
      const cells = [makeCell(2, 2, "#0000ff")]; // blue cell, red curve

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });
  });

  // =========================================================================
  // Cell at curve boundary (partial overlap)
  // =========================================================================

  describe("cell at curve boundary", () => {
    it("suppresses only interior-facing borders for edge cell", () => {
      // Curve covers (1,1) through (4,4) in grid coords
      const curve = makeGridCurve(1, 1, 4, 4, "curve", "#ff0000");
      // Cell at (1,1) is at the top-left corner of the curve
      // Its right and bottom edges face into the curve's interior
      const cells = [makeCell(1, 1, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      const suppressed = result.cellBordersToSuppress.get("1,1");
      expect(suppressed).toBeDefined();
      // The curve rect starts exactly at the cell, so the outward test
      // for top and left will be OUTSIDE the curve
      expect(suppressed!.has("top")).toBe(false);
      expect(suppressed!.has("left")).toBe(false);
      // Right and bottom face into the curve interior
      expect(suppressed!.has("right")).toBe(true);
      expect(suppressed!.has("bottom")).toBe(true);
    });

    it("suppresses correct borders for right-edge cell", () => {
      // Curve covers (0,0) through (3,3) in grid coords
      const curve = makeGridCurve(0, 0, 3, 3, "curve", "#ff0000");
      // Cell at (2,1) — right edge of curve
      const cells = [makeCell(2, 1, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      const suppressed = result.cellBordersToSuppress.get("2,1");
      expect(suppressed).toBeDefined();
      // Right edge is at the curve boundary — outward test goes outside
      expect(suppressed!.has("right")).toBe(false);
      // Left, top, bottom face into curve interior
      expect(suppressed!.has("left")).toBe(true);
      expect(suppressed!.has("top")).toBe(true);
      expect(suppressed!.has("bottom")).toBe(true);
    });
  });

  // =========================================================================
  // Open curves
  // =========================================================================

  describe("open curves", () => {
    it("does not merge with open curves", () => {
      const curve: Curve = {
        id: "open",
        start: [0, 0],
        segments: [[10, 0, 20, 0, 40, 0], [50, 10, 60, 20, 80, 40]],
        closed: false,
        color: "#ff0000",
        opacity: 1,
        strokeColor: "#000000",
        strokeWidth: 2,
      };
      const cells = [makeCell(0, 0, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });
  });

  // =========================================================================
  // Curves with transparent or missing color
  // =========================================================================

  describe("transparent/missing color curves", () => {
    it("does not merge with transparent curve", () => {
      const curve = makeGridCurve(0, 0, 3, 3, "t-curve", "transparent");
      const cells = [makeCell(1, 1, "transparent")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
    });
  });

  // =========================================================================
  // Multiple curves with different colors
  // =========================================================================

  describe("multiple curves", () => {
    it("merges independently per curve color", () => {
      const redCurve = makeGridCurve(0, 0, 5, 5, "red-curve", "#ff0000");
      const blueCurve = makeGridCurve(3, 3, 8, 8, "blue-curve", "#0000ff");

      const cells = [
        makeCell(2, 2, "#ff0000"), // inside red curve only
        makeCell(4, 4, "#0000ff"), // inside blue curve only
        makeCell(3, 3, "#ff0000"), // inside both curves, matches red only
      ];

      const result = buildMergeIndex(cells, [redCurve, blueCurve], CELL_SIZE);

      // Cell (2,2) should merge with red curve (index 0)
      expect(result.cellBordersToSuppress.has("2,2")).toBe(true);
      const redRects = result.curveCellRects.get(0);
      expect(redRects).toBeDefined();
      expect(redRects!.some(r => r.x === 2 * CELL_SIZE && r.y === 2 * CELL_SIZE)).toBe(true);

      // Cell (4,4) should merge with blue curve (index 1)
      expect(result.cellBordersToSuppress.has("4,4")).toBe(true);
      const blueRects = result.curveCellRects.get(1);
      expect(blueRects).toBeDefined();
      expect(blueRects!.some(r => r.x === 4 * CELL_SIZE && r.y === 4 * CELL_SIZE)).toBe(true);

      // Cell (3,3) is red and inside red curve — should merge with red
      expect(result.cellBordersToSuppress.has("3,3")).toBe(true);
      expect(redRects!.some(r => r.x === 3 * CELL_SIZE && r.y === 3 * CELL_SIZE)).toBe(true);
    });
  });

  // =========================================================================
  // Cell outside curve (no overlap)
  // =========================================================================

  describe("cell outside curve", () => {
    it("does not suppress borders for non-overlapping cell", () => {
      const curve = makeGridCurve(0, 0, 3, 3, "curve", "#ff0000");
      // Cell at (10, 10) is far outside the curve
      const cells = [makeCell(10, 10, "#ff0000")];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);
      expect(result.cellBordersToSuppress.size).toBe(0);
      expect(result.curveCellRects.size).toBe(0);
    });
  });

  // =========================================================================
  // Multiple cells inside one curve
  // =========================================================================

  describe("multiple cells inside one curve", () => {
    it("suppresses borders for all overlapping same-color cells", () => {
      const curve = makeGridCurve(0, 0, 5, 5, "curve", "#ff0000");
      const cells = [
        makeCell(1, 1, "#ff0000"),
        makeCell(2, 2, "#ff0000"),
        makeCell(3, 3, "#ff0000"),
      ];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      expect(result.cellBordersToSuppress.has("1,1")).toBe(true);
      expect(result.cellBordersToSuppress.has("2,2")).toBe(true);
      expect(result.cellBordersToSuppress.has("3,3")).toBe(true);

      const rects = result.curveCellRects.get(0);
      expect(rects).toBeDefined();
      expect(rects!.length).toBe(3);
    });
  });

  // =========================================================================
  // Curve with inner ring (hole)
  // =========================================================================

  describe("curve with inner ring", () => {
    it("does not merge cells inside a hole", () => {
      // Large curve covering (0,0) through (7,7)
      const curve = makeGridCurve(0, 0, 8, 8, "holed-curve", "#ff0000");
      // Add a hole covering (3,3) through (5,5)
      const holeX0 = 3 * CELL_SIZE, holeY0 = 3 * CELL_SIZE;
      const holeX1 = 5 * CELL_SIZE, holeY1 = 5 * CELL_SIZE;
      curve.innerRings = [
        [[holeX0, holeY0], [holeX1, holeY0], [holeX1, holeY1], [holeX0, holeY1]]
      ];
      // Invalidate cached flat poly
      delete (curve as any)._flatPoly;

      const cells = [
        makeCell(4, 4, "#ff0000"), // inside the hole — should NOT merge
        makeCell(1, 1, "#ff0000"), // outside the hole — should merge
      ];

      const result = buildMergeIndex(cells, [curve], CELL_SIZE);

      // Cell (1,1) should be merged
      expect(result.cellBordersToSuppress.has("1,1")).toBe(true);

      // Cell (4,4) should NOT be merged (inside hole)
      expect(result.cellBordersToSuppress.has("4,4")).toBe(false);
    });
  });
});
