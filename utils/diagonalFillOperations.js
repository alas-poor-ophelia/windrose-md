/**
 * diagonalFillOperations.js
 * 
 * Pure functions for diagonal fill tool operations.
 * Handles corner detection, concave corner validation, and path calculation
 * for filling gaps along staircase diagonals.
 * 
 * COORDINATE SYSTEM:
 * - Cell coordinates: Integer (x, y) grid positions
 * - Local coordinates: 0-1 within cell, (0,0) = top-left, (1,1) = bottom-right
 * - Corners: TL (top-left), TR (top-right), BR (bottom-right), BL (bottom-left)
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const {
  CORNER_SEGMENT_FILL,
  CORNER_NEIGHBOR_CHECKS,
  CORNER_DIAGONAL_DIRECTION
} = await requireModuleByName("dmtConstants.ts");

const {
  buildCellMap,
  isSimpleCell,
  hasSegments
} = await requireModuleByName("cellAccessor.ts");

// ============================================================================
// CORNER DETECTION
// ============================================================================

/**
 * Determine which corner of a cell is nearest to a local position
 * 
 * @param {number} localX - X position within cell (0-1, 0 = left)
 * @param {number} localY - Y position within cell (0-1, 0 = top)
 * @returns {string} Corner name: 'TL', 'TR', 'BR', or 'BL'
 */
function getNearestCorner(localX, localY) {
  const isLeft = localX < 0.5;
  const isTop = localY < 0.5;
  
  if (isTop && isLeft) return 'TL';
  if (isTop && !isLeft) return 'TR';
  if (!isTop && !isLeft) return 'BR';
  return 'BL';
}

/**
 * Calculate local position within a cell from screen/world coordinates
 * 
 * @param {number} worldX - World X coordinate
 * @param {number} worldY - World Y coordinate
 * @param {number} cellX - Cell grid X coordinate
 * @param {number} cellY - Cell grid Y coordinate
 * @param {number} cellSize - Size of cell in world units
 * @returns {{localX: number, localY: number}} Local coordinates (0-1)
 */
function getLocalPosition(worldX, worldY, cellX, cellY, cellSize) {
  const cellWorldX = cellX * cellSize;
  const cellWorldY = cellY * cellSize;
  
  return {
    localX: Math.max(0, Math.min(1, (worldX - cellWorldX) / cellSize)),
    localY: Math.max(0, Math.min(1, (worldY - cellWorldY) / cellSize))
  };
}

// ============================================================================
// CELL STATE HELPERS
// ============================================================================

/**
 * Check if a cell is painted (has color data)
 * Works with both simple cells and segment cells
 * 
 * @param {Map} cellMap - Cell lookup map from buildCellMap
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @returns {boolean} True if cell has any paint (full or partial)
 */
function cellIsPainted(cellMap, x, y) {
  const key = `${x},${y}`;
  const cell = cellMap.get(key);
  if (!cell) return false;
  
  // Simple cell or segment cell with any segments = painted
  return isSimpleCell(cell) || hasSegments(cell);
}

/**
 * Check if a cell is empty (no paint data)
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @returns {boolean} True if cell has no paint
 */
function cellIsEmpty(cellMap, x, y) {
  return !cellIsPainted(cellMap, x, y);
}

/**
 * Get cell data if it exists
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @returns {Object|null} Cell object or null
 */
function getCell(cellMap, x, y) {
  const key = `${x},${y}`;
  return cellMap.get(key) || null;
}

// ============================================================================
// CONCAVE CORNER VALIDATION
// ============================================================================

/**
 * Check if a cell position is a valid concave corner for diagonal fill
 * 
 * A valid concave corner is:
 * 1. An empty cell (no paint)
 * 2. With painted cells at both neighbor positions for the specified corner
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @param {string} corner - Corner to validate ('TL', 'TR', 'BR', 'BL')
 * @returns {boolean} True if valid concave corner
 */
function isValidConcaveCorner(cellMap, x, y, corner) {
  // Cell must be empty
  const isPainted = cellIsPainted(cellMap, x, y);
  if (isPainted) {
    return false;
  }
  
  // Both neighbors for this corner must be painted
  const neighbors = CORNER_NEIGHBOR_CHECKS[corner];
  if (!neighbors) {
    return false;
  }
  
  return neighbors.every(({ dx, dy }) => 
    cellIsPainted(cellMap, x + dx, y + dy)
  );
}

/**
 * Find the valid concave corner for a cell, if any exists
 * Checks all four corners and returns the first valid one
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @param {string} preferredCorner - Optional preferred corner (from click position)
 * @returns {string|null} Valid corner name or null if no valid corner
 */
function findValidCornerForCell(cellMap, x, y, preferredCorner = null) {
  const corners = ['TL', 'TR', 'BR', 'BL'];
  
  // Check preferred corner first if provided
  if (preferredCorner && isValidConcaveCorner(cellMap, x, y, preferredCorner)) {
    return preferredCorner;
  }
  
  // Check all corners
  for (const corner of corners) {
    if (corner !== preferredCorner && isValidConcaveCorner(cellMap, x, y, corner)) {
      return corner;
    }
  }
  
  return null;
}

/**
 * Find the nearest valid concave corner to a given position
 * Used for "generous snapping" on touch devices
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Target cell X coordinate
 * @param {number} y - Target cell Y coordinate
 * @param {string} preferredCorner - Preferred corner type (from start point)
 * @param {number} searchRadius - How many cells to search (default 2)
 * @returns {{x: number, y: number, corner: string}|null} Nearest valid corner or null
 */
function findNearestValidCorner(cellMap, x, y, preferredCorner, searchRadius = 2) {
  // First check if current cell is valid
  if (isValidConcaveCorner(cellMap, x, y, preferredCorner)) {
    return { x, y, corner: preferredCorner };
  }
  
  // Search nearby cells in expanding rings
  for (let radius = 1; radius <= searchRadius; radius++) {
    let nearestDist = Infinity;
    let nearest = null;
    
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        // Only check cells at this radius (not inner cells we already checked)
        if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) continue;
        
        const checkX = x + dx;
        const checkY = y + dy;
        
        if (isValidConcaveCorner(cellMap, checkX, checkY, preferredCorner)) {
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = { x: checkX, y: checkY, corner: preferredCorner };
          }
        }
      }
    }
    
    if (nearest) return nearest;
  }
  
  return null;
}

// ============================================================================
// DIAGONAL PATH CALCULATION
// ============================================================================

/**
 * Check if two points form a valid 45° diagonal
 * 
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @returns {boolean} True if points form 45° diagonal
 */
function isValid45Diagonal(startX, startY, endX, endY) {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  
  // Must have equal horizontal and vertical distance (45°)
  // And must actually move (not same point)
  return dx === dy && dx > 0;
}

/**
 * Get the diagonal direction for a line from start to end
 * 
 * @param {number} startX - Start X
 * @param {number} startY - Start Y  
 * @param {number} endX - End X
 * @param {number} endY - End Y
 * @returns {string|null} 'TL-BR' (descending right) or 'TR-BL' (descending left), or null if not diagonal
 */
function getDiagonalDirection(startX, startY, endX, endY) {
  if (!isValid45Diagonal(startX, startY, endX, endY)) {
    return null;
  }
  
  const dx = endX - startX;
  const dy = endY - startY;
  
  // Same sign = descending right (TL-BR), opposite sign = descending left (TR-BL)
  if ((dx > 0 && dy > 0) || (dx < 0 && dy < 0)) {
    return 'TL-BR';
  }
  return 'TR-BL';
}

/**
 * Check if a corner type matches a diagonal direction
 * 
 * @param {string} corner - Corner name ('TL', 'TR', 'BR', 'BL')
 * @param {string} diagonalDir - Diagonal direction ('TL-BR' or 'TR-BL')
 * @returns {boolean} True if corner creates this diagonal type
 */
function cornerMatchesDiagonal(corner, diagonalDir) {
  return CORNER_DIAGONAL_DIRECTION[corner] === diagonalDir;
}

/**
 * Get all cells along a 45° diagonal path
 * 
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @returns {Array<{x: number, y: number}>} Array of cell coordinates along diagonal
 */
function getCellsAlongDiagonal(startX, startY, endX, endY) {
  const cells = [];
  
  if (!isValid45Diagonal(startX, startY, endX, endY)) {
    // Not a valid diagonal, return just start if start equals end
    if (startX === endX && startY === endY) {
      return [{ x: startX, y: startY }];
    }
    return cells;
  }
  
  const dx = endX > startX ? 1 : -1;
  const dy = endY > startY ? 1 : -1;
  const steps = Math.abs(endX - startX);
  
  for (let i = 0; i <= steps; i++) {
    cells.push({
      x: startX + i * dx,
      y: startY + i * dy
    });
  }
  
  return cells;
}

/**
 * Get all valid concave corners along a diagonal path
 * Filters to only include cells that are valid for filling
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} startX - Start X coordinate
 * @param {number} startY - Start Y coordinate
 * @param {number} endX - End X coordinate
 * @param {number} endY - End Y coordinate
 * @param {string} corner - Corner type to fill
 * @returns {Array<{x: number, y: number}>} Array of valid cell coordinates
 */
function getValidCornersAlongDiagonal(cellMap, startX, startY, endX, endY, corner) {
  const allCells = getCellsAlongDiagonal(startX, startY, endX, endY);
  
  return allCells.filter(({ x, y }) => 
    isValidConcaveCorner(cellMap, x, y, corner)
  );
}

// ============================================================================
// COLOR INHERITANCE
// ============================================================================

/**
 * Get the color to inherit from painted neighbors at a corner
 * Uses the first painted neighbor found
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {number} x - Cell X coordinate
 * @param {number} y - Cell Y coordinate
 * @param {string} corner - Corner name
 * @returns {{color: string, opacity: number}|null} Color info or null
 */
function getInheritedColor(cellMap, x, y, corner) {
  const neighbors = CORNER_NEIGHBOR_CHECKS[corner];
  if (!neighbors) return null;
  
  for (const { dx, dy } of neighbors) {
    const cell = getCell(cellMap, x + dx, y + dy);
    if (cell) {
      return {
        color: cell.color,
        opacity: cell.opacity ?? 1
      };
    }
  }
  
  return null;
}

// ============================================================================
// SEGMENT FILL HELPERS
// ============================================================================

/**
 * Get the segments to fill for a given corner
 * 
 * @param {string} corner - Corner name ('TL', 'TR', 'BR', 'BL')
 * @returns {Array<string>} Array of segment names to fill
 */
function getSegmentsForCorner(corner) {
  return CORNER_SEGMENT_FILL[corner] || [];
}

// ============================================================================
// PREVIEW PATH VALIDATION
// ============================================================================

/**
 * Validate and calculate preview data for diagonal fill
 * Used during hover to determine if a valid path exists
 * 
 * @param {Map} cellMap - Cell lookup map
 * @param {Object} start - Start point {x, y, corner}
 * @param {number} targetX - Target cell X
 * @param {number} targetY - Target cell Y
 * @returns {{valid: boolean, endX: number, endY: number, cellCount: number}|null}
 */
function validateDiagonalPath(cellMap, start, targetX, targetY) {
  if (!start) return null;
  
  const dx = targetX - start.x;
  const dy = targetY - start.y;
  
  // Same cell - return start as the only cell
  if (dx === 0 && dy === 0) {
    if (isValidConcaveCorner(cellMap, start.x, start.y, start.corner)) {
      return { valid: true, endX: start.x, endY: start.y, cellCount: 1 };
    }
    return null;
  }
  
  // Determine which diagonal type this corner requires
  const expectedDiagonalType = CORNER_DIAGONAL_DIRECTION[start.corner];
  
  // Project target onto the correct diagonal line for this corner type
  // TL-BR diagonal: y - x = constant (slope +1)
  // TR-BL diagonal: y + x = constant (slope -1)
  let snappedX, snappedY;
  
  if (expectedDiagonalType === 'TL-BR') {
    // Project onto line y - x = start.y - start.x
    // Perpendicular projection: t = (dy - dx) / 2
    const t = (dy - dx) / 2;
    snappedX = Math.round(targetX + t);
    snappedY = Math.round(targetY - t);
  } else {
    // TR-BL: Project onto line y + x = start.y + start.x
    // Perpendicular projection: t = (dx + dy) / 2
    const t = (dx + dy) / 2;
    snappedX = Math.round(targetX - t);
    snappedY = Math.round(targetY - t);
  }
  
  // If snapped back to start or behind, return start only
  if (snappedX === start.x && snappedY === start.y) {
    if (isValidConcaveCorner(cellMap, start.x, start.y, start.corner)) {
      return { valid: true, endX: start.x, endY: start.y, cellCount: 1 };
    }
    return null;
  }
  
  // Verify the direction is valid for this corner (forward or reverse)
  const actualDir = getDiagonalDirection(start.x, start.y, snappedX, snappedY);
  if (!actualDir || !cornerMatchesDiagonal(start.corner, actualDir)) {
    // Direction doesn't match - return start only
    if (isValidConcaveCorner(cellMap, start.x, start.y, start.corner)) {
      return { valid: true, endX: start.x, endY: start.y, cellCount: 1 };
    }
    return null;
  }
  
  // Get valid corners along the path
  const validCorners = getValidCornersAlongDiagonal(
    cellMap, start.x, start.y, snappedX, snappedY, start.corner
  );
  
  if (validCorners.length === 0) {
    return null;
  }
  
  // Find the furthest valid corner along the path
  const lastValid = validCorners[validCorners.length - 1];
  
  return {
    valid: true,
    endX: lastValid.x,
    endY: lastValid.y,
    cellCount: validCorners.length
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

return {
  // Corner detection
  getNearestCorner,
  getLocalPosition,
  
  // Cell state helpers
  cellIsPainted,
  cellIsEmpty,
  getCell,
  
  // Concave corner validation
  isValidConcaveCorner,
  findValidCornerForCell,
  findNearestValidCorner,
  
  // Diagonal path calculation
  isValid45Diagonal,
  getDiagonalDirection,
  cornerMatchesDiagonal,
  getCellsAlongDiagonal,
  getValidCornersAlongDiagonal,
  
  // Color inheritance
  getInheritedColor,
  
  // Segment helpers
  getSegmentsForCorner,
  
  // Preview validation
  validateDiagonalPath
};