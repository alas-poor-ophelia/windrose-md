/**
 * Geometry Type Definitions
 * Path: types/core/geometry.types.ts
 * 
 * Core coordinate and geometry types used throughout Windrose.
 * 
 * COORDINATE PHILOSOPHY:
 * The IGeometry interface uses normalized `Point` ({x, y}) for all grid/cell
 * coordinates. This allows call sites to be completely agnostic about whether
 * they're working with square grids or hex grids:
 * 
 * - GridGeometry interprets: x = gridX, y = gridY
 * - HexGeometry interprets: x = q, y = r (axial coordinates)
 * 
 * As long as the same geometry instance that produced coordinates is used
 * to consume them, everything works transparently.
 */

// ===========================================
// Basic Primitives
// ===========================================

/** 
 * Generic 2D point used for:
 * - Grid coordinates (x=gridX, y=gridY for square; x=q, y=r for hex)
 * - Pixel coordinates
 * - Any x/y pair
 */
export interface Point {
  x: number;
  y: number;
}

/** Screen/canvas coordinates (after pan/zoom transform) */
export interface ScreenCoords {
  screenX: number;
  screenY: number;
}

/** World coordinates (before pan/zoom transform) */
export interface WorldCoords {
  worldX: number;
  worldY: number;
}

/** Offset coordinates for array-based storage (fog of war, etc.) */
export interface OffsetCoords {
  col: number;
  row: number;
}

/** Grid bounds (max column and row indices) */
export interface GridBounds {
  maxCol: number;
  maxRow: number;
}

/** Bounding box in world coordinates */
export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ===========================================
// Style Types
// ===========================================

/** Stroke style options for canvas rendering */
export interface StrokeStyle {
  lineColor?: string;
  lineWidth?: number;
}

/** Grid rendering style */
export interface GridStyle {
  lineColor?: string;
  lineWidth?: number;
  background?: string;
}

// ===========================================
// Distance Calculation
// ===========================================

/** Options for getCellDistance calculation */
export interface DistanceOptions {
  /** 
   * Diagonal movement rule (grid only, ignored for hex):
   * - 'alternating': 5ft/10ft/5ft pattern (D&D 5e default)
   * - 'equal': All moves cost 1 (4e style)
   * - 'euclidean': True geometric distance
   */
  diagonalRule?: 'alternating' | 'equal' | 'euclidean';
}

// ===========================================
// Cell Type (imported from cell.types.ts)
// ===========================================

// Cell is defined in cell.types.ts as the union GridCell | HexCell
// Import it here for use in IGeometry interface
// Note: This creates a circular import (cell.types imports Point from here)
// but TypeScript handles type-only circular imports correctly
import type { Cell } from './cell.types';
export type { Cell };

// ===========================================
// Geometry Interface
// ===========================================

/**
 * IGeometry - Abstract interface for grid/hex geometry operations.
 * 
 * All coordinate parameters and return values use normalized Point (x, y).
 * Implementations interpret these in their native coordinate system:
 * - GridGeometry: x = gridX, y = gridY
 * - HexGeometry: x = q, y = r (axial)
 * 
 * This allows polymorphic code that works with any geometry type.
 */
export interface IGeometry {
  // ===========================================
  // Coordinate Conversions
  // ===========================================
  
  /**
   * Convert world pixel coordinates to grid coordinates
   * @returns Point where x/y are in the geometry's native system
   */
  worldToGrid(worldX: number, worldY: number): Point;
  
  /**
   * Convert grid coordinates to world pixel coordinates
   * @param x Grid coordinate (gridX or q)
   * @param y Grid coordinate (gridY or r)
   */
  gridToWorld(x: number, y: number): WorldCoords;
  
  /**
   * Convert grid coordinates to screen coordinates (applies pan/zoom)
   */
  gridToScreen(
    x: number, 
    y: number, 
    offsetX: number, 
    offsetY: number, 
    zoom: number
  ): ScreenCoords;
  
  /**
   * Convert world coordinates to screen coordinates
   * Concrete implementation in BaseGeometry (shared by all)
   */
  worldToScreen(
    worldX: number,
    worldY: number,
    offsetX: number,
    offsetY: number,
    zoom: number
  ): ScreenCoords;
  
  /**
   * Convert screen coordinates to world coordinates
   * Concrete implementation in BaseGeometry (shared by all)
   */
  screenToWorld(
    screenX: number,
    screenY: number,
    zoom: number
  ): WorldCoords;
  
  // ===========================================
  // Cell Operations
  // ===========================================
  
  /**
   * Get the cell/hex size scaled by zoom level
   */
  getScaledCellSize(zoom: number): number;
  
  /**
   * Create a cell object from coordinates and color
   */
  createCellObject(coords: Point, color: string): Cell;
  
  /**
   * Check if a cell matches given coordinates
   */
  cellMatchesCoords(cell: Cell, coords: Point): boolean;
  
  // ===========================================
  // Shape Queries (cells within area)
  // ===========================================
  
  /**
   * Get all cells within a rectangular area
   */
  getCellsInRectangle(x1: number, y1: number, x2: number, y2: number): Point[];
  
  /**
   * Get all cells within a circular area
   * @param radius Radius in cells (not pixels)
   */
  getCellsInCircle(centerX: number, centerY: number, radius: number): Point[];
  
  /**
   * Get all cells along a line between two points
   */
  getCellsInLine(x1: number, y1: number, x2: number, y2: number): Point[];
  
  // ===========================================
  // Distance Calculations
  // ===========================================
  
  /**
   * Euclidean (straight-line) distance between cells
   */
  getEuclideanDistance(x1: number, y1: number, x2: number, y2: number): number;
  
  /**
   * Manhattan distance (orthogonal moves only)
   */
  getManhattanDistance(x1: number, y1: number, x2: number, y2: number): number;
  
  /**
   * Game distance with configurable diagonal rules
   * For hex, options are ignored (hex has no diagonal ambiguity)
   */
  getCellDistance(
    x1: number, 
    y1: number, 
    x2: number, 
    y2: number, 
    options?: DistanceOptions
  ): number;
  
  // ===========================================
  // Neighbors and Bounds
  // ===========================================
  
  /**
   * Get all neighboring cells
   */
  getNeighbors(x: number, y: number): Point[];
  
  /**
   * Check if coordinates are within geometry bounds
   */
  isWithinBounds(x: number, y: number): boolean;
  
  /**
   * Clamp coordinates to geometry bounds
   */
  clampToBounds(x: number, y: number): Point;
  
  /**
   * Check if this geometry has defined bounds
   */
  isBounded(): boolean;
  
  /**
   * Get bounds (null if unbounded)
   */
  getBounds(): GridBounds | null;
  
  // ===========================================
  // Offset Coordinate Support
  // ===========================================
  
  /**
   * Convert grid coordinates to offset (col, row) for array storage
   * Grid: passthrough (x=col, y=row)
   * Hex: axial to offset conversion
   */
  toOffsetCoords(gridX: number, gridY: number): OffsetCoords;
  
  /**
   * Convert a cell to offset coordinates
   */
  cellToOffsetCoords(cell: Cell): OffsetCoords;
  
  // ===========================================
  // Rendering
  // ===========================================
  
  /**
   * Draw grid lines on canvas
   */
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle
  ): void;
  
  // ===========================================
  // Utility
  // ===========================================
  
  /**
   * Apply iOS-safe stroke style and execute callback
   * Protects against iOS canvas state corruption during memory pressure
   */
  withStrokeStyle(
    ctx: CanvasRenderingContext2D,
    style: StrokeStyle,
    callback: () => void
  ): void;
}