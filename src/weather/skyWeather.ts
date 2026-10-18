/**
 * skyWeather.ts
 *
 * Pure mapping from the weather store's reports to what the map animates
 * and points: the Sky engine's SkyWeather per area, a cheap "nothing to
 * draw" test, and the compass wind needle (which area, which way, what
 * it says).
 *
 * Hour rule: with a view hour (the Almanac's hour slider) the Sky asks for
 * the hourly report at that hour, so the precipitation window
 * (`precipitation.active`) opens and closes as the hour moves. With no view
 * hour the map shows the DAY: the Sky reads the daily report and animates
 * the day's precipitation whenever the day has any (`precipitation.type`
 * is not `none`); no representative hour is picked. A plugin without
 * hourly reports answers the daily report, read the same way.
 *
 * Fog: the compass needle only ever reads a revealed area and never the
 * area of a fogged centre cell, so the wind cannot give hidden weather away.
 */

// Type-only imports
import type { WeatherArea } from '#types/contexts/weather.types';
import type { WadjetClassification, WadjetWeatherReport } from '#types/integrations/wadjet.types';
import type { SkyWeather } from './sky/skyTypes';

/** Precipitation lighter than this is not animated (matches the tint's threshold) */
const SKY_PRECIP_MIN_INTENSITY = 0.05;
/** Cloud cover below this casts no shadow worth animating */
const SKY_CLOUD_MIN_COVER = 0.2;

const PRECIP_TYPES: ReadonlySet<string> = new Set(['none', 'drizzle', 'rain', 'sleet', 'snow']);

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * The Sky's input for one report. `hourly` says whether the report was
 * asked for at an hour: then its `precipitation.active` window applies
 * (absent means active). A daily report animates whatever precipitation the
 * day has. Fog comes from the `fog` condition tag or a poor visibility class.
 */
function toSkyWeather(report: WadjetWeatherReport, classification: WadjetClassification, hourly: boolean): SkyWeather {
  const precip = report.precipitation;
  const type = PRECIP_TYPES.has(precip.type) ? precip.type : 'none';
  const visibility = classification.visibility;
  return {
    precipType: type,
    intensity: clamp01(precip.intensity),
    precipActive: hourly ? precip.active ?? true : type !== 'none',
    windSpeedKph: Math.max(0, finiteOr(report.wind.speedKph, 0)),
    windFromDeg: finiteOr(report.wind.directionDeg, 0),
    cloudCover: clamp01(report.cloudCover),
    fog: report.conditions.includes('fog') || visibility === 'very-poor' || visibility === 'poor',
    visibilityKm: finiteOr(report.visibilityKm, 10),
    beaufort: Math.min(12, Math.max(0, Math.round(finiteOr(classification.beaufort, 0)))),
    temperatureC: finiteOr(report.temperature.current, finiteOr(report.temperature.mean, 10)),
  };
}

/** True when the Sky would draw nothing worth a frame: no precipitation now, no fog, thin cloud */
function isQuietSky(weather: SkyWeather): boolean {
  const precip = weather.precipActive && weather.precipType !== 'none' && weather.intensity >= SKY_PRECIP_MIN_INTENSITY;
  const murky = weather.fog || weather.visibilityKm < 2;
  return !precip && !murky && weather.cloudCover < SKY_CLOUD_MIN_COVER;
}

/** The compass needle's input */
interface CompassWind {
  /** World bearing the wind blows TOWARD, degrees clockwise from map north */
  towardDeg: number;
  /** 0..12 */
  beaufort: number;
  /** "Wind: Fresh breeze from WSW" */
  label: string;
}

function compassWind(report: WadjetWeatherReport, classification: WadjetClassification): CompassWind {
  const from = finiteOr(report.wind.directionDeg, 0);
  const toward = (((from + 180) % 360) + 360) % 360;
  const beaufort = Math.min(12, Math.max(0, Math.round(finiteOr(classification.beaufort, 0))));
  const label = beaufort === 0
    ? `Wind: ${classification.beaufortLabel}`
    : `Wind: ${classification.beaufortLabel} from ${classification.compass}`;
  return { towardDeg: toward, beaufort, label };
}

/** What the compass may see of the fog (WeatherFogView's slice) */
interface CompassFog {
  isFogged(cell: { x: number; y: number }): boolean;
  areaRevealed(area: WeatherArea): boolean;
}

/**
 * The area whose wind the compass shows, among REVEALED areas only: the
 * whole-map area when there is one, else the area under the view centre
 * (unless that cell is fogged), else the first revealed area; null when no
 * area is revealed (no needle). Without `fog` every area counts as revealed.
 */
function pickCompassArea(
  areas: readonly WeatherArea[],
  areaAt: (cell: { x: number; y: number }) => WeatherArea | null,
  centreCell: { x: number; y: number } | null,
  fog?: CompassFog | null
): WeatherArea | null {
  const revealed = fog != null ? areas.filter(area => fog.areaRevealed(area)) : areas;
  const mapArea = revealed.find(area => area.kind === 'map');
  if (mapArea != null) return mapArea;
  const centreHidden = centreCell != null && fog != null && fog.isFogged(centreCell);
  const atCentre = centreCell != null && !centreHidden ? areaAt(centreCell) : null;
  const revealedAtCentre = atCentre != null ? revealed.find(area => area.id === atCentre.id) : undefined;
  return revealedAtCentre ?? revealed[0] ?? null;
}

export { compassWind, isQuietSky, pickCompassArea, toSkyWeather };
export type { CompassWind };
