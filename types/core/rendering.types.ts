/**
 * Rendering Type Definitions
 * Path: types/core/rendering.types.ts
 * 
 * Types shared across grid and hex renderers, and canvas rendering hooks.
 */

import type { Point, ScreenCoords, GridStyle } from './geometry.types';

// ===========================================
// Viewport State
// ===========================================

/** Viewport state for pan/zoom transforms */
export interface ViewState {
  x: number;      // Pan offset X
  y: number;      // Pan offset Y
  zoom: number;   // Zoom level
}

/** Canvas dimensions */
export interface CanvasDimensions {
  width: number;
  height: number;
}

// ===========================================
// Cell Rendering
// ===========================================

/** 
 * Cell data for rendering (grid coordinates).
 * Simplified from full Cell type - just what renderers need.
 */
export interface RenderCell {
  x: number;
  y: number;
  color: string;
  opacity?: number;
}

/**
 * Hex cell data for rendering (axial coordinates).
 */
export interface RenderHexCell {
  q: number;
  r: number;
  color: string;
  opacity?: number;
}

/** Cell lookup map type (keyed by "x,y" or "q,r" string) */
export type CellLookup<T = RenderCell> = Map<string, T>;

// ===========================================
// Edge Rendering
// ===========================================

/** 
 * Edge data for custom-colored grid lines.
 * Edges are stored normalized as 'right' or 'bottom' only.
 */
export interface Edge {
  x: number;
  y: number;
  side: 'right' | 'bottom';
  color: string;
  opacity?: number;
}

// ===========================================
// Style Options
// ===========================================

/** Style options for interior grid lines */
export interface InteriorGridStyle {
  lineColor?: string;
  lineWidth?: number;
  interiorRatio?: number;
}

/** Style options for edge rendering */
export interface EdgeStyle {
  lineWidth?: number;
  borderWidth?: number;
}

/** Theme configuration for cell borders */
export interface BorderTheme {
  border: string;
  borderWidth: number;
}

/** Border sides */
export type BorderSide = 'top' | 'right' | 'bottom' | 'left';

// ===========================================
// Callback Function Types
// ===========================================

/** Function type for building cell lookup */
export type BuildCellLookupFn<T = RenderCell> = (cells: T[]) => CellLookup<T>;

/** Function type for calculating which borders a cell needs */
export type CalculateBordersFn = (lookup: CellLookup, x: number, y: number) => BorderSide[];

// ===========================================
// Geometry Interfaces (Renderer Subsets)
// ===========================================

/**
 * GridGeometry interface - subset used by renderers.
 * Full interface is in GridGeometry.ts
 */
export interface IGridRenderer {
  cellSize: number;
  getScaledCellSize(zoom: number): number;
  gridToScreen(x: number, y: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle
  ): void;
  drawCells(
    ctx: CanvasRenderingContext2D,
    cells: Point[],
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void;
}

/**
 * HexGeometry interface - subset used by renderers.
 * Full interface is in HexGeometry.ts
 */
export interface IHexRenderer {
  hexSize: number;
  getScaledCellSize(zoom: number): number;
  gridToScreen(q: number, r: number, offsetX: number, offsetY: number, zoom: number): ScreenCoords;
  drawGrid(
    ctx: CanvasRenderingContext2D,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    zoom: number,
    style: GridStyle
  ): void;
  drawHex(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    color: string
  ): void;
  drawHexOutline(
    ctx: CanvasRenderingContext2D,
    q: number,
    r: number,
    offsetX: number,
    offsetY: number,
    zoom: number,
    lineWidth: number
  ): void;
}