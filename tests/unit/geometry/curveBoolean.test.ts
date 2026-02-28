/**
 * curveBoolean Unit Tests — Open curve erasure
 *
 * Tests that unclosed freehand curves can be erased (entirely removed)
 * by the cell eraser, rectangle eraser, and polygon eraser tools.
 */

import { describe, it, expect, vi } from "vitest";

// Mock polygonClipping.ts to use the npm package directly
vi.mock("../../../src/geometry/polygonClipping.ts", () => {
  const pc = require("polygon-clipping");
  return { difference: pc.default?.difference ?? pc.difference };
});

import {
  eraseCellFromCurves,
  eraseRectangleFromCurves,
  eraseWorldPolygonFromCurves,
  openCurveOverlapsRect,
  openCurveOverlapsPolygon,
  findCurveAtCell,
} from "../../../src/geometry/curveBoolean.ts";

import type { Curve } from "#types/core/curve.types";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const CELL = 40;

/** Build a simple open curve (a horizontal line from (x0,y) to (x1,y)). */
function makeOpenCurve(x0: number, y0: number, x1: number, y1: number, id = "open-1"): Curve {
  // Single linear bezier segment
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

/** Build a multi-segment open curve through several points. */
function makeOpenCurveThrough(points: [number, number][], id = "open-multi"): Curve {
  const segments: [number, number, number, number, number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const [px, py] = points[i - 1];
    const [cx, cy] = points[i];
    segments.push([
      px + (cx - px) / 3, py + (cy - py) / 3,
      px + 2 * (cx - px) / 3, py + 2 * (cy - py) / 3,
      cx, cy,
    ]);
  }
  return {
    id,
    start: points[0],
    segments,
    closed: false,
    color: "transparent",
    opacity: 1,
    strokeColor: "#ff0000",
    strokeWidth: 2,
  };
}

/** Build a simple closed square curve. */
function makeClosedSquare(
  x: number, y: number, size: number, id = "closed-1"
): Curve {
  const x1 = x + size;
  const y1 = y + size;
  const pts: [number, number][] = [
    [x, y], [x1, y], [x1, y1], [x, y1], [x, y],
  ];
  const segments: [number, number, number, number, number, number][] = [];
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("curveBoolean — open curve erasure", () => {
  describe("openCurveOverlapsRect", () => {
    it("returns true when curve passes through the rectangle", () => {
      // Horizontal line from (10, 50) to (200, 50)
      const curve = makeOpenCurve(10, 50, 200, 50);
      // Rectangle covering x=[80,120], y=[40,60]
      expect(openCurveOverlapsRect(curve, 80, 40, 120, 60)).toBe(true);
    });

    it("returns false when curve is entirely outside the rectangle", () => {
      const curve = makeOpenCurve(10, 50, 60, 50);
      // Rectangle far away
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
      // Triangle polygon enclosing y=50 around x=100
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
      // Line from (0, 20) to (200, 20) — passes through cell (2, 0) which is x=[80,120], y=[0,40]
      const curve = makeOpenCurve(0, 20, 200, 20);
      const idx = findCurveAtCell([curve], 2, 0, CELL);
      expect(idx).toBe(0);
    });

    it("returns -1 for open curves not in the cell", () => {
      const curve = makeOpenCurve(0, 20, 60, 20);
      // Cell (5, 5) is far away at x=[200,240], y=[200,240]
      const idx = findCurveAtCell([curve], 5, 5, CELL);
      expect(idx).toBe(-1);
    });

    it("still finds closed curves as before", () => {
      // Closed square covering (0,0)-(120,120)
      const curve = makeClosedSquare(0, 0, 120);
      const idx = findCurveAtCell([curve], 1, 1, CELL);
      expect(idx).toBe(0);
    });
  });

  describe("eraseCellFromCurves — open curves", () => {
    it("removes an open curve when erasing a cell it passes through", () => {
      const open = makeOpenCurve(0, 20, 200, 20);
      const result = eraseCellFromCurves([open], 2, 0, CELL);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(0);
    });

    it("does not affect an open curve when erasing a distant cell", () => {
      const open = makeOpenCurve(0, 20, 60, 20);
      const result = eraseCellFromCurves([open], 10, 10, CELL);
      expect(result).toBeNull();
    });

    it("leaves other curves untouched when removing an open curve", () => {
      const open = makeOpenCurve(0, 20, 200, 20, "open-1");
      const closed = makeClosedSquare(200, 200, 120, "closed-1");
      const result = eraseCellFromCurves([open, closed], 2, 0, CELL);
      expect(result).not.toBeNull();
      expect(result!.length).toBe(1);
      expect(result![0].id).toBe("closed-1");
    });
  });

  describe("eraseRectangleFromCurves — open curves", () => {
    it("removes an open curve overlapping the rectangle", () => {
      const open = makeOpenCurve(0, 20, 200, 20);
      // Rectangle from (80, 0) to (120, 40)
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
      const closed = makeClosedSquare(0, 0, 120);
      // Erase a rectangle that partially overlaps
      const result = eraseRectangleFromCurves([closed], 40, 40, 80, 80);
      expect(result).not.toBeNull();
      // Should have remaining curve (not fully erased)
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
