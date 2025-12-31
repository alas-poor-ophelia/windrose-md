/**
 * Map Data Type Definitions
 * Path: types/core/map.types.ts
 * 
 * Top-level map data structures, layer definitions, and fog of war.
 * Updated during Tier 3 migration (layerAccessor.ts).
 */

import type { Cell } from './cell.types';
import type { Point } from './geometry.types';

// ===========================================
// Map Types
// ===========================================

/** Supported map/grid types */
export type MapType = 'grid' | 'hex';

/** Schema version for data migration */
export type SchemaVersion = number;

// ===========================================
// Fog of War
// ===========================================

/** A fogged cell in offset coordinates */
export interface FoggedCell {
  col: number;
  row: number;
}

/** Fog of war state for a layer */
export interface FogOfWar {
  enabled: boolean;
  foggedCells: FoggedCell[];
  texture: string | null;
}

/** Fog state summary for UI display */
export interface FogState {
  initialized: boolean;
  enabled: boolean;
  cellCount: number;
}

// ===========================================
// Edge (painted grid lines)
// ===========================================

/** A painted edge on the grid */
export interface Edge {
  x: number;
  y: number;
  side: 'right' | 'bottom';
  color: string;
  opacity?: number;
}

// ===========================================
// Text Labels
// ===========================================

/** Text label on the map */
export interface TextLabel {
  id: string;
  text: string;
  position: Point;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  rotation?: number;
  alignment?: 'left' | 'center' | 'right';
}

// ===========================================
// Map Objects (forward reference)
// ===========================================

// Full MapObject type is in object.types.ts
// We use a minimal interface here to avoid circular imports
export interface MapObjectRef {
  id: string;
  typeId: string;
  position: Point;
  size?: { width: number; height: number };
  scale?: number;
  rotation?: number;
  color?: string;
  opacity?: number;
  locked?: boolean;
}

// ===========================================
// Layer System
// ===========================================

/** Layer identifier */
export type LayerId = string;

/** Individual map layer */
export interface MapLayer {
  id: LayerId;
  name: string;
  order: number;
  visible: boolean;
  cells: Cell[];
  edges: Edge[];
  objects: MapObjectRef[];
  textLabels: TextLabel[];
  fogOfWar: FogOfWar | null;
}

// ===========================================
// Map Data Structure
// ===========================================

/**
 * Complete map data structure (v2 schema with layers).
 */
export interface MapData {
  // Schema & identification
  schemaVersion: SchemaVersion;
  mapType: MapType;
  
  // Layer management
  activeLayerId: LayerId;
  layerPanelVisible: boolean;
  layers: MapLayer[];
  
  // Grid/hex settings
  cellSize?: number;
  hexSize?: number;
  hexOrientation?: 'flat' | 'pointy';
  
  // Map dimensions (grid)
  dimensions?: MapDimensions;
  
  // Hex bounds
  hexBounds?: HexBounds;
  
  // Note pins (global, not per-layer)
  notePins?: NotePin[];
  
  // Migration metadata
  _migratedAt?: string;
}

/**
 * Legacy map data structure (v1 schema, pre-layers).
 * Used for migration validation.
 */
export interface LegacyMapData {
  cells?: Cell[];
  edges?: Edge[];
  objects?: MapObjectRef[];
  textLabels?: TextLabel[];
  schemaVersion?: SchemaVersion;
  mapType?: MapType;
  cellSize?: number;
  dimensions?: MapDimensions;
  // ... other legacy fields
}

// ===========================================
// Map Dimensions
// ===========================================

/** Map size configuration (grid maps) */
export interface MapDimensions {
  width: number;
  height: number;
}

/** Hex map bounds */
export interface HexBounds {
  maxCol: number;
  maxRow: number;
}

/** Generic bounds for fog operations */
export interface FogBounds {
  maxCol: number;
  maxRow: number;
}

// ===========================================
// Note Pins
// ===========================================

/** Note pin on the map */
export interface NotePin {
  id: string;
  position: Point;
  linkedNote?: string;
  color?: string;
  icon?: string;
}

// ===========================================
// Migration Types
// ===========================================

/** Migration validation result */
export interface MigrationValidation {
  valid: boolean;
  errors: string[];
}

// ===========================================
// Layer Updates
// ===========================================

/** Partial layer update for updateLayer function */
export type LayerUpdate = Partial<Omit<MapLayer, 'id'>>;