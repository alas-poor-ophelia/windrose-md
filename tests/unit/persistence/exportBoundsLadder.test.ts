/**
 * exportOperations.calculateContentBounds — ladder rungs.
 *
 * Rung (>= 1) cells are in their rung's own axial coordinates, so their bounds
 * must come from ladder.geometryForLevel(L), never the root geometry.
 */

import { describe, it, expect } from "vitest";

import { calculateContentBounds } from "../../../src/persistence/exportOperations";
import { ladderForAuthoredRungs } from "../../../src/persistence/resizeOperations";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import { LADDER_DEFAULTS } from "../../../src/geometry/core/lattice";

import type { MapData } from "#types/core/map.types";

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
});
