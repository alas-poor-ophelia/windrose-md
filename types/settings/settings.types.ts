/**
 * Settings Type Definitions
 * Path: types/settings/settings.types.ts
 * 
 * Settings state shape and configuration types.
 * Populated during settingsReducer.js migration.
 */

import type { MapType } from '../core/map.types';
import type { HexColor } from '../core/common.types';

// ===========================================
// Settings Tab IDs
// ===========================================

/** Settings modal tab identifiers */
export type SettingsTabId = 
  | 'appearance'
  | 'grid'
  | 'measurement'
  | 'preferences';

// ===========================================
// Display Preferences
// ===========================================

/** Coordinate display format */
export type CoordinateFormat = 'xy' | 'axial' | 'offset' | 'none';

/** Grid line style */
export type GridLineStyle = 'solid' | 'dashed' | 'dotted';

// ===========================================
// Settings State
// ===========================================

/**
 * Complete settings state shape.
 * TODO: Fully define during settingsReducer.js migration.
 */
export interface SettingsState {
  // Map configuration
  mapType: MapType;
  cellSize: number;
  mapWidth: number;
  mapHeight: number;
  
  // Colors
  backgroundColor: HexColor;
  gridColor: HexColor;
  
  // Display options
  showGrid: boolean;
  showCoordinates: boolean;
  coordinateFormat: CoordinateFormat;
  
  // Active tab in settings modal
  activeTab: SettingsTabId;
  
  // ... more to be added during migration
}

// ===========================================
// Settings Preferences
// ===========================================

/** User preferences (persisted) */
export interface UserPreferences {
  defaultCellSize: number;
  defaultMapType: MapType;
  showWelcomeScreen: boolean;
  // ... more to be added
}

// TODO: Expand during settingsReducer.js migration