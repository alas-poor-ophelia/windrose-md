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
import type { Point } from '#types/core/geometry.types';
import type { SegmentGridCell, Cell, CellMap, SegmentName } from '#types/core/cell.types';
import type { IGridRenderer } from '#types/core/rendering.types';
import type {
  VertexName,
  InternalEdgeKey,
  CrossCellAdjacency
} from '../utils/dmtConstants';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { 
  SEGMENT_NAMES,
  SEGMENT_INTERNAL_ADJACENCY,
  SEGMENT_CROSS_CELL_ADJACENCY
} = await requireModuleByName("dmtConstants.ts") as {
  SEGMENT_NAMES: readonly SegmentName[];
  SEGMENT_INTERNAL_ADJACENCY: Record<InternalEdgeKey, [SegmentName, SegmentName]>;
  SEGMENT_CROSS_CELL_ADJACENCY: Record<SegmentName, CrossCellAdjacency>;
};

const { 
  hasSegments, 
  isSimpleCell, 
  getFilledSegments,
  buildCellMap,
  cellKey,
  neighborSegmentFilled
} = await requireModuleByName("cellAccessor.ts") as {
  hasSegments: (cell: Cell) => cell is SegmentGridCell;
  isSimpleCell: (cell: Cell) => boolean;
  getFilledSegments: (cell: Cell) => SegmentName[];
  buildCellMap: (cells: Cell[], geometry: IGridRenderer) => CellMap;
  cellKey: (x: number, y: number) => string;
  neighborSegmentFilled: (cellMap: CellMap, coords: Point, segment: SegmentName, geometry: IGridRenderer) => boolean;
};

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
  geometry: IGridRenderer
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
  geometry: IGridRenderer
): SegmentBorders {
  return {
    internal: getInternalBorders(cell),
    external: getExternalBorders(cell, cellMap, geometry)
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

return {
  // Main API
  getSegmentBorders,
  getInternalBorders,
  getExternalBorders
};