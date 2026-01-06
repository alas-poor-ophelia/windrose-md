/**
 * HexGeometry Unit Tests
 *
 * Tests coordinate transformations and geometric calculations for hexagonal grids.
 * Covers both flat-top and pointy-top orientations.
 *
 * Coordinate Systems:
 * - Axial (q, r): Used in API as Point {x: q, y: r}
 * - World (worldX, worldY): Pixel coordinates
 * - Screen (screenX, screenY): Canvas coordinates with pan/zoom
 */

import { describe, it, expect, beforeEach } from "vitest";

import { HexGeometry } from "../../../src/geometry/HexGeometry.ts";

// Standard hex size for tests (radius from center to vertex)
const HEX_SIZE = 40;

describe("HexGeometry", () => {
  describe("flat-top orientation", () => {
    let geometry: InstanceType<typeof HexGeometry>;

    beforeEach(() => {
      geometry = new HexGeometry(HEX_SIZE, "flat");
    });

    // =========================================================================
    // Construction & Properties
    // =========================================================================

    describe("constructor", () => {
      it("stores hex size and orientation", () => {
        expect(geometry.hexSize).toBe(HEX_SIZE);
        expect(geometry.orientation).toBe("flat");
      });

      it("calculates correct dimensions for flat-top", () => {
        // Flat-top: width = 2 * size, height = sqrt(3) * size
        expect(geometry.width).toBe(HEX_SIZE * 2);
        expect(geometry.height).toBeCloseTo(HEX_SIZE * Math.sqrt(3), 10);
      });

      it("calculates correct spacing for flat-top", () => {
        // Flat-top: horiz = 1.5 * size, vert = sqrt(3) * size
        expect(geometry.horizSpacing).toBe(HEX_SIZE * 1.5);
        expect(geometry.vertSpacing).toBeCloseTo(HEX_SIZE * Math.sqrt(3), 10);
      });
    });

    // =========================================================================
    // Coordinate Transformations
    // =========================================================================

    describe("worldToGrid", () => {
      it("converts origin to (0, 0)", () => {
        const result = geometry.worldToGrid(0, 0);
        expect(result).toEqual({ x: 0, y: 0 });
      });

      it("returns Point {x, y} where x=q, y=r", () => {
        const result = geometry.worldToGrid(0, 0);
        expect(result).toHaveProperty("x");
        expect(result).toHaveProperty("y");
      });

      it("correctly identifies hex at center position", () => {
        // Center of hex (1, 0) for flat-top: worldX = 1.5 * size = 60
        const center = geometry.hexToWorld(1, 0);
        const result = geometry.worldToGrid(center.worldX, center.worldY);
        expect(result.x).toBe(1);
        // Note: -0 == 0 in JavaScript, use == for comparison
        expect(result.y == 0).toBe(true);
      });
    });

    describe("gridToWorld / hexToWorld", () => {
      it("converts origin hex to world origin", () => {
        const result = geometry.gridToWorld(0, 0);
        expect(result.worldX).toBeCloseTo(0, 10);
        expect(result.worldY).toBeCloseTo(0, 10);
      });

      it("hexToWorld is same as gridToWorld", () => {
        const grid = geometry.gridToWorld(2, 3);
        const hex = geometry.hexToWorld(2, 3);
        expect(grid).toEqual(hex);
      });

      it("getCellCenter returns same as gridToWorld", () => {
        const grid = geometry.gridToWorld(2, 3);
        const center = geometry.getCellCenter(2, 3);
        expect(grid).toEqual(center);
      });
    });

    describe("round-trip conversions", () => {
      it("worldToGrid(gridToWorld(hex)) === hex", () => {
        for (let q = -3; q <= 3; q++) {
          for (let r = -3; r <= 3; r++) {
            const { worldX, worldY } = geometry.gridToWorld(q, r);
            const result = geometry.worldToGrid(worldX, worldY);
            // Note: -0 == 0 in JavaScript, use == for comparison
            expect(result.x == q).toBe(true);
            expect(result.y == r).toBe(true);
          }
        }
      });
    });

    describe("gridToScreen", () => {
      it("converts with no offset and zoom 1", () => {
        const result = geometry.gridToScreen(0, 0, 0, 0, 1);
        // Should be near origin (adjusted for hex top-left vs center)
        expect(result).toHaveProperty("screenX");
        expect(result).toHaveProperty("screenY");
      });

      it("accounts for pan offset", () => {
        const base = geometry.gridToScreen(0, 0, 0, 0, 1);
        const panned = geometry.gridToScreen(0, 0, 100, 50, 1);
        expect(panned.screenX).toBe(base.screenX + 100);
        expect(panned.screenY).toBe(base.screenY + 50);
      });

      it("accounts for zoom", () => {
        const zoom1 = geometry.gridToScreen(1, 0, 0, 0, 1);
        const zoom2 = geometry.gridToScreen(1, 0, 0, 0, 2);
        // At zoom 2, screen coordinates should be doubled
        expect(zoom2.screenX).toBeCloseTo(zoom1.screenX * 2, 5);
        expect(zoom2.screenY).toBeCloseTo(zoom1.screenY * 2, 5);
      });
    });

    // =========================================================================
    // Hex Rounding
    // =========================================================================

    describe("roundHex", () => {
      it("rounds fractional coordinates to nearest hex", () => {
        // Already integer should stay same
        expect(geometry.roundHex(0, 0)).toEqual({ q: 0, r: 0 });
        expect(geometry.roundHex(1, 0)).toEqual({ q: 1, r: 0 });
      });

      it("rounds 0.5 fractional correctly", () => {
        // Test that cube coordinate constraint (x + y + z = 0) is maintained
        const result = geometry.roundHex(0.5, 0.5);
        // Should round to a valid hex
        expect(Number.isInteger(result.q)).toBe(true);
        expect(Number.isInteger(result.r)).toBe(true);
      });
    });

    // =========================================================================
    // Hex Vertices
    // =========================================================================

    describe("getHexVertices", () => {
      it("returns 6 vertices", () => {
        const vertices = geometry.getHexVertices(0, 0);
        expect(vertices).toHaveLength(6);
      });

      it("vertices are at correct distance from center", () => {
        const center = geometry.hexToWorld(0, 0);
        const vertices = geometry.getHexVertices(0, 0);

        for (const v of vertices) {
          const dx = v.worldX - center.worldX;
          const dy = v.worldY - center.worldY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          expect(distance).toBeCloseTo(HEX_SIZE, 10);
        }
      });

      it("flat-top has vertex at 0 degrees (right)", () => {
        const center = geometry.hexToWorld(0, 0);
        const vertices = geometry.getHexVertices(0, 0);

        // First vertex should be at angle 0 (directly right)
        const firstVertex = vertices[0];
        expect(firstVertex.worldX).toBeCloseTo(center.worldX + HEX_SIZE, 10);
        expect(firstVertex.worldY).toBeCloseTo(center.worldY, 10);
      });
    });

    // =========================================================================
    // Shape Algorithms
    // =========================================================================

    describe("getCellsInRectangle", () => {
      it("returns cells in rectangular area", () => {
        const cells = geometry.getCellsInRectangle(0, 0, 2, 2);
        expect(cells.length).toBeGreaterThan(0);
        expect(cells).toContainEqual({ x: 0, y: 0 });
      });

      it("handles reversed coordinates", () => {
        const cells1 = geometry.getCellsInRectangle(0, 0, 2, 2);
        const cells2 = geometry.getCellsInRectangle(2, 2, 0, 0);
        expect(cells1.length).toBe(cells2.length);
      });

      it("handles single cell", () => {
        const cells = geometry.getCellsInRectangle(1, 1, 1, 1);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toEqual({ x: 1, y: 1 });
      });
    });

    describe("getCellsInCircle", () => {
      it("returns center cell at radius 0", () => {
        const cells = geometry.getCellsInCircle(5, 5, 0);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toEqual({ x: 5, y: 5 });
      });

      it("returns center and neighbors at radius 1", () => {
        const cells = geometry.getCellsInCircle(0, 0, 1);
        expect(cells.length).toBe(7); // center + 6 neighbors
        expect(cells).toContainEqual({ x: 0, y: 0 });
      });

      it("increases cell count with larger radius", () => {
        const r1 = geometry.getCellsInCircle(0, 0, 1);
        const r2 = geometry.getCellsInCircle(0, 0, 2);
        expect(r2.length).toBeGreaterThan(r1.length);
      });
    });

    describe("getCellsInLine", () => {
      it("returns single cell when start equals end", () => {
        const cells = geometry.getCellsInLine(3, 3, 3, 3);
        expect(cells).toHaveLength(1);
        expect(cells[0]).toEqual({ x: 3, y: 3 });
      });

      it("returns cells along a line", () => {
        const cells = geometry.getCellsInLine(0, 0, 3, 0);
        expect(cells.length).toBeGreaterThan(1);
        expect(cells[0]).toEqual({ x: 0, y: 0 });
        expect(cells[cells.length - 1]).toEqual({ x: 3, y: 0 });
      });

      it("handles diagonal lines", () => {
        const cells = geometry.getCellsInLine(0, 0, 2, 2);
        expect(cells.length).toBeGreaterThan(1);
        expect(cells).toContainEqual({ x: 0, y: 0 });
        expect(cells).toContainEqual({ x: 2, y: 2 });
      });
    });

    // =========================================================================
    // Distance Calculations
    // =========================================================================

    describe("getHexDistance", () => {
      it("returns 0 for same hex", () => {
        expect(geometry.getHexDistance(0, 0, 0, 0)).toBe(0);
        expect(geometry.getHexDistance(5, 3, 5, 3)).toBe(0);
      });

      it("returns 1 for adjacent hexes", () => {
        // Direct neighbors in axial coordinates
        expect(geometry.getHexDistance(0, 0, 1, 0)).toBe(1);
        expect(geometry.getHexDistance(0, 0, 0, 1)).toBe(1);
        expect(geometry.getHexDistance(0, 0, 1, -1)).toBe(1);
      });

      it("calculates correct distance for longer paths", () => {
        expect(geometry.getHexDistance(0, 0, 3, 0)).toBe(3);
        expect(geometry.getHexDistance(0, 0, 0, 3)).toBe(3);
      });

      it("handles negative coordinates", () => {
        expect(geometry.getHexDistance(-1, -1, 1, 1)).toBe(4);
      });
    });

    describe("distance aliases", () => {
      it("getEuclideanDistance returns hex distance", () => {
        expect(geometry.getEuclideanDistance(0, 0, 2, 1)).toBe(
          geometry.getHexDistance(0, 0, 2, 1)
        );
      });

      it("getManhattanDistance returns hex distance", () => {
        expect(geometry.getManhattanDistance(0, 0, 2, 1)).toBe(
          geometry.getHexDistance(0, 0, 2, 1)
        );
      });

      it("getCellDistance returns hex distance (ignores options)", () => {
        const dist = geometry.getCellDistance(0, 0, 2, 1, {
          diagonalRule: "equal",
        });
        expect(dist).toBe(geometry.getHexDistance(0, 0, 2, 1));
      });
    });

    // =========================================================================
    // Neighbors
    // =========================================================================

    describe("getNeighbors", () => {
      it("returns 6 neighbors", () => {
        const neighbors = geometry.getNeighbors(0, 0);
        expect(neighbors).toHaveLength(6);
      });

      it("returns correct neighbor positions", () => {
        const neighbors = geometry.getNeighbors(0, 0);

        // Axial neighbor directions
        expect(neighbors).toContainEqual({ x: 1, y: 0 });
        expect(neighbors).toContainEqual({ x: 1, y: -1 });
        expect(neighbors).toContainEqual({ x: 0, y: -1 });
        expect(neighbors).toContainEqual({ x: -1, y: 0 });
        expect(neighbors).toContainEqual({ x: -1, y: 1 });
        expect(neighbors).toContainEqual({ x: 0, y: 1 });
      });

      it("all neighbors are at distance 1", () => {
        const neighbors = geometry.getNeighbors(5, 3);
        for (const n of neighbors) {
          expect(geometry.getHexDistance(5, 3, n.x, n.y)).toBe(1);
        }
      });
    });

    // =========================================================================
    // Bounds
    // =========================================================================

    describe("bounds handling (unbounded)", () => {
      it("isBounded returns false when no bounds set", () => {
        expect(geometry.isBounded()).toBe(false);
      });

      it("getBounds returns null when unbounded", () => {
        expect(geometry.getBounds()).toBeNull();
      });

      it("isWithinBounds always returns true when unbounded", () => {
        expect(geometry.isWithinBounds(0, 0)).toBe(true);
        expect(geometry.isWithinBounds(100, 100)).toBe(true);
        expect(geometry.isWithinBounds(-50, -50)).toBe(true);
      });

      it("clampToBounds returns same coords when unbounded", () => {
        expect(geometry.clampToBounds(5, 10)).toEqual({ x: 5, y: 10 });
      });
    });

    describe("bounds handling (bounded)", () => {
      let boundedGeometry: InstanceType<typeof HexGeometry>;

      beforeEach(() => {
        boundedGeometry = new HexGeometry(HEX_SIZE, "flat", {
          maxCol: 10,
          maxRow: 10,
        });
      });

      it("isBounded returns true when bounds set", () => {
        expect(boundedGeometry.isBounded()).toBe(true);
      });

      it("getBounds returns the bounds", () => {
        expect(boundedGeometry.getBounds()).toEqual({ maxCol: 10, maxRow: 10 });
      });

      it("isWithinBounds validates correctly", () => {
        // Origin should be within bounds
        expect(boundedGeometry.isWithinBounds(0, 0)).toBe(true);
      });
    });

    // =========================================================================
    // Cell Operations
    // =========================================================================

    describe("createCellObject", () => {
      it("creates hex cell with q, r from x, y", () => {
        const cell = geometry.createCellObject({ x: 3, y: 5 }, "#ff0000");
        expect(cell).toEqual({ q: 3, r: 5, color: "#ff0000" });
      });
    });

    describe("cellMatchesCoords", () => {
      it("matches hex cell format (q, r)", () => {
        const cell = { q: 3, r: 5, color: "#ff0000" };
        expect(geometry.cellMatchesCoords(cell, { x: 3, y: 5 })).toBe(true);
        expect(geometry.cellMatchesCoords(cell, { x: 3, y: 6 })).toBe(false);
      });

      it("matches grid cell format (x, y)", () => {
        const cell = { x: 3, y: 5, color: "#ff0000" };
        expect(geometry.cellMatchesCoords(cell, { x: 3, y: 5 })).toBe(true);
        expect(geometry.cellMatchesCoords(cell, { x: 4, y: 5 })).toBe(false);
      });
    });

    // =========================================================================
    // Offset Coordinates
    // =========================================================================

    describe("toOffsetCoords", () => {
      it("converts axial to offset coordinates", () => {
        const offset = geometry.toOffsetCoords(0, 0);
        expect(offset).toHaveProperty("col");
        expect(offset).toHaveProperty("row");
      });
    });

    describe("cellToOffsetCoords", () => {
      it("handles hex cell format", () => {
        const cell = { q: 2, r: 3, color: "#ff0000" };
        const offset = geometry.cellToOffsetCoords(cell);
        expect(offset).toHaveProperty("col");
        expect(offset).toHaveProperty("row");
      });

      it("handles grid cell format", () => {
        const cell = { x: 2, y: 3, color: "#ff0000" };
        const offset = geometry.cellToOffsetCoords(cell);
        expect(offset).toHaveProperty("col");
        expect(offset).toHaveProperty("row");
      });
    });
  });

  // ===========================================================================
  // Pointy-Top Orientation
  // ===========================================================================

  describe("pointy-top orientation", () => {
    let geometry: InstanceType<typeof HexGeometry>;

    beforeEach(() => {
      geometry = new HexGeometry(HEX_SIZE, "pointy");
    });

    describe("constructor", () => {
      it("stores pointy orientation", () => {
        expect(geometry.orientation).toBe("pointy");
      });

      it("calculates correct dimensions for pointy-top", () => {
        // Pointy-top: width = sqrt(3) * size, height = 2 * size
        expect(geometry.width).toBeCloseTo(HEX_SIZE * Math.sqrt(3), 10);
        expect(geometry.height).toBe(HEX_SIZE * 2);
      });

      it("calculates correct spacing for pointy-top", () => {
        // Pointy-top: horiz = sqrt(3) * size, vert = 1.5 * size
        expect(geometry.horizSpacing).toBeCloseTo(HEX_SIZE * Math.sqrt(3), 10);
        expect(geometry.vertSpacing).toBe(HEX_SIZE * 1.5);
      });
    });

    describe("coordinate conversions", () => {
      it("round-trip works for pointy-top", () => {
        for (let q = -2; q <= 2; q++) {
          for (let r = -2; r <= 2; r++) {
            const { worldX, worldY } = geometry.gridToWorld(q, r);
            const result = geometry.worldToGrid(worldX, worldY);
            // Note: -0 == 0 in JavaScript, use == for comparison
            expect(result.x == q).toBe(true);
            expect(result.y == r).toBe(true);
          }
        }
      });
    });

    describe("getHexVertices", () => {
      it("pointy-top has vertex at 30 degrees", () => {
        const center = geometry.hexToWorld(0, 0);
        const vertices = geometry.getHexVertices(0, 0);

        // First vertex should be at angle 30 degrees
        const firstVertex = vertices[0];
        const expectedX = center.worldX + HEX_SIZE * Math.cos(Math.PI / 6);
        const expectedY = center.worldY + HEX_SIZE * Math.sin(Math.PI / 6);
        expect(firstVertex.worldX).toBeCloseTo(expectedX, 10);
        expect(firstVertex.worldY).toBeCloseTo(expectedY, 10);
      });
    });

    describe("neighbors work for pointy-top", () => {
      it("returns 6 neighbors at distance 1", () => {
        const neighbors = geometry.getNeighbors(0, 0);
        expect(neighbors).toHaveLength(6);
        for (const n of neighbors) {
          expect(geometry.getHexDistance(0, 0, n.x, n.y)).toBe(1);
        }
      });
    });
  });

  // ===========================================================================
  // Scaled Size
  // ===========================================================================

  describe("scaled size", () => {
    let geometry: InstanceType<typeof HexGeometry>;

    beforeEach(() => {
      geometry = new HexGeometry(HEX_SIZE, "flat");
    });

    it("getScaledCellSize returns hex size * zoom", () => {
      expect(geometry.getScaledCellSize(1)).toBe(HEX_SIZE);
      expect(geometry.getScaledCellSize(2)).toBe(HEX_SIZE * 2);
      expect(geometry.getScaledCellSize(0.5)).toBe(HEX_SIZE * 0.5);
    });

    it("getScaledHexSize is same as getScaledCellSize", () => {
      expect(geometry.getScaledHexSize(1.5)).toBe(geometry.getScaledCellSize(1.5));
    });
  });
});
