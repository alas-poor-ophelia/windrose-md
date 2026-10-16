/**
 * weatherAreas / windroseZoneResolver Unit Tests
 *
 * Area resolution for the level being shown (bound regions + map-level
 * area, sub-hex inheritance up the drill path), the cell lookup, area
 * identity reuse, and Windrose's zone-resolver answers (open maps sync,
 * closed maps through a read-only loader).
 */

import { afterEach, describe, it, expect, vi } from "vitest";

import { buildAreaLookup, inheritedZoneId, resolveWeatherAreas, sameWeatherAreas } from "../../../src/weather/weatherAreas";
import { createWindroseZoneAnswers, mapLoaderFromRawEntries } from "../../../src/weather/windroseZoneResolver";
import { buildMapZoneSnapshot, publishMapZones } from "../../../src/weather/weatherZones";
import type { MapData, Region } from "#types/core/map.types";
import type { Point } from "#types/core/geometry.types";

function region(id: string, hexes: Point[], overrides: Partial<Region> = {}): Region {
  return {
    id, name: id, hexes, color: "#336699", opacity: 0.3, borderColor: "#336699", borderWidth: 2,
    visible: true, order: 0, ...overrides,
  };
}

function map(overrides: Partial<MapData> = {}): MapData {
  return { name: "m", mapType: "hex", layers: [], ...overrides } as unknown as MapData;
}

function withSub(parent: MapData, key: string, child: MapData): MapData {
  return { ...parent, subHexMaps: { ...(parent.subHexMaps ?? {}), [key]: { subdivisionRings: 7, mapData: child, lastModified: "" } } };
}

describe("resolveWeatherAreas", () => {
  it("lists bound regions topmost first, then the map-level area", () => {
    const root = map({
      weatherZoneId: "plains",
      regions: [
        region("low", [{ x: 0, y: 0 }], { weatherZoneId: "lowland", order: 1 }),
        region("unbound", [{ x: 5, y: 5 }]),
        region("high", [{ x: 0, y: 0 }, { x: 1, y: 0 }], { weatherZoneId: "upland", order: 2 }),
      ],
    });
    const areas = resolveWeatherAreas(root);
    expect(areas.map(a => [a.id, a.kind, a.zoneId])).toEqual([
      ["region:high", "region", "upland"],
      ["region:low", "region", "lowland"],
      ["map", "map", "plains"],
    ]);
    expect(areas[0].regionId).toBe("high");
    expect(areas[2].cells).toBe("all");
  });

  it("is empty for a map with no weather", () => {
    expect(resolveWeatherAreas(map({ regions: [region("a", [])] }))).toEqual([]);
    expect(resolveWeatherAreas(null)).toEqual([]);
  });

  it("gives a grid map its map-level area", () => {
    expect(resolveWeatherAreas(map({ mapType: "grid", weatherZoneId: "coast" } as Partial<MapData>))).toEqual([
      { id: "map", kind: "map", zoneId: "coast", name: "Whole map", cells: "all" },
    ]);
  });

  describe("sub-hex inheritance", () => {
    const grandchild = map();
    const child = withSub(map(), "1,1", grandchild);
    const root = withSub(map({
      weatherZoneId: "plains",
      regions: [region("hills", [{ x: 2, y: -1 }], { weatherZoneId: "upland" })],
    }), "2,-1", child);
    const rootWithUnbound = withSub(root, "0,0", map());

    it("inherits the zone of the drilled hex's region", () => {
      expect(inheritedZoneId(root, ["2,-1"])).toBe("upland");
      expect(resolveWeatherAreas(root, ["2,-1"])).toEqual([
        { id: "map", kind: "map", zoneId: "upland", name: "Whole map", cells: "all" },
      ]);
    });

    it("falls back to the parent's map-level zone for an unbound hex", () => {
      expect(inheritedZoneId(rootWithUnbound, ["0,0"])).toBe("plains");
    });

    it("walks up more than one level", () => {
      expect(inheritedZoneId(root, ["2,-1", "1,1"])).toBe("upland");
    });

    it("stops at the nearest level with weather", () => {
      const childWithZone = withSub(map({ weatherZoneId: "valley" }), "1,1", grandchild);
      const r = withSub(root, "2,-1", childWithZone);
      expect(inheritedZoneId(r, ["2,-1", "1,1"])).toBe("valley");
    });

    it("keeps a sub-hex's own zone and regions over the inherited one", () => {
      const own = withSub(root, "2,-1", map({
        weatherZoneId: "own",
        regions: [region("pond", [{ x: 0, y: 0 }], { weatherZoneId: "marsh" })],
      }));
      expect(resolveWeatherAreas(own, ["2,-1"]).map(a => a.zoneId)).toEqual(["marsh", "own"]);
    });

    it("has no weather when no ancestor has any", () => {
      const bare = withSub(map(), "0,0", map());
      expect(resolveWeatherAreas(bare, ["0,0"])).toEqual([]);
      expect(resolveWeatherAreas(bare, ["9,9"])).toEqual([]);
    });
  });
});

describe("buildAreaLookup", () => {
  it("finds the topmost region at a cell, else the map-level area, else null", () => {
    const areas = resolveWeatherAreas(map({
      weatherZoneId: "plains",
      regions: [
        region("low", [{ x: 0, y: 0 }], { weatherZoneId: "lowland", order: 1 }),
        region("high", [{ x: 0, y: 0 }], { weatherZoneId: "upland", order: 2 }),
      ],
    }));
    const areaAt = buildAreaLookup(areas);
    expect(areaAt({ x: 0, y: 0 })?.zoneId).toBe("upland");
    expect(areaAt({ x: 7, y: 7 })?.zoneId).toBe("plains");
    expect(buildAreaLookup(areas.slice(0, 2))({ x: 7, y: 7 })).toBeNull();
  });
});

describe("sameWeatherAreas", () => {
  it("matches equal areas sharing cell arrays, and not changed ones", () => {
    const hexes = [{ x: 0, y: 0 }];
    const a = resolveWeatherAreas(map({ regions: [region("r", hexes, { weatherZoneId: "z" })] }));
    const b = resolveWeatherAreas(map({ regions: [region("r", hexes, { weatherZoneId: "z" })] }));
    expect(sameWeatherAreas(a, b)).toBe(true);
    const c = resolveWeatherAreas(map({ regions: [region("r", hexes, { weatherZoneId: "y" })] }));
    expect(sameWeatherAreas(a, c)).toBe(false);
    const d = resolveWeatherAreas(map({ regions: [region("r", [...hexes], { weatherZoneId: "z" })] }));
    expect(sameWeatherAreas(a, d)).toBe(false);
  });
});

describe("windroseZoneResolver", () => {
  const retractions: (() => void)[] = [];
  afterEach(() => { while (retractions.length > 0) retractions.pop()?.(); });

  const stored = map({
    weatherZoneId: "plains",
    regions: [region("hills", [{ x: 2, y: -1 }], { weatherZoneId: "upland" })],
  });
  const regionLocator = (mapId: string, regionId: string) =>
    ({ kind: "custom" as const, namespace: "windrose.region", data: { mapId, regionId } });

  it("answers hex and region locators for an open map synchronously", () => {
    retractions.push(publishMapZones("open-map", buildMapZoneSnapshot(stored)));
    const answers = createWindroseZoneAnswers(() => Promise.resolve(null));
    expect(answers.resolve({ kind: "hex", mapId: "open-map", q: 2, r: -1 })).toBe("upland");
    expect(answers.resolve({ kind: "hex", mapId: "open-map", q: 0, r: 0 })).toBe("plains");
    expect(answers.resolve(regionLocator("open-map", "hills"))).toBe("upland");
    expect(answers.resolve({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).toBeNull();
    expect(answers.resolve({ kind: "custom", namespace: "other.region", data: { mapId: "open-map", regionId: "hills" } })).toBeNull();
    expect(answers.resolve({ kind: "note", path: "x.md" })).toBeNull();
  });

  it("loads a closed map for async answers, read-only, and prefers an open map", async () => {
    const readRaw = vi.fn((mapId: string) => Promise.resolve(mapId === "closed-map" ? JSON.stringify(stored) : null));
    const answers = createWindroseZoneAnswers(mapLoaderFromRawEntries(readRaw));
    await expect(answers.resolveAsync({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).resolves.toBe("upland");
    await expect(answers.resolveAsync(regionLocator("closed-map", "hills"))).resolves.toBe("upland");
    await expect(answers.resolveAsync({ kind: "hex", mapId: "missing", q: 0, r: 0 })).resolves.toBeNull();

    retractions.push(publishMapZones("open-map", buildMapZoneSnapshot(stored)));
    readRaw.mockClear();
    await expect(answers.resolveAsync({ kind: "hex", mapId: "open-map", q: 0, r: 0 })).resolves.toBe("plains");
    expect(readRaw).not.toHaveBeenCalled();
  });

  it("answers null when the stored entry is unreadable", async () => {
    const answers = createWindroseZoneAnswers(mapLoaderFromRawEntries(() => Promise.resolve("{not json")));
    await expect(answers.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 })).resolves.toBeNull();
    const failing = createWindroseZoneAnswers(() => Promise.reject(new Error("io")));
    await expect(failing.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 })).resolves.toBeNull();
  });

  it("rejects malformed locators", () => {
    const answers = createWindroseZoneAnswers(() => Promise.resolve(null));
    expect(answers.resolve({ kind: "hex", mapId: "m", q: 0.5, r: 0 })).toBeNull();
    expect(answers.resolve({ kind: "custom", namespace: "windrose.region", data: null })).toBeNull();
  });
});
