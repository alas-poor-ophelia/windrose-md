/**
 * textLabelRenderer Unit Tests
 *
 * Tests text label rendering functions.
 * Uses mocked canvas context to verify correct drawing operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  renderTextLabel,
  renderTextLabels
} from "../../../../src/geometry/renderers/textLabelRenderer";

import type { TextLabel } from "../../../../types/objects/note.types";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: 'miter',
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    strokeText: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// Mock getFontCss
const mockGetFontCss = vi.fn((fontFace: string) => {
  const fonts: Record<string, string> = {
    'sans': 'Arial, sans-serif',
    'serif': 'Georgia, serif',
    'mono': 'Courier New, monospace',
  };
  return fonts[fontFace] || 'Arial, sans-serif';
});

// Mock geometry
const mockGeometry = {
  worldToScreen: vi.fn((x: number, y: number, offsetX: number, offsetY: number, zoom: number) => ({
    screenX: x * zoom + offsetX,
    screenY: y * zoom + offsetY,
  })),
};

// Sample text label
const createLabel = (overrides: Partial<TextLabel> = {}): TextLabel => ({
  id: 'label-1',
  content: 'Test Label',
  position: { x: 100, y: 50 },
  fontSize: 16,
  color: '#ff0000',
  fontFace: 'sans',
  rotation: 0,
  ...overrides,
});

describe("textLabelRenderer", () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockContext();
    vi.clearAllMocks();
  });

  // ===========================================================================
  // renderTextLabel
  // ===========================================================================

  describe("renderTextLabel", () => {
    it("saves and restores canvas state", () => {
      const label = createLabel();
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.restore).toHaveBeenCalled();
    });

    it("translates to screen position", () => {
      const label = createLabel();
      renderTextLabel(label, { screenX: 200, screenY: 150 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.translate).toHaveBeenCalledWith(200, 150);
    });

    it("applies rotation when specified", () => {
      const label = createLabel({ rotation: 45 });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.rotate).toHaveBeenCalledWith((45 * Math.PI) / 180);
    });

    it("does not rotate when rotation is 0", () => {
      const label = createLabel({ rotation: 0 });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.rotate).toHaveBeenCalledWith(0);
    });

    it("scales font size by zoom", () => {
      const label = createLabel({ fontSize: 16 });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 2, getFontCss: mockGetFontCss });

      expect(ctx.font).toContain('32px');
    });

    it("uses getFontCss to resolve font family", () => {
      const label = createLabel({ fontFace: 'serif' });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(mockGetFontCss).toHaveBeenCalledWith('serif');
      expect(ctx.font).toContain('Georgia');
    });

    it("defaults to sans font when fontFace is not specified", () => {
      const label = createLabel();
      delete (label as Partial<TextLabel>).fontFace;
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(mockGetFontCss).toHaveBeenCalledWith('sans');
    });

    it("draws stroke outline before fill", () => {
      const label = createLabel();
      const callOrder: string[] = [];

      (ctx.strokeText as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('stroke'));
      (ctx.fillText as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('fill'));

      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(callOrder).toEqual(['stroke', 'fill']);
    });

    it("uses black stroke for outline", () => {
      const label = createLabel();
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.strokeStyle).toBe('#000000');
    });

    it("uses label color for fill", () => {
      const label = createLabel({ color: '#00ff00' });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.fillStyle).toBe('#00ff00');
    });

    it("defaults to white fill when color not specified", () => {
      const label = createLabel();
      delete (label as Partial<TextLabel>).color;
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.fillStyle).toBe('#ffffff');
    });

    it("draws text at origin (after translate)", () => {
      const label = createLabel({ content: 'Hello World' });
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.strokeText).toHaveBeenCalledWith('Hello World', 0, 0);
      expect(ctx.fillText).toHaveBeenCalledWith('Hello World', 0, 0);
    });

    it("sets text alignment to center", () => {
      const label = createLabel();
      renderTextLabel(label, { screenX: 100, screenY: 50 }, { ctx, zoom: 1, getFontCss: mockGetFontCss });

      expect(ctx.textAlign).toBe('center');
      expect(ctx.textBaseline).toBe('middle');
    });
  });

  // ===========================================================================
  // renderTextLabels
  // ===========================================================================

  describe("renderTextLabels", () => {
    it("renders all labels in array", () => {
      const labels = [
        createLabel({ id: '1', content: 'Label 1', position: { x: 0, y: 0 } }),
        createLabel({ id: '2', content: 'Label 2', position: { x: 100, y: 100 } }),
        createLabel({ id: '3', content: 'Label 3', position: { x: 200, y: 200 } }),
      ];

      renderTextLabels(
        labels,
        { ctx, zoom: 1, getFontCss: mockGetFontCss },
        mockGeometry,
        { offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.fillText).toHaveBeenCalledTimes(3);
      expect(ctx.fillText).toHaveBeenCalledWith('Label 1', 0, 0);
      expect(ctx.fillText).toHaveBeenCalledWith('Label 2', 0, 0);
      expect(ctx.fillText).toHaveBeenCalledWith('Label 3', 0, 0);
    });

    it("converts world coordinates to screen coordinates", () => {
      const labels = [
        createLabel({ position: { x: 50, y: 25 } }),
      ];

      renderTextLabels(
        labels,
        { ctx, zoom: 2, getFontCss: mockGetFontCss },
        mockGeometry,
        { offsetX: 10, offsetY: 20, zoom: 2 }
      );

      expect(mockGeometry.worldToScreen).toHaveBeenCalledWith(50, 25, 10, 20, 2);
    });

    it("handles empty labels array", () => {
      renderTextLabels(
        [],
        { ctx, zoom: 1, getFontCss: mockGetFontCss },
        mockGeometry,
        { offsetX: 0, offsetY: 0, zoom: 1 }
      );

      expect(ctx.fillText).not.toHaveBeenCalled();
    });
  });
});
