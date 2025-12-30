/**
 * Map Data Type Definitions
 * Path: types/core/map.types.ts
 * 
 * Top-level map data structures and layer definitions.
 * Populated during Phase 1 (Tier 3 migration - layerAccessor.js).
 */

import type { CellMap } from './cell.types';

// ===========================================
// Map Types
// ===========================================

/** Supported map/grid types */
export type MapType = 'grid' | 'hex';

// ===========================================
// Layer System
// ===========================================

/** Layer identifier */
export type LayerId = string;

/** Individual map layer */
export interface MapLayer {
  id: LayerId;
  name: string;
  visible: boolean;
  locked: boolean;
  cells: CellMap;
  opacity: number;
}

// ===========================================
// Map Data Structure
// ===========================================

/**
 * Complete map data structure.
 * TODO: Expand during layerAccessor.js and useMapData.js migration.
 */
export interface MapData {
  version: string;
  mapType: MapType;
  layers: MapLayer[];
  activeLayerId: LayerId;
  // Additional properties to be defined during migration
}

// ===========================================
// Map Dimensions
// ===========================================

/** Map size configuration */
export interface MapDimensions {
  width: number;
  height: number;
  cellSize: number;
}

// TODO: Add fog of war, objects, notes, etc. during respective migrations