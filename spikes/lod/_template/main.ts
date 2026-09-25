/**
 * spikes/lod/_template — the naive baseline.
 *
 * ~2,000 hex cells from the real `HexGeometry`, re-rendered from scratch on every
 * animation frame at the live zoom. No tiling, no caching, no level pyramid.
 * Every other LOD spike is compared against this one's report.json.
 *
 * Copy this folder to start a new spike:
 *   cp -r spikes/lod/_template spikes/lod/<slug>
 */
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { startFrameClock } from '../_shared/instrument';
import { runFixtureDemo } from '../_shared/fixtureDemo';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const MAX_RING = Number(params.get('rings') ?? 25); // ring 25 => 1 + 3*25*26 = 1951 cells
const HEX_SIZE = 24; // world px, hex centre -> vertex
// min zoom ~= "the whole 25-ring world fits in a 1280x800 viewport"; keeping the world
// filling the frame at min zoom is what stops capture.mjs from flagging false BLANKs.
const MIN_ZOOM = 0.38;
const MAX_ZOOM = 8;
const WHEEL_K = 0.0015; // zoom *= exp(-deltaY * WHEEL_K)
const DETAIL_AT = 18; // scaled hex size (px) above which per-cell detail is drawn
// ?fiducial=1 -> draw the 7x7 pure-magenta marker capture.mjs looks for (pixel-domain anchor check)
const FIDUCIAL = params.get('fiducial') === '1';
// ?holes=N -> deliberately skip an N-radius blob of cells, to prove hole detection bites
const HOLE_R = Number(params.get('holes') ?? 0) || 0;
const HOLE_AT = { q: 4, r: -2 };
// ?lie=N -> render everything N css px to the right of where worldAt/screenOf claim it is.
// A spike whose renderer and transform disagree passes the self-reported anchor check and
// FAILS the pixel-domain fiducial check. This is the calibration case for that metric.
const LIE = Number(params.get('lie') ?? 0) || 0;

const PALETTE = [
  '#2d4a63', '#37613f', '#5d7a3a', '#8a7a42',
  '#a4693c', '#7b4b52', '#4a4f6b', '#6b8fa3',
];

// `?fixture=1` swaps the naive baseline world for the SHARED nested fixture
// (spikes/lod/_shared/fixture.ts) rendered flat — the fixture's own proof.
const FIXTURE_MODE = params.get('fixture') === '1';

// ------------------------------------------------------------------ baseline
function runBaseline(): void {
// ------------------------------------------------------------------ world
interface CellRec { q: number; r: number; wx: number; wy: number; fill: string; ink: string }

function hash32(a: number, b: number, seed: number): number {
  let h = seed ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const geometry = new HexGeometry(HEX_SIZE, 'flat', null);

const axialDist = (q: number, r: number, q2: number, r2: number): number => {
  const dq = q - q2;
  const dr = r - r2;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
};

const cells: CellRec[] = [];
for (const { q, r } of geometry.getAllRadialCells(MAX_RING)) {
  if (HOLE_R > 0 && axialDist(q, r, HOLE_AT.q, HOLE_AT.r) < HOLE_R) continue; // deliberate gap
  const w = geometry.hexToWorld(q, r);
  // coarse blobs (terrain) + fine per-cell jitter (shade) => deterministic, seeded
  const blob = hash32(Math.floor(q / 3), Math.floor(r / 3), SEED);
  const fine = hash32(q, r, SEED * 2654435761);
  const base = PALETTE[blob % PALETTE.length];
  const lift = ((fine % 24) - 12) / 255;
  cells.push({
    q, r, wx: w.worldX, wy: w.worldY,
    fill: shade(base, lift),
    ink: shade(base, lift + 0.16),
  });
}

function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number): number => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}

// unit hex corner offsets in world px (flat-top), precomputed once
const CORNERS: Array<{ x: number; y: number }> = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * 60 * i;
  CORNERS.push({ x: HEX_SIZE * Math.cos(a), y: HEX_SIZE * Math.sin(a) });
}

// ------------------------------------------------------------------ world footprint (convex hull)
// capture.mjs masks its hole detection to this polygon: "inside the world, nothing may be
// background-coloured". Built once in WORLD px, and built CONSERVATIVELY: the hull of the
// OUTERMOST RING'S CENTRES, not of its corners. A hex rosette's outer boundary zigzags, so a
// corner hull would span the notches between edge cells and report ~150 phantom holes per
// frame. Every point inside the centre hull is genuinely covered by a cell.
// Built from the FULL ring set — a deliberate ?holes= gap must stay inside the footprint.
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  for (const { q, r } of geometry.getAllRadialCells(MAX_RING)) {
    if (axialDist(q, r, 0, 0) !== MAX_RING) continue;
    const w = geometry.hexToWorld(q, r);
    pts.push({ x: w.worldX, y: w.worldY });
  }
  pts.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (src: Array<{ x: number; y: number }>): Array<{ x: number; y: number }> => {
    const out: Array<{ x: number; y: number }> = [];
    for (const p of src) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return [...build(pts), ...build([...pts].reverse())];
})();

// ------------------------------------------------------------------ viewport
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

let cssW = 0;
let cssY = 0;
let zoom = 1;
let offX = 0;
let offY = 0; // screen = off + world * zoom   (CSS px)

let cellsDrawn = 0;
let detailDrawn = 0;
let framesDrawn = 0;
// world point the magenta marker is pinned to; the rig re-pins it to the cursor anchor
const fiducialWorld = { x: 0, y: 0 };

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssY = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssY * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function fitWorld(): void {
  const span = (MAX_RING + 1) * geometry.horizSpacing * 2;
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(cssW, cssY) / span));
  offX = cssW / 2;
  offY = cssY / 2; // world origin is the centre hex
}

// ------------------------------------------------------------------ draw
const clock = startFrameClock();

function draw(): void {
  clock.beginDraw();
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, cssW, cssY);

  const scaled = HEX_SIZE * zoom;
  const margin = scaled * 2;
  const detail = scaled >= DETAIL_AT;
  const stroke = scaled >= 5;
  cellsDrawn = 0;
  detailDrawn = 0;

  ctx.lineWidth = Math.max(0.5, Math.min(1.5, scaled * 0.04));
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const sx = offX + LIE + c.wx * zoom;
    const sy = offY + c.wy * zoom;
    if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssY + margin) continue;

    ctx.beginPath();
    ctx.moveTo(sx + CORNERS[0].x * zoom, sy + CORNERS[0].y * zoom);
    for (let k = 1; k < 6; k++) ctx.lineTo(sx + CORNERS[k].x * zoom, sy + CORNERS[k].y * zoom);
    ctx.closePath();
    ctx.fillStyle = c.fill;
    ctx.fill();
    if (stroke) ctx.stroke();
    cellsDrawn++;

    if (detail) {
      // stand-in for authored detail that only resolves when zoomed in
      ctx.fillStyle = c.ink;
      ctx.fillRect(sx - scaled * 0.12, sy - scaled * 0.12, scaled * 0.24, scaled * 0.24);
      detailDrawn++;
    }
  }

  // Fiducial: 7x7 of PURE #ff00ff, snapped so its measured centroid lands within 0.5 px of
  // screenOf(fiducialWorld). capture.mjs finds it by scanning pixels, which is the only
  // anchor check a spike cannot fake through its own worldAt/screenOf.
  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x + LIE - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // HUD — keeps the contact sheet readable at thumbnail size
  ctx.fillStyle = '#161b24'; // OPAQUE: a translucent HUD over dark strokes composites to within +-6 of the bg colour and reads as a hole
  ctx.fillRect(8, 8, 230, 46);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`zoom ${zoom.toFixed(3)}  hex ${scaled.toFixed(1)}px`, 16, 26);
  ctx.fillText(`drawn ${cellsDrawn}/${cells.length}  detail ${detailDrawn}`, 16, 44);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ input (the spike's own gesture code)
function worldAt(x: number, y: number): { x: number; y: number } {
  return { x: (x - offX) / zoom, y: (y - offY) / zoom };
}
function screenOf(wx: number, wy: number): { x: number; y: number } {
  return { x: offX + wx * zoom, y: offY + wy * zoom };
}
function zoomAbout(next: number, ax: number, ay: number): void {
  const clamped = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
  const w = worldAt(ax, ay);
  zoom = clamped;
  offX = ax - w.x * zoom;
  offY = ay - w.y * zoom;
}

canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
}, { passive: false });

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', () => { resize(); });

// ------------------------------------------------------------------ contract surface
resize();
fitWorld();

const ready = new Promise<void>((resolve) => {
  requestAnimationFrame(() => {
    draw();
    requestAnimationFrame(() => { loop(); resolve(); });
  });
});

(window as unknown as { __lod: unknown }).__lod = {
  ready,
  worldAt,
  screenOf,
  getZoom: () => zoom,
  setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssY / 2),
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  // pixel-domain anchor check (only rendered when ?fiducial=1)
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  // convex hull of the world in CSS px — capture.mjs masks hole detection to this
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => ({
    levelsLive: 1,
    cellsTotal: cells.length,
    cellsDrawn,
    detailDrawn,
    cacheHits: 0,
    framesDrawn,
  }),
  reset: () => { resize(); fitWorld(); clock.clear(); },
};
}

// ------------------------------------------------------------------ dispatch
if (FIXTURE_MODE) runFixtureDemo();
else runBaseline();
