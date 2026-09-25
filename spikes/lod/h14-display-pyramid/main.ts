/**
 * spikes/lod/h14-display-pyramid — disposable raster display pyramid.
 *
 * The viewer NEVER draws documents. It rasterises the composed world (docs at their
 * affines, painter-ordered by depth) into rectangular TILE x TILE display tiles at
 * power-of-two levels z=0..13. The screen is a grid of those tiles blitted at
 * pixel-exact integer edges. Display resolution is decoupled from hex subdivision.
 *
 * Query params:
 *   genBudgetMs=4    ms per frame spent rasterising tiles
 *   fade=150         ms raster-arrival cross-fade (0 = hard swap)
 *   lruMB=64         tile cache byte budget (level 0 is pinned)
 *   genDelayMs=0     FAULT INJECTION: extra busy-wait ms per tile raster
 *   tile=256         tile edge in px
 *   fiducial=1       draw the 7x7 pure-magenta anchor marker
 */
import {
  buildFixture, docToWorld, coarseColorAt,
  HEX_SIZE,
  type Doc, type FixtureCell,
} from '../_shared/fixture';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const GEN_BUDGET_MS = Number(params.get('genBudgetMs') ?? 4);
const FADE = Number(params.get('fade') ?? 150);
const LRU_BYTES = Number(params.get('lruMB') ?? 64) * 1024 * 1024;
const GEN_DELAY_MS = Number(params.get('genDelayMs') ?? 0) || 0;
const TILE = Number(params.get('tile') ?? 256) || 256;
const FIDUCIAL = params.get('fiducial') === '1';
/** ?probe=1 -> willReadFrequently on the main canvas (needed by markRef/diffRef, but it
 *  forces a CPU-backed surface and costs ~4 ms/frame, so it is OFF by default). */
const PROBE = params.get('probe') === '1';
/** ?smooth=low|medium|high — imageSmoothingQuality for the tile blit */
const SMOOTH = (params.get('smooth') ?? 'low') as ImageSmoothingQuality;

const MIN_ZOOM = 0.62;
const MAX_ZOOM = 400;
const WHEEL_K = 0.0015;
/** world px -> tile px at level z. z=4 is 1:1; z=0 puts the whole world in ~4 tiles. */
const LEVEL_MIN = 0;
const LEVEL_MAX = 13;
const levelScale = (z: number): number => Math.pow(2, z - 4);
const levelForZoom = (z: number): number =>
  Math.max(LEVEL_MIN, Math.min(LEVEL_MAX, Math.round(Math.log2(z)) + 4));
/** a doc whose hexes are smaller than this many px at the target scale is covered by its parent */
const MIN_VISIBLE = 0.55;

const fx = buildFixture(SEED);

// ------------------------------------------------------------------ prepared source
interface DrawCell { wx: number; wy: number; cell: FixtureCell }
interface DocDraw {
  doc: Doc;
  worldHexSize: number;
  corners: Array<{ x: number; y: number }>;
  cells: DrawCell[];
  minX: number; minY: number; maxX: number; maxY: number;
}

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

const docDraws: DocDraw[] = fx.docs
  .slice()
  .sort((a, b) => a.depth - b.depth)
  .map((doc) => {
    const worldHexSize = HEX_SIZE * doc.transformToWorld.scale;
    const cells: DrawCell[] = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const c of doc.cells.values()) {
      const local = doc.geometry.hexToWorld(c.q, c.r);
      const w = docToWorld(doc, local.worldX, local.worldY);
      cells.push({ wx: w.x, wy: w.y, cell: c });
      if (w.x < minX) minX = w.x;
      if (w.x > maxX) maxX = w.x;
      if (w.y < minY) minY = w.y;
      if (w.y > maxY) maxY = w.y;
    }
    return {
      doc, worldHexSize, corners: flatCorners(worldHexSize), cells,
      minX: minX - worldHexSize, minY: minY - worldHexSize,
      maxX: maxX + worldHexSize, maxY: maxY + worldHexSize,
    };
  });

const CELLS_TOTAL = docDraws.reduce((n, d) => n + d.cells.length, 0);
const WORLD = {
  minX: Math.min(...docDraws.map((d) => d.minX)),
  minY: Math.min(...docDraws.map((d) => d.minY)),
  maxX: Math.max(...docDraws.map((d) => d.maxX)),
  maxY: Math.max(...docDraws.map((d) => d.maxY)),
};

/**
 * THE source-of-truth renderer. Paints the composed world into `c2`, which covers the
 * world rect [ox, ox + w/s] x [oy, oy + h/s]. Used for tile rasterisation.
 * Labels are NOT baked — they are a live vector overlay (H4 bake/live split).
 */
function paintWorld(
  c2: CanvasRenderingContext2D, ox: number, oy: number, s: number, w: number, h: number,
): number {
  const vx0 = ox; const vy0 = oy; const vx1 = ox + w / s; const vy1 = oy + h / s;
  let painted = 0;
  for (const d of docDraws) {
    const scaled = d.worldHexSize * s;
    if (scaled < MIN_VISIBLE) continue;                       // parent already covers it
    if (d.maxX < vx0 || d.minX > vx1 || d.maxY < vy0 || d.minY > vy1) continue;
    const margin = d.worldHexSize * 1.2;
    const stroke = scaled >= 5;
    c2.lineWidth = Math.max(0.4, Math.min(1.4, scaled * 0.04));
    c2.strokeStyle = 'rgba(0,0,0,0.42)';
    const cor = d.corners;
    for (const c of d.cells) {
      if (c.wx < vx0 - margin || c.wx > vx1 + margin || c.wy < vy0 - margin || c.wy > vy1 + margin) continue;
      const sx = (c.wx - ox) * s;
      const sy = (c.wy - oy) * s;
      c2.beginPath();
      c2.moveTo(sx + cor[0].x * s, sy + cor[0].y * s);
      for (let k = 1; k < 6; k++) c2.lineTo(sx + cor[k].x * s, sy + cor[k].y * s);
      c2.closePath();
      c2.fillStyle = c.cell.color;
      c2.fill();
      if (stroke) c2.stroke();
      painted++;
    }
  }
  // roads are baked (world-space geometry, not text)
  c2.lineJoin = 'round';
  c2.lineCap = 'round';
  for (const road of fx.roads) {
    c2.lineWidth = Math.max(0.6, road.width * s);
    c2.strokeStyle = road.color;
    c2.beginPath();
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i];
      const px = (p.x - ox) * s;
      const py = (p.y - oy) * s;
      if (i === 0) c2.moveTo(px, py); else c2.lineTo(px, py);
    }
    c2.stroke();
  }
  return painted;
}

// ------------------------------------------------------------------ tile cache
interface Tile {
  z: number; i: number; j: number;
  canvas: HTMLCanvasElement;
  arrived: number;
  dirty: boolean;
  bytes: number;
}
const tkey = (z: number, i: number, j: number): string => z + '/' + i + '/' + j;
const cache = new Map<string, Tile>();     // insertion order == LRU recency
let cacheBytes = 0;
let tilesRasterised = 0;
let evictions = 0;
let rasterMsTotal = 0;
let rasterMsMax = 0;
let lastEdit: Record<string, unknown> | null = null;

const tileWorld = (z: number): number => TILE / levelScale(z);

function touch(k: string, t: Tile): void {
  cache.delete(k);
  cache.set(k, t);
}

function evictIfNeeded(): void {
  if (cacheBytes <= LRU_BYTES) return;
  for (const [k, t] of cache) {
    if (cacheBytes <= LRU_BYTES) break;
    if (t.z === 0) continue;                 // level 0 is pinned: it is the G1 floor
    cache.delete(k);
    cacheBytes -= t.bytes;
    evictions++;
  }
}

function rasterise(z: number, i: number, j: number): Tile {
  const s = levelScale(z);
  const tw = tileWorld(z);
  const cv = document.createElement('canvas');
  cv.width = TILE;
  cv.height = TILE;
  const c2 = cv.getContext('2d') as CanvasRenderingContext2D;
  const t0 = performance.now();
  paintWorld(c2, i * tw, j * tw, s, TILE, TILE);
  if (GEN_DELAY_MS > 0) {                    // fault injection: expensive content
    const until = performance.now() + GEN_DELAY_MS;
    while (performance.now() < until) { /* busy */ }
  }
  const ms = performance.now() - t0;
  rasterMsTotal += ms;
  if (ms > rasterMsMax) rasterMsMax = ms;
  tilesRasterised++;
  const k = tkey(z, i, j);
  const prev = cache.get(k);
  if (prev) { cache.delete(k); cacheBytes -= prev.bytes; }
  const tile: Tile = { z, i, j, canvas: cv, arrived: performance.now(), dirty: false, bytes: TILE * TILE * 4 };
  cache.set(k, tile);
  cacheBytes += tile.bytes;
  evictIfNeeded();
  return tile;
}

/** Pinned coarsest level: guarantees an ancestor always exists for every tile. */
function pregenLevel0(): void {
  const tw = tileWorld(0);
  for (let i = Math.floor(WORLD.minX / tw); i <= Math.floor(WORLD.maxX / tw); i++) {
    for (let j = Math.floor(WORLD.minY / tw); j <= Math.floor(WORLD.maxY / tw); j++) {
      rasterise(0, i, j);
    }
  }
}

/** Invalidate: mark dirty but KEEP the stale bitmap, so nothing ever goes blank. */
function invalidateWorldRect(x0: number, y0: number, x1: number, y1: number): { count: number; levels: number[] } {
  let count = 0;
  const levels = new Set<number>();
  for (const t of cache.values()) {
    const tw = tileWorld(t.z);
    const tx0 = t.i * tw; const ty0 = t.j * tw;
    if (tx0 > x1 || tx0 + tw < x0 || ty0 > y1 || ty0 + tw < y0) continue;
    if (!t.dirty) { t.dirty = true; count++; levels.add(t.z); }
  }
  return { count, levels: [...levels].sort((a, b) => a - b) };
}

// ------------------------------------------------------------------ viewport
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d', PROBE ? { willReadFrequently: true } : undefined) as CanvasRenderingContext2D;

let cssW = 0;
let cssH = 0;
let zoom = MIN_ZOOM;
let offX = 0;
let offY = 0;

let framesDrawn = 0;
let exactDraws = 0;
let fallbackDraws = 0;
let missDraws = 0;
let fadingTiles = 0;
let pendingTiles = 0;
let neededTiles = 0;
let curLevel = 4;
let genMsLast = 0;
const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function home(): void {
  zoom = MIN_ZOOM;
  offX = cssW * 0.32 - fx.fiducial.x * zoom;
  offY = cssH * 0.38 - fx.fiducial.y * zoom;
}

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

// ------------------------------------------------------------------ frame plan
interface Want { i: number; j: number; d: number; missing: boolean }
interface Plan {
  z: number; tw: number;
  i0: number; i1: number; j0: number; j1: number;
  xs: number[]; ys: number[];
  want: Want[];
}

function computePlan(): Plan {
  const z = levelForZoom(zoom);
  const tw = tileWorld(z);
  const wx0 = -offX / zoom; const wx1 = (cssW - offX) / zoom;
  const wy0 = -offY / zoom; const wy1 = (cssH - offY) / zoom;
  const i0 = Math.floor(Math.max(wx0, WORLD.minX) / tw);
  const i1 = Math.floor(Math.min(wx1, WORLD.maxX) / tw);
  const j0 = Math.floor(Math.max(wy0, WORLD.minY) / tw);
  const j1 = Math.floor(Math.min(wy1, WORLD.maxY) / tw);
  // pixel-exact edges: this tile's width is the NEXT tile's rounded position minus its own
  const xs: number[] = [];
  for (let i = i0; i <= i1 + 1; i++) xs.push(Math.round(offX + i * tw * zoom));
  const ys: number[] = [];
  for (let j = j0; j <= j1 + 1; j++) ys.push(Math.round(offY + j * tw * zoom));

  const cx = (wx0 + wx1) / 2; const cy = (wy0 + wy1) / 2;
  const want: Want[] = [];
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const t = cache.get(tkey(z, i, j));
      if (t && !t.dirty) continue;
      want.push({
        i, j,
        d: Math.hypot((i + 0.5) * tw - cx, (j + 0.5) * tw - cy),
        missing: !t,
      });
    }
  }
  // missing (showing a blurry ancestor) before dirty (stale but sharp), then nearest first
  want.sort((a, b) => (a.missing === b.missing ? a.d - b.d : (a.missing ? -1 : 1)));
  return { z, tw, i0, i1, j0, j1, xs, ys, want };
}

function generate(plan: Plan): void {
  const t0 = performance.now();
  let n = 0;
  for (const w of plan.want) {
    if (n > 0 && performance.now() - t0 >= GEN_BUDGET_MS) break;
    rasterise(plan.z, w.i, w.j);
    n++;
  }
  genMsLast = performance.now() - t0;
}

/** draw the nearest cached ancestor scaled up into (x,y,w,h). returns its level or -1. */
function drawFallback(z: number, i: number, j: number, x: number, y: number, w: number, h: number): number {
  for (let za = z - 1; za >= 0; za--) {
    const f = Math.pow(2, z - za);
    const ai = Math.floor(i / f); const aj = Math.floor(j / f);
    const k = tkey(za, ai, aj);
    const t = cache.get(k);
    if (!t) continue;
    touch(k, t);
    const sw = TILE / f;
    ctx.drawImage(t.canvas, (i - ai * f) * sw, (j - aj * f) * sw, sw, sw, x, y, w, h);
    return za;
  }
  return -1;
}

// ------------------------------------------------------------------ draw
const clock = startFrameClock();

function drawTiles(plan: Plan): void {
  const now = performance.now();
  exactDraws = 0; fallbackDraws = 0; missDraws = 0; fadingTiles = 0; neededTiles = 0;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = SMOOTH;
  for (let i = plan.i0; i <= plan.i1; i++) {
    const x = plan.xs[i - plan.i0];
    const w = plan.xs[i - plan.i0 + 1] - x;
    if (w <= 0 || x > cssW || x + w < 0) continue;
    for (let j = plan.j0; j <= plan.j1; j++) {
      const y = plan.ys[j - plan.j0];
      const h = plan.ys[j - plan.j0 + 1] - y;
      if (h <= 0 || y > cssH || y + h < 0) continue;
      neededTiles++;
      const k = tkey(plan.z, i, j);
      const t = cache.get(k);
      if (t) {
        touch(k, t);
        const age = now - t.arrived;
        if (FADE > 0 && age < FADE && !t.dirty) {
          drawFallback(plan.z, i, j, x, y, w, h);
          ctx.globalAlpha = Math.max(0, Math.min(1, age / FADE));
          ctx.drawImage(t.canvas, x, y, w, h);
          ctx.globalAlpha = 1;
          fadingTiles++;
        } else {
          ctx.drawImage(t.canvas, x, y, w, h);
        }
        exactDraws++;
      } else if (drawFallback(plan.z, i, j, x, y, w, h) >= 0) {
        fallbackDraws++;
      } else {
        missDraws++;
      }
    }
  }
}

function drawOverlay(plan: Plan): void {
  // secret landmark (live)
  if (fx.secret) {
    const s = screenOf(fx.secret.x, fx.secret.y);
    if (s.x > -40 && s.y > -40 && s.x < cssW + 40 && s.y < cssH + 40) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // labels: LIVE vector, never baked into a tile (H4 bake/live split)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of fx.labels) {
    const px = l.fontSize * zoom;
    if (px < 9 || px > 260) continue;
    const s = screenOf(l.x, l.y);
    ctx.font = px.toFixed(1) + 'px ui-sans-serif, system-ui, sans-serif';
    ctx.lineWidth = Math.max(2, px * 0.14);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(l.text, s.x, s.y);
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(l.text, s.x, s.y);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  // fiducial marker (live, unantialiased, drawn last)
  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  ctx.fillStyle = '#161b24';                 // OPAQUE: a translucent HUD reads as a hole
  ctx.fillRect(8, 8, 330, 82);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText('zoom ' + zoom.toFixed(2) + '  level z' + plan.z + '  s ' + levelScale(plan.z).toFixed(3), 16, 26);
  ctx.fillText('tiles ' + exactDraws + ' exact / ' + fallbackDraws + ' fallback / ' + missDraws + ' miss', 16, 44);
  ctx.fillText('pending ' + pendingTiles + '  cached ' + cache.size + '  ' + (cacheBytes / 1048576).toFixed(1) + ' MB', 16, 62);
  ctx.fillText('rastered ' + tilesRasterised + '  evict ' + evictions + '  gen ' + genMsLast.toFixed(1) + 'ms', 16, 80);
}

function frame(): void {
  clock.beginDraw();
  const plan = computePlan();
  curLevel = plan.z;
  generate(plan);
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, cssW, cssH);
  drawTiles(plan);
  let pend = 0;
  for (let i = plan.i0; i <= plan.i1; i++) {
    for (let j = plan.j0; j <= plan.j1; j++) {
      const t = cache.get(tkey(plan.z, i, j));
      if (!t || t.dirty) pend++;
    }
  }
  pendingTiles = pend;
  drawOverlay(plan);
  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  frame();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ footprint
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  const rings = fx.root.rings;
  for (const c of fx.root.cells.values()) {
    if (Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)) !== rings) continue;
    const w = fx.root.geometry.hexToWorld(c.q, c.r);
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

// ------------------------------------------------------------------ edits
/** Hit-test against SOURCE geometry, never the pyramid. */
function pick(wx: number, wy: number): ReturnType<typeof coarseColorAt> {
  return coarseColorAt(fx, wx, wy);
}

function paintAt(wx: number, wy: number, color: string): Record<string, unknown> | null {
  const hit = pick(wx, wy);
  if (!hit) return null;
  const doc = fx.byId.get(hit.docId) as Doc;
  const cell = doc.cells.get(hit.q + ',' + hit.r) as FixtureCell;
  const before = cell.color;
  cell.color = color;                                    // shared object: DrawCell sees it
  const local = doc.geometry.hexToWorld(hit.q, hit.r);
  const c = docToWorld(doc, local.worldX, local.worldY);
  const rad = HEX_SIZE * doc.transformToWorld.scale * 1.15;
  const t0 = performance.now();
  const inv = invalidateWorldRect(c.x - rad, c.y - rad, c.x + rad, c.y + rad);
  lastEdit = {
    docId: hit.docId, depth: hit.depth, q: hit.q, r: hit.r,
    before, after: color, worldX: c.x, worldY: c.y,
    cellWorldRadius: rad,
    cachedTiles: cache.size,
    invalidated: inv.count, levels: inv.levels,
    invalidateMs: +(performance.now() - t0).toFixed(3),
    at: performance.now(),
  };
  return lastEdit;
}

// ------------------------------------------------------------------ probe helpers
let refData: ImageData | null = null;
function markRef(): void {
  refData = ctx.getImageData(0, 0, canvas.width, canvas.height);
}
function diffRef(): Record<string, number> {
  if (!refData) return { maxDiff: -1, changed: -1, pctChanged: -1 };
  const cur = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const a = refData.data; const b = cur.data;
  let maxDiff = 0; let changed = 0; let over8 = 0; let sum = 0;
  for (let p = 0; p < a.length; p += 4) {
    const d = Math.max(Math.abs(a[p] - b[p]), Math.abs(a[p + 1] - b[p + 1]), Math.abs(a[p + 2] - b[p + 2]));
    if (d > 0) changed++;
    if (d > 8) over8++;
    if (d > maxDiff) maxDiff = d;
    sum += d;
  }
  const px = a.length / 4;
  return {
    maxDiff,
    changed,
    pctChanged: +(100 * changed / px).toFixed(4),
    pctOver8: +(100 * over8 / px).toFixed(4),
    meanDiff: +(sum / px).toFixed(4),
  };
}

/** throw the whole pyramid away and let it rebuild on demand */
function rebuildAll(): void {
  cache.clear();
  cacheBytes = 0;
  pregenLevel0();
}

// ------------------------------------------------------------------ input
canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
}, { passive: false });

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', () => { resize(); });

// ------------------------------------------------------------------ boot
resize();
home();
pregenLevel0();

const ready = new Promise<void>((resolve) => {
  requestAnimationFrame(() => {
    frame();
    requestAnimationFrame(() => { loop(); resolve(); });
  });
});

(window as unknown as { __lod: unknown }).__lod = {
  ready,
  worldAt,
  screenOf,
  getZoom: () => zoom,
  setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssH / 2),
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => ({
    level: curLevel,
    pendingTiles,
    tilesReady: exactDraws,
    neededTiles,
    fallbackDraws,
    missDraws,
    fadingTiles,
    tilesCached: cache.size,
    dirtyTiles: (() => { let n = 0; for (const t of cache.values()) if (t.dirty) n++; return n; })(),
    tilesRasterised,
    bytesCached: cacheBytes,
    mbCached: +(cacheBytes / 1048576).toFixed(2),
    evictions,
    rasterMsTotal: +rasterMsTotal.toFixed(1),
    rasterMsMax: +rasterMsMax.toFixed(2),
    rasterMsMean: tilesRasterised ? +(rasterMsTotal / tilesRasterised).toFixed(3) : 0,
    genMsLast: +genMsLast.toFixed(2),
    cellsTotal: CELLS_TOTAL,
    framesDrawn,
  }),
  // ---- edit / probe surface
  pick,
  paint: paintAt,
  lastEdit: () => lastEdit,
  markRef,
  diffRef,
  rebuildAll,
  config: () => ({ GEN_BUDGET_MS, FADE, LRU_MB: LRU_BYTES / 1048576, GEN_DELAY_MS, TILE }),
  reset: () => {
    resize();
    home();
    cache.clear();
    cacheBytes = 0;
    tilesRasterised = 0;
    evictions = 0;
    rasterMsTotal = 0;
    rasterMsMax = 0;
    pregenLevel0();
    clock.clear();
  },
};
