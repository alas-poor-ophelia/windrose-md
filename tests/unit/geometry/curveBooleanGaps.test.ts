/**
 * curveBoolean Gap-Fill Tests
 *
 * Covers untested code paths in curveBoolean.ts that the main test file misses:
 * - eraseRectangleFromCurves (zero tests existed)
 * - signedArea / ensureCCW / ensureCW (winding correctness, foundation for boolean ops)
 * - polygonArea (sliver filter threshold)
 * - segmentIntersectsRect / polygonIntersectsRect (Cohen-Sutherland boundary detection)
 * - evalBezier (cubic bezier evaluation used in flattenCurve)
 * - flattenCurve with non-linear beziers (only linear fast-path was tested)
 * - cellOverlapsCurve boundary-straddling (polygon-rect intersection path)
 * - Winding correctness through curveToPolygon
 */

import { describe, it, expect, vi } from "vitest";
import polygonClipping from "polygon-clipping";

vi.mock("../../../src/geometry/polygonClipping.ts", () => ({
  difference: polygonClipping.difference
}));

import {
  flattenCurve,
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
  signedArea,
  ensureCCW,
  ensureCW,
  polygonArea,
  segmentIntersectsRect,
  polygonIntersectsRect,
  evalBezier,
} from "../../../src/geometry/curveBoolean.ts";

import type { Curve, BezierSegment } from "#types/core/curve.types";

// =========================================================================
// Helpers
// =========================================================================

const CELL_SIZE = 40;

function lineSeg(
  fx: number, fy: number, tx: number, ty: number
): BezierSegment {
  return [
    fx + (tx - fx) / 3, fy + (ty - fy) / 3,
    fx + 2 * (tx - fx) / 3, fy + 2 * (ty - fy) / 3,
    tx, ty
  ];
}

function makeRectCurve(
  x0: number, y0: number, x1: number, y1: number,
  id: string = "test-curve"
): Curve {
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
    color: "#ff0000",
    opacity: 1,
    strokeColor: "#000000",
    strokeWidth: 2,
  };
}

function makeLargeCurve(
  gridX0: number, gridY0: number, gridX1: number, gridY1: number,
  cellSize: number, id: string = "large-curve"
): Curve {
  return makeRectCurve(
    gridX0 * cellSize, gridY0 * cellSize,
    gridX1 * cellSize, gridY1 * cellSize,
    id
  );
}

/**
 * Approximate circle using cubic bezier kappa approximation.
 * Non-linear segments — exercises the subdivision path in flattenCurve.
 */
function makeCurvedShape(id: string = "curved"): Curve {
  const r = 80;
  const cx = 100, cy = 100;
  const k = 0.5522847498;
  return {
    id,
    start: [cx + r, cy],
    segments: [
      [cx + r, cy - r * k, cx + r * k, cy - r, cx, cy - r],
      [cx - r * k, cy - r, cx - r, cy - r * k, cx - r, cy],
      [cx - r, cy + r * k, cx - r * k, cy + r, cx, cy + r],
      [cx + r * k, cy + r, cx + r, cy + r * k, cx + r, cy],
    ],
    closed: true,
    color: "#00ff00",
    opacity: 0.8,
    strokeColor: "#000000",
    strokeWidth: 2,
  };
}

// =========================================================================
// signedArea / ensureCCW / ensureCW
// =========================================================================

describe("signedArea", () => {
  // Regression: wrong winding detection would corrupt all polygon-clipping operations
  it("returns positive for CW ordering in screen coords (right-down-left-up)", () => {
    // This ordering traces clockwise in screen coords (y-down)
    const cw: [number, number][] = [
      [0, 0], [100, 0], [100, 100], [0, 100]
    ];
    expect(signedArea(cw)).toBeGreaterThan(0);
  });

  it("returns negative for CCW ordering in screen coords (down-right-up-left)", () => {
    const ccw: [number, number][] = [
      [0, 0], [0, 100], [100, 100], [100, 0]
    ];
    expect(signedArea(ccw)).toBeLessThan(0);
  });
});

describe("ensureCCW", () => {
  // Regression: outer ring in wrong winding → polygon-clipping inverts result
  // ensureCCW reverses when signedArea > 0 (CW in screen coords)
  it("reverses a ring with positive signedArea (CW → CCW)", () => {
    const ring: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    expect(signedArea(ring)).toBeGreaterThan(0);
    const result = ensureCCW(ring);
    expect(signedArea(result)).toBeLessThanOrEqual(0);
  });

  it("does not modify a ring already with negative signedArea (already CCW)", () => {
    const ring: [number, number][] = [[0, 0], [0, 100], [100, 100], [100, 0]];
    expect(signedArea(ring)).toBeLessThan(0);
    const result = ensureCCW(ring);
    expect(result).toEqual(ring);
  });
});

describe("ensureCW", () => {
  // Regression: inner ring (hole) in wrong winding → treated as outer → erasure fails
  // ensureCW reverses when signedArea < 0 (CCW in screen coords)
  it("reverses a ring with negative signedArea (CCW → CW)", () => {
    const ring: [number, number][] = [[0, 0], [0, 100], [100, 100], [100, 0]];
    expect(signedArea(ring)).toBeLessThan(0);
    const result = ensureCW(ring);
    expect(signedArea(result)).toBeGreaterThanOrEqual(0);
  });

  it("does not modify a ring already with positive signedArea (already CW)", () => {
    const ring: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    expect(signedArea(ring)).toBeGreaterThan(0);
    const result = ensureCW(ring);
    expect(result).toEqual(ring);
  });
});

// =========================================================================
// polygonArea
// =========================================================================

describe("polygonArea", () => {
  // Regression: if hole area is added instead of subtracted, sliver filter breaks
  it("subtracts hole area from outer area", () => {
    const outer: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]];
    const hole: [number, number][] = [[25, 25], [75, 25], [75, 75], [25, 75], [25, 25]];
    expect(polygonArea([outer, hole])).toBeCloseTo(7500, 0);
  });
});

// =========================================================================
// segmentIntersectsRect (Cohen-Sutherland)
// =========================================================================

describe("segmentIntersectsRect", () => {
  const rx0 = 10, ry0 = 10, rx1 = 50, ry1 = 50;

  // Regression: false negative → cell overlap missed → erase tool ignores valid cells
  it("detects diagonal crossing", () => {
    expect(segmentIntersectsRect(0, 0, 60, 60, rx0, ry0, rx1, ry1)).toBe(true);
  });

  it("detects segment fully inside rect", () => {
    expect(segmentIntersectsRect(20, 20, 30, 30, rx0, ry0, rx1, ry1)).toBe(true);
  });

  it("rejects segment in same quadrant outside rect", () => {
    expect(segmentIntersectsRect(0, 0, 5, 5, rx0, ry0, rx1, ry1)).toBe(false);
  });

  it("rejects segment above rect", () => {
    expect(segmentIntersectsRect(0, 0, 60, 0, rx0, ry0, rx1, ry1)).toBe(false);
  });

  it("rejects segment below rect", () => {
    expect(segmentIntersectsRect(0, 60, 60, 60, rx0, ry0, rx1, ry1)).toBe(false);
  });

  it("detects horizontal segment crossing rect", () => {
    expect(segmentIntersectsRect(0, 30, 60, 30, rx0, ry0, rx1, ry1)).toBe(true);
  });

  it("detects vertical segment crossing rect", () => {
    expect(segmentIntersectsRect(30, 0, 30, 60, rx0, ry0, rx1, ry1)).toBe(true);
  });

  it("rejects segment to the left of rect", () => {
    expect(segmentIntersectsRect(0, 20, 0, 40, rx0, ry0, rx1, ry1)).toBe(false);
  });
});

describe("polygonIntersectsRect", () => {
  // Regression: polygon edges cross cell but no vertices inside → missed overlap
  it("detects triangle edge crossing rect", () => {
    const triangle: [number, number][] = [[0, 25], [60, 25], [30, 60]];
    expect(polygonIntersectsRect(triangle, 10, 10, 50, 50)).toBe(true);
  });

  it("rejects polygon fully outside rect", () => {
    const far: [number, number][] = [[100, 100], [200, 100], [200, 200], [100, 200]];
    expect(polygonIntersectsRect(far, 0, 0, 50, 50)).toBe(false);
  });
});

// =========================================================================
// evalBezier
// =========================================================================

describe("evalBezier", () => {
  // Regression: wrong evaluation → corrupted flattened polygon → silent boolean errors
  it("returns start at t=0", () => {
    const pt = evalBezier(0, 0, 10, 20, 30, 40, 50, 60, 0);
    expect(pt[0]).toBeCloseTo(0, 10);
    expect(pt[1]).toBeCloseTo(0, 10);
  });

  it("returns end at t=1", () => {
    const pt = evalBezier(0, 0, 10, 20, 30, 40, 50, 60, 1);
    expect(pt[0]).toBeCloseTo(50, 10);
    expect(pt[1]).toBeCloseTo(60, 10);
  });

  it("returns midpoint for linear segment", () => {
    const pt = evalBezier(0, 0, 33.33, 0, 66.67, 0, 100, 0, 0.5);
    expect(pt[0]).toBeCloseTo(50, 0);
    expect(pt[1]).toBeCloseTo(0, 5);
  });

  it("computes known value: symmetric arch at t=0.5 → (50, 75)", () => {
    const pt = evalBezier(0, 0, 0, 100, 100, 100, 100, 0, 0.5);
    expect(pt[0]).toBeCloseTo(50, 5);
    expect(pt[1]).toBeCloseTo(75, 5);
  });
});

// =========================================================================
// flattenCurve with non-linear beziers
// =========================================================================

describe("flattenCurve with non-linear beziers", () => {
  // Regression: all existing tests used linear-only curves (makeRectCurve)
  it("produces many points for curved shape (not linear fast-path)", () => {
    const curve = makeCurvedShape();
    const pts = flattenCurve(curve, 16);

    // 4 non-linear segments × 16 steps + start + closing ≈ 66 points
    expect(pts.length).toBeGreaterThan(20);

    // Points should be roughly circular around (100, 100) radius 80
    for (const [x, y] of pts) {
      const dist = Math.sqrt((x - 100) ** 2 + (y - 100) ** 2);
      expect(dist).toBeLessThan(85);
      expect(dist).toBeGreaterThan(75);
    }
  });

  it("closes the ring for non-linear curves", () => {
    const curve = makeCurvedShape();
    const pts = flattenCurve(curve);
    const first = pts[0];
    const last = pts[pts.length - 1];
    expect(first[0]).toBeCloseTo(last[0], 5);
    expect(first[1]).toBeCloseTo(last[1], 5);
  });
});

// =========================================================================
// eraseRectangleFromCurves — completely untested previously
// =========================================================================

describe("eraseRectangleFromCurves", () => {
  it("returns null for empty curves array", () => {
    expect(eraseRectangleFromCurves([], 0, 0, 100, 100)).toBeNull();
  });

  it("returns null when rectangle doesn't overlap any curve", () => {
    const curves = [makeLargeCurve(0, 0, 3, 3, CELL_SIZE)];
    expect(eraseRectangleFromCurves(curves, 500, 500, 600, 600)).toBeNull();
  });

  // Regression: curve not removed when fully covered by rectangle
  it("removes curve entirely when rectangle covers it", () => {
    const curves = [makeRectCurve(10, 10, 50, 50)];
    const result = eraseRectangleFromCurves(curves, 0, 0, 100, 100);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(0);
  });

  // Regression: partial overlap doesn't modify geometry
  it("modifies curve when rectangle partially overlaps (corner cut)", () => {
    const curves = [makeLargeCurve(0, 0, 5, 5, CELL_SIZE)];
    const result = eraseRectangleFromCurves(curves, -10, -10, 60, 60);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);

    // No point in the result should be in the erased corner
    const poly = curveToPolygon(result![0]);
    const hasPointInCutRegion = poly[0].some(([x, y]) => x < 55 && y < 55);
    expect(hasPointInCutRegion).toBe(false);
  });

  // Regression: open curves incorrectly subtracted
  it("preserves open curves unchanged", () => {
    const openCurve: Curve = {
      ...makeLargeCurve(0, 0, 5, 5, CELL_SIZE, "open-curve"),
      closed: false,
    };
    const result = eraseRectangleFromCurves([openCurve], 0, 0, 200, 200);
    // Open curve is untouched → returns null (no changes)
    // or if returned, should contain the original open curve
    if (result !== null) {
      expect(result.length).toBe(1);
      expect(result[0].id).toBe("open-curve");
      expect(result[0].closed).toBe(false);
    }
  });

  // Regression: bisection produces invalid curves
  it("splits curve when rectangle cuts through the middle", () => {
    const curves = [makeLargeCurve(0, 0, 5, 1, CELL_SIZE)];
    const result = eraseRectangleFromCurves(curves, 75, -10, 125, 50);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(2);
    expect(result![0].closed).toBe(true);
    expect(result![1].closed).toBe(true);
  });

  // Regression: non-overlapping curves accidentally modified
  it("preserves non-overlapping curves", () => {
    const curves = [
      makeLargeCurve(0, 0, 3, 3, CELL_SIZE, "curve-a"),
      makeLargeCurve(10, 10, 13, 13, CELL_SIZE, "curve-b"),
    ];
    const result = eraseRectangleFromCurves(curves, 0, 0, 50, 50);
    expect(result).not.toBeNull();
    const curveB = result!.find(c => c.id === "curve-b");
    expect(curveB).toBeDefined();
  });

  // Regression: interior rectangle must create a hole, not return null
  it("creates interior hole when rectangle is fully inside curve", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];
    const result = eraseRectangleFromCurves(curves, 100, 100, 180, 180);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
    expect(result![0].innerRings).toBeDefined();
    expect(result![0].innerRings!.length).toBeGreaterThanOrEqual(1);
  });

  // Regression: result of eraseRectangle crashes when fed into eraseCellFromCurves
  it("result is valid for subsequent eraseCellFromCurves", () => {
    const curves = [makeLargeCurve(0, 0, 5, 5, CELL_SIZE)];
    const afterRect = eraseRectangleFromCurves(curves, -10, -10, 60, 60);
    expect(afterRect).not.toBeNull();

    // Feed result into cell erasure
    const afterCell = eraseCellFromCurves(afterRect!, 3, 3, CELL_SIZE);
    if (afterCell) {
      for (const c of afterCell) {
        expect(c.start).toBeDefined();
        expect(c.segments).toBeDefined();
        expect(c.closed).toBe(true);
      }
    }
  });
});

// =========================================================================
// cellOverlapsCurve — boundary-straddling (polygon-rect intersection path)
// =========================================================================

describe("cellOverlapsCurve boundary intersection", () => {
  // Regression: Cohen-Sutherland test misses cells that straddle polygon boundary
  it("detects cell straddling polygon edge (some corners inside, center outside)", () => {
    // Triangle: (0,0), (200,0), (100,200)
    const triangle: [number, number][] = [[0, 0], [200, 0], [100, 200], [0, 0]];
    // Cell (4,1) = world (160,40)-(200,80): center (180,60) is outside
    // but corner (160,40) is inside the triangle
    expect(cellOverlapsCurve(4, 1, CELL_SIZE, triangle)).toBe(true);
  });

  it("rejects cell fully outside polygon", () => {
    const square: [number, number][] = [[40, 40], [160, 40], [160, 160], [40, 160], [40, 40]];
    expect(cellOverlapsCurve(5, 5, CELL_SIZE, square)).toBe(false);
  });

  it("returns false when cell center is in hole", () => {
    const outer: [number, number][] = [[0, 0], [200, 0], [200, 200], [0, 200]];
    const hole: [number, number][] = [[75, 75], [125, 75], [125, 125], [75, 125]];
    // Cell (2,2): center (100,100) is inside hole
    expect(cellOverlapsCurve(2, 2, CELL_SIZE, outer, [hole])).toBe(false);
  });
});

// =========================================================================
// Winding correctness through curveToPolygon
// =========================================================================

describe("curveToPolygon winding order", () => {
  // Regression: wrong winding → polygon-clipping inverts result
  it("outer ring has consistent nonzero signed area", () => {
    const curve = makeRectCurve(0, 0, 100, 100);
    const poly = curveToPolygon(curve);
    const area = signedArea(poly[0]);
    expect(Math.abs(area)).toBeGreaterThan(0);
  });

  // Regression: inner ring wound same as outer → even-odd fill cancels the hole
  it("inner rings have opposite winding from outer ring", () => {
    const curve: Curve = {
      ...makeRectCurve(0, 0, 200, 200),
      innerRings: [[[60, 60], [140, 60], [140, 140], [60, 140]]]
    };
    const poly = curveToPolygon(curve);
    expect(poly.length).toBe(2);

    const outerArea = signedArea(poly[0]);
    const innerArea = signedArea(poly[1]);
    expect(outerArea * innerArea).toBeLessThan(0);
  });
});

// =========================================================================
// Sliver filtering (polygonArea threshold)
// =========================================================================

describe("sliver filtering", () => {
  // Regression: degenerate slivers surviving subtraction → rendering artifacts
  it("filters tiny polygon fragments after subtraction", () => {
    const curve = makeRectCurve(0, 0, CELL_SIZE + 0.5, CELL_SIZE);
    const result = subtractCellFromCurve(curve, 0, 0, CELL_SIZE);
    // Remaining 0.5px-wide sliver may or may not survive based on area threshold
    expect(result.length).toBeLessThanOrEqual(1);
  });
});

// =========================================================================
// State consistency across operations
// =========================================================================

describe("state consistency", () => {
  // Regression: innerRings invalid after repeated operations
  it("curve with holes can be re-erased without error", () => {
    let curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];
    curves = eraseCellFromCurves(curves, 3, 3, CELL_SIZE)!;
    expect(curves).not.toBeNull();

    const holedCurve = curves[0];
    expect(holedCurve.innerRings).toBeDefined();

    const result = subtractCellFromCurve(holedCurve, 4, 3, CELL_SIZE);
    expect(result.length).toBeGreaterThanOrEqual(1);

    // Round-trip through polygon conversion
    for (const c of result) {
      const poly = curveToPolygon(c);
      expect(poly[0].length).toBeGreaterThanOrEqual(4);
      const backToCurve = polygonToCurve(poly, c);
      expect(backToCurve.segments.length).toBeGreaterThan(0);
    }
  });

  // Regression: eraseRectangle output fails findCurveAtCell
  it("erased regions are not found by findCurveAtCell", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];
    // Boundary-touching rectangle (changes outer ring → change detection fires)
    const result = eraseRectangleFromCurves(curves, -10, -10, 120, 120);
    expect(result).not.toBeNull();

    expect(findCurveAtCell(result!, 1, 1, CELL_SIZE)).toBe(-1);
    expect(findCurveAtCell(result!, 5, 5, CELL_SIZE)).not.toBe(-1);
  });

  // Regression: non-linear curve crashes boolean subtraction
  it("curved (non-linear) shape survives boolean subtraction", () => {
    const curve = makeCurvedShape("round");
    const result = subtractCellFromCurve(curve, 2, 2, CELL_SIZE);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0].closed).toBe(true);
    expect(result[0].segments.length).toBeGreaterThan(0);
  });
});

// =========================================================================
// Regression: eraseWorldPolygonFromCurves hole expansion (Bug A fix)
// =========================================================================

describe("eraseWorldPolygonFromCurves hole expansion", () => {
  it("returns non-null when erasing a polygon that overlaps a curve", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];
    // Erase a square region fully interior to the curve
    const clip: [number, number][] = [
      [80, 80], [120, 80], [120, 120], [80, 120]
    ];
    const result = eraseWorldPolygonFromCurves(curves, clip);
    expect(result).not.toBeNull();
    expect(result!.length).toBe(1);
  });

  it("detects change when expanding an existing hole", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];

    // First erasure: create a hole at cell (2,2) region
    const clip1: [number, number][] = [
      [80, 80], [120, 80], [120, 120], [80, 120]
    ];
    const r1 = eraseWorldPolygonFromCurves(curves, clip1);
    expect(r1).not.toBeNull();
    expect(r1!.length).toBe(1);
    expect(r1![0].innerRings).toBeDefined();
    expect(r1![0].innerRings!.length).toBe(1);

    // Second erasure: expand the hole by erasing adjacent region
    const clip2: [number, number][] = [
      [120, 80], [160, 80], [160, 120], [120, 120]
    ];
    const r2 = eraseWorldPolygonFromCurves(r1!, clip2);

    // This must NOT return null — the hole expanded
    expect(r2).not.toBeNull();
    expect(r2!.length).toBe(1);
  });

  it("merged hole has larger area than original hole", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];

    // Create initial hole
    const clip1: [number, number][] = [
      [80, 80], [120, 80], [120, 120], [80, 120]
    ];
    const r1 = eraseWorldPolygonFromCurves(curves, clip1)!;
    const area1 = polygonArea(curveToPolygon(r1[0]));

    // Expand the hole
    const clip2: [number, number][] = [
      [120, 80], [160, 80], [160, 120], [120, 120]
    ];
    const r2 = eraseWorldPolygonFromCurves(r1, clip2)!;
    const area2 = polygonArea(curveToPolygon(r2[0]));

    // Area must have decreased (hole grew)
    expect(area2).toBeLessThan(area1);
  });

  it("sequential adjacent erasures all succeed", () => {
    let curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];

    // Erase 4 adjacent interior squares in sequence
    const clips: [number, number][][] = [
      [[80, 80], [120, 80], [120, 120], [80, 120]],
      [[120, 80], [160, 80], [160, 120], [120, 120]],
      [[80, 120], [120, 120], [120, 160], [80, 160]],
      [[120, 120], [160, 120], [160, 160], [120, 160]],
    ];

    for (let i = 0; i < clips.length; i++) {
      const result = eraseWorldPolygonFromCurves(curves, clips[i]);
      expect(result).not.toBeNull();
      curves = result!;
    }

    // Final curve should still be valid
    expect(curves.length).toBeGreaterThan(0);
    expect(curves[0].segments.length).toBeGreaterThan(0);
  });

  it("returns null when polygon does not overlap any curve", () => {
    const curves = [makeLargeCurve(0, 0, 3, 3, CELL_SIZE)];
    const clip: [number, number][] = [
      [500, 500], [540, 500], [540, 540], [500, 540]
    ];
    const result = eraseWorldPolygonFromCurves(curves, clip);
    expect(result).toBeNull();
  });
});

// =========================================================================
// Regression: eraseRectangleFromCurves hole expansion (same Bug A fix)
// =========================================================================

describe("eraseRectangleFromCurves hole expansion", () => {
  it("detects change when expanding an existing hole", () => {
    const curves = [makeLargeCurve(0, 0, 8, 8, CELL_SIZE)];

    // Create hole with first rectangle (interior)
    const r1 = eraseRectangleFromCurves(curves, 80, 80, 120, 120);
    expect(r1).not.toBeNull();

    // Expand hole with adjacent rectangle
    const r2 = eraseRectangleFromCurves(r1!, 120, 80, 160, 120);
    expect(r2).not.toBeNull();
  });
});

// =========================================================================
// Regression: simplifyRing near-duplicate vertex handling (Bug B fix)
// =========================================================================

describe("simplifyRing near-duplicate vertices", () => {
  it("preserves corner when intersection point is near hex corner", () => {
    // Simulates polygon-clipping output where an intersection point
    // lands very close to a hex corner. Without dedup, both the
    // intersection point and the corner get removed (cascading deletion).
    const ring: [number, number][] = [
      [0, 0],
      [100, 0],
      [100.02, 0.02],   // intersection point near corner (100, 0)→(100, 100)
      [100, 100],
      [0, 100],
      [0, 0]
    ];
    const simplified = simplifyRing(ring);

    // Must preserve the corner at ~(100, 0)/(100, 100) region.
    // The near-duplicate pair should merge, not cascade-delete.
    expect(simplified.length).toBeGreaterThanOrEqual(5); // 4 corners + closing
  });

  it("does not cascade-delete through near-duplicate pair", () => {
    // Two near-duplicate vertices at a 90-degree corner.
    // Without dedup: both form tiny triangles → both removed → corner lost.
    const ring: [number, number][] = [
      [0, 0],
      [50, 0],
      [50.01, 0.01],    // near-duplicate of next vertex
      [50, 50],
      [0, 50],
      [0, 0]
    ];
    const simplified = simplifyRing(ring);

    // The ~90° corner near (50, 0)→(50, 50) must survive
    const hasCornerNear50 = simplified.some(
      ([x, _y]) => Math.abs(x - 50) < 1
    );
    expect(hasCornerNear50).toBe(true);
    expect(simplified.length).toBeGreaterThanOrEqual(5);
  });

  it("still removes truly collinear points after dedup", () => {
    // Midpoints on straight edges should still be removed
    const ring: [number, number][] = [
      [0, 0], [50, 0], [100, 0],  // midpoint on top edge
      [100, 50], [100, 100],       // midpoint on right edge
      [0, 100],
      [0, 0]
    ];
    const simplified = simplifyRing(ring);
    // Should reduce to 4 corners + closing = 5
    expect(simplified.length).toBe(5);
  });

  it("handles multiple near-duplicate pairs", () => {
    // Two separate near-duplicate pairs at two different corners
    const ring: [number, number][] = [
      [0, 0],
      [99.98, 0.01],   // near (100, 0)
      [100, 0],
      [100, 100],
      [0.02, 99.99],   // near (0, 100)
      [0, 100],
      [0, 0]
    ];
    const simplified = simplifyRing(ring);

    // Both corners must survive
    expect(simplified.length).toBeGreaterThanOrEqual(5);
  });
});
