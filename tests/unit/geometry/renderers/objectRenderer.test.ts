/**
 * objectRenderer Unit Tests
 *
 * Tests object rendering functions.
 * Uses mocked canvas context, geometry, and dependencies.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  isObjectUnderFog,
  calculateObjectPosition,
  renderSingleObject,
  renderObjectBadges,
  renderObjects,
} from "../../../../src/geometry/renderers/objectRenderer";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    textAlign: '',
    textBaseline: '',
    font: '',
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// Mock HTMLImageElement for image object tests
function createMockImage(width = 100, height = 100, complete = true): HTMLImageElement {
  return {
    naturalWidth: width,
    naturalHeight: height,
    complete,
  } as unknown as HTMLImageElement;
}

// Mock geometry
function createMockGeometry() {
  return {
    toOffsetCoords: vi.fn((x: number, y: number) => ({ col: x, row: y })),
    gridToScreen: vi.fn((x: number, y: number, offsetX: number, offsetY: number, zoom: number) => ({
      screenX: x * 40 * zoom + offsetX,
      screenY: y * 40 * zoom + offsetY,
    })),
    worldToScreen: vi.fn((worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => ({
      screenX: worldX * zoom + offsetX,
      screenY: worldY * zoom + offsetY,
    })),
  };
}

// Mock object type
function createMockObjectType(id = 'test') {
  return { id, char: 'T' };
}

// Mock dependencies
function createMockDeps() {
  return {
    getObjectType: vi.fn(() => createMockObjectType()),
    getRenderChar: vi.fn(() => ({ char: 'T', isIcon: false })),
    isCellFogged: vi.fn(() => false),
    getObjectsInCell: vi.fn((objects: unknown[], x: number, y: number) =>
      (objects as Array<{ position: { x: number; y: number } }>).filter(o => o.position.x === x && o.position.y === y)
    ),
    getSlotOffset: vi.fn(() => ({ offsetX: 0, offsetY: 0 })),
    getMultiObjectScale: vi.fn(() => 0.6),
    renderNoteLinkBadge: vi.fn(),
    renderTooltipIndicator: vi.fn(),
    renderObjectLinkIndicator: vi.fn(),
  };
}

describe("objectRenderer", () => {
  let ctx: CanvasRenderingContext2D;
  let geometry: ReturnType<typeof createMockGeometry>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockContext();
    geometry = createMockGeometry();
    deps = createMockDeps();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // isObjectUnderFog
  // ===========================================================================

  describe("isObjectUnderFog", () => {
    it("returns false when fog disabled", () => {
      const obj = { id: '1', type: 'test', position: { x: 1, y: 1 } };
      const layer = { objects: [obj] };

      const result = isObjectUnderFog(obj, layer, geometry, false, deps.isCellFogged);

      expect(result).toBe(false);
      expect(deps.isCellFogged).not.toHaveBeenCalled();
    });

    it("checks single cell for hex maps", () => {
      const obj = { id: '1', type: 'test', position: { x: 2, y: 3 } };
      const layer = { objects: [obj], fogOfWar: { enabled: true } };
      deps.isCellFogged.mockReturnValue(true);

      const result = isObjectUnderFog(obj, layer, geometry, true, deps.isCellFogged);

      expect(result).toBe(true);
      expect(deps.isCellFogged).toHaveBeenCalledTimes(1);
      expect(deps.isCellFogged).toHaveBeenCalledWith(layer, 2, 3);
    });

    it("checks all cells for grid maps with multi-cell objects", () => {
      const obj = { id: '1', type: 'test', position: { x: 1, y: 1 }, size: { width: 2, height: 2 } };
      const layer = { objects: [obj], fogOfWar: { enabled: true } };
      deps.isCellFogged.mockReturnValue(false);

      const result = isObjectUnderFog(obj, layer, geometry, false, deps.isCellFogged);

      expect(result).toBe(false);
      // Should check all 4 cells (2x2)
      expect(deps.isCellFogged).toHaveBeenCalledTimes(4);
    });

    it("returns true if any cell is fogged for grid maps", () => {
      const obj = { id: '1', type: 'test', position: { x: 1, y: 1 }, size: { width: 2, height: 2 } };
      const layer = { objects: [obj], fogOfWar: { enabled: true } };
      // First 3 cells not fogged, 4th is fogged
      deps.isCellFogged.mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(false)
        .mockReturnValueOnce(true);

      const result = isObjectUnderFog(obj, layer, geometry, false, deps.isCellFogged);

      expect(result).toBe(true);
    });

    it("uses default size of 1x1", () => {
      const obj = { id: '1', type: 'test', position: { x: 1, y: 1 } }; // No size specified
      const layer = { objects: [obj], fogOfWar: { enabled: true } };

      isObjectUnderFog(obj, layer, geometry, false, deps.isCellFogged);

      // Should only check one cell
      expect(deps.isCellFogged).toHaveBeenCalledTimes(1);
    });
  });

  // ===========================================================================
  // calculateObjectPosition
  // ===========================================================================

  describe("calculateObjectPosition", () => {
    it("calculates basic screen position", () => {
      const obj = { id: '1', type: 'test', position: { x: 2, y: 3 } };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      expect(geometry.gridToScreen).toHaveBeenCalledWith(2, 3, 0, 0, 1);
      expect(result.objectWidth).toBe(40);
      expect(result.objectHeight).toBe(40);
    });

    it("applies object size to dimensions", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, size: { width: 2, height: 3 } };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      expect(result.objectWidth).toBe(80); // 2 * 40
      expect(result.objectHeight).toBe(120); // 3 * 40
    });

    it("applies multi-object scaling for hex maps", () => {
      const obj1 = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const obj2 = { id: '2', type: 'test', position: { x: 0, y: 0 } };
      const allObjects = [obj1, obj2];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj1 as any, allObjects as any, geometry, context, true, 'flat', deps as any);

      expect(deps.getMultiObjectScale).toHaveBeenCalledWith(2);
      expect(deps.getSlotOffset).toHaveBeenCalled();
      // Width should be scaled down (0.6 factor)
      expect(result.objectWidth).toBe(40 * 0.6);
    });

    it("applies alignment offset for north", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, alignment: 'north' as const };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      // Should offset Y by -halfCell
      expect(result.screenY).toBeLessThan(0);
    });

    it("applies alignment offset for south", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, alignment: 'south' as const };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      // Should offset Y by +halfCell
      expect(result.screenY).toBeGreaterThan(0);
    });

    it("applies alignment offset for east", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, alignment: 'east' as const };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      // Should offset X by +halfCell
      expect(result.screenX).toBeGreaterThan(0);
    });

    it("applies alignment offset for west", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, alignment: 'west' as const };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateObjectPosition(obj as any, [obj] as any, geometry, context, false, 'flat', deps as any);

      // Should offset X by -halfCell
      expect(result.screenX).toBeLessThan(0);
    });
  });

  // ===========================================================================
  // renderSingleObject
  // ===========================================================================

  describe("renderSingleObject", () => {
    it("renders object text", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.strokeText).toHaveBeenCalled();
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it("applies rotation when specified", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, rotation: 45 };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.rotate).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("does not apply rotation when 0", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, rotation: 0 };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.save).not.toHaveBeenCalled();
      expect(ctx.rotate).not.toHaveBeenCalled();
    });

    it("uses icon font for icons", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
      deps.getRenderChar.mockReturnValue({ char: '\ue800', isIcon: true });

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.font).toContain('rpgawesome');
    });

    it("uses emoji font for non-icons", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
      deps.getRenderChar.mockReturnValue({ char: '🏰', isIcon: false });

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.font).toContain('Noto Emoji');
    });

    it("applies object scale", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, scale: 1.5 };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      // Font size should be scaled by 1.5
      expect(ctx.font).toMatch(/\d+px/);
    });

    it("uses object color for fill", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, color: '#ff0000' };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.fillStyle).toBe('#ff0000');
    });

    it("uses default white color when not specified", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const objType = createMockObjectType();
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

      expect(ctx.fillStyle).toBe('#ffffff');
    });

    // === Image Object Rendering ===

    describe("image objects", () => {
      it("renders image when getRenderChar returns isImage: true", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        expect(ctx.drawImage).toHaveBeenCalled();
      });

      it("uses getCachedImage to fetch the image", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'vault/images/test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        expect(getCachedImage).toHaveBeenCalledWith('vault/images/test.png');
      });

      it("skips font rendering for image objects", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        expect(ctx.fillText).not.toHaveBeenCalled();
        expect(ctx.strokeText).not.toHaveBeenCalled();
      });

      it("applies rotation to image objects", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, rotation: 45 };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        expect(ctx.save).toHaveBeenCalled();
        expect(ctx.rotate).toHaveBeenCalled();
        expect(ctx.restore).toHaveBeenCalled();
      });

      it("applies scale to image objects", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, scale: 0.5 };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        // Check drawImage was called with scaled dimensions
        const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
        const drawWidth = drawCall[3];
        const drawHeight = drawCall[4];

        // Base size is min(40,40) * 0.9 = 36, scaled by 0.5 = 18
        expect(drawWidth).toBe(18);
        expect(drawHeight).toBe(18);
      });

      it("falls back to font rendering when image not loaded", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage(100, 100, false); // complete = false
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '?', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        // Should fall back to font rendering
        expect(ctx.drawImage).not.toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
      });

      it("falls back to font rendering when getCachedImage is undefined", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

        deps.getRenderChar.mockReturnValue({ char: '?', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        // No getCachedImage provided
        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar);

        expect(ctx.drawImage).not.toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
      });

      it("falls back to font rendering when getCachedImage returns null", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const getCachedImage = vi.fn(() => null);

        deps.getRenderChar.mockReturnValue({ char: '?', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        expect(ctx.drawImage).not.toHaveBeenCalled();
        expect(ctx.fillText).toHaveBeenCalled();
      });

      it("centers image within object bounds", () => {
        const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
        const objType = createMockObjectType();
        const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };
        const mockImage = createMockImage();
        const getCachedImage = vi.fn(() => mockImage);

        deps.getRenderChar.mockReturnValue({ char: '', isIcon: false, isImage: true, imagePath: 'test.png' } as any);

        renderSingleObject(ctx, obj, objType, position, 40, deps.getRenderChar, getCachedImage);

        const drawCall = vi.mocked(ctx.drawImage).mock.calls[0];
        const drawX = drawCall[1];
        const drawY = drawCall[2];
        const drawWidth = drawCall[3];

        // Center of object is at (100 + 40/2, 100 + 40/2) = (120, 120)
        // Image size is 36 (40 * 0.9), so draw at 120 - 18 = 102
        expect(drawX).toBe(102);
        expect(drawY).toBe(102);
        expect(drawWidth).toBe(36);
      });
    });
  });

  // ===========================================================================
  // renderObjectBadges
  // ===========================================================================

  describe("renderObjectBadges", () => {
    it("renders note link badge when linkedNote exists", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, linkedNote: 'some-note' };
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderObjectBadges(ctx, obj, position, 40, deps);

      expect(deps.renderNoteLinkBadge).toHaveBeenCalled();
    });

    it("does not render note link badge for note_pin type", () => {
      const obj = { id: '1', type: 'note_pin', position: { x: 0, y: 0 }, linkedNote: 'some-note' };
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderObjectBadges(ctx, obj, position, 40, deps);

      expect(deps.renderNoteLinkBadge).not.toHaveBeenCalled();
    });

    it("renders tooltip indicator when customTooltip exists", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, customTooltip: 'tooltip text' };
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderObjectBadges(ctx, obj, position, 40, deps);

      expect(deps.renderTooltipIndicator).toHaveBeenCalled();
    });

    it("renders object link indicator when linkedObject exists", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 }, linkedObject: 'other-obj' };
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderObjectBadges(ctx, obj, position, 40, deps);

      expect(deps.renderObjectLinkIndicator).toHaveBeenCalled();
    });

    it("does not render any badges when no special properties", () => {
      const obj = { id: '1', type: 'test', position: { x: 0, y: 0 } };
      const position = { screenX: 100, screenY: 100, objectWidth: 40, objectHeight: 40 };

      renderObjectBadges(ctx, obj, position, 40, deps);

      expect(deps.renderNoteLinkBadge).not.toHaveBeenCalled();
      expect(deps.renderTooltipIndicator).not.toHaveBeenCalled();
      expect(deps.renderObjectLinkIndicator).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // renderObjects (integration)
  // ===========================================================================

  describe("renderObjects", () => {
    it("does nothing when no objects", () => {
      const layer = { objects: [] as unknown[] };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjects(layer as any, context, geometry, false, 'flat', deps as any);

      expect(deps.getObjectType).not.toHaveBeenCalled();
    });

    it("renders all visible objects", () => {
      const layer = {
        objects: [
          { id: '1', type: 'test', position: { x: 0, y: 0 } },
          { id: '2', type: 'test', position: { x: 1, y: 0 } },
        ]
      };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjects(layer as any, context, geometry, false, 'flat', deps as any);

      expect(ctx.fillText).toHaveBeenCalledTimes(2);
    });

    it("skips objects with unknown type", () => {
      const layer = {
        objects: [
          { id: '1', type: 'unknown', position: { x: 0, y: 0 } },
        ]
      };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectType.mockReturnValue(null as any);

      renderObjects(layer as any, context, geometry, false, 'flat', deps as any);

      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("skips objects under fog", () => {
      const layer = {
        objects: [{ id: '1', type: 'test', position: { x: 0, y: 0 } }],
        fogOfWar: { enabled: true }
      };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.isCellFogged.mockReturnValue(true);

      renderObjects(layer as any, context, geometry, false, 'flat', deps as any);

      expect(ctx.fillText).not.toHaveBeenCalled();
    });

    it("sets text alignment before rendering", () => {
      const layer = {
        objects: [{ id: '1', type: 'test', position: { x: 0, y: 0 } }]
      };
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjects(layer as any, context, geometry, false, 'flat', deps as any);

      expect(ctx.textAlign).toBe('center');
      expect(ctx.textBaseline).toBe('middle');
    });
  });
});
