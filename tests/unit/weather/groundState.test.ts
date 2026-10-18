/**
 * groundState Unit Tests
 *
 * Windrose's heuristic ground-state derivation: snowpack accumulation and
 * melt, soil wetness and drying, labels and the travel multiplier.
 */

import { describe, it, expect } from "vitest";

import { deriveGroundState, type GroundDay } from "../../../src/weather/groundState";

let ordinal = 0;
function day(partial: Partial<GroundDay> = {}): GroundDay {
  return {
    dayOrdinal: ordinal++,
    precipType: "none",
    amountMm: 0,
    tempMeanC: 12,
    tempHighC: 16,
    windKph: 10,
    humidity: 0.6,
    ...partial,
  };
}
const repeat = (n: number, partial: Partial<GroundDay>) => Array.from({ length: n }, () => day(partial));

const heavySnow = { precipType: "snow" as const, amountMm: 10, tempMeanC: -5, tempHighC: -2 };
const thaw = { tempMeanC: 6, tempHighC: 10 };
const soaking = { precipType: "rain" as const, amountMm: 20, tempMeanC: 12, tempHighC: 14, humidity: 0.95 };
const dryWarmWindy = { tempMeanC: 25, tempHighC: 31, windKph: 30, humidity: 0.3 };

/** State after each prefix of the history */
function trace(history: GroundDay[]) {
  return history.map((_, i) => deriveGroundState(history.slice(0, i + 1)));
}

describe("deriveGroundState", () => {
  it("empty history is bare ground, multiplier 1", () => {
    expect(deriveGroundState([])).toEqual({ snowDepthCm: 0, mud: 0, label: "bare", travelMultiplier: 1 });
  });

  it("a week of heavy snow at -5 °C gives deep snow and the capped multiplier", () => {
    const s = deriveGroundState(repeat(7, heavySnow));
    expect(s.snowDepthCm).toBeCloseTo(70, 9);
    expect(s.label).toBe("deep snow");
    expect(s.travelMultiplier).toBe(2);
  });

  it("snow labels step up with depth", () => {
    expect(deriveGroundState(repeat(1, { ...heavySnow, amountMm: 3 })).label).toBe("light snow");
    expect(deriveGroundState(repeat(2, heavySnow)).label).toBe("snow");
    expect(deriveGroundState(repeat(3, heavySnow)).label).toBe("deep snow");
    expect(deriveGroundState(repeat(1, { ...heavySnow, amountMm: 5 })).travelMultiplier).toBeCloseTo(1.1, 9);
  });

  it("a thaw week melts the snow, monotonically", () => {
    const history = [...repeat(7, heavySnow), ...repeat(7, thaw)];
    const states = trace(history).slice(7);
    for (let i = 1; i < states.length; i++) {
      expect(states[i].snowDepthCm).toBeLessThanOrEqual(states[i - 1].snowDepthCm);
    }
    const end = states[states.length - 1];
    expect(end.snowDepthCm).toBe(0);
    expect(["muddy", "waterlogged", "bare", "dry"]).toContain(end.label);
  });

  it("snow on a warm day does not settle", () => {
    expect(deriveGroundState(repeat(3, { precipType: "snow", amountMm: 10, tempMeanC: 4, tempHighC: 6 })).snowDepthCm).toBe(0);
  });

  it("sleet settles half its amount when cold", () => {
    const s = deriveGroundState(repeat(1, { precipType: "sleet", amountMm: 10, tempMeanC: 0, tempHighC: 0 }));
    expect(s.snowDepthCm).toBeCloseTo(5, 9);
  });

  it("soaking rain waterlogs, then dry warm windy days dry it out", () => {
    const history = [...repeat(3, soaking), ...repeat(7, dryWarmWindy)];
    const states = trace(history);
    expect(states[2].label).toBe("waterlogged");
    expect(states[2].travelMultiplier).toBeGreaterThan(1.3);
    const drying = states.slice(2);
    for (let i = 1; i < drying.length; i++) {
      expect(drying[i].mud).toBeLessThanOrEqual(drying[i - 1].mud);
    }
    const end = states[states.length - 1];
    expect(end.label).toBe("dry");
    expect(end.mud).toBe(0);
    expect(end.travelMultiplier).toBe(1);
  });

  it("cool still humid air dries slower than warm windy dry air", () => {
    const wet = repeat(3, soaking);
    const slow = deriveGroundState([...wet, ...repeat(2, { tempMeanC: 5, tempHighC: 8, windKph: 0, humidity: 0.95 })]);
    const fast = deriveGroundState([...wet, ...repeat(2, dryWarmWindy)]);
    expect(slow.mud).toBeGreaterThan(fast.mud);
  });

  it("frozen ground with no snow reads as frost, its mud hard", () => {
    const s = deriveGroundState([...repeat(3, soaking), ...repeat(1, { tempMeanC: -4, tempHighC: -1 })]);
    expect(s.label).toBe("frost");
    expect(s.mud).toBe(0);
    expect(s.travelMultiplier).toBe(1);
  });

  it("monotonic: more snow never means less depth or a smaller multiplier", () => {
    let prev = deriveGroundState(repeat(5, { ...heavySnow, amountMm: 0 }));
    for (let mm = 1; mm <= 20; mm++) {
      const s = deriveGroundState(repeat(5, { ...heavySnow, amountMm: mm }));
      expect(s.snowDepthCm).toBeGreaterThanOrEqual(prev.snowDepthCm);
      expect(s.travelMultiplier).toBeGreaterThanOrEqual(prev.travelMultiplier);
      prev = s;
    }
  });

  it("monotonic: more rain never means less mud", () => {
    let prev = 0;
    for (let mm = 0; mm <= 40; mm += 2) {
      const s = deriveGroundState(repeat(3, { ...soaking, amountMm: mm }));
      expect(s.mud).toBeGreaterThanOrEqual(prev);
      prev = s.mud;
    }
  });

  it("monotonic: a warmer thaw never leaves more snow", () => {
    let prev = Infinity;
    for (let high = -2; high <= 12; high++) {
      const s = deriveGroundState([...repeat(5, heavySnow), ...repeat(2, { tempMeanC: high - 3, tempHighC: high })]);
      expect(s.snowDepthCm).toBeLessThanOrEqual(prev);
      prev = s.snowDepthCm;
    }
  });

  it("orders days by dayOrdinal and stays finite on junk input", () => {
    const snowFirst = [day({ ...heavySnow, dayOrdinal: 1 }), day({ ...thaw, dayOrdinal: 2 })];
    expect(deriveGroundState([snowFirst[1], snowFirst[0]])).toEqual(deriveGroundState(snowFirst));

    const junk = deriveGroundState([day({ amountMm: NaN, tempMeanC: NaN, tempHighC: Infinity, windKph: -5, humidity: NaN, precipType: "rain" })]);
    for (const v of [junk.snowDepthCm, junk.mud, junk.travelMultiplier]) expect(Number.isFinite(v)).toBe(true);
  });

  it("accepts humidity as a percentage", () => {
    const a = deriveGroundState([...repeat(3, soaking), day({ ...dryWarmWindy, humidity: 0.3 })]);
    const b = deriveGroundState([...repeat(3, soaking), day({ ...dryWarmWindy, humidity: 30 })]);
    expect(b.mud).toBeCloseTo(a.mud, 9);
  });

  it("travelMultiplier stays within 1..2", () => {
    const histories = [repeat(30, heavySnow), repeat(10, soaking), repeat(10, dryWarmWindy), [...repeat(10, soaking), ...repeat(10, heavySnow)]];
    for (const h of histories) {
      const m = deriveGroundState(h).travelMultiplier;
      expect(m).toBeGreaterThanOrEqual(1);
      expect(m).toBeLessThanOrEqual(2);
    }
  });
});
