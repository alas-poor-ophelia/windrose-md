/**
 * weatherVisuals.ts
 *
 * Pure mapping from a weather report to how the map shows it: one dominant
 * visual kind with a 0..1 strength, its tint, and a compact badge text.
 * Keys on the report's numeric fields only — the descriptor words and
 * condition tags are user-editable free text.
 */

// Type-only imports
import type { WadjetWeatherReport } from '#types/integrations/wadjet.types';

export type WeatherVisualKind = 'clear' | 'cloudy' | 'drizzle' | 'rain' | 'sleet' | 'snow' | 'fog' | 'wind';

export interface WeatherVisual {
  kind: WeatherVisualKind;
  /** 0..1 — how pronounced the kind is; drives tint opacity */
  strength: number;
}

/** Precipitation lighter than this reads as dry on the map */
const PRECIP_VISIBLE_INTENSITY = 0.05;
const FOG_VISIBILITY_KM = 1;
const WINDY_KPH = 50;
const CLOUDY_COVER = 0.6;

/** Tint colour and its opacity range (at strength 0 and 1) per kind */
const WEATHER_TINTS: Record<WeatherVisualKind, { color: string; minOpacity: number; maxOpacity: number }> = {
  clear: { color: '#f2c94c', minOpacity: 0.04, maxOpacity: 0.12 },
  cloudy: { color: '#8f99a3', minOpacity: 0.14, maxOpacity: 0.26 },
  drizzle: { color: '#6fa8dc', minOpacity: 0.16, maxOpacity: 0.26 },
  rain: { color: '#3d7fc4', minOpacity: 0.2, maxOpacity: 0.42 },
  sleet: { color: '#7d8fb3', minOpacity: 0.22, maxOpacity: 0.44 },
  snow: { color: '#eef4ff', minOpacity: 0.28, maxOpacity: 0.58 },
  fog: { color: '#c9cdd1', minOpacity: 0.3, maxOpacity: 0.6 },
  wind: { color: '#7fc8b5', minOpacity: 0.12, maxOpacity: 0.26 },
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * The single kind a region shows. Falling precipitation outranks fog,
 * fog outranks wind, wind outranks sky cover — the order of what a
 * traveller would name first.
 */
function classifyWeatherVisual(report: WadjetWeatherReport): WeatherVisual {
  const { type, intensity } = report.precipitation;
  if (type !== 'none' && intensity >= PRECIP_VISIBLE_INTENSITY) {
    return { kind: type, strength: clamp01(intensity) };
  }
  if (report.visibilityKm <= FOG_VISIBILITY_KM) {
    return { kind: 'fog', strength: clamp01(1 - report.visibilityKm / FOG_VISIBILITY_KM) };
  }
  if (report.wind.speedKph >= WINDY_KPH) {
    return { kind: 'wind', strength: clamp01((report.wind.speedKph - WINDY_KPH) / WINDY_KPH) };
  }
  if (report.cloudCover >= CLOUDY_COVER) {
    return { kind: 'cloudy', strength: clamp01((report.cloudCover - CLOUDY_COVER) / (1 - CLOUDY_COVER)) };
  }
  return { kind: 'clear', strength: clamp01(1 - report.cloudCover / CLOUDY_COVER) };
}

/** Fill colour and opacity for a region showing this visual */
function getWeatherTint(visual: WeatherVisual): { color: string; opacity: number } {
  const tint = WEATHER_TINTS[visual.kind];
  return {
    color: tint.color,
    opacity: tint.minOpacity + (tint.maxOpacity - tint.minOpacity) * visual.strength,
  };
}

/** Mean temperature as a whole-degree badge ("-3°"), in the weather plugin's unit preference */
function formatBadgeTemperature(report: WadjetWeatherReport, units: 'metric' | 'imperial'): string {
  const mean = units === 'imperial' ? report.temperature.mean * 9 / 5 + 32 : report.temperature.mean;
  return `${Math.round(mean)}°`;
}

export {
  classifyWeatherVisual,
  getWeatherTint,
  formatBadgeTemperature,
};
