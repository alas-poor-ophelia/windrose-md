/**
 * weatherAreas / windroseZoneResolver Unit Tests
 *
 * Area resolution for the level being shown (bound regions + map-level
 * area, sub-hex inheritance up the drill path), the cell lookup, area
 * identity reuse, and Windrose's zone-resolver answers (open maps sync,
 * closed maps through a read-only loader).
 */

import { afterEach, describe, it, expect, vi } from "vitest";

import { buildAreaLookup, inheritedZoneId, resolveWeatherAnimate, resolveWeatherAreas, sameWeatherAreas } from "../../../src/weather/weatherAreas";
import { withRegionWeatherZone } from "../../../src/weather/weatherRegionMenu";
import { getDataFileStamp, noteStoreFileCreated, noteStoreFileModified, noteStoreFilePathGone } from "../../../src/persistence/storeCache";
import { TFile } from "obsidian";
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

describe("resolveWeatherAnimate", () => {
  it("defaults to true and uses the level's own value when set", () => {
    expect(resolveWeatherAnimate(map())).toBe(true);
    expect(resolveWeatherAnimate(map({ weatherAnimate: false }))).toBe(false);
    expect(resolveWeatherAnimate(null)).toBe(true);
  });

  it("inherits the nearest ancestor's value down the sub-hex path", () => {
    const grandchild = map();
    const child = withSub(map(), "1,1", grandchild);
    const root = withSub(map({ weatherAnimate: false }), "0,0", child);
    expect(resolveWeatherAnimate(root, ["0,0"])).toBe(false);
    expect(resolveWeatherAnimate(root, ["0,0", "1,1"])).toBe(false);
    const ownOn = withSub(map({ weatherAnimate: false }), "0,0", map({ weatherAnimate: true }));
    expect(resolveWeatherAnimate(ownOn, ["0,0"])).toBe(true);
  });
});

describe("withRegionWeatherZone", () => {
  it("binds one region and deletes the key on unbind (never stores undefined)", () => {
    const regions = [region("a", [], { weatherZoneId: "z" }), region("b", [])];
    const bound = withRegionWeatherZone(regions, "b", "y");
    expect(bound[1].weatherZoneId).toBe("y");
    expect(bound[0]).toBe(regions[0]);
    const unbound = withRegionWeatherZone(regions, "a", undefined);
    expect("weatherZoneId" in unbound[0]).toBe(false);
    expect(regions[0].weatherZoneId).toBe("z");
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

  it("reuses a closed map's parsed zones until the source stamp changes", async () => {
    const readRaw = vi.fn(() => Promise.resolve(JSON.stringify(stored)));
    let stamp = "a";
    const answers = createWindroseZoneAnswers(mapLoaderFromRawEntries(readRaw), () => stamp);
    await expect(answers.resolveAsync({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).resolves.toBe("upland");
    await expect(answers.resolveAsync(regionLocator("closed-map", "hills"))).resolves.toBe("upland");
    expect(readRaw).toHaveBeenCalledTimes(1);
    stamp = "b";
    readRaw.mockImplementation(() => Promise.resolve(JSON.stringify(map({ weatherZoneId: "tundra" }))));
    await expect(answers.resolveAsync({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).resolves.toBe("tundra");
    expect(readRaw).toHaveBeenCalledTimes(2);
  });

  it("caches a missing map too, and never caches a failed read", async () => {
    const load = vi.fn(() => Promise.reject(new Error("io")));
    const answers = createWindroseZoneAnswers(load, () => "same");
    await answers.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 });
    await answers.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 });
    expect(load).toHaveBeenCalledTimes(2);
    const none = vi.fn(() => Promise.resolve(null));
    const missing = createWindroseZoneAnswers(none, () => "same");
    await missing.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 });
    await missing.resolveAsync({ kind: "hex", mapId: "x", q: 0, r: 0 });
    expect(none).toHaveBeenCalledTimes(1);
  });

  it("the data-file stamp moves when the data file is created (first use, restore)", () => {
    const dataFile = Object.assign(new TFile(), { path: "windrose-md-data.json", stat: { mtime: 1, size: 1, ctime: 1 } });
    const other = Object.assign(new TFile(), { path: "notes/created.md", stat: { mtime: 1, size: 1, ctime: 1 } });
    const s0 = getDataFileStamp();
    noteStoreFileCreated(other);
    expect(getDataFileStamp()).toBe(s0);
    noteStoreFileCreated(dataFile);
    expect(getDataFileStamp()).not.toBe(s0);
  });

  it("a closed-map answer cached before the data file existed is dropped once it is created", async () => {
    const dataFile = Object.assign(new TFile(), { path: "windrose-md-data.json", stat: { mtime: 1, size: 1, ctime: 1 } });
    let raw: string | null = null;
    const readRaw = vi.fn(() => Promise.resolve(raw));
    const answers = createWindroseZoneAnswers(mapLoaderFromRawEntries(readRaw));
    await expect(answers.resolveAsync({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).resolves.toBeNull();
    raw = JSON.stringify(stored);
    noteStoreFileCreated(dataFile);
    await expect(answers.resolveAsync({ kind: "hex", mapId: "closed-map", q: 2, r: -1 })).resolves.toBe("upland");
  });

  it("the data-file stamp moves on a modify, delete or rename of the data file only", () => {
    const dataFile = Object.assign(new TFile(), { path: "windrose-md-data.json", stat: { mtime: 1, size: 1, ctime: 1 } });
    const other = Object.assign(new TFile(), { path: "notes/x.md", stat: { mtime: 1, size: 1, ctime: 1 } });
    const s0 = getDataFileStamp();
    noteStoreFileModified(other);
    expect(getDataFileStamp()).toBe(s0);
    noteStoreFileModified(dataFile);
    const s1 = getDataFileStamp();
    expect(s1).not.toBe(s0);
    noteStoreFilePathGone("windrose-md-data.json");
    expect(getDataFileStamp()).not.toBe(s1);
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
