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

describe('deepRootCellKeys: containment, not ownership (cross-model review item 5)', () => {
  /** First rung-2 cell (scanning outward) whose owner differs from the root hex containing its centre. */
  const findDisagreement = (): { q: number; r: number; owner: string; container: string } => {
    const rung = ladder.geometryForLevel(2);
    for (let q = 0; q < 64; q++) {
      for (let r = 0; r < 64; r++) {
        const own = ladder.ladder.ancestorAt(2, q, r);
        const c = rung.getCellCenter(q, r);
        const g = root.worldToGrid(c.worldX, c.worldY);
        const gc = root.getCellCenter(g.x, g.y);
        const oc = root.getCellCenter(own.q, own.r);
        // strictly inside the containing hexagon, not on a shared edge
        const margin = Math.hypot(c.worldX - oc.worldX, c.worldY - oc.worldY) - Math.hypot(c.worldX - gc.worldX, c.worldY - gc.worldY);
        if ((own.q !== g.x || own.r !== g.y) && margin > 1) {
          return { q, r, owner: `${own.q},${own.r}`, container: `${g.x},${g.y}` };
        }
      }
    }
    throw new Error('no disagreement found');
  };

  it('keys a deep cell by the root hexagon that visibly contains it', () => {
    const d = findDisagreement();
    expect(d.owner).not.toBe(d.container);
    const keys = deepRootCellKeys(layerWith({ 2: [hc(d.q, d.r)] }), ladder, 2);
    expect([...keys]).toEqual([d.container]);
  });
});

describe('deepRootCellKeys: homed elements protect their hex (cross-model review item 6)', () => {
  const rung1 = ladder.geometryForLevel(1);
  const at = (q: number, r: number): { x: number; y: number } => {
    const c = rung1.getCellCenter(q, r);
    return { x: c.worldX, y: c.worldY };
  };
  const withElements = (over: Partial<MapLayer>): MapLayer => ({ ...layerWith(), ...over } as MapLayer);

  it('counts an object, a text label and a tile homed on rung 1..active', () => {
    const obj = { id: 'o', type: 'x', position: { x: 4, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 1 };
    const p = at(0, 8);
    const label = { id: 't', position: p, content: 'x', fontSize: 12, fontFace: 'sans', color: '#000', homeLevel: 1 };
    const tile = { col: 0, row: -8, tilesetId: 's', tileId: 't', homeLevel: 1 };
    const keys = deepRootCellKeys(withElements({ objects: [obj], textLabels: [label], tiles: [tile] } as unknown as Partial<MapLayer>), ladder, 1);
    expect(new Set(keys)).toEqual(new Set(['1,0', '0,2', '0,-2']));
  });

  it('counts a freeform object and tile by world position', () => {
    const w = at(-4, 0);
    const obj = { id: 'o', type: 'x', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 2, freeform: true, worldPosition: w };
    const tile = { col: 0, row: 0, tilesetId: 's', tileId: 't', homeLevel: 1, freeform: true, worldX: at(0, 4).x, worldY: at(0, 4).y };
    const keys = deepRootCellKeys(withElements({ objects: [obj], tiles: [tile] } as unknown as Partial<MapLayer>), ladder, 2);
    expect(new Set(keys)).toEqual(new Set(['-1,0', '0,1']));
  });

  it('ignores root elements and elements homed finer than the active rung', () => {
    const root0 = { id: 'a', type: 'x', position: { x: 3, y: 3 }, size: { width: 1, height: 1 } };
    const deep3 = { id: 'b', type: 'x', position: { x: 64, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 3 };
    const layer = withElements({ objects: [root0, deep3] } as unknown as Partial<MapLayer>);
    expect(deepRootCellKeys(layer, ladder, 2).size).toBe(0);
    expect([...deepRootCellKeys(layer, ladder, 3)]).toEqual(['1,0']);
  });

  it('recomputes when the objects array changes, reuses when nothing does', () => {
    const base = withElements({});
    const first = deepRootCellKeys(base, ladder, 1);
    expect(first.size).toBe(0);
    expect(deepRootCellKeys({ ...base }, ladder, 1)).toBe(first);
    const obj = { id: 'o', type: 'x', position: { x: 4, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 1 };
    const moved = { ...base, objects: [obj] } as unknown as MapLayer;
    expect([...deepRootCellKeys(moved, ladder, 1)]).toEqual(['1,0']);
  });
});
