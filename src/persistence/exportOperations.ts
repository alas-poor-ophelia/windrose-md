/**
 * exportOperations.ts
 * 
 * Functions for exporting map as image.
 * Handles content bounds calculation, rendering to offscreen canvas,
 * and triggering browser download.
 */

// Type-only imports
import type { BoundingBox } from '#types/core/geometry.types';
import type { MapData, MapLayer, StoredViewState } from '#types/core/map.types';
import type { TextLabel } from '#types/objects/note.types';
import type {
  RenderParams,
  ExportResult,
  ExportTheme,
  ExportImageOptions
} from '#types/core/export.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { allAuthoredCells, authoredLevels, getActiveLayer, getExportLayers } from './layerAccessor';
import { ladderForAuthoredRungs } from './resizeOperations';
import { HexGeometry } from '../geometry/core/HexGeometry';
import { crossingZoom } from '../geometry/core/lattice';
import type { LadderParams } from '../geometry/core/lattice';
import { isDepthQuarantined, isLadderView } from '../core/lodFlags';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';
import { getFontCss } from '../text/fontOptions';
import { renderCanvas } from '../hooks/canvas/useCanvasRenderer';
import { getSettings } from '../core/settingsAccessor';

// ===========================================
// Text Label Bounds
// ===========================================

/**
 * Calculate the bounding box of a text label in world coordinates.
 * Uses canvas text measurement API to get accurate bounds.
 */
function getTextLabelBounds(label: TextLabel, ctx: CanvasRenderingContext2D): BoundingBox {
  // Set font for measurement
  const fontSize = label.fontSize || 16;
  const fontFace = label.fontFace || 'sans';
  const fontFamily = getFontCss(fontFace);
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  // Measure text
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  
  // Estimate text height (approximation since canvas doesn't provide exact height)
  const textHeight = fontSize * 1.2;
  
  // Text labels use position.x and position.y
  const worldX = label.position.x;
  const worldY = label.position.y;
  
  // Text is positioned at its center point
  const minX = worldX - textWidth / 2;
  const minY = worldY - textHeight / 2;
  const maxX = worldX + textWidth / 2;
  const maxY = worldY + textHeight / 2;
  
  return { minX, minY, maxX, maxY };
}

// ===========================================
// Content Bounds Calculation
// ===========================================

/**
 * Calculate the world-coordinate bounding box of all content on a layer.
 * Rung (>= 1) cells are measured with their rung's own geometry and are only
 * included when a `ladder` is supplied; classic maps have none.
 */
function calculateContentBounds(
  layer: MapLayer,
  geometry: ExtendedGeometry,
  ladder: GeometryLadder | null = null
): BoundingBox | null {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  let hasContent = false;
  
  // 1. Painted cells (level 0, then every authored rung)
  for (const { level, cell } of allAuthoredCells(layer)) {
    if (level > 0 && ladder === null) continue;
    hasContent = true;
    const bounds = level === 0 || ladder === null
      ? geometry.getCellBounds(cell)
      : ladder.geometryForLevel(level).getCellBounds(cell);
    minX = Math.min(minX, bounds.minX);
    minY = Math.min(minY, bounds.minY);
    maxX = Math.max(maxX, bounds.maxX);
    maxY = Math.max(maxY, bounds.maxY);
  }

  // 2. Objects
  if (layer.objects.length > 0) {
    for (const obj of layer.objects) {
      hasContent = true;
      const bounds = geometry.getObjectBounds(obj);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }

  // 3. Text labels (need temporary canvas for measurement)
  if (layer.textLabels.length > 0) {
    const tempCanvas = activeWindow.createEl('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      for (const label of layer.textLabels) {
        hasContent = true;
        const bounds = getTextLabelBounds(label, tempCtx);
        minX = Math.min(minX, bounds.minX);
        minY = Math.min(minY, bounds.minY);
        maxX = Math.max(maxX, bounds.maxX);
        maxY = Math.max(maxY, bounds.maxY);
      }
    }
  }
  
  if (!hasContent) return null;
  
  return { minX, minY, maxX, maxY };
}

// ===========================================
// Canvas Rendering
// ===========================================

/**
 * View state that frames `bounds` on a canvas sized exactly to them.
 *
 * renderCanvas positions content from a center + zoom (calculateViewportOffset),
 * so exporting with the map's live viewState produced a crop of whatever the
 * user was looking at. Zoom is fixed at 1 (bounds are in unzoomed world px);
 * grid centers are expressed in cell units, hex centers in world px.
 */
function exportViewStateForBounds(
  geometry: { type: string; cellSize: number },
  bounds: BoundingBox,
  zoom = 1
): StoredViewState {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (geometry.type !== 'hex') {
    return { zoom, center: { x: cx / geometry.cellSize, y: cy / geometry.cellSize } };
  }
  return { zoom, center: { x: cx, y: cy } };
}

/** Deepest rung >= 1 holding authored cells across `layers`; 0 when none. */
function deepestAuthoredLevel(layers: readonly MapLayer[]): number {
  let deepest = 0;
  for (const layer of layers) {
    const levels = authoredLevels(layer);
    const last = levels.length > 0 ? levels[levels.length - 1] : 0;
    if (last > deepest) deepest = last;
  }
  return deepest;
}

/** Render params plus the deep-export terms; all absent on a classic export. */
type LadderRenderParams = RenderParams & { ladder?: GeometryLadder | null; level?: number; zoom?: number };

/** Longest side of a ladder export canvas, in px; well under every browser's canvas limit. */
const MAX_LADDER_EXPORT_SIDE = 8192;

/**
 * Export zoom for rung `level`: the rung's crossing zoom, so its cells are at
 * least `minCellPx` wide and crisp, never below 1 (the classic export scale),
 * and scaled back so neither canvas side exceeds MAX_LADDER_EXPORT_SIDE. When
 * the cap bites the rung still renders (the `level` option forces it); only its
 * crispness is lost. Level 0 is always exactly 1.
 */
function exportZoomForLevel(level: number, params: LadderParams, worldWidth: number, worldHeight: number): number {
  if (level <= 0) return 1;
  const wanted = Math.max(1, crossingZoom(level, params));
  const longest = Math.max(worldWidth, worldHeight, 1);
  return Math.max(1, Math.min(wanted, MAX_LADDER_EXPORT_SIDE / longest));
}

/**
 * Render map content to a canvas context using the same rendering logic as the main canvas.
 */
function renderMapToCanvas(
  ctx: CanvasRenderingContext2D,
  params: LadderRenderParams,
  options: ExportImageOptions
): void {
  const { mapData, geometry, bounds, width, height, ladder = null, level = 0, zoom = 1 } = params;

  const tempCanvas = activeWindow.createEl('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;

  const effectiveSettings = getSettings();

  const theme: ExportTheme = {
    grid: {
      lines: effectiveSettings.gridLineColor,
      lineWidth: effectiveSettings.gridLineWidth,
      background: effectiveSettings.backgroundColor
    },
    cells: {
      fill: '#c4a57b',
      border: effectiveSettings.borderColor,
      borderWidth: 2
    },
    compass: {
      color: '#c4a57b',
      size: 100
    },
    decorativeBorder: {
      color: '#8b7355',
      width: 20,
      pattern: 'fancy'
    },
    coordinateKey: effectiveSettings.coordinateKeyColor
  };

  renderCanvas(
    tempCanvas,
    null,
    mapData,
    geometry,
    [],
    {
      isResizeMode: false,
      theme,
      showCoordinates: false,
      layerVisibility: options.visibility,
      exportLayers: options.layers,
      liveViewState: exportViewStateForBounds(geometry, bounds, zoom),
      // Only a deep export carries a ladder; it draws straight to the canvas.
      ...(ladder !== null ? { ladder, level, bypassSurfaceCache: true } : {})
    }
  );

  ctx.drawImage(tempCanvas, 0, 0);
}

// ===========================================
// Image Export
// ===========================================

/**
 * Export map as PNG image
 */
async function exportMapAsImage(
  mapData: MapData,
  geometry: ExtendedGeometry,
  options: ExportImageOptions
): Promise<Blob> {
  const buffer = options.buffer ?? 20;
  const exportLayers = getExportLayers(mapData, options.layers);

  if (exportLayers.length === 0) {
    throw new Error('No layers selected to export');
  }

  // Objects, text labels and fog always come from the active layer. When the
  // active layer is excluded, re-point the export at the topmost selected layer
  // so an unselected layer's content can never leak into the image.
  const activeLayer = getActiveLayer(mapData);
  const exportMapData: MapData = exportLayers.some(layer => layer.id === activeLayer.id)
    ? mapData
    : { ...mapData, activeLayerId: exportLayers[exportLayers.length - 1].id };

  // Calculate content bounds across every selected layer
  let bounds: BoundingBox | null = null;
  const ladder = geometry instanceof HexGeometry ? ladderForAuthoredRungs(mapData, geometry) : null;
  for (const layer of exportLayers) {
    const layerBounds = calculateContentBounds(layer, geometry, ladder);
    if (!layerBounds) continue;
    bounds = bounds === null ? layerBounds : {
      minX: Math.min(bounds.minX, layerBounds.minX),
      minY: Math.min(bounds.minY, layerBounds.minY),
      maxX: Math.max(bounds.maxX, layerBounds.maxX),
      maxY: Math.max(bounds.maxY, layerBounds.maxY)
    };
  }

  if (!bounds) {
    throw new Error('No content to export');
  }

  // Add buffer
  const exportBounds: BoundingBox = {
    minX: bounds.minX - buffer,
    minY: bounds.minY - buffer,
    maxX: bounds.maxX + buffer,
    maxY: bounds.maxY + buffer
  };
  
  // Deep export (design 06 s19 item 8): paint the deepest authored rung of the
  // exported layers. A quarantined or non-ladder map renders level 0 as usual.
  const deepLevel = ladder !== null && isLadderView(mapData) && !isDepthQuarantined(mapData).quarantined
    ? deepestAuthoredLevel(exportLayers)
    : 0;
  const renderLadder = deepLevel > 0 ? ladder : null;
  const worldWidth = exportBounds.maxX - exportBounds.minX;
  const worldHeight = exportBounds.maxY - exportBounds.minY;
  const zoom = renderLadder !== null ? exportZoomForLevel(deepLevel, renderLadder.params, worldWidth, worldHeight) : 1;

  // Calculate canvas dimensions
  const width = Math.ceil(worldWidth * zoom);
  const height = Math.ceil(worldHeight * zoom);
  
  // Create offscreen canvas
  const canvas = activeWindow.createEl('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  
  // Render map to canvas
  renderMapToCanvas(ctx, {
    mapData: exportMapData,
    geometry,
    bounds: exportBounds,
    width,
    height,
    ladder: renderLadder,
    level: deepLevel,
    zoom
  }, options);
  
  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Failed to create image blob'));
      }
    }, 'image/png');
  });
}

/**
 * Save exported image to vault root
 */
async function saveMapImageToVault(
  app: App,
  mapData: MapData,
  geometry: ExtendedGeometry,
  options: ExportImageOptions,
  filename?: string
): Promise<ExportResult> {
  try {
    const blob = await exportMapAsImage(mapData, geometry, options);
    
    // Convert blob to array buffer
    const arrayBuffer = await blob.arrayBuffer();
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const mapName = mapData.name ?? 'map';
    const safeName = (filename ?? `${mapName}-${timestamp}.png`).replace(/[\\/:*?"<>|]/g, '_');

    const existingFile = app.vault.getAbstractFileByPath(safeName);
    if (existingFile instanceof TFile) {
      await app.vault.modifyBinary(existingFile, arrayBuffer);
    } else {
      await app.vault.createBinary(safeName, arrayBuffer);
    }

    return { success: true, path: safeName };
  } catch (error) {
    console.error('[exportOperations] Export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ===========================================
// Exports
// ===========================================

export { calculateContentBounds, deepestAuthoredLevel, exportZoomForLevel, exportViewStateForBounds, renderMapToCanvas, exportMapAsImage, saveMapImageToVault };