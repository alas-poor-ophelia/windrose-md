/**
 * forecastRoute.ts
 *
 * The glue between a measured route and the forecast walk
 * (src/travel/forecastWalk.ts): expands the route into per-cell walk steps,
 * answers "what weather is on this cell on that day" from the map's weather
 * store (memoized), joins a committed walk with the live preview segment's
 * walk, ranks departure days, and cuts the route polyline into one stretch
 * per travel day for the map tint.
 *
 * Pure: no Preact, no Obsidian. The store is passed in as a plain object.
 *
 * Multiplier conventions: the store's interpretTravel() answers a SPEED
 * factor (> 1 faster, 0.05 = impassable); the walk wants a TIME multiplier,
 * so the lookup hands it 1 / speed. Terrain stays a SPEED factor.
 */

import type { Point } from '#types/core/geometry.types';
import type { WeatherArea, WeatherTravelResult } from '#types/contexts/weather.types';
import type { WadjetReport } from '#types/integrations/wadjet.types';
import type { WalkDay, WalkOptions, WalkResult, WalkStep, WeatherAtCell } from '../travel/forecastWalk';

import { bestDeparture } from '../travel/forecastWalk';

// ===========================================
// Route → walk steps
// ===========================================

/** A walk step that remembers which route segment it belongs to */
export interface RouteStep extends WalkStep {
  segment: number;
}

/**
 * Expand a route into walk steps, one per cell crossed. Each segment's
 * distance (map units) is split evenly over its cells; a segment's first
 * cell is the previous segment's last, so it is left out — except on the
 * very first segment, unless `continuesRoute` says these points continue
 * an earlier walk (the live preview segment).
 */
function buildRouteSteps(
  points: Point[],
  segmentDistances: number[],
  terrainMultipliers: number[],
  getCellsInLine: (x1: number, y1: number, x2: number, y2: number) => Point[],
  continuesRoute = false
): RouteStep[] {
  const steps: RouteStep[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const distance = segmentDistances[i] ?? 0;
    const terrain = terrainMultipliers[i] ?? 1;
    let cells = getCellsInLine(a.x, a.y, b.x, b.y);
    if ((i > 0 || continuesRoute) && cells.length > 1) cells = cells.slice(1);
    if (cells.length === 0) cells = [{ x: b.x, y: b.y }];
    const share = Number.isFinite(distance) && distance > 0 ? distance / cells.length : 0;
    for (const cell of cells) {
      steps.push({ cell: { x: cell.x, y: cell.y }, distance: share, terrainMultiplier: terrain, segment: i });
    }
  }
  return steps;
}

// ===========================================
// Weather lookup
// ===========================================

/** The slice of the weather store the lookup needs */
export interface RouteWeatherSource {
  areaAt(cell: { x: number; y: number }): WeatherArea | null;
  report(zoneId: string, day: number): WadjetReport | null;
  interpretTravel(report: WadjetReport): WeatherTravelResult;
}

/** One weather area's travel effect on one day */
export interface AreaDayWeather {
  areaId: string;
  zoneId: string;
  report: WadjetReport;
  /** TIME multiplier (1 / speed) */
  multiplier: number;
  label?: string;
}

export interface RouteWeather {
  /** For walkForecast: cells outside every weather area are fair (1) */
  weatherMultiplier: (cell: { x: number; y: number }, day: number) => WeatherAtCell;
  /** Of the given areas, the one slowest to cross on `day` (null when none has a report) */
  worstArea: (areaIds: string[], day: number) => AreaDayWeather | null;
}

const FAIR: WeatherAtCell = { multiplier: 1 };

/** A speed factor as a walk TIME multiplier; unusable factors count as fair */
function timeMultiplierFromSpeed(speed: number): number {
  return Number.isFinite(speed) && speed > 0 ? 1 / speed : 1;
}

/**
 * A memoizing weather lookup over the store. Build one per store version
 * (and per set of areas): every cell/day and area/day answer is cached for
 * the lookup's lifetime, so several walks (modes, departure days) share it.
 */
function createRouteWeather(source: RouteWeatherSource): RouteWeather {
  const cellCache = new Map<string, WeatherAtCell>();
  const areaCache = new Map<string, AreaDayWeather | null>();
  const areasById = new Map<string, WeatherArea>();

  const areaWeather = (area: WeatherArea, day: number): AreaDayWeather | null => {
    const key = `${area.id}|${day}`;
    const cached = areaCache.get(key);
    if (cached !== undefined) return cached;
    const report = source.report(area.zoneId, day);
    let result: AreaDayWeather | null = null;
    if (report != null) {
      const travel = source.interpretTravel(report);
      result = {
        areaId: area.id,
        zoneId: area.zoneId,
        report,
        multiplier: timeMultiplierFromSpeed(travel.speedMultiplier),
        ...(travel.label != null && travel.label !== '' ? { label: travel.label } : {}),
      };
    }
    areaCache.set(key, result);
    return result;
  };

  return {
    weatherMultiplier: (cell, day) => {
      const key = `${cell.x},${cell.y}|${day}`;
      const cached = cellCache.get(key);
      if (cached !== undefined) return cached;
      const area = source.areaAt(cell);
      let result = FAIR;
      if (area != null) {
        areasById.set(area.id, area);
        const weather = areaWeather(area, day);
        if (weather != null) {
          result = {
            multiplier: weather.multiplier,
            areaId: area.id,
            ...(weather.label != null ? { label: weather.label } : {}),
          };
        }
      }
      cellCache.set(key, result);
      return result;
    },
    worstArea: (areaIds, day) => {
      let worst: AreaDayWeather | null = null;
      for (const id of areaIds) {
        const area = areasById.get(id);
        if (area == null) continue;
        const weather = areaWeather(area, day);
        if (weather != null && (worst == null || weather.multiplier > worst.multiplier)) worst = weather;
      }
      return worst;
    },
  };
}

// ===========================================
// Walk composition
// ===========================================

function mergeDays(a: WalkDay, b: WalkDay, stepOffset: number): WalkDay {
  const labels = [...a.labels];
  for (const label of b.labels) if (!labels.includes(label)) labels.push(label);
  const areaIds = [...a.areaIds];
  for (const id of b.areaIds) if (!areaIds.includes(id)) areaIds.push(id);
  return {
    day: a.day,
    distance: a.distance + b.distance,
    hours: a.hours + b.hours,
    hoursLost: a.hoursLost + b.hoursLost,
    startStep: a.startStep,
    endStep: b.endStep + stepOffset,
    labels,
    areaIds,
    worstMultiplier: Math.max(a.worstMultiplier, b.worstMultiplier),
  };
}

/**
 * Join a walk with the walk of the steps that follow it (started from the
 * first walk's arrival: departDay = arrival.day, departHour = 8 +
 * arrival.hourOfTravelDay). The walk is sequential, so the join equals
 * walking both step lists in one go. `stepOffset` is the first walk's step
 * count (the tail's step indices are shifted by it).
 */
function continueWalk(base: WalkResult, tail: WalkResult, stepOffset: number): WalkResult {
  const days = base.days.map(d => ({ ...d }));
  for (const day of tail.days) {
    const last = days[days.length - 1];
    const shifted = { ...day, startStep: day.startStep + stepOffset, endStep: day.endStep + stepOffset };
    if (last != null && last.day === day.day) days[days.length - 1] = mergeDays(last, day, stepOffset);
    else days.push(shifted);
  }
  const totalHours = days.reduce((sum, d) => sum + d.hours, 0);
  const ok = base.ok && tail.ok;
  return {
    ok,
    days,
    totalHours,
    totalTravelDays: days.length,
    arrival: tail.days.length > 0 ? tail.arrival : base.arrival,
    fairHours: base.fairHours + tail.fairHours,
    ...(ok ? {} : { reason: base.reason ?? tail.reason ?? 'The route could not be costed.' }),
  };
}

/** One departure-day option for the departure window */
export interface DepartureOption {
  day: number;
  ok: boolean;
  totalHours: number;
  /** Arrival day ordinal */
  arrivalDay: number;
  /** The fastest of the window (least total travel time; earliest on ties) */
  best: boolean;
}

/** Walk the route for `count` departure days from `fromDay` and mark the fastest */
function rankDepartures(
  steps: WalkStep[],
  opts: Omit<WalkOptions, 'departDay'>,
  fromDay: number,
  count: number
): DepartureOption[] {
  const results = bestDeparture(steps, opts, fromDay, count);
  let bestIndex = -1;
  results.forEach((r, i) => {
    if (!r.result.ok) return;
    if (bestIndex < 0 || r.result.totalHours < results[bestIndex].result.totalHours - 1e-6) bestIndex = i;
  });
  return results.map((r, i) => ({
    day: r.departDay,
    ok: r.result.ok,
    totalHours: r.result.totalHours,
    arrivalDay: r.result.arrival.day,
    best: i === bestIndex,
  }));
}

// ===========================================
// Day stretches on the route polyline
// ===========================================

export interface DayStretch {
  /** Index into the walk's days */
  index: number;
  /** Polyline of this day's stretch, in the points' coordinate space */
  points: Point[];
}

/**
 * Cut the route polyline into one stretch per travel day. `points` are the
 * route's vertices (world space), `segmentDistances` each segment's length
 * in map units (the walk's distance unit), `dayDistances` the distance made
 * each day. Positions inside a segment interpolate linearly by distance.
 */
function computeDayStretches(points: Point[], segmentDistances: number[], dayDistances: number[]): DayStretch[] {
  if (points.length < 2 || dayDistances.length === 0) return [];
  const cumulative: number[] = [0];
  for (let i = 0; i < points.length - 1; i++) {
    const d = segmentDistances[i];
    cumulative.push(cumulative[i] + (Number.isFinite(d) && d > 0 ? d : 0));
  }
  const total = cumulative[cumulative.length - 1];

  const pointAt = (distance: number): Point => {
    const target = Math.min(Math.max(0, distance), total);
    for (let i = 0; i < points.length - 1; i++) {
      const start = cumulative[i];
      const end = cumulative[i + 1];
      if (target <= end || i === points.length - 2) {
        const t = end > start ? Math.min(1, Math.max(0, (target - start) / (end - start))) : 0;
        return { x: points[i].x + (points[i + 1].x - points[i].x) * t, y: points[i].y + (points[i + 1].y - points[i].y) * t };
      }
    }
    return points[points.length - 1];
  };

  const stretches: DayStretch[] = [];
  let from = 0;
  dayDistances.forEach((made, index) => {
    const to = from + (Number.isFinite(made) && made > 0 ? made : 0);
    const line: Point[] = [pointAt(from)];
    for (let v = 1; v < points.length - 1; v++) {
      if (cumulative[v] > from + 1e-9 && cumulative[v] < to - 1e-9) line.push(points[v]);
    }
    line.push(pointAt(to));
    stretches.push({ index, points: line });
    from = to;
  });
  return stretches;
}

// ===========================================
// Formatting
// ===========================================

/** Short hours for chips and the itinerary: "40 min", "5.5 h", "26 h" */
function formatHours(hours: number): string {
  if (!Number.isFinite(hours) || hours <= 0) return '0 h';
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} min`;
  const rounded = Math.round(hours * 10) / 10;
  return `${rounded >= 10 ? Math.round(rounded) : rounded} h`;
}

/** Compact travel time for a chip: "5.5 h", "2 d", "2 d 3 h" (days are travel days of hoursPerDay) */
function formatTravelSpan(hours: number, hoursPerDay: number): string {
  if (!(Number.isFinite(hoursPerDay) && hoursPerDay > 0)) return formatHours(hours);
  if (!Number.isFinite(hours) || hours <= 0) return '0 h';
  const days = Math.floor((hours + 1e-6) / hoursPerDay);
  if (days === 0) return formatHours(hours);
  const rest = Math.round(hours - days * hoursPerDay);
  if (rest <= 0) return `${days} d`;
  if (rest >= hoursPerDay) return `${days + 1} d`;
  return `${days} d ${rest} h`;
}

export {
  formatTravelSpan,
  buildRouteSteps,
  createRouteWeather,
  continueWalk,
  rankDepartures,
  computeDayStretches,
  formatHours,
  timeMultiplierFromSpeed,
};
