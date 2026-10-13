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
  settleTimer: number | null;
}

/**
 * `cullNorth` is the rotation the TARGET context is drawn under: 0 for the
 * (always unrotated) offscreen snapshot, the map's northDirection when drawing
 * straight onto the rotated live canvas. Viewport culling widens only for the
 * latter.
 */
type DrawStaticFn = (tctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number, cullNorth: number) => void;

const staticLayerCaches = new WeakMap<HTMLCanvasElement, StaticLayerCacheEntry>();
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
  const entry = staticLayerCaches.get(canvas);
  if (entry?.settleTimer != null) {
    window.clearTimeout(entry.settleTimer);
    entry.settleTimer = null;
  }
  staticSettleCallbacks.delete(canvas);
  // Free the offscreen's backing store now rather than whenever GC gets to
  // it; WebKit counts canvas memory per page (MEM-17).
  if (entry != null) {
    entry.off.width = 0;
    entry.off.height = 0;
    staticLayerCaches.delete(canvas);
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
 * minimum until the offscreen fits STATIC_MAX_PIXELS. Returns null when even
 * the minimum exceeds the hard canvas-area ceiling.
 */
function computeStaticPad(
  width: number,
  height: number,
  northDirection: number
): { padX: number; padY: number } | null {
  const { ex, ey } = rotatedViewportHalfExtents(width, height, northDirection);
  const minX = Math.max(0, Math.ceil(ex - width / 2));
  const minY = Math.max(0, Math.ceil(ey - height / 2));
  const wantX = Math.max(minX, Math.ceil(width * STATIC_PAD_RATIO));
  const wantY = Math.max(minY, Math.ceil(height * STATIC_PAD_RATIO));
  const area = (px: number, py: number): number => (width + 2 * px) * (height + 2 * py);
  for (let t = 1; t > 0; t -= 0.125) {
    const px = Math.ceil(minX + (wantX - minX) * t);
    const py = Math.ceil(minY + (wantY - minY) * t);
    if (area(px, py) <= STATIC_MAX_PIXELS) return { padX: px, padY: py };
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
  northDirection = 0
): void {
  let entry = staticLayerCaches.get(canvas);
  const rotated = northDirection % 360 !== 0;
  // Region the live canvas actually shows, in pre-rotation pixel space.
  const { ex, ey } = rotatedViewportHalfExtents(width, height, northDirection);
  const vMinX = width / 2 - ex;
  const vMaxX = width / 2 + ex;
  const vMinY = height / 2 - ey;
  const vMaxY = height / 2 + ey;

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let usable = false;
  if (entry && staticKeysEqual(entry.key, key)) {
    scale = zoom / entry.zoom;
    tx = offsetX - entry.vOx * scale;
    ty = offsetY - entry.vOy * scale;
    // Viewport corners in offscreen pixel space must fall inside the snapshot.
    const pMinX = (vMinX - tx) / scale;
    const pMaxX = (vMaxX - tx) / scale;
    const pMinY = (vMinY - ty) / scale;
    const pMaxY = (vMaxY - ty) / scale;
    usable = pMinX >= 0 && pMinY >= 0 && pMaxX <= entry.off.width && pMaxY <= entry.off.height;
  }

  if (!usable) {
    const pad = computeStaticPad(width, height, northDirection);
    if (pad == null) {
      draw(ctx, offsetX, offsetY, width, height, northDirection);
      return;
    }
    const { padX, padY } = pad;
    const off = entry?.off ?? activeWindow.createEl('canvas');
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
    if (entry?.settleTimer != null) window.clearTimeout(entry.settleTimer);
    octx.save();
    octx.clearRect(0, 0, ow, oh);
    draw(octx, offsetX + padX, offsetY + padY, ow, oh, 0);
    octx.restore();
    entry = { off, zoom, vOx: offsetX + padX, vOy: offsetY + padY, key, imageVersion, settleTimer: null };
    staticLayerCaches.set(canvas, entry);
    scale = 1;
    tx = offsetX - entry.vOx;
    ty = offsetY - entry.vOy;
  } else if (entry && (scale !== 1 || imageVersion !== entry.imageVersion)) {
    // Soft invalidation: mid-zoom, or async images finished decoding since the
    // snapshot was taken. Keep blitting the (slightly stale) snapshot and
    // schedule ONE crisp re-render after things settle — the timer resets on
    // every further change, so a burst of tile-image loads coalesces into a
    // single rebuild instead of one ~full-repaint per image.
    if (entry.settleTimer != null) window.clearTimeout(entry.settleTimer);
    const settleEntry = entry;
    entry.settleTimer = window.setTimeout(() => {
      settleEntry.settleTimer = null;
      settleEntry.key = ['__settle-stale__'];
      staticSettleCallbacks.get(canvas)?.();
    }, ZOOM_SETTLE_MS);
  }

  if (!entry) return;
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
  blitStaticContent,
};
export type { DrawStaticFn };
