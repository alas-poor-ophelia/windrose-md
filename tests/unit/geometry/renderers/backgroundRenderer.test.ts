/**
 * backgroundRenderer Unit Tests
 *
 * Tests background image rendering for hex and grid maps.
 * Uses mocked canvas context and geometry to verify correct drawing operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import { renderHexBackgroundImage, renderGridBackgroundImage } from "../../../../src/geometry/renderers/backgroundRenderer.ts";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// Mock HTMLImageElement
function createMockImage(width: number, height: number): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
    complete: true,
  } as unknown as HTMLImageElement;
}

// Mock hex geometry
function createMockHexGeometry() {
  return {
    hexSize: 32,
    sqrt3: Math.sqrt(3),
    hexToWorld: vi.fn((q: number, r: number) => ({
      worldX: q * 48,
      worldY: r * 48,
    })),
  };
}

// Mock offsetToAxial function
const mockOffsetToAxial = vi.fn((col: number, row: number, _orientation: string) => ({
  q: col,
  r: row,
}));

describe("backgroundRenderer", () => {
  let ctx: CanvasRenderingContext2D;
  let hexGeometry: ReturnType<typeof createMockHexGeometry>;

  beforeEach(() => {
    ctx = createMockContext();
    hexGeometry = createMockHexGeometry();
    vi.clearAllMocks();
  });

  describe("renderHexBackgroundImage", () => {
    it("draws the background image", () => {
      const bgImage = createMockImage(512, 512);
      const config = { path: 'test.png' };
      const hexBounds = { maxCol: 10, maxRow: 10 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it("scales image by zoom factor", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 2 },
        mockOffsetToAxial
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawWidth = drawCall[3];
      const drawHeight = drawCall[4];

      // Image should be scaled by zoom (100 * 2 = 200)
      expect(drawWidth).toBe(200);
      expect(drawHeight).toBe(200);
    });

    it("applies opacity when less than 1", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', opacity: 0.5 };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.globalAlpha).toBe(0.5);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("does not save/restore when opacity is 1", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', opacity: 1 };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.restore).not.toHaveBeenCalled();
    });

    it("defaults opacity to 1 when not specified", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' }; // No opacity
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("applies image offset when specified", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', offsetX: 10, offsetY: 20 };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      // The offset should be applied to the draw position
      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it("converts all corner coordinates to world space", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      const hexBounds = { maxCol: 10, maxRow: 8 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      // Should check all 4 corners
      expect(mockOffsetToAxial).toHaveBeenCalledTimes(4);
      expect(mockOffsetToAxial).toHaveBeenCalledWith(0, 0, 'flat');
      expect(mockOffsetToAxial).toHaveBeenCalledWith(9, 0, 'flat'); // maxCol - 1
      expect(mockOffsetToAxial).toHaveBeenCalledWith(0, 7, 'flat'); // maxRow - 1
      expect(mockOffsetToAxial).toHaveBeenCalledWith(9, 7, 'flat');
    });

    it("passes orientation to offsetToAxial", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'pointy',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      expect(mockOffsetToAxial).toHaveBeenCalledWith(expect.any(Number), expect.any(Number), 'pointy');
    });

    it("uses hexToWorld to get world positions", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      const hexBounds = { maxCol: 5, maxRow: 5 };

      renderHexBackgroundImage(
        bgImage,
        config,
        hexBounds,
        hexGeometry,
        'flat',
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 },
        mockOffsetToAxial
      );

      // Should call hexToWorld for each corner
      expect(hexGeometry.hexToWorld).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================================================
  // renderGridBackgroundImage
  // ===========================================================================

  describe("renderGridBackgroundImage", () => {
    const cellSize = 32;

    it("draws the background image", () => {
      const bgImage = createMockImage(512, 512);
      const config = { path: 'test.png' };
      const dimensions = { width: 10, height: 10 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.drawImage).toHaveBeenCalled();
    });

    it("scales image by zoom factor", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 2 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawWidth = drawCall[3];
      const drawHeight = drawCall[4];

      // Image should be scaled by zoom (100 * 2 = 200)
      expect(drawWidth).toBe(200);
      expect(drawHeight).toBe(200);
    });

    it("applies imageGridSize scaling when specified", () => {
      const bgImage = createMockImage(100, 100);
      // Image has 40px grid cells, Windrose uses 32px cells
      // Scale = 32 / 40 = 0.8
      const config = { path: 'test.png', imageGridSize: 40 };
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawWidth = drawCall[3];
      const drawHeight = drawCall[4];

      // Image should be scaled by imageGridSize ratio (100 * 0.8 = 80)
      expect(drawWidth).toBe(80);
      expect(drawHeight).toBe(80);
    });

    it("uses scale of 1.0 when imageGridSize not specified", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' }; // No imageGridSize
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawWidth = drawCall[3];
      const drawHeight = drawCall[4];

      // No scaling applied
      expect(drawWidth).toBe(100);
      expect(drawHeight).toBe(100);
    });

    it("scales correctly with both zoom and imageGridSize", () => {
      const bgImage = createMockImage(100, 100);
      // Scale = cellSize / imageGridSize = 32 / 40 = 0.8
      // Then multiply by zoom = 2
      // Final = 100 * 0.8 * 2 = 160
      const config = { path: 'test.png', imageGridSize: 40 };
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 2 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawWidth = drawCall[3];
      const drawHeight = drawCall[4];

      // 100 * 0.8 * 2 = 160
      expect(drawWidth).toBe(160);
      expect(drawHeight).toBe(160);
    });

    it("centers image on grid bounds", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' };
      // 10 cells * 32 pixels = 320 world pixels
      const dimensions = { width: 10, height: 10 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawX = drawCall[1];
      const drawY = drawCall[2];

      // World center is at (320/2, 320/2) = (160, 160)
      // Image center should be at world center
      // Draw position = worldCenter - imageSize/2 = 160 - 50 = 110
      expect(drawX).toBe(110);
      expect(drawY).toBe(110);
    });

    it("applies opacity when less than 1", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', opacity: 0.5 };
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.globalAlpha).toBe(0.5);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("does not save/restore when opacity is 1", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', opacity: 1 };
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.restore).not.toHaveBeenCalled();
    });

    it("defaults opacity to 1 when not specified", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png' }; // No opacity
      const dimensions = { width: 5, height: 5 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("applies image offsetX and offsetY", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', offsetX: 10, offsetY: 20 };
      const dimensions = { width: 10, height: 10 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 1 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawX = drawCall[1];
      const drawY = drawCall[2];

      // Base position is 110 (from centering test), plus offset
      expect(drawX).toBe(120); // 110 + 10
      expect(drawY).toBe(130); // 110 + 20
    });

    it("applies offset scaled by zoom", () => {
      const bgImage = createMockImage(100, 100);
      const config = { path: 'test.png', offsetX: 10, offsetY: 20 };
      const dimensions = { width: 10, height: 10 };

      renderGridBackgroundImage(
        bgImage,
        config,
        dimensions,
        cellSize,
        { ctx, offsetX: 0, offsetY: 0, zoom: 2 }
      );

      const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
      const drawX = drawCall[1];
      const drawY = drawCall[2];

      // At zoom 2:
      // World center = 160 * 2 = 320
      // Image half-size = 50 * 2 = 100
      // Base position = 320 - 100 = 220
      // Plus offset * zoom = 10*2=20 and 20*2=40
      expect(drawX).toBe(240); // 220 + 20
      expect(drawY).toBe(260); // 220 + 40
    });
  });
});
