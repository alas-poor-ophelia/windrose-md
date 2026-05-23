/**
 * selectionRenderer Unit Tests
 *
 * Tests selection indicator rendering for text labels and objects.
 * Uses mocked canvas context and geometry to verify correct drawing calls.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  renderTextLabelSelection,
  renderTextLabelSelections,
  calculateHexObjectSelectionPosition,
  calculateGridObjectSelectionPosition,
  renderResizeOverlay,
  renderObjectSelectionRectangle,
  renderObjectSelection,
  renderObjectSelections,
  renderSelections,
} from "../../../../src/geometry/renderers/selectionRenderer";
import type { MapObject } from "#types/objects/object.types";
import type { TextLabel } from "#types/objects/note.types";
import type { IGeometry } from "#types/core/geometry.types";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    setLineDash: vi.fn(),
    strokeRect: vi.fn(),
    fillRect: vi.fn(),
    measureText: vi.fn(() => ({ width: 100 })),
  } as unknown as CanvasRenderingContext2D;
}

// Mock geometry
function createMockGeometry() {
  return {
    worldToScreen: vi.fn((worldX, worldY, offsetX, offsetY, zoom) => ({
      screenX: offsetX + worldX * zoom,
      screenY: offsetY + worldY * zoom,
    })),
    gridToScreen: vi.fn((x, y, offsetX, offsetY, zoom) => ({
      screenX: offsetX + x * 40 * zoom,
      screenY: offsetY + y * 40 * zoom,
    })),
  } as unknown as IGeometry;
}

// Mock hex geometry
function createMockHexGeometry() {
  return {
    hexToWorld: vi.fn((q, r) => ({
      worldX: q * 50 + (r % 2) * 25,
      worldY: r * 43.3,
    })),
  };
}

// Mock dependencies
function createMockDeps() {
  return {
    getFontCss: vi.fn((fontFace: string) => fontFace === 'mono' ? 'monospace' : 'sans-serif'),
    getObjectsInCell: vi.fn((_objects, _x, _y): MapObject[] => []),
    getSlotOffset: vi.fn((_slot, _count, _orientation) => ({ offsetX: 0, offsetY: 0 })),
    getMultiObjectScale: vi.fn((_count) => 0.6),
  };
}

describe("selectionRenderer", () => {
  let ctx: CanvasRenderingContext2D;
  let geometry: ReturnType<typeof createMockGeometry>;
  let hexGeometry: ReturnType<typeof createMockHexGeometry>;
  let deps: ReturnType<typeof createMockDeps>;

  beforeEach(() => {
    ctx = createMockContext();
    geometry = createMockGeometry();
    hexGeometry = createMockHexGeometry();
    deps = createMockDeps();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // renderTextLabelSelection
  // ===========================================================================

  describe("renderTextLabelSelection", () => {
    it("renders selection for text label", () => {
      const label = { id: '1', content: 'Test', position: { x: 100, y: 100 }, fontSize: 16 } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
      expect(geometry.worldToScreen).toHaveBeenCalledWith(100, 100, 0, 0, 1);
    });

    it("applies rotation transform", () => {
      const label = { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16, rotation: 45 } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      expect(ctx.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    });

    it("sets correct font based on fontFace", () => {
      const label = { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16, fontFace: 'mono' } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      expect(deps.getFontCss).toHaveBeenCalledWith('mono');
      expect(ctx.font).toContain('monospace');
    });

    it("draws dashed selection rectangle", () => {
      const label = { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      expect(ctx.setLineDash).toHaveBeenCalledWith([5, 3]);
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it("draws corner handles", () => {
      const label = { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      // Four corner handles
      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    });

    it("scales font size with zoom", () => {
      const label = { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 } as unknown as TextLabel;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 2, scaledSize: 40 };

      renderTextLabelSelection(ctx, label, geometry, context, deps.getFontCss);

      expect(ctx.font).toContain('32px'); // 16 * 2
    });
  });

  // ===========================================================================
  // renderTextLabelSelections
  // ===========================================================================

  describe("renderTextLabelSelections", () => {
    it("renders nothing when no text labels selected", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const textLabels = [{ id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 }] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelections(selectedItems, textLabels, context, geometry, deps.getFontCss);

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("renders nothing when textLabels is empty", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const textLabels: TextLabel[] = [];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelections(selectedItems, textLabels, context, geometry, deps.getFontCss);

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("renders selection for matching text label", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const textLabels = [
        { id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 },
        { id: '2', content: 'Other', position: { x: 50, y: 50 }, fontSize: 16 },
      ] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelections(selectedItems, textLabels, context, geometry, deps.getFontCss);

      expect(ctx.save).toHaveBeenCalledTimes(1);
      expect(geometry.worldToScreen).toHaveBeenCalledWith(0, 0, 0, 0, 1);
    });

    it("renders multiple selections", () => {
      const selectedItems = [
        { id: '1', type: 'text' as const },
        { id: '2', type: 'text' as const },
      ];
      const textLabels = [
        { id: '1', content: 'Test1', position: { x: 0, y: 0 }, fontSize: 16 },
        { id: '2', content: 'Test2', position: { x: 50, y: 50 }, fontSize: 16 },
      ] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderTextLabelSelections(selectedItems, textLabels, context, geometry, deps.getFontCss);

      expect(ctx.save).toHaveBeenCalledTimes(2);
    });
  });

  // ===========================================================================
  // calculateHexObjectSelectionPosition
  // ===========================================================================

  describe("calculateHexObjectSelectionPosition", () => {
    it("calculates position for single object in hex", () => {
      const object = { id: '1', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const allObjects = [object];
      const context = { ctx, offsetX: 10, offsetY: 20, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object]);

      const result = calculateHexObjectSelectionPosition(
        object, allObjects, hexGeometry, context, 'flat', deps
      );

      expect(hexGeometry.hexToWorld).toHaveBeenCalledWith(2, 3);
      expect(result.objectWidth).toBe(40);
      expect(result.objectHeight).toBe(40);
    });

    it("applies multi-object scaling", () => {
      const object1 = { id: '1', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const object2 = { id: '2', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const allObjects = [object1, object2];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object1, object2]);

      const result = calculateHexObjectSelectionPosition(
        object1, allObjects, hexGeometry, context, 'flat', deps
      );

      expect(deps.getMultiObjectScale).toHaveBeenCalledWith(2);
      expect(result.objectWidth).toBe(40 * 0.6); // multiScale = 0.6
    });

    it("applies slot offset for multi-object cells", () => {
      const object1 = { id: '1', type: 'char', position: { x: 2, y: 3 }, slot: 0 } as unknown as MapObject;
      const object2 = { id: '2', type: 'char', position: { x: 2, y: 3 }, slot: 1 } as unknown as MapObject;
      const allObjects = [object1, object2];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object1, object2]);
      deps.getSlotOffset.mockReturnValue({ offsetX: 0.2, offsetY: 0 });

      calculateHexObjectSelectionPosition(
        object2, allObjects, hexGeometry, context, 'flat', deps
      );

      expect(deps.getSlotOffset).toHaveBeenCalledWith(1, 2, 'flat');
    });

    it("applies alignment offset", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 }, alignment: 'north' as const } as unknown as MapObject;
      const allObjects = [object];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object]);

      const resultNorth = calculateHexObjectSelectionPosition(
        object, allObjects, hexGeometry, context, 'flat', deps
      );

      const objectCenter = { id: '2', type: 'char', position: { x: 0, y: 0 }, alignment: 'center' as const } as unknown as MapObject;
      deps.getObjectsInCell.mockReturnValue([objectCenter]);
      const resultCenter = calculateHexObjectSelectionPosition(
        objectCenter, [objectCenter], hexGeometry, context, 'flat', deps
      );

      // North alignment shifts up by halfCell
      expect(resultNorth.screenY).toBeLessThan(resultCenter.screenY);
    });

    it("handles custom size objects", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 }, size: { width: 2, height: 3 } } as unknown as MapObject;
      const allObjects = [object];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object]);

      const result = calculateHexObjectSelectionPosition(
        object, allObjects, hexGeometry, context, 'flat', deps
      );

      expect(result.objectWidth).toBe(80);
      expect(result.objectHeight).toBe(120);
    });
  });

  // ===========================================================================
  // calculateGridObjectSelectionPosition
  // ===========================================================================

  describe("calculateGridObjectSelectionPosition", () => {
    it("calculates position for grid object", () => {
      const object = { id: '1', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const context = { ctx, offsetX: 10, offsetY: 20, zoom: 1, scaledSize: 40 };

      const result = calculateGridObjectSelectionPosition(object, geometry, context);

      expect(geometry.gridToScreen).toHaveBeenCalledWith(2, 3, 10, 20, 1);
      expect(result.objectWidth).toBe(40);
      expect(result.objectHeight).toBe(40);
    });

    it("applies alignment offset", () => {
      const objectNorth = { id: '1', type: 'char', position: { x: 0, y: 0 }, alignment: 'north' as const } as unknown as MapObject;
      const objectCenter = { id: '2', type: 'char', position: { x: 0, y: 0 }, alignment: 'center' as const } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const resultNorth = calculateGridObjectSelectionPosition(objectNorth, geometry, context);
      const resultCenter = calculateGridObjectSelectionPosition(objectCenter, geometry, context);

      expect(resultNorth.screenY).toBeLessThan(resultCenter.screenY);
    });

    it("handles custom size objects", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 }, size: { width: 2, height: 2 } } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      const result = calculateGridObjectSelectionPosition(object, geometry, context);

      expect(result.objectWidth).toBe(80);
      expect(result.objectHeight).toBe(80);
    });

    it("scales with zoom", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 } } as unknown as MapObject;
      const context1 = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      const context2 = { ctx, offsetX: 0, offsetY: 0, zoom: 2, scaledSize: 80 };

      const result1 = calculateGridObjectSelectionPosition(object, geometry, context1);
      const result2 = calculateGridObjectSelectionPosition(object, geometry, context2);

      expect(result2.objectWidth).toBe(result1.objectWidth * 2);
    });
  });

  // ===========================================================================
  // renderResizeOverlay
  // ===========================================================================

  describe("renderResizeOverlay", () => {
    it("renders overlay for 1x1 object", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 } } as unknown as MapObject;

      renderResizeOverlay(ctx, object, 100, 100, 40, 40);

      expect(ctx.fillRect).toHaveBeenCalledTimes(1);
    });

    it("renders overlays for each cell of multi-cell object", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 }, size: { width: 2, height: 3 } } as unknown as MapObject;

      renderResizeOverlay(ctx, object, 100, 100, 40, 40);

      expect(ctx.fillRect).toHaveBeenCalledTimes(6); // 2 * 3
    });

    it("sets transparent blue fill style", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 } } as unknown as MapObject;

      renderResizeOverlay(ctx, object, 100, 100, 40, 40);

      expect(ctx.fillStyle).toBe('rgba(74, 158, 255, 0.15)');
    });
  });

  // ===========================================================================
  // renderObjectSelectionRectangle
  // ===========================================================================

  describe("renderObjectSelectionRectangle", () => {
    it("draws dashed selection rectangle", () => {
      renderObjectSelectionRectangle(ctx, 100, 100, 40, 40, false);

      expect(ctx.setLineDash).toHaveBeenCalledWith([5, 3]);
      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it("draws four corner handles", () => {
      renderObjectSelectionRectangle(ctx, 100, 100, 40, 40, false);

      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    });

    it("uses larger handles in resize mode", () => {
      const fillRectCalls: number[][] = [];
      (ctx.fillRect as ReturnType<typeof vi.fn>).mockImplementation(
        (x: number, y: number, w: number, h: number) => {
          fillRectCalls.push([x, y, w, h]);
        }
      );

      renderObjectSelectionRectangle(ctx, 100, 100, 40, 40, true);

      // Resize mode uses 14px handles vs 8px normal
      expect(fillRectCalls[0][2]).toBe(14);
    });

    it("uses smaller handles in normal mode", () => {
      const fillRectCalls: number[][] = [];
      (ctx.fillRect as ReturnType<typeof vi.fn>).mockImplementation(
        (x: number, y: number, w: number, h: number) => {
          fillRectCalls.push([x, y, w, h]);
        }
      );

      renderObjectSelectionRectangle(ctx, 100, 100, 40, 40, false);

      expect(fillRectCalls[0][2]).toBe(8);
    });

    it("sets selection color for stroke and fill", () => {
      renderObjectSelectionRectangle(ctx, 100, 100, 40, 40, false);

      expect(ctx.strokeStyle).toBe('#4a9eff');
      expect(ctx.fillStyle).toBe('#4a9eff');
    });
  });

  // ===========================================================================
  // renderObjectSelection
  // ===========================================================================

  describe("renderObjectSelection", () => {
    it("uses hex position calculation for hex maps", () => {
      const object = { id: '1', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue([object]);

      renderObjectSelection(
        ctx, object, [object], geometry, hexGeometry, context,
        true, false, 'flat', deps
      );

      expect(hexGeometry.hexToWorld).toHaveBeenCalled();
      expect(geometry.gridToScreen).not.toHaveBeenCalled();
    });

    it("uses grid position calculation for grid maps", () => {
      const object = { id: '1', type: 'char', position: { x: 2, y: 3 } } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelection(
        ctx, object, [object], geometry, null, context,
        false, false, 'flat', deps
      );

      expect(geometry.gridToScreen).toHaveBeenCalled();
    });

    it("renders resize overlay in resize mode", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 } } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelection(
        ctx, object, [object], geometry, null, context,
        false, true, 'flat', deps
      );

      // fillRect called for: 1 resize overlay + 4 corner handles = 5
      expect(ctx.fillRect).toHaveBeenCalledTimes(5);
    });

    it("skips resize overlay when not in resize mode", () => {
      const object = { id: '1', type: 'char', position: { x: 0, y: 0 } } as unknown as MapObject;
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelection(
        ctx, object, [object], geometry, null, context,
        false, false, 'flat', deps
      );

      // Only 4 corner handles
      expect(ctx.fillRect).toHaveBeenCalledTimes(4);
    });
  });

  // ===========================================================================
  // renderObjectSelections
  // ===========================================================================

  describe("renderObjectSelections", () => {
    it("renders nothing when no objects selected", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const objects = [{ id: '1', type: 'char', position: { x: 0, y: 0 } }] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelections(
        selectedItems, objects, context, geometry, null,
        false, false, 'flat', deps
      );

      expect(ctx.strokeRect).not.toHaveBeenCalled();
    });

    it("renders nothing when objects array is empty", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const objects: MapObject[] = [];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelections(
        selectedItems, objects, context, geometry, null,
        false, false, 'flat', deps
      );

      expect(ctx.strokeRect).not.toHaveBeenCalled();
    });

    it("renders selection for matching object", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const objects = [
        { id: '1', type: 'char', position: { x: 0, y: 0 } },
        { id: '2', type: 'char', position: { x: 1, y: 1 } },
      ] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelections(
        selectedItems, objects, context, geometry, null,
        false, false, 'flat', deps
      );

      expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
    });

    it("renders multiple selections", () => {
      const selectedItems = [
        { id: '1', type: 'object' as const },
        { id: '2', type: 'object' as const },
      ];
      const objects = [
        { id: '1', type: 'char', position: { x: 0, y: 0 } },
        { id: '2', type: 'char', position: { x: 1, y: 1 } },
      ] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelections(
        selectedItems, objects, context, geometry, null,
        false, false, 'flat', deps
      );

      expect(ctx.strokeRect).toHaveBeenCalledTimes(2);
    });

    it("only shows resize overlay for single selection", () => {
      const selectedItems = [
        { id: '1', type: 'object' as const },
        { id: '2', type: 'object' as const },
      ];
      const objects = [
        { id: '1', type: 'char', position: { x: 0, y: 0 } },
        { id: '2', type: 'char', position: { x: 1, y: 1 } },
      ] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderObjectSelections(
        selectedItems, objects, context, geometry, null,
        false, true, 'flat', deps
      );

      // No resize overlays since 2 items selected
      // 4 handles per object * 2 = 8
      expect(ctx.fillRect).toHaveBeenCalledTimes(8);
    });
  });

  // ===========================================================================
  // renderSelections (integration)
  // ===========================================================================

  describe("renderSelections", () => {
    it("does nothing when no items selected", () => {
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        [], undefined, undefined, context, geometry, null,
        false, false, 'flat', false, {}, deps
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("does nothing when showCoordinates is true", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const textLabels = [{ id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 }] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, textLabels, undefined, context, geometry, null,
        false, false, 'flat', true, {}, deps
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("renders text label selections when visibility enabled", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const textLabels = [{ id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 }] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, textLabels, undefined, context, geometry, null,
        false, false, 'flat', false, { textLabels: true }, deps
      );

      expect(ctx.save).toHaveBeenCalled();
    });

    it("skips text labels when visibility disabled", () => {
      const selectedItems = [{ id: '1', type: 'text' as const }];
      const textLabels = [{ id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 }] as unknown as TextLabel[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, textLabels, undefined, context, geometry, null,
        false, false, 'flat', false, { textLabels: false }, deps
      );

      expect(ctx.save).not.toHaveBeenCalled();
    });

    it("renders object selections when visibility enabled", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const objects = [{ id: '1', type: 'char', position: { x: 0, y: 0 } }] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, undefined, objects, context, geometry, null,
        false, false, 'flat', false, { objects: true }, deps
      );

      expect(ctx.strokeRect).toHaveBeenCalled();
    });

    it("skips objects when visibility disabled", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const objects = [{ id: '1', type: 'char', position: { x: 0, y: 0 } }] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, undefined, objects, context, geometry, null,
        false, false, 'flat', false, { objects: false }, deps
      );

      expect(ctx.strokeRect).not.toHaveBeenCalled();
    });

    it("renders both text and object selections", () => {
      const selectedItems = [
        { id: '1', type: 'text' as const },
        { id: '2', type: 'object' as const },
      ];
      const textLabels = [{ id: '1', content: 'Test', position: { x: 0, y: 0 }, fontSize: 16 }] as unknown as TextLabel[];
      const objects = [{ id: '2', type: 'char', position: { x: 0, y: 0 } }] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };

      renderSelections(
        selectedItems, textLabels, objects, context, geometry, null,
        false, false, 'flat', false, {}, deps
      );

      // Text label selection + object selection
      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.strokeRect).toHaveBeenCalledTimes(2); // text + object
    });

    it("passes isHexMap and hexGeometry for hex maps", () => {
      const selectedItems = [{ id: '1', type: 'object' as const }];
      const objects = [{ id: '1', type: 'char', position: { x: 2, y: 3 } }] as unknown as MapObject[];
      const context = { ctx, offsetX: 0, offsetY: 0, zoom: 1, scaledSize: 40 };
      deps.getObjectsInCell.mockReturnValue(objects);

      renderSelections(
        selectedItems, undefined, objects, context, geometry, hexGeometry,
        true, false, 'flat', false, {}, deps
      );

      expect(hexGeometry.hexToWorld).toHaveBeenCalled();
    });
  });
});
