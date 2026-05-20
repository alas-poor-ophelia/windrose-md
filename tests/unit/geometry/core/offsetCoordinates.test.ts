/**
 * offsetCoordinates Unit Tests
 *
 * Tests coordinate conversion utilities for hexagonal grids.
 * Covers both flat-top (odd-q) and pointy-top (odd-r) orientations.
 *
 * Coordinate Systems:
 * - Axial (q, r): Used for storage and hex math. Creates parallelogram when iterated.
 * - Offset (col, row): Used for bounds and iteration. Creates rectangle when iterated.
 */

import { describe, it, expect } from "vitest";

import {
  axialToOffset,
  offsetToAxial,
  isWithinOffsetBounds,
  columnToLabel,
  rowToLabel,
} from "../../../../src/geometry/core/offsetCoordinates";

describe("offsetCoordinates", () => {
  // ===========================================================================
  // axialToOffset
  // ===========================================================================

  describe("axialToOffset", () => {
    describe("flat-top orientation (odd-q)", () => {
      it("converts origin correctly", () => {
        const result = axialToOffset(0, 0, "flat");
        expect(result).toEqual({ col: 0, row: 0 });
      });

      it("converts positive q axis", () => {
        // q=1 (odd), r=0 -> col=1, row=0
        expect(axialToOffset(1, 0, "flat")).toEqual({ col: 1, row: 0 });
        // q=2 (even), r=0 -> col=2, row=1 (even columns shift)
        // Formula: row = r + (q - (q & 1)) / 2 = 0 + (2 - 0) / 2 = 1
        expect(axialToOffset(2, 0, "flat")).toEqual({ col: 2, row: 1 });
      });

      it("converts positive r axis", () => {
        expect(axialToOffset(0, 1, "flat")).toEqual({ col: 0, row: 1 });
        expect(axialToOffset(0, 2, "flat")).toEqual({ col: 0, row: 2 });
      });

      it("handles odd column shift", () => {
        // Odd columns shift down by 0.5 hex in visual space
        // axialToOffset: row = r + (q - (q & 1)) / 2
        // For q=1 (odd): row = r + (1 - 1) / 2 = r
        // For q=2 (even): row = r + (2 - 0) / 2 = r + 1
        expect(axialToOffset(1, 0, "flat")).toEqual({ col: 1, row: 0 });
        expect(axialToOffset(2, 0, "flat")).toEqual({ col: 2, row: 1 });
      });

      it("handles negative coordinates", () => {
        expect(axialToOffset(-1, 0, "flat").col).toBe(-1);
        expect(axialToOffset(0, -1, "flat").row).toBe(-1);
      });
    });

    describe("pointy-top orientation (odd-r)", () => {
      it("converts origin correctly", () => {
        const result = axialToOffset(0, 0, "pointy");
        expect(result).toEqual({ col: 0, row: 0 });
      });

      it("converts positive q axis", () => {
        expect(axialToOffset(1, 0, "pointy")).toEqual({ col: 1, row: 0 });
        expect(axialToOffset(2, 0, "pointy")).toEqual({ col: 2, row: 0 });
      });

      it("converts positive r axis", () => {
        expect(axialToOffset(0, 1, "pointy")).toEqual({ col: 0, row: 1 });
        expect(axialToOffset(0, 2, "pointy")).toEqual({ col: 1, row: 2 });
      });

      it("handles odd row shift", () => {
        // Odd rows shift right by 0.5 hex
        // axialToOffset: col = q + (r - (r & 1)) / 2
        // For r=1 (odd): col = q + (1 - 1) / 2 = q
        // For r=2 (even): col = q + (2 - 0) / 2 = q + 1
        expect(axialToOffset(0, 1, "pointy")).toEqual({ col: 0, row: 1 });
        expect(axialToOffset(0, 2, "pointy")).toEqual({ col: 1, row: 2 });
      });
    });

    it("defaults to flat orientation", () => {
      const flat = axialToOffset(1, 1, "flat");
      const defaultOrientation = axialToOffset(1, 1);
      expect(defaultOrientation).toEqual(flat);
    });
  });

  // ===========================================================================
  // offsetToAxial
  // ===========================================================================

  describe("offsetToAxial", () => {
    describe("flat-top orientation (odd-q)", () => {
      it("converts origin correctly", () => {
        const result = offsetToAxial(0, 0, "flat");
        expect(result).toEqual({ q: 0, r: 0 });
      });

      it("converts positive col axis", () => {
        expect(offsetToAxial(1, 0, "flat")).toEqual({ q: 1, r: 0 });
        expect(offsetToAxial(2, 0, "flat").q).toBe(2);
      });

      it("converts positive row axis", () => {
        expect(offsetToAxial(0, 1, "flat")).toEqual({ q: 0, r: 1 });
        expect(offsetToAxial(0, 2, "flat")).toEqual({ q: 0, r: 2 });
      });

      it("handles negative coordinates", () => {
        const result = offsetToAxial(-1, -1, "flat");
        expect(result.q).toBe(-1);
      });
    });

    describe("pointy-top orientation (odd-r)", () => {
      it("converts origin correctly", () => {
        const result = offsetToAxial(0, 0, "pointy");
        expect(result).toEqual({ q: 0, r: 0 });
      });

      it("converts coordinates", () => {
        expect(offsetToAxial(1, 0, "pointy")).toEqual({ q: 1, r: 0 });
        expect(offsetToAxial(0, 1, "pointy")).toEqual({ q: 0, r: 1 });
      });
    });

    it("defaults to flat orientation", () => {
      const flat = offsetToAxial(1, 1, "flat");
      const defaultOrientation = offsetToAxial(1, 1);
      expect(defaultOrientation).toEqual(flat);
    });
  });

  // ===========================================================================
  // Round-trip conversions
  // ===========================================================================

  describe("round-trip conversions", () => {
    describe("flat-top orientation", () => {
      it("offsetToAxial(axialToOffset(q, r)) === (q, r)", () => {
        for (let q = -3; q <= 3; q++) {
          for (let r = -3; r <= 3; r++) {
            const offset = axialToOffset(q, r, "flat");
            const axial = offsetToAxial(offset.col, offset.row, "flat");
            expect(axial).toEqual({ q, r });
          }
        }
      });

      it("axialToOffset(offsetToAxial(col, row)) === (col, row)", () => {
        for (let col = 0; col <= 5; col++) {
          for (let row = 0; row <= 5; row++) {
            const axial = offsetToAxial(col, row, "flat");
            const offset = axialToOffset(axial.q, axial.r, "flat");
            expect(offset).toEqual({ col, row });
          }
        }
      });
    });

    describe("pointy-top orientation", () => {
      it("offsetToAxial(axialToOffset(q, r)) === (q, r)", () => {
        for (let q = -3; q <= 3; q++) {
          for (let r = -3; r <= 3; r++) {
            const offset = axialToOffset(q, r, "pointy");
            const axial = offsetToAxial(offset.col, offset.row, "pointy");
            expect(axial).toEqual({ q, r });
          }
        }
      });

      it("axialToOffset(offsetToAxial(col, row)) === (col, row)", () => {
        for (let col = 0; col <= 5; col++) {
          for (let row = 0; row <= 5; row++) {
            const axial = offsetToAxial(col, row, "pointy");
            const offset = axialToOffset(axial.q, axial.r, "pointy");
            expect(offset).toEqual({ col, row });
          }
        }
      });
    });
  });

  // ===========================================================================
  // isWithinOffsetBounds
  // ===========================================================================

  describe("isWithinOffsetBounds", () => {
    it("returns true when no bounds provided", () => {
      expect(isWithinOffsetBounds(0, 0, null)).toBe(true);
      expect(isWithinOffsetBounds(100, 100, null)).toBe(true);
      expect(isWithinOffsetBounds(-50, -50, null)).toBe(true);
    });

    it("returns true for coordinates within bounds", () => {
      const bounds = { maxCol: 10, maxRow: 10 };
      expect(isWithinOffsetBounds(0, 0, bounds)).toBe(true);
      expect(isWithinOffsetBounds(5, 5, bounds)).toBe(true);
      expect(isWithinOffsetBounds(9, 9, bounds)).toBe(true);
    });

    it("returns false for coordinates at or beyond bounds", () => {
      const bounds = { maxCol: 10, maxRow: 10 };
      // maxCol/maxRow are exclusive (10 means indices 0-9)
      expect(isWithinOffsetBounds(10, 0, bounds)).toBe(false);
      expect(isWithinOffsetBounds(0, 10, bounds)).toBe(false);
      expect(isWithinOffsetBounds(10, 10, bounds)).toBe(false);
    });

    it("returns false for negative coordinates with bounds", () => {
      const bounds = { maxCol: 10, maxRow: 10 };
      expect(isWithinOffsetBounds(-1, 0, bounds)).toBe(false);
      expect(isWithinOffsetBounds(0, -1, bounds)).toBe(false);
    });
  });

  // ===========================================================================
  // Label generation
  // ===========================================================================

  describe("columnToLabel", () => {
    it("converts single-letter columns", () => {
      expect(columnToLabel(0)).toBe("A");
      expect(columnToLabel(1)).toBe("B");
      expect(columnToLabel(25)).toBe("Z");
    });

    it("converts double-letter columns", () => {
      expect(columnToLabel(26)).toBe("AA");
      expect(columnToLabel(27)).toBe("AB");
      expect(columnToLabel(51)).toBe("AZ");
      expect(columnToLabel(52)).toBe("BA");
    });

    it("converts triple-letter columns", () => {
      // 26 + 26*26 = 702 is AAA
      expect(columnToLabel(702)).toBe("AAA");
    });
  });

  describe("rowToLabel", () => {
    it("converts to 1-based row numbers", () => {
      expect(rowToLabel(0)).toBe("1");
      expect(rowToLabel(1)).toBe("2");
      expect(rowToLabel(9)).toBe("10");
      expect(rowToLabel(99)).toBe("100");
    });
  });
});
