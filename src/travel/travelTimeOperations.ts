/**
 * travelTimeOperations.ts
 *
 * Pure travel-time math: converts a measured distance (in the map's
 * distance units) into travel time for a pack's travel modes, honoring
 * per-segment terrain multipliers and per-day allowances.
 *
 * Unit sanity is the load-bearing rule here (TM-17): when a mode's
 * distance unit cannot be reconciled with the map's unit, the result is an
 * explicit, actionable message — never a silently wrong number. The only
 * conversions performed are the ones the pack itself defines (custom unit
 * → its base unit). There is no built-in standard-unit conversion table.
 */

// Type-only imports
import type {
  TravelPack,
  TravelMode,
  TravelAllowance,
} from '#types/settings/travelPack.types';

import { resolvePackUnit } from './travelPackOperations';

/**
 * A computed travel time. Day-based modes keep 'days' as their base so a
 * "3 hexes per day" mode reads in days without pretending a day is 24
 * travel hours; minute/hour modes normalize to 'hours'.
 */
export interface TravelTime {
  ok: true;
  amount: number;
  base: 'hours' | 'days';
}

/** An explicit refusal to compute — the message is user-facing guidance */
export interface TravelTimeError {
  ok: false;
  reason: string;
}

export type TravelTimeResult = TravelTime | TravelTimeError;

/** Case/whitespace-insensitive unit-string comparison */
function unitsMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Resolve a mode's speed as distance-in-mapUnit per timeValue timeUnit.
 * Custom units convert through their base (factor × baseUnit); standard
 * units must match the map's unit string exactly (normalized).
 */
function resolveModeDistanceInMapUnits(
  mode: TravelMode,
  pack: TravelPack,
  mapUnit: string
): { ok: true; distance: number } | TravelTimeError {
  if (mode.unit.type === 'standard') {
    if (unitsMatch(mode.unit.unit, mapUnit)) {
      return { ok: true, distance: mode.distance };
    }
    return {
      ok: false,
      reason: `"${mode.name}" is in ${mode.unit.unit} but this map measures ${mapUnit} — change the map's distance unit, or define a custom unit in the pack that anchors ${mode.unit.unit} to ${mapUnit}.`,
    };
  }

  const unit = resolvePackUnit(pack, mode.unit.unitId);
  if (unit == null) {
    return {
      ok: false,
      reason: `"${mode.name}" references a unit that is no longer in the pack — edit the mode in settings.`,
    };
  }
  // The custom unit itself may be the map's unit (a hex-crawl map measuring
  // in "hex"), or it converts through its base unit.
  if (unitsMatch(unit.name, mapUnit) || (unit.abbreviation !== '' && unitsMatch(unit.abbreviation, mapUnit))) {
    return { ok: true, distance: mode.distance };
  }
  if (unitsMatch(unit.baseUnit, mapUnit)) {
    return { ok: true, distance: mode.distance * unit.factor };
  }
  return {
    ok: false,
    reason: `"${mode.name}" is in ${unit.name} (anchored to ${unit.baseUnit}) but this map measures ${mapUnit} — change the map's distance unit or the unit's base.`,
  };
}

/** A mode's time span expressed in its display base ('hours' or 'days') */
function modeTimeSpan(mode: TravelMode): { span: number; base: 'hours' | 'days' } {
  switch (mode.timeUnit) {
    case 'minutes': return { span: mode.timeValue / 60, base: 'hours' };
    case 'hours': return { span: mode.timeValue, base: 'hours' };
    case 'days': return { span: mode.timeValue, base: 'days' };
  }
}

/**
 * Travel time for a single distance at a mode's plain speed.
 * time = distance ÷ speed, in the mode's time base.
 */
function computeTravelTime(
  distanceInMapUnits: number,
  mapUnit: string,
  mode: TravelMode,
  pack: TravelPack
): TravelTimeResult {
  return computeRouteTravelTime([distanceInMapUnits], [1], mapUnit, mode, pack);
}

/**
 * Terrain-aware route time: each segment's effective speed is the mode
 * speed × its terrain multiplier (unassigned = 1), and the route time is
 * the sum over segments. Multipliers arrive pre-resolved (terrain ids can
 * live in any enabled pack, so resolution is the caller's job via
 * findTerrainById; a stale id degrades to 1 — never wrong numbers).
 */
function computeRouteTravelTime(
  segmentDistancesInMapUnits: number[],
  segmentMultipliers: number[],
  mapUnit: string,
  mode: TravelMode,
  pack: TravelPack
): TravelTimeResult {
  const resolved = resolveModeDistanceInMapUnits(mode, pack, mapUnit);
  if (!resolved.ok) return resolved;

  const { span, base } = modeTimeSpan(mode);
  const speed = resolved.distance / span; // map units per hour-or-day

  let total = 0;
  for (let i = 0; i < segmentDistancesInMapUnits.length; i++) {
    const multiplier = segmentMultipliers[i] ?? 1;
    total += segmentDistancesInMapUnits[i] / (speed * multiplier);
  }

  return { ok: true, amount: total, base };
}

/** Allowance's travel hours per day */
function allowanceHoursPerDay(allowance: TravelAllowance): number {
  return allowance.timeUnit === 'minutes' ? allowance.timeValue / 60 : allowance.timeValue;
}

/** Round to one decimal, dropping a trailing .0 */
function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Format a travel time for display, with sensible precision at all
 * magnitudes. With an allowance, times render as whole days + remainder
 * ("3 days + 2.5 h"); day-based amounts use the allowance to express the
 * fractional day as hours.
 */
function formatTravelTime(time: TravelTime, allowance: TravelAllowance | null): string {
  if (allowance == null) {
    if (time.base === 'days') {
      const days = round1(time.amount);
      return `${days} ${days === 1 ? 'day' : 'days'}`;
    }
    if (time.amount < 1) {
      return `${Math.max(1, Math.round(time.amount * 60))} min`;
    }
    return `${round1(time.amount)} h`;
  }

  const hoursPerDay = allowanceHoursPerDay(allowance);
  const totalDays = time.base === 'days' ? time.amount : time.amount / hoursPerDay;
  const wholeDays = Math.floor(totalDays);
  const remainderHours = round1((totalDays - wholeDays) * hoursPerDay);

  if (wholeDays === 0) {
    const hours = time.base === 'days' ? time.amount * hoursPerDay : time.amount;
    if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
    return `${round1(hours)} h`;
  }
  if (remainderHours === 0) {
    return `${wholeDays} ${wholeDays === 1 ? 'day' : 'days'}`;
  }
  return `${wholeDays} ${wholeDays === 1 ? 'day' : 'days'} + ${remainderHours} h`;
}

/**
 * Modes selected for a map, resolved against enabled packs. Each entry
 * pairs the mode with its owning pack (times need the pack for unit and
 * terrain resolution). Selected ids whose mode or pack has vanished are
 * simply absent — the caller may surface that as guidance.
 */
function resolveSelectedModes(
  enabledPacks: TravelPack[],
  selectedModeIds: string[]
): { mode: TravelMode; pack: TravelPack }[] {
  const result: { mode: TravelMode; pack: TravelPack }[] = [];
  for (const id of selectedModeIds) {
    for (const pack of enabledPacks) {
      const mode = pack.modes.find(m => m.id === id);
      if (mode != null) {
        result.push({ mode, pack });
        break;
      }
    }
  }
  return result;
}

/** The selected allowance resolved against enabled packs, or null */
function resolveSelectedAllowance(
  enabledPacks: TravelPack[],
  allowanceId: string | null | undefined
): TravelAllowance | null {
  if (allowanceId == null || allowanceId === '') return null;
  for (const pack of enabledPacks) {
    const allowance = pack.allowances.find(a => a.id === allowanceId);
    if (allowance != null) return allowance;
  }
  return null;
}

/**
 * All terrains across enabled packs, paired with their pack for id
 * resolution. Used by the terrain picker and segment coloring.
 */
function collectEnabledTerrains(
  enabledPacks: TravelPack[]
): { terrain: TravelPack['terrains'][number]; pack: TravelPack }[] {
  return enabledPacks.flatMap(pack => pack.terrains.map(terrain => ({ terrain, pack })));
}

/** Look up a terrain by id across enabled packs */
function findTerrainById(
  enabledPacks: TravelPack[],
  terrainId: string | null | undefined
): TravelPack['terrains'][number] | null {
  if (terrainId == null) return null;
  for (const pack of enabledPacks) {
    const terrain = pack.terrains.find(t => t.id === terrainId);
    if (terrain != null) return terrain;
  }
  return null;
}

export {
  unitsMatch,
  computeTravelTime,
  computeRouteTravelTime,
  allowanceHoursPerDay,
  formatTravelTime,
  resolveSelectedModes,
  resolveSelectedAllowance,
  collectEnabledTerrains,
  findTerrainById,
};
