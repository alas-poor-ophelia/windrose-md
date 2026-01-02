/**
 * Image Alignment Hook Type Definitions
 * Path: types/hooks/imageAlignment.types.ts
 *
 * Types for useImageAlignment hook - handles interactive background
 * image alignment with drag-to-position functionality.
 */

import type { MapData } from '../core/map.types';
import type { IGeometry } from '../core/geometry.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useImageAlignment hook */
export interface UseImageAlignmentOptions {
  mapData: MapData | null;
  geometry: IGeometry | null;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  isAlignmentMode: boolean;
  imageOffsetX: number;
  imageOffsetY: number;
  onOffsetChange: (x: number, y: number) => void;
}

// ===========================================
// Drag State Types
// ===========================================

/** Offset position */
export interface DragOffset {
  x: number;
  y: number;
}

/** Client position */
export interface DragClientPosition {
  x: number;
  y: number;
}

// ===========================================
// Handler Result
// ===========================================

/** Result from handler indicating if event was handled */
export interface ImageDragHandlerResult {
  handled: boolean;
}

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useImageAlignment hook */
export interface UseImageAlignmentResult {
  isDraggingImage: boolean;
}
