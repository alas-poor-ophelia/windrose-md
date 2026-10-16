/**
 * weatherZones Unit Tests
 *
 * Tests the cell-to-zone index built from weather-bound regions, the
 * per-segment weather fold along a route, and the mounted-map registry
 * behind the weather plugin's zone resolver.
 */

import { describe, it, expect } from "vitest";

import {
  buildCellZoneIndex,
  collectBoundZoneIds,
  computeSegmentWeatherEffects,
  hasWeatherZone,
  publishMapZones,
  resolveMountedHexZone,
} from "../../../src/weather/weatherZones";
import type { WeatherTravelEffect } from "../../../src/weather/weatherTravelRules";
import type { Point } from "#types/core/geometry.types";
import type { Region } from "#types/core/map.types";

function buildRegion(id: string, hexes: Point[], overrides: Partial<Region> = {}): Region {
  return {
    id,
    name: id,
    hexes,
    color: "#336699",
    opacity: 0.3,
    borderColor: "#336699",
    borderWidth: 2,
    visible: true,
    order: 0,
    ...overrides,
  };
}

/** Straight line along the x axis — enough to drive the segment fold */
const lineAlongX = (x1: number, y1: number, x2: number): Point[] => {
  const cells: Point[] = [];
  const step = x2 >= x1 ? 1 : -1;
  for (let x = x1; x !== x2 + step; x += step) cells.push({ x, y: y1 });
  return cells;
};

const SNOW: WeatherTravelEffect = { multiplier: 0.5, reasons: [{ label: "Heavy snow", multiplier: 0.5 }] };

describe("weatherZones", () => {
  describe("hasWeatherZone", () => {
    it("is false for an absent or empty zone id", () => {
      expect(hasWeatherZone(buildRegion("a", []))).toBe(false);
      expect(hasWeatherZone(buildRegion("a", [], { weatherZoneId: "" }))).toBe(false);
    });

    it("is true for a bound region", () => {
      expect(hasWeatherZone(buildRegion("a", [], { weatherZoneId: "coast" }))).toBe(true);
    });
  });

  describe("buildCellZoneIndex", () => {
    it("is empty for missing regions", () => {
      expect(buildCellZoneIndex(undefined).size).toBe(0);
      expect(buildCellZoneIndex(null).size).toBe(0);
    });

    it("indexes only bound regions' hexes", () => {
      const index = buildCellZoneIndex([
        buildRegion("coast", [{ x: 0, y: 0 }, { x: 1, y: -1 }], { weatherZoneId: "ashfall" }),
        buildRegion("plain", [{ x: 5, y: 5 }]),
      ]);
      expect(index.get("0,0")).toBe("ashfall");
      expect(index.get("1,-1")).toBe("ashfall");
      expect(index.has("5,5")).toBe(false);
    });

    it("keeps weather on a hidden region", () => {
      // Visibility is a display choice; the weather over the ground is not
      const index = buildCellZoneIndex([
        buildRegion("secret", [{ x: 2, y: 2 }], { weatherZoneId: "ashfall", visible: false }),
      ]);
      expect(index.get("2,2")).toBe("ashfall");
    });

    it("lets the region drawn on top win an overlapping hex", () => {
      const index = buildCellZoneIndex([
        buildRegion("top", [{ x: 0, y: 0 }], { weatherZoneId: "upper", order: 2 }),
        buildRegion("bottom", [{ x: 0, y: 0 }], { weatherZoneId: "lower", order: 1 }),
      ]);
      expect(index.get("0,0")).toBe("upper");
    });
  });

  describe("collectBoundZoneIds", () => {
    it("lists each bound zone once", () => {
      expect(collectBoundZoneIds([
        buildRegion("a", [], { weatherZoneId: "ashfall" }),
        buildRegion("b", []),
        buildRegion("c", [], { weatherZoneId: "greywold" }),
        buildRegion("d", [], { weatherZoneId: "ashfall" }),
      ])).toEqual(["ashfall", "greywold"]);
    });
  });

  describe("computeSegmentWeatherEffects", () => {
    const index = buildCellZoneIndex([
      buildRegion("coast", [{ x: 2, y: 0 }, { x: 3, y: 0 }], { weatherZoneId: "ashfall" }),
    ]);
    const effectForZone = (zoneId: string) => (zoneId === "ashfall" ? SNOW : null);

    it("returns one effect per segment, aligned with the route", () => {
      const effects = computeSegmentWeatherEffects(
        [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 3, y: 0 }],
        lineAlongX, index, effectForZone
      );
      expect(effects).toHaveLength(2);
      // First segment (cells 0,1) never enters the region
      expect(effects[0]).toEqual({ multiplier: 1, reasons: [] });
      // Second segment (cells 1,2,3): two of three cells at x0.5
      expect(effects[1].multiplier).toBeCloseTo(3 / (1 + 2 + 2));
      expect(effects[1].reasons).toEqual([{ label: "Heavy snow", multiplier: 0.5 }]);
    });

    it("is empty for fewer than two points", () => {
      expect(computeSegmentWeatherEffects([{ x: 0, y: 0 }], lineAlongX, index, effectForZone)).toEqual([]);
      expect(computeSegmentWeatherEffects([], lineAlongX, index, effectForZone)).toEqual([]);
    });

    it("treats a bound zone with no report as no weather", () => {
      const effects = computeSegmentWeatherEffects(
        [{ x: 2, y: 0 }, { x: 3, y: 0 }], lineAlongX, index, () => null
      );
      expect(effects).toEqual([{ multiplier: 1, reasons: [] }]);
    });
  });

  describe("mounted-map registry", () => {
    const index = buildCellZoneIndex([
      buildRegion("coast", [{ x: 4, y: -2 }], { weatherZoneId: "ashfall" }),
    ]);

    it("resolves a hex only while its map is published", () => {
      expect(resolveMountedHexZone("map-a", 4, -2)).toBeNull();
      const retract = publishMapZones("map-a", index);
      expect(resolveMountedHexZone("map-a", 4, -2)).toBe("ashfall");
      expect(resolveMountedHexZone("map-a", 0, 0)).toBeNull();
      expect(resolveMountedHexZone("map-b", 4, -2)).toBeNull();
      retract();
      expect(resolveMountedHexZone("map-a", 4, -2)).toBeNull();
    });

    it("does not let a stale retraction remove a newer index", () => {
      const retractOld = publishMapZones("map-a", index);
      const newer = buildCellZoneIndex([
        buildRegion("coast", [{ x: 4, y: -2 }], { weatherZoneId: "greywold" }),
      ]);
      const retractNew = publishMapZones("map-a", newer);
      retractOld();
      expect(resolveMountedHexZone("map-a", 4, -2)).toBe("greywold");
      retractNew();
    });

    it("keeps answering while another view of the same map is still open", () => {
      // An embed and a full pane of one map: closing the later one must not
      // take the earlier one's answers with it
      const retractEmbed = publishMapZones("map-a", index);
      const retractPane = publishMapZones("map-a", buildCellZoneIndex([
        buildRegion("coast", [{ x: 4, y: -2 }], { weatherZoneId: "ashfall" }),
      ]));
      retractPane();
      expect(resolveMountedHexZone("map-a", 4, -2)).toBe("ashfall");
      retractEmbed();
      expect(resolveMountedHexZone("map-a", 4, -2)).toBeNull();
    });
  });
});
