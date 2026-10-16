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

import { allAuthoredCells, authoredLevels, getActiveLayer, getExportLayers } from './layerAccessor';
import { ladderForAuthoredRungs } from './resizeOperations';
import { HexGeometry } from '../geometry/core/HexGeometry';
import { crossingZoom } from '../geometry/core/lattice';
import type { LadderParams } from '../geometry/core/lattice';
import { isDepthQuarantined, isLadderView } from '../core/lodFlags';
import { overrideRungFor } from '../geometry/renderers/elementBands';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';
import { getFontCss } from '../text/fontOptions';
import { cellsCoveredByAssignment } from '../assets/tileFootprint';
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
function cellAt(geometry: { type: string }, col: number, row: number): Cell {
  return geometry.type === 'hex'
    ? { q: col, r: row, color: '' }
    : { x: col, y: row, color: '' };
}

/**
 * The ladder an export measures and paints rungs with, or null for a level-0
 * export. Same condition as the render's deep path: a ladder view that is not
 * quarantined (a rotated map renders level 0, so its rungs must not widen the
 * frame either).
 */
function exportLadderFor(mapData: MapData, geometry: ExtendedGeometry): GeometryLadder | null {
  if (!(geometry instanceof HexGeometry)) return null;
  if (!isLadderView(mapData) || isDepthQuarantined(mapData).quarantined) return null;
  return ladderForAuthoredRungs(mapData, geometry);
}

/**
 * World bounds of one placed tile on the geometry of its rung, or null when it
 * has no extent. A snapped tile is bounded by its cell footprint; a freeform
 * stamp by its drop cell's box re-centred on its world position, scaled by the
 * tile scale and its largest span.
 */
function tileBounds(tile: TileAssignment, geometry: { type: string; getCellBounds(cell: Cell): BoundingBox }): BoundingBox | null {
  if (tile.freeform === true) {
    const drop = geometry.getCellBounds(cellAt(geometry, tile.col, tile.row));
    if (tile.worldX == null || tile.worldY == null) return drop;
    const factor = (tile.scale ?? 1) * Math.max(1, tile.spanW ?? 1, tile.spanH ?? 1);
    const halfW = ((drop.maxX - drop.minX) / 2) * factor;
    const halfH = ((drop.maxY - drop.minY) / 2) * factor;
    return { minX: tile.worldX - halfW, minY: tile.worldY - halfH, maxX: tile.worldX + halfW, maxY: tile.worldY + halfH };
  }
  const acc = new BoundsAccumulator();
  for (const c of cellsCoveredByAssignment(tile)) acc.addBox(geometry.getCellBounds(cellAt(geometry, c.col, c.row)));
  return acc.result();
}

/** Tiles, each on the geometry of the rung it is homed on; rung tiles only when a `ladder` is supplied. */
function addTileBounds(acc: BoundsAccumulator, tiles: TileAssignment[], geometry: ExtendedGeometry, ladder: GeometryLadder | null): void {
  for (const tile of tiles) {
    const home = tile.homeLevel ?? 0;
    if (home > 0 && ladder === null) continue;
    const bounds = tileBounds(tile, home > 0 && ladder !== null ? ladder.geometryForLevel(home) : geometry);
    if (bounds !== null) acc.addBox(bounds);
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
 * Rung (>= 1) cells, objects and tiles are measured with their rung's own
 * geometry and are only included when a `ladder` is supplied; classic maps have none.
 */
function calculateContentBounds(
  layer: MapLayer,
  geometry: ExtendedGeometry,
  ladder: GeometryLadder | null = null
): BoundingBox | null {
  const acc = new BoundsAccumulator();

  // Painted cells: level 0, then every authored rung on its own geometry
  for (const { level, cell } of allAuthoredCells(layer)) {
    if (level === 0) acc.addBox(geometry.getCellBounds(cell));
    else if (ladder !== null) acc.addBox(ladder.geometryForLevel(level).getCellBounds(cell));
  }
  for (const obj of layer.objects) {
    const home = obj.homeLevel ?? 0;
    if (home === 0) acc.addBox(geometry.getObjectBounds(obj));
    else if (ladder !== null) acc.addBox(ladder.geometryForLevel(home).getObjectBounds(obj));
  }

  // Text labels (need temporary canvas for measurement)
  if (layer.textLabels.length > 0) {
    const tempCanvas = activeWindow.createEl('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    if (tempCtx) {
      for (const label of layer.textLabels) acc.addBox(getTextLabelBounds(label, tempCtx));
    }
  }

  addTileBounds(acc, layer.tiles ?? [], geometry, ladder);
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
 * content for each selected layer (rungs included when a `ladder` is given)
 * plus map-level overlays.
 */
function calculateExportBounds(
  mapData: MapData,
  layers: MapLayer[],
  geometry: ExtendedGeometry,
  ladder: GeometryLadder | null = null
): BoundingBox | null {
  let bounds: BoundingBox | null = null;
  for (const layer of layers) bounds = unionBounds(bounds, calculateContentBounds(layer, geometry, ladder));
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

  // Calculate content bounds across every selected layer plus map-level overlays
  const ladder = exportLadderFor(mapData, geometry);
  const bounds = calculateExportBounds(mapData, exportLayers, geometry, ladder);

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
  const deepLevel = ladder !== null ? deepestAuthoredLevel(exportLayers) : 0;
  const worldWidth = exportBounds.maxX - exportBounds.minX;
  const worldHeight = exportBounds.maxY - exportBounds.minY;
  const zoom = deepLevel > 0 && ladder !== null ? exportZoomForLevel(deepLevel, ladder.params, worldWidth, worldHeight) : 1;
  // The side cap can pull the zoom below the deepest rung's crossing; then paint
  // the rung that zoom activates, never a finer one whose cells are sub-pixel and
  // whose enumeration over the whole map costs seconds (kgc.20).
  const renderLevel = deepLevel > 0 && ladder !== null ? overrideRungFor(ladder, deepLevel, zoom) : 0;
  const renderLadder = renderLevel > 0 ? ladder : null;

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
    level: renderLevel,
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

export { calculateContentBounds, calculateExportBounds, deepestAuthoredLevel, exportLadderFor, exportZoomForLevel, exportViewStateForBounds, getExportTheme, saveMapImageToVault };
