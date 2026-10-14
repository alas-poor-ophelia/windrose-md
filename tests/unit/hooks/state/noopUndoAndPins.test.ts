// @vitest-environment happy-dom
/**
 * Live walk chunk 4 side finding (an empty select click left an undo step
 * that changed nothing) and parallax-livefix finding 2 (an abandoned drag's
 * pin absorbed by the next unrelated commit). Real useLayerHistory + real
 * useDataHandlers, a render between every write, as live.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useCallback, useState } from 'preact/hooks';

import type { MapData, PartyPin } from '../../../../types/core/map.types';
import type { MapDataUpdater } from '../../../../types/hooks/mapData.types';
import type { Cell } from '../../../../types/core/cell.types';

import { useLayerHistory } from '../../../../src/hooks/state/useLayerHistory';
import { useDataHandlers } from '../../../../src/hooks/state/useDataHandlers';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { getActiveLayer } from '../../../../src/persistence/layerAccessor';

type History = ReturnType<typeof useLayerHistory>;
type Handlers = ReturnType<typeof useDataHandlers>;

interface Mounted {
  map: () => MapData;
  history: () => History;
  run: (fn: (handlers: Handlers, history: History) => void) => void;
}

let container: HTMLElement | null = null;

function mount(initial: MapData): Mounted {
  let map = initial;
  let history: History | null = null;
  let handlers: Handlers | null = null;

  function Harness(): null {
    const [, force] = useState(0);
    const updateMapData = useCallback<MapDataUpdater>((u) => {
      map = typeof u === 'function' ? (u(map) ?? map) : u;
      force((n: number) => n + 1);
    }, []);
    history = useLayerHistory({ mapData: map, updateMapData, isLoading: false, levelKey: null });
    handlers = useDataHandlers({ mapData: map, updateMapData, addToHistory: history.addToHistory, isApplyingHistory: history.isApplyingHistory });
    return null;
  }

  container = document.createElement('div');
  act(() => { render(h(Harness, null), container as HTMLElement); });
  return {
    map: () => map,
    history: () => history as History,
    run: (fn) => { act(() => { fn(handlers as Handlers, history as History); }); }
  };
}

afterEach(() => {
  if (container) render(null, container);
  container = null;
});

const cell = (x: number, y: number): Cell => ({ x, y, color: '#c4a57b', opacity: 1 }) as Cell;
const pin = (id: string, x: number, y: number): PartyPin => ({ id, position: { x, y } }) as unknown as PartyPin;

function undo(m: Mounted): boolean {
  let r = false;
  m.run((_h, hist) => { r = hist.handleUndo(); });
  return r;
}

describe('empty select click records no undo step', () => {
  it('paint, then the writes an empty select click reaches (pan end view state): one undo removes the paint', () => {
    const m = mount(createNewMap('Map', 'grid'));
    m.run((hd) => { hd.handleCellsChange([cell(2, 12)]); });
    expect(getActiveLayer(m.map()).cells).toHaveLength(1);

    // Empty select click: hit tests miss, the press arms a pan and the release
    // ends it. The only map write is the cosmetic view-state commit.
    const vs = m.map().viewState;
    m.run((hd) => { hd.handleViewStateChange({ zoom: vs?.zoom ?? 1, center: vs?.center ?? { x: 0, y: 0 } }); });

    expect(undo(m)).toBe(true);
    expect(getActiveLayer(m.map()).cells).toHaveLength(0);
    expect(m.history().canUndo).toBe(false);
  });

  it('a handler re-sent its current value (same reference) records nothing', () => {
    const m = mount(createNewMap('Map', 'grid'));
    m.run((hd) => { hd.handleCellsChange([cell(1, 1)]); });
    m.run((hd) => { hd.handleObjectsChange(getActiveLayer(m.map()).objects); });
    m.run((hd) => { hd.handleTilesChange(getActiveLayer(m.map()).tiles ?? [], false); });
    m.run((hd) => { hd.handlePartyPinsChange(m.map().partyPins ?? [], false); });
    expect(undo(m)).toBe(true);
    expect(getActiveLayer(m.map()).cells).toHaveLength(0);
    expect(m.history().canUndo).toBe(false);
  });
});

describe('clearTransient (parallax-livefix 2)', () => {
  it('an abandoned drag pin is not absorbed by the next unrelated commit', () => {
    const start = { ...createNewMap('Map', 'grid'), partyPins: [pin('p1', 1, 1)] };
    const m = mount(start);
    // Beacon drag: live (transient) moves, then the drag is abandoned (no drop commit).
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 2, 1)], true); });
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 3, 1)], true); });
    m.run((_hd, hist) => { hist.clearTransient(); });

    // An unrelated edit.
    m.run((hd) => { hd.handleCellsChange([cell(5, 5)]); });

    expect(undo(m)).toBe(true);
    expect(getActiveLayer(m.map()).cells).toHaveLength(0);
    // The abandoned move is not part of the paint's entry.
    expect(m.map().partyPins?.[0].position).toEqual({ x: 3, y: 1 });
    expect(m.history().canUndo).toBe(false);
  });

  it('without the clear the same sequence folds the drag into the paint entry (the bug)', () => {
    const start = { ...createNewMap('Map', 'grid'), partyPins: [pin('p1', 1, 1)] };
    const m = mount(start);
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 3, 1)], true); });
    m.run((hd) => { hd.handleCellsChange([cell(5, 5)]); });
    expect(undo(m)).toBe(true);
    expect(m.map().partyPins?.[0].position).toEqual({ x: 1, y: 1 });
  });

  it('a completed drag still commits as one step after clearTransient ran before it', () => {
    const start = { ...createNewMap('Map', 'grid'), partyPins: [pin('p1', 1, 1)] };
    const m = mount(start);
    m.run((_hd, hist) => { hist.clearTransient(); }); // pointer-down of the new gesture
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 2, 1)], true); });
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 4, 1)], true); });
    m.run((hd) => { hd.handlePartyPinsChange(m.map().partyPins ?? [], false); });
    expect(undo(m)).toBe(true);
    expect(m.map().partyPins?.[0].position).toEqual({ x: 1, y: 1 });
    expect(m.history().canUndo).toBe(false);
  });
});
