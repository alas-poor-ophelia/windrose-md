/**
 * exportOperations.ts
 * 
 * Functions for exporting map as image.
 * Handles content bounds calculation, rendering to offscreen canvas,
 * and triggering browser download.
 */

// Type-only imports
import type { Point, BoundingBox } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel, FontFace } from './textLabelOperations';
import type { HexColor } from '#types/settings/settings.types';
import type {
  ExportGeometry,
  RenderParams,
  ExportResult,
  ExportTheme,
  ExportVisibilityOptions
} from '#types/core/export.types';
import type { App, TFile } from 'obsidian';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer
};

const { getFontCss } = await requireModuleByName("fontOptions.ts") as {
  getFontCss: (fontFace: FontFace) => string
};

// Obsidian app reference
declare const app: App;

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
 * Calculate the world-coordinate bounding box of all content on a layer
 */
function calculateContentBounds(
  mapData: MapData,
  layer: MapLayer,
  geometry: ExportGeometry
): BoundingBox | null {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  let hasContent = false;
  
  // 1. Painted cells
  if (layer.cells && layer.cells.length > 0) {
    for (const cell of layer.cells) {
      hasContent = true;
      const bounds = geometry.getCellBounds(cell);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  // 2. Objects
  if (layer.objects && layer.objects.length > 0) {
    for (const obj of layer.objects) {
      hasContent = true;
      const bounds = geometry.getObjectBounds(obj as unknown as MapObject);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  // 3. Text labels (need temporary canvas for measurement)
  if (layer.textLabels && layer.textLabels.length > 0) {
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      for (const label of layer.textLabels) {
        hasContent = true;
        const bounds = getTextLabelBounds(label as unknown as TextLabel, tempCtx);
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
 * Render map content to a canvas context using the same rendering logic as the main canvas.
 */
async function renderMapToCanvas(
  ctx: CanvasRenderingContext2D,
  params: RenderParams
): Promise<void> {
  const { mapData, geometry, bounds, width, height } = params;
  
  // Import rendering dependencies
  const { renderCanvas } = await requireModuleByName("useCanvasRenderer.ts") as {
    renderCanvas: (
      canvas: HTMLCanvasElement,
      fogCanvas: HTMLCanvasElement | null,
      mapData: MapData,
      geometry: ExportGeometry,
      selection: unknown[],
      isSelected: boolean,
      theme: ExportTheme,
      showPreview: boolean,
      visibility: ExportVisibilityOptions
    ) => void
  };
  
  const { GridGeometry } = await requireModuleByName("GridGeometry.ts") as {
    GridGeometry: new () => ExportGeometry
  };
  
  // Calculate viewport parameters for export
  const contentCenterX = (bounds.minX + bounds.maxX) / 2;
  const contentCenterY = (bounds.minY + bounds.maxY) / 2;
  
  let exportCenter: Point;
  if (geometry.worldToGrid) {
    // Grid maps: convert world coords to grid coords
    const gridCoords = geometry.worldToGrid(contentCenterX, contentCenterY);
    exportCenter = { x: gridCoords.x, y: gridCoords.y };
  } else {
    // Hex maps use world coordinates directly
    exportCenter = { x: contentCenterX, y: contentCenterY };
  }
  
  // Create temporary canvas for rendering
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  // Create export-specific map data
  const exportMapData: MapData = {
    ...mapData,
    // Override viewport for export
  };
  
  // Get effective settings for theming
  const { getSettings } = await requireModuleByName("settingsAccessor.ts") as {
    getSettings: () => { 
      gridLineColor: HexColor;
      gridLineWidth: number;
      backgroundColor: HexColor;
      borderColor: HexColor;
      coordinateKeyColor: HexColor;
    }
  };
  
  const effectiveSettings = getSettings();
  
  // Build export theme
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
  
  // Render using existing render function
  renderCanvas(
    tempCanvas,
    null,
    exportMapData,
    geometry,
    [],
    false,
    theme,
    false,
    { objects: true, textLabels: true, hexCoordinates: false }
  );
  
  // Copy to target context
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
  geometry: ExportGeometry,
  buffer: number = 20
): Promise<Blob> {
  const activeLayer = getActiveLayer(mapData);
  
  // Calculate content bounds
  const bounds = calculateContentBounds(mapData, activeLayer, geometry);
  
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
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  if (!ctx) {
    throw new Error('Failed to create canvas context');
  }
  
  // Render map to canvas
  await renderMapToCanvas(ctx, {
    mapData,
    geometry,
    bounds: exportBounds,
    width,
    height
  });
  
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
  mapData: MapData,
  geometry: ExportGeometry,
  filename?: string
): Promise<ExportResult> {
  try {
    const blob = await exportMapAsImage(mapData, geometry);
    
    // Convert blob to array buffer
    const arrayBuffer = await blob.arrayBuffer();
    
    // Generate filename with timestamp if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const mapName = (mapData as MapData & { name?: string }).name || 'map';
    const finalFilename = filename || `${mapName}-${timestamp}.png`;
    
    // Save to vault root
    const path = `${finalFilename}`;
    
    // Check if file exists
    const existingFile = app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      // File exists, modify it
      await app.vault.modifyBinary(existingFile as TFile, arrayBuffer);
    } else {
      // Create new file
      await app.vault.createBinary(path, arrayBuffer);
    }
    
    return { success: true, path };
  } catch (error) {
    console.error('[exportOperations] Export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ===========================================
// Exports
// ===========================================

return {
  calculateContentBounds,
  renderMapToCanvas,
  exportMapAsImage,
  saveMapImageToVault
};