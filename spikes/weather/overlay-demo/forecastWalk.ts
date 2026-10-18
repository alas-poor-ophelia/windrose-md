/**
 * spikes/weather/overlay-demo/forecastWalk.ts
 *
 * Experiment, not wired into the plugin: a journey longer than a day should
 * not be costed with the departure day's weather alone. This walks the route
 * cell by cell and moves to the next day's weather each time a day's travel
 * allowance is used up, so a one-day blizzard slows one day of the trip.
 */
import type { Point } from '#types/core/geometry.types';

export interface RouteLeg {
  /** Leg length in map units */
  distance: number;
  /** Cells the leg crosses, in order; each is an equal share of the leg */
  cells: Point[];
  terrainMultiplier: number;
}

export interface TravelDay {
  dayOffset: number;
  hours: number;
  distance: number;
  /** Weather reasons met while travelling that day */
  reasons: string[];
}

export interface ForecastWalk {
  totalHours: number;
  days: TravelDay[];
}

/**
 * @param speedPerHour      map units per travel hour at multiplier 1
 * @param hoursPerDay       travel hours in one day (the allowance)
 * @param weatherAt         weather multiplier and reasons for a cell on departure day + dayOffset
 */
function walkRouteWithForecast(
  legs: RouteLeg[],
  speedPerHour: number,
  hoursPerDay: number,
  weatherAt: (cell: Point, dayOffset: number) => { multiplier: number; reasons: string[] }
): ForecastWalk {
  const days: TravelDay[] = [];
  let day: TravelDay = { dayOffset: 0, hours: 0, distance: 0, reasons: [] };
  let totalHours = 0;

  for (const leg of legs) {
    if (leg.cells.length === 0) continue;
    const share = leg.distance / leg.cells.length;
    for (const cell of leg.cells) {
      let remaining = share;
      // A cell can straddle a day boundary: the rest of it is walked in tomorrow's weather
      while (remaining > 1e-9) {
        const weather = weatherAt(cell, day.dayOffset);
        const speed = speedPerHour * leg.terrainMultiplier * weather.multiplier;
        const hoursLeft = hoursPerDay - day.hours;
        const hoursNeeded = remaining / speed;
        const hours = Math.min(hoursNeeded, hoursLeft);
        day.hours += hours;
        day.distance += hours * speed;
        totalHours += hours;
        remaining -= hours * speed;
        for (const reason of weather.reasons) {
          if (!day.reasons.includes(reason)) day.reasons.push(reason);
        }
        if (hoursPerDay - day.hours <= 1e-9 && remaining > 1e-9) {
          days.push(day);
          day = { dayOffset: day.dayOffset + 1, hours: 0, distance: 0, reasons: [] };
        }
      }
    }
  }
  if (day.hours > 0) days.push(day);
  return { totalHours, days };
}

export { walkRouteWithForecast };
