/**
 * skyWeather Unit Tests
 *
 * Report -> Sky weather mapping (hourly precipitation window; a daily
 * report animates the day's precipitation; fog from the condition tag or
 * visibility class), the quiet-sky skip, the compass wind (downwind
 * bearing, wording) and which area the compass follows (revealed only).
 */

import { describe, it, expect } from "vitest";

import { compassWind, isQuietSky, pickCompassArea, toSkyWeather } from "../../../src/weather/skyWeather";
import type { WeatherArea } from "#types/contexts/weather.types";
import type { WadjetClassification, WadjetWeatherReport } from "#types/integrations/wadjet.types";

function report(overrides: Partial<WadjetWeatherReport> = {}): WadjetWeatherReport {
  return {
    schemaVersion: 0, zoneId: "z", dayOrdinal: 5,
    temperature: { high: 8, low: 2, mean: 5 },
    precipitation: { type: "rain", amountMm: 6, intensity: 0.6 },
    humidity: 0.8, cloudCover: 0.9,
    wind: { speedKph: 30, directionDeg: 250 },
    visibilityKm: 8, regime: "wet", conditions: [],
    descriptors: { temperature: "", precipitation: "", wind: "", sky: "" },
    overridden: false,
    ...overrides,
  };
}

const classification = (overrides: Partial<WadjetClassification> = {}): WadjetClassification => ({
  beaufort: 5, beaufortLabel: "Fresh breeze", compass: "WSW", oktas: 7, visibility: "good",
  precipitation: "moderate", frozenPrecipitation: false, feelsLike: { mean: 2 }, ...overrides,
});

describe("toSkyWeather", () => {
  it("maps the report's numbers", () => {
    const sky = toSkyWeather(report(), classification(), false);
    expect(sky).toMatchObject({
      precipType: "rain", intensity: 0.6, precipActive: true, windSpeedKph: 30, windFromDeg: 250,
      cloudCover: 0.9, fog: false, visibilityKm: 8, beaufort: 5, temperatureC: 5,
    });
  });

  it("applies the hourly precipitation window only to hourly reports", () => {
    const off = report({ precipitation: { type: "rain", amountMm: 6, intensity: 0.6, active: false } });
    expect(toSkyWeather(off, classification(), true).precipActive).toBe(false);
    expect(toSkyWeather(off, classification(), false).precipActive).toBe(true);
    expect(toSkyWeather(report(), classification(), true).precipActive).toBe(true);
  });

  it("shows the day's precipitation from a daily report: active whenever the day has any", () => {
    const dry = report({ precipitation: { type: "none", amountMm: 0, intensity: 0 } });
    expect(toSkyWeather(dry, classification(), false).precipActive).toBe(false);
    const snow = report({ precipitation: { type: "snow", amountMm: 4, intensity: 0.4, active: false } });
    expect(toSkyWeather(snow, classification(), false).precipActive).toBe(true);
  });

  it("reads fog from the condition tag or a poor visibility class", () => {
    expect(toSkyWeather(report({ conditions: ["fog"] }), classification(), false).fog).toBe(true);
    expect(toSkyWeather(report(), classification({ visibility: "poor" }), false).fog).toBe(true);
    expect(toSkyWeather(report(), classification({ visibility: "moderate" }), false).fog).toBe(false);
  });

  it("clamps and sanitises odd values", () => {
    const odd = report({
      precipitation: { type: "hail" as never, amountMm: 0, intensity: 3 },
      cloudCover: Number.NaN,
      wind: { speedKph: -4, directionDeg: Number.NaN },
    });
    const sky = toSkyWeather(odd, classification({ beaufort: 14 }), false);
    expect(sky).toMatchObject({ precipType: "none", intensity: 1, cloudCover: 0, windSpeedKph: 0, windFromDeg: 0, beaufort: 12 });
  });
});

describe("isQuietSky", () => {
  const base = toSkyWeather(report(), classification(), false);
  it("is quiet without precipitation, fog or real cloud", () => {
    expect(isQuietSky({ ...base, precipType: "none", cloudCover: 0.1 })).toBe(true);
    expect(isQuietSky({ ...base, precipActive: false, cloudCover: 0.1 })).toBe(true);
  });
  it("is not quiet with precipitation, fog, poor visibility or cloud", () => {
    expect(isQuietSky(base)).toBe(false);
    expect(isQuietSky({ ...base, precipType: "none", cloudCover: 0.1, fog: true })).toBe(false);
    expect(isQuietSky({ ...base, precipType: "none", cloudCover: 0.1, visibilityKm: 1 })).toBe(false);
    expect(isQuietSky({ ...base, precipType: "none", cloudCover: 0.5 })).toBe(false);
  });
});

describe("compassWind", () => {
  it("points downwind and words the tooltip", () => {
    expect(compassWind(report(), classification())).toEqual({ towardDeg: 70, beaufort: 5, label: "Wind: Fresh breeze from WSW" });
    expect(compassWind(report({ wind: { speedKph: 30, directionDeg: 90 } }), classification()).towardDeg).toBe(270);
  });
  it("drops the direction when calm", () => {
    expect(compassWind(report(), classification({ beaufort: 0, beaufortLabel: "Calm" })).label).toBe("Wind: Calm");
  });
});

describe("pickCompassArea", () => {
  const region = (id: string): WeatherArea => ({ id: `region:${id}`, kind: "region", zoneId: id, name: id, cells: [{ x: 0, y: 0 }], regionId: id });
  const map: WeatherArea = { id: "map", kind: "map", zoneId: "m", name: "Whole map", cells: "all" };

  it("prefers the whole-map area", () => {
    expect(pickCompassArea([region("a"), map], () => region("a"), { x: 0, y: 0 })).toBe(map);
  });
  it("else the area under the view centre, else the first area", () => {
    const a = region("a");
    const b = region("b");
    expect(pickCompassArea([a, b], () => b, { x: 0, y: 0 })).toBe(b);
    expect(pickCompassArea([a, b], () => null, { x: 9, y: 9 })).toBe(a);
    expect(pickCompassArea([a, b], () => b, null)).toBe(a);
    expect(pickCompassArea([], () => null, null)).toBeNull();
  });

  describe("with fog", () => {
    const a = region("a");
    const b = region("b");
    const fogOf = (hidden: WeatherArea[], foggedCell?: { x: number; y: number }) => ({
      isFogged: (cell: { x: number; y: number }) => foggedCell != null && cell.x === foggedCell.x && cell.y === foggedCell.y,
      areaRevealed: (area: WeatherArea) => !hidden.includes(area),
    });

    it("skips a hidden whole-map area", () => {
      expect(pickCompassArea([a, map], () => a, { x: 0, y: 0 }, fogOf([map]))).toBe(a);
    });
    it("never reads the area of a fogged centre cell", () => {
      expect(pickCompassArea([a, b], () => b, { x: 3, y: 3 }, fogOf([], { x: 3, y: 3 }))).toBe(a);
    });
    it("never follows a hidden area under the centre", () => {
      expect(pickCompassArea([a, b], () => b, { x: 0, y: 0 }, fogOf([b]))).toBe(a);
    });
    it("shows no needle when nothing is revealed", () => {
      expect(pickCompassArea([a, b, map], () => b, { x: 0, y: 0 }, fogOf([a, b, map]))).toBeNull();
    });
  });
});
