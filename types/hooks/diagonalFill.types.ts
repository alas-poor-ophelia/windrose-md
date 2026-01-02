/**
 * Diagonal Fill Hook Type Definitions
 * Path: types/hooks/diagonalFill.types.ts
 *
 * Types for useDiagonalFill hook - fills concave corners along diagonal paths.
 */

import type { Point } from '../core/geometry.types';
import type { ToolId } from '../tools/tool.types';

// ===========================================
// Corner Types
// ===========================================

/** Corner position identifiers */
export type CornerName = 'TL' | 'TR' | 'BR' | 'BL';

// ===========================================
// Fill State
// ===========================================

/** Start point with corner information */
export interface DiagonalFillStart {
  x: number;
  y: number;
  corner: CornerName;
}

/** End point for diagonal fill */
export interface DiagonalFillEnd {
  x: number;
  y: number;
}

/** Preview end point for hover display */
export interface DiagonalFillPreview {
  x: number;
  y: number;
}

// ===========================================
// Screen Position
// ===========================================

/** Screen position for overlay rendering */
export interface ScreenPosition {
  x: number;
  y: number;
}

// ===========================================
// View State (for position calculation)
// ===========================================

/** View state for corner position calculations */
export interface DiagonalFillViewState {
  zoom: number;
  center: Point;
}

// ===========================================
// Hook Return Type
// ===========================================

/** Return type for useDiagonalFill hook */
export interface UseDiagonalFillResult {
  // State
  fillStart: DiagonalFillStart | null;
  fillEnd: DiagonalFillEnd | null;
  isEndLocked: boolean;
  previewEnd: DiagonalFillPreview | null;

  // Handlers
  handleDiagonalFillClick: (e: PointerEvent | MouseEvent | TouchEvent, isTouch?: boolean) => boolean;
  handleDiagonalFillMove: (e: PointerEvent | MouseEvent) => void;
  executeFill: () => void;
  cancelFill: () => void;

  // Utilities
  getCornerScreenPosition: (
    cellX: number,
    cellY: number,
    corner: CornerName,
    viewState: DiagonalFillViewState,
    canvasWidth: number,
    canvasHeight: number
  ) => ScreenPosition;
  resetState: () => void;
}
