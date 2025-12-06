// settingsAccessor.js - Utility to access plugin settings with fallback defaults

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { THEME, DEFAULTS } = await requireModuleByName("dmtConstants.js");

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
  distanceDisplayFormat: DEFAULTS.distance.displayFormat
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
    coordinateKey: settings.coordinateKeyColor
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
 * Get object customization settings from the plugin
 * Returns object overrides, custom objects, and custom categories
 * @returns {Object} Object settings { objectOverrides, customObjects, customCategories }
 */
function getObjectSettings() {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return FALLBACK_OBJECT_SETTINGS;
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      return {
        objectOverrides: plugin.settings.objectOverrides || {},
        customObjects: plugin.settings.customObjects || [],
        customCategories: plugin.settings.customCategories || []
      };
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access object settings:', error);
  }
  
  return FALLBACK_OBJECT_SETTINGS;
}

return { getSettings, getSetting, isPluginAvailable, getTheme, getEffectiveSettings, getObjectSettings, FALLBACK_SETTINGS };