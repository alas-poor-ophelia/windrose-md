/**
 * Wadjet (U+13080 Weather) Consumer Type Definitions
 * Path: types/integrations/wadjet.types.ts
 *
 * mirrors U+13080 types/wadjet.d.ts (apiVersion 1)
 *
 * Everything from the next banner down to "WINDROSE TOLERANCE LAYER" is a
 * verbatim copy of the weather plugin's published declaration file. Never
 * imported from the weather plugin's repo at build time; re-copy when its
 * apiVersion bumps.
 *
 * Windrose also runs against 0.3.x plugins (no `apiVersion`, no payloads,
 * no unload signal), so the bridge (src/weather/wadjetBridge.ts) is typed
 * against `WadjetApi` from the tolerance layer at the bottom: the 0.3 base
 * surface with every apiVersion-1 member optional. Every value is still
 * re-validated at the boundary.
 */

// ===========================================================================
// BEGIN VERBATIM MIRROR OF U+13080 types/wadjet.d.ts (apiVersion 1)
// ===========================================================================

/**
 * U+13080 Weather (plugin id `wadjet`) — public API types.
 *
 * Standalone and dependency-free: copy this file into your plugin and
 * `import type { WadjetAPI } from "./wadjet"`. It describes the object at
 * `app.plugins.plugins.wadjet.api` (also `window.Wadjet`), API version 1.
 * The plugin's own test suite fails if the shipped object stops matching it.
 *
 * Reference: docs/API.md in the plugin repository.
 */

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export type PrecipType = "none" | "drizzle" | "rain" | "sleet" | "snow";
export type Units = "metric" | "imperial";

export interface Provenance {
  worldSeed: string;
  generatorVersion: string;
  rngVersion: string;
  profileHash: string;
  calendarHash: string;
}

/** One zone, one day (optionally one hour). Always metric. */
export interface WeatherReport {
  schemaVersion: 0;
  zoneId: string;
  dayOrdinal: number;
  hour?: number;

  temperature: { high: number; low: number; mean: number; current?: number };
  precipitation: { type: PrecipType; amountMm: number; intensity: number; active?: boolean };
  humidity: number;
  cloudCover: number;
  wind: { speedKph: number; directionDeg: number };
  visibilityKm: number;

  regime: string;
  conditions: string[];
  /** user-editable words: never switch on them */
  descriptors: { temperature: string; precipitation: string; wind: string; sky: string };

  overridden: boolean;
  provenance: Provenance;
}

/** `convert(report, units)`: unit suffixes dropped from key names. */
export interface ConvertedReport {
  schemaVersion: 0;
  zoneId: string;
  dayOrdinal: number;
  hour?: number;
  temperature: { high: number; low: number; mean: number; current?: number };
  humidity: number;
  cloudCover: number;
  regime: string;
  conditions: string[];
  descriptors: { temperature: string; precipitation: string; wind: string; sky: string };
  overridden: boolean;
  provenance: Provenance;
  units: Units;
  labels: { temperature: string; amount: string; speed: string; distance: string };
  precipitation: { type: PrecipType; amount: number; intensity: number; active?: boolean };
  wind: { speed: number; directionDeg: number };
  visibility: number;
}

// ---------------------------------------------------------------------------
// Classification and glyphs
// ---------------------------------------------------------------------------

/** India Meteorological Department 24-hour rainfall categories, on water-equivalent amountMm. */
export type PrecipitationClass = "none" | "very-light" | "light" | "moderate" | "heavy" | "very-heavy" | "extremely-heavy";
/** Met Office general-public visibility scale. */
export type VisibilityClass = "very-poor" | "poor" | "moderate" | "good" | "very-good" | "excellent";

export interface Classification {
  /** 0..12, WMO Beaufort force from wind.speedKph */
  beaufort: number;
  /** WMO name for the force ("Calm" ... "Hurricane force") */
  beaufortLabel: string;
  /** 16-point compass direction the wind blows from ("WSW") */
  compass: string;
  /** 0..8 WMO oktas from cloudCover */
  oktas: number;
  visibility: VisibilityClass;
  precipitation: PrecipitationClass;
  /** sleet or snow */
  frozenPrecipitation: boolean;
  /** apparent temperature, °C rounded to 0.1 */
  feelsLike: { mean: number; current?: number };
}

export type GlyphKey = "clear" | "partly-cloudy" | "cloudy" | "overcast" | "fog" | "drizzle" | "rain" | "heavy-rain" | "sleet" | "snow" | "heavy-snow" | "windy";

// ---------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------

export interface TimeContext {
  /** integer; days since the world epoch, may be negative */
  dayOrdinal: number;
  /** [0, 1) */
  yearPhase: number;
  yearLength: number;
  /** [0, 24) */
  hour?: number;
  dayOfYear?: number;
  year?: number;
  moons?: Array<{ name: string; phase: number }>;
  tags?: string[];
  /** the adapter id */
  source: string;
}

export interface CalendarDescription {
  label: string;
  /** governs Wadjet's own editing UIs only; `canSetNow()` is separate */
  readOnly: boolean;
  yearLength: number;
  epochYear?: number;
  seasons: Array<{ name: string; from: number }>;
  moons: Array<{ name: string; cycleDays: number; phaseAtEpoch?: number; phases?: Array<{ name: string; at: number }> }>;
  editHint?: string;
}

/** A calendar plugin implements this and calls `registerTimeAdapter`. */
export interface TimeAdapter {
  id: string;
  now: () => TimeContext | null;
  /** MUST be O(1)/O(log n); MUST extrapolate (not throw) outside the calendar's defined range */
  toContext: (dayOrdinal: number) => TimeContext;
  configHash: () => string;
  parse?: (text: string) => number | null;
  format?: (dayOrdinal: number) => string;
  describe?: () => CalendarDescription;
  /** present = other plugins may move this calendar's current day through `setNow`/`advance` */
  setNow?: (dayOrdinal: number) => void | Promise<void>;
  /** call `cb` when the calendar's own current day changes; return an unsubscribe function */
  subscribe?: (cb: () => void) => () => void;
}

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/**
 * `hex`: axial q, r in the map's own axial system. Map regions use
 * `{ kind: "custom", namespace: "<plugin>.region", data: { mapId, regionId } }`.
 */
export type ZoneLocator = { kind: "note"; path: string } | { kind: "hex"; mapId: string; q: number; r: number } | { kind: "point"; mapId: string; x: number; y: number } | { kind: "custom"; namespace: string; data: unknown };

/** At least one of `resolve` / `resolveAsync` is required. */
export interface ZoneResolver {
  id: string;
  kinds: ZoneLocator["kind"][];
  resolve?: (locator: ZoneLocator) => string | null;
  /** used by `resolveZoneAsync` only; 2000 ms budget */
  resolveAsync?: (locator: ZoneLocator) => Promise<string | null>;
}

// ---------------------------------------------------------------------------
// Interpreters
// ---------------------------------------------------------------------------

export interface InterpretContext {
  zoneId: string;
  classification: Classification;
  /** `timeAt(report.dayOrdinal, report.zoneId)`, carrying `report.hour` */
  time: TimeContext;
  options?: Record<string, unknown>;
}

export interface WeatherInterpreter<T = unknown> {
  /** namespaced ("my-system.mood"); unique among live registrations */
  id: string;
  label: string;
  /** free-form grouping key */
  facet: string;
  description?: string;
  /** synchronous */
  interpret: (report: WeatherReport, ctx: InterpretContext) => T;
  /** one line of text for the code block's `interpret:` option */
  format?: (result: T) => string;
}

export interface InterpreterInfo {
  id: string;
  label: string;
  facet: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type WadjetEvent = "ready" | "profiles-changed" | "time-changed" | "adapters-changed" | "resolvers-changed" | "interpreters-changed" | "unload";

export interface ReadyPayload {
  readonly type: "ready";
}
export interface ProfilesChangedPayload {
  readonly type: "profiles-changed";
  readonly all: boolean;
  readonly zoneIds: readonly string[];
}
export interface TimeChangedPayload {
  readonly type: "time-changed";
  readonly current: number | null;
  readonly adapterId: string;
}
export interface AdaptersChangedPayload {
  readonly type: "adapters-changed";
}
export interface ResolversChangedPayload {
  readonly type: "resolvers-changed";
}
export interface InterpretersChangedPayload {
  readonly type: "interpreters-changed";
  readonly facet: string;
}
export interface UnloadPayload {
  readonly type: "unload";
}

export interface WadjetEventPayloads {
  ready: ReadyPayload;
  "profiles-changed": ProfilesChangedPayload;
  "time-changed": TimeChangedPayload;
  "adapters-changed": AdaptersChangedPayload;
  "resolvers-changed": ResolversChangedPayload;
  "interpreters-changed": InterpretersChangedPayload;
  unload: UnloadPayload;
}

// ---------------------------------------------------------------------------
// The API object
// ---------------------------------------------------------------------------

export interface WadjetAPI {
  version: string;
  apiVersion: 1;
  ready: boolean;
  schemaVersion: 0;
  generatorVersion: string;
  rngVersion: string;

  getReport: (zoneId: string, time?: TimeContext | { dayOrdinal: number; hour?: number }) => WeatherReport;
  getRange: (zoneId: string, fromDay: number, toDay: number) => WeatherReport[];
  now: () => TimeContext | null;
  listZones: () => Array<{ id: string; name: string }>;
  timeAt: (dayOrdinal: number, zoneId?: string) => TimeContext;
  format: (dayOrdinal: number) => string;
  parse: (text: string) => number | null;

  canSetNow: () => boolean;
  setNow: (dayOrdinal: number) => Promise<boolean>;
  advance: (days: number) => Promise<boolean>;

  registerTimeAdapter: (adapter: TimeAdapter) => () => void;
  registerZoneResolver: (resolver: ZoneResolver) => () => void;
  resolveZone: (locator: ZoneLocator) => string | null;
  resolveZoneAsync: (locator: ZoneLocator) => Promise<string | null>;

  calendar: () => CalendarDescription | null;
  listTimeAdapters: () => Array<{ id: string; label: string; active: boolean }>;

  describe: (report: WeatherReport, style?: "short" | "prose") => string;
  units: () => Units;
  convert: (report: WeatherReport, units?: Units) => ConvertedReport;

  classify: (report: WeatherReport) => Classification;
  glyphKey: (report: WeatherReport) => GlyphKey;
  glyph: (keyOrReport: GlyphKey | WeatherReport, opts?: { size?: number; title?: string }) => string;

  registerInterpreter: (interpreter: WeatherInterpreter) => () => void;
  listInterpreters: (facet?: string) => InterpreterInfo[];
  getInterpreter: (id: string) => WeatherInterpreter | null;
  interpret: <T = unknown>(id: string, report: WeatherReport, options?: Record<string, unknown>) => T;

  on: <E extends WadjetEvent>(event: E, cb: (payload: WadjetEventPayloads[E]) => void) => () => void;
}

// ===========================================================================
// END VERBATIM MIRROR
// ===========================================================================

// ===========================================================================
// WINDROSE TOLERANCE LAYER (not part of the weather plugin's file)
// ===========================================================================

/** Members a 0.3.x plugin already had (Windrose requires getReport, now, listZones, on) */
type WadjetBaseMember =
  | 'version' | 'ready' | 'schemaVersion'
  | 'getReport' | 'getRange' | 'now' | 'listZones'
  | 'registerZoneResolver' | 'resolveZone' | 'describe' | 'units' | 'on';

/**
 * What `app.plugins.plugins.wadjet.api` may be: the 0.3 base surface, with
 * `apiVersion` and every apiVersion-1 member present only on new enough
 * plugins. Feature-detect with `apiVersion >= 1` and
 * `typeof api.member === 'function'`.
 */
export type WadjetApi =
  Pick<WadjetAPI, WadjetBaseMember> &
  Partial<Omit<WadjetAPI, WadjetBaseMember | 'apiVersion'>> &
  { apiVersion?: number };

/** One zone's weather for one day (metric). `provenance` is absent on 0.3.x. */
export type WadjetWeatherReport = Omit<WeatherReport, 'provenance'> & { provenance?: Provenance };
/** Short alias used by Windrose's weather store */
export type WadjetReport = WadjetWeatherReport;

export type WadjetPrecipType = PrecipType;
export type WadjetTimeContext = TimeContext;
export type WadjetZoneLocator = ZoneLocator;
export type WadjetZoneResolver = ZoneResolver;
export type WadjetZoneSummary = { id: string; name: string };
export type WadjetClassification = Classification;
export type WadjetVisibilityClass = VisibilityClass;
export type WadjetPrecipitationClass = PrecipitationClass;
export type WadjetGlyphKey = GlyphKey;
export type WadjetInterpretContext = InterpretContext;
export type WadjetInterpreterSummary = InterpreterInfo;
/**
 * An interpreter as Windrose writes it: accepts reports with or without
 * provenance, so it also suits Windrose's own local calls.
 */
export type WadjetInterpreter<T = unknown> = Omit<WeatherInterpreter<T>, 'interpret'> & {
  interpret: (report: WadjetWeatherReport, ctx: InterpretContext) => T;
};
