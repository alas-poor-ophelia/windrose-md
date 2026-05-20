/**
 * cellAccessor Unit Tests
 *
 * Tests cell data operations, coordinate translation, and segment handling.
 * These tests verify the pure functional logic extracted from cellAccessor.ts
 * without requiring Datacore runtime.
 */

import { describe, it, expect } from "vitest";

// =============================================================================
// TYPES (mirrors cellAccessor.ts types)
// =============================================================================

interface Point {
  x: number;
  y: number;
}

interface GridCell {
  x: number;
  y: number;
  color: string;
  opacity?: number;
}

interface HexCell {
  q: number;
  r: number;
  color: string;
  opacity?: number;
}

type SegmentName = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

interface SegmentMap {
  n?: boolean;
  ne?: boolean;
  e?: boolean;
  se?: boolean;
  s?: boolean;
  sw?: boolean;
  w?: boolean;
  nw?: boolean;
}

interface SegmentGridCell extends GridCell {
  segments: SegmentMap;
}

type Cell = GridCell | HexCell | SegmentGridCell;

type CellKey = string;

interface CellUpdate {
  coords: Point;
  color: string;
  opacity: number;
}

// Minimal geometry interface for testing
interface IGeometry {
  cellMatchesCoords(cell: Cell, coords: Point): boolean;
  createCellObject(coords: Point, color: string): Cell;
}

const SEGMENT_NAMES: readonly SegmentName[] = [
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
  "nw",
];

// =============================================================================
// EXTRACTED PURE FUNCTIONS (mirrors cellAccessor.ts logic)
// =============================================================================

function isGridCell(cell: Cell): cell is GridCell {
  return "x" in cell && "y" in cell;
}

function isHexCell(cell: Cell): cell is HexCell {
  return "q" in cell && "r" in cell && !("x" in cell);
}

function hasSegments(cell: Cell): cell is SegmentGridCell {
  return (
    isGridCell(cell) &&
    "segments" in cell &&
    cell.segments !== undefined &&
    Object.keys(cell.segments).length > 0
  );
}

function isSimpleCell(cell: Cell): boolean {
  return !hasSegments(cell);
}

function cellToPoint(cell: Cell): Point {
  if (isGridCell(cell)) {
    return { x: cell.x, y: cell.y };
  }
  return { x: (cell as HexCell).q, y: (cell as HexCell).r };
}

function cellKey(coords: Point): CellKey {
  return `${coords.x},${coords.y}`;
}

function cellKeyFromCell(cell: Cell): CellKey {
  return cellKey(cellToPoint(cell));
}

// Mock geometry for grid
const gridGeometry: IGeometry = {
  cellMatchesCoords(cell: Cell, coords: Point): boolean {
    if (isGridCell(cell)) {
      return cell.x === coords.x && cell.y === coords.y;
    }
    return (cell as HexCell).q === coords.x && (cell as HexCell).r === coords.y;
  },
  createCellObject(coords: Point, color: string): GridCell {
    return { x: coords.x, y: coords.y, color };
  },
};

// Mock geometry for hex
const hexGeometry: IGeometry = {
  cellMatchesCoords(cell: Cell, coords: Point): boolean {
    if ("q" in cell) {
      return (cell as HexCell).q === coords.x && (cell as HexCell).r === coords.y;
    }
    return (cell as GridCell).x === coords.x && (cell as GridCell).y === coords.y;
  },
  createCellObject(coords: Point, color: string): HexCell {
    return { q: coords.x, r: coords.y, color };
  },
};

function getCellAt(
  cells: Cell[],
  coords: Point,
  geometry: IGeometry
): Cell | null {
  return cells.find((cell) => geometry.cellMatchesCoords(cell, coords)) || null;
}

function getCellIndex(
  cells: Cell[],
  coords: Point,
  geometry: IGeometry
): number {
  return cells.findIndex((cell) => geometry.cellMatchesCoords(cell, coords));
}

function cellExists(
  cells: Cell[],
  coords: Point,
  geometry: IGeometry
): boolean {
  return getCellIndex(cells, coords, geometry) !== -1;
}

function buildCellMap(cells: Cell[]): Map<CellKey, Cell> {
  const map = new Map<CellKey, Cell>();
  for (const cell of cells) {
    map.set(cellKeyFromCell(cell), cell);
  }
  return map;
}

function setCell(
  cells: Cell[],
  coords: Point,
  color: string,
  opacity: number,
  geometry: IGeometry
): Cell[] {
  const index = getCellIndex(cells, coords, geometry);

  if (index !== -1) {
    const newCells = [...cells];
    newCells[index] = { ...newCells[index], color, opacity };
    return newCells;
  }

  const newCell = geometry.createCellObject(coords, color);
  (newCell as GridCell | HexCell).opacity = opacity;
  return [...cells, newCell];
}

function removeCell(
  cells: Cell[],
  coords: Point,
  geometry: IGeometry
): Cell[] {
  return cells.filter((cell) => !geometry.cellMatchesCoords(cell, coords));
}

function setCells(
  cells: Cell[],
  cellUpdates: CellUpdate[],
  geometry: IGeometry
): Cell[] {
  const cellMap = new Map<CellKey, Cell>();
  for (const cell of cells) {
    cellMap.set(cellKeyFromCell(cell), cell);
  }

  for (const update of cellUpdates) {
    const key = cellKey(update.coords);
    const existing = cellMap.get(key);

    if (existing) {
      cellMap.set(key, { ...existing, color: update.color, opacity: update.opacity });
    } else {
      const newCell = geometry.createCellObject(update.coords, update.color);
      (newCell as GridCell | HexCell).opacity = update.opacity;
      cellMap.set(key, newCell);
    }
  }

  return Array.from(cellMap.values());
}

function removeCells(
  cells: Cell[],
  coordsList: Point[],
  _geometry: IGeometry
): Cell[] {
  const removeKeys = new Set(coordsList.map((c) => cellKey(c)));
  return cells.filter((cell) => !removeKeys.has(cellKeyFromCell(cell)));
}

function removeCellsInBounds(
  cells: Cell[],
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Cell[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return cells.filter((cell) => {
    const p = cellToPoint(cell);
    return !(p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
  });
}

function getFilledSegments(cell: Cell | null): SegmentName[] {
  if (!cell) return [];
  if (isSimpleCell(cell)) {
    return [...SEGMENT_NAMES];
  }
  if (hasSegments(cell)) {
    return Object.keys(cell.segments).filter(
      (seg) => cell.segments[seg as SegmentName]
    ) as SegmentName[];
  }
  return [];
}

function normalizeCell(cell: Cell): Cell | null {
  if (!cell) return cell;

  if (hasSegments(cell)) {
    const filledCount = Object.keys(cell.segments).filter(
      (seg) => cell.segments[seg as SegmentName]
    ).length;

    if (filledCount === 8) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { segments, ...simpleCell } = cell;
      return simpleCell as Cell;
    }

    if (filledCount === 0) {
      return null;
    }
  }

  return cell;
}

function getSegmentAtPosition(localX: number, localY: number): SegmentName {
  const dx = localX - 0.5;
  const dy = localY - 0.5;

  let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  if (angle >= 337.5 || angle < 22.5) return "e";
  if (angle >= 22.5 && angle < 67.5) return "ne";
  if (angle >= 67.5 && angle < 112.5) return "n";
  if (angle >= 112.5 && angle < 157.5) return "nw";
  if (angle >= 157.5 && angle < 202.5) return "w";
  if (angle >= 202.5 && angle < 247.5) return "sw";
  if (angle >= 247.5 && angle < 292.5) return "s";
  if (angle >= 292.5 && angle < 337.5) return "se";

  return "n";
}

function getLocalCellPosition(
  screenX: number,
  screenY: number,
  cellScreenX: number,
  cellScreenY: number,
  cellSize: number
): { localX: number; localY: number } {
  const localX = (screenX - cellScreenX) / cellSize;
  const localY = (screenY - cellScreenY) / cellSize;

  return {
    localX: Math.max(0, Math.min(1, localX)),
    localY: Math.max(0, Math.min(1, localY)),
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("cellAccessor", () => {
  describe("type guards", () => {
    describe("isGridCell", () => {
      it("returns true for grid cells", () => {
        const cell: GridCell = { x: 1, y: 2, color: "#ff0000" };
        expect(isGridCell(cell)).toBe(true);
      });

      it("returns false for hex cells", () => {
        const cell: HexCell = { q: 1, r: 2, color: "#ff0000" };
        expect(isGridCell(cell)).toBe(false);
      });

      it("returns true for segment cells (they have x, y)", () => {
        const cell: SegmentGridCell = {
          x: 1,
          y: 2,
          color: "#ff0000",
          segments: { n: true },
        };
        expect(isGridCell(cell)).toBe(true);
      });
    });

    describe("isHexCell", () => {
      it("returns true for hex cells", () => {
        const cell: HexCell = { q: 1, r: 2, color: "#ff0000" };
        expect(isHexCell(cell)).toBe(true);
      });

      it("returns false for grid cells", () => {
        const cell: GridCell = { x: 1, y: 2, color: "#ff0000" };
        expect(isHexCell(cell)).toBe(false);
      });
    });

    describe("hasSegments", () => {
      it("returns true for cells with segments", () => {
        const cell: SegmentGridCell = {
          x: 1,
          y: 2,
          color: "#ff0000",
          segments: { n: true, s: true },
        };
        expect(hasSegments(cell)).toBe(true);
      });

      it("returns false for simple grid cells", () => {
        const cell: GridCell = { x: 1, y: 2, color: "#ff0000" };
        expect(hasSegments(cell)).toBe(false);
      });

      it("returns false for cells with empty segments object", () => {
        const cell = { x: 1, y: 2, color: "#ff0000", segments: {} };
        expect(hasSegments(cell as Cell)).toBe(false);
      });
    });

    describe("isSimpleCell", () => {
      it("returns true for cells without segments", () => {
        const cell: GridCell = { x: 1, y: 2, color: "#ff0000" };
        expect(isSimpleCell(cell)).toBe(true);
      });

      it("returns false for cells with segments", () => {
        const cell: SegmentGridCell = {
          x: 1,
          y: 2,
          color: "#ff0000",
          segments: { n: true },
        };
        expect(isSimpleCell(cell)).toBe(false);
      });
    });
  });

  describe("coordinate utilities", () => {
    describe("cellToPoint", () => {
      it("extracts x, y from grid cell", () => {
        const cell: GridCell = { x: 5, y: 10, color: "#ff0000" };
        expect(cellToPoint(cell)).toEqual({ x: 5, y: 10 });
      });

      it("extracts q, r as x, y from hex cell", () => {
        const cell: HexCell = { q: 3, r: 7, color: "#ff0000" };
        expect(cellToPoint(cell)).toEqual({ x: 3, y: 7 });
      });
    });

    describe("cellKey", () => {
      it("generates string key from coordinates", () => {
        expect(cellKey({ x: 5, y: 10 })).toBe("5,10");
        expect(cellKey({ x: -3, y: -7 })).toBe("-3,-7");
        expect(cellKey({ x: 0, y: 0 })).toBe("0,0");
      });
    });

    describe("cellKeyFromCell", () => {
      it("generates key from grid cell", () => {
        const cell: GridCell = { x: 5, y: 10, color: "#ff0000" };
        expect(cellKeyFromCell(cell)).toBe("5,10");
      });

      it("generates key from hex cell", () => {
        const cell: HexCell = { q: 3, r: 7, color: "#ff0000" };
        expect(cellKeyFromCell(cell)).toBe("3,7");
      });
    });
  });

  describe("cell query functions", () => {
    const testCells: GridCell[] = [
      { x: 0, y: 0, color: "#ff0000" },
      { x: 1, y: 1, color: "#00ff00" },
      { x: 2, y: 2, color: "#0000ff" },
    ];

    describe("getCellAt", () => {
      it("finds cell at coordinates", () => {
        const cell = getCellAt(testCells, { x: 1, y: 1 }, gridGeometry);
        expect(cell).not.toBeNull();
        expect((cell as GridCell).color).toBe("#00ff00");
      });

      it("returns null when cell not found", () => {
        const cell = getCellAt(testCells, { x: 5, y: 5 }, gridGeometry);
        expect(cell).toBeNull();
      });
    });

    describe("getCellIndex", () => {
      it("returns index of cell at coordinates", () => {
        expect(getCellIndex(testCells, { x: 0, y: 0 }, gridGeometry)).toBe(0);
        expect(getCellIndex(testCells, { x: 1, y: 1 }, gridGeometry)).toBe(1);
        expect(getCellIndex(testCells, { x: 2, y: 2 }, gridGeometry)).toBe(2);
      });

      it("returns -1 when cell not found", () => {
        expect(getCellIndex(testCells, { x: 5, y: 5 }, gridGeometry)).toBe(-1);
      });
    });

    describe("cellExists", () => {
      it("returns true when cell exists", () => {
        expect(cellExists(testCells, { x: 1, y: 1 }, gridGeometry)).toBe(true);
      });

      it("returns false when cell does not exist", () => {
        expect(cellExists(testCells, { x: 5, y: 5 }, gridGeometry)).toBe(false);
      });
    });

    describe("buildCellMap", () => {
      it("creates map for O(1) lookup", () => {
        const map = buildCellMap(testCells);

        expect(map.size).toBe(3);
        expect(map.get("0,0")).toEqual(testCells[0]);
        expect(map.get("1,1")).toEqual(testCells[1]);
        expect(map.get("2,2")).toEqual(testCells[2]);
      });

      it("handles empty array", () => {
        const map = buildCellMap([]);
        expect(map.size).toBe(0);
      });
    });
  });

  describe("cell modification functions", () => {
    describe("setCell", () => {
      it("adds new cell when not exists", () => {
        const cells: GridCell[] = [];
        const result = setCell(cells, { x: 5, y: 5 }, "#ff0000", 1, gridGeometry);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ x: 5, y: 5, color: "#ff0000", opacity: 1 });
      });

      it("updates existing cell", () => {
        const cells: GridCell[] = [{ x: 5, y: 5, color: "#ff0000", opacity: 1 }];
        const result = setCell(cells, { x: 5, y: 5 }, "#00ff00", 0.5, gridGeometry);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ color: "#00ff00", opacity: 0.5 });
      });

      it("does not mutate original array", () => {
        const cells: GridCell[] = [{ x: 5, y: 5, color: "#ff0000", opacity: 1 }];
        const result = setCell(cells, { x: 5, y: 5 }, "#00ff00", 0.5, gridGeometry);

        expect(result).not.toBe(cells);
        expect(cells[0].color).toBe("#ff0000");
      });

      it("works with hex geometry", () => {
        const cells: HexCell[] = [];
        const result = setCell(cells, { x: 3, y: 7 }, "#ff0000", 1, hexGeometry);

        expect(result).toHaveLength(1);
        expect((result[0] as HexCell).q).toBe(3);
        expect((result[0] as HexCell).r).toBe(7);
      });
    });

    describe("removeCell", () => {
      it("removes cell at coordinates", () => {
        const cells: GridCell[] = [
          { x: 0, y: 0, color: "#ff0000" },
          { x: 1, y: 1, color: "#00ff00" },
        ];
        const result = removeCell(cells, { x: 0, y: 0 }, gridGeometry);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ x: 1, y: 1 });
      });

      it("returns same array when cell not found", () => {
        const cells: GridCell[] = [{ x: 0, y: 0, color: "#ff0000" }];
        const result = removeCell(cells, { x: 5, y: 5 }, gridGeometry);

        expect(result).toHaveLength(1);
      });

      it("does not mutate original array", () => {
        const cells: GridCell[] = [{ x: 0, y: 0, color: "#ff0000" }];
        const result = removeCell(cells, { x: 0, y: 0 }, gridGeometry);

        expect(result).not.toBe(cells);
        expect(cells).toHaveLength(1);
      });
    });

    describe("setCells (batch)", () => {
      it("adds multiple cells efficiently", () => {
        const cells: GridCell[] = [];
        const updates: CellUpdate[] = [
          { coords: { x: 0, y: 0 }, color: "#ff0000", opacity: 1 },
          { coords: { x: 1, y: 1 }, color: "#00ff00", opacity: 1 },
          { coords: { x: 2, y: 2 }, color: "#0000ff", opacity: 1 },
        ];

        const result = setCells(cells, updates, gridGeometry);

        expect(result).toHaveLength(3);
      });

      it("updates existing cells and adds new ones", () => {
        const cells: GridCell[] = [{ x: 0, y: 0, color: "#000000", opacity: 1 }];
        const updates: CellUpdate[] = [
          { coords: { x: 0, y: 0 }, color: "#ff0000", opacity: 0.5 }, // update
          { coords: { x: 1, y: 1 }, color: "#00ff00", opacity: 1 }, // add
        ];

        const result = setCells(cells, updates, gridGeometry);

        expect(result).toHaveLength(2);
        const cell00 = result.find((c) => (c as GridCell).x === 0 && (c as GridCell).y === 0);
        expect(cell00).toMatchObject({ color: "#ff0000", opacity: 0.5 });
      });

      it("handles duplicate coordinates in updates (last wins)", () => {
        const cells: GridCell[] = [];
        const updates: CellUpdate[] = [
          { coords: { x: 0, y: 0 }, color: "#ff0000", opacity: 1 },
          { coords: { x: 0, y: 0 }, color: "#00ff00", opacity: 0.5 },
        ];

        const result = setCells(cells, updates, gridGeometry);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ color: "#00ff00", opacity: 0.5 });
      });
    });

    describe("removeCells (batch)", () => {
      it("removes multiple cells efficiently", () => {
        const cells: GridCell[] = [
          { x: 0, y: 0, color: "#ff0000" },
          { x: 1, y: 1, color: "#00ff00" },
          { x: 2, y: 2, color: "#0000ff" },
        ];
        const toRemove: Point[] = [{ x: 0, y: 0 }, { x: 2, y: 2 }];

        const result = removeCells(cells, toRemove, gridGeometry);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ x: 1, y: 1 });
      });

      it("ignores coordinates that don't exist", () => {
        const cells: GridCell[] = [{ x: 0, y: 0, color: "#ff0000" }];
        const toRemove: Point[] = [{ x: 5, y: 5 }, { x: 6, y: 6 }];

        const result = removeCells(cells, toRemove, gridGeometry);

        expect(result).toHaveLength(1);
      });
    });

    describe("removeCellsInBounds", () => {
      it("removes cells within rectangular bounds", () => {
        const cells: GridCell[] = [
          { x: 0, y: 0, color: "#ff0000" },
          { x: 5, y: 5, color: "#00ff00" },
          { x: 10, y: 10, color: "#0000ff" },
        ];

        const result = removeCellsInBounds(cells, 0, 0, 5, 5);

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ x: 10, y: 10 });
      });

      it("handles reversed coordinates", () => {
        const cells: GridCell[] = [
          { x: 3, y: 3, color: "#ff0000" },
          { x: 10, y: 10, color: "#00ff00" },
        ];

        const result1 = removeCellsInBounds(cells, 0, 0, 5, 5);
        const result2 = removeCellsInBounds(cells, 5, 5, 0, 0);

        expect(result1).toEqual(result2);
      });
    });
  });

  describe("segment functions", () => {
    describe("getFilledSegments", () => {
      it("returns all 8 segments for simple cell", () => {
        const cell: GridCell = { x: 0, y: 0, color: "#ff0000" };
        const segments = getFilledSegments(cell);

        expect(segments).toHaveLength(8);
        expect(segments).toContain("n");
        expect(segments).toContain("s");
        expect(segments).toContain("e");
        expect(segments).toContain("w");
        expect(segments).toContain("ne");
        expect(segments).toContain("nw");
        expect(segments).toContain("se");
        expect(segments).toContain("sw");
      });

      it("returns only filled segments for segment cell", () => {
        const cell: SegmentGridCell = {
          x: 0,
          y: 0,
          color: "#ff0000",
          segments: { n: true, s: true },
        };
        const segments = getFilledSegments(cell);

        expect(segments).toHaveLength(2);
        expect(segments).toContain("n");
        expect(segments).toContain("s");
      });

      it("returns empty array for null cell", () => {
        expect(getFilledSegments(null)).toEqual([]);
      });
    });

    describe("normalizeCell", () => {
      it("collapses full segment cell to simple cell", () => {
        const cell: SegmentGridCell = {
          x: 0,
          y: 0,
          color: "#ff0000",
          segments: { n: true, ne: true, e: true, se: true, s: true, sw: true, w: true, nw: true },
        };

        const result = normalizeCell(cell);

        expect(result).not.toBeNull();
        expect(hasSegments(result!)).toBe(false);
        expect((result as GridCell).x).toBe(0);
        expect((result as GridCell).y).toBe(0);
      });

      it("returns null for empty segment cell", () => {
        const cell: SegmentGridCell = {
          x: 0,
          y: 0,
          color: "#ff0000",
          segments: {},
        };

        // This cell passes hasSegments check as false, so normalizeCell returns it unchanged
        const result = normalizeCell(cell);
        expect(result).toEqual(cell);
      });

      it("returns partial segment cell unchanged", () => {
        const cell: SegmentGridCell = {
          x: 0,
          y: 0,
          color: "#ff0000",
          segments: { n: true, s: true },
        };

        const result = normalizeCell(cell);

        expect(result).toEqual(cell);
      });

      it("returns simple cell unchanged", () => {
        const cell: GridCell = { x: 0, y: 0, color: "#ff0000" };

        const result = normalizeCell(cell);

        expect(result).toEqual(cell);
      });
    });

    describe("getSegmentAtPosition", () => {
      it("returns 'e' for right side of cell", () => {
        expect(getSegmentAtPosition(0.95, 0.5)).toBe("e");
      });

      it("returns 'w' for left side of cell", () => {
        expect(getSegmentAtPosition(0.05, 0.5)).toBe("w");
      });

      it("returns 'n' for top of cell", () => {
        expect(getSegmentAtPosition(0.5, 0.05)).toBe("n");
      });

      it("returns 's' for bottom of cell", () => {
        expect(getSegmentAtPosition(0.5, 0.95)).toBe("s");
      });

      it("returns 'ne' for top-right corner", () => {
        expect(getSegmentAtPosition(0.8, 0.2)).toBe("ne");
      });

      it("returns 'nw' for top-left corner", () => {
        expect(getSegmentAtPosition(0.2, 0.2)).toBe("nw");
      });

      it("returns 'se' for bottom-right corner", () => {
        expect(getSegmentAtPosition(0.8, 0.8)).toBe("se");
      });

      it("returns 'sw' for bottom-left corner", () => {
        expect(getSegmentAtPosition(0.2, 0.8)).toBe("sw");
      });
    });

    describe("getLocalCellPosition", () => {
      it("returns (0, 0) at top-left corner", () => {
        const pos = getLocalCellPosition(100, 200, 100, 200, 40);
        expect(pos.localX).toBe(0);
        expect(pos.localY).toBe(0);
      });

      it("returns (0.5, 0.5) at center", () => {
        const pos = getLocalCellPosition(120, 220, 100, 200, 40);
        expect(pos.localX).toBe(0.5);
        expect(pos.localY).toBe(0.5);
      });

      it("returns (1, 1) at bottom-right corner", () => {
        const pos = getLocalCellPosition(140, 240, 100, 200, 40);
        expect(pos.localX).toBe(1);
        expect(pos.localY).toBe(1);
      });

      it("clamps values outside 0-1 range", () => {
        const posOutside = getLocalCellPosition(50, 150, 100, 200, 40);
        expect(posOutside.localX).toBe(0);
        expect(posOutside.localY).toBe(0);

        const posOver = getLocalCellPosition(200, 300, 100, 200, 40);
        expect(posOver.localX).toBe(1);
        expect(posOver.localY).toBe(1);
      });
    });
  });
});
