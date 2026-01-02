/**
 * Drawing Tools Hook Type Definitions
 * Path: types/hooks/drawingTools.types.ts
 *
 * Types for useDrawingTools hook - manages paint, rectangle, circle,
 * clear area, edge paint, and segment paint tools.
 */

import type { Point } from '../core/geometry.types';
import type { Cell, SegmentName } from '../core/cell.types';
import type { ToolId } from '../tools/tool.types';

// ===========================================
// Preview Settings
// ===========================================

/** Shape preview settings for KBM and touch modes */
export interface PreviewSettings {
  /** Enable hover preview for keyboard/mouse */
  kbmEnabled: boolean;
  /** Enable 3-tap confirmation for touch */
  touchEnabled: boolean;
}

// ===========================================
// Shape State Types
// ===========================================

/** Start point for rectangle or circle shapes */
export interface ShapeStart {
  x: number;
  y: number;
}

/** Alias for rectangle start point */
export type RectangleStart = ShapeStart;

/** Alias for circle start point (center) */
export type CircleStart = ShapeStart;

/** Start point for edge line tool */
export type EdgeLineStart = ShapeStart;

/** Pending end point for touch confirmation */
export type PendingEndPoint = ShapeStart;

/** Shape hover position during preview */
export type ShapeHoverPosition = ShapeStart | null;

// ===========================================
// Segment State Types
// ===========================================

/** Cell coordinates for segment picker */
export interface SegmentPickerCell {
  x: number;
  y: number;
}

/** Segment hover info for desktop preview */
export interface SegmentHoverInfo {
  cellX: number;
  cellY: number;
  segment: SegmentName;
}

// ===========================================
// Drag Start Context
// ===========================================

/** Client coordinates for drag operations */
export interface DragStartContext {
  clientX: number;
  clientY: number;
}

// ===========================================
// Drawing State Values
// ===========================================

/** Core drawing state values */
export interface DrawingStateValues {
  isDrawing: boolean;
  rectangleStart: RectangleStart | null;
  circleStart: CircleStart | null;
  edgeLineStart: EdgeLineStart | null;
}

/** Shape preview state values */
export interface ShapePreviewValues {
  shapeHoverPosition: ShapeHoverPosition;
  touchConfirmPending: boolean;
  pendingEndPoint: PendingEndPoint | null;
}

/** Segment picker state values */
export interface SegmentPickerValues {
  segmentPickerOpen: boolean;
  segmentPickerCell: SegmentPickerCell | null;
  segmentPickerExistingCell: Cell | null;
  savedSegments: SegmentName[];
  rememberSegments: boolean;
}

/** Segment hover state (desktop preview) */
export interface SegmentHoverValues {
  segmentHoverInfo: SegmentHoverInfo | null;
}

// ===========================================
// Cell Operations
// ===========================================

/** Cell operation functions */
export interface CellOperations {
  toggleCell: (coords: Point, shouldFill: boolean, dragStart?: DragStartContext | null) => void;
  fillRectangle: (x1: number, y1: number, x2: number, y2: number) => void;
  fillCircle: (edgeX: number, edgeY: number, centerX: number, centerY: number) => void;
  clearRectangle: (x1: number, y1: number, x2: number, y2: number) => void;
  processCellDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  startDrawing: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  stopDrawing: () => void;
}

// ===========================================
// Edge Operations
// ===========================================

/** Edge operation functions */
export interface EdgeOperations {
  toggleEdge: (worldX: number, worldY: number, shouldPaint: boolean) => void;
  processEdgeDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  startEdgeDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  stopEdgeDrawing: () => void;
  fillEdgeLine: (x1: number, y1: number, x2: number, y2: number) => void;
}

// ===========================================
// Segment Operations
// ===========================================

/** Segment drawing functions */
export interface SegmentDrawOperations {
  toggleSegment: (worldX: number, worldY: number) => void;
  processSegmentDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  startSegmentDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  stopSegmentDrawing: () => void;
}

/** Segment picker functions */
export interface SegmentPickerOperations {
  openSegmentPicker: (cellX: number, cellY: number) => void;
  closeSegmentPicker: () => void;
  applySegmentSelection: (selectedSegments: SegmentName[], shouldRemember?: boolean) => void;
}

// ===========================================
// Handler Functions
// ===========================================

/** Event handler functions */
export interface DrawingHandlers {
  handleDrawingPointerDown: (
    e: PointerEvent | MouseEvent | TouchEvent,
    gridX: number,
    gridY: number,
    isTouchEvent?: boolean
  ) => boolean;
  handleDrawingPointerMove: (
    e: PointerEvent | MouseEvent | TouchEvent,
    dragStart?: DragStartContext | null
  ) => boolean;
  cancelDrawing: () => void;
  resetDrawingState: () => void;
}

// ===========================================
// Shape Preview Functions
// ===========================================

/** Shape preview functions */
export interface ShapePreviewOperations {
  updateShapeHover: (gridX: number, gridY: number) => void;
  updateEdgeLineHover: (intX: number, intY: number) => void;
  isPointInShapeBounds: (x: number, y: number) => boolean;
  confirmTouchShape: () => void;
  cancelShapePreview: () => void;
}

/** Segment hover functions */
export interface SegmentHoverOperations {
  updateSegmentHover: (cellX: number, cellY: number, localX: number, localY: number) => void;
  clearSegmentHover: () => void;
}

// ===========================================
// State Setters
// ===========================================

/** Direct state setter functions (for advanced use) */
export interface DrawingStateSetters {
  setIsDrawing: React.Dispatch<React.SetStateAction<boolean>>;
  setProcessedCells: React.Dispatch<React.SetStateAction<Set<string>>>;
  setProcessedEdges: React.Dispatch<React.SetStateAction<Set<string>>>;
  setProcessedSegments: React.Dispatch<React.SetStateAction<Set<string>>>;
  setRectangleStart: React.Dispatch<React.SetStateAction<RectangleStart | null>>;
  setCircleStart: React.Dispatch<React.SetStateAction<CircleStart | null>>;
  setEdgeLineStart: React.Dispatch<React.SetStateAction<EdgeLineStart | null>>;
  setShapeHoverPosition: React.Dispatch<React.SetStateAction<ShapeHoverPosition>>;
  setTouchConfirmPending: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingEndPoint: React.Dispatch<React.SetStateAction<PendingEndPoint | null>>;
}

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useDrawingTools hook */
export interface UseDrawingToolsResult extends
  DrawingStateValues,
  ShapePreviewValues,
  SegmentPickerValues,
  SegmentHoverValues,
  CellOperations,
  EdgeOperations,
  SegmentDrawOperations,
  SegmentPickerOperations,
  DrawingHandlers,
  ShapePreviewOperations,
  SegmentHoverOperations,
  DrawingStateSetters {}
