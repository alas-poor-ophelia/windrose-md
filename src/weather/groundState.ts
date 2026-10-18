/**
 * groundState.ts
 *
 * Windrose's own derivation of accumulated ground state (snow cover, mud)
 * from a run of daily weather reports. The weather plugin deliberately
 * does not provide this (its non-goals leave accumulated ground state to
 * consumers), so this is Windrose's opinion: a simple day-step heuristic
 * tuned to read plausibly at a table, not a hydrology model.
 *
 * Pure: no Preact, no Obsidian.
 *
 * The model, one day at a time (oldest to the target day):
 *
 * 1. Snowpack, as snow water-equivalent (SWE, mm of water).
 *    - Snow adds its amount to SWE when the day's mean temperature is at or
 *      below SNOW_MAX_MEAN_C; sleet adds half (the other half falls as
 *      liquid). Snow or sleet on a warmer day is treated as liquid.
 *    - Melt uses a degree-day factor on the day's HIGH: MELT_MM_PER_DEGREE_DAY
 *      mm of SWE per °C above 0. Meltwater soaks into the soil.
 *    - Depth: fresh snow is about 10:1 snow-to-water, so 1 mm SWE ≈ 1 cm of
 *      snow (SNOW_CM_PER_MM_SWE). Settling and compaction are ignored.
 *
 * 2. Soil wetness, a bucket in mm of water.
 *    - Filled by rain, drizzle, the liquid share of sleet/snow, and melt;
 *      capped at SOIL_CAPACITY_MM (the excess runs off).
 *    - Drained each day by percolation (SOIL_DRAINAGE_FRACTION of the bucket)
 *      and by evaporation, which grows with temperature above 0, with wind
 *      and with dry air: EVAP_MM_PER_DEGREE × max(0, mean) × (1 + wind ÷
 *      EVAP_WIND_KPH) × (EVAP_HUMIDITY_OFFSET − humidity). No evaporation
 *      under snow cover; nothing drains while the ground is frozen (high <= 0).
 *    - mud = (bucket − MUD_FROM_MM) ÷ (MUD_FULL_MM − MUD_FROM_MM), clamped to
 *      0..1. Frozen ground on the target day is hard, so its mud reads 0.
 *
 * 3. travelMultiplier is a TIME multiplier (>= 1 slows), the convention of
 *    the forecast walk: snow gives 1 + depth ÷ SNOW_DEPTH_FOR_MAX_CM (capped
 *    at 2.0 for deep snow), mud gives 1 + MUD_MAX_EFFECT × mud (1.5 when
 *    waterlogged); the worse of the two applies, capped at MAX_TRAVEL_MULTIPLIER.
 */

export type GroundPrecipType = 'none' | 'drizzle' | 'rain' | 'sleet' | 'snow';

export interface GroundDay {
  dayOrdinal: number;
  precipType: GroundPrecipType;
  amountMm: number;
  tempMeanC: number;
  tempHighC: number;
  windKph: number;
  /** Relative humidity 0..1 (a 0..100 percentage is accepted and scaled) */
  humidity: number;
}

export type GroundLabel = 'bare' | 'frost' | 'light snow' | 'snow' | 'deep snow' | 'muddy' | 'waterlogged' | 'dry';

export interface GroundState {
  snowDepthCm: number;
  /** 0..1 */
  mud: number;
  label: GroundLabel;
  /** TIME multiplier, >= 1 slows */
  travelMultiplier: number;
}

// --- Snowpack ---
/** Snow (and half of sleet) accumulates at or below this daily mean, °C */
const SNOW_MAX_MEAN_C = 1;
/** Share of sleet that lands as snow when cold enough */
const SLEET_SNOW_SHARE = 0.5;
/** Melt in mm of SWE per °C of the day's high above 0 */
const MELT_MM_PER_DEGREE_DAY = 3;
/** Fresh-snow density ~10:1 → 1 mm SWE ≈ 1 cm depth */
const SNOW_CM_PER_MM_SWE = 1;

// --- Soil ---
const SOIL_CAPACITY_MM = 40;
const SOIL_DRAINAGE_FRACTION = 0.1;
const EVAP_MM_PER_DEGREE = 0.25;
const EVAP_WIND_KPH = 25;
const EVAP_HUMIDITY_OFFSET = 1.25;
const MUD_FROM_MM = 6;
const MUD_FULL_MM = 30;
/** Bucket at or below this reads as dry ground */
const DRY_SOIL_MM = 3;

// --- Labels ---
const LIGHT_SNOW_CM = 1;
const SNOW_CM = 10;
const DEEP_SNOW_CM = 30;
const MUDDY_FROM = 0.3;
const WATERLOGGED_FROM = 0.75;

// --- Travel ---
const SNOW_DEPTH_FOR_MAX_CM = 50;
const MUD_MAX_EFFECT = 0.5;
const MAX_TRAVEL_MULTIPLIER = 2;

const BARE: GroundState = { snowDepthCm: 0, mud: 0, label: 'bare', travelMultiplier: 1 };

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeHumidity(value: number): number {
  const h = finiteOr(value, 0.5);
  return clamp(h > 1 ? h / 100 : h, 0, 1);
}

/**
 * Ground state on the last day of `history` (oldest .. target, inclusive).
 * Days are processed in dayOrdinal order. An empty history is bare ground.
 */
function deriveGroundState(history: GroundDay[]): GroundState {
  if (history.length === 0) return { ...BARE };
  const days = [...history].sort((a, b) => finiteOr(a.dayOrdinal, 0) - finiteOr(b.dayOrdinal, 0));

  let swe = 0;
  let soil = 0;
  let frozen = false;

  for (const day of days) {
    const amount = Math.max(0, finiteOr(day.amountMm, 0));
    const mean = finiteOr(day.tempMeanC, 10);
    const high = finiteOr(day.tempHighC, mean);
    const wind = Math.max(0, finiteOr(day.windKph, 0));
    const humidity = normalizeHumidity(day.humidity);
    const cold = mean <= SNOW_MAX_MEAN_C;

    let snowIn = 0;
    let liquidIn = 0;
    switch (day.precipType) {
      case 'snow':
        if (cold) snowIn = amount; else liquidIn = amount;
        break;
      case 'sleet':
        snowIn = cold ? amount * SLEET_SNOW_SHARE : 0;
        liquidIn = amount - snowIn;
        break;
      case 'rain':
      case 'drizzle':
        liquidIn = amount;
        break;
      default:
        break;
    }

    swe += snowIn;
    const melt = Math.min(swe, MELT_MM_PER_DEGREE_DAY * Math.max(0, high));
    swe -= melt;

    soil = Math.min(SOIL_CAPACITY_MM, soil + liquidIn + melt);
    frozen = high <= 0;
    if (!frozen) {
      const evaporation = swe > 0
        ? 0
        : Math.max(0, EVAP_MM_PER_DEGREE * Math.max(0, mean) * (1 + wind / EVAP_WIND_KPH) * (EVAP_HUMIDITY_OFFSET - humidity));
      soil = Math.max(0, soil * (1 - SOIL_DRAINAGE_FRACTION) - evaporation);
    }
  }

  const snowDepthCm = swe * SNOW_CM_PER_MM_SWE;
  const mud = frozen ? 0 : clamp((soil - MUD_FROM_MM) / (MUD_FULL_MM - MUD_FROM_MM), 0, 1);

  let label: GroundLabel;
  if (snowDepthCm >= DEEP_SNOW_CM) label = 'deep snow';
  else if (snowDepthCm >= SNOW_CM) label = 'snow';
  else if (snowDepthCm >= LIGHT_SNOW_CM) label = 'light snow';
  else if (mud >= WATERLOGGED_FROM) label = 'waterlogged';
  else if (mud >= MUDDY_FROM) label = 'muddy';
  else if (frozen) label = 'frost';
  else if (soil <= DRY_SOIL_MM) label = 'dry';
  else label = 'bare';

  const snowFactor = 1 + Math.min(1, snowDepthCm / SNOW_DEPTH_FOR_MAX_CM);
  const mudFactor = 1 + MUD_MAX_EFFECT * mud;
  const travelMultiplier = Math.min(MAX_TRAVEL_MULTIPLIER, Math.max(snowFactor, mudFactor));

  return { snowDepthCm, mud, label, travelMultiplier };
}

export { deriveGroundState };
