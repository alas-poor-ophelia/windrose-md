// @vitest-environment happy-dom
/**
 * toolDispatch (audit TS-03 / STRUCT-A-21): the per-tool routing table that
 * replaced useEventCoordinator's four parallel if/else chains.
 */

import { describe, it, expect, vi } from 'vitest';
import { TOOL_ROUTES } from '../../../../src/hooks/canvas/toolDispatch';
import type { ToolDownContext, ToolMoveContext } from '../../../../src/hooks/canvas/toolDispatch';
import type { GetHandlers, HandlersRegistry } from '../../../../types/hooks/eventCoordinator.types';
import type { ToolId } from '../../../../types/tools/tool.types';
import { assertNever } from '../../../../src/utils/assertNever';

function makeGetHandlers(registry: HandlersRegistry): GetHandlers {
  return (name) => registry[name] ?? null;
}

const mouse = new MouseEvent('mousedown', { clientX: 15, clientY: 25 });

function downCtx(registry: HandlersRegistry, over: Partial<ToolDownContext> = {}): ToolDownContext {
  return {
    getHandlers: makeGetHandlers(registry), e: mouse, eventToUse: mouse,
    gridX: 1, gridY: 2, clientX: 15, clientY: 25, isTouchEvent: false,
    layerVisibility: { objects: true, textLabels: true }, ...over
  };
}

function moveCtx(registry: HandlersRegistry, tool: ToolId, over: Partial<ToolMoveContext> = {}): ToolMoveContext {
  return {
    getHandlers: makeGetHandlers(registry), e: mouse, tool, clientX: 15, clientY: 25, isTouch: false,
    toGrid: (x, y) => ({ x: Math.floor(x / 10), y: Math.floor(y / 10) }),
    screenToWorld: (x, y) => ({ worldX: x, worldY: y }), cellSize: 10, ...over
  };
}

describe('TOOL_ROUTES', () => {
  it('only the selection tools leave pointer-down to the coordinator', () => {
    const coordinatorOwned = (Object.keys(TOOL_ROUTES) as ToolId[]).filter((t) => TOOL_ROUTES[t].down == null);
    expect(coordinatorOwned.sort()).toEqual(['areaSelect', 'select']);
  });

  it('routes every drawing-family tool to the drawing layer on down and up', () => {
    for (const tool of ['draw', 'erase', 'rectangle', 'circle', 'clearArea', 'edgeDraw', 'edgeErase', 'edgeLine', 'segmentDraw'] as const) {
      const handleDrawingPointerDown = vi.fn(() => true);
      const stopDrawing = vi.fn();
      const registry: HandlersRegistry = { drawing: { handleDrawingPointerDown, stopDrawing } };
      TOOL_ROUTES[tool].down?.(downCtx(registry));
      TOOL_ROUTES[tool].up({ getHandlers: makeGetHandlers(registry), e: mouse });
      expect(handleDrawingPointerDown).toHaveBeenCalledWith(mouse, 1, 2, false);
      expect(stopDrawing).toHaveBeenCalledWith(mouse);
    }
  });

  it('keeps the pointer-up channels each layer expects', () => {
    const wallUp = vi.fn();
    const outlineUp = vi.fn();
    const brushUp = vi.fn();
    const tileUp = vi.fn();
    const freehandStop = vi.fn();
    const registry: HandlersRegistry = {
      wall: { handlePointerUp: wallUp },
      outline: { handlePointerUp: outlineUp },
      terrainBrush: { handlePointerUp: brushUp },
      tilePlacement: { handlePointerUp: tileUp },
      freehand: { stopDrawing: freehandStop },
      partyPin: { stopPartyPinDrag: vi.fn() }
    };
    const getHandlers = makeGetHandlers(registry);
    for (const tool of Object.keys(TOOL_ROUTES) as ToolId[]) TOOL_ROUTES[tool].up({ getHandlers, e: mouse });
    expect(wallUp).toHaveBeenCalledOnce();
    expect(outlineUp).toHaveBeenCalledOnce();
    expect(brushUp).toHaveBeenCalledOnce();
    expect(tileUp).toHaveBeenCalledOnce();
    expect(freehandStop).toHaveBeenCalledOnce();
    // Party pin drags end via the window net, never the canvas up phase.
    expect(registry.partyPin?.stopPartyPinDrag).not.toHaveBeenCalled();
  });

  it('placement tools respect layer visibility', () => {
    const handleObjectPlacement = vi.fn();
    const handleTextPlacement = vi.fn();
    const registry: HandlersRegistry = { object: { handleObjectPlacement }, text: { handleTextPlacement } };
    const hidden = { objects: false, textLabels: false };
    TOOL_ROUTES.addObject.down?.(downCtx(registry, { layerVisibility: hidden }));
    TOOL_ROUTES.addText.down?.(downCtx(registry, { layerVisibility: hidden }));
    expect(handleObjectPlacement).not.toHaveBeenCalled();
    expect(handleTextPlacement).not.toHaveBeenCalled();
    TOOL_ROUTES.addObject.down?.(downCtx(registry));
    expect(handleObjectPlacement).toHaveBeenCalledWith(1, 2, 15, 25);
  });

  it('addObject yields the press to a note-pin placement that claims it', () => {
    const handleObjectPlacement = vi.fn();
    const registry: HandlersRegistry = { notePin: { handleNotePinPlacement: () => true }, object: { handleObjectPlacement } };
    TOOL_ROUTES.addObject.down?.(downCtx(registry));
    expect(handleObjectPlacement).not.toHaveBeenCalled();
  });

  it('move: measure without a handler falls through to the hover update; with one it consumes', () => {
    expect(TOOL_ROUTES.measure.move(moveCtx({}, 'measure'))).toBe(false);
    const handleMeasureMove = vi.fn();
    expect(TOOL_ROUTES.measure.move(moveCtx({ measure: { handleMeasureMove } }, 'measure'))).toBe(true);
    expect(handleMeasureMove).toHaveBeenCalledWith(1, 2);
  });

  it('move: select follows a grabbed party pin only while it is dragging', () => {
    const handlePartyPinMove = vi.fn();
    let dragging = false;
    const registry: HandlersRegistry = { partyPin: { handlePartyPinMove, isPartyPinDragging: () => dragging } };
    expect(TOOL_ROUTES.select.move(moveCtx(registry, 'select'))).toBe(false);
    dragging = true;
    expect(TOOL_ROUTES.select.move(moveCtx(registry, 'select'))).toBe(true);
    expect(handlePartyPinMove).toHaveBeenCalledWith(1, 2);
  });

  it('double-click: only regionBoundary, outline and wall consume it', () => {
    const handleDoubleClick = vi.fn();
    const registry: HandlersRegistry = {
      region: { handleDoubleClick }, outline: { handleDoubleClick }, wall: { handleDoubleClick }
    };
    const dbl = new MouseEvent('dblclick');
    const consumers = (Object.keys(TOOL_ROUTES) as ToolId[])
      .filter((t) => TOOL_ROUTES[t].doubleClick({ getHandlers: makeGetHandlers(registry), e: dbl }));
    expect(consumers.sort()).toEqual(['outline', 'regionBoundary', 'wall']);
    // Without a registered handler the press falls through to text editing.
    expect(TOOL_ROUTES.wall.doubleClick({ getHandlers: makeGetHandlers({}), e: dbl })).toBe(false);
  });

  it('leave: segmentDraw also clears the segment hover', () => {
    const cancelDrawing = vi.fn();
    const clearSegmentHover = vi.fn();
    const getHandlers = makeGetHandlers({ drawing: { cancelDrawing, clearSegmentHover } });
    TOOL_ROUTES.draw.leave({ getHandlers });
    expect(clearSegmentHover).not.toHaveBeenCalled();
    TOOL_ROUTES.segmentDraw.leave({ getHandlers });
    expect(cancelDrawing).toHaveBeenCalledTimes(2);
    expect(clearSegmentHover).toHaveBeenCalledOnce();
  });
});

describe('assertNever', () => {
  it('throws on an impossible value', () => {
    expect(() => assertNever('bogus' as never, 'tool')).toThrow('Unhandled tool: bogus');
  });
});

// ---------------------------------------------------------------------------
// Type-level checks (verified by `npm run typecheck`; tests/ is in scope)
// ---------------------------------------------------------------------------

// @ts-expect-error -- a ToolId without a route is a compile error
const _missingRoute: Record<ToolId, number> = { select: 1 };
void _missingRoute;
