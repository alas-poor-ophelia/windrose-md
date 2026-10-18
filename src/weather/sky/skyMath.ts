/**
 * skyMath.ts
 *
 * Small pure helpers for the sky engine: seeded PRNG, wind vectors, dt
 * clamping and the weather -> effect-strength mapping.
 */

import type { SkyWeather } from './skyTypes';

/** Longest simulated step; a long hitch (tab in background, GC) never explodes positions. */
export const MAX_STEP_MS = 50;

export type Rng = () => number;

/** mulberry32: tiny, fast, good enough for visuals; deterministic per seed. */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a 32-bit string hash, so each area gets its own stream independent of area order. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Clamp a frame delta to [0, MAX_STEP_MS]; NaN/negative become 0. */
export function clampDt(dtMs: number): number {
  if (!(dtMs > 0)) return 0;
  return dtMs > MAX_STEP_MS ? MAX_STEP_MS : dtMs;
}

export interface Vec {
  x: number;
  y: number;
}

/**
 * Unit vector, in screen space (y down), of where the wind blows TO.
 * Downwind bearing = from + 180; the map draws north rotated clockwise by
 * `mapRotationDeg`, so the screen bearing is downwind + rotation.
 * Bearing b (clockwise from screen-up) maps to (sin b, -cos b).
 */
export function screenWindVector(windFromDeg: number, mapRotationDeg: number, out?: Vec): Vec {
  const b = ((windFromDeg + 180 + mapRotationDeg) * Math.PI) / 180;
  const v = out ?? { x: 0, y: 0 };
  v.x = Math.sin(b);
  v.y = -Math.cos(b);
  return v;
}

/** How thick the fog is, 0..1. Fog flag or poor visibility. */
export function fogDensity(w: SkyWeather): number {
  const vis = Number.isFinite(w.visibilityKm) ? w.visibilityKm : 10;
  if (w.fog) return clamp(1 - vis / 4, 0.45, 1);
  if (vis < 2) return clamp(((2 - vis) / 2) * 0.6, 0, 0.6);
  return 0;
}

/** True when this weather spawns precipitation right now. */
export function precipOn(w: SkyWeather): boolean {
  return w.precipActive && w.precipType !== 'none' && w.intensity > 0;
}

/** Particles per megapixel at intensity 1 (before the budget). */
const DENSITY_PER_MP: Record<SkyWeather['precipType'], number> = {
  none: 0,
  drizzle: 7000,
  rain: 6000,
  sleet: 5000,
  snow: 4800,
};

/** Desired precipitation particle count for a visible area of `px` pixels (backing px / pr^2). */
export function desiredParticles(w: SkyWeather, cssPx: number): number {
  if (!precipOn(w)) return 0;
  const i = clamp(w.intensity, 0, 1);
  return Math.round(DENSITY_PER_MP[w.precipType] * (cssPx / 1e6) * (0.2 + 0.8 * i));
}

/** Lightning applies to rain (and its sleet mix) at storm force. */
export function lightningOn(w: SkyWeather): boolean {
  return precipOn(w) && (w.precipType === 'rain' || w.precipType === 'sleet') && w.beaufort >= 8;
}
