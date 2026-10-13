/**
 * Static-layer offscreen sizing (MEM-09 rotation, MEM-17 pixel budget).
 */

import { describe, it, expect } from "vitest";

import { computeStaticPad, rotatedViewportHalfExtents } from "../../../../src/geometry/renderers/staticLayerCache";

const area = (w: number, h: number, p: { padX: number; padY: number }): number => (w + 2 * p.padX) * (h + 2 * p.padY);

describe("computeStaticPad", () => {
  it("keeps the 0.5 pad for a small unrotated viewport", () => {
    expect(computeStaticPad(1000, 800, 0)).toEqual({ padX: 500, padY: 400 });
  });

  it("caps a full-pane iPad viewport to the pixel budget", () => {
    const p = computeStaticPad(2732, 2048, 0);
    expect(p).not.toBeNull();
    expect(area(2732, 2048, p!)).toBeLessThanOrEqual(12_000_000);
    expect(p!.padX).toBeGreaterThan(0);
  });

  it.each([30, 45, 90, 137, -60])("rotated (%i deg) pad covers the rotated viewport bbox", (deg) => {
    const w = 1600, h = 900;
    const p = computeStaticPad(w, h, deg)!;
    const { ex, ey } = rotatedViewportHalfExtents(w, h, deg);
    expect(w / 2 + p.padX).toBeGreaterThanOrEqual(ex);
    expect(h / 2 + p.padY).toBeGreaterThanOrEqual(ey);
  });

  it("rotated full-pane iPad still fits under the hard ceiling", () => {
    const p = computeStaticPad(2732, 2048, 45);
    expect(p).not.toBeNull();
    expect(area(2732, 2048, p!)).toBeLessThanOrEqual(16_777_216);
  });

  it("falls back (null) when even the rotated minimum exceeds the hard ceiling", () => {
    expect(computeStaticPad(5000, 5000, 45)).toBeNull();
  });
});

describe("rotatedViewportHalfExtents", () => {
  it("is the half viewport when unrotated, swapped at 90 deg", () => {
    expect(rotatedViewportHalfExtents(800, 600, 0)).toEqual({ ex: 400, ey: 300 });
    const r = rotatedViewportHalfExtents(800, 600, 90);
    expect(r.ex).toBeCloseTo(301);
    expect(r.ey).toBeCloseTo(401);
  });
});
