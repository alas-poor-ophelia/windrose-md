/**
 * HexGeometry.drawGrid viewport culling in radial mode (windrose-wew).
 *
 * The radial branch must skip hexes whose bounding box lies wholly outside
 * the canvas rect, and must never skip a hex whose bounding box intersects
 * it. Output-identical culling: the drawn set is a superset of the visible
 * set and a strict subset of the map when the viewport is smaller than it.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";

const HEX_SIZE = 80;

function radial(maxRing: number, orientation: "flat" | "pointy" = "flat"): HexGeometry {
  return new HexGeometry(HEX_SIZE, orientation, { maxCol: 0, maxRow: 0, maxRing });
}

/** Spy on the per-hex draw so the test needs no real canvas context. */
function spyOutline(g: HexGeometry): { calls: () => Array<{ q: number; r: number }>; ctx: CanvasRenderingContext2D } {
  const spy = vi.spyOn(g, "drawHexOutline").mockImplementation(() => undefined);
  const ctx = {} as CanvasRenderingContext2D;
  return {
    ctx,
    calls: () => spy.mock.calls.map((args) => ({ q: args[1] as number, r: args[2] as number })),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HexGeometry.drawGrid radial culling", () => {
  it("draws every cell when the viewport contains the whole map", () => {
    const g = radial(7);
    const { ctx, calls } = spyOutline(g);
    g.drawGrid(ctx, 5000, 5000, 10000, 10000, 1);
    expect(calls().length).toBe(3 * 7 * 8 + 1);
  });

  it("draws nothing when the map is entirely off-screen", () => {
    const g = radial(7);
    const { ctx, calls } = spyOutline(g);
    g.drawGrid(ctx, -1e6, -1e6, 300, 300, 1);
    expect(calls().length).toBe(0);
  });

  it.each(["flat", "pointy"] as const)(
    "%s: never culls a hex whose bounding box touches the viewport, and culls the rest",
    (orientation) => {
      const g = radial(7, orientation);
      const { ctx, calls } = spyOutline(g);
      const width = 300;
      const height = 300;
      const zoom = 1;
      const offsetX = 150;
      const offsetY = 150;
      g.drawGrid(ctx, offsetX, offsetY, width, height, zoom);

      const drawn = new Set(calls().map((c) => `${c.q},${c.r}`));
      const all = g.getAllRadialCells(7);
      const half = HEX_SIZE * zoom;
      let visible = 0;
      for (const { q, r } of all) {
        const { worldX, worldY } = g.hexToWorld(q, r);
        const sx = offsetX + worldX * zoom;
        const sy = offsetY + worldY * zoom;
        const intersects = sx + half >= 0 && sx - half <= width && sy + half >= 0 && sy - half <= height;
        if (intersects) {
          visible++;
          expect(drawn.has(`${q},${r}`)).toBe(true);
        }
      }
      expect(visible).toBeGreaterThan(0);
      expect(drawn.size).toBeGreaterThanOrEqual(visible);
      expect(drawn.size).toBeLessThan(all.length);
    },
  );

  it("pads the cull rect out to the half-diagonal when the grid is rotated", () => {
    const plain = radial(7);
    const rotated = radial(7);
    const a = spyOutline(plain);
    const b = spyOutline(rotated);
    plain.drawGrid(a.ctx, 150, 150, 300, 300, 1);
    rotated.drawGrid(b.ctx, 150, 150, 300, 300, 1, { rotated: true });
    expect(b.calls().length).toBeGreaterThan(a.calls().length);
  });

  it("respects the line width in the margin", () => {
    const g = radial(7);
    const thin = spyOutline(g);
    g.drawGrid(thin.ctx, 150, 150, 300, 300, 1, { lineWidth: 1 });
    const thinCount = thin.calls().length;
    vi.restoreAllMocks();
    const thick = spyOutline(g);
    g.drawGrid(thick.ctx, 150, 150, 300, 300, 1, { lineWidth: 200 });
    expect(thick.calls().length).toBeGreaterThanOrEqual(thinCount);
  });

  it("still draws the visible cells of a map with more than 50000 cells total (windrose-kgc.18)", () => {
    const g = radial(130); // 3*130*131 + 1 = 51091 cells
    const { ctx, calls } = spyOutline(g);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    g.drawGrid(ctx, 500, 500, 1000, 1000, 1);
    expect(warn).not.toHaveBeenCalled();
    expect(calls().length).toBeGreaterThan(0);
    expect(calls().length).toBeLessThan(51091);
    expect(calls()).toContainEqual({ q: 0, r: 0 });
  });

  it("aborts with a warning when more than 50000 hexes survive the cull", () => {
    const g = radial(130); // 51091 cells, all on-screen at this zoom
    const { ctx, calls } = spyOutline(g);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    g.drawGrid(ctx, 5000, 5000, 10000, 10000, 0.01);
    expect(calls().length).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("Too many hexes");
  });
});
