/**
 * Layer History Hook Type Definitions
 * Path: types/hooks/layerHistory.types.ts
 *
 * Types for useLayerHistory hook - per-layer undo/redo stacks of field
 * diffs (DATA-06): each entry records only the fields one edit changed, so
 * undo never rewrites map-wide fields or fog that other edits own.
 */

import type { Cell } from '../core/cell.types';
import type { Curve } from '../core/curve.types';
import type { WallPath } from '../core/wallpath.types';
import type { TerrainStroke } from '../core/terrainstroke.types';
import type { Edge, TextLabel, MapData, LayerId, Region, ShapeOverlay, Outline, FogOfWar, PartyPin, SavedRoute, LadderConfig } from '../core/map.types';
import type { MapObject } from '../objects/object.types';
import type { TileAssignment } from '../tiles/tile.types';
import type { FieldDiff, HistoryStack } from './history.types';
import type { MapDataUpdater } from './mapData.types';

// ===========================================
// Layer History State
// ===========================================

/**
 * Post-edit snapshot handed to addToHistory by data handlers. Fields left
 * undefined are "not provided" and never enter the diff; provided fields are
 * diffed against the last known values, and only changed ones are recorded.
 */
export interface LayerHistorySnapshot {
  /** Cell data for the layer */
  cells: Cell[];
  /** Freehand curves on the layer */
  curves: Curve[];
  /** Map name (stored at root, but tracked for undo) */
  name: string;
  /** Objects placed on the layer */
  objects: MapObject[];
  /** Text labels on the layer */
  textLabels: TextLabel[];
  /** Painted edges on the layer */
  edges: Edge[];
  /** Tile assignments on the layer */
  tiles?: TileAssignment[];
  /** Wall/path strips on the layer */
  wallPaths?: WallPath[];
  /** Terrain brush strokes on the layer */
  terrainStrokes?: TerrainStroke[];
  /** Regions (map-level, tracked for undo) */
  regions?: Region[];
  /** Polygon outlines (map-level, tracked for undo) */
  outlines?: Outline[];
  /** Shape overlays (map-level, tracked for undo) */
  shapeOverlays?: ShapeOverlay[];
  /** Party pins (map-level, tracked for undo) */
  partyPins?: PartyPin[];
  /** Saved measurement routes (map-level, tracked for undo) */
  savedRoutes?: SavedRoute[];
  /** Fog of war state (layer-level, tracked for compound undo with player moves) */
  fogOfWar?: FogOfWar | null;
  /**
   * Ladder rungs >= 1 of the layer, by reference (design 06 s5). Present ONLY
   * when the layer has `levels`; never `levels: undefined`. Undo/redo restores
   * this whole record.
   */
  levels?: Record<number, Cell[]>;
  /** Rung the entry edited. UI/telemetry only; never selects what to restore. */
  level?: number;
  /**
   * Set ONLY on the entry whose deep write stamped `lod` onto a previously
   * classic map (the first rung write). Undoing past this entry strips `lod`
   * again; redoing onto it puts this block back. Absent everywhere else.
   */
  lodStamped?: LadderConfig;
}

/** Snapshot keys that live on the layer (restored onto the entry's layer). */
export type LayerHistoryLayerKey =
  'cells' | 'curves' | 'objects' | 'textLabels' | 'edges' | 'tiles' | 'wallPaths' | 'terrainStrokes' | 'fogOfWar' | 'levels';

/** Snapshot keys that live on the map root (map-wide). */
export type LayerHistoryMapKey = 'name' | 'regions' | 'outlines' | 'shapeOverlays' | 'partyPins' | 'savedRoutes';

export type LayerHistoryLayerValues = Pick<LayerHistorySnapshot, LayerHistoryLayerKey>;
export type LayerHistoryMapValues = Pick<LayerHistorySnapshot, LayerHistoryMapKey>;

/**
 * One undoable edit: the layer it was made on, plus before/after values of
 * only the layer fields and map-wide fields it changed.
 */
export interface LayerHistoryEntry {
  layerId: LayerId;
  layer: FieldDiff<LayerHistoryLayerValues>;
  map: FieldDiff<LayerHistoryMapValues>;
  /** Consecutive entries with the same key pushed close together merge (fog brush strokes). */
  coalesceKey?: string;
  /** Push time (ms), for coalescing. */
  time: number;
  /** Ladder rung the edit was made on (from the snapshot's `level`); undo/redo bring the camera there. */
  level?: number;
  /** The `lod` block this entry's deep write stamped (snapshot `lodStamped`); undo lifts it, redo restores it. */
  lodStamped?: LadderConfig;
}

/** Undo stacks keyed by layer id (one map level; cleared on sub-hex navigation). */
export type LayerHistoryStacks = Record<LayerId, HistoryStack<LayerHistoryEntry>>;

/** Options for recordMapChange. */
/**
 * Options for addToHistory. `transient` marks a live, uncommitted write (a
 * drag move made with suppressHistory): nothing is recorded, but the fields it
 * changes keep their pre-write values as the baseline for the next committed
 * snapshot, so the commit at drop records the whole gesture as one step.
 */
export interface AddToHistoryOptions {
  transient?: boolean;
}

export interface RecordMapChangeOptions {
  /** Merge with the previous entry when it has the same key and was pushed recently. */
  coalesceKey?: string;
}

// ===========================================
// Hook Parameters
// ===========================================

/**
 * Options for useLayerHistory hook.
 */
export interface UseLayerHistoryOptions {
  /** Current map data */
  mapData: MapData | null;
  /** Function to update map data (functional updates are used for undo/redo) */
  updateMapData: MapDataUpdater;
  /** Whether map data is still loading */
  isLoading: boolean;
  /** Incremented on sub-hex navigation; history is cleared per level */
  navigationVersion?: number;
  /** Identity of the open sub-hex level (path string, null at root); a change clears history */
  levelKey?: string | null;
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
  /** Clone a layer ('all' = full clone, 'mapOnly' = terrain only) */
  handleLayerClone: (layerId: LayerId, mode: 'all' | 'mapOnly') => void;
}

// ===========================================
// History Actions
// ===========================================

/**
 * Grouped history management actions.
 */
export interface HistoryActions {
  /** Perform undo; returns whether the map changed (a dead entry is dropped, not spent) */
  handleUndo: () => boolean;
  /** Perform redo; returns whether the map changed */
  handleRedo: () => boolean;
  /** Add state to history (for data change handlers) */
  addToHistory: (state: LayerHistorySnapshot, options?: AddToHistoryOptions) => void;
  /** Record a prev -> next map transition (diffs the active layer + map-wide fields) */
  recordMapChange: (prev: MapData, next: MapData, options?: RecordMapChangeOptions) => void;
  /** Check if undo/redo is in progress */
  isApplyingHistory: () => boolean;
  /**
   * Drop every pre-drag baseline pinned by transient writes. Call when a
   * gesture ends or is cancelled without its commit, and at the pointer-down
   * that starts a new gesture, so an abandoned drag is never folded into the
   * next unrelated entry.
   */
  clearTransient: () => void;
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
  handleLayerClone: (layerId: LayerId, mode: 'all' | 'mapOnly') => void;

  // History state
  canUndo: boolean;
  canRedo: boolean;

  // Grouped history actions
  historyActions: HistoryActions;

  // Direct history action access (return: whether the map changed)
  handleUndo: () => boolean;
  handleRedo: () => boolean;

  // For data change handlers
  addToHistory: (state: LayerHistorySnapshot, options?: AddToHistoryOptions) => void;
  recordMapChange: (prev: MapData, next: MapData, options?: RecordMapChangeOptions) => void;
  isApplyingHistory: () => boolean;
  /** See HistoryActions.clearTransient. */
  clearTransient: () => void;
}
