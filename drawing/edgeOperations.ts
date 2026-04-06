/**
 * edgeOperations.ts
 * 
 * Pure functions for edge manipulation in grid maps.
 * Edges represent painted grid lines between cells.
 * 
 * EDGE DATA STRUCTURE:
 * {
 *   id: string,      // Unique identifier
 *   x: number,       // Cell x coordinate
 *   y: number,       // Cell y coordinate
 *   side: string,    // 'right' | 'bottom' (normalized form)
 *   color: string,   // Hex color code
 *   opacity?: number // Optional opacity (0-1)
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

// Type-only imports
import type { HexColor } from '#types/settings/settings.types';

// ===========================================
// Type Definitions
// ===========================================

/** Raw edge side (user input) */
export type EdgeSideInput = 'top' | 'right' | 'bottom' | 'left';

/** Normalized edge side (storage) */
export type EdgeSideNormalized = 'right' | 'bottom';

/** Unique edge identifier */
export type EdgeId = string;

/** Edge data structure */
export interface Edge {
  id: EdgeId;
  x: number;
  y: number;
  side: EdgeSideNormalized;
  color: HexColor;
  opacity?: number;
}

/** Normalized edge coordinates (without id) */
export interface NormalizedEdge {
  x: number;
  y: number;
  side: EdgeSideNormalized;
}

/** Edge for generation (without id) */
export interface EdgeTemplate {
  x: number;
  y: number;
  side: EdgeSideNormalized;
  color: HexColor | null;
}

/** Partial edge for updates */
export type EdgeUpdate = Partial<Omit<Edge, 'id'>>;

// ===========================================
// Normalization
// ===========================================

/**
 * Normalize edge to canonical representation.
 * Converts 'left' to 'right' of adjacent cell, 'top' to 'bottom' of adjacent cell.
 * This ensures each physical edge has exactly one storage representation.
 */
function normalizeEdge(x: number, y: number, side: EdgeSideInput): NormalizedEdge {
  switch (side) {
    case 'left':
      // Left edge of (x,y) = Right edge of (x-1,y)
      return { x: x - 1, y, side: 'right' };
    case 'top':
      // Top edge of (x,y) = Bottom edge of (x,y-1)
      return { x, y: y - 1, side: 'bottom' };
    default:
      // 'right' and 'bottom' are already canonical
      return { x, y, side: side as EdgeSideNormalized };
  }
}

// ===========================================
// ID Generation
// ===========================================

/**
 * Generate unique edge ID
 */
function generateEdgeId(): EdgeId {
  return 'edge-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ===========================================
// Single Edge Operations
// ===========================================

/**
 * Find edge at position (handles normalization internally)
 */
function getEdgeAt(
  edges: Edge[] | null | undefined,
  x: number,
  y: number,
  side: EdgeSideInput
): Edge | null {
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
 */
function addEdge(
  edges: Edge[] | null | undefined,
  x: number,
  y: number,
  side: EdgeSideInput,
  color: HexColor,
  opacity: number = 1
): Edge[] {
  // Validate inputs - return unchanged array if invalid
  if (typeof x !== 'number' || typeof y !== 'number' || !side || !color) {
    return edges || [];
  }
  
  const edgeArray = edges || [];
  const normalized = normalizeEdge(x, y, side);
  const existing = getEdgeAt(edgeArray, x, y, side);
  
  if (existing) {
    // Update existing edge color and opacity
    return edgeArray.map(e => 
      e.id === existing.id ? { ...e, color, opacity } : e
    );
  }
  
  // Add new edge
  return [...edgeArray, {
    id: generateEdgeId(),
    x: normalized.x,
    y: normalized.y,
    side: normalized.side,
    color,
    opacity
  }];
}

/**
 * Remove edge at position
 */
function removeEdge(
  edges: Edge[] | null | undefined,
  x: number,
  y: number,
  side: EdgeSideInput
): Edge[] {
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
 */
function removeEdgeById(edges: Edge[] | null | undefined, edgeId: EdgeId): Edge[] {
  if (!edges || !Array.isArray(edges)) return [];
  return edges.filter(e => e.id !== edgeId);
}

/**
 * Update edge properties by ID
 */
function updateEdge(
  edges: Edge[] | null | undefined,
  edgeId: EdgeId,
  updates: EdgeUpdate
): Edge[] {
  if (!edges || !Array.isArray(edges)) return [];
  
  return edges.map(e => {
    if (e.id === edgeId) {
      return { ...e, ...updates };
    }
    return e;
  });
}

// ===========================================
// Line Operations (Edge Line Tool)
// ===========================================

/**
 * Generate edges for a horizontal or vertical line between two intersection points.
 * Used for the edge line tool to paint multiple edges at once.
 * 
 * Intersection points are at grid corners (where 4 cells meet).
 * - A vertical line from (x, y1) to (x, y2) paints 'right' edges of column x-1
 * - A horizontal line from (x1, y) to (x2, y) paints 'bottom' edges of row y-1
 */
function generateEdgeLine(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  color: HexColor | null
): EdgeTemplate[] {
  const result: EdgeTemplate[] = [];
  
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
 * Merge new edges into existing edges array.
 * Handles duplicates by updating color of existing edges.
 */
function mergeEdges(edges: Edge[] | null | undefined, newEdges: EdgeTemplate[]): Edge[] {
  let result = [...(edges || [])];
  
  for (const edge of newEdges) {
    if (edge.color !== null) {
      result = addEdge(result, edge.x, edge.y, edge.side, edge.color);
    }
  }
  
  return result;
}

/**
 * Remove edges along a line between two intersection points
 */
function removeEdgeLine(
  edges: Edge[] | null | undefined,
  startX: number,
  startY: number,
  endX: number,
  endY: number
): Edge[] {
  // Generate the edges that would be in this line (color doesn't matter for removal)
  const lineEdges = generateEdgeLine(startX, startY, endX, endY, null);
  
  let result = [...(edges || [])];
  for (const edge of lineEdges) {
    result = removeEdge(result, edge.x, edge.y, edge.side);
  }
  
  return result;
}

// ===========================================
// Query Operations
// ===========================================

/**
 * Get all edges adjacent to a specific cell.
 * Useful for highlighting or bulk operations.
 */
function getEdgesForCell(
  edges: Edge[] | null | undefined,
  x: number,
  y: number
): Edge[] {
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

// ===========================================
// Bulk Operations
// ===========================================

/**
 * Clear all edges from the array
 */
function clearAllEdges(): Edge[] {
  return [];
}

// ===========================================
// Exports
// ===========================================

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