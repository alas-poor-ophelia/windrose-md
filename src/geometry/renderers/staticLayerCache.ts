/**
 * staticLayerCache.ts
 *
 * Offscreen snapshot cache for the static map content (moved verbatim from
 * useCanvasRenderer.ts, wave 8 / STRUCT-A-29). The React side (settle
 * callback registration, unmount release) stays in the hook; this module is
 * the pure cache mechanics: sizing, keying, rebuild and blit.
 */

// ===========================================
// Static-layer cache
// ===========================================
//
// The map content (grid, cells, borders, curves, tiles, objects, labels…) is
// static while the user pans or zooms — only the viewport transform changes.
// Re-issuing every draw call per frame costs thousands of fillRects; measured
// on iPad that is ~900ms per frame (2-4 FPS). Instead, the static content is
// rendered once into an oversized offscreen canvas and each frame blits it:
//   - pan: translation-only drawImage (pixel-exact)
//   - zoom: scale-blit from the cached snapshot (momentarily soft), with a
//     debounced crisp re-render once the gesture settles
//   - content change / pan past the padding: full re-render
// Rotated maps (non-zero northDirection) use the same cache (MEM-09): the
// snapshot is baked UNROTATED and the blit happens under the live canvas's
// rotation transform, so rotation is applied at composite time and never
// enters the key. The usable-region check and padding cover the rotated
// viewport's axis-aligned bounding box in pre-rotation space.
// The offscreen is capped by a device-pixel budget (MEM-17): the old fixed
// 0.5 pad made it 4x the viewport per mount, which on a full-pane iPad
// (2732x2048) exceeded WebKit's per-canvas area limit and silently blanked.
// World→screen mapping is affine (screen = offset + world·zoom) for both grid
// and hex, so the blit transform is exact: scale = zoom/cachedZoom,
// translate = offset − cachedOffset·scale.
//
// The cache is keyed by LEVEL for the lattice ladder: at a given zoom one rung
// of the ladder is active, and each rung needs its own baked surface. A level
// CROSSING is a drift, not a rebuild: the crossing frame never bakes
// synchronously. When the new level has no usable surface of its own (never
// baked, evicted, stale key or out of pad), another level's cached surface is
// scale-blitted exactly as a stale snapshot is today, and the fresh bake is
// scheduled at settle. Classic maps only ever use level 0 and never cross, so
// for them this is the shipped behaviour.

import {
  SURFACE_BYTES_PER_PX,
  registerSurface,
  touchSurface,
  releaseSurface,
  evictIfNeeded,
  maxSurfacePixels,
} from './surfaceBudget';
import { driftAllowed, driftCandidates } from './levelSurfaces';

interface StaticLayerCacheEntry {
  off: HTMLCanvasElement;
  /** Zoom the offscreen was rendered at. */
  zoom: number;
  /** Offsets used when rendering the offscreen (offscreen pixel space). */
  vOx: number;
  vOy: number;
  key: readonly unknown[];
  /** Image-cache version the offscreen was rendered with (soft invalidation). */
  imageVersion: number;
}

/**
 * Every baked surface for one canvas.
 *
 * `byLevel` insertion order is the LRU order (oldest first) — a blit re-inserts
 * the level it used, the same idiom as the image cache in
 * `src/assets/imageOperations.ts`. ONE settle timer lives here rather than on
 * each entry: N live levels must not mean N independent full re-renders.
 */
interface CanvasSurfaceSet {
  byLevel: Map<number, StaticLayerCacheEntry>;
  settleTimer: number | null;
  /** The rung most recently requested for this canvas; the only one a settle marks stale. */
  lastLevel: number;
  /** Level whose crisp bake a settle asked for; honoured by the next non-crossing frame at that level. */
  bakeRequested: number | null;
}

/**
 * `cullNorth` is the rotation the TARGET context is drawn under: 0 for the
 * (always unrotated) offscreen snapshot, the map's northDirection when drawing
 * straight onto the rotated live canvas. Viewport culling widens only for the
 * latter.
 */
type DrawStaticFn = (tctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, cullNorth: number) => void;

const staticLayerCaches = new WeakMap<HTMLCanvasElement, CanvasSurfaceSet>();
const staticSettleCallbacks = new WeakMap<HTMLCanvasElement, () => void>();
/** Extra rendered area on each side, as a fraction of the viewport. */
const STATIC_PAD_RATIO = 0.5;
/**
 * Device-pixel budget for one static offscreen (~48 MB of backing store). The
 * pad shrinks toward the minimum the rotated viewport needs to fit it.
 */
const STATIC_MAX_PIXELS = 12_000_000;
/**
 * Hard ceiling (WebKit's 4096x4096 canvas area limit). If even the minimum
 * rotated-viewport snapshot would exceed it, draw directly instead.
 */
const STATIC_HARD_MAX_PIXELS = 16_777_216;
/** Crisp re-render fires this long after the last zoom change. */
const ZOOM_SETTLE_MS = 150;
/** Steady state is one surface; a crossing is a transient two (the new level plus its drift source). */
const MAX_SURFACES_PER_CANVAS = 2;

/** Registered by the hook so the cache can request a follow-up render after a zoom settles. */
function setStaticSettleCallback(canvas: HTMLCanvasElement, cb: () => void): void {
  staticSettleCallbacks.set(canvas, cb);
}

/**
 * Unmount cleanup for a canvas (MEM-19): cancel a pending settle re-render and
 * drop the settle callback so neither the timer nor the hook closure outlives
 * the component.
 */
function releaseStaticLayerCache(canvas: HTMLCanvasElement): void {
  const set = staticLayerCaches.get(canvas);
  if (set?.settleTimer != null) {
    window.clearTimeout(set.settleTimer);
    set.settleTimer = null;
  }
  staticSettleCallbacks.delete(canvas);
  // Free every level's backing store now rather than whenever GC gets to it;
  // WebKit counts canvas memory per page (MEM-17). Ladder surfaces also leave
  // the global surface budget.
  if (set != null) {
    for (const level of [...set.byLevel.keys()]) releaseSurfaceEntry(canvas, set, level);
    staticLayerCaches.delete(canvas);
  }
}

/** Free an offscreen's backing store and forget it. */
function releaseSurfaceEntry(canvas: HTMLCanvasElement, set: CanvasSurfaceSet, level: number): void {
  const entry = set.byLevel.get(level);
  if (entry === undefined) return;
  entry.off.width = 0;
  entry.off.height = 0;
  set.byLevel.delete(level);
  releaseSurface(canvas, level);
}

/** Keep at most two surfaces per canvas: drop this canvas's LRU other level. */
function evictSurfacesForCanvas(canvas: HTMLCanvasElement, set: CanvasSurfaceSet, keepLevel: number): void {
  while (set.byLevel.size >= MAX_SURFACES_PER_CANVAS) {
    let victim: number | null = null;
    for (const cached of set.byLevel.keys()) {
      if (cached !== keepLevel) {
        victim = cached;
        break;
      }
    }
    if (victim === null) return;
    releaseSurfaceEntry(canvas, set, victim);
  }
}

/**
 * Apply the global byte budget. The surface just baked for this frame is never
 * released — dropping it here would re-bake it on the very next frame.
 */
function enforceSurfaceBudget(protectedCanvas: HTMLCanvasElement, protectedLevel: number): void {
  for (const victim of evictIfNeeded()) {
    if (victim.canvas === protectedCanvas && victim.level === protectedLevel) continue;
    const set = staticLayerCaches.get(victim.canvas);
    if (set === undefined) {
      releaseSurface(victim.canvas, victim.level);
      continue;
    }
    releaseSurfaceEntry(victim.canvas, set, victim.level);
  }
}

/**
 * Half-extents of the viewport's axis-aligned bounding box in pre-rotation
 * space (the canvas is rotated about its centre). Unrotated: (w/2, h/2).
 */
function rotatedViewportHalfExtents(width: number, height: number, northDirection: number): { ex: number; ey: number } {
  if (northDirection % 360 === 0) return { ex: width / 2, ey: height / 2 };
  const rad = (northDirection * Math.PI) / 180;
  const c = Math.abs(Math.cos(rad));
  const sn = Math.abs(Math.sin(rad));
  // +1 px slack absorbs float error at the bbox edge.
  return { ex: (c * width + sn * height) / 2 + 1, ey: (sn * width + c * height) / 2 + 1 };
}

/**
 * Offscreen padding per side. Starts at the STATIC_PAD_RATIO pad (or the
 * rotation minimum, whichever is larger) and shrinks the extra toward that
 * minimum until the offscreen fits STATIC_MAX_PIXELS (or the smaller
 * `maxPixels`, which budgeted ladder canvases pass so two surfaces fit the
 * global budget). Returns null when even the minimum exceeds the hard
 * canvas-area ceiling; a minimum above `maxPixels` but under that ceiling is
 * still returned (an unpadded bake beats drawing every frame directly).
 */
function computeStaticPad(
  width: number,
  height: number,
  northDirection: number,
  maxPixels = STATIC_MAX_PIXELS
): { padX: number; padY: number } | null {
  const cap = Math.min(STATIC_MAX_PIXELS, maxPixels);
  const { ex, ey } = rotatedViewportHalfExtents(width, height, northDirection);
  const minX = Math.max(0, Math.ceil(ex - width / 2));
  const minY = Math.max(0, Math.ceil(ey - height / 2));
  const wantX = Math.max(minX, Math.ceil(width * STATIC_PAD_RATIO));
  const wantY = Math.max(minY, Math.ceil(height * STATIC_PAD_RATIO));
  const area = (px: number, py: number): number => (width + 2 * px) * (height + 2 * py);
  for (let t = 1; t > 0; t -= 0.125) {
    const px = Math.ceil(minX + (wantX - minX) * t);
    const py = Math.ceil(minY + (wantY - minY) * t);
    if (area(px, py) <= cap) return { padX: px, padY: py };
  }
  if (area(minX, minY) <= STATIC_HARD_MAX_PIXELS) return { padX: minX, padY: minY };
  return null;
}

function staticKeysEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}

/**
 * Schedule ONE crisp re-bake after things settle: the timer resets on every
 * further call, then marks the last-requested level stale and requests a
 * render. Other levels keep their (scaled, still valid) surfaces: they are the
 * drift sources the next crossing blits from, and they re-bake at their own
 * settle when active again. Edits never rely on this stamp; the content terms
 * of the key catch them. One timer per canvas.
 */
function scheduleSettleRebake(canvas: HTMLCanvasElement, set: CanvasSurfaceSet): void {
  if (set.settleTimer != null) window.clearTimeout(set.settleTimer);
  set.settleTimer = window.setTimeout(() => {
    set.settleTimer = null;
    const active = set.byLevel.get(set.lastLevel);
    if (active !== undefined) active.key = ['__settle-stale__'];
    // A rung that has never been baked has no entry to stamp; the request is what
    // makes the next non-crossing frame at that level bake instead of drifting.
    set.bakeRequested = set.lastLevel;
    staticSettleCallbacks.get(canvas)?.();
  }, ZOOM_SETTLE_MS);
}

function blitStaticContent(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  draw: DrawStaticFn,
  offsetX: number,
  offsetY: number,
  zoom: number,
  width: number,
  height: number,
  key: readonly unknown[],
  imageVersion: number,
  northDirection = 0,
  level = 0,
  // Only ladder canvases are governed by the global surface budget. A classic
  // canvas is registered UNCOUNTED (reported, never evicted): budgeting it would
  // make every classic pane a background canvas and LRU-evict it whenever 4+
  // panes are mounted, and classic has no drift fallback for an evicted surface.
  budgeted = false
): void {
  let set = staticLayerCaches.get(canvas);
  if (set === undefined) {
    set = { byLevel: new Map(), settleTimer: null, lastLevel: level, bakeRequested: null };
    staticLayerCaches.set(canvas, set);
  }
  const crossingFrame = set.lastLevel !== level;
  set.lastLevel = level;

  const rotated = northDirection % 360 !== 0;
  // Region the live canvas actually shows, in pre-rotation pixel space.
  const { ex, ey } = rotatedViewportHalfExtents(width, height, northDirection);
  const vMinX = width / 2 - ex;
  const vMaxX = width / 2 + ex;
  const vMinY = height / 2 - ey;
  const vMaxY = height / 2 + ey;

  // A surface is usable when its key still matches and the viewport, mapped into
  // the snapshot's pixel space at the current scale, falls inside it.
  const usability = (candidate: StaticLayerCacheEntry): { scale: number; tx: number; ty: number; usable: boolean } => {
    if (!staticKeysEqual(candidate.key, key)) return { scale: 1, tx: 0, ty: 0, usable: false };
    const sc = zoom / candidate.zoom;
    const cx = offsetX - candidate.vOx * sc;
    const cy = offsetY - candidate.vOy * sc;
    // Viewport corners in offscreen pixel space must fall inside the snapshot.
    const pMinX = (vMinX - cx) / sc;
    const pMaxX = (vMaxX - cx) / sc;
    const pMinY = (vMinY - cy) / sc;
    const pMaxY = (vMaxY - cy) / sc;
    const ok = pMinX >= 0 && pMinY >= 0 && pMaxX <= candidate.off.width && pMaxY <= candidate.off.height;
    return { scale: sc, tx: cx, ty: cy, usable: ok };
  };

  // The level's own surface if usable. On a crossing frame an own surface that is
  // not usable (stale key, out of pad) counts as absent, so the frame drifts from
  // another level's usable surface instead of baking: a crossing frame never
  // bakes synchronously. Outside a crossing, a level that owns a surface never
  // drifts: leaving its pad or invalidating its key bakes synchronously, exactly
  // as the classic path does at level 0, because a coarser surface lacks this
  // rung's authored cells and drifting to it mid-pan would blink that paint out.
  // A classic map only ever asks for level 0 and never crosses, so for it
  // `sourceLevel` is always `level`.
  let entry = set.byLevel.get(level);
  let sourceLevel = level;
  let { scale, tx, ty, usable } = entry === undefined ? { scale: 1, tx: 0, ty: 0, usable: false } : usability(entry);
  // A settle asked for THIS level to bake crisp: honour it with a bake, never a
  // drift, or the crisp rebuild is starved by an ever-usable neighbour surface.
  // A crossing frame is the exception (it never bakes): drift now; the settle re-asks.
  const honourBake = set.bakeRequested === level && !crossingFrame;
  if (honourBake) set.bakeRequested = null;
  const ownsSurface = crossingFrame ? usable : entry !== undefined;
  if (driftAllowed(ownsSurface, level, honourBake, crossingFrame)) {
    // Nearest coarser first, then nearest finer (a zoom-out crossing).
    for (const candidateLevel of driftCandidates(level, set.byLevel.keys())) {
      const candidate = set.byLevel.get(candidateLevel);
      if (candidate === undefined) continue;
      const fit = usability(candidate);
      if (!fit.usable) continue;
      entry = candidate;
      sourceLevel = candidateLevel;
      ({ scale, tx, ty, usable } = fit);
      break;
    }
  }

  if (usable && entry && rotated && scale !== 1) {
    // Rotated map mid-zoom: a scale-blit under the rotation transform is
    // visibly soft (bilinear twice), so draw straight onto the live canvas as
    // before the static cache existed (culling still applies inside draw), and
    // schedule ONE re-bake at the settled zoom so later pans blit 1:1.
    scheduleSettleRebake(canvas, set);
    draw(ctx, offsetX, offsetY, width, height, northDirection);
    return;
  }

  if (usable && sourceLevel !== level) {
    // Crossing frame: the new level has no usable surface, so blit the drift
    // source (coarser, or finer on a zoom-out) at scale (the lattice itself is
    // stroked live elsewhere) and bake the new level once things settle. No
    // synchronous draw happens here.
    scheduleSettleRebake(canvas, set);
  } else if (!usable) {
    const pad = budgeted ? computeStaticPad(width, height, northDirection, maxSurfacePixels()) : computeStaticPad(width, height, northDirection);
    if (pad == null) {
      draw(ctx, offsetX, offsetY, width, height, northDirection);
      return;
    }
    const { padX, padY } = pad;
    // Only this level's own offscreen may be re-used — another level's
    // surface is a drift source and must survive the bake.
    const ownEntry = sourceLevel === level ? entry : undefined;
    const off = ownEntry?.off ?? activeWindow.createEl('canvas');
    const ow = width + padX * 2;
    const oh = height + padY * 2;
    if (off.width !== ow) off.width = ow;
    if (off.height !== oh) off.height = oh;
    const octx = off.getContext('2d');
    if (!octx) {
      // Offscreen unavailable: draw directly (previous behavior).
      draw(ctx, offsetX, offsetY, width, height, northDirection);
      return;
    }
    if (set.settleTimer != null) {
      window.clearTimeout(set.settleTimer);
      set.settleTimer = null;
    }
    octx.save();
    octx.clearRect(0, 0, ow, oh);
    draw(octx, offsetX + padX, offsetY + padY, ow, oh, 0);
    octx.restore();
    entry = { off, zoom, vOx: offsetX + padX, vOy: offsetY + padY, key, imageVersion };
    if (ownEntry === undefined) evictSurfacesForCanvas(canvas, set, level);
    // Other levels baked under a different key can never be blitted again (the
    // usability test requires a key match): free them now rather than letting
    // dead surfaces hold budget bytes.
    for (const [otherLevel, other] of [...set.byLevel]) {
      if (otherLevel !== level && !staticKeysEqual(other.key, key)) releaseSurfaceEntry(canvas, set, otherLevel);
    }
    set.byLevel.delete(level);
    set.byLevel.set(level, entry);
    registerSurface(canvas, level, ow * oh * SURFACE_BYTES_PER_PX, budgeted);
    if (budgeted) enforceSurfaceBudget(canvas, level);
    sourceLevel = level;
    scale = 1;
    tx = offsetX - entry.vOx;
    ty = offsetY - entry.vOy;
  } else if (entry && (scale !== 1 || imageVersion !== entry.imageVersion)) {
    // Soft invalidation: mid-zoom, or async images finished decoding since the
    // snapshot was taken. Keep blitting the (slightly stale) snapshot and
    // schedule ONE crisp re-render after things settle — the timer resets on
    // every further change, so a burst of tile-image loads coalesces into a
    // single rebuild instead of one ~full-repaint per image.
    scheduleSettleRebake(canvas, set);
  }

  if (!entry) return;
  // Insertion order is the per-canvas LRU: the level actually blitted is newest.
  if (set.byLevel.get(sourceLevel) === entry) {
    set.byLevel.delete(sourceLevel);
    set.byLevel.set(sourceLevel, entry);
    touchSurface(canvas, sourceLevel);
  }
  ctx.save();
  // Pixel-exact at scale 1; smooth when scale-blitting mid-zoom or when the
  // blit lands under a rotation transform (nearest-neighbour would jag).
  ctx.imageSmoothingEnabled = scale !== 1 || rotated;
  ctx.drawImage(entry.off, tx, ty, entry.off.width * scale, entry.off.height * scale);
  ctx.restore();
}

export {
  setStaticSettleCallback,
  releaseStaticLayerCache,
  rotatedViewportHalfExtents,
  computeStaticPad,
  staticKeysEqual,
  blitStaticContent,
};
export type { DrawStaticFn };
