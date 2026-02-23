/**
 * useCanvasRenderer.ts
 *
 * Canvas rendering hook and utilities for the map canvas.
 * Handles grid, cells, objects, text labels, fog of war, and selections.
 */

// Type-only imports
import type { MapData, MapLayer, ViewState } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { Cell, CellMap } from '#types/core/cell.types';
import type { MapObject, ObjectTypeDef } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { Curve } from '#types/core/curve.types';
import type {
  RenderCanvas,
  UseCanvasRenderer,
  RendererSelectedItem,
  LayerVisibility,
  RendererTheme,
  RendererViewState,
} from '#types/hooks/canvasRenderer.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.ts") as {
  getTheme: () => RendererTheme;
  getEffectiveSettings: (settings: MapData['settings']) => Record<string, unknown>;
};
const { buildCellLookup, calculateBordersOptimized } = await requireModuleByName("borderCalculator.ts") as {
  buildCellLookup: (cells: Cell[]) => CellMap;
  calculateBordersOptimized: (cell: Cell, lookup: CellMap) => { top: boolean; right: boolean; bottom: boolean; left: boolean };
};
const { getObjectType } = await requireModuleByName("objectOperations.ts") as {
  getObjectType: (typeId: string) => ObjectTypeDef | null;
};
const { getRenderChar } = await requireModuleByName("objectTypeResolver.ts") as {
  getRenderChar: (objType: ObjectTypeDef) => { char: string; isIcon: boolean };
};
const { getCellColor } = await requireModuleByName("colorOperations.ts") as {
  getCellColor: (cell: Cell) => string;
};
const { renderNoteLinkBadge, renderTooltipIndicator, renderObjectLinkIndicator } = await requireModuleByName("badgeRenderer.ts") as {
  renderNoteLinkBadge: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
  renderTooltipIndicator: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
  renderObjectLinkIndicator: (ctx: CanvasRenderingContext2D, position: { screenX: number; screenY: number; objectWidth: number; objectHeight: number }, config: { scaledSize: number }) => void;
};
const { renderTextLabels } = await requireModuleByName("textLabelRenderer.ts") as {
  renderTextLabels: (labels: TextLabel[], context: { ctx: CanvasRenderingContext2D; zoom: number; getFontCss: (fontFace: string) => string }, geometry: { worldToScreen: (x: number, y: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number } }, viewState: { offsetX: number; offsetY: number; zoom: number }) => void;
};
const { renderHexBackgroundImage, renderGridBackgroundImage } = await requireModuleByName("backgroundRenderer.ts") as {
  renderHexBackgroundImage: (bgImage: HTMLImageElement, config: { path: string; offsetX?: number; offsetY?: number; opacity?: number }, hexBounds: { maxCol: number; maxRow: number }, hexGeometry: { hexSize: number; sqrt3: number; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number } }, orientation: string, context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number }, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }) => void;
  renderGridBackgroundImage: (bgImage: HTMLImageElement, config: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number }, dimensions: { width: number; height: number }, cellSize: number, context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number }) => void;
};
const { renderGridFog } = await requireModuleByName("gridFogRenderer.ts") as {
  renderGridFog: (fogCells: Array<{ col: number; row: number }>, context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; scaledSize: number }, options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean }, visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }, zoom: number) => void;
};
const { renderHexFog } = await requireModuleByName("hexFogRenderer.ts") as {
  renderHexFog: (fogCells: Array<{ col: number; row: number }>, context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; zoom: number }, options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean }, visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }, hexGeometry: { hexSize: number; getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number }; getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }> }, geometry: { worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number } }, orientation: string, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }, axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }) => void;
};
const { getFogSettings, clearFogCanvas, renderFog } = await requireModuleByName("fogRenderer.ts") as {
  getFogSettings: (effectiveSettings: Record<string, unknown>) => { fowColor: string; fowOpacity: number; fowImagePath?: string; fowBlurEnabled: boolean; fowBlurFactor: number };
  clearFogCanvas: (fogCanvas: HTMLCanvasElement | null) => void;
  renderFog: (fow: { enabled: boolean; foggedCells?: Array<{ col: number; row: number }> }, context: { ctx: CanvasRenderingContext2D; fogCanvas: HTMLCanvasElement | null; width: number; height: number; offsetX: number; offsetY: number; zoom: number; scaledSize: number; northDirection: number }, settings: { fowColor: string; fowOpacity: number; fowImagePath?: string; fowBlurEnabled: boolean; fowBlurFactor: number }, mapBounds: { hexBounds?: { maxCol: number; maxRow: number }; dimensions?: { width: number; height: number } }, isHexMap: boolean, hexGeometry: { hexSize: number; getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number }; getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }> } | null, gridGeometry: { cellSize: number } | null, geometry: { worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number } }, orientation: string, getCachedImage: (path: string) => HTMLImageElement | null, renderGridFog: typeof renderGridFog, renderHexFog: typeof renderHexFog, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }, axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }) => void;
};
const { renderObjects } = await requireModuleByName("objectRenderer.ts") as {
  renderObjects: (layer: MapLayer, context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number; scaledSize: number }, geometry: IGeometry, isHexMap: boolean, orientation: string, deps: { getObjectType: typeof getObjectType; getRenderChar: typeof getRenderChar; isCellFogged: typeof isCellFogged; getObjectsInCell: typeof getObjectsInCell; getSlotOffset: typeof getSlotOffset; getMultiObjectScale: typeof getMultiObjectScale; renderNoteLinkBadge: typeof renderNoteLinkBadge; renderTooltipIndicator: typeof renderTooltipIndicator; renderObjectLinkIndicator: typeof renderObjectLinkIndicator; getCachedImage?: typeof getCachedImage }) => void;
};
const { renderSelections } = await requireModuleByName("selectionRenderer.ts") as {
  renderSelections: (selectedItems: RendererSelectedItem[], textLabels: TextLabel[] | undefined, objects: MapObject[] | undefined, context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number; scaledSize: number }, geometry: IGeometry, hexGeometry: { hexToWorld: (q: number, r: number) => { worldX: number; worldY: number } } | null, isHexMap: boolean, isResizeMode: boolean, orientation: string, showCoordinates: boolean, visibility: { textLabels?: boolean; objects?: boolean }, deps: { getFontCss: typeof getFontCss; getObjectsInCell: typeof getObjectsInCell; getSlotOffset: typeof getSlotOffset; getMultiObjectScale: typeof getMultiObjectScale }) => void;
};
const { getFontCss } = await requireModuleByName("fontOptions.ts") as {
  getFontCss: (fontFace: string) => string;
};
const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
  GridGeometry: new (cellSize: number) => IGeometry & { cellSize: number; getScaledCellSize: (zoom: number) => number };
};
const { calculateViewportOffset } = await requireModuleByName("BaseGeometry.ts") as {
  calculateViewportOffset: (
    geometry: { type: string; cellSize: number },
    center: { x: number; y: number },
    canvasSize: { width: number; height: number },
    zoom: number
  ) => { offsetX: number; offsetY: number };
};
const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (hexSize: number, orientation: string, hexBounds: { maxCol: number; maxRow: number } | null) => IGeometry & {
    hexSize: number;
    sqrt3: number;
    getScaledHexSize: (zoom: number) => number;
    getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>;
    hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
    getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }>;
  };
};

interface Renderer {
  // Polymorphic properties
  supportsSegments: boolean;

  // Polymorphic methods for viewport calculation
  getScaledSize: (geometry: IGeometry, zoom: number) => number;
  calculateViewportOffset: (geometry: IGeometry, center: { x: number; y: number }, canvasSize: { width: number; height: number }, zoom: number) => { offsetX: number; offsetY: number };

  // Background image rendering (both grid and hex)
  renderBackgroundImage: (
    ctx: CanvasRenderingContext2D,
    geometry: IGeometry,
    bgImage: HTMLImageElement | null,
    bgConfig: { path: string; offsetX?: number; offsetY?: number; opacity?: number; imageGridSize?: number } | undefined,
    boundsOrDimensions: { maxCol: number; maxRow: number } | { width: number; height: number } | undefined,
    orientation: string,
    offsetX: number,
    offsetY: number,
    zoom: number,
    renderGridBackgroundImage?: typeof renderGridBackgroundImage
  ) => void;

  // Grid/cell rendering
  renderGrid: (ctx: CanvasRenderingContext2D, geometry: IGeometry, viewState: RendererViewState, dimensions: { width: number; height: number }, showGrid: boolean, options: { lineColor: string; lineWidth: number }) => void;
  renderPaintedCells: (ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState) => void;
  renderCellBorders: (ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, getLookup: () => CellMap, calculateBorders: typeof calculateBordersOptimized, options: { border: string; borderWidth: number }) => void;
  renderInteriorGridLines?: (ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState, options: { lineColor: string; lineWidth: number; interiorRatio: number }) => void;
  renderEdges?: (ctx: CanvasRenderingContext2D, edges: unknown[], geometry: IGeometry, viewState: RendererViewState, options: { lineWidth: number; borderWidth: number }) => void;
}

const { gridRenderer } = await requireModuleByName("gridRenderer.ts") as { gridRenderer: Renderer };
const { hexRenderer } = await requireModuleByName("hexRenderer.ts") as { hexRenderer: Renderer };
const { segmentRenderer } = await requireModuleByName("segmentRenderer.ts") as {
  segmentRenderer: {
    separateCellsByType: (cells: Cell[]) => { simpleCells: Cell[]; segmentCells: Cell[] };
    renderSegmentCells: (ctx: CanvasRenderingContext2D, cells: Cell[], geometry: IGeometry, viewState: RendererViewState) => void;
    renderSegmentBorders: (ctx: CanvasRenderingContext2D, segmentCells: Cell[], allCells: Cell[], geometry: IGeometry, viewState: RendererViewState, options: { border: string; borderWidth: number }) => void;
  };
};
const { renderCurves } = await requireModuleByName("curveRenderer.ts") as {
  renderCurves: (ctx: CanvasRenderingContext2D, curves: Curve[], viewState: { x: number; y: number; zoom: number }, theme: RendererTheme, options?: { opacity?: number; mergeIndex?: CurveCellMergeIndex | null; gridConfig?: { cellSize: number; lineColor: string; lineWidth: number; interiorRatio: number } }) => void;
};
const { buildMergeIndex } = await requireModuleByName("curveCellOverlap.ts") as {
  buildMergeIndex: (cells: Array<{ x: number; y: number; color: string }>, curves: Curve[], cellSize: number) => CurveCellMergeIndex;
};

/** Spatial index for curve-cell visual merging */
interface CurveCellMergeIndex {
  cellBordersToSuppress: Map<string, Set<string>>;
  curveCellRects: Map<number, Array<{ x: number; y: number; w: number; h: number }>>;
}
const { getCachedImage } = await requireModuleByName("imageOperations.ts") as {
  getCachedImage: (path: string) => HTMLImageElement | null;
};
const { getSlotOffset, getMultiObjectScale, getObjectsInCell } = await requireModuleByName("hexSlotPositioner.ts") as {
  getSlotOffset: (slot: number, count: number, orientation: string) => { offsetX: number; offsetY: number };
  getMultiObjectScale: (count: number) => number;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
};
const { offsetToAxial, axialToOffset } = await requireModuleByName("offsetCoordinates.ts") as {
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number };
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number };
};
const { getActiveLayer, getLayerBelow, isCellFogged } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  getLayerBelow: (mapData: MapData, layerId: string) => MapLayer | null;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
};

/**
 * Get appropriate renderer for geometry type.
 * Uses geometry.type discriminator instead of instanceof.
 */
function getRenderer(geometry: IGeometry): Renderer {
  return geometry.type === 'hex' ? hexRenderer : gridRenderer;
}

/** Options for rendering layer content */
interface RenderLayerContentOptions {
  opacity?: number;
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
  const { opacity = 1, mergeIndex = null } = options;

  // Apply opacity if needed
  const previousAlpha = ctx.globalAlpha;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }

  // Draw filled cells
  if (layer.cells && layer.cells.length > 0) {
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

    if (renderer.renderInteriorGridLines && cellsWithColor.length > 0) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, viewState, {
        lineColor: theme.grid.lines,
        lineWidth: theme.grid.lineWidth || 1,
        interiorRatio: 0.5
      });
    }

    const allCellsLookup = buildCellLookup(cellsWithColor);

    // Wrap border calculator to suppress borders adjacent to same-color curves
    const bordersCalculator = mergeIndex
      ? (lookup: CellMap, x: number, y: number) => {
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
  if (layer.edges && layer.edges.length > 0 && renderer.supportsSegments && renderer.renderEdges) {
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

const renderCanvas: RenderCanvas = (canvas, fogCanvas, mapData, geometry, selectedItems = [], isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) => {
  if (!canvas) return;

  // Normalize selectedItems to array (backward compatibility)
  const itemsArray: RendererSelectedItem[] = Array.isArray(selectedItems) ? selectedItems : (selectedItems ? [selectedItems] : []);

  // Default layer visibility
  const visibility: LayerVisibility = layerVisibility || { objects: true, textLabels: true, hexCoordinates: true };

  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme || getTheme();

  // Extract active layer data (supports layer schema v2)
  const activeLayer = getActiveLayer(mapData);

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const { width, height } = canvas;
  const { viewState, northDirection } = mapData;
  const { zoom, center } = viewState;

  // Clear canvas
  ctx.fillStyle = THEME.grid.background;
  ctx.fillRect(0, 0, width, height);

  // Save context and apply rotation
  ctx.save();

  // Translate to center, rotate, translate back
  ctx.translate(width / 2, height / 2);
  ctx.rotate((northDirection * Math.PI) / 180);
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
  const bgImage = mapData.backgroundImage?.path ? getCachedImage(mapData.backgroundImage.path) : null;
  const isHexMapForBg = geometry.type === 'hex';
  const boundsOrDimensions = isHexMapForBg
    ? mapData.hexBounds
    : mapData.dimensions || { width: 300, height: 300 };
  renderer.renderBackgroundImage(
    ctx,
    geometry,
    bgImage,
    mapData.backgroundImage,
    boundsOrDimensions,
    mapData.orientation || 'flat',
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
  renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, true, {
    lineColor: THEME.grid.lines,
    lineWidth: THEME.grid.lineWidth || 1
  });

  // Draw ghost layer (layer below) if enabled
  if (activeLayer.showLayerBelow) {
    const layerBelow = getLayerBelow(mapData, activeLayer.id);
    if (layerBelow) {
      const ghostOpacity = activeLayer.layerBelowOpacity ?? 0.25;
      renderLayerCellsAndEdges(ctx, layerBelow, geometry, rendererViewState, THEME, renderer, {
        opacity: ghostOpacity
      });
      // Ghost layer curves
      if (layerBelow.curves && layerBelow.curves.length > 0) {
        const ghostGridConfig = geometry.type === 'grid'
          ? { cellSize: (geometry as any).cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth || 1, interiorRatio: 0.5 }
          : undefined;
        renderCurves(ctx, layerBelow.curves, rendererViewState, THEME, { opacity: ghostOpacity, gridConfig: ghostGridConfig });
      }
    }
  }

  // Build curve-cell merge index for active layer (grid maps only)
  let activeMergeIndex: CurveCellMergeIndex | null = null;
  if (geometry.type === 'grid' &&
      activeLayer.cells && activeLayer.cells.length > 0 &&
      activeLayer.curves && activeLayer.curves.length > 0) {
    const cellsForMerge = activeLayer.cells.map(cell => ({
      x: cell.x, y: cell.y, color: getCellColor(cell)
    }));
    activeMergeIndex = buildMergeIndex(
      cellsForMerge,
      activeLayer.curves,
      (geometry as any).cellSize
    );
  }

  // Draw active layer cells and edges
  renderLayerCellsAndEdges(ctx, activeLayer, geometry, rendererViewState, THEME, renderer, {
    mergeIndex: activeMergeIndex
  });

  // Draw freehand curves (between cells and objects)
  if (activeLayer.curves && activeLayer.curves.length > 0) {
    const curveGridConfig = geometry.type === 'grid'
      ? { cellSize: (geometry as any).cellSize, lineColor: THEME.grid.lines, lineWidth: THEME.grid.lineWidth || 1, interiorRatio: 0.5 }
      : undefined;
    renderCurves(ctx, activeLayer.curves, rendererViewState, THEME, {
      mergeIndex: activeMergeIndex,
      gridConfig: curveGridConfig
    });
  }

  // Draw objects
  if (activeLayer.objects && activeLayer.objects.length > 0 && !showCoordinates && visibility.objects) {
    const isHexMap = geometry.type === 'hex';
    renderObjects(
      activeLayer,
      { ctx, offsetX, offsetY, zoom, scaledSize },
      geometry,
      isHexMap,
      mapData.orientation || 'flat',
      {
        getObjectType,
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
  if (activeLayer.textLabels && activeLayer.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
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
  const effectiveSettings = getEffectiveSettings(mapData.settings) as Record<string, unknown>;
  const fowBlurEnabled = (effectiveSettings?.fogOfWarBlurEnabled as boolean) ?? false;

  // Clear fog canvas if fog not needed
  if (!fow?.enabled || !fow?.foggedCells?.length || !fowBlurEnabled) {
    clearFogCanvas(fogCanvas);
  }

  if (fow && fow.enabled && fow.foggedCells?.length) {
    const fogSettings = getFogSettings(effectiveSettings);
    const isHexMap = geometry.type === 'hex';
    const hexGeom = isHexMap ? geometry as InstanceType<typeof HexGeometry> : null;
    const gridGeom = !isHexMap ? geometry as InstanceType<typeof GridGeometry> : null;

    renderFog(
      activeLayer.fogOfWar,
      { ctx, fogCanvas, width, height, offsetX, offsetY, zoom, scaledSize, northDirection },
      fogSettings,
      { hexBounds: mapData.hexBounds, dimensions: mapData.dimensions },
      isHexMap,
      hexGeom,
      gridGeom,
      geometry,
      mapData.orientation || 'flat',
      getCachedImage,
      renderGridFog,
      renderHexFog,
      offsetToAxial,
      axialToOffset
    );
  }

  // Draw selection indicators
  const isHexMapForSelection = geometry.type === 'hex';
  const hexGeomForSelection = isHexMapForSelection ? geometry as InstanceType<typeof HexGeometry> : null;
  renderSelections(
    itemsArray,
    activeLayer.textLabels,
    activeLayer.objects,
    { ctx, offsetX, offsetY, zoom, scaledSize },
    geometry,
    hexGeomForSelection,
    isHexMapForSelection,
    isResizeMode,
    mapData.orientation || 'flat',
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

const useCanvasRenderer: UseCanvasRenderer = (canvasRef, fogCanvasRef, mapData, geometry, selectedItems = [], isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) => {
  dc.useEffect(() => {
    if (mapData && geometry && canvasRef.current) {
      const fogCanvas = fogCanvasRef?.current || null;
      renderCanvas(canvasRef.current, fogCanvas, mapData, geometry, selectedItems, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [mapData, geometry, selectedItems, isResizeMode, theme, canvasRef, fogCanvasRef, showCoordinates, layerVisibility]);
};

return { useCanvasRenderer, renderCanvas };
