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
  expandedByDefault: false
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

return { getSettings, getSetting, isPluginAvailable, getTheme, getEffectiveSettings, FALLBACK_SETTINGS };