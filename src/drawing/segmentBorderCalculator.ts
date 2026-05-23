/**
 * segmentBorderCalculator.ts
 * 
 * Border calculation for segment-based cells (partial cell painting).
 * Determines which borders need to be drawn based on:
 * - Internal edges: Where filled segments meet empty segments within a cell
 * - External edges: Where filled segments meet empty space in adjacent cells
 * 
 * PRINCIPLE: Draw borders wherever filled meets empty.
 */

// Type-only imports
import type { SegmentGridCell, CellMap, SegmentName } from '#types/core/cell.types';
import type { IGeometry } from '#types/core/geometry.types';

import { SEGMENT_INTERNAL_ADJACENCY, SEGMENT_CROSS_CELL_ADJACENCY } from '../core/dmtConstants';
import { getFilledSegments, neighborSegmentFilled } from '../geometry/core/cellAccessor';


// ===========================================
// Local Type Definitions
// ===========================================

/** Internal border edge (center to boundary point) */
export interface InternalBorder {
  from: string;
  to: string;
}

/** External border edge (along cell boundary) */
export interface ExternalBorder {
  segment: SegmentName;
  neighborSegment: SegmentName;
}

/** Combined border calculation result */
export interface SegmentBorders {
  internal: InternalBorder[];
  external: ExternalBorder[];
}

// ============================================================================
// INTERNAL BORDER CALCULATION
// ============================================================================

/**
 * Calculate which internal borders need to be drawn for a segment cell.
 * Internal borders are lines from center to boundary points where
 * filled segments meet empty segments within the same cell.
 */
function getInternalBorders(cell: SegmentGridCell): InternalBorder[] {
  const borders: InternalBorder[] = [];
  const filledSet = new Set(getFilledSegments(cell));
  
  // Check each internal edge (center to boundary point)
  for (const [edgeKey, [seg1, seg2]] of Object.entries(SEGMENT_INTERNAL_ADJACENCY)) {
    const seg1Filled = filledSet.has(seg1);
    const seg2Filled = filledSet.has(seg2);
    
    // Draw border if one is filled and other is empty
    if (seg1Filled !== seg2Filled) {
      // Edge key is like "C-TL", split to get vertex names
      const [from, to] = edgeKey.split('-');
      borders.push({ from, to });
    }
  }
  
  return borders;
}

// ============================================================================
// EXTERNAL BORDER CALCULATION
// ============================================================================

/**
 * Calculate which external borders need to be drawn for a segment cell.
 * External borders are along cell edges where a filled segment has no
 * filled neighbor segment in the adjacent cell.
 * 
 * Border is drawn when:
 * - No neighbor cell exists, OR
 * - Neighbor is segment cell AND adjacent segment is empty
 * 
 * No border when:
 * - Neighbor is simple (full) cell, OR
 * - Neighbor is segment cell AND adjacent segment is filled
 */
function getExternalBorders(
  cell: SegmentGridCell,
  cellMap: CellMap,
  geometry: IGeometry
): ExternalBorder[] {
  const borders: ExternalBorder[] = [];
  const filledSegments = getFilledSegments(cell);
  
  for (const segment of filledSegments) {
    const adjacency = SEGMENT_CROSS_CELL_ADJACENCY[segment];
    const neighborX = cell.x + adjacency.dx;
    const neighborY = cell.y + adjacency.dy;
    
    // Check if neighbor segment is filled (using Point-based API)
    const neighborFilled = neighborSegmentFilled(
      cellMap, 
      { x: neighborX, y: neighborY }, 
      adjacency.neighborSegment, 
      geometry
    );
    
    // Need border if neighbor segment is not filled
    if (!neighborFilled) {
      borders.push({ segment, neighborSegment: adjacency.neighborSegment });
    }
  }
  
  return borders;
}

// ============================================================================
// COMBINED BORDER CALCULATION
// ============================================================================

/**
 * Get all borders (internal + external) for a segment cell
 */
function getSegmentBorders(
  cell: SegmentGridCell,
  cellMap: CellMap,
  geometry: IGeometry
): SegmentBorders {
  return {
    internal: getInternalBorders(cell),
    external: getExternalBorders(cell, cellMap, geometry)
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export { // Main API
  getSegmentBorders, getInternalBorders, getExternalBorders };