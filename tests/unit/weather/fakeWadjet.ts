/**
 * Weather plugin doubles shared by the weather unit tests: a report
 * builder, a fake API (0.3.x shape by default, apiVersion 1 with `v1()`),
 * and an app double with a workspace event bus and a plugin registry.
 */

import type { App } from "obsidian";
import type {
  WadjetApi,
  WadjetInterpreter,
  WadjetWeatherReport,
  WadjetZoneResolver,
  WeatherReport,
} from "#types/integrations/wadjet.types";

export function buildReport(overrides: Partial<WeatherReport> = {}): WeatherReport {
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
    provenance: { worldSeed: "s", generatorVersion: "1", rngVersion: "1", profileHash: "p", calendarHash: "c" },
    ...overrides,
  };
}

export type FakeApi = ReturnType<typeof createFakeApi>;

/** A 0.3.x-shaped weather API double that records listeners and registrations */
export function createFakeApi(overrides: Partial<WadjetApi> = {}) {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const resolvers: WadjetZoneResolver[] = [];
  const interpreters: WadjetInterpreter[] = [];
  const api: WadjetApi = {
    version: "0.3.1",
    ready: true,
    schemaVersion: 0,
    getReport: (zoneId, time) => buildReport({ zoneId, dayOrdinal: time?.dayOrdinal ?? 2, hour: time?.hour }),
    getRange: (zoneId, from, to) => {
      const out: WeatherReport[] = [];
      for (let d = from; d <= to; d++) out.push(buildReport({ zoneId, dayOrdinal: d }));
      return out;
    },
    now: () => ({ dayOrdinal: 2, yearPhase: 0, yearLength: 365, source: "internal" }),
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
      set.add(cb as (payload?: unknown) => void);
      listeners.set(event, set);
      return () => { set.delete(cb as (payload?: unknown) => void); };
    },
    ...overrides,
  };
  return {
    api,
    resolvers,
    interpreters,
    emit: (event: string, payload?: unknown) => { for (const cb of [...(listeners.get(event) ?? [])]) cb(payload); },
    listenerCount: () => [...listeners.values()].reduce((n, set) => n + set.size, 0),
  };
}

/** An apiVersion-1 double: classify/glyph/format/time control/interpreters on top of the base */
export function createFakeApiV1(overrides: Partial<WadjetApi> = {}) {
  const fake = createFakeApi();
  const { interpreters } = fake;
  Object.assign(fake.api, {
    version: "1.0.0",
    apiVersion: 1,
    classify: () => ({
      beaufort: 3, beaufortLabel: "Gentle breeze", compass: "WSW", oktas: 8,
      visibility: "moderate", precipitation: "light", frozenPrecipitation: true, feelsLike: { mean: -1 },
    }),
    glyph: () => '<svg viewBox="0 0 24 24"></svg>',
    glyphKey: () => "sleet",
    format: (day: number) => `Firstday ${day}`,
    canSetNow: () => true,
    advance: () => Promise.resolve(true),
    registerInterpreter: (interpreter: WadjetInterpreter) => {
      if (interpreters.some(i => i.id === interpreter.id)) {
        throw Object.assign(new Error("duplicate"), { code: "wadjet-duplicate-id" });
      }
      interpreters.push(interpreter);
      return () => {
        const index = interpreters.indexOf(interpreter);
        if (index >= 0) interpreters.splice(index, 1);
      };
    },
    listInterpreters: (facet?: string) => interpreters
      .filter(i => facet == null || i.facet === facet)
      .map(({ id, label, facet: f, description }) => ({ id, label, facet: f, description })),
    interpret: (id: string, report: WadjetWeatherReport, options?: Record<string, unknown>) => {
      const interpreter = interpreters.find(i => i.id === id);
      if (interpreter == null) throw new RangeError(`Unknown interpreter "${id}".`);
      return interpreter.interpret(report, {
        zoneId: report.zoneId,
        classification: (fake.api.classify as (r: WadjetWeatherReport) => never)(report),
        time: { dayOrdinal: report.dayOrdinal, yearPhase: 0, yearLength: 365, source: "internal" },
        options,
      });
    },
  }, overrides);
  return fake;
}

/** An app double with a workspace event bus and a plugin registry */
export function createFakeApp() {
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
  const trigger = (name: string) => { for (const h of [...handlers.values()]) if (h.name === name) h.cb(); };
  return {
    app: app as unknown as App,
    install: (api: WadjetApi | null) => { plugins.wadjet = api != null ? { api } : undefined; },
    triggerReady: () => trigger("wadjet:ready"),
    triggerUnload: () => trigger("wadjet:unload"),
    workspaceHandlerCount: () => handlers.size,
  };
}
