/**
 * Settings Type Definitions
 *
 * Settings state shape and configuration types.
 * Updated during Tier 3 migration (settingsAccessor.ts).
 */

import type { HexColor } from '../core/common.types';
import type { InstalledPack } from '../content-packs/contentPack.types';

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
  | 'hexgrid'
  | 'gridbackground'
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
// Image and Grid Sizing
// ===========================================

/** Image dimensions for background image calculations */
export interface ImageDimensions {
  width: number;
  height: number;
}

/** Grid calculation result from image sizing */
export interface GridCalculation {
  columns: number;
  rows: number;
  hexSize: number;
  hexWidth?: number;  // Optional - only used in some contexts
}

/** Grid density preset for hex maps */
export interface GridDensityPreset {
  columns: number;
  label: string;
  description: string;
}

// ===========================================
// Feature Gating & Onboarding
// ===========================================

/** Individually toggleable feature groups (absence = enabled) */
export type WindroseFeature =
  | 'hexMaps'
  | 'regions'
  | 'outlines'
  | 'subMaps'
  | 'fogOfWar'
  | 'dungeonGenerator'
  | 'tiles'
  | 'walls'
  | 'notePins'
  | 'shapeOverlays'
  | 'measurement'
  | 'freehand';

/**
 * First-run onboarding state.
 * Absent = not yet resolved (detection runs at plugin load).
 * 'pending'  = fresh install; show survey on first map view.
 * 'whatsnew' = upgrader; show one-time What's-New notice.
 * 'done'     = nothing left to show.
 */
export type OnboardingState = 'pending' | 'whatsnew' | 'done';

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
  customPaletteColors?: PaletteColor[];

  // Object sets
  objectSets?: ObjectSet[];
  activeObjectSetId?: string | null;
  objectSetsAutoLoadFolder?: string;

  // Hover preview settings
  hoverPreviewScale?: number;  // Panel size multiplier (0.5–2.0, default 1.0)
  hoverPreviewZoom?: number;   // Map zoom level (0.1–2.0, default 0.5)

  // Sub-map display
  showAdjacentSubMaps?: boolean;

  // Tileset folders (vault paths scanned for tile images)
  tilesetFolders?: string[];

  // Keyboard shortcuts (action ID → key string)
  keyboardShortcuts?: Record<string, string>;

  // Content packs (downloaded supplementary content)
  installedContentPacks?: InstalledPack[];

  // Feature gating (absent key or absent record = feature enabled)
  features?: Partial<Record<WindroseFeature, boolean>>;

  // First-run onboarding state (absent = not yet resolved)
  onboardingState?: OnboardingState;
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

export interface CompassThemeSettings {
  color: HexColor;
  size: number;
}

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

/** Frame settings for map decoration */
export interface FrameSettings {
  enabled: boolean;
  style?: string;
  color?: HexColor;
  width?: number;
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

export interface BuiltInColor {
  id: string;
  color: HexColor;
  label: string;
}

export interface ColorOverride {
  color?: HexColor;
  label?: string;
  order?: number;
  hidden?: boolean;
}

export interface PaletteColor {
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

// Re-export consolidated types from objects module
export type {
  ObjectType,
  ObjectTypeDefinition,
  Category,
  CategoryDefinition,
  RenderChar,
  ValidationResult,
} from '../objects/object.types';

/**
 * Override settings for built-in objects.
 * Used to customize appearance or hide built-in objects.
 */
export interface ObjectOverride {
  hidden?: boolean;           // Hide this object from the palette
  symbol?: string;            // Override Unicode symbol
  iconClass?: string;         // Override RPGAwesome icon class
  imagePath?: string;         // Override vault image path
  label?: string;             // Override display name
  category?: string;          // Move to different category
  order?: number;             // Custom sort order
}

/**
 * Custom object definition (user-created objects).
 * Stored in plugin settings.
 */
export interface CustomObject {
  id: string;
  symbol?: string;            // Unicode symbol (optional if iconClass or imagePath set)
  iconClass?: string;         // RPGAwesome icon class (optional if symbol or imagePath set)
  imagePath?: string;         // Vault image path (optional if symbol or iconClass set)
  label: string;              // Display name
  category: string;           // Category ID
  order?: number;             // Sort order
}

/**
 * Custom category definition (user-created categories).
 * Stored in plugin settings.
 */
export interface CustomCategory {
  id: string;
  label: string;              // Display name
  order?: number;             // Sort order
}

/**
 * Object settings structure returned by getObjectSettings().
 * Normalized view of grid/hex object customizations.
 */
export interface ObjectSettings {
  objectOverrides: Record<string, ObjectOverride>;
  customObjects: CustomObject[];
  customCategories: CustomCategory[];
}

// ===========================================
// Object Set Types
// ===========================================

/**
 * Hex and/or grid object data stored in an object set.
 * Each side is optional — a set may contain only hex, only grid, or both.
 */
export interface ObjectSetData {
  hex?: {
    objectOverrides?: Record<string, ObjectOverride>;
    customObjects?: CustomObject[];
    customCategories?: CustomCategory[];
  };
  grid?: {
    objectOverrides?: Record<string, ObjectOverride>;
    customObjects?: CustomObject[];
    customCategories?: CustomCategory[];
  };
}

/**
 * A named, saveable collection of object customizations.
 */
export interface ObjectSet {
  id: string;
  name: string;
  source: 'manual' | 'folder';
  folderPath?: string;
  data: ObjectSetData;
}

// ===========================================
// Map-Specific Settings
// ===========================================

export interface MapSpecificSettings {
  useGlobalSettings: boolean;
  overrides?: Partial<PluginSettings>;
}

