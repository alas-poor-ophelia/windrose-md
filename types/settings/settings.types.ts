/**
 * Settings Type Definitions
 * Path: types/settings/settings.types.ts
 * 
 * Settings state shape and configuration types.
 * Updated during Tier 3 migration (settingsAccessor.ts).
 */

import type { MapType } from '../core/map.types';

// ===========================================
// Basic Types
// ===========================================

/** Hex color string (e.g., "#ff0000") */
export type HexColor = string;

/** Hex orientation options */
export type HexOrientation = 'flat' | 'pointy';

/** Grid diagonal measurement rules */
export type DiagonalRule = 'alternating' | 'equal' | 'euclidean';

/** Distance display format options */
export type DistanceDisplayFormat = 'cells' | 'units' | 'both';

/** Coordinate key interaction mode */
export type CoordinateKeyMode = 'hold' | 'toggle';

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
// Plugin Settings (Global)
// ===========================================

/**
 * Complete plugin settings structure.
 * These are the global settings stored in the settings plugin.
 */
export interface PluginSettings {
  // Version
  version: string;
  
  // Hex orientation
  hexOrientation: HexOrientation;
  
  // Grid appearance
  gridLineColor: HexColor;
  gridLineWidth: number;
  backgroundColor: HexColor;
  borderColor: HexColor;
  
  // Coordinate display
  coordinateKeyColor: HexColor;
  coordinateTextColor: HexColor;
  coordinateTextShadow: HexColor;
  coordinateKeyMode: CoordinateKeyMode;
  
  // UI preferences
  expandedByDefault: boolean;
  alwaysShowControls: boolean;
  
  // Canvas dimensions
  canvasHeight: number;
  canvasHeightMobile: number;
  
  // Distance measurement settings
  distancePerCellGrid: number;
  distancePerCellHex: number;
  distanceUnitGrid: string;
  distanceUnitHex: string;
  gridDiagonalRule: DiagonalRule;
  distanceDisplayFormat: DistanceDisplayFormat;
  
  // Fog of War appearance
  fogOfWarColor: HexColor;
  fogOfWarOpacity: number;
  fogOfWarImage: string | null;
  fogOfWarBlurEnabled: boolean;
  fogOfWarBlurFactor: number;
  
  // Shape preview settings
  shapePreviewKbm: boolean;
  shapePreviewTouch: boolean;
  
  // Object customization (grid maps)
  gridObjectOverrides?: Record<string, ObjectOverride>;
  customGridObjects?: CustomObject[];
  customGridCategories?: CustomCategory[];
  
  // Object customization (hex maps)
  hexObjectOverrides?: Record<string, ObjectOverride>;
  customHexObjects?: CustomObject[];
  customHexCategories?: CustomCategory[];
  
  // Color palette customization
  colorPaletteOverrides?: Record<string, ColorOverride>;
  customPaletteColors?: CustomColor[];
}

// ===========================================
// Theme Types
// ===========================================

/** Grid theme (lines, background) */
export interface GridThemeSettings {
  lines: HexColor;
  lineWidth: number;
  background: HexColor;
}

/** Cell theme (fill, border) */
export interface CellThemeSettings {
  fill: HexColor;
  border: HexColor;
  borderWidth: number;
}

/** Compass theme */
export interface CompassThemeSettings {
  color: HexColor;
  size: number;
}

/** Fog of war theme */
export interface FogOfWarThemeSettings {
  color: HexColor;
  opacity: number;
  image: string | null;
  blurEnabled: boolean;
  blurFactor: number;
}

/** Decorative border theme */
export interface DecorativeBorderTheme {
  color: HexColor;
  width: number;
  dashArray: string;
}

/**
 * Complete resolved theme object.
 * Returned by getTheme() - merges settings with constants.
 */
export interface ResolvedTheme {
  grid: GridThemeSettings;
  cells: CellThemeSettings;
  compass: CompassThemeSettings;
  decorativeBorder: DecorativeBorderTheme;
  coordinateKey: HexColor;
  fogOfWar: FogOfWarThemeSettings;
}

// ===========================================
// Color Palette Types
// ===========================================

/** Built-in color entry */
export interface BuiltInColor {
  id: string;
  color: HexColor;
  label: string;
}

/** Color override for built-in colors */
export interface ColorOverride {
  color?: HexColor;
  label?: string;
  order?: number;
  hidden?: boolean;
}

/** Custom color entry */
export interface CustomColor {
  id: string;
  color: HexColor;
  label: string;
  order?: number;
}

/** Resolved color palette entry (after applying overrides) */
export interface ResolvedColorEntry {
  id: string;
  color: HexColor;
  label: string;
  order: number;
  isBuiltIn: boolean;
  isCustom?: boolean;
  isModified?: boolean;
}

// ===========================================
// Object Customization Types
// ===========================================

/** Override for a built-in object type */
export interface ObjectOverride {
  color?: HexColor;
  hidden?: boolean;
  scale?: number;
}

/** Custom object definition */
export interface CustomObject {
  id: string;
  name: string;
  category: string;
  symbol: string;
  color?: HexColor;
  scale?: number;
}

/** Custom category definition */
export interface CustomCategory {
  id: string;
  name: string;
  order?: number;
}

/** Object settings return type */
export interface ObjectSettings {
  objectOverrides: Record<string, ObjectOverride>;
  customObjects: CustomObject[];
  customCategories: CustomCategory[];
}

// ===========================================
// Map-Specific Settings
// ===========================================

/** Map-specific settings structure */
export interface MapSpecificSettings {
  useGlobalSettings: boolean;
  overrides?: Partial<PluginSettings>;
}

// ===========================================
// Legacy Types (for migration compatibility)
// ===========================================

/**
 * Settings state for settingsReducer.
 * TODO: Fully define during settingsReducer.ts migration.
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
  
  // ... more to be added during settingsReducer migration
}

/** User preferences (persisted) */
export interface UserPreferences {
  defaultCellSize: number;
  defaultMapType: MapType;
  showWelcomeScreen: boolean;
  // ... more to be added
}