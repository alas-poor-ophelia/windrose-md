/**
 * Data Handlers Hook Type Definitions
 *
 * Types for useDataHandlers hook - manages data change handlers
 * for layer data and map-level data with history tracking.
 */

import type { MapData, StoredViewState, TextLabelSettings, Region } from '../core/map.types';
import type { Cell } from '../core/cell.types';
import type { Curve } from '../core/curve.types';
import type { WallPath } from '../core/wallpath.types';
import type { TerrainStroke } from '../core/terrainstroke.types';
import type { MapObject } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';
import type { HexColor } from '../core/common.types';
import type { Edge } from '../core/rendering.types';
import type { TileAssignment } from '../tiles/tile.types';
import type { MapDataUpdater } from '../hooks/mapData.types';
import type { DepthWriteContext, DepthWriteRefusal, DepthWriteResult } from '../../src/persistence/depthAuthoring';
import type { AddToHistoryOptions, LayerHistorySnapshot } from '../hooks/layerHistory.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useDataHandlers hook */
export interface UseDataHandlersOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
  addToHistory: (state: LayerHistorySnapshot, options?: AddToHistoryOptions) => void;
  isApplyingHistory: () => boolean;
  /**
   * The open sub-hex level's path (useSubHexNavigation's `subHexPath`, the key
   * useLayerHistory takes too); null or absent at the root. Non-null means the
   * current map is a sub-hex child, where every deep write is refused
   * 'nested-level' (decision D-1).
   */
  levelKey?: string | null;
}

// ===========================================
// History State
// ===========================================

// ===========================================
// Handler Types
// ===========================================

/**
 * Layer data change handler. Returns the depth gate's refusal when the write
 * adds an element on a ladder rung >= 1 and the gate refuses it (the map is
 * then unchanged and nothing is recorded); null otherwise. `context` is the
 * gesture's DepthWriteContext: pass `serialisedBytes` (depthBudgetBytesOf at
 * gesture start) so a brush that adds deep elements per tick measures the map
 * once; without it the write measures the map only when it adds one.
 */
export type LayerDataChangeHandler<T> = (newValue: T, suppressHistory?: boolean, context?: DepthWriteContext) => DepthWriteRefusal | null;

/** Handle cells change */
export type HandleCellsChange = LayerDataChangeHandler<Cell[]>;

/** Handle objects change */
export type HandleObjectsChange = LayerDataChangeHandler<MapObject[]>;

/** Handle text labels change */
export type HandleTextLabelsChange = LayerDataChangeHandler<TextLabel[]>;

/** Handle edges change */
export type HandleEdgesChange = LayerDataChangeHandler<Edge[]>;

/** Handle curves change */
export type HandleCurvesChange = LayerDataChangeHandler<Curve[]>;

/** Handle tiles change */
export type HandleTilesChange = LayerDataChangeHandler<TileAssignment[]>;

/** Handle wall paths change */
type HandleWallPathsChange =LayerDataChangeHandler<WallPath[]>;

/** Handle terrain strokes change */
type HandleTerrainStrokesChange =LayerDataChangeHandler<TerrainStroke[]>;

/** Handle map name change */
export type HandleNameChange = (newName: string) => void;

/** Handle add custom color */
export type HandleAddCustomColor = (newColor: HexColor) => void;

/** Handle delete custom color */
export type HandleDeleteCustomColor = (colorId: string) => void;

/** Handle update color opacity */
export type HandleUpdateColorOpacity = (colorId: string, newOpacity: number) => void;

/** Handle view state change */
export type HandleViewStateChange = (newViewState: StoredViewState) => void;

/** Handle object set change */
export type HandleObjectSetChange = (setId: string | null) => void;

/** Handle text label settings change */
export type HandleTextLabelSettingsChange = (settings: TextLabelSettings) => void;

/** Handle regions change (hex maps only) */
export type HandleRegionsChange = (regions: Region[], suppressHistory?: boolean) => void;

// ===========================================
// Grouped Handlers
// ===========================================

/**
 * Deep (ladder rung >= 1) cell write on the active layer. `update` maps the
 * rung's current cells to its next content; refused writes change nothing.
 * `context` carries a multi-tick operation's start-of-op baseline (brush stroke).
 */
export type HandleLevelCellsChange = (level: number, update: (current: Cell[]) => Cell[], suppressHistory?: boolean, context?: DepthWriteContext) => DepthWriteResult | null;

/** Layer data handlers group */
export interface LayerDataHandlers {
  handleCellsChange: HandleCellsChange;
  handleCurvesChange: HandleCurvesChange;
  handleObjectsChange: HandleObjectsChange;
  handleTextLabelsChange: HandleTextLabelsChange;
  handleEdgesChange: HandleEdgesChange;
  handleTilesChange?: HandleTilesChange;
  handleWallPathsChange?: HandleWallPathsChange;
  handleTerrainStrokesChange?: HandleTerrainStrokesChange;
}

/** Map data handlers group */
export interface MapDataHandlers {
  handleNameChange: HandleNameChange;
  handleAddCustomColor: HandleAddCustomColor;
  handleDeleteCustomColor: HandleDeleteCustomColor;
  handleUpdateColorOpacity: HandleUpdateColorOpacity;
  handleViewStateChange: HandleViewStateChange;
  handleObjectSetChange: HandleObjectSetChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
  handleOutlinesChange: (outlines: import('../core/map.types').Outline[]) => void;
  handleShapeOverlaysChange: (overlays: import('../core/map.types').ShapeOverlay[]) => void;
  handlePartyPinsChange: (partyPins: import('../core/map.types').PartyPin[], suppressHistory?: boolean) => void;
  handleMeasurementRouteChange: (measurementRoute: import('../core/map.types').MeasurementRoute) => void;
  handleSavedRoutesChange: (savedRoutes: import('../core/map.types').SavedRoute[]) => void;
  handleTravelSettingsChange: (travelSettings: import('../core/map.types').MapTravelSettings) => void;
}

// ===========================================
// Hook Result Type
// ===========================================

/** Return type for useDataHandlers hook */
export interface UseDataHandlersResult {
  // Grouped access
  layerDataHandlers: LayerDataHandlers;
  mapDataHandlers: MapDataHandlers;

  // Direct access
  handleNameChange: HandleNameChange;
  /** Rewrite one ladder rung (level >= 1) of the active layer through writeDepthCells. */
  handleLevelCellsChange: HandleLevelCellsChange;
  handleCellsChange: HandleCellsChange;
  handleCurvesChange: HandleCurvesChange;
  handleObjectsChange: HandleObjectsChange;
  handleTextLabelsChange: HandleTextLabelsChange;
  handleEdgesChange: HandleEdgesChange;
  handleTilesChange: HandleTilesChange;
  handleWallPathsChange: HandleWallPathsChange;
  handleTerrainStrokesChange: HandleTerrainStrokesChange;
  handleAddCustomColor: HandleAddCustomColor;
  handleDeleteCustomColor: HandleDeleteCustomColor;
  handleUpdateColorOpacity: HandleUpdateColorOpacity;
  handleViewStateChange: HandleViewStateChange;
  handleObjectSetChange: HandleObjectSetChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
  handleOutlinesChange: (outlines: import('../core/map.types').Outline[]) => void;
  handleShapeOverlaysChange: (overlays: import('../core/map.types').ShapeOverlay[]) => void;
  handlePartyPinsChange: (partyPins: import('../core/map.types').PartyPin[], suppressHistory?: boolean) => void;
  handleMeasurementRouteChange: (measurementRoute: import('../core/map.types').MeasurementRoute) => void;
  handleSavedRoutesChange: (savedRoutes: import('../core/map.types').SavedRoute[]) => void;
  handleTravelSettingsChange: (travelSettings: import('../core/map.types').MapTravelSettings) => void;
}

