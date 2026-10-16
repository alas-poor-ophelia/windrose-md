/**
 * wadjetBridge Unit Tests
 *
 * Tests the boundary with the optional weather plugin against a fake app:
 * availability checks, reads that must degrade to "no weather" instead of
 * throwing, apiVersion-1 passthroughs that must stay off on 0.3.x, event
 * payloads and unload, and the zone-resolver and interpreter registration
 * lifecycles across the weather plugin loading late, unloading, or being
 * re-enabled with a new API object.
 */

import { describe, it, expect, vi } from "vitest";

import {
  advanceWeather,
  canAdvanceWeather,
  classifyWithApi,
  connectInterpreter,
  connectZoneResolver,
  describeReport,
  formatDayWithApi,
  getApiVersion,
  getWadjetApi,
  getWeatherDay,
  getWeatherUnits,
  getZoneRange,
  getZoneReport,
  glyphWithApi,
  interpretWithApi,
  listInterpreters,
  listWeatherZones,
  subscribeToWeather,
} from "../../../src/weather/wadjetBridge";
import type { WindroseZoneAnswers } from "../../../src/weather/wadjetBridge";
import type { WadjetApi, WadjetInterpreter, WadjetWeatherReport } from "#types/integrations/wadjet.types";
import { buildReport, createFakeApi, createFakeApiV1, createFakeApp } from "./fakeWadjet";

/** Zone answers backed by a hex lookup (async = sync) */
function hexAnswers(lookup: (mapId: string, q: number, r: number) => string | null): WindroseZoneAnswers {
  const resolve: WindroseZoneAnswers["resolve"] = locator =>
    locator.kind === "hex" ? lookup(locator.mapId, locator.q, locator.r) : null;
  return { resolve, resolveAsync: locator => Promise.resolve(resolve(locator)) };
}

const NO_ANSWERS = hexAnswers(() => null);

const ECHO_INTERPRETER: WadjetInterpreter<{ speedMultiplier: number }> = {
  id: "test.travel",
  label: "Test rules",
  facet: "travel",
  interpret: () => ({ speedMultiplier: 0.5 }),
};

describe("wadjetBridge", () => {
  describe("getWadjetApi", () => {
    it("is null when the weather plugin is not installed", () => {
      expect(getWadjetApi(createFakeApp().app)).toBeNull();
    });

    it("is null until the plugin reports ready (and after it unloads)", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi({ ready: false }).api);
      expect(getWadjetApi(fake.app)).toBeNull();
    });

    it("is null when a method this build calls is missing", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi({ getReport: undefined as unknown as WadjetApi["getReport"] }).api);
      expect(getWadjetApi(fake.app)).toBeNull();
    });

    it("does not require methods this build never needs", () => {
      const fake = createFakeApp();
      const { api } = createFakeApi({ getRange: undefined as unknown as WadjetApi["getRange"] });
      fake.install(api);
      expect(getWadjetApi(fake.app)).toBe(api);
    });

    it("returns the live API object", () => {
      const fake = createFakeApp();
      const { api } = createFakeApi();
      fake.install(api);
      expect(getWadjetApi(fake.app)).toBe(api);
    });
  });

  describe("reads degrade instead of throwing", () => {
    it("reads the current day, or null when the calendar has no date or throws", () => {
      expect(getWeatherDay(createFakeApi().api)).toBe(2);
      expect(getWeatherDay(createFakeApi({ now: () => null }).api)).toBeNull();
      expect(getWeatherDay(createFakeApi({ now: () => { throw new Error("no calendar"); } }).api)).toBeNull();
    });

    it("returns a zone's report for a day, and an hour when asked", () => {
      const report = getZoneReport(createFakeApi().api, "coast", 5);
      expect(report?.zoneId).toBe("coast");
      expect(report?.dayOrdinal).toBe(5);
      expect(getZoneReport(createFakeApi().api, "coast", 5, 14)?.hour).toBe(14);
    });

    it("returns null for a non-integer day without asking the plugin", () => {
      const getReport = vi.fn(() => buildReport());
      expect(getZoneReport(createFakeApi({ getReport }).api, "coast", 2.5)).toBeNull();
      expect(getReport).not.toHaveBeenCalled();
    });

    it("returns null for a zone the plugin no longer has", () => {
      const { api } = createFakeApi({ getReport: () => { throw new RangeError('Unknown zone "gone".'); } });
      expect(getZoneReport(api, "gone", 2)).toBeNull();
    });

    it("rejects a report with a precipitation kind this build does not know", () => {
      const hail = buildReport({ precipitation: { type: "hail" as never, amountMm: 9, intensity: 0.7 } });
      expect(getZoneReport(createFakeApi({ getReport: () => hail }).api, "coast", 2)).toBeNull();
    });

    it("rejects a report with a non-finite or missing field", () => {
      const nan = buildReport({ temperature: { high: 1, low: 0, mean: Number.NaN } });
      expect(getZoneReport(createFakeApi({ getReport: () => nan }).api, "coast", 2)).toBeNull();
      const partial = { ...buildReport(), wind: undefined } as unknown as WadjetWeatherReport;
      expect(getZoneReport(createFakeApi({ getReport: () => partial as never }).api, "coast", 2)).toBeNull();
    });

    it("lists zones, dropping malformed entries, and survives a throw", () => {
      const mixed = createFakeApi({
        listZones: () => [{ id: "coast", name: "Coast" }, { id: 7 } as never],
      }).api;
      expect(listWeatherZones(mixed)).toEqual([{ id: "coast", name: "Coast" }]);
      expect(listWeatherZones(createFakeApi({ listZones: () => { throw new Error("x"); } }).api)).toEqual([]);
    });

    it("uses the plugin's wording, or null when it has none", () => {
      const report = buildReport();
      expect(describeReport(createFakeApi().api, report)).toBe("Cold, steady sleet.");
      expect(describeReport(createFakeApi({ describe: () => { throw new TypeError("x"); } }).api, report)).toBeNull();
      expect(describeReport(createFakeApi({ describe: undefined as unknown as WadjetApi["describe"] }).api, report)).toBeNull();
    });

    it("defaults units to metric", () => {
      expect(getWeatherUnits(createFakeApi({ units: () => "imperial" }).api)).toBe("imperial");
      expect(getWeatherUnits(createFakeApi({ units: undefined as unknown as WadjetApi["units"] }).api)).toBe("metric");
    });
  });

  describe("apiVersion-1 passthroughs", () => {
    it("reads the API version, 0 when absent", () => {
      expect(getApiVersion(createFakeApi().api)).toBe(0);
      expect(getApiVersion(createFakeApiV1().api)).toBe(1);
    });

    it("leaves every new member alone on a 0.3.x API even if one happens to exist", () => {
      const old = createFakeApi({ format: () => "nope", classify: () => { throw new Error("x"); } } as Partial<WadjetApi>).api;
      expect(formatDayWithApi(old, 3)).toBeNull();
      expect(classifyWithApi(old, buildReport())).toBeNull();
      expect(glyphWithApi(old, buildReport())).toBeNull();
      expect(canAdvanceWeather(old)).toBe(false);
      expect(interpretWithApi(old, "x", buildReport())).toEqual({ ok: false });
    });

    it("passes through on apiVersion 1", async () => {
      const v1 = createFakeApiV1().api;
      expect(formatDayWithApi(v1, 3)).toBe("Firstday 3");
      expect(classifyWithApi(v1, buildReport())?.compass).toBe("WSW");
      expect(glyphWithApi(v1, buildReport())).toContain("<svg");
      expect(canAdvanceWeather(v1)).toBe(true);
      await expect(advanceWeather(v1, 1)).resolves.toBe(true);
      await expect(advanceWeather(v1, 1.5)).resolves.toBe(false);
    });

    it("degrades on throws, rejections and junk", async () => {
      const broken = createFakeApiV1({
        format: () => { throw new Error("x"); },
        glyph: () => "<script>alert(1)</script>",
        classify: () => ({}) as never,
        advance: () => Promise.reject(new Error("refused")),
        interpret: () => { throw new RangeError("unknown"); },
      }).api;
      expect(formatDayWithApi(broken, 3)).toBeNull();
      expect(glyphWithApi(broken, buildReport())).toBeNull();
      expect(classifyWithApi(broken, buildReport())).toBeNull();
      await expect(advanceWeather(broken, 1)).resolves.toBe(false);
      expect(interpretWithApi(broken, "x", buildReport())).toEqual({ ok: false });
      expect(canAdvanceWeather(createFakeApiV1({ canSetNow: () => false }).api)).toBe(false);
    });

    it("reads a range in one call, or null so the caller can fall back", () => {
      const v1 = createFakeApiV1().api;
      expect(getZoneRange(v1, "coast", 1, 3)?.map(r => r.dayOrdinal)).toEqual([1, 2, 3]);
      expect(getZoneRange(v1, "coast", 3, 1)).toEqual([]);
      expect(getZoneRange(v1, "coast", 0, 5000)).toEqual([]);
      expect(getZoneRange(createFakeApi({ getRange: () => { throw new Error("x"); } }).api, "coast", 1, 3)).toBeNull();
    });

    it("lists interpreters by facet, [] when the plugin is old or absent", () => {
      const fake = createFakeApp();
      expect(listInterpreters(fake.app, "travel")).toEqual([]);
      const old = createFakeApi();
      fake.install(old.api);
      expect(listInterpreters(fake.app, "travel")).toEqual([]);
      const weather = createFakeApiV1();
      fake.install(weather.api);
      weather.interpreters.push(ECHO_INTERPRETER as WadjetInterpreter);
      expect(listInterpreters(fake.app, "travel").map(i => i.id)).toEqual(["test.travel"]);
      expect(listInterpreters(fake.app, "hazard")).toEqual([]);
    });
  });

  describe("subscribeToWeather", () => {
    it("reports why it fired (0.3.x: no payloads)", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("time-changed");
      weather.emit("profiles-changed");
      weather.emit("adapters-changed");
      expect(onChange.mock.calls).toEqual([
        [{ reason: "time", day: undefined }],
        [{ reason: "profiles", zoneIds: null }],
        [{ reason: "adapters" }],
      ]);
    });

    it("reads apiVersion-1 payloads", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("time-changed", Object.freeze({ type: "time-changed", current: 9, adapterId: "internal" }));
      weather.emit("time-changed", Object.freeze({ type: "time-changed", current: null, adapterId: "internal" }));
      weather.emit("profiles-changed", Object.freeze({ type: "profiles-changed", all: false, zoneIds: Object.freeze(["coast"]) }));
      weather.emit("profiles-changed", Object.freeze({ type: "profiles-changed", all: true, zoneIds: ["coast", "moor"] }));
      expect(onChange.mock.calls).toEqual([
        [{ reason: "time", day: 9 }],
        [{ reason: "time", day: null }],
        [{ reason: "profiles", zoneIds: ["coast"] }],
        [{ reason: "profiles", zoneIds: null }],
      ]);
    });

    it("ignores events it does not act on", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("interpreters-changed", { type: "interpreters-changed", facet: "travel" });
      weather.emit("resolvers-changed", { type: "resolvers-changed" });
      expect(onChange).not.toHaveBeenCalled();
    });

    it("releases every listener on unsubscribe", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const unsubscribe = subscribeToWeather(fake.app, vi.fn());
      expect(weather.listenerCount()).toBe(4);
      expect(fake.workspaceHandlerCount()).toBe(2);

      unsubscribe();
      expect(weather.listenerCount()).toBe(0);
      expect(fake.workspaceHandlerCount()).toBe(0);
    });

    it("binds when the weather plugin finishes loading after Windrose", () => {
      const fake = createFakeApp();
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      const weather = createFakeApi();
      fake.install(weather.api);
      fake.triggerReady();
      expect(onChange.mock.calls).toEqual([[{ reason: "ready" }]]);

      weather.emit("time-changed");
      expect(onChange).toHaveBeenLastCalledWith({ reason: "time", day: undefined });
    });

    it("moves to the new API object when the weather plugin is re-enabled", () => {
      const fake = createFakeApp();
      const first = createFakeApi();
      fake.install(first.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      const second = createFakeApi();
      fake.install(second.api);
      fake.triggerReady();

      expect(first.listenerCount()).toBe(0);
      expect(second.listenerCount()).toBe(4);
      onChange.mockClear();
      first.emit("time-changed");
      expect(onChange).not.toHaveBeenCalled();
      second.emit("time-changed");
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it("reports unload from the API event and from the workspace event, and unbinds", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("unload", { type: "unload" });
      expect(onChange).toHaveBeenLastCalledWith({ reason: "unload" });
      expect(weather.listenerCount()).toBe(0);

      fake.triggerUnload();
      expect(onChange).toHaveBeenCalledTimes(2);
      expect(onChange).toHaveBeenLastCalledWith({ reason: "unload" });
    });
  });

  describe("connectZoneResolver", () => {
    it("claims hex and custom locators and forwards sync and async answers", async () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const lookup = vi.fn((mapId: string, q: number, r: number) => (mapId === "map-a" && q === 4 && r === -2 ? "coast" : null));
      connectZoneResolver(fake.app, hexAnswers(lookup));

      expect(weather.resolvers).toHaveLength(1);
      const resolver = weather.resolvers[0];
      expect(resolver.kinds).toEqual(["hex", "custom"]);
      expect(resolver.resolve?.({ kind: "hex", mapId: "map-a", q: 4, r: -2 })).toBe("coast");
      expect(resolver.resolve?.({ kind: "hex", mapId: "map-a", q: 0, r: 0 })).toBeNull();
      expect(resolver.resolve?.({ kind: "note", path: "Places/Coast.md" })).toBeNull();
      await expect(resolver.resolveAsync?.({ kind: "hex", mapId: "map-a", q: 4, r: -2 })).resolves.toBe("coast");
    });

    it("stays registered exactly once across repeated ready events", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      connectZoneResolver(fake.app, NO_ANSWERS);

      fake.triggerReady();
      fake.triggerReady();
      expect(weather.resolvers).toHaveLength(1);
    });

    it("registers once the weather plugin appears, and unregisters on dispose", () => {
      const fake = createFakeApp();
      const dispose = connectZoneResolver(fake.app, NO_ANSWERS);

      const weather = createFakeApi();
      fake.install(weather.api);
      fake.triggerReady();
      expect(weather.resolvers).toHaveLength(1);

      dispose();
      expect(weather.resolvers).toHaveLength(0);
      expect(fake.workspaceHandlerCount()).toBe(0);
    });

    it("survives a plugin that refuses the registration", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi({ registerZoneResolver: () => { throw new Error("duplicate id"); } }).api);
      expect(() => connectZoneResolver(fake.app, NO_ANSWERS)()).not.toThrow();
    });
  });

  describe("connectInterpreter", () => {
    it("registers on an apiVersion-1 plugin and unregisters on dispose", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      const dispose = connectInterpreter(fake.app, ECHO_INTERPRETER);
      expect(weather.interpreters.map(i => i.id)).toEqual(["test.travel"]);
      dispose();
      expect(weather.interpreters).toHaveLength(0);
      expect(fake.workspaceHandlerCount()).toBe(0);
    });

    it("does nothing on a 0.3.x plugin", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi().api);
      expect(() => connectInterpreter(fake.app, ECHO_INTERPRETER)()).not.toThrow();
    });

    it("unregisters before re-registering, so repeated ready events never hit a duplicate id", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      connectInterpreter(fake.app, ECHO_INTERPRETER);
      fake.triggerReady();
      fake.triggerReady();
      expect(weather.interpreters.map(i => i.id)).toEqual(["test.travel"]);
    });

    it("re-registers on the new registry after a disable / re-enable", () => {
      const fake = createFakeApp();
      const first = createFakeApiV1();
      fake.install(first.api);
      connectInterpreter(fake.app, ECHO_INTERPRETER);

      fake.triggerUnload();
      fake.install(null);
      const second = createFakeApiV1();
      fake.install(second.api);
      fake.triggerReady();
      expect(second.interpreters.map(i => i.id)).toEqual(["test.travel"]);
    });

    it("survives a registry that throws a duplicate-id error", () => {
      const fake = createFakeApp();
      const weather = createFakeApiV1();
      fake.install(weather.api);
      weather.interpreters.push({ ...ECHO_INTERPRETER } as WadjetInterpreter);
      expect(() => connectInterpreter(fake.app, ECHO_INTERPRETER)()).not.toThrow();
    });
  });
});
