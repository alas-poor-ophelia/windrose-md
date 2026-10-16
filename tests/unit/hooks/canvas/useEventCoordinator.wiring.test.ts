// @vitest-environment happy-dom
/**
 * useEventCoordinator wiring (audit WIRE-01/02/04, REACT-01):
 * - edgeLine hover preview reaches updateEdgeLineHover on mouse move
 * - Escape reaches the fog layer's handler while a fog rectangle is pending
 *   (and never from a typing surface)
 * - leaving the canvas clears the segment-draw hover
 * - a new layerVisibility object does not rebind the canvas listeners
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

type Handlers = Record<string, unknown>;
const registry: Record<string, Handlers | undefined> = {};
const getHandlers = (name: string): Handlers | undefined => registry[name];

const canvas = document.createElement('canvas');
const canvasRef = { current: canvas };
const geometry = { type: 'grid', cellSize: 10 };
const screenToWorld = (x: number, y: number): { worldX: number; worldY: number } => ({ worldX: x, worldY: y });
const screenToGrid = (x: number, y: number): { x: number; y: number } => ({ x: Math.floor(x / 10), y: Math.floor(y / 10) });

let currentTool = 'edgeLine';
let layerVisibility: Record<string, boolean> = { objects: true, textLabels: true };

const mapState = {
  canvasRef, screenToGrid, screenToWorld, geometry,
  mapData: null, viewController: null, subHexPath: null, instanceId: 'test', requestEnterSubHex: undefined,
};
const noop = (): void => {};

vi.mock('../../../../src/context/MapContext', () => ({
  useMapState: () => ({ ...mapState, currentTool }),
  useMapOperations: () => ({}),
}));
vi.mock('../../../../src/context/MapSelectionContext', () => ({
  useMapSelection: () => ({
    selectedItem: null, setSelectedItem: noop, isDraggingSelection: false, setIsDraggingSelection: noop,
    dragStart: null, setDragStart: noop, layerVisibility, hasMultiSelection: false,
    isGroupDragging: false, clearSelection: noop,
  }),
}));
vi.mock('../../../../src/context/EventHandlerContext', () => ({
  useRegisteredHandlers: () => ({ getHandlers }),
}));
const groupDrag = { getClickedSelectedItem: () => null, startGroupDrag: noop, handleGroupDrag: noop, stopGroupDrag: noop };
vi.mock('../../../../src/hooks/objects/useGroupDrag', () => ({
  useGroupDrag: () => groupDrag,
}));
vi.mock('../../../../src/core/subHexBackdropStore', () => ({
  captureSubHexBackdrop: () => {},
}));

import { useEventCoordinator } from '../../../../src/hooks/canvas/useEventCoordinator';

function Probe(): null {
  useEventCoordinator({ isColorPickerOpen: false });
  return null;
}

let root: HTMLElement;
function mount(): void {
  act(() => { render(h(Probe, null), root); });
}

beforeEach(() => {
  document.body.appendChild(canvas);
  root = document.createElement('div');
  document.body.appendChild(root);
  currentTool = 'edgeLine';
  layerVisibility = { objects: true, textLabels: true };
  for (const k of Object.keys(registry)) delete registry[k];
  registry.panZoom = {
    getClientCoords: (e: MouseEvent) => ({ clientX: e.clientX, clientY: e.clientY }),
    screenToGrid,
    isPanning: false,
    panStart: null,
    isTouchPanningRef: { current: false },
    lastTouchTimeRef: { current: 0 },
  };
});

afterEach(() => {
  act(() => { render(null, root); });
  root.remove();
  canvas.remove();
});

describe('useEventCoordinator wiring', () => {
  it('drives the edgeLine hover preview to the nearest intersection on mouse move (WIRE-04)', () => {
    const updateEdgeLineHover = vi.fn();
    registry.drawing = {
      handleDrawingPointerMove: () => false,
      previewEnabled: true,
      updateShapeHover: noop,
      edgeLineStart: { x: 0, y: 0 },
      updateEdgeLineHover,
    };
    mount();
    canvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 34, clientY: 47, bubbles: true }));
    expect(updateEdgeLineHover).toHaveBeenCalledWith(3, 5);
  });

  it('routes Escape to the fog layer while a fog rectangle is pending (WIRE-01)', () => {
    const fogKeyDown = vi.fn();
    const objectKeyDown = vi.fn(() => true);
    registry.fogOfWar = { handleKeyDown: fogKeyDown, rectangleStart: { col: 1, row: 2 } };
    registry.object = { handleObjectKeyDown: objectKeyDown };
    mount();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fogKeyDown).toHaveBeenCalledTimes(1);
    expect(objectKeyDown).not.toHaveBeenCalled();
  });

  it('leaves Escape to the selection handlers when no fog rectangle is pending', () => {
    const fogKeyDown = vi.fn();
    const objectKeyDown = vi.fn(() => true);
    registry.fogOfWar = { handleKeyDown: fogKeyDown, rectangleStart: null };
    registry.object = { handleObjectKeyDown: objectKeyDown };
    mount();
    canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fogKeyDown).not.toHaveBeenCalled();
    expect(objectKeyDown).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape typed in a form field', () => {
    const fogKeyDown = vi.fn();
    registry.fogOfWar = { handleKeyDown: fogKeyDown, rectangleStart: { col: 1, row: 2 } };
    mount();
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    input.remove();
    expect(fogKeyDown).not.toHaveBeenCalled();
  });

  it('clears the segment-draw hover when the pointer leaves the canvas (WIRE-02)', () => {
    currentTool = 'segmentDraw';
    const clearSegmentHover = vi.fn();
    registry.drawing = { cancelDrawing: noop, clearSegmentHover };
    mount();
    canvas.dispatchEvent(new MouseEvent('mouseleave'));
    expect(clearSegmentHover).toHaveBeenCalledTimes(1);
  });

  it('does not rebind canvas listeners when layerVisibility gets a new identity (REACT-01)', () => {
    const addSpy = vi.spyOn(canvas, 'addEventListener');
    mount();
    const countMoves = (): number => addSpy.mock.calls.filter(([type]) => type === 'mousemove').length;
    const before = countMoves();
    expect(before).toBeGreaterThan(0);
    layerVisibility = { ...layerVisibility };
    mount();
    expect(countMoves()).toBe(before);
    addSpy.mockRestore();
  });
});
