// utils/screenPositionUtils.js - Shared screen position calculations for objects

/**
 * Calculate an object's screen position accounting for zoom, pan, rotation, alignment, and container positioning
 * @param {Object} object - The object to position
 * @param {HTMLCanvasElement} canvas - Canvas reference
 * @param {Object} mapData - Map data with gridSize, viewState, northDirection, mapType
 * @param {Object} geometry - Geometry instance (GridGeometry or HexGeometry)
 * @param {Object} [containerRef] - Optional container ref for accurate positioning (falls back to canvas.parentElement)
 * @returns {Object|null} { screenX, screenY, objectWidth, objectHeight } or null if inputs invalid
 */
function calculateObjectScreenPosition(object, canvas, mapData, geometry, containerRef = null) {
  if (!mapData || !canvas || !geometry) {
    return null;
  }
  
  const { gridSize, viewState, northDirection, mapType } = mapData;
  const { zoom, center } = viewState;
  const size = object.size || { width: 1, height: 1 };
  const alignment = object.alignment || 'center'; // Backward compatible default
  
  
  // Calculate offsets accounting for map rotation
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  let offsetX, offsetY, screenX, screenY, objectWidth, objectHeight;
  
  // Handle coordinate conversion based on map type
  if (mapType === 'hex') {
    // For hex maps: object.position contains axial coordinates {x: q, y: r}
    // We need to convert to world coordinates first
    const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
    
    // For button/selection box positioning, use same dimensions as symbol rendering
    // Symbols render at hexSize, so buttons should position based on hexSize too
    const hexSize = geometry.hexSize;
    objectWidth = size.width * hexSize * zoom;
    objectHeight = size.height * hexSize * zoom;
    
    // Hex: center is in world pixel coordinates
    offsetX = centerX - center.x * zoom;
    offsetY = centerY - center.y * zoom;
    
    // Get object CENTER in screen space (button calculators expect center, not top-left)
    screenX = offsetX + worldX * zoom;
    screenY = offsetY + worldY * zoom;
    
    // Apply alignment offset for hex maps
    screenX += getAlignmentScreenOffset(alignment, hexSize, zoom).x;
    screenY += getAlignmentScreenOffset(alignment, hexSize, zoom).y;
  } else {
    // For grid maps: object.position contains grid coordinates {x, y}
    const scaledGridSize = gridSize * zoom;
    offsetX = centerX - center.x * scaledGridSize;
    offsetY = centerY - center.y * scaledGridSize;
    
    // Get object center position in screen space (accounting for full object size)
    screenX = offsetX + (object.position.x + size.width / 2) * scaledGridSize;
    screenY = offsetY + (object.position.y + size.height / 2) * scaledGridSize;
    
    // Apply alignment offset for grid maps
    screenX += getAlignmentScreenOffset(alignment, scaledGridSize, 1).x;
    screenY += getAlignmentScreenOffset(alignment, scaledGridSize, 1).y;
    
    // Object selection box size (full object bounds)
    objectWidth = size.width * scaledGridSize;
    objectHeight = size.height * scaledGridSize;
  }
  
  // Apply canvas rotation if present
  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }
  
  // Account for canvas position within centered container
  // Use containerRef if provided, otherwise fall back to canvas.parentElement for backward compatibility
  const rect = canvas.getBoundingClientRect();
  const containerRect = (containerRef?.current || canvas.parentElement).getBoundingClientRect();
  
  // Calculate canvas offset within container (due to flex centering)
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  
  // Scale from canvas internal coordinates to displayed coordinates
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  return { 
    screenX: (screenX * scaleX) + canvasOffsetX, 
    screenY: (screenY * scaleY) + canvasOffsetY, 
    objectWidth: objectWidth * scaleX, 
    objectHeight: objectHeight * scaleY 
  };
}

/**
 * Calculate screen space offset for edge alignment
 * @param {string} alignment - 'center' | 'north' | 'south' | 'east' | 'west'
 * @param {number} cellSize - Cell size in pixels
 * @param {number} zoom - Zoom level (for hex, already included in cellSize for grid)
 * @returns {Object} { x, y } offset in screen pixels
 */
function getAlignmentScreenOffset(alignment, cellSize, zoom) {
  const halfCell = (cellSize * zoom) / 2;
  
  switch (alignment) {
    case 'north': return { x: 0, y: -halfCell };
    case 'south': return { x: 0, y: halfCell };
    case 'east': return { x: halfCell, y: 0 };
    case 'west': return { x: -halfCell, y: 0 };
    case 'center':
    default: return { x: 0, y: 0 };
  }
}

/**
 * Apply inverse rotation transformation to coordinates
 * Used when converting screen/canvas coordinates back to world/grid coordinates
 * @param {number} x - X coordinate to transform
 * @param {number} y - Y coordinate to transform
 * @param {number} canvasWidth - Canvas width for center calculation
 * @param {number} canvasHeight - Canvas height for center calculation
 * @param {number} northDirection - Rotation angle in degrees (0, 90, 180, 270)
 * @returns {Object} { x, y } - Transformed coordinates
 */
function applyInverseRotation(x, y, canvasWidth, canvasHeight, northDirection) {
  if (northDirection === 0) {
    return { x, y };
  }
  
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  // Translate to origin
  let translatedX = x - centerX;
  let translatedY = y - centerY;
  
  // Apply inverse rotation (negative angle)
  const angleRad = (-northDirection * Math.PI) / 180;
  const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
  const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);
  
  // Translate back
  return {
    x: rotatedX + centerX,
    y: rotatedY + centerY
  };
}

return { calculateObjectScreenPosition, applyInverseRotation, getAlignmentScreenOffset };