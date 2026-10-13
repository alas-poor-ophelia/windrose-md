/**
 * canvasBlur.ts
 *
 * Canvas blur support for region-fill feathering: render-verified capability
 * probes (ctx.filter, shadowBlur, downscale pyramid), the memoized strategy
 * choice, the three blur implementations, and the viewport-sized scratch
 * canvases (with the idle shrink, MEM-17). Split out of tileRenderer.ts.
 */

/**
 * Viewport-sized scratch canvases (feather, mask, pyramid pair) are reused
 * across frames to avoid per-frame allocation, but released to 0x0 once
 * region rendering has been idle for SCRATCH_RELEASE_MS (MEM-17): WebKit caps
 * total canvas backing store per page, and four viewport-sized singletons held
 * for the whole session count against it on iPad.
 */
const SCRATCH_RELEASE_MS = 3000;
let _scratchReleaseTimer: number | null = null;
function scheduleScratchRelease(): void {
  if (typeof window === 'undefined') return;
  if (_scratchReleaseTimer != null) window.clearTimeout(_scratchReleaseTimer);
  _scratchReleaseTimer = window.setTimeout(releaseTileScratchCanvases, SCRATCH_RELEASE_MS);
}

/** Shrink every scratch canvas to 0x0 (frees its backing store; reused lazily). */
function releaseTileScratchCanvases(): void {
  if (_scratchReleaseTimer != null) window.clearTimeout(_scratchReleaseTimer);
  _scratchReleaseTimer = null;
  for (const c of [_featherCanvas, _maskCanvas, _pyrCanvasA, _pyrCanvasB]) {
    if (c != null) { c.width = 0; c.height = 0; }
  }
}

/** Reusable offscreen canvas for feathered region fills (avoids per-frame allocs). */
let _featherCanvas: HTMLCanvasElement | null = null;
function getFeatherCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  scheduleScratchRelease();
  _featherCanvas ??= activeWindow.createEl('canvas');
  if (_featherCanvas.width !== w) _featherCanvas.width = w;
  if (_featherCanvas.height !== h) _featherCanvas.height = h;
  return _featherCanvas;
}

/** Second scratch canvas: hard (unblurred) mask when a group mixes cells and
 *  strokes — the union is drawn sharp here, then blurred ONCE into the feather
 *  canvas, so overlapping shapes can't accumulate alpha into visible seams. */
let _maskCanvas: HTMLCanvasElement | null = null;
function getMaskCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  scheduleScratchRelease();
  _maskCanvas ??= activeWindow.createEl('canvas');
  if (_maskCanvas.width !== w) _maskCanvas.width = w;
  if (_maskCanvas.height !== h) _maskCanvas.height = h;
  return _maskCanvas;
}

/** Shared render probe: draw a 16×16 white square through `blur` (expected
 *  sigma ≈ 3) and require a solid interior plus a partial-alpha tail 3px
 *  outside the edge. Chromium-measured: interior 253, tail 57 — thresholds
 *  sit well inside both margins. Presence checks are NOT enough here: iPadOS
 *  WebKit reflects ctx.filter without applying it, so every mechanism must
 *  prove itself on pixels. */
function probeBlurRender(
  blur: (dctx: CanvasRenderingContext2D, src: HTMLCanvasElement) => void
): boolean {
  if (typeof document === 'undefined') return false;
  try {
    const src = activeWindow.createEl('canvas');
    src.width = 32; src.height = 32;
    const dst = activeWindow.createEl('canvas');
    dst.width = 32; dst.height = 32;
    const sctx = src.getContext('2d');
    const dctx = dst.getContext('2d');
    if (sctx == null || dctx == null) return false;
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(8, 8, 16, 16);
    blur(dctx, src);
    const d = dctx.getImageData(0, 0, 32, 32).data;
    const alpha = (x: number, y: number): number => d[(y * 32 + x) * 4 + 3];
    const interior = alpha(16, 16);
    const tail = alpha(5, 16);
    return interior > 200 && tail > 5 && tail < 250;
  } catch {
    return false;
  }
}

/** Diagnostic only: does assigning ctx.filter read back? iPadOS WebKit says
 *  yes while rendering nothing — never gate rendering on this. */
function canvasFilterAttrReflects(): boolean {
  if (typeof document === 'undefined') return false;
  const probe = activeWindow.createEl('canvas').getContext('2d');
  if (!probe) return false;
  probe.filter = 'blur(1px)';
  return probe.filter === 'blur(1px)';
}

/** Render-verified: does ctx.filter blur actually change drawn pixels? */
let _ctxFilterRenders: boolean | null = null;
function canvasFilterRenders(): boolean {
  _ctxFilterRenders ??= probeBlurRender((dctx, src) => {
    dctx.filter = 'blur(3px)';
    dctx.drawImage(src, 0, 0);
  });
  return _ctxFilterRenders;
}

/**
 * Blit `src` into `ctx` blurred by ~`blurPx` without ctx.filter: draw the
 * source fully off-canvas and let only its shadow land in view. Shadow sigma
 * is shadowBlur/2 while filter blur(N) uses sigma N, hence the 2× factor.
 */
function shadowBlurImage(
  ctx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  blurPx: number
): void {
  const off = src.width + Math.ceil(blurPx * 4);
  ctx.save();
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = blurPx * 2;
  ctx.shadowOffsetX = off;
  ctx.drawImage(src, -off, 0);
  ctx.restore();
}

/** Render-verified: does the shadow trick actually blur on this engine? Some
 *  WebKit builds skip shadows for fully off-canvas sources or don't blur
 *  drawImage shadows, both silent. */
function shadowBlurWorks(): boolean {
  return probeBlurRender((dctx, src) => { shadowBlurImage(dctx, src, 3); });
}

/** Pure: number of half-scale steps whose bilinear spread approximates blurPx. */
function pyramidLevels(blurPx: number): number {
  return Math.max(1, Math.min(5, Math.round(Math.log2(Math.max(2, blurPx)))));
}

/** Ping-pong scratch pair for the pyramid blur; viewport-bounded singletons. */
let _pyrCanvasA: HTMLCanvasElement | null = null;
let _pyrCanvasB: HTMLCanvasElement | null = null;
function getPyrPair(w: number, h: number): { a: HTMLCanvasElement; b: HTMLCanvasElement } | null {
  if (typeof document === 'undefined') return null;
  scheduleScratchRelease();
  _pyrCanvasA ??= activeWindow.createEl('canvas');
  _pyrCanvasB ??= activeWindow.createEl('canvas');
  for (const c of [_pyrCanvasA, _pyrCanvasB]) {
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
  }
  return { a: _pyrCanvasA, b: _pyrCanvasB };
}

/**
 * Last-resort blur using only drawImage: half-scale the mask down `levels`
 * times, then back up — bilinear resampling spreads the edge by ~blurPx.
 * Works on engines where both ctx.filter and drawImage shadows are no-ops.
 */
function pyramidBlurImage(
  octx: CanvasRenderingContext2D,
  src: HTMLCanvasElement,
  w: number,
  h: number,
  blurPx: number
): void {
  const pair = getPyrPair(w, h);
  const actx = pair?.a.getContext('2d') ?? null;
  const bctx = pair?.b.getContext('2d') ?? null;
  if (pair == null || actx == null || bctx == null) {
    octx.drawImage(src, 0, 0);
    return;
  }
  const levels = pyramidLevels(blurPx);
  const sizes: Array<{ w: number; h: number }> = [{ w, h }];
  for (let i = 0; i < levels; i++) {
    const p = sizes[i];
    sizes.push({ w: Math.max(1, Math.round(p.w / 2)), h: Math.max(1, Math.round(p.h / 2)) });
  }
  let cur: HTMLCanvasElement = src;
  let curW = w, curH = h;
  let useA = true;
  const hop = (tw: number, th: number): void => {
    const target = useA ? pair.a : pair.b;
    const tctx = useA ? actx : bctx;
    tctx.clearRect(0, 0, tw, th);
    tctx.imageSmoothingEnabled = true;
    tctx.drawImage(cur, 0, 0, curW, curH, 0, 0, tw, th);
    cur = target; curW = tw; curH = th;
    useA = !useA;
  };
  for (let i = 1; i <= levels; i++) hop(sizes[i].w, sizes[i].h);
  for (let i = levels - 1; i >= 1; i--) hop(sizes[i].w, sizes[i].h);
  octx.save();
  octx.imageSmoothingEnabled = true;
  octx.drawImage(cur, 0, 0, curW, curH, 0, 0, w, h);
  octx.restore();
}

type RegionBlurStrategy = 'filter' | 'shadow' | 'pyramid';

/** Memoized: the best feather mechanism this engine actually supports,
 *  verified by rendering probes rather than API presence. */
let _blurStrategy: RegionBlurStrategy | null = null;
function regionBlurStrategy(): RegionBlurStrategy {
  _blurStrategy ??= canvasFilterRenders() ? 'filter' : shadowBlurWorks() ? 'shadow' : 'pyramid';
  return _blurStrategy;
}

/** Diagnostic (capability-report command): re-probes each mechanism fresh. */
function canvasBlurCapabilities(): {
  ctxFilterAttr: boolean;
  ctxFilterRenders: boolean;
  shadowBlur: boolean;
  patternTransform: boolean;
  strategy: RegionBlurStrategy;
} {
  const renders = probeBlurRender((dctx, src) => {
    dctx.filter = 'blur(3px)';
    dctx.drawImage(src, 0, 0);
  });
  const shadow = shadowBlurWorks();
  return {
    ctxFilterAttr: canvasFilterAttrReflects(),
    ctxFilterRenders: renders,
    shadowBlur: shadow,
    patternTransform: CAN_SET_PATTERN_TRANSFORM,
    strategy: renders ? 'filter' : shadow ? 'shadow' : 'pyramid',
  };
}


/** Whether the runtime can transform a CanvasPattern (needed for world-anchored
 *  region fills). Supported by Chromium/Electron and Safari 14+. */
const CAN_SET_PATTERN_TRANSFORM =
  typeof CanvasPattern !== 'undefined' &&
  typeof CanvasPattern.prototype?.setTransform === 'function';

export { CAN_SET_PATTERN_TRANSFORM, getFeatherCanvas, getMaskCanvas, regionBlurStrategy, shadowBlurImage, pyramidLevels, pyramidBlurImage, canvasBlurCapabilities, releaseTileScratchCanvases };
