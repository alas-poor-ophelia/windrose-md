/**
 * tileRenderer.ts
 *
 * Renders tile images on the canvas with Baumgart-style z-sorting.
 * Tiles are sorted by offset row (back to front) so overflow from
 * background cells is naturally occluded by foreground cell content.
 */

import type { TileAssignment, TilesetDef, FolderTileset, TileMetadataStore } from '#types/tiles/tile.types';
import type { HexOrientation } from '#types/settings/settings.types';

import { axialToOffset } from '../core/offsetCoordinates';
import { resolveTileRender } from '../../assets/tileRenderResolution';
import { effectiveSpan } from '../../assets/tileFootprint';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';


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
  if (_featherCanvas == null) _featherCanvas = activeDocument.createElement('canvas');
  if (_featherCanvas.width !== w) _featherCanvas.width = w;
  if (_featherCanvas.height !== h) _featherCanvas.height = h;
  return _featherCanvas;
}

/** Pure: feather radius in screen px for a given cell size and ratio (clamped ≥ 0). */
function regionFeatherPx(cellPx: number, ratio: number): number {
  if (!(ratio > 0) || !(cellPx > 0)) return 0;
  return cellPx * ratio;
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
  /** Resolved per-tile terrain params (cells per texture span; edge feather ratio). */
  worldRepeat: number;
  edgeFeather: number;
}

/**
 * Render one or more groups of grid-snapped cells as seamless tiled-texture
 * fills. Each group shares a single world-anchored CanvasPattern, clipped to the
 * union of its cells. Per-tile rotation/flip/scale do not apply to region fills
 * (the texture is continuous); layer/ghost opacity is honored via `alpha`.
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
    if (minX > maxX) continue;
    // Viewport cull: skip groups entirely off-screen.
    if (maxX < 0 || minX > canvasW || maxY < 0 || minY > canvasH) continue;

    const featherPx = regionFeatherPx(cellPx, grp.edgeFeather);

    // Hard-edged fill (feather disabled): clip to the cell union and fill directly.
    if (!(featherPx > 0.5)) {
      hardFillRegion(ctx, img, path, scale, translateX, translateY, alpha, minX, minY, maxX, maxY);
      continue;
    }

    // Smart-edge feather: render into an offscreen buffer where the cell-union
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
      hardFillRegion(ctx, img, path, scale, translateX, translateY, alpha, minX, minY, maxX, maxY);
      continue;
    }
    const pattern = octx.createPattern(img, 'repeat');
    if (!pattern) continue;

    octx.clearRect(0, 0, bw, bh);
    // 1. Blurred alpha mask of the cell union (path is screen-space; shift into offscreen space).
    octx.save();
    octx.translate(-bx, -by);
    octx.filter = `blur(${featherPx}px)`;
    octx.fillStyle = '#ffffff';
    octx.fill(path);
    octx.restore();
    // 2. Paint the texture only where the mask exists, weighted by mask alpha.
    octx.globalCompositeOperation = 'source-in';
    pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, translateX - bx, translateY - by]));
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

/** Clip to the cell union and fill with the world-anchored texture (hard edges). */
function hardFillRegion(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  path: Path2D,
  scale: number,
  translateX: number,
  translateY: number,
  alpha: number,
  minX: number, minY: number, maxX: number, maxY: number
): void {
  const pattern = ctx.createPattern(img, 'repeat');
  if (!pattern) return;
  pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, translateX, translateY]));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.clip(path);
  ctx.fillStyle = pattern;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
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
      ? axialToOffset(t.col, t.row, orientation as HexOrientation)
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

  const effectiveFit = fitMode || tileset.fitMode || 'fill';

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
  if (tiles == null || tiles.length === 0) return;
  if (tilesets == null || tilesets.length === 0) return;

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
          const key = t.tilesetId + ':' + t.tileId;
          const groups = regionByDepth.get(depth) ?? regionByDepth.get('ground')!;
          let grp = groups.get(key);
          if (grp == null) {
            grp = {
              tileset: lookup.tileset,
              vaultPath: lookup.entry.vaultPath,
              cells: [],
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

    const bucket = depthBuckets.get(depth) ?? depthBuckets.get('ground')!;
    if (t.freeform === true) bucket.freeform.push(t);
    else if (t.placement === 'overlay') bucket.overlay.push(t);
    else bucket.fill.push(t);
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
    const cellW = hexScreenWidth * spanW;
    const cellH = hexScreenHeight * spanH;

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

    let rect = drawOverride || calculateTileDrawRect(
      centerX, centerY,
      tileset, geometry.hexSize, viewState.zoom, geometry.orientation,
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

    // Apply rotation/flip if needed
    const needsTransform = (tile.rotation != null && tile.rotation !== 0) || tile.flipH === true;
    if (needsTransform) {
      ctx.save();
      ctx.translate(centerX, centerY);
      if (tile.rotation != null && tile.rotation !== 0) {
        ctx.rotate((tile.rotation * Math.PI) / 180);
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

export { renderTiles, sortTilesForRendering, calculateTileDrawRect, computeRegionPatternTransform, regionFeatherPx };
