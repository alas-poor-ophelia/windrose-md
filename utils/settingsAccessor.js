// settingsAccessor.js - Utility to access plugin settings with fallback defaults

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { THEME, DEFAULTS } = await requireModuleByName("dmtConstants.js");

// Built-in color palette - matches settings plugin
const BUILT_IN_COLORS = [
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

// Fallback settings based on theme constants
const FALLBACK_SETTINGS = {
  version: '1.0.0',
  hexOrientation: DEFAULTS.hexOrientation,
  gridLineColor: THEME.grid.lines,
  gridLineWidth: THEME.grid.lineWidth,
  backgroundColor: THEME.grid.background,
  borderColor: THEME.cells.border,  
  coordinateKeyColor: THEME.coordinateKey.color,
  coordinateTextColor: THEME.coordinateText.color,
  coordinateTextShadow: THEME.coordinateText.shadow,
  coordinateKeyMode: 'hold', // 'hold' or 'toggle'
  expandedByDefault: false,
  
  // Canvas dimensions
  canvasHeight: 600,  // Desktop/default canvas height in pixels
  canvasHeightMobile: 400,  // Mobile/touch device canvas height in pixels
  
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
  fogOfWarImage: null,  // Optional: vault path to tileable image
  fogOfWarBlurEnabled: THEME.fogOfWar.blurEnabled,
  fogOfWarBlurFactor: THEME.fogOfWar.blurFactor,
  
  // Controls visibility
  alwaysShowControls: false,
  
  // Shape preview settings (Input & Controls)
  shapePreviewKbm: true,      // Live preview on hover for keyboard/mouse (default ON)
  shapePreviewTouch: false    // 3-tap confirmation flow for touch (default OFF)
};

/**
 * Get settings from the plugin, or return fallback defaults if plugin not available
 */
function getSettings() {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return FALLBACK_SETTINGS;
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
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
function getSetting(key) {
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
function isPluginAvailable() {
  try {
    if (!dc || !dc.app || !dc.app.plugins) {
      return false;
    }
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    return !!(plugin && plugin.settings);
  } catch (error) {
    return false;
  }
}

/**
 * Get complete theme object with configurable values from settings
 * and non-configurable values from constants
 * This is the facade/wrapper that components should use
 */
function getTheme() {
  const settings = getSettings();
  
  return {
    grid: {
      lines: settings.gridLineColor,
      lineWidth: settings.gridLineWidth,
      background: settings.backgroundColor
    },
    cells: {
      fill: THEME.cells.fill,
      border: settings.borderColor,  // Configurable cell/wall border color
      borderWidth: THEME.cells.borderWidth
    },
    compass: {
      color: THEME.compass.color,
      size: THEME.compass.size
    },
    decorativeBorder: THEME.decorativeBorder,  // Hardcoded decorative border (not configurable)
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
 * @param {Object} mapSettings - Map-specific settings object { useGlobalSettings, overrides }
 * @param {Object} globalSettings - Optional global settings (will be fetched if not provided)
 * @returns {Object} - Merged settings object
 */
function getEffectiveSettings(mapSettings, globalSettings = null) {
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
 * Default object customization settings
 * Used when settings plugin is not available or doesn't have object settings
 */
const FALLBACK_OBJECT_SETTINGS = {
  objectOverrides: {},
  customObjects: [],
  customCategories: []
};

/**
 * Get object customization settings from the plugin for a specific map type
 * Returns object overrides, custom objects, and custom categories
 * @param {string} mapType - 'hex' or 'grid' (defaults to 'grid')
 * @returns {Object} Object settings { objectOverrides, customObjects, customCategories }
 */
function getObjectSettings(mapType = 'grid') {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return FALLBACK_OBJECT_SETTINGS;
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
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
 * @returns {Array} Array of color objects { id, color, label, isBuiltIn, isCustom, isModified }
 */
function getColorPaletteSettings() {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return BUILT_IN_COLORS.map(c => ({ ...c, isBuiltIn: true, isModified: false }));
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      const { colorPaletteOverrides = {}, customPaletteColors = [] } = plugin.settings;
      
      // Resolve built-in colors with overrides
      const resolvedBuiltIns = BUILT_IN_COLORS
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
      const resolvedCustom = customPaletteColors.map((c, index) => ({
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
  return BUILT_IN_COLORS.map(c => ({ ...c, isBuiltIn: true, isModified: false }));
}

return { getSettings, getSetting, isPluginAvailable, getTheme, getEffectiveSettings, getObjectSettings, getColorPaletteSettings, FALLBACK_SETTINGS, BUILT_IN_COLORS };