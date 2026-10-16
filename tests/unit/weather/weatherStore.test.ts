/**
 * WeatherStoreCore Unit Tests
 *
 * The per-map weather store against fake weather plugins of both
 * generations (0.3.x without apiVersion, and apiVersion 1): report caching
 * and invalidation (profiles by zone, time, adapters), unload and rebind,
 * a silently disabled 0.3.x plugin, batched view time, passthroughs with
 * fallbacks, and travel interpretation through the selected interpreter.
 */

import { describe, it, expect, vi } from "vitest";

import { WeatherStoreCore } from "../../../src/weather/weatherStore";
import { windroseTravelInterpreter } from "../../../src/weather/travelInterpreter";
import type { WadjetInterpreter, WeatherReport } from "#types/integrations/wadjet.types";
import { buildReport, createFakeApi, createFakeApiV1, createFakeApp } from "./fakeWadjet";

/** Run scheduled work on demand */
function manualScheduler() {
  const tasks: (() => void)[] = [];
  return {
    schedule: (task: () => void) => { tasks.push(task); },
    flush: () => { while (tasks.length > 0) tasks.shift()?.(); },
    pending: () => tasks.length,
  };
}

/** Every day of the fake's weather (reports and ranges) */
function withDays(weather: ReturnType<typeof createFakeApi>, days: Partial<WeatherReport> | ((day: number) => Partial<WeatherReport>)) {
  const at = (day: number) => typeof days === "function" ? days(day) : days;
  weather.api.getReport = (zoneId, time) => buildReport({ zoneId, dayOrdinal: time?.dayOrdinal ?? 2, hour: time?.hour, ...at(time?.dayOrdinal ?? 2) });
  weather.api.getRange = (zoneId, from, to) => {
    const out: WeatherReport[] = [];
    for (let d = from; d <= to; d++) out.push(buildReport({ zoneId, dayOrdinal: d, ...at(d) }));
    return out;
  };
}

const DRY_DAYS: Partial<WeatherReport> = {
  precipitation: { type: "none", amountMm: 0, intensity: 0 },
  temperature: { high: 18, low: 8, mean: 13 },
  humidity: 0.5,
};

function setup(kind: "old" | "v1", options: { interpreterId?: string; days?: Partial<WeatherReport> | ((day: number) => Partial<WeatherReport>) } = {}) {
  const fake = createFakeApp();
  const weather = kind === "v1" ? createFakeApiV1() : createFakeApi();
  if (options.days != null) withDays(weather, options.days);
  const getReport = vi.fn(weather.api.getReport);
  weather.api.getReport = getReport;
  fake.install(weather.api);
  const scheduler = manualScheduler();
  const core = new WeatherStoreCore(fake.app, {
    schedule: scheduler.schedule,
    getTravelInterpreterId: () => options.interpreterId ?? "windrose.travel",
  });
  const listener = vi.fn();
  core.subscribe(listener);
  const stop = core.start();
  return { fake, weather, getReport, core, listener, scheduler, stop };
}

describe("WeatherStoreCore", () => {
  describe("binding", () => {
    it("is unavailable without the weather plugin and answers nothing", () => {
      const fake = createFakeApp();
      const core = new WeatherStoreCore(fake.app);
      core.start();
      expect(core.getSnapshot()).toMatchObject({ available: false, apiVersion: 0, zones: [], today: null });
      expect(core.report("coast", 2)).toBeNull();
      expect(core.range("coast", 1, 3)).toEqual([]);
      expect(core.formatDay(4)).toBe("Day 4");
    });

    it("reads zones, today and the API version (0 for 0.3.x, 1 for new)", () => {
      expect(setup("old").core.getSnapshot()).toMatchObject({
        available: true, apiVersion: 0, today: 2, zones: [{ id: "coast", name: "Coast" }], canAdvance: false,
      });
      expect(setup("v1").core.getSnapshot()).toMatchObject({ available: true, apiVersion: 1, canAdvance: true });
    });

    it("binds when the plugin loads after the map, and rebinds to a re-enabled plugin", () => {
      const fake = createFakeApp();
      const core = new WeatherStoreCore(fake.app);
      const listener = vi.fn();
      core.subscribe(listener);
      core.start();
      expect(core.getSnapshot().available).toBe(false);

      const first = createFakeApiV1();
      fake.install(first.api);
      fake.triggerReady();
      expect(core.getSnapshot().available).toBe(true);
      expect(listener).toHaveBeenCalledTimes(1);

      const second = createFakeApiV1({ listZones: () => [{ id: "moor", name: "Moor" }] });
      fake.install(second.api);
      fake.triggerReady();
      expect(core.getSnapshot().zones).toEqual([{ id: "moor", name: "Moor" }]);
      expect(first.listenerCount()).toBe(0);
    });

    it("stops listening on stop", () => {
      const { weather, fake, stop, listener } = setup("v1");
      stop();
      expect(weather.listenerCount()).toBe(0);
      expect(fake.workspaceHandlerCount()).toBe(0);
      weather.emit("time-changed", { type: "time-changed", current: 3, adapterId: "x" });
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe("report cache", () => {
    it("caches per (zone, day, hour)", () => {
      const { core, getReport } = setup("v1");
      const a = core.report("coast", 5);
      expect(core.report("coast", 5)).toBe(a);
      expect(getReport).toHaveBeenCalledTimes(1);
      core.report("coast", 5, 12);
      core.report("coast", 5, 12);
      core.report("coast", 6);
      core.report("moor", 5);
      expect(getReport).toHaveBeenCalledTimes(4);
    });

    it("caches misses too, and never throws", () => {
      const { core, getReport } = setup("old");
      getReport.mockImplementation(() => { throw new RangeError("Unknown zone"); });
      expect(core.report("gone", 2)).toBeNull();
      expect(core.report("gone", 2)).toBeNull();
      expect(getReport).toHaveBeenCalledTimes(1);
      expect(core.report("coast", 2.5)).toBeNull();
      expect(core.report("coast", 2, 25)).toBeNull();
    });

    it("clears only the named zones on an apiVersion-1 profiles-changed", () => {
      const { core, weather, getReport, listener } = setup("v1");
      core.report("coast", 2);
      core.report("moor", 2);
      weather.emit("profiles-changed", { type: "profiles-changed", all: false, zoneIds: ["coast"] });
      expect(listener).toHaveBeenCalledTimes(1);
      core.report("coast", 2);
      core.report("moor", 2);
      expect(getReport.mock.calls.map(c => c[0])).toEqual(["coast", "moor", "coast"]);
    });

    it("clears everything on profiles-changed with all, or from a 0.3.x plugin", () => {
      for (const [kind, payload] of [["v1", { type: "profiles-changed", all: true, zoneIds: [] }], ["old", undefined]] as const) {
        const { core, weather, getReport } = setup(kind);
        core.report("coast", 2);
        core.report("moor", 2);
        weather.emit("profiles-changed", payload);
        core.report("coast", 2);
        core.report("moor", 2);
        expect(getReport).toHaveBeenCalledTimes(4);
      }
    });

    it("refreshes the zone list on profiles-changed", () => {
      const { core, weather } = setup("v1");
      weather.api.listZones = () => [{ id: "coast", name: "Coast" }, { id: "moor", name: "Moor" }];
      weather.emit("profiles-changed", { type: "profiles-changed", all: false, zoneIds: ["moor"] });
      expect(core.getSnapshot().zones).toHaveLength(2);
    });

    it("clears everything and moves today on time-changed", () => {
      const { core, weather, getReport, listener } = setup("v1");
      core.report("coast", 2);
      weather.emit("time-changed", { type: "time-changed", current: 3, adapterId: "internal" });
      expect(core.getSnapshot().today).toBe(3);
      expect(listener).toHaveBeenCalledTimes(1);
      core.report("coast", 2);
      expect(getReport).toHaveBeenCalledTimes(2);
    });

    it("ignores a 0.3.x clock tick inside the same day", () => {
      const { core, weather, getReport, listener } = setup("old");
      core.report("coast", 2);
      weather.emit("time-changed");
      expect(listener).not.toHaveBeenCalled();
      core.report("coast", 2);
      expect(getReport).toHaveBeenCalledTimes(1);

      weather.api.now = () => ({ dayOrdinal: 3, yearPhase: 0, yearLength: 365, source: "internal" });
      weather.emit("time-changed");
      expect(core.getSnapshot().today).toBe(3);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("clears day labels on adapters-changed", () => {
      const { core, weather } = setup("v1");
      expect(core.formatDay(4)).toBe("Firstday 4");
      weather.api.format = (day: number) => `Moonday ${day}`;
      expect(core.formatDay(4)).toBe("Firstday 4");
      weather.emit("adapters-changed", { type: "adapters-changed" });
      expect(core.formatDay(4)).toBe("Moonday 4");
    });
  });

  describe("unload", () => {
    it("goes unavailable at once on the unload event and drops the cache", () => {
      const { core, weather, getReport, listener } = setup("v1");
      core.report("coast", 2);
      weather.api.ready = false;
      weather.emit("unload", { type: "unload" });
      expect(core.getSnapshot()).toMatchObject({ available: false, apiVersion: 0, zones: [], today: null, canAdvance: false });
      expect(listener).toHaveBeenCalledTimes(1);
      expect(core.report("coast", 2)).toBeNull();
      expect(getReport).toHaveBeenCalledTimes(1);
    });

    it("goes unavailable on the workspace unload event alone, once", () => {
      const { core, fake, listener } = setup("v1");
      fake.triggerUnload();
      fake.triggerUnload();
      expect(core.getSnapshot().available).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("comes back on the next ready with a new API object", () => {
      const { core, fake, weather } = setup("v1");
      weather.emit("unload", { type: "unload" });
      fake.install(null);
      const next = createFakeApiV1();
      fake.install(next.api);
      fake.triggerReady();
      expect(core.getSnapshot().available).toBe(true);
      expect(core.report("coast", 2)).not.toBeNull();
    });

    it("notices a 0.3.x plugin disabled without a signal", () => {
      const { core, fake, scheduler, listener } = setup("old");
      fake.install(null);
      expect(core.report("coast", 2)).toBeNull();
      expect(core.getSnapshot().available).toBe(true);
      scheduler.flush();
      expect(core.getSnapshot().available).toBe(false);
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });

  describe("view time", () => {
    it("batches several changes into one update", () => {
      const { core, scheduler, listener } = setup("v1");
      core.setViewTime({ dayOffset: 1 });
      core.setViewTime({ hour: 6 });
      core.setViewTime({ dayOffset: 2 });
      expect(listener).not.toHaveBeenCalled();
      expect(core.getSnapshot().viewTime).toEqual({ dayOffset: 2, hour: 6 });
      scheduler.flush();
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("ignores no-op and invalid changes", () => {
      const { core, scheduler } = setup("v1");
      core.setViewTime({ dayOffset: 0, hour: null });
      core.setViewTime({ dayOffset: 1.5, hour: 30 });
      expect(scheduler.pending()).toBe(0);
      expect(core.getSnapshot().viewTime).toEqual({ dayOffset: 0, hour: null });
    });

    it("bumps the version on every published change", () => {
      const { core, scheduler, weather } = setup("v1");
      const v0 = core.getSnapshot().version;
      core.setViewTime({ dayOffset: 3 });
      scheduler.flush();
      weather.emit("time-changed", { type: "time-changed", current: 5, adapterId: "internal" });
      expect(core.getSnapshot().version).toBe(v0 + 2);
    });
  });

  describe("range", () => {
    it("uses getRange once, seeds the daily cache, and caches the range", () => {
      const { core, weather, getReport } = setup("v1");
      const getRange = vi.fn(weather.api.getRange);
      weather.api.getRange = getRange;
      expect(core.range("coast", 1, 3).map(r => r.dayOrdinal)).toEqual([1, 2, 3]);
      core.range("coast", 1, 3);
      core.report("coast", 2);
      expect(getRange).toHaveBeenCalledTimes(1);
      expect(getReport).not.toHaveBeenCalled();
    });

    it("falls back to per-day reports when getRange throws, and rejects bad bounds", () => {
      const { core, weather } = setup("old");
      weather.api.getRange = () => { throw new Error("x"); };
      expect(core.range("coast", 1, 3)).toHaveLength(3);
      expect(core.range("coast", 3, 1)).toEqual([]);
      expect(core.range("coast", 0, 4000)).toEqual([]);
    });
  });

  describe("passthroughs and fallbacks", () => {
    it("uses the plugin's classify, glyph, format and describe on apiVersion 1", () => {
      const { core } = setup("v1");
      const report = buildReport();
      expect(core.classify(report).compass).toBe("WSW");
      expect(core.glyphSvg(report)).toContain("<svg");
      expect(core.formatDay(9)).toBe("Firstday 9");
      expect(core.describe(report)).toBe("Cold, steady sleet.");
    });

    it("falls back locally on a 0.3.x plugin", () => {
      const { core, weather } = setup("old");
      weather.api.describe = () => { throw new Error("x"); };
      const report = buildReport({ wind: { speedKph: 30, directionDeg: 270 } });
      expect(core.classify(report)).toMatchObject({ beaufort: 5, compass: "W", oktas: 8, frozenPrecipitation: true });
      expect(core.glyphSvg(report)).toBeNull();
      expect(core.formatDay(9)).toBe("Day 9");
      expect(core.describe(report)).toBe("Light sleet, 2°C");
    });

    it("advances only when the calendar allows it", async () => {
      await expect(setup("old").core.advance(1)).resolves.toBe(false);
      const { core } = setup("v1");
      await expect(core.advance(1)).resolves.toBe(true);
    });
  });

  describe("interpretTravel", () => {
    const snow = buildReport({ precipitation: { type: "snow", amountMm: 20, intensity: 0.7 } });

    it("runs Windrose's own rules locally by default (speed factor)", () => {
      const { core } = setup("v1", { days: DRY_DAYS });
      expect(core.interpretTravel(snow)).toEqual({ speedMultiplier: 0.5, label: "Heavy snow" });
      expect(core.interpretTravel(buildReport({ precipitation: { type: "none", amountMm: 0, intensity: 0 } }))).toEqual({ speedMultiplier: 1 });
    });

    it("runs the selected third-party interpreter through the API", () => {
      const { core, weather } = setup("v1", { interpreterId: "pf2e.travel", days: DRY_DAYS });
      weather.interpreters.push({
        id: "pf2e.travel", label: "Pathfinder", facet: "travel",
        interpret: () => ({ speedMultiplier: 0.25, label: "Blizzard" }),
      } as WadjetInterpreter);
      expect(core.interpretTravel(snow)).toEqual({ speedMultiplier: 0.25, label: "Blizzard" });
    });

    it("reads a third-party `multiplier` as a speed factor, and ignores junk", () => {
      const { core, weather } = setup("v1", { interpreterId: "other.travel", days: DRY_DAYS });
      const interpreter = { id: "other.travel", label: "Other", facet: "travel", interpret: (): unknown => ({ multiplier: 0.8 }) };
      weather.interpreters.push(interpreter as WadjetInterpreter);
      expect(core.interpretTravel(snow)).toEqual({ speedMultiplier: 0.8 });
      interpreter.interpret = () => ({ minutes: 30 });
      expect(core.interpretTravel(snow)).toEqual({ speedMultiplier: 1 });
    });

    it("falls back to Windrose's rules for an unknown id, a throwing interpreter, or an old plugin", () => {
      expect(setup("v1", { interpreterId: "missing.travel", days: DRY_DAYS }).core.interpretTravel(snow).speedMultiplier).toBe(0.5);
      const { core, weather } = setup("v1", { interpreterId: "bad.travel", days: DRY_DAYS });
      weather.interpreters.push({ id: "bad.travel", label: "Bad", facet: "travel", interpret: () => { throw new Error("x"); } } as WadjetInterpreter);
      expect(core.interpretTravel(snow).speedMultiplier).toBe(0.5);
      expect(setup("old", { interpreterId: "pf2e.travel", days: DRY_DAYS }).core.interpretTravel(snow).speedMultiplier).toBe(0.5);
    });

    it("gives the same answer locally and through the registered windrose.travel", () => {
      const { core, weather } = setup("v1", { days: DRY_DAYS });
      weather.interpreters.push(windroseTravelInterpreter as WadjetInterpreter);
      const viaApi = weather.api.interpret?.("windrose.travel", snow as never);
      expect(viaApi).toEqual(core.interpretTravel(snow));
    });

    it("folds the zone's ground state into Windrose's rules", () => {
      // Two weeks of cold heavy snow: deep snow cover on the report's day
      const { core } = setup("v1", { days: { precipitation: { type: "snow", amountMm: 25, intensity: 0.8 }, temperature: { high: -4, low: -12, mean: -8 } } });
      const ground = core.ground("coast", 2);
      expect(ground?.label).toBe("deep snow");
      const result = core.interpretTravel(snow);
      expect(result.label).toBe("Heavy snow, deep snow cover");
      expect(result.speedMultiplier).toBeCloseTo(0.5 / (ground?.travelMultiplier ?? 1), 3);
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it("passes the ground state to a third-party interpreter as options.ground, and a caller's ground wins", () => {
      const { core, weather } = setup("v1", { interpreterId: "pf2e.travel", days: { precipitation: { type: "rain", amountMm: 30, intensity: 0.8 } } });
      const seen: unknown[] = [];
      weather.interpreters.push({
        id: "pf2e.travel", label: "Pathfinder", facet: "travel",
        interpret: (_report, ctx) => { seen.push(ctx.options?.ground); return { speedMultiplier: 0.9 }; },
      } as WadjetInterpreter);
      core.interpretTravel(snow);
      expect(seen[0]).toEqual(core.ground("coast", 2));
      expect((seen[0] as { label: string }).label).toBe("waterlogged");
      const mine = { snowDepthCm: 0, mud: 0, label: "dry", travelMultiplier: 1 };
      core.interpretTravel(snow, { ground: mine });
      expect(seen[1]).toEqual(mine);
    });

    it("gives the same answer through the registered windrose.travel when handed the same ground", () => {
      const { core, weather } = setup("v1", { days: { precipitation: { type: "rain", amountMm: 30, intensity: 0.8 } } });
      weather.interpreters.push(windroseTravelInterpreter as WadjetInterpreter);
      const viaApi = weather.api.interpret?.("windrose.travel", snow as never, { ground: core.ground("coast", 2) });
      expect(viaApi).toEqual(core.interpretTravel(snow));
    });
  });

  describe("ground", () => {
    it("derives from the 14 days ending on the day, cached per (zone, day)", () => {
      const { core, weather } = setup("v1", { days: DRY_DAYS });
      const getRange = vi.fn(weather.api.getRange);
      weather.api.getRange = getRange;
      const a = core.ground("coast", 20);
      expect(a).toMatchObject({ label: "dry", travelMultiplier: 1 });
      expect(getRange).toHaveBeenCalledWith("coast", 7, 20);
      expect(core.ground("coast", 20)).toBe(a);
      expect(getRange).toHaveBeenCalledTimes(1);
    });

    it("sees snow fallen in the window and not before it", () => {
      const snowUntil = (last: number) => (day: number) => day <= last
        ? { precipitation: { type: "snow" as const, amountMm: 20, intensity: 0.8 }, temperature: { high: -5, low: -12, mean: -8 } }
        : { precipitation: { type: "none" as const, amountMm: 0, intensity: 0 }, temperature: { high: -5, low: -12, mean: -8 } };
      const { core } = setup("v1", { days: snowUntil(10) });
      expect(core.ground("coast", 12)?.label).toBe("deep snow");
      // Day 30's window starts on day 17: none of the snow is in it
      expect(core.ground("coast", 30)?.snowDepthCm).toBe(0);
    });

    it("is cleared with the report cache", () => {
      const { core, weather } = setup("v1", { days: DRY_DAYS });
      const before = core.ground("coast", 5);
      weather.emit("time-changed", { type: "time-changed", current: 3, adapterId: "x" });
      expect(core.ground("coast", 5)).not.toBe(before);
      const again = core.ground("coast", 5);
      weather.emit("profiles-changed", { type: "profiles-changed", all: false, zoneIds: ["coast"] });
      expect(core.ground("coast", 5)).not.toBe(again);
    });

    it("is null when unavailable, for bad days, or for a zone with no reports", () => {
      const fake = createFakeApp();
      const core = new WeatherStoreCore(fake.app);
      core.start();
      expect(core.ground("coast", 2)).toBeNull();
      const { core: live, weather } = setup("v1");
      expect(live.ground("coast", 2.5)).toBeNull();
      weather.api.getRange = () => { throw new RangeError("Unknown zone"); };
      weather.api.getReport = () => { throw new RangeError("Unknown zone"); };
      expect(live.ground("gone", 2)).toBeNull();
    });
  });
});
