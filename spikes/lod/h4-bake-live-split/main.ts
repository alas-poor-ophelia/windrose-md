/**
 * spikes/lod/h4-bake-live-split — H4 (bake fills, one live lattice) + H19 (rack focus).
 *
 * Two levels over the shared fixture: root (depth 0) and the four depth-1 child docs.
 * Each level is baked ONCE into an offscreen surface at a constant baked cell radius;
 * frames are drawImage composites plus a live screen-space pass.
 *
 * ?grid=both|one|none-during-gesture|fade   ?labels=baked|live   ?defocus=1
 * ?analyse=0 (disable the in-page image analysis, for --timing-only runs)
 * ?fiducial=1
 */
import {
  buildFixture, docToWorld, HEX_SIZE,
  type Doc, type Fixture, type FixtureLabel,
} from '../_shared/fixture';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const GRID = (params.get('grid') ?? 'one') as 'both' | 'one' | 'none-during-gesture' | 'fade' | 'district';
// ?look=label parks the view on the depth-1 label instead of the fiducial, so the
// labels=baked vs labels=live comparison actually has a label in frame.
const LOOK = params.get('look') ?? 'fiducial';
const LABELS = (params.get('labels') ?? 'live') as 'baked' | 'live';
const DEFOCUS = params.get('defocus') === '1';
const FIDUCIAL = params.get('fiducial') === '1';
const ANALYSE = params.get('analyse') !== '0';
// ?stress=N repeats the live stroke pass N times. The fixture only ever puts ~170 hexes of
// the ideal rung on screen; a denser map would put more, so this extrapolates pass-B cost.
const STRESS = Math.max(1, Number(params.get('stress') ?? 1) || 1);

const MIN_ZOOM = 0.62;
const MAX_ZOOM = 60;
const WHEEL_K = 0.0015;

/** on-screen hex radius (CSS px) the lattice is "ideal" at */
const LATTICE_TARGET = 40;
/** baked hex radius in surface px — every level is baked at the same cell size */
const BAKED_RADIUS = 48;
/** zoom at which root and child cells are equidistant (in log) from LATTICE_TARGET */
const Z_CROSS = Math.sqrt((LATTICE_TARGET * LATTICE_TARGET) / (HEX_SIZE * (HEX_SIZE / 15)));
/** child surfaces crossfade in over s in [-FADE, +FADE], s = log2(zoom / Z_CROSS) */
const FADE = 0.8;
/** disjoint-ramp dead band for the ONE-lattice rule, in log2 zoom */
const DEAD = 0.35;
const SETTLE_MS = 150;

const BG = '#0b0e13';

// ------------------------------------------------------------------ fixture -> levels
const fx: Fixture = buildFixture(SEED);

interface BakedCell { wx: number; wy: number; color: string }
interface Level {
  id: string;
  depth: number;
  docs: Doc[];
  /** hex radius in ROOT world px for this level */
  cellWorld: number;
  surfaces: Surface[];
}
interface Surface {
  doc: Doc;
  canvas: HTMLCanvasElement;
  /** world px of surface pixel (0,0) */
  x0: number;
  y0: number;
  /** world px extent */
  w: number;
  h: number;
  cells: BakedCell[];
}

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

function collectCells(doc: Doc): BakedCell[] {
  const out: BakedCell[] = [];
  for (const c of doc.cells.values()) {
    const local = doc.geometry.hexToWorld(c.q, c.r);
    const w = docToWorld(doc, local.worldX, local.worldY);
    out.push({ wx: w.x, wy: w.y, color: c.color });
  }
  return out;
}

let bytesCached = 0;

function bakeSurface(doc: Doc, cellWorld: number, withOutline: boolean, withLabels: boolean): Surface {
  const cells = collectCells(doc);
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const c of cells) {
    if (c.wx < minX) minX = c.wx;
    if (c.wy < minY) minY = c.wy;
    if (c.wx > maxX) maxX = c.wx;
    if (c.wy > maxY) maxY = c.wy;
  }
  const pad = cellWorld * 1.1;
  const x0 = minX - pad; const y0 = minY - pad;
  const w = (maxX - minX) + pad * 2;
  const h = (maxY - minY) + pad * 2;
  const scale = BAKED_RADIUS / cellWorld; // surface px per world px

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  bytesCached += canvas.width * canvas.height * 4;
  const c2 = canvas.getContext('2d') as CanvasRenderingContext2D;
  c2.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale); // now draw in WORLD px

  const corners = flatCorners(cellWorld);
  c2.lineJoin = 'round';
  for (const c of cells) {
    c2.beginPath();
    c2.moveTo(c.wx + corners[0].x, c.wy + corners[0].y);
    for (let k = 1; k < 6; k++) c2.lineTo(c.wx + corners[k].x, c.wy + corners[k].y);
    c2.closePath();
    c2.fillStyle = c.color;
    c2.fill();
    if (withOutline) {
      c2.lineWidth = cellWorld * 0.035;
      c2.strokeStyle = 'rgba(0,0,0,0.45)';
      c2.stroke();
    }
  }

  // roads belong to pass A (world-sized art)
  for (const road of doc.roads) {
    c2.beginPath();
    for (let i = 0; i < road.points.length; i++) {
      const p = road.points[i];
      if (i === 0) c2.moveTo(p.x, p.y); else c2.lineTo(p.x, p.y);
    }
    c2.lineWidth = road.width;
    c2.strokeStyle = road.color;
    c2.lineCap = 'round';
    c2.stroke();
  }

  if (withLabels) {
    c2.textAlign = 'center';
    c2.textBaseline = 'middle';
    for (const l of doc.labels) {
      c2.font = `${l.fontSize}px ui-sans-serif, system-ui, sans-serif`;
      c2.lineWidth = l.fontSize * 0.14;
      c2.strokeStyle = 'rgba(0,0,0,0.75)';
      c2.strokeText(l.text, l.x, l.y);
      c2.fillStyle = '#f2ead8';
      c2.fillText(l.text, l.x, l.y);
    }
    c2.textAlign = 'start';
    c2.textBaseline = 'alphabetic';
  }

  return { doc, canvas, x0, y0, w, h, cells };
}

const bakeOutlines = GRID === 'both';
const bakeLabels = LABELS === 'baked';

const rootDoc = fx.root;
const childDocs = fx.docs.filter((d) => d.depth === 1);

const levels: Level[] = [
  {
    id: 'root', depth: 0, docs: [rootDoc],
    cellWorld: HEX_SIZE * rootDoc.transformToWorld.scale,
    surfaces: [],
  },
  {
    id: 'child', depth: 1, docs: childDocs,
    cellWorld: HEX_SIZE * childDocs[0].transformToWorld.scale,
    surfaces: [],
  },
];
for (const lv of levels) {
  for (const doc of lv.docs) lv.surfaces.push(bakeSurface(doc, lv.cellWorld, bakeOutlines, bakeLabels));
}

// live-lattice geometry: cell centres + corner offsets per level, in ROOT world px
const latticeCorners = levels.map((lv) => flatCorners(lv.cellWorld));
const latticeCells = levels.map((lv) => {
  const out: Array<{ wx: number; wy: number }> = [];
  for (const s of lv.surfaces) for (const c of s.cells) out.push({ wx: c.wx, wy: c.wy });
  return out;
});

// ------------------------------------------------------------------ footprint hull (root ring 12 centres)
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  const axialDist = (q: number, r: number): number =>
    (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  for (const c of rootDoc.cells.values()) {
    if (axialDist(c.q, c.r) !== rootDoc.rings) continue;
    const local = rootDoc.geometry.hexToWorld(c.q, c.r);
    pts.push(docToWorld(rootDoc, local.worldX, local.worldY));
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
const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;

let cssW = 0;
let cssH = 0;
let dpr = 1;
let zoom = MIN_ZOOM;
let offX = 0;
let offY = 0;
let lastInputT = -1e9;

let framesDrawn = 0;
let strokedLive = 0;
let blitCount = 0;
let alphaChild = 0;
let rootLatticeA = 0;
let childLatticeA = 0;
let blurPx = 0;

const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const LOOK_AT = (() => {
  if (LOOK === 'label') {
    const l = fx.labels.find((x) => x.depth === 1);
    if (l) return { x: l.x, y: l.y };
  }
  return { x: fx.fiducial.x, y: fx.fiducial.y };
})();

function home(): void {
  zoom = MIN_ZOOM;
  offX = cssW * 0.32 - LOOK_AT.x * zoom;
  offY = cssH * 0.38 - LOOK_AT.y * zoom;
  fiducialWorld.x = LOOK_AT.x;
  fiducialWorld.y = LOOK_AT.y;
  lastInputT = -1e9;
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
  lastInputT = performance.now();
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ draw
const clock = startFrameClock();

function drawSurface(s: Surface, alpha: number, blur: number): void {
  if (alpha <= 0.002) return;
  const dx = offX + s.x0 * zoom;
  const dy = offY + s.y0 * zoom;
  const dw = s.w * zoom;
  const dh = s.h * zoom;
  if (dx > cssW || dy > cssH || dx + dw < 0 || dy + dh < 0) return;
  ctx.globalAlpha = alpha;
  if (blur > 0.02) ctx.filter = `blur(${blur.toFixed(2)}px)`;
  ctx.drawImage(s.canvas, dx, dy, dw, dh);
  if (blur > 0.02) ctx.filter = 'none';
  ctx.globalAlpha = 1;
  blitCount++;
}

function strokeLattice(levelIdx: number, alpha: number, styleWidth?: number, styleColor?: string): void {
  if (alpha <= 0.01) return;
  const lv = levels[levelIdx];
  const scaled = lv.cellWorld * zoom; // hex radius, CSS px
  if (scaled < 3) return;             // sub-pixel lattice = pure moire; never stroke it
  const corners = latticeCorners[levelIdx];
  const cells = latticeCells[levelIdx];
  const margin = scaled * 2;
  ctx.globalAlpha = alpha;
  ctx.lineWidth = styleWidth ?? Math.max(0.6, Math.min(1.6, scaled * 0.035));
  ctx.strokeStyle = styleColor ?? 'rgba(0,0,0,0.55)';
  for (let rep = 0; rep < STRESS; rep++) {
    ctx.beginPath();
    for (let i = 0; i < cells.length; i++) {
      const sx = offX + cells[i].wx * zoom;
      const sy = offY + cells[i].wy * zoom;
      if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssH + margin) continue;
      ctx.moveTo(sx + corners[0].x * zoom, sy + corners[0].y * zoom);
      for (let k = 1; k < 6; k++) ctx.lineTo(sx + corners[k].x * zoom, sy + corners[k].y * zoom);
      ctx.closePath();
      strokedLive++;
    }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawLiveLabel(l: FixtureLabel, px: number, alpha: number): void {
  if (alpha <= 0.02) return;
  const s = screenOf(l.x, l.y);
  if (s.x < -200 || s.y < -80 || s.x > cssW + 200 || s.y > cssH + 80) return;
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${px}px ui-sans-serif, system-ui, sans-serif`;
  ctx.lineWidth = px * 0.18;
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.strokeText(l.text, s.x, s.y);
  ctx.fillStyle = '#f2ead8';
  ctx.fillText(l.text, s.x, s.y);
  ctx.textAlign = 'start';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha = 1;
}

function draw(): void {
  clock.beginDraw();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);
  strokedLive = 0;
  blitCount = 0;

  const s = Math.log2(zoom / Z_CROSS);
  alphaChild = smoothstep(-FADE, FADE, s);

  // H19 rack focus: blur bump on the OUTGOING (root) surface, peaks mid-blend,
  // fully gone by the time the blend ends. iPadOS ignores ctx.filter -> would need
  // pre-blurred copies at 2-3 fixed radii.
  blurPx = DEFOCUS ? 2 * (4 * alphaChild * (1 - alphaChild)) : 0;

  // PASS A — cached surfaces, coarse to fine
  for (const surf of levels[0].surfaces) drawSurface(surf, 1, blurPx);
  for (const surf of levels[1].surfaces) drawSurface(surf, alphaChild, 0);

  // PASS B — live, screen space
  const rootPx = levels[0].cellWorld * zoom;
  const childPx = levels[1].cellWorld * zoom;
  const settled = performance.now() - lastInputT > SETTLE_MS;

  if (GRID === 'both') {
    rootLatticeA = 1;             // baked into the surfaces, both visible through the blend
    childLatticeA = alphaChild;
  } else if (GRID === 'fade') {
    rootLatticeA = Math.max(0, Math.min(1, 1 - Math.abs(Math.log2(rootPx / LATTICE_TARGET)) / 2.2));
    childLatticeA = Math.max(0, Math.min(1, 1 - Math.abs(Math.log2(childPx / LATTICE_TARGET)) / 2.2))
      * Math.max(alphaChild, 0.0);
    strokeLattice(0, rootLatticeA);
    strokeLattice(1, childLatticeA);
  } else if (GRID === 'district') {
    // H4's fallback: the coarse lattice is never deleted, it THICKENS AND LIGHTENS into a
    // persistent district line (what Worldographer ships) while the fine lattice takes
    // over normally. Two lattices coexist, but at deliberately different visual weights.
    rootLatticeA = 1;
    childLatticeA = s >= DEAD ? 1 : (s <= 0 ? 0 : s / DEAD);
    strokeLattice(0, 0.30, 2.5, 'rgba(240,246,255,0.95)');
    strokeLattice(1, childLatticeA);
  } else {
    // ONE lattice: disjoint ramps with a dead band — no frame carries two.
    rootLatticeA = s <= -DEAD ? 1 : (s >= 0 ? 0 : -s / DEAD);
    childLatticeA = s >= DEAD ? 1 : (s <= 0 ? 0 : s / DEAD);
    const gate = GRID === 'none-during-gesture' ? (settled ? 1 : 0) : 1;
    strokeLattice(0, rootLatticeA * gate);
    strokeLattice(1, childLatticeA * gate);
  }

  // labels
  if (LABELS === 'live') {
    for (const l of fx.labels) {
      if (l.depth === 0) drawLiveLabel(l, 18, 1 - alphaChild * 0.85);
      else if (l.depth === 1) drawLiveLabel(l, 15, alphaChild);
      // depth 2 is not authored in this two-level spike
    }
  }

  // chrome that is always live
  if (fx.secret) {
    const p = screenOf(fx.secret.x, fx.secret.y);
    if (p.x > -40 && p.y > -40 && p.x < cssW + 40 && p.y < cssH + 40) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  if (FIDUCIAL) {
    const p = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(p.x - 3.5), Math.round(p.y - 3.5), 7, 7);
  }

  // OPAQUE HUD (a translucent one reads as a hole to the rig)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 330, 80);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`grid=${GRID} labels=${LABELS}${DEFOCUS ? ' defocus' : ''}`, 16, 26);
  ctx.fillText(`zoom ${zoom.toFixed(3)}  s ${s.toFixed(2)}  aChild ${alphaChild.toFixed(2)}`, 16, 44);
  ctx.fillText(`root ${rootPx.toFixed(0)}px/${rootLatticeA.toFixed(2)}  child ${childPx.toFixed(1)}px/${childLatticeA.toFixed(2)}`, 16, 62);
  ctx.fillText(`blits ${blitCount}  strokedLive ${strokedLive}  blur ${blurPx.toFixed(2)}`, 16, 80);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
}

// ------------------------------------------------------------------ lattice detector
/**
 * PER-LEVEL PREDICTED-PERIOD DETECTOR (justification for not doing a full 2-D FFT).
 *
 * A flat-top hex lattice as stroked here has horizontal top/bottom edges, so a *dark ridge*
 * runs across the frame once per row of hexes. The row pitch is known exactly for every
 * level: P = sqrt(3) * cellWorldRadius * zoom * dpr device px. So instead of hunting for
 * unknown peaks, the detector asks one question per level: "is there a dark-ridge
 * periodicity at THIS level's own pitch?" That is strictly more specific than peak-hunting
 * (a harmonic of the coarse lattice can never be mistaken for the fine one) and ~30x
 * cheaper than an FFT.
 *
 *  1. one getImageData of a 960x960 crop centred on the fiducial (the point being zoomed at)
 *  2. per row, ridge(y) = sum over x of max(0, (L(y-2)+L(y+2))/2 - L(y))
 *     — responds to dark LINES, not to fill-colour steps, which is the whole point:
 *       a baked outline and a live stroke both register, a colour join between two
 *       terrain fills largely does not
 *  3. per level, normalised autocorrelation of that profile over a window ~12 periods wide,
 *     searched over lag in [0.87P, 1.15P]; detected when r > 0.25
 *  4. a level whose pitch is < 6 px or > 320 px is UNMEASURABLE in this crop and is
 *     excluded from the count (reported as latticeUnmeasurable)
 *
 * latticeCount = number of levels whose own lattice is detected. 2 == the "two grids" state.
 */
function autocorrAt(profile: Float64Array, from: number, len: number, lagLo: number, lagHi: number):
{ lag: number; r: number } {
  const n = len;
  if (n < lagHi * 2) return { lag: 0, r: 0 };
  let mean = 0;
  for (let i = 0; i < n; i++) mean += profile[from + i];
  mean /= n;
  let e0 = 0;
  for (let i = 0; i < n; i++) { const v = profile[from + i] - mean; e0 += v * v; }
  if (e0 <= 1e-9) return { lag: 0, r: 0 };
  let bestLag = 0; let bestR = -1;
  for (let lag = lagLo; lag <= lagHi; lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += (profile[from + i] - mean) * (profile[from + i + lag] - mean);
    const r = acc / e0;
    if (r > bestR) { bestR = r; bestLag = lag; }
  }
  return { lag: bestLag, r: bestR };
}

/** per-row dark-ridge energy over the crop */
function ridgeProfile(data: Uint8ClampedArray, w: number, h: number): Float64Array {
  const lum = new Float64Array(h);
  const out = new Float64Array(h);
  const rowLum = (y: number): number => {
    let acc = 0;
    const a = y * w * 4;
    for (let x = 0; x < w; x += 2) {
      const i = a + x * 4;
      acc += data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
    }
    return acc / (w / 2);
  };
  for (let y = 0; y < h; y++) lum[y] = rowLum(y);
  for (let y = 2; y < h - 2; y++) out[y] = Math.max(0, (lum[y - 2] + lum[y + 2]) / 2 - lum[y]);
  return out;
}

function meanGradient(data: Uint8ClampedArray, w: number, h: number, x0: number, y0: number, side: number): number {
  let acc = 0; let n = 0;
  for (let y = y0; y < y0 + side - 1; y += 2) {
    for (let x = x0; x < x0 + side - 1; x += 2) {
      const i = (y * w + x) * 4;
      const ix = i + 4;
      const iy = i + w * 4;
      const l = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      const lx = data[ix] * 0.299 + data[ix + 1] * 0.587 + data[ix + 2] * 0.114;
      const ly = data[iy] * 0.299 + data[iy + 1] * 0.587 + data[iy + 2] * 0.114;
      acc += Math.abs(l - lx) + Math.abs(l - ly);
      n++;
    }
  }
  return n ? acc / n : 0;
}

const DETECT_R = 0.25;
const CROP = 960;
let latticeMax = 0;
let bandFrames = 0;
let bandLatticeSum = 0;
let bandTwoFrames = 0;
let lastAnalysis = {
  latticeCount: 0, latticeUnmeasurable: 0,
  rootPitch: 0, rootR: 0, rootSeen: 0,
  childPitch: 0, childR: 0, childSeen: 0,
  hfEnergy: 0,
};

function analyse(): typeof lastAnalysis {
  if (!ANALYSE) return lastAnalysis;
  const W = canvas.width; const H = canvas.height;
  const side = Math.min(CROP, W, H);
  // centre the crop on the point being zoomed at (the rig re-pins the fiducial onto the
  // cursor anchor), clamped inside the canvas
  const fp = screenOf(fiducialWorld.x, fiducialWorld.y);
  const cx = Math.max(0, Math.min(W - side, Math.round(fp.x * dpr - side / 2)));
  const cy = Math.max(0, Math.min(H - side, Math.round(fp.y * dpr - side / 2)));
  const img = ctx.getImageData(cx, cy, side, side);
  const prof = ridgeProfile(img.data, side, side);

  const res = { ...lastAnalysis };
  let count = 0;
  let unmeasurable = 0;
  for (let li = 0; li < 2; li++) {
    const pitch = Math.sqrt(3) * levels[li].cellWorld * zoom * dpr;
    const ok = pitch >= 6 && pitch <= 450;
    let r = 0;
    if (ok) {
      const win = Math.max(128, Math.min(side, Math.round(pitch * 12)));
      const from = Math.floor((side - win) / 2);
      const hit = autocorrAt(prof, from, win, Math.max(3, Math.round(pitch * 0.87)), Math.round(pitch * 1.15));
      r = hit.r;
      if (r > DETECT_R) count++;
    } else unmeasurable++;
    if (li === 0) { res.rootPitch = Number(pitch.toFixed(1)); res.rootR = Number(r.toFixed(3)); res.rootSeen = ok && r > DETECT_R ? 1 : 0; }
    else { res.childPitch = Number(pitch.toFixed(1)); res.childR = Number(r.toFixed(3)); res.childSeen = ok && r > DETECT_R ? 1 : 0; }
  }
  const fineOff = Math.floor((side - 256) / 2);
  res.latticeCount = count;
  res.latticeUnmeasurable = unmeasurable;
  res.hfEnergy = Number(meanGradient(img.data, side, side, fineOff, fineOff, 256).toFixed(3));
  lastAnalysis = res;

  if (count > latticeMax) latticeMax = count;
  const sNow = Math.log2(zoom / Z_CROSS);
  if (Math.abs(sNow) <= FADE) {
    bandFrames++;
    bandLatticeSum += count;
    if (count >= 2) bandTwoFrames++;
  }
  return lastAnalysis;
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
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  lastInputT = performance.now();
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  lastInputT = performance.now();
});
const endDrag = (e: PointerEvent): void => {
  dragging = false;
  lastInputT = performance.now();
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', () => { resize(); });

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
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => {
    const a = analyse();
    return {
      latticeCount: a.latticeCount,
      latticeMax,
      bandLatticeMean: bandFrames ? Number((bandLatticeSum / bandFrames).toFixed(3)) : 0,
      bandTwoFrames,
      bandFrames,
      latticeUnmeasurable: a.latticeUnmeasurable,
      // self-reported companion to the pixel detector: how many levels' outlines are
      // actually being PUT on the frame (baked outline under a visible surface, or a live
      // stroke). The pixel detector confirms this wherever the pitch is measurable.
      latticeDrawn: (GRID === 'both'
        ? (1 + (alphaChild > 0.15 ? 1 : 0))
        : ((rootLatticeA > 0.05 ? 1 : 0) + (childLatticeA > 0.05 ? 1 : 0))),
      rootPitch: a.rootPitch,
      rootR: a.rootR,
      rootSeen: a.rootSeen,
      childPitch: a.childPitch,
      childR: a.childR,
      childSeen: a.childSeen,
      hfEnergy: a.hfEnergy,
      grid: GRID,
      labelsMode: LABELS,
      defocus: DEFOCUS ? 1 : 0,
      levelsLive: alphaChild > 0.002 ? 2 : 1,
      alphaChild: Number(alphaChild.toFixed(3)),
      rootLatticeA: Number(rootLatticeA.toFixed(3)),
      childLatticeA: Number(childLatticeA.toFixed(3)),
      blurPx: Number(blurPx.toFixed(2)),
      strokedLive,
      stress: STRESS,
      blits: blitCount,
      cellsTotal: latticeCells[0].length + latticeCells[1].length,
      bytesCached,
      framesDrawn,
    };
  },
  reset: () => {
    resize();
    home();
    clock.clear();
    latticeMax = 0;
    bandFrames = 0;
    bandLatticeSum = 0;
    bandTwoFrames = 0;
  },
};
