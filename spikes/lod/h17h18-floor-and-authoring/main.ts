/**
 * spikes/lod/h17h18-floor-and-authoring
 *
 * H17 (degradation character past the authored floor, gate G6) +
 * H18 (derived + latched edit rung, author in place).
 *
 * Simplest possible simultaneous composite of the shared fixture: every doc drawn
 * over its parent at its own affine, no tiling, no caching. On top of that:
 *
 *   ?floor=crisp   giant crisp hexes past the floor (the naive result)
 *   ?floor=blur    cap the render scale at the floor, blit the composite up with smoothing
 *   ?floor=ghost   deterministic procedural micro-hexes, desaturated + 42% alpha + hatch
 *   ?floor=spring  the camera resists: displayed = floor + (req-floor)*0.25, springs back
 *
 *   ?home=child    park the lake/forest boundary INSIDE forestA (deepest authored = depth 1)
 *   ?home=nochild  park a ROOT hills/forest boundary with no child doc near it
 *   ?home=fiducial park the fixture fiducial (dives root -> range -> grand)
 */
import {
  buildFixture, docToWorld, worldToDoc,
  HEX_SIZE, CHILD_SCALE, CHILD_RINGS, ORIENTATION, TERRAIN_PALETTE,
  type Doc, type Fixture, type TerrainId,
} from '../_shared/fixture';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const FLOOR_MODE = (params.get('floor') ?? 'crisp') as 'crisp' | 'blur' | 'ghost' | 'spring';
const HOME = (params.get('home') ?? 'child') as 'child' | 'nochild' | 'shore' | 'fiducial';
const FIDUCIAL_ON = params.get('fiducial') === '1';

/** A doc is "past its floor" once one of its cells is wider than this on screen. */
const FLOOR_CELL_PX = 120;
const SPRING_K = 0.25;          // fraction of the overshoot actually delivered
const SPRING_HOLD_MS = 300;     // quiet time before the rubber band starts
const SPRING_RELAX = 0.18;      // per-frame relaxation toward the floor
const GHOST_ALPHA = 0.42;
const GHOST_MAX_LEVELS = 3;
const GHOST_BUDGET = 24000;
const MIN_ZOOM = 0.62;
const MAX_ZOOM = 5000;
const WHEEL_K = 0.0015;
const PAINT_COLOR = '#ff7a1a';

// ------------------------------------------------------------------ world
const fx: Fixture = buildFixture(SEED);

interface DrawCell { q: number; r: number; wx: number; wy: number; color: string; terrain: TerrainId; painted: boolean }
interface DocDraw {
  doc: Doc;
  worldHexSize: number;             // hex radius in ROOT world px
  cells: DrawCell[];
  byKey: Map<string, DrawCell>;
  minted: boolean;
}

const ghostGeom = new HexGeometry(HEX_SIZE, ORIENTATION, null);
const MICRO: Array<{ q: number; r: number; x: number; y: number }> = ghostGeom
  .getAllRadialCells(CHILD_RINGS)
  .map(({ q, r }) => { const w = ghostGeom.hexToWorld(q, r); return { q, r, x: w.worldX, y: w.worldY }; });

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) { const a = (Math.PI / 180) * 60 * i; out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) }); }
  return out;
}
const UNIT_CORNERS = flatCorners(1);

function makeDocDraw(doc: Doc, minted: boolean): DocDraw {
  const cells: DrawCell[] = [];
  const byKey = new Map<string, DrawCell>();
  for (const c of doc.cells.values()) {
    const local = doc.geometry.hexToWorld(c.q, c.r);
    const w = docToWorld(doc, local.worldX, local.worldY);
    const dc: DrawCell = { q: c.q, r: c.r, wx: w.x, wy: w.y, color: c.color, terrain: c.terrain, painted: false };
    cells.push(dc);
    byKey.set(c.q + ',' + c.r, dc);
  }
  return { doc, worldHexSize: HEX_SIZE * doc.transformToWorld.scale, cells, byKey, minted };
}

let docDraws: DocDraw[] = [];
let childAt = new Set<string>();       // `docId:q,r` -> that hex owns an authored child
let docsMinted = 0;
let cellsPainted = 0;

function rebuildIndex(): void {
  docDraws.sort((a, b) => a.doc.depth - b.doc.depth);
  childAt = new Set<string>();
  for (const d of docDraws) {
    if (d.doc.parentId && d.doc.parentHex) childAt.add(d.doc.parentId + ':' + d.doc.parentHex.q + ',' + d.doc.parentHex.r);
  }
}

function hexRing(q: number, r: number): number { return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)); }

// ------------------------------------------------------------------ authoring state (H18)
interface Latch { docId: string; scale: number; depth: number; minted: boolean }
let latch: Latch | null = null;
interface StrokeRec { docId: string; depth: number; q: number; r: number; zoomAtPaint: number; cellWorldSize: number; minted: boolean }
const strokeLog: StrokeRec[] = [];

function resetWorld(): void {
  for (const d of fx.docs) d.childIds = d.childIds.filter((id) => !id.startsWith('minted-'));
  docDraws = fx.docs.map((d) => makeDocDraw(d, false));
  docsMinted = 0;
  cellsPainted = 0;
  strokeLog.length = 0;
  latch = null;
  rebuildIndex();
}

interface Hit { dd: DocDraw; q: number; r: number; cell: DrawCell }
/** deepest authored cell at a ROOT-world point */
function resolveDeepest(wx: number, wy: number): Hit | null {
  for (let i = docDraws.length - 1; i >= 0; i--) {
    const dd = docDraws[i];
    const p = worldToDoc(dd.doc, wx, wy);
    const { q, r } = dd.doc.geometry.worldToHex(p.x, p.y);
    if (hexRing(q, r) > dd.doc.rings) continue;
    const cell = dd.byKey.get(q + ',' + r);
    if (cell) return { dd, q, r, cell };
  }
  return null;
}

// ------------------------------------------------------------------ viewport
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const off = document.createElement('canvas');
const octx = off.getContext('2d') as CanvasRenderingContext2D;

let cssW = 0;
let cssH = 0;
let zoom = MIN_ZOOM;      // DISPLAYED zoom (what worldAt/screenOf/getZoom use)
let reqZoom = MIN_ZOOM;   // REQUESTED zoom (what the wheel asked for)
let offX = 0;
let offY = 0;
let lastGestureAt = -1e9;
const anchor = { x: 0, y: 0 };

let cellsDrawn = 0;
let ghostCells = 0;
let docsLive = 0;
let framesDrawn = 0;
let floorDoc = 'root';
let floorZoomNow = FLOOR_CELL_PX / HEX_SIZE;
let renderScaleNow = MIN_ZOOM;
const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

function worldAt(x: number, y: number): { x: number; y: number } { return { x: (x - offX) / zoom, y: (y - offY) / zoom }; }
function screenOf(wx: number, wy: number): { x: number; y: number } { return { x: offX + wx * zoom, y: offY + wy * zoom }; }

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  anchor.x = cssW * 0.32;
  anchor.y = cssH * 0.38;
}

function midOfHexes(doc: Doc, a: { q: number; r: number }, b: { q: number; r: number }): { x: number; y: number } {
  const wa = doc.geometry.hexToWorld(a.q, a.r);
  const wb = doc.geometry.hexToWorld(b.q, b.r);
  return docToWorld(doc, (wa.worldX + wb.worldX) / 2, (wa.worldY + wb.worldY) / 2);
}

function homeWorld(): { x: number; y: number } {
  if (HOME === 'fiducial') return { x: fx.fiducial.x, y: fx.fiducial.y };
  if (HOME === 'nochild') {
    // a ROOT hills/forest boundary with no child doc anywhere near: root (-2,2) | (-1,2)
    return midOfHexes(fx.root, { q: -2, r: 2 }, { q: -1, r: 2 });
  }
  if (HOME === 'shore') {
    const shore = fx.byId.get('shore') as Doc;
    return { x: shore.transformToWorld.tx, y: shore.transformToWorld.ty };
  }
  // 'child': the lake/forest boundary INSIDE forestA - deepest authored doc is depth 1,
  // nothing below it, and there is real colour contrast at every zoom.
  const forestA = fx.byId.get('forestA') as Doc;
  return midOfHexes(forestA, { q: -2, r: 0 }, { q: -2, r: -1 });
}

function home(): void {
  zoom = MIN_ZOOM;
  reqZoom = MIN_ZOOM;
  const h = homeWorld();
  offX = cssW * 0.32 - h.x * zoom;
  offY = cssH * 0.38 - h.y * zoom;
  anchor.x = cssW * 0.32;
  anchor.y = cssH * 0.38;
  lastGestureAt = -1e9;
}

/** floor zoom for whatever authored doc is deepest under a screen point */
function floorZoomAtScreen(x: number, y: number): { z: number; docId: string } {
  const w = worldAt(x, y);
  const hit = resolveDeepest(w.x, w.y);
  const scale = hit ? hit.dd.doc.transformToWorld.scale : 1;
  return { z: FLOOR_CELL_PX / (HEX_SIZE * scale), docId: hit ? hit.dd.doc.id : 'none' };
}

function applyZoom(nextReq: number, ax: number, ay: number, gesture: boolean): void {
  const w = worldAt(ax, ay);
  reqZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nextReq));
  let disp = reqZoom;
  if (FLOOR_MODE === 'spring') {
    const f = floorZoomAtScreen(ax, ay).z;
    if (reqZoom > f) disp = f + (reqZoom - f) * SPRING_K;
  }
  zoom = disp;
  offX = ax - w.x * zoom;
  offY = ay - w.y * zoom;
  anchor.x = ax;
  anchor.y = ay;
  if (gesture) lastGestureAt = performance.now();
}

function springTick(): void {
  if (FLOOR_MODE !== 'spring') return;
  if (performance.now() - lastGestureAt < SPRING_HOLD_MS) return;
  const f = floorZoomAtScreen(anchor.x, anchor.y).z;
  if (reqZoom <= f * 1.0005) return;
  const next = reqZoom + (f - reqZoom) * SPRING_RELAX;
  applyZoom(Math.abs(next - f) / f < 0.002 ? f : next, anchor.x, anchor.y, false);
}

// ------------------------------------------------------------------ ghost infill (H17)
const VARIANTS: Record<TerrainId, Array<[TerrainId, number]>> = {
  ocean: [['ocean', 0.95], ['coast', 0.05]],
  coast: [['coast', 0.75], ['ocean', 0.15], ['plains', 0.10]],
  plains: [['plains', 0.82], ['forest', 0.12], ['hills', 0.06]],
  forest: [['forest', 0.80], ['hills', 0.15], ['plains', 0.05]],
  hills: [['hills', 0.78], ['mountains', 0.12], ['plains', 0.10]],
  mountains: [['mountains', 0.85], ['hills', 0.15]],
  lake: [['lake', 0.92], ['coast', 0.08]],
  town: [['town', 0.70], ['plains', 0.30]],
};

function hash32(a: number, b: number, s: number): number {
  let h = s ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
/** deterministic: seeded only by (docId, coarse q/r, micro q/r, level). Nothing is stored. */
function ghostTerrain(seed: number, mq: number, mr: number, base: TerrainId): TerrainId {
  const h = hash32(mq, mr, seed);
  const u = (h >>> 8) / 0x1000000;
  let acc = 0;
  for (const [t, p] of VARIANTS[base]) { acc += p; if (u < acc) return t; }
  return base;
}
const GHOST_CACHE = new Map<TerrainId, string>();
function ghostColor(t: TerrainId): string {
  const hit = GHOST_CACHE.get(t);
  if (hit) return hit;
  const n = parseInt(TERRAIN_PALETTE[t].slice(1), 16);
  const r = (n >> 16) & 255; const g = (n >> 8) & 255; const b = n & 255;
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  // heavily desaturated AND lifted: a ghost must differ from its parent fill even when the
  // procedural variant happens to equal the parent terrain
  const mix = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 0.28 + luma * 0.72 + 26)));
  const out = 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  GHOST_CACHE.set(t, out);
  return out;
}

// ------------------------------------------------------------------ paint the world
interface View { ox: number; oy: number; z: number; w: number; h: number }

function hexPath(c: CanvasRenderingContext2D, sx: number, sy: number, rpx: number): void {
  c.beginPath();
  c.moveTo(sx + UNIT_CORNERS[0].x * rpx, sy + UNIT_CORNERS[0].y * rpx);
  for (let k = 1; k < 6; k++) c.lineTo(sx + UNIT_CORNERS[k].x * rpx, sy + UNIT_CORNERS[k].y * rpx);
  c.closePath();
}

function hexPathTo(p: Path2D, sx: number, sy: number, rpx: number): void {
  p.moveTo(sx + UNIT_CORNERS[0].x * rpx, sy + UNIT_CORNERS[0].y * rpx);
  for (let k = 1; k < 6; k++) p.lineTo(sx + UNIT_CORNERS[k].x * rpx, sy + UNIT_CORNERS[k].y * rpx);
  p.closePath();
}

function ghostInto(
  c: CanvasRenderingContext2D, v: View,
  wx: number, wy: number, hexWorld: number, seed: number, base: TerrainId, level: number,
): void {
  if (level > GHOST_MAX_LEVELS) return;
  if (hexWorld * v.z <= FLOOR_CELL_PX) return;
  if (ghostCells > GHOST_BUDGET) return;
  const factor = (hexWorld / HEX_SIZE) * CHILD_SCALE;
  const microWorld = hexWorld * CHILD_SCALE;
  const microPx = microWorld * v.z;
  if (microPx < 2.2) return;
  const margin = microPx * 2;
  for (const m of MICRO) {
    const mwx = wx + factor * m.x;
    const mwy = wy + factor * m.y;
    const sx = v.ox + mwx * v.z;
    const sy = v.oy + mwy * v.z;
    if (sx < -margin || sy < -margin || sx > v.w + margin || sy > v.h + margin) continue;
    const t = ghostTerrain(seed, m.q, m.r, base);
    hexPath(c, sx, sy, microPx);
    c.fillStyle = ghostColor(t);
    c.fill();
    if (microPx >= 3) { c.strokeStyle = 'rgba(232,238,248,0.30)'; c.lineWidth = 1; c.stroke(); }
    ghostCells++;
    ghostInto(c, v, mwx, mwy, microWorld, hash32(m.q, m.r, Math.imul(seed, 2654435761)), t, level + 1);
  }
}

function paintWorld(c: CanvasRenderingContext2D, v: View, allowGhost: boolean): void {
  c.fillStyle = '#0b0e13';
  c.fillRect(0, 0, v.w, v.h);

  cellsDrawn = 0;
  ghostCells = 0;
  docsLive = 0;
  const ghostMask = allowGhost ? new Path2D() : null;
  let ghostMaskUsed = false;

  for (const d of docDraws) {
    const rpx = d.worldHexSize * v.z;           // hex radius in target px
    if (rpx < 0.55) continue;
    const margin = rpx * 2;
    const stroke = rpx >= 5;
    let any = 0;
    c.lineWidth = Math.max(0.4, Math.min(1.4, rpx * 0.04));
    c.strokeStyle = 'rgba(0,0,0,0.42)';

    for (const cell of d.cells) {
      const sx = v.ox + cell.wx * v.z;
      const sy = v.oy + cell.wy * v.z;
      if (sx < -margin || sy < -margin || sx > v.w + margin || sy > v.h + margin) continue;
      hexPath(c, sx, sy, rpx);
      c.fillStyle = cell.color;
      c.fill();
      if (stroke) c.stroke();
      any++;
      // ghost only where this cell is the deepest AUTHORED thing and is past ITS floor
      if (ghostMask && rpx > FLOOR_CELL_PX && !childAt.has(d.doc.id + ':' + cell.q + ',' + cell.r)) {
        c.save();
        hexPath(c, sx, sy, rpx);
        c.clip();
        c.globalAlpha = GHOST_ALPHA;
        ghostInto(c, v, cell.wx, cell.wy, d.worldHexSize, hash32(cell.q, cell.r, strHash(d.doc.id)), cell.terrain, 1);
        c.restore();
        hexPathTo(ghostMask, sx, sy, rpx);
        ghostMaskUsed = true;
      }
    }
    cellsDrawn += any;
    if (any) docsLive++;
  }

  // hatch: one screen-space pass over the union of ghosted cells, constant 7 px pitch,
  // so procedural infill can never be mistaken for authored content at any zoom
  if (ghostMask && ghostMaskUsed) {
    c.save();
    c.clip(ghostMask);
    c.strokeStyle = 'rgba(8,10,14,0.50)';
    c.lineWidth = 1.2;
    c.beginPath();
    const span = v.w + v.h;
    for (let i = -v.h; i < span; i += 6) { c.moveTo(i, 0); c.lineTo(i + v.h, v.h); }
    c.stroke();
    c.restore();
  }

  // road + labels (authored vector content, so it scales with the rest)
  for (const road of fx.roads) {
    c.lineWidth = Math.max(1, road.width * v.z);
    c.strokeStyle = road.color;
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    road.points.forEach((p, i) => {
      const x = v.ox + p.x * v.z; const y = v.oy + p.y * v.z;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    });
    c.stroke();
  }
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const l of fx.labels) {
    const px = l.fontSize * v.z;
    if (px < 9 || px > 400) continue;
    const x = v.ox + l.x * v.z; const y = v.oy + l.y * v.z;
    c.font = px.toFixed(1) + 'px ui-sans-serif, system-ui, sans-serif';
    c.lineWidth = Math.max(2, px * 0.14);
    c.strokeStyle = 'rgba(0,0,0,0.75)'; c.strokeText(l.text, x, y);
    c.fillStyle = '#f2ead8'; c.fillText(l.text, x, y);
  }
  c.textAlign = 'start'; c.textBaseline = 'alphabetic';
}

/** the deepest doc with at least one cell on screen -> the render cap must never blur IT away */
function deepestVisibleScale(): number {
  let best = 1;
  for (const d of docDraws) {
    const rpx = d.worldHexSize * zoom;
    if (rpx < 0.55) continue;
    const margin = rpx * 2;
    for (const cell of d.cells) {
      const sx = offX + cell.wx * zoom;
      const sy = offY + cell.wy * zoom;
      if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssH + margin) continue;
      best = Math.min(best, d.doc.transformToWorld.scale);
      break;
    }
  }
  return best;
}

const clock = startFrameClock();

function draw(): void {
  clock.beginDraw();
  const f = floorZoomAtScreen(anchor.x, anchor.y);
  floorZoomNow = f.z;
  floorDoc = f.docId;
  const pastFloorX = zoom / floorZoomNow;

  if (FLOOR_MODE === 'blur' && pastFloorX > 1) {
    const cap = FLOOR_CELL_PX / (HEX_SIZE * deepestVisibleScale());
    let k = zoom / cap;
    if (k > 1.0001) {
      k = Math.min(k, cssW / 12);
      const ow = Math.max(12, Math.ceil(cssW / k));
      const oh = Math.max(8, Math.ceil(cssH / k));
      if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh; }
      octx.setTransform(1, 0, 0, 1, 0, 0);
      renderScaleNow = zoom / k;
      paintWorld(octx, { ox: offX / k, oy: offY / k, z: zoom / k, w: ow, h: oh }, false);
      ctx.fillStyle = '#0b0e13';
      ctx.fillRect(0, 0, cssW, cssH);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(off, 0, 0, ow, oh, 0, 0, ow * k, oh * k);
    } else {
      renderScaleNow = zoom;
      paintWorld(ctx, { ox: offX, oy: offY, z: zoom, w: cssW, h: cssH }, false);
    }
  } else {
    renderScaleNow = zoom;
    paintWorld(ctx, { ox: offX, oy: offY, z: zoom, w: cssW, h: cssH }, FLOOR_MODE === 'ghost');
  }

  // brush preview: the literal cell that WOULD be written, at its true size
  if (latch) {
    const cur = latch;
    const dd = docDraws.find((d) => d.doc.id === cur.docId);
    if (dd) {
      const w = worldAt(anchor.x, anchor.y);
      const p = worldToDoc(dd.doc, w.x, w.y);
      const { q, r } = dd.doc.geometry.worldToHex(p.x, p.y);
      const local = dd.doc.geometry.hexToWorld(q, r);
      const wc = docToWorld(dd.doc, local.worldX, local.worldY);
      const s = screenOf(wc.x, wc.y);
      hexPath(ctx, s.x, s.y, dd.worldHexSize * zoom);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.stroke();
    }
  }

  // fiducial LAST, in screen space, unantialiased
  if (FIDUCIAL_ON) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // HUD (OPAQUE - a translucent HUD reads as a hole to the rig)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 340, 82);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText('floor=' + FLOOR_MODE + '  home=' + HOME + '  zoom ' + zoom.toFixed(2), 16, 26);
  ctx.fillText('floorDoc ' + floorDoc + ' @' + floorZoomNow.toFixed(1) + '  past ' + pastFloorX.toFixed(2) + 'x', 16, 44);
  ctx.fillText('cells ' + cellsDrawn + '  ghost ' + ghostCells + '  docs ' + docsLive, 16, 62);
  ctx.fillText('minted ' + docsMinted + '  painted ' + cellsPainted + '  latch ' + (latch ? latch.docId : '-'), 16, 80);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void { springTick(); draw(); requestAnimationFrame(loop); }

// ------------------------------------------------------------------ authoring (H18)
function mintChildAt(parentDD: DocDraw, q: number, r: number): DocDraw {
  const parent = parentDD.doc;
  const centre = parent.geometry.hexToWorld(q, r);
  const geometry = new HexGeometry(HEX_SIZE, ORIENTATION, {
    maxCol: CHILD_RINGS * 2 + 1, maxRow: CHILD_RINGS * 2 + 1, maxRing: CHILD_RINGS,
  });
  const doc: Doc = {
    id: 'minted-' + parent.id + '-' + q + ',' + r,
    depth: parent.depth + 1,
    parentId: parent.id,
    parentHex: { q, r },
    rings: CHILD_RINGS,
    hexSize: HEX_SIZE,
    geometry,
    cells: new Map(),
    transformToWorld: {
      scale: parent.transformToWorld.scale * CHILD_SCALE,
      tx: parent.transformToWorld.tx + parent.transformToWorld.scale * centre.worldX,
      ty: parent.transformToWorld.ty + parent.transformToWorld.scale * centre.worldY,
    },
    labels: [], roads: [], secret: null, childIds: [],
  };
  // INHERIT: every new cell takes the colour of the authored cell it lands in, so the frame
  // after creation is identical to the frame before it except for the finer grid lines.
  for (const { q: cq, r: cr } of geometry.getAllRadialCells(CHILD_RINGS)) {
    const local = geometry.hexToWorld(cq, cr);
    const w = docToWorld(doc, local.worldX, local.worldY);
    const src = resolveDeepest(w.x, w.y);
    doc.cells.set(cq + ',' + cr, {
      q: cq, r: cr,
      terrain: src ? src.cell.terrain : 'plains',
      color: src ? src.cell.color : TERRAIN_PALETTE.plains,
    });
  }
  parent.childIds.push(doc.id);
  const dd = makeDocDraw(doc, true);
  docDraws.push(dd);
  docsMinted++;
  rebuildIndex();
  return dd;
}

function strokeStart(x: number, y: number): Latch | null {
  anchor.x = x; anchor.y = y;
  const w = worldAt(x, y);
  let hit = resolveDeepest(w.x, w.y);
  if (!hit) { latch = null; return null; }
  let minted = false;
  // AUTHOR IN PLACE: past the floor, over a cell with no child of its own -> mint it
  const rpx = hit.dd.worldHexSize * zoom;
  if (rpx > FLOOR_CELL_PX && !childAt.has(hit.dd.doc.id + ':' + hit.q + ',' + hit.r) && hit.dd.doc.depth < 3) {
    mintChildAt(hit.dd, hit.q, hit.r);
    hit = resolveDeepest(w.x, w.y);
    minted = true;
  }
  if (!hit) { latch = null; return null; }
  latch = { docId: hit.dd.doc.id, scale: hit.dd.doc.transformToWorld.scale, depth: hit.dd.doc.depth, minted };
  return latch;
}

function paintAt(x: number, y: number, color?: string): StrokeRec | null {
  if (!latch) return null;
  const cur = latch;
  const dd = docDraws.find((d) => d.doc.id === cur.docId);
  if (!dd) return null;
  const w = worldAt(x, y);
  const p = worldToDoc(dd.doc, w.x, w.y);
  const { q, r } = dd.doc.geometry.worldToHex(p.x, p.y);
  if (hexRing(q, r) > dd.doc.rings) return null;
  const cell = dd.byKey.get(q + ',' + r);
  if (!cell) return null;
  if (!cell.painted) cellsPainted++;
  cell.color = color ?? PAINT_COLOR;
  cell.painted = true;
  const rec: StrokeRec = {
    docId: dd.doc.id, depth: dd.doc.depth, q, r,
    zoomAtPaint: +zoom.toFixed(4),
    cellWorldSize: +dd.worldHexSize.toFixed(6),
    minted: dd.minted,
  };
  strokeLog.push(rec);
  return rec;
}

function strokeEnd(): void { latch = null; }

// ------------------------------------------------------------------ input
canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  applyZoom(reqZoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY, true);
}, { passive: false });

let dragging = false;
let painting = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  canvas.setPointerCapture(e.pointerId);
  if (e.shiftKey) { painting = true; strokeStart(e.clientX, e.clientY); paintAt(e.clientX, e.clientY); return; }
  dragging = true; lastX = e.clientX; lastY = e.clientY;
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  anchor.x = e.clientX; anchor.y = e.clientY;
  if (painting) { paintAt(e.clientX, e.clientY); return; }
  if (!dragging) return;
  offX += e.clientX - lastX;
  offY += e.clientY - lastY;
  lastX = e.clientX; lastY = e.clientY;
});
const endPointer = (e: PointerEvent): void => {
  if (painting) { painting = false; strokeEnd(); }
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
window.addEventListener('resize', () => { resize(); });

// ------------------------------------------------------------------ contract surface
resize();
resetWorld();
home();

const hullWorld: Array<{ x: number; y: number }> = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  for (const { q, r } of fx.root.geometry.getAllRadialCells(12)) {
    if (hexRing(q, r) !== 12) continue;
    const w = fx.root.geometry.hexToWorld(q, r);
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

const ready = new Promise<void>((resolve) => {
  requestAnimationFrame(() => { draw(); requestAnimationFrame(() => { loop(); resolve(); }); });
});

/** deterministic digest of the ghost field over a fixed cell list - nothing is stored */
function ghostDigest(): number {
  let h = 2166136261;
  for (const dd of docDraws) {
    if (dd.minted) continue;
    for (let i = 0; i < dd.cells.length; i += 37) {
      const cell = dd.cells[i];
      const seed = hash32(cell.q, cell.r, strHash(dd.doc.id));
      for (const m of MICRO) {
        const t = ghostTerrain(seed, m.q, m.r, cell.terrain);
        h ^= strHash(t); h = Math.imul(h, 16777619);
      }
    }
  }
  return h >>> 0;
}

(window as unknown as { __lod: unknown }).__lod = {
  ready,
  worldAt,
  screenOf,
  getZoom: () => zoom,
  setZoom: (z: number, ax?: number, ay?: number) => applyZoom(z, ax ?? cssW * 0.32, ay ?? cssH * 0.38, true),
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({ kind: 'polygon', points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })) }),
  metrics: () => ({
    floorDoc,
    pastFloorX: +(zoom / floorZoomNow).toFixed(3),
    cellsDrawn,
    ghostCells,
    docsLive,
    renderScale: +renderScaleNow.toFixed(3),
    reqZoom: +reqZoom.toFixed(3),
    docsMinted,
    cellsPainted,
    framesDrawn,
  }),
  reset: () => { resize(); resetWorld(); home(); clock.clear(); },

  // --- H18 authoring surface (the probe drives real pointer events too)
  strokeStart: (x: number, y: number) => strokeStart(x, y),
  paint: (x: number, y: number, color?: string) => paintAt(x, y, color),
  strokeEnd: () => strokeEnd(),
  authoring: () => ({
    latch,
    strokeLog: strokeLog.slice(),
    docsMinted,
    cellsPainted,
    docIds: docDraws.map((d) => d.doc.id),
  }),
  probe: (x: number, y: number) => {
    const w = worldAt(x, y);
    const hit = resolveDeepest(w.x, w.y);
    return hit
      ? { docId: hit.dd.doc.id, depth: hit.dd.doc.depth, q: hit.q, r: hit.r, cellPx: hit.dd.worldHexSize * zoom }
      : null;
  },
  ghostDigest,
  floorAt: (x: number, y: number) => floorZoomAtScreen(x, y),
};
