/**
 * toolDispatch.ts
 *
 * Per-tool pointer routing for useEventCoordinator. `TOOL_ROUTES` is a
 * `Record<ToolId, ToolRoute>`: adding a tool id without an entry (and an
 * explicit decision for every phase) is a compile error.
 *
 * The coordinator keeps the cross-tool preludes (touch/pinch, pan, resize,
 * drag, fog, multi-selection clear) and calls into this table only for the
 * tool-specific step of each phase. Phases are pure functions of their
 * context, so the table is testable without mounting the hook.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point } from '#types/core/geometry.types';
import type { GetHandlers, SyntheticPointerEvent } from '#types/hooks/eventCoordinator.types';

/** Raw canvas event the coordinator receives */
export type CanvasPointerEvent = MouseEvent | TouchEvent;

export interface PhaseContext {
  getHandlers: GetHandlers;
}

/** Pointer-down for a non-selection tool (runs after the multi-selection clear) */
export interface ToolDownContext extends PhaseContext {
  e: CanvasPointerEvent;
  /** The delayed-touch synthetic event for touch, the raw event for mouse */
  eventToUse: CanvasPointerEvent | SyntheticPointerEvent;
  gridX: number;
  gridY: number;
  clientX: number;
  clientY: number;
  isTouchEvent: boolean;
  layerVisibility: { objects: boolean; textLabels: boolean };
}

export interface ToolMoveContext extends PhaseContext {
  e: CanvasPointerEvent;
  tool: ToolId;
  clientX: number;
  clientY: number;
  /** Touch list present or pointerType 'touch' */
  isTouch: boolean;
  toGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: ((clientX: number, clientY: number) => { worldX: number; worldY: number } | null) | null | undefined;
  cellSize: number | null;
}

export interface ToolUpContext extends PhaseContext {
  e: CanvasPointerEvent;
}

export interface ToolDoubleClickContext extends PhaseContext {
  e: MouseEvent;
}

export interface ToolRoute {
  /**
   * Pointer-down. `null` only for the selection tools (select, areaSelect),
   * whose press logic (group drag, hit-test cascade, pan/click arming) lives
   * in the coordinator because it needs its selection state.
   */
  down: ((ctx: ToolDownContext) => void) | null;
  /** Pointer-move. Return true when consumed; false falls through to the object hover update. */
  move: (ctx: ToolMoveContext) => boolean;
  /** Pointer-up on the canvas (after the pan/resize/drag preludes). */
  up: (ctx: ToolUpContext) => void;
  /** Pointer left the canvas. */
  leave: (ctx: PhaseContext) => void;
  /** Double-click. Return true when consumed; false falls through to text-label editing. */
  doubleClick: (ctx: ToolDoubleClickContext) => boolean;
}

const noop = (): void => {};
const notConsumed = (): boolean => false;

// ---------------------------------------------------------------------------
// Drawing family (DrawingLayer): draw, erase, rectangle, circle, clearArea,
// edgeDraw, edgeErase, edgeLine, segmentDraw
// ---------------------------------------------------------------------------

const drawingDown = ({ getHandlers, eventToUse, gridX, gridY, isTouchEvent }: ToolDownContext): void => {
  getHandlers('drawing')?.handleDrawingPointerDown?.(eventToUse, gridX, gridY, isTouchEvent);
};

const drawingMove = ({ getHandlers, e, tool, clientX, clientY, isTouch, toGrid, screenToWorld, cellSize }: ToolMoveContext): boolean => {
  const drawingHandlers = getHandlers('drawing');
  drawingHandlers?.handleDrawingPointerMove?.(e);

  if (!isTouch && drawingHandlers?.previewEnabled === true && drawingHandlers.updateShapeHover != null) {
    if (tool === 'edgeLine' && drawingHandlers.edgeLineStart != null) {
      // screenToWorld comes from MapState (the same projection the edgeLine
      // click path uses); the panZoom registry never carried it.
      const worldCoords = screenToWorld?.(clientX, clientY);
      if (worldCoords != null && cellSize != null) {
        drawingHandlers.updateEdgeLineHover?.(Math.round(worldCoords.worldX / cellSize), Math.round(worldCoords.worldY / cellSize));
      }
    } else if (tool === 'rectangle' || tool === 'clearArea' || tool === 'circle') {
      const hasStart = (tool === 'circle' && drawingHandlers.circleStart != null) ||
                       ((tool === 'rectangle' || tool === 'clearArea') && drawingHandlers.rectangleStart != null);
      if (hasStart) {
        const coords = toGrid(clientX, clientY);
        if (coords) drawingHandlers.updateShapeHover(coords.x, coords.y);
      }
    }
  }

  if (!isTouch && tool === 'segmentDraw' && drawingHandlers?.updateSegmentHover) {
    const worldCoords = screenToWorld?.(clientX, clientY);
    if (worldCoords && cellSize != null) {
      const cellX = Math.floor(worldCoords.worldX / cellSize);
      const cellY = Math.floor(worldCoords.worldY / cellSize);
      drawingHandlers.updateSegmentHover(cellX, cellY, (worldCoords.worldX / cellSize) - cellX, (worldCoords.worldY / cellSize) - cellY);
    }
  }

  // Drawing tools still drive the object hover highlight.
  return false;
};

const drawingUp = ({ getHandlers, e }: ToolUpContext): void => {
  getHandlers('drawing')?.stopDrawing?.(e);
};

const drawingLeave = ({ getHandlers }: PhaseContext): void => {
  getHandlers('drawing')?.cancelDrawing?.();
};

const DRAWING_ROUTE: ToolRoute = {
  down: drawingDown,
  move: drawingMove,
  up: drawingUp,
  leave: drawingLeave,
  doubleClick: notConsumed
};

// ---------------------------------------------------------------------------
// Generic forwarders for layers that take the raw/synthetic event
// ---------------------------------------------------------------------------

type ForwardLayer = 'freehand' | 'region' | 'outline' | 'wall' | 'shapeOverlay';

const forwardDown = (layer: ForwardLayer) => ({ getHandlers, eventToUse }: ToolDownContext): void => {
  getHandlers(layer)?.handlePointerDown?.(eventToUse);
};

const forwardMove = (layer: ForwardLayer) => ({ getHandlers, e }: ToolMoveContext): boolean => {
  getHandlers(layer)?.handlePointerMove?.(e);
  return true;
};

const forwardDoubleClick = (layer: 'region' | 'outline' | 'wall') => ({ getHandlers, e }: ToolDoubleClickContext): boolean => {
  const handler = getHandlers(layer)?.handleDoubleClick;
  if (!handler) return false;
  handler(e);
  return true;
};

const REGION_ROUTE: Omit<ToolRoute, 'doubleClick'> = {
  down: forwardDown('region'),
  move: forwardMove('region'),
  // A region label drag ends through useRegionTools' own document pointerup.
  up: noop,
  leave: noop
};

/** Placement tools do nothing while their target layer is hidden. */
const whenVisible = (needs: 'objects' | 'textLabels', run: (ctx: ToolDownContext) => void) =>
  (ctx: ToolDownContext): void => {
    if (!ctx.layerVisibility[needs]) return;
    run(ctx);
  };

const partyPinMove = ({ getHandlers, toGrid, clientX, clientY }: ToolMoveContext): boolean => {
  const handler = getHandlers('partyPin')?.handlePartyPinMove;
  if (handler) {
    const coords = toGrid(clientX, clientY);
    if (coords) handler(coords.x, coords.y);
  }
  return true;
};

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

export const TOOL_ROUTES: Record<ToolId, ToolRoute> = {
  select: {
    down: null,
    // A party pin grabbed with the select tool keeps following the pointer.
    move: (ctx) => ctx.getHandlers('partyPin')?.isPartyPinDragging?.() === true && partyPinMove(ctx),
    // Click-to-deselect is resolved in the coordinator's pan-release branch.
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },
  areaSelect: {
    down: null,
    move: ({ getHandlers, isTouch, toGrid, clientX, clientY }) => {
      if (!isTouch) {
        const areaSelectHandlers = getHandlers('areaSelect');
        if (areaSelectHandlers?.areaSelectStart != null && areaSelectHandlers.updateAreaSelectHover != null) {
          const coords = toGrid(clientX, clientY);
          if (coords) areaSelectHandlers.updateAreaSelectHover(coords.x, coords.y);
        }
      }
      return false;
    },
    // The pending-click completion runs in the coordinator's pan-release branch.
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },

  draw: DRAWING_ROUTE,
  erase: DRAWING_ROUTE,
  rectangle: DRAWING_ROUTE,
  circle: DRAWING_ROUTE,
  clearArea: DRAWING_ROUTE,
  edgeDraw: DRAWING_ROUTE,
  edgeErase: DRAWING_ROUTE,
  edgeLine: DRAWING_ROUTE,
  segmentDraw: {
    ...DRAWING_ROUTE,
    // The segment highlight only updates on moves over the canvas; drop it
    // when the pointer leaves so it does not stick at the edge.
    leave: (ctx) => {
      drawingLeave(ctx);
      ctx.getHandlers('drawing')?.clearSegmentHover?.();
    }
  },

  freehand: {
    down: ({ getHandlers, eventToUse, gridX, gridY, isTouchEvent }) => {
      getHandlers('freehand')?.handlePointerDown?.(eventToUse, gridX, gridY, isTouchEvent);
    },
    move: forwardMove('freehand'),
    up: ({ getHandlers }) => { getHandlers('freehand')?.stopDrawing?.(); },
    leave: noop,
    doubleClick: notConsumed
  },

  diagonalFill: {
    down: ({ getHandlers, e, isTouchEvent }) => {
      getHandlers('diagonalFill')?.handleDiagonalFillClick?.(e, isTouchEvent);
    },
    move: ({ getHandlers, e }) => {
      const handler = getHandlers('diagonalFill')?.handleDiagonalFillMove;
      if (!handler) return false;
      handler(e as MouseEvent);
      return true;
    },
    // Click-based: each press is a corner pick; nothing ends on release.
    up: noop,
    leave: ({ getHandlers }) => { getHandlers('diagonalFill')?.cancelFill?.(); },
    doubleClick: notConsumed
  },

  addObject: {
    down: whenVisible('objects', ({ getHandlers, gridX, gridY, clientX, clientY }) => {
      // A note-pin placement claims the press first.
      if (getHandlers('notePin')?.handleNotePinPlacement?.(gridX, gridY) === true) return;
      getHandlers('object')?.handleObjectPlacement?.(gridX, gridY, clientX, clientY);
    }),
    move: notConsumed,
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },
  addText: {
    down: whenVisible('textLabels', ({ getHandlers, clientX, clientY }) => {
      getHandlers('text')?.handleTextPlacement?.(clientX, clientY);
    }),
    move: notConsumed,
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },
  addNote: {
    down: whenVisible('objects', ({ getHandlers, gridX, gridY }) => {
      getHandlers('notePin')?.handleNotePinPlacement?.(gridX, gridY);
    }),
    move: notConsumed,
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },
  partyPin: {
    down: ({ getHandlers, gridX, gridY, clientX, clientY }) => {
      getHandlers('partyPin')?.handlePartyPinPointerDown?.(gridX, gridY, clientX, clientY);
    },
    move: partyPinMove,
    // The pin drag ends through the coordinator's window mouseup/touchend net.
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },

  regionPaint: { ...REGION_ROUTE, doubleClick: notConsumed },
  regionBoundary: { ...REGION_ROUTE, doubleClick: forwardDoubleClick('region') },

  shape: {
    down: forwardDown('shapeOverlay'),
    move: forwardMove('shapeOverlay'),
    // A shape drag ends through the isDraggingSelection prelude.
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  },

  tilePaint: {
    // Both tile layers listen on tilePaint; they self-gate on the armed
    // subtool (TerrainBrushLayer acts only for 'brush', TilePlacementLayer
    // yields it), so exactly one handles each event.
    down: ({ getHandlers, eventToUse }) => {
      getHandlers('terrainBrush')?.handlePointerDown?.(eventToUse);
      getHandlers('tilePlacement')?.handlePointerDown?.(eventToUse);
    },
    move: ({ getHandlers, e }) => {
      getHandlers('terrainBrush')?.handlePointerMove?.(e);
      getHandlers('tilePlacement')?.handlePointerMove?.(e);
      return true;
    },
    up: ({ getHandlers, e }) => {
      getHandlers('terrainBrush')?.handlePointerUp?.(e);
      getHandlers('tilePlacement')?.handlePointerUp?.(e);
    },
    leave: noop,
    doubleClick: notConsumed
  },

  outline: {
    down: forwardDown('outline'),
    move: forwardMove('outline'),
    up: ({ getHandlers, e }) => { getHandlers('outline')?.handlePointerUp?.(e); },
    leave: noop,
    doubleClick: forwardDoubleClick('outline')
  },

  wall: {
    down: forwardDown('wall'),
    move: forwardMove('wall'),
    up: ({ getHandlers, e }) => { getHandlers('wall')?.handlePointerUp?.(e); },
    leave: noop,
    doubleClick: forwardDoubleClick('wall')
  },

  measure: {
    down: ({ getHandlers, gridX, gridY, isTouchEvent }) => {
      getHandlers('measure')?.handleMeasureClick?.(gridX, gridY, isTouchEvent);
    },
    move: ({ getHandlers, toGrid, clientX, clientY }) => {
      const handler = getHandlers('measure')?.handleMeasureMove;
      if (!handler) return false;
      const coords = toGrid(clientX, clientY);
      if (coords) handler(coords.x, coords.y);
      return true;
    },
    // Click-based: the second press finishes the measurement.
    up: noop,
    leave: noop,
    doubleClick: notConsumed
  }
};
