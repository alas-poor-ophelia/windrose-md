/**
 * tileRenderer.ts
 *
 * Renders tile images on the canvas with Baumgart-style z-sorting.
 * Tiles are sorted by offset row (back to front) so overflow from
 * background cells is naturally occluded by foreground cell content.
 */

import type { TileAssignment, TilesetDef, FolderTileset, TileMetadataStore } from '#types/tiles/tile.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';

import { axialToOffset } from '../core/offsetCoordinates';
import { resolveTileRender } from '../../assets/tileRenderResolution';
import { effectiveSpan } from '../../assets/tileFootprint';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { strokeBoundsWorld } from '../strokes/terrainStrokeGeometry';


// ===========================================
// Types
// ===========================================

interface TileGeometry {
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
  worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => { screenX: number; screenY: number };
  hexSize: number;
  orientation: string;
}

interface TileViewState {
  x: number;
  y: number;
  zoom: number;
}

interface TileRenderOptions {
  opacity?: number;
  getCachedImage?: (vaultPath: string) => HTMLImageElement | null;
  canvasWidth?: number;
  canvasHeight?: number;
  hiddenLayers?: Set<string>;
  /** Per-tile metadata store for render-mode resolution. Defaults to the global
   *  render accessor (matches the getTheme() idiom); injectable for tests. */
  tileMetadata?: TileMetadataStore;
  /** Terrain brush strokes for the layer — join the region-fill pass so strokes
   *  and cell fills of the same texture share one mask (and one feather). */
  terrainStrokes?: TerrainStroke[];
}

// ===========================================
// Pure Helpers
// ===========================================

const SQRT3 = Math.sqrt(3);

/** Default cells-per-texture-span for region (terrain) fills. Used only as the
 *  pattern-transform fallback; per-tile resolution supplies the live value. */
const DEFAULT_WORLD_REPEAT = 4;

/** Reusable offscreen canvas for feathered region fills (avoids per-frame allocs). */
let _featherCanvas: HTMLCanvasElement | null = null;
function getFeatherCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
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
  _maskCanvas ??= activeWindow.createEl('canvas');
  if (_maskCanvas.width !== w) _maskCanvas.width = w;
  if (_maskCanvas.height !== h) _maskCanvas.height = h;
  return _maskCanvas;
}

/** Pure: feather radius in screen px for a given cell size and ratio (clamped ≥ 0). */
function regionFeatherPx(cellPx: number, ratio: number): number {
  if (!(ratio > 0) || !(cellPx > 0)) return 0;
  return cellPx * ratio;
}

/** Cached half-scale mip chains for pattern source images, keyed by the decoded
 *  image. WebKit rasterizes canvas patterns without mip levels: at transform
 *  scales far below 1 (a 3000px Dungeondraft texture on a zoomed-out map runs
 *  ~0.01–0.05) the per-tile resampling aliases into moire/crosshatch and iPadOS
 *  can drop pattern tiles outright at specific zoom levels. Chromium's Skia
 *  mipmaps internally, which is why desktop never shows it. */
const PATTERN_MIP_MAX_LEVEL = 5;
const _patternMips = new WeakMap<HTMLImageElement, HTMLCanvasElement[]>();

/** Swap a heavily-minified pattern source for a pre-downscaled mip so the
 *  pattern's effective scale lands in (0.5, 1]. Scale ratios are corrected by
 *  the mip's EXACT dimensions (not 2^level) so the on-screen repeat period —
 *  and therefore the world anchoring — is identical to the full-res pattern. */
function patternSourceForScale(
  img: HTMLImageElement,
  scale: number
): { source: HTMLImageElement | HTMLCanvasElement; scaleX: number; scaleY: number } {
  let level = 0;
  for (let s = scale; s < 0.5 && level < PATTERN_MIP_MAX_LEVEL; s *= 2) level++;
  if (level === 0 || typeof document === 'undefined') {
    return { source: img, scaleX: scale, scaleY: scale };
  }
  let chain = _patternMips.get(img);
  if (chain == null) {
    chain = [];
    _patternMips.set(img, chain);
  }
  let src: HTMLImageElement | HTMLCanvasElement = img;
  let sw = img.naturalWidth;
  let sh = img.naturalHeight;
  for (let i = 0; i < level; i++) {
    let mip = chain[i];
    if (mip == null) {
      const w = Math.floor(sw / 2);
      const h = Math.floor(sh / 2);
      if (w < 1 || h < 1) break;
      const candidate = activeWindow.createEl('canvas');
      const mctx = candidate.getContext('2d');
      if (mctx == null) break;
      candidate.width = w;
      candidate.height = h;
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(src, 0, 0, w, h);
      mip = candidate;
      chain[i] = mip;
    }
    src = mip;
    sw = mip.width;
    sh = mip.height;
  }
  if (src === img) return { source: img, scaleX: scale, scaleY: scale };
  return {
    source: src,
    scaleX: (scale * img.naturalWidth) / sw,
    scaleY: (scale * img.naturalHeight) / sh,
  };
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

function isFolderTileset(ts: TilesetDef): ts is FolderTileset {
  return !('source' in ts) || ts.source === 'folder';
}


/**
 * Pure: compute the affine transform that maps a tileable texture's pixel space
 * onto the screen so one full texture span covers `worldRepeat` cells, anchored
 * at the world origin. The texture then tiles seamlessly across all painted
 * cells regardless of how many (or how few) are filled.
 */
function computeRegionPatternTransform(
  naturalWidth: number,
  worldRepeat: number,
  cellSize: number,
  screenPerWorld: number,
  anchorScreenX: number,
  anchorScreenY: number
): { scale: number; translateX: number; translateY: number } {
  const R = worldRepeat > 0 ? worldRepeat : DEFAULT_WORLD_REPEAT;
  const scale = naturalWidth > 0
    ? (screenPerWorld * R * cellSize) / naturalWidth
    : 1;
  return { scale, translateX: anchorScreenX, translateY: anchorScreenY };
}

interface RegionGroup {
  tileset: TilesetDef;
  vaultPath: string;
  cells: TileAssignment[];
  /** Terrain brush strokes of this texture (world-space capsule sweeps). */
  strokes: TerrainStroke[];
  /** Resolved per-tile terrain params (cells per texture span; edge feather ratio). */
  worldRepeat: number;
  edgeFeather: number;
}

/** Build the screen-space Path2D of a stroke's polyline spine. */
function strokeScreenPath(
  stroke: TerrainStroke,
  geometry: TileGeometry,
  viewState: TileViewState
): Path2D {
  const p = new Path2D();
  const pts = stroke.points;
  const s0 = geometry.worldToScreen(pts[0], pts[1], viewState.x, viewState.y, viewState.zoom);
  p.moveTo(s0.screenX, s0.screenY);
  for (let i = 2; i + 1 < pts.length; i += 2) {
    const s = geometry.worldToScreen(pts[i], pts[i + 1], viewState.x, viewState.y, viewState.zoom);
    p.lineTo(s.screenX, s.screenY);
  }
  return p;
}

/** Draw a group's strokes into a mask context as white round-cap sweeps. */
function drawStrokeMask(
  mctx: CanvasRenderingContext2D,
  strokes: TerrainStroke[],
  geometry: TileGeometry,
  viewState: TileViewState,
  screenPerWorld: number
): void {
  mctx.fillStyle = '#ffffff';
  mctx.strokeStyle = '#ffffff';
  mctx.lineCap = 'round';
  mctx.lineJoin = 'round';
  for (const st of strokes) {
    const radiusPx = st.radius * screenPerWorld;
    if (st.points.length <= 2) {
      // Single-point dab: a zero-length stroke may not paint; use an arc fill.
      const c = geometry.worldToScreen(st.points[0], st.points[1], viewState.x, viewState.y, viewState.zoom);
      const dab = new Path2D();
      dab.arc(c.screenX, c.screenY, radiusPx, 0, Math.PI * 2);
      mctx.fill(dab);
    } else {
      mctx.lineWidth = radiusPx * 2;
      mctx.stroke(strokeScreenPath(st, geometry, viewState));
    }
  }
}

/**
 * Render one or more groups of grid-snapped cells AND terrain brush strokes as
 * seamless tiled-texture fills. Each group shares a single world-anchored
 * CanvasPattern, masked by the union of its cell rects and stroke capsules —
 * one shared mask means one feather pass, so strokes and cells of the same
 * texture merge without double-edged seams. Per-tile rotation/flip/scale do
 * not apply (the texture is continuous); layer/ghost opacity via `alpha`.
 */
function renderRegionFills(
  ctx: CanvasRenderingContext2D,
  groups: Map<string, RegionGroup>,
  geometry: TileGeometry,
  viewState: TileViewState,
  getCachedImage: (vaultPath: string) => HTMLImageElement | null,
  alpha: number,
  canvasW: number,
  canvasH: number
): void {
  const cs = geometry.hexSize;
  const origin = geometry.worldToScreen(0, 0, viewState.x, viewState.y, viewState.zoom);
  const unitX = geometry.worldToScreen(1, 0, viewState.x, viewState.y, viewState.zoom);
  const screenPerWorld = unitX.screenX - origin.screenX;
  if (!(screenPerWorld > 0)) return;

  const cellPx = cs * screenPerWorld;
  const half = cs / 2;

  for (const grp of groups.values()) {
    const img = getCachedImage(grp.vaultPath);
    if (!img || !img.naturalWidth) continue;

    const { scale, translateX, translateY } = computeRegionPatternTransform(
      img.naturalWidth,
      grp.worldRepeat,
      cs,
      screenPerWorld,
      origin.screenX,
      origin.screenY
    );

    // Build clip path from the union of cell rects; track screen bbox.
    const path = new Path2D();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const t of grp.cells) {
      const center = geometry.hexToWorld(t.col, t.row);
      const tl = geometry.worldToScreen(center.worldX - half, center.worldY - half, viewState.x, viewState.y, viewState.zoom);
      path.rect(tl.screenX, tl.screenY, cellPx, cellPx);
      if (tl.screenX < minX) minX = tl.screenX;
      if (tl.screenY < minY) minY = tl.screenY;
      if (tl.screenX + cellPx > maxX) maxX = tl.screenX + cellPx;
      if (tl.screenY + cellPx > maxY) maxY = tl.screenY + cellPx;
    }
    // Extend the bbox by each stroke's capsule bounds.
    const hasStrokes = grp.strokes.length > 0;
    for (const st of grp.strokes) {
      const b = strokeBoundsWorld(st);
      const tl = geometry.worldToScreen(b.minX, b.minY, viewState.x, viewState.y, viewState.zoom);
      const br = geometry.worldToScreen(b.maxX, b.maxY, viewState.x, viewState.y, viewState.zoom);
      if (tl.screenX < minX) minX = tl.screenX;
      if (tl.screenY < minY) minY = tl.screenY;
      if (br.screenX > maxX) maxX = br.screenX;
      if (br.screenY > maxY) maxY = br.screenY;
    }
    if (minX > maxX) continue;
    // Viewport cull: skip groups entirely off-screen.
    if (maxX < 0 || minX > canvasW || maxY < 0 || minY > canvasH) continue;

    const featherPx = regionFeatherPx(cellPx, grp.edgeFeather);

    // Hard-edged fill (feather disabled): clip to the cell union and fill directly.
    if (!(featherPx > 0.5)) {
      hardFillRegion(ctx, img, grp, path, geometry, viewState, screenPerWorld, scale, translateX, translateY, alpha, minX, minY, maxX, maxY);
      continue;
    }

    // Smart-edge feather: render into an offscreen buffer where the union
    // mask is blurred — only the OUTER boundary of the union softens; interior
    // edges shared with same-terrain neighbours stay inside the blob and remain
    // opaque — then composite the world-anchored texture through that mask.
    const pad = Math.ceil(featherPx) + 2;
    const bx = Math.max(Math.floor(minX) - pad, -pad);
    const by = Math.max(Math.floor(minY) - pad, -pad);
    const ex = Math.min(Math.ceil(maxX) + pad, canvasW + pad);
    const ey = Math.min(Math.ceil(maxY) + pad, canvasH + pad);
    const bw = ex - bx, bh = ey - by;
    if (bw <= 0 || bh <= 0) continue;

    const oc = getFeatherCanvas(bw, bh);
    const octx = oc?.getContext('2d') ?? null;
    if (oc == null || octx == null) {
      // Offscreen unavailable (e.g. non-DOM env): degrade to a hard edge.
      hardFillRegion(ctx, img, grp, path, geometry, viewState, screenPerWorld, scale, translateX, translateY, alpha, minX, minY, maxX, maxY);
      continue;
    }
    const patSrc = patternSourceForScale(img, scale);
    const pattern = octx.createPattern(patSrc.source, 'repeat');
    if (!pattern) continue;

    octx.clearRect(0, 0, bw, bh);
    const strategy = regionBlurStrategy();
    if (!hasStrokes && strategy === 'filter') {
      // Cells only: blur the union path in one draw call (original fast path).
      octx.save();
      octx.translate(-bx, -by);
      octx.filter = `blur(${featherPx}px)`;
      octx.fillStyle = '#ffffff';
      octx.fill(path);
      octx.restore();
    } else {
      // Cells + strokes need MULTIPLE mask draw calls; blurring each call
      // separately would stack alpha where shapes overlap (visible seams).
      // Draw the union hard into the mask canvas, then blur it ONCE. This is
      // also the route when ctx.filter is unavailable (WebKit/iPad), where
      // the blur happens via a probe-verified fallback instead.
      const mc = getMaskCanvas(bw, bh);
      const mctx = mc?.getContext('2d') ?? null;
      if (mc == null || mctx == null) {
        hardFillRegion(ctx, img, grp, path, geometry, viewState, screenPerWorld, scale, translateX, translateY, alpha, minX, minY, maxX, maxY);
        continue;
      }
      mctx.clearRect(0, 0, bw, bh);
      mctx.save();
      mctx.translate(-bx, -by);
      mctx.fillStyle = '#ffffff';
      if (grp.cells.length > 0) mctx.fill(path);
      if (hasStrokes) drawStrokeMask(mctx, grp.strokes, geometry, viewState, screenPerWorld);
      mctx.restore();

      if (strategy === 'filter') {
        octx.save();
        octx.filter = `blur(${featherPx}px)`;
        octx.drawImage(mc, 0, 0);
        octx.restore();
      } else if (strategy === 'shadow') {
        shadowBlurImage(octx, mc, featherPx);
      } else {
        pyramidBlurImage(octx, mc, bw, bh, featherPx);
      }
    }
    // 2. Paint the texture only where the mask exists, weighted by mask alpha.
    octx.globalCompositeOperation = 'source-in';
    pattern.setTransform(new DOMMatrix([patSrc.scaleX, 0, 0, patSrc.scaleY, translateX - bx, translateY - by]));
    octx.fillStyle = pattern;
    octx.fillRect(0, 0, bw, bh);
    octx.globalCompositeOperation = 'source-over';
    // 3. Blit the feathered region onto the main canvas.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(oc, bx, by);
    ctx.restore();
  }
}

/** Fill the cell union and stroke sweeps with the world-anchored texture (hard edges). */
function hardFillRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  grp: RegionGroup,
  path: Path2D,
  geometry: TileGeometry,
  viewState: TileViewState,
  screenPerWorld: number,
  scale: number,
  translateX: number,
  translateY: number,
  alpha: number,
  minX: number, minY: number, maxX: number, maxY: number
): void {
  const patSrc = patternSourceForScale(img, scale);
  const pattern = ctx.createPattern(patSrc.source, 'repeat');
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix([patSrc.scaleX, 0, 0, patSrc.scaleY, translateX, translateY]));
  ctx.save();
  ctx.globalAlpha = alpha;
  if (grp.cells.length > 0) {
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = pattern;
    ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
    ctx.restore();
  }
  if (grp.strokes.length > 0) {
    // Sweep the pattern along each stroke spine (round caps = capsule union).
    ctx.strokeStyle = pattern;
    ctx.fillStyle = pattern;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const st of grp.strokes) {
      const radiusPx = st.radius * screenPerWorld;
      if (st.points.length <= 2) {
        const c = geometry.worldToScreen(st.points[0], st.points[1], viewState.x, viewState.y, viewState.zoom);
        const dab = new Path2D();
        dab.arc(c.screenX, c.screenY, radiusPx, 0, Math.PI * 2);
        ctx.fill(dab);
      } else {
        ctx.lineWidth = radiusPx * 2;
        ctx.stroke(strokeScreenPath(st, geometry, viewState));
      }
    }
  }
  ctx.restore();
}

/**
 * Sort tiles by offset row ascending (back → front), then col for stability.
 * Pre-computes offsets to avoid redundant axialToOffset calls during sort.
 * Returns a new array; does not mutate the original.
 */
function sortTilesForRendering(
  tiles: TileAssignment[],
  orientation: string
): TileAssignment[] {
  const isHex = orientation === 'flat' || orientation === 'pointy';
  const offsets = new Map<TileAssignment, { col: number; row: number }>();
  for (const t of tiles) {
    offsets.set(t, isHex
      ? axialToOffset(t.col, t.row, orientation)
      : { col: t.col, row: t.row }
    );
  }
  return [...tiles].sort((a, b) => {
    const oa = offsets.get(a);
    const ob = offsets.get(b);
    if (oa == null || ob == null) return 0;
    if (oa.row !== ob.row) return oa.row - ob.row;
    return oa.col - ob.col;
  });
}

/**
 * Calculate the draw rectangle for a tile on screen.
 * The tile's hex-area portion is centered on the hex's screen position;
 * overflow extends above/below.
 *
 * Tile images contain hex-shaped artwork in a rectangular bounding box.
 * The tile's tileWidth maps to the hex's width on screen, and the tile's
 * hexHeight maps to the hex's height on screen. Since hex aspect ratios
 * differ from the rectangular tile dimensions, independent X/Y scaling
 * is needed.
 */
function calculateTileDrawRect(
  screenX: number,
  screenY: number,
  tileset: TilesetDef,
  hexSize: number,
  zoom: number,
  orientation: string,
  fitMode?: 'fill' | 'contain',
  spanW = 1,
  spanH = 1
): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
  // On-screen cell dimensions (corner-to-corner for hex, edge-to-edge for grid).
  // A multi-cell footprint scales the target box by its UNROTATED span; the
  // caller centers the rect on the footprint center and applies any rotation.
  const isGrid = orientation !== 'flat' && orientation !== 'pointy';
  const hexScreenWidth = (isGrid
    ? hexSize * zoom
    : orientation === 'flat' ? 2 * hexSize * zoom : SQRT3 * hexSize * zoom) * spanW;
  const hexScreenHeight = (isGrid
    ? hexSize * zoom
    : orientation === 'flat' ? SQRT3 * hexSize * zoom : 2 * hexSize * zoom) * spanH;

  const folder = isFolderTileset(tileset) ? tileset : null;
  const hexHeight = folder?.hexHeight ?? tileset.tileHeight;
  const overflowTop = folder?.overflowTop ?? 0;

  // Independent scale factors:
  // tileWidth maps to hex width, hexHeight maps to hex height
  const scaleX = hexScreenWidth / tileset.tileWidth;
  const scaleY = hexScreenHeight / hexHeight;

  const effectiveFit = fitMode ?? tileset.fitMode ?? 'fill';

  if (effectiveFit === 'contain') {
    // Uniform scaling: preserve aspect ratio, fit within hex bounding box
    const uniformScale = Math.min(scaleX, scaleY);
    const drawWidth = tileset.tileWidth * uniformScale;
    const drawHeight = tileset.tileHeight * uniformScale;

    // Center within the hex bounding box
    const drawX = screenX - drawWidth / 2;
    const hexAreaCenterInTile = overflowTop + hexHeight / 2;
    const drawY = screenY - hexAreaCenterInTile * uniformScale;

    return { drawX, drawY, drawWidth, drawHeight };
  }

  // 'fill' mode: independent X/Y scaling (original behavior)
  const drawWidth = tileset.tileWidth * scaleX;
  const drawHeight = tileset.tileHeight * scaleY;

  // Position: center the hex-area portion on the hex center
  // The hex area starts at overflowTop pixels from the top of the tile image
  const hexAreaCenterInTile = overflowTop + hexHeight / 2;
  const drawX = screenX - drawWidth / 2;
  const drawY = screenY - hexAreaCenterInTile * scaleY;

  return { drawX, drawY, drawWidth, drawHeight };
}

/**
 * Pure: how a hex tile's art orientation adapts to the cell orientation.
 * Hexagonal art can only match a hex cell of the same orientation — non-uniform
 * scaling never turns a pointy-top hexagon into a flat-top one. When they
 * differ, the tile is sized in the ART's frame (its own orientation's cell
 * bbox) and rotated ±30° about the cell center so it lands on the cell.
 * Grid maps and unknown art orientations adapt nothing.
 */
function tileOrientationAdaptation(
  mapOrientation: string,
  artOrientation: 'flat' | 'pointy' | undefined
): { sizeOrientation: string; rotationDeg: number } {
  const isHex = mapOrientation === 'flat' || mapOrientation === 'pointy';
  if (!isHex || artOrientation == null || artOrientation === mapOrientation) {
    return { sizeOrientation: mapOrientation, rotationDeg: 0 };
  }
  return { sizeOrientation: artOrientation, rotationDeg: artOrientation === 'pointy' ? 30 : -30 };
}

// ===========================================
// Entry Map Cache
// ===========================================

let _cachedEntryMap: Map<string, { entry: { vaultPath: string }; tileset: TilesetDef }> | null = null;
let _cachedEntryMapSig = '';

function getEntryMap(tilesets: TilesetDef[]): Map<string, { entry: { vaultPath: string }; tileset: TilesetDef }> {
  // Signature MUST include every render-affecting field that can change without
  // altering tile count, or the cache serves a stale tileset reference (e.g. a
  // live renderMode/fitMode override would never reach the renderer).
  let sig = '';
  for (const ts of tilesets) {
    sig += ts.id + ':' + ts.tiles.length
      + ':' + (ts.renderMode ?? '')
      + ':' + (ts.worldRepeat ?? '')
      + ':' + (ts.edgeFeather ?? '')
      + ':' + (ts.fitMode ?? '')
      + ':' + (ts.stampThreshold ?? '')
      + ':' + (ts.minStampScale ?? '')
      + ':' + (ts.artOrientation ?? '')
      + ',';
  }
  if (_cachedEntryMap && sig === _cachedEntryMapSig) return _cachedEntryMap;

  const map = new Map<string, { entry: { vaultPath: string }; tileset: TilesetDef }>();
  for (const ts of tilesets) {
    for (const entry of ts.tiles) {
      map.set(ts.id + ':' + entry.id, { entry, tileset: ts });
    }
  }
  _cachedEntryMapSig = sig;
  _cachedEntryMap = map;
  return map;
}

// ===========================================
// Main Render Function
// ===========================================

/**
 * Render tile images onto the canvas with z-sorted overflow.
 */
function renderTiles(
  ctx: CanvasRenderingContext2D,
  tiles: TileAssignment[],
  tilesets: TilesetDef[],
  geometry: TileGeometry,
  viewState: TileViewState,
  options?: TileRenderOptions
): void {
  const terrainStrokes = options?.terrainStrokes ?? [];
  if ((tiles == null || tiles.length === 0) && terrainStrokes.length === 0) return;
  if (tilesets == null || tilesets.length === 0) return;
  tiles ??= [];

  const getCachedImage = options?.getCachedImage;
  if (!getCachedImage) return;

  const entryMap = getEntryMap(tilesets);

  // Per-tile metadata drives render-mode resolution (terrain → seamless region
  // fill vs. discrete cell stamp). Read fresh each frame from the global accessor
  // — same idiom as getTheme() — so it stays live without a cache-version dance.
  const metaStore = options?.tileMetadata ?? getTileMetadataForRender();

  // Pre-compute cell screen dimensions (constant for all tiles in this frame)
  const isGrid = geometry.orientation !== 'flat' && geometry.orientation !== 'pointy';
  const hexScreenWidth = isGrid
    ? geometry.hexSize * viewState.zoom
    : geometry.orientation === 'flat' ? 2 * geometry.hexSize * viewState.zoom : SQRT3 * geometry.hexSize * viewState.zoom;
  const hexScreenHeight = isGrid
    ? geometry.hexSize * viewState.zoom
    : geometry.orientation === 'flat' ? SQRT3 * geometry.hexSize * viewState.zoom : 2 * geometry.hexSize * viewState.zoom;

  // Partition by depth tier, then by placement within each tier
  const DEPTH_ORDER = ['ground', 'structure', 'props', 'decoration'] as const;
  const depthBuckets = new Map<string, { fill: TileAssignment[]; overlay: TileAssignment[]; freeform: TileAssignment[] }>();
  // Region (terrain) fills are grouped per (tileset:tile) within each depth tier.
  const regionByDepth = new Map<string, Map<string, RegionGroup>>();
  for (const d of DEPTH_ORDER) {
    depthBuckets.set(d, { fill: [], overlay: [], freeform: [] });
    regionByDepth.set(d, new Map());
  }

  // Region fills only apply to grid maps with a transformable pattern.
  const canRegion = CAN_SET_PATTERN_TRANSFORM && isGrid;
  const hiddenLayers = options?.hiddenLayers;
  for (const t of tiles) {
    const depth = t.depth ?? 'ground';
    if (hiddenLayers != null && hiddenLayers.size > 0 && hiddenLayers.has(depth)) continue;

    // Divert seamless terrain tiles into a grouped region-fill pass.
    if (canRegion && t.freeform !== true) {
      const lookup = entryMap.get(t.tilesetId + ':' + t.tileId);
      if (lookup != null) {
        // Resolution chain: per-placement → per-tile metadata → tileset fallback
        // (the tileset tier is temporary, removed once the legacy override UI dies).
        const resolved = resolveTileRender(t, metaStore[lookup.entry.vaultPath], lookup.tileset);
        if (resolved.renderMode === 'region') {
          // Feather participates in the group key: the mask blur is one pass
          // per group, so entries can only share a group when they share a
          // softness. Same feather → cells and strokes still merge seamlessly.
          const key = t.tilesetId + ':' + t.tileId + ':f' + resolved.edgeFeather;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- regionByDepth is pre-seeded for every DEPTH_ORDER key including 'ground'
          const groups = regionByDepth.get(depth) ?? regionByDepth.get('ground')!;
          let grp = groups.get(key);
          if (grp == null) {
            grp = {
              tileset: lookup.tileset,
              vaultPath: lookup.entry.vaultPath,
              cells: [],
              strokes: [],
              worldRepeat: resolved.worldRepeat,
              edgeFeather: resolved.edgeFeather,
            };
            groups.set(key, grp);
          }
          grp.cells.push(t);
          continue;
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- depthBuckets is pre-seeded for every DEPTH_ORDER key including 'ground'
    const bucket = depthBuckets.get(depth) ?? depthBuckets.get('ground')!;
    if (t.freeform === true) bucket.freeform.push(t);
    else if (t.placement === 'overlay') bucket.overlay.push(t);
    else bucket.fill.push(t);
  }

  // Terrain brush strokes join the region pass. They have no cell dependency,
  // so unlike cell region fills they are NOT gated on isGrid — world-anchored
  // pattern transforms work identically on hex (worldToScreen is affine).
  if (CAN_SET_PATTERN_TRANSFORM) {
    for (const s of terrainStrokes) {
      if (s.points.length < 2) continue;
      const depth = s.depth ?? 'ground';
      if (hiddenLayers != null && hiddenLayers.size > 0 && hiddenLayers.has(depth)) continue;
      const lookup = entryMap.get(s.tilesetId + ':' + s.tileId);
      if (lookup == null) continue;
      const resolved = resolveTileRender(undefined, metaStore[lookup.entry.vaultPath], lookup.tileset);
      // Per-stroke softness wins over the tile default; feather is part of
      // the group key (one mask blur per group), so a stroke matching a cell
      // fill's feather still merges into that group and blends seamlessly.
      const feather = s.feather ?? resolved.edgeFeather;
      const key = s.tilesetId + ':' + s.tileId + ':f' + feather;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- regionByDepth is pre-seeded for every DEPTH_ORDER key including 'ground'
      const groups = regionByDepth.get(depth) ?? regionByDepth.get('ground')!;
      let grp = groups.get(key);
      if (grp == null) {
        grp = {
          tileset: lookup.tileset,
          vaultPath: lookup.entry.vaultPath,
          cells: [],
          strokes: [],
          worldRepeat: resolved.worldRepeat,
          edgeFeather: feather,
        };
        groups.set(key, grp);
      }
      grp.strokes.push(s);
    }
  }

  const previousAlpha = ctx.globalAlpha;
  const opacity = options?.opacity ?? 1;
  const canvasW = options?.canvasWidth ?? 4000;
  const canvasH = options?.canvasHeight ?? 4000;

  const drawCellTile = (tile: TileAssignment): void => {
    const lookup = entryMap.get(tile.tilesetId + ':' + tile.tileId);
    if (!lookup) return;

    const { entry, tileset } = lookup;
    const img = getCachedImage(entry.vaultPath);
    if (!img || !img.naturalWidth) return;

    // Convert to screen coordinates
    // Freeform stamps use stored world coordinates directly
    const screen = tile.freeform === true && tile.worldX != null && tile.worldY != null
      ? geometry.worldToScreen(tile.worldX, tile.worldY, viewState.x, viewState.y, viewState.zoom)
      : (() => {
          const world = geometry.hexToWorld(tile.col, tile.row);
          return geometry.worldToScreen(world.worldX, world.worldY, viewState.x, viewState.y, viewState.zoom);
        })();

    // Multi-cell footprint (grid, snapped tiles only). The draw rect is sized to
    // the UNROTATED span and centered on the footprint center derived from the
    // EFFECTIVE (rotation-swapped) span; rotating that rect about the same center
    // then fills the swapped cell box exactly. 1x1 / hex / freeform tiles collapse
    // back to the anchor cell center, leaving existing behavior unchanged.
    const resolvedSpan = isGrid && tile.freeform !== true
      ? resolveTileRender(tile, metaStore[entry.vaultPath], tileset)
      : null;
    const spanW = resolvedSpan?.spanW ?? 1;
    const spanH = resolvedSpan?.spanH ?? 1;
    const eff = spanW > 1 || spanH > 1
      ? effectiveSpan({ spanW, spanH, rotation: tile.rotation })
      : { spanW, spanH };
    const centerX = screen.screenX + ((eff.spanW - 1) / 2) * hexScreenWidth;
    const centerY = screen.screenY + ((eff.spanH - 1) / 2) * hexScreenHeight;

    // Art-orientation adaptation (hex maps only): mismatched hexagonal art is
    // sized in its own orientation's frame — the transpose of the cell bbox —
    // then rotated ±30° about the cell center below.
    const adapt = tileOrientationAdaptation(geometry.orientation, tileset.artOrientation);
    const frameW = adapt.rotationDeg !== 0 ? hexScreenHeight : hexScreenWidth;
    const frameH = adapt.rotationDeg !== 0 ? hexScreenWidth : hexScreenHeight;
    const cellW = frameW * spanW;
    const cellH = frameH * spanH;

    const folder = isFolderTileset(tileset) ? tileset : null;
    const hexHeight = folder?.hexHeight ?? tileset.tileHeight;
    const maxOverflow = Math.max(folder?.overflowTop ?? 0, folder?.overflowBottom ?? 0, tileset.tileHeight);

    // Viewport culling (generous margin for overflow)
    const margin = maxOverflow * viewState.zoom * 2;
    if (screen.screenX < -margin || screen.screenX > canvasW + margin ||
        screen.screenY < -margin || screen.screenY > canvasH + margin) {
      return;
    }

    // Auto-detect fit mode for mixed tilesets: if the actual image dimensions
    // differ significantly from the tileset's declared dimensions, this tile
    // is a stamp/object (not cell-filling). Scale it relative to the tileset's
    // coordinate space so a 55px stamp in a 256px tileset stays small.
    let drawOverride: { drawX: number; drawY: number; drawWidth: number; drawHeight: number } | null = null;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (natW > 0 && natH > 0 && tile.fitMode == null) {
      const wRatio = natW / tileset.tileWidth;
      const hRatio = natH / hexHeight;
      const stampThreshold = tileset.stampThreshold ?? 0.5;
      if (wRatio < stampThreshold || hRatio < stampThreshold) {
        // Scale relative to the footprint using pre-computed screen dimensions
        const fillScaleX = cellW / tileset.tileWidth;
        const fillScaleY = cellH / hexHeight;
        // Use the smaller fill scale to preserve aspect ratio
        const baseScale = Math.min(fillScaleX, fillScaleY);
        // Ensure stamps are at least minStampScale of the footprint's smaller dimension
        const minHexDim = Math.min(cellW, cellH);
        const minStampDim = minHexDim * (tileset.minStampScale ?? 0.35);
        const naturalMinDim = Math.min(natW, natH) * baseScale;
        const effectiveScale = (naturalMinDim < minStampDim
          ? baseScale * (minStampDim / naturalMinDim)
          : baseScale) * (tile.scale ?? 1);
        const drawWidth = natW * effectiveScale;
        const drawHeight = natH * effectiveScale;
        drawOverride = {
          drawX: centerX - drawWidth / 2,
          drawY: centerY - drawHeight / 2,
          drawWidth,
          drawHeight,
        };
      }
    }

    let rect = drawOverride ?? calculateTileDrawRect(
      centerX, centerY,
      tileset, geometry.hexSize, viewState.zoom, adapt.sizeOrientation,
      tile.fitMode, spanW, spanH
    );

    // Apply per-tile scale to non-stamp tiles (stamps already applied above)
    if (drawOverride == null && tile.scale != null && tile.scale !== 1) {
      const s = tile.scale;
      const cx = rect.drawX + rect.drawWidth / 2;
      const cy = rect.drawY + rect.drawHeight / 2;
      const w = rect.drawWidth * s;
      const h = rect.drawHeight * s;
      rect = { drawX: cx - w / 2, drawY: cy - h / 2, drawWidth: w, drawHeight: h };
    }

    // Apply opacity (per-tile and layer-level)
    const tileOpacity = tile.opacity ?? 1;
    if (opacity < 1 || tileOpacity < 1) {
      ctx.globalAlpha = previousAlpha * opacity * tileOpacity;
    }

    // Apply rotation/flip if needed. Orientation adaptation composes with the
    // user rotation (both are about the cell center, so they commute).
    const totalRotation = (tile.rotation ?? 0) + adapt.rotationDeg;
    const needsTransform = totalRotation !== 0 || tile.flipH === true;
    if (needsTransform) {
      ctx.save();
      ctx.translate(centerX, centerY);
      if (totalRotation !== 0) {
        ctx.rotate((totalRotation * Math.PI) / 180);
      }
      if (tile.flipH === true) {
        ctx.scale(-1, 1);
      }
      ctx.translate(-centerX, -centerY);
    }

    ctx.drawImage(img, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);

    if (needsTransform) {
      ctx.restore();
    }

    // Restore opacity
    if (opacity < 1 || tileOpacity < 1) {
      ctx.globalAlpha = previousAlpha;
    }
  };

  // Render in depth order. Within each tier: region fills (back) → cell fills
  // (sorted back→front) → overlays (sorted) → freeform stamps (front).
  for (const d of DEPTH_ORDER) {
    const regionGroups = regionByDepth.get(d);
    if (regionGroups != null && regionGroups.size > 0) {
      renderRegionFills(ctx, regionGroups, geometry, viewState, getCachedImage, previousAlpha * opacity, canvasW, canvasH);
    }
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- d iterates DEPTH_ORDER, which was used to seed depthBuckets
    const bucket = depthBuckets.get(d)!;
    if (bucket.fill.length > 0) {
      for (const tile of sortTilesForRendering(bucket.fill, geometry.orientation)) drawCellTile(tile);
    }
    if (bucket.overlay.length > 0) {
      for (const tile of sortTilesForRendering(bucket.overlay, geometry.orientation)) drawCellTile(tile);
    }
    if (bucket.freeform.length > 0) {
      for (const tile of bucket.freeform) drawCellTile(tile);
    }
  }
}

export { renderTiles, sortTilesForRendering, calculateTileDrawRect, computeRegionPatternTransform, regionFeatherPx, shadowBlurImage, pyramidLevels, pyramidBlurImage, canvasBlurCapabilities, tileOrientationAdaptation };
