// utils/colorOperations.js - Color palette and utilities

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { getColorPaletteSettings, BUILT_IN_COLORS } = await requireModuleByName("settingsAccessor.js");

const DEFAULT_COLOR = '#c4a57b'; // Tan/brown - the original default

// Static fallback palette for backward compatibility
// Components should prefer getColorPalette() for dynamic colors
const COLOR_PALETTE = BUILT_IN_COLORS;

/**
 * Get the current color palette (including customizations from settings)
 * This is the preferred way to get colors - it includes user customizations
 * @returns {Array} Array of color objects { id, color, label, isBuiltIn?, isCustom?, isModified? }
 */
function getColorPalette() {
  try {
    return getColorPaletteSettings();
  } catch (error) {
    // Fallback to built-in colors
    return BUILT_IN_COLORS;
  }
}

/**
 * Get color for a cell (handles backward compatibility)
 * @param {Object} cell - Cell object
 * @returns {string} Hex color
 */
function getCellColor(cell) {
  return cell.color || DEFAULT_COLOR;
}

/**
 * Get color definition by hex value from current palette
 * @param {string} colorHex - Hex color value
 * @returns {Object|null} Color definition or null
 */
function getColorByHex(colorHex) {
  const palette = getColorPalette();
  return palette.find(c => c.color === colorHex) || null;
}

/**
 * Check if color is default
 * @param {string} colorHex - Hex color value
 * @returns {boolean} True if default color
 */
function isDefaultColor(colorHex) {
  return !colorHex || colorHex === DEFAULT_COLOR;
}

return {
  DEFAULT_COLOR,
  COLOR_PALETTE,      // Static fallback for backward compatibility
  getColorPalette,    // Dynamic palette with user customizations (preferred)
  getCellColor,
  getColorByHex,
  isDefaultColor
};