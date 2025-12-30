/**
 * Settings Reducer Action Types
 * Path: types/settings/actions.types.ts
 * 
 * Discriminated union of all settings reducer actions.
 * Populated during settingsReducer.js migration.
 */

import type { SettingsTabId, SettingsState } from './settings.types';
import type { HexColor } from '../core/common.types';
import type { MapType } from '../core/map.types';

// ===========================================
// Action Type Constants
// ===========================================

/** All settings action type strings */
export type SettingsActionType =
  | 'SET_ACTIVE_TAB'
  | 'SET_CELL_SIZE'
  | 'SET_MAP_TYPE'
  | 'SET_MAP_DIMENSIONS'
  | 'SET_BACKGROUND_COLOR'
  | 'SET_GRID_COLOR'
  | 'TOGGLE_GRID'
  | 'TOGGLE_COORDINATES'
  | 'RESET_SETTINGS'
  // ... 19 total action types per spec
  ;

// ===========================================
// Individual Action Types
// ===========================================

export interface SetActiveTabAction {
  type: 'SET_ACTIVE_TAB';
  payload: SettingsTabId;
}

export interface SetCellSizeAction {
  type: 'SET_CELL_SIZE';
  payload: number;
}

export interface SetMapTypeAction {
  type: 'SET_MAP_TYPE';
  payload: MapType;
}

export interface SetMapDimensionsAction {
  type: 'SET_MAP_DIMENSIONS';
  payload: {
    width: number;
    height: number;
  };
}

export interface SetBackgroundColorAction {
  type: 'SET_BACKGROUND_COLOR';
  payload: HexColor;
}

export interface SetGridColorAction {
  type: 'SET_GRID_COLOR';
  payload: HexColor;
}

export interface ToggleGridAction {
  type: 'TOGGLE_GRID';
}

export interface ToggleCoordinatesAction {
  type: 'TOGGLE_COORDINATES';
}

export interface ResetSettingsAction {
  type: 'RESET_SETTINGS';
  payload?: Partial<SettingsState>;
}

// ===========================================
// Action Union
// ===========================================

/**
 * Discriminated union of all settings actions.
 * TODO: Complete during settingsReducer.js migration.
 */
export type SettingsAction =
  | SetActiveTabAction
  | SetCellSizeAction
  | SetMapTypeAction
  | SetMapDimensionsAction
  | SetBackgroundColorAction
  | SetGridColorAction
  | ToggleGridAction
  | ToggleCoordinatesAction
  | ResetSettingsAction
  // ... more to be added
  ;

// ===========================================
// Reducer Type
// ===========================================

/** Settings reducer function signature */
export type SettingsReducer = (
  state: SettingsState,
  action: SettingsAction
) => SettingsState;