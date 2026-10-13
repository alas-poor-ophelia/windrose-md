/**
 * exportOperations.calculateContentBounds — ladder rungs.
 *
 * Rung (>= 1) cells are in their rung's own axial coordinates, so their bounds
 * must come from ladder.geometryForLevel(L), never the root geometry.
 */

import { describe, it, expect } from "vitest";

import { calculateContentBounds, exportLadderFor } from "../../../src/persistence/exportOperations";
import { ladderForAuthoredRungs } from "../../../src/persistence/resizeOperations";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { LADDER_DEFAULTS } from "../../../src/geometry/core/lattice";

import type { MapData } from "#types/core/map.types";
import type { MapObject } from "#types/objects/object.types";
import type { TileAssignment } from "#types/tiles/tile.types";

import { makeLayer, makeMapData } from "../helpers/fixtures";

const lod = { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel };
const rungCell = { q: 5, r: 7, color: "#fff" };

function ladderMap(): MapData {
  const layer = makeLayer({ id: "layer-1", levels: { 2: [rungCell] } });
  return makeMapData({ mapType: "hex", hexSize: 40, lod, layers: [layer] });
}

describe("calculateContentBounds with ladder rungs", () => {
  it("a rung-2-only layer yields the rung-2 cell's own bounds", () => {
    const mapData = ladderMap();
    const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
    const ladder = ladderForAuthoredRungs(mapData, root);
    expect(ladder).not.toBeNull();
    if (ladder === null) return;

    const bounds = calculateContentBounds(mapData.layers[0], root, ladder);
    expect(bounds).toEqual(ladder.geometryForLevel(2).getCellBounds(rungCell));
    // A rung-2 cell is m^2 times smaller (linear) than a root cell.
    const rootBounds = root.getCellBounds(rungCell);
    expect(bounds).not.toBeNull();
    if (bounds === null) return;
    expect(bounds.maxX - bounds.minX).toBeCloseTo((rootBounds.maxX - rootBounds.minX) / (lod.m * lod.m));
  });

  it("without a ladder, rung cells are ignored (classic path)", () => {
    const mapData = ladderMap();
    const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
    expect(calculateContentBounds(mapData.layers[0], root)).toBeNull();
  });

  it("a classic map builds no ladder and measures level 0 as before", () => {
    const cell = { q: 1, r: 1, color: "#fff" };
    const layer = makeLayer({ cells: [cell] });
    const mapData = makeMapData({ mapType: "hex", hexSize: 40, layers: [layer] });
    const root = new HexGeometry(40, "flat", null);
    expect(ladderForAuthoredRungs(mapData, root)).toBeNull();
    expect(calculateContentBounds(layer, root, null)).toEqual(root.getCellBounds(cell));
  });

  describe("objects", () => {
    const deepObj = { id: "d", type: "entrance", position: { x: 5, y: 7 }, size: { width: 1, height: 1 }, homeLevel: 2 } as unknown as MapObject;
    const rootObj = { id: "r", type: "entrance", position: { x: 1, y: 1 }, size: { width: 1, height: 1 } } as unknown as MapObject;

    it("a rung-2 object is bounded by its rung-2 cell, not its index at the root", () => {
      const layer = makeLayer({ objects: [deepObj] });
      const mapData = makeMapData({ mapType: "hex", hexSize: 40, lod, layers: [makeLayer({ id: "layer-1", levels: { 2: [rungCell] } })] });
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = ladderForAuthoredRungs(mapData, root);
      expect(ladder).not.toBeNull();
      if (ladder === null) return;
      const bounds = calculateContentBounds(layer, root, ladder);
      expect(bounds).toEqual(ladder.geometryForLevel(2).getObjectBounds(deepObj));
      const rootWouldBe = root.getObjectBounds(deepObj);
      expect(bounds).not.toEqual(rootWouldBe);
    });

    it("a rung-2 object does not inflate the bounds of root content", () => {
      const layer = makeLayer({ cells: [{ q: 1, r: 1, color: "#fff" }], objects: [deepObj, rootObj] });
      const mapData = makeMapData({ mapType: "hex", hexSize: 40, lod, layers: [makeLayer({ id: "layer-1", levels: { 2: [rungCell] } })] });
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = ladderForAuthoredRungs(mapData, root);
      if (ladder === null) throw new Error("expected a ladder");
      const bounds = calculateContentBounds(layer, root, ladder);
      const rungBounds = ladder.geometryForLevel(2).getObjectBounds(deepObj);
      const rootCell = root.getCellBounds({ q: 1, r: 1, color: "#fff" });
      const rootObjB = root.getObjectBounds(rootObj);
      expect(bounds).toEqual({
        minX: Math.min(rungBounds.minX, rootCell.minX, rootObjB.minX),
        minY: Math.min(rungBounds.minY, rootCell.minY, rootObjB.minY),
        maxX: Math.max(rungBounds.maxX, rootCell.maxX, rootObjB.maxX),
        maxY: Math.max(rungBounds.maxY, rootCell.maxY, rootObjB.maxY)
      });
    });

    it("without a ladder a deep object is skipped; a root object still counts", () => {
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      expect(calculateContentBounds(makeLayer({ objects: [deepObj] }), root, null)).toBeNull();
      expect(calculateContentBounds(makeLayer({ objects: [rootObj] }), root, null)).toEqual(root.getObjectBounds(rootObj));
    });
  });
  describe("tiles (kgc.25)", () => {
    const rootTile = { col: 1, row: 1, tilesetId: "ts", tileId: "t" } as TileAssignment;
    const deepTile = { col: 5, row: 7, tilesetId: "ts", tileId: "t", homeLevel: 2 } as TileAssignment;

    it("a root tile is bounded by its cell (tiles used to be ignored)", () => {
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      expect(calculateContentBounds(makeLayer({ tiles: [rootTile] }), root, null))
        .toEqual(root.getCellBounds({ q: 1, r: 1, color: "" }));
    });

    it("a rung-2 tile is bounded by its rung-2 cell, and skipped without a ladder", () => {
      const mapData = ladderMap();
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = ladderForAuthoredRungs(mapData, root);
      if (ladder === null) throw new Error("expected a ladder");
      const layer = makeLayer({ tiles: [deepTile] });
      expect(calculateContentBounds(layer, root, ladder)).toEqual(ladder.geometryForLevel(2).getCellBounds({ q: 5, r: 7, color: "" }));
      expect(calculateContentBounds(layer, root, null)).toBeNull();
    });

    it("a freeform stamp is its scaled drop-cell box centred on its world position", () => {
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const stamp = { col: 2, row: 2, tilesetId: "ts", tileId: "t", freeform: true, worldX: 300, worldY: 200, scale: 2 } as TileAssignment;
      const cell = root.getCellBounds({ q: 2, r: 2, color: "" });
      const w = cell.maxX - cell.minX;
      const h = cell.maxY - cell.minY;
      const b = calculateContentBounds(makeLayer({ tiles: [stamp] }), root, null);
      expect(b).not.toBeNull();
      if (b === null) return;
      expect(b.minX).toBeCloseTo(300 - w);
      expect(b.maxX).toBeCloseTo(300 + w);
      expect(b.minY).toBeCloseTo(200 - h);
      expect(b.maxY).toBeCloseTo(200 + h);
    });
  });

  describe("exportLadderFor (kgc.23 h: bounds follow the render's deep condition)", () => {
    it("a ladder view gets a ladder, and its rung cells count", () => {
      const mapData = ladderMap();
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = exportLadderFor(mapData, root);
      expect(ladder).not.toBeNull();
      expect(calculateContentBounds(mapData.layers[0], root, ladder)).not.toBeNull();
    });

    it("a quarantined map (rung cells, no lod block) exports level 0: bounds ignore the rungs", () => {
      const mapData: MapData = { ...ladderMap(), lod: undefined };
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = exportLadderFor(mapData, root);
      expect(ladder).toBeNull();
      expect(calculateContentBounds(mapData.layers[0], root, ladder)).toBeNull();
    });

    it("a rotated ladder map renders level 0, so its rungs do not widen the frame", () => {
      const mapData: MapData = { ...ladderMap(), northDirection: 90 };
      const root = new HexGeometry(40, "flat", { maxCol: 10, maxRow: 10 });
      const ladder = exportLadderFor(mapData, root);
      expect(ladder).toBeNull();
      expect(calculateContentBounds(mapData.layers[0], root, ladder)).toBeNull();
    });
  });
});
