/**
 * forecastWalk.ts
 *
 * Day-by-day costing of a route against a weather forecast. A journey
 * longer than one travel day must not be costed with the departure day's
 * weather alone: the party walks the route step by step, and every step
 * is costed with the weather of the day the party is actually on it. A day
 * ends when its travel allowance is spent; a step that straddles the end
 * of a day is split proportionally and its remainder is walked the next
 * day, in that day's weather.
 *
 * Pure: no Preact, no Obsidian. The caller expands the route into cells
 * (geometry.getCellsInLine per segment), resolves terrain, and supplies a
 * memoized weather lookup.
 *
 * Multiplier conventions (they differ on purpose, so read carefully):
 * - terrainMultiplier is the travel pack's SPEED multiplier (TravelTerrain:
 *   > 1 faster, < 1 slower), exactly as computeRouteTravelTime applies it.
 * - weatherMultiplier is a TIME multiplier: >= 1 slows (2 = twice as long).
 * So the hours for a step are distance × weather ÷ (speedPerHour × terrain).
 */

import type { TravelMode, TravelPack } from '#types/settings/travelPack.types';

import { computeTravelTime, type TravelTimeError } from './travelTimeOperations';

/** Clock hour at which a travel day starts (the allowance runs from here) */
const TRAVEL_DAY_START_HOUR = 8;

/** A weather time multiplier at or above this means the cell is impassable that day */
const IMPASSABLE_MULTIPLIER = 20;

/** Default safety cap on the number of days a walk may span */
const DEFAULT_MAX_DAYS = 60;

/** Floating-point slack for hour and distance comparisons */
const EPSILON = 1e-9;

export interface WalkStep {
  cell: { x: number; y: number };
  /** Distance in map units for this step */
  distance: number;
  /** Travel pack terrain SPEED multiplier (> 1 faster, < 1 slower; 1 = unassigned) */
  terrainMultiplier: number;
}

export interface WeatherAtCell {
  /** TIME multiplier: >= 1 slows; >= 20 is impassable for the day */
  multiplier: number;
  label?: string;
  areaId?: string | null;
}

export interface WalkOptions {
  /** Map units per hour for the selected mode (see speedPerHourFromMode) */
  speedPerHour: number;
  /** Travel hours in one day (the allowance) */
  hoursPerDay: number;
  /** Weather day ordinal of departure */
  departDay: number;
  /** Clock hour of departure; default (and minimum) is the start of the travel day, 8 */
  departHour?: number;
  /** Weather for a cell on a day; called once per (step, day) touched — caller memoizes */
  weatherMultiplier(cell: { x: number; y: number }, day: number): WeatherAtCell;
  /** Safety cap on days spanned, default 60 */
  maxDays?: number;
}

export interface WalkDay {
  /** Weather day ordinal */
  day: number;
  /** Map units made this day */
  distance: number;
  /** Travel hours spent this day, moving or waiting out impassable weather */
  hours: number;
  /** hours − the fair-weather hours for this day's distance (waiting counts as lost) */
  hoursLost: number;
  /** First and last step index touched this day (inclusive) */
  startStep: number;
  endStep: number;
  /** Distinct weather labels met this day, in order of first meeting */
  labels: string[];
  /** Distinct weather area ids met this day */
  areaIds: string[];
  /** Largest weather time multiplier met this day (1 when none) */
  worstMultiplier: number;
}

export interface WalkResult {
  ok: boolean;
  days: WalkDay[];
  /** Sum of day hours (moving and waiting) — travel time, excluding off-allowance hours */
  totalHours: number;
  /** Number of travel days used (days.length) */
  totalTravelDays: number;
  /** Day ordinal and hours into that travel day (from its 8:00 start) at arrival */
  arrival: { day: number; hourOfTravelDay: number };
  /** Hours the route takes in fair weather (weather multiplier 1, terrain applied) */
  fairHours: number;
  /** Present when ok is false */
  reason?: string;
}

/** A finite, positive number, or the fallback */
function positiveOr(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Fair-weather hours for the whole route (terrain applied, weather 1) */
function computeFairHours(steps: WalkStep[], speedPerHour: number): number {
  let hours = 0;
  for (const step of steps) {
    if (!(Number.isFinite(step.distance) && step.distance > 0)) continue;
    hours += step.distance / (speedPerHour * positiveOr(step.terrainMultiplier, 1));
  }
  return hours;
}

function failed(reason: string, departDay: number, steps: WalkStep[] = [], speedPerHour = 1): WalkResult {
  return {
    ok: false,
    days: [],
    totalHours: 0,
    totalTravelDays: 0,
    arrival: { day: departDay, hourOfTravelDay: 0 },
    fairHours: Number.isFinite(speedPerHour) && speedPerHour > 0 ? computeFairHours(steps, speedPerHour) : 0,
    reason,
  };
}

interface DayAccumulator extends WalkDay {
  fairHours: number;
}

function newDay(day: number, startStep: number): DayAccumulator {
  return {
    day,
    distance: 0,
    hours: 0,
    hoursLost: 0,
    startStep,
    endStep: startStep,
    labels: [],
    areaIds: [],
    worstMultiplier: 1,
    fairHours: 0,
  };
}

function finishDay(acc: DayAccumulator): WalkDay {
  const { fairHours, ...day } = acc;
  return { ...day, hoursLost: Math.max(0, acc.hours - fairHours) };
}

/**
 * Walk a route against the forecast, day by day.
 * Always returns finite numbers; ok is false when the inputs are unusable
 * or the walk would exceed maxDays (the partial itinerary is kept).
 */
function walkForecast(steps: WalkStep[], opts: WalkOptions): WalkResult {
  const { speedPerHour, hoursPerDay, departDay } = opts;
  if (!(Number.isFinite(departDay))) return failed('Departure day is not a number.', 0);
  if (!(Number.isFinite(speedPerHour) && speedPerHour > 0)) {
    return failed('Travel speed must be a positive number.', departDay);
  }
  if (!(Number.isFinite(hoursPerDay) && hoursPerDay > 0)) {
    return failed('Travel hours per day must be a positive number.', departDay, steps, speedPerHour);
  }
  const maxDays = Math.max(1, Math.floor(positiveOr(opts.maxDays ?? DEFAULT_MAX_DAYS, DEFAULT_MAX_DAYS)));
  const fairHours = computeFairHours(steps, speedPerHour);

  const days: WalkDay[] = [];
  const departHour = Number.isFinite(opts.departHour) ? (opts.departHour as number) : TRAVEL_DAY_START_HOUR;
  // Departing before the travel day starts waits for it; departing after
  // the allowance is spent starts on the next day.
  let used = Math.max(0, departHour - TRAVEL_DAY_START_HOUR);
  let current = newDay(departDay, 0);
  if (used >= hoursPerDay - EPSILON) {
    current = newDay(departDay + 1, 0);
    used = 0;
  }

  const closeDay = (nextStartStep: number): void => {
    days.push(finishDay(current));
    current = newDay(current.day + 1, nextStartStep);
    used = 0;
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!(Number.isFinite(step.distance) && step.distance > 0)) continue;
    const terrain = positiveOr(step.terrainMultiplier, 1);
    const fairHoursPerUnit = 1 / (speedPerHour * terrain);
    let remaining = step.distance;
    const distanceSlack = EPSILON * Math.max(1, step.distance);

    while (remaining > distanceSlack) {
      // The previous step used the day up exactly: start tomorrow
      if (used >= hoursPerDay - EPSILON) closeDay(i);
      if (current.day - departDay >= maxDays) {
        if (current.hours > 0) days.push(finishDay(current));
        const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
        return {
          ok: false,
          days,
          totalHours,
          totalTravelDays: days.length,
          arrival: { day: current.day, hourOfTravelDay: 0 },
          fairHours,
          reason: `The route is not finished within ${maxDays} days of travel.`,
        };
      }

      const weather = opts.weatherMultiplier(step.cell, current.day);
      const multiplier = positiveOr(weather.multiplier, 1);
      current.endStep = i;
      if (weather.label != null && weather.label !== '' && !current.labels.includes(weather.label)) {
        current.labels.push(weather.label);
      }
      if (weather.areaId != null && weather.areaId !== '' && !current.areaIds.includes(weather.areaId)) {
        current.areaIds.push(weather.areaId);
      }
      if (multiplier > current.worstMultiplier) current.worstMultiplier = multiplier;

      const hoursLeft = Math.max(0, hoursPerDay - used);

      if (multiplier >= IMPASSABLE_MULTIPLIER) {
        // Impassable today: the party waits out the rest of the day here
        // and tries again tomorrow.
        current.hours += hoursLeft;
        closeDay(i);
        continue;
      }

      const hoursPerUnit = fairHoursPerUnit * multiplier;
      const hoursNeeded = remaining * hoursPerUnit;
      if (hoursNeeded <= hoursLeft + EPSILON) {
        used = Math.min(hoursPerDay, used + hoursNeeded);
        current.hours += hoursNeeded;
        current.distance += remaining;
        current.fairHours += remaining * fairHoursPerUnit;
        remaining = 0;
      } else {
        // The step straddles the end of the day: make partial progress,
        // the remainder continues tomorrow in tomorrow's weather.
        const made = hoursLeft / hoursPerUnit;
        current.hours += hoursLeft;
        current.distance += made;
        current.fairHours += made * fairHoursPerUnit;
        remaining -= made;
        closeDay(i);
      }
    }
  }

  const arrival = { day: current.day, hourOfTravelDay: used };
  if (current.hours > 0 || current.labels.length > 0) days.push(finishDay(current));
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
  return {
    ok: true,
    days,
    totalHours,
    totalTravelDays: days.length,
    arrival,
    fairHours,
  };
}

/**
 * Walk the route for each of `count` consecutive departure days from
 * `fromDay`. Sorted by departDay; the caller picks the earliest arrival.
 */
function bestDeparture(
  steps: WalkStep[],
  opts: Omit<WalkOptions, 'departDay'>,
  fromDay: number,
  count: number
): Array<{ departDay: number; result: WalkResult }> {
  const out: Array<{ departDay: number; result: WalkResult }> = [];
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  for (let k = 0; k < n; k++) {
    const departDay = fromDay + k;
    out.push({ departDay, result: walkForecast(steps, { ...opts, departDay }) });
  }
  return out;
}

/**
 * A travel mode's speed in map units per travel hour, reusing
 * computeTravelTime's unit reconciliation (no duplicated unit logic).
 * Day-based modes ("3 hexes per day") spread their day's distance over
 * the allowance's hours, so hoursPerDay is required for them.
 */
function speedPerHourFromMode(
  mode: TravelMode,
  pack: TravelPack,
  mapUnit: string,
  hoursPerDay: number
): { ok: true; speedPerHour: number } | TravelTimeError {
  const perUnit = computeTravelTime(1, mapUnit, mode, pack);
  if (!perUnit.ok) return perUnit;
  if (!(Number.isFinite(perUnit.amount) && perUnit.amount > 0)) {
    return { ok: false, reason: `"${mode.name}" has no usable speed — check its distance and time in settings.` };
  }
  const perBase = 1 / perUnit.amount;
  if (perUnit.base === 'hours') return { ok: true, speedPerHour: perBase };
  if (!(Number.isFinite(hoursPerDay) && hoursPerDay > 0)) {
    return { ok: false, reason: `"${mode.name}" is measured per day — choose a travel allowance to cost it day by day.` };
  }
  return { ok: true, speedPerHour: perBase / hoursPerDay };
}

export {
  TRAVEL_DAY_START_HOUR,
  IMPASSABLE_MULTIPLIER,
  walkForecast,
  bestDeparture,
  speedPerHourFromMode,
};
