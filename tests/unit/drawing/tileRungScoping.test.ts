/**
 * Rung scoping for tile placement (lattice ladder, bead windrose-kgc.12).
 *
 * Rung cells of different ladder levels share (col,row) index space, so every
 * "same cell" match the tile layer makes (replace on paint, erase, fill clear,
 * fill blocking) must be scoped to the stroke's rung via homeLevel.
 */

import { describe, it, expect } from "vitest";
import type { TileAssignment } from "../../../types/tiles/tile.types";
import {
  tileRung,
  homeLevelFields,
  tilesOnRung,
  withTilePlaced,
  withTilesErasedAt,
  withFillRegionCleared,
  floodFillCells,
} from "../../../src/drawing/tilePlacementOps";

const tile = (col: number, row: number, extra: Partial<TileAssignment> = {}): TileAssignment => ({
  col, row, tilesetId: "ts", tileId: "a", ...extra,
} as TileAssignment);

describe("homeLevelFields", () => {
  it("stamps homeLevel L on a placement at level L", () => {
    const placed = { ...tile(3, 4), ...homeLevelFields(2) };
    expect(placed.homeLevel).toBe(2);
    expect(tileRung(placed)).toBe(2);
  });

  it("leaves no homeLevel key on a root placement", () => {
    const placed = { ...tile(3, 4), ...homeLevelFields(0) };
    expect("homeLevel" in placed).toBe(false);
    expect(Object.keys(JSON.parse(JSON.stringify(placed)))).not.toContain("homeLevel");
    expect(tileRung(placed)).toBe(0);
  });
});

describe("withTilePlaced", () => {
  it("a level-1 placement does not replace a level-0 tile at the same (col,row)", () => {
    const root = tile(5, 5, { tileId: "root" });
    const deep = tile(5, 5, { tileId: "deep", homeLevel: 1 });
    const next = withTilePlaced([root], deep, "fill");
    expect(next).toEqual([root, deep]);
  });

  it("replaces a same-rung, same-tier tile at the same cell", () => {
    const old = tile(5, 5, { tileId: "old", homeLevel: 1 });
    const fresh = tile(5, 5, { tileId: "new", homeLevel: 1 });
    expect(withTilePlaced([old], fresh, "fill")).toEqual([fresh]);
  });

  it("root placement keeps today's behaviour: replaces root, spares deep", () => {
    const root = tile(1, 1, { tileId: "old" });
    const deep = tile(1, 1, { tileId: "deep", homeLevel: 2 });
    const fresh = tile(1, 1, { tileId: "new" });
    expect(withTilePlaced([root, deep], fresh, "fill")).toEqual([deep, fresh]);
  });

  it("does not replace a same-rung tile on the other placement tier", () => {
    const overlay = tile(2, 2, { placement: "overlay", homeLevel: 1 });
    const base = tile(2, 2, { homeLevel: 1 });
    expect(withTilePlaced([overlay], base, "fill")).toEqual([overlay, base]);
  });
});

describe("withTilesErasedAt", () => {
  const keys = new Set(["5,5"]);

  it("a level-1 erase does not remove a level-0 tile at the same (col,row)", () => {
    const root = tile(5, 5);
    const deep = tile(5, 5, { homeLevel: 1 });
    expect(withTilesErasedAt([root, deep], keys, 1)).toEqual([root]);
  });

  it("a root erase does not remove a deep tile at the same (col,row)", () => {
    const root = tile(5, 5);
    const deep = tile(5, 5, { homeLevel: 1 });
    expect(withTilesErasedAt([root, deep], keys, 0)).toEqual([deep]);
  });

  it("erases same-rung freeform stamps by drop cell and spans by footprint", () => {
    const stamp = tile(5, 5, { freeform: true, worldX: 0, worldY: 0, homeLevel: 2 });
    const span = tile(4, 4, { spanW: 2, spanH: 2, homeLevel: 2 });
    const other = tile(5, 5, { homeLevel: 3 });
    expect(withTilesErasedAt([stamp, span, other], keys, 2)).toEqual([other]);
  });
});

describe("withFillRegionCleared / fill on a rung", () => {
  it("clears only the fill rung's tiles in the region", () => {
    const root = tile(1, 1);
    const deep = tile(1, 1, { homeLevel: 1 });
    expect(withFillRegionCleared([root, deep], new Set(["1,1"]), "fill", 1)).toEqual([root]);
  });

  it("tiles on another rung do not bound a fill at this rung", () => {
    const rootWall = tile(1, 0);
    const tiles = [rootWall];
    const inBounds = (c: number, r: number): boolean => c >= 0 && c < 3 && r >= 0 && r < 1;
    const atRoot = floodFillCells(tilesOnRung(tiles, 0), 0, 0, 3, 1, { inBounds });
    const atDeep = floodFillCells(tilesOnRung(tiles, 1), 0, 0, Infinity, Infinity, { inBounds });
    expect(atRoot.cells).toHaveLength(1);
    expect(atDeep.cells).toHaveLength(3);
    expect(atDeep.aborted).toBe(false);
  });

  it("an unbounded deep fill still aborts at the flood-fill cap", () => {
    const res = floodFillCells([], 0, 0, Infinity, Infinity, { inBounds: () => true });
    expect(res.aborted).toBe(true);
  });
});
