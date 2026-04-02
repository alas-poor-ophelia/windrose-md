/**
 * Object Interactions Hook Type Definitions
 * Path: types/hooks/objectInteractions.types.ts
 *
 * Types for useObjectInteractions hook - manages object placement,
 * selection, dragging, resizing, and UI interactions.
 */

import type { MapObject } from '../objects/object.types';

// ===========================================
// Resize Types
// ===========================================

/** Corner identifier for resize handles */
export type ResizeCorner = 'tl' | 'tr' | 'bl' | 'br' | null;

/** Initial state for resize operations */
export interface ResizeInitialState {
  objects: MapObject[];
}

// ===========================================
// Drag State Types
// ===========================================

/** Drag start state with object reference */
export interface ObjectDragStart {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  offsetX?: number;
  offsetY?: number;
  objectId?: string;
  object?: MapObject;
}

// ===========================================
// Button Position Types
// ===========================================

/** Screen position for UI buttons */
export interface ButtonPosition {
  x: number;
  y: number;
}

// ===========================================
// Mouse Position Types
// ===========================================

// MousePosition is canonical in contexts/context.types.ts
import type { MousePosition } from '../contexts/context.types';
export type { MousePosition };

// ===========================================
// State Values
// ===========================================

/** Object interaction state values */
export interface ObjectInteractionStateValues {
  isResizeMode: boolean;
  isResizing: boolean;
  resizeCorner: ResizeCorner;
  hoveredObject: MapObject | null;
  mousePosition: MousePosition | null;
  edgeSnapMode: boolean;
}

// ===========================================
// Refs
// ===========================================

/** Ref for object color button */
export interface ObjectColorBtnRef {
  current: HTMLButtonElement | null;
}

/** Ref for pending custom color */
export interface PendingObjectCustomColorRef {
  current: string | null;
}

/** Ref for long press timer */
export interface LongPressTimerRef {
  current: ReturnType<typeof setTimeout> | null;
}

// ===========================================
// Handler Functions
// ===========================================

/** Object placement handler */
export type HandleObjectPlacement = (
  gridX: number,
  gridY: number,
  clientX: number,
  clientY: number
) => boolean;

/** Object selection handler */
export type HandleObjectSelection = (
  clientX: number,
  clientY: number,
  gridX: number,
  gridY: number
) => boolean;

/** Object dragging handler */
export type HandleObjectDragging = (e: PointerEvent | MouseEvent | TouchEvent) => boolean;

/** Object resizing handler */
export type HandleObjectResizing = (e: PointerEvent | MouseEvent | TouchEvent) => boolean;

/** Object wheel handler for scaling */
export type HandleObjectWheel = (e: WheelEvent) => boolean;

/** Hover update handler */
export type HandleHoverUpdate = (e: PointerEvent | MouseEvent) => void;

/** Stop dragging handler */
export type StopObjectDragging = () => boolean;

/** Stop resizing handler */
export type StopObjectResizing = () => boolean;

/** Keyboard handler */
export type HandleObjectKeyDown = (e: KeyboardEvent) => boolean;

// ===========================================
// Button Position Calculators
// ===========================================

/** Button position calculator */
export type CalculateButtonPosition = () => ButtonPosition;

// ===========================================
// Modal Handlers
// ===========================================

/** Note submit handler */
export type HandleNoteSubmit = (content: string, editingObjectId: string) => void;

/** Object color select handler */
export type HandleObjectColorSelect = (color: string) => void;

/** Object color reset handler */
export type HandleObjectColorReset = (setShowObjectColorPicker: (show: boolean) => void) => void;

// ===========================================
// Utility Functions
// ===========================================

/** Get clicked corner function */
export type GetClickedCorner = (
  clientX: number,
  clientY: number,
  object: MapObject
) => ResizeCorner;

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useObjectInteractions hook */
export interface UseObjectInteractionsResult {
  // State
  isResizeMode: boolean;
  setIsResizeMode: React.Dispatch<React.SetStateAction<boolean>>;
  isResizing: boolean;
  resizeCorner: ResizeCorner;
  hoveredObject: MapObject | null;
  setHoveredObject: (obj: MapObject | null) => void;
  mousePosition: MousePosition | null;
  objectColorBtnRef: ObjectColorBtnRef;
  pendingObjectCustomColorRef: PendingObjectCustomColorRef;
  edgeSnapMode: boolean;
  setEdgeSnapMode: React.Dispatch<React.SetStateAction<boolean>>;
  longPressTimerRef: LongPressTimerRef;

  // Handlers
  handleObjectPlacement: HandleObjectPlacement;
  handleObjectSelection: HandleObjectSelection;
  handleObjectDragging: HandleObjectDragging;
  handleObjectResizing: HandleObjectResizing;
  handleObjectWheel: HandleObjectWheel;
  handleHoverUpdate: HandleHoverUpdate;
  stopObjectDragging: StopObjectDragging;
  stopObjectResizing: StopObjectResizing;
  handleObjectKeyDown: HandleObjectKeyDown;
  handleObjectRotation: () => void;
  handleObjectDeletion: () => void;
  handleObjectDuplicate: () => void;

  // Button position calculators
  calculateLabelButtonPosition: CalculateButtonPosition;
  calculateLinkNoteButtonPosition: CalculateButtonPosition;
  calculateResizeButtonPosition: CalculateButtonPosition;
  calculateObjectColorButtonPosition: CalculateButtonPosition;

  // Modal handlers
  handleNoteSubmit: HandleNoteSubmit;
  handleObjectColorSelect: HandleObjectColorSelect;
  handleObjectColorReset: HandleObjectColorReset;

  // Utility
  getClickedCorner: GetClickedCorner;
}
