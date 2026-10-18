// @vitest-environment happy-dom
/**
 * useDataHandlers on ladder maps: element writes (objects, labels, tiles) that
 * ADD an element on a rung >= 1 pass the depth gate inside the functional
 * updater (DATA-03 / INT-01 / INT-09 budget half), and the element-path `lod`
 * stamp never re-activates a quarantined map (PX-02).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { UseDataHandlersResult } from '#types/hooks/dataHandlers.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../../src/core/settingsAccessor', () => ({ getSettings, getSetting: () => undefined }));

const { createNewMap } = await import('../../../../src/persistence/fileOperations');
const { isDepthQuarantined } = await import('../../../../src/core/lodFlags');
const { DEPTH_BUDGET_BYTES, guardDepthWrite } = await import('../../../../src/persistence/depthAuthoring');
const { useDataHandlers } = await import('../../../../src/hooks/state/useDataHandlers');

/**
 * `map` padded (seeded noise in its name, so a compressing measure cannot
 * shrink it) to just under the depth budget, found by asking the gate itself:
 * one more byte of element growth still passes, ~80 more do not.
 */
function padUnderBudget(map: MapData): MapData {
  let seed = 7;
  const noise = Array.from({ length: 2 * DEPTH_BUDGET_BYTES }, () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0;
    return String.fromCharCode(33 + (seed % 94));
  }).join('');
  const at = (n: number): MapData => ({ ...map, name: noise.slice(0, n) });
  const fits = (n: number): boolean => {
    const m = at(n);
    return guardDepthWrite(m, m.layers[0].id, 1, [], { addedBytes: 20 }) === null;
  };
  let lo = 0;
  let hi = noise.length;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) lo = mid; else hi = mid;
  }
  return at(lo);
}

function obj(id: string, x: number, y: number, homeLevel?: number): MapObject {
  return {
    id, type: 'chest', position: { x, y }, size: { width: 1, height: 1 },
    ...(homeLevel !== undefined ? { homeLevel } : {}),
  } as unknown as MapObject;
}

function withObjects(map: MapData, objects: MapObject[]): MapData {
  return { ...map, layers: map.layers.map((l, i) => (i === 0 ? { ...l, objects } : l)) };
}

interface Harness {
  handlers: () => UseDataHandlersResult;
  map: () => MapData;
  addToHistory: ReturnType<typeof vi.fn>;
}

describe('useDataHandlers: ladder element writes', () => {
  let root: HTMLElement;

  beforeEach(() => {
    getSettings.mockReset();
    getSettings.mockReturnValue({ lodLadder: true });
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    act(() => { render(null, root); });
    root.remove();
  });

  function mount(initial: MapData, levelKey: string | null = null): Harness {
    let current = initial;
    let api: UseDataHandlersResult | null = null;
    const addToHistory = vi.fn();
    // Synchronous functional updates, as Preact's setter applies them.
    const updateMapData = (u: MapData | ((prev: MapData) => MapData)): void => {
      current = typeof u === 'function' ? u(current) : u;
    };
    function Probe(): null {
      api = useDataHandlers({ mapData: current, updateMapData, addToHistory, isApplyingHistory: () => false, levelKey });
      return null;
    }
    act(() => { render(h(Probe, {}), root); });
    return {
      handlers: () => { if (api === null) throw new Error('not mounted'); return api; },
      map: () => current,
      addToHistory,
    };
  }

  it('quarantined map plus a level-0 object move: lod stays undefined', () => {
    // A deep object without `lod` (hand edit or stripped block): quarantined.
    const base = withObjects(createNewMap('Q', 'hex'), [obj('deep', 4, 0, 2), obj('root', 1, 1)]);
    expect(isDepthQuarantined(base).quarantined).toBe(true);
    const t = mount(base);

    const moved = t.map().layers[0].objects.map(o => (o.id === 'root' ? { ...o, position: { x: 2, y: 1 } } : o));
    const refusal = t.handlers().handleObjectsChange(moved);

    expect(refusal).toBeNull();
    expect(t.map().lod).toBeUndefined();
    expect(t.map().layers[0].objects.find(o => o.id === 'root')?.position).toEqual({ x: 2, y: 1 });
    expect(isDepthQuarantined(t.map()).quarantined).toBe(true);
  });

  it('refused element write leaves mapData identity and history untouched', () => {
    getSettings.mockReturnValue({ lodLadder: false }); // capability off: no map may START taking depth
    const base = createNewMap('Off', 'hex');
    const t = mount(base);

    const refusal = t.handlers().handleObjectsChange([obj('deep', 4, 0, 2)]);

    expect(refusal).toBe('not-a-ladder');
    expect(t.map()).toBe(base);
    expect(t.addToHistory).not.toHaveBeenCalled();

    const tile = { col: 4, row: 0, tilesetId: 'ts', tileId: 't', homeLevel: 1 } as unknown as TileAssignment;
    expect(t.handlers().handleTilesChange([tile])).toBe('not-a-ladder');
    expect(t.map()).toBe(base);
    expect(t.addToHistory).not.toHaveBeenCalled();
  });

  it('a deep element on a map without lod is refused not-a-ladder even with the capability on, and stamps nothing', () => {
    const base = createNewMap('First', 'hex');
    const t = mount(base);
    expect(t.handlers().handleObjectsChange([obj('deep', 4, 0, 1)])).toBe('not-a-ladder');
    expect(t.map()).toBe(base);
    expect(t.map().lod).toBeUndefined();
    expect(t.addToHistory).not.toHaveBeenCalled();
  });

  it('a deep element on an opted-in map is accepted and never re-stamps lod', () => {
    const lod = { m: 4, minCellPx: 64, maxLevel: 3 };
    const t = mount({ ...createNewMap('Opted', 'hex'), lod });
    expect(t.handlers().handleObjectsChange([obj('deep', 4, 0, 1)])).toBeNull();
    expect(t.map().lod).toBe(lod);
    expect(t.map().layers[0].objects.map(o => o.id)).toEqual(['deep']);
    expect(t.addToHistory).toHaveBeenCalledTimes(1);
    expect(t.addToHistory.mock.calls[0][0].lodStamped).toBeUndefined();
  });

  it('duplicate at depth goes through the gate', () => {
    // A stamped ladder map already holding one deep object, close to the budget.
    const stamped = withObjects({ ...createNewMap('Dup', 'hex'), lod: { m: 4, minCellPx: 64, maxLevel: 3 } }, [obj('a', 4, 0, 2)]);
    const padded = padUnderBudget(stamped);
    const t = mount(padded);

    // A move of the existing deep object adds no element: never refused on size.
    const moved = [{ ...t.map().layers[0].objects[0], position: { x: 5, y: 0 } }];
    expect(t.handlers().handleObjectsChange(moved)).toBeNull();
    const afterMove = t.map();

    // Its duplicate (new id, same rung) is an added element and is over budget.
    const dup = [...t.map().layers[0].objects, obj('a-copy', 6, 0, 2)];
    expect(t.handlers().handleObjectsChange(dup)).toBe('over-budget');
    expect(t.map()).toBe(afterMove);

    // With the capability off the duplicate is refused at the door instead.
    getSettings.mockReturnValue({ lodLadder: false });
    expect(t.handlers().handleObjectsChange(dup)).toBe('not-a-ladder');
    expect(t.map()).toBe(afterMove);
  });

  const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };
  const deepTile = (col: number, over: Partial<TileAssignment> = {}): TileAssignment =>
    ({ col, row: 0, tilesetId: 'ts', tileId: 't', homeLevel: 2, ...over } as unknown as TileAssignment);
  const withTiles = (map: MapData, tiles: TileAssignment[]): MapData =>
    ({ ...map, layers: map.layers.map((l, i) => (i === 0 ? { ...l, tiles } : l)) });

  it('deep tile move with the capability flag off is not refused', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    const t = mount(withTiles({ ...createNewMap('Off', 'hex'), lod: LOD }, [deepTile(4)]));

    // Tiles carry no id and are rebuilt per edit: a move, a rotation and a
    // rescale are edits of the existing tile, not adds.
    expect(t.handlers().handleTilesChange([deepTile(5)])).toBeNull();
    expect(t.map().layers[0].tiles).toEqual([deepTile(5)]);
    expect(t.handlers().handleTilesChange([deepTile(5, { rotation: 90, scale: 1.5 } as Partial<TileAssignment>)])).toBeNull();
    expect(t.map().layers[0].tiles?.[0].rotation).toBe(90);
    expect(t.addToHistory).toHaveBeenCalledTimes(2);
  });

  it('deep tile move at ~79% of budget is not refused', () => {
    // Padded so ~20 more bytes still fit: a whole tile's bytes would not.
    const t = mount(padUnderBudget(withTiles({ ...createNewMap('Full', 'hex'), lod: LOD }, [deepTile(4)])));
    expect(t.handlers().handleTilesChange([deepTile(5)])).toBeNull();
    expect(t.map().layers[0].tiles).toEqual([deepTile(5)]);
  });

  it('deep tile add still goes through the gate', () => {
    const t = mount(padUnderBudget(withTiles({ ...createNewMap('Add', 'hex'), lod: LOD }, [deepTile(4)])));
    const before = t.map();
    // A second tile on the same rung (even stacked on the first cell) is growth.
    expect(t.handlers().handleTilesChange([deepTile(4), deepTile(4)])).toBe('over-budget');
    expect(t.handlers().handleTilesChange([deepTile(4), deepTile(6)])).toBe('over-budget');
    expect(t.map()).toBe(before);
    getSettings.mockReturnValue({ lodLadder: false });
    expect(t.handlers().handleTilesChange([deepTile(4), deepTile(6)])).toBe('not-a-ladder');
    expect(t.map()).toBe(before);
    expect(t.addToHistory).not.toHaveBeenCalled();
  });

  it('a deep write in a sub-hex child is refused nested-level and stamps nothing', () => {
    // A leaf child is refused as nested-level before any lod check (finding C).
    const child = createNewMap('Child', 'hex');
    const t = mount(child, '0,0');

    expect(t.handlers().handleObjectsChange([obj('deep', 4, 0, 1)])).toBe('nested-level');
    expect(t.handlers().handleTilesChange([deepTile(4)])).toBe('nested-level');
    const outcome = t.handlers().handleLevelCellsChange(1, (cells) => [...cells, { q: 4, r: 0, color: '#123456' }]);
    expect(outcome?.ok).toBe(false);
    if (outcome !== null && !outcome.ok) expect(outcome.reason).toBe('nested-level');
    expect(t.map()).toBe(child);
    expect(t.map().lod).toBeUndefined();
    expect(t.addToHistory).not.toHaveBeenCalled();

    // Level-0 writes in the child are untouched.
    expect(t.handlers().handleObjectsChange([obj('root', 1, 1)])).toBeNull();
    expect(t.map().lod).toBeUndefined();
  });

  it('classic writes are untouched by the gate', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    const base = createNewMap('Classic', 'grid');
    const t = mount(base);
    expect(t.handlers().handleObjectsChange([obj('o', 1, 1)])).toBeNull();
    expect(t.map().layers[0].objects).toHaveLength(1);
    expect(t.map().lod).toBeUndefined();
  });
});
