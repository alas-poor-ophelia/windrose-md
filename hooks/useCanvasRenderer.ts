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
const { renderHexBackgroundImage } = await requireModuleByName("backgroundRenderer.ts") as {
  renderHexBackgroundImage: (bgImage: HTMLImageElement, config: { path: string; offsetX?: number; offsetY?: number; opacity?: number }, hexBounds: { maxCol: number; maxRow: number }, hexGeometry: { hexSize: number; sqrt3: number; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number } }, orientation: string, context: { ctx: CanvasRenderingContext2D; offsetX: number; offsetY: number; zoom: number }, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }) => void;
};
const { renderGridFog } = await requireModuleByName("gridFogRenderer.ts") as {
  renderGridFog: (fogCells: Array<{ col: number; row: number }>, context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; scaledSize: number }, options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean }, visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }, zoom: number) => void;
};
const { renderHexFog } = await requireModuleByName("hexFogRenderer.ts") as {
  renderHexFog: (fogCells: Array<{ col: number; row: number }>, context: { ctx: CanvasRenderingContext2D; fogCtx: CanvasRenderingContext2D | null; offsetX: number; offsetY: number; zoom: number }, options: { fowOpacity: number; fowBlurEnabled: boolean; blurRadius: number; useGlobalAlpha: boolean }, visibleBounds: { minCol: number; maxCol: number; minRow: number; maxRow: number }, hexGeometry: { hexSize: number; getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number }; getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }> }, geometry: { worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number } }, orientation: string, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }, axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }) => void;
};
const { getFogSettings, renderFog } = await requireModuleByName("fogRenderer.ts") as {
  getFogSettings: (effectiveSettings: Record<string, unknown>) => { fowColor: string; fowOpacity: number; fowImagePath?: string; fowBlurEnabled: boolean; fowBlurFactor: number };
  renderFog: (fow: { enabled: boolean; foggedCells?: Array<{ col: number; row: number }> }, context: { ctx: CanvasRenderingContext2D; fogCanvas: HTMLCanvasElement | null; width: number; height: number; offsetX: number; offsetY: number; zoom: number; scaledSize: number; northDirection: number }, settings: { fowColor: string; fowOpacity: number; fowImagePath?: string; fowBlurEnabled: boolean; fowBlurFactor: number }, mapBounds: { hexBounds?: { maxCol: number; maxRow: number }; dimensions?: { width: number; height: number } }, isHexMap: boolean, hexGeometry: { hexSize: number; getHexVertices: (q: number, r: number) => Array<{ worldX: number; worldY: number }>; hexToWorld: (q: number, r: number) => { worldX: number; worldY: number }; getNeighbors: (q: number, r: number) => Array<{ q: number; r: number }> } | null, gridGeometry: { cellSize: number } | null, geometry: { worldToScreen: (worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number) => { screenX: number; screenY: number } }, orientation: string, getCachedImage: (path: string) => HTMLImageElement | null, renderGridFog: typeof renderGridFog, renderHexFog: typeof renderHexFog, offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number }, axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number }) => void;
};
const { getFontCss } = await requireModuleByName("fontOptions.ts") as {
  getFontCss: (fontFace: string) => string;
};
const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
  GridGeometry: new (cellSize: number) => IGeometry & { cellSize: number; getScaledCellSize: (zoom: number) => number };
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
 * Get appropriate renderer for geometry type
 */
function getRenderer(geometry: IGeometry): Renderer {
  return geometry instanceof HexGeometry ? hexRenderer : gridRenderer;
}

/** Options for rendering layer content */
interface RenderLayerContentOptions {
  opacity?: number;
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
  const { opacity = 1 } = options;

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

    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
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

    if (simpleCells.length > 0) {
      renderer.renderCellBorders(
        ctx,
        simpleCells,
        geometry,
        viewState,
        () => allCellsLookup,
        calculateBordersOptimized,
        {
          border: theme.cells.border,
          borderWidth: theme.cells.borderWidth
        }
      );
    }

    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
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
  if (layer.edges && layer.edges.length > 0 && geometry instanceof GridGeometry && renderer.renderEdges) {
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

  // Calculate viewport based on geometry type
  let scaledSize: number, offsetX: number, offsetY: number;

  if (geometry instanceof GridGeometry) {
    scaledSize = geometry.getScaledCellSize(zoom);
    // Grid: center is in grid cell coordinates, multiply by cell size
    offsetX = width / 2 - center.x * scaledSize;
    offsetY = height / 2 - center.y * scaledSize;
  } else {
    // HexGeometry: center is in world pixel coordinates, multiply by zoom only
    scaledSize = (geometry as InstanceType<typeof HexGeometry>).getScaledHexSize(zoom);
    offsetX = width / 2 - center.x * zoom;
    offsetY = height / 2 - center.y * zoom;
  }

  // Draw background image for hex maps (if available)
  if (geometry instanceof HexGeometry && mapData.backgroundImage?.path) {
    const bgImage = getCachedImage(mapData.backgroundImage.path);
    if (bgImage && bgImage.complete && mapData.hexBounds) {
      renderHexBackgroundImage(
        bgImage,
        mapData.backgroundImage,
        mapData.hexBounds,
        geometry as InstanceType<typeof HexGeometry>,
        mapData.orientation || 'flat',
        { ctx, offsetX, offsetY, zoom },
        offsetToAxial
      );
    }
  }

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
    }
  }

  // Draw active layer cells and edges
  renderLayerCellsAndEdges(ctx, activeLayer, geometry, rendererViewState, THEME, renderer);

  // Draw objects
  if (activeLayer.objects && activeLayer.objects.length > 0 && !showCoordinates && visibility.objects) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const obj of activeLayer.objects) {
      const objType = getObjectType(obj.type);
      if (!objType) continue;

      // Skip if fogged
      if (activeLayer.fogOfWar?.enabled) {
        const size = obj.size || { width: 1, height: 1 };
        const baseOffset = geometry.toOffsetCoords(obj.position.x, obj.position.y);

        let isUnderFog = false;

        if (geometry instanceof HexGeometry) {
          isUnderFog = isCellFogged(activeLayer, baseOffset.col, baseOffset.row);
        } else {
          for (let dx = 0; dx < size.width && !isUnderFog; dx++) {
            for (let dy = 0; dy < size.height && !isUnderFog; dy++) {
              if (isCellFogged(activeLayer, baseOffset.col + dx, baseOffset.row + dy)) {
                isUnderFog = true;
              }
            }
          }
        }

        if (isUnderFog) continue;
      }

      const size = obj.size || { width: 1, height: 1 };

      let { screenX, screenY } = geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);

      let objectWidth = size.width * scaledSize;
      let objectHeight = size.height * scaledSize;

      // Multi-object support for hex maps
      if (geometry instanceof HexGeometry) {
        const cellObjects = getObjectsInCell(activeLayer.objects, obj.position.x, obj.position.y);
        const objectCount = cellObjects.length;

        if (objectCount > 1) {
          const multiScale = getMultiObjectScale(objectCount);
          objectWidth *= multiScale;
          objectHeight *= multiScale;

          let effectiveSlot = obj.slot;
          if (effectiveSlot === undefined || effectiveSlot === null) {
            effectiveSlot = cellObjects.findIndex(o => o.id === obj.id);
          }

          const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
            effectiveSlot,
            objectCount,
            mapData.orientation || 'flat'
          );

          const hexCenterX = screenX + scaledSize / 2;
          const hexCenterY = screenY + scaledSize / 2;
          const hexWidth = scaledSize * 2;
          const objectCenterX = hexCenterX + slotOffsetX * hexWidth;
          const objectCenterY = hexCenterY + slotOffsetY * hexWidth;

          screenX = objectCenterX - objectWidth / 2;
          screenY = objectCenterY - objectHeight / 2;
        }
      }

      // Apply alignment offset
      const alignment = obj.alignment || 'center';
      if (alignment !== 'center') {
        const halfCell = scaledSize / 2;
        switch (alignment) {
          case 'north': screenY -= halfCell; break;
          case 'south': screenY += halfCell; break;
          case 'east': screenX += halfCell; break;
          case 'west': screenX -= halfCell; break;
        }
      }

      const centerX = screenX + objectWidth / 2;
      const centerY = screenY + objectHeight / 2;

      const objectScale = obj.scale ?? 1.0;
      const fontSize = Math.min(objectWidth, objectHeight) * 0.8 * objectScale;

      const rotation = obj.rotation || 0;
      if (rotation !== 0) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      const { char: renderChar, isIcon } = getRenderChar(objType);

      if (isIcon) {
        ctx.font = `${fontSize}px rpgawesome`;
      } else {
        ctx.font = `${fontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
      }

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(2, fontSize * 0.08);
      ctx.strokeText(renderChar, centerX, centerY);

      ctx.fillStyle = obj.color || '#ffffff';
      ctx.fillText(renderChar, centerX, centerY);

      if (rotation !== 0) {
        ctx.restore();
      }

      // Draw note badge if object has linkedNote
      if (obj.linkedNote && obj.type !== 'note_pin') {
        renderNoteLinkBadge(ctx, { screenX, screenY, objectWidth, objectHeight }, { scaledSize });
      }

      // Draw note indicator for custom tooltip
      if (obj.customTooltip) {
        renderTooltipIndicator(ctx, { screenX, screenY, objectWidth, objectHeight }, { scaledSize });
      }

      // Draw link indicator for inter-object links
      if (obj.linkedObject) {
        renderObjectLinkIndicator(ctx, { screenX, screenY, objectWidth, objectHeight }, { scaledSize });
      }
    }
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

  // Clear fog canvas if not needed
  if (fogCanvas) {
    const fow = activeLayer.fogOfWar;
    const effectiveSettings = getEffectiveSettings(mapData.settings) as Record<string, unknown>;
    const fowBlurEnabled = (effectiveSettings?.fogOfWarBlurEnabled as boolean) ?? false;

    if (!fow?.enabled || !fow?.foggedCells?.length || !fowBlurEnabled) {
      const tempFogCtx = fogCanvas.getContext('2d');
      if (tempFogCtx) {
        tempFogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
        fogCanvas.style.filter = 'none';
      }
    }
  }

  if (activeLayer.fogOfWar && activeLayer.fogOfWar.enabled && activeLayer.fogOfWar.foggedCells?.length) {
    const effectiveSettings = getEffectiveSettings(mapData.settings) as Record<string, unknown>;
    const fogSettings = getFogSettings(effectiveSettings);
    const isHexMap = geometry instanceof HexGeometry;
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

  // Draw selection indicators for text labels
  const selectedTextLabels = itemsArray.filter(item => item.type === 'text');
  if (selectedTextLabels.length > 0 && activeLayer.textLabels && !showCoordinates && visibility.textLabels) {
    for (const selectedItem of selectedTextLabels) {
      const label = activeLayer.textLabels.find(l => l.id === selectedItem.id);
      if (label) {
        ctx.save();

        const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);

        ctx.translate(screenX, screenY);
        ctx.rotate(((label.rotation || 0) * Math.PI) / 180);

        const fontSize = label.fontSize * zoom;
        const fontFamily = getFontCss(label.fontFace || 'sans');
        ctx.font = `${fontSize}px ${fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const metrics = ctx.measureText(label.content);
        const textWidth = metrics.width;
        const textHeight = fontSize * 1.2;

        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(-textWidth/2 - 4, -textHeight/2 - 2, textWidth + 8, textHeight + 4);

        ctx.setLineDash([]);
        ctx.fillStyle = '#4a9eff';
        const handleSize = 6;

        ctx.fillRect(-textWidth/2 - 4 - handleSize/2, -textHeight/2 - 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(textWidth/2 + 4 - handleSize/2, -textHeight/2 - 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(-textWidth/2 - 4 - handleSize/2, textHeight/2 + 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(textWidth/2 + 4 - handleSize/2, textHeight/2 + 2 - handleSize/2, handleSize, handleSize);

        ctx.restore();
      }
    }
  }

  // Draw selection indicators for objects
  const selectedObjects = itemsArray.filter(item => item.type === 'object');
  if (selectedObjects.length > 0 && activeLayer.objects && !showCoordinates && visibility.objects) {
    const showResizeOverlay = isResizeMode && selectedObjects.length === 1;

    for (const selectedItem of selectedObjects) {
      const object = activeLayer.objects.find(obj => obj.id === selectedItem.id);
      if (object) {
        const size = object.size || { width: 1, height: 1 };
        const alignment = object.alignment || 'center';

        let screenX: number, screenY: number, objectWidth: number, objectHeight: number, cellWidth: number, cellHeight: number;

        if (geometry instanceof HexGeometry) {
          const hexGeom = geometry as InstanceType<typeof HexGeometry>;
          const { worldX, worldY } = hexGeom.hexToWorld(object.position.x, object.position.y);

          const cellObjects = getObjectsInCell(activeLayer.objects, object.position.x, object.position.y);
          const objectCount = cellObjects.length;

          objectWidth = size.width * scaledSize;
          objectHeight = size.height * scaledSize;
          cellWidth = scaledSize;
          cellHeight = scaledSize;

          if (objectCount > 1) {
            const multiScale = getMultiObjectScale(objectCount);
            objectWidth *= multiScale;
            objectHeight *= multiScale;
          }

          let centerScreenX = offsetX + worldX * zoom;
          let centerScreenY = offsetY + worldY * zoom;

          if (objectCount > 1) {
            const effectiveSlot = object.slot ?? cellObjects.findIndex(o => o.id === object.id);
            const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
              effectiveSlot,
              objectCount,
              mapData.orientation || 'flat'
            );
            const hexWidth = scaledSize * 2;
            centerScreenX += slotOffsetX * hexWidth;
            centerScreenY += slotOffsetY * hexWidth;
          }

          if (alignment !== 'center') {
            const halfCell = scaledSize / 2;
            switch (alignment) {
              case 'north': centerScreenY -= halfCell; break;
              case 'south': centerScreenY += halfCell; break;
              case 'east': centerScreenX += halfCell; break;
              case 'west': centerScreenX -= halfCell; break;
            }
          }

          screenX = centerScreenX - objectWidth / 2;
          screenY = centerScreenY - objectHeight / 2;
        } else {
          const gridPos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
          screenX = gridPos.screenX;
          screenY = gridPos.screenY;

          if (alignment !== 'center') {
            const halfCell = scaledSize / 2;
            switch (alignment) {
              case 'north': screenY -= halfCell; break;
              case 'south': screenY += halfCell; break;
              case 'east': screenX += halfCell; break;
              case 'west': screenX -= halfCell; break;
            }
          }

          objectWidth = size.width * scaledSize;
          objectHeight = size.height * scaledSize;
          cellWidth = scaledSize;
          cellHeight = scaledSize;
        }

        // Draw occupied cells overlay in resize mode
        if (showResizeOverlay) {
          ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
          for (let dx = 0; dx < size.width; dx++) {
            for (let dy = 0; dy < size.height; dy++) {
              const cellScreenX = screenX + dx * cellWidth;
              const cellScreenY = screenY + dy * cellHeight;
              ctx.fillRect(cellScreenX + 2, cellScreenY + 2, cellWidth - 4, cellHeight - 4);
            }
          }
        }

        // Draw selection rectangle
        ctx.strokeStyle = '#4a9eff';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(screenX + 2, screenY + 2, objectWidth - 4, objectHeight - 4);

        // Draw corner handles
        ctx.setLineDash([]);
        ctx.fillStyle = '#4a9eff';
        const handleSize = showResizeOverlay ? 14 : 8;

        ctx.fillRect(screenX + 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(screenX + 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
        ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
      }
    }
  }

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
