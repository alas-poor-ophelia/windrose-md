/**
 * distanceOperations.js
 * 
 * Utilities for distance measurement formatting and settings resolution.
 * Used by the distance measurement tool to format display output and
 * resolve effective settings from global defaults and per-map overrides.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);
const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");

/**
 * Format a distance measurement for display
 * @param {number} cellDistance - Distance in cells
 * @param {number} distancePerCell - Real-world units per cell
 * @param {string} unit - Unit string (e.g., 'ft', 'mi', 'm', 'km')
 * @param {string} displayFormat - 'cells' | 'units' | 'both'
 * @returns {string} Formatted distance string
 */
function formatDistance(cellDistance, distancePerCell, unit, displayFormat) {
  const totalDistance = cellDistance * distancePerCell;
  
  // Round for cleaner display (1 decimal if needed, no trailing zeros)
  const roundedCells = Number.isInteger(cellDistance) 
    ? cellDistance 
    : Math.round(cellDistance * 10) / 10;
  const roundedDistance = Number.isInteger(totalDistance) 
    ? totalDistance 
    : Math.round(totalDistance * 10) / 10;
  
  const cellLabel = roundedCells === 1 ? 'cell' : 'cells';
  const unitDisplay = unit || '';
  
  switch (displayFormat) {
    case 'cells':
      return `${roundedCells} ${cellLabel}`;
    case 'units':
      return `${roundedDistance} ${unitDisplay}`.trim();
    case 'both':
    default:
      if (unitDisplay) {
        return `${roundedCells} ${cellLabel} (${roundedDistance} ${unitDisplay})`;
      }
      return `${roundedCells} ${cellLabel}`;
  }
}

/**
 * Get effective distance settings for a map
 * Merges global defaults with per-map overrides
 * @param {string} mapType - 'grid' or 'hex'
 * @param {Object} globalSettings - Settings from plugin or fallbacks
 * @param {Object} mapOverrides - Per-map distance settings (or null)
 * @returns {Object} Resolved distance settings
 */
function getEffectiveDistanceSettings(mapType, globalSettings, mapOverrides) {
  const isHex = mapType === 'hex';
  
  // Get appropriate defaults based on map type
  const defaultPerCell = isHex 
    ? (globalSettings?.distancePerCellHex ?? DEFAULTS.distance.perCellHex)
    : (globalSettings?.distancePerCellGrid ?? DEFAULTS.distance.perCellGrid);
  const defaultUnit = isHex
    ? (globalSettings?.distanceUnitHex ?? DEFAULTS.distance.unitHex)
    : (globalSettings?.distanceUnitGrid ?? DEFAULTS.distance.unitGrid);
  
  return {
    distancePerCell: mapOverrides?.distancePerCell ?? defaultPerCell,
    distanceUnit: mapOverrides?.distanceUnit ?? defaultUnit,
    gridDiagonalRule: mapOverrides?.gridDiagonalRule ?? globalSettings?.gridDiagonalRule ?? DEFAULTS.distance.gridDiagonalRule,
    displayFormat: mapOverrides?.displayFormat ?? globalSettings?.distanceDisplayFormat ?? DEFAULTS.distance.displayFormat
  };
}

return { formatDistance, getEffectiveDistanceSettings };