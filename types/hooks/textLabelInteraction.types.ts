/**
 * Text Label Interaction Hook Type Definitions
 * Path: types/hooks/textLabelInteraction.types.ts
 *
 * Types for useTextLabelInteraction hook - manages text label placement,
 * selection, dragging, rotation, deletion, and editing.
 */

import type { TextLabelId } from '../objects/note.types';

// ===========================================
// Position Types
// ===========================================

/** Pending text position for placement */
export interface PendingTextPosition {
  x: number;
  y: number;
}

/** Button position on screen */
export interface TextButtonPosition {
  x: number;
  y: number;
}

/** Drag start state for text labels */
export interface TextDragStart {
  x: number;
  y: number;
  worldX: number;
  worldY: number;
}

// ===========================================
// Label Data Types
// ===========================================

/** Label data from modal submission */
export interface TextLabelModalData {
  content: string;
  fontSize: number;
  fontFace: string;
  color: string;
}

// ===========================================
// Handler Functions
// ===========================================

/** Text placement handler */
export type HandleTextPlacement = (clientX: number, clientY: number) => boolean;

/** Text selection handler */
export type HandleTextSelection = (clientX: number, clientY: number) => boolean;

/** Text dragging handler */
export type HandleTextDragging = (e: PointerEvent | MouseEvent | TouchEvent) => boolean;

/** Stop text dragging handler */
export type StopTextDragging = () => boolean;

/** Text rotation handler */
export type HandleTextRotation = () => void;

/** Text deletion handler */
export type HandleTextDeletion = () => void;

/** Text keyboard handler */
export type HandleTextKeyDown = (e: KeyboardEvent) => boolean;

/** Text modal submit handler */
export type HandleTextSubmit = (labelData: TextLabelModalData) => void;

/** Text modal cancel handler */
export type HandleTextCancel = () => void;

/** Rotate button click handler */
export type HandleRotateClick = (e: MouseEvent) => void;

/** Edit button click handler */
export type HandleEditClick = (e: MouseEvent) => void;

/** Canvas double-click handler */
export type HandleCanvasDoubleClick = (e: MouseEvent) => void;

// ===========================================
// Button Position Calculators
// ===========================================

/** Calculate button position */
export type CalculateTextButtonPosition = () => TextButtonPosition;

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useTextLabelInteraction hook */
export interface UseTextLabelInteractionResult {
  // State
  showTextModal: boolean;
  editingTextId: TextLabelId | null;

  // Handlers
  handleTextPlacement: HandleTextPlacement;
  handleTextSelection: HandleTextSelection;
  handleTextDragging: HandleTextDragging;
  stopTextDragging: StopTextDragging;
  handleTextRotation: HandleTextRotation;
  handleTextDeletion: HandleTextDeletion;
  handleTextKeyDown: HandleTextKeyDown;
  handleTextSubmit: HandleTextSubmit;
  handleTextCancel: HandleTextCancel;
  handleRotateClick: HandleRotateClick;
  handleEditClick: HandleEditClick;
  handleCanvasDoubleClick: HandleCanvasDoubleClick;

  // Position calculators
  calculateRotateButtonPosition: CalculateTextButtonPosition;
  calculateEditButtonPosition: CalculateTextButtonPosition;
}
