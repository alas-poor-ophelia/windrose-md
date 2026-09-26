/**
 * Hex-bounds resize and ladder rungs: orphan counting and the rung filter.
 *
 * A rung cell is kept iff its lattice ancestor still exists under the NEW
 * root bounds (ladder.existsAt). The filter writes through setLevelCells, so an
 * emptied rung, and an emptied `levels` container, are deleted.
 */

import { describe, it, expect } from "vitest";

import {
  countLevelOrphans, countLevelOrphansForBounds, filterLevelsToBounds, ladderForAuthoredRungs
} from "../../../src/persistence/resizeOperations";
import { getOrphanedContentInfo } from "../../../src/components/settings/settingsReducer";
import { createGeometryLadder, type GeometryLadder } from "../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { LADDER_DEFAULTS } from "../../../src/geometry/core/lattice";

import type { HexBounds, MapData } from "#types/core/map.types";

import { makeLayer, makeMapData } from "../helpers/fixtures";

interface HexTestCell { q: number; r: number; color: string }

const lod = { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel };
const OLD_BOUNDS: HexBounds = { maxCol: 10, maxRow: 10 };
const NEW_BOUNDS: HexBounds = { maxCol: 4, maxRow: 4 };

function ladderOver(bounds: HexBounds): GeometryLadder {
  return createGeometryLadder(new HexGeometry(40, "flat", bounds), lod);
}

/**
 * First rung-`level` cell (scanning a window of rung coordinates) that exists
 * under the old bounds and, per `survives`, does or does not exist under the new.
 * Chosen via existsAt itself: lattice ancestry is not "the root hex under my centre".
 */
function findRungCell(level: number, survives: boolean): HexTestCell {
  const before = ladderOver(OLD_BOUNDS);
  const after = ladderOver(NEW_BOUNDS);
  const span = 12 * lod.m ** level;
  for (let q = 0; q <= span; q++) {
    for (let r = -span; r <= span; r++) {
      if (before.existsAt(level, q, r) && after.existsAt(level, q, r) === survives) {
        return { q, r, color: "#fff" };
      }
    }
  }
  throw new Error(`no rung-${level} fixture cell found`);
}

const inside2 = findRungCell(2, true);
const outside2 = findRungCell(2, false);
const outside3 = findRungCell(3, false);

function ladderMap(): MapData {
  const layer = makeLayer({
    id: "layer-1",
    cells: [{ q: 1, r: 1, color: "#abc" }],
    levels: { 2: [inside2, outside2], 3: [outside3] },
  });
  return makeMapData({ mapType: "hex", hexSize: 40, orientation: "flat", hexBounds: OLD_BOUNDS, lod, layers: [layer] });
}

describe("resize with ladder rungs", () => {
  it("fixture cells sit where intended", () => {
    const before = ladderOver(OLD_BOUNDS);
    const after = ladderOver(NEW_BOUNDS);
    expect(before.existsAt(2, inside2.q, inside2.r)).toBe(true);
    expect(before.existsAt(2, outside2.q, outside2.r)).toBe(true);
    expect(before.existsAt(3, outside3.q, outside3.r)).toBe(true);
    expect(after.existsAt(2, inside2.q, inside2.r)).toBe(true);
    expect(after.existsAt(2, outside2.q, outside2.r)).toBe(false);
    expect(after.existsAt(3, outside3.q, outside3.r)).toBe(false);
  });

  it("counts rung cells whose ancestor falls outside the new bounds", () => {
    const mapData = ladderMap();
    expect(countLevelOrphans(mapData.layers[0], ladderOver(NEW_BOUNDS))).toBe(2);
    expect(countLevelOrphansForBounds(mapData, mapData.layers[0], NEW_BOUNDS)).toBe(2);
    expect(countLevelOrphansForBounds(mapData, mapData.layers[0], OLD_BOUNDS)).toBe(0);
  });

  it("getOrphanedContentInfo folds rung orphans into the painted-cell total", () => {
    const mapData = ladderMap();
    const levelOrphans = countLevelOrphansForBounds(mapData, mapData.layers[0], NEW_BOUNDS);
    const info = getOrphanedContentInfo(NEW_BOUNDS, "hex", mapData.layers[0].cells, [], "flat", levelOrphans);
    expect(info).toEqual({ cells: 2, objects: 0 });
    // Classic call shape (no sixth argument) is unchanged.
    expect(getOrphanedContentInfo(NEW_BOUNDS, "hex", mapData.layers[0].cells, [], "flat")).toEqual({ cells: 0, objects: 0 });
  });

  it("the filter removes orphaned rung cells and deletes the emptied rung", () => {
    const mapData = ladderMap();
    const next = filterLevelsToBounds(mapData, ladderOver(NEW_BOUNDS));
    expect(next.layers[0].levels).toEqual({ 2: [inside2] });
    expect(next.layers[0].cells).toBe(mapData.layers[0].cells);
  });

  it("deletes the levels container when every rung empties", () => {
    const layer = makeLayer({ id: "layer-1", levels: { 2: [outside2] } });
    const mapData = makeMapData({ mapType: "hex", hexSize: 40, hexBounds: OLD_BOUNDS, lod, layers: [layer] });
    const next = filterLevelsToBounds(mapData, ladderOver(NEW_BOUNDS));
    expect("levels" in next.layers[0]).toBe(false);
  });

  it("returns the same reference when nothing is cut", () => {
    const mapData = ladderMap();
    expect(filterLevelsToBounds(mapData, ladderOver(OLD_BOUNDS))).toBe(mapData);
  });

  it("a classic map builds no ladder and reports no rung orphans", () => {
    const mapData = makeMapData({
      mapType: "hex", hexSize: 40, hexBounds: OLD_BOUNDS,
      layers: [makeLayer({ cells: [{ q: 9, r: 9, color: "#fff" }] })],
    });
    expect(ladderForAuthoredRungs(mapData, new HexGeometry(40, "flat", NEW_BOUNDS))).toBeNull();
    expect(countLevelOrphansForBounds(mapData, mapData.layers[0], NEW_BOUNDS)).toBe(0);
  });
});
