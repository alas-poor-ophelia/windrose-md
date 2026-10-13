/**
 * mapRenderer.ts
 *
 * The whole-map canvas render (renderCanvas): background fill, sub-hex
 * backdrop, north rotation, static content through the static-layer cache,
 * then fog of war and selection indicators on top. Pure (no React); moved
 * from useCanvasRenderer.ts in wave 8 (STRUCT-A-29). The hook owns the rAF
 * scheduling and the cache lifecycle; image export and the hover preview
 * call renderCanvas directly.
 */

import type {
  RenderCanvas,
  RendererSelectedItem,
  LayerVisibility,
} from '#types/hooks/canvasRenderer.types';

import { getTheme, getEffectiveSettings, resolveShowParentBackdrop } from '../../core/settingsAccessor';
import { recordPaintedView } from '../../core/paintedViewStore';
import { traceZoom } from '../../utils/zoomTraceProbe';
import { renderGridFog } from '../fog/gridFogRenderer';
import { renderHexFog } from '../fog/hexFogRenderer';
import { getFogSettings, clearFogCanvas, renderFog } from '../fog/fogRenderer';
import { renderSelections } from './selectionRenderer';
import { getFontCss } from '../../text/fontOptions';
import { calculateViewportOffset, applyNorthRotation } from '../core/viewportMath';
import { renderSubHexBackdrop } from './subHexBackdropRenderer';
import { getCachedImage, getImageCacheVersion } from '../../assets/imageOperations';
import { getTileMetadataRenderVersion } from '../../persistence/tileMetadata';
import { getSlotOffset, getMultiObjectScale, getObjectsInCell } from '../../objects/hexSlotPositioner';
import { offsetToAxial, axialToOffset } from '../core/offsetCoordinates';
import { getActiveLayer, getRenderLayers, getExportLayers, getActiveBoardId, getBoardBelow } from '../../persistence/layerAccessor';
import { getRenderer } from './layerCellsRenderer';
import { blitStaticContent } from './staticLayerCache';
import type { DrawStaticFn } from './staticLayerCache';
import { drawStaticScene, makeRenderFrame } from './staticPasses';
import type { StaticScene } from './staticPasses';

const renderCanvas: RenderCanvas = (canvas, fogCanvas, mapData, geometry, selectedItems = [], options = {}) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, adjacentSubHexes = null, adjacentEmptySlots = null, hiddenTileLayers = undefined, draggingWallId = null, subHexPath = null, liveViewState = null, exportLayers = null } = options;
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
  // Image export overrides the live stack with an explicit layer selection and
  // per-layer opacity; everything else composites the live stack at full opacity.
  const renderLayers = exportLayers != null ? getExportLayers(mapData, exportLayers) : getRenderLayers(mapData);
  const exportOpacityById = exportLayers != null
    ? new Map(exportLayers.map(sel => [sel.id, sel.opacity]))
    : null;
  const isStrata = mapData.layerMode === 'strata';

  // Board-below ghost: when the ACTIVE board opts in, render the floor beneath it
  // at reduced opacity for alignment. Works in both simple and strata modes; only
  // active when the map has a board below the active one (getBoardBelow != null).
  const activeBoard = mapData.boards?.find(b => b.id === getActiveBoardId(mapData)) ?? null;
  const boardBelow = activeBoard?.showBoardBelow === true ? getBoardBelow(mapData, activeBoard.id) : null;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const { northDirection } = mapData;
  // During a gesture the ViewController supplies the live viewState so the canvas
  // transform tracks pan/zoom without setMapData reconciling the tree; otherwise
  // fall back to the committed mapData.viewState.
  const viewState = liveViewState ?? mapData.viewState;
  if (!viewState) return;
  const { zoom, center } = viewState;

  traceZoom('paint', {
    zoom,
    live: liveViewState != null,
    map: mapData.name ?? '(unnamed)',
    path: subHexPath,
    ring: mapData.hexBounds?.maxRing ?? null
  });
  // Label the canvas with the view this frame paints — snapshot consumers
  // (sub-hex backdrop capture) must know what the pixels actually depict.
  recordPaintedView(canvas, viewState);

  // Clear canvas
  ctx.fillStyle = THEME.grid.background;
  ctx.fillRect(0, 0, width, height);

  // Sub-hex backdrop: a still of the parent map, captured at dive time, so a
  // sub-map doesn't float in an empty void. Drawn straight after the background
  // fill — every layer below composites over it — and skipped entirely at root
  // or when no snapshot matches this canvas and drill path. Per-map setting
  // overrides the global toggle; capture itself is never gated so toggling
  // back on mid-session has a snapshot ready immediately.
  const showBackdrop = resolveShowParentBackdrop(mapData.settings);
  if (showBackdrop) {
    renderSubHexBackdrop(ctx, canvas, viewState, subHexPath, northDirection ?? 0);
  }

  // Save context and apply rotation
  ctx.save();

  // Rotate about the canvas centre (shared viewport math).
  applyNorthRotation(ctx, width, height, northDirection ?? 0);

  // Get appropriate renderer for this geometry
  const renderer = getRenderer(geometry);

  // Calculate viewport using shared utility
  const scaledSize = renderer.getScaledSize(geometry, zoom);
  const { offsetX, offsetY } = calculateViewportOffset(geometry, center, { width, height }, zoom);

  // ---- Static content (everything that only depends on map data + viewport
  // transform). Drawn as named passes over a RenderFrame that targets either
  // the offscreen cache (unrotated, cullNorth 0) or the live canvas directly
  // (cache fallback); see staticPasses.ts for the pass order. ----
  const scene: StaticScene = {
    mapData, activeLayer, renderLayers, exportOpacityById, isStrata, activeBoard, boardBelow,
    visibility, renderer, scaledSize, showCoordinates,
    adjacentSubHexes, adjacentEmptySlots, hiddenTileLayers, draggingWallId,
  };
  const drawStaticContent: DrawStaticFn = (tctx, ox, oy, w, h, cullNorth): void => {
    drawStaticScene(makeRenderFrame(tctx, geometry, THEME, ox, oy, zoom, w, h, cullNorth), scene);
  };

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
    geometry, hiddenTileLayers, adjacentSubHexes, adjacentEmptySlots, showCoordinates,
    width, height, draggingWallId,
    // Vault-global tile metadata (per-tile render mode) read by renderTiles.
    // Object-type icons (getObjectType reads the global object-set settings)
    // have no cheap version yet; plugin settings are mutated in place.
    getTileMetadataRenderVersion(),
    JSON.stringify(THEME), JSON.stringify(visibility),
  ];

  // Rotated maps share the cache: the snapshot is unrotated and the blit runs
  // under the rotation transform applied above (MEM-09).
  blitStaticContent(canvas, ctx, drawStaticContent, offsetX, offsetY, zoom, width, height, staticKey, getImageCacheVersion(), northDirection ?? 0);

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

export { renderCanvas };
