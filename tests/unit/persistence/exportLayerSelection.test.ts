/**
 * layerAccessor — image export layer selection.
 *
 * Covers getExportLayers (resolve a dialog selection to draw-ordered layers)
 * and getDefaultExportLayers (seed the dialog from the live layer stack).
 */

import { describe, it, expect } from "vitest";

import { getExportLayers, getDefaultExportLayers } from "../../../src/persistence/layerAccessor";

import type { MapData, MapLayer } from "#types/core/map.types";

import { makeLayer, makeMapData } from "../helpers/fixtures";

function mkLayer(id: string, order: number, extra: Partial<MapLayer> = {}): MapLayer {
  return makeLayer({ id, name: id, order, ...extra });
}

/** Simple (non-strata) map: three layers on the default board, active "b". */
function simpleMap(): MapData {
  return makeMapData({
    layers: [mkLayer("a", 0), mkLayer("b", 1), mkLayer("c", 2)],
    activeLayerId: "b",
  });
}

describe("getExportLayers", () => {
  it("returns the selected layers sorted bottom-to-top by order", () => {
    const map = simpleMap();
    const resolved = getExportLayers(map, [
      { id: "c", opacity: 1 },
      { id: "a", opacity: 0.5 },
    ]);
    expect(resolved.map(l => l.id)).toEqual(["a", "c"]);
  });

  it("drops unknown layer ids", () => {
    const map = simpleMap();
    const resolved = getExportLayers(map, [
      { id: "ghost", opacity: 1 },
      { id: "b", opacity: 1 },
    ]);
    expect(resolved.map(l => l.id)).toEqual(["b"]);
  });

  it("de-duplicates repeated ids", () => {
    const map = simpleMap();
    const resolved = getExportLayers(map, [
      { id: "a", opacity: 1 },
      { id: "a", opacity: 0.2 },
    ]);
    expect(resolved.map(l => l.id)).toEqual(["a"]);
  });

  it("returns an empty list for an empty selection or a missing map", () => {
    expect(getExportLayers(simpleMap(), [])).toEqual([]);
    expect(getExportLayers(null, [{ id: "a", opacity: 1 }])).toEqual([]);
  });
});

describe("getDefaultExportLayers", () => {
  it("defaults a simple map to the active layer at full opacity", () => {
    expect(getDefaultExportLayers(simpleMap())).toEqual([{ id: "b", opacity: 1 }]);
  });

  it("defaults a strata map to the active board's visible layers", () => {
    const map = makeMapData({
      layerMode: "strata",
      layers: [
        mkLayer("a", 0, { boardId: "A" }),
        mkLayer("a-hidden", 1, { boardId: "A", visible: false }),
        mkLayer("a-top", 2, { boardId: "A" }),
        mkLayer("b", 0, { boardId: "B" }),
      ],
      activeLayerId: "a",
      boards: [
        { id: "A", name: "Ground floor", order: 0 },
        { id: "B", name: "Basement", order: 1 },
      ],
      activeBoardId: "A",
    });

    expect(getDefaultExportLayers(map)).toEqual([
      { id: "a", opacity: 1 },
      { id: "a-top", opacity: 1 },
    ]);
  });
});
