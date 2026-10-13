/**
 * Hex bounds shrink: the settings modal's orphan count must equal what the
 * save path actually deletes (ABS-07). Both go through isAxialInHexBounds.
 *
 * usePanelState is driven directly with preact/hooks stubbed (the delete path
 * is plain code inside handleSettingsSave; no rendering is needed).
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("preact/hooks", () => ({
  useState: (init: unknown) => [typeof init === "function" ? (init as () => unknown)() : init, () => {}],
  useMemo: (fn: () => unknown) => fn(),
  useEffect: () => {},
}));

import { usePanelState } from "../../../src/hooks/state/usePanelState";
import { getOrphanedContentInfo } from "../../../src/components/settings/settingsReducer";
import { isAxialInHexBounds, isOffsetInHexBounds } from "../../../src/geometry/core/offsetCoordinates";

import type { HexBounds, MapData, MapLayer } from "#types/core/map.types";
import type { UIPreferences } from "#types/index";
import type { Cell } from "#types/core/cell.types";
import type { MapObject } from "#types/objects/object.types";
import type { HexOrientation } from "#types/settings/settings.types";

function fixture(orientation: HexOrientation): MapData {
  const cells: Cell[] = [];
  const objects: MapObject[] = [];
  for (let q = -6; q <= 10; q++) {
    for (let r = -6; r <= 10; r++) {
      cells.push({ q, r, color: "#fff" });
      if ((q + r) % 3 === 0) {
        objects.push({ id: `o${q},${r}`, type: "chest", position: { x: q, y: r } } as unknown as MapObject);
      }
    }
  }
  const layer = {
    id: "L1", name: "L1", order: 0, visible: true,
    cells, curves: [], edges: [], objects, textLabels: [], fogOfWar: null,
  } as MapLayer;
  return {
    schemaVersion: 2, mapType: "hex", orientation,
    hexBounds: { maxCol: 30, maxRow: 30 },
    activeLayerId: "L1", layerPanelVisible: false, layers: [layer],
  } as MapData;
}

function saveWithDelete(mapData: MapData, bounds: HexBounds): MapData {
  let saved: MapData | null = null;
  const { handleSettingsSave } = usePanelState({ mapData, updateMapData: (d) => { saved = d; } });
  handleSettingsSave(
    { useGlobalSettings: true, overrides: {} },
    {} as UIPreferences,
    bounds, null, null, true
  );
  if (!saved) throw new Error("updateMapData not called");
  return saved;
}

const cases: Array<[string, HexOrientation, HexBounds]> = [
  ["radial, flat", "flat", { maxCol: 7, maxRow: 7, maxRing: 3 }],
  ["radial, pointy", "pointy", { maxCol: 9, maxRow: 9, maxRing: 4 }],
  ["rectangular, flat", "flat", { maxCol: 5, maxRow: 4 }],
  ["rectangular, pointy", "pointy", { maxCol: 6, maxRow: 3 }],
];

describe("hex bounds shrink: orphan count equals deleted count", () => {
  it.each(cases)("%s", (_name, orientation, bounds) => {
    const mapData = fixture(orientation);
    const before = mapData.layers[0];

    const orphans = getOrphanedContentInfo(bounds, "hex", before.cells, before.objects, orientation);
    const after = saveWithDelete(mapData, bounds).layers[0];

    expect(orphans.cells).toBeGreaterThan(0);
    expect(orphans.cells).toBe(before.cells.length - after.cells.length);
    expect(orphans.objects).toBe(before.objects.length - after.objects.length);
  });
});

describe("isAxialInHexBounds", () => {
  it("treats a missing bounds as unbounded", () => {
    expect(isAxialInHexBounds(100, -100, null)).toBe(true);
  });

  it("radial: ring distance <= maxRing", () => {
    const b = { maxCol: 7, maxRow: 7, maxRing: 3 };
    expect(isAxialInHexBounds(3, 0, b)).toBe(true);
    expect(isAxialInHexBounds(2, -3, b)).toBe(true);  // ring 3
    expect(isAxialInHexBounds(2, 2, b)).toBe(false); // ring 4
  });

  it("rectangular: offset coordinates inside maxCol x maxRow", () => {
    const b = { maxCol: 5, maxRow: 4 };
    expect(isAxialInHexBounds(0, 0, b, "flat")).toBe(true);
    expect(isAxialInHexBounds(-1, 0, b, "flat")).toBe(false);
    expect(isAxialInHexBounds(5, 0, b, "flat")).toBe(false);
  });

  it("offset variant agrees with the axial predicate for radial bounds", () => {
    const b = { maxCol: 9, maxRow: 9, maxRing: 4 };
    for (let col = -6; col <= 6; col++) {
      for (let row = -6; row <= 6; row++) {
        const q = col;
        const r = row - (col - (col & 1)) / 2; // odd-q flat
        expect(isOffsetInHexBounds(col, row, b, "flat")).toBe(isAxialInHexBounds(q, r, b, "flat"));
      }
    }
  });
});
