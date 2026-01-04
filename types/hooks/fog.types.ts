/**
 * Fog of War Hook Type Definitions
 * Path: types/hooks/fog.types.ts
 *
 * Types for useFogOfWar and useFogTools hooks.
 * - useFogOfWar: High-level fog UI state and operations
 * - useFogTools: Canvas-level fog painting interactions
 */

import type { MapData, FogOfWar } from '../core/map.types';
import type { OffsetCoords, IGeometry } from '../core/geometry.types';

// ===========================================
// Fog Tool Types
// ===========================================

/** Available fog tools */
export type FogToolId = 'paint' | 'erase' | 'rectangle';

/** Cell position for rectangle operations */
export interface FogRectangleStart {
  col: number;
  row: number;
}

/** Cell position for tracking last painted cell */
export interface FogCellPosition {
  col: number;
  row: number;
}

// ===========================================
// useFogOfWar Types
// ===========================================

/**
 * Combined fog state for UI display.
 * Merges layer fog data with current UI state.
 */
export interface CurrentFogState {
  /** Whether fog has been initialized for this layer */
  initialized: boolean;
  /** Whether fog is currently visible */
  enabled: boolean;
  /** Number of fogged cells */
  cellCount?: number;
  /** Currently selected fog tool */
  activeTool: FogToolId | null;
}

/** Options for useFogOfWar hook */
export interface UseFogOfWarOptions {
  /** Current map data */
  mapData: MapData | null;
  /** Geometry instance for bounds checking */
  geometry: IGeometry | null;
  /** Function to update map data */
  updateMapData: (data: MapData) => void;
}

/** Grouped fog state values */
export interface FogStateValues {
  /** Whether fog tools panel is expanded */
  showFogTools: boolean;
  /** Currently selected fog tool */
  fogActiveTool: FogToolId | null;
  /** Combined fog state for UI */
  currentFogState: CurrentFogState;
}

/** Grouped fog actions */
export interface FogActions {
  /** Toggle fog tools panel visibility */
  handleFogToolsToggle: () => void;
  /** Select a fog tool */
  handleFogToolSelect: (tool: FogToolId) => void;
  /** Toggle fog visibility (show/hide) */
  handleFogVisibilityToggle: () => void;
  /** Fill all cells with fog */
  handleFogFillAll: () => void;
  /** Clear all fog */
  handleFogClearAll: () => void;
  /** Handle fog changes from FogOfWarLayer */
  handleFogChange: (updatedFogOfWar: FogOfWar) => void;
}

/** Return type for useFogOfWar hook */
export interface UseFogOfWarResult {
  // Grouped access
  fogState: FogStateValues;
  fogActions: FogActions;

  // Direct access (convenience)
  showFogTools: boolean;
  fogActiveTool: FogToolId | null;
  currentFogState: CurrentFogState;
  handleFogToolsToggle: () => void;
  handleFogToolSelect: (tool: FogToolId) => void;
  handleFogVisibilityToggle: () => void;
  handleFogFillAll: () => void;
  handleFogClearAll: () => void;
  handleFogChange: (updatedFogOfWar: FogOfWar) => void;
}

// ===========================================
// useFogTools Types
// ===========================================

/** Return type for useFogTools hook */
export interface UseFogToolsResult {
  // State
  /** Whether currently drawing (for paint/erase tools) */
  isDrawing: boolean;
  /** Start corner for rectangle tool (null if not started) */
  rectangleStart: FogRectangleStart | null;

  // Handlers for EventHandlerContext registration
  handlePointerDown: (e: PointerEvent | MouseEvent) => void;
  handlePointerMove: (e: PointerEvent | MouseEvent) => void;
  handlePointerUp: () => void;
  handleKeyDown: (e: KeyboardEvent) => void;

  /** Cancel any in-progress operation */
  cancelFog: () => void;

  /** Utility for preview rendering - converts screen coords to offset coords */
  screenToOffset: (clientX: number, clientY: number) => OffsetCoords | null;
}

/** Callback for fog changes */
export type OnFogChangeCallback = (updatedFogOfWar: FogOfWar) => void;

/** Callback for initializing fog */
export type OnInitializeFogCallback = (updatedMapData: MapData) => void;
