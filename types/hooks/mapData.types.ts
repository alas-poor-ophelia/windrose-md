/**
 * Map Data Hook Type Definitions
 * Path: types/hooks/mapData.types.ts
 *
 * Types for useMapData hook - map loading, saving, and state management.
 */

import type { MapData } from '../core/map.types';

// ===========================================
// Save Status
// ===========================================

export type SaveStatus = 'Saved' | 'Saving...' | 'Unsaved changes' | 'Save failed';

// ===========================================
// Map Data Updater
// ===========================================

/**
 * Function to update map data.
 * Accepts either a new MapData object or an updater function.
 */
export type MapDataUpdater = (updaterOrData: MapData | ((prev: MapData) => MapData)) => void;

// ===========================================
// Hook Return Type
// ===========================================

export interface UseMapDataResult {
  /** Current map data (null while loading) */
  mapData: MapData | null;

  /** Whether the map is currently loading */
  isLoading: boolean;

  /** Current save status */
  saveStatus: SaveStatus;

  /** Update map data and trigger debounced save */
  updateMapData: MapDataUpdater;

  /** Force immediate save (for unmount or critical saves) */
  forceSave: () => Promise<void>;

  /** Whether the background image has been preloaded */
  backgroundImageReady: boolean;

  /** Whether the fog of war texture has been preloaded */
  fowImageReady: boolean;
}

// ===========================================
// Hook Parameters
// ===========================================

export type MapId = string;
export type MapName = string;
