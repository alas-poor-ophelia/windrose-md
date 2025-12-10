/**
 * GridGeometry.js
 * 
 * Handles all grid-specific geometric calculations and rendering.
 * This class abstracts square grid mathematics, coordinate conversions,
 * and basic rendering operations.
 * 
 * Extends BaseGeometry to implement the standard geometry interface
 * for square grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Grid coordinates (gridX, gridY): Integer cell indices
 *   Used internally for all grid math and storage. Origin at (0,0) in top-left.
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates in the map's coordinate system
 *   Used for positioning and measurements. Origin at (0,0) at top-left corner of cell (0,0).
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on the canvas
 *   Used for rendering. Includes viewport transforms (pan/zoom/rotation).
 * 
 * COORDINATE NAMING CONVENTION:
 * - Storage format: Cells stored as {x, y, color} using grid coordinates
 * - API methods: Use (gridX, gridY) as parameter names for clarity
 * - API returns: Collection methods return {x, y} where x=gridX, y=gridY
 * - Objects: Store position as {x, y} using grid coordinates
 * 
 * IMPORTANT: For API consistency with HexGeometry, both classes:
 * - Return {x, y} from collection methods (getCellsInRectangle, etc.)
 * - Store cells/objects with {x, y} coordinate properties
 * - Use their respective coordinate systems internally (grid vs axial)
 * 
 * @extends BaseGeometry
 */

// Import base geometry class
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { BaseGeometry } = await requireModuleByName("BaseGeometry.js");

class GridGeometry extends BaseGeometry {
  /**
   * @param {number} cellSize - Base size of each grid cell in pixels (before zoom)
   */
  constructor(cellSize) {
    super(); // Call base class constructor
    this.cellSize = cellSize;
  }
  
  /**
   * Convert world coordinates to grid cell coordinates
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid cell coordinates
   */
  worldToGrid(worldX, worldY) {
    const gridX = Math.floor(worldX / this.cellSize);
    const gridY = Math.floor(worldY / this.cellSize);
    return { gridX, gridY };
  }
  
  /**
   * Convert grid cell coordinates to world coordinates (top-left corner of cell)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates
   */
  gridToWorld(gridX, gridY) {
    const worldX = gridX * this.cellSize;
    const worldY = gridY * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Get the center point of a grid cell in world coordinates
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of cell center
   */
  getCellCenter(gridX, gridY) {
    const worldX = (gridX + 0.5) * this.cellSize;
    const worldY = (gridY + 0.5) * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Convert offset coordinates to world coordinates
   * 
   * GRID-SPECIFIC IMPLEMENTATION (for BaseGeometry API consistency)
   * 
   * For GridGeometry, offset coordinates are identical to grid coordinates
   * (no coordinate system conversion needed). This method exists for API
   * consistency with HexGeometry, enabling polymorphic code that works
   * with both geometry types.
   * 
   * @param {number} col - Column (equivalent to gridX)
   * @param {number} row - Row (equivalent to gridY)
   * @returns {{worldX: number, worldY: number}} World coordinates of cell center
   */
  offsetToWorld(col, row) {
    return this.gridToWorld(col, row);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell (top-left corner)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates
   */
  snapToGrid(worldX, worldY) {
    const { gridX, gridY } = this.worldToGrid(worldX, worldY);
    return this.gridToWorld(gridX, gridY);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell center
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates (cell center)
   */
  snapToCellCenter(worldX, worldY) {
    const { gridX, gridY } = this.worldToGrid(worldX, worldY);
    return this.getCellCenter(gridX, gridY);
  }
  
  /**
   * Calculate visible grid range for a given viewport
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @returns {{startX: number, endX: number, startY: number, endY: number}} Visible grid range
   */
  getVisibleGridRange(offsetX, offsetY, width, height, zoom) {
    const scaledCellSize = this.cellSize * zoom;
    
    const startX = Math.floor(-offsetX / scaledCellSize);
    const endX = Math.ceil((width - offsetX) / scaledCellSize);
    const startY = Math.floor(-offsetY / scaledCellSize);
    const endY = Math.ceil((height - offsetY) / scaledCellSize);
    
    return { startX, endX, startY, endY };
  }
  
  /**
   * Convert grid coordinates to screen coordinates (for rendering)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  gridToScreen(gridX, gridY, offsetX, offsetY, zoom) {
    const scaledCellSize = this.cellSize * zoom;
    const screenX = offsetX + gridX * scaledCellSize;
    const screenY = offsetY + gridY * scaledCellSize;
    return { screenX, screenY };
  }
  
  /**
   * Determine which edge of a cell was clicked based on world coordinates
   * 
   * Used for edge painting - detects if a click was near a cell edge rather
   * than in the cell center. Returns the cell coordinates and which side
   * of that cell the click was near.
   * 
   * @param {number} worldX - World X coordinate (from screenToWorld)
   * @param {number} worldY - World Y coordinate (from screenToWorld)
   * @param {number} threshold - Distance from edge to count as hit (0-0.5, default 0.15)
   *                             Expressed as fraction of cell size
   * @returns {{ x: number, y: number, side: string } | null} 
   *          Edge info with cell coords and side ('top'|'right'|'bottom'|'left'), 
   *          or null if click was in cell center
   */
  screenToEdge(worldX, worldY, threshold = 0.15) {
    // Get the cell coordinates
    const cellX = Math.floor(worldX / this.cellSize);
    const cellY = Math.floor(worldY / this.cellSize);
    
    // Calculate position within the cell (0-1 range)
    const offsetX = (worldX / this.cellSize) - cellX;
    const offsetY = (worldY / this.cellSize) - cellY;
    
    // Check proximity to each edge
    // Priority order: top, bottom, left, right (for corner disambiguation)
    // A click in a corner will prefer vertical edges (top/bottom)
    if (offsetY < threshold) {
      return { x: cellX, y: cellY, side: 'top' };
    }
    if (offsetY > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'bottom' };
    }
    if (offsetX < threshold) {
      return { x: cellX, y: cellY, side: 'left' };
    }
    if (offsetX > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'right' };
    }
    
    // Click was in cell center, not near any edge
    return null;
  }
  
  /**
   * Draw grid lines on the canvas using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state. Fill-based
   * rendering is unaffected by this issue.
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @param {Object} style - Grid style options
   * @param {string} style.lineColor - Grid line color
   * @param {number} style.lineWidth - Grid line width
   */
  drawGrid(ctx, offsetX, offsetY, width, height, zoom, style = {}) {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    const scaledCellSize = this.cellSize * zoom;
    
    // For rotation handling, calculate the visible range then add symmetric padding
    const { startX, endX, startY, endY } = this.getVisibleGridRange(
      offsetX, offsetY, width, height, zoom
    );
    
    // Add extra padding in all directions to handle rotation
    // Use 2x diagonal to ensure full coverage at any rotation angle
    const diagonal = Math.sqrt(width * width + height * height);
    const extraCells = Math.ceil(diagonal / scaledCellSize);
    
    const paddedStartX = startX - extraCells;
    const paddedEndX = endX + extraCells;
    const paddedStartY = startY - extraCells;
    const paddedEndY = endY + extraCells;
    
    // iOS defensive: Limit line extension to prevent aggressive clipping
    // During memory pressure, iOS may set restrictive clip regions
    // Lines with coordinates far outside canvas bounds get completely clipped
    const maxExtension = Math.max(width, height);
    
    // Use fillRect instead of stroke for iOS/CodeMirror compatibility
    // fillRect is immune to strokeStyle state corruption
    // iOS defensive: Reset composite operation before drawing
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    
    // For centered lines, offset by half the line width
    const halfWidth = lineWidth / 2;
    
    // Draw vertical lines with symmetric padding
    for (let x = paddedStartX; x <= paddedEndX; x++) {
      // iOS defensive: Set fillStyle for each line to work around state corruption
      ctx.fillStyle = lineColor;
      const screenX = offsetX + x * scaledCellSize;
      
      // fillRect(x, y, width, height) - vertical line is narrow width, tall height
      // iOS defensive: Use maxExtension instead of huge lineExtension
      ctx.fillRect(
        screenX - halfWidth,
        -maxExtension,
        lineWidth,
        height + maxExtension * 2
      );
    }
    
    // Draw horizontal lines with symmetric padding
    for (let y = paddedStartY; y <= paddedEndY; y++) {
      // iOS defensive: Set fillStyle for each line to work around state corruption
      ctx.fillStyle = lineColor;
      const screenY = offsetY + y * scaledCellSize;
      
      // fillRect(x, y, width, height) - horizontal line is wide width, narrow height
      // iOS defensive: Use maxExtension instead of huge lineExtension
      ctx.fillRect(
        -maxExtension,
        screenY - halfWidth,
        width + maxExtension * 2,
        lineWidth
      );
    }
  }



  
  /**
   * Draw a filled cell on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawCell(ctx, gridX, gridY, offsetX, offsetY, zoom, color) {
    const scaledCellSize = this.cellSize * zoom;
    const { screenX, screenY } = this.gridToScreen(gridX, gridY, offsetX, offsetY, zoom);
    
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
  }
  
  /**
   * Draw multiple cells of the same color (optimized batch rendering)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array<{x: number, y: number}>} cells - Array of cell coordinates
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawCells(ctx, cells, offsetX, offsetY, zoom, color) {
    const scaledCellSize = this.cellSize * zoom;
    ctx.fillStyle = color;
    
    for (const cell of cells) {
      const { screenX, screenY } = this.gridToScreen(cell.x, cell.y, offsetX, offsetY, zoom);
      ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
    }
  }
  
  /**
   * Get the size of a cell in screen pixels at current zoom
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled cell size
   */
  getScaledCellSize(zoom) {
    return this.cellSize * zoom;
  }
  
  /**
   * Check if coordinates are within bounds
   * GridGeometry is unbounded by default, always returns true
   * Override this if you need bounded grid behavior
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} True (always, grid is unbounded)
   */
  isWithinBounds(gridX, gridY) {
    // GridGeometry is unbounded - always return true
    // If bounds are needed in the future, add a bounds property like HexGeometry
    return true;
  }
  
  /**
   * Clamp coordinates to bounds
   * GridGeometry is unbounded by default, returns input unchanged
   * Override this if you need bounded grid behavior
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{gridX: number, gridY: number}} Input coordinates unchanged
   */
  clampToBounds(gridX, gridY) {
    // GridGeometry is unbounded - return input unchanged
    return { gridX, gridY };
  }
  
  /**
   * Get all grid cells within a rectangular area
   * @param {number} gridX1 - First corner X
   * @param {number} gridY1 - First corner Y
   * @param {number} gridX2 - Second corner X
   * @param {number} gridY2 - Second corner Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   */
  getCellsInRectangle(gridX1, gridY1, gridX2, gridY2) {
    const minX = Math.min(gridX1, gridX2);
    const maxX = Math.max(gridX1, gridX2);
    const minY = Math.min(gridY1, gridY2);
    const maxY = Math.max(gridY1, gridY2);
    
    const cells = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push({ x, y });
      }
    }
    
    return cells;
  }
  
  /**
   * Get all grid cells within a circle
   * @param {number} centerGridX - Center X in grid coordinates
   * @param {number} centerGridY - Center Y in grid coordinates
   * @param {number} radiusInCells - Radius in grid cells
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   */
  getCellsInCircle(centerGridX, centerGridY, radiusInCells) {
    const cells = [];
    const radiusSquared = radiusInCells * radiusInCells;
    
    // Bounding box for optimization
    const minX = Math.floor(centerGridX - radiusInCells);
    const maxX = Math.ceil(centerGridX + radiusInCells);
    const minY = Math.floor(centerGridY - radiusInCells);
    const maxY = Math.ceil(centerGridY + radiusInCells);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Check if cell center is within circle
        const dx = x + 0.5 - centerGridX;
        const dy = y + 0.5 - centerGridY;
        const distSquared = dx * dx + dy * dy;
        
        if (distSquared <= radiusSquared) {
          cells.push({ x, y });
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Get grid cells along a line (Bresenham's algorithm)
   * @param {number} gridX1 - Start X
   * @param {number} gridY1 - Start Y
   * @param {number} gridX2 - End X
   * @param {number} gridY2 - End Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates along the line
   */
  getCellsInLine(gridX1, gridY1, gridX2, gridY2) {
    const cells = [];
    
    let x = gridX1;
    let y = gridY1;
    
    const dx = Math.abs(gridX2 - gridX1);
    const dy = Math.abs(gridY2 - gridY1);
    const sx = gridX1 < gridX2 ? 1 : -1;
    const sy = gridY1 < gridY2 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      cells.push({ x, y });
      
      if (x === gridX2 && y === gridY2) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return cells;
  }
  
  /**
   * Calculate distance between two grid cells (Manhattan distance)
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @returns {number} Manhattan distance in cells
   */
  getManhattanDistance(gridX1, gridY1, gridX2, gridY2) {
    return Math.abs(gridX2 - gridX1) + Math.abs(gridY2 - gridY1);
  }
  
  /**
   * Calculate distance between two grid cells (Euclidean distance)
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @returns {number} Euclidean distance in cells
   */
  getEuclideanDistance(gridX1, gridY1, gridX2, gridY2) {
    const dx = gridX2 - gridX1;
    const dy = gridY2 - gridY1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate game distance between two grid cells with configurable diagonal rules
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @param {Object} options - Distance options
   * @param {string} options.diagonalRule - 'alternating' | 'equal' | 'euclidean'
   * @returns {number} Distance in cells
   */
  getCellDistance(gridX1, gridY1, gridX2, gridY2, options = {}) {
    const { diagonalRule = 'alternating' } = options;
    
    const dx = Math.abs(gridX2 - gridX1);
    const dy = Math.abs(gridY2 - gridY1);
    
    switch (diagonalRule) {
      case 'equal':
        // Chebyshev distance - every step (including diagonal) = 1
        return Math.max(dx, dy);
        
      case 'euclidean':
        // True geometric distance
        return Math.sqrt(dx * dx + dy * dy);
        
      case 'alternating':
      default:
        // D&D 5e / Pathfinder style: 5-10-5-10
        // Each diagonal costs 1.5 on average (first = 1, second = 2, etc.)
        const straights = Math.abs(dx - dy);
        const diagonals = Math.min(dx, dy);
        return straights + diagonals + Math.floor(diagonals / 2);
    }
  }
  
  /**
   * Create a cell object in grid coordinate format
   * Abstraction layer for cell creation - isolates coordinate property naming
   * @param {{gridX: number, gridY: number}} coords - Grid coordinates from worldToGrid()
   * @param {string} color - Cell color
   * @returns {{x: number, y: number, color: string}} Cell object
   */
  createCellObject(coords, color) {
    return { x: coords.gridX, y: coords.gridY, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * Abstraction layer for cell comparison - isolates coordinate property naming
   * @param {{x: number, y: number}} cell - Cell object to check
   * @param {{gridX: number, gridY: number}} coords - Grid coordinates from worldToGrid()
   * @returns {boolean} True if cell matches coordinates
   */
  cellMatchesCoords(cell, coords) {
    return cell.x === coords.gridX && cell.y === coords.gridY;
  }

  /**
   * Get all neighboring cells (4-directional: up, down, left, right)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   */
  getNeighbors(gridX, gridY) {
    // 4-directional neighbors (cardinal directions only)
    return [
      { x: gridX + 1, y: gridY },     // Right
      { x: gridX - 1, y: gridY },     // Left
      { x: gridX, y: gridY + 1 },     // Down
      { x: gridX, y: gridY - 1 }      // Up
    ];
  }

  /**
   * Get all neighboring cells including diagonals (8-directional)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   */
  getNeighbors8(gridX, gridY) {
    // 8-directional neighbors (including diagonals)
    return [
      { x: gridX + 1, y: gridY },     // Right
      { x: gridX + 1, y: gridY - 1 }, // Top-right
      { x: gridX, y: gridY - 1 },     // Up
      { x: gridX - 1, y: gridY - 1 }, // Top-left
      { x: gridX - 1, y: gridY },     // Left
      { x: gridX - 1, y: gridY + 1 }, // Bottom-left
      { x: gridX, y: gridY + 1 },     // Down
      { x: gridX + 1, y: gridY + 1 }  // Bottom-right
    ];
  }
}

return { GridGeometry };