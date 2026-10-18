/**
 * wadjetBridge.ts
 *
 * The one point of contact with the U+13080 Weather plugin (id `wadjet`), an
 * optional companion. Every read re-resolves or re-validates the live API
 * object and degrades to "no weather" when the plugin is absent, disabled,
 * not yet ready, unloaded, or throws.
 *
 * Works against every plugin version: 0.3.x (no `apiVersion`, events carry
 * no payload, no unload signal) and apiVersion 1 (payloads, `unload`,
 * classification, glyphs, formatting, time control, interpreters, async
 * zone resolution). New members are feature-detected one by one. Re-enabling
 * the plugin builds a NEW API object and registry, so registrations are
 * replayed on every `wadjet:ready`.
 */

// Type-only imports
import type { App, EventRef, Events } from 'obsidian';
import type {
  WadjetApi,
  WadjetClassification,
  WadjetEvent,
  WadjetInterpreter,
  WadjetInterpreterSummary,
  WadjetWeatherReport,
  WadjetZoneLocator,
  WadjetZoneSummary,
  WeatherReport,
} from '#types/integrations/wadjet.types';

const WADJET_PLUGIN_ID = 'wadjet';

/** Workspace event the plugin triggers once its settings and zones have loaded */
const WADJET_READY_EVENT = 'wadjet:ready';

/** Workspace event the plugin triggers as it unloads (apiVersion 1) */
const WADJET_UNLOAD_EVENT = 'wadjet:unload';

/** Resolver id Windrose registers under */
const ZONE_RESOLVER_ID = 'windrose';

const REQUIRED_METHODS = ['getReport', 'now', 'listZones', 'on'] as const;

/** Precipitation kinds this build can draw and cost; a report with any other is unusable */
const KNOWN_PRECIP_TYPES: readonly string[] = ['none', 'drizzle', 'rain', 'sleet', 'snow'];

/** Widest range one getRange call may ask for (the plugin's own cap) */
const MAX_RANGE_SPAN_DAYS = 3660;

/**
 * Why a weather subscription fired.
 * - time: the world's date moved (`day` = the new current day when the
 *   plugin says so; undefined on 0.3.x)
 * - profiles: zones or their weather were edited (`zoneIds` null = all)
 * - adapters: the active calendar changed (formatting may differ)
 * - ready: the weather plugin (re)loaded — a new API object
 * - unload: the weather plugin is going away; drop everything now
 */
export type WeatherChange =
  | { reason: 'time'; day?: number | null }
  | { reason: 'profiles'; zoneIds: string[] | null }
  | { reason: 'adapters' }
  | { reason: 'ready' }
  | { reason: 'unload' };

// ===========================================
// API access
// ===========================================

/** The live weather API, or null when the plugin is not usable right now */
function getWadjetApi(app: App): WadjetApi | null {
  const appWithPlugins = app as unknown as {
    plugins?: { plugins?: Record<string, { api?: unknown } | undefined> };
  };
  const api = appWithPlugins.plugins?.plugins?.[WADJET_PLUGIN_ID]?.api as Partial<WadjetApi> | null | undefined;
  if (api == null || api.ready !== true) return null;
  for (const method of REQUIRED_METHODS) {
    if (typeof api[method] !== 'function') return null;
  }
  return api as WadjetApi;
}

/** The plugin's API version: 0 for 0.3.x, which predates the field */
function getApiVersion(api: WadjetApi): number {
  const version = api.apiVersion;
  return typeof version === 'number' && Number.isFinite(version) ? version : 0;
}

/** True when the API is version 1+ and has `member` as a function */
function hasV1Method(api: WadjetApi, member: keyof WadjetApi): boolean {
  return getApiVersion(api) >= 1 && typeof api[member] === 'function';
}

/**
 * A report handed back to an apiVersion-1 member. Only reached on v1
 * plugins, whose reports carry `provenance`; the cast just restores the
 * plugin's own type for a report it produced.
 */
function asApiReport(report: WadjetWeatherReport): WeatherReport {
  return report as WeatherReport;
}

// ===========================================
// Reads (never throw)
// ===========================================

/** The world's current day, or null when the active calendar has no date */
function getWeatherDay(api: WadjetApi): number | null {
  try {
    const day = api.now()?.dayOrdinal;
    return typeof day === 'number' && Number.isFinite(day) ? day : null;
  } catch {
    return null;
  }
}

/**
 * True when a report carries every field Windrose reads, as finite numbers
 * and a precipitation kind this build knows. A new kind or a renamed field
 * must degrade to "no weather", never reach the renderer.
 */
function isUsableReport(report: WadjetWeatherReport | null | undefined): report is WadjetWeatherReport {
  return report != null &&
    KNOWN_PRECIP_TYPES.includes(report.precipitation?.type) &&
    Number.isFinite(report.precipitation?.intensity) &&
    Number.isFinite(report.wind?.speedKph) &&
    Number.isFinite(report.temperature?.mean) &&
    Number.isFinite(report.visibilityKm) &&
    Number.isFinite(report.cloudCover);
}

/**
 * One zone's weather for a day (and hour, when given). Null for a zone the
 * weather plugin no longer has, an invalid zone profile, a bad time, or a
 * report missing fields this build reads.
 */
function getZoneReport(api: WadjetApi, zoneId: string, dayOrdinal: number, hour?: number | null): WadjetWeatherReport | null {
  if (!Number.isInteger(dayOrdinal)) return null;
  try {
    const time = hour != null ? { dayOrdinal, hour } : { dayOrdinal };
    const report = api.getReport(zoneId, time);
    return isUsableReport(report) ? report : null;
  } catch {
    return null;
  }
}

/**
 * One zone's daily reports from `fromDay` to `toDay` inclusive, in one call.
 * Unusable reports are dropped. Null when the plugin has no getRange or it
 * throws, so the caller can fall back to per-day reads.
 */
function getZoneRange(api: WadjetApi, zoneId: string, fromDay: number, toDay: number): WadjetWeatherReport[] | null {
  if (!Number.isInteger(fromDay) || !Number.isInteger(toDay) || fromDay > toDay) return [];
  if (toDay - fromDay > MAX_RANGE_SPAN_DAYS) return [];
  if (typeof api.getRange !== 'function') return null;
  try {
    const reports = api.getRange(zoneId, fromDay, toDay);
    return Array.isArray(reports) ? reports.filter(isUsableReport) : null;
  } catch {
    return null;
  }
}

function listWeatherZones(api: WadjetApi): WadjetZoneSummary[] {
  try {
    return api.listZones().filter(zone => typeof zone?.id === 'string' && typeof zone?.name === 'string');
  } catch {
    return [];
  }
}

/** The weather plugin's own one-line wording for a report, or null if it has none */
function describeReport(api: WadjetApi, report: WadjetWeatherReport): string | null {
  try {
    const text = typeof api.describe === 'function' ? api.describe(asApiReport(report), 'short') : null;
    return typeof text === 'string' && text !== '' ? text : null;
  } catch {
    return null;
  }
}

/** The weather plugin's display-unit preference (metric when it does not say) */
function getWeatherUnits(api: WadjetApi): 'metric' | 'imperial' {
  try {
    return typeof api.units === 'function' && api.units() === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

/** The plugin's classification of a report (apiVersion 1), or null */
function classifyWithApi(api: WadjetApi, report: WadjetWeatherReport): WadjetClassification | null {
  if (!hasV1Method(api, 'classify')) return null;
  try {
    const result = api.classify?.(asApiReport(report));
    return result != null && Number.isFinite(result.beaufort) && typeof result.compass === 'string' &&
      Number.isFinite(result.feelsLike?.mean) ? result : null;
  } catch {
    return null;
  }
}

/** The plugin's SVG glyph for a report (apiVersion 1), or null */
function glyphWithApi(api: WadjetApi, report: WadjetWeatherReport): string | null {
  if (!hasV1Method(api, 'glyph')) return null;
  try {
    const svg = api.glyph?.(asApiReport(report));
    return typeof svg === 'string' && svg.trim().startsWith('<svg') ? svg : null;
  } catch {
    return null;
  }
}

/** The active calendar's label for a day (apiVersion 1), or null */
function formatDayWithApi(api: WadjetApi, dayOrdinal: number): string | null {
  if (!hasV1Method(api, 'format')) return null;
  try {
    const text = api.format?.(dayOrdinal);
    return typeof text === 'string' && text !== '' ? text : null;
  } catch {
    return null;
  }
}

/** True when the active calendar lets the date be moved (apiVersion 1) */
function canAdvanceWeather(api: WadjetApi): boolean {
  if (!hasV1Method(api, 'canSetNow') || !hasV1Method(api, 'advance')) return false;
  try {
    return api.canSetNow?.() === true;
  } catch {
    return false;
  }
}

/** Move the world's date by whole days; false when refused or unsupported */
async function advanceWeather(api: WadjetApi, days: number): Promise<boolean> {
  if (!Number.isInteger(days) || !canAdvanceWeather(api)) return false;
  try {
    return (await api.advance?.(days)) === true;
  } catch {
    return false;
  }
}

/**
 * Run a registered interpreter (apiVersion 1). Returns `{ ok: false }` when
 * the API has no interpreters, the id is unknown, or the interpreter throws;
 * the result itself is the caller's to validate.
 */
function interpretWithApi(
  api: WadjetApi,
  interpreterId: string,
  report: WadjetWeatherReport,
  options?: Record<string, unknown>
): { ok: true; value: unknown } | { ok: false } {
  if (!hasV1Method(api, 'interpret')) return { ok: false };
  try {
    return { ok: true, value: api.interpret?.(interpreterId, asApiReport(report), options) };
  } catch {
    return { ok: false };
  }
}

/** Interpreters registered for a facet, or [] when the API has none */
function listInterpreters(app: App, facet: string): WadjetInterpreterSummary[] {
  const api = getWadjetApi(app);
  if (api == null || !hasV1Method(api, 'listInterpreters')) return [];
  try {
    const list = api.listInterpreters?.(facet) ?? [];
    return list.filter(entry => typeof entry?.id === 'string' && typeof entry?.label === 'string');
  } catch {
    return [];
  }
}

// ===========================================
// Events
// ===========================================

function payloadField(payload: unknown, key: string): unknown {
  return payload != null && typeof payload === 'object' ? (payload as Record<string, unknown>)[key] : undefined;
}

/** A time-changed payload's new day: number/null when stated, undefined on 0.3.x */
function payloadDay(payload: unknown): number | null | undefined {
  const current = payloadField(payload, 'current');
  if (current === null) return null;
  return typeof current === 'number' && Number.isFinite(current) ? current : undefined;
}

/** A profiles-changed payload's zone ids, or null for "all" / no payload */
function payloadZoneIds(payload: unknown): string[] | null {
  if (payloadField(payload, 'all') === true) return null;
  const ids = payloadField(payload, 'zoneIds');
  return Array.isArray(ids) && ids.every(id => typeof id === 'string') ? ids : null;
}

/**
 * Call `onChange` whenever weather, the world's day, the calendar or the
 * zone list may have changed, and when the weather plugin loads late,
 * is re-enabled (`ready`) or unloads (`unload`). Payloads are read when the
 * plugin sends them (apiVersion 1) and ignored otherwise. Returns the
 * unsubscribe. A 0.3.x plugin signals nothing when it is disabled; callers
 * holding a view must notice that themselves (see WeatherStoreCore).
 */
function subscribeToWeather(app: App, onChange: (change: WeatherChange) => void): () => void {
  let unbindApi: (() => void) | null = null;

  const unbind = (): void => {
    const off = unbindApi;
    unbindApi = null;
    off?.();
  };

  const bind = (): void => {
    unbind();
    const api = getWadjetApi(app);
    if (api == null) return;
    const handlers: [WadjetEvent, (payload?: unknown) => void][] = [
      ['time-changed', payload => onChange({ reason: 'time', day: payloadDay(payload) })],
      ['profiles-changed', payload => onChange({ reason: 'profiles', zoneIds: payloadZoneIds(payload) })],
      ['adapters-changed', () => onChange({ reason: 'adapters' })],
      ['unload', () => {
        unbind();
        onChange({ reason: 'unload' });
      }],
    ];
    const offs: (() => void)[] = [];
    for (const [event, handler] of handlers) {
      try {
        offs.push(api.on(event, handler));
      } catch { /* event unknown to this plugin version */ }
    }
    unbindApi = () => {
      for (const off of offs) {
        try { off(); } catch { /* the API object is already gone */ }
      }
    };
  };

  bind();
  const workspaceEvents: Events = app.workspace;
  const readyRef = workspaceEvents.on(WADJET_READY_EVENT, () => {
    bind();
    onChange({ reason: 'ready' });
  });
  const unloadRef = workspaceEvents.on(WADJET_UNLOAD_EVENT, () => {
    unbind();
    onChange({ reason: 'unload' });
  });

  return () => {
    workspaceEvents.offref(readyRef);
    workspaceEvents.offref(unloadRef);
    unbind();
  };
}

// ===========================================
// Registrations (replayed per API object)
// ===========================================

/**
 * Keep one registration alive on whichever API object is current: register
 * now if the plugin is up, again after every `wadjet:ready` (re-enable
 * builds a new registry), drop the handle on `wadjet:unload`. `register`
 * returns its unregister, or null when it declined. Returns the disposer.
 */
function connectOnReady(app: App, register: (api: WadjetApi) => (() => void) | null): () => void {
  let unregister: (() => void) | null = null;

  const release = (): void => {
    const off = unregister;
    unregister = null;
    try { off?.(); } catch { /* the API object is already gone */ }
  };

  const attach = (): void => {
    release();
    const api = getWadjetApi(app);
    if (api == null) return;
    try {
      unregister = register(api);
    } catch {
      unregister = null; /* registration refused — weather still works by zone id */
    }
  };

  attach();
  const workspaceEvents: Events = app.workspace;
  const refs: EventRef[] = [
    workspaceEvents.on(WADJET_READY_EVENT, attach),
    workspaceEvents.on(WADJET_UNLOAD_EVENT, release),
  ];

  return () => {
    for (const ref of refs) workspaceEvents.offref(ref);
    release();
  };
}

/** What Windrose answers for the weather plugin's zone resolver chain */
export interface WindroseZoneAnswers {
  /** Synchronous answer for hex and Windrose region locators on open maps */
  resolve(locator: WadjetZoneLocator): string | null;
  /** May load a map that is not open */
  resolveAsync(locator: WadjetZoneLocator): Promise<string | null>;
}

/**
 * Answer the weather plugin's "which zone is this place in" for Windrose
 * maps: `hex` locators and the `windrose.region` custom locator. Re-registers
 * when the weather plugin (re)loads; returns the disposer.
 */
function connectZoneResolver(app: App, answers: WindroseZoneAnswers): () => void {
  return connectOnReady(app, api => {
    if (typeof api.registerZoneResolver !== 'function') return null;
    return api.registerZoneResolver({
      id: ZONE_RESOLVER_ID,
      kinds: ['hex', 'custom'],
      resolve: locator => answers.resolve(locator),
      resolveAsync: locator => answers.resolveAsync(locator),
    });
  });
}

/**
 * Register an interpreter on the weather plugin's registry (apiVersion 1),
 * replayed after every re-enable, removed on dispose.
 */
function connectInterpreter<T>(app: App, interpreter: WadjetInterpreter<T>): () => void {
  return connectOnReady(app, api => {
    if (!hasV1Method(api, 'registerInterpreter')) return null;
    return api.registerInterpreter?.(interpreter as WadjetInterpreter) ?? null;
  });
}

export {
  getWadjetApi,
  getApiVersion,
  getWeatherDay,
  getZoneReport,
  getZoneRange,
  listWeatherZones,
  describeReport,
  getWeatherUnits,
  classifyWithApi,
  glyphWithApi,
  formatDayWithApi,
  canAdvanceWeather,
  advanceWeather,
  interpretWithApi,
  listInterpreters,
  subscribeToWeather,
  connectZoneResolver,
  connectInterpreter,
};
