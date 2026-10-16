/**
 * weatherFog Unit Tests
 *
 * The fog rule for weather UI: fogged cells in area coordinates (hex fog
 * converted from offset to axial), regions revealed at >= 50% unfogged,
 * the whole-map area revealed while any map cell is out of the fog
 * (bounded hex by count, unbounded maps by painted cells), and the
 * revealed list's identity.
 */

import { describe, it, expect } from "vitest";

import { buildWeatherFogView, foggedAreaKeys, sameAreaList, WEATHER_MIN_REVEALED } from "../../../src/weather/weatherFog";
import { axialToOffset } from "../../../src/geometry/core/offsetCoordinates";
import type { WeatherArea } from "#types/contexts/weather.types";
import type { FogOfWar } from "#types/core/map.types";
import type { Cell } from "#types/core/cell.types";

function fog(cells: Array<{ col: number; row: number }>, enabled = true): FogOfWar {
  return { enabled, foggedCells: cells, texture: null };
}

function regionArea(id: string, cells: Array<{ x: number; y: number }>): WeatherArea {
  return { id: `region:${id}`, kind: "region", zoneId: "z", name: id, cells, regionId: id };
}

const WHOLE_MAP: WeatherArea = { id: "map", kind: "map", zoneId: "z", name: "Whole map", cells: "all" };

describe("foggedAreaKeys", () => {
  it("is null without active fog", () => {
    expect(foggedAreaKeys(null, "grid", "flat")).toBeNull();
    expect(foggedAreaKeys(fog([{ col: 1, row: 1 }], false), "grid", "flat")).toBeNull();
    expect(foggedAreaKeys(fog([]), "grid", "flat")).toBeNull();
  });

  it("keys grid fog as col,row and hex fog as axial q,r", () => {
    expect([...foggedAreaKeys(fog([{ col: 2, row: 3 }]), "grid", "flat")!]).toEqual(["2,3"]);
    const { col, row } = axialToOffset(2, -1, "flat");
    expect(foggedAreaKeys(fog([{ col, row }]), "hex", "flat")!.has("2,-1")).toBe(true);
  });

  it("caches per fog array and geometry", () => {
    const f = fog([{ col: 1, row: 2 }]);
    expect(foggedAreaKeys(f, "grid", "flat")).toBe(foggedAreaKeys(f, "grid", "flat"));
    expect(foggedAreaKeys(f, "hex", "pointy")).not.toBe(foggedAreaKeys(f, "grid", "flat"));
  });
});

describe("buildWeatherFogView", () => {
  const grid = (fogOfWar: FogOfWar | null, paintedCells?: Cell[]) =>
    ({ fogOfWar, mapType: "grid" as const, orientation: "flat" as const, paintedCells });

  it("reveals everything without fog, and returns the same list", () => {
    const areas = [regionArea("a", [{ x: 0, y: 0 }]), WHOLE_MAP];
    const view = buildWeatherFogView(areas, grid(null));
    expect(view.revealedAreas).toBe(areas);
    expect(view.isFogged({ x: 0, y: 0 })).toBe(false);
  });

  it("reveals a region at half its cells out of the fog, not below", () => {
    expect(WEATHER_MIN_REVEALED).toBe(0.5);
    const half = regionArea("half", [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    const third = regionArea("third", [{ x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
    const view = buildWeatherFogView([half, third], grid(fog([{ col: 0, row: 0 }, { col: 2, row: 0 }, { col: 3, row: 0 }])));
    expect(view.areaRevealed(half)).toBe(true);
    expect(view.areaRevealed(third)).toBe(false);
    expect(view.revealedAreas).toEqual([half]);
    expect(view.isFogged({ x: 0, y: 0 })).toBe(true);
    expect(view.isFogged({ x: 1, y: 0 })).toBe(false);
  });

  it("never reveals a region with no cells while fog is on", () => {
    const empty = regionArea("empty", []);
    expect(buildWeatherFogView([empty], grid(fog([{ col: 9, row: 9 }]))).revealedAreas).toEqual([]);
  });

  it("reveals the whole map on an unbounded map while a painted cell is out of the fog", () => {
    const painted: Cell[] = [{ x: 0, y: 0, color: "#000" }, { x: 1, y: 0, color: "#000" }] as Cell[];
    expect(buildWeatherFogView([WHOLE_MAP], grid(fog([{ col: 0, row: 0 }]), painted)).revealedAreas).toEqual([WHOLE_MAP]);
    expect(buildWeatherFogView([WHOLE_MAP], grid(fog([{ col: 0, row: 0 }, { col: 1, row: 0 }]), painted)).revealedAreas).toEqual([]);
    // Nothing painted: the whole canvas, which fog cannot cover
    expect(buildWeatherFogView([WHOLE_MAP], grid(fog([{ col: 0, row: 0 }]), [])).revealedAreas).toEqual([WHOLE_MAP]);
  });

  it("counts a rectangular hex map's fogged cells inside its bounds", () => {
    const input = (cells: Array<{ col: number; row: number }>) => ({
      fogOfWar: fog(cells), mapType: "hex" as const, orientation: "flat" as const, hexBounds: { maxCol: 2, maxRow: 1 },
    });
    expect(buildWeatherFogView([WHOLE_MAP], input([{ col: 0, row: 0 }, { col: 5, row: 5 }])).revealedAreas).toEqual([WHOLE_MAP]);
    expect(buildWeatherFogView([WHOLE_MAP], input([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 0 }])).revealedAreas).toEqual([]);
  });

  it("counts a radial hex map's fogged cells inside its rings", () => {
    // Ring 1: 7 cells
    const ring1 = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]].map(([q, r]) => axialToOffset(q, r, "pointy"));
    const input = (cells: Array<{ col: number; row: number }>) => ({
      fogOfWar: fog(cells), mapType: "hex" as const, orientation: "pointy" as const, hexBounds: { maxCol: 0, maxRow: 0, maxRing: 1 },
    });
    expect(buildWeatherFogView([WHOLE_MAP], input(ring1)).revealedAreas).toEqual([]);
    expect(buildWeatherFogView([WHOLE_MAP], input(ring1.slice(1))).revealedAreas).toEqual([WHOLE_MAP]);
  });

  it("converts hex fog before testing region cells", () => {
    const area = regionArea("r", [{ x: 2, y: -1 }]);
    const { col, row } = axialToOffset(2, -1, "flat");
    const view = buildWeatherFogView([area], { fogOfWar: fog([{ col, row }]), mapType: "hex", orientation: "flat" });
    expect(view.areaRevealed(area)).toBe(false);
    expect(view.isFogged({ x: 2, y: -1 })).toBe(true);
  });
});

describe("sameAreaList", () => {
  it("compares by area identity and order", () => {
    const a = regionArea("a", []);
    const b = regionArea("b", []);
    expect(sameAreaList([a, b], [a, b])).toBe(true);
    expect(sameAreaList([a, b], [b, a])).toBe(false);
    expect(sameAreaList([a], [{ ...a }])).toBe(false);
  });
});
