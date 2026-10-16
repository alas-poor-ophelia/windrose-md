/**
 * travelInterpreter.ts
 *
 * Windrose's travel interpreter (`windrose.travel`, facet "travel"),
 * registered on the U+13080 Weather plugin's interpreter registry so other
 * plugins can see it, list it, and replace it with their own rules.
 *
 * ## The "travel" result shape — a WINDROSE convention
 *
 * The weather plugin attaches no meaning to facets or result shapes. For
 * the "travel" facet Windrose reads:
 *
 *     { speedMultiplier: number; label?: string }
 *
 * - `speedMultiplier` scales travel SPEED, like terrain multipliers do:
 *   1 = no effect, 0.5 = half speed (twice the time), > 1 = faster.
 *   Always finite; clamped to [MIN_TRAVEL_SPEED, MAX_TRAVEL_SPEED]. There is
 *   no Infinity or 0: "impassable" is MIN_TRAVEL_SPEED (0.05) with a label
 *   saying so. Results are plain JSON-serialisable objects.
 * - `label` names the reason(s) shown beside the travel time ("Heavy snow, Gale").
 *
 * Third-party interpreters selected in the "Weather travel rules" setting
 * are read defensively: a finite `speedMultiplier` is used; failing that, a
 * finite `multiplier` is ALSO read as a speed factor; anything else is
 * ignored (factor 1, no label).
 */

// Type-only imports
import type { WadjetInterpretContext, WadjetInterpreter, WadjetWeatherReport } from '#types/integrations/wadjet.types';
import type { WeatherTravelResult } from '#types/contexts/weather.types';
import type { WeatherTravelEffect } from './weatherTravelRules';

import { evaluateWeatherTravel } from './weatherTravelRules';

/** Registry id of Windrose's own travel interpreter (the setting's default) */
const WINDROSE_TRAVEL_INTERPRETER_ID = 'windrose.travel';

/** Facet Windrose reads travel results from */
const TRAVEL_FACET = 'travel';

/** Slowest a result may make travel: effectively impassable */
const MIN_TRAVEL_SPEED = 0.05;

/** Fastest a result may make travel */
const MAX_TRAVEL_SPEED = 2;

/** Windrose's "travel" facet result (see the file header) */
type TravelInterpretation = WeatherTravelResult;

const NO_TRAVEL_EFFECT: TravelInterpretation = { speedMultiplier: 1 };

function clampSpeed(value: number): number {
  return Math.min(MAX_TRAVEL_SPEED, Math.max(MIN_TRAVEL_SPEED, value));
}

/**
 * Windrose's own rules: the weather rule table (weatherTravelRules.ts)
 * expressed in the travel convention. `options` is reserved for derived
 * inputs (ground state) and ignored for now.
 */
function interpretTravelLocally(report: WadjetWeatherReport, _options?: Record<string, unknown>): TravelInterpretation {
  const effect = evaluateWeatherTravel(report);
  if (effect.reasons.length === 0) return NO_TRAVEL_EFFECT;
  return {
    speedMultiplier: clampSpeed(effect.multiplier),
    label: effect.reasons.map(reason => reason.label).join(', '),
  };
}

/**
 * Read any interpreter's travel result under Windrose's convention. Null
 * when it carries no usable factor (the caller treats that as no effect).
 */
function normalizeTravelResult(raw: unknown): TravelInterpretation | null {
  if (raw == null || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const speed = typeof record.speedMultiplier === 'number' && Number.isFinite(record.speedMultiplier)
    ? record.speedMultiplier
    : typeof record.multiplier === 'number' && Number.isFinite(record.multiplier)
      ? record.multiplier
      : null;
  if (speed == null) return null;

  const label = typeof record.label === 'string' && record.label.trim() !== '' ? record.label.trim() : undefined;
  if (speed <= MIN_TRAVEL_SPEED) {
    return { speedMultiplier: MIN_TRAVEL_SPEED, label: label ?? 'Impassable' };
  }
  const result: TravelInterpretation = { speedMultiplier: clampSpeed(speed) };
  if (label != null) result.label = label;
  return result;
}

/** A travel result as the route fold's per-cell effect */
function travelEffectFromInterpretation(result: TravelInterpretation): WeatherTravelEffect {
  if (result.speedMultiplier === 1 && result.label == null) return { multiplier: 1, reasons: [] };
  return {
    multiplier: result.speedMultiplier,
    reasons: result.label != null ? [{ label: result.label, multiplier: result.speedMultiplier }] : [],
  };
}

/** One-line rendering for the weather plugin's code block `interpret:` option */
function formatTravelInterpretation(result: TravelInterpretation): string {
  const percent = Math.round((1 / result.speedMultiplier - 1) * 100);
  const time = percent === 0 ? 'normal travel time' : percent > 0 ? `travel takes ${percent}% longer` : `travel takes ${-percent}% less time`;
  return result.label != null ? `${result.label}: ${time}` : `Travel: ${time}`;
}

/** The interpreter object Windrose registers */
const windroseTravelInterpreter: WadjetInterpreter<TravelInterpretation> = {
  id: WINDROSE_TRAVEL_INTERPRETER_ID,
  label: 'Windrose travel rules',
  facet: TRAVEL_FACET,
  description: 'Travel speed from precipitation, wind, visibility and temperature. Result: { speedMultiplier, label }.',
  interpret: (report: WadjetWeatherReport, ctx: WadjetInterpretContext) => interpretTravelLocally(report, ctx?.options),
  format: formatTravelInterpretation,
};

export {
  WINDROSE_TRAVEL_INTERPRETER_ID,
  TRAVEL_FACET,
  MIN_TRAVEL_SPEED,
  MAX_TRAVEL_SPEED,
  interpretTravelLocally,
  normalizeTravelResult,
  travelEffectFromInterpretation,
  formatTravelInterpretation,
  windroseTravelInterpreter,
};
