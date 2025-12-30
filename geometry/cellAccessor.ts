/**
 * cellAccessor.ts
 * 
 * Pure functions for cell data operations.
 * Provides a Point-based API that abstracts coordinate differences between
 * grid and hex geometries.
 * 
 * ABSTRACTION BOUNDARY:
 * - Public API uses Point {x, y} for all coordinate inputs/outputs
 * - Storage uses native formats: {x, y} for grid, {q, r} for hex
 * - This module handles translation between the two
 * 
 * Higher-level code (hooks, components) only sees Point.
 * Storage and geometry internals use native coordinates.
 */

// Type-only imports - stripped at runtime
import type { Point } from '#types/core/geometry.types';
import type {
  Cell,
  GridCell,
  HexCell,
  SegmentGridCell,
  SegmentName,
  SegmentMap,
  CellMap,
  CellKey,
  CellUpdate,
  LocalCellPosition,
  AnyCoords
} from '#types/core/cell.types';
import type { IGeometry } from '#types/core/geometry.types';

// Re-export types for consumers
export type {
  Cell,
  GridCell,
  HexCell,
  SegmentGridCell,
  SegmentName,
  SegmentMap,
  CellMap,
  CellKey,
  CellUpdate,
  LocalCellPosition,
  Point
};

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Import geometry classes for instanceof checks
const { GridGeometry } = await requireModuleByName("GridGeometry.js") as {
  GridGeometry: new (...args: unknown[]) => IGeometry
};
const { HexGeometry } = await requireModuleByName("HexGeometry.js") as {
  HexGeometry: new (...args: unknown[]) => IGeometry
};

// Import segment constants
const { SEGMENT_NAMES } = await requireModuleByName("dmtConstants.ts") as {
  SEGMENT_NAMES: readonly SegmentName[]
};

// ============================================================================
// GEOMETRY TYPE DETECTION
// ============================================================================

/**
 * Check if geometry is grid-based (square cells)
 */
function isGridGeometry(geometry: IGeometry): boolean {
  return geometry instanceof GridGeometry;
}

/**
 * Check if geometry is hex-based
 */
function isHexGeometry(geometry: IGeometry): boolean {
  return geometry instanceof HexGeometry;
}

// ============================================================================
// TYPE GUARDS (re-implemented locally to avoid import issues at runtime)
// ============================================================================

/**
 * Check if cell is a grid cell (has x, y)
 */
function isGridCell(cell: Cell): cell is GridCell {
  return 'x' in cell && 'y' in cell;
}

/**
 * Check if cell is a hex cell (has q, r)
 */
function isHexCell(cell: Cell): cell is HexCell {
  return 'q' in cell && 'r' in cell;
}

/**
 * Check if cell has partial fill (segments)
 */
function hasSegments(cell: Cell): cell is SegmentGridCell {
  return isGridCell(cell) && 
    cell.segments !== undefined && 
    Object.keys(cell.segments).length > 0;
}

/**
 * Check if cell is a simple (full) cell
 */
function isSimpleCell(cell: Cell): boolean {
  return !hasSegments(cell);
}

// ============================================================================
// COORDINATE TRANSLATION (Internal)
// ============================================================================

/**
 * Convert Point to native storage format based on geometry.
 * Grid: {x, y}, Hex: {q, r}
 */
function pointToNative(point: Point, geometry: IGeometry): { x: number; y: number } | { q: number; r: number } {
  if (isGridGeometry(geometry)) {
    return { x: point.x, y: point.y };
  }
  return { q: point.x, r: point.y };
}

/**
 * Convert native cell coordinates to Point.
 */
function cellToPoint(cell: Cell): Point {
  if (isGridCell(cell)) {
    return { x: cell.x, y: cell.y };
  }
  return { x: cell.q, y: cell.r };
}

/**
 * Normalize any coordinate format to Point.
 */
function normalizeToPoint(coords: AnyCoords): Point {
  return {
    x: coords.x ?? coords.gridX ?? coords.q ?? coords.col ?? 0,
    y: coords.y ?? coords.gridY ?? coords.r ?? coords.row ?? 0
  };
}

/**
 * Normalize any coordinate format to native storage format.
 */
function normalizeCoords(coords: AnyCoords, geometry: IGeometry): { x: number; y: number } | { q: number; r: number } {
  const point = normalizeToPoint(coords);
  return pointToNative(point, geometry);
}

// ============================================================================
// CELL KEY GENERATION
// ============================================================================

/**
 * Generate a stable string key for cell lookup.
 * Uses Point coordinates for consistency.
 */
function cellKey(coords: Point, geometry: IGeometry): CellKey {
  if (isGridGeometry(geometry)) {
    return `${coords.x},${coords.y}`;
  }
  return `${coords.x},${coords.y}`;  // Same format, geometry interprets meaning
}

/**
 * Get cell key from a cell object.
 */
function cellKeyFromCell(cell: Cell, geometry: IGeometry): CellKey {
  return cellKey(cellToPoint(cell), geometry);
}

/**
 * Extract coordinates from a cell as Point.
 */
function getCellCoords(cell: Cell, _geometry: IGeometry): Point {
  return cellToPoint(cell);
}

// ============================================================================
// CELL QUERY
// ============================================================================

/**
 * Find cell at coordinates.
 * @param coords - Point coordinates
 * @returns Cell or null if not found
 */
function getCellAt(cells: Cell[], coords: Point, geometry: IGeometry): Cell | null {
  return cells.find(cell => geometry.cellMatchesCoords(cell, coords)) || null;
}

/**
 * Get index of cell at coordinates.
 */
function getCellIndex(cells: Cell[], coords: Point, geometry: IGeometry): number {
  return cells.findIndex(cell => geometry.cellMatchesCoords(cell, coords));
}

/**
 * Check if cell exists at coordinates.
 */
function cellExists(cells: Cell[], coords: Point, geometry: IGeometry): boolean {
  return getCellIndex(cells, coords, geometry) !== -1;
}

/**
 * Build lookup map for O(1) cell queries.
 */
function buildCellMap(cells: Cell[], geometry: IGeometry): CellMap {
  const map: CellMap = new Map();
  for (const cell of cells) {
    map.set(cellKeyFromCell(cell, geometry), cell);
  }
  return map;
}

// ============================================================================
// CELL MODIFICATION (Immutable - returns new arrays)
// ============================================================================

/**
 * Set cell color/opacity at coordinates (add or update).
 * @param coords - Point coordinates
 * @returns New cells array
 */
function setCell(
  cells: Cell[],
  coords: Point,
  color: string,
  opacity: number,
  geometry: IGeometry
): Cell[] {
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
 * Remove cell at coordinates.
 * @param coords - Point coordinates
 * @returns New cells array with cell removed
 */
function removeCell(cells: Cell[], coords: Point, geometry: IGeometry): Cell[] {
  return cells.filter(cell => !geometry.cellMatchesCoords(cell, coords));
}

/**
 * Batch set multiple cells (more efficient than repeated setCell).
 * @param cellUpdates - Array of {coords: Point, color, opacity}
 * @returns New cells array with all updates applied
 */
function setCells(
  cells: Cell[],
  cellUpdates: CellUpdate[],
  geometry: IGeometry
): Cell[] {
  // Build map of existing cells for O(1) lookup
  const cellMap: CellMap = new Map();
  for (const cell of cells) {
    cellMap.set(cellKeyFromCell(cell, geometry), cell);
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
 * Remove multiple cells by coordinates.
 * @param coordsList - Array of Point coordinates to remove
 */
function removeCells(
  cells: Cell[],
  coordsList: Point[],
  geometry: IGeometry
): Cell[] {
  const removeKeys = new Set(coordsList.map(c => cellKey(c, geometry)));
  return cells.filter(cell => !removeKeys.has(cellKeyFromCell(cell, geometry)));
}

/**
 * Remove cells within a rectangular bounds.
 */
function removeCellsInBounds(
  cells: Cell[],
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  geometry: IGeometry
): Cell[] {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return cells.filter(cell => {
    const p = cellToPoint(cell);
    return !(p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY);
  });
}

// ============================================================================
// SEGMENT SUPPORT - Partial cell painting (Grid only)
// ============================================================================

/**
 * Get fill color for cell (handles both simple and segment cells).
 */
function getCellFill(cell: Cell | null): string | null {
  if (!cell) return null;
  return cell.color;
}

/**
 * Get array of filled segment names for a cell.
 * Simple cells return all 8 segments; segment cells return only filled ones.
 */
function getFilledSegments(cell: Cell | null): SegmentName[] {
  if (!cell) return [];
  if (isSimpleCell(cell)) {
    // Simple cell = all 8 segments filled
    return [...SEGMENT_NAMES];
  }
  if (hasSegments(cell)) {
    return Object.keys(cell.segments).filter(
      seg => cell.segments[seg as SegmentName]
    ) as SegmentName[];
  }
  return [];
}

/**
 * Normalize cell by collapsing full segment cells to simple cells.
 * If all 8 segments are filled, convert to simple cell.
 * If no segments are filled, return null (cell should be removed).
 */
function normalizeCell(cell: Cell): Cell | null {
  if (!cell) return cell;
  
  if (hasSegments(cell)) {
    const filledCount = Object.keys(cell.segments).filter(
      seg => cell.segments[seg as SegmentName]
    ).length;
    
    if (filledCount === 8) {
      // All segments filled - collapse to simple cell
      const { segments, ...simpleCell } = cell;
      return simpleCell as Cell;
    }
    
    if (filledCount === 0) {
      // No segments filled - remove cell
      return null;
    }
  }
  
  return cell;
}

/**
 * Set segments on a cell (add or update).
 * Grid-only feature - warns and returns unchanged for hex.
 * Auto-collapses to simple cell if all 8 segments are filled.
 * 
 * @param coords - Point coordinates
 * @param segmentList - Array of segment names to fill
 */
function setSegments(
  cells: Cell[],
  coords: Point,
  segmentList: SegmentName[],
  color: string,
  opacity: number,
  geometry: IGeometry
): Cell[] {
  // Grid-only feature check
  if (!isGridGeometry(geometry)) {
    console.warn('setSegments: Segment painting is only supported for grid maps');
    return cells;
  }
  
  const index = getCellIndex(cells, coords, geometry);
  
  if (index !== -1) {
    // Cell exists - update it
    const existingCell = cells[index] as GridCell;
    const newCells = [...cells];
    
    if (isSimpleCell(existingCell)) {
      // Simple cell - if adding all 8 segments, just update color
      if (segmentList.length === 8) {
        newCells[index] = { ...existingCell, color, opacity };
        return newCells;
      }
      // Otherwise just update color (painting on simple cell doesn't remove segments)
      newCells[index] = { ...existingCell, color, opacity };
      return newCells;
    }
    
    // Existing segment cell - merge segments and update color
    const segmentCell = existingCell as SegmentGridCell;
    const mergedSegments: SegmentMap = { ...segmentCell.segments };
    for (const seg of segmentList) {
      if (SEGMENT_NAMES.includes(seg)) {
        mergedSegments[seg] = true;
      }
    }
    
    let newCell: Cell = { ...segmentCell, segments: mergedSegments, color, opacity };
    const normalized = normalizeCell(newCell);
    
    if (normalized === null) {
      // All segments removed - remove cell entirely
      return cells.filter((_, i) => i !== index);
    }
    
    newCells[index] = normalized;
    return newCells;
  }
  
  // Cell doesn't exist - create new segment cell
  const newSegments: SegmentMap = {};
  for (const seg of segmentList) {
    if (SEGMENT_NAMES.includes(seg)) {
      newSegments[seg] = true;
    }
  }
  
  // If all 8 segments, create simple cell instead
  if (Object.keys(newSegments).length === 8) {
    const simpleCell: GridCell = { x: coords.x, y: coords.y, color, opacity };
    return [...cells, simpleCell];
  }
  
  // Create segment cell
  if (Object.keys(newSegments).length === 0) {
    return cells; // No valid segments to add
  }
  
  const segmentCell: SegmentGridCell = { 
    x: coords.x, 
    y: coords.y, 
    segments: newSegments, 
    color, 
    opacity 
  };
  return [...cells, segmentCell];
}

/**
 * Remove segments from a cell.
 * If all segments are removed, removes the cell entirely.
 * 
 * @param coords - Point coordinates
 * @param segmentList - Array of segment names to remove
 */
function removeSegments(
  cells: Cell[],
  coords: Point,
  segmentList: SegmentName[],
  geometry: IGeometry
): Cell[] {
  // Grid-only feature check
  if (!isGridGeometry(geometry)) {
    console.warn('removeSegments: Segment painting is only supported for grid maps');
    return cells;
  }
  
  const index = getCellIndex(cells, coords, geometry);
  if (index === -1) return cells; // Cell doesn't exist
  
  const existingCell = cells[index] as GridCell;
  const newCells = [...cells];
  
  if (isSimpleCell(existingCell)) {
    // Simple cell - convert to segment cell with specified segments removed
    const remainingSegments: SegmentMap = {};
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
    const segmentCell: SegmentGridCell = { 
      x: existingCell.x,
      y: existingCell.y,
      segments: remainingSegments, 
      color: existingCell.color, 
      opacity: existingCell.opacity ?? 1 
    };
    newCells[index] = segmentCell;
    return newCells;
  }
  
  // Existing segment cell - remove specified segments
  const segmentCell = existingCell as SegmentGridCell;
  const updatedSegments: SegmentMap = { ...segmentCell.segments };
  for (const seg of segmentList) {
    delete updatedSegments[seg];
  }
  
  if (Object.keys(updatedSegments).length === 0) {
    // All segments removed - remove cell
    return cells.filter((_, i) => i !== index);
  }
  
  newCells[index] = { ...segmentCell, segments: updatedSegments };
  return newCells;
}

/**
 * Check if neighbor segment is filled (for border calculation).
 * 
 * @param cellMap - Cell lookup map from buildCellMap
 * @param coords - Point coordinates of neighbor cell
 * @param segment - Segment name to check
 */
function neighborSegmentFilled(
  cellMap: CellMap,
  coords: Point,
  segment: SegmentName,
  geometry: IGeometry
): boolean {
  const key = cellKey(coords, geometry);
  const neighbor = cellMap.get(key);
  
  if (!neighbor) return false;
  if (isSimpleCell(neighbor)) return true; // Simple cell = all segments filled
  if (hasSegments(neighbor)) return !!neighbor.segments[segment];
  
  return false;
}

/**
 * Determine which segment a point falls into based on position within a cell.
 * Uses angle from center to determine which of 8 pie-slice segments contains the point.
 * 
 * @param localX - X position within cell (0 to 1, where 0.5 is center)
 * @param localY - Y position within cell (0 to 1, where 0.5 is center)
 */
function getSegmentAtPosition(localX: number, localY: number): SegmentName {
  // Calculate position relative to center
  const dx = localX - 0.5;
  const dy = localY - 0.5;
  
  // Get angle in degrees (0 = right, counterclockwise)
  let angle = Math.atan2(-dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  
  // Map angle to segment (each segment is 45°)
  if (angle >= 337.5 || angle < 22.5) return 'e';
  if (angle >= 22.5 && angle < 67.5) return 'ne';
  if (angle >= 67.5 && angle < 112.5) return 'n';
  if (angle >= 112.5 && angle < 157.5) return 'nw';
  if (angle >= 157.5 && angle < 202.5) return 'w';
  if (angle >= 202.5 && angle < 247.5) return 'sw';
  if (angle >= 247.5 && angle < 292.5) return 's';
  if (angle >= 292.5 && angle < 337.5) return 'se';
  
  return 'n'; // Fallback
}

/**
 * Calculate local position within a cell from screen coordinates.
 * Returns values from 0 to 1 where (0,0) is top-left and (1,1) is bottom-right.
 */
function getLocalCellPosition(
  screenX: number,
  screenY: number,
  cellScreenX: number,
  cellScreenY: number,
  cellSize: number
): LocalCellPosition {
  const localX = (screenX - cellScreenX) / cellSize;
  const localY = (screenY - cellScreenY) / cellSize;
  
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
  
  // Type guards
  isGridCell,
  isHexCell,
  hasSegments,
  isSimpleCell,
  
  // Coordinate utilities
  normalizeCoords,
  normalizeToPoint,
  cellKey,
  cellKeyFromCell,
  getCellCoords,
  cellToPoint,
  
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
  getCellFill,
  getFilledSegments,
  normalizeCell,
  setSegments,
  removeSegments,
  neighborSegmentFilled,
  getSegmentAtPosition,
  getLocalCellPosition
};