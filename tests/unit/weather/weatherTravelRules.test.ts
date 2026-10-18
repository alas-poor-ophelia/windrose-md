/**
 * weatherTravelRules Unit Tests
 *
 * Tests the weather-to-travel mapping: rule matching, in-group competition,
 * cross-group stacking with its floor, and the harmonic fold of per-cell
 * multipliers into one per segment.
 */

import { describe, it, expect } from "vitest";

import {
  MIN_WEATHER_MULTIPLIER,
  evaluateWeatherTravel,
  combineCellEffects,
  computeWeatherTimeRatio,
  formatWeatherNote,
  summarizeWeatherReasons,
} from "../../../src/weather/weatherTravelRules";
import type { WeatherTravelRule } from "../../../src/weather/weatherTravelRules";
import type { WadjetWeatherReport } from "#types/integrations/wadjet.types";

/** A calm, clear, mild day; tests override the fields they exercise */
function buildReport(overrides: Partial<WadjetWeatherReport> = {}): WadjetWeatherReport {
  return {
    schemaVersion: 0,
    zoneId: "zone",
    dayOrdinal: 1,
    temperature: { high: 18, low: 8, mean: 13 },
    precipitation: { type: "none", amountMm: 0, intensity: 0 },
    humidity: 0.5,
    cloudCover: 0.2,
    wind: { speedKph: 10, directionDeg: 90 },
    visibilityKm: 20,
    regime: "normal",
    conditions: [],
    descriptors: { temperature: "mild", precipitation: "dry", wind: "light", sky: "clear" },
    overridden: false,
    ...overrides,
  };
}

const snow = (intensity: number) => buildReport({ precipitation: { type: "snow", amountMm: 10, intensity } });

describe("weatherTravelRules", () => {
  describe("evaluateWeatherTravel", () => {
    it("leaves fair weather at normal speed with no reasons", () => {
      expect(evaluateWeatherTravel(buildReport())).toEqual({ multiplier: 1, reasons: [] });
    });

    it("applies a matching precipitation rule", () => {
      expect(evaluateWeatherTravel(snow(0.3))).toEqual({
        multiplier: 0.75,
        reasons: [{ label: "Snow", multiplier: 0.75 }],
      });
    });

    it("lets the slowest rule in a group win instead of stacking the group", () => {
      // Heavy snow also satisfies the plain snow rule; only one applies
      expect(evaluateWeatherTravel(snow(0.8))).toEqual({
        multiplier: 0.5,
        reasons: [{ label: "Heavy snow", multiplier: 0.5 }],
      });
    });

    it("ignores precipitation below a rule's intensity threshold", () => {
      expect(evaluateWeatherTravel(snow(0.1)).multiplier).toBe(1);
    });

    it("does not match a rule for a different precipitation type", () => {
      const drizzle = buildReport({ precipitation: { type: "drizzle", amountMm: 4, intensity: 0.9 } });
      expect(evaluateWeatherTravel(drizzle).multiplier).toBe(1);
    });

    it("multiplies winners across groups", () => {
      const report = buildReport({
        precipitation: { type: "snow", amountMm: 10, intensity: 0.3 },
        wind: { speedKph: 55, directionDeg: 0 },
      });
      const effect = evaluateWeatherTravel(report);
      expect(effect.multiplier).toBeCloseTo(0.75 * 0.75);
      expect(effect.reasons.map(r => r.label)).toEqual(["Snow", "Strong wind"]);
    });

    it("floors a stack of severe conditions", () => {
      const report = buildReport({
        precipitation: { type: "snow", amountMm: 40, intensity: 1 },
        wind: { speedKph: 90, directionDeg: 0 },
        visibilityKm: 0.1,
        temperature: { high: -22, low: -35, mean: -28 },
      });
      const effect = evaluateWeatherTravel(report);
      expect(effect.multiplier).toBe(MIN_WEATHER_MULTIPLIER);
      expect(effect.reasons).toHaveLength(4);
    });

    it("matches visibility and temperature bounds inclusively", () => {
      expect(evaluateWeatherTravel(buildReport({ visibilityKm: 1 })).reasons[0].label).toBe("Poor visibility");
      expect(evaluateWeatherTravel(buildReport({ temperature: { high: 45, low: 35, mean: 40 } })).reasons[0].label)
        .toBe("Extreme heat");
    });

    it("ignores rules with a non-positive multiplier", () => {
      const rules: WeatherTravelRule[] = [
        { id: "bad", label: "Impassable", group: "precipitation", multiplier: 0, when: { precipTypes: ["snow"] } },
      ];
      expect(evaluateWeatherTravel(snow(1), rules)).toEqual({ multiplier: 1, reasons: [] });
    });

    it("treats a non-numeric field as not matching rather than throwing", () => {
      const malformed = buildReport({ wind: { speedKph: Number.NaN, directionDeg: 0 } });
      expect(evaluateWeatherTravel(malformed).multiplier).toBe(1);
    });
  });

  describe("combineCellEffects", () => {
    const heavySnow = evaluateWeatherTravel(snow(0.8));

    it("returns no effect for an empty segment", () => {
      expect(combineCellEffects([])).toEqual({ multiplier: 1, reasons: [] });
    });

    it("returns no effect when no cell has weather", () => {
      expect(combineCellEffects([null, null])).toEqual({ multiplier: 1, reasons: [] });
    });

    it("keeps a uniform segment at its cells' multiplier", () => {
      expect(combineCellEffects([heavySnow, heavySnow, heavySnow]).multiplier).toBeCloseTo(0.5);
    });

    it("combines mixed cells as a harmonic mean", () => {
      // Half the distance at x0.5 costs double: 2 / (1/0.5 + 1/1) = 0.667, not 0.75
      const effect = combineCellEffects([heavySnow, null]);
      expect(effect.multiplier).toBeCloseTo(2 / 3);
      expect(effect.reasons).toEqual([{ label: "Heavy snow", multiplier: 0.5 }]);
    });

    it("lists each distinct reason once", () => {
      const gale = evaluateWeatherTravel(buildReport({ wind: { speedKph: 80, directionDeg: 0 } }));
      const effect = combineCellEffects([heavySnow, heavySnow, gale]);
      expect(effect.reasons.map(r => r.label)).toEqual(["Heavy snow", "Gale"]);
    });
  });

  describe("summarizeWeatherReasons", () => {
    it("lists distinct labels across segments in route order", () => {
      const a = evaluateWeatherTravel(snow(0.8));
      const b = evaluateWeatherTravel(buildReport({ wind: { speedKph: 80, directionDeg: 0 } }));
      expect(summarizeWeatherReasons([a, { multiplier: 1, reasons: [] }, b, a])).toEqual(["Heavy snow", "Gale"]);
    });
  });

  describe("computeWeatherTimeRatio", () => {
    it("is 1 when no segment has weather", () => {
      expect(computeWeatherTimeRatio([6, 12], [1, 0.5], [1, 1])).toBe(1);
    });

    it("weights each segment by the time it takes, terrain included", () => {
      // Base times: 6/1 = 6 and 12/0.5 = 24. Weather halves speed on the
      // slow forest leg only: 6 + 48 = 54 against 30
      expect(computeWeatherTimeRatio([6, 12], [1, 0.5], [1, 0.5])).toBeCloseTo(54 / 30);
    });

    it("is 1 for an empty route", () => {
      expect(computeWeatherTimeRatio([], [], [])).toBe(1);
    });
  });

  describe("formatWeatherNote", () => {
    const heavySnow = evaluateWeatherTravel(snow(0.8));

    it("is null when no segment has weather", () => {
      expect(formatWeatherNote([{ multiplier: 1, reasons: [] }], 1)).toBeNull();
    });

    it("lists the reasons with the extra travel time", () => {
      expect(formatWeatherNote([heavySnow], 1.28)).toBe("Heavy snow (+28%)");
    });

    it("drops a percentage that rounds to nothing", () => {
      expect(formatWeatherNote([heavySnow], 1.004)).toBe("Heavy snow");
    });
  });
});
