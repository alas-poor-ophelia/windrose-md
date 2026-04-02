/**
 * Test importing directly from cellAccessor.ts via the transformer
 *
 * This tests the smarter transformer that converts:
 * - requireModuleByName() calls → static imports
 * - return {} → export {}
 */

import { describe, it, expect } from "vitest";

// Import directly from the source file - transformer should handle it
import {
  isSimpleCell,
  hasSegments,
  cellKey,
  getSegmentAtPosition,
  normalizeCell,
  getFilledSegments,
} from "../../../../src/geometry/core/cellAccessor.ts";

describe("cellAccessor (imported via transformer)", () => {
  describe("isSimpleCell", () => {
    it("returns true for cell without segments", () => {
      const cell = { x: 1, y: 2, color: "#ff0000" };
      expect(isSimpleCell(cell)).toBe(true);
    });

    it("returns false for cell with segments", () => {
      const cell = { x: 1, y: 2, color: "#ff0000", segments: { n: true } };
      expect(isSimpleCell(cell)).toBe(false);
    });
  });

  describe("hasSegments", () => {
    it("returns true when cell has segments object", () => {
      const cell = { x: 1, y: 2, color: "#ff0000", segments: { n: true, s: true } };
      expect(hasSegments(cell)).toBe(true);
    });

    it("returns false when cell has no segments", () => {
      const cell = { x: 1, y: 2, color: "#ff0000" };
      expect(hasSegments(cell)).toBe(false);
    });
  });

  describe("getSegmentAtPosition", () => {
    it("returns correct segment for center-north", () => {
      // Near top center = north segment
      expect(getSegmentAtPosition(0.5, 0.1)).toBe("n");
    });

    it("returns correct segment for center-east", () => {
      // Right of center = east segment
      expect(getSegmentAtPosition(0.9, 0.5)).toBe("e");
    });

    it("returns correct segment for center-south", () => {
      // Below center = south segment
      expect(getSegmentAtPosition(0.5, 0.9)).toBe("s");
    });

    it("returns correct segment for center-west", () => {
      // Left of center = west segment
      expect(getSegmentAtPosition(0.1, 0.5)).toBe("w");
    });
  });

  describe("normalizeCell", () => {
    it("collapses full segment cell to simple cell", () => {
      const fullSegmentCell = {
        x: 1,
        y: 2,
        color: "#ff0000",
        segments: { n: true, ne: true, e: true, se: true, s: true, sw: true, w: true, nw: true }
      };
      const result = normalizeCell(fullSegmentCell);
      expect(result).not.toBeNull();
      expect(hasSegments(result!)).toBe(false);
    });

    it("returns cell unchanged when segments object is empty", () => {
      // Note: hasSegments() returns false for empty segments object,
      // so normalizeCell treats this as a regular cell, not a segment cell
      const emptySegmentCell = {
        x: 1,
        y: 2,
        color: "#ff0000",
        segments: {}
      };
      const result = normalizeCell(emptySegmentCell);
      expect(result).toEqual(emptySegmentCell);
    });

    it("preserves partial segment cell", () => {
      const partialCell = {
        x: 1,
        y: 2,
        color: "#ff0000",
        segments: { n: true, s: true }
      };
      const result = normalizeCell(partialCell);
      expect(result).toEqual(partialCell);
    });
  });

  describe("getFilledSegments", () => {
    it("returns all 8 segments for simple cell", () => {
      const simpleCell = { x: 1, y: 2, color: "#ff0000" };
      const segments = getFilledSegments(simpleCell);
      expect(segments).toHaveLength(8);
    });

    it("returns only filled segments for segment cell", () => {
      const segmentCell = {
        x: 1,
        y: 2,
        color: "#ff0000",
        segments: { n: true, s: true }
      };
      const segments = getFilledSegments(segmentCell);
      expect(segments).toHaveLength(2);
      expect(segments).toContain("n");
      expect(segments).toContain("s");
    });

    it("returns empty array for null", () => {
      expect(getFilledSegments(null)).toEqual([]);
    });
  });
});
