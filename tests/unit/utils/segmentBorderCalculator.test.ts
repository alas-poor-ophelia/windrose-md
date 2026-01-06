/**
 * segmentBorderCalculator Unit Tests
 *
 * Tests border calculation for segment-based cells.
 * Focuses on internal borders (where filled meets empty within a cell).
 */

import { describe, it, expect } from "vitest";

import { getInternalBorders } from "../../../src/utils/segmentBorderCalculator.ts";

import type { SegmentGridCell, SegmentName } from "#types/core/cell.types";

// Helper to create a segment cell with specified filled segments
function createSegmentCell(
  filledSegments: SegmentName[],
  x = 0,
  y = 0
): SegmentGridCell {
  const segments: Record<SegmentName, boolean> = {
    nw: false,
    n: false,
    ne: false,
    e: false,
    se: false,
    s: false,
    sw: false,
    w: false,
  };

  for (const seg of filledSegments) {
    segments[seg] = true;
  }

  return {
    x,
    y,
    color: "#ff0000",
    segments,
  };
}

describe("segmentBorderCalculator", () => {
  // ===========================================================================
  // getInternalBorders
  // ===========================================================================

  describe("getInternalBorders", () => {
    it("returns empty array for fully filled cell", () => {
      const cell = createSegmentCell([
        "nw",
        "n",
        "ne",
        "e",
        "se",
        "s",
        "sw",
        "w",
      ]);
      const borders = getInternalBorders(cell);
      expect(borders).toHaveLength(0);
    });

    it("returns empty array for fully empty cell", () => {
      const cell = createSegmentCell([]);
      const borders = getInternalBorders(cell);
      expect(borders).toHaveLength(0);
    });

    it("returns border where filled meets empty", () => {
      // Only nw filled - should have borders at C-TL (w-nw) and C-TM (nw-n)
      const cell = createSegmentCell(["nw"]);
      const borders = getInternalBorders(cell);

      // C-TL connects w and nw; w is empty, nw is filled → border
      // C-TM connects nw and n; nw is filled, n is empty → border
      expect(borders).toHaveLength(2);
      expect(borders).toContainEqual({ from: "C", to: "TL" });
      expect(borders).toContainEqual({ from: "C", to: "TM" });
    });

    it("handles half-cell diagonal fill (TL corner)", () => {
      // TL corner: n, nw, w, sw filled
      const cell = createSegmentCell(["n", "nw", "w", "sw"]);
      const borders = getInternalBorders(cell);

      // Borders at: C-TR (n-ne), C-BL (s-sw)
      // C-TR: n filled, ne empty → border
      // C-BL: sw filled, s empty → border
      // No border at C-TM (nw-n both filled), C-TL (w-nw both filled)
      expect(borders).toHaveLength(2);
      expect(borders).toContainEqual({ from: "C", to: "TR" });
      expect(borders).toContainEqual({ from: "C", to: "BL" });
    });

    it("handles half-cell diagonal fill (BR corner)", () => {
      // BR corner: ne, e, se, s filled
      const cell = createSegmentCell(["ne", "e", "se", "s"]);
      const borders = getInternalBorders(cell);

      // Borders at internal edges between filled and empty
      expect(borders.length).toBeGreaterThan(0);
    });

    it("handles single segment filled", () => {
      const cell = createSegmentCell(["e"]);
      const borders = getInternalBorders(cell);

      // e segment: internal edges are C-RM (ne-e) and C-BR (e-se)
      expect(borders).toContainEqual({ from: "C", to: "RM" });
      expect(borders).toContainEqual({ from: "C", to: "BR" });
    });

    it("handles alternating segments pattern", () => {
      // Fill every other segment
      const cell = createSegmentCell(["nw", "ne", "se", "sw"]);
      const borders = getInternalBorders(cell);

      // Each filled segment has two empty neighbors
      // nw: C-TM (nw-n) border, C-TL no border (w empty)
      // Wait, nw neighbors are w and n. w empty, n empty.
      // C-TL connects w-nw: w empty, nw filled → border
      // C-TM connects nw-n: nw filled, n empty → border
      // Similar for others

      // 4 segments filled, 4 empty, alternating = all 8 internal edges have borders
      expect(borders).toHaveLength(8);
    });

    it("handles adjacent pair filled", () => {
      // nw and n are adjacent (share edge C-TM)
      const cell = createSegmentCell(["nw", "n"]);
      const borders = getInternalBorders(cell);

      // C-TM: nw-n both filled, no border
      // C-TL: w-nw, w empty → border
      // C-TR: n-ne, ne empty → border
      expect(borders).not.toContainEqual({ from: "C", to: "TM" });
      expect(borders).toContainEqual({ from: "C", to: "TL" });
      expect(borders).toContainEqual({ from: "C", to: "TR" });
    });

    it("handles three adjacent segments filled", () => {
      const cell = createSegmentCell(["nw", "n", "ne"]);
      const borders = getInternalBorders(cell);

      // Internal edges with mixed fill:
      // C-TL: w-nw, w empty, nw filled → border
      // C-TM: nw-n, both filled → no border
      // C-TR: n-ne, both filled → no border
      // C-RM: ne-e, ne filled, e empty → border
      expect(borders).toContainEqual({ from: "C", to: "TL" });
      expect(borders).not.toContainEqual({ from: "C", to: "TM" });
      expect(borders).not.toContainEqual({ from: "C", to: "TR" });
      expect(borders).toContainEqual({ from: "C", to: "RM" });
    });

    it("handles opposite segments filled", () => {
      // nw and se are opposite
      const cell = createSegmentCell(["nw", "se"]);
      const borders = getInternalBorders(cell);

      // nw: C-TL (w-nw) border, C-TM (nw-n) border
      // se: C-BR (e-se) border, C-BM (se-s) border
      expect(borders).toHaveLength(4);
    });

    it("border count matches expected pattern", () => {
      // With n segments filled, borders appear at edges
      // where filled segment is adjacent to empty segment

      // 7 segments filled (only one empty)
      const almostFull = createSegmentCell([
        "nw",
        "n",
        "ne",
        "e",
        "se",
        "s",
        "sw",
      ]);
      const borders = getInternalBorders(almostFull);

      // w is empty. It neighbors sw (C-LM) and nw (C-TL)
      // sw is filled, so C-LM has border
      // nw is filled, so C-TL has border
      expect(borders).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Edge cases and validation
  // ===========================================================================

  describe("edge cases", () => {
    it("handles cell with explicit false segments", () => {
      const cell: SegmentGridCell = {
        x: 5,
        y: 3,
        color: "#ff0000",
        segments: {
          nw: true,
          n: false,
          ne: false,
          e: false,
          se: false,
          s: false,
          sw: false,
          w: false,
        },
      };
      const borders = getInternalBorders(cell);
      expect(borders).toHaveLength(2);
    });

    it("handles cell with opacity", () => {
      const cell = createSegmentCell(["nw"]);
      cell.opacity = 0.5;
      const borders = getInternalBorders(cell);
      expect(borders).toHaveLength(2); // Same as without opacity
    });
  });

  // ===========================================================================
  // Symmetry tests
  // ===========================================================================

  describe("symmetry", () => {
    it("opposite diagonal fills produce same border count", () => {
      const tlCorner = createSegmentCell(["n", "nw", "w", "sw"]);
      const brCorner = createSegmentCell(["ne", "e", "se", "s"]);

      const tlBorders = getInternalBorders(tlCorner);
      const brBorders = getInternalBorders(brCorner);

      expect(tlBorders.length).toBe(brBorders.length);
    });

    it("rotating segment pattern rotates borders", () => {
      // Single segment in each quadrant should produce 2 borders each
      const nw = getInternalBorders(createSegmentCell(["nw"]));
      const ne = getInternalBorders(createSegmentCell(["ne"]));
      const se = getInternalBorders(createSegmentCell(["se"]));
      const sw = getInternalBorders(createSegmentCell(["sw"]));

      expect(nw.length).toBe(2);
      expect(ne.length).toBe(2);
      expect(se.length).toBe(2);
      expect(sw.length).toBe(2);
    });
  });
});
