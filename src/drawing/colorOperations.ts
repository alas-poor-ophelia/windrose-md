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
interface ColorDefinition {
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
  } catch {
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

/** #rgb, #rgba, #rrggbb or #rrggbbaa, with or without the leading hash */
const HEX_COLOR_PATTERN = /^#?([0-9a-f]{3,8})$/i;

/**
 * Canonicalize a hex color to lowercase `#rrggbb`. Shorthand is expanded,
 * an alpha channel is dropped (paint opacity is stored separately), and
 * anything that is not hex — a CSS name, `rgb(...)`, an empty string —
 * returns null so callers can fall back to a plain string comparison.
 */
function normalizeHexColor(color: string | null | undefined): string | null {
  if (color == null) return null;
  const match = HEX_COLOR_PATTERN.exec(color.trim());
  if (match == null) return null;
  const digits = match[1].toLowerCase();
  if (digits.length === 3 || digits.length === 4) {
    return '#' + digits.slice(0, 3).split('').map(c => c + c).join('');
  }
  if (digits.length === 6 || digits.length === 8) {
    return '#' + digits.slice(0, 6);
  }
  return null;
}

/**
 * Compare two colors for visual equality. Two hex colors match on their
 * canonical `#rrggbb` form, so `#ABC`, `#aabbcc` and `#AABBCCFF` are one
 * color; anything else falls back to a trimmed case-insensitive compare.
 */
function colorsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const hexA = normalizeHexColor(a);
  const hexB = normalizeHexColor(b);
  if (hexA != null && hexB != null) return hexA === hexB;
  if (a == null || b == null) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ===========================================
// Exports
// ===========================================

export { DEFAULT_COLOR, getColorPalette, getCellColor, getColorByHex, isDefaultColor, colorsMatch };