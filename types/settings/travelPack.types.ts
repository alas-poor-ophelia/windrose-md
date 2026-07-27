/**
 * Travel Pack Type Definitions
 * Path: types/settings/travelPack.types.ts
 *
 * A travel pack is a named, self-contained bundle of travel rules for an
 * RPG system (e.g. "D&D 5e"): custom distance units, terrain speed
 * multipliers, travel modes (distance per time), and per-day allowances.
 * Packs live in plugin settings; maps reference pack content by stable
 * internal ids only — never by display names or abbreviations.
 */

// ===========================================
// Sub-entities
// ===========================================

/**
 * A custom distance unit anchored to a standard unit string
 * (e.g. 1 "league" = 3 "mi"). No screen calibration is ever involved:
 * conversion is purely numeric against the map's unit strings.
 */
export interface TravelUnit {
  id: string;
  name: string;
  abbreviation: string;
  /** One of this unit equals `factor` of `baseUnit` (must be > 0) */
  factor: number;
  /** Standard unit string this unit is defined in (e.g. 'mi', 'km', 'ft') */
  baseUnit: string;
}

/** A terrain type with a speed multiplier (>1 faster, <1 slower, must be > 0) */
export interface TravelTerrain {
  id: string;
  name: string;
  multiplier: number;
  /** Segment coloring for terrain-aware routes */
  color?: string;
}

/** Time base for mode speeds and allowances */
export type TravelTimeUnit = 'minutes' | 'hours' | 'days';

/**
 * How a travel mode's distance unit is expressed: either a plain standard
 * unit string (matching map units, e.g. 'mi') or a reference to one of the
 * pack's custom units by id.
 */
export type TravelUnitRef =
  | { type: 'standard'; unit: string }
  | { type: 'custom'; unitId: string };

/**
 * A travel mode: a speed expressed as distance per time
 * (e.g. 24 mi per 8 hours, or 3 hexes per 1 day).
 */
export interface TravelMode {
  id: string;
  name: string;
  /** Distance covered per time span (must be > 0) */
  distance: number;
  /** Unit of `distance` — standard string or custom-unit reference */
  unit: TravelUnitRef;
  /** Time span the distance is covered in (must be > 0) */
  timeValue: number;
  timeUnit: TravelTimeUnit;
}

/**
 * A per-day allowance: how much travel time counts as one day
 * (e.g. 8 hours/day normal pace vs 12 hours/day forced march).
 */
export interface TravelAllowance {
  id: string;
  name: string;
  /** Travel time per day (must be > 0) */
  timeValue: number;
  /** 'days' is not meaningful for an allowance — minutes or hours only */
  timeUnit: 'minutes' | 'hours';
}

// ===========================================
// Pack
// ===========================================

/** A named, self-contained travel rule bundle. Any list may be empty. */
export interface TravelPack {
  id: string;
  name: string;
  description?: string;
  /** Only enabled packs surface in map UI. Stripped on export. */
  enabled: boolean;
  units: TravelUnit[];
  terrains: TravelTerrain[];
  modes: TravelMode[];
  allowances: TravelAllowance[];
}

// ===========================================
// Export file format
// ===========================================

/** On-disk envelope for exported travel packs */
export interface TravelPackExport {
  format: 'windrose-travel-pack';
  formatVersion: number;
  pack: Omit<TravelPack, 'enabled'>;
}

/** Result of validating an imported pack file */
export interface TravelPackValidation {
  valid: boolean;
  errors: string[];
  /** Present when valid: the normalized pack, enabled by default */
  pack?: TravelPack;
}
