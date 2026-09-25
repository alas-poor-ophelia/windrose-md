/**
 * spikes/lod/h6-nest-composite — H6: composite the nested documents, delete the swap.
 *
 * The camera stays in ROOT world coordinates forever. Every document whose bounds are on
 * screen is drawn in the SAME frame at its own composed affine (fixture.transformToWorld,
 * which is parentHexCentre + childLocal/15 composed down the tree). Zoom is one continuous
 * scalar from 0.1 to 900 (= 4 * 15 * 15) with nothing special at any level boundary.
 *
 * Each document owns a cached offscreen surface (a generalisation of blitStaticContent):
 * during a gesture the surface is scale-blitted, and 150 ms after the last input the
 * surfaces are re-rendered crisp at the settled transform.
 *
 * Variants: ?blend=none|zoom|timer   ?cull=1   ?cache=0   ?look=dive|siblings|hull
 */
import {
  buildFixture, docToWorld, HEX_SIZE,
  type Doc, type Fixture,
} from '../_shared/fixture';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const BLEND = (params.get('blend') ?? 'zoom') as 'none' | 'zoom' | 'timer';
const CULL = params.get('cull') === '1';
const USE_CACHE = params.get('cache') !== '0';
const FIDUCIAL = params.get('fiducial') === '1';
const LOOK = params.get('look') ?? 'dive';
const LO_PX = Number(params.get('lo') ?? 2) || 2;   // on-screen cell width where a child becomes resident
const HI_PX = Number(params.get('hi') ?? 6) || 6;   // ... and where it is fully opaque (blend=zoom)
const FADE_MS = Number(params.get('fade') ?? 200) || 200;
const SETTLE_MS = Number(params.get('settle') ?? 150) || 150;
const SETTLE_BUDGET = 2;   // documents re-rendered crisp per settled frame
const PAD = 1.2;           // cache surface is PAD x the viewport, so a small pan still blits

const HARD_MIN = 0.1;
const HARD_MAX = 4 * 15 * 15;                       // 900: shipped maxZoom carried down two levels
const SWEEP_MIN = Number(params.get('zmin') ?? 0.2) || 0.2; // what zoomRange() reports to the rig
const WHEEL_K = 0.0015;
const BG = '#0b0e13';

const fx: Fixture = buildFixture(SEED);

// ------------------------------------------------------------------ prepared geometry
interface DrawCell { wx: number; wy: number; color: string }
interface CacheSurface {
  canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D;
  cssW: number; cssH: number; originX: number; originY: number;
  zoom0: number; offX0: number; offY0: number; bytes: number;
}
interface DocDraw {
  doc: Doc;
  radius: number;                 // hex radius in ROOT world px
  corners: Array<{ x: number; y: number }>;
  cells: DrawCell[];
  minX: number; minY: number; maxX: number; maxY: number;
  cache: CacheSurface | null;
  residentSince: number | null;
  alpha: number;
  drewCells: number;
}

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

const draws: DocDraw[] = fx.docs
  .slice()
  .sort((a, b) => a.depth - b.depth)
  .map((doc) => {
    const radius = HEX_SIZE * doc.transformToWorld.scale;
    const cells: DrawCell[] = [];
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const c of doc.cells.values()) {
      const local = doc.geometry.hexToWorld(c.q, c.r);
      const w = docToWorld(doc, local.worldX, local.worldY);
      cells.push({ wx: w.x, wy: w.y, color: c.color });
      if (w.x < minX) minX = w.x;
      if (w.y < minY) minY = w.y;
      if (w.x > maxX) maxX = w.x;
      if (w.y > maxY) maxY = w.y;
    }
    return {
      doc, radius, corners: flatCorners(radius), cells,
      minX: minX - radius, minY: minY - radius, maxX: maxX + radius, maxY: maxY + radius,
      cache: null, residentSince: null, alpha: 0, drewCells: 0,
    };
  });

const cellsTotal = draws.reduce((n, d) => n + d.cells.length, 0);

// conservative world footprint: hull of the ROOT rosette's outer-ring CENTRES
const rootDraw = draws.find((d) => d.doc.depth === 0) as DocDraw;
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const rings = rootDraw.doc.rings;
  const pts: Array<{ x: number; y: number }> = [];
  for (const c of rootDraw.doc.cells.values()) {
    const ring = (Math.abs(c.q) + Math.abs(c.r) + Math.abs(c.q + c.r)) / 2;
    if (ring !== rings) continue;
    const local = rootDraw.doc.geometry.hexToWorld(c.q, c.r);
    pts.push(docToWorld(rootDraw.doc, local.worldX, local.worldY));
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

// ------------------------------------------------------------------ viewport / camera
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
let dpr = 1;
let cssW = 0;
let cssH = 0;
let zoom = SWEEP_MIN;
let offX = 0;
let offY = 0;

let lastInputAt = -1e9;
let framesDrawn = 0;
let blits = 0;
let liveDocRenders = 0;
let crispBlits = 0;
let cellsDrawn = 0;
let docsLive = 0;
let deepestDrawn = 0;
let bytesCached = 0;

const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  for (const d of draws) d.cache = null;
}

function anchorPoint(): { x: number; y: number } {
  if (LOOK === 'siblings') {
    const a = fx.byId.get('forestA') as Doc;
    const b = fx.byId.get('forestB') as Doc;
    return {
      x: (a.transformToWorld.tx + b.transformToWorld.tx) / 2,
      y: (a.transformToWorld.ty + b.transformToWorld.ty) / 2,
    };
  }
  if (LOOK === 'hull') {
    // a corner of the parent hex that forestA fills: where the ring-7 hull under-fills
    const a = fx.byId.get('forestA') as Doc;
    const parent = fx.byId.get(a.parentId as string) as Doc;
    const ph = a.parentHex as { q: number; r: number };
    const verts = parent.geometry.getHexVertices(ph.q, ph.r);
    return docToWorld(parent, verts[0].worldX, verts[0].worldY);
  }
  return { x: fx.fiducial.x, y: fx.fiducial.y };
}

function home(): void {
  const a = anchorPoint();
  zoom = SWEEP_MIN;
  offX = cssW * 0.32 - a.x * zoom;
  offY = cssH * 0.38 - a.y * zoom;
  fiducialWorld.x = a.x;
  fiducialWorld.y = a.y;
  lastInputAt = -1e9;
  for (const d of draws) { d.cache = null; d.residentSince = null; }
}

function worldAt(x: number, y: number): { x: number; y: number } {
  return { x: (x - offX) / zoom, y: (y - offY) / zoom };
}
function screenOf(wx: number, wy: number): { x: number; y: number } {
  return { x: offX + wx * zoom, y: offY + wy * zoom };
}
function zoomAbout(next: number, ax: number, ay: number): void {
  const clamped = Math.max(HARD_MIN, Math.min(HARD_MAX, next));
  const w = worldAt(ax, ay);
  zoom = clamped;
  offX = ax - w.x * zoom;
  offY = ay - w.y * zoom;
  lastInputAt = performance.now();
}

// ------------------------------------------------------------------ blend law (H3)
function smoothstep(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/** on-screen width of one of this document's cells, in CSS px */
function cellPx(d: DocDraw): number { return 2 * d.radius * zoom; }

function alphaFor(d: DocDraw, now: number): number {
  if (d.doc.depth === 0) { if (d.residentSince === null) d.residentSince = now; return 1; }
  const px = cellPx(d);
  const resident = px >= LO_PX;
  if (!resident) { d.residentSince = null; return 0; }
  if (d.residentSince === null) d.residentSince = now;
  if (BLEND === 'none') return 1;
  if (BLEND === 'timer') return FADE_MS <= 0 ? 1 : Math.min(1, (now - d.residentSince) / FADE_MS);
  return smoothstep((px - LO_PX) / Math.max(0.0001, HI_PX - LO_PX));
}

// ------------------------------------------------------------------ rendering
function renderDocInto(
  target: CanvasRenderingContext2D, d: DocDraw,
  ox: number, oy: number, z: number, originX: number, originY: number,
  clipW: number, clipH: number,
): number {
  const scaled = d.radius * z;
  if (scaled < 0.25) return 0;
  const margin = scaled * 2;
  const stroke = scaled >= 5;
  target.lineWidth = Math.max(0.4, Math.min(1.4, scaled * 0.04));
  target.strokeStyle = 'rgba(0,0,0,0.42)';
  const cs = d.corners;
  let n = 0;
  for (let i = 0; i < d.cells.length; i++) {
    const c = d.cells[i];
    const sx = ox + c.wx * z - originX;
    const sy = oy + c.wy * z - originY;
    if (sx < -margin || sy < -margin || sx > clipW + margin || sy > clipH + margin) continue;
    target.beginPath();
    target.moveTo(sx + cs[0].x * z, sy + cs[0].y * z);
    for (let k = 1; k < 6; k++) target.lineTo(sx + cs[k].x * z, sy + cs[k].y * z);
    target.closePath();
    target.fillStyle = c.color;
    target.fill();
    if (stroke) target.stroke();
    n++;
  }
  return n;
}

function ensureCache(d: DocDraw): CacheSurface {
  const w = Math.ceil(cssW * PAD);
  const h = Math.ceil(cssH * PAD);
  if (!d.cache || d.cache.cssW !== w || d.cache.cssH !== h) {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const c2 = cv.getContext('2d') as CanvasRenderingContext2D;
    d.cache = {
      canvas: cv, ctx: c2, cssW: w, cssH: h,
      originX: -(w - cssW) / 2, originY: -(h - cssH) / 2,
      zoom0: NaN, offX0: NaN, offY0: NaN,
      bytes: Math.round(w * dpr) * Math.round(h * dpr) * 4,
    };
  }
  return d.cache;
}

function refreshCache(d: DocDraw): void {
  const c = ensureCache(d);
  c.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.ctx.clearRect(0, 0, c.cssW, c.cssH);
  renderDocInto(c.ctx, d, offX, offY, zoom, c.originX, c.originY, c.cssW, c.cssH);
  c.zoom0 = zoom;
  c.offX0 = offX;
  c.offY0 = offY;
}

function cacheGeom(c: CacheSurface): { k: number; sx: number; sy: number; w: number; h: number } {
  const k = zoom / c.zoom0;
  const wx = (c.originX - c.offX0) / c.zoom0;
  const wy = (c.originY - c.offY0) / c.zoom0;
  return { k, sx: offX + wx * zoom, sy: offY + wy * zoom, w: c.cssW * k, h: c.cssH * k };
}

function cacheUsable(c: CacheSurface): boolean {
  if (!Number.isFinite(c.zoom0)) return false;
  const g = cacheGeom(c);
  if (!(g.k >= 0.4 && g.k <= 2.5)) return false;
  return g.sx <= 0.5 && g.sy <= 0.5 && g.sx + g.w >= cssW - 0.5 && g.sy + g.h >= cssH - 0.5;
}

function intersectsViewport(d: DocDraw): boolean {
  const x0 = offX + d.minX * zoom;
  const y0 = offY + d.minY * zoom;
  const x1 = offX + d.maxX * zoom;
  const y1 = offY + d.maxY * zoom;
  return x1 >= 0 && y1 >= 0 && x0 <= cssW && y0 <= cssH;
}

function strokeWorldPoly(pts: Array<{ x: number; y: number }>, close: boolean): void {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const s = screenOf(pts[i].x, pts[i].y);
    if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
  }
  if (close) ctx.closePath();
  ctx.stroke();
}

const clock = startFrameClock();

function draw(): void {
  clock.beginDraw();
  const now = performance.now();
  const gesturing = now - lastInputAt < SETTLE_MS;

  // settle: re-render a couple of stale surfaces crisp at the settled transform
  if (USE_CACHE && !gesturing) {
    let budget = SETTLE_BUDGET;
    for (const d of draws) {
      if (budget <= 0) break;
      // MUST match the draw loop's own skip conditions. Refreshing a surface for a document
      // the draw loop then frees (because it is off screen) allocates and throws away a
      // viewport-sized canvas every settled frame — pure GC churn, and it also eats the
      // budget so the document that IS on screen never gets its crisp surface.
      if (!intersectsViewport(d) || alphaFor(d, now) <= 0.002) continue;
      const c = d.cache;
      if (c && c.zoom0 === zoom && c.offX0 === offX && c.offY0 === offY) continue;
      refreshCache(d);
      budget--;
    }
  }

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);

  cellsDrawn = 0;
  docsLive = 0;
  deepestDrawn = 0;
  blits = 0;
  liveDocRenders = 0;
  crispBlits = 0;
  bytesCached = 0;

  for (const d of draws) {
    const alpha = alphaFor(d, now);
    d.alpha = alpha;
    d.drewCells = 0;
    const visible = intersectsViewport(d);
    if (alpha <= 0.002 || !visible) {
      d.cache = null;          // surfaces are only held for documents actually on screen
      continue;
    }

    ctx.globalAlpha = alpha;
    const c = USE_CACHE ? d.cache : null;
    if (c && cacheUsable(c)) {
      const g = cacheGeom(c);
      ctx.drawImage(c.canvas, g.sx, g.sy, g.w, g.h);
      blits++;
      if (Math.abs(g.k - 1) < 1e-9) crispBlits++;
      d.drewCells = -1;
    } else {
      d.drewCells = renderDocInto(ctx, d, offX, offY, zoom, 0, 0, cssW, cssH);
      cellsDrawn += d.drewCells;
      liveDocRenders++;
    }
    ctx.globalAlpha = 1;
    if (d.cache) bytesCached += d.cache.bytes;
    docsLive++;
    if (d.doc.depth > deepestDrawn) deepestDrawn = d.doc.depth;
  }

  // roads / labels: authored vector content, always live (never cached)
  for (const road of fx.roads) {
    ctx.lineWidth = Math.max(1, road.width * zoom);
    ctx.strokeStyle = road.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    strokeWorldPoly(road.points, false);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const l of fx.labels) {
    const px = l.fontSize * zoom;
    if (px < 9 || px > 260) continue;
    const s = screenOf(l.x, l.y);
    ctx.font = `${px.toFixed(1)}px ui-sans-serif, system-ui, sans-serif`;
    ctx.lineWidth = Math.max(2, px * 0.14);
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(l.text, s.x, s.y);
    ctx.fillStyle = '#f2ead8';
    ctx.fillText(l.text, s.x, s.y);
  }
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';

  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // opaque HUD (a translucent one reads as a hole to the detector)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 340, 82);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`h6 blend=${BLEND}${CULL ? ' cull' : ''}${USE_CACHE ? '' : ' nocache'}  zoom ${zoom.toFixed(3)}`, 16, 26);
  ctx.fillText(`docs ${docsLive}/${draws.length}  deepest d${deepestDrawn}`, 16, 44);
  ctx.fillText(`blit ${blits} live ${liveDocRenders} crisp ${crispBlits}`, 16, 62);
  const al = draws.filter((d) => d.doc.depth > 0).map((d) => d.alpha.toFixed(2)).join(' ');
  ctx.fillText(`alpha ${al}`, 16, 80);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void { draw(); requestAnimationFrame(loop); }

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
  lastInputAt = performance.now();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
  lastInputAt = performance.now();
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', () => { resize(); home(); });

// ------------------------------------------------------------------ contract surface
resize();
home();

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
  setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssH / 2),
  zoomRange: () => ({ min: SWEEP_MIN, max: HARD_MAX }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => ({
    levelsLive: docsLive,
    deepestDrawn,
    cellsDrawn,
    cellsTotal,
    blits,
    liveDocRenders,
    crispBlits,
    bytesCached,
    alphaDeep: +(draws.filter((d) => d.doc.depth > 0).reduce((m, d) => Math.max(m, d.alpha), 0)).toFixed(3),
    framesDrawn,
  }),
  reset: () => { resize(); home(); clock.clear(); },
};
