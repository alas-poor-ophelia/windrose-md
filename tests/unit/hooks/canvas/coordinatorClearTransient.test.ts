// @vitest-environment happy-dom
/**
 * Gesture-boundary wiring of useLayerHistory.clearTransient in the event
 * coordinator (parallax-livefix finding 2):
 * - pointercancel / touchcancel run the release stop paths, THEN drop pins;
 *   with real history, the next paint is one undo step and the abandoned
 *   live move stays in place
 * - a new single-pointer press drops pins; a second finger (pinch) does not
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useCallback, useState } from 'preact/hooks';

import type { MapData, PartyPin } from '../../../../types/core/map.types';
import type { MapDataUpdater } from '../../../../types/hooks/mapData.types';
import type { Cell } from '../../../../types/core/cell.types';

type Handlers = Record<string, unknown>;
const registry: Record<string, Handlers | undefined> = {};
const getHandlers = (name: string): Handlers | undefined => registry[name];

const canvas = document.createElement('canvas');
const canvasRef = { current: canvas };
const geometry = { type: 'grid', cellSize: 10 };
const screenToWorld = (x: number, y: number): { worldX: number; worldY: number } => ({ worldX: x, worldY: y });
const screenToGrid = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / 10), y: Math.floor(y / 10) });
const mapState = {
  canvasRef, screenToGrid, screenToWorld, geometry, currentTool: 'edgeLine',
  mapData: null, viewController: null, subHexPath: null, instanceId: 'test', requestEnterSubHex: undefined,
};
const noop = (): void => {};
// Forwarded to whatever the test installs (a spy, or the real history's clearTransient).
let clearImpl: () => void = noop;
const ops = { clearTransient: (): void => { clearImpl(); } };

vi.mock('../../../../src/context/MapContext', () => ({
  useMapState: () => mapState,
  useMapOperations: () => ops,
}));
vi.mock('../../../../src/context/MapSelectionContext', () => ({
  useMapSelection: () => ({
    selectedItem: null, setSelectedItem: noop, isDraggingSelection: false, setIsDraggingSelection: noop,
    dragStart: null, setDragStart: noop, layerVisibility: {}, hasMultiSelection: false,
    isGroupDragging: false, clearSelection: noop,
  }),
}));
vi.mock('../../../../src/context/EventHandlerContext', () => ({
  useRegisteredHandlers: () => ({ getHandlers }),
}));
vi.mock('../../../../src/hooks/objects/useGroupDrag', () => ({
  useGroupDrag: () => ({ getClickedSelectedItem: () => null, startGroupDrag: noop, handleGroupDrag: noop, stopGroupDrag: noop }),
}));
vi.mock('../../../../src/core/subHexBackdropStore', () => ({ captureSubHexBackdrop: () => {} }));

import { useEventCoordinator } from '../../../../src/hooks/canvas/useEventCoordinator';
import { useLayerHistory } from '../../../../src/hooks/state/useLayerHistory';
import { useDataHandlers } from '../../../../src/hooks/state/useDataHandlers';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { getActiveLayer } from '../../../../src/persistence/layerAccessor';

type History = ReturnType<typeof useLayerHistory>;
type DataHandlers = ReturnType<typeof useDataHandlers>;

function Probe(): null {
  useEventCoordinator({ isColorPickerOpen: false });
  return null;
}

let root: HTMLElement;
let historyRoot: HTMLElement | null = null;

beforeEach(() => {
  document.body.appendChild(canvas);
  root = document.createElement('div');
  document.body.appendChild(root);
  clearImpl = noop;
  for (const k of Object.keys(registry)) delete registry[k];
  registry.panZoom = {
    getClientCoords: (e: MouseEvent) => ({ clientX: e.clientX, clientY: e.clientY }),
    screenToGrid, isPanning: false, panStart: null,
    isTouchPanningRef: { current: false }, lastTouchTimeRef: { current: 0 },
    startPan: noop, startPinch: noop, getTouchCenter: () => null, getTouchDistance: () => null,
  };
  act(() => { render(h(Probe, null), root); });
});

afterEach(() => {
  act(() => { render(null, root); });
  if (historyRoot) render(null, historyRoot);
  historyRoot = null;
  root.remove();
  canvas.remove();
});

interface MountedHistory {
  map: () => MapData;
  history: () => History;
  run: (fn: (hd: DataHandlers, hist: History) => void) => void;
}

/** Real useLayerHistory + useDataHandlers, a render between writes (as live). */
function mountHistory(initial: MapData): MountedHistory {
  let map = initial;
  let history: History | null = null;
  let handlers: DataHandlers | null = null;
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
  historyRoot = document.createElement('div');
  act(() => { render(h(Harness, null), historyRoot as HTMLElement); });
  return {
    map: () => map,
    history: () => history as History,
    run: (fn) => { act(() => { fn(handlers as DataHandlers, history as History); }); },
  };
}

const cell = (x: number, y: number): Cell => ({ x, y, color: '#c4a57b', opacity: 1 }) as Cell;
const pin = (id: string, x: number, y: number): PartyPin => ({ id, position: { x, y } }) as unknown as PartyPin;

describe('coordinator clears transient history pins at gesture boundaries', () => {
  it('pointercancel runs the stop paths before clearing', () => {
    const order: string[] = [];
    registry.partyPin = { stopPartyPinDrag: () => { order.push('stop'); } };
    clearImpl = (): void => { order.push('clear'); };
    window.dispatchEvent(new Event('pointercancel'));
    expect(order).toEqual(['stop', 'clear']);
  });

  it('touchcancel after an abandoned drag: the next paint is one undo step and the move stays', () => {
    const m = mountHistory({ ...createNewMap('Map', 'grid'), partyPins: [pin('p1', 1, 1)] });
    clearImpl = (): void => { m.history().clearTransient(); };
    // Live (transient) moves of a drag whose own stop path never commits.
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 2, 1)], true); });
    m.run((hd) => { hd.handlePartyPinsChange([pin('p1', 3, 1)], true); });

    act(() => { window.dispatchEvent(new Event('touchcancel')); });

    m.run((hd) => { hd.handleCellsChange([cell(5, 5)]); });
    let undone = false;
    m.run((_hd, hist) => { undone = hist.handleUndo(); });
    expect(undone).toBe(true);
    expect(getActiveLayer(m.map()).cells).toHaveLength(0);
    expect(m.map().partyPins?.[0].position).toEqual({ x: 3, y: 1 });
    expect(m.history().canUndo).toBe(false);
  });

  it('a new press clears; a second finger landing (pinch) does not', () => {
    const clear = vi.fn();
    clearImpl = clear;
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, bubbles: true }));
    expect(clear).toHaveBeenCalledTimes(1);

    const touch = { clientX: 1, clientY: 1, identifier: 0 };
    const twoFinger = new Event('touchstart', { bubbles: true, cancelable: true });
    Object.defineProperty(twoFinger, 'touches', { value: [touch, { ...touch, identifier: 1 }] });
    act(() => { canvas.dispatchEvent(twoFinger); });
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it('a press closes a tile stroke that lost its release before clearing', () => {
    const order: string[] = [];
    registry.tilePlacement = { handlePointerUp: () => { order.push('endStroke'); } };
    clearImpl = (): void => { order.push('clear'); };
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 5, clientY: 5, bubbles: true }));
    expect(order.slice(0, 2)).toEqual(['endStroke', 'clear']);
  });
});
