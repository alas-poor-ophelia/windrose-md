/**
 * useRouteWeather.ts
 *
 * The measure tool's travel times, with the map's weather folded in. Owns
 * everything between the measured route and the controls card / route
 * ribbon: travel-time lines, the weather note, the forecast walk's
 * itinerary, the departure window and its chosen day, and the per-day
 * route stretches.
 *
 * Two costings, never both:
 * - With a travel day length (an allowance) the route is walked cell by
 *   cell against the forecast from the departure day (src/travel/
 *   forecastWalk.ts): each cell is costed with the weather of the day the
 *   party reaches it. The committed route is walked once per input change;
 *   the live preview segment continues each committed walk, so pointer
 *   moves never re-walk the route.
 * - Without a day length there is no travel day to walk: the whole route is
 *   costed with the view day's weather (the single-day fold, each segment's
 *   worst cell).
 * Without weather both reduce to plain terrain-costed travel times.
 *
 * Fog: a fogged cell is unknown weather. It costs as fair, carries no label
 * and no glyph, so the itinerary cannot reveal a hidden storm.
 *
 * Factor names: `...SpeedFactor` multiplies speed (> 1 faster; terrain, the
 * fold's weather), `...TimeFactor` / `weatherSlowdown` multiplies time
 * (>= 1 slower; the forecast walk's weather).
 *
 * Departure window: the DEPARTURE_WINDOW_DAYS days from the store's view
 * day (so the default departure is always listed). A choice outside the
 * window falls back to the view day; the choice is dropped when the route
 * is cleared or the world's date moves.
 */

import type { Point, IGeometry } from '#types/core/geometry.types';
import type { TravelAllowance, TravelMode, TravelPack } from '#types/settings/travelPack.types';
import type {
  DepartureChip,
  ItineraryDay,
  TravelTimeLine,
} from '../../components/overlays/MeasurementControls';
import type { WalkResult } from '../../travel/forecastWalk';
import type { DayStretch, RouteStep } from '../../weather/forecastRoute';
import type { WeatherTravelEffect } from '../../weather/weatherTravelRules';

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import {
  allowanceHoursPerDay,
  computeRouteTravelTime,
  findTerrainById,
  formatTravelTime,
} from '../../travel/travelTimeOperations';
import { computeWeatherTimeRatio, formatWeatherNote } from '../../weather/weatherTravelRules';
import { computeSegmentWeatherEffects } from '../../weather/weatherZones';
import { travelEffectFromInterpretation } from '../../weather/travelInterpreter';
import { useWeatherStore } from '../../context/WeatherContext';
import { useWeatherFog } from '../../weather/weatherFog';
import { TRAVEL_DAY_START_HOUR, speedPerHourFromMode, walkForecast } from '../../travel/forecastWalk';
import {
  buildRouteSteps,
  computeDayStretches,
  continueWalk,
  createRouteWeather,
  formatHours,
  formatTravelSpan,
  rankDepartures,
} from '../../weather/forecastRoute';

/** Departure days offered in the departure window */
const DEPARTURE_WINDOW_DAYS = 7;

/** Weather costs below this many hours are not worth a line */
const MIN_SHOWN_HOURS = 0.05;

/** Shared "no weather on any segment" value — one identity, so memos keyed on it hold */
const NO_SEGMENT_WEATHER: WeatherTravelEffect[] = [];

/** Distance for the itinerary: one decimal, trailing .0 dropped */
function formatDistance(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** The departure in effect: the choice when it is inside the window, else the window's first day */
function resolveDepartureDay(choice: number | null, windowStart: number | null): number | null {
  if (windowStart == null) return null;
  if (choice == null || choice < windowStart || choice >= windowStart + DEPARTURE_WINDOW_DAYS) return windowStart;
  return choice;
}

interface RouteWeatherInput {
  /** The measure tool is active (everything parks otherwise) */
  active: boolean;
  geometry: IGeometry | null;
  waypoints: Point[];
  /** Committed segment lengths, in cells */
  segmentDistances: number[];
  segmentTerrains: (string | null)[];
  previewTarget: Point | null;
  /** Live preview segment length, in cells (0 = none) */
  previewDistance: number;
  distanceUnit: string;
  distancePerCell: number;
  enabledPacks: TravelPack[];
  selectedModes: { mode: TravelMode; pack: TravelPack }[];
  selectedAllowance: TravelAllowance | null;
  /** Terrain of a route's first segment (later ones inherit their predecessor's) */
  firstSegmentTerrainId: string | null;
}

interface RouteWeatherResult {
  travelLines: TravelTimeLine[];
  /** Weather already folded into the travel lines; null = none */
  weatherNote: string | null;
  /** Forecast itinerary, one entry per travel day (empty without a forecast walk) */
  itinerary: ItineraryDay[];
  /** The mode the itinerary and departure window are costed for */
  itineraryModeName: string;
  departures: DepartureChip[];
  /** The departure day in effect (always inside the window) */
  departureDay: number | null;
  setDepartureDay: (day: number) => void;
  /** One route stretch per travel day, world space (empty for a one-day walk) */
  dayStretches: DayStretch[];
}

function useRouteWeather(input: RouteWeatherInput): RouteWeatherResult {
  const {
    active, geometry, waypoints, segmentDistances, segmentTerrains, previewTarget, previewDistance,
    distanceUnit, distancePerCell, enabledPacks, selectedModes, selectedAllowance, firstSegmentTerrainId,
  } = input;
  const weather = useWeatherStore();
  const fog = useWeatherFog();

  const viewDay = weather.viewDay;
  const weatherActive = active && weather.hasWeather && viewDay != null;
  const hoursPerDay = selectedAllowance != null ? allowanceHoursPerDay(selectedAllowance) : null;
  const hasTravelDay = hoursPerDay != null && Number.isFinite(hoursPerDay) && hoursPerDay > 0;

  // ===========================================
  // Departure day
  // ===========================================

  const [departureChoice, setDepartureChoice] = useState<number | null>(null);
  const routeCleared = waypoints.length === 0;
  useEffect(() => {
    if (routeCleared) setDepartureChoice(null);
  }, [routeCleared]);
  // The world's date moved: yesterday's choice means nothing now
  const today = weather.today;
  useEffect(() => {
    setDepartureChoice(null);
  }, [today]);
  const departDay = resolveDepartureDay(departureChoice, viewDay);
  const setDepartureDay = useCallback((day: number): void => setDepartureChoice(day), []);

  const forecastActive = weatherActive && hasTravelDay && geometry != null && departDay != null;
  // The single-day fold only when there is no travel day to walk
  const foldActive = weatherActive && !hasTravelDay;

  // ===========================================
  // Single-day fold (no day length)
  // ===========================================

  const zoneAt = useMemo(
    () => (x: number, y: number): string | null => (fog.isFogged({ x, y }) ? null : weather.areaAt({ x, y })?.zoneId ?? null),
    [weather, fog]
  );
  const effectForZone = useMemo(() => {
    const zoneEffects = new Map<string, WeatherTravelEffect | null>();
    return (zoneId: string): WeatherTravelEffect | null => {
      let effect = zoneEffects.get(zoneId);
      if (effect === undefined) {
        const report = viewDay != null ? weather.report(zoneId, viewDay) : null;
        effect = report != null ? travelEffectFromInterpretation(weather.interpretTravel(report)) : null;
        zoneEffects.set(zoneId, effect);
      }
      return effect;
    };
  }, [weather, viewDay]);

  // Committed segments and the live preview segment are costed apart: the
  // preview moves with the pointer and must not re-fold the whole route.
  // Without weather both stay on shared constants.
  const committedWeather = useMemo((): WeatherTravelEffect[] => {
    if (!foldActive || geometry == null || waypoints.length < 2) return NO_SEGMENT_WEATHER;
    return computeSegmentWeatherEffects(
      waypoints,
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2),
      zoneAt,
      effectForZone
    );
  }, [foldActive, geometry, waypoints, zoneAt, effectForZone]);

  const lastWaypoint = waypoints.length > 0 ? waypoints[waypoints.length - 1] : null;
  const previewX = previewTarget?.x;
  const previewY = previewTarget?.y;
  const previewWeather = useMemo((): WeatherTravelEffect | null => {
    if (!foldActive || geometry == null || lastWaypoint == null ||
        previewX == null || previewY == null || previewDistance <= 0) return null;
    const effects = computeSegmentWeatherEffects(
      [lastWaypoint, { x: previewX, y: previewY }],
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2),
      zoneAt,
      effectForZone
    );
    return effects[0] ?? null;
  }, [foldActive, geometry, lastWaypoint, previewX, previewY, previewDistance, zoneAt, effectForZone]);

  const segmentWeather = useMemo(
    () => (previewWeather != null ? [...committedWeather, previewWeather] : committedWeather),
    [committedWeather, previewWeather]
  );

  // ===========================================
  // Forecast walk (day length set)
  // ===========================================

  // One memoizing lookup per store/fog version: every walk below shares it
  const routeWeather = useMemo(
    () => (forecastActive
      ? createRouteWeather({
        areaAt: weather.areaAt,
        report: (zoneId, day) => weather.report(zoneId, day),
        interpretTravel: report => weather.interpretTravel(report),
        isFogged: cell => fog.isFogged(cell),
      })
      : null),
    [forecastActive, weather, fog]
  );

  const terrainSpeedFactorOf = useCallback(
    (id: string | null | undefined): number => findTerrainById(enabledPacks, id ?? null)?.multiplier ?? 1,
    [enabledPacks]
  );

  // Committed route as walk steps (map units); recomputed on route edits only
  const committedSteps = useMemo((): RouteStep[] => {
    if (!forecastActive || geometry == null || waypoints.length < 2) return [];
    return buildRouteSteps(
      waypoints,
      segmentDistances.map(d => d * distancePerCell),
      segmentTerrains.map(terrainSpeedFactorOf),
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2)
    );
  }, [forecastActive, geometry, waypoints, segmentDistances, distancePerCell, segmentTerrains, terrainSpeedFactorOf]);

  // Each selected mode's speed in map units per travel hour (or its unit guidance)
  const modeSpeeds = useMemo(() => {
    if (!forecastActive || hoursPerDay == null) return [];
    return selectedModes.map(({ mode, pack }) => ({ mode, result: speedPerHourFromMode(mode, pack, distanceUnit, hoursPerDay) }));
  }, [forecastActive, hoursPerDay, selectedModes, distanceUnit]);

  const committedWalks = useMemo((): (WalkResult | null)[] => {
    if (routeWeather == null || hoursPerDay == null || departDay == null) return [];
    return modeSpeeds.map(({ result }) => result.ok
      ? walkForecast(committedSteps, {
        speedPerHour: result.speedPerHour,
        hoursPerDay,
        departDay,
        weatherSlowdown: routeWeather.weatherSlowdown,
      })
      : null);
  }, [routeWeather, hoursPerDay, departDay, modeSpeeds, committedSteps]);

  // The live preview segment continues each committed walk from its arrival
  // (exactly what walking the whole route would give)
  const previewTerrainId = segmentTerrains[segmentTerrains.length - 1] ?? firstSegmentTerrainId;
  const walks = useMemo((): (WalkResult | null)[] => {
    if (routeWeather == null || hoursPerDay == null || departDay == null || geometry == null) return committedWalks;
    if (lastWaypoint == null || previewX == null || previewY == null || previewDistance <= 0) return committedWalks;
    const previewSteps = buildRouteSteps(
      [lastWaypoint, { x: previewX, y: previewY }],
      [previewDistance * distancePerCell],
      [terrainSpeedFactorOf(previewTerrainId)],
      (x1, y1, x2, y2) => geometry.getCellsInLine(x1, y1, x2, y2),
      committedSteps.length > 0
    );
    return committedWalks.map((base, i) => {
      const speed = modeSpeeds[i]?.result;
      if (base == null || speed == null || !speed.ok || !base.ok) return base;
      const tail = walkForecast(previewSteps, {
        speedPerHour: speed.speedPerHour,
        hoursPerDay,
        departDay: base.arrival.day,
        departHour: TRAVEL_DAY_START_HOUR + base.arrival.hourOfTravelDay,
        weatherSlowdown: routeWeather.weatherSlowdown,
      });
      return continueWalk(base, tail, committedSteps.length);
    });
  }, [routeWeather, hoursPerDay, departDay, geometry, lastWaypoint, previewX, previewY, previewDistance, distancePerCell,
    terrainSpeedFactorOf, previewTerrainId, committedSteps.length, committedWalks, modeSpeeds]);

  // The itinerary, departure window and map tint follow the first mode that can be walked
  const primaryIndex = walks.findIndex(w => w != null);
  const primaryWalk = primaryIndex >= 0 ? walks[primaryIndex] : null;
  const primarySpeed = primaryIndex >= 0 ? modeSpeeds[primaryIndex]?.result : undefined;
  const itineraryModeName = primaryIndex >= 0 ? modeSpeeds[primaryIndex]?.mode.name ?? '' : '';

  const itinerary = useMemo((): ItineraryDay[] => {
    if (primaryWalk == null || routeWeather == null) return [];
    return primaryWalk.days.map(day => {
      // Area ids come from revealed cells only, so the glyph never shows hidden weather
      const worst = routeWeather.worstArea(day.areaIds, day.day);
      return {
        day: day.day,
        label: weather.formatDay(day.day),
        glyphSvg: worst != null ? weather.glyphSvg(worst.report) : null,
        distance: `${formatDistance(day.distance)} ${distanceUnit}`,
        weather: day.labels.length > 0 ? day.labels.join(', ') : null,
        hoursAdded: day.hoursLost > MIN_SHOWN_HOURS ? formatHours(day.hoursLost) : null,
      };
    });
  }, [primaryWalk, routeWeather, weather, distanceUnit]);

  // Departure window from the view day: the committed route only (stable while the pointer moves)
  const departures = useMemo((): DepartureChip[] => {
    if (routeWeather == null || hoursPerDay == null || primarySpeed == null || !primarySpeed.ok ||
        committedSteps.length === 0 || viewDay == null) return [];
    return rankDepartures(committedSteps, {
      speedPerHour: primarySpeed.speedPerHour,
      hoursPerDay,
      weatherSlowdown: routeWeather.weatherSlowdown,
    }, viewDay, DEPARTURE_WINDOW_DAYS).map(option => ({
      day: option.day,
      label: weather.formatDay(option.day),
      time: option.ok ? formatTravelSpan(option.totalHours, hoursPerDay) : 'Too long',
      best: option.best,
    }));
  }, [routeWeather, hoursPerDay, primarySpeed, committedSteps, weather, viewDay]);

  // Route tint: one stretch per travel day, in world space
  const dayStretches = useMemo((): DayStretch[] => {
    if (primaryWalk == null || geometry == null || primaryWalk.days.length < 2) return [];
    const route = [...waypoints];
    const distances = segmentDistances.map(d => d * distancePerCell);
    if (previewX != null && previewY != null && previewDistance > 0) {
      route.push({ x: previewX, y: previewY });
      distances.push(previewDistance * distancePerCell);
    }
    const world = route.map(p => {
      const c = geometry.getCellCenter(p.x, p.y);
      return { x: c.worldX, y: c.worldY };
    });
    return computeDayStretches(world, distances, primaryWalk.days.map(d => d.distance));
  }, [primaryWalk, geometry, waypoints, segmentDistances, distancePerCell, previewX, previewY, previewDistance]);

  // ===========================================
  // Travel lines
  // ===========================================

  const { travelLines, weatherNote } = useMemo((): { travelLines: TravelTimeLine[]; weatherNote: string | null } => {
    if (selectedModes.length === 0 || waypoints.length === 0) return { travelLines: [], weatherNote: null };

    if (forecastActive && walks.length === selectedModes.length) {
      const lines = selectedModes.map(({ mode }, i): TravelTimeLine => {
        const speed = modeSpeeds[i]?.result;
        if (speed != null && !speed.ok) return { modeId: mode.id, name: mode.name, text: speed.reason, isError: true };
        const walk = walks[i];
        if (walk == null) return { modeId: mode.id, name: mode.name, text: '', isError: false };
        if (!walk.ok) return { modeId: mode.id, name: mode.name, text: walk.reason ?? 'Too long to cost', isError: false };
        const added = walk.totalHours - walk.fairHours;
        return {
          modeId: mode.id,
          name: mode.name,
          text: formatTravelTime({ ok: true, amount: walk.totalHours, base: 'hours' }, selectedAllowance),
          isError: false,
          ...(added > MIN_SHOWN_HOURS ? { weatherDelta: `+${formatHours(added)} for weather` } : {}),
        };
      });
      let note: string | null = null;
      if (primaryWalk != null) {
        const labels: string[] = [];
        for (const day of primaryWalk.days) for (const label of day.labels) if (!labels.includes(label)) labels.push(label);
        if (labels.length > 0) {
          const percent = primaryWalk.fairHours > 0 ? Math.round((primaryWalk.totalHours / primaryWalk.fairHours - 1) * 100) : 0;
          note = percent > 0 ? `${labels.join(', ')} (+${percent}%)` : labels.join(', ');
        }
      }
      return { travelLines: lines, weatherNote: note };
    }

    // Distances in map units, preview segment included live (TM-18); the
    // preview's terrain-to-be is its predecessor's (TM-21), so its speed
    // factor previews honestly too
    const distances = segmentDistances.map(d => d * distancePerCell);
    const terrainIds: (string | null)[] = [...segmentTerrains];
    if (previewDistance > 0) {
      distances.push(previewDistance * distancePerCell);
      terrainIds.push(previewTerrainId);
    }
    const terrainSpeedFactors = terrainIds.map(terrainSpeedFactorOf);
    // The fold's weather is a SPEED factor (WeatherTravelEffect.multiplier)
    const weatherSpeedFactors = terrainSpeedFactors.map((_, i) => segmentWeather[i]?.multiplier ?? 1);
    const speedFactors = terrainSpeedFactors.map((terrain, i) => terrain * weatherSpeedFactors[i]);

    const lines = selectedModes.map(({ mode, pack }) => {
      const result = computeRouteTravelTime(distances, speedFactors, distanceUnit, mode, pack);
      if (!result.ok) {
        return { modeId: mode.id, name: mode.name, text: result.reason, isError: true };
      }
      return { modeId: mode.id, name: mode.name, text: formatTravelTime(result, selectedAllowance), isError: false };
    });
    const note = formatWeatherNote(segmentWeather, computeWeatherTimeRatio(distances, terrainSpeedFactors, weatherSpeedFactors));
    return { travelLines: lines, weatherNote: note };
  }, [selectedModes, selectedAllowance, waypoints.length, segmentDistances, previewDistance, segmentTerrains, distanceUnit,
    distancePerCell, terrainSpeedFactorOf, previewTerrainId, segmentWeather, forecastActive, walks, modeSpeeds, primaryWalk]);

  return {
    travelLines,
    weatherNote,
    itinerary,
    itineraryModeName,
    departures,
    departureDay: departDay,
    setDepartureDay,
    dayStretches,
  };
}

export { DEPARTURE_WINDOW_DAYS, resolveDepartureDay, useRouteWeather };
