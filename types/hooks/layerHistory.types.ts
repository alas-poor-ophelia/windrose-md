/**
 * Layer History Hook Type Definitions
 * Path: types/hooks/layerHistory.types.ts
 *
 * Types for useLayerHistory hook - manages per-layer undo/redo history
 * with layer switching support and history caching.
 */

import type { Cell } from '../core/cell.types';
import type { Curve } from '../core/curve.types';
import type { Edge, TextLabel, MapObjectRef, MapData, LayerId, Region } from '../core/map.types';
import type { HistoryState } from './history.types';

// ===========================================
// Layer History State
// ===========================================

/**
 * Snapshot of layer-specific data tracked in history.
 * Represents the undoable state for a single layer.
 */
export interface LayerHistorySnapshot {
  /** Cell data for the layer */
  cells: Cell[];
  /** Freehand curves on the layer */
  curves: Curve[];
  /** Map name (stored at root, but tracked for undo) */
  name: string;
  /** Objects placed on the layer */
  objects: MapObjectRef[];
  /** Text labels on the layer */
  textLabels: TextLabel[];
  /** Painted edges on the layer */
  edges: Edge[];
  /** Regions (map-level, tracked for undo) */
  regions?: Region[];
}

/**
 * Per-layer history cache.
 * Maps layer IDs to their saved history states.
 */
export type LayerHistoryCache = Record<LayerId, HistoryState<LayerHistorySnapshot>>;

// ===========================================
// Hook Parameters
// ===========================================

/**
 * Options for useLayerHistory hook.
 */
export interface UseLayerHistoryOptions {
  /** Current map data */
  mapData: MapData | null;
  /** Function to update map data */
  updateMapData: (data: MapData) => void;
  /** Whether map data is still loading */
  isLoading: boolean;
  /** Incremented on sub-hex navigation to reset history */
  navigationVersion?: number;
}

// ===========================================
// Layer Actions
// ===========================================

/**
 * Grouped layer management actions.
 */
export interface LayerActions {
  /** Switch to a different layer */
  handleLayerSelect: (layerId: LayerId) => void;
  /** Add a new layer */
  handleLayerAdd: () => void;
  /** Delete a layer */
  handleLayerDelete: (layerId: LayerId) => void;
  /** Reorder layers */
  handleLayerReorder: (layerId: LayerId, newIndex: number) => void;
  /** Toggle show layer below for a layer */
  handleToggleShowLayerBelow: (layerId: LayerId) => void;
  /** Set layer below opacity for a layer */
  handleSetLayerBelowOpacity: (layerId: LayerId, opacity: number) => void;
  /** Update layer display (name and/or icon) */
  handleUpdateLayerDisplay: (layerId: LayerId, name: string, icon: string | null) => void;
}

// ===========================================
// History Actions
// ===========================================

/**
 * Grouped history management actions.
 */
export interface HistoryActions {
  /** Perform undo operation */
  handleUndo: () => void;
  /** Perform redo operation */
  handleRedo: () => void;
  /** Add state to history (for data change handlers) */
  addToHistory: (state: LayerHistorySnapshot) => void;
  /** Check if undo/redo is in progress */
  isApplyingHistory: () => boolean;
}

// ===========================================
// Hook Return Type
// ===========================================

/**
 * Return type for useLayerHistory hook.
 */
export interface UseLayerHistoryResult {
  // Grouped layer actions
  layerActions: LayerActions;

  // Direct layer action access
  handleLayerSelect: (layerId: LayerId) => void;
  handleLayerAdd: () => void;
  handleLayerDelete: (layerId: LayerId) => void;
  handleLayerReorder: (layerId: LayerId, newIndex: number) => void;
  handleToggleShowLayerBelow: (layerId: LayerId) => void;
  handleSetLayerBelowOpacity: (layerId: LayerId, opacity: number) => void;
  handleUpdateLayerDisplay: (layerId: LayerId, name: string, icon: string | null) => void;

  // History state
  canUndo: boolean;
  canRedo: boolean;

  // Grouped history actions
  historyActions: HistoryActions;

  // Direct history action access
  handleUndo: () => void;
  handleRedo: () => void;

  // For data change handlers
  addToHistory: (state: LayerHistorySnapshot) => void;
  isApplyingHistory: () => boolean;
}
