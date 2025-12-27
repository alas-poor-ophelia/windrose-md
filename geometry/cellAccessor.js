/**
 * cellAccessor.js
 * 
 * Pure functions for cell data operations.
 * Abstracts coordinate normalization and cell manipulation.
 * Designed to support future segment-based cells without changing call sites.
 * 
 * COORDINATE SYSTEMS:
 * - Grid cells use {x, y} for storage
 * - Hex cells use {q, r} for storage
 * - Both geometries return {gridX, gridY} from worldToGrid/screenToGrid
 * 
 * This module normalizes all coordinate formats and provides a unified API
 * for cell operations across both geometry types.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Import geometry classes for instanceof checks
const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");

// ============================================================================
// GEOMETRY TYPE DETECTION
// ============================================================================

/**
 * Check if geometry is grid-based (square cells)
 * Uses instanceof for reliable type detection
 * @param {Object} geometry - Geometry instance
 * @returns {boolean} True if GridGeometry
 */
function isGridGeometry(geometry) {
  return geometry instanceof GridGeometry;
}

/**
 * Check if geometry is hex-based
 * Uses instanceof for reliable type detection
 * @param {Object} geometry - Geometry instance
 * @returns {boolean} True if HexGeometry
 */
function isHexGeometry(geometry) {
  return geometry instanceof HexGeometry;
}

// ============================================================================
// COORDINATE NORMALIZATION
// ============================================================================

/**
 * Normalize any coordinate format to canonical form for storage
 * 
 * Handles input formats:
 * - {x, y} - Grid cell format
 * - {q, r} - Hex cell format
 * - {gridX, gridY} - Output from worldToGrid/screenToGrid
 * - {col, row} - Offset coordinates
 * 
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance for type detection
 * @returns {Object} Canonical coords ({x, y} for grid, {q, r} for hex)
 */
function normalizeCoords(coords, geometry) {
  if (isGridGeometry(geometry)) {
    // Grid: normalize to {x, y}
    return {
      x: coords.x ?? coords.gridX ?? coords.col,
      y: coords.y ?? coords.gridY ?? coords.row
    };
  }
  // Hex: normalize to {q, r}
  return {
    q: coords.q ?? coords.gridX ?? coords.x,
    r: coords.r ?? coords.gridY ?? coords.y
  };
}

/**
 * Generate a stable string key for cell lookup
 * Used for O(1) cell queries via Map
 * 
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance
 * @returns {string} Unique key for this cell position
 */
function cellKey(coords, geometry) {
  const norm = normalizeCoords(coords, geometry);
  if (isGridGeometry(geometry)) {
    return `${norm.x},${norm.y}`;
  }
  return `${norm.q},${norm.r}`;
}

/**
 * Extract coordinates from a cell object in canonical form
 * @param {Object} cell - Cell object
 * @param {Object} geometry - Geometry instance
 * @returns {Object} Canonical coords
 */
function getCellCoords(cell, geometry) {
  if (isGridGeometry(geometry)) {
    return { x: cell.x, y: cell.y };
  }
  return { q: cell.q, r: cell.r };
}

// ============================================================================
// CELL QUERY
// ============================================================================

/**
 * Find cell at coordinates
 * @param {Array} cells - Array of cell objects
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance
 * @returns {Object|null} Cell object or null if not found
 */
function getCellAt(cells, coords, geometry) {
  return cells.find(cell => geometry.cellMatchesCoords(cell, coords)) || null;
}

/**
 * Get index of cell at coordinates
 * @param {Array} cells - Array of cell objects
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance
 * @returns {number} Index or -1 if not found
 */
function getCellIndex(cells, coords, geometry) {
  return cells.findIndex(cell => geometry.cellMatchesCoords(cell, coords));
}

/**
 * Check if cell exists at coordinates
 * @param {Array} cells - Array of cell objects
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance
 * @returns {boolean} True if cell exists
 */
function cellExists(cells, coords, geometry) {
  return getCellIndex(cells, coords, geometry) !== -1;
}

/**
 * Build lookup map for O(1) cell queries
 * Useful for batch operations or repeated lookups
 * 
 * @param {Array} cells - Array of cell objects
 * @param {Object} geometry - Geometry instance
 * @returns {Map} Map of cellKey -> cell
 */
function buildCellMap(cells, geometry) {
  const map = new Map();
  for (const cell of cells) {
    map.set(cellKey(cell, geometry), cell);
  }
  return map;
}

// ============================================================================
// CELL MODIFICATION (Immutable)
// All modification functions return new arrays, never mutate input
// ============================================================================

/**
 * Set cell color/opacity at coordinates (add or update)
 * If cell exists, updates it. If not, creates new cell.
 * 
 * @param {Array} cells - Current cells array
 * @param {Object} coords - Coordinates in any supported format
 * @param {string} color - Cell color
 * @param {number} opacity - Cell opacity (0-1)
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array
 */
function setCell(cells, coords, color, opacity, geometry) {
  const index = getCellIndex(cells, coords, geometry);
  
  if (index !== -1) {
    // Update existing cell
    const newCells = [...cells];
    newCells[index] = { ...newCells[index], color, opacity };
    return newCells;
  }
  
  // Create new cell using geometry's factory method
  const newCell = geometry.createCellObject(coords, color);
  newCell.opacity = opacity;
  return [...cells, newCell];
}

/**
 * Remove cell at coordinates
 * @param {Array} cells - Current cells array
 * @param {Object} coords - Coordinates in any supported format
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array with cell removed
 */
function removeCell(cells, coords, geometry) {
  return cells.filter(cell => !geometry.cellMatchesCoords(cell, coords));
}

/**
 * Batch set multiple cells (more efficient than repeated setCell)
 * Uses Map internally for O(1) lookups during batch processing.
 * 
 * @param {Array} cells - Current cells array
 * @param {Array} cellUpdates - Array of {coords, color, opacity}
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array with all updates applied
 */
function setCells(cells, cellUpdates, geometry) {
  // Build map of existing cells for O(1) lookup
  const cellMap = new Map();
  for (const cell of cells) {
    cellMap.set(cellKey(cell, geometry), cell);
  }
  
  // Apply all updates
  for (const update of cellUpdates) {
    const key = cellKey(update.coords, geometry);
    const existing = cellMap.get(key);
    
    if (existing) {
      // Update existing cell
      cellMap.set(key, { ...existing, color: update.color, opacity: update.opacity });
    } else {
      // Create new cell
      const newCell = geometry.createCellObject(update.coords, update.color);
      newCell.opacity = update.opacity;
      cellMap.set(key, newCell);
    }
  }
  
  return Array.from(cellMap.values());
}

/**
 * Remove multiple cells by coordinates
 * Uses Set internally for O(1) lookup during filtering.
 * 
 * @param {Array} cells - Current cells array
 * @param {Array} coordsList - Array of coordinates to remove
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array with specified cells removed
 */
function removeCells(cells, coordsList, geometry) {
  const removeKeys = new Set(coordsList.map(c => cellKey(c, geometry)));
  return cells.filter(cell => !removeKeys.has(cellKey(cell, geometry)));
}

/**
 * Remove cells within a rectangular bounds
 * Useful for clear area operations.
 * 
 * @param {Array} cells - Current cells array
 * @param {number} x1 - First corner X
 * @param {number} y1 - First corner Y
 * @param {number} x2 - Second corner X
 * @param {number} y2 - Second corner Y
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array with cells in bounds removed
 */
function removeCellsInBounds(cells, x1, y1, x2, y2, geometry) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return cells.filter(cell => {
    if (isGridGeometry(geometry)) {
      // Grid cells use {x, y}
      return !(cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY);
    }
    // Hex cells use {q, r} - for hex maps, rectangle tool shouldn't be available
    // but we handle it for completeness
    return !(cell.q >= minX && cell.q <= maxX && cell.r >= minY && cell.r <= maxY);
  });
}

// ============================================================================
// FUTURE: SEGMENT SUPPORT (Stub)
// These functions prepare for partial cell painting with triangle segments
// ============================================================================

/**
 * Check if cell has partial fill (segments)
 * Currently always false; will detect segment-based cells in future
 * @param {Object} cell - Cell object
 * @returns {boolean} True if cell uses segment-based rendering
 */
function hasSegments(cell) {
  return cell.segments !== undefined;
}

/**
 * Get fill color for cell (handles both simple and segment cells)
 * For segment cells, returns dominant color or null if mixed
 * @param {Object} cell - Cell object
 * @returns {string|null} Color string or null for mixed segment cells
 */
function getCellFill(cell) {
  if (hasSegments(cell)) {
    // Future: analyze segments to find dominant color
    // For now, return null to indicate mixed
    return null;
  }
  return cell.color;
}

// ============================================================================
// EXPORTS
// ============================================================================

return {
  // Geometry type detection
  isGridGeometry,
  isHexGeometry,
  
  // Coordinate utilities
  normalizeCoords,
  cellKey,
  getCellCoords,
  
  // Query functions
  getCellAt,
  getCellIndex,
  cellExists,
  buildCellMap,
  
  // Modification functions (immutable)
  setCell,
  removeCell,
  setCells,
  removeCells,
  removeCellsInBounds,
  
  // Future segment support
  hasSegments,
  getCellFill
};