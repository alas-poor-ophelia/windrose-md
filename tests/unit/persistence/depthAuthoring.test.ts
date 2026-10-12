import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { createNewMap } = await import('../../../src/persistence/fileOperations');
const { authoredCells } = await import('../../../src/persistence/layerAccessor');
const {
  canBeginDepthAuthoring, withLod, guardDepthWrite, writeDepthCells, MAX_CELLS_PER_DEPTH_OP, DEPTH_BUDGET_BYTES,
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
});
