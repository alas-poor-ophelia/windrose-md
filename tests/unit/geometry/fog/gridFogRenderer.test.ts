/**
 * gridFogRenderer Unit Tests
 *
 * Tests grid fog of war rendering functions.
 * Uses mocked canvas context to verify correct drawing operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  identifyEdgeCells,
  renderBlurPasses,
  renderFogCells,
  renderInteriorGridLines,
  renderGridFog
} from "../../../../src/geometry/fog/gridFogRenderer";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    fillStyle: '',
    filter: 'none',
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    arc: vi.fn(),
    rect: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

describe("gridFogRenderer", () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // identifyEdgeCells
  // ===========================================================================

  describe("identifyEdgeCells", () => {
    it("identifies visible cells within bounds", () => {
      const fogCells = [
        { col: 0, row: 0 },
        { col: 1, row: 0 },
        { col: 5, row: 5 }, // Outside bounds
      ];
      const foggedSet = new Set(['0,0', '1,0', '5,5']);
      const bounds = { minCol: 0, maxCol: 3, minRow: 0, maxRow: 3 };

      const result = identifyEdgeCells(fogCells, foggedSet, bounds);

      expect(result.visibleFogCells).toHaveLength(2);
      expect(result.visibleFogCells).toContainEqual({ col: 0, row: 0 });
      expect(result.visibleFogCells).toContainEqual({ col: 1, row: 0 });
    });

    it("identifies edge cells (cells with non-fogged neighbors)", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 },
      ];
      const foggedSet = new Set(['1,1', '2,1', '1,2', '2,2']);
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      const result = identifyEdgeCells(fogCells, foggedSet, bounds);

      // All cells are edge cells since they're on the boundary of the fog region
      expect(result.edgeCells).toHaveLength(4);
    });

    it("identifies interior cells (surrounded by fog) as non-edge", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
        { col: 1, row: 2 },
        { col: 2, row: 2 }, // Interior cell
        { col: 3, row: 2 },
        { col: 1, row: 3 },
        { col: 2, row: 3 },
        { col: 3, row: 3 },
      ];
      const foggedSet = new Set(fogCells.map(c => `${c.col},${c.row}`));
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      const result = identifyEdgeCells(fogCells, foggedSet, bounds);

      // Cell 2,2 is surrounded by fog on all sides
      const interiorCell = result.edgeCells.find(c => c.col === 2 && c.row === 2);
      expect(interiorCell).toBeUndefined();
    });

    it("returns empty arrays for empty input", () => {
      const result = identifyEdgeCells([], new Set(), { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 });

      expect(result.visibleFogCells).toHaveLength(0);
      expect(result.edgeCells).toHaveLength(0);
    });
  });

  // ===========================================================================
  // renderBlurPasses
  // ===========================================================================

  describe("renderBlurPasses", () => {
    it("does nothing when edgeCells is empty", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };

      renderBlurPasses([], context, options);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it("does nothing when blurRadius is 0", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 0, useGlobalAlpha: true };

      renderBlurPasses([{ col: 1, row: 1 }], context, options);

      expect(ctx.beginPath).not.toHaveBeenCalled();
    });

    it("renders multiple blur passes", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };

      renderBlurPasses([{ col: 1, row: 1 }], context, options);

      // Should have 8 passes (numPasses = 8)
      expect(ctx.beginPath).toHaveBeenCalledTimes(8);
      expect(ctx.fill).toHaveBeenCalledTimes(8);
    });

    it("draws circles for each edge cell", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };

      renderBlurPasses([{ col: 1, row: 1 }, { col: 2, row: 1 }], context, options);

      // Each pass draws circles for both cells
      expect(ctx.arc).toHaveBeenCalled();
    });

    it("resets filter to none after blur passes", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };

      renderBlurPasses([{ col: 1, row: 1 }], context, options);

      expect(ctx.filter).toBe('none');
    });
  });

  // ===========================================================================
  // renderFogCells
  // ===========================================================================

  describe("renderFogCells", () => {
    it("renders rectangles for fog cells", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderFogCells([{ col: 1, row: 1 }], context);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.rect).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("renders multiple rectangles in single path", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderFogCells([
        { col: 1, row: 1 },
        { col: 2, row: 1 },
        { col: 3, row: 1 },
      ], context);

      expect(ctx.beginPath).toHaveBeenCalledTimes(1);
      expect(ctx.rect).toHaveBeenCalledTimes(3);
      expect(ctx.fill).toHaveBeenCalledTimes(1);
    });

    it("positions rectangles based on offset and scaledSize", () => {
      const context = { ctx, fogCtx: null, offsetX: 100, offsetY: 50, scaledSize: 40 };

      renderFogCells([{ col: 2, row: 3 }], context);

      // Center should be at: offsetX + col * scaledSize + scaledSize/2
      // = 100 + 2*40 + 20 = 200
      // Y = 50 + 3*40 + 20 = 190
      // Rect at centerX - halfSize, centerY - halfSize
      expect(ctx.rect).toHaveBeenCalledWith(180, 170, 40, 40);
    });
  });

  // ===========================================================================
  // renderInteriorGridLines
  // ===========================================================================

  describe("renderInteriorGridLines", () => {
    it("does nothing for single cell", () => {
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderInteriorGridLines([{ col: 1, row: 1 }], new Set(['1,1']), context, 1);

      expect(ctx.fillRect).not.toHaveBeenCalled();
    });

    it("draws lines between adjacent fog cells", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderInteriorGridLines(fogCells, foggedSet, context, 1);

      // Should draw a vertical line between cells
      expect(ctx.fillRect).toHaveBeenCalled();
    });

    it("sets line color to semi-transparent white", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderInteriorGridLines(fogCells, foggedSet, context, 1);

      expect(ctx.fillStyle).toBe('rgba(255, 255, 255, 0.15)');
    });

    it("avoids drawing duplicate lines", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const foggedSet = new Set(['1,1', '2,1']);
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };

      renderInteriorGridLines(fogCells, foggedSet, context, 1);

      // Only one line should be drawn between the two cells
      expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // renderGridFog (integration)
  // ===========================================================================

  describe("renderGridFog", () => {
    it("orchestrates full fog rendering", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 2, row: 1 },
      ];
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderGridFog(fogCells, context, options, bounds, 1);

      // Should render fog cells
      expect(ctx.rect).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("includes blur passes when enabled", () => {
      const fogCells = [{ col: 1, row: 1 }];
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: true, blurRadius: 10, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderGridFog(fogCells, context, options, bounds, 1);

      // Blur passes use arc for circles
      expect(ctx.arc).toHaveBeenCalled();
    });

    it("respects visible bounds", () => {
      const fogCells = [
        { col: 1, row: 1 },
        { col: 10, row: 10 }, // Outside bounds
      ];
      const context = { ctx, fogCtx: null, offsetX: 0, offsetY: 0, scaledSize: 40 };
      const options = { fowOpacity: 0.9, fowBlurEnabled: false, blurRadius: 0, useGlobalAlpha: true };
      const bounds = { minCol: 0, maxCol: 5, minRow: 0, maxRow: 5 };

      renderGridFog(fogCells, context, options, bounds, 1);

      // Only one cell should be rendered
      expect(ctx.rect).toHaveBeenCalledTimes(1);
    });
  });
});
