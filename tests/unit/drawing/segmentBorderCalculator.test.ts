/**
 * segmentBorderCalculator Unit Tests
 *
 * Tests border calculation for segment-based cells.
 * Focuses on internal borders (where filled meets empty within a cell).
 */

import { describe, it, expect } from "vitest";

import { getInternalBorders, getExternalBorders } from "../../../src/drawing/segmentBorderCalculator";
import { buildCellMap } from "../../../src/geometry/core/cellAccessor";
import { GridGeometry } from "../../../src/geometry/core/GridGeometry";

import type { SegmentGridCell, SegmentName, SegmentMap, Cell } from "#types/core/cell.types";

// Helper to create a segment cell with specified filled segments
function createSegmentCell(
  filledSegments: SegmentName[],
  x = 0,
  y = 0
): SegmentGridCell {
  const segments: SegmentMap = {};

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
        } as SegmentMap,
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

  // ===========================================================================
  // getExternalBorders
  // ===========================================================================

  describe("getExternalBorders", () => {
    const geometry = new GridGeometry(32);

    it("returns external borders for isolated segment cell", () => {
      const cell = createSegmentCell(["nw"], 5, 5);
      const cellMap = buildCellMap([cell], geometry);
      const borders = getExternalBorders(cell, cellMap, geometry);

      // nw has external edge on top-left of top edge
      // No neighbors, so border should be drawn
      expect(borders).toHaveLength(1);
      expect(borders[0].segment).toBe("nw");
    });

    it("returns no external border when neighbor segment is filled", () => {
      // Cell A at (5,5) with nw filled
      // Cell B at (5,4) with s filled (directly above, bottom-left touches nw's top-left)
      const cellA = createSegmentCell(["nw"], 5, 5);
      const cellB = createSegmentCell(["s"], 5, 4);
      const cellMap = buildCellMap([cellA, cellB], geometry);

      const bordersA = getExternalBorders(cellA, cellMap, geometry);

      // nw should check north neighbor's s segment - which is filled
      expect(bordersA).toHaveLength(0);
    });

    it("returns external border when neighbor exists but segment is empty", () => {
      // Cell A at (5,5) with nw filled
      // Cell B at (5,4) with se filled (NOT s, which nw needs)
      const cellA = createSegmentCell(["nw"], 5, 5);
      const cellB = createSegmentCell(["se"], 5, 4);
      const cellMap = buildCellMap([cellA, cellB], geometry);

      const bordersA = getExternalBorders(cellA, cellMap, geometry);

      // nw checks for s in north neighbor - se is filled but not s
      expect(bordersA).toHaveLength(1);
      expect(bordersA[0].segment).toBe("nw");
    });

    // =========================================================================
    // REGRESSION TESTS: Cross-cell adjacency for connected half-cells
    // These test the fix for swapped neighbor segments on bottom/left edges
    // =========================================================================

    describe("connected half-cells (regression tests)", () => {
      it("vertical corridor with WEST half - no border between cells", () => {
        // Painting west half of vertically adjacent cells
        // West half segments: nw, w, sw, s
        const westHalf: SegmentName[] = ["nw", "w", "sw", "s"];

        const cellA = createSegmentCell(westHalf, 5, 5); // upper cell
        const cellB = createSegmentCell(westHalf, 5, 6); // lower cell

        const cellMap = buildCellMap([cellA, cellB], geometry);

        const bordersA = getExternalBorders(cellA, cellMap, geometry);
        const bordersB = getExternalBorders(cellB, cellMap, geometry);

        // Cell A's 's' segment should connect to Cell B's 'nw' segment (both filled)
        // So 's' should NOT appear in Cell A's external borders
        const aBorderSegments = bordersA.map((b) => b.segment);
        expect(aBorderSegments).not.toContain("s");

        // Cell B's 'nw' segment should connect to Cell A's 's' segment (both filled)
        // So 'nw' should NOT appear in Cell B's external borders
        const bBorderSegments = bordersB.map((b) => b.segment);
        expect(bBorderSegments).not.toContain("nw");
      });

      it("vertical corridor with EAST half - no border between cells", () => {
        // Painting east half of vertically adjacent cells
        // East half segments: n, ne, e, se
        const eastHalf: SegmentName[] = ["n", "ne", "e", "se"];

        const cellA = createSegmentCell(eastHalf, 5, 5); // upper cell
        const cellB = createSegmentCell(eastHalf, 5, 6); // lower cell

        const cellMap = buildCellMap([cellA, cellB], geometry);

        const bordersA = getExternalBorders(cellA, cellMap, geometry);
        const bordersB = getExternalBorders(cellB, cellMap, geometry);

        // Cell A's 'se' segment should connect to Cell B's 'n' segment
        const aBorderSegments = bordersA.map((b) => b.segment);
        expect(aBorderSegments).not.toContain("se");

        // Cell B's 'n' segment should connect to Cell A's 'se' segment
        const bBorderSegments = bordersB.map((b) => b.segment);
        expect(bBorderSegments).not.toContain("n");
      });

      it("horizontal corridor with NORTH half - no border between cells", () => {
        // Painting north half of horizontally adjacent cells
        // North half segments: nw, n (top edge segments)
        const northHalf: SegmentName[] = ["nw", "n"];

        const cellA = createSegmentCell(northHalf, 5, 5); // left cell
        const cellB = createSegmentCell(northHalf, 6, 5); // right cell

        const cellMap = buildCellMap([cellA, cellB], geometry);

        const bordersA = getExternalBorders(cellA, cellMap, geometry);
        const bordersB = getExternalBorders(cellB, cellMap, geometry);

        // These cells don't share a painted edge (north half doesn't touch east/west neighbors)
        // So they SHOULD have external borders on their east/west sides
        // This test verifies we don't incorrectly suppress borders
        const aBorderSegments = bordersA.map((b) => b.segment);
        const bBorderSegments = bordersB.map((b) => b.segment);

        // Cell A's nw and n are on TOP edge, not RIGHT edge - no connection to Cell B
        // Cell B's nw and n are on TOP edge, not LEFT edge - no connection to Cell A
        expect(aBorderSegments).toContain("nw");
        expect(aBorderSegments).toContain("n");
        expect(bBorderSegments).toContain("nw");
        expect(bBorderSegments).toContain("n");
      });

      it("horizontal corridor with right-edge segments - no border between cells", () => {
        // Cell A has ne, e (right edge segments)
        // Cell B (to the right) has w, sw (left edge segments that connect)
        const cellA = createSegmentCell(["ne", "e"], 5, 5);
        const cellB = createSegmentCell(["w", "sw"], 6, 5);

        const cellMap = buildCellMap([cellA, cellB], geometry);

        const bordersA = getExternalBorders(cellA, cellMap, geometry);
        const bordersB = getExternalBorders(cellB, cellMap, geometry);

        // Cell A's 'ne' connects to Cell B's 'w' (both filled)
        // Cell A's 'e' connects to Cell B's 'sw' (both filled)
        const aBorderSegments = bordersA.map((b) => b.segment);
        expect(aBorderSegments).not.toContain("ne");
        expect(aBorderSegments).not.toContain("e");

        // Cell B's 'w' connects to Cell A's 'ne' (both filled)
        // Cell B's 'sw' connects to Cell A's 'e' (both filled)
        const bBorderSegments = bordersB.map((b) => b.segment);
        expect(bBorderSegments).not.toContain("w");
        expect(bBorderSegments).not.toContain("sw");
      });

      it("specific regression: s checks nw in south neighbor (not n)", () => {
        // This tests the specific fix: s's neighborSegment was 'n', should be 'nw'
        // s external edge: bottom-left half (BM→BL)
        // Should connect to south neighbor's top-left half (nw: TL→TM)

        const cellA = createSegmentCell(["s"], 5, 5);
        const cellB = createSegmentCell(["nw"], 5, 6); // south neighbor

        const cellMap = buildCellMap([cellA, cellB], geometry);
        const bordersA = getExternalBorders(cellA, cellMap, geometry);

        // With fix: s checks nw → nw is filled → no border
        // Without fix: s checks n → n is empty → border drawn (BUG)
        expect(bordersA).toHaveLength(0);
      });

      it("specific regression: se checks n in south neighbor (not nw)", () => {
        // This tests the specific fix: se's neighborSegment was 'nw', should be 'n'
        // se external edge: bottom-right half (BR→BM)
        // Should connect to south neighbor's top-right half (n: TM→TR)

        const cellA = createSegmentCell(["se"], 5, 5);
        const cellB = createSegmentCell(["n"], 5, 6); // south neighbor

        const cellMap = buildCellMap([cellA, cellB], geometry);
        const bordersA = getExternalBorders(cellA, cellMap, geometry);

        // With fix: se checks n → n is filled → no border
        // Without fix: se checks nw → nw is empty → border drawn (BUG)
        expect(bordersA).toHaveLength(0);
      });

      it("specific regression: sw checks e in west neighbor (not ne)", () => {
        // This tests the specific fix: sw's neighborSegment was 'ne', should be 'e'
        // sw external edge: left-bottom half (BL→LM)
        // Should connect to west neighbor's right-bottom half (e: RM→BR)

        const cellA = createSegmentCell(["sw"], 5, 5);
        const cellB = createSegmentCell(["e"], 4, 5); // west neighbor

        const cellMap = buildCellMap([cellA, cellB], geometry);
        const bordersA = getExternalBorders(cellA, cellMap, geometry);

        // With fix: sw checks e → e is filled → no border
        // Without fix: sw checks ne → ne is empty → border drawn (BUG)
        expect(bordersA).toHaveLength(0);
      });

      it("specific regression: w checks ne in west neighbor (not e)", () => {
        // This tests the specific fix: w's neighborSegment was 'e', should be 'ne'
        // w external edge: left-top half (LM→TL)
        // Should connect to west neighbor's right-top half (ne: TR→RM)

        const cellA = createSegmentCell(["w"], 5, 5);
        const cellB = createSegmentCell(["ne"], 4, 5); // west neighbor

        const cellMap = buildCellMap([cellA, cellB], geometry);
        const bordersA = getExternalBorders(cellA, cellMap, geometry);

        // With fix: w checks ne → ne is filled → no border
        // Without fix: w checks e → e is empty → border drawn (BUG)
        expect(bordersA).toHaveLength(0);
      });
    });

    describe("simple cell neighbors", () => {
      it("returns no border when neighbor is a simple (full) cell", () => {
        const segmentCell = createSegmentCell(["ne", "e"], 5, 5);
        const simpleCell: Cell = { x: 6, y: 5, color: "#ff0000" }; // full cell to the right

        const cellMap = buildCellMap([segmentCell, simpleCell], geometry);
        const borders = getExternalBorders(segmentCell, cellMap, geometry);

        // ne and e connect to the simple cell (all segments filled)
        const borderSegments = borders.map((b) => b.segment);
        expect(borderSegments).not.toContain("ne");
        expect(borderSegments).not.toContain("e");
      });
    });
  });
});
