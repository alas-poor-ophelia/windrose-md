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
import { useMcpBridge, type UseMcpBridgeParams } from '../../../../src/hooks/state/useMcpBridge';

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
});
