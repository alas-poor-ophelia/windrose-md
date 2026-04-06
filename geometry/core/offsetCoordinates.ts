/**
 * offsetCoordinates.ts
 *
 * Utilities for converting between axial and offset coordinates
 * for hexagonal grids (both flat-top and pointy-top).
 *
 * Coordinate Systems:
 * - Axial (q, r): Used for storage and hex math. Creates parallelogram when iterated.
 * - Offset (col, row): Used for bounds and iteration. Creates rectangle when iterated.
 *
 * For flat-top hexes (odd-q offset):
 * - Columns are vertical (odd columns shift down by 0.5 hex)
 * - Rows are horizontal
 * - maxCol = width, maxRow = height
 *
 * For pointy-top hexes (odd-r offset):
 * - Rows are vertical (odd rows shift right by 0.5 hex)
 * - Columns are horizontal
 * - maxCol = horizontal extent, maxRow = vertical extent
 *
 * Both systems create rectangular iteration while preserving hex geometry.
 */

import type { OffsetCoords, GridBounds } from '#types/core/geometry.types';
import type { HexOrientation } from '#types/settings/settings.types';

/** Axial coordinates for hex grids */
interface AxialCoords {
  q: number;
  r: number;
}

/**
 * Convert axial coordinates to offset coordinates
 * For flat-top hexes: uses odd-q offset (columns vertical, odd cols shift down)
 * For pointy-top hexes: uses odd-r offset (rows vertical, odd rows shift right)
 */
function axialToOffset(q: number, r: number, orientation: HexOrientation = 'flat'): OffsetCoords {
  if (orientation === 'flat') {
    // Odd-Q offset: columns are vertical, odd columns shift down by 0.5 hex
    const col = q;
    const row = r + (q - (q & 1)) / 2;
    return { col, row };
  } else {
    // Odd-R offset: rows are vertical, odd rows shift right by 0.5 hex
    const col = q + (r - (r & 1)) / 2;
    const row = r;
    return { col, row };
  }
}

/**
 * Convert offset coordinates to axial coordinates
 * For flat-top hexes: uses odd-q offset (columns vertical)
 * For pointy-top hexes: uses odd-r offset (rows vertical)
 */
function offsetToAxial(col: number, row: number, orientation: HexOrientation = 'flat'): AxialCoords {
  if (orientation === 'flat') {
    // Odd-Q offset: columns are vertical, odd columns shift down by 0.5 hex
    const q = col;
    const r = row - (col - (col & 1)) / 2;
    return { q, r };
  } else {
    // Odd-R offset: rows are vertical, odd rows shift right by 0.5 hex
    const q = col - (row - (row & 1)) / 2;
    const r = row;
    return { q, r };
  }
}

/**
 * Check if offset coordinates are within rectangular bounds
 * Works for both flat-top and pointy-top hexes
 */
function isWithinOffsetBounds(col: number, row: number, bounds: GridBounds | null): boolean {
  if (!bounds) return true; // No bounds = infinite
  // Exclusive bounds: maxCol=26 means 26 columns (indices 0-25)
  return col >= 0 && col < bounds.maxCol &&
         row >= 0 && row < bounds.maxRow;
}

/**
 * Convert column number to Excel-style letter label
 * For flat-top: represents vertical columns (A, B, C...)
 * For pointy-top: represents horizontal columns (A, B, C...)
 */
function columnToLabel(col: number): string {
  let label = '';
  let num = col;

  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }

  return label;
}

/**
 * Convert row number to 1-based numeric label
 * For flat-top: represents horizontal rows (1, 2, 3...)
 * For pointy-top: represents vertical rows (1, 2, 3...)
 */
function rowToLabel(row: number): string {
  return String(row + 1);
}

return {
  axialToOffset,
  offsetToAxial,
  isWithinOffsetBounds,
  columnToLabel,
  rowToLabel
};
