/**
 * Per-map canvas cursor store (REACT-04).
 *
 * MapCanvas owns one store per map and binds it to that map's canvas element;
 * the pan/zoom coordinator feeds space-held / pointer-over / panning, and
 * DrawingLayer feeds the shape and drawing states. The store writes the
 * element's className directly (tool class + at most one transient class), so
 * input-driven cursor changes never reconcile the Preact tree. MapCanvas does
 * NOT pass a className prop to the canvas: Preact would overwrite the
 * transient class whenever the tool class changed.
 */

import type { ToolId } from '#types/tools/tool.types';
import type {
  CanvasCursorStore,
  CanvasDrawingCursor,
  CanvasStateCursorClass
} from '#types/hooks/canvasCursor.types';

export function createCanvasCursorStore(): CanvasCursorStore {
  let el: HTMLElement | null = null;
  let base = 'windrose-canvas';
  let spaceHeld = false;
  let pointerOver = false;
  let panning = false;
  let drawing: CanvasDrawingCursor | null = null;
  let current: CanvasStateCursorClass | null = null;
  const listeners = new Set<(stateClass: CanvasStateCursorClass | null) => void>();

  // Priority: an active pan > Space held over the canvas > drawing-layer state.
  const resolve = (): CanvasStateCursorClass | null => {
    if (panning) return 'windrose-canvas-panning';
    if (spaceHeld && pointerOver) return 'windrose-canvas-space-grab';
    if (drawing != null) return `windrose-canvas-${drawing}`;
    return null;
  };

  const write = (): void => {
    if (el == null) return;
    const next = current != null ? `${base} ${current}` : base;
    if (el.className !== next) el.className = next;
  };

  const update = (): void => {
    const next = resolve();
    if (next === current) return;
    current = next;
    write();
    for (const listener of listeners) listener(current);
  };

  return {
    attach(next) { el = next; write(); },
    setBase(className) {
      if (className === base) return;
      base = className;
      write();
    },
    setSpaceHeld(held) { spaceHeld = held; update(); },
    setPointerOver(over) { pointerOver = over; update(); },
    setPanning(next) { panning = next; update(); },
    setDrawing(cursor) { drawing = cursor; update(); },
    releaseTransient() { spaceHeld = false; panning = false; update(); },
    getStateClass() { return current; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }
  };
}

/** Tool cursor class for the canvas (the always-present base class). */
export function toolCursorClass(
  currentTool: ToolId | null | undefined,
  isDraggingSelection: boolean,
  hasObjectType: boolean
): string {
  if (isDraggingSelection) return 'windrose-canvas-selecting';
  switch (currentTool) {
    case 'select': return 'windrose-canvas-select';
    case 'measure': return 'windrose-canvas-measure';
    case 'diagonalFill': return 'windrose-canvas-diagonal-fill';
    case 'addNote': return 'windrose-canvas-add-object';
    case 'addObject': return hasObjectType ? 'windrose-canvas-add-object' : 'windrose-canvas';
    case 'addText': return 'windrose-canvas-add-text';
    case 'rectangle': return 'windrose-canvas-rectangle';
    case 'circle': return 'windrose-canvas-circle';
    case 'clearArea': return 'windrose-canvas-cleararea';
    case 'erase': return 'windrose-canvas-erase';
    default: return 'windrose-canvas';
  }
}

/**
 * Drawing-layer cursor: a placed shape start shows the -active cursor; a draw
 * stroke shows the drawing cursor. Erasing has no transient cursor (the
 * erase tool's crosshair stays) — the not-allowed cursor was dropped.
 */
export function drawingCursorFor(
  currentTool: ToolId | null | undefined,
  isDrawing: boolean,
  hasRectangleStart: boolean,
  hasCircleStart: boolean
): CanvasDrawingCursor | null {
  if (currentTool === 'rectangle') return hasRectangleStart ? 'rectangle-active' : null;
  if (currentTool === 'circle') return hasCircleStart ? 'circle-active' : null;
  if (currentTool === 'clearArea') return hasRectangleStart ? 'cleararea-active' : null;
  if (currentTool === 'draw' && isDrawing) return 'drawing';
  return null;
}
