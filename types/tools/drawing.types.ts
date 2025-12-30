/**
 * Drawing Type Definitions
 * Path: types/tools/drawing.types.ts
 * 
 * Drawing state, shape modes, and brush configuration.
 * Populated during useDrawingTools.js migration.
 */

import type { Point, GridCoords } from '../core/geometry.types';
import type { HexColor, Opacity } from '../core/common.types';

// ===========================================
// Shape Modes
// ===========================================

/** Available shape drawing modes */
export type ShapeMode = 
  | 'rectangle'
  | 'filledRectangle'
  | 'circle'
  | 'filledCircle'
  | 'line';

// ===========================================
// Drawing State
// ===========================================

/** Active drawing operation state */
export interface DrawingState {
  isDrawing: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  startCell: GridCoords | null;
  previewCells: GridCoords[];
}

// ===========================================
// Brush Configuration
// ===========================================

/** Brush settings for painting */
export interface BrushConfig {
  color: HexColor;
  opacity: Opacity;
  size: number;
}

// ===========================================
// Shape Preview
// ===========================================

/** Shape being previewed before commit */
export interface ShapePreview {
  mode: ShapeMode;
  cells: GridCoords[];
  startCell: GridCoords;
  endCell: GridCoords;
}

// TODO: Expand during useDrawingTools.js migration