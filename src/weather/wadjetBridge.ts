/**
 * wadjetBridge.ts
 *
 * The one point of contact with the U+13080 Weather plugin (id `wadjet`), an
 * optional companion. Every read re-resolves the live API object and
 * degrades to "no weather" when the plugin is absent, disabled, not yet
 * ready, or throws. No reference is held across calls: the plugin builds a
 * new API object each time it is enabled and signals nothing when it unloads.
 */

// Type-only imports
import type { App, Events } from 'obsidian';
import type {
  WadjetApi,
  WadjetEvent,
  WadjetWeatherReport,
  WadjetZoneLocator,
  WadjetZoneSummary,
} from '#types/integrations/wadjet.types';

const WADJET_PLUGIN_ID = 'wadjet';

/** Workspace event the plugin triggers once its settings and zones have loaded */
const WADJET_READY_EVENT = 'wadjet:ready';

/** Resolver id Windrose registers under */
const ZONE_RESOLVER_ID = 'windrose';

const REQUIRED_METHODS = ['getReport', 'now', 'listZones', 'on'] as const;

/** Precipitation kinds this build can draw and cost; a report with any other is unusable */
const KNOWN_PRECIP_TYPES: readonly string[] = ['none', 'drizzle', 'rain', 'sleet', 'snow'];

/**
 * Why a weather subscription fired. 'time' = the world's date moved;
 * 'profiles' = zones or their weather were edited; 'ready' = the weather
 * plugin (re)loaded. The plugin's events carry no payload, so this is all
 * a subscriber gets.
 */
export type WeatherChangeReason = 'time' | 'profiles' | 'ready';

/** Events after which any cached report, day or zone list may be stale */
const WEATHER_CHANGE_EVENTS: { event: WadjetEvent; reason: WeatherChangeReason }[] = [
  { event: 'time-changed', reason: 'time' },
  { event: 'profiles-changed', reason: 'profiles' },
];

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
 * and a precipitation kind this build knows. The weather API is alpha: a
 * new kind or a renamed field must degrade to "no weather", never reach
 * the renderer.
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
 * One zone's weather for a day. Null for a zone the weather plugin no
 * longer has (a binding outlives a deleted zone), an invalid zone profile,
 * or a report missing fields this build reads.
 */
function getZoneReport(api: WadjetApi, zoneId: string, dayOrdinal: number): WadjetWeatherReport | null {
  try {
    const report = api.getReport(zoneId, { dayOrdinal });
    return isUsableReport(report) ? report : null;
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
    const text = typeof api.describe === 'function' ? api.describe(report, 'short') : null;
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

/**
 * Call `onChange` whenever weather, the world's day, or the zone list may
 * have changed — including the weather plugin finishing its load after
 * Windrose (cold start) or being re-enabled. Returns the unsubscribe.
 * Nothing fires when the weather plugin is DISABLED; callers that draw from
 * a cached view must notice that themselves (see useWeather).
 */
function subscribeToWeather(app: App, onChange: (reason: WeatherChangeReason) => void): () => void {
  let unbindApi: (() => void) | null = null;

  const bind = (): void => {
    unbindApi?.();
    unbindApi = null;
    const api = getWadjetApi(app);
    if (api == null) return;
    const offs: (() => void)[] = [];
    for (const { event, reason } of WEATHER_CHANGE_EVENTS) {
      try {
        offs.push(api.on(event, () => onChange(reason)));
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
    onChange('ready');
  });

  return () => {
    workspaceEvents.offref(readyRef);
    unbindApi?.();
  };
}

/**
 * Answer the weather plugin's "which zone is this hex in" for Windrose
 * maps, so anything that asks it by map position (a note, another plugin)
 * gets the zone bound on the map. Re-registers when the weather plugin
 * (re)loads; returns the disposer.
 */
function connectZoneResolver(
  app: App,
  resolveHex: (mapId: string, q: number, r: number) => string | null
): () => void {
  let unregister: (() => void) | null = null;

  const register = (): void => {
    try { unregister?.(); } catch { /* the API object is already gone */ }
    unregister = null;
    const api = getWadjetApi(app);
    if (api == null || typeof api.registerZoneResolver !== 'function') return;
    try {
      unregister = api.registerZoneResolver({
        id: ZONE_RESOLVER_ID,
        kinds: ['hex'],
        resolve: (locator: WadjetZoneLocator) =>
          locator.kind === 'hex' ? resolveHex(locator.mapId, locator.q, locator.r) : null,
      });
    } catch { /* registration refused — weather still works by zone id */ }
  };

  register();
  const workspaceEvents: Events = app.workspace;
  const readyRef = workspaceEvents.on(WADJET_READY_EVENT, register);

  return () => {
    workspaceEvents.offref(readyRef);
    try { unregister?.(); } catch { /* the API object is already gone */ }
  };
}

export {
  getWadjetApi,
  getWeatherDay,
  getZoneReport,
  listWeatherZones,
  describeReport,
  getWeatherUnits,
  subscribeToWeather,
  connectZoneResolver,
};
