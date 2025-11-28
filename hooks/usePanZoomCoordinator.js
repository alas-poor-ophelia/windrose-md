const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useCanvasInteraction } = await requireModuleByName("useCanvasInteraction.js");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

/**
 * usePanZoomCoordinator.js
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
const usePanZoomCoordinator = ({
  canvasRef,
  mapData,
  geometry,
  onViewStateChange,
  isFocused
}) => {
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
  } = useCanvasInteraction(canvasRef, mapData, geometry, onViewStateChange, isFocused);
  
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