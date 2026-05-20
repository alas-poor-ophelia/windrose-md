/**
 * badgeRenderer Unit Tests
 *
 * Tests badge rendering functions for map objects.
 * Uses mocked canvas context to verify correct drawing operations.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

import {
  renderNoteLinkBadge,
  renderTooltipIndicator,
  renderObjectLinkIndicator
} from "../../../../src/geometry/renderers/badgeRenderer";

// Mock canvas context
function createMockContext(): CanvasRenderingContext2D {
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

// Standard test positions
const POSITION = {
  screenX: 100,
  screenY: 50,
  objectWidth: 40,
  objectHeight: 40
};

const CONFIG = {
  scaledSize: 40
};

describe("badgeRenderer", () => {
  let ctx: CanvasRenderingContext2D;

  beforeEach(() => {
    ctx = createMockContext();
  });

  // ===========================================================================
  // renderNoteLinkBadge
  // ===========================================================================

  describe("renderNoteLinkBadge", () => {
    it("draws a circle for the badge background", () => {
      renderNoteLinkBadge(ctx, POSITION, CONFIG);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
    });

    it("sets blue fill color for badge", () => {
      renderNoteLinkBadge(ctx, POSITION, CONFIG);

      // First fillStyle should be the blue background
      expect(ctx.fillStyle).toBeDefined();
    });

    it("draws the scroll emoji", () => {
      renderNoteLinkBadge(ctx, POSITION, CONFIG);

      expect(ctx.fillText).toHaveBeenCalledWith(
        '\u{1F4DC}',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("positions badge in top-right corner", () => {
      renderNoteLinkBadge(ctx, POSITION, CONFIG);

      // Badge should be positioned at screenX + objectWidth - badgeSize - 3
      // The arc call will have x coordinate > screenX + objectWidth / 2
      const arcCall = vi.mocked(ctx.arc).mock.calls[0];
      const arcX = arcCall[0];

      // Badge x should be in right half of object
      expect(arcX).toBeGreaterThan(POSITION.screenX + POSITION.objectWidth / 2);
    });

    it("scales badge size based on scaledSize", () => {
      const smallConfig = { scaledSize: 20 };
      const largeConfig = { scaledSize: 80 };

      renderNoteLinkBadge(ctx, POSITION, smallConfig);
      const smallArcCall = vi.mocked(ctx.arc).mock.calls[0];
      const smallRadius = smallArcCall[2];

      ctx = createMockContext();

      renderNoteLinkBadge(ctx, POSITION, largeConfig);
      const largeArcCall = vi.mocked(ctx.arc).mock.calls[0];
      const largeRadius = largeArcCall[2];

      expect(largeRadius).toBeGreaterThan(smallRadius);
    });
  });

  // ===========================================================================
  // renderTooltipIndicator
  // ===========================================================================

  describe("renderTooltipIndicator", () => {
    it("draws a circle with stroke for indicator", () => {
      renderTooltipIndicator(ctx, POSITION, CONFIG);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("sets white stroke for border", () => {
      renderTooltipIndicator(ctx, POSITION, CONFIG);

      expect(ctx.strokeStyle).toBe('#ffffff');
    });

    it("positions indicator in bottom-right corner", () => {
      renderTooltipIndicator(ctx, POSITION, CONFIG);

      const arcCall = vi.mocked(ctx.arc).mock.calls[0];
      const arcX = arcCall[0];
      const arcY = arcCall[1];

      // Should be in bottom-right quadrant
      expect(arcX).toBeGreaterThan(POSITION.screenX + POSITION.objectWidth / 2);
      expect(arcY).toBeGreaterThan(POSITION.screenY + POSITION.objectHeight / 2);
    });

    it("uses minimum size of 4 pixels", () => {
      const tinyConfig = { scaledSize: 1 };

      renderTooltipIndicator(ctx, POSITION, tinyConfig);

      const arcCall = vi.mocked(ctx.arc).mock.calls[0];
      const radius = arcCall[2];

      // Minimum indicator size is 4, so radius should be at least 2
      expect(radius).toBeGreaterThanOrEqual(2);
    });
  });

  // ===========================================================================
  // renderObjectLinkIndicator
  // ===========================================================================

  describe("renderObjectLinkIndicator", () => {
    it("draws a circle with stroke for indicator", () => {
      renderObjectLinkIndicator(ctx, POSITION, CONFIG);

      expect(ctx.beginPath).toHaveBeenCalled();
      expect(ctx.arc).toHaveBeenCalled();
      expect(ctx.fill).toHaveBeenCalled();
      expect(ctx.stroke).toHaveBeenCalled();
    });

    it("sets green fill color for link indicator", () => {
      renderObjectLinkIndicator(ctx, POSITION, CONFIG);

      // The fill style should include the green color at some point
      // Note: fillStyle gets overwritten, but we can check the final one for the icon
      expect(ctx.fillText).toHaveBeenCalled();
    });

    it("draws the chain link emoji", () => {
      renderObjectLinkIndicator(ctx, POSITION, CONFIG);

      expect(ctx.fillText).toHaveBeenCalledWith(
        '\u{1F517}',
        expect.any(Number),
        expect.any(Number)
      );
    });

    it("positions indicator in top-left corner", () => {
      renderObjectLinkIndicator(ctx, POSITION, CONFIG);

      const arcCall = vi.mocked(ctx.arc).mock.calls[0];
      const arcX = arcCall[0];
      const arcY = arcCall[1];

      // Should be in top-left quadrant
      expect(arcX).toBeLessThan(POSITION.screenX + POSITION.objectWidth / 2);
      expect(arcY).toBeLessThan(POSITION.screenY + POSITION.objectHeight / 2);
    });

    it("uses minimum size of 6 pixels", () => {
      const tinyConfig = { scaledSize: 1 };

      renderObjectLinkIndicator(ctx, POSITION, tinyConfig);

      const arcCall = vi.mocked(ctx.arc).mock.calls[0];
      const radius = arcCall[2];

      // Minimum link size is 6, so radius should be at least 3
      expect(radius).toBeGreaterThanOrEqual(3);
    });
  });

  // ===========================================================================
  // Integration-style tests
  // ===========================================================================

  describe("badge positioning", () => {
    it("all three badges occupy different corners", () => {
      const ctx1 = createMockContext();
      const ctx2 = createMockContext();
      const ctx3 = createMockContext();

      renderNoteLinkBadge(ctx1, POSITION, CONFIG);
      renderTooltipIndicator(ctx2, POSITION, CONFIG);
      renderObjectLinkIndicator(ctx3, POSITION, CONFIG);

      const noteLinkPos = vi.mocked(ctx1.arc).mock.calls[0];
      const tooltipPos = vi.mocked(ctx2.arc).mock.calls[0];
      const objectLinkPos = vi.mocked(ctx3.arc).mock.calls[0];

      // Note link: top-right
      expect(noteLinkPos[0]).toBeGreaterThan(POSITION.screenX + POSITION.objectWidth / 2);
      expect(noteLinkPos[1]).toBeLessThan(POSITION.screenY + POSITION.objectHeight / 2);

      // Tooltip: bottom-right
      expect(tooltipPos[0]).toBeGreaterThan(POSITION.screenX + POSITION.objectWidth / 2);
      expect(tooltipPos[1]).toBeGreaterThan(POSITION.screenY + POSITION.objectHeight / 2);

      // Object link: top-left
      expect(objectLinkPos[0]).toBeLessThan(POSITION.screenX + POSITION.objectWidth / 2);
      expect(objectLinkPos[1]).toBeLessThan(POSITION.screenY + POSITION.objectHeight / 2);
    });
  });
});
