/**
 * exportOperations.js
 * 
 * Functions for exporting map as image.
 * Handles content bounds calculation, rendering to offscreen canvas,
 * and triggering browser download.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getActiveLayer } = await requireModuleByName("layerAccessor.js");
const { getFontCss } = await requireModuleByName("fontOptions.js");

/**
 * Calculate the bounding box of a text label in world coordinates
 * Uses canvas text measurement API to get accurate bounds
 * @param {Object} label - Text label object
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} Bounding box
 */
function getTextLabelBounds(label, ctx) {
  // Set font for measurement
  const fontSize = label.fontSize || 16;
  const fontFace = label.fontFace || 'sans';
  const fontFamily = getFontCss(fontFace);
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  // Measure text
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  
  // Estimate text height (approximation since canvas doesn't provide exact height)
  // Use 1.2x fontSize as a reasonable approximation including ascenders/descenders
  const textHeight = fontSize * 1.2;
  
  // Text labels use position.x and position.y
  const worldX = label.position.x;
  const worldY = label.position.y;
  
  // Text is positioned at its center point
  // Calculate bounds around the center
  const minX = worldX - textWidth / 2;
  const minY = worldY - textHeight / 2;
  const maxX = worldX + textWidth / 2;
  const maxY = worldY + textHeight / 2;
  
  return { minX, minY, maxX, maxY };
}

/**
 * Calculate the world-coordinate bounding box of all content on a layer
 * @param {Object} mapData - Full map data
 * @param {Object} layer - Layer object to analyze
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} Bounding box or null if no content
 */
function calculateContentBounds(mapData, layer, geometry) {
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
      const bounds = geometry.getObjectBounds(obj);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  // 3. Text labels (need temporary canvas for measurement)
  if (layer.textLabels && layer.textLabels.length > 0) {
    // Create temporary canvas for text measurement
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    
    for (const label of layer.textLabels) {
      hasContent = true;
      const bounds = getTextLabelBounds(label, tempCtx);
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  // 4. Painted edges (grid maps only) - edges are on cell boundaries, already covered by cells
  // No need to calculate separate bounds for edges
  
  if (!hasContent) return null;
  
  return { minX, minY, maxX, maxY };
}

/**
 * Render map content to a canvas context using the same rendering logic as the main canvas
 * This is a simplified version that renders only the essential visible content
 * @param {CanvasRenderingContext2D} ctx - Target canvas context
 * @param {Object} params - Render parameters
 * @param {Object} params.mapData - Full map data
 * @param {Object} params.geometry - Geometry instance
 * @param {Object} params.bounds - Export bounds {minX, minY, maxX, maxY}
 * @param {number} params.width - Canvas width
 * @param {number} params.height - Canvas height
 */
async function renderMapToCanvas(ctx, params) {
  const { mapData, geometry, bounds, width, height } = params;
  
  // Import rendering dependencies
  const { renderCanvas } = await requireModuleByName("useCanvasRenderer.js");
  const { HexGeometry } = await requireModuleByName("HexGeometry.js");
  
  // Calculate viewport parameters for export
  // We want zoom = 1.0 and center positioned to show the content bounds
  const contentCenterX = (bounds.minX + bounds.maxX) / 2;
  const contentCenterY = (bounds.minY + bounds.maxY) / 2;
  
  // For grid maps, center is in grid cell coordinates
  // For hex maps, center is in world pixel coordinates
  const { GridGeometry } = await requireModuleByName("GridGeometry.js");
  
  let exportCenter;
  if (geometry instanceof GridGeometry) {
    // Convert world coords to grid coords for grid maps
    const gridCoords = geometry.worldToGrid(contentCenterX, contentCenterY);
    exportCenter = { x: gridCoords.gridX, y: gridCoords.gridY };
  } else {
    // Hex maps use world coordinates directly
    exportCenter = { x: contentCenterX, y: contentCenterY };
  }
  
  // Create temporary map data with export viewport
  const exportMapData = {
    ...mapData,
    viewState: {
      zoom: 1.0,
      center: exportCenter
    }
  };
  
  // Create temporary canvas element for renderCanvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = width;
  tempCanvas.height = height;
  
  // Get theme with map-specific overrides (same as UI does)
  const { getEffectiveSettings } = await requireModuleByName("settingsAccessor.js");
  const effectiveSettings = getEffectiveSettings(mapData.settings);
  
  // Build theme object from effective settings (matching getTheme structure)
  const theme = {
    grid: {
      lines: effectiveSettings.gridLineColor,
      lineWidth: effectiveSettings.gridLineWidth,
      background: effectiveSettings.backgroundColor
    },
    cells: {
      fill: '#c4a57b', // Use default, not configurable per-map
      border: effectiveSettings.borderColor,
      borderWidth: 3
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
  // Pass null for fogCanvas since we don't want fog in exports
  renderCanvas(tempCanvas, null, exportMapData, geometry, [], false, theme, false, { objects: true, textLabels: true, hexCoordinates: false });
  
  // Copy to target context
  ctx.drawImage(tempCanvas, 0, 0);
}

/**
 * Export map as PNG image
 * @param {Object} mapData - Full map data
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {number} buffer - Padding around content in pixels (default: 20)
 * @returns {Promise<Blob>} PNG blob
 */
async function exportMapAsImage(mapData, geometry, buffer = 20) {
  const activeLayer = getActiveLayer(mapData);
  
  // Calculate content bounds
  const bounds = calculateContentBounds(mapData, activeLayer, geometry);
  
  if (!bounds) {
    throw new Error('No content to export');
  }
  
  // Add buffer
  const exportBounds = {
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
 * @param {Object} mapData - Full map data
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {string} filename - Desired filename (default: 'map-{timestamp}.png')
 * @returns {Promise<{success: boolean, path?: string, error?: string}>} Result object
 */
async function saveMapImageToVault(mapData, geometry, filename) {
  try {
    const blob = await exportMapAsImage(mapData, geometry);
    
    // Convert blob to array buffer
    const arrayBuffer = await blob.arrayBuffer();
    
    // Generate filename with timestamp if not provided
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const finalFilename = filename || `${mapData.name || 'map'}-${timestamp}.png`;
    
    // Save to vault root
    const path = `${finalFilename}`;
    
    // Check if file exists
    const existingFile = app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      // File exists, modify it
      await app.vault.modifyBinary(existingFile, arrayBuffer);
    } else {
      // Create new file
      await app.vault.createBinary(path, arrayBuffer);
    }
    
    return { success: true, path };
  } catch (error) {
    console.error('[exportOperations] Export failed:', error);
    return { success: false, error: error.message };
  }
}

return {
  calculateContentBounds,
  renderMapToCanvas,
  exportMapAsImage,
  saveMapImageToVault
};