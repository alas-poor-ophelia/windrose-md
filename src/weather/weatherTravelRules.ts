/**
 * weatherTravelRules.ts
 *
 * Pure weather-to-travel math: turns a weather report into a speed
 * multiplier with the reasons behind it, and folds per-cell multipliers
 * into one per route segment.
 *
 * The weather plugin reports physical quantities only (it has no notion of
 * travel), so the mapping to speed lives here as a declarative rule table.
 * Rules key on numeric fields — never on the report's free-text conditions
 * or descriptor words, which users can rename.
 */

// Type-only imports
import type { WadjetPrecipType, WadjetWeatherReport } from '#types/integrations/wadjet.types';

/** Rules in one group compete (the slowest match wins); groups multiply together */
export type WeatherRuleGroup = 'precipitation' | 'wind' | 'visibility' | 'temperature';

/** Every stated bound must hold for the rule to match */
export interface WeatherRuleCondition {
  precipTypes?: WadjetPrecipType[];
  /** Precipitation intensity at or above (0..1) */
  minIntensity?: number;
  minWindKph?: number;
  maxVisibilityKm?: number;
  /** Mean temperature at or below (°C) */
  maxMeanTempC?: number;
  /** Mean temperature at or above (°C) */
  minMeanTempC?: number;
}

export interface WeatherTravelRule {
  id: string;
  /** User-facing reason shown beside the travel time */
  label: string;
  group: WeatherRuleGroup;
  /** Speed multiplier while the rule holds (must be > 0; < 1 slows travel) */
  multiplier: number;
  when: WeatherRuleCondition;
}

export interface WeatherTravelReason {
  label: string;
  multiplier: number;
}

/** A weather report's effect on travel speed */
export interface WeatherTravelEffect {
  multiplier: number;
  reasons: WeatherTravelReason[];
}

/** Stacked rules never slow travel below this fraction of normal speed */
const MIN_WEATHER_MULTIPLIER = 0.25;

const NO_EFFECT: WeatherTravelEffect = { multiplier: 1, reasons: [] };

/**
 * System-neutral defaults. A table rather than code so it can move into
 * travel packs (per-system weather rules) without touching the evaluator.
 */
const DEFAULT_WEATHER_TRAVEL_RULES: WeatherTravelRule[] = [
  { id: 'snow-heavy', label: 'Heavy snow', group: 'precipitation', multiplier: 0.5, when: { precipTypes: ['snow'], minIntensity: 0.6 } },
  { id: 'snow', label: 'Snow', group: 'precipitation', multiplier: 0.75, when: { precipTypes: ['snow'], minIntensity: 0.2 } },
  { id: 'sleet-heavy', label: 'Heavy sleet', group: 'precipitation', multiplier: 0.6, when: { precipTypes: ['sleet'], minIntensity: 0.6 } },
  { id: 'sleet', label: 'Sleet', group: 'precipitation', multiplier: 0.85, when: { precipTypes: ['sleet'], minIntensity: 0.2 } },
  { id: 'rain-heavy', label: 'Heavy rain', group: 'precipitation', multiplier: 0.75, when: { precipTypes: ['rain'], minIntensity: 0.6 } },
  { id: 'rain', label: 'Rain', group: 'precipitation', multiplier: 0.9, when: { precipTypes: ['rain'], minIntensity: 0.3 } },
  { id: 'wind-gale', label: 'Gale', group: 'wind', multiplier: 0.5, when: { minWindKph: 75 } },
  { id: 'wind-strong', label: 'Strong wind', group: 'wind', multiplier: 0.75, when: { minWindKph: 50 } },
  { id: 'fog-dense', label: 'Dense fog', group: 'visibility', multiplier: 0.5, when: { maxVisibilityKm: 0.2 } },
  { id: 'fog', label: 'Poor visibility', group: 'visibility', multiplier: 0.75, when: { maxVisibilityKm: 1 } },
  { id: 'cold-bitter', label: 'Bitter cold', group: 'temperature', multiplier: 0.75, when: { maxMeanTempC: -20 } },
  { id: 'heat-extreme', label: 'Extreme heat', group: 'temperature', multiplier: 0.75, when: { minMeanTempC: 40 } },
];

function ruleMatches(when: WeatherRuleCondition, report: WadjetWeatherReport): boolean {
  if (when.precipTypes != null && !when.precipTypes.includes(report.precipitation.type)) return false;
  if (when.minIntensity != null && !(report.precipitation.intensity >= when.minIntensity)) return false;
  if (when.minWindKph != null && !(report.wind.speedKph >= when.minWindKph)) return false;
  if (when.maxVisibilityKm != null && !(report.visibilityKm <= when.maxVisibilityKm)) return false;
  if (when.maxMeanTempC != null && !(report.temperature.mean <= when.maxMeanTempC)) return false;
  if (when.minMeanTempC != null && !(report.temperature.mean >= when.minMeanTempC)) return false;
  return true;
}

/**
 * A report's effect on travel speed. Within a group the slowest matching
 * rule wins (heavy snow supersedes snow); across groups the winners
 * multiply (snow in a gale is worse than either), floored at
 * MIN_WEATHER_MULTIPLIER. Rules with a non-positive multiplier are ignored
 * — a bad table degrades to "no effect", never to a wrong or infinite time.
 */
function evaluateWeatherTravel(
  report: WadjetWeatherReport,
  rules: WeatherTravelRule[] = DEFAULT_WEATHER_TRAVEL_RULES
): WeatherTravelEffect {
  const winners = new Map<WeatherRuleGroup, WeatherTravelRule>();
  for (const rule of rules) {
    if (!(rule.multiplier > 0) || !ruleMatches(rule.when, report)) continue;
    const current = winners.get(rule.group);
    if (current == null || rule.multiplier < current.multiplier) winners.set(rule.group, rule);
  }
  if (winners.size === 0) return NO_EFFECT;

  let multiplier = 1;
  const reasons: WeatherTravelReason[] = [];
  for (const rule of winners.values()) {
    multiplier *= rule.multiplier;
    reasons.push({ label: rule.label, multiplier: rule.multiplier });
  }
  return { multiplier: Math.max(MIN_WEATHER_MULTIPLIER, multiplier), reasons };
}

/**
 * One segment's effective weather multiplier from the cells it crosses.
 * Each cell is an equal share of the segment and time is distance ÷ speed,
 * so the shares combine as a harmonic mean — an arithmetic mean would
 * understate the cost of the slow cells. Cells without weather (null)
 * travel at normal speed. Reasons are the distinct labels along the way.
 */
function combineCellEffects(cellEffects: (WeatherTravelEffect | null)[]): WeatherTravelEffect {
  if (cellEffects.length === 0) return NO_EFFECT;

  let inverseSum = 0;
  const reasons: WeatherTravelReason[] = [];
  for (const effect of cellEffects) {
    inverseSum += 1 / (effect?.multiplier ?? 1);
    for (const reason of effect?.reasons ?? []) {
      if (!reasons.some(r => r.label === reason.label)) reasons.push(reason);
    }
  }
  if (reasons.length === 0) return NO_EFFECT;
  return { multiplier: cellEffects.length / inverseSum, reasons };
}

/**
 * How much longer a route takes with weather than without, as a ratio
 * (1 = no change, 1.28 = 28% longer). Independent of travel mode: a mode's
 * speed scales every segment alike and cancels out. `baseMultipliers` are
 * the non-weather multipliers (terrain) per segment.
 */
function computeWeatherTimeRatio(
  segmentDistances: number[],
  baseMultipliers: number[],
  weatherMultipliers: number[]
): number {
  let baseTime = 0;
  let weatherTime = 0;
  for (let i = 0; i < segmentDistances.length; i++) {
    const base = segmentDistances[i] / (baseMultipliers[i] ?? 1);
    baseTime += base;
    weatherTime += base / (weatherMultipliers[i] ?? 1);
  }
  return baseTime > 0 ? weatherTime / baseTime : 1;
}

/** The distinct reasons across a route's segments, in route order */
function summarizeWeatherReasons(effects: WeatherTravelEffect[]): string[] {
  const labels: string[] = [];
  for (const effect of effects) {
    for (const reason of effect.reasons) {
      if (!labels.includes(reason.label)) labels.push(reason.label);
    }
  }
  return labels;
}

/**
 * One line for the travel card: "Heavy snow, Gale (+28%)". The percentage
 * is the extra travel time and is dropped when it rounds to nothing. Null
 * when no segment has weather.
 */
function formatWeatherNote(effects: WeatherTravelEffect[], timeRatio: number): string | null {
  const labels = summarizeWeatherReasons(effects);
  if (labels.length === 0) return null;
  const percent = Math.round((timeRatio - 1) * 100);
  return percent > 0 ? `${labels.join(', ')} (+${percent}%)` : labels.join(', ');
}

export {
  MIN_WEATHER_MULTIPLIER,
  DEFAULT_WEATHER_TRAVEL_RULES,
  evaluateWeatherTravel,
  combineCellEffects,
  computeWeatherTimeRatio,
  summarizeWeatherReasons,
  formatWeatherNote,
};
