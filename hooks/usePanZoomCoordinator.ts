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
import type { MapData, ViewState } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';
import type { UsePanZoomCoordinatorOptions } from '#types/hooks/panZoomCoordinator.types';
import type { UseCanvasInteractionResult } from '#types/hooks/canvasInteraction.types';
import type { PanZoomHandlers } from '#types/hooks/eventCoordinator.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useCanvasInteraction } = await requireModuleByName("useCanvasInteraction.ts") as {
  useCanvasInteraction: (
    canvasRef: React.RefObject<HTMLCanvasElement>,
    mapData: MapData | null,
    geometry: IGeometry | null,
    onViewStateChange: ((viewState: ViewState) => void) | null,
    isFocused: boolean
  ) => UseCanvasInteractionResult;
};

const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx") as {
  useEventHandlerRegistration: () => {
    registerHandlers: (layer: string, handlers: Record<string, unknown>) => void;
    unregisterHandlers: (layer: string) => void;
  };
};

const { useMapOperations } = await requireModuleByName("MapContext.jsx") as {
  useMapOperations: () => {
    onMapDataUpdate: ((updates: { viewState?: ViewState }) => void) | null;
  };
};

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
  const handleViewStateChange = dc.useCallback((newViewState: ViewState) => {
    if (onMapDataUpdate) {
      onMapDataUpdate({ viewState: newViewState });
    }
  }, [onMapDataUpdate]);

  // Use canvas interaction hook for pan/zoom logic
  const {
    isPanning,
    isTouchPanning,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,
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
    setInitialPinchDistance,
    setSpaceKeyPressed
  } = useCanvasInteraction(canvasRef, mapData, geometry, handleViewStateChange, isFocused);

  // Register pan/zoom handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Register pan/zoom handlers and state when they change
  dc.useEffect(() => {
    registerHandlers('panZoom', {
      // Pan handlers
      startPan,
      updatePan,
      stopPan,
      // Touch pan handlers
      startTouchPan,
      updateTouchPan,
      stopTouchPan,
      // Zoom handler
      handleWheel,
      // Helper functions
      getClientCoords,
      getTouchCenter,
      getTouchDistance,
      screenToGrid,
      // State for coordination
      isPanning,
      isTouchPanning,
      panStart,
      touchPanStart,
      spaceKeyPressed,
      lastTouchTimeRef,
      initialPinchDistance,
      // State setters (for coordination layer to manage state)
      setIsPanning,
      setIsTouchPanning,
      setPanStart,
      setTouchPanStart,
      setInitialPinchDistance
    });

    return () => unregisterHandlers('panZoom');
  }, [
    registerHandlers, unregisterHandlers,
    startPan, updatePan, stopPan,
    startTouchPan, updateTouchPan, stopTouchPan,
    handleWheel,
    getClientCoords, getTouchCenter, getTouchDistance, screenToGrid,
    isPanning, isTouchPanning, panStart, touchPanStart, spaceKeyPressed, initialPinchDistance,
    setIsPanning, setIsTouchPanning, setPanStart, setTouchPanStart, setInitialPinchDistance
  ]);

  // Coordinator hooks don't return anything - they just set up behavior
};

// Datacore export
return { usePanZoomCoordinator };
