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
import type { StoredViewState } from '#types/core/map.types';
import type { UsePanZoomCoordinatorOptions } from '#types/hooks/panZoomCoordinator.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useCanvasInteraction } from './useCanvasInteraction';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { useMapOperations } from '../../context/MapContext';


/**
 * Coordinator hook for pan/zoom interactions
 */
const usePanZoomCoordinator = ({
  canvasRef,
  mapData,
  geometry,
  isFocused
}: UsePanZoomCoordinatorOptions): void => {
  // Get onMapDataUpdate from context to handle viewState changes
  const { onMapDataUpdate } = useMapOperations();

  // Create local callback for viewState changes
  const handleStoredViewStateChange = useCallback((newStoredViewState: StoredViewState) => {
    if (onMapDataUpdate) {
      onMapDataUpdate({ viewState: newStoredViewState });
    }
  }, [onMapDataUpdate]);

  // Use canvas interaction hook for pan/zoom logic
  const {
    isPanning,
    isTouchPanning,
    isTouchPanningRef,
    touchPanStartRef,
    initialPinchDistanceRef,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    handleWheel,
    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,
    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance
  } = useCanvasInteraction(canvasRef, mapData, geometry, handleStoredViewStateChange, isFocused);

  // Register pan/zoom handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Ref holds the latest handler object; updated every render so consumers
  // always get current closures without effect re-registration churn.
  const handlersRef = useRef<Record<string, unknown> | null>(null);
  handlersRef.current = {
    startPan, updatePan, stopPan,
    startTouchPan, updateTouchPan, stopTouchPan,
    handleWheel,
    getClientCoords, getTouchCenter, getTouchDistance, screenToGrid,
    isPanning, isTouchPanning, panStart, touchPanStart, spaceKeyPressed,
    isTouchPanningRef, touchPanStartRef, initialPinchDistanceRef,
    lastTouchTimeRef, initialPinchDistance,
    setIsPanning, setIsTouchPanning, setPanStart, setTouchPanStart, setInitialPinchDistance
  };

  // Register once on mount with stable proxy that delegates to handlersRef
  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return handlersRef.current?.[prop];
      }
    });
    registerHandlers('panZoom', proxy);
    return () => unregisterHandlers('panZoom');
  }, []);

  // Coordinator hooks don't return anything - they just set up behavior
};

export { usePanZoomCoordinator };