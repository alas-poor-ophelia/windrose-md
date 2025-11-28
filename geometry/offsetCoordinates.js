/**
 * offsetCoordinates.js
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

/**
 * Convert axial coordinates to offset coordinates
 * For flat-top hexes: uses odd-q offset (columns vertical, odd cols shift down)
 * For pointy-top hexes: uses odd-r offset (rows vertical, odd rows shift right)
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @param {string} orientation - 'flat' or 'pointy' (default: 'flat')
 * @returns {{col: number, row: number}} Offset coordinates
 */
function axialToOffset(q, r, orientation = 'flat') {
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
 * @param {number} col - Column coordinate
 * @param {number} row - Row coordinate
 * @param {string} orientation - 'flat' or 'pointy' (default: 'flat')
 * @returns {{q: number, r: number}} Axial coordinates
 */
function offsetToAxial(col, row, orientation = 'flat') {
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
 * @param {number} col - Column coordinate
 * @param {number} row - Row coordinate
 * @param {{maxCol: number, maxRow: number}} bounds - Rectangular bounds
 * @returns {boolean} True if within bounds
 */
function isWithinOffsetBounds(col, row, bounds) {
  if (!bounds) return true; // No bounds = infinite
  // Exclusive bounds: maxCol=26 means 26 columns (indices 0-25)
  return col >= 0 && col < bounds.maxCol && 
         row >= 0 && row < bounds.maxRow;
}

/**
 * Convert column number to Excel-style letter label
 * For flat-top: represents vertical columns (A, B, C...)
 * For pointy-top: represents horizontal columns (A, B, C...)
 * @param {number} col - Column number (0-based)
 * @returns {string} Letter label (A, B, C... Z, AA, AB...)
 */
function columnToLabel(col) {
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
 * @param {number} row - Row number (0-based)
 * @returns {string} Numeric label (1, 2, 3...)
 */
function rowToLabel(row) {
  return String(row + 1);
}


// Export the module
return { 
  axialToOffset, 
  offsetToAxial, 
  isWithinOffsetBounds,
  columnToLabel,
  rowToLabel
};