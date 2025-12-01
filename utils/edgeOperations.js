/**
 * edgeOperations.js
 * 
 * Pure functions for edge manipulation in grid maps.
 * Edges represent painted grid lines between cells.
 * 
 * EDGE DATA STRUCTURE:
 * {
 *   id: string,      // Unique identifier
 *   x: number,       // Cell x coordinate
 *   y: number,       // Cell y coordinate
 *   side: string,    // 'top' | 'right' | 'bottom' | 'left'
 *   color: string    // Hex color code
 * }
 * 
 * NORMALIZATION:
 * Each physical edge between two cells has two possible representations:
 * - "right edge of cell (5,3)" === "left edge of cell (6,3)"
 * - "bottom edge of cell (5,3)" === "top edge of cell (5,4)"
 * 
 * To avoid duplicates, we normalize to always use 'right' and 'bottom' sides:
 * - 'left' edges become 'right' edges of the cell to the left (x-1)
 * - 'top' edges become 'bottom' edges of the cell above (y-1)
 */

/**
 * Normalize edge to canonical representation.
 * Converts 'left' to 'right' of adjacent cell, 'top' to 'bottom' of adjacent cell.
 * This ensures each physical edge has exactly one storage representation.
 * 
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - 'top' | 'right' | 'bottom' | 'left'
 * @returns {{ x: number, y: number, side: string }} Normalized edge coordinates
 */
function normalizeEdge(x, y, side) {
  switch (side) {
    case 'left':
      // Left edge of (x,y) = Right edge of (x-1,y)
      return { x: x - 1, y, side: 'right' };
    case 'top':
      // Top edge of (x,y) = Bottom edge of (x,y-1)
      return { x, y: y - 1, side: 'bottom' };
    default:
      // 'right' and 'bottom' are already canonical
      return { x, y, side };
  }
}

/**
 * Generate unique edge ID
 * @returns {string} Unique identifier for edge
 */
function generateEdgeId() {
  return 'edge-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Find edge at position (handles normalization internally)
 * @param {Array} edges - Edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @returns {Object|null} Edge object if found, null otherwise
 */
function getEdgeAt(edges, x, y, side) {
  if (!edges || !Array.isArray(edges)) return null;
  
  const normalized = normalizeEdge(x, y, side);
  return edges.find(e => 
    e.x === normalized.x && 
    e.y === normalized.y && 
    e.side === normalized.side
  ) || null;
}

/**
 * Add edge or update color if edge already exists
 * @param {Array} edges - Current edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @param {string} color - Edge color (hex code)
 * @returns {Array} New edges array with added/updated edge
 */
function addEdge(edges, x, y, side, color) {
  // Validate inputs - return unchanged array if invalid
  if (typeof x !== 'number' || typeof y !== 'number' || !side || !color) {
    return edges || [];
  }
  
  const edgeArray = edges || [];
  const normalized = normalizeEdge(x, y, side);
  const existing = getEdgeAt(edgeArray, x, y, side);
  
  if (existing) {
    // Update existing edge color
    return edgeArray.map(e => 
      e.id === existing.id ? { ...e, color } : e
    );
  }
  
  // Add new edge
  return [...edgeArray, {
    id: generateEdgeId(),
    x: normalized.x,
    y: normalized.y,
    side: normalized.side,
    color
  }];
}

/**
 * Remove edge at position
 * @param {Array} edges - Current edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @returns {Array} New edges array without the specified edge
 */
function removeEdge(edges, x, y, side) {
  if (!edges || !Array.isArray(edges)) return [];
  
  const normalized = normalizeEdge(x, y, side);
  return edges.filter(e => 
    !(e.x === normalized.x && 
      e.y === normalized.y && 
      e.side === normalized.side)
  );
}

/**
 * Remove edge by ID
 * @param {Array} edges - Current edges array
 * @param {string} edgeId - Edge ID to remove
 * @returns {Array} New edges array without the specified edge
 */
function removeEdgeById(edges, edgeId) {
  if (!edges || !Array.isArray(edges)) return [];
  return edges.filter(e => e.id !== edgeId);
}

/**
 * Update edge properties by ID
 * @param {Array} edges - Current edges array
 * @param {string} edgeId - Edge ID to update
 * @param {Object} updates - Properties to update
 * @returns {Array} New edges array with updated edge
 */
function updateEdge(edges, edgeId, updates) {
  if (!edges || !Array.isArray(edges)) return [];
  
  return edges.map(e => {
    if (e.id === edgeId) {
      return { ...e, ...updates };
    }
    return e;
  });
}

/**
 * Generate edges for a horizontal or vertical line between two intersection points
 * Used for the edge line tool to paint multiple edges at once.
 * 
 * Intersection points are at grid corners (where 4 cells meet).
 * - A vertical line from (x, y1) to (x, y2) paints 'right' edges of column x-1
 * - A horizontal line from (x1, y) to (x2, y) paints 'bottom' edges of row y-1
 * 
 * @param {number} startX - Start intersection x coordinate
 * @param {number} startY - Start intersection y coordinate
 * @param {number} endX - End intersection x coordinate
 * @param {number} endY - End intersection y coordinate
 * @param {string} color - Edge color (hex code)
 * @returns {Array} Array of edge objects (without IDs - add IDs when merging)
 */
function generateEdgeLine(startX, startY, endX, endY, color) {
  const result = [];
  
  if (startX === endX) {
    // Vertical line at intersection column startX
    // This paints the 'right' edges of cells in column (startX - 1)
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const cellX = startX - 1; // The cell column whose right edges we're painting
    
    // Paint edges from minY to maxY-1 (edges between intersections)
    for (let y = minY; y < maxY; y++) {
      const normalized = normalizeEdge(cellX, y, 'right');
      result.push({ 
        x: normalized.x, 
        y: normalized.y, 
        side: normalized.side, 
        color 
      });
    }
  } else if (startY === endY) {
    // Horizontal line at intersection row startY
    // This paints the 'bottom' edges of cells in row (startY - 1)
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const cellY = startY - 1; // The cell row whose bottom edges we're painting
    
    // Paint edges from minX to maxX-1 (edges between intersections)
    for (let x = minX; x < maxX; x++) {
      const normalized = normalizeEdge(x, cellY, 'bottom');
      result.push({ 
        x: normalized.x, 
        y: normalized.y, 
        side: normalized.side, 
        color 
      });
    }
  }
  // If neither same x nor same y, return empty (diagonal not supported)
  
  return result;
}

/**
 * Merge new edges into existing edges array
 * Handles duplicates by updating color of existing edges.
 * 
 * @param {Array} edges - Current edges array
 * @param {Array} newEdges - Edges to add (from generateEdgeLine, without IDs)
 * @returns {Array} Merged edges array
 */
function mergeEdges(edges, newEdges) {
  let result = [...(edges || [])];
  
  for (const edge of newEdges) {
    result = addEdge(result, edge.x, edge.y, edge.side, edge.color);
  }
  
  return result;
}

/**
 * Remove edges along a line between two intersection points
 * 
 * @param {Array} edges - Current edges array
 * @param {number} startX - Start intersection x coordinate
 * @param {number} startY - Start intersection y coordinate
 * @param {number} endX - End intersection x coordinate
 * @param {number} endY - End intersection y coordinate
 * @returns {Array} Edges array with line edges removed
 */
function removeEdgeLine(edges, startX, startY, endX, endY) {
  // Generate the edges that would be in this line (color doesn't matter for removal)
  const lineEdges = generateEdgeLine(startX, startY, endX, endY, null);
  
  let result = [...(edges || [])];
  for (const edge of lineEdges) {
    result = removeEdge(result, edge.x, edge.y, edge.side);
  }
  
  return result;
}

/**
 * Get all edges adjacent to a specific cell
 * Useful for highlighting or bulk operations.
 * 
 * @param {Array} edges - Edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {Array} Edges touching this cell (may include edges "owned" by adjacent cells)
 */
function getEdgesForCell(edges, x, y) {
  if (!edges || !Array.isArray(edges)) return [];
  
  return edges.filter(e => {
    // Check if edge is one of the 4 edges of this cell
    // Right edge of (x,y)
    if (e.x === x && e.y === y && e.side === 'right') return true;
    // Bottom edge of (x,y)
    if (e.x === x && e.y === y && e.side === 'bottom') return true;
    // Left edge of (x,y) = Right edge of (x-1,y)
    if (e.x === x - 1 && e.y === y && e.side === 'right') return true;
    // Top edge of (x,y) = Bottom edge of (x,y-1)
    if (e.x === x && e.y === y - 1 && e.side === 'bottom') return true;
    
    return false;
  });
}

/**
 * Clear all edges from the array
 * @returns {Array} Empty array
 */
function clearAllEdges() {
  return [];
}

return {
  // Normalization
  normalizeEdge,
  
  // ID generation
  generateEdgeId,
  
  // Single edge operations
  getEdgeAt,
  addEdge,
  removeEdge,
  removeEdgeById,
  updateEdge,
  
  // Line operations (for edge line tool)
  generateEdgeLine,
  mergeEdges,
  removeEdgeLine,
  
  // Query operations
  getEdgesForCell,
  
  // Bulk operations
  clearAllEdges
};