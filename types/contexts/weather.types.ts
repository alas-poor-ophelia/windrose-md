/**
 * Weather store types (WeatherProvider / useWeatherStore).
 *
 * One store per mounted map instance; every weather consumer (layers,
 * panels, toolbars, measure tool, the Almanac, the Sky) reads it instead of
 * subscribing to the weather plugin itself.
 */

import type { WadjetClassification, WadjetReport, WadjetZoneSummary } from '#types/integrations/wadjet.types';

/** The view's position in time, independent of the weather plugin's calendar */
export interface WeatherViewTime {
  /** Days from the world's current day (0 = today) */
  dayOffset: number;
  /** Hour of day for hourly reports, or null for the daily report */
  hour: number | null;
}

/**
 * A place on the current map that has weather: a bound region, or the whole
 * map (the map-level zone, inherited by sub-hex levels from the parent hex).
 * Cells are hex axial {x:q, y:r} or grid {x:col, y:row}.
 */
export interface WeatherArea {
  /** `region:<regionId>` or `map` */
  id: string;
  kind: 'region' | 'map';
  zoneId: string;
  name: string;
  cells: Array<{ x: number; y: number }> | 'all';
  regionId?: string;
}

/** Windrose's "travel" interpreter result: a SPEED factor (see src/weather/travelInterpreter.ts) */
export interface WeatherTravelResult {
  speedMultiplier: number;
  label?: string;
}

export interface WeatherStore {
  /** The weather plugin is present, enabled, ready and not unloaded */
  available: boolean;
  /** 0 when the plugin predates apiVersion (0.3.x) */
  apiVersion: number;
  zones: WadjetZoneSummary[];
  /** The weather plugin's display-unit preference */
  units: 'metric' | 'imperial';
  /** api.now()?.dayOrdinal; null when the calendar has no current day */
  today: number | null;
  viewTime: WeatherViewTime;
  /** Batched: several calls in one tick produce one update */
  setViewTime(t: Partial<WeatherViewTime>): void;
  /** today + viewTime.dayOffset; null without a current day */
  viewDay: number | null;
  /** Bound regions (topmost first) then the map-level area */
  areas: WeatherArea[];
  areaAt(cell: { x: number; y: number }): WeatherArea | null;
  /** Cached per (zone, day, hour); null when unavailable or unusable; never throws */
  report(zoneId: string, day: number, hour?: number | null): WadjetReport | null;
  /** Daily reports from..to inclusive, cached; [] when unavailable; never throws */
  range(zoneId: string, from: number, to: number): WadjetReport[];
  /** api.classify on apiVersion 1, else a local fallback */
  classify(report: WadjetReport): WadjetClassification;
  /** api.glyph SVG on apiVersion 1, else null */
  glyphSvg(report: WadjetReport): string | null;
  /** api.format, else `Day N` */
  formatDay(day: number): string;
  /** The plugin's short wording, else a local one */
  describe(report: WadjetReport): string;
  /** The active calendar can move its date (apiVersion 1) */
  canAdvance: boolean;
  /** Move the world's date; false when refused or unsupported */
  advance(days: number): Promise<boolean>;
  /** The selected "Weather travel rules" interpreter, falling back to Windrose's rules */
  interpretTravel(report: WadjetReport, ctx?: Record<string, unknown>): WeatherTravelResult;
  /** Bumps whenever anything above changes (use as a memo dependency) */
  version: number;
}
