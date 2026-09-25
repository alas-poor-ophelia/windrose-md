/**
 * spikes/lod/h5-coverage-frontier
 *
 * H5 (coverage / replacement semantics) + H9 (inherit down) + the frontier look.
 *
 * Simultaneous composite: every fixture doc drawn depth-ascending at its own
 * transformToWorld affine, child over parent = opaque replacement. The SUBJECT is
 * what happens where a child does NOT paint:
 *   - inside it, at cells erased at depth      -> ?fill=inherit|transparent|void
 *   - at its ring-7 hull, where authored detail stops -> ?edge=hard|feather|tint
 */
import {
  buildFixture, coarseColorAt, docToWorld, worldToDoc,
  FIDUCIAL_COLOR, HEX_SIZE, CELLS_ACROSS,
  type Doc, type Fixture,
} from '../_shared/fixture';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
type FillMode = 'inherit' | 'transparent' | 'void';
type EdgeMode = 'hard' | 'feather' | 'tint';
const FILL = (params.get('fill') ?? 'inherit') as FillMode;
const EDGE = (params.get('edge') ?? 'hard') as EdgeMode;
const ERASE = (params.get('erase') ?? '1') !== '0';
const EDGE_PX = Number(params.get('edgepx') ?? 8) || 8;
const FIDUCIAL = params.get('fiducial') === '1';
const AT = params.get('at') ?? 'siblings';

const BG = '#0b0e13';
// ?voidcol=dark|light. `dark` is the obvious first choice for "deliberate empty" and it
// FAILS the rig's hole detector: composited with its hatch it lands within +-6 of the page
// background, so an authored-clear cell is indistinguishable from an unpainted frame.
const VOID_LIGHT = params.get('voidcol') === 'light';
const VOID_BASE = VOID_LIGHT ? '#394051' : '#14171f';
const VOID_INK = VOID_LIGHT ? 'rgba(226,234,248,0.30)' : 'rgba(210,220,240,0.13)';

// Hull corner radius, in doc-local px, of a rings-N rosette: it touches the PARENT hex's
// edge midpoint, and the parent hex is CELLS_ACROSS cells wide in doc-local units.
const HULL_R_LOCAL = HEX_SIZE * CELLS_ACROSS * (Math.sqrt(3) / 2); // 1039.23
const SQRT3_2 = Math.sqrt(3) / 2;

const fx: Fixture = buildFixture(SEED);

// ------------------------------------------------------------------ erase at depth
// Removed from the spike's copy of the fixture (never from _shared/fixture.ts).
// Interior blobs AND blobs that bite the ring-7 hull, so the fill semantics show up both
// in the middle of a child document and at its frontier.
const ERASE_BLOBS: Array<{ doc: string; q: number; r: number; rad: number; where: string }> = [
  { doc: 'forestA', q: -3, r: 2, rad: 2, where: 'interior' },
  { doc: 'forestA', q: 5, r: -2, rad: 2, where: 'hull-notch' },
  { doc: 'forestB', q: 0, r: 0, rad: 1, where: 'interior' },
  { doc: 'forestB', q: -5, r: 0, rad: 2, where: 'hull-notch facing forestA' },
  { doc: 'shore', q: 1, r: 1, rad: 1, where: 'interior' },
  { doc: 'shore', q: -5, r: 3, rad: 2, where: 'hull-notch (away from the seam probe)' },
  { doc: 'range', q: -4, r: 5, rad: 2, where: 'hull-notch' },
  { doc: 'grand', q: -2, r: 0, rad: 1, where: 'interior' },
];

const ringOf = (q: number, r: number): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));

interface ErasedRec { doc: Doc; q: number; r: number }
const erased: ErasedRec[] = [];
if (ERASE) {
  for (const b of ERASE_BLOBS) {
    const doc = fx.byId.get(b.doc);
    if (!doc) continue;
    for (let dq = -b.rad; dq <= b.rad; dq++) {
      for (let dr = -b.rad; dr <= b.rad; dr++) {
        if (ringOf(dq, dr) > b.rad) continue;
        const q = b.q + dq;
        const r = b.r + dr;
        if (ringOf(q, r) > doc.rings) continue;
        const key = q + ',' + r;
        if (!doc.cells.has(key)) continue;
        doc.cells.delete(key);
        erased.push({ doc, q, r });
      }
    }
  }
}

// ------------------------------------------------------------------ prepared draw lists
interface PCell { wx: number; wy: number; color: string; erased: boolean }
interface DocDraw {
  doc: Doc;
  worldHexSize: number;             // HEX_SIZE * scale, ROOT world px
  cells: PCell[];
  hullWorld: Array<{ x: number; y: number }>;   // 6 corners, ROOT world px (null for root)
  edgeParentColor: string[];        // 6 parent colours sampled just outside each hull edge
}

function hexCorners(radius: number, startDeg: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (startDeg + 60 * i);
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

const CELL_CORNERS = hexCorners(1, 0); // unit flat-top cell, scaled per doc

function parentColorAtWorld(wx: number, wy: number, depth: number): string {
  const hit = coarseColorAt(fx, wx, wy, depth - 1);
  return hit ? hit.color : BG;
}

function prepare(): DocDraw[] {
  return fx.docs.slice().sort((a, b) => a.depth - b.depth).map((doc) => {
    const scale = doc.transformToWorld.scale;
    const cells: PCell[] = [];
    for (const c of doc.cells.values()) {
      const local = doc.geometry.hexToWorld(c.q, c.r);
      const w = docToWorld(doc, local.worldX, local.worldY);
      cells.push({ wx: w.x, wy: w.y, color: c.color, erased: false });
    }
    // erased cells keep their slot, carrying the colour their PARENT has at their centre
    for (const e of erased) {
      if (e.doc !== doc) continue;
      const local = doc.geometry.hexToWorld(e.q, e.r);
      const w = docToWorld(doc, local.worldX, local.worldY);
      cells.push({ wx: w.x, wy: w.y, color: parentColorAtWorld(w.x, w.y, doc.depth), erased: true });
    }
    let hullWorld: Array<{ x: number; y: number }> = [];
    const edgeParentColor: string[] = [];
    if (doc.parentId) {
      const R = HULL_R_LOCAL * scale;
      const c = docToWorld(doc, 0, 0);
      hullWorld = hexCorners(R, 30).map((p) => ({ x: c.x + p.x, y: c.y + p.y }));
      // edge i spans corner i -> i+1; its midpoint direction is 60*i + 60 degrees
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 180) * (60 * i + 60);
        const rr = R * SQRT3_2 * 1.12; // just outside the hull, still inside the parent hex
        edgeParentColor.push(parentColorAtWorld(c.x + rr * Math.cos(a), c.y + rr * Math.sin(a), doc.depth));
      }
    }
    return { doc, worldHexSize: HEX_SIZE * scale, cells, hullWorld, edgeParentColor };
  });
}

const draws = prepare();
const cellsTotal = draws.reduce((n, d) => n + d.cells.length, 0);

// ------------------------------------------------------------------ anchors + zoom range
const ANCHORS: Record<string, { world: { x: number; y: number }; max: number }> = (() => {
  const A = fx.byId.get('forestA') as Doc;
  const S = fx.byId.get('shore') as Doc;
  const G = fx.byId.get('grand') as Doc;
  const ac = docToWorld(A, 0, 0);
  const sc = docToWorld(S, 0, 0);
  const gc = docToWorld(G, 0, 0);
  const Ra = HULL_R_LOCAL * A.transformToWorld.scale;
  const Rs = HULL_R_LOCAL * S.transformToWorld.scale;
  return {
    // the point where forestA's and forestB's hull corners kiss (= parent edge midpoint)
    siblings: { world: { x: ac.x + Ra * Math.cos(Math.PI / 6), y: ac.y + Ra * Math.sin(Math.PI / 6) }, max: 60 },
    // the isolated child's hull corner
    shorecorner: { world: { x: sc.x + Rs * Math.cos(Math.PI / 6), y: sc.y + Rs * Math.sin(Math.PI / 6) }, max: 60 },
    // inside forestA, on the interior erase blob: the child there is LAKE (blue) while the
    // parent root hex is FOREST, so the three fill semantics are forced apart
    lake: { world: (() => { const l = A.geometry.hexToWorld(-3, 2); return docToWorld(A, l.worldX, l.worldY); })(), max: 120 },
    grand: { world: { x: gc.x, y: gc.y }, max: 400 },
    fiducial: { world: { x: fx.fiducial.x, y: fx.fiducial.y }, max: 400 },
  };
})();
const ANCHOR = ANCHORS[AT] ?? ANCHORS.siblings;
const MIN_ZOOM = 0.62;
const MAX_ZOOM = ANCHOR.max;
const WHEEL_K = 0.0015;

const fiducialWorld = { x: ANCHOR.world.x, y: ANCHOR.world.y };

// ------------------------------------------------------------------ footprint hull (root ring 12)
const footprintWorld: Array<{ x: number; y: number }> = (() => {
  const root = fx.root;
  const pts: Array<{ x: number; y: number }> = [];
  for (const { q, r } of root.geometry.getAllRadialCells(root.rings)) {
    if (ringOf(q, r) !== root.rings) continue;
    const w = root.geometry.hexToWorld(q, r);
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
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d') as CanvasRenderingContext2D;

let dpr = 1;
let cssW = 0;
let cssH = 0;
let zoom = MIN_ZOOM;
let offX = 0;
let offY = 0;

let cellsDrawn = 0;
let erasedShown = 0;
let docsLive = 0;
let deepestDrawn = 0;
let framesDrawn = 0;
let scratchMs = 0;
let scratchPx = 0;

function resize(): void {
  dpr = Math.max(1, Math.round(window.devicePixelRatio || 1));
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function home(): void {
  zoom = MIN_ZOOM;
  offX = cssW * 0.32 - ANCHOR.world.x * zoom;
  offY = cssH * 0.38 - ANCHOR.world.y * zoom;
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

const clock = startFrameClock();

// ------------------------------------------------------------------ cell painting
function hexPath(g: CanvasRenderingContext2D, sx: number, sy: number, rad: number): void {
  g.beginPath();
  g.moveTo(sx + CELL_CORNERS[0].x * rad, sy + CELL_CORNERS[0].y * rad);
  for (let k = 1; k < 6; k++) g.lineTo(sx + CELL_CORNERS[k].x * rad, sy + CELL_CORNERS[k].y * rad);
  g.closePath();
}

function paintVoid(g: CanvasRenderingContext2D, sx: number, sy: number, rad: number): void {
  hexPath(g, sx, sy, rad);
  g.fillStyle = VOID_BASE;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = VOID_INK;
  g.lineWidth = Math.max(0.6, rad * 0.055);
  const step = Math.max(2.5, rad * 0.32);
  g.beginPath();
  for (let t = -rad; t <= rad * 2; t += step) {
    g.moveTo(sx - rad + t, sy - rad);
    g.lineTo(sx - rad + t - 2 * rad, sy + rad);
  }
  g.stroke();
  g.restore();
}

function drawDocCells(g: CanvasRenderingContext2D, d: DocDraw): number {
  const rad = d.worldHexSize * zoom;
  const margin = rad * 2;
  const stroke = rad >= 5;
  g.lineWidth = Math.max(0.4, Math.min(1.4, rad * 0.04));
  g.strokeStyle = 'rgba(0,0,0,0.42)';
  let n = 0;
  for (const c of d.cells) {
    const sx = offX + c.wx * zoom;
    const sy = offY + c.wy * zoom;
    if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssH + margin) continue;
    if (c.erased) {
      erasedShown++;
      if (FILL === 'transparent') continue;       // parent shows through, untouched
      if (FILL === 'void') { paintVoid(g, sx, sy, rad); if (stroke) { hexPath(g, sx, sy, rad); g.stroke(); } n++; continue; }
      // FILL === 'inherit': the cell IS its parent's value, at the CHILD's lattice
      hexPath(g, sx, sy, rad);
      g.fillStyle = c.color;
      g.fill();
      if (stroke) g.stroke();
      n++;
      continue;
    }
    hexPath(g, sx, sy, rad);
    g.fillStyle = c.color;
    g.fill();
    if (stroke) g.stroke();
    n++;
  }
  return n;
}

// ------------------------------------------------------------------ frontier treatment
function hexToRgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Six per-edge gradient quads ramping inward from the hull. */
function applyEdgeBands(g: CanvasRenderingContext2D, d: DocDraw, hullS: Array<{ x: number; y: number }>, W: number): void {
  let cx = 0;
  let cy = 0;
  for (const p of hullS) { cx += p.x / 6; cy += p.y / 6; }
  for (let i = 0; i < 6; i++) {
    const A = hullS[i];
    const B = hullS[(i + 1) % 6];
    const ex = B.x - A.x;
    const ey = B.y - A.y;
    const len = Math.hypot(ex, ey);
    if (len < 1) continue;
    const ux = ex / len;
    const uy = ey / len;
    let nx = -uy;
    let ny = ux;
    const mx = (A.x + B.x) / 2;
    const my = (A.y + B.y) / 2;
    if ((cx - mx) * nx + (cy - my) * ny < 0) { nx = -nx; ny = -ny; }
    // extend along the edge so the 120-degree corners are covered
    const ax = A.x - ux * W;
    const ay = A.y - uy * W;
    const bx = B.x + ux * W;
    const by = B.y + uy * W;
    const grad = g.createLinearGradient(mx, my, mx + nx * W, my + ny * W);
    if (EDGE === 'feather') {
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalCompositeOperation = 'destination-out';
    } else {
      const col = d.edgeParentColor[i] ?? BG;
      grad.addColorStop(0, hexToRgba(col, 0.92));
      grad.addColorStop(1, hexToRgba(col, 0));
      g.globalCompositeOperation = 'source-atop';
    }
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    g.lineTo(bx + nx * W, by + ny * W);
    g.lineTo(ax + nx * W, ay + ny * W);
    g.closePath();
    g.fill();
    g.globalCompositeOperation = 'source-over';
  }
}

/** Child rendered into an offscreen at alpha 1, masked at the hull, then blitted once. */
function drawDocViaScratch(d: DocDraw): number {
  const hullS = d.hullWorld.map((p) => screenOf(p.x, p.y));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of hullS) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const pad = EDGE_PX + 4;
  const bx = Math.max(0, Math.floor(minX - pad));
  const by = Math.max(0, Math.floor(minY - pad));
  const w = Math.min(cssW, Math.ceil(maxX + pad)) - bx;
  const h = Math.min(cssH, Math.ceil(maxY + pad)) - by;
  if (w <= 1 || h <= 1) return 0;

  const t0 = performance.now();
  const sw = Math.ceil(w * dpr);
  const sh = Math.ceil(h * dpr);
  if (scratch.width < sw || scratch.height < sh) {
    scratch.width = Math.max(scratch.width, sw);
    scratch.height = Math.max(scratch.height, sh);
  }
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  sctx.clearRect(0, 0, sw, sh);
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.translate(-bx, -by);
  const n = drawDocCells(sctx, d);
  applyEdgeBands(sctx, d, hullS, EDGE_PX);
  sctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.drawImage(scratch, 0, 0, sw, sh, bx, by, w, h);
  scratchMs += performance.now() - t0;
  scratchPx += sw * sh;
  return n;
}

// ------------------------------------------------------------------ seam probe
/**
 * A seam probe is a SCREEN-space scanline centred on a known world-space hull crossing:
 * +-L CSS px along the world direction `d`. Screen-space, because the gradient across a
 * frontier is a screen-space phenomenon and a world-space line runs off the viewport the
 * moment you zoom in.
 */
interface Probe { id: string; c: { x: number; y: number }; d: { x: number; y: number }; halfWorld: number; cellWorld: number }
const PROBES: Probe[] = (() => {
  const S = fx.byId.get('shore') as Doc;
  const A = fx.byId.get('forestA') as Doc;
  const B = fx.byId.get('forestB') as Doc;
  const G = fx.byId.get('grand') as Doc;
  const sc = docToWorld(S, 0, 0);
  const ac = docToWorld(A, 0, 0);
  const bc = docToWorld(B, 0, 0);
  const gc = docToWorld(G, 0, 0);
  const Rs = HULL_R_LOCAL * S.transformToWorld.scale * SQRT3_2;   // hull EDGE midpoint radius
  const Rg = HULL_R_LOCAL * G.transformToWorld.scale * SQRT3_2;
  const ux = (bc.x - ac.x);
  const uy = (bc.y - ac.y);
  const ul = Math.hypot(ux, uy);
  const kissX = (ac.x + bc.x) / 2;
  const kissY = (ac.y + bc.y) / 2;
  // Probe along a hull CORNER direction (30 deg + 60k), never a hull edge midpoint: the
  // rosette's rim zigzags, and at an edge midpoint the idealised hull runs through the
  // UNDER-FILL notch, so both sides of the crossing are parent and the gradient reads 0.
  // At a corner the outermost rim cell's own edge midpoint IS the hull, exactly.
  const RaC = HULL_R_LOCAL * A.transformToWorld.scale;
  const RsC = HULL_R_LOCAL * S.transformToWorld.scale;
  const RgC = HULL_R_LOCAL * G.transformToWorld.scale;
  const cellD1 = HEX_SIZE * A.transformToWorld.scale;   // 5.333 ROOT world px
  const cellD2 = HEX_SIZE * G.transformToWorld.scale;   // 0.356 ROOT world px
  const dir = (deg: number): { x: number; y: number } =>
    ({ x: Math.cos((Math.PI / 180) * deg), y: Math.sin((Math.PI / 180) * deg) });
  const d150 = dir(150);
  const d30 = dir(30);
  void bc; void kissX; void kissY; void ux; void uy; void ul; void Rs; void Rg;
  return [
    // forestA -> its own parent hex at the 150 deg hull corner. NOT the 30 deg corner
    // (the shared edge with forestB): the fixture's road runs along that axis and a probe
    // there reads the ROAD's edges, not the frontier.
    { id: 'forestACorner', c: { x: ac.x + RaC * d150.x, y: ac.y + RaC * d150.y }, d: d150, halfWorld: RaC * 0.5, cellWorld: cellD1 },
    // the ISOLATED child's 30 deg hull corner - this is also the `at=shorecorner` anchor,
    // so it stays on screen at every zoom in that lineup
    { id: 'shoreCorner', c: { x: sc.x + RsC * d30.x, y: sc.y + RsC * d30.y }, d: d30, halfWorld: RsC * 0.5, cellWorld: cellD1 },
    // depth-2 child -> depth-1 parent
    { id: 'grandCorner', c: { x: gc.x + RgC * d30.x, y: gc.y + RgC * d30.y }, d: d30, halfWorld: RgC * 0.5, cellWorld: cellD2 },
  ];
})();

interface SeamResult { id: string; crossGrad: number; interiorMax: number; interiorP90: number; seamRatio: number; windowPx: number; samples: number }

const HUD_RECT = { x: 0, y: 0, w: 346, h: 80 };

function runSeamProbes(): { seamRatio: number | null; seams: Record<string, SeamResult | null> } {
  const seams: Record<string, SeamResult | null> = {};
  // plan every probe first, so the (expensive) readback only happens when one is usable
  const plans: Array<{ p: Probe; s0: { x: number; y: number }; s1: { x: number; y: number }; sc: { x: number; y: number }; L: number }> = [];
  for (const p of PROBES) {
    seams[p.id] = null;
    const sc = screenOf(p.c.x, p.c.y);
    if (sc.x < 4 || sc.y < 4 || sc.x > cssW - 4 || sc.y > cssH - 4) continue;
    // window sized to ~3 child cells each side, so the denominator always contains a few
    // ordinary lattice strokes; never wider than the child's own half-extent
    const L = Math.min(Math.max(40, Math.min(260, 3 * p.cellWorld * zoom)), p.halfWorld * zoom);
    if (L < 25) continue;
    const s0 = { x: sc.x - p.d.x * L, y: sc.y - p.d.y * L };
    const s1 = { x: sc.x + p.d.x * L, y: sc.y + p.d.y * L };
    const inBounds = (s: { x: number; y: number }): boolean => s.x >= 0 && s.y >= 0 && s.x <= cssW - 1 && s.y <= cssH - 1;
    if (!inBounds(s0) || !inBounds(s1)) continue;
    const hitsHud = (s: { x: number; y: number }): boolean =>
      s.x >= HUD_RECT.x && s.x <= HUD_RECT.x + HUD_RECT.w && s.y >= HUD_RECT.y && s.y <= HUD_RECT.y + HUD_RECT.h;
    if (hitsHud(s0) || hitsHud(s1) || hitsHud(sc)) continue;
    plans.push({ p, s0, s1, sc, L });
  }
  let img: ImageData | null = null;
  if (plans.length) {
    try { img = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch { img = null; }
  }
  for (const plan of plans) {
    if (!img) break;
    const { p, s0, s1, sc } = plan;
    const len = Math.hypot(s1.x - s0.x, s1.y - s0.y);
    const N = Math.min(600, Math.round(len * dpr));
    const lum: number[] = [];
    let ok = true;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const x = Math.round((s0.x + (s1.x - s0.x) * t) * dpr);
      const y = Math.round((s0.y + (s1.y - s0.y) * t) * dpr);
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) { ok = false; break; }
      const o = (y * img.width + x) * 4;
      lum.push(0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]);
    }
    if (!ok || lum.length < 40) continue;
    const d: number[] = [];
    for (let i = 1; i < lum.length; i++) d.push(Math.abs(lum[i] - lum[i - 1]));
    const tC = ((sc.x - s0.x) * (s1.x - s0.x) + (sc.y - s0.y) * (s1.y - s0.y)) / (len * len);
    const iC = Math.round(tC * N);
    if (iC < 8 || iC > N - 8) continue;
    const pxPerSample = len / N;                 // CSS px per sample
    const win = Math.max(3, Math.round(6 / pxPerSample));
    let crossGrad = 0;
    const interior: number[] = [];
    for (let i = 0; i < d.length; i++) {
      if (Math.abs(i - iC) <= win) crossGrad = Math.max(crossGrad, d[i]);
      else if (Math.abs(i - iC) > win * 2) interior.push(d[i]);
    }
    if (interior.length < 20) continue;
    interior.sort((a, b) => a - b);
    const p90 = interior[Math.min(interior.length - 1, Math.floor(interior.length * 0.9))];
    // the loudest ORDINARY feature nearby (a lattice stroke). A percentile is useless here:
    // strokes are 2-4 px out of a 500-sample window, so p90 is flat 0 at every zoom.
    const imax = interior[interior.length - 1];
    seams[p.id] = {
      id: p.id,
      crossGrad: +crossGrad.toFixed(2),
      interiorMax: +imax.toFixed(2),
      interiorP90: +p90.toFixed(2),
      seamRatio: +(crossGrad / Math.max(1, imax)).toFixed(3),
      windowPx: +plan.L.toFixed(1),
      samples: lum.length,
    };
  }
  const primary = seams.shoreCorner ?? seams.forestACorner ?? seams.grandCorner;
  return { seamRatio: primary ? primary.seamRatio : null, seams };
}

// ------------------------------------------------------------------ draw
function draw(): void {
  clock.beginDraw();
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, cssW, cssH);

  cellsDrawn = 0;
  erasedShown = 0;
  docsLive = 0;
  deepestDrawn = 0;
  scratchMs = 0;
  scratchPx = 0;

  for (const d of draws) {
    const rad = d.worldHexSize * zoom;
    if (rad < 0.55) continue;                 // sub-pixel: the parent already covers it
    const useScratch = d.doc.parentId !== null && EDGE !== 'hard';
    const n = useScratch ? drawDocViaScratch(d) : drawDocCells(ctx, d);
    cellsDrawn += n;
    if (n > 0) { docsLive++; deepestDrawn = Math.max(deepestDrawn, d.doc.depth); }
  }

  // road: an authored feature that crosses a child boundary
  for (const road of fx.roads) {
    ctx.lineWidth = Math.max(1, road.width * zoom);
    ctx.strokeStyle = road.color;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    road.points.forEach((p, i) => {
      const s = screenOf(p.x, p.y);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    });
    ctx.stroke();
  }

  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  ctx.fillStyle = '#161b24'; // OPAQUE, or the hole detector reads it as background
  ctx.fillRect(8, 8, 330, 64);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`fill=${FILL}  edge=${EDGE}  erase=${ERASE ? 1 : 0}`, 16, 26);
  ctx.fillText(`zoom ${zoom.toFixed(2)}  docs ${docsLive}/${draws.length}  d${deepestDrawn}`, 16, 44);
  ctx.fillText(`cells ${cellsDrawn}/${cellsTotal}  erased ${erasedShown}  scratch ${scratchMs.toFixed(1)}ms`, 16, 62);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
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
    points: footprintWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => {
    const seam = runSeamProbes();
    return {
      fill: FILL,
      edge: EDGE,
      seamRatio: seam.seamRatio,
      erase: ERASE ? 1 : 0,
      at: AT,
      levelsLive: docsLive,
      deepestDrawn,
      cellsTotal,
      cellsDrawn,
      erasedTotal: erased.length,
      erasedShown,
      scratchMs: +scratchMs.toFixed(3),
      scratchPx,
      seams: seam.seams,
      framesDrawn,
    };
  },
  reset: () => { resize(); home(); clock.clear(); },
};

// keep the unused-import linter quiet about helpers kept for reference
void worldToDoc;
void FIDUCIAL_COLOR;
