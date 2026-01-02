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
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.ts") as {
  getTheme: () => RendererTheme;
  getEffectiveSettings: (settings: MapData['settings']) => Record<string, unknown>;
};
const { buildCellLookup, calculateBordersOptimized } = await requireModuleByName("borderCalculator.js") as {
  buildCellLookup: (cells: Cell[]) => CellMap;
  calculateBordersOptimized: (cell: Cell, lookup: CellMap) => { top: boolean; right: boolean; bottom: boolean; left: boolean };
};
const { getObjectType } = await requireModuleByName("objectOperations.ts") as {
  getObjectType: (typeId: string) => ObjectTypeDef | null;
};
const { getRenderChar } = await requireModuleByName("objectTypeResolver.js") as {
  getRenderChar: (objType: ObjectTypeDef) => { char: string; isIcon: boolean };
};
const { getCellColor } = await requireModuleByName("colorOperations.ts") as {
  getCellColor: (cell: Cell) => string;
};
const { getFontCss } = await requireModuleByName("fontOptions.js") as {
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
const { getCachedImage } = await requireModuleByName("imageOperations.js") as {
  getCachedImage: (path: string) => HTMLImageElement | null;
};
const { getSlotOffset, getMultiObjectScale, getObjectsInCell } = await requireModuleByName("hexSlotPositioner.js") as {
  getSlotOffset: (slot: number, count: number, orientation: string) => { offsetX: number; offsetY: number };
  getMultiObjectScale: (count: number) => number;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
};
const { offsetToAxial, axialToOffset } = await requireModuleByName("offsetCoordinates.js") as {
  offsetToAxial: (col: number, row: number, orientation: string) => { q: number; r: number };
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number };
};
const { getActiveLayer, isCellFogged } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  isCellFogged: (layer: MapLayer, col: number, row: number) => boolean;
};

/**
 * Get appropriate renderer for geometry type
 */
function getRenderer(geometry: IGeometry): Renderer {
  return geometry instanceof HexGeometry ? hexRenderer : gridRenderer;
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
      const orientation = mapData.orientation || 'flat';
      const hexGeom = geometry as InstanceType<typeof HexGeometry>;

      let minWorldX = Infinity, maxWorldX = -Infinity;
      let minWorldY = Infinity, maxWorldY = -Infinity;

      const corners = [
        { col: 0, row: 0 },
        { col: mapData.hexBounds.maxCol - 1, row: 0 },
        { col: 0, row: mapData.hexBounds.maxRow - 1 },
        { col: mapData.hexBounds.maxCol - 1, row: mapData.hexBounds.maxRow - 1 }
      ];

      for (const corner of corners) {
        const { q, r } = offsetToAxial(corner.col, corner.row, orientation);
        const worldPos = hexGeom.hexToWorld(q, r);

        if (worldPos.worldX < minWorldX) minWorldX = worldPos.worldX;
        if (worldPos.worldX > maxWorldX) maxWorldX = worldPos.worldX;
        if (worldPos.worldY < minWorldY) minWorldY = worldPos.worldY;
        if (worldPos.worldY > maxWorldY) maxWorldY = worldPos.worldY;
      }

      const hexExtentX = hexGeom.hexSize;
      const hexExtentY = hexGeom.hexSize * hexGeom.sqrt3 / 2;

      minWorldX -= hexExtentX;
      maxWorldX += hexExtentX;
      minWorldY -= hexExtentY;
      maxWorldY += hexExtentY;

      const worldCenterX = (minWorldX + maxWorldX) / 2;
      const worldCenterY = (minWorldY + maxWorldY) / 2;

      const imgWidth = bgImage.naturalWidth;
      const imgHeight = bgImage.naturalHeight;

      const imgOffsetX = mapData.backgroundImage.offsetX ?? 0;
      const imgOffsetY = mapData.backgroundImage.offsetY ?? 0;

      const screenCenterX = offsetX + worldCenterX * zoom;
      const screenCenterY = offsetY + worldCenterY * zoom;
      const screenX = screenCenterX - (imgWidth * zoom) / 2 + (imgOffsetX * zoom);
      const screenY = screenCenterY - (imgHeight * zoom) / 2 + (imgOffsetY * zoom);

      const opacity = mapData.backgroundImage.opacity ?? 1;
      if (opacity < 1) {
        ctx.save();
        ctx.globalAlpha = opacity;
      }

      ctx.drawImage(bgImage, screenX, screenY, imgWidth * zoom, imgHeight * zoom);

      if (opacity < 1) {
        ctx.restore();
      }
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

  // Draw filled cells
  if (activeLayer.cells && activeLayer.cells.length > 0) {
    const cellsWithColor = activeLayer.cells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));

    const { simpleCells, segmentCells } = segmentRenderer.separateCellsByType(cellsWithColor);

    if (simpleCells.length > 0) {
      renderer.renderPaintedCells(ctx, simpleCells, geometry, rendererViewState);
    }

    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
      segmentRenderer.renderSegmentCells(ctx, segmentCells, geometry, rendererViewState);
    }

    if (renderer.renderInteriorGridLines && cellsWithColor.length > 0) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, rendererViewState, {
        lineColor: THEME.grid.lines,
        lineWidth: THEME.grid.lineWidth || 1,
        interiorRatio: 0.5
      });
    }

    const allCellsLookup = buildCellLookup(cellsWithColor);

    if (simpleCells.length > 0) {
      renderer.renderCellBorders(
        ctx,
        simpleCells,
        geometry,
        rendererViewState,
        () => allCellsLookup,
        calculateBordersOptimized,
        {
          border: THEME.cells.border,
          borderWidth: THEME.cells.borderWidth
        }
      );
    }

    if (segmentCells.length > 0 && geometry instanceof GridGeometry) {
      segmentRenderer.renderSegmentBorders(
        ctx,
        segmentCells,
        cellsWithColor,
        geometry,
        rendererViewState,
        {
          border: THEME.cells.border,
          borderWidth: THEME.cells.borderWidth
        }
      );
    }
  }

  // Draw painted edges (grid maps only)
  if (activeLayer.edges && activeLayer.edges.length > 0 && geometry instanceof GridGeometry && renderer.renderEdges) {
    renderer.renderEdges(ctx, activeLayer.edges, geometry, rendererViewState, {
      lineWidth: 1,
      borderWidth: THEME.cells.borderWidth
    });
  }

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
        const maxBadgeSize = Math.min(objectWidth, objectHeight) * 0.3;
        const badgeSize = Math.min(maxBadgeSize, Math.max(8, scaledSize * 0.25));
        const badgeX = screenX + objectWidth - badgeSize - 3;
        const badgeY = screenY + 3;

        ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(badgeX + badgeSize / 2, badgeY + badgeSize / 2, badgeSize / 2, 0, Math.PI * 2);
        ctx.fill();

        const badgeFontSize = badgeSize * 0.7;
        ctx.font = `${badgeFontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\u{1F4DC}', badgeX + badgeSize / 2, badgeY + badgeSize / 2);
      }

      // Draw note indicator for custom tooltip
      if (obj.customTooltip) {
        const indicatorSize = Math.max(4, scaledSize * 0.12);
        const indicatorX = screenX + objectWidth - indicatorSize - 2;
        const indicatorY = screenY + objectHeight - indicatorSize - 2;

        ctx.fillStyle = '#4a9eff';
        ctx.beginPath();
        ctx.arc(indicatorX + indicatorSize / 2, indicatorY + indicatorSize / 2, indicatorSize / 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }

  // Draw text labels
  if (activeLayer.textLabels && activeLayer.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    for (const label of activeLayer.textLabels) {
      ctx.save();

      const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);

      ctx.translate(screenX, screenY);
      ctx.rotate(((label.rotation || 0) * Math.PI) / 180);

      const fontSize = label.fontSize * zoom;
      const fontFamily = getFontCss(label.fontFace || 'sans');
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(label.content, 0, 0);

      ctx.fillStyle = label.color || '#ffffff';
      ctx.fillText(label.content, 0, 0);

      ctx.restore();
    }
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
    const fow = activeLayer.fogOfWar;

    const effectiveSettings = getEffectiveSettings(mapData.settings) as Record<string, unknown>;
    const fowColor = (effectiveSettings.fogOfWarColor as string) || '#000000';
    const fowOpacity = (effectiveSettings.fogOfWarOpacity as number) ?? 0.9;
    const fowImagePath = effectiveSettings.fogOfWarImage as string | undefined;
    const fowBlurEnabled = (effectiveSettings.fogOfWarBlurEnabled as boolean) ?? false;
    const fowBlurFactor = (effectiveSettings.fogOfWarBlurFactor as number) ?? 0.08;

    let fowFillStyle: string | CanvasPattern = fowColor;
    let useGlobalAlpha = true;

    if (fowImagePath) {
      const fowImage = getCachedImage(fowImagePath);
      if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
        try {
          const pattern = ctx.createPattern(fowImage, 'repeat');
          if (pattern) {
            fowFillStyle = pattern;
          }
        } catch (e) {
          // Pattern creation failed
        }
      }
    }

    let blurRadius = 0;
    if (fowBlurEnabled) {
      const cellSize = geometry instanceof HexGeometry ? (geometry as InstanceType<typeof HexGeometry>).hexSize : (geometry as InstanceType<typeof GridGeometry>).cellSize;
      blurRadius = cellSize * fowBlurFactor * zoom;
    }

    let fogCtx: CanvasRenderingContext2D | null = null;
    if (fogCanvas && fowBlurEnabled && blurRadius > 0) {
      fogCtx = fogCanvas.getContext('2d');

      if (fogCtx) {
        if (fogCanvas.width !== width || fogCanvas.height !== height) {
          fogCanvas.width = width;
          fogCanvas.height = height;
        }

        const cssBlurAmount = Math.max(4, blurRadius * 0.6);
        fogCanvas.style.filter = `blur(${cssBlurAmount}px)`;

        fogCtx.clearRect(0, 0, width, height);

        fogCtx.save();
        fogCtx.translate(width / 2, height / 2);
        fogCtx.rotate((northDirection * Math.PI) / 180);
        fogCtx.translate(-width / 2, -height / 2);

        fogCtx.fillStyle = fowColor;

        if (fowImagePath) {
          const fowImage = getCachedImage(fowImagePath);
          if (fowImage && fowImage.complete && fowImage.naturalWidth > 0) {
            const fogPattern = fogCtx.createPattern(fowImage, 'repeat');
            if (fogPattern) {
              fogCtx.fillStyle = fogPattern;
            }
          }
        }
      }
    }

    ctx.fillStyle = fowFillStyle;

    const previousGlobalAlpha = ctx.globalAlpha;
    if (useGlobalAlpha) {
      ctx.globalAlpha = fowOpacity;
    }

    // Calculate visible bounds
    let visibleMinCol: number, visibleMaxCol: number, visibleMinRow: number, visibleMaxRow: number;

    if (geometry instanceof HexGeometry) {
      const bounds = mapData.hexBounds || { maxCol: 100, maxRow: 100 };
      visibleMinCol = 0;
      visibleMaxCol = bounds.maxCol;
      visibleMinRow = 0;
      visibleMaxRow = bounds.maxRow;
    } else {
      visibleMinCol = Math.floor((0 - offsetX) / scaledSize) - 1;
      visibleMaxCol = Math.ceil((width - offsetX) / scaledSize) + 1;
      visibleMinRow = Math.floor((0 - offsetY) / scaledSize) - 1;
      visibleMaxRow = Math.ceil((height - offsetY) / scaledSize) + 1;

      const maxBound = mapData.dimensions ? Math.max(mapData.dimensions.width, mapData.dimensions.height) : 200;
      visibleMinCol = Math.max(0, visibleMinCol);
      visibleMaxCol = Math.min(maxBound, visibleMaxCol);
      visibleMinRow = Math.max(0, visibleMinRow);
      visibleMaxRow = Math.min(maxBound, visibleMaxRow);
    }

    // Render fog cells
    if (geometry instanceof HexGeometry) {
      const hexGeom = geometry as InstanceType<typeof HexGeometry>;
      const orientation = mapData.orientation || 'flat';

      const foggedSet = new Set(fow.foggedCells.map(c => `${c.col},${c.row}`));

      const visibleFogCells: Array<{ col: number; row: number }> = [];
      const edgeCells: Array<{ col: number; row: number; q: number; r: number }> = [];

      for (const fogCell of fow.foggedCells) {
        const { col, row } = fogCell;

        if (col < visibleMinCol || col > visibleMaxCol ||
            row < visibleMinRow || row > visibleMaxRow) {
          continue;
        }

        visibleFogCells.push({ col, row });

        const { q, r } = offsetToAxial(col, row, orientation);
        const neighbors = hexGeom.getNeighbors(q, r);
        const isEdge = neighbors.some(n => {
          const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
          return !foggedSet.has(`${nCol},${nRow}`);
        });

        if (isEdge) {
          edgeCells.push({ col, row, q, r });
        }
      }

      // Helper to trace hex path
      const traceHexPath = (q: number, r: number, scale = 1.0) => {
        const vertices = hexGeom.getHexVertices(q, r);

        if (scale === 1.0) {
          const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
          ctx.moveTo(first.screenX, first.screenY);
          for (let i = 1; i < vertices.length; i++) {
            const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
            ctx.lineTo(vertex.screenX, vertex.screenY);
          }
        } else {
          const center = hexGeom.hexToWorld(q, r);
          const screenCenter = geometry.worldToScreen(center.worldX, center.worldY, offsetX, offsetY, zoom);

          const scaledVertices = vertices.map(v => {
            const screen = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
            return {
              screenX: screenCenter.screenX + (screen.screenX - screenCenter.screenX) * scale,
              screenY: screenCenter.screenY + (screen.screenY - screenCenter.screenY) * scale
            };
          });

          ctx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
          for (let i = 1; i < scaledVertices.length; i++) {
            ctx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
          }
        }
        ctx.closePath();
      };

      const traceHexPathOnFog = (q: number, r: number, scale = 1.0) => {
        if (!fogCtx) return;

        const vertices = hexGeom.getHexVertices(q, r);

        if (scale === 1.0) {
          const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
          fogCtx.moveTo(first.screenX, first.screenY);
          for (let i = 1; i < vertices.length; i++) {
            const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
            fogCtx.lineTo(vertex.screenX, vertex.screenY);
          }
        } else {
          const center = hexGeom.hexToWorld(q, r);
          const screenCenter = geometry.worldToScreen(center.worldX, center.worldY, offsetX, offsetY, zoom);

          const scaledVertices = vertices.map(v => {
            const screen = geometry.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom);
            return {
              screenX: screenCenter.screenX + (screen.screenX - screenCenter.screenX) * scale,
              screenY: screenCenter.screenY + (screen.screenY - screenCenter.screenY) * scale
            };
          });

          fogCtx.moveTo(scaledVertices[0].screenX, scaledVertices[0].screenY);
          for (let i = 1; i < scaledVertices.length; i++) {
            fogCtx.lineTo(scaledVertices[i].screenX, scaledVertices[i].screenY);
          }
        }
        fogCtx.closePath();
      };

      // Blur passes
      if (fowBlurEnabled && blurRadius > 0 && edgeCells.length > 0) {
        const baseOpacity = fowOpacity;
        const numPasses = 8;
        const maxExpansion = blurRadius / (hexGeom.hexSize * zoom);

        const targetCtx = fogCtx || ctx;
        const useFilterFallback = !fogCtx;
        const filterBlurAmount = blurRadius / numPasses;

        for (let i = 0; i < numPasses; i++) {
          const t = i / (numPasses - 1);
          const scale = 1.0 + (maxExpansion * (1.0 - t));
          const opacity = 0.50 + (0.30 * t);

          if (useFilterFallback) {
            const passBlur = filterBlurAmount * (1.5 - t);
            targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
          }

          targetCtx.beginPath();
          for (const { q, r } of edgeCells) {
            if (fogCtx) {
              traceHexPathOnFog(q, r, scale);
            } else {
              traceHexPath(q, r, scale);
            }
          }
          targetCtx.globalAlpha = baseOpacity * opacity;
          targetCtx.fill();
        }

        if (useFilterFallback) {
          ctx.filter = 'none';
        }

        ctx.globalAlpha = useGlobalAlpha ? fowOpacity : 1;
      }

      // Final pass: all fog cells
      ctx.beginPath();
      for (const { col, row } of visibleFogCells) {
        const { q, r } = offsetToAxial(col, row, orientation);
        traceHexPath(q, r, 1.0);
      }
      ctx.fill();

      // Draw interior hex outlines
      if (visibleFogCells.length > 1) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = Math.max(1, 1 * zoom);

        for (const { col, row } of visibleFogCells) {
          const { q, r } = offsetToAxial(col, row, orientation);

          const neighbors = hexGeom.getNeighbors(q, r);
          const hasFoggedNeighbor = neighbors.some(n => {
            const { col: nCol, row: nRow } = axialToOffset(n.q, n.r, orientation);
            return foggedSet.has(`${nCol},${nRow}`);
          });

          if (hasFoggedNeighbor) {
            const vertices = hexGeom.getHexVertices(q, r);

            ctx.beginPath();
            const first = geometry.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
            ctx.moveTo(first.screenX, first.screenY);

            for (let i = 1; i < vertices.length; i++) {
              const vertex = geometry.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
              ctx.lineTo(vertex.screenX, vertex.screenY);
            }

            ctx.closePath();
            ctx.stroke();
          }
        }
      }

    } else {
      // Grid map fog rendering
      const foggedSet = new Set(fow.foggedCells.map(c => `${c.col},${c.row}`));

      const visibleFogCells: Array<{ col: number; row: number }> = [];
      const edgeCells: Array<{ col: number; row: number }> = [];

      for (const fogCell of fow.foggedCells) {
        const { col, row } = fogCell;

        if (col < visibleMinCol || col > visibleMaxCol ||
            row < visibleMinRow || row > visibleMaxRow) {
          continue;
        }

        visibleFogCells.push({ col, row });

        const isEdge = !foggedSet.has(`${col - 1},${row}`) ||
                       !foggedSet.has(`${col + 1},${row}`) ||
                       !foggedSet.has(`${col},${row - 1}`) ||
                       !foggedSet.has(`${col},${row + 1}`);

        if (isEdge) {
          edgeCells.push({ col, row });
        }
      }

      const addCircleToPath = (targetCtx: CanvasRenderingContext2D, col: number, row: number, radius: number) => {
        const centerX = offsetX + col * scaledSize + scaledSize / 2;
        const centerY = offsetY + row * scaledSize + scaledSize / 2;
        targetCtx.moveTo(centerX + radius, centerY);
        targetCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      };

      const addRectToPath = (col: number, row: number, scale = 1.0) => {
        const centerX = offsetX + col * scaledSize + scaledSize / 2;
        const centerY = offsetY + row * scaledSize + scaledSize / 2;
        const size = scaledSize * scale;
        const halfSize = size / 2;
        ctx.rect(centerX - halfSize, centerY - halfSize, size, size);
      };

      // Blur passes
      if (fowBlurEnabled && blurRadius > 0 && edgeCells.length > 0) {
        const baseOpacity = fowOpacity;
        const numPasses = 8;

        const cellRadius = scaledSize / 2;
        const maxRadius = cellRadius + blurRadius;

        const targetCtx = fogCtx || ctx;
        const useFilterFallback = !fogCtx;
        const filterBlurAmount = blurRadius / numPasses;

        for (let i = 0; i < numPasses; i++) {
          const t = i / (numPasses - 1);
          const radius = maxRadius - (blurRadius * t);
          const opacity = 0.50 + (0.30 * t);

          if (useFilterFallback) {
            const passBlur = filterBlurAmount * (1.5 - t);
            targetCtx.filter = passBlur > 0.5 ? `blur(${passBlur}px)` : 'none';
          }

          targetCtx.beginPath();
          for (const { col, row } of edgeCells) {
            addCircleToPath(targetCtx, col, row, radius);
          }
          targetCtx.globalAlpha = baseOpacity * opacity;
          targetCtx.fill();
        }

        if (useFilterFallback) {
          ctx.filter = 'none';
        }

        ctx.globalAlpha = useGlobalAlpha ? fowOpacity : 1;
      }

      // Final pass
      ctx.beginPath();
      for (const { col, row } of visibleFogCells) {
        addRectToPath(col, row, 1.0);
      }
      ctx.fill();

      // Draw interior grid lines
      if (visibleFogCells.length > 1) {
        const drawnLines = new Set<string>();

        const interiorLineWidth = Math.max(1, 1 * zoom * 0.5);
        const halfWidth = interiorLineWidth / 2;

        ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';

        for (const { col, row } of visibleFogCells) {
          const screenX = offsetX + col * scaledSize;
          const screenY = offsetY + row * scaledSize;

          if (foggedSet.has(`${col + 1},${row}`)) {
            const lineKey = `v:${col + 1},${row}`;
            if (!drawnLines.has(lineKey)) {
              ctx.fillRect(screenX + scaledSize - halfWidth, screenY, interiorLineWidth, scaledSize);
              drawnLines.add(lineKey);
            }
          }

          if (foggedSet.has(`${col},${row + 1}`)) {
            const lineKey = `h:${col},${row + 1}`;
            if (!drawnLines.has(lineKey)) {
              ctx.fillRect(screenX, screenY + scaledSize - halfWidth, scaledSize, interiorLineWidth);
              drawnLines.add(lineKey);
            }
          }
        }
      }
    }

    // Restore fog canvas context
    if (fogCtx) {
      fogCtx.restore();
    }

    // Restore globalAlpha
    if (useGlobalAlpha) {
      ctx.globalAlpha = previousGlobalAlpha;
    }
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
