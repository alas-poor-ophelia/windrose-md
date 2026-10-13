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
import type { Cell } from '#types/core/cell.types';
import type { Curve } from '#types/core/curve.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { TextLabel } from '#types/objects/note.types';
import type { ResolvedTheme } from '#types/settings/settings.types';
import type {
  RenderParams,
  ExportResult,
  ExportImageOptions
} from '#types/core/export.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { getActiveLayer, getExportLayers } from './layerAccessor';
import { getFontCss } from '../text/fontOptions';
import { renderCanvas } from '../hooks/canvas/useCanvasRenderer';
import { resolveTheme } from '../core/settingsAccessor';

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

/** Mutable bounds accumulator: grows to cover every box or padded point fed to it. */
class BoundsAccumulator {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;
  hasContent = false;

  addBox(b: BoundingBox): void {
    this.hasContent = true;
    this.minX = Math.min(this.minX, b.minX);
    this.minY = Math.min(this.minY, b.minY);
    this.maxX = Math.max(this.maxX, b.maxX);
    this.maxY = Math.max(this.maxY, b.maxY);
  }

  addPoint(x: number, y: number, pad = 0): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.addBox({ minX: x - pad, minY: y - pad, maxX: x + pad, maxY: y + pad });
  }

  result(): BoundingBox | null {
    return this.hasContent
      ? { minX: this.minX, minY: this.minY, maxX: this.maxX, maxY: this.maxY }
      : null;
  }
}

/** Storage cell for a col/row (grid) or q/r (hex) position. */
function cellAt(geometry: ExtendedGeometry, col: number, row: number): Cell {
  return geometry.type === 'hex'
    ? { q: col, r: row, color: '' }
    : { x: col, y: row, color: '' };
}

/** Tiles: snapped tiles cover their (multi-cell) footprint; freeform tiles a span-sized box at their world point. */
function addTileBounds(acc: BoundsAccumulator, tiles: TileAssignment[], geometry: ExtendedGeometry): void {
  for (const tile of tiles) {
    const spanW = Math.max(1, tile.spanW ?? 1);
    const spanH = Math.max(1, tile.spanH ?? 1);
    const scale = tile.scale ?? 1;
    if (tile.freeform === true) {
      const half = (geometry.cellSize * Math.max(spanW, spanH) * scale) / 2;
      acc.addPoint(tile.worldX, tile.worldY, half);
      continue;
    }
    acc.addBox(geometry.getCellBounds(cellAt(geometry, tile.col, tile.row)));
    if (spanW > 1 || spanH > 1) {
      acc.addBox(geometry.getCellBounds(cellAt(geometry, tile.col + spanW - 1, tile.row + spanH - 1)));
    }
  }
}

/** Curves: the control polygon contains a cubic bezier, so its bbox (plus half the stroke) bounds the curve. */
function addCurveBounds(acc: BoundsAccumulator, curves: Curve[]): void {
  for (const curve of curves) {
    const pad = (curve.strokeWidth || 0) / 2;
    acc.addPoint(curve.start[0], curve.start[1], pad);
    for (const seg of curve.segments) {
      acc.addPoint(seg[0], seg[1], pad);
      acc.addPoint(seg[2], seg[3], pad);
      acc.addPoint(seg[4], seg[5], pad);
    }
  }
}

/**
 * Wall/path strips: vertices padded by an estimate of the strip half-width.
 * The true width depends on the strip image height, which is not available
 * here; half a cell times widthScale covers typical packs.
 */
function addWallPathBounds(acc: BoundsAccumulator, wallPaths: WallPath[], cellSize: number): void {
  for (const wp of wallPaths) {
    const pad = (cellSize * (wp.widthScale > 0 ? wp.widthScale : 1)) / 2;
    for (const v of wp.vertices) acc.addPoint(v.x, v.y, pad);
  }
}

/** Terrain brush strokes: flat [x, y, ...] points padded by the brush radius. */
function addTerrainStrokeBounds(acc: BoundsAccumulator, strokes: TerrainStroke[]): void {
  for (const stroke of strokes) {
    const pad = stroke.radius || 0;
    for (let i = 0; i + 1 < stroke.points.length; i += 2) {
      acc.addPoint(stroke.points[i], stroke.points[i + 1], pad);
    }
  }
}

/**
 * Calculate the world-coordinate bounding box of all content on a layer:
 * painted cells, objects, text labels, tiles, curves, wall paths and terrain strokes.
 */
function calculateContentBounds(
  layer: MapLayer,
  geometry: ExtendedGeometry
): BoundingBox | null {
  const acc = new BoundsAccumulator();

  for (const cell of layer.cells) acc.addBox(geometry.getCellBounds(cell));
  for (const obj of layer.objects) acc.addBox(geometry.getObjectBounds(obj));

  // Text labels (need temporary canvas for measurement)
  if (layer.textLabels.length > 0) {
    const tempCanvas = activeWindow.createEl('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      for (const label of layer.textLabels) acc.addBox(getTextLabelBounds(label, tempCtx));
    }
  }

  addTileBounds(acc, layer.tiles ?? [], geometry);
  addCurveBounds(acc, layer.curves ?? []);
  addWallPathBounds(acc, layer.wallPaths ?? [], geometry.cellSize);
  addTerrainStrokeBounds(acc, layer.terrainStrokes ?? []);

  return acc.result();
}

/**
 * Bounds of map-level (not per-layer) content that has world extent:
 * visible shape overlays, visible regions (hex members) and visible outlines.
 */
function calculateMapLevelBounds(mapData: MapData, geometry: ExtendedGeometry): BoundingBox | null {
  const acc = new BoundsAccumulator();

  for (const shape of mapData.shapeOverlays ?? []) {
    if (shape.visible === false) continue;
    const { x, y } = shape.worldPosition;
    if (shape.shape === 'circle') {
      acc.addPoint(x, y, shape.size);
      continue;
    }
    const hw = shape.halfWidth ?? shape.size;
    const hh = shape.halfHeight ?? shape.size;
    const rot = (((shape.rotation ?? 0) % 180) + 180) % 180;
    if (rot === 0) {
      acc.addBox({ minX: x - hw, minY: y - hh, maxX: x + hw, maxY: y + hh });
    } else if (rot === 90) {
      acc.addBox({ minX: x - hh, minY: y - hw, maxX: x + hh, maxY: y + hw });
    } else {
      acc.addPoint(x, y, Math.hypot(hw, hh));
    }
  }

  for (const region of mapData.regions ?? []) {
    if (region.visible === false) continue;
    for (const hex of region.hexes) acc.addBox(geometry.getCellBounds(cellAt(geometry, hex.x, hex.y)));
  }

  for (const outline of mapData.outlines ?? []) {
    if (outline.visible === false) continue;
    const pad = (outline.lineWidth || 0) / 2;
    for (const v of outline.vertices) acc.addPoint(v.x, v.y, pad);
  }

  return acc.result();
}

/** Union of two optional bounds. */
function unionBounds(a: BoundingBox | null, b: BoundingBox | null): BoundingBox | null {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY)
  };
}

/**
 * World bounds of everything an export of `layers` will draw: per-layer
 * content for each selected layer plus map-level overlays.
 */
function calculateExportBounds(
  mapData: MapData,
  layers: MapLayer[],
  geometry: ExtendedGeometry
): BoundingBox | null {
  let bounds: BoundingBox | null = null;
  for (const layer of layers) bounds = unionBounds(bounds, calculateContentBounds(layer, geometry));
  return unionBounds(bounds, calculateMapLevelBounds(mapData, geometry));
}

/**
 * Theme used for image export: the map's effective theme (global settings
 * with the map's per-map overrides applied), identical to the on-screen one.
 */
function getExportTheme(mapData: MapData): ResolvedTheme {
  return resolveTheme(mapData.settings);
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
  bounds: BoundingBox
): StoredViewState {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  if (geometry.type !== 'hex') {
    return { zoom: 1, center: { x: cx / geometry.cellSize, y: cy / geometry.cellSize } };
  }
  return { zoom: 1, center: { x: cx, y: cy } };
}

/**
 * Render map content to a canvas context using the same rendering logic as the main canvas.
 */
function renderMapToCanvas(
  ctx: CanvasRenderingContext2D,
  params: RenderParams,
  options: ExportImageOptions
): void {
  const { mapData, geometry, bounds, width, height } = params;

  const tempCanvas = activeWindow.createEl('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;

  const theme = getExportTheme(mapData);

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
      liveViewState: exportViewStateForBounds(geometry, bounds)
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

  // Calculate content bounds across every selected layer plus map-level overlays
  const bounds = calculateExportBounds(mapData, exportLayers, geometry);

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
  
  // Calculate canvas dimensions
  const width = Math.ceil(exportBounds.maxX - exportBounds.minX);
  const height = Math.ceil(exportBounds.maxY - exportBounds.minY);
  
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
    height
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

export { calculateExportBounds, exportViewStateForBounds, getExportTheme, saveMapImageToVault };