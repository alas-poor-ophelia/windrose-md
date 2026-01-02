/**
 * Map Data Type Definitions
 *
 * Top-level map data structures, layer definitions, and fog of war.
 * Updated during Tier 3 migration (layerAccessor.ts).
 */

import type { Cell } from './cell.types';
import type { Point } from './geometry.types';
import type { HexOrientation } from '../settings/settings.types';

// ===========================================
// Map Types
// ===========================================

export type MapType = 'grid' | 'hex';

export type SchemaVersion = number;

// ===========================================
// View State
// ===========================================

export interface ViewState {
  zoom: number;
  center: Point;
}

// ===========================================
// UI Preferences
// ===========================================

export interface UIPreferences {
  rememberPanZoom: boolean;
  rememberSidebarState: boolean;
  rememberExpandedState: boolean;
}

// ===========================================
// Map-Specific Settings
// ===========================================

export interface MapSettings {
  useGlobalSettings: boolean;
  overrides: Record<string, unknown>;
}

// ===========================================
// Background Image (Hex Maps)
// ===========================================

export type GridDensity = 'sparse' | 'medium' | 'dense' | 'custom';
export type SizingMode = 'density' | 'measurement';
export type MeasurementMethod = 'edge' | 'corner';

export interface BackgroundImage {
  path: string | null;
  lockBounds: boolean;
  gridDensity: GridDensity;
  customColumns: number;
  sizingMode: SizingMode;
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  fineTuneOffset: number;
}

// ===========================================
// Text Label Settings
// ===========================================

export interface TextLabelSettings {
  fontFace: string;
  fontSize: number;
  color: string;
}

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
 * Note: Many fields are optional because they're populated by fileOperations
 * during load but may not be present during migration from legacy schemas.
 */
export interface MapData {
  // Schema & identification
  schemaVersion: SchemaVersion;
  mapType: MapType;

  // Map metadata (optional - defaults exist in fileOperations)
  name?: string;
  description?: string;
  northDirection?: number;

  // Layer management
  activeLayerId: LayerId;
  layerPanelVisible: boolean;
  layers: MapLayer[];

  // View state (pan/zoom) - optional, defaults calculated based on map type
  viewState?: ViewState;

  // Map dimensions - optional, defaults from DEFAULTS
  dimensions?: MapDimensions;

  // Grid-specific settings
  gridSize?: number;

  // Hex-specific settings
  hexSize?: number;
  orientation?: HexOrientation;
  hexBounds?: HexBounds;
  backgroundImage?: BackgroundImage;

  // Per-map settings (optional - defaults to global settings)
  settings?: MapSettings;

  // UI state persistence (optional - defaults exist)
  uiPreferences?: UIPreferences;
  sidebarCollapsed?: boolean;
  expandedState?: boolean;

  // Custom colors for this map
  customColors?: string[];

  // Remembered text label settings
  lastTextLabelSettings?: TextLabelSettings | null;

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

export type LayerUpdate = Partial<Omit<MapLayer, 'id'>>;