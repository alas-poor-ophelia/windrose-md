/**
 * multiSelectOperations.js
 * 
 * Utilities for multi-select functionality:
 * - Finding items within a selection rectangle
 * - Calculating bounds for objects and text labels
 * - Batch update operations
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getActiveLayer } = await requireModuleByName("layerAccessor.js");
const { getFontCss } = await requireModuleByName("fontOptions.js");
const { GridGeometry } = await requireModuleByName("GridGeometry.ts");
const { HexGeometry } = await requireModuleByName("HexGeometry.ts");

/**
 * Check if two rectangles overlap
 * @param {number} minX1 - First rect min X
 * @param {number} minY1 - First rect min Y
 * @param {number} maxX1 - First rect max X
 * @param {number} maxY1 - First rect max Y
 * @param {Object} bounds - Second rect { minX, minY, maxX, maxY }
 * @returns {boolean}
 */
function rectsOverlap(minX1, minY1, maxX1, maxY1, bounds) {
  return !(bounds.maxX < minX1 || bounds.minX > maxX1 ||
           bounds.maxY < minY1 || bounds.minY > maxY1);
}

/**
 * Get the world-coordinate bounds of an object
 * Objects use grid coordinates, so we need to convert based on geometry
 * @param {Object} obj - Object with position and size
 * @param {Object} geometry - Grid or Hex geometry
 * @param {Object} mapData - Map data for configuration
 * @returns {Object} { minX, minY, maxX, maxY } in world coordinates
 */
function getObjectWorldBounds(obj, geometry, mapData) {
  const pos = obj.position;
  const size = obj.size || { width: 1, height: 1 };
  
  // For grid maps: convert grid cell to world coords
  // Grid cell (x, y) occupies world space from (x * cellSize, y * cellSize) 
  // to ((x + width) * cellSize, (y + height) * cellSize)
  if (geometry instanceof GridGeometry) {
    const cellSize = geometry.cellSize;
    return {
      minX: pos.x * cellSize,
      minY: pos.y * cellSize,
      maxX: (pos.x + size.width) * cellSize,
      maxY: (pos.y + size.height) * cellSize
    };
  }
  
  // For hex maps: get hex center in world coords and create bounds around it
  // Hex objects occupy their cell, so we use the hex bounding box
  if (geometry instanceof HexGeometry) {
    const center = geometry.hexToWorld(pos.x, pos.y);
    const hexSize = geometry.hexSize;
    
    // Approximate hex bounds as a rectangle
    // For flat-top: width = 2 * size, height = sqrt(3) * size
    // For pointy-top: width = sqrt(3) * size, height = 2 * size
    const orientation = mapData.orientation || 'flat';
    let halfWidth, halfHeight;
    
    if (orientation === 'flat') {
      halfWidth = hexSize;
      halfHeight = hexSize * Math.sqrt(3) / 2;
    } else {
      halfWidth = hexSize * Math.sqrt(3) / 2;
      halfHeight = hexSize;
    }
    
    return {
      minX: center.worldX - halfWidth,
      minY: center.worldY - halfHeight,
      maxX: center.worldX + halfWidth,
      maxY: center.worldY + halfHeight
    };
  }
  
  // Fallback for unknown geometry
  return {
    minX: pos.x,
    minY: pos.y,
    maxX: pos.x + 1,
    maxY: pos.y + 1
  };
}

/**
 * Get the world-coordinate bounds of a text label
 * Text labels already use world coordinates
 * @param {Object} label - Text label with position, fontSize, content
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @returns {Object} { minX, minY, maxX, maxY } in world coordinates
 */
function getTextLabelWorldBounds(label, ctx) {
  const pos = label.position;
  const fontSize = label.fontSize || 16;
  const fontFace = label.fontFace || 'sans';
  const rotation = label.rotation || 0;
  
  // Measure text width
  let textWidth, textHeight;
  
  if (ctx) {
    const fontFamily = getFontCss(fontFace);
    ctx.font = `${fontSize}px ${fontFamily}`;
    const metrics = ctx.measureText(label.content || '');
    textWidth = metrics.width;
    textHeight = fontSize * 1.2;
  } else {
    // Estimate if no context available
    textWidth = (label.content || '').length * fontSize * 0.6;
    textHeight = fontSize * 1.2;
  }
  
  // Add padding (same as selection box)
  const paddingX = 4;
  const paddingY = 2;
  const boundingWidth = textWidth + paddingX * 2;
  const boundingHeight = textHeight + paddingY * 2;
  
  // For rotated text, calculate the axis-aligned bounding box
  if (rotation !== 0) {
    const angleRad = (rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angleRad));
    const sin = Math.abs(Math.sin(angleRad));
    const rotatedWidth = boundingWidth * cos + boundingHeight * sin;
    const rotatedHeight = boundingWidth * sin + boundingHeight * cos;
    
    return {
      minX: pos.x - rotatedWidth / 2,
      minY: pos.y - rotatedHeight / 2,
      maxX: pos.x + rotatedWidth / 2,
      maxY: pos.y + rotatedHeight / 2
    };
  }
  
  // Non-rotated: simple bounding box centered on position
  return {
    minX: pos.x - boundingWidth / 2,
    minY: pos.y - boundingHeight / 2,
    maxX: pos.x + boundingWidth / 2,
    maxY: pos.y + boundingHeight / 2
  };
}

/**
 * Find all objects and text labels within a world-coordinate rectangle
 * @param {Object} mapData - Map data containing objects and textLabels
 * @param {Object} corner1 - First corner { worldX, worldY }
 * @param {Object} corner2 - Second corner { worldX, worldY }
 * @param {Object} geometry - Grid or Hex geometry
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement
 * @returns {Array} Array of { type: 'object' | 'text', id, data }
 */
function getItemsInWorldRect(mapData, corner1, corner2, geometry, ctx) {
  const activeLayer = getActiveLayer(mapData);
  const items = [];
  
  // Normalize rectangle bounds
  const minX = Math.min(corner1.worldX, corner2.worldX);
  const maxX = Math.max(corner1.worldX, corner2.worldX);
  const minY = Math.min(corner1.worldY, corner2.worldY);
  const maxY = Math.max(corner1.worldY, corner2.worldY);
  
  // Check objects
  const objects = activeLayer.objects || [];
  for (const obj of objects) {
    const objBounds = getObjectWorldBounds(obj, geometry, mapData);
    if (rectsOverlap(minX, minY, maxX, maxY, objBounds)) {
      items.push({ type: 'object', id: obj.id, data: obj });
    }
  }
  
  // Check text labels
  const textLabels = activeLayer.textLabels || [];
  for (const label of textLabels) {
    const labelBounds = getTextLabelWorldBounds(label, ctx);
    if (rectsOverlap(minX, minY, maxX, maxY, labelBounds)) {
      items.push({ type: 'text', id: label.id, data: label });
    }
  }
  
  return items;
}

/**
 * Calculate the combined bounding box for multiple selected items
 * Used for positioning the multi-select toolbar
 * @param {Array} selectedItems - Array of { type, id, data }
 * @param {Object} geometry - Grid or Hex geometry
 * @param {Object} mapData - Map data
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @returns {Object} { minX, minY, maxX, maxY } in world coordinates
 */
function getSelectionBounds(selectedItems, geometry, mapData, ctx) {
  if (!selectedItems || selectedItems.length === 0) {
    return null;
  }
  
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;
  
  for (const item of selectedItems) {
    let bounds;
    
    if (item.type === 'object') {
      bounds = getObjectWorldBounds(item.data, geometry, mapData);
    } else if (item.type === 'text') {
      bounds = getTextLabelWorldBounds(item.data, ctx);
    }
    
    if (bounds) {
      minX = Math.min(minX, bounds.minX);
      minY = Math.min(minY, bounds.minY);
      maxX = Math.max(maxX, bounds.maxX);
      maxY = Math.max(maxY, bounds.maxY);
    }
  }
  
  if (minX === Infinity) {
    return null;
  }
  
  return { minX, minY, maxX, maxY };
}

/**
 * Check if a position is within map bounds
 * @param {number} gridX - Grid X coordinate
 * @param {number} gridY - Grid Y coordinate
 * @param {Object} geometry - Grid or Hex geometry
 * @param {Object} mapData - Map data
 * @returns {boolean}
 */
function isWithinBounds(gridX, gridY, geometry, mapData) {
  if (!geometry) return true;
  
  // Use geometry's bounds check if available
  if (geometry.isWithinBounds) {
    return geometry.isWithinBounds(gridX, gridY);
  }
  
  // For grid maps without explicit bounds, assume unbounded
  return true;
}

/**
 * Validate that all positions in a group move are within bounds
 * @param {Array} updates - Array of { id, position: { x, y } }
 * @param {Object} geometry - Grid or Hex geometry
 * @param {Object} mapData - Map data
 * @returns {boolean} True if all positions are valid
 */
function validateGroupMove(updates, geometry, mapData) {
  for (const update of updates) {
    if (update.position) {
      if (!isWithinBounds(update.position.x, update.position.y, geometry, mapData)) {
        return false;
      }
    }
  }
  return true;
}

return {
  rectsOverlap,
  getObjectWorldBounds,
  getTextLabelWorldBounds,
  getItemsInWorldRect,
  getSelectionBounds,
  isWithinBounds,
  validateGroupMove
};