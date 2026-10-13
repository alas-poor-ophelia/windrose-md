import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { createNewMap } = await import('../../../src/persistence/fileOperations');
const { authoredCells } = await import('../../../src/persistence/layerAccessor');
const {
  canBeginDepthAuthoring, withLod, guardDepthWrite, writeDepthCells, MAX_CELLS_PER_DEPTH_OP, DEPTH_BUDGET_BYTES, BYTES_PER_CELL_ESTIMATE, elementBytes, depthEntryRefusal,
} = await import('../../../src/persistence/depthAuthoring');

function hexMap(): MapData {
  return createNewMap('Depth', 'hex');
}

describe('depthAuthoring', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });

  it('refuses every deep write while the capability is off', () => {
    getSettings.mockReturnValue({});
    const m = hexMap();
    expect(canBeginDepthAuthoring(m)).toBe(false);
    const r = writeDepthCells(m, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('not-a-ladder');
    expect(r.mapData).toBe(m);
  });

  it('the first deep write stamps lod from the defaults in the same update', () => {
    const m = hexMap();
    expect(m.lod).toBeUndefined();
    const r = writeDepthCells(m, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.mapData.lod).toEqual({ m: 4, minCellPx: 64, maxLevel: 3 });
      expect(authoredCells(r.mapData.layers[0], 1)).toHaveLength(1);
    }
    expect(withLod(r.mapData)).toBe(r.mapData);
  });

  it('the first deep write stamps the EFFECTIVE parameters under a developer override (kgc.16)', () => {
    interface LadderGlobal { activeWindow?: { __windroseLadder?: unknown } }
    const g = globalThis as unknown as LadderGlobal;
    g.activeWindow = { __windroseLadder: { m: 2, minCellPx: 40, maxLevel: 2 } };
    try {
      const m = hexMap();
      // the guard and the stamp measure with the same rod: level 2 is in range, level 3 is not
      const refused = writeDepthCells(m, m.layers[0].id, 3, [{ q: 4, r: 0, color: '#123456' }]);
      expect(refused.ok).toBe(false);
      if (!refused.ok) expect(refused.reason).toBe('level-out-of-range');
      const r = writeDepthCells(m, m.layers[0].id, 2, [{ q: 4, r: 0, color: '#123456' }]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.mapData.lod).toEqual({ m: 2, minCellPx: 40, maxLevel: 2 });
        // the stamped map is a healthy ladder: no quarantine, same params on the next frame
        expect(canBeginDepthAuthoring(r.mapData)).toBe(true);
        expect(authoredCells(r.mapData.layers[0], 2)).toHaveLength(1);
      }
    } finally {
      delete g.activeWindow;
    }
  });

  it('refuses a level above maxLevel or below 1', () => {
    const m = hexMap();
    expect(guardDepthWrite(m, m.layers[0].id, 0, [])).toBe('level-out-of-range');
    expect(guardDepthWrite(m, m.layers[0].id, 4, [])).toBe('level-out-of-range');
    expect(guardDepthWrite(m, m.layers[0].id, 3, [])).toBeNull();
  });

  it('refuses a single operation adding more than the per-op cap', () => {
    const m = hexMap();
    const many = Array.from({ length: MAX_CELLS_PER_DEPTH_OP + 1 }, (_, i) => ({ q: i, r: 0, color: '#abcdef' }));
    expect(guardDepthWrite(m, m.layers[0].id, 1, many)).toBe('too-many-cells');
    expect(guardDepthWrite(m, m.layers[0].id, 1, many.slice(0, MAX_CELLS_PER_DEPTH_OP))).toBeNull();
  });

  it('refuses a write that would cross the byte budget, and a shrinking write never does', () => {
    const m = hexMap();
    const padded: MapData = { ...m, name: 'x'.repeat(DEPTH_BUDGET_BYTES - 500) };
    expect(guardDepthWrite(padded, m.layers[0].id, 1, Array.from({ length: 100 }, (_, i) => ({ q: i, r: 0, color: '#abcdef' })))).toBe('over-budget');
    const stamped = writeDepthCells(m, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }, { q: 5, r: 0, color: '#123456' }]);
    expect(stamped.ok).toBe(true);
    if (stamped.ok) {
      const fat: MapData = { ...stamped.mapData, name: 'x'.repeat(DEPTH_BUDGET_BYTES + 10) };
      expect(guardDepthWrite(fat, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }])).toBeNull();
    }
  });

  it('refuses a classic map with sub-hex children, so the lod stamp never lands on one (kgc.15, design s9)', () => {
    const m = hexMap();
    const nested: MapData = { ...m, subHexMaps: { '0,0': { mapData: hexMap() } as unknown as NonNullable<MapData['subHexMaps']>[string] } };
    expect(canBeginDepthAuthoring(nested)).toBe(false);
    const r = writeDepthCells(nested, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('nested-classic');
    expect(r.mapData).toBe(nested);
    expect(nested.lod).toBeUndefined();
    // mode is data: a map that already carries lod stays a ladder even with children
    const laddered: MapData = { ...nested, lod: { m: 4, minCellPx: 64, maxLevel: 3 } };
    expect(canBeginDepthAuthoring(laddered)).toBe(true);
  });

  it('refuses when quarantined and leaves the map untouched', () => {
    const m = hexMap();
    const bad: MapData = { ...m, lod: { m: 7, minCellPx: 64, maxLevel: 3 } };
    const r = writeDepthCells(bad, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('quarantined');
    expect(r.mapData).toBe(bad);
  });
  describe('stroke context (kgc.23 d/e/g)', () => {
    const cellsFrom = (start: number, n: number) => Array.from({ length: n }, (_, i) => ({ q: start + i, r: 0, color: '#abcdef' }));

    it('caps a stroke against its start, even when each tick adds one cell', () => {
      const m = hexMap();
      const id = m.layers[0].id;
      const baseline = cellsFrom(0, 10);
      const start = writeDepthCells(m, id, 1, baseline);
      if (!start.ok) throw new Error('expected the stroke start to land');
      // the stroke so far, one cell per tick: never more than one added at once
      const live = writeDepthCells(start.mapData, id, 1, cellsFrom(0, 10 + MAX_CELLS_PER_DEPTH_OP), { baseline, serialisedBytes: 0 });
      expect(live.ok).toBe(true);
      if (!live.ok) return;
      // one more cell this tick: harmless on its own, over the cap for the stroke
      const nextTick = cellsFrom(0, 11 + MAX_CELLS_PER_DEPTH_OP);
      expect(guardDepthWrite(live.mapData, id, 1, nextTick)).toBeNull();
      expect(guardDepthWrite(live.mapData, id, 1, nextTick, { baseline, serialisedBytes: 0 })).toBe('too-many-cells');
      expect(guardDepthWrite(live.mapData, id, 1, cellsFrom(0, 10 + MAX_CELLS_PER_DEPTH_OP), { baseline, serialisedBytes: 0 })).toBeNull();
    });

    it('uses the cached stroke-start size instead of serialising the map', () => {
      const m = hexMap();
      const id = m.layers[0].id;
      const spy = vi.spyOn(JSON, 'stringify');
      try {
        const headroom = 5;
        const serialisedBytes = DEPTH_BUDGET_BYTES - headroom * BYTES_PER_CELL_ESTIMATE;
        expect(guardDepthWrite(m, id, 1, cellsFrom(0, headroom), { baseline: [], serialisedBytes })).toBeNull();
        expect(guardDepthWrite(m, id, 1, cellsFrom(0, headroom + 1), { baseline: [], serialisedBytes })).toBe('over-budget');
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('an over-budget map still accepts the identity write that records the stroke undo entry', () => {
      const m = hexMap();
      const id = m.layers[0].id;
      const stamped = writeDepthCells(m, id, 1, cellsFrom(0, 3));
      expect(stamped.ok).toBe(true);
      if (!stamped.ok) return;
      const fat: MapData = { ...stamped.mapData, name: 'x'.repeat(DEPTH_BUDGET_BYTES + 10) };
      const current = authoredCells(fat.layers[0], 1);
      expect(guardDepthWrite(fat, id, 1, current)).toBeNull();
      const r = writeDepthCells(fat, id, 1, current);
      expect(r.ok).toBe(true);
      // and a stroke context whose start lies far back changes nothing for it
      expect(guardDepthWrite(fat, id, 1, current, { baseline: [], serialisedBytes: DEPTH_BUDGET_BYTES * 2 })).toBeNull();
    });

    it('refuses an unknown layer and never stamps lod', () => {
      const m = hexMap();
      expect(guardDepthWrite(m, 'no-such-layer', 1, cellsFrom(0, 1))).toBe('unknown-layer');
      const r = writeDepthCells(m, 'no-such-layer', 1, cellsFrom(0, 1));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe('unknown-layer');
      expect(r.mapData).toBe(m);
      expect(r.mapData.lod).toBeUndefined();
    });
  });
  describe('depthEntryRefusal (paint-tool refusal parity, kgc.25)', () => {
    it('names the reason a map cannot start deep edits, null when it can', () => {
      const m = hexMap();
      expect(depthEntryRefusal(m)).toBeNull();
      expect(depthEntryRefusal({ ...m, lod: { m: 7, minCellPx: 64, maxLevel: 3 } })).toBe('quarantined');
      const nested: MapData = { ...m, subHexMaps: { '0,0': { mapData: hexMap() } as unknown as NonNullable<MapData['subHexMaps']>[string] } };
      expect(depthEntryRefusal(nested)).toBe('nested-classic');
      getSettings.mockReturnValue({});
      expect(depthEntryRefusal(m)).toBe('not-a-ladder');
    });
  });

  describe('element byte budget (kgc.25)', () => {
    it('elementBytes is the JSON length, 0 when unserialisable', () => {
      expect(elementBytes({ a: 1 })).toBe(7);
      const cyclic: Record<string, unknown> = {};
      cyclic.self = cyclic;
      expect(elementBytes(cyclic)).toBe(0);
      expect(elementBytes(undefined)).toBe(0);
    });

    it('an over-budget map refuses an element write past its headroom and accepts one within it', () => {
      const m = hexMap();
      const id = m.layers[0].id;
      const stamped = writeDepthCells(m, id, 1, [{ q: 0, r: 0, color: '#abcdef' }]);
      if (!stamped.ok) throw new Error('expected the stamp to land');
      const base = JSON.stringify(stamped.mapData).length;
      const headroom = 200;
      const fat: MapData = { ...stamped.mapData, name: 'x'.repeat(DEPTH_BUDGET_BYTES - base - headroom) };
      const cells = authoredCells(fat.layers[0], 1);
      expect(guardDepthWrite(fat, id, 1, cells, { addedBytes: headroom - 50 })).toBeNull();
      expect(guardDepthWrite(fat, id, 1, cells, { addedBytes: headroom + 50 })).toBe('over-budget');
      // cells-only writes are unchanged: identity still lands without addedBytes
      expect(guardDepthWrite(fat, id, 1, cells)).toBeNull();
      // and the cached stroke-start size is honoured for element bytes too
      expect(guardDepthWrite(fat, id, 1, cells, { serialisedBytes: DEPTH_BUDGET_BYTES - 10, addedBytes: 11 })).toBe('over-budget');
      expect(guardDepthWrite(fat, id, 1, cells, { serialisedBytes: DEPTH_BUDGET_BYTES - 10, addedBytes: 10 })).toBeNull();
    });

    it('element writes still pass the non-size gates first', () => {
      getSettings.mockReturnValue({ lodLadder: false });
      const m = hexMap();
      expect(guardDepthWrite(m, m.layers[0].id, 1, [], { addedBytes: 1 })).toBe('not-a-ladder');
    });
  });
});
