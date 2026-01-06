/**
 * borderCalculator Unit Tests
 *
 * Tests smart border detection for exterior edges of cell groups.
 * Borders are drawn only where there's no adjacent cell.
 */

import { describe, it, expect } from "vitest";

import {
  calculateBorders,
  cellExists,
  buildCellLookup,
  calculateBordersOptimized,
} from "../../../src/utils/borderCalculator.ts";

// Helper to create test cells
function createCell(x: number, y: number, color = "#ff0000") {
  return { x, y, color };
}

describe("borderCalculator", () => {
  // ===========================================================================
  // cellExists
  // ===========================================================================

  describe("cellExists", () => {
    it("returns true when cell exists at coordinates", () => {
      const cells = [createCell(0, 0), createCell(1, 0), createCell(0, 1)];

      expect(cellExists(cells, 0, 0)).toBe(true);
      expect(cellExists(cells, 1, 0)).toBe(true);
      expect(cellExists(cells, 0, 1)).toBe(true);
    });

    it("returns false when no cell at coordinates", () => {
      const cells = [createCell(0, 0), createCell(1, 0)];

      expect(cellExists(cells, 2, 0)).toBe(false);
      expect(cellExists(cells, 0, 1)).toBe(false);
      expect(cellExists(cells, -1, 0)).toBe(false);
    });

    it("returns false for empty cell array", () => {
      expect(cellExists([], 0, 0)).toBe(false);
    });

    it("handles negative coordinates", () => {
      const cells = [createCell(-1, -1), createCell(0, 0)];

      expect(cellExists(cells, -1, -1)).toBe(true);
      expect(cellExists(cells, -2, -1)).toBe(false);
    });
  });

  // ===========================================================================
  // calculateBorders
  // ===========================================================================

  describe("calculateBorders", () => {
    it("returns all 4 borders for isolated cell", () => {
      const cells = [createCell(5, 5)];
      const borders = calculateBorders(cells, 5, 5);

      expect(borders).toHaveLength(4);
      expect(borders).toContain("top");
      expect(borders).toContain("right");
      expect(borders).toContain("bottom");
      expect(borders).toContain("left");
    });

    it("returns 3 borders for cell with one neighbor", () => {
      // Cell at (0,0) with neighbor to the right at (1,0)
      const cells = [createCell(0, 0), createCell(1, 0)];
      const borders = calculateBorders(cells, 0, 0);

      expect(borders).toHaveLength(3);
      expect(borders).toContain("top");
      expect(borders).toContain("bottom");
      expect(borders).toContain("left");
      expect(borders).not.toContain("right"); // Neighbor exists
    });

    it("returns no borders for fully surrounded cell", () => {
      // Cell at (1,1) surrounded by 4 neighbors
      const cells = [
        createCell(1, 1), // Center
        createCell(1, 0), // Top
        createCell(2, 1), // Right
        createCell(1, 2), // Bottom
        createCell(0, 1), // Left
      ];
      const borders = calculateBorders(cells, 1, 1);

      expect(borders).toHaveLength(0);
    });

    it("returns correct borders for corner cell in L-shape", () => {
      // L-shape:  X X
      //           X
      const cells = [
        createCell(0, 0),
        createCell(1, 0),
        createCell(0, 1),
      ];

      // Top-left corner cell (0,0) - has right and bottom neighbors
      const borders00 = calculateBorders(cells, 0, 0);
      expect(borders00).toHaveLength(2);
      expect(borders00).toContain("top");
      expect(borders00).toContain("left");

      // Top-right cell (1,0) - has left neighbor only
      const borders10 = calculateBorders(cells, 1, 0);
      expect(borders10).toHaveLength(3);
      expect(borders10).toContain("top");
      expect(borders10).toContain("right");
      expect(borders10).toContain("bottom");
      expect(borders10).not.toContain("left");

      // Bottom-left cell (0,1) - has top neighbor only
      const borders01 = calculateBorders(cells, 0, 1);
      expect(borders01).toHaveLength(3);
      expect(borders01).not.toContain("top");
    });

    it("handles horizontal strip correctly", () => {
      // Three cells in a row: X X X
      const cells = [
        createCell(0, 0),
        createCell(1, 0),
        createCell(2, 0),
      ];

      // Left end
      const bordersLeft = calculateBorders(cells, 0, 0);
      expect(bordersLeft).toContain("left");
      expect(bordersLeft).toContain("top");
      expect(bordersLeft).toContain("bottom");
      expect(bordersLeft).not.toContain("right");

      // Middle
      const bordersMiddle = calculateBorders(cells, 1, 0);
      expect(bordersMiddle).toContain("top");
      expect(bordersMiddle).toContain("bottom");
      expect(bordersMiddle).not.toContain("left");
      expect(bordersMiddle).not.toContain("right");

      // Right end
      const bordersRight = calculateBorders(cells, 2, 0);
      expect(bordersRight).toContain("right");
      expect(bordersRight).toContain("top");
      expect(bordersRight).toContain("bottom");
      expect(bordersRight).not.toContain("left");
    });

    it("handles vertical strip correctly", () => {
      // Three cells in a column
      const cells = [
        createCell(0, 0),
        createCell(0, 1),
        createCell(0, 2),
      ];

      // Top end
      const bordersTop = calculateBorders(cells, 0, 0);
      expect(bordersTop).toContain("top");
      expect(bordersTop).toContain("left");
      expect(bordersTop).toContain("right");
      expect(bordersTop).not.toContain("bottom");

      // Middle
      const bordersMiddle = calculateBorders(cells, 0, 1);
      expect(bordersMiddle).toContain("left");
      expect(bordersMiddle).toContain("right");
      expect(bordersMiddle).not.toContain("top");
      expect(bordersMiddle).not.toContain("bottom");
    });
  });

  // ===========================================================================
  // buildCellLookup
  // ===========================================================================

  describe("buildCellLookup", () => {
    it("creates Set with correct keys", () => {
      const cells = [createCell(0, 0), createCell(1, 2), createCell(-1, 3)];
      const lookup = buildCellLookup(cells);

      expect(lookup.has("0,0")).toBe(true);
      expect(lookup.has("1,2")).toBe(true);
      expect(lookup.has("-1,3")).toBe(true);
      expect(lookup.has("5,5")).toBe(false);
    });

    it("returns empty Set for empty array", () => {
      const lookup = buildCellLookup([]);
      expect(lookup.size).toBe(0);
    });

    it("handles large number of cells", () => {
      const cells = [];
      for (let x = 0; x < 100; x++) {
        for (let y = 0; y < 100; y++) {
          cells.push(createCell(x, y));
        }
      }
      const lookup = buildCellLookup(cells);
      expect(lookup.size).toBe(10000);
    });
  });

  // ===========================================================================
  // calculateBordersOptimized
  // ===========================================================================

  describe("calculateBordersOptimized", () => {
    it("returns same results as calculateBorders", () => {
      const cells = [
        createCell(0, 0),
        createCell(1, 0),
        createCell(0, 1),
      ];
      const lookup = buildCellLookup(cells);

      // Compare results for each cell
      for (const cell of cells) {
        const regular = calculateBorders(cells, cell.x, cell.y).sort();
        const optimized = calculateBordersOptimized(lookup, cell.x, cell.y).sort();
        expect(optimized).toEqual(regular);
      }
    });

    it("returns all 4 borders for isolated cell", () => {
      const lookup = buildCellLookup([createCell(5, 5)]);
      const borders = calculateBordersOptimized(lookup, 5, 5);

      expect(borders).toHaveLength(4);
    });

    it("returns no borders for fully surrounded cell", () => {
      const cells = [
        createCell(1, 1),
        createCell(1, 0),
        createCell(2, 1),
        createCell(1, 2),
        createCell(0, 1),
      ];
      const lookup = buildCellLookup(cells);
      const borders = calculateBordersOptimized(lookup, 1, 1);

      expect(borders).toHaveLength(0);
    });

    it("is faster than non-optimized for large cell sets", () => {
      // Create a large grid
      const cells = [];
      for (let x = 0; x < 50; x++) {
        for (let y = 0; y < 50; y++) {
          cells.push(createCell(x, y));
        }
      }
      const lookup = buildCellLookup(cells);

      // Time optimized version
      const startOptimized = performance.now();
      for (const cell of cells) {
        calculateBordersOptimized(lookup, cell.x, cell.y);
      }
      const endOptimized = performance.now();

      // Time regular version
      const startRegular = performance.now();
      for (const cell of cells) {
        calculateBorders(cells, cell.x, cell.y);
      }
      const endRegular = performance.now();

      const optimizedTime = endOptimized - startOptimized;
      const regularTime = endRegular - startRegular;

      // Optimized should be significantly faster (at least 10x for large sets)
      // But we'll be lenient in test to avoid flaky tests
      expect(optimizedTime).toBeLessThan(regularTime);
    });
  });

  // ===========================================================================
  // Edge cases
  // ===========================================================================

  describe("edge cases", () => {
    it("handles cells with same coordinates but different colors", () => {
      // This shouldn't happen in practice, but test robustness
      const cells = [
        createCell(0, 0, "#ff0000"),
        createCell(0, 0, "#00ff00"), // Duplicate position
      ];

      // cellExists should find the first one
      expect(cellExists(cells, 0, 0)).toBe(true);
    });

    it("handles negative coordinate cells", () => {
      const cells = [
        createCell(-5, -5),
        createCell(-4, -5), // Right neighbor
      ];

      const borders = calculateBorders(cells, -5, -5);
      expect(borders).toHaveLength(3);
      expect(borders).not.toContain("right");
    });

    it("handles very large coordinates", () => {
      const cells = [createCell(10000, 10000)];
      const lookup = buildCellLookup(cells);

      expect(lookup.has("10000,10000")).toBe(true);
      const borders = calculateBordersOptimized(lookup, 10000, 10000);
      expect(borders).toHaveLength(4);
    });
  });
});
