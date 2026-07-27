/**
 * rangeOperations Unit Tests
 *
 * Verifies cells-within-range enumeration agrees with getCellDistance under
 * every grid diagonal rule and on hex maps, since the range ring must match
 * the measure tool exactly at the boundary.
 */

import { describe, it, expect } from 'vitest';

import {
  rangeUnitsToCells,
  isCellWithinRange,
  getCellsWithinRange,
  MAX_RANGE_REACH,
} from '../../../src/drawing/rangeOperations';
import { GridGeometry } from '../../../src/geometry/core/GridGeometry';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';

const CELL_SIZE = 32;
const HEX_SIZE = 40;

describe('rangeUnitsToCells', () => {
  it('converts units to cells via distance-per-cell', () => {
    expect(rangeUnitsToCells(30, 5)).toBe(6);
    expect(rangeUnitsToCells(15, 6)).toBe(2.5);
  });

  it('returns 0 for non-positive range or per-cell distance', () => {
    expect(rangeUnitsToCells(0, 5)).toBe(0);
    expect(rangeUnitsToCells(-10, 5)).toBe(0);
    expect(rangeUnitsToCells(30, 0)).toBe(0);
    expect(rangeUnitsToCells(30, NaN)).toBe(0);
  });
});

describe('getCellsWithinRange — square grid', () => {
  const geometry = new GridGeometry(CELL_SIZE);
  const center = { x: 10, y: 10 };

  it("matches Chebyshev disk under the 'equal' rule", () => {
    const cells = getCellsWithinRange(geometry, center, 3, { diagonalRule: 'equal' });
    // All cells with max(|dx|,|dy|) <= 3: a 7x7 square
    expect(cells).toHaveLength(49);
    expect(cells).toContainEqual({ x: 7, y: 7 });
    expect(cells).toContainEqual({ x: 13, y: 13 });
  });

  it("matches the 5/10/5 pattern under the 'alternating' rule", () => {
    const cells = getCellsWithinRange(geometry, center, 3, { diagonalRule: 'alternating' });
    // (2,2) costs 3 (in), (3,3) costs 4 (out), (3,1) costs 3 (in)
    expect(cells).toContainEqual({ x: 12, y: 12 });
    expect(cells).not.toContainEqual({ x: 13, y: 13 });
    expect(cells).toContainEqual({ x: 13, y: 11 });
    expect(cells).toContainEqual({ x: 13, y: 10 });
  });

  it("matches true circle membership under the 'euclidean' rule", () => {
    const cells = getCellsWithinRange(geometry, center, 3, { diagonalRule: 'euclidean' });
    // (2,2) is ~2.83 (in), (3,1) is ~3.16 (out)
    expect(cells).toContainEqual({ x: 12, y: 12 });
    expect(cells).not.toContainEqual({ x: 13, y: 11 });
    expect(cells).toContainEqual({ x: 13, y: 10 });
  });

  it('agrees with getCellDistance for every enumerated and boundary cell', () => {
    const range = 4;
    const rule = { diagonalRule: 'alternating' as const };
    const cells = getCellsWithinRange(geometry, center, range, rule);
    const keys = new Set(cells.map(c => `${c.x},${c.y}`));

    for (let dy = -6; dy <= 6; dy++) {
      for (let dx = -6; dx <= 6; dx++) {
        const x = center.x + dx;
        const y = center.y + dy;
        const inRange = geometry.getCellDistance(center.x, center.y, x, y, rule) <= range;
        expect(keys.has(`${x},${y}`)).toBe(inRange);
      }
    }
  });

  it('includes only the center cell at range 0', () => {
    const cells = getCellsWithinRange(geometry, center, 0);
    expect(cells).toEqual([{ x: 10, y: 10 }]);
  });

  it('returns empty for negative or non-numeric range', () => {
    expect(getCellsWithinRange(geometry, center, -1)).toEqual([]);
    expect(getCellsWithinRange(geometry, center, NaN)).toEqual([]);
  });

  it('includes boundary cells reached through fractional unit conversion', () => {
    // 15 units at 5/cell = exactly 3 cells; the boundary cell must be in
    const rangeInCells = rangeUnitsToCells(15, 5);
    expect(
      isCellWithinRange(geometry, center, { x: 13, y: 10 }, rangeInCells, { diagonalRule: 'equal' })
    ).toBe(true);
    expect(
      isCellWithinRange(geometry, center, { x: 14, y: 10 }, rangeInCells, { diagonalRule: 'equal' })
    ).toBe(false);
  });

  it('caps enumeration reach at MAX_RANGE_REACH', () => {
    const cells = getCellsWithinRange(geometry, center, 1e9, { diagonalRule: 'equal' });
    const side = 2 * MAX_RANGE_REACH + 1;
    expect(cells).toHaveLength(side * side);
  });
});

describe('getCellsWithinRange — hex', () => {
  const geometry = new HexGeometry(HEX_SIZE, 'pointy');
  const center = { x: 0, y: 0 };

  it('returns the classic hex bloom (1 + 6 + 12 at range 2)', () => {
    const cells = getCellsWithinRange(geometry, center, 2);
    expect(cells).toHaveLength(19);
  });

  it('agrees with hex distance at the boundary', () => {
    const cells = getCellsWithinRange(geometry, center, 2);
    // Axial (2,0) is distance 2 (in); (2,1) is distance 3 (out)
    expect(cells).toContainEqual({ x: 2, y: 0 });
    expect(cells).not.toContainEqual({ x: 2, y: 1 });
    // (1,1) is distance 2 (in), (-2,2) is distance 2 (in)
    expect(cells).toContainEqual({ x: 1, y: 1 });
    expect(cells).toContainEqual({ x: -2, y: 2 });
  });

  it('respects hex bounds', () => {
    const bounded = new HexGeometry(HEX_SIZE, 'pointy', { maxCol: 3, maxRow: 3 });
    const cells = getCellsWithinRange(bounded, { x: 0, y: 0 }, 2);
    for (const cell of cells) {
      expect(bounded.isWithinBounds(cell.x, cell.y)).toBe(true);
    }
    expect(cells.length).toBeLessThan(19);
  });

  it('offsets the bloom correctly away from the origin', () => {
    const cells = getCellsWithinRange(geometry, { x: 5, y: -3 }, 1);
    expect(cells).toHaveLength(7);
    expect(cells).toContainEqual({ x: 5, y: -3 });
    expect(cells).toContainEqual({ x: 6, y: -4 });
  });
});
