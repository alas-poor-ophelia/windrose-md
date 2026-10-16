/**
 * mapRenderer.ts
 *
 * The whole-map canvas render (renderCanvas): background fill, sub-hex
 * backdrop, north rotation, static content through the static-layer cache,
 * then fog of war and selection indicators on top. Pure (no React); moved
 * from useCanvasRenderer.ts in wave 8 (STRUCT-A-29). The hook owns the rAF
 * scheduling and the cache lifecycle; image export and the hover preview
 * call renderCanvas directly.
 *
 * Lattice ladder (options.ladder non-null): the active rung comes from
 * ladder.activeLevel(zoom) unless options.level overrides it; the static
 * cache keeps one surface per rung (staticLayerCache.ts); the lattice is
 * stroked live after the blit; objects and text labels draw live per home
 * rung (elementBands.ts floors and holds) and their selection chrome follows
 * the same bands. One-shot canvases (previews, export) pass
 * bypassSurfaceCache and draw the static scene directly.
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
import { renderSelections, renderObjectSelections, renderTextLabelSelections } from './selectionRenderer';
import { renderObjects } from './objectRenderer';
import { renderTextLabels } from './textLabelRenderer';
import { OBJECT_FLOOR_PX, LABEL_FLOOR_PX, groupByDepth, groupVisibleAt, elementZoom, elementScale, objectRenderedPx, scaledSizeForRung } from './elementBands';
import { createLatticeClipCache, drawLadderLattice } from './latticeRenderer';
import type { LatticeClipCache } from './latticeRenderer';
import type { GeometryLadder } from '../core/createGeometryLadder';
import { setActiveCanvas } from '../../hooks/canvas/surfaceBudget';
import { fogDepsForRung } from '../../hooks/canvas/rungFog';
import { recordFrame, recordRebuild, recordPhase } from '../../hooks/canvas/ladderTelemetry';
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
import { drawStaticScene, makeRenderFrame, objectRenderDeps } from './staticPasses';
import type { StaticScene } from './staticPasses';

/**
 * The lattice clip path must live as long as the canvas: rebuilding it per frame
 * would enumerate every cell in a padded viewport on every pan step, which is
 * exactly the cost the cache exists to avoid. Keyed by canvas and re-created
 * when the ladder IDENTITY changes (a new map on the same canvas).
 */
const latticeClipCaches = new WeakMap<HTMLCanvasElement, { ladder: GeometryLadder; cache: LatticeClipCache }>();
/** Phase recorder for one-shot ladder canvases: their timings must not pollute the live telemetry. */
const ignorePhase: typeof recordPhase = () => undefined;
/** Last active level painted per canvas, for the crossing flag in telemetry. */
const lastLadderLevels = new WeakMap<HTMLCanvasElement, number>();
/** Lattice epoch (see staticPasses.ts LADDER_EPOCH): existence never moves in Phase 1. */
const LADDER_EPOCH = 0;

function clipCacheFor(canvas: HTMLCanvasElement, ladder: GeometryLadder): LatticeClipCache {
  const held = latticeClipCaches.get(canvas);
  if (held !== undefined && held.ladder === ladder) return held.cache;
  const cache = createLatticeClipCache();
  latticeClipCaches.set(canvas, { ladder, cache });
  return cache;
}

const renderCanvas: RenderCanvas = (canvas, fogCanvas, mapData, geometry, selectedItems = [], options = {}) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, adjacentSubHexes = null, adjacentEmptySlots = null, hiddenTileLayers = undefined, draggingWallId = null, subHexPath = null, liveViewState = null, exportLayers = null, ladder = null, level: levelOverride = undefined, bypassSurfaceCache = false } = options;
  if (canvas == null) return;

  // Every ladder branch in this function is guarded by `ladder !== null`, which is
  // null for classic maps and for previews/export of maps with no authored rung —
  // those paths are byte-identical to the shipped renderer. A one-shot canvas that
  // does carry a ladder also sets `bypassSurfaceCache`, which keeps it out of the
  // surface cache, the budget's active slot and the live telemetry.
  const ladderOn = ladder !== null && !bypassSurfaceCache;
  const frameStart = ladderOn ? performance.now() : 0;

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

  // Lattice ladder: which rung this zoom paints. `level` stays 0 on every classic
  // path, which is the level the static cache has always used.
  // An explicit `level` (export, previews) overrides the zoom's rung.
  const level = ladder !== null ? (levelOverride ?? ladder.activeLevel(zoom)) : 0;
  const crossing = ladderOn && lastLadderLevels.get(canvas) !== level;
  if (ladderOn) {
    lastLadderLevels.set(canvas, level);
    // Only a real map canvas ever claims the surface budget's active slot;
    // previews and export bypass the cache, so they never displace it.
    setActiveCanvas(canvas);
  }

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
    ladder, level,
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
    // The levels-aware term (design 06 s18/s19 item 10) is `mapData.layers` above:
    // `setLevelCells`, the one writer of rungs >= 1, returns a new mapData whose
    // `layers` array is a new array holding the re-spread layer, so a deep write
    // always changes this identity and the baked surface re-bakes. Its no-op
    // returns the same mapData, which correctly keeps the surface.
    // The ladder by IDENTITY only. Deliberately NOT the level or an epoch: the key
    // is compared against the DRIFT SOURCE's key at a crossing, so a per-level term
    // would miss on every crossing and force the synchronous bake D17 forbids.
    // `byLevel` already carries the level.
    ladder,
  ];

  // A bake is the one part of a frame worth attributing separately, and it happens
  // inside the draw callback — both the first bake of a level and the settle bake.
  const staticDraw: DrawStaticFn = !ladderOn
    ? drawStaticContent
    : (tctx, ox, oy, w, h, cullNorth): void => {
        const bakeStart = performance.now();
        drawStaticContent(tctx, ox, oy, w, h, cullNorth);
        recordRebuild(performance.now() - bakeStart);
      };

  if (ladder !== null && bypassSurfaceCache) {
    // A one-shot ladder canvas (preview, export) draws directly: no surface.
    drawStaticContent(ctx, offsetX, offsetY, width, height, northDirection ?? 0);
  } else {
    // Rotated maps share the cache: the snapshot is unrotated and the blit runs
    // under the rotation transform applied above (MEM-09).
    const blitStart = ladderOn ? performance.now() : 0;
    blitStaticContent(canvas, ctx, staticDraw, offsetX, offsetY, zoom, width, height, staticKey, getImageCacheVersion(), northDirection ?? 0, level, ladderOn);
    if (ladderOn) recordPhase('blit', performance.now() - blitStart);
  }

  // The live lattice, stroked in screen space straight after the blit so line
  // widths never scale with the crossing blit. Level 0 gets it too: the baked grid
  // is skipped at every level under the ladder. `visibility.grid` still hides it —
  // it is the same user-facing grid, drawn a different way.
  if (ladder !== null && visibility.grid !== false) {
    const latticeStart = ladderOn ? performance.now() : 0;
    drawLadderLattice(
      ctx,
      ladder,
      level,
      { offsetX, offsetY, zoom, width, height },
      LADDER_EPOCH,
      clipCacheFor(canvas, ladder),
      { active: THEME.grid.lines, district: THEME.grid.lines, activeWidth: THEME.grid.lineWidth ?? 1 },
      ladderOn ? recordPhase : ignorePhase,
      crossing
    );
    if (ladderOn) recordPhase('lattice', performance.now() - latticeStart);
  }

  // Elements at depth (design 06 section 8), LIVE after the blit (or the direct
  // draw of a one-shot preview/export canvas) so they stay crisp under the
  // crossing scale-blit. Same layer and draw order as the classic bake: the
  // active layer's objects, then its text labels.
  if (ladder !== null && !showCoordinates) {
    if (visibility.objects && activeLayer.objects.length > 0) {
      const objectDeps = objectRenderDeps(mapData);
      for (const group of groupByDepth(activeLayer.objects)) {
        if (!groupVisibleAt(group, level, 'object')) continue;
        const { home, mode, members } = group;
        // The floor judges each object's own rendered width, not the cell's.
        const objects = members.filter((o) => objectRenderedPx(ladder, home, zoom, o.size?.width ?? 1, mode) >= OBJECT_FLOOR_PX);
        if (objects.length === 0) continue;
        renderObjects(
          { ...activeLayer, objects },
          { ctx, offsetX, offsetY, zoom, scaledSize: scaledSizeForRung(ladder, home, zoom), elementScale: elementScale(ladder, home, zoom, mode), slotObjects: activeLayer.objects },
          ladder.geometryForLevel(home),
          true,
          mapData.orientation ?? 'flat',
          // Fog is level-0 cell data: a deep object is fogged by its root ancestor hex.
          fogDepsForRung(ladder, home, objectDeps)
        );
      }
    }
    if (visibility.textLabels && activeLayer.textLabels.length > 0) {
      for (const group of groupByDepth(activeLayer.textLabels)) {
        if (!groupVisibleAt(group, level, 'label')) continue;
        const { home, mode, members } = group;
        const fontZoom = elementZoom(ladder, home, zoom, mode);
        const labels = members.filter(label => label.fontSize * fontZoom >= LABEL_FLOOR_PX);
        if (labels.length === 0) continue;
        // Position at the real zoom (world px are level-invariant); font at the held zoom.
        renderTextLabels(labels, { ctx, zoom: fontZoom, getFontCss }, geometry, { offsetX, offsetY, zoom });
      }
    }
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
  const selectionDeps = {
    getFontCss,
    getObjectsInCell,
    getSlotOffset,
    getMultiObjectScale,
  };
  if (ladder !== null) {
    // Under the ladder the chrome follows the live element pass: one call per
    // depth group, on the home rung's geometry, with the same hold the element
    // was drawn with. Hidden groups (pop mode below home) get no chrome.
    if (itemsArray.length > 0 && !showCoordinates) {
      if (visibility.textLabels !== false) {
        for (const group of groupByDepth(activeLayer.textLabels)) {
          if (!groupVisibleAt(group, level, 'label')) continue;
          const { home, mode, members } = group;
          const fontZoom = elementZoom(ladder, home, zoom, mode);
          const labels = members.filter(label => label.fontSize * fontZoom >= LABEL_FLOOR_PX);
          if (labels.length === 0) continue;
          renderTextLabelSelections(itemsArray, labels, { ctx, offsetX, offsetY, zoom, scaledSize, fontZoom }, geometry, getFontCss);
        }
      }
      if (visibility.objects !== false) {
        for (const group of groupByDepth(activeLayer.objects)) {
          if (!groupVisibleAt(group, level, 'object')) continue;
          const { home, mode, members } = group;
          // Same floor as the draw pass: no chrome around an element that was not drawn.
          const ids = new Set(members.filter((o) => objectRenderedPx(ladder, home, zoom, o.size?.width ?? 1, mode) >= OBJECT_FLOOR_PX).map((o) => o.id));
          const items = itemsArray.filter((it) => it.type === 'object' && ids.has(it.id));
          if (items.length === 0) continue;
          const homeGeom = ladder.geometryForLevel(home);
          renderObjectSelections(
            items,
            activeLayer.objects,
            { ctx, offsetX, offsetY, zoom, scaledSize: scaledSizeForRung(ladder, home, zoom), elementScale: elementScale(ladder, home, zoom, mode) },
            homeGeom,
            homeGeom,
            true,
            isResizeMode,
            mapData.orientation ?? 'flat',
            selectionDeps
          );
        }
      }
    }
  } else {
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
      selectionDeps
    );
  }

  // Restore context
  ctx.restore();

  if (ladderOn) recordFrame(performance.now() - frameStart, level, crossing);
};

export { renderCanvas };
