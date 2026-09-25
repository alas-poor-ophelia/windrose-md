/**
 * spikes/lod/h1h2-surface-cascade
 *
 * H1 (keyed, byte-budgeted surface LRU) + H2 (per-place cascade with coverage early-exit),
 * over a synthetic 3-level hex world that lives in ONE world coordinate space.
 * No documents, no swap. See NOTES.md.
 */
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { startFrameClock } from '../_shared/instrument';
import { TERRAIN_PALETTE, terrainAtWorld } from '../_shared/fixture';

type TerrainId = keyof typeof TERRAIN_PALETTE;

// ------------------------------------------------------------------ params
const params = new URLSearchParams(location.search);
const num = (k: string, d: number): number => {
  const v = params.get(k);
  if (v === null || v === '') return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};
const SEED = num('seed', 1) || 1;
const BUDGET_BYTES = num('budgetMB', 32) * 1024 * 1024;
const GEN_BUDGET_MS = num('genBudgetMs', 4);       // 0 => unbudgeted
const SURF_PX = num('surfPx', 768);                // longest side of one chunk surface
const DIRECT = num('direct', 1) !== 0;             // vector fallback when a blit would upscale hard
const CASCADE = num('cascade', 1) !== 0;           // 0 => no coverage early-exit
const SRC_CLIP = num('srcClip', 1) !== 0;          // blit only the on-screen part of a surface
const FIDUCIAL = params.get('fiducial') === '1';
const FOCUS_KEY = params.get('focus') ?? 'frontier';

// ------------------------------------------------------------------ world constants
const H0 = 24;                 // level-0 hexSize, world px (centre -> vertex)
const LEVELS = 3;              // 0,1,2 ; hexSize(L) = H0 / 3^L  (m=3, rotation-free, aperture 9)
const L0_RINGS = 36;           // 1 + 3*36*37 = 3997 cells
const CHUNK = 16;              // 16x16 axial chunk
const MIN_ZOOM = 0.42;
const MAX_ZOOM = 54;
const WHEEL_K = 0.0015;
const MIN_HEX_PX = num('minHexPx', 3); // prune a level whose hexes are smaller than this on screen
const DIRECT_AT = 3;           // blit upscale factor above which we prefer vectors
const DIRECT_MAX_CELLS = 3000; // ... but only if this few cells are visible at that level
const SQ3 = Math.sqrt(3);

const hexSizeOf = (L: number): number => H0 / Math.pow(3, L);
const geos: HexGeometry[] = [];
for (let L = 0; L < LEVELS; L++) geos.push(new HexGeometry(hexSizeOf(L), 'flat', null));

// chunk world extent is identical for every chunk at a level
const chunkLongSide = (L: number): number => {
  const h = hexSizeOf(L);
  return Math.max(CHUNK * 1.5 * h + 2 * h, SQ3 * h * (CHUNK + CHUNK / 2) + SQ3 * h);
};
const rsMaxOf = (L: number): number => SURF_PX / chunkLongSide(L);
const rsMinOf = (L: number): number => 8 / chunkLongSide(L);

// ------------------------------------------------------------------ hashing / noise
function h2f(x: number, y: number, s: number): number {
  let h = s ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(fq: number, fr: number, S: number, salt: number): number {
  const x = fq / S;
  const y = fr / S;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = x - x0;
  const ty = y - y0;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const a = h2f(x0, y0, salt);
  const b = h2f(x0 + 1, y0, salt);
  const c = h2f(x0, y0 + 1, salt);
  const d = h2f(x0 + 1, y0 + 1, salt);
  return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
}
const axialDist = (q: number, r: number, q2: number, r2: number): number =>
  (Math.abs(q - q2) + Math.abs(r - r2) + Math.abs(q + r - q2 - r2)) / 2;

// ------------------------------------------------------------------ authoring
const key2 = (a: number, b: number): string => `${a},${b}`;

// L0 cells (complete over the ring-36 disc)
const l0Cells = geos[0].getAllRadialCells(L0_RINGS);

// --- pocket masks over L0 hexes, auto-tuned to an exact fraction so the world is reproducible
const FRONTIER_HEX = { q: -19, r: 3 };    // the dive target: a pocket edge
const MISSING_HEX = { q: 12, r: 6 };      // L2 authored here, L1 deliberately NOT

function pickTop(frac: number, score: (q: number, r: number) => number, from: Array<{ q: number; r: number }>): Set<string> {
  const scored = from.map((c) => ({ k: key2(c.q, c.r), s: score(c.q, c.r) }));
  scored.sort((a, b) => b.s - a.s);
  const n = Math.round(scored.length * frac);
  const out = new Set<string>();
  for (let i = 0; i < n; i++) out.add(scored[i].k);
  return out;
}

const n1 = (q: number, r: number): number => 0.62 * vnoise(q, r, 5.5, SEED * 0x9e37) + 0.38 * vnoise(q, r, 2.1, SEED * 0x85eb);
const n2 = (q: number, r: number): number => 0.55 * vnoise(q, r, 3.3, SEED * 0xc2b2) + 0.45 * vnoise(q, r, 1.4, SEED * 0x27d4);

const pocket1 = pickTop(0.25, n1, l0Cells);
// forced frontier blob so the capture cursor always dives onto a real pocket edge
for (const c of l0Cells) if (axialDist(c.q, c.r, FRONTIER_HEX.q, FRONTIER_HEX.r) <= 5) pocket1.add(key2(c.q, c.r));

const pocket1List = l0Cells.filter((c) => pocket1.has(key2(c.q, c.r)));
const pocket2 = pickTop(0.10, n2, pocket1List);
for (const c of l0Cells) if (axialDist(c.q, c.r, FRONTIER_HEX.q, FRONTIER_HEX.r) <= 1) pocket2.add(key2(c.q, c.r));

// the missing-intermediate region: L2 yes, L1 no
for (const c of l0Cells) {
  if (axialDist(c.q, c.r, MISSING_HEX.q, MISSING_HEX.r) <= 3) {
    pocket2.add(key2(c.q, c.r));
    pocket1.delete(key2(c.q, c.r));
  }
}

// --- deliberate contradictions in world space (finer levels are not a resample of the coarser)
interface Blob { x: number; y: number; r: number; t: TerrainId; minLevel: number }
const fh = geos[0].hexToWorld(FRONTIER_HEX.q, FRONTIER_HEX.r);
const mh = geos[0].hexToWorld(MISSING_HEX.q, MISSING_HEX.r);
const BLOBS: Blob[] = [
  { x: fh.worldX + 95, y: fh.worldY - 80, r: 55, t: 'lake', minLevel: 1 },
  { x: fh.worldX - 30, y: fh.worldY + 26, r: 13, t: 'town', minLevel: 2 },
  { x: mh.worldX, y: mh.worldY, r: 70, t: 'town', minLevel: 2 },
];

// each level adds one octave of detail: a finer world-space noise nudges terrain one step
// "up" the ladder, so an authored level is visibly more than an upscale of its parent.
const TERRAIN_UP: Record<string, TerrainId> = {
  ocean: 'coast', coast: 'plains', plains: 'forest', forest: 'hills',
  hills: 'mountains', mountains: 'hills', lake: 'coast', town: 'plains',
};

function terrainAt(L: number, wx: number, wy: number): TerrainId {
  for (const b of BLOBS) {
    if (L < b.minLevel) continue;
    const dx = wx - b.x;
    const dy = wy - b.y;
    if (dx * dx + dy * dy < b.r * b.r) return b.t;
  }
  let t = terrainAtWorld(wx, wy) as TerrainId;
  for (let k = 1; k <= L; k++) {
    const W = 3.2 * hexSizeOf(k);
    const n = vnoise(wx / W, wy / W, 1, SEED * 0x51ed + k * 977);
    if (n > 0.70) t = TERRAIN_UP[t] ?? t;
  }
  return t;
}

function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number): number => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}

interface Cell { q: number; r: number; wx: number; wy: number; fill: string }
interface Chunk {
  L: number; cx: number; cy: number; cells: Cell[]; complete: boolean;
  x0: number; y0: number; x1: number; y1: number;
}
const chunks = new Map<string, Chunk>();
const ckey = (L: number, cx: number, cy: number): string => `${L}|${cx}|${cy}`;
const cdiv = (v: number): number => Math.floor(v / CHUNK);

function addCell(L: number, q: number, r: number): void {
  const g = geos[L];
  const w = g.hexToWorld(q, r);
  const t = terrainAt(L, w.worldX, w.worldY);
  const jitter = ((h2f(q, r, SEED * 2654435761 + L * 7919) * 2) - 1) * 0.055;
  const cell: Cell = { q, r, wx: w.worldX, wy: w.worldY, fill: shade(TERRAIN_PALETTE[t], jitter) };
  const cx = cdiv(q);
  const cy = cdiv(r);
  const k = ckey(L, cx, cy);
  let ch = chunks.get(k);
  if (!ch) {
    ch = { L, cx, cy, cells: [], complete: false, x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    chunks.set(k, ch);
  }
  ch.cells.push(cell);
  const h = hexSizeOf(L);
  ch.x0 = Math.min(ch.x0, w.worldX - h);
  ch.x1 = Math.max(ch.x1, w.worldX + h);
  ch.y0 = Math.min(ch.y0, w.worldY - h * SQ3 / 2);
  ch.y1 = Math.max(ch.y1, w.worldY + h * SQ3 / 2);
}

const buildT0 = performance.now();
for (const c of l0Cells) addCell(0, c.q, c.r);

// L1/L2 children: level-L cell (3^L q, 3^L r) is world-identical to level-0 cell (q, r),
// so the children of an L0 hex are the lattice cells around (k*q, k*r) whose centre
// still falls inside that L0 hex.
function addChildren(L: number, parents: Set<string>): number {
  const k = Math.pow(3, L);
  const span = L === 1 ? 2 : 5;
  let n = 0;
  for (const pk of parents) {
    const parts = pk.split(',');
    const pq = Number(parts[0]);
    const pr = Number(parts[1]);
    const bq = k * pq;
    const br = k * pr;
    for (let dq = -span; dq <= span; dq++) {
      for (let dr = -span; dr <= span; dr++) {
        const q = bq + dq;
        const r = br + dr;
        const w = geos[L].hexToWorld(q, r);
        const owner = geos[0].worldToHex(w.worldX, w.worldY);
        if (owner.q !== pq || owner.r !== pr) continue;
        addCell(L, q, r);
        n++;
      }
    }
  }
  return n;
}
const l1Count = addChildren(1, pocket1);
const l2Count = addChildren(2, pocket2);

for (const ch of chunks.values()) ch.complete = ch.cells.length === CHUNK * CHUNK;
const buildMs = performance.now() - buildT0;

// ------------------------------------------------------------------ viewport / transform
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
let cssW = 0;
let cssH = 0;
let zoom = 1;
let offX = 0;
let offY = 0;

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

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// the dive target sits exactly ON the L2 pocket boundary (shared edge of an authored and an
// unauthored L0 hex), so a deep zoom frames the ragged frontier instead of a flat interior.
const frontierIn = geos[0].hexToWorld(FRONTIER_HEX.q + 1, FRONTIER_HEX.r);
const frontierOut = geos[0].hexToWorld(FRONTIER_HEX.q + 2, FRONTIER_HEX.r);
const FOCUS = FOCUS_KEY === 'missing'
  ? { x: mh.worldX, y: mh.worldY }
  : { x: (frontierIn.worldX + frontierOut.worldX) / 2, y: (frontierIn.worldY + frontierOut.worldY) / 2 };

function fitWorld(): void {
  zoom = MIN_ZOOM;
  offX = 0.32 * cssW - FOCUS.x * zoom;
  offY = 0.38 * cssH - FOCUS.y * zoom;
}

// ------------------------------------------------------------------ H1: surface LRU
interface Surface {
  key: string; L: number; cx: number; cy: number; rs: number; canvas: HTMLCanvasElement;
  w: number; h: number; bytes: number; frame: number;
}
const lru = new Map<string, Surface>();
let bytesCached = 0;
let bytesPeak = 0;
let rebuilds = 0;
let evictions = 0;
let frameId = 0;

function rasterise(ch: Chunk, rs: number): Surface {
  const w = Math.max(1, Math.ceil((ch.x1 - ch.x0) * rs));
  const h = Math.max(1, Math.ceil((ch.y1 - ch.y0) * rs));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const cx = c.getContext('2d') as CanvasRenderingContext2D;
  cx.setTransform(rs, 0, 0, rs, -ch.x0 * rs, -ch.y0 * rs);
  const hs = hexSizeOf(ch.L);
  const corners: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    corners.push({ x: hs * Math.cos(a), y: hs * Math.sin(a) });
  }
  const strokeOn = hs * rs >= 4;
  cx.lineWidth = Math.max(0.5, Math.min(1.4, hs * rs * 0.05)) / rs;
  cx.strokeStyle = 'rgba(0,0,0,0.42)';
  for (const cell of ch.cells) {
    cx.beginPath();
    cx.moveTo(cell.wx + corners[0].x, cell.wy + corners[0].y);
    for (let k = 1; k < 6; k++) cx.lineTo(cell.wx + corners[k].x, cell.wy + corners[k].y);
    cx.closePath();
    cx.fillStyle = cell.fill;
    cx.fill();
    if (strokeOn) cx.stroke();
  }
  rebuilds++;
  return { key: '', L: ch.L, cx: ch.cx, cy: ch.cy, rs, canvas: c, w, h, bytes: w * h * 4, frame: frameId };
}

function release(s: Surface): void {
  s.canvas.width = 1;
  s.canvas.height = 1; // EXPLICIT release: WebKit does not reliably free a dereferenced backing store
  bytesCached -= s.bytes;
  evictions++;
}

function evictToBudget(): void {
  if (bytesCached <= BUDGET_BYTES) return;
  for (const entry of Array.from(lru)) {
    if (bytesCached <= BUDGET_BYTES) break;
    const k = entry[0];
    const s = entry[1];
    if (s.frame === frameId) continue; // in use this frame
    lru.delete(k);
    release(s);
  }
}

function surfaceKey(ch: Chunk, rs: number): string {
  return `${ch.L}|${ch.cx}|${ch.cy}@${rs.toFixed(4)}`;
}
function getSurface(ch: Chunk, rs: number): Surface | null {
  const k = surfaceKey(ch, rs);
  const s = lru.get(k);
  if (!s) return null;
  lru.delete(k);
  lru.set(k, s);
  s.frame = frameId;
  return s;
}
function makeSurface(ch: Chunk, rs: number): Surface {
  const k = surfaceKey(ch, rs);
  const s = rasterise(ch, rs);
  s.key = k;
  lru.set(k, s);
  bytesCached += s.bytes;
  if (bytesCached > bytesPeak) bytesPeak = bytesCached;
  evictToBudget();
  return s;
}

// pinned world overview — the never-blank backstop, never evicted, built before `ready`
const worldBBox = (() => {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const c of l0Cells) {
    const w = geos[0].hexToWorld(c.q, c.r);
    x0 = Math.min(x0, w.worldX - H0); x1 = Math.max(x1, w.worldX + H0);
    y0 = Math.min(y0, w.worldY - H0 * SQ3 / 2); y1 = Math.max(y1, w.worldY + H0 * SQ3 / 2);
  }
  return { x0, y0, x1, y1 };
})();
const overview = (() => {
  const rs = 640 / Math.max(worldBBox.x1 - worldBBox.x0, worldBBox.y1 - worldBBox.y0);
  const all: Chunk = {
    L: 0, cx: 0, cy: 0, cells: [], complete: true,
    x0: worldBBox.x0, y0: worldBBox.y0, x1: worldBBox.x1, y1: worldBBox.y1,
  };
  for (const ch of chunks.values()) if (ch.L === 0) all.cells.push(...ch.cells);
  const s = rasterise(all, rs);
  bytesCached += s.bytes;
  bytesPeak = Math.max(bytesPeak, bytesCached);
  return { surf: s, box: all };
})();

// ------------------------------------------------------------------ chunk visibility
function visibleChunkRange(L: number, wx0: number, wy0: number, wx1: number, wy1: number): { cq0: number; cq1: number; cr0: number; cr1: number } {
  const h = hexSizeOf(L);
  const qOf = (wx: number): number => wx / (1.5 * h);
  const rOf = (wx: number, wy: number): number => wy / (SQ3 * h) - wx / (3 * h);
  const qs = [qOf(wx0), qOf(wx1)];
  const rr = [rOf(wx0, wy0), rOf(wx1, wy0), rOf(wx0, wy1), rOf(wx1, wy1)];
  return {
    cq0: cdiv(Math.floor(Math.min.apply(null, qs)) - 1), cq1: cdiv(Math.ceil(Math.max.apply(null, qs)) + 1),
    cr0: cdiv(Math.floor(Math.min.apply(null, rr)) - 1), cr1: cdiv(Math.ceil(Math.max.apply(null, rr)) + 1),
  };
}

// ------------------------------------------------------------------ H2: coverage mask
const MASK = 16;
const maskCovered = new Uint8Array(MASK * MASK);
const maskCare = new Uint8Array(MASK * MASK);
const worldR2 = (() => {
  const w = geos[0].hexToWorld(L0_RINGS, 0);
  return (w.worldX * w.worldX + w.worldY * w.worldY);
})();

function pocketFor(L: number): Set<string> | null {
  return L === 0 ? null : (L === 1 ? pocket1 : pocket2);
}

/**
 * A mask cell counts as covered at level L only when all nine sampled points inside it
 * sit in an L0 hex that is authored at L *and* whose level-L chunk is resident. The
 * conservative guard: never claim coverage when one mask cell is wider than one L0 hex,
 * because the nine samples would not be representative.
 */
function updateCoverage(L: number, residentAt: (wx: number, wy: number) => boolean): number {
  const cw = cssW / MASK;
  const chh = cssH / MASK;
  if (cw / zoom > H0) return countCovered();
  const pocket = pocketFor(L);
  for (let my = 0; my < MASK; my++) {
    for (let mx = 0; mx < MASK; mx++) {
      const i = my * MASK + mx;
      if (maskCovered[i] || !maskCare[i]) continue;
      let ok = true;
      for (let sy = 0; sy < 3 && ok; sy++) {
        for (let sx = 0; sx < 3 && ok; sx++) {
          const w = worldAt((mx + sx * 0.5) * cw, (my + sy * 0.5) * chh);
          if (pocket) {
            const o = geos[0].worldToHex(w.x, w.y);
            if (!pocket.has(key2(o.q, o.r))) { ok = false; break; }
          }
          if (!residentAt(w.x, w.y)) ok = false;
        }
      }
      if (ok) maskCovered[i] = 1;
    }
  }
  return countCovered();
}
function countCovered(): number {
  let n = 0;
  for (let i = 0; i < MASK * MASK; i++) if (!maskCare[i] || maskCovered[i]) n++;
  return n;
}
function resetCoverage(): void {
  const cw = cssW / MASK;
  const chh = cssH / MASK;
  for (let my = 0; my < MASK; my++) {
    for (let mx = 0; mx < MASK; mx++) {
      const i = my * MASK + mx;
      maskCovered[i] = 0;
      const w = worldAt((mx + 0.5) * cw, (my + 0.5) * chh);
      maskCare[i] = (w.x * w.x + w.y * w.y) <= worldR2 ? 1 : 0;
    }
  }
}

// ------------------------------------------------------------------ frame
const clock = startFrameClock();
const CORNERS: Array<{ x: number; y: number }> = [];
for (let i = 0; i < 6; i++) {
  const a = (Math.PI / 180) * 60 * i;
  CORNERS.push({ x: Math.cos(a), y: Math.sin(a) });
}

interface Req { key: string; ch: Chunk; rs: number; d: number }
let m_levelsDrawn = 0;
let m_breakLevel: number | null = null;
let m_blits = 0;
let m_directLevels = 0;
let m_cellsDrawn = 0;
let m_pending = 0;
let m_generated = 0;
let m_coverPct = 0;
let m_overviewOnly = 0;
let m_missFrames = 0;
let m_frames = 0;
let m_genMs = 0;
let m_depthChanges = 0;
let lastBreak: number | null = -99;

function rsFor(L: number): number {
  const oct = Math.pow(2, Math.round(Math.log2(zoom)));
  return Math.max(rsMinOf(L), Math.min(rsMaxOf(L), oct));
}

const fiducialWorld = { x: 0, y: 0 };

/**
 * Blit only the part of a surface that is actually on screen.
 *
 * The naive whole-surface `drawImage` is what the shipped renderer does, and at deep zoom
 * it hands the rasteriser a destination rect hundreds of screen-widths across (the pinned
 * overview is a 640 px bitmap stretched over the whole world). Clipping in the SOURCE
 * domain first is the single biggest frame-time lever measured in this spike.
 */
function blitWorldRect(s: Surface, b: { x0: number; y0: number; x1: number; y1: number },
                       tlx: number, tly: number, brx: number, bry: number): void {
  const pad = SRC_CLIP ? 1 / s.rs : 0; // one source pixel of margin so edges still filter cleanly
  const ix0 = SRC_CLIP ? Math.max(b.x0, tlx - pad) : b.x0;
  const iy0 = SRC_CLIP ? Math.max(b.y0, tly - pad) : b.y0;
  const ix1 = SRC_CLIP ? Math.min(b.x1, brx + pad) : b.x1;
  const iy1 = SRC_CLIP ? Math.min(b.y1, bry + pad) : b.y1;
  if (ix1 <= ix0 || iy1 <= iy0) return;
  const fx = s.w / (b.x1 - b.x0);
  const fy = s.h / (b.y1 - b.y0);
  ctx.drawImage(s.canvas,
    (ix0 - b.x0) * fx, (iy0 - b.y0) * fy, (ix1 - ix0) * fx, (iy1 - iy0) * fy,
    offX + ix0 * zoom, offY + iy0 * zoom, (ix1 - ix0) * zoom, (iy1 - iy0) * zoom);
  m_blits++;
}

function draw(): void {
  clock.beginDraw();
  frameId++;
  m_frames++;
  ctx.imageSmoothingEnabled = true;
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, cssW, cssH);

  const tl = worldAt(0, 0);
  const br = worldAt(cssW, cssH);
  resetCoverage();

  let deepest = 0;
  for (let L = LEVELS - 1; L >= 0; L--) {
    if (hexSizeOf(L) * zoom >= MIN_HEX_PX) { deepest = L; break; }
  }

  const reqs: Req[] = [];
  const seen: Record<string, boolean> = {};
  const plan: Array<{ L: number; blits: Surface[]; boxes: Chunk[]; direct: boolean }> = [];
  let broke: number | null = null;
  m_blits = 0;
  m_directLevels = 0;
  m_cellsDrawn = 0;

  for (let L = deepest; L >= 0; L--) {
    const rs = rsFor(L);
    const blitScale = zoom / rs;
    const range = visibleChunkRange(L, tl.x, tl.y, br.x, br.y);
    const boxes: Chunk[] = [];
    const surfs: Surface[] = [];
    const resident: Record<string, boolean> = {};
    let cellCount = 0;
    for (let cx = range.cq0; cx <= range.cq1; cx++) {
      for (let cy = range.cr0; cy <= range.cr1; cy++) {
        const ch = chunks.get(ckey(L, cx, cy));
        if (!ch) continue;
        if (ch.x1 < tl.x || ch.x0 > br.x || ch.y1 < tl.y || ch.y0 > br.y) continue;
        boxes.push(ch);
        cellCount += ch.cells.length;
        const s = getSurface(ch, rs);
        if (s) {
          surfs.push(s);
          resident[`${cx}|${cy}`] = true;
        } else {
          const k = surfaceKey(ch, rs);
          if (!seen[k]) {
            seen[k] = true;
            const c = worldAt(cssW / 2, cssH / 2);
            reqs.push({ key: k, ch, rs, d: Math.hypot((ch.x0 + ch.x1) / 2 - c.x, (ch.y0 + ch.y1) / 2 - c.y) });
          }
        }
      }
    }
    const useDirect = DIRECT && blitScale > DIRECT_AT && cellCount <= DIRECT_MAX_CELLS && cellCount > 0;
    if (useDirect || surfs.length) plan.push({ L, blits: surfs, boxes, direct: useDirect });

    const residentAt = (wx: number, wy: number): boolean => {
      if (useDirect) return true;
      const h = hexSizeOf(L);
      const q = Math.round(wx / (1.5 * h));
      const r = Math.round(wy / (SQ3 * h) - wx / (3 * h));
      return resident[`${cdiv(q)}|${cdiv(r)}`] === true;
    };
    const covered = updateCoverage(L, residentAt);
    m_coverPct = covered / (MASK * MASK);
    if (CASCADE && covered === MASK * MASK && L > 0) { broke = L; break; }
  }
  m_breakLevel = broke;
  if (broke !== lastBreak) { m_depthChanges++; lastBreak = broke; }

  // ---- paint: overview backstop first (never blank), then coarsest -> finest
  blitWorldRect(overview.surf, overview.box, tl.x, tl.y, br.x, br.y);
  plan.sort((a, b) => a.L - b.L);
  m_levelsDrawn = plan.length;
  for (const p of plan) {
    if (p.direct) {
      m_directLevels++;
      const hs = hexSizeOf(p.L) * zoom;
      const strokeOn = hs >= 5;
      ctx.lineWidth = Math.max(0.5, Math.min(1.5, hs * 0.04));
      ctx.strokeStyle = 'rgba(0,0,0,0.42)';
      for (const ch of p.boxes) {
        for (const cell of ch.cells) {
          const sx = offX + cell.wx * zoom;
          const sy = offY + cell.wy * zoom;
          if (sx < -hs * 2 || sy < -hs * 2 || sx > cssW + hs * 2 || sy > cssH + hs * 2) continue;
          ctx.beginPath();
          ctx.moveTo(sx + CORNERS[0].x * hs, sy + CORNERS[0].y * hs);
          for (let k = 1; k < 6; k++) ctx.lineTo(sx + CORNERS[k].x * hs, sy + CORNERS[k].y * hs);
          ctx.closePath();
          ctx.fillStyle = cell.fill;
          ctx.fill();
          if (strokeOn) ctx.stroke();
          m_cellsDrawn++;
        }
      }
    } else {
      for (const s of p.blits) {
        const ch = chunks.get(ckey(s.L, s.cx, s.cy));
        if (!ch) continue;
        blitWorldRect(s, ch, tl.x, tl.y, br.x, br.y);
        m_cellsDrawn += ch.cells.length;
      }
    }
  }
  if (plan.length === 0) m_overviewOnly++;
  if (reqs.length) m_missFrames++;

  // ---- fiducial (pixel-domain anchor check)
  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // ---- HUD (OPAQUE, or the hole detector reads it as background)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 342, 62);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`zoom ${zoom.toFixed(2)}  deepest L${deepest}  break ${broke === null ? '-' : `L${broke}`}  cov ${(m_coverPct * 100).toFixed(0)}%`, 16, 26);
  ctx.fillText(`blits ${m_blits}  directLv ${m_directLevels}  cells ${m_cellsDrawn}`, 16, 44);
  ctx.fillText(`surf ${lru.size} ${(bytesCached / 1048576).toFixed(1)}/${(BUDGET_BYTES / 1048576).toFixed(0)}MB rb ${rebuilds} ev ${evictions} q ${reqs.length}`, 16, 62);

  clock.endDraw();

  // ---- lazy generation with a per-frame time budget (G5: fallback first, then refine)
  reqs.sort((a, b) => (a.ch.L - b.ch.L) || (a.d - b.d));
  const t0 = performance.now();
  let served = 0;
  for (const rq of reqs) {
    if (GEN_BUDGET_MS > 0 && performance.now() - t0 > GEN_BUDGET_MS) break;
    makeSurface(rq.ch, rq.rs);
    served++;
  }
  m_genMs = performance.now() - t0;
  m_generated += served;
  m_pending = reqs.length - served;
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ footprint (hole mask)
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  for (const c of l0Cells) {
    if (axialDist(c.q, c.r, 0, 0) !== L0_RINGS) continue;
    const w = geos[0].hexToWorld(c.q, c.r);
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

// ------------------------------------------------------------------ input
canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
}, { passive: false });
let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY; canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX; offY += e.clientY - lastY; lastX = e.clientX; lastY = e.clientY;
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
  setZoom: (z: number, ax?: number, ay?: number) => zoomAbout(z, ax ?? cssW / 2, ay ?? cssH / 2),
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({ kind: 'polygon', points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })) }),
  metrics: () => ({
    levelsDrawn: m_levelsDrawn,
    breakLevel: m_breakLevel === null ? -1 : m_breakLevel,
    coverPct: +(m_coverPct * 100).toFixed(1),
    blits: m_blits,
    directLevels: m_directLevels,
    cellsDrawn: m_cellsDrawn,
    surfaces: lru.size,
    bytesCachedMB: +(bytesCached / 1048576).toFixed(2),
    bytesPeakMB: +(bytesPeak / 1048576).toFixed(2),
    budgetMB: +(BUDGET_BYTES / 1048576).toFixed(0),
    rebuilds,
    evictions,
    pending: m_pending,
    generated: m_generated,
    genMs: +m_genMs.toFixed(2),
    depthChanges: m_depthChanges,
    overviewOnlyFrames: m_overviewOnly,
    framesWithMissingChunks: m_missFrames,
    frames: m_frames,
    l0Cells: l0Cells.length,
    l1Cells: l1Count,
    l2Cells: l2Count,
    chunks: chunks.size,
    buildMs: +buildMs.toFixed(1),
  }),
  reset: () => { resize(); fitWorld(); clock.clear(); },
};
