/**
 * spikes/lod/h0-polished-swap - THE CONTROL ARM.
 *
 * Reproduces TODAY'S shipped sub-hex dive on the shared fixture, then polishes it.
 * Every other LOD spike's G3 (no pop) number is meaningless without this one.
 *
 *   ?swap=hard       (default) shipped behaviour: clamp at the ceiling, swap in ONE frame,
 *                    frozen parent bitmap backdrop under the child, 0.8x hysteresis out,
 *                    600 ms cooldown, one document drawn at a time, siblings invisible.
 *   ?swap=crossfade  windrose-5y8: in [0.85*ceiling, ceiling] composite the target child over
 *                    the parent with alpha = band progress; hard swap at the ceiling.
 *   ?swap=animated   hard swap + a 200 ms eased opacity+scale dissolve of the outgoing frame.
 *
 * The camera is in ROOT world px at all times so the rig sees ONE continuous zoom; the shipped
 * per-document ceiling DEFAULTS.maxZoom = 4 lands at rootZoom = 4 * 15^depth (4 / 60 / 900).
 * Backdrop placement is the SHIPPED computeBackdropPlacement, not a re-implementation.
 */
import {
  buildFixture, docToWorld, worldToDoc, HEX_SIZE, CHILD_RINGS, ORIENTATION,
  type Doc, type Fixture,
} from '../_shared/fixture';
import { computeBackdropPlacement } from '../../../src/geometry/core/subHexBackdrop';
import { startFrameClock } from '../_shared/instrument';

// ------------------------------------------------------------------ config
const params = new URLSearchParams(location.search);
const SEED = Number(params.get('seed') ?? 1) || 1;
const VARIANT = (params.get('swap') ?? 'hard') as 'hard' | 'crossfade' | 'animated';
const FIDUCIAL = params.get('fiducial') === '1';

const MIN_ZOOM = 0.62;
const MAX_ZOOM = 400;           // same range as _shared/fixtureDemo, so spikes compare
const WHEEL_K = 0.0015;
const DOC_MAX_ZOOM = 4;         // DEFAULTS.maxZoom - the shipped per-document ceiling
const LEVEL_RATIO = 15;         // CELLS_ACROSS; rootZoom ceiling = 4 * 15^depth
const HYSTERESIS = 0.8;         // surface back at 0.8x the ceiling
const COOLDOWN_MS = 600;
const BAND_LO = 0.85;           // crossfade band = [0.85*ceiling, ceiling] -> 3.4 .. 4.0
const ANIM_MS = 200;

const ceilingOf = (depth: number): number => DOC_MAX_ZOOM * Math.pow(LEVEL_RATIO, depth);

// ------------------------------------------------------------------ world prep
const fx: Fixture = buildFixture(SEED);

interface DrawCell { wx: number; wy: number; color: string }
interface DocDraw {
  doc: Doc;
  worldHexSize: number;                       // HEX_SIZE * transform.scale (ROOT world px)
  corners: Array<{ x: number; y: number }>;   // ROOT world px offsets
  cells: DrawCell[];
}

function flatCorners(radius: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * 60 * i;
    out.push({ x: radius * Math.cos(a), y: radius * Math.sin(a) });
  }
  return out;
}

const draws = new Map<string, DocDraw>();
for (const doc of fx.docs) {
  const cells: DrawCell[] = [];
  for (const c of doc.cells.values()) {
    const local = doc.geometry.hexToWorld(c.q, c.r);
    const w = docToWorld(doc, local.worldX, local.worldY);
    cells.push({ wx: w.x, wy: w.y, color: c.color });
  }
  const worldHexSize = HEX_SIZE * doc.transformToWorld.scale;
  draws.set(doc.id, { doc, worldHexSize, corners: flatCorners(worldHexSize), cells });
}
const cellsTotal = fx.docs.reduce((n, d) => n + d.cells.size, 0);

// conservative world footprint: hull of the ROOT outer ring's CENTRES (contract section 2)
const hullWorld: Array<{ x: number; y: number }> = (() => {
  const ring = (q: number, r: number): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const pts: Array<{ x: number; y: number }> = [];
  for (const c of fx.root.cells.values()) {
    if (ring(c.q, c.r) !== fx.root.rings) continue;
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

// ------------------------------------------------------------------ viewport / camera
const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
const scratch = document.createElement('canvas');
const sctx = scratch.getContext('2d') as CanvasRenderingContext2D;

let cssW = 0;
let cssH = 0;
let dpr = 1;
let zoom = MIN_ZOOM;
let offX = 0;
let offY = 0;

let activeId = 'root';
let lastTransitionAt = -1e9;
let transitions = 0;
let cellsDrawn = 0;
let levelsLive = 1;
let blendAlpha = 0;
let framesDrawn = 0;
const fiducialWorld = { x: fx.fiducial.x, y: fx.fiducial.y };

interface Anim { bitmap: HTMLCanvasElement; t0: number; ax: number; ay: number }
let anim: Anim | null = null;

/** A frozen parent bitmap plus everything computeBackdropPlacement needs to put it back. */
interface Backdrop {
  bitmap: HTMLCanvasElement;
  captureZoomDocLocal: number;              // parent-local zoom at dive time
  captureCenterDocLocal: { x: number; y: number };
  canvasSize: { width: number; height: number };   // CSS px
  hexCenterParentLocal: { x: number; y: number };
}
const backdrops = new Map<string, Backdrop>();   // keyed by the CHILD doc id

function resize(): void {
  dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  scratch.width = canvas.width;
  scratch.height = canvas.height;
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function home(): void {
  // park the fiducial under capture.mjs's cursor home so a plain zoom-in dives
  // root -> range -> grand, exactly like _shared/fixtureDemo
  zoom = MIN_ZOOM;
  offX = cssW * 0.32 - fx.fiducial.x * zoom;
  offY = cssH * 0.38 - fx.fiducial.y * zoom;
  activeId = 'root';
  backdrops.clear();
  transitions = 0;
  lastTransitionAt = -1e9;
  anim = null;
}

const worldAt = (x: number, y: number): { x: number; y: number } =>
  ({ x: (x - offX) / zoom, y: (y - offY) / zoom });
const screenOf = (wx: number, wy: number): { x: number; y: number } =>
  ({ x: offX + wx * zoom, y: offY + wy * zoom });

// ------------------------------------------------------------------ painting
function paintDocCells(
  c: CanvasRenderingContext2D, d: DocDraw, z: number, ox: number, oy: number,
): number {
  const scaled = d.worldHexSize * z;
  if (scaled < 0.4) return 0;
  const margin = scaled * 2;
  const stroke = scaled >= 5;
  c.lineWidth = Math.max(0.4, Math.min(1.4, scaled * 0.04));
  c.strokeStyle = 'rgba(0,0,0,0.42)';
  let n = 0;
  for (const cell of d.cells) {
    const sx = ox + cell.wx * z;
    const sy = oy + cell.wy * z;
    if (sx < -margin || sy < -margin || sx > cssW + margin || sy > cssH + margin) continue;
    c.beginPath();
    c.moveTo(sx + d.corners[0].x * z, sy + d.corners[0].y * z);
    for (let k = 1; k < 6; k++) c.lineTo(sx + d.corners[k].x * z, sy + d.corners[k].y * z);
    c.closePath();
    c.fillStyle = cell.color;
    c.fill();
    if (stroke) c.stroke();
    n++;
  }
  return n;
}

function paintDocExtras(
  c: CanvasRenderingContext2D, doc: Doc, z: number, ox: number, oy: number,
): void {
  // Routes and labels belong to the OPEN document only - a parent's road is not drawn
  // inside a sub-map today, which is part of what makes the swap feel like a cut.
  if (doc.id === 'root') {
    for (const road of fx.roads) {
      c.lineWidth = Math.max(1, road.width * z);
      c.strokeStyle = road.color;
      c.lineJoin = 'round';
      c.lineCap = 'round';
      c.beginPath();
      road.points.forEach((p, i) => {
        const sx = ox + p.x * z;
        const sy = oy + p.y * z;
        if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
      });
      c.stroke();
    }
  }
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  for (const l of fx.labels) {
    if (l.docId !== doc.id) continue;
    const px = l.fontSize * z;
    if (px < 9 || px > 260) continue;
    c.font = px.toFixed(1) + 'px ui-sans-serif, system-ui, sans-serif';
    c.lineWidth = Math.max(2, px * 0.14);
    c.strokeStyle = 'rgba(0,0,0,0.75)';
    c.strokeText(l.text, ox + l.x * z, oy + l.y * z);
    c.fillStyle = '#f2ead8';
    c.fillText(l.text, ox + l.x * z, oy + l.y * z);
  }
  c.textAlign = 'start';
  c.textBaseline = 'alphabetic';
}

/** Blit the frozen parent bitmap for `childId` using the SHIPPED placement math. */
function paintBackdrop(
  c: CanvasRenderingContext2D, childId: string, z: number, ox: number, oy: number,
): boolean {
  const bd = backdrops.get(childId);
  if (!bd) return false;
  const child = fx.byId.get(childId) as Doc;
  const scale = child.transformToWorld.scale;
  const centreWorld = { x: (cssW / 2 - ox) / z, y: (cssH / 2 - oy) / z };
  const centreLocal = worldToDoc(child, centreWorld.x, centreWorld.y);
  const placement = computeBackdropPlacement(
    { zoom: z * scale, center: centreLocal },
    {
      view: { zoom: bd.captureZoomDocLocal, center: bd.captureCenterDocLocal },
      canvasSize: bd.canvasSize,
      hexCenterWorld: bd.hexCenterParentLocal,
      parentHexSize: HEX_SIZE,
      childHexSize: HEX_SIZE,
      rings: CHILD_RINGS,
      orientation: ORIENTATION,
      northDirection: 0,
    },
    { width: cssW, height: cssH, northDirection: 0 },
  );
  if (!placement) return false;
  c.imageSmoothingEnabled = true;
  c.drawImage(bd.bitmap, placement.dx, placement.dy, placement.drawW, placement.drawH);
  return true;
}

/** The whole world as ONE open document over its frozen ancestry. */
function paintScene(
  c: CanvasRenderingContext2D, docId: string, z: number, ox: number, oy: number,
): number {
  c.fillStyle = '#0b0e13';
  c.fillRect(0, 0, cssW, cssH);
  paintBackdrop(c, docId, z, ox, oy);
  const d = draws.get(docId) as DocDraw;
  const n = paintDocCells(c, d, z, ox, oy);
  paintDocExtras(c, d.doc, z, ox, oy);
  return n;
}

// ------------------------------------------------------------------ transitions
function childUnderAnchor(doc: Doc, ax: number, ay: number): Doc | null {
  if (!doc.childIds.length) return null;
  const w = worldAt(ax, ay);
  const local = worldToDoc(doc, w.x, w.y);
  const { q, r } = doc.geometry.worldToHex(local.x, local.y);
  for (const id of doc.childIds) {
    const child = fx.byId.get(id) as Doc;
    if (child.parentHex && child.parentHex.q === q && child.parentHex.r === r) return child;
  }
  return null;
}

function snapshot(docId: string, z: number, ox: number, oy: number): HTMLCanvasElement {
  paintScene(sctx, docId, z, ox, oy);
  const out = document.createElement('canvas');
  out.width = scratch.width;
  out.height = scratch.height;
  (out.getContext('2d') as CanvasRenderingContext2D).drawImage(scratch, 0, 0);
  return out;
}

function dive(child: Doc, ax: number, ay: number): void {
  const parent = fx.byId.get(child.parentId as string) as Doc;
  const scale = parent.transformToWorld.scale;
  const centreWorld = worldAt(cssW / 2, cssH / 2);
  const centreLocal = worldToDoc(parent, centreWorld.x, centreWorld.y);
  const ph = child.parentHex as { q: number; r: number };
  const hexCentre = parent.geometry.hexToWorld(ph.q, ph.r);
  // HUD-free re-render of exactly what was on screen, which is what the shipped
  // backdrop store snapshots (it includes the parent's OWN backdrop at depth 2)
  const outgoing = snapshot(parent.id, zoom, offX, offY);
  backdrops.set(child.id, {
    bitmap: outgoing,
    captureZoomDocLocal: zoom * scale,
    captureCenterDocLocal: centreLocal,
    canvasSize: { width: cssW, height: cssH },
    hexCenterParentLocal: { x: hexCentre.worldX, y: hexCentre.worldY },
  });
  activeId = child.id;
  transitions++;
  lastTransitionAt = performance.now();
  if (VARIANT === 'animated') anim = { bitmap: outgoing, t0: lastTransitionAt, ax, ay };
}

function surface(ax: number, ay: number): void {
  const child = fx.byId.get(activeId) as Doc;
  const outgoing = VARIANT === 'animated' ? snapshot(child.id, zoom, offX, offY) : null;
  backdrops.delete(child.id);
  activeId = child.parentId as string;
  transitions++;
  lastTransitionAt = performance.now();
  if (outgoing) anim = { bitmap: outgoing, t0: lastTransitionAt, ax, ay };
}

function setZoomRaw(next: number, ax: number, ay: number): void {
  const w = worldAt(ax, ay);
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, next));
  offX = ax - w.x * zoom;
  offY = ay - w.y * zoom;
}

function zoomAbout(next: number, ax: number, ay: number): void {
  setZoomRaw(next, ax, ay);
  const cooled = performance.now() - lastTransitionAt >= COOLDOWN_MS;
  let active = fx.byId.get(activeId) as Doc;

  // surface: hysteresis band at 0.8x the parent's ceiling
  if (active.depth > 0 && cooled && zoom <= ceilingOf(active.depth - 1) * HYSTERESIS) {
    surface(ax, ay);
    active = fx.byId.get(activeId) as Doc;
  }
  // dive, or hard-clamp: today there is NO headroom past DEFAULTS.maxZoom
  const ceil = ceilingOf(active.depth);
  if (zoom >= ceil) {
    const child = childUnderAnchor(active, ax, ay);
    if (child && cooled) dive(child, ax, ay);
    else setZoomRaw(ceil, ax, ay);            // the wall
  }
}

// ------------------------------------------------------------------ draw
const clock = startFrameClock();
const lastPointer = { x: 0, y: 0 };

function draw(): void {
  clock.beginDraw();
  const active = fx.byId.get(activeId) as Doc;
  blendAlpha = 0;
  levelsLive = 1;
  let handled = false;

  if (VARIANT === 'crossfade') {
    // ascending side: parent open, zoom inside [0.85*ceil, ceil)
    const ceil = ceilingOf(active.depth);
    const lo = ceil * BAND_LO;
    if (zoom >= lo && zoom < ceil) {
      const child = childUnderAnchor(active, lastPointer.x, lastPointer.y);
      if (child) {
        const a = (zoom - lo) / (ceil - lo);
        cellsDrawn = paintScene(ctx, active.id, zoom, offX, offY);
        sctx.clearRect(0, 0, cssW, cssH);
        cellsDrawn += paintDocCells(sctx, draws.get(child.id) as DocDraw, zoom, offX, offY);
        ctx.globalAlpha = a;
        ctx.drawImage(scratch, 0, 0, cssW, cssH);
        ctx.globalAlpha = 1;
        blendAlpha = a;
        levelsLive = 2;
        handled = true;
      }
    }
    // descending side: child open, zoom inside [0.8*parentCeil, parentCeil)
    if (!handled && active.depth > 0) {
      const pceil = ceilingOf(active.depth - 1);
      const plo = pceil * HYSTERESIS;
      if (zoom >= plo && zoom < pceil) {
        const a = (zoom - plo) / (pceil - plo);
        ctx.fillStyle = '#0b0e13';
        ctx.fillRect(0, 0, cssW, cssH);
        paintBackdrop(ctx, active.id, zoom, offX, offY);
        sctx.clearRect(0, 0, cssW, cssH);
        cellsDrawn = paintDocCells(sctx, draws.get(active.id) as DocDraw, zoom, offX, offY);
        ctx.globalAlpha = a;
        ctx.drawImage(scratch, 0, 0, cssW, cssH);
        ctx.globalAlpha = 1;
        paintDocExtras(ctx, active, zoom, offX, offY);
        blendAlpha = a;
        levelsLive = 2;
        handled = true;
      }
    }
  }

  if (!handled) cellsDrawn = paintScene(ctx, activeId, zoom, offX, offY);

  // animated: 200 ms eased opacity + scale dissolve of the outgoing frame
  if (anim) {
    const t = (performance.now() - anim.t0) / ANIM_MS;
    if (t >= 1) {
      anim = null;
    } else {
      const e = 1 - Math.pow(1 - t, 3);          // easeOutCubic
      const s = 1 + 0.06 * e;
      ctx.globalAlpha = 1 - e;
      ctx.drawImage(anim.bitmap, anim.ax - anim.ax * s, anim.ay - anim.ay * s, cssW * s, cssH * s);
      ctx.globalAlpha = 1;
      levelsLive = 2;
      blendAlpha = 1 - e;
    }
  }

  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // HUD - OPAQUE (a translucent HUD reads as a hole to the rig)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 330, 64);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText('swap=' + VARIANT + '  zoom ' + zoom.toFixed(3), 16, 26);
  ctx.fillText('open ' + activeId + ' (d' + active.depth + ')  swaps ' + transitions, 16, 44);
  ctx.fillText('cells ' + cellsDrawn + '  alpha ' + blendAlpha.toFixed(2), 16, 62);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void { draw(); requestAnimationFrame(loop); }

// ------------------------------------------------------------------ input
canvas.addEventListener('wheel', (e: WheelEvent) => {
  e.preventDefault();
  lastPointer.x = e.clientX;
  lastPointer.y = e.clientY;
  zoomAbout(zoom * Math.exp(-e.deltaY * WHEEL_K), e.clientX, e.clientY);
}, { passive: false });

let dragging = false;
let lastX = 0;
let lastY = 0;
canvas.addEventListener('pointerdown', (e: PointerEvent) => {
  dragging = true; lastX = e.clientX; lastY = e.clientY;
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e: PointerEvent) => {
  lastPointer.x = e.clientX; lastPointer.y = e.clientY;
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

// ------------------------------------------------------------------ contract surface
resize();
home();
lastPointer.x = cssW * 0.32;
lastPointer.y = cssH * 0.38;

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
  setZoom: (z: number, ax?: number, ay?: number) => {
    const x = ax ?? cssW / 2;
    const y = ay ?? cssH / 2;
    lastPointer.x = x; lastPointer.y = y;
    zoomAbout(z, x, y);
  },
  zoomRange: () => ({ min: MIN_ZOOM, max: MAX_ZOOM }),
  fiducialWorld,
  setFiducial: (wx: number, wy: number) => { fiducialWorld.x = wx; fiducialWorld.y = wy; },
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => ({
    variant: VARIANT,
    activeDoc: activeId,
    activeDepth: (fx.byId.get(activeId) as Doc).depth,
    transitions,
    levelsLive,
    blendAlpha: +blendAlpha.toFixed(3),
    cellsDrawn,
    cellsTotal,
    framesDrawn,
  }),
  reset: () => { resize(); home(); clock.clear(); },
};
