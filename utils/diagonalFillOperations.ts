/**
 * diagonalFillOperations.ts
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

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { Cell, CellMap, SegmentGridCell, SegmentName } from '#types/core/cell.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { 
  CornerName, 
  NeighborOffset,
  DiagonalDirection 
} from './dmtConstants';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const {
  CORNER_SEGMENT_FILL,
  CORNER_NEIGHBOR_CHECKS,
  CORNER_DIAGONAL_DIRECTION
} = await requireModuleByName("dmtConstants.ts") as {
  CORNER_SEGMENT_FILL: Record<CornerName, SegmentName[]>;
  CORNER_NEIGHBOR_CHECKS: Record<CornerName, NeighborOffset[]>;
  CORNER_DIAGONAL_DIRECTION: Record<CornerName, DiagonalDirection>;
};

const {
  buildCellMap,
  isSimpleCell,
  hasSegments
} = await requireModuleByName("cellAccessor.ts") as {
  buildCellMap: (cells: Cell[], geometry: IGeometry) => CellMap;
  isSimpleCell: (cell: Cell) => boolean;
  hasSegments: (cell: Cell) => cell is SegmentGridCell;
};

// ===========================================
// Type Definitions
// ===========================================

/** Local position within a cell (0-1 range) */
export interface LocalPosition {
  localX: number;
  localY: number;
}

/** Valid corner result with coordinates */
export interface ValidCornerResult {
  x: number;
  y: number;
  corner: CornerName;
}

/** Color inheritance result */
export interface InheritedColor {
  color: string;
  opacity: number;
}

/** Diagonal path validation result */
export interface DiagonalPathValidation {
  valid: boolean;
  endX: number;
  endY: number;
  cellCount: number;
}

/** Start point for diagonal fill */
export interface DiagonalStartPoint {
  x: number;
  y: number;
  corner: CornerName;
}

// ===========================================
// Corner Detection
// ===========================================

/**
 * Determine which corner of a cell is nearest to a local position
 */
function getNearestCorner(localX: number, localY: number): CornerName {
  const isLeft = localX < 0.5;
  const isTop = localY < 0.5;
  
  if (isTop && isLeft) return 'TL';
  if (isTop && !isLeft) return 'TR';
  if (!isTop && !isLeft) return 'BR';
  return 'BL';
}

/**
 * Calculate local position within a cell from screen/world coordinates
 */
function getLocalPosition(
  worldX: number,
  worldY: number,
  cellX: number,
  cellY: number,
  cellSize: number
): LocalPosition {
  const cellWorldX = cellX * cellSize;
  const cellWorldY = cellY * cellSize;
  
  return {
    localX: Math.max(0, Math.min(1, (worldX - cellWorldX) / cellSize)),
    localY: Math.max(0, Math.min(1, (worldY - cellWorldY) / cellSize))
  };
}

// ===========================================
// Cell State Helpers
// ===========================================

/**
 * Check if a cell is painted (has color data).
 * Works with both simple cells and segment cells.
 */
function cellIsPainted(cellMap: CellMap, x: number, y: number): boolean {
  const key = `${x},${y}`;
  const cell = cellMap.get(key);
  if (!cell) return false;
  
  // Simple cell or segment cell with any segments = painted
  return isSimpleCell(cell) || hasSegments(cell);
}

/**
 * Check if a cell is empty (no paint data)
 */
function cellIsEmpty(cellMap: CellMap, x: number, y: number): boolean {
  return !cellIsPainted(cellMap, x, y);
}

/**
 * Get cell data if it exists
 */
function getCell(cellMap: CellMap, x: number, y: number): Cell | null {
  const key = `${x},${y}`;
  return cellMap.get(key) || null;
}

// ===========================================
// Concave Corner Validation
// ===========================================

/**
 * Check if a cell position is a valid concave corner for diagonal fill.
 * 
 * A valid concave corner is:
 * 1. An empty cell (no paint)
 * 2. With painted cells at both neighbor positions for the specified corner
 */
function isValidConcaveCorner(
  cellMap: CellMap,
  x: number,
  y: number,
  corner: CornerName
): boolean {
  // Cell must be empty
  if (cellIsPainted(cellMap, x, y)) {
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
 * Find the valid concave corner for a cell, if any exists.
 * Checks all four corners and returns the first valid one.
 */
function findValidCornerForCell(
  cellMap: CellMap,
  x: number,
  y: number,
  preferredCorner: CornerName | null = null
): CornerName | null {
  const corners: CornerName[] = ['TL', 'TR', 'BR', 'BL'];
  
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
 * Find the nearest valid concave corner to a given position.
 * Used for "generous snapping" on touch devices.
 */
function findNearestValidCorner(
  cellMap: CellMap,
  x: number,
  y: number,
  preferredCorner: CornerName,
  searchRadius: number = 2
): ValidCornerResult | null {
  // First check if current cell is valid
  if (isValidConcaveCorner(cellMap, x, y, preferredCorner)) {
    return { x, y, corner: preferredCorner };
  }
  
  // Search nearby cells in expanding rings
  for (let radius = 1; radius <= searchRadius; radius++) {
    let nearestDist = Infinity;
    let nearest: ValidCornerResult | null = null;
    
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        // Only check cells at this ring's distance
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

// ===========================================
// Diagonal Path Calculation
// ===========================================

/**
 * Check if two points form a valid 45° diagonal
 */
function isValid45Diagonal(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): boolean {
  const dx = Math.abs(endX - startX);
  const dy = Math.abs(endY - startY);
  
  // Must have equal horizontal and vertical distance (45°)
  // And must actually move (not same point)
  return dx === dy && dx > 0;
}

/**
 * Get the diagonal direction for a line from start to end
 */
function getDiagonalDirection(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): DiagonalDirection | null {
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
 */
function cornerMatchesDiagonal(corner: CornerName, diagonalDir: DiagonalDirection): boolean {
  return CORNER_DIAGONAL_DIRECTION[corner] === diagonalDir;
}

/**
 * Get all cells along a 45° diagonal path
 */
function getCellsAlongDiagonal(
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Point[] {
  const cells: Point[] = [];
  
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
 * Get all valid concave corners along a diagonal path.
 * Filters to only include cells that are valid for filling.
 */
function getValidCornersAlongDiagonal(
  cellMap: CellMap,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  corner: CornerName
): ValidCornerResult[] {
  const cells = getCellsAlongDiagonal(startX, startY, endX, endY);
  
  return cells
    .filter(cell => isValidConcaveCorner(cellMap, cell.x, cell.y, corner))
    .map(cell => ({ x: cell.x, y: cell.y, corner }));
}

// ===========================================
// Color Inheritance
// ===========================================

/**
 * Get the color to use for diagonal fill by sampling neighbor cells.
 * Prefers neighbor with the matching corner's source direction.
 */
function getInheritedColor(
  cellMap: CellMap,
  x: number,
  y: number,
  corner: CornerName
): InheritedColor | null {
  const neighbors = CORNER_NEIGHBOR_CHECKS[corner];
  if (!neighbors) return null;
  
  // Try each neighbor
  for (const { dx, dy } of neighbors) {
    const cell = getCell(cellMap, x + dx, y + dy);
    if (cell && 'color' in cell) {
      return {
        color: cell.color,
        opacity: cell.opacity ?? 1
      };
    }
  }
  
  return null;
}

// ===========================================
// Segment Fill Helpers
// ===========================================

/**
 * Get the segments to fill for a given corner
 */
function getSegmentsForCorner(corner: CornerName): SegmentName[] {
  return CORNER_SEGMENT_FILL[corner] || [];
}

// ===========================================
// Preview Path Validation
// ===========================================

/**
 * Validate and calculate preview data for diagonal fill.
 * Used during hover to determine if a valid path exists.
 */
function validateDiagonalPath(
  cellMap: CellMap,
  start: DiagonalStartPoint | null,
  targetX: number,
  targetY: number
): DiagonalPathValidation | null {
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
  let snappedX: number, snappedY: number;
  
  if (expectedDiagonalType === 'TL-BR') {
    // Project onto line y - x = start.y - start.x
    const t = (dy - dx) / 2;
    snappedX = Math.round(targetX + t);
    snappedY = Math.round(targetY - t);
  } else {
    // TR-BL: Project onto line y + x = start.y + start.x
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
  
  // Verify the direction is valid for this corner
  const actualDir = getDiagonalDirection(start.x, start.y, snappedX, snappedY);
  if (!actualDir || !cornerMatchesDiagonal(start.corner, actualDir)) {
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

// ===========================================
// Exports
// ===========================================

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