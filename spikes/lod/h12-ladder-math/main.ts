/**
 * spikes/lod/h12-ladder-math — lattice math + stills for H12 (rotation-free m^2 ladders)
 * with H13's aperture-7 rotated ladder as a control.
 *
 * ?ladder=ring7s15|m3|m5|m6|m13|a7   which ladder to render
 * ?outline=1                          lattice-inspection styling (amber parents, black
 *                                     outlines, children fully opaque) for the lineup
 * ?fiducial=1                         pixel-domain anchor marker
 *
 * All variants render the SAME shared fixture world: root ring-12, hexSize 80, flat-top.
 * Parents carry the fixture root doc's terrain; children re-sample `terrainAtWorld` at the
 * child centre, so a child layer is an honest refinement of the same continuous field.
 * Children crossfade in as their on-screen size grows — a 2-level continuous composite.
 */
import { startFrameClock } from '../_shared/instrument';
import {
  buildFixture, terrainAtWorld, TERRAIN_PALETTE, FIDUCIAL_WORLD, ROOT_RINGS,
} from '../_shared/fixture';
import {
  LADDERS, buildLadder, assertLadder, measureContainment, measureBoundary, measureReseat,
  hexCorners, PARENT_SIZE, hexRing,
} from './lattice';

const params = new URLSearchParams(location.search);
const LADDER_KEY = (params.get('ladder') ?? 'ring7s15') as keyof typeof LADDERS;
const SPEC = LADDERS[LADDER_KEY] ?? LADDERS.ring7s15;
const OUTLINE = params.get('outline') === '1';
// ?owner=1 -> tint each child by its OWNING parent (3-colour wash). Ownership is invisible
// when every child is painted in terrain colour, so this is the only view in which H12's
// tie-break asymmetry can actually be judged by eye.
const OWNER = params.get('owner') === '1';
const OWNER_TINT = ['#6fb3d9', '#e2915c', '#9ad06b'];
const FIDUCIAL = params.get('fiducial') === '1';
const SEED = Number(params.get('seed') ?? 1) || 1;

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 24;
const WHEEL_K = 0.0015;
// children crossfade in between these on-screen child-hex sizes (CSS px, centre->vertex)
const FADE_LO = 16;
const FADE_HI = 48;

const L = buildLadder(SPEC);
const fx = buildFixture(SEED);

// ------------------------------------------------------------------ lattice math (once)
const asserts = assertLadder(L);
const containment = measureContainment(L, 1001);
const boundary = measureBoundary(L, 240);
const reseat = measureReseat();
const slotsPerParent = SPEC.linearScaleOverride != null
  ? SPEC.linearScaleOverride * SPEC.linearScaleOverride
  : L.K;
const orphanSlots = Math.round(slotsPerParent - L.childSet.length);

// ------------------------------------------------------------------ world
interface Cell { wx: number; wy: number; fill: string }

const PARENT_CORNERS = hexCorners(PARENT_SIZE, 0);

function shade(hex: string, delta: number): string {
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number): number => Math.max(0, Math.min(255, Math.round(v + delta * 255)));
  return `rgb(${cl((n >> 16) & 255)},${cl((n >> 8) & 255)},${cl(n & 255)})`;
}
function hash32(a: number, b: number, seed: number): number {
  let h = seed ^ Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const parents: Cell[] = [];
const parentAxial: Array<{ q: number; r: number }> = [];
for (const { q, r } of fx.root.geometry.getAllRadialCells(ROOT_RINGS)) {
  const w = fx.root.geometry.hexToWorld(q, r);
  const cell = fx.root.cells.get(q + ',' + r);
  parents.push({ wx: w.worldX, wy: w.worldY, fill: cell ? cell.color : '#333' });
  parentAxial.push({ q, r });
}

// children: iterate every parent's child set. For an exact ladder this covers the plane
// once; for the shipped ring-7 rosette it leaves the corner slots ORPHANED (never drawn),
// which is exactly the artefact under test.
const children: Cell[] = [];
for (let i = 0; i < parentAxial.length; i++) {
  const { q: Q, r: R } = parentAxial[i];
  const base = L.parentToChild(Q, R);
  for (const off of L.childSet) {
    const a = base.q + off.q;
    const b = base.r + off.r;
    const w = L.childWorld(a, b);
    const terrain = terrainAtWorld(w.x, w.y);
    const jitter = ((hash32(a, b, SEED * 2654435761) % 22) - 11) / 255;
    const tint = OWNER ? OWNER_TINT[(((Q - R) % 3) + 3) % 3] : TERRAIN_PALETTE[terrain];
    children.push({ wx: w.x, wy: w.y, fill: shade(tint, jitter) });
  }
}

// footprint: hull of the OUTER RING'S CENTRES (conservative, per the contract)
const hullWorld = (() => {
  const pts: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < parentAxial.length; i++) {
    const { q, r } = parentAxial[i];
    if (hexRing(q, r) !== ROOT_RINGS) continue;
    pts.push({ x: parents[i].wx, y: parents[i].wy });
  }
  pts.sort((a, b) => (a.x - b.x) || (a.y - b.y));
  const cross = (o: typeof pts[0], a: typeof pts[0], b: typeof pts[0]): number =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const build = (src: typeof pts): typeof pts => {
    const out: typeof pts = [];
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
let cssH = 0;
let zoom = 1;
let offX = 0;
let offY = 0;
let parentsDrawn = 0;
let childrenDrawn = 0;
let framesDrawn = 0;
let childAlpha = 0;
const fiducialWorld = { x: FIDUCIAL_WORLD.x, y: FIDUCIAL_WORLD.y };

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  cssW = window.innerWidth;
  cssH = window.innerHeight;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
function fitWorld(): void {
  const span = (ROOT_RINGS + 1) * PARENT_SIZE * 1.5 * 2;
  zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.min(cssW, cssH) / span));
  offX = cssW / 2;
  offY = cssH / 2;
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

// ------------------------------------------------------------------ draw
const clock = startFrameClock();

function polyPath(cx: number, cy: number, corners: Array<{ x: number; y: number }>, s: number): void {
  ctx.beginPath();
  ctx.moveTo(cx + corners[0].x * s, cy + corners[0].y * s);
  for (let k = 1; k < 6; k++) ctx.lineTo(cx + corners[k].x * s, cy + corners[k].y * s);
  ctx.closePath();
}

function draw(): void {
  clock.beginDraw();
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, cssW, cssH);

  const parentPx = PARENT_SIZE * zoom;
  const childPx = L.childSize * zoom;
  childAlpha = OUTLINE ? 1 : Math.max(0, Math.min(1, (childPx - FADE_LO) / (FADE_HI - FADE_LO)));
  // smoothstep so the crossfade has no velocity discontinuity at either end
  childAlpha = childAlpha * childAlpha * (3 - 2 * childAlpha);

  parentsDrawn = 0;
  childrenDrawn = 0;

  // --- level 0: parents (always opaque -> G1 can never go blank)
  const pMargin = parentPx * 2;
  ctx.lineWidth = Math.max(0.5, Math.min(1.5, parentPx * 0.03));
  ctx.strokeStyle = 'rgba(0,0,0,0.45)';
  const parentStroke = parentPx >= 6;
  for (let i = 0; i < parents.length; i++) {
    const c = parents[i];
    const sx = offX + c.wx * zoom;
    const sy = offY + c.wy * zoom;
    if (sx < -pMargin || sy < -pMargin || sx > cssW + pMargin || sy > cssH + pMargin) continue;
    polyPath(sx, sy, PARENT_CORNERS, zoom);
    ctx.fillStyle = OUTLINE ? '#f2b134' : c.fill;
    ctx.fill();
    if (parentStroke && !OUTLINE) ctx.stroke();
    parentsDrawn++;
  }

  // --- level 1: children composited over the parents
  if (childAlpha > 0.002) {
    ctx.globalAlpha = childAlpha;
    const cMargin = childPx * 2;
    const childStroke = childPx >= 7;
    ctx.lineWidth = Math.max(0.4, Math.min(1.2, childPx * 0.03));
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < children.length; i++) {
      const c = children[i];
      const sx = offX + c.wx * zoom;
      const sy = offY + c.wy * zoom;
      if (sx < -cMargin || sy < -cMargin || sx > cssW + cMargin || sy > cssH + cMargin) continue;
      polyPath(sx, sy, L.childCorners, zoom);
      ctx.fillStyle = c.fill;
      ctx.fill();
      if (childStroke) ctx.stroke();
      childrenDrawn++;
    }
    ctx.globalAlpha = 1;
  }

  // --- lattice inspection overlay
  if (OUTLINE) {
    ctx.lineJoin = 'round';
    for (let i = 0; i < parents.length; i++) {
      const c = parents[i];
      const sx = offX + c.wx * zoom;
      const sy = offY + c.wy * zoom;
      if (sx < -pMargin || sy < -pMargin || sx > cssW + pMargin || sy > cssH + pMargin) continue;
      const focus = parentAxial[i].q === 0 && parentAxial[i].r === 0;
      polyPath(sx, sy, PARENT_CORNERS, zoom);
      ctx.lineWidth = focus ? Math.max(2, parentPx * 0.022) : Math.max(1, parentPx * 0.009);
      ctx.strokeStyle = focus ? '#000000' : 'rgba(0,0,0,0.55)';
      ctx.stroke();
    }
  }

  if (FIDUCIAL) {
    const s = screenOf(fiducialWorld.x, fiducialWorld.y);
    ctx.fillStyle = '#ff00ff';
    ctx.fillRect(Math.round(s.x - 3.5), Math.round(s.y - 3.5), 7, 7);
  }

  // HUD — OPAQUE (a translucent panel reads as a hole to the rig)
  ctx.fillStyle = '#161b24';
  ctx.fillRect(8, 8, 396, 78);
  ctx.fillStyle = '#dfe7f2';
  ctx.font = '13px ui-monospace, Consolas, monospace';
  ctx.fillText(`${SPEC.slug}  K=${L.K}  scale=${L.m.toFixed(4)}  rot=${L.thetaDeg.toFixed(4)}deg`, 16, 26);
  ctx.fillText(`zoom ${zoom.toFixed(3)}  child ${childPx.toFixed(1)}px  alpha ${childAlpha.toFixed(3)}`, 16, 44);
  ctx.fillText(`uncovered ${containment.parentUncoveredPct.toFixed(2)}%  outside ${containment.childOutsidePct.toFixed(2)}%`, 16, 62);
  ctx.fillText(`cells/parent ${L.childSet.length}  drawn ${parentsDrawn}/${childrenDrawn}`, 16, 80);

  framesDrawn++;
  clock.endDraw();
}

function loop(): void {
  draw();
  requestAnimationFrame(loop);
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
  footprint: () => ({
    kind: 'polygon',
    points: hullWorld.map((p) => ({ x: offX + p.x * zoom, y: offY + p.y * zoom })),
  }),
  metrics: () => ({
    ladder: SPEC.slug,
    levelsLive: childAlpha > 0.002 ? 2 : 1,
    childAlpha: +childAlpha.toFixed(4),
    K: L.K,
    linearScale: +L.m.toFixed(6),
    rotationDeg: asserts.rotationDeg,
    cellsPerParent: L.childSet.length,
    slotsPerParent,
    orphanSlots,
    parentUncoveredPct: +containment.parentUncoveredPct.toFixed(3),
    childOutsidePct: +containment.childOutsidePct.toFixed(3),
    childParentAreaRatio: +containment.areaRatio.toFixed(5),
    boundaryMeanPx: boundary.meanPx,
    boundaryMaxPx: boundary.maxPx,
    boundaryMeanPct: boundary.meanPctOfParentSize,
    boundaryMaxPct: boundary.maxPctOfParentSize,
    boundaryPerEdgePx: boundary.perEdgeMeanPx,
    asserts,
    reseat,
    parentsDrawn,
    childrenDrawn,
    childrenTotal: children.length,
    framesDrawn,
  }),
  reset: () => { resize(); fitWorld(); clock.clear(); },
};
