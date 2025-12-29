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

// Import segment constants for partial cell painting
const { SEGMENT_NAMES } = await requireModuleByName("dmtConstants.js");

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
// SEGMENT SUPPORT - Partial cell painting with triangle segments
// ============================================================================

/**
 * Check if cell has partial fill (segments)
 * @param {Object} cell - Cell object
 * @returns {boolean} True if cell uses segment-based rendering
 */
function hasSegments(cell) {
  return cell && cell.segments !== undefined && Object.keys(cell.segments).length > 0;
}

/**
 * Check if cell is a simple (full) cell
 * @param {Object} cell - Cell object
 * @returns {boolean} True if cell is a simple cell (no segments property)
 */
function isSimpleCell(cell) {
  return cell && cell.color && !hasSegments(cell);
}

/**
 * Get fill color for cell (handles both simple and segment cells)
 * Segment cells always have a single color for all segments
 * @param {Object} cell - Cell object
 * @returns {string|null} Color string or null if no cell
 */
function getCellFill(cell) {
  if (!cell) return null;
  return cell.color;
}

/**
 * Get array of filled segment names for a cell
 * Simple cells return all 8 segments; segment cells return only filled ones
 * @param {Object} cell - Cell object
 * @returns {Array<string>} Array of segment names ['nw', 'n', ...]
 */
function getFilledSegments(cell) {
  if (!cell) return [];
  if (isSimpleCell(cell)) {
    // Simple cell = all 8 segments filled
    return [...SEGMENT_NAMES];
  }
  if (hasSegments(cell)) {
    return Object.keys(cell.segments).filter(seg => cell.segments[seg]);
  }
  return [];
}

/**
 * Normalize cell by collapsing full segment cells to simple cells
 * If all 8 segments are filled, convert to simple cell (remove segments property)
 * If no segments are filled, return null (cell should be removed)
 * @param {Object} cell - Cell object
 * @returns {Object|null} Normalized cell, or null if cell should be removed
 */
function normalizeCell(cell) {
  if (!cell) return cell;
  
  // If cell has segments property (even if empty), check segment count
  if (cell.segments !== undefined) {
    const filledCount = Object.keys(cell.segments).filter(seg => cell.segments[seg]).length;
    
    if (filledCount === 8) {
      // All segments filled - collapse to simple cell
      const { segments, ...simpleCell } = cell;
      return simpleCell;
    }
    
    if (filledCount === 0) {
      // No segments filled - this cell should be removed
      return null;
    }
  }
  
  return cell;
}

/**
 * Set segments on a cell (add or update)
 * If cell doesn't exist, creates a new segment cell
 * If cell exists, adds segments and updates color
 * Auto-collapses to simple cell if all 8 segments are filled
 * 
 * @param {Array} cells - Current cells array
 * @param {Object} coords - Coordinates in any supported format
 * @param {Array<string>} segmentList - Array of segment names to fill ['nw', 'n', ...]
 * @param {string} color - Cell color
 * @param {number} opacity - Cell opacity (0-1)
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array
 */
function setSegments(cells, coords, segmentList, color, opacity, geometry) {
  // Grid-only feature check
  if (!isGridGeometry(geometry)) {
    console.warn('setSegments: Segment painting is only supported for grid maps');
    return cells;
  }
  
  const index = getCellIndex(cells, coords, geometry);
  
  if (index !== -1) {
    // Cell exists - update it
    const existingCell = cells[index];
    const newCells = [...cells];
    
    if (isSimpleCell(existingCell)) {
      // Converting simple cell to segment cell?
      // If adding all 8 segments, just update color (keep it simple)
      if (segmentList.length === 8) {
        newCells[index] = { ...existingCell, color, opacity };
        return newCells;
      }
      // Otherwise, we'd need to convert to segment cell - but spec says
      // painting on simple cell doesn't remove segments, so we just update color
      newCells[index] = { ...existingCell, color, opacity };
      return newCells;
    }
    
    // Existing segment cell - merge segments and update color
    const mergedSegments = { ...existingCell.segments };
    for (const seg of segmentList) {
      if (SEGMENT_NAMES.includes(seg)) {
        mergedSegments[seg] = true;
      }
    }
    
    let newCell = { ...existingCell, segments: mergedSegments, color, opacity };
    newCell = normalizeCell(newCell);
    
    if (newCell === null) {
      // All segments removed - remove cell entirely
      return cells.filter((_, i) => i !== index);
    }
    
    newCells[index] = newCell;
    return newCells;
  }
  
  // Cell doesn't exist - create new segment cell
  const norm = normalizeCoords(coords, geometry);
  const newSegments = {};
  for (const seg of segmentList) {
    if (SEGMENT_NAMES.includes(seg)) {
      newSegments[seg] = true;
    }
  }
  
  // If all 8 segments, create simple cell instead
  if (Object.keys(newSegments).length === 8) {
    const simpleCell = { ...norm, color, opacity };
    return [...cells, simpleCell];
  }
  
  // Create segment cell
  if (Object.keys(newSegments).length === 0) {
    return cells; // No valid segments to add
  }
  
  const segmentCell = { ...norm, segments: newSegments, color, opacity };
  return [...cells, segmentCell];
}

/**
 * Remove segments from a cell
 * If all segments are removed, removes the cell entirely
 * 
 * @param {Array} cells - Current cells array
 * @param {Object} coords - Coordinates in any supported format
 * @param {Array<string>} segmentList - Array of segment names to remove
 * @param {Object} geometry - Geometry instance
 * @returns {Array} New cells array
 */
function removeSegments(cells, coords, segmentList, geometry) {
  // Grid-only feature check
  if (!isGridGeometry(geometry)) {
    console.warn('removeSegments: Segment painting is only supported for grid maps');
    return cells;
  }
  
  const index = getCellIndex(cells, coords, geometry);
  if (index === -1) return cells; // Cell doesn't exist
  
  const existingCell = cells[index];
  const newCells = [...cells];
  
  if (isSimpleCell(existingCell)) {
    // Simple cell - convert to segment cell with specified segments removed
    const remainingSegments = {};
    for (const seg of SEGMENT_NAMES) {
      if (!segmentList.includes(seg)) {
        remainingSegments[seg] = true;
      }
    }
    
    if (Object.keys(remainingSegments).length === 0) {
      // All segments removed - remove cell
      return cells.filter((_, i) => i !== index);
    }
    
    // Create segment cell with remaining segments
    const norm = getCellCoords(existingCell, geometry);
    const segmentCell = { 
      ...norm, 
      segments: remainingSegments, 
      color: existingCell.color, 
      opacity: existingCell.opacity ?? 1 
    };
    newCells[index] = segmentCell;
    return newCells;
  }
  
  // Existing segment cell - remove specified segments
  const updatedSegments = { ...existingCell.segments };
  for (const seg of segmentList) {
    delete updatedSegments[seg];
  }
  
  if (Object.keys(updatedSegments).length === 0) {
    // All segments removed - remove cell
    return cells.filter((_, i) => i !== index);
  }
  
  newCells[index] = { ...existingCell, segments: updatedSegments };
  return newCells;
}

/**
 * Check if neighbor segment is filled (for border calculation)
 * Handles both simple cells (all segments filled) and segment cells
 * 
 * @param {Map} cellMap - Cell lookup map from buildCellMap
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @param {string} segment - Segment name to check
 * @param {Object} geometry - Geometry instance
 * @returns {boolean} True if the segment is filled in the neighbor
 */
function neighborSegmentFilled(cellMap, x, y, segment, geometry) {
  // Use cellKey for consistent lookup (matches how buildCellMap creates keys)
  const key = cellKey({ x, y }, geometry);
  const neighbor = cellMap.get(key);
  
  if (!neighbor) return false;
  if (isSimpleCell(neighbor)) return true; // Simple cell = all segments filled
  if (hasSegments(neighbor)) return !!neighbor.segments[segment];
  
  return false;
}

/**
 * Determine which segment a point falls into based on position within a cell
 * Uses angle from center to determine which of 8 pie-slice segments contains the point
 * 
 * Segment layout (angles from center, 0Â° = right, counterclockwise):
 *   nw: 112.5Â° to 157.5Â°    n: 67.5Â° to 112.5Â°
 *   w:  157.5Â° to 202.5Â°    ne: 22.5Â° to 67.5Â°
 *   sw: 202.5Â° to 247.5Â°    e: -22.5Â° to 22.5Â° (337.5Â° to 22.5Â°)
 *   s:  247.5Â° to 292.5Â°    se: 292.5Â° to 337.5Â°
 * 
 * @param {number} localX - X position within cell (0 to 1, where 0.5 is center)
 * @param {number} localY - Y position within cell (0 to 1, where 0.5 is center)
 * @returns {string} Segment name ('nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w')
 */
function getSegmentAtPosition(localX, localY) {
  // Calculate position relative to center (center is at 0.5, 0.5)
  const dx = localX - 0.5;
  const dy = localY - 0.5;
  
  // Get angle in radians, then convert to degrees
  // atan2 returns angle from -Ï€ to Ï€, where 0 is right (positive X)
  // Canvas Y increases downward, so we negate dy to get standard math coords
  let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
  
  // Normalize to 0-360 range
  if (angle < 0) angle += 360;
  
  // Map angle to segment (each segment is 45Â°)
  // Segments are centered on 45Â° increments:
  // e: 0Â°, ne: 45Â°, n: 90Â°, nw: 135Â°, w: 180Â°, sw: 225Â°, s: 270Â°, se: 315Â°
  // Each segment spans Â±22.5Â° from its center
  
  if (angle >= 337.5 || angle < 22.5) return 'e';
  if (angle >= 22.5 && angle < 67.5) return 'ne';
  if (angle >= 67.5 && angle < 112.5) return 'n';
  if (angle >= 112.5 && angle < 157.5) return 'nw';
  if (angle >= 157.5 && angle < 202.5) return 'w';
  if (angle >= 202.5 && angle < 247.5) return 'sw';
  if (angle >= 247.5 && angle < 292.5) return 's';
  if (angle >= 292.5 && angle < 337.5) return 'se';
  
  // Fallback (shouldn't happen)
  return 'n';
}

/**
 * Calculate local position within a cell from screen coordinates
 * Returns values from 0 to 1 where (0,0) is top-left and (1,1) is bottom-right
 * 
 * @param {number} screenX - Screen X coordinate
 * @param {number} screenY - Screen Y coordinate
 * @param {number} cellScreenX - Cell's top-left screen X
 * @param {number} cellScreenY - Cell's top-left screen Y
 * @param {number} cellSize - Cell size in screen pixels
 * @returns {{localX: number, localY: number}} Local coordinates (0-1)
 */
function getLocalCellPosition(screenX, screenY, cellScreenX, cellScreenY, cellSize) {
  const localX = (screenX - cellScreenX) / cellSize;
  const localY = (screenY - cellScreenY) / cellSize;
  
  // Clamp to 0-1 range
  return {
    localX: Math.max(0, Math.min(1, localX)),
    localY: Math.max(0, Math.min(1, localY))
  };
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
  
  // Segment support (partial cell painting)
  hasSegments,
  isSimpleCell,
  getCellFill,
  getFilledSegments,
  normalizeCell,
  setSegments,
  removeSegments,
  neighborSegmentFilled,
  getSegmentAtPosition,
  getLocalCellPosition
};