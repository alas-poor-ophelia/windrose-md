/**
 * weatherStore.ts
 *
 * The framework-free core of the per-map weather store: ONE subscription to
 * the weather plugin per mounted map, a report cache keyed on
 * (zone, day, hour), the view time the Almanac scrubs, and passthroughs to
 * the plugin's apiVersion-1 members with local fallbacks for 0.3.x.
 * WeatherProvider (src/context/WeatherContext.tsx) wraps it for Preact and
 * adds the map's weather areas.
 *
 * Invalidation: profiles-changed clears the named zones (apiVersion 1
 * payload) or everything; time-changed re-reads the day from the API and
 * clears everything only when the day moved; adapters-changed clears
 * everything; unload drops the API at once (unavailable); wadjet:ready
 * rebinds to the new API object. A 0.3.x plugin says nothing when it is
 * disabled, so reads also notice a vanished API and go unavailable. A
 * change of the "Weather travel rules" setting bumps the version (nothing
 * cached depends on it) so open maps re-cost their routes.
 */

// Type-only imports
import type { App } from 'obsidian';
import type {
  WadjetApi,
  WadjetClassification,
  WadjetWeatherReport,
  WadjetZoneSummary,
} from '#types/integrations/wadjet.types';
import type { WeatherTravelResult, WeatherViewTime } from '#types/contexts/weather.types';
import type { WeatherChange } from './wadjetBridge';
import type { GroundDay, GroundPrecipType, GroundState } from './groundState';

import {
  advanceWeather,
  canAdvanceWeather,
  classifyWithApi,
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
  listWeatherZones,
  subscribeToWeather,
} from './wadjetBridge';
import { classifyLocally, describeLocally } from './weatherClassify';
import { WINDROSE_TRAVEL_INTERPRETER_ID, interpretTravelLocally, normalizeTravelResult } from './travelInterpreter';
import { deriveGroundState } from './groundState';

/** The store's plain state; a new object after every change */
interface WeatherStoreSnapshot {
  available: boolean;
  apiVersion: number;
  zones: WadjetZoneSummary[];
  units: 'metric' | 'imperial';
  today: number | null;
  viewTime: WeatherViewTime;
  canAdvance: boolean;
  version: number;
}

interface WeatherStoreCoreOptions {
  /** The "Weather travel rules" interpreter id, read at call time */
  getTravelInterpreterId?: () => string;
  /** Deferred-work scheduler (batching, liveness checks); default queueMicrotask */
  schedule?: (task: () => void) => void;
}

const MAX_RANGE_SPAN_DAYS = 3660;
const DAILY = 'd';
/**
 * Days of daily history (the target day included) ground state is derived
 * from. 45 days keeps a season's snowpack (a cold month of accumulation and
 * the thaw after it) without walking the whole year. Cheap: the history is
 * read through the per-day report cache, so consecutive days (a week strip,
 * a forecast walk) fetch only the days not seen yet, in one range call.
 */
const GROUND_HISTORY_DAYS = 45;

const GROUND_PRECIP_TYPES: ReadonlySet<string> = new Set<GroundPrecipType>(['none', 'drizzle', 'rain', 'sleet', 'snow']);

/** A daily report as one step of the ground-state model */
function groundDayFromReport(report: WadjetWeatherReport): GroundDay {
  const type = report.precipitation?.type;
  return {
    dayOrdinal: report.dayOrdinal,
    precipType: typeof type === 'string' && GROUND_PRECIP_TYPES.has(type) ? type : 'none',
    amountMm: report.precipitation?.amountMm ?? 0,
    tempMeanC: report.temperature?.mean ?? Number.NaN,
    tempHighC: report.temperature?.high ?? Number.NaN,
    windKph: report.wind?.speedKph ?? 0,
    humidity: report.humidity,
  };
}

class WeatherStoreCore {
  private readonly app: App;
  private readonly getTravelInterpreterId: () => string;
  private readonly schedule: (task: () => void) => void;

  private api: WadjetApi | null = null;
  private snapshot: WeatherStoreSnapshot;
  /** zoneId → (day|hour key → report or null) */
  private reports = new Map<string, Map<string, WadjetWeatherReport | null>>();
  /** zoneId → (from:to → reports) */
  private ranges = new Map<string, Map<string, WadjetWeatherReport[]>>();
  /** zoneId → (day → derived ground state or null) */
  private grounds = new Map<string, Map<number, GroundState | null>>();
  private dayLabels = new Map<number, string>();
  private classifications = new WeakMap<WadjetWeatherReport, WadjetClassification>();
  private glyphs = new WeakMap<WadjetWeatherReport, string | null>();
  private listeners = new Set<() => void>();
  private notifyPending = false;
  private livenessCheckPending = false;
  private stopSubscription: (() => void) | null = null;
  /** The travel interpreter id the last published version was costed with */
  private travelInterpreterId: string;

  constructor(app: App, options: WeatherStoreCoreOptions = {}) {
    this.app = app;
    this.getTravelInterpreterId = options.getTravelInterpreterId ?? (() => WINDROSE_TRAVEL_INTERPRETER_ID);
    this.schedule = options.schedule ?? (task => queueMicrotask(task));
    this.travelInterpreterId = this.getTravelInterpreterId();
    this.snapshot = {
      available: false, apiVersion: 0, zones: [], units: 'metric', today: null,
      viewTime: { dayOffset: 0, hour: null }, canAdvance: false, version: 0,
    };
  }

  // ===========================================
  // Lifecycle
  // ===========================================

  /** Bind to the weather plugin and follow it; returns the stop */
  start(): () => void {
    this.stopSubscription?.();
    this.rebind();
    this.stopSubscription = subscribeToWeather(this.app, change => this.handleChange(change));
    return () => this.stop();
  }

  stop(): void {
    this.stopSubscription?.();
    this.stopSubscription = null;
    this.listeners.clear();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  getSnapshot(): WeatherStoreSnapshot {
    return this.snapshot;
  }

  // ===========================================
  // Change handling
  // ===========================================

  private handleChange(change: WeatherChange): void {
    switch (change.reason) {
      case 'ready':
        this.rebind();
        this.publish();
        return;
      case 'unload':
        this.goUnavailable();
        return;
      case 'time': {
        if (this.api == null) return;
        // Always re-read the day: a payload's current day may come from a
        // calendar adapter that is not the active one. 0.3.x fires on clock
        // ticks too; reports are per day, so a change inside the same day
        // changes nothing (no cache clear, no republish).
        const today = getWeatherDay(this.api);
        const canAdvance = canAdvanceWeather(this.api);
        if (today === this.snapshot.today) {
          if (canAdvance !== this.snapshot.canAdvance) this.update({ canAdvance });
          return;
        }
        this.clearCaches();
        this.update({ today, canAdvance });
        return;
      }
      case 'profiles':
        if (this.api == null) return;
        if (change.zoneIds == null || this.snapshot.apiVersion < 1) {
          this.reports.clear();
          this.ranges.clear();
          this.grounds.clear();
        } else {
          for (const zoneId of change.zoneIds) {
            this.reports.delete(zoneId);
            this.ranges.delete(zoneId);
            this.grounds.delete(zoneId);
          }
        }
        this.update({ zones: listWeatherZones(this.api) });
        return;
      case 'adapters':
        if (this.api == null) return;
        this.clearCaches();
        this.update({ today: getWeatherDay(this.api), canAdvance: canAdvanceWeather(this.api) });
        return;
    }
  }

  /** Re-read everything from the current live API object (or none) */
  private rebind(): void {
    this.clearCaches();
    const api = getWadjetApi(this.app);
    this.api = api;
    if (api == null) {
      this.snapshot = { ...this.snapshot, available: false, apiVersion: 0, zones: [], today: null, canAdvance: false };
      return;
    }
    this.snapshot = {
      ...this.snapshot,
      available: true,
      apiVersion: getApiVersion(api),
      zones: listWeatherZones(api),
      units: getWeatherUnits(api),
      today: getWeatherDay(api),
      canAdvance: canAdvanceWeather(api),
    };
  }

  private goUnavailable(): void {
    if (this.api == null && !this.snapshot.available) return;
    this.api = null;
    this.clearCaches();
    this.update({ available: false, apiVersion: 0, zones: [], today: null, canAdvance: false });
  }

  private clearCaches(): void {
    this.reports.clear();
    this.ranges.clear();
    this.grounds.clear();
    this.dayLabels.clear();
    this.classifications = new WeakMap();
    this.glyphs = new WeakMap();
  }

  private update(patch: Partial<WeatherStoreSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    this.publish();
  }

  /** Bump the version and tell listeners now */
  private publish(): void {
    this.notifyPending = false;
    this.snapshot = { ...this.snapshot, version: this.snapshot.version + 1 };
    for (const listener of [...this.listeners]) listener();
  }

  /** Bump once at the end of the current tick, however many changes land in it */
  private publishSoon(): void {
    if (this.notifyPending) return;
    this.notifyPending = true;
    this.schedule(() => {
      if (this.notifyPending) this.publish();
    });
  }

  /**
   * The bound API if it is still the live one. A 0.3.x plugin disabled
   * without a signal leaves a dead object: reads return nothing at once and
   * the store goes unavailable (or rebinds) right after.
   */
  private liveApi(): WadjetApi | null {
    const api = this.api;
    if (api == null) return null;
    const live = getWadjetApi(this.app);
    if (live === api) return api;
    if (!this.livenessCheckPending) {
      this.livenessCheckPending = true;
      this.schedule(() => {
        this.livenessCheckPending = false;
        const current = getWadjetApi(this.app);
        if (current === this.api) return;
        if (current == null) this.goUnavailable();
        else {
          this.rebind();
          this.publish();
        }
      });
    }
    return null;
  }

  /**
   * Plugin settings changed: when the "Weather travel rules" interpreter is
   * a different one, bump the version so open maps re-cost. Nothing cached
   * depends on the interpreter, so no cache is cleared.
   */
  noteSettingsChanged(): void {
    const id = this.getTravelInterpreterId();
    if (id === this.travelInterpreterId) return;
    this.travelInterpreterId = id;
    this.publish();
  }

  // ===========================================
  // View time
  // ===========================================

  setViewTime(t: Partial<WeatherViewTime>): void {
    const dayOffset = t.dayOffset !== undefined && Number.isInteger(t.dayOffset) ? t.dayOffset : this.snapshot.viewTime.dayOffset;
    const hour = t.hour === undefined
      ? this.snapshot.viewTime.hour
      : t.hour === null ? null : Number.isFinite(t.hour) && t.hour >= 0 && t.hour < 24 ? t.hour : this.snapshot.viewTime.hour;
    const current = this.snapshot.viewTime;
    if (dayOffset === current.dayOffset && hour === current.hour) return;
    this.snapshot = { ...this.snapshot, viewTime: { dayOffset, hour } };
    this.publishSoon();
  }

  // ===========================================
  // Reads
  // ===========================================

  report(zoneId: string, day: number, hour?: number | null): WadjetWeatherReport | null {
    const api = this.liveApi();
    if (api == null || typeof zoneId !== 'string' || !Number.isInteger(day)) return null;
    const hourKey = hour ?? DAILY;
    if (hourKey !== DAILY && !(Number.isFinite(hourKey) && hourKey >= 0 && hourKey < 24)) return null;
    const key = `${day}|${hourKey}`;
    let zone = this.reports.get(zoneId);
    if (zone == null) {
      zone = new Map();
      this.reports.set(zoneId, zone);
    }
    let report = zone.get(key);
    if (report === undefined) {
      report = getZoneReport(api, zoneId, day, hour ?? null);
      zone.set(key, report);
    }
    return report;
  }

  range(zoneId: string, from: number, to: number): WadjetWeatherReport[] {
    const api = this.liveApi();
    if (api == null || !Number.isInteger(from) || !Number.isInteger(to) || from > to || to - from > MAX_RANGE_SPAN_DAYS) return [];
    const key = `${from}:${to}`;
    let zone = this.ranges.get(zoneId);
    if (zone == null) {
      zone = new Map();
      this.ranges.set(zoneId, zone);
    }
    const cached = zone.get(key);
    if (cached != null) return cached;

    let reports = getZoneRange(api, zoneId, from, to);
    if (reports != null) {
      // Seed the daily cache so report() for those days is free
      let daily = this.reports.get(zoneId);
      if (daily == null) {
        daily = new Map();
        this.reports.set(zoneId, daily);
      }
      for (const report of reports) daily.set(`${report.dayOrdinal}|${DAILY}`, report);
    } else {
      reports = [];
      for (let day = from; day <= to; day++) {
        const report = this.report(zoneId, day);
        if (report != null) reports.push(report);
      }
    }
    zone.set(key, reports);
    return reports;
  }

  /**
   * Windrose's ground state (snow cover, mud) on `day`, derived from the
   * zone's daily reports over the GROUND_HISTORY_DAYS days ending on it.
   * Cached per (zone, day) and cleared with the report cache; null when
   * the plugin is unavailable or the zone has no reports.
   */
  ground(zoneId: string, day: number): GroundState | null {
    if (typeof zoneId !== 'string' || !Number.isInteger(day)) return null;
    if (this.liveApi() == null) return null;
    let zone = this.grounds.get(zoneId);
    const cached = zone?.get(day);
    if (cached !== undefined) return cached;
    const history = this.dailyHistory(zoneId, day - (GROUND_HISTORY_DAYS - 1), day);
    const state = history.length > 0 ? deriveGroundState(history.map(groundDayFromReport)) : null;
    if (zone == null) {
      zone = new Map();
      this.grounds.set(zoneId, zone);
    }
    zone.set(day, state);
    return state;
  }

  /**
   * Daily reports from..to read through the per-day cache: only the span of
   * days not cached yet is fetched (one range call), so sliding the window
   * by a day reads one new day.
   */
  private dailyHistory(zoneId: string, from: number, to: number): WadjetWeatherReport[] {
    const known = this.reports.get(zoneId);
    let firstMissing: number | null = null;
    let lastMissing: number | null = null;
    for (let day = from; day <= to; day++) {
      if (known?.get(`${day}|${DAILY}`) === undefined) {
        firstMissing ??= day;
        lastMissing = day;
      }
    }
    if (firstMissing != null && lastMissing != null) {
      const fetched = this.range(zoneId, firstMissing, lastMissing);
      // The span's range entry is not worth keeping: its days are now cached
      this.ranges.get(zoneId)?.delete(`${firstMissing}:${lastMissing}`);
      // Days the plugin skipped are known to have no report
      const seeded = this.reports.get(zoneId);
      if (seeded != null) {
        const got = new Set(fetched.map(report => report.dayOrdinal));
        for (let day = firstMissing; day <= lastMissing; day++) {
          const key = `${day}|${DAILY}`;
          if (!got.has(day) && seeded.get(key) === undefined) seeded.set(key, null);
        }
      }
    }
    const daily = this.reports.get(zoneId);
    const reports: WadjetWeatherReport[] = [];
    for (let day = from; day <= to; day++) {
      const report = daily?.get(`${day}|${DAILY}`);
      if (report != null) reports.push(report);
    }
    return reports;
  }

  classify(report: WadjetWeatherReport): WadjetClassification {
    const cached = this.classifications.get(report);
    if (cached != null) return cached;
    const api = this.liveApi();
    const result = (api != null ? classifyWithApi(api, report) : null) ?? classifyLocally(report);
    this.classifications.set(report, result);
    return result;
  }

  glyphSvg(report: WadjetWeatherReport): string | null {
    const cached = this.glyphs.get(report);
    if (cached !== undefined) return cached;
    const api = this.liveApi();
    const svg = api != null ? glyphWithApi(api, report) : null;
    this.glyphs.set(report, svg);
    return svg;
  }

  formatDay(day: number): string {
    const cached = this.dayLabels.get(day);
    if (cached != null) return cached;
    const api = this.liveApi();
    const label = (api != null ? formatDayWithApi(api, day) : null) ?? `Day ${day}`;
    if (api != null) this.dayLabels.set(day, label);
    return label;
  }

  describe(report: WadjetWeatherReport): string {
    const api = this.liveApi();
    return (api != null ? describeReport(api, report) : null) ?? describeLocally(report);
  }

  async advance(days: number): Promise<boolean> {
    const api = this.liveApi();
    if (api == null || !this.snapshot.canAdvance) return false;
    return advanceWeather(api, days);
  }

  /**
   * Travel effect of a report under the selected interpreter. Windrose's
   * own id runs locally (same result, no round trip); any other id goes
   * through api.interpret and falls back to Windrose's rules when the API
   * is old, the id is unknown or the interpreter throws. A third-party
   * result without a usable factor counts as no effect (factor 1): the
   * selected rules answered, so Windrose's own rules do not overrule them.
   *
   * Every interpreter receives the options `{ ground }`: the report's zone's
   * ground state on its day (Windrose's convention; see travelInterpreter.ts).
   * A caller's own `ground` in `ctx` wins.
   */
  interpretTravel(report: WadjetWeatherReport, ctx?: Record<string, unknown>): WeatherTravelResult {
    const ground = this.ground(report.zoneId, report.dayOrdinal);
    const options: Record<string, unknown> | undefined = ground != null ? { ground, ...ctx } : ctx;
    return this.interpretWithOptions(report, options);
  }

  private interpretWithOptions(report: WadjetWeatherReport, ctx?: Record<string, unknown>): WeatherTravelResult {
    const id = this.getTravelInterpreterId();
    if (id !== '' && id !== WINDROSE_TRAVEL_INTERPRETER_ID) {
      const api = this.liveApi();
      if (api != null) {
        const outcome = interpretWithApi(api, id, report, ctx);
        if (outcome.ok) {
          const result = normalizeTravelResult(outcome.value);
          return result ?? { speedMultiplier: 1 };
        }
      }
    }
    return interpretTravelLocally(report, ctx);
  }
}

export { WeatherStoreCore };
