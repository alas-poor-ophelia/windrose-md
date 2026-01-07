/**
 * borderCalculator.ts - Smart border detection for exterior edges
 */

import type { Cell } from '#types/core/cell.types';

/** Border side identifier */
type BorderSide = 'top' | 'right' | 'bottom' | 'left';

/** Lookup map for cell coordinates */
type CellLookup = Set<string>;

/** Adjacent direction definition */
interface AdjacentDirection {
  dx: number;
  dy: number;
  side: BorderSide;
}

/** Adjacent directions for border checking */
const ADJACENT_DIRECTIONS: AdjacentDirection[] = [
  { dx: 0, dy: -1, side: 'top' },
  { dx: 1, dy: 0, side: 'right' },
  { dx: 0, dy: 1, side: 'bottom' },
  { dx: -1, dy: 0, side: 'left' }
];

/**
 * Check if a cell exists at given coordinates
 */
function cellExists(cells: Cell[], x: number, y: number): boolean {
  return cells.some(cell => cell.x === x && cell.y === y);
}

/**
 * Calculate which borders should be drawn for a cell
 * Only returns borders where there's NO adjacent cell (exterior edges)
 */
function calculateBorders(cells: Cell[], x: number, y: number): BorderSide[] {
  const borders: BorderSide[] = [];

  for (const dir of ADJACENT_DIRECTIONS) {
    const adjX = x + dir.dx;
    const adjY = y + dir.dy;

    if (!cellExists(cells, adjX, adjY)) {
      borders.push(dir.side);
    }
  }

  return borders;
}

/**
 * Build a lookup map for faster cell existence checks
 * Returns a Set with keys like "x,y"
 */
function buildCellLookup(cells: Cell[]): CellLookup {
  const lookup = new Set<string>();
  for (const cell of cells) {
    lookup.add(`${cell.x},${cell.y}`);
  }
  return lookup;
}

/**
 * Check if cell exists in lookup map
 */
function cellExistsInLookup(lookup: CellLookup, x: number, y: number): boolean {
  return lookup.has(`${x},${y}`);
}

/**
 * Calculate borders using lookup map for better performance
 */
function calculateBordersOptimized(lookup: CellLookup, x: number, y: number): BorderSide[] {
  const borders: BorderSide[] = [];

  for (const dir of ADJACENT_DIRECTIONS) {
    const adjX = x + dir.dx;
    const adjY = y + dir.dy;

    if (!cellExistsInLookup(lookup, adjX, adjY)) {
      borders.push(dir.side);
    }
  }

  return borders;
}

return {
  calculateBorders,
  cellExists,
  buildCellLookup,
  calculateBordersOptimized
};
