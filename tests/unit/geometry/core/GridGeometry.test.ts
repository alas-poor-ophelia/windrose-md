/**
 * GridGeometry Unit Tests
 *
 * Tests coordinate transformations and geometric calculations for square grids.
 * Imports directly from GridGeometry.ts - transformer handles Datacore → ESM conversion.
 */

import { describe, it, expect, beforeEach } from "vitest";

// Import GridGeometry class directly - transformer handles conversion
import { GridGeometry } from "../../../../src/geometry/core/GridGeometry";

// Standard cell size for tests
const CELL_SIZE = 40;

describe("GridGeometry", () => {
  let geometry: InstanceType<typeof GridGeometry>;

  beforeEach(() => {
    geometry = new GridGeometry(CELL_SIZE);
  });

  // ===========================================================================
  // Coordinate Transformations
  // ===========================================================================

  describe("worldToGrid", () => {
    it("converts world coordinates to grid cell", () => {
      expect(geometry.worldToGrid(0, 0)).toEqual({ x: 0, y: 0 });
      expect(geometry.worldToGrid(40, 40)).toEqual({ x: 1, y: 1 });
      expect(geometry.worldToGrid(80, 120)).toEqual({ x: 2, y: 3 });
    });

    it("floors coordinates to get cell (not rounds)", () => {
      expect(geometry.worldToGrid(39, 39)).toEqual({ x: 0, y: 0 });
      expect(geometry.worldToGrid(41, 41)).toEqual({ x: 1, y: 1 });
    });

    it("handles negative coordinates", () => {
      expect(geometry.worldToGrid(-1, -1)).toEqual({ x: -1, y: -1 });
      expect(geometry.worldToGrid(-40, -40)).toEqual({ x: -1, y: -1 });
      expect(geometry.worldToGrid(-41, -41)).toEqual({ x: -2, y: -2 });
    });

    it("handles fractional world coordinates", () => {
      expect(geometry.worldToGrid(20.5, 30.7)).toEqual({ x: 0, y: 0 });
      expect(geometry.worldToGrid(60.9, 99.1)).toEqual({ x: 1, y: 2 });
    });
  });

  describe("gridToWorld", () => {
    it("converts grid cell to world coordinates (top-left corner)", () => {
      expect(geometry.gridToWorld(0, 0)).toEqual({ worldX: 0, worldY: 0 });
      expect(geometry.gridToWorld(1, 1)).toEqual({ worldX: 40, worldY: 40 });
      expect(geometry.gridToWorld(2, 3)).toEqual({ worldX: 80, worldY: 120 });
    });

    it("handles negative grid coordinates", () => {
      expect(geometry.gridToWorld(-1, -1)).toEqual({ worldX: -40, worldY: -40 });
      expect(geometry.gridToWorld(-2, -3)).toEqual({ worldX: -80, worldY: -120 });
    });
  });

  describe("gridToScreen", () => {
    it("converts grid cell to screen coordinates", () => {
      expect(geometry.gridToScreen(0, 0, 0, 0, 1)).toEqual({ screenX: 0, screenY: 0 });
      expect(geometry.gridToScreen(1, 1, 0, 0, 1)).toEqual({ screenX: 40, screenY: 40 });
    });

    it("accounts for pan offset", () => {
      expect(geometry.gridToScreen(0, 0, 100, 50, 1)).toEqual({ screenX: 100, screenY: 50 });
    });

    it("accounts for zoom", () => {
      expect(geometry.gridToScreen(1, 1, 0, 0, 2)).toEqual({ screenX: 80, screenY: 80 });
    });
  });

  describe("getCellCenter", () => {
    it("returns center of cell in world coordinates", () => {
      expect(geometry.getCellCenter(0, 0)).toEqual({ worldX: 20, worldY: 20 });
      expect(geometry.getCellCenter(1, 1)).toEqual({ worldX: 60, worldY: 60 });
      expect(geometry.getCellCenter(2, 3)).toEqual({ worldX: 100, worldY: 140 });
    });

    it("handles negative coordinates", () => {
      expect(geometry.getCellCenter(-1, -1)).toEqual({ worldX: -20, worldY: -20 });
    });
  });

  describe("round-trip conversions", () => {
    it("worldToGrid(gridToWorld(cell)) === cell", () => {
      for (let x = -5; x <= 5; x++) {
        for (let y = -5; y <= 5; y++) {
          const { worldX, worldY } = geometry.gridToWorld(x, y);
          const result = geometry.worldToGrid(worldX, worldY);
          expect(result).toEqual({ x, y });
        }
      }
    });

    it("gridToWorld(worldToGrid(point)) gives top-left of containing cell", () => {
      // Point in cell (1, 2) at position (50, 95)
      const point = geometry.worldToGrid(50, 95);
      expect(point).toEqual({ x: 1, y: 2 });

      const worldPoint = geometry.gridToWorld(point.x, point.y);
      expect(worldPoint).toEqual({ worldX: 40, worldY: 80 });
    });
  });

  // ===========================================================================
  // Shape Algorithms
  // ===========================================================================

  describe("getCellsInRectangle", () => {
    it("returns all cells in rectangular area", () => {
      const cells = geometry.getCellsInRectangle(0, 0, 2, 2);

      expect(cells).toHaveLength(9); // 3x3
      expect(cells).toContainEqual({ x: 0, y: 0 });
      expect(cells).toContainEqual({ x: 2, y: 2 });
    });

    it("handles reversed coordinates", () => {
      const cells1 = geometry.getCellsInRectangle(0, 0, 2, 2);
      const cells2 = geometry.getCellsInRectangle(2, 2, 0, 0);

      expect(cells1).toHaveLength(cells2.length);
    });

    it("handles single cell rectangle", () => {
      const cells = geometry.getCellsInRectangle(5, 5, 5, 5);

      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 5, y: 5 });
    });

    it("handles negative coordinates", () => {
      const cells = geometry.getCellsInRectangle(-1, -1, 1, 1);

      expect(cells).toHaveLength(9); // 3x3
      expect(cells).toContainEqual({ x: -1, y: -1 });
      expect(cells).toContainEqual({ x: 0, y: 0 });
      expect(cells).toContainEqual({ x: 1, y: 1 });
    });
  });

  describe("getCellsInCircle", () => {
    it("returns cells within radius", () => {
      const cells = geometry.getCellsInCircle(5, 5, 2);

      // Circle of radius 2 should include center and neighbors
      expect(cells).toContainEqual({ x: 5, y: 5 }); // center
      expect(cells).toContainEqual({ x: 5, y: 3 }); // 2 up
      expect(cells).toContainEqual({ x: 5, y: 7 }); // 2 down

      // Should NOT include corners at distance > 2
      expect(cells).not.toContainEqual({ x: 3, y: 3 }); // distance ~2.83
    });

    it("handles float center coordinates", () => {
      // Circle centered between cells
      const cells = geometry.getCellsInCircle(5.5, 5.5, 1);

      expect(cells.length).toBeGreaterThan(0);
    });

    it("single cell at radius 0", () => {
      const cells = geometry.getCellsInCircle(5, 5, 0);

      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 5, y: 5 });
    });
  });

  describe("getCellsInLine (Bresenham)", () => {
    it("returns cells along horizontal line", () => {
      const cells = geometry.getCellsInLine(0, 0, 3, 0);

      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 0, y: 0 });
      expect(cells[3]).toEqual({ x: 3, y: 0 });
    });

    it("returns cells along vertical line", () => {
      const cells = geometry.getCellsInLine(0, 0, 0, 3);

      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 0, y: 0 });
      expect(cells[3]).toEqual({ x: 0, y: 3 });
    });

    it("returns cells along diagonal line", () => {
      const cells = geometry.getCellsInLine(0, 0, 3, 3);

      expect(cells).toHaveLength(4);
      expect(cells).toContainEqual({ x: 0, y: 0 });
      expect(cells).toContainEqual({ x: 3, y: 3 });
    });

    it("handles reverse direction", () => {
      const cells = geometry.getCellsInLine(3, 3, 0, 0);

      expect(cells).toHaveLength(4);
      expect(cells[0]).toEqual({ x: 3, y: 3 });
      expect(cells[3]).toEqual({ x: 0, y: 0 });
    });

    it("single cell when start equals end", () => {
      const cells = geometry.getCellsInLine(5, 5, 5, 5);

      expect(cells).toHaveLength(1);
      expect(cells[0]).toEqual({ x: 5, y: 5 });
    });
  });

  // ===========================================================================
  // Distance Calculations
  // ===========================================================================

  describe("distance calculations", () => {
    describe("getManhattanDistance", () => {
      it("calculates Manhattan distance", () => {
        expect(geometry.getManhattanDistance(0, 0, 3, 4)).toBe(7);
        expect(geometry.getManhattanDistance(0, 0, 0, 0)).toBe(0);
        expect(geometry.getManhattanDistance(-2, -2, 2, 2)).toBe(8);
      });
    });

    describe("getEuclideanDistance", () => {
      it("calculates Euclidean distance", () => {
        expect(geometry.getEuclideanDistance(0, 0, 3, 4)).toBe(5); // 3-4-5 triangle
        expect(geometry.getEuclideanDistance(0, 0, 0, 0)).toBe(0);
      });
    });

    describe("getCellDistance with diagonal rules", () => {
      it("equal diagonal rule (Chebyshev)", () => {
        expect(geometry.getCellDistance(0, 0, 3, 3, { diagonalRule: "equal" })).toBe(3);
        expect(geometry.getCellDistance(0, 0, 3, 0, { diagonalRule: "equal" })).toBe(3);
      });

      it("euclidean diagonal rule", () => {
        expect(geometry.getCellDistance(0, 0, 3, 4, { diagonalRule: "euclidean" })).toBe(5);
      });

      it("alternating diagonal rule (D&D 5e style)", () => {
        // 5-10-5-10 pattern: diagonals alternate between 1 and 2
        expect(geometry.getCellDistance(0, 0, 3, 3, { diagonalRule: "alternating" })).toBe(4);
        expect(geometry.getCellDistance(0, 0, 2, 4, { diagonalRule: "alternating" })).toBe(5);
      });

      it("defaults to alternating rule", () => {
        expect(geometry.getCellDistance(0, 0, 3, 3)).toBe(4);
      });
    });
  });

  // ===========================================================================
  // Neighbor Calculations
  // ===========================================================================

  describe("getNeighbors (4-directional)", () => {
    it("returns 4 cardinal neighbors", () => {
      const neighbors = geometry.getNeighbors(5, 5);

      expect(neighbors).toHaveLength(4);
      expect(neighbors).toContainEqual({ x: 6, y: 5 }); // right
      expect(neighbors).toContainEqual({ x: 4, y: 5 }); // left
      expect(neighbors).toContainEqual({ x: 5, y: 6 }); // down
      expect(neighbors).toContainEqual({ x: 5, y: 4 }); // up
    });
  });

  describe("getNeighbors8 (8-directional)", () => {
    it("returns 8 neighbors including diagonals", () => {
      const neighbors = geometry.getNeighbors8(5, 5);

      expect(neighbors).toHaveLength(8);
      // Cardinals
      expect(neighbors).toContainEqual({ x: 6, y: 5 }); // right
      expect(neighbors).toContainEqual({ x: 4, y: 5 }); // left
      expect(neighbors).toContainEqual({ x: 5, y: 6 }); // down
      expect(neighbors).toContainEqual({ x: 5, y: 4 }); // up
      // Diagonals
      expect(neighbors).toContainEqual({ x: 6, y: 4 }); // top-right
      expect(neighbors).toContainEqual({ x: 4, y: 4 }); // top-left
      expect(neighbors).toContainEqual({ x: 6, y: 6 }); // bottom-right
      expect(neighbors).toContainEqual({ x: 4, y: 6 }); // bottom-left
    });
  });

  // ===========================================================================
  // Visible Range
  // ===========================================================================

  describe("getVisibleGridRange", () => {
    it("calculates visible cells for viewport", () => {
      const range = geometry.getVisibleGridRange(0, 0, 400, 300, 1);

      // Note: Math.floor(-0) returns -0, but -0 == 0 in JavaScript
      expect(range.startX == 0).toBe(true);
      expect(range.endX).toBe(10); // 400/40
      expect(range.startY == 0).toBe(true);
      expect(range.endY).toBe(8); // ceil(300/40)
    });

    it("accounts for pan offset", () => {
      const range = geometry.getVisibleGridRange(-80, -40, 400, 300, 1);

      expect(range.startX).toBe(2); // 80/40
      expect(range.startY).toBe(1); // 40/40
    });

    it("accounts for zoom", () => {
      const range = geometry.getVisibleGridRange(0, 0, 400, 300, 2);

      // At zoom 2, cells are 80px, so fewer cells visible
      expect(range.endX).toBe(5); // 400/80
      expect(range.endY).toBe(4); // ceil(300/80)
    });
  });

  // ===========================================================================
  // Cell Properties
  // ===========================================================================

  describe("cellSize property", () => {
    it("returns the configured cell size", () => {
      expect(geometry.cellSize).toBe(CELL_SIZE);
    });
  });

});
