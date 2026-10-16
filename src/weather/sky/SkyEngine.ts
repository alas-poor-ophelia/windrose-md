/**
 * SkyEngine.ts
 *
 * Framework-free animated weather "sky" for map overlays: rain, drizzle,
 * sleet, snow, fog banks, cloud shadows and storm lightning, each clipped to
 * a weather area. Pure canvas 2D; no DOM, no plugin types.
 *
 * Model
 *  - State is keyed by area id. Particles live in struct-of-arrays pools in
 *    BOUNDS-LOCAL pixels (offset from the area's bounds origin), so a pan
 *    carries the weather with the map; when bounds change size (zoom) the
 *    local positions are rescaled. Particles only spawn/wrap inside the part
 *    of the bounds that is on screen.
 *  - A global particle budget is split across areas in proportion to their
 *    visible pixel size; an area over its share is truncated immediately.
 *  - Rain is top-down: a drop appears, streaks along fall + wind for a short
 *    life, then lands as a small ring (splash). Snow drifts downwind with a
 *    sway and wraps at the visible edge; it fades in and out over its life.
 *  - Fog banks and cloud shadows are a handful of pre-rendered soft sprites
 *    drifting downwind; their strength eases toward the weather's level so
 *    hourly changes fade instead of popping. Cloud shadows are gathered on
 *    a private shadow layer first and composited at a capped strength, so
 *    where several drift over each other they never pool into one dark
 *    patch (CLOUD_SHADOW_MAX).
 *  - Nothing is allocated per particle per frame. Rain-like streaks are one
 *    path + one stroke per depth bucket per area.
 */

import type {
  SkyArea,
  SkyEngineOptions,
  SkyFrame,
  SkySpriteCanvas,
  SkyStats,
  SkyWeather,
} from './skyTypes';
import {
  clamp,
  clampDt,
  desiredParticles,
  fogDensity,
  hashString,
  lightningOn,
  mulberry32,
  precipOn,
  screenWindVector,
} from './skyMath';
import type { Rng, Vec } from './skyMath';
import { buildSkySprites, defaultCreateCanvas, SPRITE_VARIANTS } from './skySprites';
import type { SkySprites } from './skySprites';

const K_RAIN = 0;
const K_DRIZZLE = 1;
const K_SNOW = 2;
const K_PELLET = 3;
const K_SPLASH = 4;

const SPLASH_MS = 200;
const FOG_BLOBS = 10;
const CLOUD_BLOBS = 18;
const BOLT_MAX_POINTS = 40;
const FLASH_MS = 650;
/** Time constant for fog / cloud strength easing. */
const EASE_MS = 1500;
/**
 * The darkest cloud shadow anywhere, however many shadows overlap. A lone
 * shadow keeps its own strength (up to this); overlaps saturate here.
 */
const CLOUD_SHADOW_MAX = 0.42;

const TAU = Math.PI * 2;

class ParticlePool {
  n = 0;
  cap = 0;
  x: Float32Array = new Float32Array(0);
  y: Float32Array = new Float32Array(0);
  z: Float32Array = new Float32Array(0);
  life: Float32Array = new Float32Array(0);
  max: Float32Array = new Float32Array(0);
  ph: Float32Array = new Float32Array(0);
  kind: Uint8Array = new Uint8Array(0);

  ensure(n: number): void {
    if (n <= this.cap) return;
    let cap = Math.max(64, this.cap);
    while (cap < n) cap *= 2;
    const n0 = this.n;
    const f = (a: Float32Array): Float32Array => {
      const out = new Float32Array(cap);
      out.set(a.subarray(0, n0));
      return out;
    };
    this.x = f(this.x);
    this.y = f(this.y);
    this.z = f(this.z);
    this.life = f(this.life);
    this.max = f(this.max);
    this.ph = f(this.ph);
    const k = new Uint8Array(cap);
    k.set(this.kind.subarray(0, n0));
    this.kind = k;
    this.cap = cap;
  }

  /** Swap-remove particle i. */
  remove(i: number): void {
    const j = --this.n;
    if (i === j) return;
    this.x[i] = this.x[j];
    this.y[i] = this.y[j];
    this.z[i] = this.z[j];
    this.life[i] = this.life[j];
    this.max[i] = this.max[j];
    this.ph[i] = this.ph[j];
    this.kind[i] = this.kind[j];
  }

  scale(sx: number, sy: number): void {
    for (let i = 0; i < this.n; i++) {
      this.x[i] *= sx;
      this.y[i] *= sy;
    }
  }
}

interface Blobs {
  x: Float32Array;
  y: Float32Array;
  /** Size fraction 0..1 */
  r: Float32Array;
  /** Phase / speed jitter 0..1 */
  ph: Float32Array;
  laid: boolean;
}

function makeBlobs(n: number): Blobs {
  return {
    x: new Float32Array(n),
    y: new Float32Array(n),
    r: new Float32Array(n),
    ph: new Float32Array(n),
    laid: false,
  };
}

interface AreaState {
  id: string;
  rng: Rng;
  stamp: number;
  weather: SkyWeather;
  bw: number;
  bh: number;
  /** Visible part of the bounds, bounds-local px. */
  vx0: number;
  vy0: number;
  vx1: number;
  vy1: number;
  visPx: number;
  pool: ParticlePool;
  seeded: boolean;
  timeMs: number;
  target: number;
  /** Hard budget cap this step (>= target; keeps draining particles alive). */
  cap: number;
  /** Scratch for allocate(). */
  demand: number;
  done: boolean;
  // Area-level motion terms (set in step, read in draw)
  wx: number;
  wy: number;
  windKph: number;
  /** frame.pixelsPerKm at the last step (0 = unknown) */
  ppk: number;
  // Fog and cloud shadows
  fog: Blobs;
  cloud: Blobs;
  fogLvl: number;
  cloudLvl: number;
  // Lightning
  nextFlashMs: number;
  flashMs: number;
  bolt: Float32Array;
  boltN: number;
  branchFrom: number;
}

const WIND_SCRATCH: Vec = { x: 0, y: 0 };

type SpriteContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export class SkyEngine {
  readonly stats: SkyStats = { particles: 0, areas: 0, drawCalls: 0 };

  private readonly maxParticles: number;
  private readonly seed: number;
  private reducedMotion: boolean;
  private readonly createCanvas: (w: number, h: number) => SkySpriteCanvas | null;
  private readonly states = new Map<string, AreaState>();
  private readonly list: AreaState[] = [];
  private stamp = 0;
  private sprites: SkySprites | null = null;
  private spritesTried = false;
  /** Cloud shadow layer, frame-sized; null when no canvas can be created */
  private shadowLayer: SkySpriteCanvas | null = null;
  private shadowTried = false;
  private pr = 1;

  constructor(opts: SkyEngineOptions = {}) {
    this.maxParticles = Math.max(0, Math.floor(opts.maxParticles ?? 1800));
    this.seed = (opts.seed ?? 0x5eed) >>> 0;
    this.reducedMotion = opts.reducedMotion ?? false;
    this.createCanvas = opts.createCanvas ?? defaultCreateCanvas;
  }

  /** Toggle reduced motion (e.g. from prefers-reduced-motion). Re-lays a static scatter. */
  setReducedMotion(on: boolean): void {
    if (on === this.reducedMotion) return;
    this.reducedMotion = on;
    for (const st of this.list) st.seeded = false;
  }

  /** Drop all per-area state. */
  clear(): void {
    this.shadowLayer = null;
    this.shadowTried = false;
    this.states.clear();
    this.list.length = 0;
    this.stats.particles = 0;
    this.stats.areas = 0;
  }

  /**
   * Debug / test hook: a read-only view of an area's particles
   * (bounds-local px). Allocates; do not call per frame.
   */
  inspect(id: string): { n: number; x: Float32Array; y: Float32Array; kind: Uint8Array } | null {
    const st = this.states.get(id);
    if (!st) return null;
    const p = st.pool;
    return { n: p.n, x: p.x.slice(0, p.n), y: p.y.slice(0, p.n), kind: p.kind.slice(0, p.n) };
  }

  step(dtMs: number, frame: SkyFrame): void {
    const dt = this.reducedMotion ? 0 : clampDt(dtMs);
    const stamp = ++this.stamp;
    const pr = frame.pixelRatio ?? 1;
    this.pr = pr > 0 ? pr : 1;

    // Pass 1: attach state, follow bounds, measure visible size.
    for (const area of frame.areas) {
      const st = this.attach(area, stamp);
      this.follow(st, area, frame);
    }

    // Drop areas that left the frame (frees their particles).
    for (let i = this.list.length - 1; i >= 0; i--) {
      const st = this.list[i];
      if (st.stamp !== stamp) {
        this.states.delete(st.id);
        this.list.splice(i, 1);
      }
    }

    // Pass 2: budget, then simulate.
    this.allocate();
    let total = 0;
    for (const st of this.list) {
      if (st.pool.n > st.cap) st.pool.n = st.cap;
      this.simulate(st, dt);
      total += st.pool.n;
    }
    this.stats.particles = total;
    this.stats.areas = this.list.length;
  }

  draw(ctx: CanvasRenderingContext2D, frame: SkyFrame): void {
    if (!this.spritesTried) {
      this.spritesTried = true;
      this.sprites = buildSkySprites(this.createCanvas, this.seed);
    }
    this.stats.drawCalls = 0;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, frame.width, frame.height);
    for (const area of frame.areas) {
      const st = this.states.get(area.id);
      if (!st || st.visPx <= 0) continue;
      ctx.save();
      if (typeof area.clip === 'function') {
        ctx.beginPath();
        area.clip(ctx);
        ctx.clip();
      } else {
        ctx.clip(area.clip);
      }
      this.drawArea(ctx, st, area.bounds.x, area.bounds.y);
      ctx.restore();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- state

  private attach(area: SkyArea, stamp: number): AreaState {
    let st = this.states.get(area.id);
    if (!st) {
      const rng = mulberry32((this.seed ^ hashString(area.id)) >>> 0);
      st = {
        id: area.id,
        rng,
        stamp,
        weather: area.weather,
        bw: area.bounds.w,
        bh: area.bounds.h,
        vx0: 0, vy0: 0, vx1: 0, vy1: 0, visPx: 0,
        pool: new ParticlePool(),
        seeded: false,
        timeMs: 0,
        target: 0,
        cap: 0,
        demand: 0,
        done: false,
        wx: 0, wy: 0, windKph: 0, ppk: 0,
        fog: makeBlobs(FOG_BLOBS),
        cloud: makeBlobs(CLOUD_BLOBS),
        fogLvl: fogDensity(area.weather),
        cloudLvl: clamp(area.weather.cloudCover, 0, 1),
        nextFlashMs: 1500 + rng() * 4000,
        flashMs: -1,
        bolt: new Float32Array(BOLT_MAX_POINTS * 2),
        boltN: 0,
        branchFrom: 0,
      };
      this.states.set(area.id, st);
      this.list.push(st);
    }
    st.stamp = stamp;
    st.weather = area.weather;
    return st;
  }

  /** Rescale on zoom, recompute the visible window and the wind vector. */
  private follow(st: AreaState, area: SkyArea, frame: SkyFrame): void {
    const b = area.bounds;
    if (st.bw > 0 && st.bh > 0 && b.w > 0 && b.h > 0 && (b.w !== st.bw || b.h !== st.bh)) {
      const sx = b.w / st.bw;
      const sy = b.h / st.bh;
      st.pool.scale(sx, sy);
      for (let i = 0; i < FOG_BLOBS; i++) { st.fog.x[i] *= sx; st.fog.y[i] *= sy; }
      for (let i = 0; i < CLOUD_BLOBS; i++) { st.cloud.x[i] *= sx; st.cloud.y[i] *= sy; }
      for (let i = 0; i < st.boltN; i++) { st.bolt[2 * i] *= sx; st.bolt[2 * i + 1] *= sy; }
    }
    st.bw = b.w;
    st.bh = b.h;
    const x0 = Math.max(b.x, 0);
    const y0 = Math.max(b.y, 0);
    const x1 = Math.min(b.x + b.w, frame.width);
    const y1 = Math.min(b.y + b.h, frame.height);
    if (x1 <= x0 || y1 <= y0) {
      st.visPx = 0;
      st.vx0 = st.vy0 = st.vx1 = st.vy1 = 0;
    } else {
      st.vx0 = x0 - b.x;
      st.vy0 = y0 - b.y;
      st.vx1 = x1 - b.x;
      st.vy1 = y1 - b.y;
      st.visPx = (x1 - x0) * (y1 - y0);
    }
    const w = screenWindVector(st.weather.windFromDeg, frame.mapRotationDeg, WIND_SCRATCH);
    st.wx = w.x;
    st.wy = w.y;
    st.windKph = Math.max(0, st.weather.windSpeedKph || 0);
    const ppk = frame.pixelsPerKm ?? 0;
    st.ppk = ppk > 0 ? ppk : 0;
  }

  /**
   * Split the global budget. Each area demands max(desired, live) particles
   * (live ones may be draining out); demands are water-filled in proportion
   * to visible pixel size, so a small area that needs little frees budget
   * for big ones and the total cap never exceeds maxParticles.
   */
  private allocate(): void {
    const pr2 = this.pr * this.pr;
    let pending = 0;
    for (const st of this.list) {
      const desired = st.visPx > 0 ? desiredParticles(st.weather, st.visPx / pr2) : 0;
      st.target = desired;
      st.demand = Math.max(desired, st.pool.n);
      st.cap = 0;
      st.done = st.demand <= 0 || st.visPx <= 0;
      if (!st.done) pending++;
    }
    let remaining = this.maxParticles;
    while (pending > 0) {
      let px = 0;
      for (const st of this.list) if (!st.done) px += st.visPx;
      let satisfied = 0;
      let used = 0;
      for (const st of this.list) {
        if (st.done) continue;
        if (st.demand <= (remaining * st.visPx) / px) {
          st.cap = st.demand;
          used += st.demand;
          satisfied++;
        }
      }
      if (satisfied === 0) {
        for (const st of this.list) {
          if (!st.done) st.cap = Math.floor((remaining * st.visPx) / px);
        }
        break;
      }
      for (const st of this.list) if (!st.done && st.cap > 0) st.done = true;
      remaining -= used;
      pending -= satisfied;
    }
    for (const st of this.list) if (st.target > st.cap) st.target = st.cap;
  }

  // ------------------------------------------------------------ simulation

  private simulate(st: AreaState, dt: number): void {
    const w = st.weather;
    const fogTarget = fogDensity(w);
    const cloudTarget = clamp(w.cloudCover, 0, 1);

    if (this.reducedMotion) {
      // Static scatter: settle counts, never move anything.
      st.fogLvl = fogTarget;
      st.cloudLvl = cloudTarget;
      st.flashMs = -1;
      if (st.visPx <= 0) return;
      this.layBlobs(st);
      const p = st.pool;
      if (!st.seeded || p.n < st.target) {
        while (p.n < st.target) this.spawn(st, true);
        st.seeded = true;
      } else if (p.n > st.target) {
        p.n = st.target;
      }
      for (let i = 0; i < p.n; i++) if (p.kind[i] === K_SPLASH) p.kind[i] = K_RAIN;
      return;
    }

    st.timeMs += dt;
    const k = dt > 0 ? 1 - Math.exp(-dt / EASE_MS) : 0;
    st.fogLvl += (fogTarget - st.fogLvl) * k;
    st.cloudLvl += (cloudTarget - st.cloudLvl) * k;
    if (st.visPx <= 0) return;

    this.layBlobs(st);
    this.moveBlobs(st, dt);
    this.moveParticles(st, dt);

    // Spawn toward the target: instant steady state the first time an area
    // is seen, ramped afterwards so precipitation starting reads as onset.
    const p = st.pool;
    if (!st.seeded) {
      while (p.n < st.target) this.spawn(st, true);
      st.seeded = true;
    } else if (p.n < st.target && dt > 0) {
      let budget = Math.ceil((st.target * dt) / 220) + 1;
      while (p.n < st.target && budget-- > 0) this.spawn(st, false);
    }

    this.stepLightning(st, dt);
  }

  private moveParticles(st: AreaState, dt: number): void {
    const p = st.pool;
    if (p.n === 0 || dt <= 0) return;
    const s = dt / 1000;
    const pr = this.pr;
    const wet = st.weather.precipType === 'sleet';
    const rainWind = Math.min(st.windKph * 7, 760) * pr;
    const drizWind = Math.min(st.windKph * 4.5, 480) * pr;
    const snowWind = Math.min(st.windKph * 2.6, 420) * pr;
    const rainFall = 520 * pr;
    const drizFall = 210 * pr;
    const m = 12 * pr;
    const x0 = st.vx0 - m, x1 = st.vx1 + m, y0 = st.vy0 - m, y1 = st.vy1 + m;
    const ww = x1 - x0, wh = y1 - y0;
    const t = st.timeMs / 1000;

    let i = 0;
    while (i < p.n) {
      const kind = p.kind[i];
      const z = p.z[i];
      p.life[i] -= dt;
      if (kind === K_SNOW) {
        const kz = 0.55 + 0.7 * z;
        const fall = (wet ? 70 : 26 + 30 * z) * pr;
        const sway = (8 + 16 * p.ph[i]) * pr * Math.sin(t * (1.1 + p.ph[i]) + p.ph[i] * TAU);
        p.x[i] += (st.wx * snowWind * kz + sway) * s;
        p.y[i] += (st.wy * snowWind * kz + fall * kz) * s;
        if (p.x[i] < x0) p.x[i] += ww; else if (p.x[i] > x1) p.x[i] -= ww;
        if (p.y[i] < y0) p.y[i] += wh; else if (p.y[i] > y1) p.y[i] -= wh;
        if (p.life[i] <= 0) { p.remove(i); continue; }
      } else if (kind === K_SPLASH) {
        if (p.life[i] <= 0) { p.remove(i); continue; }
      } else {
        const kz = 0.65 + 0.7 * z;
        let vx: number, vy: number;
        if (kind === K_DRIZZLE) {
          vx = st.wx * drizWind * kz;
          vy = st.wy * drizWind * kz + drizFall * kz;
        } else if (kind === K_PELLET) {
          vx = st.wx * rainWind * 0.85 * kz;
          vy = st.wy * rainWind * 0.85 * kz + rainFall * 1.1 * kz;
        } else {
          vx = st.wx * rainWind * kz;
          vy = st.wy * rainWind * kz + rainFall * kz;
        }
        p.x[i] += vx * s;
        p.y[i] += vy * s;
        if (p.life[i] <= 0) {
          if (kind === K_RAIN && z > 0.25) {
            p.kind[i] = K_SPLASH;
            p.life[i] = p.max[i] = SPLASH_MS * (0.7 + 0.6 * p.ph[i]);
          } else {
            p.remove(i);
            continue;
          }
        }
      }
      i++;
    }
  }

  private spawn(st: AreaState, steady: boolean): void {
    const p = st.pool;
    p.ensure(p.n + 1);
    const i = p.n++;
    const r = st.rng;
    const type = st.weather.precipType;
    let kind = K_RAIN;
    if (type === 'drizzle') kind = K_DRIZZLE;
    else if (type === 'snow') kind = K_SNOW;
    else if (type === 'sleet') kind = r() < 0.55 ? K_PELLET : K_SNOW;
    const w = st.vx1 - st.vx0;
    const h = st.vy1 - st.vy0;
    // Rain enters slightly upwind so streaks fill the windward edge.
    p.x[i] = st.vx0 + r() * w;
    p.y[i] = st.vy0 + r() * h;
    p.z[i] = r();
    p.ph[i] = r();
    let max: number;
    if (kind === K_SNOW) max = 3500 + r() * 5000;
    else if (kind === K_DRIZZLE) max = 380 + r() * 380;
    else if (kind === K_PELLET) max = 240 + r() * 200;
    else max = 300 + r() * 260;
    p.max[i] = max;
    p.life[i] = steady ? max * (0.05 + 0.95 * r()) : max;
    p.kind[i] = kind;
  }

  /**
   * Jittered-grid layout, visited in a stride order, so blobs spread evenly
   * and the first k (shown at partial cover) are spread too.
   */
  private layBlobs(st: AreaState): void {
    if (!st.fog.laid) {
      this.layGrid(st, st.fog, FOG_BLOBS);
      st.fog.laid = true;
    }
    if (!st.cloud.laid) {
      this.layGrid(st, st.cloud, CLOUD_BLOBS);
      st.cloud.laid = true;
    }
  }

  private layGrid(st: AreaState, b: Blobs, n: number): void {
    const r = st.rng;
    const w = st.vx1 - st.vx0;
    const h = st.vy1 - st.vy0;
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / Math.max(1, h))));
    const rows = Math.ceil(n / cols);
    for (let i = 0; i < n; i++) {
      const c = (i * 7) % n;
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      b.x[i] = st.vx0 + ((cx + 0.15 + 0.7 * r()) / cols) * w;
      b.y[i] = st.vy0 + ((cy + 0.15 + 0.7 * r()) / rows) * h;
      b.r[i] = r();
      b.ph[i] = r();
    }
  }

  private fogRadius(st: AreaState, i: number): number {
    const span = Math.sqrt((st.vx1 - st.vx0) * (st.vy1 - st.vy0));
    return span * (0.26 + 0.22 * st.fog.r[i]);
  }

  private cloudRadius(st: AreaState, i: number): number {
    const span = Math.sqrt((st.vx1 - st.vx0) * (st.vy1 - st.vy0));
    const frac = st.cloud.r[i];
    // Real clouds are 1.5-5 km; never smaller than a readable fraction of the area.
    if (st.ppk > 0) return clamp((1.5 + 3.5 * frac) * st.ppk, span * (0.2 + 0.15 * frac), span * 0.55);
    return span * (0.22 + 0.2 * frac);
  }

  private moveBlobs(st: AreaState, dt: number): void {
    if (dt <= 0) return;
    const s = dt / 1000;
    const pr = this.pr;
    const fogSpeed = Math.max(5, st.windKph * 0.55) * pr;
    const cloudSpeed = Math.max(9, st.windKph * 1.5) * pr;
    for (let i = 0; i < FOG_BLOBS; i++) {
      const v = fogSpeed * (0.6 + 0.6 * st.fog.ph[i]);
      st.fog.x[i] += st.wx * v * s;
      st.fog.y[i] += st.wy * v * s;
      this.wrapBlob(st, st.fog, i, this.fogRadius(st, i));
    }
    for (let i = 0; i < CLOUD_BLOBS; i++) {
      const v = cloudSpeed * (0.85 + 0.3 * st.cloud.ph[i]);
      st.cloud.x[i] += st.wx * v * s;
      st.cloud.y[i] += st.wy * v * s;
      this.wrapBlob(st, st.cloud, i, this.cloudRadius(st, i) * 1.2);
    }
  }

  private wrapBlob(st: AreaState, b: Blobs, i: number, r: number): void {
    const x0 = st.vx0 - r, x1 = st.vx1 + r, y0 = st.vy0 - r, y1 = st.vy1 + r;
    const w = x1 - x0, h = y1 - y0;
    if (b.x[i] < x0) b.x[i] += w; else if (b.x[i] > x1) b.x[i] -= w;
    if (b.y[i] < y0) b.y[i] += h; else if (b.y[i] > y1) b.y[i] -= h;
  }

  private stepLightning(st: AreaState, dt: number): void {
    if (st.flashMs >= 0) {
      st.flashMs += dt;
      if (st.flashMs > FLASH_MS) st.flashMs = -1;
    }
    if (!lightningOn(st.weather)) return;
    st.nextFlashMs -= dt;
    if (st.nextFlashMs > 0) return;
    const w = st.weather;
    const storm = clamp((w.beaufort - 7) / 5, 0.2, 1) * (0.5 + clamp(w.intensity, 0, 1));
    st.nextFlashMs = 2500 + (st.rng() * 9000) / storm;
    st.flashMs = 0;
    this.buildBolt(st);
  }

  /** Jagged main channel plus one fork, bounds-local px. */
  private buildBolt(st: AreaState): void {
    const r = st.rng;
    const w = st.vx1 - st.vx0;
    const h = st.vy1 - st.vy0;
    const main = 16;
    let x = st.vx0 + w * (0.2 + 0.6 * r());
    let y = st.vy0 + h * (0.02 + 0.1 * r());
    const len = h * (0.45 + 0.35 * r());
    const seg = len / main;
    const drift = (r() - 0.5) * 0.6;
    let n = 0;
    st.bolt[n * 2] = x; st.bolt[n * 2 + 1] = y; n++;
    for (let i = 0; i < main; i++) {
      x += (drift + (r() - 0.5) * 1.6) * seg;
      y += seg * (0.7 + 0.5 * r());
      st.bolt[n * 2] = x; st.bolt[n * 2 + 1] = y; n++;
    }
    const from = 4 + Math.floor(r() * 6);
    st.branchFrom = n;
    x = st.bolt[from * 2];
    y = st.bolt[from * 2 + 1];
    st.bolt[n * 2] = x; st.bolt[n * 2 + 1] = y; n++;
    const side = r() < 0.5 ? -1 : 1;
    for (let i = 0; i < 7; i++) {
      x += side * (0.5 + r() * 0.9) * seg;
      y += seg * (0.4 + 0.6 * r());
      st.bolt[n * 2] = x; st.bolt[n * 2 + 1] = y; n++;
    }
    st.boltN = n;
  }

  // ------------------------------------------------------------------ draw

  private drawArea(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number): void {
    const w = st.weather;
    const pr = this.pr;
    const vx = ox + st.vx0, vy = oy + st.vy0;
    const vw = st.vx1 - st.vx0, vh = st.vy1 - st.vy0;
    const sprites = this.sprites;

    // 1. Overcast dimming, then cloud shadows (on the ground).
    const cl = st.cloudLvl;
    if (cl > 0.5) {
      ctx.globalAlpha = (cl - 0.5) * (w.precipType === 'snow' ? 0.12 : 0.24);
      ctx.fillStyle = 'rgb(18,24,36)';
      ctx.fillRect(vx, vy, vw, vh);
      this.stats.drawCalls++;
    }
    if (cl > 0.02) this.drawClouds(ctx, st, ox, oy, sprites);

    // 2. Splashes (on the ground, under fog and falling rain).
    this.drawSplashes(ctx, st, ox, oy);

    // 3. Fog: uniform haze plus drifting banks; precipitation adds a little mist.
    const mist = precipOn(w) ? clamp(w.intensity, 0, 1) * (w.precipType === 'drizzle' ? 0.16 : 0.07) : 0;
    const haze = st.fogLvl * 0.3 + mist;
    if (haze > 0.005) {
      ctx.globalAlpha = Math.min(0.55, haze);
      ctx.fillStyle = 'rgb(206,202,192)';
      ctx.fillRect(vx, vy, vw, vh);
      this.stats.drawCalls++;
    }
    if (st.fogLvl > 0.02) this.drawFog(ctx, st, ox, oy, sprites);
    if (precipOn(w) && (w.precipType === 'snow' || w.precipType === 'sleet')) {
      // Falling snow whitens the air; more so in a blizzard. Kept faint:
      // the map is usually light already, and region names must still read.
      ctx.globalAlpha = clamp(w.intensity, 0, 1) * (0.04 + 0.08 * clamp(st.windKph / 70, 0, 1));
      ctx.fillStyle = 'rgb(236,242,248)';
      ctx.fillRect(vx, vy, vw, vh);
      this.stats.drawCalls++;
    }

    // 4. Falling precipitation.
    const p = st.pool;
    if (p.n > 0) {
      const ia = 0.65 + 0.35 * clamp(w.intensity, 0, 1);
      ctx.lineCap = 'round';
      this.strokeStreaks(ctx, st, ox, oy, K_DRIZZLE, 'rgb(206,218,230)', 0.8 * pr, 0.22 * ia, 0.42 * ia);
      this.strokeStreaks(ctx, st, ox, oy, K_RAIN, 'rgb(190,208,226)', 1.15 * pr, 0.3 * ia, 0.72 * ia);
      this.strokeStreaks(ctx, st, ox, oy, K_PELLET, 'rgb(228,238,248)', 1.7 * pr, 0.45, 0.8);
      this.drawSnow(ctx, st, ox, oy, sprites);
    }

    // 5. Lightning.
    if (st.flashMs >= 0) this.drawLightning(ctx, st, ox, oy, vx, vy, vw, vh);
    ctx.globalAlpha = 1;
  }

  /** The frame-sized cloud shadow layer, cleared; null when none can be made */
  private shadowContext(width: number, height: number): SpriteContext | null {
    if (!this.shadowTried) {
      this.shadowTried = true;
      this.shadowLayer = this.createCanvas(Math.max(1, width), Math.max(1, height));
    }
    const layer = this.shadowLayer;
    if (layer == null) return null;
    if (layer.width !== width || layer.height !== height) {
      layer.width = Math.max(1, width);
      layer.height = Math.max(1, height);
    }
    const lctx = layer.getContext('2d');
    if (lctx == null) return null;
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalAlpha = 1;
    lctx.clearRect(0, 0, layer.width, layer.height);
    return lctx;
  }

  private drawClouds(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number, sprites: SkySprites | null): void {
    const cover = st.cloudLvl;
    const shown = cover * CLOUD_BLOBS;
    const ang = Math.atan2(st.wy, st.wx);
    // Under falling precipitation the light is flat: soften the shadows.
    const wet = precipOn(st.weather) ? 0.5 : 1;
    const c = Math.cos(ang), s = Math.sin(ang);
    // Shadows gather on the layer at full strength (overlaps saturate at
    // opaque there) and the layer is laid down at CLOUD_SHADOW_MAX, so a
    // lone shadow keeps its strength and a pile-up cannot get darker.
    const layer = sprites ? this.shadowContext(ctx.canvas.width, ctx.canvas.height) : null;
    const target: SpriteContext = layer ?? ctx;
    const gain = layer != null ? 1 / CLOUD_SHADOW_MAX : 1;
    let drawn = 0;
    for (let i = 0; i < CLOUD_BLOBS; i++) {
      const vis = clamp(shown - i, 0, 1);
      if (vis <= 0) break;
      const r = this.cloudRadius(st, i);
      // Shadows read best in broken cloud; under overcast the dim wash takes over.
      const alpha = vis * (0.26 + 0.3 * cover) * (1 - 0.65 * clamp((cover - 0.7) / 0.3, 0, 1)) * wet;
      target.globalAlpha = Math.min(1, alpha * gain);
      const x = ox + st.cloud.x[i], y = oy + st.cloud.y[i];
      if (sprites) {
        // Stretched along the wind: clouds are streets, not discs.
        const sx = 1.45, sy = 0.95;
        target.setTransform(c * sx, s * sx, -s * sy, c * sy, x, y);
        target.drawImage(sprites.cloud[i % SPRITE_VARIANTS], -r, -r, 2 * r, 2 * r);
      } else {
        // No layer without sprites: keep each shadow light so overlaps stay bearable
        target.globalAlpha = Math.min(CLOUD_SHADOW_MAX, alpha) * 0.6;
        target.fillStyle = 'rgb(14,20,32)';
        target.beginPath();
        target.arc(x, y, r * 0.6, 0, TAU);
        target.fill();
      }
      drawn++;
      this.stats.drawCalls++;
    }
    target.setTransform(1, 0, 0, 1, 0, 0);
    if (layer != null && drawn > 0 && this.shadowLayer != null) {
      ctx.globalAlpha = CLOUD_SHADOW_MAX;
      ctx.drawImage(this.shadowLayer, 0, 0);
      this.stats.drawCalls++;
    }
  }

  private drawFog(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number, sprites: SkySprites | null): void {
    const t = st.timeMs / 1000;
    for (let i = 0; i < FOG_BLOBS; i++) {
      const breathe = 0.75 + 0.25 * Math.sin(t * (0.25 + 0.2 * st.fog.ph[i]) + st.fog.ph[i] * TAU);
      ctx.globalAlpha = clamp(st.fogLvl * 0.55 * breathe, 0, 1);
      const r = this.fogRadius(st, i);
      const x = ox + st.fog.x[i], y = oy + st.fog.y[i];
      if (sprites) {
        ctx.drawImage(sprites.fog[i % SPRITE_VARIANTS], x - r * 1.3, y - r, 2.6 * r, 2 * r);
      } else {
        ctx.fillStyle = 'rgb(214,209,198)';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, TAU);
        ctx.fill();
      }
      this.stats.drawCalls++;
    }
  }

  private drawSplashes(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number): void {
    const p = st.pool;
    const pr = this.pr;
    let any = false;
    ctx.beginPath();
    for (let i = 0; i < p.n; i++) {
      if (p.kind[i] !== K_SPLASH) continue;
      const age = 1 - p.life[i] / p.max[i];
      const r = (0.8 + 3.6 * age) * pr * (0.6 + 0.6 * p.z[i]);
      const x = ox + p.x[i], y = oy + p.y[i];
      ctx.moveTo(x + r, y);
      ctx.ellipse(x, y, r, r * 0.7, 0, 0, TAU);
      any = true;
    }
    if (!any) return;
    ctx.globalAlpha = 0.32 * (0.6 + 0.4 * clamp(st.weather.intensity, 0, 1));
    ctx.strokeStyle = 'rgb(196,214,230)';
    ctx.lineWidth = 0.8 * pr;
    ctx.stroke();
    this.stats.drawCalls++;
  }

  /** Streaks of one kind in three depth buckets: one path + one stroke each. */
  private strokeStreaks(
    ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number,
    kind: number, color: string, width: number, aFar: number, aNear: number
  ): void {
    const p = st.pool;
    const pr = this.pr;
    let windK: number, fallK: number, lenS: number;
    if (kind === K_DRIZZLE) {
      windK = Math.min(st.windKph * 4.5, 480) * pr; fallK = 210 * pr; lenS = 0.03;
    } else if (kind === K_PELLET) {
      windK = Math.min(st.windKph * 7, 760) * 0.85 * pr; fallK = 572 * pr; lenS = 0.012;
    } else {
      windK = Math.min(st.windKph * 7, 760) * pr; fallK = 520 * pr; lenS = 0.042;
    }
    ctx.strokeStyle = color;
    for (let b = 0; b < 3; b++) {
      const lo = b / 3, hi = (b + 1) / 3;
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < p.n; i++) {
        if (p.kind[i] !== kind) continue;
        const z = p.z[i];
        if (z < lo || z >= hi) continue;
        const kz = 0.65 + 0.7 * z;
        // Streaks grow in over the first 60 ms so new drops do not pop.
        const born = Math.min(1, (p.max[i] - p.life[i]) / 60);
        const l = lenS * kz * born;
        const dx = (st.wx * windK * kz) * l;
        const dy = (st.wy * windK * kz + fallK * kz) * l;
        const x = ox + p.x[i], y = oy + p.y[i];
        ctx.moveTo(x - dx, y - dy);
        ctx.lineTo(x, y);
        any = true;
      }
      if (!any) continue;
      ctx.globalAlpha = aFar + (aNear - aFar) * (b / 2);
      ctx.lineWidth = width * (0.75 + 0.35 * b);
      ctx.stroke();
      this.stats.drawCalls++;
    }
  }

  private drawSnow(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number, sprites: SkySprites | null): void {
    const p = st.pool;
    const pr = this.pr;
    const wet = st.weather.precipType === 'sleet';
    const reduced = this.reducedMotion;
    if (!sprites) {
      ctx.fillStyle = 'rgb(244,248,252)';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      let any = false;
      for (let i = 0; i < p.n; i++) {
        if (p.kind[i] !== K_SNOW) continue;
        const r = (0.8 + 1.6 * p.z[i]) * pr;
        const x = ox + p.x[i], y = oy + p.y[i];
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
        any = true;
      }
      if (any) { ctx.fill(); this.stats.drawCalls++; }
      return;
    }
    const img = sprites.flake;
    // Blizzard: faint motion trails behind wind-driven flakes, one stroke.
    const gust = clamp((st.windKph - 25) / 50, 0, 1);
    if (gust > 0 && !reduced) {
      const snowWind = Math.min(st.windKph * 2.6, 420) * pr;
      ctx.beginPath();
      for (let i = 0; i < p.n; i++) {
        if (p.kind[i] !== K_SNOW || p.z[i] < 0.35) continue;
        const kz = 0.55 + 0.7 * p.z[i];
        const l = 0.03 * gust;
        const x = ox + p.x[i], y = oy + p.y[i];
        ctx.moveTo(x - st.wx * snowWind * kz * l, y - (st.wy * snowWind * kz + 40 * pr * kz) * l);
        ctx.lineTo(x, y);
      }
      ctx.globalAlpha = 0.2 * gust;
      ctx.strokeStyle = 'rgb(240,245,250)';
      ctx.lineWidth = 2 * pr;
      ctx.stroke();
      this.stats.drawCalls++;
    }
    for (let i = 0; i < p.n; i++) {
      if (p.kind[i] !== K_SNOW) continue;
      const z = p.z[i];
      const size = (wet ? 3.5 + 3.5 * z : 4 + 8 * z) * pr;
      let env = 1;
      if (!reduced) {
        const age = p.max[i] - p.life[i];
        env = Math.min(1, age / 500, p.life[i] / 900);
      }
      ctx.globalAlpha = env * (0.5 + 0.5 * z);
      ctx.drawImage(img, ox + p.x[i] - size / 2, oy + p.y[i] - size / 2, size, size);
      this.stats.drawCalls++;
    }
  }

  private drawLightning(
    ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number,
    vx: number, vy: number, vw: number, vh: number
  ): void {
    const t = st.flashMs;
    // Double-pulse envelope: strike, dip, restrike, decay.
    let a: number;
    if (t < 70) a = 1;
    else if (t < 130) a = 0.3;
    else if (t < 210) a = 0.9;
    else a = 0.9 * Math.max(0, 1 - (t - 210) / (FLASH_MS - 210));
    if (a <= 0) return;
    ctx.globalAlpha = a * 0.32;
    ctx.fillStyle = 'rgb(226,232,255)';
    ctx.fillRect(vx, vy, vw, vh);
    this.stats.drawCalls++;
    if (t > 300 || st.boltN < 2) return;
    const pr = this.pr;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    this.boltPath(ctx, st, ox, oy, 0, st.branchFrom);
    this.boltPath(ctx, st, ox, oy, st.branchFrom, st.boltN);
    ctx.strokeStyle = 'rgb(170,190,255)';
    ctx.globalAlpha = a * 0.35;
    ctx.lineWidth = 7 * pr;
    ctx.stroke();
    ctx.strokeStyle = 'rgb(255,255,255)';
    ctx.globalAlpha = a;
    ctx.lineWidth = 1.8 * pr;
    ctx.stroke();
    ctx.beginPath();
    this.boltPath(ctx, st, ox, oy, st.branchFrom, st.boltN);
    ctx.globalAlpha = a * 0.7;
    ctx.lineWidth = 1 * pr;
    ctx.stroke();
    this.stats.drawCalls += 3;
  }

  private boltPath(ctx: CanvasRenderingContext2D, st: AreaState, ox: number, oy: number, from: number, to: number): void {
    ctx.moveTo(ox + st.bolt[from * 2], oy + st.bolt[from * 2 + 1]);
    for (let i = from + 1; i < to; i++) ctx.lineTo(ox + st.bolt[i * 2], oy + st.bolt[i * 2 + 1]);
  }
}
