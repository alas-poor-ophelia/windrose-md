/**
 * distanceOperations.ts
 * 
 * Utilities for distance measurement formatting and settings resolution.
 * Used by the distance measurement tool to format display output and
 * resolve effective settings from global defaults and per-map overrides.
 */

// Type-only imports
import type { MapType } from '#types/core/map.types';
import type { 
  DiagonalRule, 
  DistanceDisplayFormat,
  PluginSettings
} from '#types/settings/settings.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { DEFAULTS } = await requireModuleByName("dmtConstants.ts") as {
  DEFAULTS: {
    distance: {
      perCellGrid: number;
      perCellHex: number;
      unitGrid: string;
      unitHex: string;
      gridDiagonalRule: DiagonalRule;
      displayFormat: DistanceDisplayFormat;
    }
  }
};

// ===========================================
// Type Definitions
// ===========================================

/** Per-map distance settings override */
export interface MapDistanceOverrides {
  distancePerCell?: number;
  distanceUnit?: string;
  gridDiagonalRule?: DiagonalRule;
  displayFormat?: DistanceDisplayFormat;
}

/** Resolved distance settings */
export interface ResolvedDistanceSettings {
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

// ===========================================
// Distance Formatting
// ===========================================

/**
 * Format a distance measurement for display
 * @param cellDistance - Distance in cells
 * @param distancePerCell - Real-world units per cell
 * @param unit - Unit string (e.g., 'ft', 'mi', 'm', 'km')
 * @param displayFormat - 'cells' | 'units' | 'both'
 * @returns Formatted distance string
 */
function formatDistance(
  cellDistance: number,
  distancePerCell: number,
  unit: string,
  displayFormat: DistanceDisplayFormat
): string {
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

// ===========================================
// Settings Resolution
// ===========================================

/**
 * Get effective distance settings for a map
 * Merges global defaults with per-map overrides
 * @param mapType - 'grid' or 'hex'
 * @param globalSettings - Settings from plugin or fallbacks
 * @param mapOverrides - Per-map distance settings (or null)
 * @returns Resolved distance settings
 */
function getEffectiveDistanceSettings(
  mapType: MapType,
  globalSettings: Partial<PluginSettings> | null | undefined,
  mapOverrides: MapDistanceOverrides | null | undefined
): ResolvedDistanceSettings {
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

// ===========================================
// Exports
// ===========================================

return { formatDistance, getEffectiveDistanceSettings };