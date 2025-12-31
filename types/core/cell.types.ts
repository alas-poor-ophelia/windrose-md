/**
 * Cell Type Definitions
 * Path: types/core/cell.types.ts
 * 
 * Cell and segment data structures for map storage.
 * 
 * COORDINATE MODEL:
 * Storage uses native coordinates for each geometry:
 * - Grid cells: {x, y}
 * - Hex cells: {q, r}
 * 
 * The cellAccessor module provides a Point-based API that abstracts
 * this difference. Higher-level code works with Point {x, y} and
 * cellAccessor handles translation to/from native storage format.
 * 
 * SEGMENT SYSTEM (Grid only):
 * Grid cells can be fully painted (SimpleCell) or partially painted (SegmentCell).
 * Segment cells divide the cell into 8 triangular "pie slice" segments.
 * Hex cells do not support segments.
 */

import type { Point } from './geometry.types';

// ===========================================
// Segment System (Grid maps only)
// ===========================================

/** 
 * Segment name identifiers for partial cell painting.
 * Each cell is divided into 8 triangular segments like pie slices.
 * Named by compass direction from center.
 */
export type SegmentName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** 
 * Segment fill state map.
 * Keys are segment names, values are `true` if filled.
 * Missing keys mean unfilled.
 */
export type SegmentMap = Partial<Record<SegmentName, true>>;

// ===========================================
// Grid Cell Types (storage: x, y)
// ===========================================

/** Base properties for grid cells */
interface GridCellBase {
  x: number;
  y: number;
  color: string;
  opacity?: number;
}

/** Simple grid cell - fully painted, no segments */
export interface SimpleGridCell extends GridCellBase {
  segments?: undefined;
}

/** Segment grid cell - partially painted */
export interface SegmentGridCell extends GridCellBase {
  segments: SegmentMap;
}

/** Any grid cell */
export type GridCell = SimpleGridCell | SegmentGridCell;

// ===========================================
// Hex Cell Type (storage: q, r)
// ===========================================

/** Hex cell - no segment support */
export interface HexCell {
  q: number;
  r: number;
  color: string;
  opacity?: number;
}

// ===========================================
// Unified Cell Type (Storage)
// ===========================================

/** 
 * Union type for any cell in storage.
 * Use type guards to narrow: isGridCell(), isHexCell()
 */
export type Cell = GridCell | HexCell;

// ===========================================
// Type Guards
// ===========================================

/** Check if cell is a grid cell (has x, y) */
export function isGridCell(cell: Cell): cell is GridCell {
  return 'x' in cell && 'y' in cell;
}

/** Check if cell is a hex cell (has q, r) */
export function isHexCell(cell: Cell): cell is HexCell {
  return 'q' in cell && 'r' in cell;
}

/** Check if cell has partial fill (segments with entries) */
export function hasSegments(cell: Cell): cell is SegmentGridCell {
  return isGridCell(cell) && 
    cell.segments !== undefined && 
    Object.keys(cell.segments).length > 0;
}

/** Check if cell is simple (fully painted, no segments) */
export function isSimpleCell(cell: Cell): boolean {
  return !hasSegments(cell);
}

// ===========================================
// Cell Maps (Storage)
// ===========================================

/** String key for cell lookup: "x,y" or "q,r" */
export type CellKey = string;

/** Map of cell keys to cell data for O(1) lookup */
export type CellMap = Map<CellKey, Cell>;

// ===========================================
// Input Types (flexible formats)
// ===========================================

/** 
 * Coordinates in any supported input format.
 * cellAccessor normalizes these to Point or native format as needed.
 */
export interface AnyCoords {
  x?: number;
  y?: number;
  q?: number;
  r?: number;
  gridX?: number;
  gridY?: number;
  col?: number;
  row?: number;
}

/** Cell update for batch operations */
export interface CellUpdate {
  coords: Point;
  color: string;
  opacity: number;
}

/** Local position within a cell (0-1 range) */
export interface LocalCellPosition {
  localX: number;
  localY: number;
}

// ===========================================
// Re-export Point for convenience
// ===========================================

export type { Point };