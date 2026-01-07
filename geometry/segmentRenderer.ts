/**
 * segmentRenderer.ts
 * 
 * Renders segment-based cells (partial cell painting with 8-triangle subdivision).
 * Segment cells use triangular regions radiating from the cell center to allow
 * diagonal walls, angled corridors, and organic dungeon shapes.
 * 
 * ARCHITECTURE NOTES:
 * - Designed for future optimization (caching, batching by color)
 * - Currently renders each segment as individual triangle path
 * - Performance: Profile before optimizing - triangles are fast in modern browsers
 * 
 * COORDINATE SYSTEM:
 * - Cell origin is top-left corner
 * - Segments radiate from center point
 * - Triangle vertices defined by SEGMENT_VERTICES ratios
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { SegmentGridCell, Cell, CellMap, SegmentName } from '#types/core/cell.types';
import type { ViewState, BorderTheme, IGridRenderer } from '#types/core/rendering.types';
import type {
  VertexName,
  VertexRatio
} from '../utils/dmtConstants';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { 
  SEGMENT_VERTICES, 
  SEGMENT_TRIANGLES
} = await requireModuleByName("dmtConstants.ts") as {
  SEGMENT_VERTICES: Record<VertexName, VertexRatio>;
  SEGMENT_TRIANGLES: Record<SegmentName, [VertexName, VertexName, VertexName]>;
};

const { 
  hasSegments,
  buildCellMap
} = await requireModuleByName("cellAccessor.ts") as {
  hasSegments: (cell: Cell) => cell is SegmentGridCell;
  buildCellMap: (cells: Cell[], geometry: IGridRenderer) => CellMap;
};

const {
  getInternalBorders,
  getExternalBorders
} = await requireModuleByName("segmentBorderCalculator.ts") as {
  getInternalBorders: (cell: SegmentGridCell) => InternalBorder[];
  getExternalBorders: (cell: SegmentGridCell, cellMap: CellMap, geometry: IGridRenderer) => ExternalBorder[];
};

// ===========================================
// Local Type Definitions
// ===========================================

/** Pre-calculated vertex positions for a cell */
interface CellVertices {
  [key: string]: Point;
}

/** Internal border edge (center to boundary point) */
interface InternalBorder {
  from: VertexName;
  to: VertexName;
}

/** External border edge (along cell boundary) */
interface ExternalBorder {
  segment: SegmentName;
  neighborSegment: SegmentName;
}

/** Result of separating cells by type */
interface SeparatedCells {
  simpleCells: Cell[];
  segmentCells: SegmentGridCell[];
}

// ============================================================================
// TRIANGLE GEOMETRY HELPERS
// ============================================================================

/**
 * Calculate actual pixel coordinates for a vertex within a cell
 */
function getVertexPosition(
  vertexName: VertexName,
  screenX: number,
  screenY: number,
  cellSize: number
): Point {
  const vertex = SEGMENT_VERTICES[vertexName];
  return {
    x: screenX + vertex.xRatio * cellSize,
    y: screenY + vertex.yRatio * cellSize
  };
}

/**
 * Get all vertex positions for a cell
 * Cached calculation for efficiency when rendering multiple segments
 */
function getCellVertices(
  screenX: number,
  screenY: number,
  cellSize: number
): CellVertices {
  const vertices: CellVertices = {};
  for (const [name, ratios] of Object.entries(SEGMENT_VERTICES)) {
    vertices[name] = {
      x: screenX + ratios.xRatio * cellSize,
      y: screenY + ratios.yRatio * cellSize
    };
  }
  return vertices;
}

/**
 * Draw a single triangle segment as part of a path (no fill - caller handles fill)
 */
function addTriangleToPath(
  ctx: CanvasRenderingContext2D,
  vertices: CellVertices,
  segmentName: SegmentName
): void {
  const [v1Name, v2Name, v3Name] = SEGMENT_TRIANGLES[segmentName];
  const v1 = vertices[v1Name];
  const v2 = vertices[v2Name];
  const v3 = vertices[v3Name];
  
  ctx.moveTo(v1.x, v1.y);
  ctx.lineTo(v2.x, v2.y);
  ctx.lineTo(v3.x, v3.y);
  ctx.closePath();
}

/**
 * Draw a single triangle segment (standalone, with fill)
 */
function drawTriangle(
  ctx: CanvasRenderingContext2D,
  vertices: CellVertices,
  segmentName: SegmentName
): void {
  ctx.beginPath();
  addTriangleToPath(ctx, vertices, segmentName);
  ctx.fill();
}

// ============================================================================
// SEGMENT CELL RENDERING
// ============================================================================

/**
 * Render a single segment cell
 * Uses a single combined path for all filled segments to avoid anti-aliasing
 * gaps between adjacent triangles.
 */
function renderSegmentCell(
  ctx: CanvasRenderingContext2D,
  cell: SegmentGridCell,
  geometry: IGridRenderer,
  viewState: ViewState
): void {
  const cellSize = geometry.getScaledCellSize(viewState.zoom);
  const { screenX, screenY } = geometry.gridToScreen(
    cell.x, cell.y, 
    viewState.x, viewState.y, 
    viewState.zoom
  );
  
  // Pre-calculate all vertices for this cell
  const vertices = getCellVertices(screenX, screenY, cellSize);
  
  // Set fill style
  ctx.fillStyle = cell.color;
  const opacity = cell.opacity ?? 1;
  if (opacity < 1) {
    ctx.globalAlpha = opacity;
  }
  
  // Build a single combined path for all filled segments
  // This eliminates anti-aliasing gaps between adjacent triangles
  const filledSegments = (Object.keys(cell.segments) as SegmentName[]).filter(
    seg => cell.segments[seg]
  );
  
  ctx.beginPath();
  for (const segmentName of filledSegments) {
    addTriangleToPath(ctx, vertices, segmentName);
  }
  ctx.fill();
  
  // Reset opacity
  if (opacity < 1) {
    ctx.globalAlpha = 1;
  }
}

/**
 * Render all segment cells
 * 
 * OPTIMIZATION HOOKS (for future):
 * - Could batch by color to reduce fillStyle changes
 * - Could cache vertex calculations for static cells
 * - Could use Path2D objects for complex patterns
 */
function renderSegmentCells(
  ctx: CanvasRenderingContext2D,
  cells: SegmentGridCell[],
  geometry: IGridRenderer,
  viewState: ViewState
): void {
  if (!cells || cells.length === 0) return;
  
  // FUTURE OPTIMIZATION: Could group by color here and batch
  // For now, render individually (profile before optimizing)
  
  for (const cell of cells) {
    renderSegmentCell(ctx, cell, geometry, viewState);
  }
}

// ============================================================================
// SEGMENT BORDER RENDERING
// ============================================================================

/**
 * Draw an internal border line (center to boundary point)
 * These are diagonal lines showing where filled segments meet empty segments
 * within the same cell (e.g., TL→Center→BR for a diagonal fill).
 * Uses fillRect for iOS compatibility (same as existing border rendering)
 */
function drawInternalBorder(
  ctx: CanvasRenderingContext2D,
  vertices: CellVertices,
  fromVertex: string,
  toVertex: string,
  borderWidth: number
): void {
  const from = vertices[fromVertex];
  const to = vertices[toVertex];
  
  // Calculate line as a thin filled rectangle
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return;
  
  // Perpendicular direction for width
  const perpX = -dy / length;
  const perpY = dx / length;
  const halfWidth = borderWidth / 2;
  
  // Draw as polygon (rotated rectangle)
  ctx.beginPath();
  ctx.moveTo(from.x + perpX * halfWidth, from.y + perpY * halfWidth);
  ctx.lineTo(to.x + perpX * halfWidth, to.y + perpY * halfWidth);
  ctx.lineTo(to.x - perpX * halfWidth, to.y - perpY * halfWidth);
  ctx.lineTo(from.x - perpX * halfWidth, from.y - perpY * halfWidth);
  ctx.closePath();
  ctx.fill();
}

/**
 * Draw an external border segment (along cell edge)
 * External borders are half-edge length since each segment only touches
 * half of a cell edge.
 */
function drawExternalBorder(
  ctx: CanvasRenderingContext2D,
  vertices: CellVertices,
  segmentName: SegmentName,
  borderWidth: number
): void {
  // Get the two boundary vertices for this segment (excluding center)
  const [, v1Name, v2Name] = SEGMENT_TRIANGLES[segmentName];
  
  // One of these vertices is a corner, one is a midpoint
  // The external edge runs from the midpoint to the corner (or corner to midpoint)
  // that is NOT shared with an adjacent segment's external edge
  
  // For external borders, we draw from the midpoint vertex to the corner vertex
  // The midpoint is always one of: TM, RM, BM, LM
  // The corner is always one of: TL, TR, BR, BL
  
  const v1 = vertices[v1Name];
  const v2 = vertices[v2Name];
  
  // Draw border line as rectangle
  const dx = v2.x - v1.x;
  const dy = v2.y - v1.y;
  const length = Math.sqrt(dx * dx + dy * dy);
  
  if (length === 0) return;
  
  const perpX = -dy / length;
  const perpY = dx / length;
  const halfWidth = borderWidth / 2;
  
  ctx.beginPath();
  ctx.moveTo(v1.x + perpX * halfWidth, v1.y + perpY * halfWidth);
  ctx.lineTo(v2.x + perpX * halfWidth, v2.y + perpY * halfWidth);
  ctx.lineTo(v2.x - perpX * halfWidth, v2.y - perpY * halfWidth);
  ctx.lineTo(v1.x - perpX * halfWidth, v1.y - perpY * halfWidth);
  ctx.closePath();
  ctx.fill();
}

/**
 * Render borders for all segment cells
 */
function renderSegmentBorders(
  ctx: CanvasRenderingContext2D,
  segmentCells: SegmentGridCell[],
  allCells: Cell[],
  geometry: IGridRenderer,
  viewState: ViewState,
  theme: BorderTheme
): void {
  if (!segmentCells || segmentCells.length === 0) return;
  
  const cellSize = geometry.getScaledCellSize(viewState.zoom);
  const cellMap = buildCellMap(allCells, geometry);
  const borderWidth = theme.borderWidth || 2;
  
  ctx.fillStyle = theme.border;
  
  for (const cell of segmentCells) {
    const { screenX, screenY } = geometry.gridToScreen(
      cell.x, cell.y,
      viewState.x, viewState.y,
      viewState.zoom
    );
    
    const vertices = getCellVertices(screenX, screenY, cellSize);
    
    // Draw internal borders (diagonal lines where filled meets empty within cell)
    // These create the diagonal boundaries like TL→Center→BR
    const internalBorders = getInternalBorders(cell);
    for (const { from, to } of internalBorders) {
      drawInternalBorder(ctx, vertices, from, to, borderWidth);
    }
    
    // Draw external borders (at cell edges where segments meet empty neighbors)
    const externalBorders = getExternalBorders(cell, cellMap, geometry);
    for (const { segment } of externalBorders) {
      drawExternalBorder(ctx, vertices, segment, borderWidth);
    }
  }
}

// ============================================================================
// CELL FILTERING UTILITIES
// ============================================================================

/**
 * Separate cells into simple and segment cells
 */
function separateCellsByType(cells: Cell[]): SeparatedCells {
  const simpleCells: Cell[] = [];
  const segmentCells: SegmentGridCell[] = [];
  
  for (const cell of cells) {
    if (hasSegments(cell)) {
      segmentCells.push(cell);
    } else {
      simpleCells.push(cell);
    }
  }
  
  return { simpleCells, segmentCells };
}

// ============================================================================
// EXPORTS
// ============================================================================

const segmentRenderer = {
  // Main rendering functions
  renderSegmentCells,
  renderSegmentBorders,
  
  // Cell filtering
  separateCellsByType,
  
  // Lower-level functions (exposed for testing/debugging)
  renderSegmentCell,
  getCellVertices,
  drawTriangle
};

// Export types for consumers
export type {
  CellVertices,
  InternalBorder,
  ExternalBorder,
  SeparatedCells
};

return { segmentRenderer };