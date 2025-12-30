/**
 * Geometry Type Definitions
 * Path: types/core/geometry.types.ts
 * 
 * Core coordinate and geometry types used throughout Windrose.
 * Populated during Phase 1 (Tier 1-2 migration).
 */

// ===========================================
// Basic Primitives
// ===========================================

/** Generic 2D point (pixel/world coordinates) */
export interface Point {
  x: number;
  y: number;
}

/** Bounding rectangle */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// ===========================================
// Grid Coordinates
// ===========================================

/** Grid cell coordinates (square grid) */
export interface GridCoords {
  gridX: number;
  gridY: number;
}

// ===========================================
// Hex Coordinates
// ===========================================

/** Axial hex coordinates */
export interface AxialCoords {
  q: number;
  r: number;
}

/** Offset hex coordinates (odd-q or odd-r) */
export interface OffsetCoords {
  col: number;
  row: number;
}

/** Cube hex coordinates (for algorithms) */
export interface CubeCoords {
  q: number;
  r: number;
  s: number;
}

// ===========================================
// Coordinate System Transforms
// ===========================================

/** Screen/canvas coordinates */
export interface ScreenCoords {
  screenX: number;
  screenY: number;
}

/** World coordinates (before pan/zoom) */
export interface WorldCoords {
  worldX: number;
  worldY: number;
}

// ===========================================
// Geometry Interface (Abstract)
// ===========================================

/**
 * IGeometry - Abstract interface for grid/hex geometry operations.
 * Implemented by GridGeometry and HexGeometry.
 * 
 * TODO: Fully define during Phase 1 Tier 2 migration.
 */
export interface IGeometry {
  readonly gridType: 'grid' | 'hex';
  
  // Core conversions (to be expanded)
  cellToWorld(coords: GridCoords | AxialCoords): Point;
  worldToCell(point: Point): GridCoords | AxialCoords;
  screenToWorld(screen: ScreenCoords, pan: Point, zoom: number): WorldCoords;
  worldToScreen(world: WorldCoords, pan: Point, zoom: number): ScreenCoords;
}