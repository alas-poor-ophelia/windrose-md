/**
 * tilePlacement Unit Tests
 *
 * Tests the pure data transformation logic extracted from TilePlacementLayer.
 * These operations transform HexTileAssignment[] arrays for tile paint/erase.
 */

import { describe, it, expect } from "vitest";
import type { HexTileAssignment } from "../../../types/tiles/tile.types";

// =============================================================================
// Pure helper functions extracted from TilePlacementLayer logic
// =============================================================================

/**
 * Place a tile at hex (q, r) on a given layer. Replaces any existing tile
 * at the same hex+layer; otherwise appends.
 */
function placeTileAtHex(
  currentTiles: HexTileAssignment[],
  q: number,
  r: number,
  tilesetId: string,
  tileId: string,
  options: {
    rotation?: number;
    flipH?: boolean;
    layer?: "base" | "overlay";
    fitMode?: "fill" | "contain" | "auto";
  } = {}
): HexTileAssignment[] {
  const targetLayer = options.layer || "base";

  const existingIdx = currentTiles.findIndex(
    (t) => t.q === q && t.r === r && (t.layer || "base") === targetLayer
  );

  const newTile: HexTileAssignment = {
    q,
    r,
    tilesetId,
    tileId,
    rotation: (options.rotation || undefined) as HexTileAssignment["rotation"],
    flipH: options.flipH || undefined,
    layer: targetLayer === "base" ? undefined : targetLayer,
    fitMode: options.fitMode === "auto" ? undefined : (options.fitMode as HexTileAssignment["fitMode"]),
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
function eraseTileAtHex(
  currentTiles: HexTileAssignment[],
  q: number,
  r: number
): HexTileAssignment[] {
  // Prefer removing overlay first
  const overlayIdx = currentTiles.findIndex(
    (t) => t.q === q && t.r === r && t.layer === "overlay"
  );
  if (overlayIdx >= 0) {
    return currentTiles.filter((_, i) => i !== overlayIdx);
  }

  // Then remove any remaining tile at that hex (base)
  const newTiles = currentTiles.filter(
    (t) => !(t.q === q && t.r === r)
  );
  return newTiles;
}

/**
 * Place a freeform stamp at world coordinates. Always overlay layer.
 */
function placeStampAtWorld(
  currentTiles: HexTileAssignment[],
  worldX: number,
  worldY: number,
  q: number,
  r: number,
  tilesetId: string,
  tileId: string,
  options: {
    rotation?: number;
    flipH?: boolean;
    fitMode?: "fill" | "contain" | "auto";
  } = {}
): HexTileAssignment[] {
  const newTile: HexTileAssignment = {
    q,
    r,
    tilesetId,
    tileId,
    rotation: (options.rotation || undefined) as HexTileAssignment["rotation"],
    flipH: options.flipH || undefined,
    layer: "overlay",
    fitMode: options.fitMode === "auto" ? undefined : (options.fitMode as HexTileAssignment["fitMode"]),
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
  q: number,
  r: number,
  tilesetId = "tileset-1",
  tileId = "grass"
): HexTileAssignment {
  return { q, r, tilesetId, tileId };
}

function overlayTile(
  q: number,
  r: number,
  tilesetId = "tileset-1",
  tileId = "tree"
): HexTileAssignment {
  return { q, r, tilesetId, tileId, layer: "overlay" };
}

// =============================================================================
// Tests
// =============================================================================

describe("tilePlacement", () => {
  // ===========================================================================
  // placeTileAtHex
  // ===========================================================================

  describe("placeTileAtHex", () => {
    it("places a tile on an empty layer", () => {
      const result = placeTileAtHex([], 3, -1, "tileset-1", "grass");

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({
        q: 3,
        r: -1,
        tilesetId: "tileset-1",
        tileId: "grass",
        rotation: undefined,
        flipH: undefined,
        layer: undefined,
        fitMode: undefined,
      });
    });

    it("replaces an existing tile at the same hex and layer", () => {
      const existing = [baseTile(2, 0, "tileset-1", "grass")];

      const result = placeTileAtHex(existing, 2, 0, "tileset-1", "water");

      expect(result).toHaveLength(1);
      expect(result[0].tileId).toBe("water");
      expect(result[0].q).toBe(2);
      expect(result[0].r).toBe(0);
    });

    it("allows base and overlay to coexist at the same hex", () => {
      const existing = [baseTile(1, 1)];

      const result = placeTileAtHex(existing, 1, 1, "tileset-1", "tree", {
        layer: "overlay",
      });

      expect(result).toHaveLength(2);
      // Base tile untouched
      expect(result[0]).toEqual(existing[0]);
      // Overlay added
      expect(result[1].layer).toBe("overlay");
      expect(result[1].tileId).toBe("tree");
      expect(result[1].q).toBe(1);
      expect(result[1].r).toBe(1);
    });

    it("coerces fitMode 'auto' to undefined", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        fitMode: "auto",
      });

      expect(result[0].fitMode).toBeUndefined();
    });

    it("stores fitMode 'fill' as-is", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        fitMode: "fill",
      });

      expect(result[0].fitMode).toBe("fill");
    });

    it("stores fitMode 'contain' as-is", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        fitMode: "contain",
      });

      expect(result[0].fitMode).toBe("contain");
    });

    it("passes through rotation value", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        rotation: 120,
      });

      expect(result[0].rotation).toBe(120);
    });

    it("coerces rotation 0 to undefined (falsy)", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        rotation: 0,
      });

      expect(result[0].rotation).toBeUndefined();
    });

    it("passes through flipH true", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        flipH: true,
      });

      expect(result[0].flipH).toBe(true);
    });

    it("coerces flipH false to undefined (falsy)", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        flipH: false,
      });

      expect(result[0].flipH).toBeUndefined();
    });

    it("stores base layer as undefined (not 'base')", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", { layer: "base" });

      expect(result[0].layer).toBeUndefined();
    });

    it("stores overlay layer as 'overlay'", () => {
      const result = placeTileAtHex([], 0, 0, "ts", "t", {
        layer: "overlay",
      });

      expect(result[0].layer).toBe("overlay");
    });

    it("replaces overlay without affecting base at same hex", () => {
      const existing = [baseTile(0, 0), overlayTile(0, 0, "tileset-1", "bush")];

      const result = placeTileAtHex(existing, 0, 0, "tileset-1", "rock", {
        layer: "overlay",
      });

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(existing[0]); // base unchanged
      expect(result[1].tileId).toBe("rock");
      expect(result[1].layer).toBe("overlay");
    });

    it("does not mutate the original array", () => {
      const existing = [baseTile(0, 0)];
      const copy = [...existing];

      placeTileAtHex(existing, 0, 0, "ts", "new-tile");

      expect(existing).toEqual(copy);
    });

    it("preserves other tiles in the array", () => {
      const existing = [baseTile(0, 0), baseTile(1, 0), baseTile(2, 0)];

      const result = placeTileAtHex(existing, 1, 0, "ts", "replaced");

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual(existing[0]);
      expect(result[1].tileId).toBe("replaced");
      expect(result[2]).toEqual(existing[2]);
    });
  });

  // ===========================================================================
  // eraseTileAtHex
  // ===========================================================================

  describe("eraseTileAtHex", () => {
    it("removes overlay first when both base and overlay exist", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];

      const result = eraseTileAtHex(tiles, 0, 0);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(tiles[0]); // base remains
    });

    it("removes base tile on second erase after overlay is gone", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];

      const afterFirst = eraseTileAtHex(tiles, 0, 0);
      const afterSecond = eraseTileAtHex(afterFirst, 0, 0);

      expect(afterSecond).toHaveLength(0);
    });

    it("returns tiles unchanged when erasing from empty hex", () => {
      const tiles = [baseTile(1, 1)];

      const result = eraseTileAtHex(tiles, 5, 5);

      expect(result).toHaveLength(1);
      expect(result[0]).toEqual(tiles[0]);
    });

    it("does not crash on empty array", () => {
      const result = eraseTileAtHex([], 0, 0);

      expect(result).toHaveLength(0);
    });

    it("removes base tile when no overlay exists", () => {
      const tiles = [baseTile(2, 3)];

      const result = eraseTileAtHex(tiles, 2, 3);

      expect(result).toHaveLength(0);
    });

    it("only removes tiles at the target hex", () => {
      const tiles = [baseTile(0, 0), baseTile(1, 0), overlayTile(1, 0), baseTile(2, 0)];

      const result = eraseTileAtHex(tiles, 1, 0);

      // Should remove overlay at (1,0) first
      expect(result).toHaveLength(3);
      expect(result.find((t) => t.q === 1 && t.r === 0 && t.layer === "overlay")).toBeUndefined();
      expect(result.find((t) => t.q === 1 && t.r === 0 && !t.layer)).toBeTruthy();
    });

    it("does not mutate the original array", () => {
      const tiles = [baseTile(0, 0), overlayTile(0, 0)];
      const originalLength = tiles.length;

      eraseTileAtHex(tiles, 0, 0);

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
      expect(result[0].q).toBe(2);
      expect(result[0].r).toBe(-1);
      expect(result[0].tilesetId).toBe("tileset-1");
      expect(result[0].tileId).toBe("castle");
    });

    it("always sets layer to overlay", () => {
      const result = placeStampAtWorld([], 0, 0, 0, 0, "ts", "t");

      expect(result[0].layer).toBe("overlay");
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
      let tiles: HexTileAssignment[] = [];
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
