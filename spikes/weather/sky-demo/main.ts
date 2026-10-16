/**
 * spikes/weather/sky-demo/main.ts
 *
 * Showcase for src/weather/sky/SkyEngine: a fake hex map with four weather
 * areas (snow gale from NW, steady rain with a SW breeze, fog, clear with
 * cloud shadows), each clipped to its hexes. Query flags:
 *   ?storm=1   make the rain area a storm (Beaufort 9, lightning)
 *   ?reduced=1 reducedMotion
 *   ?rot=30    map north rotation in degrees
 */
import { SkyEngine } from '../../../src/weather/sky/SkyEngine';
import type { SkyArea, SkyFrame, SkyWeather } from '../../../src/weather/sky/skyTypes';

const W = 1600;
const H = 860;
const SIZE = 30;
const SQ3 = Math.sqrt(3);
const params = new URLSearchParams(location.search);
const storm = params.get('storm') === '1';
const reduced = params.get('reduced') === '1';
const rot = Number(params.get('rot') ?? '0');

type Hex = { q: number; r: number };
const key = (q: number, r: number): string => `${q},${r}`;
const OX = 40;
const OY = 30;
function center(q: number, r: number): [number, number] {
  return [OX + SIZE * 1.5 * q, OY + SIZE * SQ3 * (r + q / 2)];
}
function corner(cx: number, cy: number, i: number): [number, number] {
  const a = (Math.PI / 180) * 60 * i;
  return [cx + SIZE * Math.cos(a), cy + SIZE * Math.sin(a)];
}

// ---- value noise for terrain
function hash(x: number, y: number): number {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const s = (t: number): number => t * t * (3 - 2 * t);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * s(xf) + (c - a) * s(yf) + (a - b - c + d) * s(xf) * s(yf);
}
function terrain(x: number, y: number): string {
  const e = noise(x / 260, y / 260) * 0.65 + noise(x / 90, y / 90) * 0.35;
  const m = noise(x / 180 + 40, y / 180 + 9);
  if (e < 0.3) return e < 0.22 ? '#2f5876' : '#3f6f8f';
  if (e < 0.34) return '#c9b98a';
  if (e > 0.72) return e > 0.8 ? '#e4e2dc' : '#8d877c';
  if (e > 0.62) return '#9a8a62';
  return m > 0.55 ? '#4c6b3c' : m > 0.4 ? '#6f8f4f' : '#8ca25c';
}

// ---- map
const all: Hex[] = [];
for (let q = 0; q < 36; q++) {
  for (let r = -Math.floor(q / 2) - 1; r < 18 - Math.floor(q / 2); r++) {
    const [cx, cy] = center(q, r);
    if (cx > -SIZE && cx < W + SIZE && cy > -SIZE && cy < H + SIZE) all.push({ q, r });
  }
}

function blob(cq: number, cr: number, radius: number, nibble: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = Math.max(-radius, -dq - radius); dr <= Math.min(radius, -dq + radius); dr++) {
      const d = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
      if (d === radius && hash(cq + dq, cr + dr + nibble) < 0.45) continue;
      out.push({ q: cq + dq, r: cr + dr });
    }
  }
  return out;
}

const NB: Array<[number, number]> = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

function hexPath(hexes: Hex[]): Path2D {
  const p = new Path2D();
  for (const hx of hexes) {
    const [cx, cy] = center(hx.q, hx.r);
    for (let i = 0; i < 6; i++) {
      const [x, y] = corner(cx, cy, i);
      if (i === 0) p.moveTo(x, y); else p.lineTo(x, y);
    }
    p.closePath();
  }
  return p;
}

function boundsOf(hexes: Hex[]): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const hx of hexes) {
    const [cx, cy] = center(hx.q, hx.r);
    x0 = Math.min(x0, cx - SIZE); x1 = Math.max(x1, cx + SIZE);
    y0 = Math.min(y0, cy - SIZE); y1 = Math.max(y1, cy + SIZE);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

const base: SkyWeather = {
  precipType: 'none', intensity: 0, precipActive: false, windSpeedKph: 10, windFromDeg: 270,
  cloudCover: 0.2, fog: false, visibilityKm: 20, beaufort: 2, temperatureC: 12,
};

interface DemoArea { id: string; name: string; hexes: Hex[]; weather: SkyWeather; tint: string }
const demo: DemoArea[] = [
  {
    id: 'snow', name: 'Frostmarch — heavy snow, gale from NW', hexes: blob(6, 1, 4, 1), tint: '#cfe0ee',
    weather: { ...base, precipType: 'snow', intensity: 0.95, precipActive: true, windSpeedKph: 68, windFromDeg: 315, cloudCover: 1, visibilityKm: 1.5, beaufort: 8, temperatureC: -9 },
  },
  {
    id: 'rain', name: storm ? 'Saltmere — thunderstorm from SW' : 'Saltmere — steady rain, breeze from SW',
    hexes: blob(22, -7, 4, 2), tint: '#9fb8cc',
    weather: storm
      ? { ...base, precipType: 'rain', intensity: 1, precipActive: true, windSpeedKph: 80, windFromDeg: 225, cloudCover: 1, visibilityKm: 3, beaufort: 9, temperatureC: 14 }
      : { ...base, precipType: 'rain', intensity: 0.7, precipActive: true, windSpeedKph: 24, windFromDeg: 225, cloudCover: 0.9, visibilityKm: 6, beaufort: 4, temperatureC: 11 },
  },
  {
    id: 'fog', name: 'Greywold — fog, light air', hexes: blob(14, 5, 4, 3), tint: '#d6d0c4',
    weather: { ...base, fog: true, visibilityKm: 0.3, windSpeedKph: 6, windFromDeg: 200, cloudCover: 0.6, beaufort: 1, temperatureC: 6 },
  },
  {
    id: 'clear', name: 'Sunreach — clear, cloud shadows', hexes: blob(29, -3, 4, 4), tint: '#e8d9a0',
    weather: { ...base, cloudCover: 0.55, windSpeedKph: 30, windFromDeg: 250, beaufort: 4, temperatureC: 22 },
  },
];

// ---- static map layer
const mapCtx = (document.getElementById('map') as HTMLCanvasElement).getContext('2d')!;
mapCtx.fillStyle = '#1b1f24';
mapCtx.fillRect(0, 0, W, H);
for (const hx of all) {
  const [cx, cy] = center(hx.q, hx.r);
  mapCtx.beginPath();
  for (let i = 0; i < 6; i++) {
    const [x, y] = corner(cx, cy, i);
    if (i === 0) mapCtx.moveTo(x, y); else mapCtx.lineTo(x, y);
  }
  mapCtx.closePath();
  mapCtx.fillStyle = terrain(cx, cy);
  mapCtx.fill();
  mapCtx.strokeStyle = 'rgba(20,24,20,0.28)';
  mapCtx.lineWidth = 1;
  mapCtx.stroke();
}
// a road and a river for texture
mapCtx.strokeStyle = 'rgba(120,90,55,0.8)';
mapCtx.lineWidth = 3;
mapCtx.setLineDash([9, 6]);
mapCtx.beginPath();
mapCtx.moveTo(60, 700); mapCtx.bezierCurveTo(400, 560, 700, 640, 980, 420); mapCtx.bezierCurveTo(1150, 300, 1350, 330, 1560, 180);
mapCtx.stroke();
mapCtx.setLineDash([]);
mapCtx.strokeStyle = '#4f86ad';
mapCtx.lineWidth = 4;
mapCtx.beginPath();
mapCtx.moveTo(760, 0); mapCtx.bezierCurveTo(700, 220, 860, 380, 760, 560); mapCtx.bezierCurveTo(700, 680, 820, 760, 780, 860);
mapCtx.stroke();

// ---- areas
const areas: SkyArea[] = demo.map((d) => ({ id: d.id, weather: d.weather, clip: hexPath(d.hexes), bounds: boundsOf(d.hexes) }));

// borders + labels above the sky
const lab = (document.getElementById('labels') as HTMLCanvasElement).getContext('2d')!;
for (const d of demo) {
  const set = new Set(d.hexes.map((hx) => key(hx.q, hx.r)));
  lab.strokeStyle = d.tint;
  lab.globalAlpha = 0.85;
  lab.lineWidth = 2;
  lab.setLineDash([7, 5]);
  lab.beginPath();
  for (const hx of d.hexes) {
    const [cx, cy] = center(hx.q, hx.r);
    for (let i = 0; i < 6; i++) {
      const [nq, nr] = NB[i];
      if (set.has(key(hx.q + nq, hx.r + nr))) continue;
      const [ax, ay] = corner(cx, cy, i);
      const [bx, by] = corner(cx, cy, (i + 1) % 6);
      lab.moveTo(ax, ay); lab.lineTo(bx, by);
    }
  }
  lab.stroke();
  lab.setLineDash([]);
  lab.globalAlpha = 1;
  const b = boundsOf(d.hexes);
  lab.font = '600 13px system-ui, sans-serif';
  const tw = lab.measureText(d.name).width;
  lab.fillStyle = 'rgba(16,19,24,0.78)';
  lab.fillRect(b.x + b.w / 2 - tw / 2 - 8, b.y + 14, tw + 16, 22);
  lab.fillStyle = '#eef3f8';
  lab.fillText(d.name, b.x + b.w / 2 - tw / 2, b.y + 30);
}

// ---- engine loop
const skyCtx = (document.getElementById('sky') as HTMLCanvasElement).getContext('2d')!;
const engine = new SkyEngine({ seed: 7, reducedMotion: reduced });
(window as unknown as { __engine: unknown }).__engine = engine;
const frame: SkyFrame = { width: W, height: H, areas, mapRotationDeg: rot, pixelsPerKm: 5, pixelRatio: 1 };
const hud = document.getElementById('hud')!;
const w = window as unknown as { __spikeReady?: boolean; __skyStats?: unknown };
let last = performance.now();
let acc = 0;
let frames = 0;
let drawMs = 0;
function tick(now: number): void {
  const dt = now - last;
  last = now;
  const t0 = performance.now();
  engine.step(dt, frame);
  engine.draw(skyCtx, frame);
  drawMs += performance.now() - t0;
  frames++;
  acc += dt;
  if (acc > 500) {
    w.__skyStats = { ...engine.stats, msPerFrame: +(drawMs / frames).toFixed(2) };
    hud.textContent = `particles ${engine.stats.particles}  draw calls ${engine.stats.drawCalls}  step+draw ${(drawMs / frames).toFixed(2)} ms`;
    acc = 0; frames = 0; drawMs = 0;
  }
  w.__spikeReady = true;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
