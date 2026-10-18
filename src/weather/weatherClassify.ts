/**
 * weatherClassify.ts
 *
 * Local stand-ins for the weather plugin's apiVersion-1 `classify()` and
 * `describe()`, used only when the installed plugin predates them (0.3.x).
 * Same standard scales as the plugin's design: WMO Beaufort, 16-point
 * compass, WMO oktas, the Met Office general-public visibility scale and
 * the IMD 24-hour rainfall categories. Feels-like here is the air
 * temperature with wind chill only (no heat index): a fallback, not a
 * replacement. Pure; keys on numeric fields, never on descriptor words.
 */

// Type-only imports
import type {
  WadjetClassification,
  WadjetPrecipitationClass,
  WadjetVisibilityClass,
  WadjetWeatherReport,
} from '#types/integrations/wadjet.types';

/** Lower bounds (km/h) of Beaufort forces 1..12 */
const BEAUFORT_MIN_KPH = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];

const BEAUFORT_LABELS = [
  'Calm', 'Light air', 'Light breeze', 'Gentle breeze', 'Moderate breeze', 'Fresh breeze',
  'Strong breeze', 'Near gale', 'Gale', 'Strong gale', 'Storm', 'Violent storm', 'Hurricane force',
];

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW',
];

function beaufortForce(speedKph: number): number {
  let force = 0;
  for (let i = 0; i < BEAUFORT_MIN_KPH.length; i++) {
    if (speedKph >= BEAUFORT_MIN_KPH[i]) force = i + 1;
  }
  return force;
}

function compassPoint(directionDeg: number): string {
  const normalized = ((directionDeg % 360) + 360) % 360;
  return COMPASS_POINTS[Math.round(normalized / 22.5) % 16];
}

function oktasOf(cloudCover: number): number {
  if (cloudCover <= 0) return 0;
  if (cloudCover >= 1) return 8;
  return Math.min(7, Math.max(1, Math.round(cloudCover * 8)));
}

function visibilityClass(km: number): WadjetVisibilityClass {
  if (km < 1) return 'very-poor';
  if (km < 4) return 'poor';
  if (km < 10) return 'moderate';
  if (km < 20) return 'good';
  if (km < 40) return 'very-good';
  return 'excellent';
}

function precipitationClass(report: WadjetWeatherReport): WadjetPrecipitationClass {
  const mm = report.precipitation.amountMm;
  if (report.precipitation.type === 'none' || !(mm > 0)) return 'none';
  if (mm < 2.5) return 'very-light';
  if (mm < 15.6) return 'light';
  if (mm < 64.5) return 'moderate';
  if (mm < 115.6) return 'heavy';
  if (mm < 204.5) return 'very-heavy';
  return 'extremely-heavy';
}

/** NWS / Environment Canada wind chill (°C) when it applies, else the air temperature */
function feelsLikeC(tempC: number, windKph: number): number {
  if (tempC > 10 || windKph <= 4.8) return Math.round(tempC * 10) / 10;
  const v = Math.pow(windKph, 0.16);
  const chill = 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
  return Math.round(chill * 10) / 10;
}

/** The fallback classification of a report */
function classifyLocally(report: WadjetWeatherReport): WadjetClassification {
  const beaufort = beaufortForce(report.wind.speedKph);
  const feelsLike: WadjetClassification['feelsLike'] = { mean: feelsLikeC(report.temperature.mean, report.wind.speedKph) };
  if (typeof report.temperature.current === 'number' && Number.isFinite(report.temperature.current)) {
    feelsLike.current = feelsLikeC(report.temperature.current, report.wind.speedKph);
  }
  return {
    beaufort,
    beaufortLabel: BEAUFORT_LABELS[beaufort],
    compass: compassPoint(report.wind.directionDeg),
    oktas: oktasOf(report.cloudCover),
    visibility: visibilityClass(report.visibilityKm),
    precipitation: precipitationClass(report),
    frozenPrecipitation: report.precipitation.type === 'sleet' || report.precipitation.type === 'snow',
    feelsLike,
  };
}

/** A plain one-line description ("Light rain, 4°C") for when the plugin has no wording */
function describeLocally(report: WadjetWeatherReport): string {
  const { type } = report.precipitation;
  const temp = `${Math.round(report.temperature.mean)}°C`;
  if (type !== 'none' && report.precipitation.amountMm > 0) {
    const strength = report.precipitation.intensity >= 0.6 ? 'Heavy' : report.precipitation.intensity >= 0.3 ? 'Steady' : 'Light';
    return `${strength} ${type}, ${temp}`;
  }
  const oktas = oktasOf(report.cloudCover);
  const sky = oktas >= 7 ? 'Overcast' : oktas >= 3 ? 'Cloudy' : 'Clear';
  return `${sky}, ${temp}`;
}

export { classifyLocally, describeLocally };
