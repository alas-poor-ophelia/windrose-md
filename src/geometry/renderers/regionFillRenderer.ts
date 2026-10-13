/**
 * regionFillRenderer.ts
 *
 * Seamless tiled-texture region fills (terrain): world-anchored CanvasPattern
 * masked by the union of painted cells and terrain brush strokes, with an
 * optional feather. Split out of tileRenderer.ts.
 */

import type { TileAssignment, TilesetDef } from '#types/tiles/tile.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';

import { strokeBoundsWorld } from '../strokes/terrainStrokeGeometry';
import { getFeatherCanvas, getMaskCanvas, regionBlurStrategy, shadowBlurImage, pyramidBlurImage } from './canvasBlur';
import type { TileGeometry, TileViewState } from './computeTileDrawPlan';

/** Default cells-per-texture-span for region (terrain) fills. Used only as the
 *  pattern-transform fallback; per-tile resolution supplies the live value. */
const DEFAULT_WORLD_REPEAT = 4;

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


export { renderRegionFills, computeRegionPatternTransform, regionFeatherPx };
export type { RegionGroup };
