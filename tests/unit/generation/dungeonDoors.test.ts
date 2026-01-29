import { describe, it, expect } from "vitest";
import {
  isAtCorridorIntersection,
  isCellAdjacentToRoomForOpening,
  isCellInRoom,
  calculateRoomOpeningWidth,
  generateWallEdgesForCells,
  generateAllRoomBoundaryEdges,
} from "../../../src/generation/dungeonGenerator.js";

// Helper to create a simple rectangular room
function createRoom(id: string, x: number, y: number, width: number, height: number) {
  return { id, x, y, width, height, shape: "rectangle" };
}

// Helper to create a corridor cell set from coordinate pairs
function createCorridorSet(cells: Array<{ x: number; y: number }>): Set<string> {
  return new Set(cells.map((c) => `${c.x},${c.y}`));
}

describe("dungeonDoors", () => {
  describe("isAtCorridorIntersection", () => {
    it("returns true for 4-way intersection", () => {
      // Cross pattern: center with N, S, E, W neighbors
      const corridorSet = createCorridorSet([
        { x: 5, y: 4 }, // north
        { x: 5, y: 6 }, // south
        { x: 4, y: 5 }, // west
        { x: 6, y: 5 }, // east
        { x: 5, y: 5 }, // center
      ]);
      const rooms: any[] = [];
      const pos = { x: 5, y: 5 };

      expect(isAtCorridorIntersection(pos, corridorSet, rooms)).toBe(true);
    });

    it("returns false for T-junction (missing one direction)", () => {
      // T-junction: N, S, E but no W
      const corridorSet = createCorridorSet([
        { x: 5, y: 4 }, // north
        { x: 5, y: 6 }, // south
        { x: 6, y: 5 }, // east
        { x: 5, y: 5 }, // center
      ]);
      const rooms: any[] = [];
      const pos = { x: 5, y: 5 };

      expect(isAtCorridorIntersection(pos, corridorSet, rooms)).toBe(false);
    });

    it("returns false for straight horizontal corridor", () => {
      const corridorSet = createCorridorSet([
        { x: 4, y: 5 }, // west
        { x: 5, y: 5 }, // center
        { x: 6, y: 5 }, // east
      ]);
      const rooms: any[] = [];
      const pos = { x: 5, y: 5 };

      expect(isAtCorridorIntersection(pos, corridorSet, rooms)).toBe(false);
    });

    it("returns false for straight vertical corridor", () => {
      const corridorSet = createCorridorSet([
        { x: 5, y: 4 }, // north
        { x: 5, y: 5 }, // center
        { x: 5, y: 6 }, // south
      ]);
      const rooms: any[] = [];
      const pos = { x: 5, y: 5 };

      expect(isAtCorridorIntersection(pos, corridorSet, rooms)).toBe(false);
    });

    it("returns false when position is inside a room", () => {
      // Even with 4-way corridor pattern, position inside room is not an intersection
      const corridorSet = createCorridorSet([
        { x: 5, y: 4 },
        { x: 5, y: 6 },
        { x: 4, y: 5 },
        { x: 6, y: 5 },
        { x: 5, y: 5 },
      ]);
      // Room covers the center position
      const rooms = [createRoom("room1", 4, 4, 3, 3)];
      const pos = { x: 5, y: 5 };

      expect(isAtCorridorIntersection(pos, corridorSet, rooms)).toBe(false);
    });
  });

  describe("isCellAdjacentToRoomForOpening", () => {
    const room = createRoom("room1", 5, 5, 3, 3); // Room from (5,5) to (7,7)

    it("returns true when cell is orthogonally adjacent to room (north)", () => {
      // Cell at (6, 4) is north of room
      expect(isCellAdjacentToRoomForOpening(6, 4, room)).toBe(true);
    });

    it("returns true when cell is orthogonally adjacent to room (south)", () => {
      // Cell at (6, 8) is south of room
      expect(isCellAdjacentToRoomForOpening(6, 8, room)).toBe(true);
    });

    it("returns true when cell is orthogonally adjacent to room (west)", () => {
      // Cell at (4, 6) is west of room
      expect(isCellAdjacentToRoomForOpening(4, 6, room)).toBe(true);
    });

    it("returns true when cell is orthogonally adjacent to room (east)", () => {
      // Cell at (8, 6) is east of room
      expect(isCellAdjacentToRoomForOpening(8, 6, room)).toBe(true);
    });

    it("returns false when cell is diagonal to room corner", () => {
      // Cell at (4, 4) is diagonal to room corner
      expect(isCellAdjacentToRoomForOpening(4, 4, room)).toBe(false);
    });

    it("returns false when cell is far from room", () => {
      expect(isCellAdjacentToRoomForOpening(0, 0, room)).toBe(false);
    });

    it("returns true when cell is inside room (has neighbors inside)", () => {
      // Cell at (6, 6) is inside room - it has neighbors inside
      expect(isCellAdjacentToRoomForOpening(6, 6, room)).toBe(true);
    });
  });

  describe("isCellInRoom", () => {
    const room = createRoom("room1", 5, 5, 3, 3);

    it("returns true for cell inside room", () => {
      expect(isCellInRoom(6, 6, room)).toBe(true);
    });

    it("returns true for cell at room corner", () => {
      expect(isCellInRoom(5, 5, room)).toBe(true);
      expect(isCellInRoom(7, 7, room)).toBe(true);
    });

    it("returns false for cell outside room", () => {
      expect(isCellInRoom(4, 5, room)).toBe(false);
      expect(isCellInRoom(8, 5, room)).toBe(false);
    });
  });

  describe("calculateRoomOpeningWidth", () => {
    const room = createRoom("room1", 5, 5, 4, 4); // Room from (5,5) to (8,8)

    it("returns width 1 for single-cell opening", () => {
      // Single corridor cell adjacent to room
      const carvedCellSet = createCorridorSet([{ x: 6, y: 4 }]);
      const doorPos = { x: 6, y: 4 };

      const result = calculateRoomOpeningWidth(doorPos, room, carvedCellSet, "north", null);

      expect(result.width).toBe(1);
      expect(result.cells).toHaveLength(1);
    });

    it("returns width 3 for 3-cell wide horizontal opening", () => {
      // 3 corridor cells in a row, all adjacent to room's north side
      const carvedCellSet = createCorridorSet([
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        { x: 7, y: 4 },
      ]);
      const doorPos = { x: 6, y: 4 };

      const result = calculateRoomOpeningWidth(doorPos, room, carvedCellSet, "north", null);

      expect(result.width).toBe(3);
      expect(result.cells).toHaveLength(3);
    });

    it("stops at non-corridor cells", () => {
      // Gap in corridor cells
      const carvedCellSet = createCorridorSet([
        { x: 5, y: 4 },
        { x: 6, y: 4 },
        // gap at (7, 4)
        { x: 8, y: 4 },
      ]);
      const doorPos = { x: 6, y: 4 };

      const result = calculateRoomOpeningWidth(doorPos, room, carvedCellSet, "north", null);

      expect(result.width).toBe(2); // Only contiguous cells
    });

    it("handles east/west alignments with vertical scan", () => {
      // Corridor cells along room's east side
      const carvedCellSet = createCorridorSet([
        { x: 9, y: 5 },
        { x: 9, y: 6 },
        { x: 9, y: 7 },
      ]);
      const doorPos = { x: 9, y: 6 };

      const result = calculateRoomOpeningWidth(doorPos, room, carvedCellSet, "east", null);

      expect(result.width).toBe(3);
    });

    it("stops when cells are no longer adjacent to room", () => {
      // Corridor extends beyond room edge
      const carvedCellSet = createCorridorSet([
        { x: 4, y: 4 }, // not adjacent to room
        { x: 5, y: 4 }, // adjacent
        { x: 6, y: 4 }, // adjacent
        { x: 7, y: 4 }, // adjacent
        { x: 8, y: 4 }, // adjacent
        { x: 9, y: 4 }, // not adjacent to room
      ]);
      const doorPos = { x: 6, y: 4 };

      const result = calculateRoomOpeningWidth(doorPos, room, carvedCellSet, "north", null);

      expect(result.width).toBe(4); // Only cells adjacent to room
    });
  });

  describe("generateWallEdgesForCells", () => {
    it("generates bottom edges for north alignment", () => {
      const cells = [{ x: 5, y: 4 }, { x: 6, y: 4 }];
      const edges = generateWallEdgesForCells(cells, "north");

      expect(edges).toHaveLength(2);
      // North alignment = wall on north side = bottom edge of cell above
      expect(edges[0]).toMatchObject({ x: 5, y: 3, side: "bottom" });
      expect(edges[1]).toMatchObject({ x: 6, y: 3, side: "bottom" });
    });

    it("generates bottom edges for south alignment", () => {
      const cells = [{ x: 5, y: 8 }];
      const edges = generateWallEdgesForCells(cells, "south");

      expect(edges).toHaveLength(1);
      // South alignment = bottom edge of this cell
      expect(edges[0]).toMatchObject({ x: 5, y: 8, side: "bottom" });
    });

    it("generates right edges for east alignment", () => {
      const cells = [{ x: 9, y: 5 }];
      const edges = generateWallEdgesForCells(cells, "east");

      expect(edges).toHaveLength(1);
      // East alignment = right edge of this cell
      expect(edges[0]).toMatchObject({ x: 9, y: 5, side: "right" });
    });

    it("generates right edges for west alignment", () => {
      const cells = [{ x: 4, y: 5 }];
      const edges = generateWallEdgesForCells(cells, "west");

      expect(edges).toHaveLength(1);
      // West alignment = right edge of cell to the left
      expect(edges[0]).toMatchObject({ x: 3, y: 5, side: "right" });
    });

    it("includes wall color in edges", () => {
      const cells = [{ x: 5, y: 4 }];
      const edges = generateWallEdgesForCells(cells, "north");

      expect(edges[0].color).toBe("#333333");
    });
  });

  describe("generateAllRoomBoundaryEdges", () => {
    it("generates edges for corridor cells adjacent to rooms", () => {
      const rooms = [createRoom("room1", 5, 5, 3, 3)];
      // Corridor cell north of room
      const corridorCellSet = createCorridorSet([{ x: 6, y: 4 }]);
      const doorPositions: any[] = [];

      const edges = generateAllRoomBoundaryEdges(rooms, corridorCellSet, doorPositions);

      expect(edges.length).toBeGreaterThan(0);
      // Should have bottom edge on cell (6, 4) to close off room from corridor
      const hasExpectedEdge = edges.some(
        (e: any) => e.x === 6 && e.y === 4 && e.side === "bottom"
      );
      expect(hasExpectedEdge).toBe(true);
    });

    it("skips cells with doors", () => {
      const rooms = [createRoom("room1", 5, 5, 3, 3)];
      const corridorCellSet = createCorridorSet([
        { x: 6, y: 4 },
        { x: 7, y: 4 },
      ]);
      // Door at (6, 4)
      const doorPositions = [{ x: 6, y: 4 }];

      const edges = generateAllRoomBoundaryEdges(rooms, corridorCellSet, doorPositions);

      // Should NOT have edge at door position (6, 4)
      const hasDoorEdge = edges.some((e: any) => e.x === 6 && e.y === 4);
      expect(hasDoorEdge).toBe(false);

      // Should have edge at non-door position (7, 4)
      const hasOtherEdge = edges.some((e: any) => e.x === 7 && e.y === 4);
      expect(hasOtherEdge).toBe(true);
    });

    it("deduplicates edges", () => {
      // Two rooms sharing a corridor cell - should not duplicate edges
      const rooms = [
        createRoom("room1", 5, 5, 2, 2),
        createRoom("room2", 5, 8, 2, 2),
      ];
      // Corridor between them
      const corridorCellSet = createCorridorSet([{ x: 5, y: 7 }]);
      const doorPositions: any[] = [];

      const edges = generateAllRoomBoundaryEdges(rooms, corridorCellSet, doorPositions);

      // Check for duplicate edges
      const edgeKeys = edges.map((e: any) => `${e.x},${e.y},${e.side}`);
      const uniqueKeys = new Set(edgeKeys);
      expect(edgeKeys.length).toBe(uniqueKeys.size);
    });

    it("returns empty array when no corridor cells adjacent to rooms", () => {
      const rooms = [createRoom("room1", 5, 5, 3, 3)];
      // Corridor far from room
      const corridorCellSet = createCorridorSet([{ x: 0, y: 0 }]);
      const doorPositions: any[] = [];

      const edges = generateAllRoomBoundaryEdges(rooms, corridorCellSet, doorPositions);

      expect(edges).toHaveLength(0);
    });
  });
});
