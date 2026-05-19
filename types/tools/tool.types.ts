/**
 * Tool Type Definitions
 * Path: types/tools/tool.types.ts
 *
 * Tool state and selection types.
 * Populated during useToolState.js migration.
 */

import type { ObjectTypeId } from '../objects/object.types';
import type { MapData } from '../core/map.types';

// ===========================================
// Tool Identifiers
// ===========================================

/** Available tools in the palette */
export type ToolId =
  // Selection & Navigation
  | 'select'
  | 'areaSelect'
  // Drawing tools
  | 'draw'
  | 'freehand'
  | 'erase'
  | 'eyedropper'
  // Shape tools
  | 'rectangle'
  | 'circle'
  | 'clearArea'
  | 'diagonalFill'
  // Edge/segment tools
  | 'edgeDraw'
  | 'edgeErase'
  | 'edgeLine'
  | 'segmentDraw'
  // Object tools
  | 'addObject'
  | 'addText'
  | 'addNote'
  // Region tools (hex maps)
  | 'regionPaint'
  | 'regionBoundary'
  // Shape overlay tool
  | 'shape'
  // Tile tools (hex maps)
  | 'tilePaint'
  // Utility tools
  | 'measure'
  | 'fog'
  | 'fogErase';

// ===========================================
// Tool State
// ===========================================

/** Current tool state */
export interface ToolState {
  activeTool: ToolId;
  previousTool: ToolId | null;
  toolOptions: ToolOptions;
}

/** Tool-specific options */
export interface ToolOptions {
  brushSize: number;
  // Add more as discovered during migration
}

// ===========================================
// useToolState Hook Types
// ===========================================

/** Options for useToolState hook */
export interface UseToolStateOptions {
  initialTool?: ToolId;
  initialColor?: string;
  initialOpacity?: number;
  mapData?: MapData | null;
  updateMapData?: (data: MapData) => void;
}

/** Grouped tool state values */
export interface ToolStateValues {
  currentTool: ToolId;
  selectedObjectType: ObjectTypeId | null;
  selectedColor: string;
  selectedOpacity: number;
  isColorPickerOpen: boolean;
}

/** Grouped tool state actions */
export interface ToolStateActions {
  setCurrentTool: (tool: ToolId) => void;
  setSelectedObjectType: (type: ObjectTypeId | null) => void;
  setSelectedColor: (color: string) => void;
  setSelectedOpacity: (opacity: number) => void;
  setIsColorPickerOpen: (open: boolean) => void;
}

/** Return type for useToolState hook */
export interface UseToolStateResult {
  // Grouped state
  toolState: ToolStateValues;
  toolActions: ToolStateActions;

  // Direct access (convenience)
  currentTool: ToolId;
  selectedObjectType: ObjectTypeId | null;
  selectedColor: string;
  selectedOpacity: number;
  isColorPickerOpen: boolean;

  // Direct setters
  setCurrentTool: (tool: ToolId) => void;
  setSelectedObjectType: (type: ObjectTypeId | null) => void;
  setSelectedColor: (color: string) => void;
  setSelectedOpacity: (opacity: number) => void;
  setIsColorPickerOpen: (open: boolean) => void;

  // Freeform placement mode
  freeformPlacementMode: boolean;
  setFreeformPlacementMode: (mode: boolean | ((prev: boolean) => boolean)) => void;

  // Opacity persistence
  handleOpacityChange: (opacity: number) => void;
}

// ===========================================
// Tool Actions
// ===========================================

/** Tool switch action */
export interface ToolSwitchAction {
  type: 'SWITCH_TOOL';
  payload: {
    tool: ToolId;
    preservePrevious?: boolean;
  };
}