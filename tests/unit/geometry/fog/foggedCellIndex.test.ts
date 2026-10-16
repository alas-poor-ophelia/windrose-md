import { describe, it, expect } from 'vitest';
import type { MapLayer } from '#types/core/map.types';
import { isCellFoggedIndexed, getFoggedCellSet } from '../../../../src/geometry/fog/foggedCellIndex';
import { isCellFogged } from '../../../../src/persistence/layerAccessor';

function layerWith(foggedCells: { col: number; row: number }[], enabled = true): MapLayer {
  return { fogOfWar: { enabled, foggedCells, texture: null } } as unknown as MapLayer;
}

describe('foggedCellIndex (STRUCT-B-05)', () => {
  it('agrees with the linear isCellFogged for every probe', () => {
    const cells = [{ col: 0, row: 0 }, { col: 3, row: 7 }, { col: -2, row: 5 }, { col: 10, row: 1 }];
    const layer = layerWith(cells);
    for (let col = -3; col <= 11; col++) {
      for (let row = -1; row <= 8; row++) {
        expect(isCellFoggedIndexed(layer, col, row)).toBe(isCellFogged(layer, col, row));
      }
    }
  });

  it('distinguishes keys that a naive concatenation would merge (1,23 vs 12,3)', () => {
    const layer = layerWith([{ col: 1, row: 23 }]);
    expect(isCellFoggedIndexed(layer, 1, 23)).toBe(true);
    expect(isCellFoggedIndexed(layer, 12, 3)).toBe(false);
  });

  it('returns false when fog is disabled or absent', () => {
    expect(isCellFoggedIndexed(layerWith([{ col: 1, row: 1 }], false), 1, 1)).toBe(false);
    expect(isCellFoggedIndexed({} as MapLayer, 1, 1)).toBe(false);
  });

  it('builds the Set once per foggedCells array identity', () => {
    const cells = [{ col: 1, row: 2 }];
    expect(getFoggedCellSet(cells)).toBe(getFoggedCellSet(cells));
    // A new fog array (immutable update) gets a fresh index
    const next = [...cells, { col: 4, row: 4 }];
    expect(getFoggedCellSet(next)).not.toBe(getFoggedCellSet(cells));
    expect(isCellFoggedIndexed(layerWith(next), 4, 4)).toBe(true);
    expect(isCellFoggedIndexed(layerWith(cells), 4, 4)).toBe(false);
  });
});
