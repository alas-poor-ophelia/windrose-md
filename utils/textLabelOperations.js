/**
 * Generate a unique ID for a text label
 * @returns {string} UUID string
 */
function generateTextLabelId() {
  return 'text-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Add a new text label
 * @param {Array} labels - Current labels array
 * @param {string} content - Label text
 * @param {number} x - Pixel X coordinate (world space)
 * @param {number} y - Pixel Y coordinate (world space)
 * @param {Object} options - Optional styling options (fontSize, fontFace, color)
 * @returns {Array} New labels array with added label
 */
function addTextLabel(labels, content, x, y, options = {}) {
  // Validate content
  const trimmed = content.trim();
  if (!trimmed || trimmed.length === 0) {
    console.warn('Cannot add empty text label');
    return labels;
  }
  
  if (trimmed.length > 200) {
    console.warn('Text label content exceeds 200 character limit');
    return labels;
  }
  
  const newLabel = {
    id: generateTextLabelId(),
    content: trimmed,
    position: { x, y },
    rotation: 0,
    fontSize: options.fontSize || 16,
    fontFace: options.fontFace || 'sans',
    color: options.color || '#ffffff'
  };
  
  return [...(labels || []), newLabel];
}

/**
 * Update an existing text label
 * @param {Array} labels - Current labels array
 * @param {string} id - Label ID to update
 * @param {Object} updates - Fields to update (e.g., { position: {x, y}, rotation: 90 })
 * @returns {Array} New labels array with updated label
 */
function updateTextLabel(labels, id, updates) {
  if (!labels || !Array.isArray(labels)) return [];
  
  return labels.map(label => 
    label.id === id ? { ...label, ...updates } : label
  );
}

/**
 * Remove a text label by ID
 * @param {Array} labels - Current labels array
 * @param {string} id - Label ID to remove
 * @returns {Array} New labels array without the specified label
 */
function removeTextLabel(labels, id) {
  if (!labels || !Array.isArray(labels)) return [];
  return labels.filter(label => label.id !== id);
}

/**
 * Check if a point is inside a rotated rectangle (for text label hit detection)
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} rectX - Rectangle center X
 * @param {number} rectY - Rectangle center Y
 * @param {number} rectWidth - Rectangle width
 * @param {number} rectHeight - Rectangle height
 * @param {number} rotation - Rotation in degrees
 * @returns {boolean} True if point is inside the rotated rectangle
 */
function isPointInRotatedRect(px, py, rectX, rectY, rectWidth, rectHeight, rotation) {
  // Translate point to rectangle's local space (centered at origin)
  const dx = px - rectX;
  const dy = py - rectY;
  
  // Rotate point by negative rotation to "unrotate" it
  const angleRad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;
  
  // Check if point is inside the axis-aligned rectangle
  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  
  return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight;
}

/**
 * Find text label at given coordinates using proper bounding box collision
 * @param {Array} labels - Current labels array
 * @param {number} x - Pixel X coordinate (world space)
 * @param {number} y - Pixel Y coordinate (world space)
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement (optional)
 * @returns {Object|null} Label at position or null
 */
function getTextLabelAtPosition(labels, x, y, ctx = null) {
  if (!labels || !Array.isArray(labels)) return null;
  
  // Create temporary canvas context if none provided
  let tempCanvas = null;
  if (!ctx) {
    tempCanvas = document.createElement('canvas');
    ctx = tempCanvas.getContext('2d');
  }
  
  // Check labels in reverse order (top to bottom, most recent first)
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i];
    
    // Set font to measure text accurately
    const fontSize = label.fontSize || 16;
    const fontFace = label.fontFace || 'sans';
    
    // Import getFontCss if available, otherwise use simple mapping
    let fontFamily;
    if (typeof getFontCss === 'function') {
      fontFamily = getFontCss(fontFace);
    } else {
      // Fallback font mapping
      const fontMap = {
        'sans': 'system-ui, -apple-system, sans-serif',
        'serif': 'Georgia, Times, serif',
        'mono': '"Courier New", monospace',
        'script': '"Brush Script MT", cursive',
        'fantasy': 'Impact, sans-serif'
      };
      fontFamily = fontMap[fontFace] || 'sans-serif';
    }
    
    ctx.font = `${fontSize}px ${fontFamily}`;
    
    // Measure text to get bounding box
    const metrics = ctx.measureText(label.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // Same multiplier as renderer
    
    // Add padding (same as selection box: 4px horizontal, 2px vertical)
    const paddingX = 4;
    const paddingY = 2;
    const boundingWidth = textWidth + paddingX * 2;
    const boundingHeight = textHeight + paddingY * 2;
    
    // Check if point is inside the rotated bounding box
    if (isPointInRotatedRect(
      x, y,
      label.position.x, label.position.y,
      boundingWidth, boundingHeight,
      label.rotation || 0
    )) {
      // Clean up temporary canvas if created
      if (tempCanvas) {
        tempCanvas = null;
      }
      return label;
    }
  }
  
  // Clean up temporary canvas if created
  if (tempCanvas) {
    tempCanvas = null;
  }
  
  return null;
}

/**
 * Remove all text labels within a rectangular area (for clear area tool)
 * @param {Array} labels - Current labels array
 * @param {number} x1 - First corner X (world space)
 * @param {number} y1 - First corner Y (world space)
 * @param {number} x2 - Second corner X (world space)
 * @param {number} y2 - Second corner Y (world space)
 * @returns {Array} New labels array without labels in rectangle
 */
function removeTextLabelsInRectangle(labels, x1, y1, x2, y2) {
  if (!labels || !Array.isArray(labels)) return [];
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return labels.filter(label => {
    return !(label.position.x >= minX && label.position.x <= maxX && 
             label.position.y >= minY && label.position.y <= maxY);
  });
}

return {
  generateTextLabelId,
  addTextLabel,
  updateTextLabel,
  removeTextLabel,
  getTextLabelAtPosition,
  removeTextLabelsInRectangle
};