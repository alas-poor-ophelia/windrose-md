/**
 * BaseGeometry.js
 * 
 * Abstract base class for geometry implementations (GridGeometry, HexGeometry).
 * Defines the common interface that all geometry classes must implement,
 * and provides shared utility methods.
 * 
 * This class uses JavaScript with TypeScript-style JSDoc annotations to:
 * - Document the expected API contract
 * - Provide IDE autocomplete and type checking
 * - Enable runtime validation of abstract methods
 * - Facilitate future TypeScript migration
 * 
 * COORDINATE SYSTEMS (implemented by subclasses):
 * - Grid coordinates: Integer indices in the geometry's native coordinate system
 *   (gridX, gridY) for GridGeometry, (q, r) for HexGeometry
 * 
 * - World coordinates: Float pixel coordinates in the map's coordinate system
 *   Origin and scale defined by geometry implementation
 * 
 * - Screen coordinates: Pixel coordinates on the canvas
 *   Includes viewport transforms (pan/zoom/rotation)
 * 
 * IMPLEMENTATION GUIDELINES:
 * - Subclasses MUST implement all abstract methods defined below
 * - Subclasses SHOULD provide consistent public APIs for polymorphic usage
 * - Helper methods (e.g., offsetToWorld, getCellCenter) should exist in both
 *   implementations, even if one is a simple passthrough, to enable code
 *   that works with BaseGeometry references without type-checking
 * 
 * @abstract
 */
class BaseGeometry {
  /**
   * @throws {Error} If instantiated directly (must use subclass)
   */
  constructor() {
    if (new.target === BaseGeometry) {
      throw new Error('BaseGeometry is abstract and cannot be instantiated directly');
    }
  }
  
  // ============================================================================
  // CONCRETE METHODS (Shared implementation for all geometry types)
  // ============================================================================
  
  /**
   * Apply iOS-safe stroke style to canvas context
   * 
   * iOS may corrupt stroke-related canvas state during memory pressure events
   * (when app is backgrounded). This helper ensures all stroke properties are
   * explicitly set to valid values before any stroke operations.
   * 
   * Usage pattern:
   * ```javascript
   * this.withStrokeStyle(ctx, { lineColor: '#333', lineWidth: 1 }, () => {
   *   // All stroke operations here
   *   ctx.beginPath();
   *   ctx.moveTo(x1, y1);
   *   ctx.lineTo(x2, y2);
   *   ctx.stroke();
   * });
   * ```
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} style - Stroke style options
   * @param {string} style.lineColor - Stroke color (default: '#333333')
   * @param {number} style.lineWidth - Line width (default: 1)
   * @param {Function} callback - Function containing stroke operations
   */
  withStrokeStyle(ctx, style, callback) {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Save context state
    ctx.save();
    
    // Explicitly reset ALL stroke-related properties
    // This protects against iOS state corruption
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    
    // Execute stroke operations
    callback();
    
    // Restore context state
    ctx.restore();
  }
  
  /**
   * Convert world coordinates to screen coordinates (for rendering)
   * This is a pure coordinate transform that works identically for all geometry types
   * 
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {number} offsetX - Screen offset X (viewport pan)
   * @param {number} offsetY - Screen offset Y (viewport pan)
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  worldToScreen(worldX, worldY, offsetX, offsetY, zoom) {
    const screenX = offsetX + worldX * zoom;
    const screenY = offsetY + worldY * zoom;
    return { screenX, screenY };
  }

  /**
   * Convert screen coordinates to world coordinates
   * This is the inverse of worldToScreen and works identically for all geometry types
   * Useful for calculating visible bounds and converting pointer events
   * 
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @param {number} zoom - Current zoom level
   * @returns {{worldX: number, worldY: number}} World coordinates
   */
  screenToWorld(screenX, screenY, zoom) {
    return {
      worldX: screenX / zoom,
      worldY: screenY / zoom
    };
  }
  
  // ============================================================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ============================================================================
  
  /**
   * Convert world coordinates to grid coordinates
   * @abstract
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid coordinates (property names may vary by implementation)
   * @throws {Error} If not implemented by subclass
   */
  worldToGrid(worldX, worldY) {
    throw new Error('worldToGrid() must be implemented by subclass');
  }
  
  /**
   * Convert grid coordinates to world coordinates
   * @abstract
   * @param {number} x - Grid X coordinate (gridX for grid, q for hex)
   * @param {number} y - Grid Y coordinate (gridY for grid, r for hex)
   * @returns {{worldX: number, worldY: number}} World coordinates
   * @throws {Error} If not implemented by subclass
   */
  gridToWorld(x, y) {
    throw new Error('gridToWorld() must be implemented by subclass');
  }
  
  /**
   * Convert grid coordinates to screen coordinates
   * @abstract
   * @param {number} x - Grid X coordinate (gridX for grid, q for hex)
   * @param {number} y - Grid Y coordinate (gridY for grid, r for hex)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   * @throws {Error} If not implemented by subclass
   */
  gridToScreen(x, y, offsetX, offsetY, zoom) {
    throw new Error('gridToScreen() must be implemented by subclass');
  }
  
  /**
   * Get the scaled cell/hex size at current zoom level
   * @abstract
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled size in screen pixels
   * @throws {Error} If not implemented by subclass
   */
  getScaledCellSize(zoom) {
    throw new Error('getScaledCellSize() must be implemented by subclass');
  }
  
  /**
   * Create a cell object in the geometry's native format
   * @abstract
   * @param {{gridX: number, gridY: number}|{q: number, r: number}|{x: number, y: number}} coords - Coordinates
   * @param {string} color - Cell color
   * @returns {Object} Cell object in native format
   * @throws {Error} If not implemented by subclass
   */
  createCellObject(coords, color) {
    throw new Error('createCellObject() must be implemented by subclass');
  }
  
  /**
   * Check if a cell matches given coordinates
   * @abstract
   * @param {Object} cell - Cell object to check
   * @param {{gridX: number, gridY: number}|{q: number, r: number}|{x: number, y: number}} coords - Coordinates
   * @returns {boolean} True if cell matches coordinates
   * @throws {Error} If not implemented by subclass
   */
  cellMatchesCoords(cell, coords) {
    throw new Error('cellMatchesCoords() must be implemented by subclass');
  }
  
  /**
   * Get all cells within a rectangular area
   * @abstract
   * @param {number} x1 - First corner X
   * @param {number} y1 - First corner Y
   * @param {number} x2 - Second corner X
   * @param {number} y2 - Second corner Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInRectangle(x1, y1, x2, y2) {
    throw new Error('getCellsInRectangle() must be implemented by subclass');
  }
  
  /**
   * Get all cells within a circular area
   * @abstract
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {number} radius - Radius in cells
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInCircle(centerX, centerY, radius) {
    throw new Error('getCellsInCircle() must be implemented by subclass');
  }
  
  /**
   * Get all cells along a line between two cells
   * @abstract
   * @param {number} x1 - Start X coordinate
   * @param {number} y1 - Start Y coordinate
   * @param {number} x2 - End X coordinate
   * @param {number} y2 - End Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInLine(x1, y1, x2, y2) {
    throw new Error('getCellsInLine() must be implemented by subclass');
  }
  
  /**
   * Calculate distance between two cells
   * @abstract
   * @param {number} x1 - First cell X
   * @param {number} y1 - First cell Y
   * @param {number} x2 - Second cell X
   * @param {number} y2 - Second cell Y
   * @returns {number} Distance in cells
   * @throws {Error} If not implemented by subclass
   */
  getEuclideanDistance(x1, y1, x2, y2) {
    throw new Error('getEuclideanDistance() must be implemented by subclass');
  }
  
  /**
   * Calculate Manhattan distance between two cells
   * @abstract
   * @param {number} x1 - First cell X
   * @param {number} y1 - First cell Y
   * @param {number} x2 - Second cell X
   * @param {number} y2 - Second cell Y
   * @returns {number} Manhattan distance in cells
   * @throws {Error} If not implemented by subclass
   */
  getManhattanDistance(x1, y1, x2, y2) {
    throw new Error('getManhattanDistance() must be implemented by subclass');
  }
  
  /**
   * Get all neighboring cells
   * @abstract
   * @param {number} x - Cell X coordinate
   * @param {number} y - Cell Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   * @throws {Error} If not implemented by subclass
   */
  getNeighbors(x, y) {
    throw new Error('getNeighbors() must be implemented by subclass');
  }
  
  /**
   * Check if coordinates are within bounds
   * @abstract
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if within bounds
   * @throws {Error} If not implemented by subclass
   */
  isWithinBounds(x, y) {
    throw new Error('isWithinBounds() must be implemented by subclass');
  }
  
  /**
   * Clamp coordinates to bounds
   * @abstract
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {{x: number, y: number}} Clamped coordinates (property names may vary)
   * @throws {Error} If not implemented by subclass
   */
  clampToBounds(x, y) {
    throw new Error('clampToBounds() must be implemented by subclass');
  }
  
  /**
   * Draw grid lines on canvas
   * @abstract
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @param {Object} style - Grid style options
   * @throws {Error} If not implemented by subclass
   */
  drawGrid(ctx, offsetX, offsetY, width, height, zoom, style) {
    throw new Error('drawGrid() must be implemented by subclass');
  }
}

return { BaseGeometry };