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

  function mount(initial: MapData): Harness {
    let current = initial;
    let api: UseDataHandlersResult | null = null;
    const addToHistory = vi.fn();
    // Synchronous functional updates, as Preact's setter applies them.
    const updateMapData = (u: MapData | ((prev: MapData) => MapData)): void => {
      current = typeof u === 'function' ? u(current) : u;
    };
    function Probe(): null {
      api = useDataHandlers({ mapData: current, updateMapData, addToHistory, isApplyingHistory: () => false });
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
    getSettings.mockReturnValue({}); // capability off: no map may START taking depth
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

  it('the first deep element stamps lod and records the stamp', () => {
    const t = mount(createNewMap('First', 'hex'));
    expect(t.handlers().handleObjectsChange([obj('deep', 4, 0, 1)])).toBeNull();
    expect(t.map().lod).toEqual({ m: 4, minCellPx: 64, maxLevel: 3 });
    expect(t.addToHistory).toHaveBeenCalledTimes(1);
    expect(t.addToHistory.mock.calls[0][0].lodStamped).toEqual({ m: 4, minCellPx: 64, maxLevel: 3 });
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
    getSettings.mockReturnValue({});
    expect(t.handlers().handleObjectsChange(dup)).toBe('not-a-ladder');
    expect(t.map()).toBe(afterMove);
  });

  it('classic writes are untouched by the gate', () => {
    getSettings.mockReturnValue({});
    const base = createNewMap('Classic', 'grid');
    const t = mount(base);
    expect(t.handlers().handleObjectsChange([obj('o', 1, 1)])).toBeNull();
    expect(t.map().layers[0].objects).toHaveLength(1);
    expect(t.map().lod).toBeUndefined();
  });
});
