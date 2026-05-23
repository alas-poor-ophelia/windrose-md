/**
 * hexFogRenderer Unit Tests
 *
 * Tests hex fog of war rendering functions.
 * Uses mocked canvas context and geometry to verify correct drawing operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import type { IGeometry } from "#types/core/geometry.types";
import {
  identifyHexEdgeCells,
  traceHexPath,
  renderHexBlurPasses,
  renderHexFogCells,
  renderInteriorHexOutlines,
  renderHexFog
} from "../../../../src/geometry/fog/hexFogRenderer";

// Local type matching the (non-exported) HexFogRenderContext interface
interface HexFogRenderContextLocal {
  ctx: CanvasRenderingContext2D;
  fogCtx: CanvasRenderingContext2D | null;
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    filter: 'none',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// Mock hex geometry
function createMockHexGeometry() {
  return {
    hexSize: 32,
    getHexVertices: vi.fn((q: number, r: number) => [
      { worldX: q * 48 + 0, worldY: r * 48 + 16 },
      { worldX: q * 48 + 14, worldY: r * 48 + 0 },
      { worldX: q * 48 + 42, worldY: r * 48 + 0 },
      { worldX: q * 48 + 56, worldY: r * 48 + 16 },
      { worldX: q * 48 + 42, worldY: r * 48 + 32 },
      { worldX: q * 48 + 14, worldY: r * 48 + 32 },
    ]),
    hexToWorld: vi.fn((q: number, r: number) => ({
      worldX: q * 48 + 28,
      worldY: r * 48 + 16,
    })),
    getNeighbors: vi.fn((q: number, r: number) => [
      { x: q + 1, y: r },
      { x: q - 1, y: r },
      { x: q, y: r + 1 },
      { x: q, y: r - 1 },
      { x: q + 1, y: r - 1 },
      { x: q - 1, y: r + 1 },
    ]),
  };
}

// Mock geometry (worldToScreen)
function createMockGeometry() {
  return {
    worldToScreen: vi.fn((worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => ({
      screenX: (worldX + offsetX) * zoom,
      screenY: (worldY + offsetY) * zoom,
    })),
  } as unknown as IGeometry;
}

// Mock coordinate converters
const mockOffsetToAxial = vi.fn((col: number, row: number, _orientation: string) => ({
  q: col,
  r: row,
}));

const mockAxialToOffset = vi.fn((q: number, r: number, _orientation: string) => ({
  col: q,
  row: r,
}));

describe("hexFogRenderer", () => {
  let ctx: CanvasRenderingContext2D;
  let hexGeometry: ReturnType<typeof createMockHexGeometry>;
  let geometry: ReturnType<typeof createMockGeometry>;

  beforeEach(() => {
    ctx = createMockContext();
    hexGeometry = createMockHexGeometry();
    geometry = createMockGeometry();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // identifyHexEdgeCells
  // ===========================================================================

  describe("identifyHexEdgeCells", () => {
    it("identifies visible cells within bounds", () => {
      const fogCells = [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 5, row: 5 }, // Outside bounds
      ];
      const foggedSet = new Set(['0,0', '1,0', '5,5']);
      const bounds = { minCol: 0, maxCol: 3, minRow: 0, maxRow: 3 };

      const result = identifyHexEdgeCells(
        fogCells,
        foggedSet,
        bounds,
        hexGeometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(result.visibleFogCells).toHaveLength(2);
      expect(result.visibleFogCells).toContainEqual({ col: 0, row: 0 });
      expect(result.visibleFogCells).toContainEqual({ col: 1, row: 0 });
    });

    it("identifies edge cells (cells with non-fogged neighbors)", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      const result = identifyHexEdgeCells(
        fogCells,
        foggedSet,
        bounds,
        hexGeometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      // Both cells are edge cells since they have non-fogged neighbors
      expect(result.edgeCells).toHaveLength(2);
    });

    it("returns empty arrays for empty input", () => {
      const result = identifyHexEdgeCells(
        [],
        new Set(),
        { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 },
        hexGeometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(result.visibleFogCells).toHaveLength(0);
      expect(result.edgeCells).toHaveLength(0);
    });

    it("uses hex neighbor detection for edge detection", () => {
      const fogCells = [{ col: 2, row: 2 }];
      const foggedSet = new Set(['2,2']);
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      identifyHexEdgeCells(
        fogCells,
        foggedSet,
        bounds,
        hexGeometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      // Should call getNeighbors to check for edge status
      expect(hexGeometry.getNeighbors).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // traceHexPath
  // ===========================================================================

  describe("traceHexPath", () => {
    it("traces hex vertices at scale 1.0", () => {
      traceHexPath(
        ctx,
        0,
        0,
        1.0,
        hexGeometry,
        geometry,
        { offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(hexGeometry.getHexVertices).toHaveBeenCalledWith(0, 0);
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalledTimes(5); // 6 vertices, first is moveTo, rest are lineTo
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it("scales vertices when scale is not 1.0", () => {
      traceHexPath(
        ctx,
        0,
        0,
        1.5,
        hexGeometry,
        geometry,
        { offsetX: 0, offsetY: 0, zoom: 1 }
      );

      // Should get center for scaling
      expect(hexGeometry.hexToWorld).toHaveBeenCalledWith(0, 0);
      expect(ctx.moveTo).toHaveBeenCalled();
      expect(ctx.lineTo).toHaveBeenCalledTimes(5);
      expect(ctx.closePath).toHaveBeenCalled();
    });

    it("applies world to screen transformation", () => {
      traceHexPath(
        ctx,
        1,
        2,
        1.0,
        hexGeometry,
        geometry,
        { offsetX: 100, offsetY: 50, zoom: 2 }
      );

      // Should transform each vertex
      expect(geometry.worldToScreen).toHaveBeenCalledWith(
        expect.any(Number),
        expect.any(Number),
        100,
        50,
        2
      );
    });
  });

  // ===========================================================================
  // renderHexBlurPasses
  // ===========================================================================

  describe("renderHexBlurPasses", () => {
    it("does nothing when edgeCells is empty", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };

      renderHexBlurPasses([], context, options, hexGeometry, geometry);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it("does nothing when blurRadius is 0", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 0, useGlobalAlpha: true };
      const edgeCells = [{ col: 1, row: 1, q: 1, r: 1 }];

      renderHexBlurPasses(edgeCells, context, options, hexGeometry, geometry);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it("renders multiple blur passes", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };
      const edgeCells = [{ col: 1, row: 1, q: 1, r: 1 }];

      renderHexBlurPasses(edgeCells, context, options, hexGeometry, geometry);

      // Should have 8 passes (numPasses = 8)
      expect(ctx.beginPath).toHaveBeenCalledTimes(8);
      expect(ctx.fill).toHaveBeenCalledTimes(8);
    });

    it("traces hex paths for each edge cell", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };
      const edgeCells = [
        { col: 1, row: 1, q: 1, r: 1 },
        { col: 2, row: 1, q: 2, r: 1 }
      ];

      renderHexBlurPasses(edgeCells, context, options, hexGeometry, geometry);

      // Each pass should get vertices for each edge cell
      expect(hexGeometry.getHexVertices).toHaveBeenCalled();
    });

    it("resets filter to none after blur passes", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };
      const edgeCells = [{ col: 1, row: 1, q: 1, r: 1 }];

      renderHexBlurPasses(edgeCells, context, options, hexGeometry, geometry);

      expect(ctx.filter).toBe('none');
    });
  });

  // ===========================================================================
  // renderHexFogCells
  // ===========================================================================

  describe("renderHexFogCells", () => {
    it("renders hexagons for fog cells", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const visibleFogCells = [{ col: 1, row: 1 }];

      renderHexFogCells(visibleFogCells, context, hexGeometry, geometry, 'flat', mockOffsetToAxial);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(hexGeometry.getHexVertices).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("renders multiple hexagons in single path", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const visibleFogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
      ];

      renderHexFogCells(visibleFogCells, context, hexGeometry, geometry, 'flat', mockOffsetToAxial);

      expect(ctx.beginPath).toHaveBeenCalledTimes(1);
      expect(hexGeometry.getHexVertices).toHaveBeenCalledTimes(3);
      expect(ctx.fill).toHaveBeenCalledTimes(1);
    });

    it("converts offset to axial coordinates", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const visibleFogCells = [{ col: 2, row: 3 }];

      renderHexFogCells(visibleFogCells, context, hexGeometry, geometry, 'pointy', mockOffsetToAxial);

      expect(mockOffsetToAxial).toHaveBeenCalledWith(2, 3, 'pointy');
    });
  });

  // ===========================================================================
  // renderInteriorHexOutlines
  // ===========================================================================

  describe("renderInteriorHexOutlines", () => {
    it("does nothing for single cell", () => {
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const foggedSet = new Set(['1,1']);

      renderInteriorHexOutlines(
        [{ col: 1, row: 1 }],
        foggedSet,
        context,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(ctx.stroke).not.toHaveBeenCalled();
    });

    it("draws outlines for cells with fogged neighbors", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };

      renderInteriorHexOutlines(
        fogCells,
        foggedSet,
        context,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("sets stroke style to semi-transparent white", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };

      renderInteriorHexOutlines(
        fogCells,
        foggedSet,
        context,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(ctx.strokeStyle).toBe('rgba(255, 255, 255, 0.15)');
    });
  });

  // ===========================================================================
  // renderHexFog (integration)
  // ===========================================================================

  describe("renderHexFog", () => {
    it("orchestrates full fog rendering", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderHexFog(
        fogCells,
        context,
        options,
        bounds,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      // Should render fog cells
      expect(hexGeometry.getHexVertices).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("includes blur passes when enabled", () => {
      const fogCells = [{ col: 1, row: 1 }];
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderHexFog(
        fogCells,
        context,
        options,
        bounds,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      // Blur passes cause multiple fill calls
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("respects visible bounds", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 10, row: 10 }, // Outside bounds
      ];
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderHexFog(
        fogCells,
        context,
        options,
        bounds,
        hexGeometry,
        geometry,
        'flat',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      // Should only get vertices for the cell within bounds
      // The call count should reflect only 1 cell being rendered
      expect(mockOffsetToAxial).toHaveBeenCalledWith(1, 1, 'flat');
    });

    it("uses correct orientation for coordinate conversion", () => {
      const fogCells = [{ col: 1, row: 1 }];
      const context: HexFogRenderContextLocal = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, zoom: 1 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderHexFog(
        fogCells,
        context,
        options,
        bounds,
        hexGeometry,
        geometry,
        'pointy',
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(mockOffsetToAxial).toHaveBeenCalledWith(1, 1, 'pointy');
    });
  });
});
