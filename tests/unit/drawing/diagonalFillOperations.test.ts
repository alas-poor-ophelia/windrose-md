/**
 * diagonalFillOperations Unit Tests
 *
 * Tests diagonal fill tool operations for staircase gap filling.
 * Covers corner detection, diagonal path validation, and cell state helpers.
 */

import { describe, it, expect } from "vitest";

import {
  getNearestCorner,
  getLocalPosition,
  cellIsPainted,
  cellIsEmpty,
  getCell,
  isValidConcaveCorner,
  findValidCornerForCell,
  findNearestValidCorner,
  isValid45Diagonal,
  getDiagonalDirection,
  cornerMatchesDiagonal,
  getCellsAlongDiagonal,
  getValidCornersAlongDiagonal,
  getInheritedColor,
  getSegmentsForCorner,
  validateDiagonalPath,
} from "../../../src/drawing/diagonalFillOperations.ts";

import type { CellMap } from "#types/core/cell.types";

// Helper to create a simple CellMap for testing
function createCellMap(
  cells: Array<{ x: number; y: number; color?: string; opacity?: number }>
): CellMap {
  const map = new Map();
  for (const cell of cells) {
    const key = `${cell.x},${cell.y}`;
    map.set(key, { x: cell.x, y: cell.y, color: cell.color || "#ff0000", opacity: cell.opacity ?? 1 });
  }
  return map;
}

describe("diagonalFillOperations", () => {
  // ===========================================================================
  // getNearestCorner
  // ===========================================================================

  describe("getNearestCorner", () => {
    it("returns TL for top-left quadrant", () => {
      expect(getNearestCorner(0, 0)).toBe("TL");
      expect(getNearestCorner(0.25, 0.25)).toBe("TL");
      expect(getNearestCorner(0.49, 0.49)).toBe("TL");
    });

    it("returns TR for top-right quadrant", () => {
      expect(getNearestCorner(1, 0)).toBe("TR");
      expect(getNearestCorner(0.75, 0.25)).toBe("TR");
      expect(getNearestCorner(0.5, 0.49)).toBe("TR");
    });

    it("returns BR for bottom-right quadrant", () => {
      expect(getNearestCorner(1, 1)).toBe("BR");
      expect(getNearestCorner(0.75, 0.75)).toBe("BR");
      expect(getNearestCorner(0.5, 0.5)).toBe("BR");
    });

    it("returns BL for bottom-left quadrant", () => {
      expect(getNearestCorner(0, 1)).toBe("BL");
      expect(getNearestCorner(0.25, 0.75)).toBe("BL");
      expect(getNearestCorner(0.49, 0.5)).toBe("BL");
    });

    it("handles exact center (0.5, 0.5) as BR", () => {
      // 0.5 is not < 0.5, so !isLeft and !isTop = BR
      expect(getNearestCorner(0.5, 0.5)).toBe("BR");
    });

    it("handles edge cases at 0.5 boundary", () => {
      // At y=0.5, isTop=false
      expect(getNearestCorner(0.25, 0.5)).toBe("BL");
      // At x=0.5, isLeft=false
      expect(getNearestCorner(0.5, 0.25)).toBe("TR");
    });
  });

  // ===========================================================================
  // getLocalPosition
  // ===========================================================================

  describe("getLocalPosition", () => {
    const cellSize = 32;

    it("returns (0, 0) at cell top-left", () => {
      const result = getLocalPosition(0, 0, 0, 0, cellSize);
      expect(result.localX).toBe(0);
      expect(result.localY).toBe(0);
    });

    it("returns (1, 1) at cell bottom-right", () => {
      const result = getLocalPosition(32, 32, 0, 0, cellSize);
      expect(result.localX).toBe(1);
      expect(result.localY).toBe(1);
    });

    it("returns (0.5, 0.5) at cell center", () => {
      const result = getLocalPosition(16, 16, 0, 0, cellSize);
      expect(result.localX).toBe(0.5);
      expect(result.localY).toBe(0.5);
    });

    it("clamps values to 0-1 range", () => {
      // Beyond cell bounds
      const tooSmall = getLocalPosition(-10, -10, 0, 0, cellSize);
      expect(tooSmall.localX).toBe(0);
      expect(tooSmall.localY).toBe(0);

      const tooBig = getLocalPosition(100, 100, 0, 0, cellSize);
      expect(tooBig.localX).toBe(1);
      expect(tooBig.localY).toBe(1);
    });

    it("handles non-zero cell coordinates", () => {
      // Cell at (3, 2) with cellSize 32 starts at world (96, 64)
      const result = getLocalPosition(112, 80, 3, 2, cellSize);
      // (112 - 96) / 32 = 0.5, (80 - 64) / 32 = 0.5
      expect(result.localX).toBe(0.5);
      expect(result.localY).toBe(0.5);
    });
  });

  // ===========================================================================
  // cellIsPainted / cellIsEmpty / getCell
  // ===========================================================================

  describe("cellIsPainted", () => {
    it("returns true for painted cell", () => {
      const cellMap = createCellMap([{ x: 5, y: 3 }]);
      expect(cellIsPainted(cellMap, 5, 3)).toBe(true);
    });

    it("returns false for empty position", () => {
      const cellMap = createCellMap([{ x: 5, y: 3 }]);
      expect(cellIsPainted(cellMap, 0, 0)).toBe(false);
    });

    it("returns false for empty map", () => {
      const cellMap = createCellMap([]);
      expect(cellIsPainted(cellMap, 5, 3)).toBe(false);
    });
  });

  describe("cellIsEmpty", () => {
    it("returns true for empty position", () => {
      const cellMap = createCellMap([{ x: 5, y: 3 }]);
      expect(cellIsEmpty(cellMap, 0, 0)).toBe(true);
    });

    it("returns false for painted cell", () => {
      const cellMap = createCellMap([{ x: 5, y: 3 }]);
      expect(cellIsEmpty(cellMap, 5, 3)).toBe(false);
    });
  });

  describe("getCell", () => {
    it("returns cell when exists", () => {
      const cellMap = createCellMap([{ x: 5, y: 3, color: "#00ff00" }]);
      const cell = getCell(cellMap, 5, 3);
      expect(cell).not.toBeNull();
      expect(cell!.color).toBe("#00ff00");
    });

    it("returns null when not found", () => {
      const cellMap = createCellMap([]);
      expect(getCell(cellMap, 5, 3)).toBeNull();
    });
  });

  // ===========================================================================
  // isValidConcaveCorner
  // ===========================================================================

  describe("isValidConcaveCorner", () => {
    it("returns true for valid TL concave corner", () => {
      // TL requires neighbors at (0, -1) and (-1, 0) to be painted
      const cellMap = createCellMap([
        { x: 0, y: -1 }, // Top neighbor
        { x: -1, y: 0 }, // Left neighbor
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "TL")).toBe(true);
    });

    it("returns true for valid TR concave corner", () => {
      // TR requires neighbors at (0, -1) and (1, 0) to be painted
      const cellMap = createCellMap([
        { x: 0, y: -1 }, // Top neighbor
        { x: 1, y: 0 }, // Right neighbor
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "TR")).toBe(true);
    });

    it("returns true for valid BR concave corner", () => {
      // BR requires neighbors at (0, 1) and (1, 0) to be painted
      const cellMap = createCellMap([
        { x: 0, y: 1 }, // Bottom neighbor
        { x: 1, y: 0 }, // Right neighbor
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "BR")).toBe(true);
    });

    it("returns true for valid BL concave corner", () => {
      // BL requires neighbors at (0, 1) and (-1, 0) to be painted
      const cellMap = createCellMap([
        { x: 0, y: 1 }, // Bottom neighbor
        { x: -1, y: 0 }, // Left neighbor
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "BL")).toBe(true);
    });

    it("returns false when cell is painted", () => {
      const cellMap = createCellMap([
        { x: 0, y: 0 }, // Target is painted
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "TL")).toBe(false);
    });

    it("returns false when one neighbor is missing", () => {
      const cellMap = createCellMap([
        { x: 0, y: -1 }, // Only top neighbor, missing left
      ]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "TL")).toBe(false);
    });

    it("returns false when both neighbors are missing", () => {
      const cellMap = createCellMap([]);
      expect(isValidConcaveCorner(cellMap, 0, 0, "TL")).toBe(false);
    });
  });

  // ===========================================================================
  // findValidCornerForCell
  // ===========================================================================

  describe("findValidCornerForCell", () => {
    it("returns valid corner when found", () => {
      const cellMap = createCellMap([
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ]);
      expect(findValidCornerForCell(cellMap, 0, 0)).toBe("TL");
    });

    it("returns null when no valid corner", () => {
      const cellMap = createCellMap([]);
      expect(findValidCornerForCell(cellMap, 0, 0)).toBeNull();
    });

    it("respects preferred corner", () => {
      // Both TL and BR are valid
      const cellMap = createCellMap([
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 1, y: 0 },
      ]);
      expect(findValidCornerForCell(cellMap, 0, 0, "BR")).toBe("BR");
    });
  });

  // ===========================================================================
  // findNearestValidCorner
  // ===========================================================================

  describe("findNearestValidCorner", () => {
    it("returns current cell if valid", () => {
      const cellMap = createCellMap([
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ]);
      const result = findNearestValidCorner(cellMap, 0, 0, "TL");
      expect(result).toEqual({ x: 0, y: 0, corner: "TL" });
    });

    it("finds valid corner in nearby cell", () => {
      // Valid corner at (1, 1)
      const cellMap = createCellMap([
        { x: 1, y: 0 }, // Top neighbor of (1,1)
        { x: 0, y: 1 }, // Left neighbor of (1,1)
      ]);
      const result = findNearestValidCorner(cellMap, 0, 0, "TL", 2);
      expect(result).toEqual({ x: 1, y: 1, corner: "TL" });
    });

    it("returns null when no valid corner in radius", () => {
      const cellMap = createCellMap([]);
      expect(findNearestValidCorner(cellMap, 0, 0, "TL", 2)).toBeNull();
    });
  });

  // ===========================================================================
  // isValid45Diagonal
  // ===========================================================================

  describe("isValid45Diagonal", () => {
    it("returns true for valid diagonal going down-right", () => {
      expect(isValid45Diagonal(0, 0, 3, 3)).toBe(true);
    });

    it("returns true for valid diagonal going down-left", () => {
      expect(isValid45Diagonal(3, 0, 0, 3)).toBe(true);
    });

    it("returns true for valid diagonal going up-right", () => {
      expect(isValid45Diagonal(0, 3, 3, 0)).toBe(true);
    });

    it("returns true for valid diagonal going up-left", () => {
      expect(isValid45Diagonal(3, 3, 0, 0)).toBe(true);
    });

    it("returns false for horizontal line", () => {
      expect(isValid45Diagonal(0, 0, 3, 0)).toBe(false);
    });

    it("returns false for vertical line", () => {
      expect(isValid45Diagonal(0, 0, 0, 3)).toBe(false);
    });

    it("returns false for non-45 angle", () => {
      expect(isValid45Diagonal(0, 0, 3, 2)).toBe(false);
    });

    it("returns false for same point", () => {
      expect(isValid45Diagonal(2, 2, 2, 2)).toBe(false);
    });

    it("returns true for single step diagonal", () => {
      expect(isValid45Diagonal(0, 0, 1, 1)).toBe(true);
    });
  });

  // ===========================================================================
  // getDiagonalDirection
  // ===========================================================================

  describe("getDiagonalDirection", () => {
    it("returns TL-BR for down-right diagonal", () => {
      expect(getDiagonalDirection(0, 0, 3, 3)).toBe("TL-BR");
    });

    it("returns TL-BR for up-left diagonal", () => {
      expect(getDiagonalDirection(3, 3, 0, 0)).toBe("TL-BR");
    });

    it("returns TR-BL for down-left diagonal", () => {
      expect(getDiagonalDirection(3, 0, 0, 3)).toBe("TR-BL");
    });

    it("returns TR-BL for up-right diagonal", () => {
      expect(getDiagonalDirection(0, 3, 3, 0)).toBe("TR-BL");
    });

    it("returns null for non-diagonal", () => {
      expect(getDiagonalDirection(0, 0, 3, 0)).toBeNull();
    });

    it("returns null for same point", () => {
      expect(getDiagonalDirection(2, 2, 2, 2)).toBeNull();
    });
  });

  // ===========================================================================
  // cornerMatchesDiagonal
  // ===========================================================================

  describe("cornerMatchesDiagonal", () => {
    it("TL matches TL-BR direction", () => {
      // TL corner creates TR-BL diagonal (fills going the other way)
      expect(cornerMatchesDiagonal("TL", "TR-BL")).toBe(true);
    });

    it("BR matches TL-BR direction", () => {
      // BR corner creates TR-BL diagonal
      expect(cornerMatchesDiagonal("BR", "TR-BL")).toBe(true);
    });

    it("TR matches TR-BL direction", () => {
      // TR corner creates TL-BR diagonal
      expect(cornerMatchesDiagonal("TR", "TL-BR")).toBe(true);
    });

    it("BL matches TR-BL direction", () => {
      // BL corner creates TL-BR diagonal
      expect(cornerMatchesDiagonal("BL", "TL-BR")).toBe(true);
    });
  });

  // ===========================================================================
  // getCellsAlongDiagonal
  // ===========================================================================

  describe("getCellsAlongDiagonal", () => {
    it("returns cells along down-right diagonal", () => {
      const cells = getCellsAlongDiagonal(0, 0, 3, 3);
      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 0, y: 0 });
      expect(cells[1]).toEqual({ x: 1, y: 1 });
      expect(cells[2]).toEqual({ x: 2, y: 2 });
      expect(cells[3]).toEqual({ x: 3, y: 3 });
    });

    it("returns cells along up-left diagonal", () => {
      const cells = getCellsAlongDiagonal(3, 3, 0, 0);
      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 3, y: 3 });
      expect(cells[3]).toEqual({ x: 0, y: 0 });
    });

    it("returns cells along down-left diagonal", () => {
      const cells = getCellsAlongDiagonal(3, 0, 0, 3);
      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 3, y: 0 });
      expect(cells[1]).toEqual({ x: 2, y: 1 });
      expect(cells[2]).toEqual({ x: 1, y: 2 });
      expect(cells[3]).toEqual({ x: 0, y: 3 });
    });

    it("returns single point for same start and end", () => {
      const cells = getCellsAlongDiagonal(2, 2, 2, 2);
      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 2, y: 2 });
    });

    it("returns empty for non-diagonal", () => {
      const cells = getCellsAlongDiagonal(0, 0, 3, 0);
      expect(cells).toHaveLength(0);
    });
  });

  // ===========================================================================
  // getValidCornersAlongDiagonal
  // ===========================================================================

  describe("getValidCornersAlongDiagonal", () => {
    it("returns valid corners along path", () => {
      // Create staircase pattern where (0,0), (1,1), (2,2) are valid TL corners
      const cellMap = createCellMap([
        // Neighbors for (0,0) TL
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        // Neighbors for (1,1) TL
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        // Neighbors for (2,2) TL
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ]);
      const result = getValidCornersAlongDiagonal(cellMap, 0, 0, 2, 2, "TL");
      expect(result).toHaveLength(3);
    });

    it("filters out painted cells", () => {
      const cellMap = createCellMap([
        // Make (1,1) painted
        { x: 1, y: 1 },
        // Neighbors for (0,0) TL
        { x: 0, y: -1 },
        { x: -1, y: 0 },
        // Neighbors for (2,2) TL
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ]);
      const result = getValidCornersAlongDiagonal(cellMap, 0, 0, 2, 2, "TL");
      // Should only include (0,0) and (2,2), not (1,1)
      expect(result.some((r) => r.x === 1 && r.y === 1)).toBe(false);
    });
  });

  // ===========================================================================
  // getInheritedColor
  // ===========================================================================

  describe("getInheritedColor", () => {
    it("returns color from neighbor", () => {
      const cellMap = createCellMap([
        { x: 0, y: -1, color: "#00ff00", opacity: 0.8 },
        { x: -1, y: 0, color: "#ff0000" },
      ]);
      const result = getInheritedColor(cellMap, 0, 0, "TL");
      expect(result).not.toBeNull();
      expect(result!.color).toBe("#00ff00");
      expect(result!.opacity).toBe(0.8);
    });

    it("returns null when no neighbors", () => {
      const cellMap = createCellMap([]);
      expect(getInheritedColor(cellMap, 0, 0, "TL")).toBeNull();
    });

    it("defaults opacity to 1", () => {
      const cellMap = createCellMap([{ x: 0, y: -1, color: "#00ff00" }]);
      const result = getInheritedColor(cellMap, 0, 0, "TL");
      expect(result!.opacity).toBe(1);
    });
  });

  // ===========================================================================
  // getSegmentsForCorner
  // ===========================================================================

  describe("getSegmentsForCorner", () => {
    it("returns 4 segments for TL corner", () => {
      const segments = getSegmentsForCorner("TL");
      expect(segments).toHaveLength(4);
      // TL: ['n', 'nw', 'w', 'sw']
      expect(segments).toContain("n");
      expect(segments).toContain("nw");
      expect(segments).toContain("w");
      expect(segments).toContain("sw");
    });

    it("returns 4 segments for TR corner", () => {
      const segments = getSegmentsForCorner("TR");
      expect(segments).toHaveLength(4);
    });

    it("returns 4 segments for BR corner", () => {
      const segments = getSegmentsForCorner("BR");
      expect(segments).toHaveLength(4);
    });

    it("returns 4 segments for BL corner", () => {
      const segments = getSegmentsForCorner("BL");
      expect(segments).toHaveLength(4);
    });
  });

  // ===========================================================================
  // validateDiagonalPath
  // ===========================================================================

  describe("validateDiagonalPath", () => {
    it("returns null when start is null", () => {
      const cellMap = createCellMap([]);
      expect(validateDiagonalPath(cellMap, null, 5, 5)).toBeNull();
    });

    it("validates single cell when target equals start", () => {
      const cellMap = createCellMap([
        { x: 0, y: -1 },
        { x: -1, y: 0 },
      ]);
      const start = { x: 0, y: 0, corner: "TL" as const };
      const result = validateDiagonalPath(cellMap, start, 0, 0);
      expect(result).toEqual({ valid: true, endX: 0, endY: 0, cellCount: 1 });
    });

    it("returns null when start is not valid and target is same", () => {
      const cellMap = createCellMap([]);
      const start = { x: 0, y: 0, corner: "TL" as const };
      expect(validateDiagonalPath(cellMap, start, 0, 0)).toBeNull();
    });
  });
});
