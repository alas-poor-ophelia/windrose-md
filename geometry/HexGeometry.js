/**
 * HexGeometry.js
 * 
 * Handles all hex-specific geometric calculations and rendering.
 * This class abstracts hexagonal grid mathematics, coordinate conversions,
 * and basic rendering operations.
 * 
 * Extends BaseGeometry to implement the standard geometry interface
 * for hexagonal grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Axial coordinates (q, r): Integer hex indices using axial coordinate system
 *   Used internally for hex math and storage. Creates parallelogram when iterated.
 * 
 * - Offset coordinates (col, row): Integer indices in rectangular space
 *   Used for bounds checking and rectangular iteration via offsetCoordinates.js
 *   Makes rectangular grid display possible. Min is always (0,0).
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates in the map's coordinate system
 *   Used for positioning and measurements. Origin at (0,0) in center of hex (0,0).
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on the canvas
 *   Used for rendering. Includes viewport transforms (pan/zoom/rotation).
 * 
 * COORDINATE NAMING CONVENTION:
 * - Storage format: Cells stored as {q, r, color} using axial coordinates
 * - API methods: Use (q, r) as parameter names for clarity
 * - API returns: Collection methods return {x, y} where x=q, y=r for consistency with GridGeometry
 * - Objects: Store position as {x, y} where x=q, y=r (axial coordinates in hex map context)
 * 
 * Hex Size Definition:
 * - hexSize is the radius from center to vertex
 * - For flat-top: width = 2 * hexSize, height = sqrt(3) * hexSize
 * - For pointy-top: width = sqrt(3) * hexSize, height = 2 * hexSize
 * 
 * @extends BaseGeometry
 */

// Import offset coordinate utilities for rectangular bounds and iteration
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { BaseGeometry } = await requireModuleByName("BaseGeometry.js");
const { axialToOffset, offsetToAxial, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js");

class HexGeometry extends BaseGeometry {
  /**
   * @param {number} hexSize - Radius from hex center to vertex in pixels
   * @param {string} orientation - Either 'flat' or 'pointy'
   * @param {Object} bounds - Optional bounds {maxCol, maxRow} in offset coordinates (min is always 0,0)
   */
  constructor(hexSize, orientation = 'flat', bounds = null) {
    super(); // Call base class constructor
    this.hexSize = hexSize;
    this.orientation = orientation;
    this.bounds = bounds; // {maxCol: number, maxRow: number} or null for infinite
    
    // Precalculate commonly used values
    this.sqrt3 = Math.sqrt(3);
    
    // Layout constants depend on orientation
    if (orientation === 'flat') {
      // Flat-top hexagon
      this.width = hexSize * 2;           // Distance between parallel sides
      this.height = hexSize * this.sqrt3; // Point-to-point height
      this.horizSpacing = hexSize * 1.5;  // Horizontal distance between hex centers
      this.vertSpacing = hexSize * this.sqrt3; // Vertical distance between hex centers
    } else {
      // Pointy-top hexagon
      this.width = hexSize * this.sqrt3;
      this.height = hexSize * 2;
      this.horizSpacing = hexSize * this.sqrt3;
      this.vertSpacing = hexSize * 1.5;
    }
  }
  
  /**
   * Convert world (pixel) coordinates to axial hex coordinates
   * Uses the standard axial coordinate system (q, r)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{q: number, r: number}} Axial hex coordinates
   */
  worldToHex(worldX, worldY) {
    if (this.orientation === 'flat') {
      // Flat-top conversion
      const q = (worldX * (2/3)) / this.hexSize;
      const r = ((-worldX / 3) + (this.sqrt3 / 3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    } else {
      // Pointy-top conversion
      const q = ((this.sqrt3 / 3) * worldX - (1/3) * worldY) / this.hexSize;
      const r = ((2/3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    }
  }
  
  /**
   * Alias for worldToHex - provides consistent API with GridGeometry
   * Returns gridX/gridY property names for consistency with GridGeometry
   * (gridX = q, gridY = r for hex maps)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid coordinates (q as gridX, r as gridY)
   */
  worldToGrid(worldX, worldY) {
    const { q, r } = this.worldToHex(worldX, worldY);
    // Return with property names matching GridGeometry API
    return { gridX: q, gridY: r };
  }
  
  /**
   * Round fractional hex coordinates to nearest integer hex
   * Uses cube coordinate rounding for accuracy
   * @param {number} q - Fractional q coordinate
   * @param {number} r - Fractional r coordinate
   * @returns {{q: number, r: number}} Rounded axial coordinates
   */
  roundHex(q, r) {
    // Convert axial to cube coordinates
    const x = q;
    const z = r;
    const y = -x - z;
    
    // Round each coordinate
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    
    // Fix rounding errors (cube coords must sum to 0)
    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);
    
    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }
    
    // Convert back to axial
    return { q: rx, r: rz };
  }
  
  /**
   * Convert axial hex coordinates to world (pixel) coordinates
   * Returns the center point of the hex
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  hexToWorld(q, r) {
    if (this.orientation === 'flat') {
      // Flat-top conversion
      const worldX = this.hexSize * (3/2) * q;
      const worldY = this.hexSize * (this.sqrt3 / 2 * q + this.sqrt3 * r);
      return { worldX, worldY };
    } else {
      // Pointy-top conversion
      const worldX = this.hexSize * (this.sqrt3 * q + this.sqrt3 / 2 * r);
      const worldY = this.hexSize * (3/2) * r;
      return { worldX, worldY };
    }
  }
  
  /**
   * Alias for hexToWorld - provides consistent API with GridGeometry
   * GridGeometry uses gridToWorld(), HexGeometry uses this alias
   * @param {number} q - Axial q coordinate (or x for API consistency)
   * @param {number} r - Axial r coordinate (or y for API consistency)
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  gridToWorld(q, r) {
    return this.hexToWorld(q, r);
  }
  
  /**
   * Get the center point of a hex in world coordinates
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  getHexCenter(q, r) {
    return this.hexToWorld(q, r);
  }
  
  /**
   * Convert offset coordinates to world coordinates
   * 
   * HEX-SPECIFIC IMPLEMENTATION (for BaseGeometry API consistency)
   * 
   * Offset coordinates (col, row) are used for rectangular bounds in hex maps.
   * This method combines offsetToAxial + hexToWorld. GridGeometry implements
   * the same method as a passthrough to gridToWorld() for polymorphic usage.
   * 
   * Primarily used for calculating grid center when positioning background images.
   * 
   * @param {number} col - Column in offset coordinates (0 to maxCol-1)
   * @param {number} row - Row in offset coordinates (0 to maxRow-1)
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  offsetToWorld(col, row) {
    const { q, r } = offsetToAxial(col, row, this.orientation);
    return this.hexToWorld(q, r);
  }
  
  /**
   * Get the six vertices of a hex in world coordinates
   * Vertices are returned in clockwise order starting from the rightmost point (flat-top)
   * or top point (pointy-top)
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {Array<{worldX: number, worldY: number}>} Array of 6 vertex positions
   */
  getHexVertices(q, r) {
    const center = this.hexToWorld(q, r);
    const vertices = [];
    
    // Angle offset depends on orientation
    const angleOffset = this.orientation === 'flat' ? 0 : 30;
    
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i + angleOffset;
      const angleRad = (Math.PI / 180) * angleDeg;
      vertices.push({
        worldX: center.worldX + this.hexSize * Math.cos(angleRad),
        worldY: center.worldY + this.hexSize * Math.sin(angleRad)
      });
    }
    
    return vertices;
  }
  
  /**
   * Snap world coordinates to the nearest hex center
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates (hex center)
   */
  snapToHexCenter(worldX, worldY) {
    const { q, r } = this.worldToHex(worldX, worldY);
    return this.getHexCenter(q, r);
  }
  
  /**
   * Calculate visible hex range for a given viewport
   * Returns a bounding box in hex coordinates (may include negative values)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @returns {{minQ: number, maxQ: number, minR: number, maxR: number}} Visible hex range
   */
  getVisibleHexRange(offsetX, offsetY, width, height, zoom) {
    // Convert viewport corners to world coordinates
    const topLeft = this.screenToWorld(-offsetX, -offsetY, zoom);
    const topRight = this.screenToWorld(width - offsetX, -offsetY, zoom);
    const bottomLeft = this.screenToWorld(-offsetX, height - offsetY, zoom);
    const bottomRight = this.screenToWorld(width - offsetX, height - offsetY, zoom);
    
    // Convert corners to hex coordinates
    const corners = [
      this.worldToHex(topLeft.worldX, topLeft.worldY),
      this.worldToHex(topRight.worldX, topRight.worldY),
      this.worldToHex(bottomLeft.worldX, bottomLeft.worldY),
      this.worldToHex(bottomRight.worldX, bottomRight.worldY)
    ];
    
    // Find bounding box with some padding
    const padding = 2;
    const minQ = Math.min(...corners.map(c => c.q)) - padding;
    const maxQ = Math.max(...corners.map(c => c.q)) + padding;
    const minR = Math.min(...corners.map(c => c.r)) - padding;
    const maxR = Math.max(...corners.map(c => c.r)) + padding;
    
    // Don't clamp here - return full visible range
    // Bounds enforcement happens at the rendering level
    return { minQ, maxQ, minR, maxR };
  }
  

  /**
   * Convert hex coordinates to screen coordinates (for rendering)
   * Provides API consistency with GridGeometry.gridToScreen()
   * Returns position offset such that adding objectSize/2 centers the object in the hex
   * @param {number} q - Hex q coordinate (or x for API consistency)
   * @param {number} r - Hex r coordinate (or y for API consistency)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  gridToScreen(q, r, offsetX, offsetY, zoom) {
    // Get hex center in world coordinates
    const { worldX, worldY } = this.hexToWorld(q, r);
    
    // Object rendering adds objectWidth/2 and objectHeight/2 to center the object
    // where objectWidth = hexSize * zoom
    // So we need to return: hexCenter - (hexSize/2, hexSize/2)
    // This way: returned_position + hexSize/2 = hexCenter
    const topLeftWorldX = worldX - (this.hexSize / 2);
    const topLeftWorldY = worldY - (this.hexSize / 2);
    
    // Convert to screen coordinates
    return this.worldToScreen(topLeftWorldX, topLeftWorldY, offsetX, offsetY, zoom);
  }
  
  /**
   * Draw hex grid on the canvas
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
    
    // Safety check: validate inputs to prevent runaway iteration
    if (!isFinite(width) || !isFinite(height) || !isFinite(zoom) || 
        !isFinite(offsetX) || !isFinite(offsetY) || zoom <= 0) {
      console.warn('[HexGeometry.drawGrid] Invalid input values, skipping render');
      return;
    }
    
    let minCol, maxCol, minRow, maxRow;
    
    // For BOUNDED hex maps, use the bounds directly
    // This is much more efficient and prevents runaway iteration
    if (this.bounds) {
      minCol = 0;
      maxCol = this.bounds.maxCol - 1;
      minRow = 0;
      maxRow = this.bounds.maxRow - 1;
    } else {
      // For rotation handling, we need to calculate the visible range based on 
      // an expanded viewport that covers the entire rotated canvas area
      // Use 2x the diagonal to ensure we cover all rotations
      const diagonal = Math.sqrt(width * width + height * height) * 2;
      const expandedWidth = diagonal;
      const expandedHeight = diagonal;
      
      const { minQ, maxQ, minR, maxR } = this.getVisibleHexRange(
        offsetX, offsetY, expandedWidth, expandedHeight, zoom
      );
      
      // Safety limit: prevent iteration over more than 10000 hexes in unbounded mode
      const maxHexCount = 10000;
      const axialRange = (maxQ - minQ + 1) * (maxR - minR + 1);
      if (axialRange > maxHexCount) {
        console.warn(`[HexGeometry.drawGrid] Visible range too large (${axialRange} hexes), limiting`);
        // Fall back to a reasonable default visible area
        const halfRange = Math.floor(Math.sqrt(maxHexCount) / 2);
        const centerQ = Math.floor((minQ + maxQ) / 2);
        const centerR = Math.floor((minR + maxR) / 2);
        
        // Convert limited axial range to offset
        const corners = [
          axialToOffset(centerQ - halfRange, centerR - halfRange, this.orientation),
          axialToOffset(centerQ + halfRange, centerR + halfRange, this.orientation)
        ];
        minCol = Math.min(corners[0].col, corners[1].col);
        maxCol = Math.max(corners[0].col, corners[1].col);
        minRow = Math.min(corners[0].row, corners[1].row);
        maxRow = Math.max(corners[0].row, corners[1].row);
      } else {
        // Convert axial visible range to offset coordinates
        // Build bounding box without creating intermediate array (optimization)
        minCol = Infinity;
        maxCol = -Infinity;
        minRow = Infinity;
        maxRow = -Infinity;
        
        for (let q = minQ; q <= maxQ; q++) {
          for (let r = minR; r <= maxR; r++) {
            const { col, row } = axialToOffset(q, r, this.orientation);
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
          }
        }
      }
    }
    
    // Final safety check on iteration count
    const totalHexes = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    if (totalHexes > 50000 || !isFinite(totalHexes)) {
      console.warn(`[HexGeometry.drawGrid] Too many hexes to draw (${totalHexes}), aborting`);
      return;
    }
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    
    // CRITICAL: Iterate in OFFSET space (rectangular)
    // This creates a rectangular grid instead of a parallelogram
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        // Convert offset coords to axial for drawing
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only draw if within bounds (or no bounds set for infinite maps)
        if (!this.bounds || this.isWithinBounds(q, r)) {
          this.drawHexOutline(ctx, q, r, offsetX, offsetY, zoom);
        }
      }
    }
  }

  
  /**
   * Draw a single hex outline
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   */
  drawHexOutline(ctx, q, r, offsetX, offsetY, zoom) {
    const vertices = this.getHexVertices(q, r);
    
    ctx.beginPath();
    
    // Convert first vertex to screen coordinates and move to it
    const first = this.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
    ctx.moveTo(first.screenX, first.screenY);
    
    // Draw lines to remaining vertices
    for (let i = 1; i < vertices.length; i++) {
      const vertex = this.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
      ctx.lineTo(vertex.screenX, vertex.screenY);
    }
    
    // Close the path back to first vertex
    ctx.closePath();
    ctx.stroke();
  }
  
  /**
   * Draw a filled hex on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawHex(ctx, q, r, offsetX, offsetY, zoom, color) {
    const vertices = this.getHexVertices(q, r);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    
    // Convert first vertex to screen coordinates and move to it
    const first = this.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
    ctx.moveTo(first.screenX, first.screenY);
    
    // Draw lines to remaining vertices
    for (let i = 1; i < vertices.length; i++) {
      const vertex = this.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
      ctx.lineTo(vertex.screenX, vertex.screenY);
    }
    
    // Close the path and fill
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Get the size of a hex in screen pixels at current zoom
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled hex size
   */
  getScaledHexSize(zoom) {
    return this.hexSize * zoom;
  }
  
  /**
   * Alias for getScaledHexSize - provides consistent API with GridGeometry
   * GridGeometry calls this "CellSize" while HexGeometry calls it "HexSize"
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled hex size
   */
  getScaledCellSize(zoom) {
    return this.getScaledHexSize(zoom);
  }

  /**
   * Calculate distance between two hexes (in hex units)
   * Uses cube coordinate system for accurate hex distance
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getHexDistance(q1, r1, q2, r2) {
    // Convert to cube coordinates
    const x1 = q1;
    const z1 = r1;
    const y1 = -x1 - z1;
    
    const x2 = q2;
    const z2 = r2;
    const y2 = -x2 - z2;
    
    // Cube distance formula
    return (Math.abs(x1 - x2) + Math.abs(y1 - y2) + Math.abs(z1 - z2)) / 2;
  }
  
  /**
   * Get all neighboring hexes
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {Array<{q: number, r: number}>} Array of neighbor coordinates
   */
  getNeighbors(q, r) {
    // Axial direction vectors (same for both orientations)
    const directions = [
      { q: 1, r: 0 },   // East
      { q: 1, r: -1 },  // Northeast
      { q: 0, r: -1 },  // Northwest
      { q: -1, r: 0 },  // West
      { q: -1, r: 1 },  // Southwest
      { q: 0, r: 1 }    // Southeast
    ];
    
    return directions.map(dir => ({
      q: q + dir.q,
      r: r + dir.r
    }));
  }
  
  /**
   * Check if hex coordinates are within bounds
   * Converts axial coords to offset and checks rectangular bounds
   * If no bounds are set, always returns true
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {boolean} True if coordinates are within bounds
   */
  isWithinBounds(q, r) {
    if (!this.bounds) return true; // No bounds = infinite map
    
    // Convert axial to offset coordinates
    const { col, row } = axialToOffset(q, r, this.orientation);
    
    // Check rectangular bounds (exclusive: maxCol=26 means 26 columns, indices 0-25)
    return col >= 0 && col < this.bounds.maxCol && 
           row >= 0 && row < this.bounds.maxRow;
  }
  
  /**
   * Clamp hex coordinates to bounds
   * Converts to offset, clamps, then converts back to axial
   * If no bounds are set, returns coordinates unchanged
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{q: number, r: number}} Clamped coordinates in axial
   */
  clampToBounds(q, r) {
    if (!this.bounds) return { q, r }; // No bounds = infinite map
    
    // Convert to offset
    const { col, row } = axialToOffset(q, r, this.orientation);
    
    // Clamp in offset space (max valid index is maxCol-1 since bounds are exclusive)
    const clampedCol = Math.max(0, Math.min(this.bounds.maxCol - 1, col));
    const clampedRow = Math.max(0, Math.min(this.bounds.maxRow - 1, row));
    
    // Convert back to axial
    return offsetToAxial(clampedCol, clampedRow, this.orientation);
  }
  
  /**
   * Create a cell object in hex coordinate format
   * Abstraction layer for cell creation - isolates coordinate property naming
   * @param {{q: number, r: number}} coords - Hex coordinates from worldToGrid()
   * @param {string} color - Cell color
   * @returns {{q: number, r: number, color: string}} Cell object
   */
  createCellObject(coords, color) {
    // Handle both {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    return { q, r, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * Abstraction layer for cell comparison - isolates coordinate property naming
   * @param {{q: number, r: number}} cell - Cell object to check
   * @param {{q: number, r: number}} coords - Hex coordinates from worldToGrid()
   * @returns {boolean} True if cell matches coordinates
   */
  cellMatchesCoords(cell, coords) {
    // Handle both {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    return cell.q === q && cell.r === r;
  }

  /**
   * Get all hexes within a rectangular area (defined by two corner hexes)
   * Uses offset coordinates to iterate a rectangular bounds, then converts back to axial
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} q1 - First corner q coordinate
   * @param {number} r1 - First corner r coordinate
   * @param {number} q2 - Second corner q coordinate
   * @param {number} r2 - Second corner r coordinate
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates in rectangle
   */
  getCellsInRectangle(q1, r1, q2, r2) {
    // Convert both corners to offset coordinates
    const offset1 = axialToOffset(q1, r1, this.orientation);
    const offset2 = axialToOffset(q2, r2, this.orientation);
    
    // Find rectangular bounds in offset space
    const minCol = Math.min(offset1.col, offset2.col);
    const maxCol = Math.max(offset1.col, offset2.col);
    const minRow = Math.min(offset1.row, offset2.row);
    const maxRow = Math.max(offset1.row, offset2.row);
    
    // Iterate rectangle in offset space and convert back to axial
    const cells = [];
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only include if within bounds (if bounds are set)
        if (this.isWithinBounds(q, r)) {
          // Return as {x, y} for API consistency with GridGeometry
          cells.push({ x: q, y: r });
        }
      }
    }
    
    return cells;
  }

  /**
   * Get all hexes within a circular area (defined by center and radius in hex units)
   * Uses hex distance calculation for accurate circular selection
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} radiusInHexes - Radius in hex units
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates in circle
   */
  getCellsInCircle(centerQ, centerR, radiusInHexes) {
    const cells = [];
    
    // Convert center to offset to establish rectangular search bounds
    const centerOffset = axialToOffset(centerQ, centerR, this.orientation);
    const minCol = Math.floor(centerOffset.col - radiusInHexes);
    const maxCol = Math.ceil(centerOffset.col + radiusInHexes);
    const minRow = Math.floor(centerOffset.row - radiusInHexes);
    const maxRow = Math.ceil(centerOffset.row + radiusInHexes);
    
    // Iterate rectangular bounds and filter by hex distance
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only include if within bounds and within circular radius
        if (this.isWithinBounds(q, r)) {
          const distance = this.getHexDistance(centerQ, centerR, q, r);
          if (distance <= radiusInHexes) {
            // Return as {x, y} for API consistency with GridGeometry
            cells.push({ x: q, y: r });
          }
        }
      }
    }
    
    return cells;
  }

  /**
   * Calculate distance between two hexes
   * Alias for getHexDistance() - provides API consistency with GridGeometry
   * GridGeometry uses getEuclideanDistance(), hex maps use hex distance which is more natural
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getEuclideanDistance(q1, r1, q2, r2) {
    // For hexes, use hex distance (which is more natural than Euclidean)
    return this.getHexDistance(q1, r1, q2, r2);
  }

  /**
   * Calculate Manhattan distance between two hexes
   * For hexes, this is the same as hex distance
   * Provided for API consistency with GridGeometry
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getManhattanDistance(q1, r1, q2, r2) {
    // For hexes, Manhattan distance is the same as hex distance
    return this.getHexDistance(q1, r1, q2, r2);
  }

  /**
   * Get hexes along a line between two hexes
   * Uses hex line traversal algorithm (linear interpolation in cube coordinates)
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} q1 - Start hex q coordinate
   * @param {number} r1 - Start hex r coordinate
   * @param {number} q2 - End hex q coordinate
   * @param {number} r2 - End hex r coordinate
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates along the line
   */
  getCellsInLine(q1, r1, q2, r2) {
    const distance = this.getHexDistance(q1, r1, q2, r2);
    const cells = [];
    
    // If distance is 0, return just the start hex
    if (distance === 0) {
      return [{ x: q1, y: r1 }];
    }
    
    // Use linear interpolation in cube coordinates
    for (let i = 0; i <= distance; i++) {
      const t = i / distance;
      
      // Interpolate in cube coordinates
      const x1 = q1;
      const z1 = r1;
      const y1 = -x1 - z1;
      
      const x2 = q2;
      const z2 = r2;
      const y2 = -x2 - z2;
      
      // Linear interpolation
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const z = z1 + (z2 - z1) * t;
      
      // Round to nearest hex
      const rounded = this.roundHex(x, z);
      
      // Only include if within bounds
      if (this.isWithinBounds(rounded.q, rounded.r)) {
        // Return as {x, y} for API consistency with GridGeometry
        cells.push({ x: rounded.q, y: rounded.r });
      }
    }
    
    return cells;
  }
}

return { HexGeometry };