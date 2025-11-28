// utils/colorOperations.js - Color palette and utilities

const DEFAULT_COLOR = '#c4a57b'; // Tan/brown - the original default

const COLOR_PALETTE = [
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

/**
 * Get color for a cell (handles backward compatibility)
 * @param {Object} cell - Cell object
 * @returns {string} Hex color
 */
function getCellColor(cell) {
  return cell.color || DEFAULT_COLOR;
}

/**
 * Get color definition by hex value
 * @param {string} colorHex - Hex color value
 * @returns {Object|null} Color definition or null
 */
function getColorByHex(colorHex) {
  return COLOR_PALETTE.find(c => c.color === colorHex) || null;
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
  COLOR_PALETTE,
  getCellColor,
  getColorByHex,
  isDefaultColor
};