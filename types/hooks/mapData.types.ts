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
// Load Failure
// ===========================================

/**
 * Set when the data file EXISTS but could not be read or parsed.
 *
 * The UI must block editing entirely in this state — a blank map rendered over
 * an unreadable file gets saved back and merges over the real data.
 */
export interface MapDataLoadFailure {
  /** Vault path of the unreadable data file. */
  dataPath: string;
  /** Diagnostic message (not user-facing copy). */
  message: string;
}

// ===========================================
// Hook Return Type
// ===========================================

export interface UseMapDataResult {
  /** Current map data (null while loading) */
  mapData: MapData | null;

  /** Whether the map is currently loading */
  isLoading: boolean;

  /** Non-null when the data file could not be read — editing must be disabled */
  loadFailure: MapDataLoadFailure | null;

  /** Re-read the data file from disk, clearing any previous load failure */
  reload: () => void;

  /** Current save status */
  saveStatus: SaveStatus;

  /** Update map data and trigger debounced save */
  updateMapData: MapDataUpdater;

  /** Force immediate save (for unmount or critical saves) */
  forceSave: () => Promise<void>;

  /** Permanently disable all saves for this instance (post-deletion guard) */
  markDeleted: () => void;

  /**
   * Bumped when plugin settings change. Exposed so the caller can drive
   * useImagePreloading against the ACTIVE map (root or sub-hex) — preloading
   * deliberately does not live in this root-scoped hook (windrose-1mc).
   */
  settingsVersion: number;

  /** Get a cached image element by vault path (null if not loaded) */
  getCachedImage: (path: string) => HTMLImageElement | null;
}

// ===========================================
// Hook Parameters
// ===========================================

export type MapId = string;
export type MapName = string;
