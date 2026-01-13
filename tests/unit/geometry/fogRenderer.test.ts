/**
 * fogRenderer Unit Tests
 *
 * Tests fog of war orchestration functions.
 * Uses mocked canvas context and geometry to verify correct setup and dispatch.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  getFogSettings,
  createFogFillStyle,
  calculateBlurRadius,
  setupFogCanvas,
  calculateGridVisibleBounds,
  calculateHexVisibleBounds,
  renderFog,
} from "../../../src/geometry/fogRenderer.ts";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    globalAlpha: 1,
    fillStyle: '',
    createPattern: vi.fn(() => ({ pattern: true })),
  } as unknown as CanvasRenderingContext2D;
}

// Mock fog canvas
function createMockFogCanvas(): HTMLCanvasElement {
  const mockCtx = {
    fillStyle: '',
    clearRect: vi.fn(),
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    restore: vi.fn(),
    createPattern: vi.fn(() => ({ pattern: true })),
  };

  return {
    width: 800,
    height: 600,
    style: { filter: '' },
    getContext: vi.fn(() => mockCtx),
  } as unknown as HTMLCanvasElement;
}

// Mock image
function createMockImage(complete = true, naturalWidth = 100): HTMLImageElement {
  return {
    complete,
    naturalWidth,
  } as unknown as HTMLImageElement;
}

describe("fogRenderer", () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // getFogSettings
  // ===========================================================================

  describe("getFogSettings", () => {
    it("extracts fog settings with defaults", () => {
      const settings = getFogSettings({});

      expect(settings.fowColor).toBe('#000000');
      expect(settings.fowOpacity).toBe(0.9);
      expect(settings.fowImagePath).toBeUndefined();
      expect(settings.fowBlurEnabled).toBe(false);
      expect(settings.fowBlurFactor).toBe(0.08);
    });

    it("extracts fog settings from provided values", () => {
      const settings = getFogSettings({
        fogOfWarColor: '#ff0000',
        fogOfWarOpacity: 0.7,
        fogOfWarImage: 'fog.png',
        fogOfWarBlurEnabled: true,
        fogOfWarBlurFactor: 0.15,
      });

      expect(settings.fowColor).toBe('#ff0000');
      expect(settings.fowOpacity).toBe(0.7);
      expect(settings.fowImagePath).toBe('fog.png');
      expect(settings.fowBlurEnabled).toBe(true);
      expect(settings.fowBlurFactor).toBe(0.15);
    });

    it("handles partial settings", () => {
      const settings = getFogSettings({
        fogOfWarColor: '#00ff00',
      });

      expect(settings.fowColor).toBe('#00ff00');
      expect(settings.fowOpacity).toBe(0.9); // default
    });
  });

  // ===========================================================================
  // createFogFillStyle
  // ===========================================================================

  describe("createFogFillStyle", () => {
    it("returns solid color when no image path", () => {
      const mockGetImage = vi.fn();

      const result = createFogFillStyle(ctx, '#000000', undefined, mockGetImage);

      expect(result.fillStyle).toBe('#000000');
      expect(result.useGlobalAlpha).toBe(true);
      expect(mockGetImage).not.toHaveBeenCalled();
    });

    it("creates pattern when image is available", () => {
      const mockImage = createMockImage();
      const mockGetImage = vi.fn(() => mockImage);

      const result = createFogFillStyle(ctx, '#000000', 'fog.png', mockGetImage);

      expect(mockGetImage).toHaveBeenCalledWith('fog.png');
      expect(ctx.createPattern).toHaveBeenCalledWith(mockImage, 'repeat');
      expect(result.fillStyle).toEqual({ pattern: true });
    });

    it("falls back to color when image not loaded", () => {
      const mockImage = createMockImage(false);
      const mockGetImage = vi.fn(() => mockImage);

      const result = createFogFillStyle(ctx, '#ff0000', 'fog.png', mockGetImage);

      expect(result.fillStyle).toBe('#ff0000');
    });

    it("falls back to color when image has no width", () => {
      const mockImage = createMockImage(true, 0);
      const mockGetImage = vi.fn(() => mockImage);

      const result = createFogFillStyle(ctx, '#ff0000', 'fog.png', mockGetImage);

      expect(result.fillStyle).toBe('#ff0000');
    });

    it("falls back to color when image not found", () => {
      const mockGetImage = vi.fn(() => null);

      const result = createFogFillStyle(ctx, '#ff0000', 'fog.png', mockGetImage);

      expect(result.fillStyle).toBe('#ff0000');
    });
  });

  // ===========================================================================
  // calculateBlurRadius
  // ===========================================================================

  describe("calculateBlurRadius", () => {
    it("returns 0 when blur disabled", () => {
      const radius = calculateBlurRadius(false, 0.08, 32, 1);

      expect(radius).toBe(0);
    });

    it("calculates blur radius based on cell size and factor", () => {
      const radius = calculateBlurRadius(true, 0.08, 32, 1);

      expect(radius).toBe(32 * 0.08 * 1); // 2.56
    });

    it("scales blur radius with zoom", () => {
      const radius = calculateBlurRadius(true, 0.08, 32, 2);

      expect(radius).toBe(32 * 0.08 * 2); // 5.12
    });
  });

  // ===========================================================================
  // setupFogCanvas
  // ===========================================================================

  describe("setupFogCanvas", () => {
    it("returns null when fog canvas is null", () => {
      const result = setupFogCanvas(
        null, true, 10, 800, 600, 0, '#000000', undefined, vi.fn()
      );

      expect(result).toBeNull();
    });

    it("returns null when blur disabled", () => {
      const fogCanvas = createMockFogCanvas();

      const result = setupFogCanvas(
        fogCanvas, false, 10, 800, 600, 0, '#000000', undefined, vi.fn()
      );

      expect(result).toBeNull();
    });

    it("returns null when blur radius is 0", () => {
      const fogCanvas = createMockFogCanvas();

      const result = setupFogCanvas(
        fogCanvas, true, 0, 800, 600, 0, '#000000', undefined, vi.fn()
      );

      expect(result).toBeNull();
    });

    it("sets up fog canvas when blur enabled", () => {
      const fogCanvas = createMockFogCanvas();
      const mockGetImage = vi.fn();

      const result = setupFogCanvas(
        fogCanvas, true, 10, 800, 600, 0, '#000000', undefined, mockGetImage
      );

      expect(result).not.toBeNull();
      expect(fogCanvas.getContext).toHaveBeenCalledWith('2d');
    });

    it("resizes canvas if dimensions differ", () => {
      const fogCanvas = createMockFogCanvas();
      fogCanvas.width = 400; // Different from 800

      setupFogCanvas(
        fogCanvas, true, 10, 800, 600, 0, '#000000', undefined, vi.fn()
      );

      expect(fogCanvas.width).toBe(800);
      expect(fogCanvas.height).toBe(600);
    });

    it("applies CSS blur filter", () => {
      const fogCanvas = createMockFogCanvas();

      setupFogCanvas(
        fogCanvas, true, 10, 800, 600, 0, '#000000', undefined, vi.fn()
      );

      expect(fogCanvas.style.filter).toMatch(/blur\(\d+(\.\d+)?px\)/);
    });

    it("applies rotation for north direction", () => {
      const fogCanvas = createMockFogCanvas();
      const fogCtx = fogCanvas.getContext('2d');

      setupFogCanvas(
        fogCanvas, true, 10, 800, 600, 45, '#000000', undefined, vi.fn()
      );

      expect(fogCtx?.rotate).toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // calculateGridVisibleBounds
  // ===========================================================================

  describe("calculateGridVisibleBounds", () => {
    it("calculates bounds based on viewport", () => {
      const bounds = calculateGridVisibleBounds(800, 600, 0, 0, 40, { width: 50, height: 50 });

      expect(bounds.minCol).toBeGreaterThanOrEqual(0);
      expect(bounds.maxCol).toBeLessThanOrEqual(50);
      expect(bounds.minRow).toBeGreaterThanOrEqual(0);
      expect(bounds.maxRow).toBeLessThanOrEqual(50);
    });

    it("clamps to map dimensions", () => {
      const bounds = calculateGridVisibleBounds(8000, 6000, 0, 0, 40, { width: 20, height: 20 });

      expect(bounds.maxCol).toBeLessThanOrEqual(20);
      expect(bounds.maxRow).toBeLessThanOrEqual(20);
    });

    it("uses default max bound when dimensions not provided", () => {
      const bounds = calculateGridVisibleBounds(800, 600, 0, 0, 40, undefined);

      expect(bounds.maxCol).toBeLessThanOrEqual(200);
      expect(bounds.maxRow).toBeLessThanOrEqual(200);
    });

    it("accounts for offset", () => {
      const boundsNoOffset = calculateGridVisibleBounds(800, 600, 0, 0, 40, { width: 100, height: 100 });
      const boundsWithOffset = calculateGridVisibleBounds(800, 600, -200, -200, 40, { width: 100, height: 100 });

      expect(boundsWithOffset.minCol).toBeGreaterThan(boundsNoOffset.minCol);
      expect(boundsWithOffset.minRow).toBeGreaterThan(boundsNoOffset.minRow);
    });
  });

  // ===========================================================================
  // calculateHexVisibleBounds
  // ===========================================================================

  describe("calculateHexVisibleBounds", () => {
    it("returns full hex bounds", () => {
      const bounds = calculateHexVisibleBounds({ maxCol: 30, maxRow: 25 });

      expect(bounds.minCol).toBe(0);
      expect(bounds.maxCol).toBe(30);
      expect(bounds.minRow).toBe(0);
      expect(bounds.maxRow).toBe(25);
    });

    it("uses default bounds when not provided", () => {
      const bounds = calculateHexVisibleBounds(undefined);

      expect(bounds.minCol).toBe(0);
      expect(bounds.maxCol).toBe(100);
      expect(bounds.minRow).toBe(0);
      expect(bounds.maxRow).toBe(100);
    });
  });

  // ===========================================================================
  // renderFog (integration)
  // ===========================================================================

  describe("renderFog", () => {
    const mockRenderGridFog = vi.fn();
    const mockRenderHexFog = vi.fn();
    const mockGetCachedImage = vi.fn();
    const mockOffsetToAxial = vi.fn((col, row) => ({ q: col, r: row }));
    const mockAxialToOffset = vi.fn((q, r) => ({ col: q, row: r }));
    const mockGeometry = {
      worldToScreen: vi.fn(),
    };

    beforeEach(() => {
      mockRenderGridFog.mockClear();
      mockRenderHexFog.mockClear();
    });

    it("does nothing when fog disabled", () => {
      renderFog(
        { enabled: false },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#000', fowOpacity: 0.9, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        {},
        false,
        null,
        { cellSize: 40 },
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(mockRenderGridFog).not.toHaveBeenCalled();
      expect(mockRenderHexFog).not.toHaveBeenCalled();
    });

    it("does nothing when no fogged cells", () => {
      renderFog(
        { enabled: true, foggedCells: [] },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#000', fowOpacity: 0.9, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        {},
        false,
        null,
        { cellSize: 40 },
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(mockRenderGridFog).not.toHaveBeenCalled();
      expect(mockRenderHexFog).not.toHaveBeenCalled();
    });

    it("calls grid fog renderer for grid maps", () => {
      renderFog(
        { enabled: true, foggedCells: [{ col: 1, row: 1 }] },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#000', fowOpacity: 0.9, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        { dimensions: { width: 50, height: 50 } },
        false,
        null,
        { cellSize: 40 },
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(mockRenderGridFog).toHaveBeenCalled();
      expect(mockRenderHexFog).not.toHaveBeenCalled();
    });

    it("calls hex fog renderer for hex maps", () => {
      const mockHexGeom = {
        hexSize: 32,
        getHexVertices: vi.fn(),
        hexToWorld: vi.fn(),
        getNeighbors: vi.fn(),
      };

      renderFog(
        { enabled: true, foggedCells: [{ col: 1, row: 1 }] },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#000', fowOpacity: 0.9, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        { hexBounds: { maxCol: 30, maxRow: 25 } },
        true,
        mockHexGeom,
        null,
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(mockRenderHexFog).toHaveBeenCalled();
      expect(mockRenderGridFog).not.toHaveBeenCalled();
    });

    it("sets fill style on context", () => {
      renderFog(
        { enabled: true, foggedCells: [{ col: 1, row: 1 }] },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#ff0000', fowOpacity: 0.9, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        {},
        false,
        null,
        { cellSize: 40 },
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(ctx.fillStyle).toBe('#ff0000');
    });

    it("restores globalAlpha after rendering", () => {
      ctx.globalAlpha = 0.5;

      renderFog(
        { enabled: true, foggedCells: [{ col: 1, row: 1 }] },
        { ctx, fogCanvas: null, width: 800, height: 600, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40, northDirection: 0 },
        { fowColor: '#000', fowOpacity: 0.8, fowBlurEnabled: false, fowBlurFactor: 0.08 },
        {},
        false,
        null,
        { cellSize: 40 },
        mockGeometry,
        'flat',
        mockGetCachedImage,
        mockRenderGridFog,
        mockRenderHexFog,
        mockOffsetToAxial,
        mockAxialToOffset
      );

      expect(ctx.globalAlpha).toBe(0.5);
    });
  });
});
