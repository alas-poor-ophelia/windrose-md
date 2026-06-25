/**
 * Map Data Type Definitions
 *
 * Top-level map data structures, layer definitions, and fog of war.
 * Updated during Tier 3 migration (layerAccessor.ts).
 */

import type { Cell } from './cell.types';
import type { CustomColor } from './common.types';
import type { Curve } from './curve.types';
import type { Point } from './geometry.types';
import type { HexOrientation, FrameSettings } from '../settings/settings.types';
import type { TilesetDef, TilesetOverrides, TileAssignment, TileLayerRole } from '../tiles/tile.types';
import type { MapObject } from '../objects/object.types';
import type { Edge } from './rendering.types';

// ===========================================
// Map Types
// ===========================================

export type MapType = 'grid' | 'hex';

// ===========================================
// View State (persisted format)
// ===========================================

export interface StoredViewState {
  zoom: number;
  center: Point;
  offsetX?: number;
  offsetY?: number;
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
  frame?: FrameSettings;
  /** Per-map distance measurement overrides */
  distanceSettings?: Record<string, unknown>;
  /** Coordinate display mode for hex maps */
  coordinateDisplayMode?: string;
  /** Object set identifier override */
  objectSetId?: string | null;
}

// ===========================================
// Background Image (Grid and Hex Maps)
// ===========================================

export type GridDensity = 'sparse' | 'medium' | 'dense' | 'custom';
export type SizingMode = 'density' | 'measurement';
export type MeasurementMethod = 'edge' | 'corner';

export interface BackgroundImage {
  path: string | null;

  // Shared settings (both grid and hex maps)
  opacity?: number;          // Image opacity (0-1, default 1)
  offsetX?: number;          // X offset in pixels for alignment
  offsetY?: number;          // Y offset in pixels for alignment

  // Grid-specific settings (ignored by hex maps)
  imageGridSize?: number;    // Pixel size of grid cells on the background image

  // Hex-specific settings (ignored by grid maps, optional for grid maps)
  lockBounds?: boolean;
  gridDensity?: GridDensity;
  customColumns?: number;
  sizingMode?: SizingMode;
  measurementMethod?: MeasurementMethod;
  measurementSize?: number;
  fineTuneOffset?: number;
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
// Edge (canonical type in rendering.types.ts)
// ===========================================

export type { Edge };

// ===========================================
// Text Labels & Note Pins (canonical types in objects/note.types.ts)
// ===========================================

import type { TextLabel, NotePin } from '../objects/note.types';
export type { TextLabel, NotePin };

// ===========================================
// Outlines (hex map polygon outlines)
// ===========================================

export interface Outline {
  id: string;
  vertices: Point[];
  color: string;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  lineWidth: number;
  filled: boolean;
  fillOpacity: number;
  snapMode: 'straight' | 'hex';
  visible: boolean;
  order: number;
}

// ===========================================
// Color Opacity Overrides
// ===========================================

export type ColorOpacityOverrides = Record<string, number>;

// ===========================================
// Generation Settings (dungeon generator)
// ===========================================

export interface DungeonConfigOverrides {
  objectDensity?: number;
  monsterWeight?: number;
  emptyWeight?: number;
  featureWeight?: number;
  trapWeight?: number;
  useTemplates?: boolean;
  style?: string;
}

export interface DungeonStockingMetadata {
  rooms?: unknown[];
  corridorResult?: unknown;
  doorPositions?: Array<{ x: number; y: number }>;
  style?: string;
  entryRoomId?: string;
  exitRoomId?: string;
  waterRoomIds?: string[];
}

export interface GenerationSettings {
  preset?: string;
  seed?: number;
  configOverrides?: DungeonConfigOverrides;
  stockingMetadata?: DungeonStockingMetadata;
}

// ===========================================
// Map Objects (forward reference)
// ===========================================

// Full MapObject type is in object.types.ts
// We use a minimal interface here to avoid circular imports
export interface MapObjectRef {
  id: string;
  typeId: string;
  type?: string;
  position: Point;
  size?: { width: number; height: number };
  scale?: number;
  rotation?: number;
  color?: string;
  opacity?: number;
  locked?: boolean;
  freeform?: boolean;
  worldPosition?: Point;
  linkedNote?: string | null;
  label?: string;
  customTooltip?: string;
  isPlayer?: boolean;
  layerId?: string;
  linkedObject?: { targetMapId: string; targetObjectId: string } | null;
  slot?: number;
  alignment?: { offset?: Point };
  lightRadius?: number;
  lightColor?: string;
  lightEnabled?: boolean;
}

// ===========================================
// Layer System
// ===========================================

/** Layer identifier */
export type LayerId = string;

/** Board (floor) identifier */
export type BoardId = string;

/**
 * A Board is a "floor" — an independent set of layers. Board → Stratum → Layer
 * is a *projection* over the flat `MapData.layers` array via two grouping keys
 * (`MapLayer.boardId` + `MapLayer.tileRole`); a Board is NOT a nested data entity.
 * Only the active board's layers render.
 */
export interface Board {
  id: BoardId;
  name: string;
  /** Display/switch order among boards (ascending). */
  order: number;
}

/** Individual map layer */
export interface MapLayer {
  id: LayerId;
  name: string;
  order: number;
  visible: boolean;
  cells: Cell[];
  curves: Curve[];
  edges: Edge[];
  objects: MapObject[];
  textLabels: TextLabel[];
  fogOfWar: FogOfWar | null;
  /** Show the layer below this one at reduced opacity (for alignment) */
  showLayerBelow?: boolean;
  /** Opacity for layer below (0.1-0.5, default 0.25) */
  layerBelowOpacity?: number;
  /** Optional icon for the layer (RPGAwesome class e.g. 'ra-sword', or Unicode char) */
  icon?: string;
  /** Tile assignments for this layer */
  tiles?: TileAssignment[];
  /** Layer's role in the tile layer stack (grid tile maps only) */
  tileRole?: TileLayerRole;
  /**
   * The board (floor) this layer belongs to. Optional for back-compat; the load
   * migration assigns every layer a default board. Stratum = (boardId, tileRole).
   */
  boardId?: BoardId;
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
  schemaVersion: number;
  mapType: MapType;

  // Map metadata (optional - defaults exist in fileOperations)
  name?: string;
  description?: string;
  northDirection?: number;

  // Layer management
  activeLayerId: LayerId;
  layerPanelVisible: boolean;
  layers: MapLayer[];

  // Board (floor) management — Board→Stratum→Layer projection over the flat layers[].
  // Optional for back-compat; the load migration seeds a default board.
  boards?: Board[];
  activeBoardId?: BoardId;

  // View state (pan/zoom) - optional, defaults calculated based on map type
  viewState?: StoredViewState;

  // Map dimensions - optional, defaults from DEFAULTS
  dimensions?: MapDimensions;

  // Grid-specific settings
  gridSize?: number;

  // Hex-specific settings
  hexSize?: number;
  orientation?: HexOrientation;
  hexBounds?: HexBounds;

  // Background image (both grid and hex maps)
  backgroundImage?: BackgroundImage;

  // Per-map settings (optional - defaults to global settings)
  settings?: MapSettings;

  // UI state persistence (optional - defaults exist)
  uiPreferences?: UIPreferences;
  showAdjacentSubMaps?: boolean;
  sidebarCollapsed?: boolean;
  expandedState?: boolean;

  // Custom colors for this map
  customColors?: CustomColor[];

  // Remembered text label settings
  lastTextLabelSettings?: TextLabelSettings | null;

  // Last selected object opacity
  lastSelectedOpacity?: number;

  // Note pins (global, not per-layer)
  notePins?: NotePin[];

  // Shape overlays (global, both grid and hex maps)
  shapeOverlays?: ShapeOverlay[];

  // Regions (hex maps only, global not per-layer)
  regions?: Region[];

  // Sub-hex drill-down maps (hex maps only, keyed by "q,r")
  subHexMaps?: Record<string, SubHexMapData>;

  // Hex tile image sets (hex maps only)
  tilesets?: TilesetDef[];

  // Per-tileset user overrides (keyed by tileset id)
  tilesetOverrides?: Record<string, TilesetOverrides>;

  // Polygon outlines (hex maps)
  outlines?: Outline[];

  // Object set identifier
  objectSetId?: string | null;

  // Per-color opacity overrides for palette
  paletteColorOpacityOverrides?: ColorOpacityOverrides;

  // Dungeon generation settings
  generationSettings?: GenerationSettings;

  // Legacy/convenience flat access (pre-layer schema)
  objects?: MapObjectRef[];
  textLabels?: import('../objects/note.types').TextLabel[];
  edges?: Edge[];

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
  schemaVersion?: number;
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
  maxRing?: number;  // When present, hexagonal boundary used instead of rectangular
}

/** Generic bounds for fog operations */
export interface FogBounds {
  maxCol: number;
  maxRow: number;
}

// ===========================================
// Shape Overlays (geometric shapes, both grid and hex)
// ===========================================

export type ShapeOverlayType = 'square' | 'circle';

export interface ShapeOverlay {
  id: string;
  shape: ShapeOverlayType;
  worldPosition: Point;
  size: number;
  color: string;
  opacity: number;
  freeform: boolean;
  visible: boolean;
}

// ===========================================
// Regions (hex maps only)
// ===========================================

/** Named region spanning multiple hexes */
export interface Region {
  id: string;
  name: string;
  /** Member hex positions in axial coordinates {x: q, y: r} */
  hexes: Point[];
  color: string;
  opacity: number;
  borderColor: string;
  borderWidth: number;
  visible: boolean;
  linkedNote?: string;
  icon?: string;
  /** World-space position for label (if absent, computed from centroid) */
  labelPosition?: Point;
  /** Z-order for rendering (lower = behind) */
  order: number;
  tags?: string[];
}

// ===========================================
// Sub-Hex Drill-Down
// ===========================================

/** Sub-hex map stored as nested MapData inside a parent hex */
export interface SubHexMapData {
  /** Number of rings in the sub-hex grid (default 7 → 127 cells) */
  subdivisionRings: number;
  /** Full MapData for the sub-hex (recursive) */
  mapData: MapData;
  /** ISO date of last modification */
  lastModified: string;
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