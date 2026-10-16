/**
 * forecastRoute Unit Tests
 *
 * Route → walk steps over both geometries, the memoized weather lookup
 * (speed factor → time multiplier), joining a committed walk with the live
 * preview walk, departure ranking, and per-day stretches of the route line.
 */

import { describe, it, expect, vi } from "vitest";

import {
  buildRouteSteps,
  createRouteWeather,
  continueWalk,
  rankDepartures,
  computeDayStretches,
  formatHours,
  formatTravelSpan,
  type RouteWeatherSource,
} from "../../../src/weather/forecastRoute";
import { walkForecast, TRAVEL_DAY_START_HOUR } from "../../../src/travel/forecastWalk";
import { GridGeometry } from "../../../src/geometry/core/GridGeometry";
import { HexGeometry } from "../../../src/geometry/core/HexGeometry";
import type { WeatherArea } from "#types/contexts/weather.types";
import type { WadjetReport } from "#types/integrations/wadjet.types";

const grid = new GridGeometry(32);
const hex = new HexGeometry(30);
const gridLine = (x1: number, y1: number, x2: number, y2: number) => grid.getCellsInLine(x1, y1, x2, y2);
const hexLine = (x1: number, y1: number, x2: number, y2: number) => hex.getCellsInLine(x1, y1, x2, y2);

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

describe("buildRouteSteps", () => {
  it("splits each segment's distance over its cells and skips the shared first cell", () => {
    const points = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }];
    const steps = buildRouteSteps(points, [30, 20], [1, 0.5], gridLine);
    // Segment 0: cells (0..3,0) = 4 cells; segment 1: (3,1),(3,2) = 2 cells
    expect(steps.map(s => `${s.cell.x},${s.cell.y}`)).toEqual(["0,0", "1,0", "2,0", "3,0", "3,1", "3,2"]);
    expect(steps.slice(0, 4).every(s => s.distance === 7.5 && s.terrainMultiplier === 1 && s.segment === 0)).toBe(true);
    expect(steps.slice(4).every(s => s.distance === 10 && s.terrainMultiplier === 0.5 && s.segment === 1)).toBe(true);
    expect(sum(steps.map(s => s.distance))).toBeCloseTo(50);
  });

  it("keeps the total distance on hex maps and never repeats the joint cell", () => {
    const points = [{ x: 0, y: 0 }, { x: 4, y: -2 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
    const distances = [4, 5, 4].map(d => d * 6);
    const steps = buildRouteSteps(points, distances, [1, 1, 1], hexLine);
    expect(sum(steps.map(s => s.distance))).toBeCloseTo(sum(distances));
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].cell).not.toEqual(steps[i - 1].cell);
    }
  });

  it("skips the first cell of a continuation (the live preview segment)", () => {
    const steps = buildRouteSteps([{ x: 3, y: 0 }, { x: 5, y: 0 }], [20], [1], gridLine, true);
    expect(steps.map(s => s.cell.x)).toEqual([4, 5]);
    expect(steps.every(s => s.distance === 10)).toBe(true);
  });

  it("gives a zero-length segment no distance", () => {
    const steps = buildRouteSteps([{ x: 1, y: 1 }, { x: 1, y: 1 }], [0], [1], gridLine);
    expect(steps).toHaveLength(1);
    expect(steps[0].distance).toBe(0);
  });
});

// A two-area world: x < 5 is the highlands, x >= 5 the coast; y >= 10 has no weather
const highlands: WeatherArea = { id: "region:h", kind: "region", zoneId: "greywold", name: "Highlands", cells: [] };
const coast: WeatherArea = { id: "region:c", kind: "region", zoneId: "ashfall", name: "Coast", cells: [] };

function makeSource(speedFor: (zoneId: string, day: number) => { speed: number; label?: string } | null) {
  const report = vi.fn((zoneId: string, day: number): WadjetReport | null =>
    speedFor(zoneId, day) != null ? ({ zoneId, dayOrdinal: day } as unknown as WadjetReport) : null);
  const source: RouteWeatherSource = {
    areaAt: cell => (cell.y >= 10 ? null : cell.x < 5 ? highlands : coast),
    report,
    interpretTravel: (r: WadjetReport) => {
      const { zoneId, dayOrdinal } = r as unknown as { zoneId: string; dayOrdinal: number };
      const s = speedFor(zoneId, dayOrdinal);
      return s?.label != null ? { speedMultiplier: s.speed, label: s.label } : { speedMultiplier: s?.speed ?? 1 };
    },
  };
  return { source, report };
}

describe("createRouteWeather", () => {
  it("turns the speed factor into a time multiplier and tags the area", () => {
    const { source } = makeSource(zone => (zone === "ashfall" ? { speed: 0.5, label: "Gale" } : { speed: 1 }));
    const weather = createRouteWeather(source);
    expect(weather.weatherMultiplier({ x: 7, y: 0 }, 3)).toEqual({ multiplier: 2, label: "Gale", areaId: "region:c" });
    expect(weather.weatherMultiplier({ x: 1, y: 0 }, 3)).toEqual({ multiplier: 1, areaId: "region:h" });
  });

  it("is fair outside every weather area and when there is no report", () => {
    const { source } = makeSource(zone => (zone === "ashfall" ? null : { speed: 0.5 }));
    const weather = createRouteWeather(source);
    expect(weather.weatherMultiplier({ x: 1, y: 12 }, 0)).toEqual({ multiplier: 1 });
    expect(weather.weatherMultiplier({ x: 8, y: 0 }, 0)).toEqual({ multiplier: 1 });
  });

  it("asks the store once per area and day", () => {
    const { source, report } = makeSource(() => ({ speed: 0.8 }));
    const weather = createRouteWeather(source);
    for (let x = 0; x < 5; x++) weather.weatherMultiplier({ x, y: 0 }, 1);
    for (let x = 0; x < 5; x++) weather.weatherMultiplier({ x, y: 0 }, 1);
    expect(report).toHaveBeenCalledTimes(1);
  });

  it("finds the slowest area of a day", () => {
    const { source } = makeSource(zone => (zone === "ashfall" ? { speed: 0.25, label: "Storm" } : { speed: 0.9, label: "Rain" }));
    const weather = createRouteWeather(source);
    weather.weatherMultiplier({ x: 1, y: 0 }, 2);
    weather.weatherMultiplier({ x: 6, y: 0 }, 2);
    const worst = weather.worstArea(["region:h", "region:c"], 2);
    expect(worst?.areaId).toBe("region:c");
    expect(worst?.multiplier).toBe(4);
    expect(weather.worstArea(["unknown"], 2)).toBeNull();
  });
});

describe("continueWalk", () => {
  const { source } = makeSource((zone, day) => (zone === "ashfall" && day === 1 ? { speed: 0.5, label: "Storm" } : { speed: 1 }));

  it("equals walking the whole route at once", () => {
    const points = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 6 }, { x: 0, y: 6 }];
    const distances = [9, 6, 9].map(d => d * 2);
    const all = buildRouteSteps(points, distances, [1, 0.75, 1], gridLine);
    const head = buildRouteSteps(points.slice(0, 3), distances.slice(0, 2), [1, 0.75], gridLine);
    const tail = buildRouteSteps(points.slice(2), distances.slice(2), [1], gridLine, true);
    expect(head.length + tail.length).toBe(all.length);

    const opts = { speedPerHour: 2, hoursPerDay: 8, weatherMultiplier: createRouteWeather(source).weatherMultiplier };
    const whole = walkForecast(all, { ...opts, departDay: 0 });
    const first = walkForecast(head, { ...opts, departDay: 0 });
    const rest = walkForecast(tail, {
      ...opts,
      departDay: first.arrival.day,
      departHour: TRAVEL_DAY_START_HOUR + first.arrival.hourOfTravelDay,
    });
    const joined = continueWalk(first, rest, head.length);

    expect(whole.days.length).toBeGreaterThan(1);
    expect(joined.days.length).toBe(whole.days.length);
    expect(joined.totalHours).toBeCloseTo(whole.totalHours);
    expect(joined.fairHours).toBeCloseTo(whole.fairHours);
    expect(joined.arrival.day).toBe(whole.arrival.day);
    expect(joined.arrival.hourOfTravelDay).toBeCloseTo(whole.arrival.hourOfTravelDay);
    joined.days.forEach((d, i) => {
      expect(d.day).toBe(whole.days[i].day);
      expect(d.distance).toBeCloseTo(whole.days[i].distance);
      expect(d.hours).toBeCloseTo(whole.days[i].hours);
      expect(d.endStep).toBe(whole.days[i].endStep);
      expect(d.labels).toEqual(whole.days[i].labels);
    });
  });

  it("keeps the base when the tail is empty", () => {
    const steps = buildRouteSteps([{ x: 0, y: 0 }, { x: 3, y: 0 }], [6], [1], gridLine);
    const opts = { speedPerHour: 2, hoursPerDay: 8, weatherMultiplier: () => ({ multiplier: 1 }), departDay: 4 };
    const base = walkForecast(steps, opts);
    const joined = continueWalk(base, walkForecast([], opts), steps.length);
    expect(joined.totalHours).toBeCloseTo(base.totalHours);
    expect(joined.arrival).toEqual(base.arrival);
  });
});

describe("rankDepartures", () => {
  it("marks the fastest departure day", () => {
    // The coast is stormy on days 0-2 and fair afterwards
    const { source } = makeSource((zone, day) => (zone === "ashfall" && day < 3 ? { speed: 0.5, label: "Storm" } : { speed: 1 }));
    const steps = buildRouteSteps([{ x: 0, y: 0 }, { x: 9, y: 0 }], [30], [1], gridLine);
    const options = rankDepartures(steps, { speedPerHour: 2, hoursPerDay: 8, weatherMultiplier: createRouteWeather(source).weatherMultiplier }, 0, 7);
    expect(options).toHaveLength(7);
    expect(options.filter(o => o.best)).toHaveLength(1);
    const best = options.find(o => o.best);
    // The first day already reaches the coast, so day 3 is the first storm-free start; ties go to the earliest
    expect(best?.day).toBe(3);
    expect(options[0].totalHours).toBeGreaterThan(best?.totalHours ?? Infinity);
  });
});

describe("computeDayStretches", () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];

  it("cuts the polyline by distance made each day, keeping corners", () => {
    const stretches = computeDayStretches(points, [10, 10], [5, 10, 5]);
    expect(stretches.map(s => s.points)).toEqual([
      [{ x: 0, y: 0 }, { x: 50, y: 0 }],
      [{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }],
      [{ x: 100, y: 50 }, { x: 100, y: 100 }],
    ]);
  });

  it("clamps a partial itinerary to the route", () => {
    const stretches = computeDayStretches(points, [10, 10], [30]);
    expect(stretches[0].points[stretches[0].points.length - 1]).toEqual({ x: 100, y: 100 });
    expect(computeDayStretches(points.slice(0, 1), [], [5])).toEqual([]);
  });
});

describe("formatHours", () => {
  it("reads short", () => {
    expect(formatHours(0)).toBe("0 h");
    expect(formatHours(0.5)).toBe("30 min");
    expect(formatHours(5.46)).toBe("5.5 h");
    expect(formatHours(26.4)).toBe("26 h");
  });

  it("formats chip spans in travel days", () => {
    expect(formatTravelSpan(5.5, 8)).toBe("5.5 h");
    expect(formatTravelSpan(16, 8)).toBe("2 d");
    expect(formatTravelSpan(19.2, 8)).toBe("2 d 3 h");
    expect(formatTravelSpan(23.8, 8)).toBe("3 d");
    expect(formatTravelSpan(3, 0)).toBe("3 h");
  });
});

describe("performance", () => {
  it("costs a 40-segment hex route for two modes plus a 7-day window quickly", () => {
    const points = Array.from({ length: 41 }, (_, i) => ({ x: (i % 2) * 6 + i, y: i % 3 === 0 ? 0 : 4 }));
    const distances = points.slice(1).map((p, i) => hex.getHexDistance(points[i].x, points[i].y, p.x, p.y) * 6);
    const terrains = distances.map((_, i) => (i % 4 === 0 ? 0.5 : 1));
    const { source } = makeSource((zone, day) => ({ speed: zone === "ashfall" && day % 2 === 0 ? 0.5 : 0.9, label: "Rain" }));

    // Warm-up run so the timing reflects steady state, not JIT
    const run = () => {
      const weather = createRouteWeather(source);
      const steps = buildRouteSteps(points, distances, terrains, hexLine);
      const opts = { speedPerHour: 3, hoursPerDay: 8, weatherMultiplier: weather.weatherMultiplier };
      walkForecast(steps, { ...opts, departDay: 0 });
      walkForecast(steps, { ...opts, speedPerHour: 6, departDay: 0 });
      return rankDepartures(steps, opts, 0, 7);
    };
    run();
    const t0 = performance.now();
    const options = run();
    const elapsed = performance.now() - t0;
    expect(options).toHaveLength(7);
    // Budget is 5 ms on a desktop; the assertion is loose so a busy CI box does not flake
    expect(elapsed).toBeLessThan(50);
  });
});
