/**
 * Data Handlers Hook Type Definitions
 * Path: types/hooks/dataHandlers.types.ts
 *
 * Types for useDataHandlers hook - manages data change handlers
 * for layer data and map-level data with history tracking.
 */

import type { MapData, ViewState, TextLabelSettings, Region } from '../core/map.types';
import type { Cell } from '../core/cell.types';
import type { Curve } from '../core/curve.types';
import type { MapObject } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';
import type { HexColor } from '../core/common.types';
import type { Edge } from '../contexts/context.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useDataHandlers hook */
export interface UseDataHandlersOptions {
  mapData: MapData | null;
  updateMapData: (updater: (current: MapData | null) => MapData | null) => void;
  addToHistory: (state: MapHistorySnapshot) => void;
  isApplyingHistory: () => boolean;
}

// ===========================================
// History State
// ===========================================

/** State snapshot for map data history tracking */
export interface MapHistorySnapshot {
  cells: Cell[];
  curves: Curve[];
  name: string;
  objects: MapObject[];
  textLabels: TextLabel[];
  edges: Edge[];
  regions?: Region[];
}

// ===========================================
// Custom Color Types
// ===========================================

/** Custom color entry */
export interface CustomColor {
  id: string;
  color: HexColor;
  label: string;
  opacity?: number;
}

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

/** Handle map name change */
export type HandleNameChange = (newName: string) => void;

/** Handle add custom color */
export type HandleAddCustomColor = (newColor: HexColor) => void;

/** Handle delete custom color */
export type HandleDeleteCustomColor = (colorId: string) => void;

/** Handle update color opacity */
export type HandleUpdateColorOpacity = (colorId: string, newOpacity: number) => void;

/** Handle view state change */
export type HandleViewStateChange = (newViewState: ViewState) => void;

/** Handle sidebar collapse change */
export type HandleSidebarCollapseChange = (collapsed: boolean) => void;

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
}

/** Map data handlers group */
export interface MapDataHandlers {
  handleNameChange: HandleNameChange;
  handleAddCustomColor: HandleAddCustomColor;
  handleDeleteCustomColor: HandleDeleteCustomColor;
  handleUpdateColorOpacity: HandleUpdateColorOpacity;
  handleViewStateChange: HandleViewStateChange;
  handleSidebarCollapseChange: HandleSidebarCollapseChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
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
  handleAddCustomColor: HandleAddCustomColor;
  handleDeleteCustomColor: HandleDeleteCustomColor;
  handleUpdateColorOpacity: HandleUpdateColorOpacity;
  handleViewStateChange: HandleViewStateChange;
  handleSidebarCollapseChange: HandleSidebarCollapseChange;
  handleTextLabelSettingsChange: HandleTextLabelSettingsChange;
  handleRegionsChange: HandleRegionsChange;
}

