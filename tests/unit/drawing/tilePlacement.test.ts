/**
 * tilePlacement Unit Tests
 *
 * Two parts:
 * 1. The REAL cell-space ops from src/drawing/tilePlacementOps (brush cells,
 *    Bresenham interpolation, footprint-aware flood fill).
 * 2. Reference semantics for the TileAssignment[] transformations the layer
 *    performs (place/erase/stamp) — kept as documentation of the data shape.
 */

import { describe, it, expect } from "vitest";
import type { TileAssignment } from "../../../types/tiles/tile.types";
import type { WallPath } from "../../../types/core/wallpath.types";
import {
  getBrushCells,
  bresenhamLine,
  floodFillCells,
  buildWallBarrier,
  segmentsIntersect,
  FLOOD_FILL_LIMIT,
} from "../../../src/drawing/tilePlacementOps";
import { flattenWallPath, solidWallPolylines } from "../../../src/geometry/renderers/wallPathRenderer";

// =============================================================================
// Pure helper functions extracted from TilePlacementLayer logic
// =============================================================================

/**
 * Place a tile at hex (q, r) on a given layer. Replaces any existing tile
 * at the same hex+layer; otherwise appends.
 */
function placeTileAtCell(
  currentTiles: TileAssignment[],
  col: number,
  row: number,
  tilesetId: string,
  tileId: string,
  options: {
    rotation?: number;
    flipH?: boolean;
    placement?: "fill" | "overlay";
    fitMode?: "fill" | "contain" | "auto";
  } = {}
): TileAssignment[] {
  const targetPlacement = options.placement || "fill";

  const existingIdx = currentTiles.findIndex(
    (t) => t.col === col && t.row === row && (t.placement || "fill") === targetPlacement
  );

  const newTile: TileAssignment = {
    col,
    row,
    tilesetId,
    tileId,
    rotation: (options.rotation || undefined) as TileAssignment["rotation"],
    flipH: options.flipH || undefined,
    placement: targetPlacement === "fill" ? undefined : targetPlacement,
    fitMode: options.fitMode === "auto" ? undefined : (options.fitMode as TileAssignment["fitMode"]),
  };

  if (existingIdx >= 0) {
    const newTiles = [...currentTiles];
    newTiles[existingIdx] = newTile;
    return newTiles;
  }
  return [...currentTiles, newTile];
}

/**
 * Erase a tile at hex (q, r). Removes overlay first if present,
 * then base on the next call.
 */
function eraseTileAtCell(
  currentTiles: TileAssignment[],
  col: number,
  row: number
): TileAssignment[] {
  // Prefer removing overlay first
  const overlayIdx = currentTiles.findIndex(
    (t) => t.col === col && t.row === row && t.placement === "overlay"
  );
  if (overlayIdx >= 0) {
    return currentTiles.filter((_, i) => i !== overlayIdx);
  }

  // Then remove any remaining tile at that hex (base)
  const newTiles = currentTiles.filter(
    (t) => !(t.col === col && t.row === row)
  );
  return newTiles;
}

/**
 * Place a freeform stamp at world coordinates. Always overlay layer.
 */
function placeStampAtWorld(
  currentTiles: TileAssignment[],
  worldX: number,
  worldY: number,
  col: number,
  row: number,
  tilesetId: string,
  tileId: string,
  options: {
    rotation?: number;
    flipH?: boolean;
    fitMode?: "fill" | "contain" | "auto";
  } = {}
): TileAssignment[] {
  const newTile: TileAssignment = {
    col,
    row,
    tilesetId,
    tileId,
    rotation: (options.rotation || undefined) as TileAssignment["rotation"],
    flipH: options.flipH || undefined,
    placement: "overlay",
    fitMode: options.fitMode === "auto" ? undefined : (options.fitMode as TileAssignment["fitMode"]),
    freeform: true,
    worldX,
    worldY,
  };

  return [...currentTiles, newTile];
}

// =============================================================================
// Test Helpers
// =============================================================================

function baseTile(
  col: number,
  row: number,
  tilesetId = "tileset-1",
  tileId = "grass"
): TileAssignment {
  return { col, row, tilesetId, tileId };
}

function overlayTile(
  col: number,
  row: number,
  tilesetId = "tileset-1",
  tileId = "tree"
): TileAssignment {
  return { col, row, tilesetId, tileId, placement: "overlay" };
}

// =============================================================================
// Real ops (src/drawing/tilePlacementOps)
// =============================================================================

describe("tilePlacementOps", () => {
  describe("getBrushCells", () => {
    it("size 1 returns just the anchor cell", () => {
      expect(getBrushCells(3, -2, 1)).toEqual([{ col: 3, row: -2 }]);
    });

    it("size 3 returns a 3x3 block centered on the anchor", () => {
      const cells = getBrushCells(0, 0, 3);
      expect(cells).toHaveLength(9);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++)
          expect(cells).toContainEqual({ col: dc, row: dr });
    });

    it("even sizes round down to the enclosing odd block (size 2 -> 3x3)", () => {
      expect(getBrushCells(5, 5, 2)).toHaveLength(9);
    });
  });

  describe("bresenhamLine", () => {
    it("includes both endpoints", () => {
      const pts = bresenhamLine(0, 0, 3, 0);
      expect(pts[0]).toEqual({ col: 0, row: 0 });
      expect(pts[pts.length - 1]).toEqual({ col: 3, row: 0 });
      expect(pts).toHaveLength(4);
    });

    it("walks a diagonal without gaps", () => {
      const pts = bresenhamLine(0, 0, 3, 3);
      expect(pts).toEqual([
        { col: 0, row: 0 },
        { col: 1, row: 1 },
        { col: 2, row: 2 },
        { col: 3, row: 3 },
      ]);
    });

    it("degenerate line returns the single cell", () => {
      expect(bresenhamLine(2, 2, 2, 2)).toEqual([{ col: 2, row: 2 }]);
    });
  });

  describe("floodFillCells", () => {
    it("clicking empty fills the connected empty area within 3x map bounds", () => {
      // mapWidth/Height 2 -> cols/rows range -2..4 = 7x7 = 49 cells
      const { cells, aborted } = floodFillCells([], 0, 0, 2, 2);
      expect(cells).toHaveLength(49);
      expect(aborted).toBe(false);
    });

    it("clicking a tile fills only the contiguous same-tile region", () => {
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: "ts", tileId: "grass" },
        { col: 1, row: 0, tilesetId: "ts", tileId: "grass" },
        { col: 2, row: 0, tilesetId: "ts", tileId: "water" },
        { col: 4, row: 0, tilesetId: "ts", tileId: "grass" }, // disconnected
      ];
      const { cells } = floodFillCells(tiles, 0, 0, 10, 10);
      expect(cells).toHaveLength(2);
      expect(cells).toContainEqual({ col: 0, row: 0 });
      expect(cells).toContainEqual({ col: 1, row: 0 });
    });

    it("multi-cell footprints block empty fill across their whole area", () => {
      // A vertical wall of 1x3 props at col 1 splits rows -1..1 locally;
      // fill starting left of the wall must not leak through the span cells.
      const wall: TileAssignment[] = [
        { col: 1, row: -2, tilesetId: "ts", tileId: "wall", spanW: 1, spanH: 5 },
      ];
      const { cells } = floodFillCells(wall, 0, 0, 1, 1);
      // Bounds: cols -1..2, rows -1..2 (4x4=16). The span covers (1,-2)..(1,2),
      // blocking column 1 for all in-bounds rows -1..2 => right column (2,*)
      // is unreachable. Left region = cols -1..0 x rows -1..2 = 8 cells.
      expect(cells).toHaveLength(8);
      expect(cells.every(c => c.col <= 0)).toBe(true);
    });

    it("freeform stamps do not block the fill", () => {
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: "ts", tileId: "tree", freeform: true, worldX: 10, worldY: 10 },
      ];
      const { cells } = floodFillCells(tiles, 0, 0, 2, 2);
      expect(cells).toHaveLength(49);
    });

    it("an unbounded region hits the limit and reports aborted", () => {
      const { cells, aborted } = floodFillCells([], 0, 0, 100, 100);
      expect(aborted).toBe(true);
      // Contract: aborted => the caller (TilePlacementLayer) discards `cells`
      // and places nothing. The accumulated count stops at the limit.
      expect(cells.length).toBe(FLOOD_FILL_LIMIT);
    });

    it("a region exactly the size of the limit is NOT aborted", () => {
      // inBounds carves a square of exactly FLOOD_FILL_LIMIT cells (col 0..X).
      const side = Math.floor(Math.sqrt(FLOOD_FILL_LIMIT)); // 31 -> 961 cells
      const { cells, aborted } = floodFillCells([], 0, 0, 1000, 1000, {
        inBounds: (c, r) => c >= 0 && c < side && r >= 0 && r < side,
      });
      expect(aborted).toBe(false);
      expect(cells).toHaveLength(side * side);
    });

    it("blockedCells stop expansion like walls, even on empty ground", () => {
      // Vertical blocked line at col 1, full height of the -2..4 bounds range,
      // splits the empty area; fill from the left never reaches col > 1.
      const blocked = new Set<string>();
      for (let r = -2; r <= 4; r++) blocked.add(`1,${r}`);
      const { cells } = floodFillCells([], 0, 0, 2, 2, { blockedCells: blocked });
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every(c => c.col < 1)).toBe(true);
    });

    it("a blocked start cell fills nothing", () => {
      const { cells } = floodFillCells([], 0, 0, 2, 2, { blockedCells: new Set(["0,0"]) });
      expect(cells).toHaveLength(0);
    });

    it("inBounds predicate clamps the fill tighter than the rect bounds", () => {
      // Diamond |col|+|row| <= 2 inside generous rect bounds.
      const { cells } = floodFillCells([], 0, 0, 50, 50, {
        inBounds: (c, r) => Math.abs(c) + Math.abs(r) <= 2,
      });
      expect(cells).toHaveLength(13); // 1 + 4 + 8 cells of the diamond
      expect(cells.every(c => Math.abs(c.col) + Math.abs(c.row) <= 2)).toBe(true);
    });

    it("a canCross predicate that rejects a step blocks that neighbour", () => {
      // Refuse to cross from col 0 to col 1 anywhere; fill stays col <= 0.
      const { cells } = floodFillCells([], 0, 0, 1, 1, {
        canCross: (from, to) => !(from.col === 0 && to.col === 1),
      });
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.every(c => c.col <= 0)).toBe(true);
    });
  });

  // ===========================================================================
  // buildWallBarrier — wall-aware flood fill
  // ===========================================================================

  describe("buildWallBarrier", () => {
    // Square-grid adapters: cellSize 10, center at (col+0.5, row+0.5)*10.
    const CS = 10;
    const gridCenter = (col: number, row: number): { x: number; y: number } => ({
      x: (col + 0.5) * CS,
      y: (row + 0.5) * CS,
    });
    const gridWorldToCell = (wx: number, wy: number): { col: number; row: number } => ({
      col: Math.floor(wx / CS),
      row: Math.floor(wy / CS),
    });

    /** Straight wall centerline as a two-point polyline in world coords. */
    const line = (x1: number, y1: number, x2: number, y2: number): [number, number][] => [
      [x1, y1],
      [x2, y2],
    ];

    it("a straight wall blocks crossing between the cells it divides", () => {
      // Vertical wall at world x=10 (the col0|col1 boundary), spanning rows.
      const barrier = buildWallBarrier([line(10, -100, 10, 100)], gridCenter, gridWorldToCell);
      // Horizontal step col0 -> col1 crosses x=10 -> blocked.
      expect(barrier.canCross({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(false);
      // Vertical step within col0 never crosses the wall -> allowed.
      expect(barrier.canCross({ col: 0, row: 0 }, { col: 0, row: 1 })).toBe(true);
    });

    it("a fully-walled room fills exactly its interior", () => {
      // Closed square wall along boundaries x=0,x=30,y=0,y=30 encloses the 3x3
      // interior of cells col 0..2 x row 0..2.
      const room: [number, number][] = [
        [0, 0], [30, 0], [30, 30], [0, 30], [0, 0],
      ];
      const barrier = buildWallBarrier([room], gridCenter, gridWorldToCell);
      const { cells, aborted } = floodFillCells([], 1, 1, 10, 10, { canCross: barrier.canCross });
      expect(aborted).toBe(false);
      expect(cells).toHaveLength(9);
      expect(cells.every(c => c.col >= 0 && c.col <= 2 && c.row >= 0 && c.row <= 2)).toBe(true);
    });

    it("path strips are excluded by the caller's kind filter (paths do not block)", () => {
      // Mirror the layer's collection: only kind === 'wall' becomes a barrier.
      const wall: WallPath = {
        id: "w", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
        vertices: [{ x: 10, y: -100 }, { x: 10, y: 100 }],
      };
      const path: WallPath = {
        id: "p", kind: "path", closed: false, tilesetId: "ts", tileId: "road", widthScale: 1,
        vertices: [{ x: 20, y: -100 }, { x: 20, y: 100 }],
      };
      const polylines = [wall, path]
        .filter(w => w.kind === "wall")
        .map(w => flattenWallPath(w).points);
      const barrier = buildWallBarrier(polylines, gridCenter, gridWorldToCell);
      // Wall at x=10 blocks col0 -> col1.
      expect(barrier.canCross({ col: 0, row: 0 }, { col: 1, row: 0 })).toBe(false);
      // Path at x=20 (col1 -> col2 boundary) was filtered out -> not blocked.
      expect(barrier.canCross({ col: 1, row: 0 }, { col: 2, row: 0 })).toBe(true);
    });

    it("a curved (arc) wall blocks after flattening", () => {
      // Endpoints sit on the col0|col1 boundary (x=10); the arc control bows the
      // segment far right (peak x~30 at y~20). flattenWallPath subdivides it, so
      // the bowed body crosses the x=20 (col1|col2) boundary that the straight
      // endpoints never reach.
      const curved: WallPath = {
        id: "c", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
        vertices: [{ x: 10, y: 0, arc: [50, 10] }, { x: 10, y: 40 }],
      };
      const flat = flattenWallPath(curved);
      expect(flat.points.length).toBeGreaterThan(2); // arc actually subdivided
      const barrier = buildWallBarrier([flat.points], gridCenter, gridWorldToCell);
      // The flattened arc crosses x=20 near y~6 (row 0); crossing col1 -> col2
      // there hits the curve body, not the endpoints.
      expect(barrier.canCross({ col: 1, row: 0 }, { col: 2, row: 0 })).toBe(false);
      // A straight wall between the same endpoints (x=10) would NOT block this.
      const straight = buildWallBarrier([line(10, 0, 10, 40)], gridCenter, gridWorldToCell);
      expect(straight.canCross({ col: 1, row: 0 }, { col: 2, row: 0 })).toBe(true);
    });

    it("the spatial hash matches brute force on random small cases", () => {
      // Deterministic PRNG so failures reproduce.
      let seed = 1234567;
      const rand = (): number => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        return seed / 0x7fffffff;
      };
      const bruteCanCross = (
        polylines: [number, number][][],
        from: { col: number; row: number },
        to: { col: number; row: number }
      ): boolean => {
        const p0 = gridCenter(from.col, from.row);
        const p1 = gridCenter(to.col, to.row);
        for (const poly of polylines) {
          for (let i = 1; i < poly.length; i++) {
            if (segmentsIntersect(p0.x, p0.y, p1.x, p1.y, poly[i - 1][0], poly[i - 1][1], poly[i][0], poly[i][1])) {
              return false;
            }
          }
        }
        return true;
      };

      for (let trial = 0; trial < 40; trial++) {
        // 1-3 random polylines within a 6x6-cell world (0..60).
        const polylines: [number, number][][] = [];
        const nLines = 1 + Math.floor(rand() * 3);
        for (let l = 0; l < nLines; l++) {
          const nPts = 2 + Math.floor(rand() * 3);
          const poly: [number, number][] = [];
          for (let p = 0; p < nPts; p++) poly.push([rand() * 60, rand() * 60]);
          polylines.push(poly);
        }
        const barrier = buildWallBarrier(polylines, gridCenter, gridWorldToCell);
        // Compare over every adjacent-cell step in the 6x6 grid (the only
        // query shape floodFillCells ever issues).
        for (let col = 0; col < 6; col++) {
          for (let row = 0; row < 6; row++) {
            const from = { col, row };
            for (const to of [
              { col: col + 1, row }, { col: col - 1, row },
              { col, row: row + 1 }, { col, row: row - 1 },
            ]) {
              expect(barrier.canCross(from, to)).toBe(bruteCanCross(polylines, from, to));
            }
          }
        }
      }
    });
  });
});

// =============================================================================
// Gap-aware fill barrier (openings, §9 / Guildmaster ruling D7): a doorway is
// a hole in the barrier, regardless of seated art — fill leaks through it,
// while ungapped wall runs (and gaps clamped down to nothing by invariant 3)
// still block.
// =============================================================================

describe("gap-aware wall barrier (solidWallPolylines + buildWallBarrier)", () => {
  const CS = 10;
  const gridCenter = (col: number, row: number): { x: number; y: number } => ({
    x: (col + 0.5) * CS,
    y: (row + 0.5) * CS,
  });
  const gridWorldToCell = (wx: number, wy: number): { col: number; row: number } => ({
    col: Math.floor(wx / CS),
    row: Math.floor(wy / CS),
  });

  function barrierFor(walls: WallPath[]): ReturnType<typeof buildWallBarrier> {
    const polylines = walls
      .filter((w) => w.kind === "wall")
      .flatMap((w) => solidWallPolylines(w, CS));
    return buildWallBarrier(polylines, gridCenter, gridWorldToCell);
  }

  it("fill passes through a doorway gap into the next room", () => {
    // Vertical wall at world x=20 (col1|col2 boundary), spanning y 0..90, with a
    // 3-cell-wide gap (30 world units) centered at y=45 -> span y=[30,60], which
    // strictly contains rows 3/4/5's cell-center probe lines (y=35/45/55) without
    // touching a span edge (avoids the boundary-touching case tested separately).
    const wall: WallPath = {
      id: "w", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 20, y: 0 }, { x: 20, y: 90 }],
      gaps: [{ id: "g", seg: 0, t: 0.5, widthCells: 3 }],
    };
    const barrier = barrierFor([wall]);
    expect(barrier.canCross({ col: 1, row: 3 }, { col: 2, row: 3 })).toBe(true);
    expect(barrier.canCross({ col: 1, row: 4 }, { col: 2, row: 4 })).toBe(true);
    expect(barrier.canCross({ col: 1, row: 5 }, { col: 2, row: 5 })).toBe(true);
    // Rows away from the gap still hit solid wall.
    expect(barrier.canCross({ col: 1, row: 0 }, { col: 2, row: 0 })).toBe(false);
    expect(barrier.canCross({ col: 1, row: 8 }, { col: 2, row: 8 })).toBe(false);
  });

  it("still blocked by ungapped wall runs on the same wall", () => {
    const wall: WallPath = {
      id: "w", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 20, y: 0 }, { x: 20, y: 60 }],
      gaps: [{ id: "g", seg: 0, t: 0.5, widthCells: 1 }],
    };
    const gapless: WallPath = {
      id: "w2", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 40, y: 0 }, { x: 40, y: 60 }],
    };
    const barrier = barrierFor([wall, gapless]);
    // The second wall has no gap at all -> every row blocks.
    for (let row = 0; row < 6; row++) {
      expect(barrier.canCross({ col: 3, row }, { col: 4, row })).toBe(false);
    }
  });

  it("a full room with a single doorway fills the interior plus the room beyond it", () => {
    // 3x3 interior room (cols 0-2, rows 0-2) with a door in its east wall
    // (x=30, the col2|col3 boundary) opening into another 3x3 room (cols 3-5).
    const room: WallPath = {
      id: "room", kind: "wall", closed: true, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 30 }, { x: 0, y: 30 }],
      gaps: [{ id: "door", seg: 1, t: 0.5, widthCells: 1 }], // seg 1: (30,0)->(30,30)
    };
    const neighbor: WallPath = {
      id: "neighbor", kind: "wall", closed: true, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 30, y: 0 }, { x: 60, y: 0 }, { x: 60, y: 30 }, { x: 30, y: 30 }],
      gaps: [{ id: "door", seg: 3, t: 0.5, widthCells: 1 }], // seg 3: (30,30)->(30,0), shares the doorway
    };
    const barrier = barrierFor([room, neighbor]);
    const { cells, aborted } = floodFillCells([], 1, 1, 10, 10, { canCross: barrier.canCross });
    expect(aborted).toBe(false);
    // Both 3x3 interiors (cols 0-2 and 3-5, rows 0-2) are reachable through the door.
    expect(cells).toHaveLength(18);
    expect(cells.every((c) => c.col >= 0 && c.col <= 5 && c.row >= 0 && c.row <= 2)).toBe(true);
  });

  it("respects clamp-at-derive gap widths: an over-wide gap opens the whole wall", () => {
    // widthCells 10 -> world 100 > the 60-long segment; invariant 3 clamps the
    // derived span to the whole segment, so the wall carries no solid polyline
    // at all and blocks nothing.
    const gap: WallPath["gaps"] = [{ id: "g", seg: 0, t: 0.5, widthCells: 10 }];
    const wall: WallPath = {
      id: "w", kind: "wall", closed: false, tilesetId: "ts", tileId: "brick", widthScale: 1,
      vertices: [{ x: 20, y: 0 }, { x: 20, y: 60 }],
      gaps: gap,
    };
    expect(solidWallPolylines(wall, CS)).toEqual([]);
    const barrier = barrierFor([wall]);
    for (let row = 0; row < 6; row++) {
      expect(barrier.canCross({ col: 1, row }, { col: 2, row })).toBe(true);
    }
    expect(gap![0].widthCells).toBe(10); // stored value untouched
  });
});

// =============================================================================
// Tests
// =============================================================================

describe("tilePlacement", () => {
  // ===========================================================================
  // placeTileAtCell
  // ===========================================================================

  describe("placeTileAtCell", () => {
    it("places a tile on an empty layer", () => {
      const result = placeTileAtCell([], 3, -1, "tileset-1", "grass");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        col: 3,
        row: -1,
        tilesetId: "tileset-1",
        tileId: "grass",
        rotation: undefined,
        flipH: undefined,
        placement: undefined,
        fitMode: undefined,
      });
    });

    it("replaces an existing tile at the same hex and layer", () => {
      const existing = [baseTile(2, 0, "tileset-1", "grass")];

      const result = placeTileAtCell(existing, 2, 0, "tileset-1", "water");

      expect(result).toHaveLength(1);
      expect(result[0].tileId).toBe("water");
      expect(result[0].col).toBe(2);
      expect(result[0].row).toBe(0);
    });

    it("allows base and overlay to coexist at the same hex", () => {
      const existing = [baseTile(1, 1)];

      const result = placeTileAtCell(existing, 1, 1, "tileset-1", "tree", {
        placement: "overlay",
      });

      expect(result).toHaveLength(2);
      // Base tile untouched
      expect(result[0]).toEqual(existing[0]);
      // Overlay added
      expect(result[1].placement).toBe("overlay");
      expect(result[1].tileId).toBe("tree");
      expect(result[1].col).toBe(1);
      expect(result[1].row).toBe(1);
    });

    it("coerces fitMode 'auto' to undefined", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        fitMode: "auto",
      });

      expect(result[0].fitMode).toBeUndefined();
    });

    it("stores fitMode 'fill' as-is", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        fitMode: "fill",
      });

      expect(result[0].fitMode).toBe("fill");
    });

    it("stores fitMode 'contain' as-is", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        fitMode: "contain",
      });

      expect(result[0].fitMode).toBe("contain");
    });

    it("passes through rotation value", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        rotation: 120,
      });

      expect(result[0].rotation).toBe(120);
    });

    it("coerces rotation 0 to undefined (falsy)", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        rotation: 0,
      });

      expect(result[0].rotation).toBeUndefined();
    });

    it("passes through flipH true", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        flipH: true,
      });

      expect(result[0].flipH).toBe(true);
    });

    it("coerces flipH false to undefined (falsy)", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        flipH: false,
      });

      expect(result[0].flipH).toBeUndefined();
    });

    it("stores base layer as undefined (not 'base')", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", { placement: "fill" });

      expect(result[0].placement).toBeUndefined();
    });

    it("stores overlay layer as 'overlay'", () => {
      const result = placeTileAtCell([], 0, 0, "ts", "t", {
        placement: "overlay",
      });

      expect(result[0].placement).toBe("overlay");
    });

    it("replaces overlay without affecting base at same hex", () => {
      const existing = [baseTile(0, 0), overlayTile(0, 0, "tileset-1", "bush")];

      const result = placeTileAtCell(existing, 0, 0, "tileset-1", "rock", {
        placement: "overlay",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existing[0]); // base unchanged
      expect(result[1].tileId).toBe("rock");
      expect(result[1].placement).toBe("overlay");
    });

    it("does not mutate the original array", () => {
      const existing = [baseTile(0, 0)];
      const copy = [...existing];

      placeTileAtCell(existing, 0, 0, "ts", "new-tile");

      expect(existing).toEqual(copy);
    });

    it("preserves other tiles in the array", () => {
      const existing = [baseTile(0, 0), baseTile(1, 0), baseTile(2, 0)];

      const result = placeTileAtCell(existing, 1, 0, "ts", "replaced");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(existing[0]);
      expect(result[1].tileId).toBe("replaced");
      expect(result[2]).toEqual(existing[2]);
    });
  });

  // ===========================================================================
  // eraseTileAtCell
  // ===========================================================================

  describe("eraseTileAtCell", () => {
    it("removes overlay first when both base and overlay exist", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];

      const result = eraseTileAtCell(tiles, 0, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(tiles[0]); // base remains
    });

    it("removes base tile on second erase after overlay is gone", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];

      const afterFirst = eraseTileAtCell(tiles, 0, 0);
      const afterSecond = eraseTileAtCell(afterFirst, 0, 0);

      expect(afterSecond).toHaveLength(0);
    });

    it("returns tiles unchanged when erasing from empty hex", () => {
      const tiles = [baseTile(1, 1)];

      const result = eraseTileAtCell(tiles, 5, 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(tiles[0]);
    });

    it("does not crash on empty array", () => {
      const result = eraseTileAtCell([], 0, 0);

      expect(result).toHaveLength(0);
    });

    it("removes base tile when no overlay exists", () => {
      const tiles = [baseTile(2, 3)];

      const result = eraseTileAtCell(tiles, 2, 3);

      expect(result).toHaveLength(0);
    });

    it("only removes tiles at the target hex", () => {
      const tiles = [baseTile(0, 0), baseTile(1, 0), overlayTile(1, 0), baseTile(2, 0)];

      const result = eraseTileAtCell(tiles, 1, 0);

      // Should remove overlay at (1,0) first
      expect(result).toHaveLength(3);
      expect(result.find((t) => t.col === 1 && t.row === 0 && t.placement === "overlay")).toBeUndefined();
      expect(result.find((t) => t.col === 1 && t.row === 0 && !t.placement)).toBeTruthy();
    });

    it("does not mutate the original array", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];
      const originalLength = tiles.length;

      eraseTileAtCell(tiles, 0, 0);

      expect(tiles).toHaveLength(originalLength);
    });
  });

  // ===========================================================================
  // placeStampAtWorld
  // ===========================================================================

  describe("placeStampAtWorld", () => {
    it("places a stamp with freeform=true and world coordinates", () => {
      const result = placeStampAtWorld([], 150.5, 275.3, 2, -1, "tileset-1", "castle");

      expect(result).toHaveLength(1);
      expect(result[0].freeform).toBe(true);
      expect(result[0].worldX).toBe(150.5);
      expect(result[0].worldY).toBe(275.3);
      expect(result[0].col).toBe(2);
      expect(result[0].row).toBe(-1);
      expect(result[0].tilesetId).toBe("tileset-1");
      expect(result[0].tileId).toBe("castle");
    });

    it("always sets layer to overlay", () => {
      const result = placeStampAtWorld([], 0, 0, 0, 0, "ts", "t");

      expect(result[0].placement).toBe("overlay");
    });

    it("appends to existing tiles without replacing", () => {
      const existing = [baseTile(0, 0), overlayTile(0, 0)];

      const result = placeStampAtWorld(existing, 100, 200, 0, 0, "ts", "stamp");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(existing[0]);
      expect(result[1]).toEqual(existing[1]);
      expect(result[2].freeform).toBe(true);
    });

    it("allows multiple stamps at the same nominal hex", () => {
      let tiles: TileAssignment[] = [];
      tiles = placeStampAtWorld(tiles, 10, 20, 1, 1, "ts", "tree");
      tiles = placeStampAtWorld(tiles, 30, 40, 1, 1, "ts", "rock");

      expect(tiles).toHaveLength(2);
      expect(tiles[0].worldX).toBe(10);
      expect(tiles[1].worldX).toBe(30);
    });

    it("coerces fitMode 'auto' to undefined", () => {
      const result = placeStampAtWorld([], 0, 0, 0, 0, "ts", "t", {
        fitMode: "auto",
      });

      expect(result[0].fitMode).toBeUndefined();
    });

    it("passes through rotation and flipH", () => {
      const result = placeStampAtWorld([], 50, 60, 0, 0, "ts", "t", {
        rotation: 180,
        flipH: true,
      });

      expect(result[0].rotation).toBe(180);
      expect(result[0].flipH).toBe(true);
    });

    it("does not mutate the original array", () => {
      const existing = [baseTile(0, 0)];
      const copy = [...existing];

      placeStampAtWorld(existing, 100, 200, 1, 1, "ts", "t");

      expect(existing).toEqual(copy);
    });
  });
});
