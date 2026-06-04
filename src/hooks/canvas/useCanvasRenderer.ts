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

import { useEffect } from 'preact/hooks';
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
import { buildMergeIndex } from '../../geometry/curves/curveCellOverlap';
import { getCachedImage } from '../../assets/imageOperations';
import { getSlotOffset, getMultiObjectScale, getObjectsInCell } from '../../objects/hexSlotPositioner';
import { offsetToAxial, axialToOffset } from '../../geometry/core/offsetCoordinates';
import { getActiveLayer, getLayerBelow, isCellFogged } from '../../persistence/layerAccessor';

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

  renderGrid(ctx: CanvasRenderingContext2D, geometry: IGeometry, viewState: RendererViewState, dimensions: { width: number; height: number }, showGrid: boolean, options: { lineColor: string; lineWidth: number }): void;
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





/**
 * Get appropriate renderer for geometry type.
 * Uses geometry.type discriminator instead of instanceof.
 */
function getRenderer(geometry: IGeometry): Renderer {
  // Safe polymorphic cast: runtime geometry always satisfies the renderer's narrower param types
  return geometry.type === 'hex' ? hexRenderer as Renderer : gridRenderer as Renderer;
}

/** Options for rendering layer content */
interface RenderLayerContentOptions {
  opacity?: number;
  showGrid?: boolean;
  mergeIndex?: CurveCellMergeIndex | null;
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
  const { opacity = 1, showGrid: showInteriorGrid = true, mergeIndex = null } = options;

  // Apply opacity if needed
  const previousAlpha = ctx.globalAlpha;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  // Draw filled cells
  if (layer.cells.length > 0) {
    const cellsWithColor = layer.cells.map(cell => ({
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

    const allCellsLookup = buildCellLookup(cellsWithColor);

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

  // Draw painted edges (grid maps only)
  if (layer.edges.length > 0 && renderer.supportsSegments && renderer.renderEdges) {
    renderer.renderEdges(ctx, layer.edges, geometry, viewState, {
      lineWidth: 1,
      borderWidth: theme.cells.borderWidth
    });
  }

  // Restore opacity
  if (opacity < 1) {
    ctx.globalAlpha = previousAlpha;
  }
}

const renderCanvas: RenderCanvas = (canvas, fogCanvas, mapData, geometry, selectedItems = [], options = {}) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, adjacentSubHexes = null } = options;
  if (canvas == null) return;

  // Normalize selectedItems to array (backward compatibility)
  const itemsArray: RendererSelectedItem[] = Array.isArray(selectedItems) ? selectedItems : (selectedItems != null ? [selectedItems] : []);

  // Default layer visibility
  const visibility: LayerVisibility = layerVisibility ?? { grid: true, objects: true, textLabels: true, hexCoordinates: true, regions: true, outlines: true };

  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme || getTheme();

  // Extract active layer data (supports layer schema v2)
  const activeLayer = getActiveLayer(mapData);

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
    geometry as { type: string; cellSize: number },
    center,
    { width, height },
    zoom
  );

  // Draw background image (both grid and hex maps)
  const bgImage = mapData.backgroundImage?.path != null && mapData.backgroundImage.path !== '' ? getCachedImage(mapData.backgroundImage.path) : null;
  const isHexMapForBg = geometry.type === 'hex';
  const boundsOrDimensions = isHexMapForBg
    ? mapData.hexBounds
    : mapData.dimensions || { width: 300, height: 300 };
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
    : { hexToWorld: geometry.gridToWorld.bind(geometry), worldToScreen: geometry.worldToScreen.bind(geometry), hexSize: geometry.cellSize, orientation: 'grid' };

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
    lineWidth: THEME.grid.lineWidth ?? 1
  });

  // Draw ghost layer (layer below) if enabled
  if (activeLayer.showLayerBelow === true) {
    const layerBelow = getLayerBelow(mapData, activeLayer.id);
    if (layerBelow) {
      const ghostOpacity = activeLayer.layerBelowOpacity ?? 0.25;
      renderLayerCellsAndEdges(ctx, layerBelow, geometry, rendererViewState, THEME, renderer, {
        opacity: ghostOpacity,
        showGrid: visibility.grid !== false
      });
      // Ghost layer tiles
      if (layerBelow.tiles != null && layerBelow.tiles.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
        renderTiles(
          ctx,
          layerBelow.tiles,
          mapData.tilesets,
          tileGeomShim,
          rendererViewState,
          { opacity: ghostOpacity, getCachedImage, canvasWidth: width, canvasHeight: height }
        );
      }
      // Ghost layer curves
      if (layerBelow.curves.length > 0) {
        const ghostGridConfig = geometry.type === 'grid'
          ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: 0.5 }
          : undefined;
        renderCurves(ctx, layerBelow.curves, rendererViewState, THEME, { opacity: ghostOpacity, gridConfig: ghostGridConfig });
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
              showGrid: false
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

  // Build curve-cell merge index for active layer (grid maps only)
  let activeMergeIndex: CurveCellMergeIndex | null = null;
  if (geometry.type === 'grid' &&
      activeLayer.cells.length > 0 &&
      activeLayer.curves.length > 0) {
    const cellsForMerge = activeLayer.cells.filter(isGridCell).map(cell => ({
      x: cell.x, y: cell.y, color: getCellColor(cell)
    }));
    activeMergeIndex = buildMergeIndex(
      cellsForMerge,
      activeLayer.curves,
      geometry.cellSize
    );
  }

  // Draw active layer cells and edges
  renderLayerCellsAndEdges(ctx, activeLayer, geometry, rendererViewState, THEME, renderer, {
    showGrid: visibility.grid !== false,
    mergeIndex: activeMergeIndex
  });

  // Draw freehand curves (between cells and objects)
  if (activeLayer.curves.length > 0) {
    const curveGridConfig = geometry.type === 'grid'
      ? { cellSize: geometry.cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth ?? 1, interiorRatio: 0.5 }
      : undefined;
    renderCurves(ctx, activeLayer.curves, rendererViewState, THEME, {
      mergeIndex: activeMergeIndex,
      gridConfig: curveGridConfig
    });
  }

  // Draw tiles (between curves and regions, z-sorted for overflow occlusion)
  if (activeLayer.tiles != null && activeLayer.tiles.length > 0 && mapData.tilesets != null && mapData.tilesets.length > 0) {
    renderTiles(
      ctx,
      activeLayer.tiles,
      mapData.tilesets,
      tileGeomShim,
      rendererViewState,
      { getCachedImage, canvasWidth: width, canvasHeight: height }
    );
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
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, tileImagesReady = false, adjacentSubHexes = null } = options;
  useEffect(() => {
    if (mapData && geometry && canvasRef.current) {
      const fogCanvas = fogCanvasRef?.current || null;
      renderCanvas(canvasRef.current, fogCanvas, mapData, geometry, selectedItems, { isResizeMode, theme, showCoordinates, layerVisibility, adjacentSubHexes });
    }
  }, [mapData, geometry, selectedItems, isResizeMode, theme, canvasRef, fogCanvasRef, showCoordinates, layerVisibility, tileImagesReady, adjacentSubHexes]);
};

export { useCanvasRenderer, renderCanvas };