/**
 * wadjetBridge Unit Tests
 *
 * Tests the boundary with the optional weather plugin against a fake app:
 * availability checks, reads that must degrade to "no weather" instead of
 * throwing, and the subscription and zone-resolver lifecycles across the
 * weather plugin loading late or being re-enabled with a new API object.
 */

import { describe, it, expect, vi } from "vitest";
import type { App } from "obsidian";

import {
  connectZoneResolver,
  describeReport,
  getWadjetApi,
  getWeatherDay,
  getWeatherUnits,
  getZoneReport,
  listWeatherZones,
  subscribeToWeather,
} from "../../../src/weather/wadjetBridge";
import type { WadjetApi, WadjetWeatherReport, WadjetZoneResolver } from "#types/integrations/wadjet.types";

function buildReport(overrides: Partial<WadjetWeatherReport> = {}): WadjetWeatherReport {
  return {
    schemaVersion: 0,
    zoneId: "coast",
    dayOrdinal: 2,
    temperature: { high: 3, low: 0, mean: 1.5 },
    precipitation: { type: "sleet", amountMm: 6.4, intensity: 0.27 },
    humidity: 0.86,
    cloudCover: 1,
    wind: { speedKph: 0, directionDeg: 112 },
    visibilityKm: 6.4,
    regime: "normal",
    conditions: [],
    descriptors: { temperature: "cold", precipitation: "steady", wind: "calm", sky: "overcast" },
    overridden: false,
    ...overrides,
  };
}

/** A weather API double that records its listeners and resolvers */
function createFakeApi(overrides: Partial<WadjetApi> = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const resolvers: WadjetZoneResolver[] = [];
  const api: WadjetApi = {
    version: "0.3.1",
    ready: true,
    schemaVersion: 0,
    getReport: (zoneId, time) => buildReport({ zoneId, dayOrdinal: time.dayOrdinal }),
    getRange: () => [],
    now: () => ({ dayOrdinal: 2, yearLength: 365, source: "internal" }),
    listZones: () => [{ id: "coast", name: "Coast" }],
    registerZoneResolver: (resolver) => {
      resolvers.push(resolver);
      return () => {
        const index = resolvers.indexOf(resolver);
        if (index >= 0) resolvers.splice(index, 1);
      };
    },
    resolveZone: () => null,
    describe: () => "Cold, steady sleet.",
    units: () => "metric",
    on: (event, cb) => {
      const set = listeners.get(event) ?? new Set();
      set.add(cb);
      listeners.set(event, set);
      return () => { set.delete(cb); };
    },
    ...overrides,
  };
  return {
    api,
    resolvers,
    emit: (event: string) => { for (const cb of [...(listeners.get(event) ?? [])]) cb(); },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

/** An app double with a workspace event bus and a plugin registry */
function createFakeApp() {
  const handlers = new Map<object, { name: string; cb: () => void }>();
  const plugins: Record<string, { api?: unknown } | undefined> = {};
  const app = {
    workspace: {
      on: (name: string, cb: () => void) => {
        const ref = {};
        handlers.set(ref, { name, cb });
        return ref;
      },
      offref: (ref: object) => { handlers.delete(ref); },
    },
    plugins: { plugins },
  };
  return {
    app: app as unknown as App,
    install: (api: WadjetApi | null) => { plugins.wadjet = api != null ? { api } : undefined; },
    triggerReady: () => { for (const h of [...handlers.values()]) if (h.name === "wadjet:ready") h.cb(); },
    workspaceHandlerCount: () => handlers.size,
  };
}

describe("wadjetBridge", () => {
  describe("getWadjetApi", () => {
    it("is null when the weather plugin is not installed", () => {
      expect(getWadjetApi(createFakeApp().app)).toBeNull();
    });

    it("is null until the plugin reports ready", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi({ ready: false }).api);
      expect(getWadjetApi(fake.app)).toBeNull();
    });

    it("is null when a method this build calls is missing", () => {
      const fake = createFakeApp();
      fake.install(createFakeApi({ getReport: undefined as unknown as WadjetApi["getReport"] }).api);
      expect(getWadjetApi(fake.app)).toBeNull();
    });

    it("does not require methods this build never calls", () => {
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

    it("returns a zone's report for a day", () => {
      const report = getZoneReport(createFakeApi().api, "coast", 5);
      expect(report?.zoneId).toBe("coast");
      expect(report?.dayOrdinal).toBe(5);
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
      expect(getZoneReport(createFakeApi({ getReport: () => partial }).api, "coast", 2)).toBeNull();
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

  describe("subscribeToWeather", () => {
    it("reports why it fired", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("time-changed");
      weather.emit("profiles-changed");
      expect(onChange.mock.calls).toEqual([["time"], ["profiles"]]);
    });

    it("ignores events it does not act on", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const onChange = vi.fn();
      subscribeToWeather(fake.app, onChange);

      weather.emit("adapters-changed");
      expect(onChange).not.toHaveBeenCalled();
    });

    it("releases every listener on unsubscribe", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const unsubscribe = subscribeToWeather(fake.app, vi.fn());
      expect(weather.listenerCount()).toBe(2);
      expect(fake.workspaceHandlerCount()).toBe(1);

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
      expect(onChange.mock.calls).toEqual([["ready"]]);

      weather.emit("time-changed");
      expect(onChange).toHaveBeenLastCalledWith("time");
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
      expect(second.listenerCount()).toBe(2);
      onChange.mockClear();
      first.emit("time-changed");
      expect(onChange).not.toHaveBeenCalled();
      second.emit("time-changed");
      expect(onChange).toHaveBeenCalledTimes(1);
    });
  });

  describe("connectZoneResolver", () => {
    it("answers hex locators through the lookup and nothing else", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      const lookup = vi.fn((mapId: string, q: number, r: number) => (mapId === "map-a" && q === 4 && r === -2 ? "coast" : null));
      connectZoneResolver(fake.app, lookup);

      expect(weather.resolvers).toHaveLength(1);
      const resolver = weather.resolvers[0];
      expect(resolver.kinds).toEqual(["hex"]);
      expect(resolver.resolve({ kind: "hex", mapId: "map-a", q: 4, r: -2 })).toBe("coast");
      expect(resolver.resolve({ kind: "hex", mapId: "map-a", q: 0, r: 0 })).toBeNull();
      expect(resolver.resolve({ kind: "note", path: "Places/Coast.md" })).toBeNull();
    });

    it("stays registered exactly once across repeated ready events", () => {
      const fake = createFakeApp();
      const weather = createFakeApi();
      fake.install(weather.api);
      connectZoneResolver(fake.app, () => null);

      fake.triggerReady();
      fake.triggerReady();
      expect(weather.resolvers).toHaveLength(1);
    });

    it("registers once the weather plugin appears, and unregisters on dispose", () => {
      const fake = createFakeApp();
      const dispose = connectZoneResolver(fake.app, () => null);

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
      expect(() => connectZoneResolver(fake.app, () => null)()).not.toThrow();
    });
  });
});
