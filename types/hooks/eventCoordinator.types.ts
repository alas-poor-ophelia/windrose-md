/**
 * Event Coordinator Hook Type Definitions
 * Path: types/hooks/eventCoordinator.types.ts
 *
 * Types for useEventCoordinator hook - coordinates pointer events
 * across all canvas interaction layers.
 */

import type { Point } from '../core/geometry.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useEventCoordinator hook */
export interface UseEventCoordinatorOptions {
  canvasRef?: { current: HTMLCanvasElement | null };
  isColorPickerOpen: boolean;
  showObjectColorPicker?: boolean;
  isAlignmentMode?: boolean;
}

// ===========================================
// Synthetic Event Type
// ===========================================

/** Synthetic event for delayed touch handling */
export interface SyntheticPointerEvent {
  type: string;
  clientX: number;
  clientY: number;
  button: number;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: EventTarget | null;
}

// ===========================================
// Pending Tool Action
// ===========================================

/** Pending tool action for touch delay */
export interface PendingToolAction {
  execute: () => void;
}

// ===========================================
// Pan Start Position
// ===========================================

/** Position for click vs drag detection */
export interface PanStartPosition {
  x: number;
  y: number;
}

// ===========================================
// Area Select Pending
// ===========================================

/** Pending area select start for click detection */
export interface AreaSelectPending {
  clientX: number;
  clientY: number;
  syntheticEvent: SyntheticPointerEvent;
}

// ===========================================
// Handler Collections
// ===========================================

/** Drawing layer handlers (registered with event coordinator) */
export interface RegisteredDrawingHandlers {
  handleDrawingPointerDown?: (e: Event | SyntheticPointerEvent, gridX: number, gridY: number, isTouchEvent: boolean) => boolean;
  handleDrawingPointerMove?: (e: Event) => boolean;
  stopDrawing?: (e?: Event) => void;
  cancelDrawing?: () => void;
  isDrawing?: boolean;
  previewEnabled?: boolean;
  updateShapeHover?: (gridX: number, gridY: number) => void;
  updateEdgeLineHover?: (intX: number, intY: number) => void;
  updateSegmentHover?: (cellX: number, cellY: number, localX: number, localY: number) => void;
  circleStart?: Point | null;
  rectangleStart?: Point | null;
  edgeLineStart?: Point | null;
  cancelShapePreview?: () => void;
}

/** Object layer handlers */
export interface ObjectHandlers {
  handleObjectSelection?: (clientX: number, clientY: number, gridX: number, gridY: number) => boolean;
  handleObjectPlacement?: (gridX: number, gridY: number, clientX: number, clientY: number) => void;
  handleObjectDragging?: (e: Event) => void;
  stopObjectDragging?: () => void;
  handleObjectResizing?: (e: Event) => void;
  stopObjectResizing?: () => void;
  handleHoverUpdate?: (e: Event) => void;
  handleObjectWheel?: (e: WheelEvent) => boolean;
  handleObjectKeyDown?: (e: KeyboardEvent) => boolean;
  isResizing?: boolean;
  edgeSnapMode?: boolean;
  setEdgeSnapMode?: (value: boolean) => void;
}

/** Text layer handlers */
export interface TextHandlers {
  handleTextSelection?: (clientX: number, clientY: number) => boolean;
  handleTextPlacement?: (clientX: number, clientY: number) => void;
  handleTextDragging?: (e: Event) => void;
  stopTextDragging?: () => void;
  handleCanvasDoubleClick?: (e: MouseEvent) => void;
  handleTextKeyDown?: (e: KeyboardEvent) => boolean;
}

/** Note pin handlers */
export interface NotePinHandlers {
  handleNotePinPlacement?: (gridX: number, gridY: number) => boolean;
}

/** Pan/zoom handlers */
export interface PanZoomHandlers {
  getClientCoords: (e: Event) => { clientX: number; clientY: number };
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld?: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  lastTouchTimeRef: { current: number };
  getTouchCenter: (touches: TouchList) => { x: number; y: number } | null;
  getTouchDistance: (touches: TouchList) => number | null;
  startPan: (clientX: number, clientY: number) => void;
  updatePan: (clientX: number, clientY: number) => void;
  stopPan: () => void;
  startTouchPan: (center: { x: number; y: number }) => void;
  updateTouchPan: (touches: TouchList) => void;
  stopTouchPan: () => void;
  setInitialPinchDistance: (distance: number) => void;
  spaceKeyPressed: boolean;
  isPanning: boolean;
  isTouchPanning: boolean;
  isTouchPanningRef: { current: boolean };
  touchPanStartRef: { current: { x: number; y: number } | null };
  initialPinchDistanceRef: { current: number | null };
  panStart: PanStartPosition | null;
  touchPanStart: { x: number; y: number } | null;
  handleWheel: (e: WheelEvent) => void;
}

/** Measure tool handlers */
export interface MeasureHandlers {
  handleMeasureClick?: (gridX: number, gridY: number, isTouch: boolean) => void;
  handleMeasureMove?: (gridX: number, gridY: number) => void;
}

/** Image alignment handlers */
export interface AlignmentHandlers {
  handlePointerDown?: (e: Event | SyntheticPointerEvent) => void;
  handlePointerMove?: (e: Event) => void;
  handlePointerUp?: (e: Event) => void;
}

/** Fog of war handlers */
export interface FogHandlers {
  handlePointerDown?: (e: Event | SyntheticPointerEvent) => void;
  handlePointerMove?: (e: Event) => void;
  handlePointerUp?: (e: Event) => void;
}

/** Area select handlers */
export interface AreaSelectHandlers {
  areaSelectStart?: Point | null;
  handleAreaSelectClick?: (e: Event | SyntheticPointerEvent) => void;
  updateAreaSelectHover?: (gridX: number, gridY: number) => void;
}

/** Diagonal fill handlers */
export interface DiagonalFillHandlers {
  handleDiagonalFillClick?: (e: PointerEvent | MouseEvent | TouchEvent, isTouch?: boolean) => boolean;
  handleDiagonalFillMove?: (e: PointerEvent | MouseEvent) => void;
  cancelFill?: () => void;
  fillStart?: { x: number; y: number; corner: string } | null;
}

// ===========================================
// Handler Registry
// ===========================================

/** Map of handler layer names to handler objects */
export type HandlerLayerName =
  | 'drawing'
  | 'object'
  | 'text'
  | 'notePin'
  | 'panZoom'
  | 'measure'
  | 'imageAlignment'
  | 'fogOfWar'
  | 'areaSelect'
  | 'diagonalFill';

/** Handler type mapping for each layer */
export interface HandlerTypeMap {
  drawing: RegisteredDrawingHandlers;
  object: ObjectHandlers;
  text: TextHandlers;
  notePin: NotePinHandlers;
  panZoom: PanZoomHandlers;
  measure: MeasureHandlers;
  imageAlignment: AlignmentHandlers;
  fogOfWar: FogHandlers;
  areaSelect: AreaSelectHandlers;
  diagonalFill: DiagonalFillHandlers;
}

/** Type-safe handler getter function */
export type GetHandlers = <T extends HandlerLayerName>(layer: T) => HandlerTypeMap[T];
