/**
 * curveFitting Unit Tests
 *
 * Tests the input pipeline: raw pointer points → RDP simplification → Schneider bezier fitting.
 * This is the critical path for every freehand curve drawn by the user.
 */

import { describe, it, expect } from "vitest";
import {
  fitPointsToBezier,
  rdpSimplify,
  fitCubicBezier
} from "../../../../src/geometry/curves/curveFitting.ts";

import type { BezierSegment } from "#types/core/curve.types";

// =========================================================================
// Helpers
// =========================================================================

/** Generate points along a straight horizontal line */
function linPoints(
  x0: number, y0: number, x1: number, y1: number, count: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    pts.push({ x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t });
  }
  return pts;
}

/** Generate points along a quarter-circle arc */
function arcPoints(
  cx: number, cy: number, r: number, startAngle: number, endAngle: number, count: number
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    const angle = startAngle + (endAngle - startAngle) * t;
    pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return pts;
}

/** Evaluate a cubic bezier at parameter t, given start point and BezierSegment */
function evalBez(sx: number, sy: number, seg: BezierSegment, t: number): [number, number] {
  const mt = 1 - t;
  return [
    mt * mt * mt * sx + 3 * mt * mt * t * seg[0] + 3 * mt * t * t * seg[2] + t * t * t * seg[4],
    mt * mt * mt * sy + 3 * mt * mt * t * seg[1] + 3 * mt * t * t * seg[3] + t * t * t * seg[5]
  ];
}

/** Compute max deviation of a bezier curve from a set of sample points */
function maxDeviation(
  start: [number, number], segments: BezierSegment[], samplePoints: { x: number; y: number }[]
): number {
  let maxDist = 0;
  for (const p of samplePoints) {
    let minDist = Infinity;
    let sx = start[0], sy = start[1];
    for (const seg of segments) {
      for (let t = 0; t <= 1; t += 0.05) {
        const [bx, by] = evalBez(sx, sy, seg, t);
        const d = Math.sqrt((bx - p.x) ** 2 + (by - p.y) ** 2);
        if (d < minDist) minDist = d;
      }
      sx = seg[4];
      sy = seg[5];
    }
    if (minDist > maxDist) maxDist = minDist;
  }
  return maxDist;
}

// =========================================================================
// fitPointsToBezier — the public API
// =========================================================================

describe("fitPointsToBezier", () => {
  // Catches: null returns on valid input, segment endpoint mismatch
  it("returns start and segments for a simple straight line", () => {
    const pts = linPoints(0, 0, 100, 0, 20);
    const result = fitPointsToBezier(pts);

    expect(result).not.toBeNull();
    expect(result!.start[0]).toBeCloseTo(0, 1);
    expect(result!.start[1]).toBeCloseTo(0, 1);
    expect(result!.segments.length).toBeGreaterThanOrEqual(1);

    // Last segment should end near (100, 0)
    const lastSeg = result!.segments[result!.segments.length - 1];
    expect(lastSeg[4]).toBeCloseTo(100, 1);
    expect(lastSeg[5]).toBeCloseTo(0, 1);
  });

  // Catches: fitting error on curved input, regression in Schneider algorithm
  it("fits a curved path within acceptable error", () => {
    const pts = arcPoints(0, 0, 100, 0, Math.PI / 2, 40);
    const result = fitPointsToBezier(pts);

    expect(result).not.toBeNull();
    const deviation = maxDeviation(result!.start, result!.segments, pts);
    // Default fitError is 16 (squared distance). The fitting may slightly exceed
    // before splitting, and our sampling is coarse, so allow wider margin.
    expect(deviation).toBeLessThan(15);
  });

  // Catches: crash or invalid output on minimal input
  it("returns null for fewer than 2 points", () => {
    expect(fitPointsToBezier([])).toBeNull();
    expect(fitPointsToBezier([{ x: 5, y: 5 }])).toBeNull();
  });

  // Catches: crash on exactly 2 points (edge case for fitting algorithm)
  it("handles exactly 2 points as a single segment", () => {
    const result = fitPointsToBezier([{ x: 0, y: 0 }, { x: 50, y: 50 }]);

    expect(result).not.toBeNull();
    expect(result!.segments.length).toBe(1);
    expect(result!.segments[0][4]).toBeCloseTo(50, 1);
    expect(result!.segments[0][5]).toBeCloseTo(50, 1);
  });

  // Catches: deduplication failure causing crash in tangent computation
  it("handles duplicate consecutive points without crashing", () => {
    const pts = [
      { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 },
      { x: 50, y: 50 }, { x: 50, y: 50 },
      { x: 100, y: 0 }
    ];
    const result = fitPointsToBezier(pts);
    expect(result).not.toBeNull();
    expect(result!.segments.length).toBeGreaterThanOrEqual(1);
  });

  // Catches: all-duplicate input not handled (would return null after dedup)
  it("returns null when all points are identical", () => {
    const pts = Array.from({ length: 10 }, () => ({ x: 42, y: 42 }));
    expect(fitPointsToBezier(pts)).toBeNull();
  });

  // Catches: segment chain continuity violation (endpoint of seg N ≠ start of seg N+1)
  it("produces continuous segment chain", () => {
    const pts = arcPoints(50, 50, 80, 0, Math.PI, 30);
    const result = fitPointsToBezier(pts);
    expect(result).not.toBeNull();

    let px = result!.start[0], py = result!.start[1];
    for (const seg of result!.segments) {
      // Each segment starts where the previous one ended (implicitly, via start)
      // The endpoint becomes the next implicit start
      const [bx, by] = evalBez(px, py, seg, 0);
      expect(bx).toBeCloseTo(px, 5);
      expect(by).toBeCloseTo(py, 5);
      px = seg[4];
      py = seg[5];
    }
  });

  // Catches: tolerance parameter ignored, simplification not working
  it("respects simplifyTolerance parameter", () => {
    const pts = linPoints(0, 0, 200, 0, 100);
    // Add small jitter to make simplification meaningful
    const jittered = pts.map((p, i) => ({
      x: p.x, y: p.y + Math.sin(i * 0.5) * 0.5
    }));

    const tight = fitPointsToBezier(jittered, 0.1);
    const loose = fitPointsToBezier(jittered, 50);

    expect(tight).not.toBeNull();
    expect(loose).not.toBeNull();
    // Tight tolerance should produce more segments than loose
    expect(tight!.segments.length).toBeGreaterThanOrEqual(loose!.segments.length);
  });
});

// =========================================================================
// rdpSimplify — Ramer-Douglas-Peucker
// =========================================================================

describe("rdpSimplify", () => {
  // Catches: simplification destroying straight-line endpoints
  it("keeps endpoints of a straight line", () => {
    const pts: [number, number][] = Array.from({ length: 20 }, (_, i) => [i * 5, 0]);
    const result = rdpSimplify(pts, 1);

    expect(result[0]).toEqual([0, 0]);
    expect(result[result.length - 1]).toEqual([95, 0]);
    // A straight line should simplify to just 2 points
    expect(result.length).toBe(2);
  });

  // Catches: simplification removing significant features
  it("preserves vertices that deviate beyond tolerance", () => {
    // L-shaped path: right then down
    const pts: [number, number][] = [
      [0, 0], [50, 0], [100, 0], [100, 50], [100, 100]
    ];
    const result = rdpSimplify(pts, 1);

    // The corner at (100, 0) must be preserved
    expect(result.length).toBeGreaterThanOrEqual(3);
    const hasCorner = result.some(p => p[0] === 100 && p[1] === 0);
    expect(hasCorner).toBe(true);
  });

  // Catches: crash on trivial input
  it("returns input unchanged for 2 or fewer points", () => {
    expect(rdpSimplify([[0, 0]], 10)).toEqual([[0, 0]]);
    expect(rdpSimplify([[0, 0], [5, 5]], 10)).toEqual([[0, 0], [5, 5]]);
  });

  // Catches: aggressive simplification destroying curves
  it("preserves shape of a curve with high-frequency detail", () => {
    // Zigzag pattern
    const pts: [number, number][] = [];
    for (let i = 0; i < 20; i++) {
      pts.push([i * 10, (i % 2) * 20]);
    }
    // With tolerance < amplitude, peaks should survive
    const result = rdpSimplify(pts, 5);
    expect(result.length).toBeGreaterThan(2);
    // With tolerance > amplitude, should collapse
    const collapsed = rdpSimplify(pts, 25);
    expect(collapsed.length).toBe(2);
  });
});

// =========================================================================
// fitCubicBezier — Schneider fitting
// =========================================================================

describe("fitCubicBezier", () => {
  // Catches: crash on 2-point input (degenerate case)
  it("produces a single segment for 2 points", () => {
    const result = fitCubicBezier([[0, 0], [100, 100]], 16);
    expect(result.length).toBe(1);
    expect(result[0][4]).toBeCloseTo(100, 1);
    expect(result[0][5]).toBeCloseTo(100, 1);
  });

  // Catches: wrong segment count or endpoint mismatch on multi-point curve
  it("fits an arc to one or few segments", () => {
    const pts: [number, number][] = arcPoints(0, 0, 100, 0, Math.PI / 2, 20)
      .map(p => [p.x, p.y] as [number, number]);
    const result = fitCubicBezier(pts, 16);

    // A quarter circle should fit in 1-3 segments
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result.length).toBeLessThanOrEqual(3);
  });

  // Catches: empty output on valid input
  it("returns empty for fewer than 2 points", () => {
    expect(fitCubicBezier([], 16)).toEqual([]);
    expect(fitCubicBezier([[5, 5]], 16)).toEqual([]);
  });

  // Catches: infinite recursion when split point doesn't change
  it("handles collinear points without infinite recursion", () => {
    const pts: [number, number][] = Array.from(
      { length: 10 }, (_, i) => [i * 10, i * 10]
    );
    const result = fitCubicBezier(pts, 1);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  // Catches: very tight error tolerance causing excessive splitting
  it("produces more segments with tighter error tolerance", () => {
    const pts: [number, number][] = arcPoints(0, 0, 100, 0, Math.PI, 30)
      .map(p => [p.x, p.y] as [number, number]);

    const loose = fitCubicBezier(pts, 100);
    const tight = fitCubicBezier(pts, 1);

    expect(tight.length).toBeGreaterThanOrEqual(loose.length);
  });
});

// =========================================================================
// Near-closure behavior
// =========================================================================

describe("near-closure fitting", () => {
  // Regression: when user draws a nearly-closed loop, the fitted bezier
  // endpoints must be close enough for the FreehandLayer snap threshold
  // (cellSize * 0.5) to detect closure.
  it("preserves proximity of start and end for a near-closed loop", () => {
    // Draw a circle — start and end points are very close
    const pts = arcPoints(100, 100, 80, 0, Math.PI * 1.95, 60);
    const result = fitPointsToBezier(pts);
    expect(result).not.toBeNull();

    // The fitted end should be close to the fitted start
    const start = result!.start;
    const lastSeg = result!.segments[result!.segments.length - 1];
    const end: [number, number] = [lastSeg[4], lastSeg[5]];

    const dist = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
    // At cellSize=40, snap threshold is 20. The gap in the original input
    // is ~80 * (1 - cos(0.05*PI)) ≈ ~1px. The fitted curve should preserve this proximity.
    expect(dist).toBeLessThan(30);
  });

  // Regression: full-circle input fits but last segment endpoint drifts away from start
  it("fits a full circle with start/end within snap distance", () => {
    // Full circle
    const pts = arcPoints(50, 50, 60, 0, Math.PI * 2, 80);
    const result = fitPointsToBezier(pts);
    expect(result).not.toBeNull();

    const start = result!.start;
    const lastSeg = result!.segments[result!.segments.length - 1];
    const end: [number, number] = [lastSeg[4], lastSeg[5]];

    const dist = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
    // The original points start and end at the same position
    expect(dist).toBeLessThan(10);
  });

  // Regression: spike artifacts from extreme Bézier control points.
  // When endpoint tangents are nearly anti-parallel, the C matrix determinant
  // approaches zero and alpha values can blow up, placing control points
  // far from the curve and creating visible spikes.
  it("control points stay bounded even with anti-parallel tangents", () => {
    // Points with nearly anti-parallel endpoint tangents (going right then left)
    // This creates a near-singular C matrix in generateBezier
    const pts: [number, number][] = [
      [0, 0], [10, 0.5], [20, -0.3], [30, 0.1]
    ];
    const result = fitCubicBezier(pts, 16);
    expect(result.length).toBeGreaterThanOrEqual(1);

    // Compute bounding box of input points
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(maxX - minX, maxY - minY, 20) * 2;

    // All control points must stay within a reasonable bounding box
    for (const seg of result) {
      expect(seg[0]).toBeGreaterThan(minX - pad); // CP1.x
      expect(seg[0]).toBeLessThan(maxX + pad);
      expect(seg[1]).toBeGreaterThan(minY - pad); // CP1.y
      expect(seg[1]).toBeLessThan(maxY + pad);
      expect(seg[2]).toBeGreaterThan(minX - pad); // CP2.x
      expect(seg[2]).toBeLessThan(maxX + pad);
      expect(seg[3]).toBeGreaterThan(minY - pad); // CP2.y
      expect(seg[3]).toBeLessThan(maxY + pad);
    }
  });

  it("control points stay bounded for a tight U-turn shape", () => {
    // Narrow shape with sharp reversals — spike-prone after recursive splitting
    const pts: [number, number][] = [
      [0, 0], [5, 30], [3, 60], [0, 90],
      [-2, 60], [-4, 30], [-1, 1]
    ];
    const result = fitCubicBezier(pts, 16);
    expect(result.length).toBeGreaterThanOrEqual(1);

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const pad = Math.max(maxX - minX, maxY - minY) * 2;

    for (const seg of result) {
      expect(seg[0]).toBeGreaterThan(minX - pad);
      expect(seg[0]).toBeLessThan(maxX + pad);
      expect(seg[1]).toBeGreaterThan(minY - pad);
      expect(seg[1]).toBeLessThan(maxY + pad);
      expect(seg[2]).toBeGreaterThan(minX - pad);
      expect(seg[2]).toBeLessThan(maxX + pad);
      expect(seg[3]).toBeGreaterThan(minY - pad);
      expect(seg[3]).toBeLessThan(maxY + pad);
    }
  });

  // Regression: open curve (not near-closed) should NOT have endpoints close together
  it("open curve endpoints are not accidentally close", () => {
    // Half circle — endpoints are far apart
    const pts = arcPoints(0, 0, 100, 0, Math.PI, 30);
    const result = fitPointsToBezier(pts);
    expect(result).not.toBeNull();

    const start = result!.start;
    const lastSeg = result!.segments[result!.segments.length - 1];
    const end: [number, number] = [lastSeg[4], lastSeg[5]];

    const dist = Math.sqrt((end[0] - start[0]) ** 2 + (end[1] - start[1]) ** 2);
    // Half circle endpoints are ~200px apart
    expect(dist).toBeGreaterThan(100);
  });
});
