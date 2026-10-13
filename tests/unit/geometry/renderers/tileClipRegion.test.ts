/**
 * tileClipRegion: the ladder's smart root-tile clip (kgc.26).
 */
import { describe, it, expect } from 'vitest';
import type { Cell } from '#types/core/cell.types';
import type { MapLayer } from '#types/core/map.types';
import { createGeometryLadder } from '../../../../src/geometry/core/createGeometryLadder';
import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';
import { deepRootCellKeys, tileClipHexes, unionHexClipPath, hexClipPathString } from '../../../../src/geometry/renderers/tileClipRegion';

const root = new HexGeometry(80, 'flat', { maxCol: 40, maxRow: 40 });
const ladder = createGeometryLadder(root, { m: 4, minCellPx: 32, maxLevel: 3 });
const hc = (q: number, r: number): Cell => ({ q, r, color: '#123456' });
const layerWith = (levels?: Record<number, Cell[]>): MapLayer => ({
  id: 'L1', name: '1', order: 0, visible: true, cells: [hc(0, 0)], curves: [], edges: [],
  objects: [], textLabels: [], fogOfWar: null, ...(levels ? { levels } : {}),
} as unknown as MapLayer);

describe('deepRootCellKeys', () => {
  it('maps a rung-2 cell to its root ancestor (m=4: (17,0) -> (1,0))', () => {
    const keys = deepRootCellKeys(layerWith({ 2: [hc(17, 0)] }), ladder, 2);
    expect([...keys]).toEqual(['1,0']);
  });

  it('counts rung-1 and rung-2 cells alike, but never level 0', () => {
    const r1 = ladder.ladder.ancestorAt(1, 0, 8);
    const keys = deepRootCellKeys(layerWith({ 1: [hc(0, 8)], 2: [hc(17, 0)] }), ladder, 2);
    expect(keys.has('1,0')).toBe(true);
    expect(keys.has(`${r1.q},${r1.r}`)).toBe(true);
    expect(keys.has('0,0')).toBe(`${r1.q},${r1.r}` === '0,0');
    expect(keys.size).toBe(2);
  });

  it('caps at the active level: a rung-3 cell does not count at level 2', () => {
    const deep = ladder.ladder.ancestorAt(3, 0, 200);
    const layer = layerWith({ 2: [hc(17, 0)], 3: [hc(0, 200)] });
    expect(deepRootCellKeys(layer, ladder, 2).has(`${deep.q},${deep.r}`)).toBe(false);
    expect(deepRootCellKeys(layer, ladder, 3).has(`${deep.q},${deep.r}`)).toBe(true);
  });

  it('is empty without rungs or at level 0, and memoised per levels identity', () => {
    expect(deepRootCellKeys(layerWith(), ladder, 2).size).toBe(0);
    const layer = layerWith({ 1: [hc(4, 0)] });
    expect(deepRootCellKeys(layer, ladder, 0).size).toBe(0);
    expect(deepRootCellKeys(layer, ladder, 1)).toBe(deepRootCellKeys({ ...layer }, ladder, 1));
  });
});

describe('tileClipHexes', () => {
  it('returns null when no neighbour holds deep content', () => {
    expect(tileClipHexes(5, 5, new Set())).toBeNull();
    expect(tileClipHexes(5, 5, new Set(['5,5', '9,9']))).toBeNull();
  });

  it('keeps self plus the five clear neighbours, dropping the deep one', () => {
    const hexes = tileClipHexes(5, 5, new Set(['6,5']));
    expect(hexes).not.toBeNull();
    const keys = hexes!.map((h) => `${h.q},${h.r}`);
    expect(keys[0]).toBe('5,5');
    expect(keys).not.toContain('6,5');
    expect(new Set(keys)).toEqual(new Set(['5,5', '6,4', '5,4', '4,5', '4,6', '5,6']));
  });
});

describe('unionHexClipPath', () => {
  it('joins one hexagon per cell into a single path string', () => {
    const shim = {
      hexToWorld: (q: number, r: number) => ({ worldX: q * 100, worldY: r * 100 }),
      worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => ({ screenX: (wx + ox) * zoom, screenY: (wy + oy) * zoom }),
      orientation: 'flat',
    };
    const cells = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 0, r: 1 }];
    const d = unionHexClipPath(cells, shim, { x: 0, y: 0, zoom: 1 }, 32);
    expect(d.match(/M/g)).toHaveLength(3);
    expect(d.match(/Z/g)).toHaveLength(3);
    expect(d).toBe(hexClipPathString(0, 0, 32, 'flat') + hexClipPathString(100, 0, 32, 'flat') + hexClipPathString(0, 100, 32, 'flat'));
  });
});
