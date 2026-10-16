/**
 * travelInterpreter / weatherClassify Unit Tests
 *
 * Windrose's travel interpreter outputs under its "travel" convention
 * (finite SPEED factors in [0.05, 2], JSON-serialisable), the defensive
 * reading of third-party results, the per-cell effect conversion, and the
 * local classification fallback for 0.3.x plugins.
 */

import { describe, it, expect } from "vitest";

import {
  MAX_TRAVEL_SPEED,
  MIN_TRAVEL_SPEED,
  formatTravelInterpretation,
  interpretTravelLocally,
  normalizeTravelResult,
  travelEffectFromInterpretation,
  windroseTravelInterpreter,
} from "../../../src/weather/travelInterpreter";
import { classifyLocally, describeLocally } from "../../../src/weather/weatherClassify";
import { buildReport } from "./fakeWadjet";

const dry = buildReport({ precipitation: { type: "none", amountMm: 0, intensity: 0 }, cloudCover: 0.2 });

describe("interpretTravelLocally", () => {
  it("is no effect on fair weather", () => {
    expect(interpretTravelLocally(dry)).toEqual({ speedMultiplier: 1 });
  });

  it("slows travel per the rule table, naming the reasons", () => {
    const blizzard = buildReport({
      precipitation: { type: "snow", amountMm: 30, intensity: 0.8 },
      wind: { speedKph: 80, directionDeg: 0 },
    });
    expect(interpretTravelLocally(blizzard)).toEqual({ speedMultiplier: 0.25, label: "Heavy snow, Gale" });
  });

  it("returns plain JSON-serialisable, finite results", () => {
    for (const report of [dry, buildReport()]) {
      const result = interpretTravelLocally(report);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
      expect(Number.isFinite(result.speedMultiplier)).toBe(true);
    }
  });

  it("is what the registered interpreter returns", () => {
    const report = buildReport({ precipitation: { type: "rain", amountMm: 40, intensity: 0.7 } });
    const ctx = { zoneId: "coast", classification: classifyLocally(report), time: { dayOrdinal: 2, yearPhase: 0, yearLength: 365, source: "x" } };
    expect(windroseTravelInterpreter.interpret(report, ctx)).toEqual(interpretTravelLocally(report));
    expect(windroseTravelInterpreter.id).toBe("windrose.travel");
    expect(windroseTravelInterpreter.facet).toBe("travel");
  });
});

describe("normalizeTravelResult", () => {
  it("reads speedMultiplier, else multiplier, as a speed factor", () => {
    expect(normalizeTravelResult({ speedMultiplier: 0.5, label: "Mud" })).toEqual({ speedMultiplier: 0.5, label: "Mud" });
    expect(normalizeTravelResult({ multiplier: 0.8 })).toEqual({ speedMultiplier: 0.8 });
    expect(normalizeTravelResult({ speedMultiplier: 0.7, multiplier: 3 })).toEqual({ speedMultiplier: 0.7 });
  });

  it("clamps into range and turns zero or worse into a labelled impassable", () => {
    expect(normalizeTravelResult({ speedMultiplier: 9 })).toEqual({ speedMultiplier: MAX_TRAVEL_SPEED });
    expect(normalizeTravelResult({ speedMultiplier: 0 })).toEqual({ speedMultiplier: MIN_TRAVEL_SPEED, label: "Impassable" });
    expect(normalizeTravelResult({ speedMultiplier: -1, label: "Flooded" })).toEqual({ speedMultiplier: MIN_TRAVEL_SPEED, label: "Flooded" });
  });

  it("rejects results without a finite factor", () => {
    for (const junk of [null, undefined, 3, "slow", {}, { speedMultiplier: Infinity }, { multiplier: NaN }, { label: "x" }]) {
      expect(normalizeTravelResult(junk)).toBeNull();
    }
  });
});

describe("travelEffectFromInterpretation", () => {
  it("is the neutral effect for no effect, and carries the label otherwise", () => {
    expect(travelEffectFromInterpretation({ speedMultiplier: 1 })).toEqual({ multiplier: 1, reasons: [] });
    expect(travelEffectFromInterpretation({ speedMultiplier: 0.5, label: "Snow" })).toEqual({
      multiplier: 0.5, reasons: [{ label: "Snow", multiplier: 0.5 }],
    });
  });
});

describe("formatTravelInterpretation", () => {
  it("states the time change", () => {
    expect(formatTravelInterpretation({ speedMultiplier: 0.5, label: "Snow" })).toBe("Snow: travel takes 100% longer");
    expect(formatTravelInterpretation({ speedMultiplier: 1 })).toBe("Travel: normal travel time");
  });
});

describe("weatherClassify (0.3.x fallback)", () => {
  it("classifies on the standard scales", () => {
    const c = classifyLocally(buildReport({
      wind: { speedKph: 80, directionDeg: 247.5 },
      cloudCover: 0.5,
      visibilityKm: 0.5,
      precipitation: { type: "rain", amountMm: 70, intensity: 0.8 },
      temperature: { high: 4, low: -2, mean: 1 },
    }));
    expect(c).toMatchObject({
      beaufort: 9, beaufortLabel: "Strong gale", compass: "WSW", oktas: 4,
      visibility: "very-poor", precipitation: "heavy", frozenPrecipitation: false,
    });
    expect(c.feelsLike.mean).toBeLessThan(1);
  });

  it("keeps oktas 0 and 8 for exactly clear and exactly overcast", () => {
    expect(classifyLocally(buildReport({ cloudCover: 0 })).oktas).toBe(0);
    expect(classifyLocally(buildReport({ cloudCover: 0.01 })).oktas).toBe(1);
    expect(classifyLocally(buildReport({ cloudCover: 0.99 })).oktas).toBe(7);
    expect(classifyLocally(buildReport({ cloudCover: 1 })).oktas).toBe(8);
  });

  it("describes plainly", () => {
    expect(describeLocally(dry)).toBe("Clear, 2°C");
  });
});
