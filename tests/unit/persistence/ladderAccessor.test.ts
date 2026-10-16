/**
 * Ladder level accessors (design 06, s2.1 and s19 items 1 and 6): the only
 * reader/writer of `MapLayer.levels`, cloneLayer's copy of it, and the
 * never-destroying load validation in migrateMapData.
 */

import { describe, it, expect } from 'vitest';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import {
  authoredCells,
  allAuthoredCells,
  authoredLevels,
  setLevelCells,
  normaliseLevels,
  levelsShapeIsValid,
  cloneLayer,
  promoteToStrata,
} from '../../../src/persistence/layerAccessor';
import { migrateMapData } from '../../../src/persistence/fileOperations';

const cell = (x: number, y: number): Cell => ({ x, y, color: '#4a7c59' } as Cell);

const layer = (over: Partial<MapLayer> = {}): MapLayer => ({
  id: 'L1', name: '1', order: 0, visible: true,
  cells: [cell(0, 0)], curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null,
  ...over,
});

const mapWith = (l: MapLayer, over: Partial<MapData> = {}): MapData => ({
  schemaVersion: 2, mapType: 'hex', activeLayerId: l.id, layerPanelVisible: false, layers: [l],
  ...over,
} as MapData);

const roundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Write a raw (possibly invalid) key into a layer's levels record, bypassing the types. */
const rawKey = (l: MapLayer, key: string, cells: Cell[]): void => {
  (l.levels as unknown as Record<string, Cell[]>)[key] = cells;
};

describe('authoredCells', () => {
  it('level 0 is layer.cells (same reference)', () => {
    const l = layer();
    expect(authoredCells(l, 0)).toBe(l.cells);
  });

  it('returns the rung, and [] for an absent rung or absent container', () => {
    const rung = [cell(16, 0)];
    expect(authoredCells(layer({ levels: { 2: rung } }), 2)).toBe(rung);
    expect(authoredCells(layer({ levels: { 2: rung } }), 1)).toEqual([]);
    expect(authoredCells(layer(), 3)).toEqual([]);
  });

  it('reads string keys after a JSON round trip', () => {
    const l = roundTrip(layer({ levels: { 2: [cell(16, 0)] } }));
    expect(Object.keys(l.levels ?? {})).toEqual(['2']);
    expect(authoredCells(l, 2)).toEqual([cell(16, 0)]);
  });

  it('rejects negative and non-integer levels', () => {
    expect(() => authoredCells(layer(), -1)).toThrow(RangeError);
    expect(() => authoredCells(layer(), 1.5)).toThrow(RangeError);
  });
});

describe('allAuthoredCells and authoredLevels', () => {
  const messy = (): MapLayer => roundTrip(layer({
    levels: { 2: [cell(2, 2)], 1: [cell(1, 1)], 10: [cell(10, 10)] },
  }));

  it('orders level 0 first, then rungs numerically (1, 2, 10), not lexically', () => {
    expect(allAuthoredCells(messy()).map(e => e.level)).toEqual([0, 1, 2, 10]);
    expect(allAuthoredCells(messy()).map(e => (e.cell as { x: number }).x)).toEqual([0, 1, 2, 10]);
  });

  it('skips key "0" and non-integer keys', () => {
    const l = messy();
    rawKey(l, '0', [cell(99, 0)]);
    rawKey(l, '1.5', [cell(98, 0)]);
    expect(allAuthoredCells(l).map(e => e.level)).toEqual([0, 1, 2, 10]);
    expect(authoredLevels(l)).toEqual([0, 1, 2, 10]);
  });

  it('authoredLevels lists non-empty rungs only, and 0 only when cells is non-empty', () => {
    expect(authoredLevels(layer({ cells: [], levels: { 3: [cell(3, 3)], 1: [] } }))).toEqual([3]);
    expect(authoredLevels(layer())).toEqual([0]);
  });
});

describe('setLevelCells', () => {
  it('writes a rung immutably', () => {
    const before = mapWith(layer());
    const after = setLevelCells(before, 'L1', 2, [cell(16, 0)]);
    expect(after).not.toBe(before);
    expect(after.layers[0]).not.toBe(before.layers[0]);
    expect('levels' in before.layers[0]).toBe(false);
    expect(authoredCells(after.layers[0], 2)).toEqual([cell(16, 0)]);
  });

  it('deletes an emptied rung, then the emptied container', () => {
    let m = setLevelCells(mapWith(layer()), 'L1', 1, [cell(4, 4)]);
    m = setLevelCells(m, 'L1', 2, [cell(16, 16)]);
    m = setLevelCells(m, 'L1', 1, []);
    expect(Object.keys(m.layers[0].levels ?? {})).toEqual(['2']);
    m = setLevelCells(m, 'L1', 2, []);
    expect('levels' in m.layers[0]).toBe(false);
    expect(JSON.stringify(m)).not.toContain('"levels"');
  });

  it('returns the SAME mapData on a no-op', () => {
    const rung = [cell(16, 0)];
    const m = setLevelCells(mapWith(layer()), 'L1', 2, rung);
    expect(setLevelCells(m, 'L1', 2, rung)).toBe(m);
    const classic = mapWith(layer());
    expect(setLevelCells(classic, 'L1', 3, [])).toBe(classic);
    expect(setLevelCells(classic, 'missing', 3, [cell(1, 1)])).toBe(classic);
  });

  it('refuses level 0 and non-integer levels', () => {
    const m = mapWith(layer());
    expect(() => setLevelCells(m, 'L1', 0, [cell(1, 1)])).toThrow(RangeError);
    expect(() => setLevelCells(m, 'L1', 1.5, [cell(1, 1)])).toThrow(RangeError);
  });
});

describe('normaliseLevels', () => {
  it('returns the same layer when there is nothing to fix', () => {
    const classic = layer();
    expect(normaliseLevels(classic)).toBe(classic);
    const ladder = layer({ levels: { 2: [cell(1, 1)] } });
    expect(normaliseLevels(ladder)).toBe(ladder);
  });

  it('removes empty or non-array rung values, then an empty container; keeps content under any key', () => {
    const l = layer({ levels: { 1: [], 2: [cell(1, 1)] } });
    rawKey(l, '0', [cell(9, 9)]);
    rawKey(l, '1.5', [cell(8, 8)]);
    rawKey(l, '01', []);
    (l.levels as unknown as Record<string, unknown>)['3'] = 'not cells';
    const n = normaliseLevels(l);
    expect(n.levels).toEqual({ 0: [cell(9, 9)], '1.5': [cell(8, 8)], 2: [cell(1, 1)] });
    expect(n.cells).toBe(l.cells);
    expect('levels' in normaliseLevels(layer({ levels: { 1: [] } }))).toBe(false);
    expect('levels' in normaliseLevels(layer({ levels: {} }))).toBe(false);
    expect('levels' in normaliseLevels(layer({ levels: null as unknown as MapLayer['levels'] }))).toBe(false);
  });

  it("levels {'0':[c]} keeps the cell through migrate", () => {
    const l = layer({ levels: {} });
    rawKey(l, '0', [cell(9, 9)]);
    const m = migrateMapData(roundTrip(mapWith(l)));
    expect(m.layers[0].levels).toEqual({ 0: [cell(9, 9)] });
    expect(levelsShapeIsValid(m.layers[0].levels)).toBe(false);
  });

  it('array-shaped levels untouched', () => {
    const arrayLevels = [[cell(1, 1)], [cell(2, 2)]];
    const l = layer({ levels: arrayLevels as unknown as MapLayer['levels'] });
    expect(normaliseLevels(l)).toBe(l);
    const m = migrateMapData(roundTrip(mapWith(l)));
    expect(m.layers[0].levels).toEqual(arrayLevels);
    expect(levelsShapeIsValid(m.layers[0].levels)).toBe(false);
  });
});

describe('levelsShapeIsValid (C3)', () => {
  it('is true when absent or every non-empty array sits under a rung key', () => {
    expect(levelsShapeIsValid(undefined)).toBe(true);
    expect(levelsShapeIsValid(null)).toBe(true);
    expect(levelsShapeIsValid({})).toBe(true);
    expect(levelsShapeIsValid({ 1: [cell(1, 1)], 12: [cell(2, 2)] })).toBe(true);
    // Empty or non-array values under a bad key are not content (load drops them).
    expect(levelsShapeIsValid({ 0: [], '01': 'x', 2: [cell(1, 1)] })).toBe(true);
  });

  it('is false for an array, a non-record, or content under a key that is not a rung', () => {
    expect(levelsShapeIsValid([[cell(1, 1)]])).toBe(false);
    expect(levelsShapeIsValid([])).toBe(false);
    expect(levelsShapeIsValid(5)).toBe(false);
    for (const key of ['0', '01', '1.5', '-1', 'x', '99999999999999999999']) {
      expect(levelsShapeIsValid({ [key]: [cell(1, 1)] }), key).toBe(false);
    }
  });
});

describe('cloneLayer carries levels', () => {
  it.each(['all', 'mapOnly'] as const)('%s mode deep-copies levels', (mode) => {
    const src = layer({ levels: { 2: [cell(16, 0)] } });
    const out = cloneLayer(mapWith(src), 'L1', mode);
    const clone = out.layers[out.layers.length - 1];
    expect(clone.id).not.toBe('L1');
    expect(clone.levels).toEqual(src.levels);
    expect(authoredCells(clone, 2)).not.toBe(authoredCells(src, 2));
  });

  it.each(['all', 'mapOnly'] as const)('%s mode never writes levels on a classic clone', (mode) => {
    const out = cloneLayer(mapWith(layer()), 'L1', mode);
    expect('levels' in out.layers[out.layers.length - 1]).toBe(false);
  });
});

describe('migrateMapData never destroys ladder data', () => {
  it('keeps levels on a map with no lod block', () => {
    const m = migrateMapData(roundTrip(mapWith(layer({ levels: { 2: [cell(16, 0)] } }))));
    expect(authoredCells(m.layers[0], 2)).toEqual([cell(16, 0)]);
    expect(m.lod).toBeUndefined();
  });

  it('keeps an out-of-allowlist m and all stored lod values untouched', () => {
    const lod = { m: 7, minCellPx: -3, maxLevel: 0 };
    const m = migrateMapData(roundTrip(mapWith(layer({ levels: { 2: [cell(1, 1)] } }), { lod })));
    expect(m.lod).toEqual(lod);
    expect(authoredLevels(m.layers[0])).toEqual([0, 2]);
  });

  it('strips empty containers only', () => {
    const m = migrateMapData(roundTrip(mapWith(layer({ levels: { 1: [], 3: [cell(3, 3)] } }))));
    expect(Object.keys(m.layers[0].levels ?? {})).toEqual(['3']);
    const e = migrateMapData(roundTrip(mapWith(layer({ levels: { 1: [] } }))));
    expect('levels' in e.layers[0]).toBe(false);
  });

  it('normalises a hand-edited lod: null and levels: null to absent (Codex review)', () => {
    const raw = roundTrip(mapWith(layer({ levels: { 2: [cell(1, 1)] } })));
    (raw as unknown as Record<string, unknown>).lod = null;
    const nulled = roundTrip(mapWith(layer()));
    (nulled as unknown as Record<string, unknown>).lod = null;
    (nulled.layers[0] as unknown as Record<string, unknown>).levels = null;
    const m = migrateMapData(raw);
    expect('lod' in m).toBe(false);
    expect(authoredCells(m.layers[0], 2)).toEqual([cell(1, 1)]); // rungs kept; map reads as levels-without-lod
    const n = migrateMapData(nulled);
    expect('lod' in n).toBe(false);
    expect('levels' in n.layers[0]).toBe(false);
  });

  it('adds nothing ladder-related to a classic map', () => {
    const m = migrateMapData(roundTrip(mapWith(layer())));
    expect('lod' in m).toBe(false);
    expect('levels' in m.layers[0]).toBe(false);
  });
});

describe('promoteToStrata carries levels (kgc.14)', () => {
  it('a classic map promotes with no levels key anywhere and the pre-fix ground shape', () => {
    const src = mapWith(layer());
    const before = JSON.stringify(src);
    const out = promoteToStrata(src);
    expect(JSON.stringify(src)).toBe(before); // input untouched
    for (const l of out.layers) expect('levels' in l).toBe(false);
    const ground = out.layers.find(l => l.tileRole === 'ground') as MapLayer;
    expect(Object.keys(ground)).toEqual([
      'id', 'name', 'order', 'visible', 'cells', 'curves', 'edges', 'objects', 'textLabels',
      'fogOfWar', 'tiles', 'tileRole', 'boardId',
    ]);
    expect(roundTrip(out)).toEqual(out);
  });

  it('merges each rung across the board layers into the ground stratum', () => {
    const a = layer({ id: 'A', levels: { 1: [cell(4, 0)], 3: [cell(64, 0)] } });
    const b = layer({ id: 'B', order: 1, cells: [cell(1, 1)], levels: { 1: [cell(8, 0)] } });
    const src = mapWith(a, { layers: [a, b] });
    const out = promoteToStrata(src);
    const ground = out.layers.find(l => l.tileRole === 'ground') as MapLayer;
    expect(ground.id).toBe('A');
    expect(authoredLevels(ground)).toEqual([0, 1, 3]);
    expect(authoredCells(ground, 1)).toEqual([cell(4, 0), cell(8, 0)]);
    expect(authoredCells(ground, 3)).toEqual([cell(64, 0)]);
    for (const l of out.layers) if (l.tileRole !== 'ground') expect('levels' in l).toBe(false);
    // Survives a save/load round trip (string keys on disk).
    const reloaded = roundTrip(out).layers.find(l => l.tileRole === 'ground') as MapLayer;
    expect(authoredCells(reloaded, 1)).toEqual([cell(4, 0), cell(8, 0)]);
  });
});
