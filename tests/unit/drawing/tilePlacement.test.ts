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
import {
  getBrushCells,
  bresenhamLine,
  floodFillCells,
  FLOOD_FILL_MAX,
} from "../../../src/drawing/tilePlacementOps";

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
      const cells = floodFillCells([], 0, 0, 2, 2);
      expect(cells).toHaveLength(49);
    });

    it("clicking a tile fills only the contiguous same-tile region", () => {
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: "ts", tileId: "grass" },
        { col: 1, row: 0, tilesetId: "ts", tileId: "grass" },
        { col: 2, row: 0, tilesetId: "ts", tileId: "water" },
        { col: 4, row: 0, tilesetId: "ts", tileId: "grass" }, // disconnected
      ];
      const cells = floodFillCells(tiles, 0, 0, 10, 10);
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
      const cells = floodFillCells(wall, 0, 0, 1, 1);
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
      const cells = floodFillCells(tiles, 0, 0, 2, 2);
      expect(cells).toHaveLength(49);
    });

    it("respects the FLOOD_FILL_MAX cap on huge empty areas", () => {
      const cells = floodFillCells([], 0, 0, 100, 100);
      expect(cells.length).toBeLessThanOrEqual(FLOOD_FILL_MAX);
      expect(cells.length).toBe(FLOOD_FILL_MAX);
    });
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
