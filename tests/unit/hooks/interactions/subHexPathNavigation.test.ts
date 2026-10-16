// @vitest-environment happy-dom
/**
 * useSubHexNavigation on a hexKey path (windrose-mn1.4, STRUCT-B-22 /
 * DATA-04). The hook keeps no copy of any parent map: the active level is
 * read from the live root and every write goes through setAtSubHexPath, so
 * root changes made after a dive survive sub-hex edits and exits.
 */

import { describe, it, expect, vi } from 'vitest';
import { h, render } from 'preact';
import { useCallback, useState } from 'preact/hooks';
import { act } from 'preact/test-utils';

import type { MapData, SubHexMapData } from '#types/core/map.types';
import type { MapDataUpdater, MapDataUpdateOptions } from '#types/hooks/mapData.types';

vi.mock('../../../../src/core/featureFlags', () => ({ isFeatureEnabled: () => true }));

import { useSubHexNavigation } from '../../../../src/hooks/interactions/useSubHexNavigation';
import { getMapAtSubHexPath } from '../../../../src/persistence/subHexPath';

type Nav = ReturnType<typeof useSubHexNavigation>;

function hexMap(name: string, subHexMaps?: Record<string, SubHexMapData>): MapData {
  return {
    name,
    mapType: 'hex',
    hexSize: 24,
    orientation: 'flat',
    hexBounds: { maxCol: 0, maxRow: 0, maxRing: 7 },
    viewState: { zoom: 1, center: { x: 0, y: 0 } },
    layers: [],
    subHexMaps
  } as unknown as MapData;
}

function entry(mapData: MapData): SubHexMapData {
  return { subdivisionRings: 7, mapData, lastModified: '2020-01-01T00:00:00.000Z' };
}

/** Root -> "0,0" (A) -> "2,-1" (B). */
function tree(): MapData {
  return hexMap('Root', { '0,0': entry(hexMap('A', { '2,-1': entry(hexMap('B')) })) });
}

interface Harness {
  nav: () => Nav;
  root: () => MapData;
  /** A write straight to the root store (MCP, tileset rescan, journal restore). */
  rootWrite: MapDataUpdater;
  /** The same root write without its own act(), to batch with a nav call. */
  rootWriteInBatch: MapDataUpdater;
  writes: MapDataUpdateOptions[];
  unmount: () => void;
}

function mount(initial: MapData, initialSubHexPath?: string): Harness {
  let nav: Nav | null = null;
  let root: MapData = initial;
  let rootWrite: MapDataUpdater | null = null;
  const writes: MapDataUpdateOptions[] = [];

  function Probe(): null {
    const [data, setData] = useState<MapData>(initial);
    // Same contract as useDebouncedSave.updateMapData: functional updates
    // apply to the latest state.
    const update = useCallback<MapDataUpdater>((u, options) => {
      writes.push(options ?? {});
      setData(prev => (typeof u === 'function' ? u(prev) : u));
    }, []);
    root = data;
    rootWrite = update;
    nav = useSubHexNavigation({ mapData: data, updateMapData: update, initialSubHexPath });
    return null;
  }

  const container = document.createElement('div');
  act(() => { render(h(Probe, null), container); });
  return {
    nav: () => nav as Nav,
    root: () => root,
    rootWrite: (u, o) => { act(() => { (rootWrite as MapDataUpdater)(u, o); }); },
    rootWriteInBatch: (u, o) => { (rootWrite as MapDataUpdater)(u, o); },
    writes,
    unmount: () => { act(() => { render(null, container); }); }
  };
}

function step(fn: () => void): void {
  act(() => { fn(); });
}

describe('useSubHexNavigation: path-based navigation', () => {
  it('dive two levels, root changes, edit at depth 2, exit: both survive', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    step(() => hx.nav().enterSubHex(2, -1));
    expect(hx.nav().subHexPath).toBe('0,0/2,-1');
    expect(hx.nav().activeMapData?.name).toBe('B');

    // Root changes while drilled in (tileset rescan, board edit).
    hx.rootWrite(prev => ({ ...prev, name: 'Root (rescanned)', tilesets: [] }));
    expect(hx.nav().breadcrumbs[0].label).toBe('Root (rescanned)');

    step(() => hx.nav().activeUpdateMapData(m => ({ ...m, name: 'B edited' })));
    expect(hx.nav().activeMapData?.name).toBe('B edited');
    expect(hx.root().name).toBe('Root (rescanned)');

    step(() => hx.nav().exitSubHex());
    step(() => hx.nav().exitSubHex());
    expect(hx.nav().isInSubHex).toBe(false);
    expect(hx.root().name).toBe('Root (rescanned)');
    expect(hx.root().tilesets).toEqual([]);
    expect(getMapAtSubHexPath(hx.root(), ['0,0', '2,-1'])?.name).toBe('B edited');
    hx.unmount();
  });

  it('an MCP write to the root while a sub-hex is open survives the next sub-hex edit', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    hx.rootWrite(prev => ({ ...prev, name: 'Root via MCP' }));
    step(() => hx.nav().activeUpdateMapData(m => ({ ...m, name: 'A edited' })));
    expect(hx.root().name).toBe('Root via MCP');
    expect(getMapAtSubHexPath(hx.root(), ['0,0'])?.name).toBe('A edited');
    expect(getMapAtSubHexPath(hx.root(), ['0,0', '2,-1'])?.name).toBe('B');
    hx.unmount();
  });

  it('navigation writes are cosmetic; creating a sub-map is a real write', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    hx.writes.length = 0;
    step(() => hx.nav().enterSubHex(1, 0)); // missing -> created
    expect(hx.nav().subHexPath).toBe('0,0/1,0');
    expect(getMapAtSubHexPath(hx.root(), ['0,0', '1,0'])).not.toBeNull();
    expect(hx.writes).toEqual([{ cosmetic: false }]);

    hx.writes.length = 0;
    step(() => hx.nav().navigateToLevel(0));
    expect(hx.nav().isInSubHex).toBe(false);
    expect(hx.writes).toEqual([{ cosmetic: true }]);
    hx.unmount();
  });

  it('embed auto-drill, then a journal restore replaces the root: the view follows the restored data', () => {
    const hx = mount(tree(), '0,0/2,-1');
    expect(hx.nav().subHexPath).toBe('0,0/2,-1');

    const restored = hexMap('Root (restored)', {
      '0,0': entry(hexMap('A', { '2,-1': entry(hexMap('B restored')) }))
    });
    hx.rootWrite(restored);
    expect(hx.nav().activeMapData?.name).toBe('B restored');

    step(() => hx.nav().activeUpdateMapData(m => ({ ...m, name: 'B restored + edit' })));
    expect(hx.root().name).toBe('Root (restored)');
    expect(getMapAtSubHexPath(hx.root(), ['0,0', '2,-1'])?.name).toBe('B restored + edit');
    hx.unmount();
  });

  it('a restore that removes the open level trims navigation to the deepest surviving level', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    step(() => hx.nav().enterSubHex(2, -1));
    hx.rootWrite(hexMap('Root (restored)', { '0,0': entry(hexMap('A only')) }));
    expect(hx.nav().subHexPath).toBe('0,0');
    expect(hx.nav().activeMapData?.name).toBe('A only');
    hx.unmount();
  });

  it('parallax wave-6 #4: a creation against a level that vanished first pushes no dead frame', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    // Same batch: another writer removes level A, then a dive from A's stale view creates "1,0".
    step(() => {
      hx.rootWriteInBatch(hexMap('Root (A removed)'));
      hx.nav().enterSubHex(1, 0);
    });
    expect(getMapAtSubHexPath(hx.root(), ['0,0'])).toBeNull();
    expect(hx.nav().isInSubHex).toBe(false);

    // A later writer recreates exactly that path: the view must not jump into it.
    hx.rootWrite(hexMap('Root (rebuilt)', { '0,0': entry(hexMap('A2', { '1,0': entry(hexMap('C')) })) }));
    expect(hx.nav().isInSubHex).toBe(false);
    expect(hx.nav().subHexPath).toBeNull();
    hx.unmount();
  });

  it('parallax wave-6 #4: a sibling creation against a vanished parent level pushes no dead frame', () => {
    const hx = mount(tree());
    step(() => hx.nav().enterSubHex(0, 0));
    step(() => hx.nav().enterSubHex(2, -1));
    step(() => {
      // The parent level A vanishes in the same batch as the sibling creation.
      hx.rootWriteInBatch(hexMap('Root (A removed)'));
      hx.nav().navigateToSibling(1, -1, { createIfMissing: true });
    });
    // No "0,0/1,-1" frame was pushed; the vanished path trims to the root.
    expect(hx.nav().subHexPath).toBeNull();
    hx.rootWrite(hexMap('Root', { '0,0': entry(hexMap('A again', { '1,-1': entry(hexMap('D')) })) }));
    expect(hx.nav().subHexPath).toBeNull();
    hx.unmount();
  });
});
