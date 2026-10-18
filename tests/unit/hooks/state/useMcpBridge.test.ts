// @vitest-environment happy-dom
/**
 * useMcpBridge: registration is stable across mapData changes (MEM-16), reads
 * live values through the latest-ref, and two instances sharing one notePath
 * both register (first keeps the plain key).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import type { MapData } from '../../../../types/core/map.types';
import type { ExtendedGeometry } from '../../../../types/contexts/context.types';
import type { WindroseLevelWriteResult } from '../../../../types/core/global.types';

// The ladder capability flag reads getSettings().lodLadder.
const ladderFlag = { on: false };
vi.mock('../../../../src/core/settingsAccessor', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../../src/core/settingsAccessor')>();
  return { ...real, getSettings: () => ({ ...real.FALLBACK_SETTINGS, lodLadder: ladderFlag.on }) };
});

import { useMcpBridge, type UseMcpBridgeParams } from '../../../../src/hooks/state/useMcpBridge';
import { useDataHandlers } from '../../../../src/hooks/state/useDataHandlers';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { createGeometry } from '../../../../src/geometry/core/createGeometry';
import { DEPTH_BUDGET_BYTES, guardDepthWrite } from '../../../../src/persistence/depthAuthoring';

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

function makeMap(name: string, cells: number): MapData {
  const layer = {
    id: 'l1', name: '1', order: 0, visible: true,
    cells: Array.from({ length: cells }, (_, i) => ({ x: i, y: 0, color: '#fff' })),
    curves: [], edges: [], objects: [], textLabels: [], tiles: [],
  };
  return { name, mapType: 'grid', layers: [layer], activeLayerId: 'l1' } as unknown as MapData;
}

function makeParams(mapData: MapData, notePath: string): UseMcpBridgeParams {
  const noop = vi.fn();
  return {
    mapData, mapId: 'm1', mapName: 'fallback', notePath, mcpKey: undefined, fullPane: false,
    geometry: {} as unknown as ExtendedGeometry,
    currentTool: 'draw', selectedColor: '#fff', selectedOpacity: 1,
    canUndo: false, canRedo: false, saveStatus: 'saved', isExpanded: false,
    availableTilesets: [],
    setCurrentTool: noop, setSelectedColor: noop, handleOpacityChange: noop,
    handleCellsChange: noop, wrappedHandleUndo: noop, handleRedo: noop, handleLayerSelect: noop,
    forceSave: noop, handleViewStateChange: noop, handleTileSelect: noop, setSelectedTileForm: noop,
    handleTilesChange: noop, handleObjectsChange: noop, selectPane: noop,
    setTileBrowserCollapsed: noop, setRailOpenId: noop, getCachedImage: () => null,
    editLevelLock: null, handleLevelCellsChange: vi.fn(() => null),
  };
}

function Probe(props: { params: UseMcpBridgeParams }) {
  useMcpBridge(props.params);
  return null;
}

describe('useMcpBridge', () => {
  let root: HTMLElement;

  beforeEach(() => {
    window.__windrose = { mcpInstances: {} };
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    act(() => { render(null, root); });
    root.remove();
    delete window.__windrose;
  });

  it('keeps the same registration object across mapData changes and reads live values', () => {
    act(() => { render(h(Probe, { params: makeParams(makeMap('A', 1), 'n.md') }), root); });
    const first = window.__windrose?.mcpInstances?.['n.md'];
    expect(first).toBeDefined();
    expect(first?.cellCount).toBe(1);

    act(() => { render(h(Probe, { params: makeParams(makeMap('B', 3), 'n.md') }), root); });
    const second = window.__windrose?.mcpInstances?.['n.md'];
    expect(second).toBe(first);
    expect(second?.cellCount).toBe(3);
    expect(second?.mapName).toBe('B');
    expect(second?.ops).toBe(first?.ops);
    expect(typeof second?.ops.getCells).toBe('function');
    expect(second?.ops.getCells()).toHaveLength(3);
  });

  it('registers two instances sharing one notePath and removes only the unmounting one', () => {
    const rootB = document.createElement('div');
    document.body.appendChild(rootB);
    act(() => { render(h(Probe, { params: makeParams(makeMap('A', 1), 'n.md') }), root); });
    act(() => { render(h(Probe, { params: makeParams(makeMap('B', 2), 'n.md') }), rootB); });

    const reg = window.__windrose?.mcpInstances ?? {};
    const keys = Object.keys(reg);
    expect(keys).toHaveLength(2);
    expect(reg['n.md']?.mapName).toBe('A');
    const otherKey = keys.find(k => k !== 'n.md');
    expect(otherKey?.startsWith('n.md#')).toBe(true);
    expect(reg[otherKey ?? '']?.mapName).toBe('B');
    expect(reg['n.md']?.instanceId).not.toBe(reg[otherKey ?? '']?.instanceId);

    // Unmounting the first block promotes the survivor to the plain note-path key.
    act(() => { render(null, root); });
    const after = window.__windrose?.mcpInstances ?? {};
    expect(Object.keys(after)).toEqual(['n.md']);
    expect(after['n.md']?.mapName).toBe('B');

    act(() => { render(null, rootB); });
    rootB.remove();
    expect(Object.keys(window.__windrose?.mcpInstances ?? {})).toHaveLength(0);
  });
  it('undo/redo report whether the map changed when the handler says so (parallax wave-7 #9)', () => {
    const params = { ...makeParams(makeMap('A', 1), 'n.md'), canUndo: true, canRedo: true,
      wrappedHandleUndo: () => false, handleRedo: () => true };
    act(() => { render(h(Probe, { params }), root); });
    const ops = window.__windrose?.mcpInstances?.['n.md']?.ops;
    expect(ops?.undo()).toBe(false);
    expect(ops?.redo()).toBe(true);
  });

  it('falls back to the availability flag when the handler returns nothing', () => {
    const params = { ...makeParams(makeMap('A', 1), 'n.md'), canUndo: true };
    act(() => { render(h(Probe, { params }), root); });
    expect(window.__windrose?.mcpInstances?.['n.md']?.ops.undo()).toBe(true);
  });

  it('getActiveLevel prefers the live getter', () => {
    const live = { level: 2 as number | null };
    const params = { ...makeParams(makeMap('A', 1), 'n.md'), readLiveActiveLevel: () => live.level };
    act(() => { render(h(Probe, { params }), root); });
    const entry = window.__windrose?.mcpInstances?.['n.md'];
    expect(entry?.getActiveLevel()).toBe(2);
    // No canvas published a getter: fall back to the committed zoom (0 off a ladder).
    live.level = null;
    expect(entry?.getActiveLevel()).toBe(0);
  });

  describe('depth gate through the real data handlers', () => {
    const STAMPED = { m: 4, minCellPx: 64, maxLevel: 3 };
    const tileset = { id: 'ts', name: 'TS', tiles: [{ id: 't1', vaultPath: 'tiles/t1.png' }] };

    /** Bridge + useDataHandlers over a synchronously updated map, like the DMT wiring. */
    function mountLive(initial: MapData): { map: () => MapData } {
      let current = initial;
      const geometry = createGeometry(initial);
      const updateMapData = (u: MapData | ((prev: MapData) => MapData)): void => {
        current = typeof u === 'function' ? u(current) : u;
      };
      function LiveProbe(): null {
        const data = useDataHandlers({ mapData: current, updateMapData, addToHistory: vi.fn(), isApplyingHistory: () => false });
        useMcpBridge({
          ...makeParams(current, 'live.md'),
          geometry,
          availableTilesets: [tileset] as unknown as UseMcpBridgeParams['availableTilesets'],
          handleCellsChange: data.handleCellsChange,
          handleLevelCellsChange: data.handleLevelCellsChange,
          handleObjectsChange: data.handleObjectsChange,
          handleTilesChange: data.handleTilesChange,
        });
        return null;
      }
      act(() => { render(h(LiveProbe, {}), root); });
      return { map: () => current };
    }
    const ops = () => {
      const o = window.__windrose?.mcpInstances?.['live.md']?.ops;
      if (o == null) throw new Error('bridge not registered');
      return o;
    };

    afterEach(() => { ladderFlag.on = false; });

    it('flag off, stamped map: placeObject(level 2) refused not-a-ladder', () => {
      ladderFlag.on = false;
      const base = { ...createNewMap('Off', 'hex'), lod: STAMPED };
      const live = mountLive(base);
      const r = ops().placeObject('chest', 0, 0, 2);
      expect(r).toEqual({ ok: false, error: 'not-a-ladder' });
      expect(live.map()).toBe(base);
    });

    it('over-budget placeTile refused', () => {
      ladderFlag.on = true;
      const stamped = { ...createNewMap('Full', 'hex'), lod: STAMPED };
      const base = padUnderBudget(stamped);
      const live = mountLive(base);
      const r = ops().placeTile({ col: 0, row: 0, tilesetId: 'ts', tileId: 't1' }, 1);
      expect(r.ok).toBe(false);
      expect(r.error).toBe('over-budget');
      expect(live.map()).toBe(base);
    });

    it('paint_cells at depth returns the gate verdict and leaves mapData identity on refusal', () => {
      ladderFlag.on = false;
      const base = { ...createNewMap('Off', 'hex'), lod: STAMPED };
      const live = mountLive(base);
      const r = ops().paintCells([{ x: 0, y: 0, color: '#123456' }], 1) as WindroseLevelWriteResult;
      expect(r.ok).toBe(false);
      expect(r.error).toBe('not-a-ladder');
      expect(live.map()).toBe(base);
    });

    it('flag on: a deep placeObject lands and stamps nothing new on a stamped map', () => {
      ladderFlag.on = true;
      const base = { ...createNewMap('On', 'hex'), lod: STAMPED };
      const live = mountLive(base);
      const r = ops().placeObject('chest', 0, 0, 2);
      expect(r.ok).toBe(true);
      expect(live.map().layers[0].objects.some(o => o.homeLevel === 2)).toBe(true);
      expect(live.map().lod).toEqual(STAMPED);
    });
  });
});
