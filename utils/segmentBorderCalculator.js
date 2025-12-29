/**
 * segmentBorderCalculator.js
 * 
 * Border calculation for segment-based cells (partial cell painting).
 * Determines which borders need to be drawn based on:
 * - Internal edges: Where filled segments meet empty segments within a cell
 * - External edges: Where filled segments meet empty space in adjacent cells
 * 
 * PRINCIPLE: Draw borders wherever filled meets empty.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { 
  SEGMENT_NAMES,
  SEGMENT_INTERNAL_ADJACENCY,
  SEGMENT_CROSS_CELL_ADJACENCY
} = await requireModuleByName("dmtConstants.js");

const { 
  hasSegments, 
  isSimpleCell, 
  getFilledSegments,
  buildCellMap,
  cellKey,
  neighborSegmentFilled
} = await requireModuleByName("cellAccessor.js");

// ============================================================================
// INTERNAL BORDER CALCULATION
// ============================================================================

/**
 * Calculate which internal borders need to be drawn for a segment cell.
 * Internal borders are lines from center to boundary points where
 * filled segments meet empty segments within the same cell.
 * 
 * @param {Object} cell - Segment cell with {segments: {...}}
 * @returns {Array<{from: string, to: string}>} Array of internal edge definitions
 */
function getInternalBorders(cell) {
  const borders = [];
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
 * 
 * @param {Object} cell - Segment cell with {x, y, segments: {...}}
 * @param {Map} cellMap - Cell lookup map from buildCellMap
 * @param {Object} geometry - Geometry instance
 * @returns {Array<{segment: string, needsBorder: boolean}>} Segments needing external border
 */
function getExternalBorders(cell, cellMap, geometry) {
  const borders = [];
  const filledSegments = getFilledSegments(cell);
  
  for (const segment of filledSegments) {
    const adjacency = SEGMENT_CROSS_CELL_ADJACENCY[segment];
    const neighborX = cell.x + adjacency.dx;
    const neighborY = cell.y + adjacency.dy;
    
    // Check if neighbor segment is filled
    const neighborFilled = neighborSegmentFilled(
      cellMap, neighborX, neighborY, 
      adjacency.neighborSegment, geometry
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
 * 
 * @param {Object} cell - Segment cell
 * @param {Map} cellMap - Cell lookup map
 * @param {Object} geometry - Geometry instance
 * @returns {{internal: Array, external: Array}} Border definitions
 */
function getSegmentBorders(cell, cellMap, geometry) {
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