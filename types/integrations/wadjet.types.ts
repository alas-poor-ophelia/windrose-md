/**
 * Wadjet (U+13080 Weather) Consumer Type Definitions
 * Path: types/integrations/wadjet.types.ts
 *
 * The slice of the U+13080 Weather plugin's public API (plugin id `wadjet`)
 * that Windrose reads. Hand-copied from that plugin's docs/API.md at 0.3.1:
 * it ships no types package, and its whole surface is alpha, so every member
 * is re-validated at the boundary (src/weather/wadjetBridge.ts) rather than
 * trusted from these declarations.
 */

/** Precipitation kinds a report can carry */
export type WadjetPrecipType = 'none' | 'drizzle' | 'rain' | 'sleet' | 'snow';

/** One zone's weather for one day (metric, always) */
export interface WadjetWeatherReport {
  schemaVersion: number;
  zoneId: string;
  dayOrdinal: number;
  hour?: number;
  /** Degrees Celsius */
  temperature: { high: number; low: number; mean: number; current?: number };
  /** `intensity` is 0..1 */
  precipitation: { type: WadjetPrecipType; amountMm: number; intensity: number; active?: boolean };
  humidity: number;
  cloudCover: number;
  /** `directionDeg` is where the wind blows from */
  wind: { speedKph: number; directionDeg: number };
  visibilityKm: number;
  regime: string;
  /** Free-form tags — display only, never branch on these */
  conditions: string[];
  /** User-editable words — display only */
  descriptors: { temperature: string; precipitation: string; wind: string; sky: string };
  overridden: boolean;
}

/** The world's current date as the active calendar reports it */
export interface WadjetTimeContext {
  dayOrdinal: number;
  yearLength: number;
  hour?: number;
  source: string;
  year?: number;
  dayOfYear?: number;
}

/** A place another plugin can ask a zone for */
export type WadjetZoneLocator =
  | { kind: 'note'; path: string }
  | { kind: 'hex'; mapId: string; q: number; r: number }
  | { kind: 'point'; mapId: string; x: number; y: number }
  | { kind: 'custom'; namespace: string; data: unknown };

/** Answers "which zone is this place in" for the locator kinds it claims */
export interface WadjetZoneResolver {
  id: string;
  kinds: WadjetZoneLocator['kind'][];
  resolve(locator: WadjetZoneLocator): string | null;
}

export type WadjetEvent = 'ready' | 'profiles-changed' | 'time-changed' | 'adapters-changed';

export interface WadjetZoneSummary {
  id: string;
  name: string;
}

export interface WadjetApi {
  version: string;
  ready: boolean;
  schemaVersion: number;
  getReport(zoneId: string, time: { dayOrdinal: number; hour?: number }): WadjetWeatherReport;
  getRange(zoneId: string, fromDay: number, toDay: number): WadjetWeatherReport[];
  now(): WadjetTimeContext | null;
  listZones(): WadjetZoneSummary[];
  registerZoneResolver(resolver: WadjetZoneResolver): () => void;
  resolveZone(locator: WadjetZoneLocator): string | null;
  describe(report: WadjetWeatherReport, style?: 'short' | 'prose'): string;
  /** The user's display preference; reports themselves are always metric */
  units(): 'metric' | 'imperial';
  on(event: WadjetEvent, cb: () => void): () => void;
}
