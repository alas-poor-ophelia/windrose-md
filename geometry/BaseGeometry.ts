/**
 * BaseGeometry.ts
 * 
 * Abstract base class for geometry implementations (GridGeometry, HexGeometry).
 * Defines the common interface that all geometry classes must implement,
 * and provides shared utility methods.
 * 
 * COORDINATE SYSTEMS (implemented by subclasses):
 * - Grid coordinates: Normalized as Point {x, y}
 *   - GridGeometry interprets: x = gridX, y = gridY
 *   - HexGeometry interprets: x = q, y = r (axial)
 * 
 * - World coordinates: Float pixel coordinates in the map's coordinate system
 *   Origin and scale defined by geometry implementation
 * 
 * - Screen coordinates: Pixel coordinates on the canvas
 *   Includes viewport transforms (pan/zoom)
 * 
 * IMPLEMENTATION GUIDELINES:
 * - Subclasses MUST implement all abstract methods
 * - All coordinate I/O uses normalized Point for polymorphic usage
 * - Implementations map Point.x/y to their native coordinate names internally
 */

// Type-only imports - stripped at runtime, invisible to Datacore
import type {
  Point,
  ScreenCoords,
  WorldCoords,
  OffsetCoords,
  GridBounds,
  StrokeStyle,
  GridStyle,
  DistanceOptions,
  Cell,
  IGeometry
} from '#types/core/geometry.types';

// Re-export types for consumers
export type {
  Point,
  ScreenCoords,
  WorldCoords,
  OffsetCoords,
  GridBounds,
  StrokeStyle,
  GridStyle,
  DistanceOptions,
  Cell,
  IGeometry
};

/**
 * Abstract base class for geometry implementations.
 * Implements IGeometry interface with concrete shared methods
 * and abstract methods for subclass implementation.
 */
abstract class BaseGeometry implements IGeometry {
  /**
   * @throws {Error} If instantiated directly (must use subclass)
   */
  constructor() {
    if (new.target === BaseGeometry) {
      throw new Error('BaseGeometry is abstract and cannot be instantiated directly');
    }
  }
  
  // ============================================================================
  // CONCRETE METHODS (Shared implementation for all geometry types)
  // ============================================================================
  
  /**
   * Apply iOS-safe stroke style to canvas context
   * 
   * iOS may corrupt stroke-related canvas state during memory pressure events
   * (when app is backgrounded). This helper ensures all stroke properties are
   * explicitly set to valid values before any stroke operations.
   * 
   * @param ctx - Canvas context
   * @param style - Stroke style options
   * @param callback - Function containing stroke operations
   */
  withStrokeStyle(
    ctx: CanvasRenderingContext2D,
    style: StrokeStyle,
    callback: () => void
  ): void {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Save context state
    ctx.save();
    
    // Explicitly reset ALL stroke-related properties
    // This protects against iOS state corruption
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    
    // Execute stroke operations
    callback();
    
    // Restore context state
    ctx.restore();
  }
  
  /**
   * Convert world coordinates to screen coordinates (for rendering)
   * This is a pure coordinate transform that works identically for all geometry types
   * 
   * @param worldX - World X coordinate
   * @param worldY - World Y coordinate
   * @param offsetX - Screen offset X (viewport pan)
   * @param offsetY - Screen offset Y (viewport pan)
   * @param zoom - Current zoom level
   * @returns Screen coordinates
   */
  worldToScreen(
    worldX: number,
    worldY: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): ScreenCoords {
    const screenX = offsetX + worldX * zoom;
    const screenY = offsetY + worldY * zoom;
    return { screenX, screenY };
  }

  /**
   * Convert screen coordinates to world coordinates
   * This is the inverse of worldToScreen and works identically for all geometry types
   * Useful for calculating visible bounds and converting pointer events
   * 
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @param zoom - Current zoom level
   * @returns World coordinates
   */
  screenToWorld(screenX: number, screenY: number, zoom: number): WorldCoords {
    return {
      worldX: screenX / zoom,
      worldY: screenY / zoom
    };
  }
  
  // ============================================================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ============================================================================
  
  /**
   * Convert world coordinates to grid coordinates
   * @returns Point where x/y are in the geometry's native coordinate system
   */
  abstract worldToGrid(worldX: number, worldY: number): Point;
  
  /**
   * Convert grid coordinates to world coordinates
   * @param x - Grid coordinate (gridX or q)
   * @param y - Grid coordinate (gridY or r)
   */
  abstract gridToWorld(x: number, y: number): WorldCoords;
  
  /**
   * Convert grid coordinates to screen coordinates
   */
  abstract gridToScreen(
    x: number,
    y: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): ScreenCoords;
  
  /**
   * Get the scaled cell/hex size at current zoom level
   */
  abstract getScaledCellSize(zoom: number): number;
  
  /**
   * Create a cell object in the geometry's native format
   */
  abstract createCellObject(coords: Point, color: string): Cell;
  
  /**
   * Check if a cell matches given coordinates
   */
  abstract cellMatchesCoords(cell: Cell, coords: Point): boolean;
  
  /**
   * Get all cells within a rectangular area
   */
  abstract getCellsInRectangle(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Point[];
  
  /**
   * Get all cells within a circular area
   * @param radius - Radius in cells (not pixels)
   */
  abstract getCellsInCircle(
    centerX: number,
    centerY: number,
    radius: number
  ): Point[];
  
  /**
   * Get all cells along a line between two points
   */
  abstract getCellsInLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): Point[];
  
  /**
   * Calculate Euclidean distance between two cells
   */
  abstract getEuclideanDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number;
  
  /**
   * Calculate Manhattan distance between two cells
   */
  abstract getManhattanDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): number;
  
  /**
   * Calculate "game distance" between two cells with configurable rules
   * For grid: supports different diagonal calculation rules
   * For hex: returns hex distance (options are ignored)
   */
  abstract getCellDistance(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    options?: DistanceOptions
  ): number;
  
  /**
   * Get all neighboring cells
   */
  abstract getNeighbors(x: number, y: number): Point[];
  
  /**
   * Check if coordinates are within bounds
   */
  abstract isWithinBounds(x: number, y: number): boolean;
  
  /**
   * Clamp coordinates to bounds
   */
  abstract clampToBounds(x: number, y: number): Point;
  
  /**
   * Convert grid coordinates to offset coordinates (col, row)
   * For grid: passthrough (x=col, y=row)
   * For hex: axial to offset conversion
   */
  abstract toOffsetCoords(gridX: number, gridY: number): OffsetCoords;
  
  /**
   * Convert a cell object to offset coordinates
   */
  abstract cellToOffsetCoords(cell: Cell): OffsetCoords;
  
  /**
   * Check if this geometry has defined bounds
   */
  abstract isBounded(): boolean;
  
  /**
   * Get the bounds for this geometry (if bounded)
   * Returns null for unbounded geometries
   */
  abstract getBounds(): GridBounds | null;
  
  /**
   * Draw grid lines on canvas
   */
  abstract drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle
  ): void;
}

// Type exports for consuming modules
export type { BaseGeometry };

return { BaseGeometry };