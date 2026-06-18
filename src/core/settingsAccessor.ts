/**
 * settingsAccessor.ts
 * Utility to access plugin settings with fallback defaults.
 * Uses a plugin singleton set via setPlugin() during onload().
 */

// Type-only imports
import type {
  PluginSettings,
  ResolvedTheme,
  BuiltInColor,
  ObjectSettings,
  ResolvedColorEntry,
  MapSpecificSettings,
  CoordinateKeyMode,
  ObjectSetData,
  ColorOverride,
  PaletteColor
} from '#types/settings/settings.types';
import type { App } from 'obsidian';

import { THEME, DEFAULTS, resolveBackground, resolveGridLineColor } from './dmtConstants';

// ===========================================
// Plugin Singleton
// ===========================================

interface WindrosePluginRef {
  app: App;
  settings: Partial<PluginSettings>;
  dataFilePath: string;
}

let _plugin: WindrosePluginRef | null = null;

function setPlugin(plugin: WindrosePluginRef): void {
  _plugin = plugin;
}

function clearPlugin(): void {
  _plugin = null;
}


// ===========================================
// Constants
// ===========================================

/** Built-in color palette - matches settings plugin */
const BUILT_IN_COLORS: BuiltInColor[] = [
  { id: 'default', color: '#c4a57b', label: 'Default (Tan)' },
  { id: 'stone', color: '#808080', label: 'Stone Gray' },
  { id: 'dark-stone', color: '#505050', label: 'Dark Gray' },
  { id: 'water', color: '#4a9eff', label: 'Water Blue' },
  { id: 'forest', color: '#4ade80', label: 'Forest Green' },
  { id: 'danger', color: '#ef4444', label: 'Danger Red' },
  { id: 'sand', color: '#fbbf24', label: 'Sand Yellow' },
  { id: 'magic', color: '#a855f7', label: 'Magic Purple' },
  { id: 'fire', color: '#fb923c', label: 'Fire Orange' },
  { id: 'ice', color: '#14b8a6', label: 'Ice Teal' }
];

/** Fallback settings based on theme constants */
const FALLBACK_SETTINGS: PluginSettings = {
  version: '1.0.0',
  hexOrientation: DEFAULTS.hexOrientation,
  gridLineColor: THEME.grid.lines,
  gridLineWidth: THEME.grid.lineWidth,
  backgroundColor: THEME.grid.background,
  borderColor: THEME.cells.border,  
  coordinateKeyColor: THEME.coordinateKey.color,
  coordinateTextColor: THEME.coordinateText.color,
  coordinateTextShadow: THEME.coordinateText.shadow,
  coordinateKeyMode: 'hold' as CoordinateKeyMode,
  expandedByDefault: false,
  
  // Canvas dimensions
  canvasHeight: 600,
  canvasHeightMobile: 400,
  
  // Distance measurement settings
  distancePerCellGrid: DEFAULTS.distance.perCellGrid,
  distancePerCellHex: DEFAULTS.distance.perCellHex,
  distanceUnitGrid: DEFAULTS.distance.unitGrid,
  distanceUnitHex: DEFAULTS.distance.unitHex,
  gridDiagonalRule: DEFAULTS.distance.gridDiagonalRule,
  distanceDisplayFormat: DEFAULTS.distance.displayFormat,
  
  // Fog of War appearance settings
  fogOfWarColor: THEME.fogOfWar.color,
  fogOfWarOpacity: THEME.fogOfWar.opacity,
  fogOfWarImage: null,
  fogOfWarBlurEnabled: THEME.fogOfWar.blurEnabled,
  fogOfWarBlurFactor: THEME.fogOfWar.blurFactor,
  
  // Controls visibility
  alwaysShowControls: false,
  
  // Shape preview settings
  shapePreviewKbm: true,
  shapePreviewTouch: false
};

/** Default object customization settings */
const FALLBACK_OBJECT_SETTINGS: ObjectSettings = {
  objectOverrides: {},
  customObjects: [],
  customCategories: []
};

// ===========================================
// Plugin Access
// ===========================================

function getPluginSettingsRaw(): Partial<PluginSettings> | null {
  return _plugin?.settings || null;
}

function getApp(): App {
  if (!_plugin) throw new Error('[Windrose] Plugin not initialized. Call setPlugin() in onload().');
  return _plugin.app;
}

function getDataFilePath(): string {
  return _plugin?.dataFilePath ?? 'windrose-md-data.json';
}

// ===========================================
// Settings Access Functions
// ===========================================

/**
 * Get settings from the plugin, or return fallback defaults if plugin not available
 */
function getSettings(): PluginSettings {
  const raw = getPluginSettingsRaw();
  if (raw) {
    return { ...FALLBACK_SETTINGS, ...raw };
  }
  return FALLBACK_SETTINGS;
}

/**
 * Get a specific setting value
 */
function getSetting<K extends keyof PluginSettings>(key: K): PluginSettings[K] {
  try {
    const settings = getSettings();
    return settings[key];
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('[settingsAccessor] Error getting setting:', key, error);
    return FALLBACK_SETTINGS[key];
  }
}

/**
 * Check if the settings plugin is installed and enabled
 */
function isPluginAvailable(): boolean {
  return getPluginSettingsRaw() !== null;
}

/**
 * Get complete theme object with configurable values from settings
 * and non-configurable values from constants.
 * This is the facade/wrapper that components should use.
 */
function getTheme(): ResolvedTheme {
  const settings = getSettings();

  return {
    grid: {
      lines: resolveGridLineColor(settings.gridLineColor),
      lineWidth: settings.gridLineWidth,
      background: resolveBackground(settings.backgroundColor)
    },
    cells: {
      fill: THEME.cells.fill,
      border: settings.borderColor,
      borderWidth: THEME.cells.borderWidth
    },
    compass: {
      color: THEME.compass.color,
      size: THEME.compass.size
    },
    // Note: decorativeBorder is defined inline where needed (e.g., exportOperations)
    // not in THEME constants
    decorativeBorder: {
      color: '#8b7355',
      width: 20,
      dashArray: ''
    },
    coordinateKey: settings.coordinateKeyColor,
    fogOfWar: {
      color: settings.fogOfWarColor,
      opacity: settings.fogOfWarOpacity,
      image: settings.fogOfWarImage,
      blurEnabled: settings.fogOfWarBlurEnabled,
      blurFactor: settings.fogOfWarBlurFactor
    }
  };
}

/**
 * Get effective settings for a map, merging map-specific overrides with global settings
 */
function getEffectiveSettings(
  mapSettings: MapSpecificSettings | null | undefined,
  globalSettings: PluginSettings | null = null
): PluginSettings {
  // Get global settings if not provided
  const globals = globalSettings || getSettings();
  
  // If map has no settings or is using global settings, return global settings
  if (!mapSettings || mapSettings.useGlobalSettings) {
    return {
      ...globals,
      gridLineColor: resolveGridLineColor(globals.gridLineColor),
      backgroundColor: resolveBackground(globals.backgroundColor)
    };
  }

  // Merge global settings with map overrides (map overrides take precedence)
  const merged = { ...globals, ...mapSettings.overrides };
  return {
    ...merged,
    gridLineColor: resolveGridLineColor(merged.gridLineColor),
    backgroundColor: resolveBackground(merged.backgroundColor)
  };
}

/**
 * Get object customization settings from the plugin for a specific map type
 * Returns object overrides, custom objects, and custom categories
 */
function getObjectSettings(mapType: 'hex' | 'grid' = 'grid'): ObjectSettings {
  const raw = getPluginSettingsRaw();
  if (raw) {
    if (mapType === 'hex') {
      return {
        objectOverrides: raw.hexObjectOverrides || {},
        customObjects: raw.customHexObjects || [],
        customCategories: raw.customHexCategories || []
      };
    } else {
      return {
        objectOverrides: raw.gridObjectOverrides || {},
        customObjects: raw.customGridObjects || [],
        customCategories: raw.customGridCategories || []
      };
    }
  }
  return FALLBACK_OBJECT_SETTINGS;
}

/**
 * Get object settings from a specific object set by ID
 * Returns null if the set is not found (caller should fall back to global)
 */
function getObjectSettingsForSet(setId: string, mapType: 'hex' | 'grid' = 'grid'): ObjectSettings | null {
  const raw = getPluginSettingsRaw();
  if (!raw) return null;

  const sets = raw.objectSets ?? [];
  const set = sets.find((s) => s.id === setId);
  if (set == null) return null;

  const sideData = mapType === 'hex'
    ? (set.data?.hex ?? set.data?.grid)
    : (set.data?.grid ?? set.data?.hex);
  if (sideData == null) return FALLBACK_OBJECT_SETTINGS;

  return {
    objectOverrides: sideData.objectOverrides ?? {},
    customObjects: sideData.customObjects ?? [],
    customCategories: sideData.customCategories ?? []
  };
}

/**
 * Get color palette settings from the plugin
 * Returns resolved color palette (built-in with overrides + custom colors)
 */
function getColorPaletteSettings(): ResolvedColorEntry[] {
  const raw = getPluginSettingsRaw();
  if (raw != null) {
    const colorPaletteOverrides: Record<string, ColorOverride> = raw.colorPaletteOverrides ?? {};
    const customPaletteColors: PaletteColor[] = raw.customPaletteColors ?? [];

    const resolvedBuiltIns: ResolvedColorEntry[] = BUILT_IN_COLORS
      .filter(c => colorPaletteOverrides[c.id]?.hidden !== true)
      .map((c, index) => {
        const override = colorPaletteOverrides[c.id];
        if (override != null) {
          const { hidden: _hidden, ...overrideProps } = override;
          return {
            ...c,
            ...overrideProps,
            order: override.order ?? index,
            isBuiltIn: true,
            isModified: true
          };
        }
        return { ...c, order: index, isBuiltIn: true, isModified: false };
      });

    const resolvedCustom: ResolvedColorEntry[] = customPaletteColors.map((c, index) => ({
      ...c,
      order: c.order ?? (100 + index),
      isCustom: true,
      isBuiltIn: false
    }));

    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
  }

  return BUILT_IN_COLORS.map((c, index) => ({
    ...c,
    order: index,
    isBuiltIn: true,
    isModified: false
  }));
}

// ===========================================
// Exports
// ===========================================

/**
 * Get configured tileset folder paths from the settings plugin
 */
function getTilesetFolders(): string[] {
  try {
    const settings = getSettings();
    return (settings as PluginSettings & { tilesetFolders?: string[] }).tilesetFolders ?? [];
  } catch {
    return [];
  }
}

export { setPlugin, clearPlugin, getApp, getDataFilePath, getSettings, getSetting, isPluginAvailable, getTheme, getEffectiveSettings, getObjectSettings, getObjectSettingsForSet, getColorPaletteSettings, getTilesetFolders, FALLBACK_SETTINGS, BUILT_IN_COLORS };
export type { WindrosePluginRef };