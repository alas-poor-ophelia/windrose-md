/**
 * Group Drag Hook Type Definitions
 * Path: types/hooks/groupDrag.types.ts
 *
 * Types for useGroupDrag hook - manages group drag operations
 * for multi-selected objects and text labels.
 */

import type { Point } from '../core/geometry.types';
import type { MapObject } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';

// ===========================================
// Selected Item Types
// ===========================================

/** Represents a selected item (object or text label) */
export interface SelectedItem {
  type: 'object' | 'text';
  id: string;
}

// ===========================================
// Offset Types
// ===========================================

/** Offset data for a dragged item */
export interface DragOffset {
  type: 'object' | 'text';
  gridOffsetX: number;
  gridOffsetY: number;
  worldOffsetX: number;
  worldOffsetY: number;
}

/** Map of item IDs to their drag offsets */
export type DragOffsetsMap = Map<string, DragOffset>;

// ===========================================
// Initial State Types
// ===========================================

/** Initial state snapshot for batch history */
export interface GroupDragInitialState {
  objects: MapObject[];
  textLabels: TextLabel[];
}

// ===========================================
// Update Types
// ===========================================

/** Object position update during drag */
export interface ObjectDragUpdate {
  id: string;
  oldObj: MapObject;
  newPosition: Point;
}

/** Text label position update during drag */
export interface TextDragUpdate {
  id: string;
  oldLabel: TextLabel;
  newPosition: Point;
}

/** Combined position update for selected items sync */
export interface PositionUpdate {
  id: string;
  position: Point;
}

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useGroupDrag hook */
export interface UseGroupDragResult {
  /** Whether a group drag is currently active */
  isGroupDragging: boolean;

  /** Check if a click is on any selected item */
  getClickedSelectedItem: (
    gridX: number,
    gridY: number,
    worldX: number,
    worldY: number
  ) => SelectedItem | null;

  /** Start group drag operation */
  startGroupDrag: (
    clientX: number,
    clientY: number,
    gridX: number,
    gridY: number
  ) => boolean;

  /** Handle group drag movement */
  handleGroupDrag: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;

  /** Stop group drag and finalize history */
  stopGroupDrag: () => boolean;
}
