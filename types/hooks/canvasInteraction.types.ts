/**
 * Canvas Interaction Hook Type Definitions
 * Path: types/hooks/canvasInteraction.types.ts
 *
 * Types for useCanvasInteraction hook - handles pan, zoom,
 * and coordinate transformation for the canvas.
 */

import type { Point } from '../core/geometry.types';
import type { ViewState } from '../core/map.types';

// ===========================================
// Pan State Types
// ===========================================

/** Pan start state for mouse/space key panning */
export interface PanStart {
  x: number;
  y: number;
  centerX: number;
  centerY: number;
}

/** Touch pan center point */
export interface TouchCenter {
  x: number;
  y: number;
}

// ===========================================
// Coordinate Types
// ===========================================

/** Client coordinates from an event */
export interface ClientCoords {
  clientX: number;
  clientY: number;
}

/** World coordinates result */
export interface WorldCoords {
  worldX: number;
  worldY: number;
}

// ===========================================
// State Values
// ===========================================

/** Canvas interaction state values */
export interface CanvasInteractionStateValues {
  isPanning: boolean;
  isTouchPanning: boolean;
  panStart: PanStart | null;
  touchPanStart: TouchCenter | null;
  spaceKeyPressed: boolean;
  initialPinchDistance: number | null;
}

// ===========================================
// Coordinate Helper Functions
// ===========================================

/** Coordinate conversion functions */
export interface CoordinateHelpers {
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => ClientCoords;
  getTouchCenter: (touches: TouchList) => TouchCenter | null;
  getTouchDistance: (touches: TouchList) => number | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => WorldCoords | null;
}

// ===========================================
// Event Handlers
// ===========================================

/** Zoom handlers */
export interface ZoomHandlers {
  handleWheel: (e: WheelEvent) => void;
}

/** Pan handlers */
export interface PanHandlers {
  startPan: (clientX: number, clientY: number) => void;
  updatePan: (clientX: number, clientY: number) => void;
  stopPan: () => void;
  startTouchPan: (center: TouchCenter) => void;
  updateTouchPan: (touches: TouchList) => void;
  stopTouchPan: () => void;
}

// ===========================================
// State Setters
// ===========================================

/** Direct state setters for external control */
export interface CanvasInteractionSetters {
  setIsPanning: React.Dispatch<React.SetStateAction<boolean>>;
  setIsTouchPanning: React.Dispatch<React.SetStateAction<boolean>>;
  setPanStart: React.Dispatch<React.SetStateAction<PanStart | null>>;
  setTouchPanStart: React.Dispatch<React.SetStateAction<TouchCenter | null>>;
  setInitialPinchDistance: React.Dispatch<React.SetStateAction<number | null>>;
  setSpaceKeyPressed: React.Dispatch<React.SetStateAction<boolean>>;
}

// ===========================================
// Ref Types
// ===========================================

/** Ref for tracking last touch time */
export interface LastTouchTimeRef {
  current: number;
}

// ===========================================
// Callback Types
// ===========================================

/** View state change callback */
export type OnViewStateChangeCallback = (viewState: ViewState) => void;

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useCanvasInteraction hook */
export interface UseCanvasInteractionResult extends
  CanvasInteractionStateValues,
  CoordinateHelpers,
  ZoomHandlers,
  PanHandlers,
  CanvasInteractionSetters {
  lastTouchTimeRef: LastTouchTimeRef;
}
