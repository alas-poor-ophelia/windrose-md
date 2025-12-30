/**
 * React Context Type Definitions
 * Path: types/contexts/context.types.ts
 * 
 * Context value shapes for MapSettingsContext, MapSelectionContext, etc.
 * Populated during Tier 6a (Context component) migration.
 */

import type { SettingsState, SettingsTabId } from '../settings/settings.types';
import type { SettingsAction } from '../settings/actions.types';
import type { ObjectId } from '../objects/object.types';
import type { GridCoords } from '../core/geometry.types';
import type { HexColor } from '../core/common.types';

// ===========================================
// MapSettingsContext
// ===========================================

/** MapSettingsContext value shape */
export interface MapSettingsContextValue {
  // State
  state: SettingsState;
  
  // Dispatch (raw)
  dispatch: (action: SettingsAction) => void;
  
  // Action helpers (typed wrappers around dispatch)
  setActiveTab: (tab: SettingsTabId) => void;
  setCellSize: (size: number) => void;
  setBackgroundColor: (color: HexColor) => void;
  setGridColor: (color: HexColor) => void;
  toggleGrid: () => void;
  toggleCoordinates: () => void;
  // ... more to be added
}

// ===========================================
// MapSelectionContext
// ===========================================

/** Selection types */
export type SelectionType = 'cell' | 'object' | 'text' | 'note' | 'area';

/** MapSelectionContext value shape */
export interface MapSelectionContextValue {
  // Selection state
  selectedCells: GridCoords[];
  selectedObjects: ObjectId[];
  selectionType: SelectionType | null;
  
  // Selection actions
  selectCell: (coords: GridCoords, additive?: boolean) => void;
  selectObject: (id: ObjectId, additive?: boolean) => void;
  selectArea: (start: GridCoords, end: GridCoords) => void;
  clearSelection: () => void;
  
  // Multi-select
  isMultiSelectMode: boolean;
  toggleMultiSelect: () => void;
}

// ===========================================
// EventHandlerContext
// ===========================================

/** EventHandlerContext value shape */
export interface EventHandlerContextValue {
  // Canvas event handlers
  handleCanvasClick: (e: MouseEvent) => void;
  handleCanvasMouseDown: (e: MouseEvent) => void;
  handleCanvasMouseMove: (e: MouseEvent) => void;
  handleCanvasMouseUp: (e: MouseEvent) => void;
  handleCanvasWheel: (e: WheelEvent) => void;
  
  // Touch handlers (for mobile)
  handleTouchStart: (e: TouchEvent) => void;
  handleTouchMove: (e: TouchEvent) => void;
  handleTouchEnd: (e: TouchEvent) => void;
  
  // Keyboard handlers
  handleKeyDown: (e: KeyboardEvent) => void;
  handleKeyUp: (e: KeyboardEvent) => void;
}

// ===========================================
// MapContext (Main)
// ===========================================

/**
 * Main MapContext value shape.
 * TODO: Define during MapContext.jsx migration.
 */
export interface MapContextValue {
  // Map data
  // mapData: MapData;
  
  // Geometry
  // geometry: IGeometry;
  
  // Refs
  // canvasRef: RefObject<HTMLCanvasElement>;
  
  // ... more to be added
}

// TODO: Expand all contexts during Tier 6a migration