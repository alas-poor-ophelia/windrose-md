/**
 * useCanvasRenderer.ts
 *
 * Canvas rendering hook and utilities for the map canvas.
 * Handles grid, cells, objects, text labels, fog of war, and selections.
 */

// Type-only imports
import type { MapLayer } from '#types/core/map.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import { isGridCell } from '#types/core/cell.types';
import type { BuildCellLookupFn, CalculateBordersFn } from '#types/core/rendering.types';
import type { MapObject } from '#types/objects/object.types';
import type {
  RenderCanvas,
  UseCanvasRenderer,
  RendererSelectedItem,
  LayerVisibility,
  RendererTheme,
  RendererViewState,
} from '#types/hooks/canvasRenderer.types';

import { useEffect, useRef } from 'preact/hooks';
import { getTheme, getEffectiveSettings } from '../../core/settingsAccessor';
import { buildCellLookup, calculateBordersOptimized } from '../../drawing/borderCalculator';
import { getObjectType } from '../../objects/objectOperations';
import { getRenderChar } from '../../objects/objectTypeResolver';
import { getCellColor } from '../../drawing/colorOperations';
import { renderNoteLinkBadge, renderTooltipIndicator, renderObjectLinkIndicator } from '../../geometry/renderers/badgeRenderer';
import { renderTextLabels } from '../../geometry/renderers/textLabelRenderer';
import { renderGridBackgroundImage } from '../../geometry/renderers/backgroundRenderer';
import { renderGridFog } from '../../geometry/fog/gridFogRenderer';
import { renderHexFog } from '../../geometry/fog/hexFogRenderer';
import { getFogSettings, clearFogCanvas, renderFog } from '../../geometry/fog/fogRenderer';
import { renderObjects } from '../../geometry/renderers/objectRenderer';
import { renderSelections } from '../../geometry/renderers/selectionRenderer';
import { segmentRenderer } from '../../geometry/renderers/segmentRenderer';
import { getFontCss } from '../../text/fontOptions';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { renderRegions } from '../../geometry/renderers/regionRenderer';
import { renderOutlines } from '../../geometry/renderers/outlineRenderer';
import { renderShapeOverlays, renderPlayerLights } from '../../geometry/renderers/shapeOverlayRenderer';
import { renderTiles } from '../../geometry/renderers/tileRenderer';
import { gridRenderer } from '../../geometry/renderers/gridRenderer';
import { hexRenderer } from '../../geometry/renderers/hexRenderer';
import { renderCurves } from '../../geometry/renderers/curveRenderer';
import { renderWallPaths } from '../../geometry/renderers/wallPathRenderer';
import { buildMergeIndex } from '../../geometry/curves/curveCellOverlap';
import { getCachedImage, getImageCacheVersion } from '../../assets/imageOperations';
import { getSlotOffset, getMultiObjectScale, getObjectsInCell } from '../../objects/hexSlotPositioner';
import { offsetToAxial, axialToOffset } from '../../geometry/core/offsetCoordinates';
import { getActiveLayer, getLayerBelow, getRenderLayers, isCellFogged, getActiveBoardId, getBoardBelow, getBoardLayers } from '../../persistence/layerAccessor';

interface Renderer {
  // Polymorphic properties
  supportsSegments: boolean;

  // Method syntax enables bivariant checking — gridRenderer/hexRenderer methods
  // accept narrower IGridRenderer/IHexRenderer params but are safely called with
  // IGeometry since the runtime object always satisfies both.
  getScaledSize(geometry: IGeometry, zoom: number): number;
  calculateViewportOffset(geometry: IGeometry, center: { x: number; y: number }, canvasSize: { width: number; height: number }, zoom: number): { offsetX: number; offsetY: number };

  renderBackgroundImage(
    ctx: CanvasRenderingContext2D,
    geometry: IGeometry,
    bgImage: HTMLImageElement | null,
    bgConfig: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number } | undefined,
    boundsOrDimensions: { maxCol: number; maxRow: number } | { width: number; height: number } | undefined,
    orientation: string,
    offsetX: number,
    offsetY: number,
    zoom: number,
    renderGridBackgroundImage?: (
      bgImage: HTMLImageElement,
      config: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number },
      dimensions: { width: number; height: number },
      cellSize: number,
      context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number }
    ) => void
  ): void;

  renderGrid(ctx: CanvasRenderingContext2D, geometry: IGeometry, viewState: RendererViewState, dimensions: { width: number; height: number }, showGrid: boolean, options: { lineColor: string; lineWidth: number; rotated?: boolean }): void;
  renderPaintedCells(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState): void;
  renderCellBorders(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, buildLookup: BuildCellLookupFn, calculateBorders: CalculateBordersFn, options: { border: string; borderWidth: number }): void;
  renderInteriorGridLines?(ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, options: { lineColor: string; lineWidth: number; interiorRatio: number }): void;
  renderEdges?(ctx: CanvasRenderingContext2D, edges: unknown[], geometry: IGeometry, viewState: RendererViewState, options: { lineWidth: number; borderWidth: number }): void;
}



/** Spatial index for curve-cell visual merging */
interface CurveCellMergeIndex {
  cellBordersToSuppress: Map<string, Set<string>>;
  curveCellRects: Map<number, Array<{ x: number; y: number; w: number; h: number }>>;
}





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
//   - content change / pan past the padding / rotation: full re-render
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

type DrawStaticFn = (tctx: CanvasRenderingContext2D, ox: number, oy: number, w: number, h: number) => void;

const staticLayerCaches = new WeakMap<HTMLCanvasElement, StaticLayerCacheEntry>();
const staticSettleCallbacks = new WeakMap<HTMLCanvasElement, () => void>();
/** Extra rendered area on each side, as a fraction of the viewport. */
const STATIC_PAD_RATIO = 0.5;
/** Crisp re-render fires this long after the last zoom change. */
const ZOOM_SETTLE_MS = 150;

/** Registered by the hook so the cache can request a follow-up render after a zoom settles. */
function setStaticSettleCallback(canvas: HTMLCanvasElement, cb: () => void): void {
  staticSettleCallbacks.set(canvas, cb);
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
  imageVersion: number
): void {
  let entry = staticLayerCaches.get(canvas);

  let scale = 1;
  let tx = 0;
  let ty = 0;
  let usable = false;
  if (entry && staticKeysEqual(entry.key, key)) {
    scale = zoom / entry.zoom;
    tx = offsetX - entry.vOx * scale;
    ty = offsetY - entry.vOy * scale;
    // Viewport corners in offscreen pixel space must fall inside the snapshot.
    const pMinX = (0 - tx) / scale;
    const pMaxX = (width - tx) / scale;
    const pMinY = (0 - ty) / scale;
    const pMaxY = (height - ty) / scale;
    usable = pMinX >= 0 && pMinY >= 0 && pMaxX <= entry.off.width && pMaxY <= entry.off.height;
  }

  if (!usable) {
    const padX = Math.ceil(width * STATIC_PAD_RATIO);
    const padY = Math.ceil(height * STATIC_PAD_RATIO);
    const off = entry?.off ?? activeWindow.createEl('canvas');
    const ow = width + padX * 2;
    const oh = height + padY * 2;
    if (off.width !== ow) off.width = ow;
    if (off.height !== oh) off.height = oh;
    const octx = off.getContext('2d');
    if (!octx) {
      // Offscreen unavailable: draw directly (previous behavior).
      draw(ctx, offsetX, offsetY, width, height);
      return;
    }
    if (entry?.settleTimer != null) window.clearTimeout(entry.settleTimer);
    octx.save();
    octx.clearRect(0, 0, ow, oh);
    draw(octx, offsetX + padX, offsetY + padY, ow, oh);
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
  // Pixel-exact at scale 1; smooth when scale-blitting mid-zoom.
  ctx.imageSmoothingEnabled = scale !== 1;
  ctx.drawImage(entry.off, tx, ty, entry.off.width * scale, entry.off.height * scale);
  ctx.restore();
}

/**
 * Get appropriate renderer for geometry type.
 * Uses geometry.type discriminator instead of instanceof.
 */
function getRenderer(geometry: IGeometry): Renderer {
  // Safe polymorphic cast: runtime geometry always satisfies the renderer's narrower param types
  return geometry.type === 'hex' ? hexRenderer : gridRenderer;
}

/** Options for rendering layer content */
interface RenderLayerContentOptions {
  opacity?: number;
  showGrid?: boolean;
  mergeIndex?: CurveCellMergeIndex | null;
  /** Map rotation in degrees; non-zero widens cull bounds to the rotated viewport. */
  northDirection?: number;
}

/**
 * Build a predicate that tests whether a cell lands inside the visible canvas.
 *
 * Without this, the painted-cell passes (fills, borders, interior lines, edges)
 * iterate every cell on the map, so per-frame fillRect volume scales with total
 * painted area instead of the viewport — the dominant render cost during pan,
 * and fatal on high-DPR mobile GPUs.
 *
 * Cells are drawn under the canvas rotation transform but gridToScreen returns
 * pre-rotation coordinates, so when rotated the bounds widen to the square
 * circumscribing the viewport. The 2-cell margin keeps interior-grid-line
 * neighbors (1 cell away) inside the culled set.
 */
function makeCellVisibilityFilter(
  geometry: IGeometry,
  viewState: RendererViewState,
  canvasWidth: number,
  canvasHeight: number,
  northDirection: number
): (cx: number, cy: number) => boolean {
  const margin = geometry.getScaledCellSize(viewState.zoom) * 2;
  let minX = -margin;
  let minY = -margin;
  let maxX = canvasWidth + margin;
  let maxY = canvasHeight + margin;
  if (northDirection % 360 !== 0) {
    const halfDiag = Math.sqrt(canvasWidth * canvasWidth + canvasHeight * canvasHeight) / 2;
    minX = canvasWidth / 2 - halfDiag - margin;
    maxX = canvasWidth / 2 + halfDiag + margin;
    minY = canvasHeight / 2 - halfDiag - margin;
    maxY = canvasHeight / 2 + halfDiag + margin;
  }
  return (cx, cy) => {
    const { screenX, screenY } = geometry.gridToScreen(cx, cy, viewState.x, viewState.y, viewState.zoom);
    return screenX >= minX && screenX <= maxX && screenY >= minY && screenY <= maxY;
  };
}

/**
 * Render a layer's cells, borders, and edges (but not objects or text labels).
 * Used for both active layer rendering and ghost layer transparency.
 */
function renderLayerCellsAndEdges(
  ctx: CanvasRenderingContext2D,
  layer: MapLayer,
  geometry: IGeometry,
  viewState: RendererViewState,
  theme: RendererTheme,
  renderer: Renderer,
  options: RenderLayerContentOptions = {}
): void {
  const { opacity = 1, showGrid: showInteriorGrid = true, mergeIndex = null, northDirection = 0 } = options;

  const isCellVisible = makeCellVisibilityFilter(
    geometry, viewState, ctx.canvas.width, ctx.canvas.height, northDirection
  );

  // Apply opacity if needed
  const previousAlpha = ctx.globalAlpha;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  // Draw filled cells (culled to the visible viewport)
  if (layer.cells.length > 0) {
    const visibleCells = layer.cells.filter(cell =>
      isGridCell(cell) ? isCellVisible(cell.x, cell.y) : isCellVisible(cell.q, cell.r)
    );

    const cellsWithColor = visibleCells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));

    const { simpleCells, segmentCells } = segmentRenderer.separateCellsByType(cellsWithColor);

    if (simpleCells.length > 0) {
      renderer.renderPaintedCells(ctx, simpleCells, geometry, viewState);
    }

    if (segmentCells.length > 0 && renderer.supportsSegments) {
      segmentRenderer.renderSegmentCells(ctx, segmentCells, geometry, viewState);
    }

    if (showInteriorGrid && renderer.renderInteriorGridLines && cellsWithColor.length > 0) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, viewState, {
        lineColor: theme.grid.lines,
        lineWidth: theme.grid.lineWidth ?? 1,
        interiorRatio: 0.5
      });
    }

    // Border calculation must see ALL cells, not just visible ones — a culled
    // off-screen neighbor would otherwise give a visible boundary cell a
    // phantom border.
    const allCellsLookup = buildCellLookup(layer.cells);

    // Wrap border calculator to suppress borders adjacent to same-color curves
    const bordersCalculator = mergeIndex
      ? (lookup: Set<string>, x: number, y: number) => {
          const base = calculateBordersOptimized(lookup, x, y);
          const suppressed = mergeIndex.cellBordersToSuppress.get(`${x},${y}`);
          if (!suppressed) return base;
          return base.filter((side: string) => !suppressed.has(side));
        }
      : calculateBordersOptimized;

    if (simpleCells.length > 0) {
      renderer.renderCellBorders(
        ctx,
        simpleCells,
        geometry,
        viewState,
        () => allCellsLookup,
        bordersCalculator,
        {
          border: theme.cells.border,
          borderWidth: theme.cells.borderWidth
        }
      );
    }

    if (segmentCells.length > 0 && renderer.supportsSegments) {
      segmentRenderer.renderSegmentBorders(
        ctx,
        segmentCells,
        cellsWithColor,
        geometry,
        viewState,
        {
          border: theme.cells.border,
          borderWidth: theme.cells.borderWidth
        }
      );
    }
  }

  // Draw painted edges (grid maps only, culled to the visible viewport)
  if (layer.edges.length > 0 && renderer.supportsSegments && renderer.renderEdges) {
    const visibleEdges = layer.edges.filter(edge =>
      edge != null && typeof edge.x === 'number' && typeof edge.y === 'number' && isCellVisible(edge.x, edge.y)
    );
    if (visibleEdges.length > 0) {
      renderer.renderEdges(ctx, visibleEdges, geometry, viewState, {
        lineWidth: 1,
        borderWidth: theme.cells.borderWidth
      });
    }
  }

  // Restore opacity
  if (opacity < 1) {
    ctx.globalAlpha = previousAlpha;
  }
}

const renderCanvas: RenderCanvas = (canvas, fogCanvas, mapData, geometry, selectedItems = [], options = {}) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, adjacentSubHexes = null, hiddenTileLayers = undefined, draggingWallId = null } = options;
  if (canvas == null) return;

  // Normalize selectedItems to array (backward compatibility)
  const itemsArray: RendererSelectedItem[] = Array.isArray(selectedItems) ? selectedItems : (selectedItems != null ? [selectedItems] : []);

  // Default layer visibility
  const visibility: LayerVisibility = layerVisibility ?? { grid: true, objects: true, textLabels: true, hexCoordinates: true, regions: true, outlines: true };

  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme ?? getTheme();

  // Extract active layer data (supports layer schema v2). activeLayer is the EDIT
  // target (objects/text/fog/selection stay on it); renderLayers is the set of
  // layers whose cells/curves/tiles get COMPOSITED (strata maps = the active
  // board's visible layers; all other maps = just the active layer).
  const activeLayer = getActiveLayer(mapData);
  const renderLayers = getRenderLayers(mapData);
  const isStrata = mapData.layerMode === 'strata';

  // Board-below ghost: when the ACTIVE board opts in, render the floor beneath it
  // at reduced opacity for alignment. Works in both simple and strata modes; only
  // active when the map has a board below the active one (getBoardBelow != null).
  const activeBoard = mapData.boards?.find(b => b.id === getActiveBoardId(mapData)) ?? null;
  const boardBelow = activeBoard?.showBoardBelow === true ? getBoardBelow(mapData, activeBoard.id) : null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const { viewState, northDirection } = mapData;
  if (!viewState) return;
  const { zoom, center } = viewState;

  // Clear canvas
  ctx.fillStyle = THEME.grid.background;
  ctx.fillRect(0, 0, width, height);

  // Save context and apply rotation
  ctx.save();

  // Translate to center, rotate, translate back
  ctx.translate(width / 2, height / 2);
  ctx.rotate(((northDirection ?? 0) * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);

  // Get appropriate renderer for this geometry
  const renderer = getRenderer(geometry);

  // Calculate viewport using shared utility
  const scaledSize = renderer.getScaledSize(geometry, zoom);
  const { offsetX, offsetY } = calculateViewportOffset(
    geometry,
    center,
    { width, height },
    zoom
  );

  // ---- Static content (everything that only depends on map data + viewport
  // transform). The parameters deliberately SHADOW the outer ctx/offsetX/
  // offsetY/width/height so the pass bodies below run unchanged whether they
  // target the live canvas (rotated maps) or the offscreen cache. ----
  const drawStaticContent: DrawStaticFn = (ctx, offsetX, offsetY, width, height): void => {

  // Draw background image (both grid and hex maps)
  const bgImage = mapData.backgroundImage?.path != null && mapData.backgroundImage.path !== '' ? getCachedImage(mapData.backgroundImage.path) : null;
  const isHexMapForBg = geometry.type === 'hex';
  const boundsOrDimensions = isHexMapForBg
    ? mapData.hexBounds
    : mapData.dimensions ?? { width: 300, height: 300 };
  renderer.renderBackgroundImage(
    ctx,
    geometry,
    bgImage,
    mapData.backgroundImage as { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number } | undefined,
    boundsOrDimensions,
    mapData.orientation ?? 'flat',
    offsetX,
    offsetY,
    zoom,
    renderGridBackgroundImage
  );

  // Create renderer viewState object
  const rendererViewState: RendererViewState = {
    x: offsetX,
    y: offsetY,
    zoom: zoom
  };

  // Tile rendering geometry shim (works for both hex and grid)
  const tileGeomShim = geometry.type === 'hex'
    ? { hexToWorld: geometry.hexToWorld.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: geometry.hexSize, orientation: mapData.orientation ?? 'flat' }
    : { hexToWorld: geometry.getCellCenter.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: geometry.cellSize, orientation: 'grid' };

  // iOS defensive: Reset canvas state
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Reset clipping region
  ctx.save();
  ctx.beginPath();
  const largeClip = Math.max(width, height) * 4;
  ctx.rect(-largeClip, -largeClip, largeClip * 2, largeClip * 2);
  ctx.clip();
  ctx.restore();

  // Draw grid lines
  renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, visibility.grid !== false, {
    lineColor: THEME.grid.lines,
    lineWidth: THEME.grid.lineWidth ?? 1,
    rotated: (northDirection ?? 0) % 360 !== 0
  });

  // Draw board-below ghost (floor beneath the active board) if enabled. Works in
  // both simple and strata modes: renders every visible layer of the board below,
  // in ascending order, at the board's ghost opacity — for cross-floor alignment.
  if (boardBelow != null && activeBoard != null) {
    const ghostOpacity = activeBoard.boardBelowOpacity ?? 0.25;
    const belowLayers = getBoardLayers(mapData, boardBelow.id).filter(l => l.visible !== false);
    for (const belowLayer of belowLayers) {
      renderLayerCellsAndEdges(ctx, belowLayer, geometry, rendererViewState, THEME, renderer, {
        opacity: ghostOpacity,
        showGrid: visibility.grid !== false,
        northDirection: northDirection ?? 0
      });
      const hasTiles = belowLayer.tiles != null && belowLayer.tiles.length > 0;
      const hasStrokes = belowLayer.terrainStrokes != null && belowLayer.terrainStrokes.length > 0;
      if ((hasTiles || hasStrokes) && mapData.tilesets != null && mapData.tilesets.length > 0) {
        renderTiles(
          ctx,
          belowLayer.tiles ?? [],
          mapData.tilesets,
          tileGeomShim,
          rendererViewState,
          { opacity: ghostOpacity, getCachedImage, canvasWidth: width, canvasHeight: height, terrainStrokes: belowLayer.terrainStrokes }
        );
      }
      if (belowLayer.curves.length > 0) {
        const ghostGridConfig = geometry.type === 'grid'
          ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: 0.5 }
          : undefined;
        renderCurves(ctx, belowLayer.curves, rendererViewState, THEME, { opacity: ghostOpacity, gridConfig: ghostGridConfig });
      }
      if (belowLayer.wallPaths != null && belowLayer.wallPaths.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
        const wallCellSize = geometry.type === 'grid' ? geometry.cellSize : geometry.hexSize;
        renderWallPaths(ctx, belowLayer.wallPaths, mapData.tilesets, rendererViewState, wallCellSize, {
          opacity: ghostOpacity,
          getCachedImage
        });
      }
    }
  }

  // Draw ghost layer (layer below) if enabled. Disabled in strata mode: the
  // composite already draws the layer below at full opacity, so a ghost would
  // double-draw it.
  if (!isStrata && activeLayer.showLayerBelow === true) {
    const layerBelow = getLayerBelow(mapData, activeLayer.id);
    if (layerBelow) {
      const ghostOpacity = activeLayer.layerBelowOpacity ?? 0.25;
      renderLayerCellsAndEdges(ctx, layerBelow, geometry, rendererViewState, THEME, renderer, {
        opacity: ghostOpacity,
        showGrid: visibility.grid !== false,
        northDirection: northDirection ?? 0
      });
      // Ghost layer tiles (+ terrain brush strokes)
      const ghostHasTiles = layerBelow.tiles != null && layerBelow.tiles.length > 0;
      const ghostHasStrokes = layerBelow.terrainStrokes != null && layerBelow.terrainStrokes.length > 0;
      if ((ghostHasTiles || ghostHasStrokes) && mapData.tilesets != null && mapData.tilesets.length > 0) {
        renderTiles(
          ctx,
          layerBelow.tiles ?? [],
          mapData.tilesets,
          tileGeomShim,
          rendererViewState,
          { opacity: ghostOpacity, getCachedImage, canvasWidth: width, canvasHeight: height, terrainStrokes: layerBelow.terrainStrokes }
        );
      }
      // Ghost layer curves
      if (layerBelow.curves.length > 0) {
        const ghostGridConfig = geometry.type === 'grid'
          ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: 0.5 }
          : undefined;
        renderCurves(ctx, layerBelow.curves, rendererViewState, THEME, { opacity: ghostOpacity, gridConfig: ghostGridConfig });
      }
      // Ghost layer wall paths
      if (layerBelow.wallPaths != null && layerBelow.wallPaths.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
        const wallCellSize = geometry.type === 'grid' ? geometry.cellSize : geometry.hexSize;
        renderWallPaths(ctx, layerBelow.wallPaths, mapData.tilesets, rendererViewState, wallCellSize, {
          opacity: ghostOpacity,
          getCachedImage
        });
      }
    }
  }

  // Draw adjacent sub-hex ghost previews (when drilled into a sub-hex)
  const MAX_ADJACENT_COMPLEXITY = 500;
  if (adjacentSubHexes != null && adjacentSubHexes.length > 0 && geometry.type === 'hex') {
    const hexToWorldFn = geometry.hexToWorld;
    const hexSizeVal = geometry.hexSize;
    const maxRing = mapData.hexBounds?.maxRing ?? 7;

    // Compute world-space offset for each axial direction.
    // Two adjacent sub-hex grids tile when their centers are (2*maxRing+1) hex-steps apart.
    const tileStep = 2 * maxRing + 1;

    ctx.save();

    // Pre-build tile geometry wrapper once (shared across all adjacents)
    const adjTileGeom = mapData.tilesets != null && mapData.tilesets.length > 0
      ? { hexToWorld: hexToWorldFn.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: hexSizeVal, orientation: mapData.orientation ?? 'flat' }
      : null;

    for (const adj of adjacentSubHexes) {
      const scaledQ = adj.dq * tileStep;
      const scaledR = adj.dr * tileStep;
      const worldOffset = hexToWorldFn.call(geometry, scaledQ, scaledR);

      // Create shifted view state: offset the canvas origin by the world-space delta
      const shiftedOffsetX = offsetX + worldOffset.worldX * zoom;
      const shiftedOffsetY = offsetY + worldOffset.worldY * zoom;
      const shiftedViewState: RendererViewState = { x: shiftedOffsetX, y: shiftedOffsetY, zoom };

      const adjLayers = adj.mapData.layers ?? [];

      // Skip detailed rendering for dense neighbors to cap render cost
      const totalItems = adjLayers.reduce((sum: number, l: MapLayer) =>
        sum + (l.cells?.length ?? 0) + (l.tiles?.length ?? 0), 0);
      const isDense = totalItems > MAX_ADJACENT_COMPLEXITY;

      // Render cells, edges, and tiles only for non-dense neighbors
      if (!isDense) {
        for (const layer of adjLayers) {
          if (layer.cells.length > 0) {
            renderLayerCellsAndEdges(ctx, layer, geometry, shiftedViewState, THEME, renderer, {
              opacity: 0.25,
              showGrid: false,
              northDirection: northDirection ?? 0
            });
          }
        }

        if (adjTileGeom != null && mapData.tilesets != null) {
          for (const layer of adjLayers) {
            if (layer.tiles != null && layer.tiles.length > 0) {
              renderTiles(
                ctx,
                layer.tiles,
                mapData.tilesets,
                adjTileGeom,
                shiftedViewState,
                { opacity: 0.25, getCachedImage, canvasWidth: width, canvasHeight: height }
              );
            }
          }
        }
      }

      // Render adjacent name label near edge of current grid (not center of adjacent)
      ctx.save();
      ctx.globalAlpha = 0.5;
      const edgeQ = adj.dq * (maxRing + 2);
      const edgeR = adj.dr * (maxRing + 2);
      const edgeWorld = hexToWorldFn.call(geometry, edgeQ, edgeR);
      const labelScreen = geometry.worldToScreen(edgeWorld.worldX, edgeWorld.worldY, offsetX, offsetY, zoom);
      const labelFontSize = Math.max(10, 12 * zoom);
      ctx.font = `bold ${labelFontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const labelMetrics = ctx.measureText(adj.name);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
      ctx.fillRect(
        labelScreen.screenX - labelMetrics.width / 2 - 4,
        labelScreen.screenY - labelFontSize / 2 - 2,
        labelMetrics.width + 8,
        labelFontSize + 4
      );
      ctx.fillStyle = '#ffffff';
      ctx.fillText(adj.name, labelScreen.screenX, labelScreen.screenY);
      ctx.restore();
    }

    ctx.restore();
  }

  // Composite each render layer's cells/edges, curves and tiles in draw order.
  // Simple maps loop exactly once over the active layer (identical to before);
  // strata maps stack the active board's visible layers. Objects/text/fog/region
  // stay active-layer-only (rendered after this loop) so the interaction surface
  // and the single-activeLayer fog passes remain correct.
  const curveGridConfig = geometry.type === 'grid'
    ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: 0.5 }
    : undefined;
  for (const drawLayer of renderLayers) {
    // Build curve-cell merge index for this layer (grid maps only)
    let mergeIndex: CurveCellMergeIndex | null = null;
    if (geometry.type === 'grid' &&
        drawLayer.cells.length > 0 &&
        drawLayer.curves.length > 0) {
      const cellsForMerge = drawLayer.cells.filter(isGridCell).map(cell => ({
        x: cell.x, y: cell.y, color: getCellColor(cell)
      }));
      mergeIndex = buildMergeIndex(cellsForMerge, drawLayer.curves, geometry.cellSize);
    }

    // Cells and edges
    renderLayerCellsAndEdges(ctx, drawLayer, geometry, rendererViewState, THEME, renderer, {
      showGrid: visibility.grid !== false,
      mergeIndex,
      northDirection: northDirection ?? 0
    });

    // Freehand curves (between cells and tiles)
    if (drawLayer.curves.length > 0) {
      renderCurves(ctx, drawLayer.curves, rendererViewState, THEME, {
        mergeIndex,
        gridConfig: curveGridConfig
      });
    }

    // Wall paths (between curves and tiles). A wall under active edit-drag is
    // excluded here and drawn live on the overlay instead.
    if (drawLayer.wallPaths != null && drawLayer.wallPaths.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
      const wallsToRender = draggingWallId != null
        ? drawLayer.wallPaths.filter(w => w.id !== draggingWallId)
        : drawLayer.wallPaths;
      if (wallsToRender.length > 0) {
        const wallCellSize = geometry.type === 'grid' ? geometry.cellSize : geometry.hexSize;
        renderWallPaths(ctx, wallsToRender, mapData.tilesets, rendererViewState, wallCellSize, {
          getCachedImage
        });
      }
    }

    // Tiles + terrain brush strokes (between curves and regions, z-sorted for
    // overflow occlusion). A layer holding only strokes must still render.
    const hasTiles = drawLayer.tiles != null && drawLayer.tiles.length > 0;
    const hasStrokes = drawLayer.terrainStrokes != null && drawLayer.terrainStrokes.length > 0;
    if ((hasTiles || hasStrokes) && mapData.tilesets != null && mapData.tilesets.length > 0) {
      renderTiles(
        ctx,
        drawLayer.tiles ?? [],
        mapData.tilesets,
        tileGeomShim,
        rendererViewState,
        { getCachedImage, canvasWidth: width, canvasHeight: height, hiddenLayers: hiddenTileLayers, terrainStrokes: drawLayer.terrainStrokes }
      );
    }
  }

  // Draw regions (hex maps only, between curves and objects)
  if (geometry.type === 'hex' && mapData.regions != null && mapData.regions.length > 0 && visibility.regions !== false) {
    const regionFow = activeLayer.fogOfWar;
    let foggedAxialSet: Set<string> | undefined;
    if (regionFow?.enabled === true && regionFow?.foggedCells != null && regionFow.foggedCells.length > 0) {
      foggedAxialSet = new Set<string>();
      for (const fc of regionFow.foggedCells) {
        const { q, r } = offsetToAxial(fc.col, fc.row, mapData.orientation ?? 'flat');
        foggedAxialSet.add(`${q},${r}`);
      }
    }
    renderRegions(ctx, mapData.regions, geometry, { x: offsetX, y: offsetY, zoom }, { foggedCells: foggedAxialSet });
  }

  // Draw outlines (hex maps only, after regions)
  if (geometry.type === 'hex' && mapData.outlines != null && mapData.outlines.length > 0 && visibility.outlines !== false) {
    renderOutlines(ctx, mapData.outlines, geometry, { x: offsetX, y: offsetY, zoom }, mapData.hexBounds ?? {}, mapData.orientation ?? 'flat');
  }

  // Draw player light radii (before shapes and objects)
  if (activeLayer.objects.length > 0) {
    const playerObjects = activeLayer.objects.filter((o: MapObject) => o.isPlayer === true && o.lightEnabled === true);
    if (playerObjects.length > 0) {
      const settings = mapData.settings?.overrides ?? {};
      const distancePerCell = (settings.distancePerCell as number) ?? 5;
      renderPlayerLights(ctx, playerObjects, geometry, { x: offsetX, y: offsetY, zoom }, distancePerCell);
    }
  }

  // Draw shape overlays (both grid and hex maps, after outlines)
  if (mapData.shapeOverlays && mapData.shapeOverlays.length > 0) {
    renderShapeOverlays(ctx, mapData.shapeOverlays, { x: offsetX, y: offsetY, zoom });
  }

  // Draw sub-hex indicators (small diamond on hexes that have sub-hex data)
  if (geometry.type === 'hex' && mapData.subHexMaps != null) {
    ctx.save();
    for (const [hexKey, subHex] of Object.entries(mapData.subHexMaps)) {
      // Only show indicator if the sub-hex has actual content
      const sd = subHex.mapData;
      if (sd?.layers == null) continue;
      const hasContent = sd.layers.some((l: MapLayer) =>
        l.cells.length > 0 ||
        l.curves.length > 0 ||
        l.objects.length > 0 ||
        l.textLabels.length > 0 ||
        (l.tiles != null && l.tiles.length > 0)
      );
      if (!hasContent) continue;

      const [qStr, rStr] = hexKey.split(',');
      const q = parseInt(qStr, 10);
      const r = parseInt(rStr, 10);
      const world = geometry.hexToWorld(q, r);
      const screen = geometry.worldToScreen(world.worldX, world.worldY, offsetX, offsetY, zoom);
      const size = Math.max(4, geometry.hexSize * zoom * 0.12);

      // Small diamond indicator at hex center
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(screen.screenX, screen.screenY - size);
      ctx.lineTo(screen.screenX + size, screen.screenY);
      ctx.lineTo(screen.screenX, screen.screenY + size);
      ctx.lineTo(screen.screenX - size, screen.screenY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  // Draw objects
  if (activeLayer.objects.length > 0 && !showCoordinates && visibility.objects) {
    const isHexMap = geometry.type === 'hex';
    const mapType = mapData.mapType ?? 'grid';
    const getObjectTypeForMap = (typeId: string): ReturnType<typeof getObjectType> => getObjectType(typeId, mapType, mapData.objectSetId);
    renderObjects(
      activeLayer,
      { ctx, offsetX, offsetY, zoom, scaledSize },
      geometry,
      isHexMap,
      mapData.orientation ?? 'flat',
      {
        getObjectType: getObjectTypeForMap,
        getRenderChar,
        isCellFogged,
        getObjectsInCell,
        getSlotOffset,
        getMultiObjectScale,
        renderNoteLinkBadge,
        renderTooltipIndicator,
        renderObjectLinkIndicator,
        getCachedImage,
      }
    );
  }

  // Draw text labels
  if (activeLayer.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    renderTextLabels(
      activeLayer.textLabels,
      { ctx, zoom, getFontCss },
      geometry,
      { offsetX, offsetY, zoom }
    );
  }

  };
  // ---- end static content ----

  // Identity key for the static snapshot. Big structures compare by reference
  // (immutable updates replace them on content change); small config objects
  // compare by value because getTheme() builds a fresh object per call.
  // NOTE: tileImagesReady is deliberately NOT in the key — it oscillates
  // per render while images settle. Async image loads are handled as a SOFT
  // invalidation instead: getImageCacheVersion() is passed separately and a
  // version change keeps blitting the stale snapshot while one debounced
  // rebuild is scheduled (a hard key entry caused a full ~repaint per image).
  const staticKey: readonly unknown[] = [
    mapData.layers, mapData.tilesets, mapData.regions, mapData.outlines,
    mapData.shapeOverlays, mapData.subHexMaps, mapData.backgroundImage,
    mapData.dimensions, mapData.hexBounds, mapData.orientation,
    mapData.objectSetId, mapData.settings, mapData.activeLayerId, activeLayer,
    mapData.activeBoardId, mapData.layerMode, mapData.boards,
    geometry, hiddenTileLayers, adjacentSubHexes, showCoordinates,
    width, height, draggingWallId,
    JSON.stringify(THEME), JSON.stringify(visibility),
  ];

  if (((northDirection ?? 0) % 360) !== 0) {
    // Rotated maps draw under a canvas rotation transform whose interaction
    // with the cached snapshot isn't worth the complexity — draw directly.
    drawStaticContent(ctx, offsetX, offsetY, width, height);
  } else {
    blitStaticContent(canvas, ctx, drawStaticContent, offsetX, offsetY, zoom, width, height, staticKey, getImageCacheVersion());
  }

  // =========================================================================
  // FOG OF WAR RENDERING
  // =========================================================================

  const fow = activeLayer.fogOfWar;
  const effectiveSettings = getEffectiveSettings(mapData.settings);
  const fowBlurEnabled = effectiveSettings.fogOfWarBlurEnabled ?? false;

  // Clear fog canvas if fog not needed
  if (fow?.enabled !== true || fow?.foggedCells == null || fow.foggedCells.length === 0 || !fowBlurEnabled) {
    clearFogCanvas(fogCanvas);
  }

  if (fow != null && fow.enabled === true && fow.foggedCells != null && fow.foggedCells.length > 0) {
    const fogSettings = getFogSettings(effectiveSettings);
    const isHexMap = geometry.type === 'hex';
    const hexGeom = geometry.type === 'hex' ? geometry : null;
    const gridGeom = geometry.type === 'grid' ? geometry : null;

    renderFog(
      fow,
      { ctx, fogCanvas, width, height, offsetX, offsetY, zoom, scaledSize, northDirection: northDirection ?? 0 },
      fogSettings,
      { hexBounds: mapData.hexBounds, dimensions: mapData.dimensions },
      isHexMap,
      hexGeom,
      gridGeom,
      geometry,
      mapData.orientation ?? 'flat',
      getCachedImage,
      renderGridFog,
      renderHexFog,
      offsetToAxial,
      axialToOffset
    );
  }

  // Draw selection indicators
  const isHexMapForSelection = geometry.type === 'hex';
  const hexGeomForSelection = geometry.type === 'hex' ? geometry : null;
  renderSelections(
    itemsArray,
    activeLayer.textLabels,
    activeLayer.objects,
    { ctx, offsetX, offsetY, zoom, scaledSize },
    geometry,
    hexGeomForSelection,
    isHexMapForSelection,
    isResizeMode,
    mapData.orientation ?? 'flat',
    showCoordinates,
    visibility,
    {
      getFontCss,
      getObjectsInCell,
      getSlotOffset,
      getMultiObjectScale,
    }
  );

  // Restore context
  ctx.restore();
};

const useCanvasRenderer: UseCanvasRenderer = (canvasRef, fogCanvasRef, mapData, geometry, selectedItems = [], options = {}) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, tileImagesReady = false, adjacentSubHexes = null, hiddenTileLayers = undefined, draggingWallId = null } = options;
  // Coalesce renders to at most one per animation frame. Pan/zoom writes viewState
  // (stored on mapData) on EVERY pointermove/touchmove; on a 120Hz touch device that
  // fires far faster than the display refreshes, so rendering synchronously per update
  // repainted the whole canvas 100-280x/sec and flooded the main thread. We stash the
  // latest render inputs in a ref and schedule a single rAF — rapid updates collapse
  // into one draw per frame, and the queued frame always reads the most recent inputs.
  const rafIdRef = useRef<number | null>(null);
  const renderInputsRef = useRef<{
    mapData: typeof mapData;
    geometry: typeof geometry;
    selectedItems: typeof selectedItems;
    isResizeMode: boolean;
    theme: typeof theme;
    showCoordinates: boolean;
    layerVisibility: typeof layerVisibility;
    adjacentSubHexes: typeof adjacentSubHexes;
    hiddenTileLayers: typeof hiddenTileLayers;
    tileImagesReady: boolean;
    draggingWallId: typeof draggingWallId;
  } | null>(null);

  useEffect(() => {
    renderInputsRef.current = { mapData, geometry, selectedItems, isResizeMode, theme, showCoordinates, layerVisibility, adjacentSubHexes, hiddenTileLayers, tileImagesReady, draggingWallId };
    const scheduleRender = (): void => {
      // A frame is already queued — it will pick up the latest inputs from the ref.
      if (rafIdRef.current != null) return;
      rafIdRef.current = window.requestAnimationFrame(() => {
        rafIdRef.current = null;
        const a = renderInputsRef.current;
        if (a && a.mapData && a.geometry && canvasRef.current) {
          const fogCanvas = fogCanvasRef?.current ?? null;
          renderCanvas(canvasRef.current, fogCanvas, a.mapData, a.geometry, a.selectedItems, { isResizeMode: a.isResizeMode, theme: a.theme, showCoordinates: a.showCoordinates, layerVisibility: a.layerVisibility, adjacentSubHexes: a.adjacentSubHexes, hiddenTileLayers: a.hiddenTileLayers, tileImagesReady: a.tileImagesReady, draggingWallId: a.draggingWallId });
        }
      });
    };
    // The static-layer cache requests a follow-up render to redraw crisp after
    // a zoom gesture settles.
    if (canvasRef.current) setStaticSettleCallback(canvasRef.current, scheduleRender);
    scheduleRender();
  }, [mapData, geometry, selectedItems, isResizeMode, theme, canvasRef, fogCanvasRef, showCoordinates, layerVisibility, tileImagesReady, adjacentSubHexes, hiddenTileLayers, draggingWallId]);

  // Cancel any frame still pending when the component unmounts.
  useEffect(() => () => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);
};

export { useCanvasRenderer, renderCanvas };