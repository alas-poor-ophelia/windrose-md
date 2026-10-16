/**
 * useWeatherShapes Unit Tests
 *
 * The shared weather outlines: traced once per input change per geometry
 * (both weather layers get the same object), painted cells keyed by a
 * content signature (count + bounding box) and only when the whole-map
 * area follows them, fog removing cells.
 */

import { describe, it, expect } from "vitest";

import { getWeatherShapes, paintedCellsSignature } from "../../../../src/hooks/canvas/useWeatherShapes";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import type { WeatherArea } from "#types/contexts/weather.types";
import type { Cell } from "#types/core/cell.types";

const mapArea: WeatherArea = { id: "map", kind: "map", zoneId: "m", name: "Whole map", cells: "all" };
const region: WeatherArea = { id: "region:a", kind: "region", zoneId: "a", name: "A", cells: [{ x: 0, y: 0 }], regionId: "a" };

describe("paintedCellsSignature", () => {
  it("is the count and bounding box, for grid and hex cells", () => {
    expect(paintedCellsSignature(null)).toBe("0");
    const grid: Cell[] = [{ x: 2, y: 3, color: "#000" }, { x: -1, y: 5, color: "#000" }];
    expect(paintedCellsSignature(grid)).toBe("2:-1,3,2,5");
    const hex: Cell[] = [{ q: 1, r: -2, color: "#000" }];
    expect(paintedCellsSignature(hex)).toBe("1:1,-2,1,-2");
  });
});

describe("getWeatherShapes", () => {
  it("returns the same result to both layers until an input changes", () => {
    const geometry = { type: "grid" as const, cellSize: 10 };
    const areas = [region, mapArea];
    const painted: Cell[] = [{ x: 0, y: 0, color: "#000" }, { x: 1, y: 0, color: "#000" }];
    const input = { geometry, areas, hexBounds: null, orientation: "flat" as const, fogOfWar: null, paintedCells: painted };
    const first = getWeatherShapes(input);
    expect(first.shapes.map(s => s.id)).toEqual(["region:a", "map"]);
    expect(getWeatherShapes(input)).toBe(first);
    // A new array with the same content keeps the shapes (signature, not identity)
    expect(getWeatherShapes({ ...input, paintedCells: painted.map(c => ({ ...c })) })).toBe(first);
    // Painting outside the box retraces
    const grown = [...painted, { x: 4, y: 4, color: "#000" }];
    expect(getWeatherShapes({ ...input, paintedCells: grown })).not.toBe(first);
  });

  it("ignores painted cells on a bounded hex map", () => {
    const hex = new HexGeometry(16, "flat", { maxCol: 3, maxRow: 3 });
    const input = {
      geometry: hex, areas: [mapArea], hexBounds: { maxCol: 3, maxRow: 3 }, orientation: "flat" as const,
      fogOfWar: null, paintedCells: [{ q: 0, r: 0, color: "#000" }] as Cell[],
    };
    const first = getWeatherShapes(input);
    expect(getWeatherShapes({ ...input, paintedCells: [{ q: 2, r: 2, color: "#000" }] as Cell[] })).toBe(first);
  });

  it("drops fogged cells and hands back the fogged keys", () => {
    const geometry = { type: "grid" as const, cellSize: 10 };
    const fogOfWar = { enabled: true, foggedCells: [{ col: 0, row: 0 }], texture: null };
    const result = getWeatherShapes({ geometry, areas: [region], hexBounds: null, orientation: "flat", fogOfWar, paintedCells: null });
    expect(result.shapes).toEqual([]);
    expect(result.fogged?.has("0,0")).toBe(true);
  });
});
