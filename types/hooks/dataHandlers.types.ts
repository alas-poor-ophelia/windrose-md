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
import type { LayerHistorySnapshot } from '../hooks/layerHistory.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useDataHandlers hook */
export interface UseDataHandlersOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
  addToHistory: (state: LayerHistorySnapshot) => void;
  isApplyingHistory: () => boolean;
}

// ===========================================
// History State
// ===========================================

// ===========================================
// Handler Types
// ===========================================

/** Layer data change handler */
export type LayerDataChangeHandler<T> = (newValue: T, suppressHistory?: boolean) => void;

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
export type HandleWallPathsChange = LayerDataChangeHandler<WallPath[]>;

/** Handle terrain strokes change */
export type HandleTerrainStrokesChange = LayerDataChangeHandler<TerrainStroke[]>;

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

/** Handle sidebar collapse change */
export type HandleSidebarCollapseChange = (collapsed: boolean) => void;

/** Handle object set change */
export type HandleObjectSetChange = (setId: string | null) => void;

/** Handle text label settings change */
export type HandleTextLabelSettingsChange = (settings: TextLabelSettings) => void;

/** Handle regions change (hex maps only) */
export type HandleRegionsChange = (regions: Region[]) => void;

// ===========================================
// Grouped Handlers
// ===========================================

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
  handleSidebarCollapseChange: HandleSidebarCollapseChange;
  handleObjectSetChange: HandleObjectSetChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
  handleOutlinesChange: (outlines: import('../core/map.types').Outline[]) => void;
  handleShapeOverlaysChange: (overlays: import('../core/map.types').ShapeOverlay[]) => void;
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
  handleSidebarCollapseChange: HandleSidebarCollapseChange;
  handleObjectSetChange: HandleObjectSetChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
  handleOutlinesChange: (outlines: import('../core/map.types').Outline[]) => void;
  handleShapeOverlaysChange: (overlays: import('../core/map.types').ShapeOverlay[]) => void;
}

