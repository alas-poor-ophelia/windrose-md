/**
 * forecastWalk Unit Tests
 *
 * Day-by-day route costing against a synthetic forecast. The scenario
 * shape mirrors the spike's measurements (spikes/weather/overlay-demo):
 * 54 map units on foot at 24 per 8 h, 8 h of travel a day.
 */

import { describe, it, expect } from "vitest";

import {
  isImpassable,
  IMPASSABLE_MULTIPLIER,
  walkForecast,
  bestDeparture,
  speedPerHourFromMode,
  type WalkStep,
  type WalkOptions,
} from "../../../src/travel/forecastWalk";
import {
  createTravelMode,
  createTravelPack,
  createTravelUnit,
  upsertPackItem,
} from "../../../src/travel/travelPackOperations";

const SPEED = 3; // 24 units per 8 h
const HOURS = 8;

/** A straight route of n one-unit steps along x */
function route(n: number, terrain = 1): WalkStep[] {
  return Array.from({ length: n }, (_, i) => ({ cell: { x: i, y: 0 }, distance: 1, terrainMultiplier: terrain }));
}

const fair: WalkOptions["weatherSlowdown"] = () => ({ timeFactor: 1 });

/** Storm (×2 time) on day 3 over the second half of the route (x >= 27) */
const stormDay3: WalkOptions["weatherSlowdown"] = (cell, day) =>
  day === 3 && cell.x >= 27
    ? { timeFactor: 2, label: "Storm", areaId: "coast" }
    : { timeFactor: 1, label: "Clear", areaId: cell.x >= 27 ? "coast" : "highlands" };

function opts(partial: Partial<WalkOptions> = {}): WalkOptions {
  return { speedPerHour: SPEED, hoursPerDay: HOURS, departDay: 1, weatherSlowdown: fair, ...partial };
}

describe("walkForecast", () => {
  it("fair weather: 54 units take 2 days + 2 h", () => {
    const r = walkForecast(route(54), opts());
    expect(r.ok).toBe(true);
    expect(r.days.map(d => d.day)).toEqual([1, 2, 3]);
    expect(r.days.map(d => d.hours)).toEqual([8, 8, 2].map(h => expect.closeTo(h, 9)));
    expect(r.days.map(d => d.distance)).toEqual([24, 24, 6].map(h => expect.closeTo(h, 9)));
    expect(r.totalHours).toBeCloseTo(18, 9);
    expect(r.fairHours).toBeCloseTo(18, 9);
    expect(r.totalTravelDays).toBe(3);
    expect(r.arrival.day).toBe(3);
    expect(r.arrival.hourOfTravelDay).toBeCloseTo(2, 9);
    for (const d of r.days) expect(d.hoursLost).toBeCloseTo(0, 9);
  });

  it("day ranges cover the steps walked each day", () => {
    const r = walkForecast(route(54), opts());
    expect(r.days.map(d => [d.startStep, d.endStep])).toEqual([[0, 23], [24, 47], [48, 53]]);
  });

  it("storm on day 3, second half only: leaving day 1 meets it for the last 6 units", () => {
    const r = walkForecast(route(54), opts({ weatherSlowdown: stormDay3 }));
    expect(r.ok).toBe(true);
    expect(r.days).toHaveLength(3);
    const last = r.days[2];
    expect(last.day).toBe(3);
    expect(last.distance).toBeCloseTo(6, 9);
    expect(last.hours).toBeCloseTo(4, 9);
    expect(last.hoursLost).toBeCloseTo(2, 9);
    expect(last.labels).toEqual(["Storm"]);
    expect(last.worstTimeFactor).toBe(2);
    expect(r.days[0].labels).toEqual(["Clear"]);
    expect(r.days[1].areaIds).toEqual(["highlands", "coast"]);
    expect(r.totalHours).toBeCloseTo(20, 9);
    expect(r.arrival).toEqual({ day: 3, hourOfTravelDay: expect.closeTo(4, 9) });
  });

  it("storm on day 3: leaving day 2 walks into it mid-day, leaving day 3 outruns it", () => {
    const fromTwo = walkForecast(route(54), opts({ departDay: 2, weatherSlowdown: stormDay3 }));
    // Day 3: x 24..26 fair (1 h), then 7 h of storm at 1.5 units/h = 10.5 units
    expect(fromTwo.days[1].distance).toBeCloseTo(13.5, 9);
    expect(fromTwo.days[1].labels).toEqual(["Clear", "Storm"]);
    expect(fromTwo.days[1].hoursLost).toBeCloseTo(8 - 13.5 / 3, 9);
    expect(fromTwo.days[2].distance).toBeCloseTo(16.5, 9);
    expect(fromTwo.totalHours).toBeCloseTo(21.5, 9);

    const fromThree = walkForecast(route(54), opts({ departDay: 3, weatherSlowdown: stormDay3 }));
    expect(fromThree.totalHours).toBeCloseTo(18, 9);
    expect(fromThree.days[0].labels).toEqual(["Clear"]);
  });

  it("splits a step that straddles the end of a day, the remainder in the new day's weather", () => {
    const steps: WalkStep[] = [{ cell: { x: 0, y: 0 }, distance: 30, terrainMultiplier: 1 }];
    const r = walkForecast(steps, opts({
      departDay: 0,
      weatherSlowdown: (_c, day) => (day === 0 ? { timeFactor: 1, label: "Clear" } : { timeFactor: 2, label: "Rain" }),
    }));
    expect(r.days).toHaveLength(2);
    expect(r.days[0]).toMatchObject({ day: 0, startStep: 0, endStep: 0, labels: ["Clear"] });
    expect(r.days[0].distance).toBeCloseTo(24, 9);
    expect(r.days[0].hours).toBeCloseTo(8, 9);
    expect(r.days[1]).toMatchObject({ day: 1, startStep: 0, endStep: 0, labels: ["Rain"] });
    expect(r.days[1].distance).toBeCloseTo(6, 9);
    expect(r.days[1].hours).toBeCloseTo(4, 9);
    expect(r.days[1].hoursLost).toBeCloseTo(2, 9);
  });

  it("applies terrain as the pack's speed multiplier (0.5 = half speed)", () => {
    const r = walkForecast(route(12, 0.5), opts());
    expect(r.fairHours).toBeCloseTo(8, 9);
    expect(r.totalHours).toBeCloseTo(8, 9);
    expect(r.days).toHaveLength(1);
  });

  it("waits out an impassable day and retries the next", () => {
    const r = walkForecast(route(54), opts({
      departDay: 0,
      weatherSlowdown: (_c, day) => (day === 1 ? { timeFactor: 25, label: "Blizzard" } : { timeFactor: 1 }),
    }));
    expect(r.ok).toBe(true);
    expect(r.days.map(d => d.day)).toEqual([0, 1, 2, 3]);
    const wait = r.days[1];
    expect(wait.distance).toBe(0);
    expect(wait.hours).toBeCloseTo(8, 9);
    expect(wait.hoursLost).toBeCloseTo(8, 9);
    expect(wait.labels).toEqual(["Blizzard"]);
    expect(wait.startStep).toBe(24);
    expect(wait.endStep).toBe(24);
    expect(r.days[2].distance).toBeCloseTo(24, 9);
    expect(r.days[3].distance).toBeCloseTo(6, 9);
    expect(r.totalHours).toBeCloseTo(26, 9);
    expect(r.arrival).toEqual({ day: 3, hourOfTravelDay: expect.closeTo(2, 9) });
  });

  it("gives up after maxDays when the way never opens", () => {
    const r = walkForecast(route(54), opts({ maxDays: 5, weatherSlowdown: () => ({ timeFactor: 50, label: "Flood" }) }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/5 days/);
    expect(r.days).toHaveLength(5);
    expect(r.days.every(d => d.distance === 0)).toBe(true);
    expect(Number.isFinite(r.totalHours)).toBe(true);
  });

  it("a late departure shortens the first day", () => {
    const r = walkForecast(route(54), opts({ departHour: 12 }));
    expect(r.days[0].hours).toBeCloseTo(4, 9);
    expect(r.days[0].distance).toBeCloseTo(12, 9);
    expect(r.arrival).toEqual({ day: 3, hourOfTravelDay: expect.closeTo(6, 9) });
  });

  it("a departure after the allowance is spent starts the next day", () => {
    const r = walkForecast(route(6), opts({ departHour: 18 }));
    expect(r.days.map(d => d.day)).toEqual([2]);
  });

  it("a day used up exactly by the last step does not open an empty day", () => {
    const r = walkForecast(route(24), opts());
    expect(r.days).toHaveLength(1);
    expect(r.arrival).toEqual({ day: 1, hourOfTravelDay: expect.closeTo(8, 9) });
  });

  it("an empty route arrives on departure", () => {
    const r = walkForecast([], opts());
    expect(r).toMatchObject({ ok: true, days: [], totalHours: 0, totalTravelDays: 0, fairHours: 0 });
    expect(r.arrival).toEqual({ day: 1, hourOfTravelDay: 0 });
  });

  it("rejects unusable speed or allowance with finite numbers", () => {
    for (const bad of [0, -1, NaN, Infinity]) {
      const a = walkForecast(route(3), opts({ speedPerHour: bad }));
      expect(a.ok).toBe(false);
      expect(Number.isFinite(a.totalHours) && Number.isFinite(a.fairHours)).toBe(true);
      const b = walkForecast(route(3), opts({ hoursPerDay: bad }));
      expect(b.ok).toBe(false);
      expect(Number.isFinite(b.fairHours)).toBe(true);
    }
  });

  it("treats non-finite or non-positive weather and terrain as 1", () => {
    const steps: WalkStep[] = [
      { cell: { x: 0, y: 0 }, distance: 3, terrainMultiplier: NaN },
      { cell: { x: 1, y: 0 }, distance: NaN, terrainMultiplier: 1 },
      { cell: { x: 2, y: 0 }, distance: 3, terrainMultiplier: 0 },
    ];
    const r = walkForecast(steps, opts({ weatherSlowdown: () => ({ timeFactor: NaN }) }));
    expect(r.ok).toBe(true);
    expect(r.totalHours).toBeCloseTo(2, 9);
  });

  it("property: with all weather 1, totalHours equals plain distance / speed and nothing is lost", () => {
    let seed = 12345;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let trial = 0; trial < 25; trial++) {
      const n = 1 + Math.floor(rand() * 80);
      const steps: WalkStep[] = Array.from({ length: n }, (_, i) => ({
        cell: { x: i, y: trial },
        distance: 0.1 + rand() * 7,
        terrainMultiplier: 0.25 + rand() * 1.5,
      }));
      const speedPerHour = 0.5 + rand() * 5;
      const hoursPerDay = 2 + rand() * 10;
      const plain = steps.reduce((s, st) => s + st.distance / (speedPerHour * st.terrainMultiplier), 0);
      const r = walkForecast(steps, { speedPerHour, hoursPerDay, departDay: 0, weatherSlowdown: fair, maxDays: 1000 });
      expect(r.ok).toBe(true);
      expect(r.totalHours).toBeCloseTo(plain, 6);
      expect(r.fairHours).toBeCloseTo(plain, 6);
      const walked = r.days.reduce((s, d) => s + d.distance, 0);
      expect(walked).toBeCloseTo(steps.reduce((s, st) => s + st.distance, 0), 6);
      for (const d of r.days) {
        expect(d.hours).toBeLessThanOrEqual(hoursPerDay + 1e-6);
        expect(d.hoursLost).toBeCloseTo(0, 6);
      }
      // every day but the last is full
      for (const d of r.days.slice(0, -1)) expect(d.hours).toBeCloseTo(hoursPerDay, 6);
    }
  });
});

describe("bestDeparture", () => {
  it("walks consecutive departure days, sorted by departDay", () => {
    const { departDay: _ignored, ...base } = opts({ weatherSlowdown: stormDay3 });
    const rows = bestDeparture(route(54), base, 1, 3);
    expect(rows.map(r => r.departDay)).toEqual([1, 2, 3]);
    expect(rows.map(r => r.result.totalHours)).toEqual([20, 21.5, 18].map(h => expect.closeTo(h, 9)));
    expect(rows.map(r => r.result.arrival.day)).toEqual([3, 4, 5]);
  });

  it("returns nothing for a non-positive count", () => {
    const { departDay: _ignored, ...base } = opts();
    expect(bestDeparture(route(3), base, 0, 0)).toEqual([]);
    expect(bestDeparture(route(3), base, 0, NaN)).toEqual([]);
  });
});

describe("speedPerHourFromMode", () => {
  let pack = createTravelPack("Test pack");
  const hex = createTravelUnit({ name: "Hex", abbreviation: "hex", factor: 6, baseUnit: "mi" });
  pack = upsertPackItem(pack, "units", hex);
  pack = upsertPackItem(pack, "modes", createTravelMode({
    name: "On foot", distance: 24, unit: { type: "standard", unit: "mi" }, timeValue: 8, timeUnit: "hours",
  }));
  pack = upsertPackItem(pack, "modes", createTravelMode({
    name: "Hex crawl", distance: 3, unit: { type: "custom", unitId: hex.id }, timeValue: 1, timeUnit: "days",
  }));
  pack = upsertPackItem(pack, "modes", createTravelMode({
    name: "Brisk", distance: 1, unit: { type: "standard", unit: "mi" }, timeValue: 15, timeUnit: "minutes",
  }));
  const [onFoot, hexCrawl, brisk] = pack.modes;

  it("hour-based modes: distance per hour in map units", () => {
    expect(speedPerHourFromMode(onFoot, pack, "mi", 8)).toEqual({ ok: true, speedPerHour: expect.closeTo(3, 9) });
    expect(speedPerHourFromMode(brisk, pack, "mi", 8)).toEqual({ ok: true, speedPerHour: expect.closeTo(4, 9) });
  });

  it("day-based modes spread the day's distance over the allowance", () => {
    // 3 hex/day × 6 mi = 18 mi over 8 h
    expect(speedPerHourFromMode(hexCrawl, pack, "mi", 8)).toEqual({ ok: true, speedPerHour: expect.closeTo(2.25, 9) });
    expect(speedPerHourFromMode(hexCrawl, pack, "hex", 6)).toEqual({ ok: true, speedPerHour: expect.closeTo(0.5, 9) });
    expect(speedPerHourFromMode(hexCrawl, pack, "mi", 0).ok).toBe(false);
  });

  it("passes unit mismatches through as guidance", () => {
    const r = speedPerHourFromMode(onFoot, pack, "km", 8);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/km/);
  });
});

describe("isImpassable", () => {
  it("compares the impassable threshold with a tolerance", () => {
    expect(isImpassable(IMPASSABLE_MULTIPLIER)).toBe(true);
    expect(isImpassable(IMPASSABLE_MULTIPLIER - 1e-9)).toBe(true);
    // The weather rules' 0.05 speed factor, inverted
    expect(isImpassable(1 / 0.05)).toBe(true);
    expect(isImpassable(19.9)).toBe(false);
  });
});
