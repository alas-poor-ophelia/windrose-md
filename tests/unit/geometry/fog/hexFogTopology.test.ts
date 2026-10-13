/**
 * Hex fog topology cache + viewport cull + batched outlines (MEM-02).
 */

import { describe, it, expect, vi } from "vitest";

import type { IGeometry } from "#types/core/geometry.types";
import { getHexFogTopology, renderHexFog } from "../../../../src/geometry/fog/hexFogRenderer";
import { calculateHexFogCullRect } from "../../../../src/geometry/fog/fogRenderer";

function mockCtx(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, filter: 'none',
    beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), closePath: vi.fn(), fill: vi.fn(), stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function mockHexGeometry(hexSize = 32) {
  return {
    hexSize,
    getHexVertices: vi.fn((q: number, r: number) => [0, 1, 2, 3, 4, 5].map(i => ({ worldX: q * 48 + i, worldY: r * 48 + i }))),
    hexToWorld: vi.fn((q: number, r: number) => ({ worldX: q * 48, worldY: r * 48 })),
    getNeighbors: vi.fn((q: number, r: number) => [
      { x: q + 1, y: r }, { x: q - 1, y: r }, { x: q, y: r + 1 },
      { x: q, y: r - 1 }, { x: q + 1, y: r - 1 }, { x: q - 1, y: r + 1 },
    ]),
  };
}

const geometry = {
  worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => ({ screenX: ox + wx * zoom, screenY: oy + wy * zoom }),
} as unknown as IGeometry;
const toAxial = (col: number, row: number) => ({ q: col, r: row });
const toOffset = (q: number, r: number) => ({ col: q, row: r });
const allBounds = { minCol: -1000, maxCol: 1000, minRow: -1000, maxRow: 1000 };
const opts = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };

function block(n: number): Array<{ col: number; row: number }> {
  const cells: Array<{ col: number; row: number }> = [];
  for (let c = 0; c < n; c++) for (let r = 0; r < n; r++) cells.push({ col: c, row: r });
  return cells;
}

describe("hex fog topology cache", () => {
  it("is computed once per foggedCells array identity", () => {
    const hex = mockHexGeometry();
    const cells = block(3);
    const a = getHexFogTopology(cells, hex, 'flat', toAxial, toOffset);
    const calls = hex.getNeighbors.mock.calls.length;
    const b = getHexFogTopology(cells, hex, 'flat', toAxial, toOffset);
    expect(b).toBe(a);
    expect(hex.getNeighbors.mock.calls.length).toBe(calls);
  });

  it("rebuilds for a new array (immutable fog update), even with equal contents", () => {
    const hex = mockHexGeometry();
    const a = getHexFogTopology(block(3), hex, 'flat', toAxial, toOffset);
    const b = getHexFogTopology(block(3), hex, 'flat', toAxial, toOffset);
    expect(b).not.toBe(a);
  });

  it("rebuilds when orientation or hex size changes", () => {
    const cells = block(2);
    const a = getHexFogTopology(cells, mockHexGeometry(32), 'flat', toAxial, toOffset);
    expect(getHexFogTopology(cells, mockHexGeometry(32), 'pointy', toAxial, toOffset)).not.toBe(a);
    const c = getHexFogTopology(cells, mockHexGeometry(40), 'pointy', toAxial, toOffset);
    expect(c.hexSize).toBe(40);
  });

  it("classifies edge vs interior cells", () => {
    const topo = getHexFogTopology(block(3), mockHexGeometry(), 'flat', toAxial, toOffset);
    const centre = topo.cells.find(c => c.col === 1 && c.row === 1);
    const corner = topo.cells.find(c => c.col === 0 && c.row === 0);
    expect(centre?.edge).toBe(false);
    expect(centre?.interior).toBe(true);
    expect(corner?.edge).toBe(true);
    expect(corner?.interior).toBe(true);
    const lone = getHexFogTopology([{ col: 5, row: 5 }], mockHexGeometry(), 'flat', toAxial, toOffset).cells[0];
    expect(lone.edge).toBe(true);
    expect(lone.interior).toBe(false);
  });
});

describe("renderHexFog viewport cull + batching", () => {
  it("only traces cells whose centre is inside the cull rect", () => {
    const hex = mockHexGeometry();
    const ctx = mockCtx();
    // 20x20 block, world spacing 48 px; viewport only covers ~cells 0..2.
    renderHexFog(block(20), { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1, cull: { minX: 0, minY: 0, maxX: 100, maxY: 100 } },
      opts, allBounds, hex, geometry, 'flat', toAxial, toOffset);
    const traced = new Set(hex.getHexVertices.mock.calls.map(([q, r]) => `${q},${r}`));
    expect(traced.size).toBe(9); // cols/rows 0..2
    expect(traced.has('10,10')).toBe(false);
  });

  it("draws nothing when every cell is culled", () => {
    const ctx = mockCtx();
    renderHexFog(block(4), { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1, cull: { minX: 5000, minY: 5000, maxX: 6000, maxY: 6000 } },
      opts, allBounds, mockHexGeometry(), geometry, 'flat', toAxial, toOffset);
    expect(ctx.fill).not.toHaveBeenCalled();
    expect(ctx.stroke).not.toHaveBeenCalled();
  });

  it("strokes all interior outlines with one stroke call", () => {
    const ctx = mockCtx();
    renderHexFog(block(10), { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 },
      opts, allBounds, mockHexGeometry(), geometry, 'flat', toAxial, toOffset);
    expect(ctx.stroke).toHaveBeenCalledTimes(1);
    expect(ctx.fill).toHaveBeenCalledTimes(1);
  });
});

describe("calculateHexFogCullRect", () => {
  it("pads the viewport by hex + blur margin", () => {
    const r = calculateHexFogCullRect(800, 600, 20, 10, 0);
    expect(r).toEqual({ minX: -50, minY: -50, maxX: 850, maxY: 650 });
  });

  it("widens to the circumscribing square when rotated", () => {
    const r = calculateHexFogCullRect(800, 600, 0, 0, 30);
    // half-diagonal of 800x600 is 500
    expect(r.minX).toBeCloseTo(-100);
    expect(r.maxX).toBeCloseTo(900);
    expect(r.minY).toBeCloseTo(-200);
    expect(r.maxY).toBeCloseTo(800);
  });
});
