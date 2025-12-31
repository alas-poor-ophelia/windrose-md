/**
 * settingsAccessor.ts
 * Utility to access plugin settings with fallback defaults
 */

// Type-only imports
import type {
  PluginSettings,
  ResolvedTheme,
  BuiltInColor,
  ObjectSettings,
  ResolvedColorEntry,
  MapSpecificSettings,
  HexOrientation,
  DiagonalRule,
  DistanceDisplayFormat,
  CoordinateKeyMode,
  HexColor
} from '#types/settings/settings.types';
import type { Theme, Defaults } from '../utils/dmtConstants';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { THEME, DEFAULTS } = await requireModuleByName("dmtConstants.ts") as {
  THEME: Theme;
  DEFAULTS: Defaults;
};

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
  hexOrientation: DEFAULTS.hexOrientation as HexOrientation,
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
  gridDiagonalRule: DEFAULTS.distance.gridDiagonalRule as DiagonalRule,
  distanceDisplayFormat: DEFAULTS.distance.displayFormat as DistanceDisplayFormat,
  
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
// Type for Obsidian plugin access
// ===========================================

interface PluginInstance {
  settings?: Partial<PluginSettings>;
}

interface PluginsCollection {
  plugins: Record<string, PluginInstance>;
}

interface ObsidianApp {
  plugins: PluginsCollection;
}

// ===========================================
// Settings Access Functions
// ===========================================

/**
 * Get settings from the plugin, or return fallback defaults if plugin not available
 */
function getSettings(): PluginSettings {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !(dc as { app?: ObsidianApp }).app || !(dc as { app: ObsidianApp }).app.plugins) {
      return FALLBACK_SETTINGS;
    }
    
    // Try to get plugin settings
    const app = (dc as { app: ObsidianApp }).app;
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      // Merge with fallbacks to ensure all keys exist
      return { ...FALLBACK_SETTINGS, ...plugin.settings };
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access plugin settings:', error);
  }
  
  // Return fallbacks if plugin not available
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
    console.warn('[settingsAccessor] Error getting setting:', key, error);
    return FALLBACK_SETTINGS[key];
  }
}

/**
 * Check if the settings plugin is installed and enabled
 */
function isPluginAvailable(): boolean {
  try {
    if (!dc || !(dc as { app?: ObsidianApp }).app || !(dc as { app: ObsidianApp }).app.plugins) {
      return false;
    }
    const app = (dc as { app: ObsidianApp }).app;
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    return !!(plugin && plugin.settings);
  } catch (error) {
    return false;
  }
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
      lines: settings.gridLineColor,
      lineWidth: settings.gridLineWidth,
      background: settings.backgroundColor
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
    return globals;
  }
  
  // Merge global settings with map overrides (map overrides take precedence)
  return {
    ...globals,
    ...mapSettings.overrides
  };
}

/**
 * Get object customization settings from the plugin for a specific map type
 * Returns object overrides, custom objects, and custom categories
 */
function getObjectSettings(mapType: 'hex' | 'grid' = 'grid'): ObjectSettings {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !(dc as { app?: ObsidianApp }).app || !(dc as { app: ObsidianApp }).app.plugins) {
      return FALLBACK_OBJECT_SETTINGS;
    }
    
    // Try to get plugin settings
    const app = (dc as { app: ObsidianApp }).app;
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      // Use map-type specific settings keys
      if (mapType === 'hex') {
        return {
          objectOverrides: plugin.settings.hexObjectOverrides || {},
          customObjects: plugin.settings.customHexObjects || [],
          customCategories: plugin.settings.customHexCategories || []
        };
      } else {
        return {
          objectOverrides: plugin.settings.gridObjectOverrides || {},
          customObjects: plugin.settings.customGridObjects || [],
          customCategories: plugin.settings.customGridCategories || []
        };
      }
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access object settings:', error);
  }
  
  return FALLBACK_OBJECT_SETTINGS;
}

/**
 * Get color palette settings from the plugin
 * Returns resolved color palette (built-in with overrides + custom colors)
 */
function getColorPaletteSettings(): ResolvedColorEntry[] {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !(dc as { app?: ObsidianApp }).app || !(dc as { app: ObsidianApp }).app.plugins) {
      return BUILT_IN_COLORS.map(c => ({ 
        ...c, 
        order: 0,
        isBuiltIn: true, 
        isModified: false 
      }));
    }
    
    // Try to get plugin settings
    const app = (dc as { app: ObsidianApp }).app;
    const plugin = app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      const { colorPaletteOverrides = {}, customPaletteColors = [] } = plugin.settings;
      
      // Resolve built-in colors with overrides
      const resolvedBuiltIns: ResolvedColorEntry[] = BUILT_IN_COLORS
        .filter(c => !colorPaletteOverrides[c.id]?.hidden)
        .map((c, index) => {
          const override = colorPaletteOverrides[c.id];
          if (override) {
            const { hidden, ...overrideProps } = override;
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
      
      // Add custom colors
      const resolvedCustom: ResolvedColorEntry[] = (customPaletteColors || []).map((c, index) => ({
        ...c,
        order: c.order ?? (100 + index),
        isCustom: true,
        isBuiltIn: false
      }));
      
      return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => a.order - b.order);
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access color palette settings:', error);
  }
  
  // Return default colors if plugin not available
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

return { 
  getSettings, 
  getSetting, 
  isPluginAvailable, 
  getTheme, 
  getEffectiveSettings, 
  getObjectSettings, 
  getColorPaletteSettings, 
  FALLBACK_SETTINGS, 
  BUILT_IN_COLORS 
};