/**
 * usePanZoomCoordinator.ts
 *
 * Coordinator hook that handles pan and zoom interactions:
 * - Mouse wheel zoom
 * - Space + drag pan
 * - Select tool drag pan (on empty space)
 * - Touch pinch-to-zoom
 * - Touch two-finger pan
 * - Middle-click pan
 *
 * Registers pan/zoom handlers with EventHandlerContext for event coordination.
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */

// Type-only imports
import type { UsePanZoomCoordinatorOptions } from '#types/hooks/panZoomCoordinator.types';

import type { PanZoomHandlers } from '#types/hooks/eventCoordinator.types';

import { useCanvasInteraction } from './useCanvasInteraction';
import { useEffect } from 'preact/hooks';
import { useLayerHandlers } from './useLayerHandlers';
import { useMapState } from '../../context/MapContext';


/**
 * Coordinator hook for pan/zoom interactions.
 *
 * viewState commits are owned by the shared ViewController (created in MapCanvas
 * with onViewStateChange as its commit sink); this coordinator just wires the
 * interaction handlers to it. Live pan/zoom no longer routes through
 * onMapDataUpdate per tick — that reconciliation was the measured lag.
 */
const usePanZoomCoordinator = ({
  canvasRef,
  mapData,
  geometry,
  isFocused,
  viewController
}: UsePanZoomCoordinatorOptions): void => {
  // Sub-hex awareness for seamless zoom transitions (provided via MapContext).
  // The drill path keys the parent-map backdrop captured on a dive; the
  // request callbacks route dives/surfaces DIRECTLY to this mount's
  // navigation hook (no document events — see core/windroseEvents.ts).
  const { isInSubHex, subHexPath, requestEnterSubHex, requestExitSubHex, cursorStore } = useMapState();

  // Use canvas interaction hook for pan/zoom logic. Only what the event
  // coordinator reads is registered (PanZoomHandlers); raw pan-state
  // setters stay private to useCanvasInteraction.
  const {
    isPanning,
    isTouchPanning,
    isTouchPanningRef,
    panStart,
    spaceKeyPressed,
    lastTouchTimeRef,
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    handleWheel,
    handleGestureStart,
    handleGestureChange,
    handleGestureEnd,
    startPan,
    updatePan,
    stopPan,
    markPanAnchorStale,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,
    startPinch
  } = useCanvasInteraction(canvasRef, mapData, geometry, isFocused, viewController, isInSubHex === true, subHexPath ?? null, requestEnterSubHex, requestExitSubHex);

  // Latest handler object, swapped in every render; the registry holds a
  // stable proxy over it (same latest-ref pattern as useLayerHandlers).
  const handlers: PanZoomHandlers = {
    startPan, updatePan, stopPan, markPanAnchorStale,
    startTouchPan, updateTouchPan, stopTouchPan, startPinch,
    handleWheel,
    handleGestureStart, handleGestureChange, handleGestureEnd,
    getClientCoords, getTouchCenter, getTouchDistance, screenToGrid,
    isPanning, panStart, spaceKeyPressed,
    isTouchPanningRef, lastTouchTimeRef
  };
  useLayerHandlers('panZoom', handlers);

  // Cursor feed for THIS map's canvas (REACT-04): grabbing while a pan runs
  // (middle button, Space+drag, select-tool drag, touch pan), grab while
  // Space is held with the pointer over the canvas. Both flags flip only at
  // gesture/key edges, so these effects never run per pointermove.
  useEffect(() => {
    cursorStore?.setPanning(isPanning || isTouchPanning);
  }, [cursorStore, isPanning, isTouchPanning]);
  useEffect(() => {
    cursorStore?.setSpaceHeld(spaceKeyPressed);
  }, [cursorStore, spaceKeyPressed]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (cursorStore == null || canvas == null) return undefined;
    // Popout-safe: the window that owns this canvas, not the main window.
    const win = canvas.ownerDocument.defaultView ?? window;
    const enter = (): void => cursorStore.setPointerOver(true);
    const leave = (): void => cursorStore.setPointerOver(false);
    const blur = (): void => cursorStore.releaseTransient();
    canvas.addEventListener('pointerenter', enter);
    canvas.addEventListener('pointerleave', leave);
    win.addEventListener('blur', blur);
    return () => {
      canvas.removeEventListener('pointerenter', enter);
      canvas.removeEventListener('pointerleave', leave);
      win.removeEventListener('blur', blur);
      cursorStore.releaseTransient();
    };
  }, [cursorStore, canvasRef]);

  // Coordinator hooks don't return anything - they just set up behavior
};

export { usePanZoomCoordinator };