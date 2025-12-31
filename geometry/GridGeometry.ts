/**
 * GridGeometry.ts
 * 
 * Handles all grid-specific geometric calculations and rendering.
 * Extends BaseGeometry to implement the standard geometry interface
 * for square grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Grid coordinates (x, y): Integer cell indices via Point type
 *   Used internally for all grid math and storage. Origin at (0,0) in top-left.
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates in the map's coordinate system
 *   Used for positioning and measurements. Origin at (0,0) at top-left corner of cell (0,0).
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on the canvas
 *   Used for rendering. Includes viewport transforms (pan/zoom/rotation).
 * 
 * API CONSISTENCY:
 * - All methods return Point {x, y} for grid coordinates
 * - Storage uses {x, y, color} format
 * - Polymorphic with HexGeometry through IGeometry interface
 * 
 * @extends BaseGeometry
 */

// Type-only imports
import type {
  Point,
  WorldCoords,
  ScreenCoords,
  OffsetCoords,
  GridBounds,
  GridStyle,
  DistanceOptions,
  Cell
} from '#types/core/geometry.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { BaseGeometry } = await requireModuleByName("BaseGeometry.ts") as {
  BaseGeometry: new () => InstanceType<typeof BaseGeometryClass>
};

// Type for BaseGeometry class (we need this for extends)
declare class BaseGeometryClass {
  cellSize: number;
  worldToScreen(worldX: number, worldY: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  screenToWorld(screenX: number, screenY: number, zoom: number): WorldCoords;
}

/** Visible grid range for viewport calculations */
interface VisibleGridRange {
  startX: number;
  endX: number;
  startY: number;
  endY: number;
}

/** Edge detection result */
interface EdgeInfo {
  x: number;
  y: number;
  side: 'top' | 'right' | 'bottom' | 'left';
}

/** Bounding box in world coordinates */
interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

class GridGeometry extends BaseGeometry {
  cellSize: number;

  /**
   * @param cellSize - Base size of each grid cell in pixels (before zoom)
   */
  constructor(cellSize: number) {
    super();
    this.cellSize = cellSize;
  }
  
  /**
   * Convert world coordinates to grid cell coordinates
   * @returns Point where x=gridX, y=gridY
   */
  worldToGrid(worldX: number, worldY: number): Point {
    const x = Math.floor(worldX / this.cellSize);
    const y = Math.floor(worldY / this.cellSize);
    return { x, y };
  }
  
  /**
   * Convert grid cell coordinates to world coordinates (top-left corner of cell)
   */
  gridToWorld(x: number, y: number): WorldCoords {
    const worldX = x * this.cellSize;
    const worldY = y * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Get the center point of a grid cell in world coordinates
   */
  getCellCenter(x: number, y: number): WorldCoords {
    const worldX = (x + 0.5) * this.cellSize;
    const worldY = (y + 0.5) * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Convert offset coordinates to world coordinates
   * For GridGeometry, offset coordinates are identical to grid coordinates.
   */
  offsetToWorld(col: number, row: number): WorldCoords {
    return this.gridToWorld(col, row);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell (top-left corner)
   */
  snapToGrid(worldX: number, worldY: number): WorldCoords {
    const { x, y } = this.worldToGrid(worldX, worldY);
    return this.gridToWorld(x, y);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell center
   */
  snapToCellCenter(worldX: number, worldY: number): WorldCoords {
    const { x, y } = this.worldToGrid(worldX, worldY);
    return this.getCellCenter(x, y);
  }
  
  /**
   * Calculate visible grid range for a given viewport
   */
  getVisibleGridRange(
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number
  ): VisibleGridRange {
    const scaledCellSize = this.cellSize * zoom;
    
    const startX = Math.floor(-offsetX / scaledCellSize);
    const endX = Math.ceil((width - offsetX) / scaledCellSize);
    const startY = Math.floor(-offsetY / scaledCellSize);
    const endY = Math.ceil((height - offsetY) / scaledCellSize);
    
    return { startX, endX, startY, endY };
  }
  
  /**
   * Convert grid coordinates to screen coordinates (for rendering)
   */
  gridToScreen(
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): ScreenCoords {
    const scaledCellSize = this.cellSize * zoom;
    const screenX = offsetX + x * scaledCellSize;
    const screenY = offsetY + y * scaledCellSize;
    return { screenX, screenY };
  }
  
  /**
   * Determine which edge of a cell was clicked based on world coordinates
   * 
   * @param worldX - World X coordinate
   * @param worldY - World Y coordinate
   * @param threshold - Distance from edge to count as hit (0-0.5, default 0.15)
   * @returns Edge info or null if click was in cell center
   */
  screenToEdge(worldX: number, worldY: number, threshold = 0.15): EdgeInfo | null {
    const cellX = Math.floor(worldX / this.cellSize);
    const cellY = Math.floor(worldY / this.cellSize);
    
    const offsetX = (worldX / this.cellSize) - cellX;
    const offsetY = (worldY / this.cellSize) - cellY;
    
    if (offsetY < threshold) {
      return { x: cellX, y: cellY, side: 'top' };
    }
    if (offsetY > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'bottom' };
    }
    if (offsetX < threshold) {
      return { x: cellX, y: cellY, side: 'left' };
    }
    if (offsetX > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'right' };
    }
    
    return null;
  }
  
  /**
   * Draw grid lines on the canvas using fill-based rendering
   * 
   * NOTE: Uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   */
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle = {}
  ): void {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    const scaledCellSize = this.cellSize * zoom;
    
    const { startX, endX, startY, endY } = this.getVisibleGridRange(
      offsetX, offsetY, width, height, zoom
    );
    
    // Add extra padding for rotation handling
    const diagonal = Math.sqrt(width * width + height * height);
    const extraCells = Math.ceil(diagonal / scaledCellSize);
    
    const paddedStartX = startX - extraCells;
    const paddedEndX = endX + extraCells;
    const paddedStartY = startY - extraCells;
    const paddedEndY = endY + extraCells;
    
    // iOS defensive: Limit line extension
    const maxExtension = Math.max(width, height);
    
    // iOS defensive: Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    
    const halfWidth = lineWidth / 2;
    
    // Draw vertical lines
    for (let x = paddedStartX; x <= paddedEndX; x++) {
      ctx.fillStyle = lineColor;
      const screenX = offsetX + x * scaledCellSize;
      ctx.fillRect(
        screenX - halfWidth,
        -maxExtension,
        lineWidth,
        height + maxExtension * 2
      );
    }
    
    // Draw horizontal lines
    for (let y = paddedStartY; y <= paddedEndY; y++) {
      ctx.fillStyle = lineColor;
      const screenY = offsetY + y * scaledCellSize;
      ctx.fillRect(
        -maxExtension,
        screenY - halfWidth,
        width + maxExtension * 2,
        lineWidth
      );
    }
  }
  
  /**
   * Draw a filled cell on the canvas
   */
  drawCell(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void {
    const scaledCellSize = this.cellSize * zoom;
    const { screenX, screenY } = this.gridToScreen(x, y, offsetX, offsetY, zoom);
    
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
  }
  
  /**
   * Draw multiple cells of the same color (optimized batch rendering)
   */
  drawCells(
    ctx: CanvasRenderingContext2D,
    cells: Point[],
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void {
    const scaledCellSize = this.cellSize * zoom;
    ctx.fillStyle = color;
    
    for (const cell of cells) {
      const { screenX, screenY } = this.gridToScreen(cell.x, cell.y, offsetX, offsetY, zoom);
      ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
    }
  }
  
  /**
   * Get the size of a cell in screen pixels at current zoom
   */
  getScaledCellSize(zoom: number): number {
    return this.cellSize * zoom;
  }
  
  /**
   * Check if coordinates are within bounds
   * GridGeometry is unbounded by default, always returns true
   */
  isWithinBounds(_x: number, _y: number): boolean {
    return true;
  }
  
  /**
   * Clamp coordinates to bounds
   * GridGeometry is unbounded, returns input unchanged
   */
  clampToBounds(x: number, y: number): Point {
    return { x, y };
  }
  
  /**
   * Convert grid coordinates to offset coordinates
   * For grid geometry, gridX/gridY are already col/row
   */
  toOffsetCoords(x: number, y: number): OffsetCoords {
    return { col: x, row: y };
  }
  
  /**
   * Convert a cell object to offset coordinates
   */
  cellToOffsetCoords(cell: Cell): OffsetCoords {
    if ('x' in cell) {
      return { col: cell.x, row: cell.y };
    }
    // HexCell - shouldn't happen for GridGeometry but handle gracefully
    return { col: cell.q, row: cell.r };
  }
  
  /**
   * Check if this geometry has defined bounds
   * Grid maps are unbounded (infinite canvas)
   */
  isBounded(): boolean {
    return false;
  }
  
  /**
   * Get the bounds for this geometry
   * Grid maps have no bounds
   */
  getBounds(): GridBounds | null {
    return null;
  }
  
  /**
   * Get all grid cells within a rectangular area
   */
  getCellsInRectangle(x1: number, y1: number, x2: number, y2: number): Point[] {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    const cells: Point[] = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push({ x, y });
      }
    }
    
    return cells;
  }
  
  /**
   * Get all grid cells within a circle
   */
  getCellsInCircle(centerX: number, centerY: number, radiusInCells: number): Point[] {
    const cells: Point[] = [];
    const radiusSquared = radiusInCells * radiusInCells;
    
    const minX = Math.floor(centerX - radiusInCells);
    const maxX = Math.ceil(centerX + radiusInCells);
    const minY = Math.floor(centerY - radiusInCells);
    const maxY = Math.ceil(centerY + radiusInCells);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        const dx = x + 0.5 - centerX;
        const dy = y + 0.5 - centerY;
        const distSquared = dx * dx + dy * dy;
        
        if (distSquared <= radiusSquared) {
          cells.push({ x, y });
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Get grid cells along a line (Bresenham's algorithm)
   */
  getCellsInLine(x1: number, y1: number, x2: number, y2: number): Point[] {
    const cells: Point[] = [];
    
    let x = x1;
    let y = y1;
    
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      cells.push({ x, y });
      
      if (x === x2 && y === y2) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return cells;
  }
  
  /**
   * Calculate distance between two grid cells (Manhattan distance)
   */
  getManhattanDistance(x1: number, y1: number, x2: number, y2: number): number {
    return Math.abs(x2 - x1) + Math.abs(y2 - y1);
  }
  
  /**
   * Calculate distance between two grid cells (Euclidean distance)
   */
  getEuclideanDistance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate game distance between two grid cells with configurable diagonal rules
   */
  getCellDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options: DistanceOptions = {}
  ): number {
    const { diagonalRule = 'alternating' } = options;
    
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    
    switch (diagonalRule) {
      case 'equal':
        return Math.max(dx, dy);
        
      case 'euclidean':
        return Math.sqrt(dx * dx + dy * dy);
        
      case 'alternating':
      default:
        const straights = Math.abs(dx - dy);
        const diagonals = Math.min(dx, dy);
        return straights + diagonals + Math.floor(diagonals / 2);
    }
  }
  
  /**
   * Create a cell object in grid coordinate format
   * @param coords - Point coordinates {x, y}
   * @param color - Cell color
   */
  createCellObject(coords: Point, color: string): Cell {
    return { x: coords.x, y: coords.y, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * @param cell - Cell object to check
   * @param coords - Point coordinates {x, y}
   */
  cellMatchesCoords(cell: Cell, coords: Point): boolean {
    if ('x' in cell) {
      return cell.x === coords.x && cell.y === coords.y;
    }
    // HexCell comparison - x maps to q, y maps to r
    return cell.q === coords.x && cell.r === coords.y;
  }

  /**
   * Get all neighboring cells (4-directional: up, down, left, right)
   */
  getNeighbors(x: number, y: number): Point[] {
    return [
      { x: x + 1, y },     // Right
      { x: x - 1, y },     // Left
      { x, y: y + 1 },     // Down
      { x, y: y - 1 }      // Up
    ];
  }

  /**
   * Get all neighboring cells including diagonals (8-directional)
   */
  getNeighbors8(x: number, y: number): Point[] {
    return [
      { x: x + 1, y },         // Right
      { x: x + 1, y: y - 1 },  // Top-right
      { x, y: y - 1 },         // Up
      { x: x - 1, y: y - 1 },  // Top-left
      { x: x - 1, y },         // Left
      { x: x - 1, y: y + 1 },  // Bottom-left
      { x, y: y + 1 },         // Down
      { x: x + 1, y: y + 1 }   // Bottom-right
    ];
  }

  /**
   * Get the bounding box of a cell in world coordinates
   */
  getCellBounds(cell: Cell): BoundingBox {
    const cellX = 'x' in cell ? cell.x : cell.q;
    const cellY = 'x' in cell ? cell.y : cell.r;
    const x = cellX * this.cellSize;
    const y = cellY * this.cellSize;
    return {
      minX: x,
      minY: y,
      maxX: x + this.cellSize,
      maxY: y + this.cellSize
    };
  }

  /**
   * Get the bounding box of an object in world coordinates
   */
  getObjectBounds(obj: { position: Point; size?: { width: number; height: number } }): BoundingBox {
    const size = obj.size || { width: 1, height: 1 };
    const x = obj.position.x * this.cellSize;
    const y = obj.position.y * this.cellSize;
    return {
      minX: x,
      minY: y,
      maxX: x + size.width * this.cellSize,
      maxY: y + size.height * this.cellSize
    };
  }
}

// Export type for consumers
export type { GridGeometry };

return { GridGeometry };