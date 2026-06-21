/**
 * colorOperations.ts
 * 
 * Color palette and utilities for cell coloring.
 */

// Type-only imports
import type { Cell } from '#types/core/cell.types';

import { getColorPaletteSettings, BUILT_IN_COLORS } from '../core/settingsAccessor';


// ===========================================
// Types
// ===========================================

/** Color definition in the palette */
export interface ColorDefinition {
  id: string;
  color: string;
  label: string;
  isBuiltIn?: boolean;
  isCustom?: boolean;
  isModified?: boolean;
}

// ===========================================
// Constants
// ===========================================

/** Default cell color (tan/brown) */
const DEFAULT_COLOR = '#c4a57b';

/** 
 * Static fallback palette for backward compatibility.
 * Components should prefer getColorPalette() for dynamic colors.
 */
const COLOR_PALETTE: ColorDefinition[] = BUILT_IN_COLORS;

// ===========================================
// Functions
// ===========================================

/**
 * Get the current color palette (including customizations from settings).
 * This is the preferred way to get colors - it includes user customizations.
 */
function getColorPalette(): ColorDefinition[] {
  try {
    return getColorPaletteSettings();
  } catch (_error) {
    // Fallback to built-in colors
    return BUILT_IN_COLORS;
  }
}

/**
 * Get color for a cell (handles backward compatibility).
 */
function getCellColor(cell: Cell): string {
  return cell.color || DEFAULT_COLOR;
}

/**
 * Get color definition by hex value from current palette.
 */
function getColorByHex(colorHex: string): ColorDefinition | null {
  const palette = getColorPalette();
  return palette.find(c => c.color === colorHex) ?? null;
}

/**
 * Check if color is the default color.
 */
function isDefaultColor(colorHex: string | null | undefined): boolean {
  return colorHex == null || colorHex === '' || colorHex === DEFAULT_COLOR;
}

// ===========================================
// Exports
// ===========================================

export { DEFAULT_COLOR, COLOR_PALETTE, getColorPalette, getCellColor, getColorByHex, isDefaultColor };