/**
 * exportOperations.ts
 * 
 * Functions for exporting map as image.
 * Handles content bounds calculation, rendering to offscreen canvas,
 * and triggering browser download.
 */

// Type-only imports
import type { BoundingBox } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { TextLabel } from '#types/objects/note.types';
import type {
  RenderParams,
  ExportResult,
  ExportTheme
} from '#types/core/export.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { getActiveLayer } from './layerAccessor';
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
 * Calculate the world-coordinate bounding box of all content on a layer
 */
function calculateContentBounds(
  layer: MapLayer,
  geometry: ExtendedGeometry
): BoundingBox | null {
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  let hasContent = false;
  
  // 1. Painted cells
  if (layer.cells.length > 0) {
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
    const tempCanvas = document.createElement('canvas');
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
 * Render map content to a canvas context using the same rendering logic as the main canvas.
 */
function renderMapToCanvas(
  ctx: CanvasRenderingContext2D,
  params: RenderParams
): void {
  const { mapData, geometry, width, height } = params;

  const tempCanvas = document.createElement('canvas');
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
    { isResizeMode: false, theme, showCoordinates: false, layerVisibility: { grid: true, objects: true, textLabels: true, hexCoordinates: false, regions: true, outlines: true } }
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
  buffer: number = 20
): Promise<Blob> {
  const activeLayer = getActiveLayer(mapData);
  
  // Calculate content bounds
  const bounds = calculateContentBounds(activeLayer, geometry);
  
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
  renderMapToCanvas(ctx, {
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
  app: App,
  mapData: MapData,
  geometry: ExtendedGeometry,
  filename?: string
): Promise<ExportResult> {
  try {
    const blob = await exportMapAsImage(mapData, geometry);
    
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
    // eslint-disable-next-line no-console
    console.error('[exportOperations] Export failed:', error);
    return { success: false, error: (error as Error).message };
  }
}

// ===========================================
// Exports
// ===========================================

export { calculateContentBounds, renderMapToCanvas, exportMapAsImage, saveMapImageToVault };