/**
 * weatherVisuals Unit Tests
 *
 * Tests how a weather report maps to what the map draws: the dominant
 * visual kind and its precedence, tint opacity scaling, and the badge
 * temperature in either unit preference.
 */

import { describe, it, expect } from "vitest";

import {
  classifyWeatherVisual,
  formatBadgeTemperature,
  formatTemperature,
  getWeatherTint,
} from "../../../src/weather/weatherVisuals";
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
    cloudCover: 0,
    wind: { speedKph: 10, directionDeg: 90 },
    visibilityKm: 20,
    regime: "normal",
    conditions: [],
    descriptors: { temperature: "mild", precipitation: "dry", wind: "light", sky: "clear" },
    overridden: false,
    ...overrides,
  };
}

describe("weatherVisuals", () => {
  describe("classifyWeatherVisual", () => {
    it("shows a cloudless day as fully clear", () => {
      expect(classifyWeatherVisual(buildReport())).toEqual({ kind: "clear", strength: 1 });
    });

    it("shows heavy cloud as cloudy", () => {
      expect(classifyWeatherVisual(buildReport({ cloudCover: 1 }))).toEqual({ kind: "cloudy", strength: 1 });
    });

    it("uses the precipitation type and intensity when it is falling", () => {
      const sleet = buildReport({ precipitation: { type: "sleet", amountMm: 6.4, intensity: 0.27 }, cloudCover: 1 });
      expect(classifyWeatherVisual(sleet)).toEqual({ kind: "sleet", strength: 0.27 });
    });

    it("treats trace precipitation as dry", () => {
      const trace = buildReport({ precipitation: { type: "drizzle", amountMm: 0.1, intensity: 0.01 }, cloudCover: 0.9 });
      expect(classifyWeatherVisual(trace).kind).toBe("cloudy");
    });

    it("ranks precipitation over fog, fog over wind, wind over cloud", () => {
      const everything = buildReport({
        precipitation: { type: "snow", amountMm: 20, intensity: 0.8 },
        visibilityKm: 0.2,
        wind: { speedKph: 90, directionDeg: 0 },
        cloudCover: 1,
      });
      expect(classifyWeatherVisual(everything).kind).toBe("snow");

      const dry = { ...everything, precipitation: { type: "none" as const, amountMm: 0, intensity: 0 } };
      expect(classifyWeatherVisual(dry).kind).toBe("fog");

      expect(classifyWeatherVisual({ ...dry, visibilityKm: 20 }).kind).toBe("wind");
    });

    it("keeps strength within 0..1 for out-of-range input", () => {
      const wild = buildReport({ precipitation: { type: "rain", amountMm: 90, intensity: 1.7 } });
      expect(classifyWeatherVisual(wild).strength).toBe(1);
    });
  });

  describe("getWeatherTint", () => {
    it("deepens the tint with strength", () => {
      const light = getWeatherTint({ kind: "rain", strength: 0 });
      const heavy = getWeatherTint({ kind: "rain", strength: 1 });
      expect(heavy.color).toBe(light.color);
      expect(heavy.opacity).toBeGreaterThan(light.opacity);
    });
  });

  describe("formatBadgeTemperature", () => {
    it("rounds the mean to whole degrees", () => {
      expect(formatBadgeTemperature(buildReport({ temperature: { high: 2.8, low: 0.2, mean: 1.5 } }), "metric")).toBe("2°");
    });

    it("converts for an imperial preference", () => {
      expect(formatBadgeTemperature(buildReport({ temperature: { high: 5, low: -5, mean: 0 } }), "imperial")).toBe("32°");
    });

    it("rounds a mean just below zero to 0°", () => {
      expect(formatBadgeTemperature(buildReport({ temperature: { high: 1, low: -2, mean: -0.4 } }), "metric")).toBe("0°");
    });

    it("writes below-zero readings with a true minus sign, like the Almanac", () => {
      const report = buildReport({ temperature: { high: 0, low: -6, mean: -3.2 } });
      expect(formatBadgeTemperature(report, "metric")).toBe("−3°");
      expect(formatBadgeTemperature(report, "metric")).toBe(formatTemperature(-3.2, "metric"));
    });
  });

  describe("formatTemperature", () => {
    it("converts, rounds and dashes a missing reading", () => {
      expect(formatTemperature(-20, "imperial")).toBe("−4°");
      expect(formatTemperature(21.6, "metric")).toBe("22°");
      expect(formatTemperature(undefined, "metric")).toBe("–");
      expect(formatTemperature(Number.NaN, "imperial")).toBe("–");
    });
  });
});
