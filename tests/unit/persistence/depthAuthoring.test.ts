import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { createNewMap } = await import('../../../src/persistence/fileOperations');
const { authoredCells, setLevelCells } = await import('../../../src/persistence/layerAccessor');
const { MAX_JOURNAL_PAYLOAD, journalPayloadLength } = await import('../../../src/persistence/saveJournal');
const {
  canBeginDepthAuthoring, withLod, guardDepthWrite, writeDepthCells, MAX_CELLS_PER_DEPTH_OP, DEPTH_BUDGET_BYTES, BYTES_PER_CELL_ESTIMATE, elementBytes, depthEntryRefusal, depthBudgetBytesOf,
} = await import('../../../src/persistence/depthAuthoring');

function hexMap(): MapData {
  return createNewMap('Depth', 'hex');
}

/**
 * Deterministic text that deflate cannot shrink much (xorshift over `alphabet`),
 * so the journal's encoded payload tracks its length. 'x'.repeat(n) would
 * deflate to almost nothing and never approach the budget.
 */
function noise(length: number, alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'): string {
  let seed = 0x9e3779b9;
  const out: string[] = [];
  for (let i = 0; i < length; i++) {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; // xorshift32
    out.push(alphabet[(seed >>> 0) % alphabet.length]);
  }
  return out.join('');
}

/** A map padded with noise so its encoded journal payload sits just under `target`. */
function paddedTo(map: MapData, target: number): MapData {
  let length = target;
  for (let i = 0; i < 6; i++) {
    const measured = depthBudgetBytesOf({ ...map, name: noise(length) });
    length = Math.max(0, length + (target - measured));
  }
  let padded: MapData = { ...map, name: noise(length) };
  while (depthBudgetBytesOf(padded) > target) {
    length -= 64;
    padded = { ...map, name: noise(length) };
  }
  return padded;
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
    const padded = paddedTo(m, DEPTH_BUDGET_BYTES - 500);
    expect(depthBudgetBytesOf(padded)).toBeLessThanOrEqual(DEPTH_BUDGET_BYTES - 500);
    expect(guardDepthWrite(padded, m.layers[0].id, 1, Array.from({ length: 100 }, (_, i) => ({ q: i, r: 0, color: '#abcdef' })))).toBe('over-budget');
    const stamped = writeDepthCells(m, m.layers[0].id, 1, [{ q: 4, r: 0, color: '#123456' }, { q: 5, r: 0, color: '#123456' }]);
    expect(stamped.ok).toBe(true);
    if (stamped.ok) {
      const fat: MapData = { ...stamped.mapData, name: noise(DEPTH_BUDGET_BYTES + 10) };
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
      const fat = paddedTo(stamped.mapData, DEPTH_BUDGET_BYTES - 200);
      const headroom = DEPTH_BUDGET_BYTES - depthBudgetBytesOf(fat);
      expect(headroom).toBeGreaterThanOrEqual(200);
      expect(headroom).toBeLessThan(5000);
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

describe('depthAuthoring growth by key and size unit (Codex review)', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });

  const row = (n: number, r: number) => Array.from({ length: n }, (_, i) => ({ q: i, r, color: '#abcdef' }));

  it('a same-size replace of 5000 cells is refused by MAX_CELLS_PER_DEPTH_OP', () => {
    const m = hexMap();
    const id = m.layers[0].id;
    const seeded = setLevelCells(withLod(m), id, 1, row(5000, 0));
    const replaced = row(5000, 1); // erase all 5000, paint 5000 elsewhere: net length 0
    expect(guardDepthWrite(seeded, id, 1, replaced)).toBe('too-many-cells');
    // ...and against a stroke baseline the same way.
    expect(guardDepthWrite(seeded, id, 1, replaced, { baseline: authoredCells(seeded.layers[0], 1) })).toBe('too-many-cells');
  });

  it('identity, erase-only and recolour writes stay unrefusable', () => {
    const m = hexMap();
    const id = m.layers[0].id;
    const seeded = setLevelCells(withLod(m), id, 1, row(5000, 0));
    const current = authoredCells(seeded.layers[0], 1);
    expect(guardDepthWrite(seeded, id, 1, current)).toBeNull();
    expect(guardDepthWrite(seeded, id, 1, current.slice(10))).toBeNull();
    expect(guardDepthWrite(seeded, id, 1, current.map(c => ({ ...c, color: '#000000' })))).toBeNull();
    const fat: MapData = { ...seeded, name: 'x'.repeat(DEPTH_BUDGET_BYTES + 10) };
    expect(guardDepthWrite(fat, id, 1, current.map(c => ({ ...c, color: '#000000' })))).toBeNull();
  });

  it('CJK payload measured encoded', () => {
    const m = withLod(hexMap());
    // Repetitive CJK: 600k chars, UTF-8 ~1.8 MB, but it deflates to almost
    // nothing, so the journal stores it with room to spare: accepted.
    const repetitive: MapData = { ...m, name: '地'.repeat(600_000) };
    expect(new TextEncoder().encode(JSON.stringify(repetitive)).length).toBeGreaterThan(DEPTH_BUDGET_BYTES);
    expect(depthBudgetBytesOf(repetitive)).toBeLessThan(DEPTH_BUDGET_BYTES);
    expect(guardDepthWrite(repetitive, m.layers[0].id, 1, row(1, 0))).toBeNull();

    // Varied CJK: .length 700k is under the budget, but the deflated base64 the
    // journal would store is over it (the journal would refuse the payload), so
    // the gate must measure what the journal stores, not .length.
    let alphabet = '';
    for (let c = 0x4e00; c < 0x4e00 + 8192; c++) alphabet += String.fromCharCode(c);
    const varied: MapData = { ...m, name: noise(700_000, alphabet) };
    const json = JSON.stringify(varied);
    expect(json.length).toBeLessThan(DEPTH_BUDGET_BYTES);
    expect(journalPayloadLength(json)).toBeGreaterThan(DEPTH_BUDGET_BYTES);
    expect(depthBudgetBytesOf(varied)).toBe(journalPayloadLength(json));
    expect(guardDepthWrite(varied, m.layers[0].id, 1, row(1, 0))).toBe('over-budget');
  });

  it('raw 2 MB map that compresses under the cap is accepted', () => {
    const m = withLod(hexMap());
    const id = m.layers[0].id;
    // A realistic large map: 60k painted cells plus repetitive text, ~2.3 MB raw.
    const big: MapData = {
      ...m,
      description: 'A long corridor of the old keep. '.repeat(10_000),
      layers: [{ ...m.layers[0], cells: Array.from({ length: 60_000 }, (_, i) => ({ q: i % 300, r: Math.floor(i / 300), color: '#4a7c59' })) }],
    };
    const raw = JSON.stringify(big).length;
    expect(raw).toBeGreaterThan(2_000_000);
    expect(raw).toBeGreaterThan(MAX_JOURNAL_PAYLOAD);
    expect(depthBudgetBytesOf(big)).toBeLessThan(DEPTH_BUDGET_BYTES);
    expect(guardDepthWrite(big, id, 1, row(100, 0))).toBeNull();
    const written = writeDepthCells(big, id, 1, row(100, 0));
    expect(written.ok).toBe(true);
  });
});

describe('a deep write that changes nothing never stamps lod (DATA-02)', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });

  it('erase on an empty rung of a map without lod returns the same reference and no lod', () => {
    const m = hexMap();
    expect(m.lod).toBeUndefined();
    const r = writeDepthCells(m, m.layers[0].id, 2, []);
    expect(r.ok).toBe(true);
    expect(r.mapData).toBe(m);
    expect(r.mapData.lod).toBeUndefined();
  });

  it('paint then erase the same cell in one stroke leaves no lod', () => {
    const m = hexMap();
    const id = m.layers[0].id;
    const context = { baseline: [], serialisedBytes: depthBudgetBytesOf(m), lodAbsentAtStart: m.lod === undefined };
    const painted = writeDepthCells(m, id, 1, [{ q: 3, r: 1, color: '#abcdef' }], context);
    if (!painted.ok) throw new Error('expected the paint tick to land');
    expect(painted.mapData.lod).toBeDefined();
    const erased = writeDepthCells(painted.mapData, id, 1, [], context);
    expect(erased.ok).toBe(true);
    expect(erased.mapData.lod).toBeUndefined();
    expect(erased.mapData.layers[0].levels).toBeUndefined();
  });

  it('a ladder map keeps its lod when a stroke empties its rung', () => {
    const m = withLod(hexMap());
    const id = m.layers[0].id;
    const context = { baseline: [], serialisedBytes: depthBudgetBytesOf(m), lodAbsentAtStart: false };
    const painted = writeDepthCells(m, id, 1, [{ q: 3, r: 1, color: '#abcdef' }], context);
    if (!painted.ok) throw new Error('expected the paint tick to land');
    const erased = writeDepthCells(painted.mapData, id, 1, [], context);
    expect(erased.mapData.lod).toEqual(m.lod);
  });
});
