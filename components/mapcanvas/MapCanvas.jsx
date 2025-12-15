const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useCanvasRenderer, renderCanvas } = await requireModuleByName("useCanvasRenderer.js");
const { useCanvasInteraction } = await requireModuleByName("useCanvasInteraction.js");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { DEFAULTS } = await requireModuleByName("dmtConstants.js");
const { getObjectAtPosition, addObject, removeObject, removeObjectAtPosition, removeObjectsInRectangle, updateObject, isAreaFree, canResizeObject } = await requireModuleByName("objectOperations.js");
const { addTextLabel, getTextLabelAtPosition, removeTextLabel, updateTextLabel } = await requireModuleByName("textLabelOperations.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { LinkedNoteHoverOverlays } = await requireModuleByName("LinkedNoteHoverOverlays.jsx");
const { MapStateProvider, MapOperationsProvider } = await requireModuleByName("MapContext.jsx");
const { MapSelectionProvider, useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { ObjectLayer } = await requireModuleByName("ObjectLayer.jsx");
const { DrawingLayer } = await requireModuleByName("DrawingLayer.jsx");
const { TextLayer } = await requireModuleByName("TextLayer.jsx");
const { NotePinLayer } = await requireModuleByName("NotePinLayer.jsx");
const { EventHandlerProvider } = await requireModuleByName("EventHandlerContext.jsx");
const { HexCoordinateLayer } = await requireModuleByName("HexCoordinateLayer.jsx");
const { MeasurementLayer } = await requireModuleByName("MeasurementLayer.jsx");
const { AreaSelectLayer } = await requireModuleByName("AreaSelectLayer.jsx");
const { FogOfWarLayer } = await requireModuleByName("FogOfWarLayer.jsx");
const { getSetting } = await requireModuleByName("settingsAccessor.js");
const { usePanZoomCoordinator } = await requireModuleByName("usePanZoomCoordinator.js");
const { useEventCoordinator } = await requireModuleByName("useEventCoordinator.js");

/**
 * Coordinators - Internal component that calls coordinator hooks
 * This component must be rendered inside the Context provider tree
 * so the hooks have access to MapState, MapSelection, and EventHandler contexts.
 * Returns null (no visual rendering) - only manages behavioral coordination.
 */
const Coordinators = ({ canvasRef, mapData, geometry, isFocused, isColorPickerOpen, isAlignmentMode }) => {
  // Coordinator hooks need to be called inside the provider tree
  usePanZoomCoordinator({
    canvasRef,
    mapData,
    geometry,
    isFocused
  });

  useEventCoordinator({
    canvasRef,
    isColorPickerOpen,
    showObjectColorPicker: false,
    isAlignmentMode
  });

  return null; // No UI - coordinators only manage behavior
};

/**
 * MapCanvasContent - Inner component that uses context hooks
 * Contains all the map canvas logic and interacts with shared selection state
 */
const MapCanvasContent = ({ mapData, onCellsChange, onObjectsChange, onTextLabelsChange, onEdgesChange, onViewStateChange, onTextLabelSettingsChange, currentTool, selectedObjectType, selectedColor, isColorPickerOpen, customColors, onAddCustomColor, onDeleteCustomColor, isFocused, isAnimating, theme, isAlignmentMode, children }) => {
  const canvasRef = dc.useRef(null);
  const fogCanvasRef = dc.useRef(null);  // Separate canvas for fog blur effect (CSS blur for iOS compat)
  const containerRef = dc.useRef(null);
  const [canvasDimensions, setCanvasDimensions] = dc.useState({
    width: DEFAULTS.canvasSize.width,
    height: DEFAULTS.canvasSize.height
  });
  
  // Create onMapDataUpdate wrapper for map-level changes
  // This bridges the old prop-based API with the new context-based approach
  const onMapDataUpdate = dc.useCallback((updates) => {
    if (updates.viewState && onViewStateChange) {
      onViewStateChange(updates.viewState);
    }
    if (updates.lastTextLabelSettings && onTextLabelSettingsChange) {
      onTextLabelSettingsChange(updates.lastTextLabelSettings);
    }
  }, [onViewStateChange, onTextLabelSettingsChange]);

  // Use shared selection from context (same state ObjectLayer uses)
  const {
    selectedItem, setSelectedItem,
    selectedItems,
    isDraggingSelection, setIsDraggingSelection,
    dragStart, setDragStart,
    isResizeMode, setIsResizeMode,
    hoveredObject, setHoveredObject,
    mousePosition, setMousePosition,
    showNoteLinkModal, setShowNoteLinkModal,
    pendingNotePinId, setPendingNotePinId,
    editingNoteObjectId, setEditingNoteObjectId,
    showCoordinates, setShowCoordinates,
    layerVisibility
  } = useMapSelection();

  // Orientation animation state

  // Refs to hold layer state for cursor coordination
  const drawingLayerStateRef = dc.useRef({ isDrawing: false, rectangleStart: null, circleStart: null });
  const panZoomLayerStateRef = dc.useRef({ isPanning: false, isTouchPanning: false, spaceKeyPressed: false });

  // Callbacks for layers to expose their state
  const handleDrawingStateChange = dc.useCallback((drawingState) => {
    drawingLayerStateRef.current = drawingState;
  }, []);

  const handlePanZoomStateChange = dc.useCallback((panZoomState) => {
    panZoomLayerStateRef.current = panZoomState;
  }, []);

  // Create geometry instance based on map type
  // Return null during loading to prevent errors
  const geometry = dc.useMemo(() => {
    if (!mapData) return null;

    const mapType = mapData.mapType || DEFAULTS.mapType;

    if (mapType === 'hex') {
      const hexSize = mapData.hexSize || DEFAULTS.hexSize;
      const orientation = mapData.orientation || DEFAULTS.hexOrientation;
      const hexBounds = mapData.hexBounds || null; // null = infinite (backward compat)
      return new HexGeometry(hexSize, orientation, hexBounds);
    } else {
      // Default to grid
      const gridSize = mapData.gridSize || DEFAULTS.gridSize;
      return new GridGeometry(gridSize);
    }
  }, [mapData?.mapType, mapData?.gridSize, mapData?.hexSize, mapData?.orientation, mapData?.hexBounds]);

  // Use canvas interaction ONLY for coordinate utility functions
  const {
    screenToGrid,
    screenToWorld,
    getClientCoords
  } = useCanvasInteraction(canvasRef, mapData, geometry, null, isFocused);

  dc.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    };

    // Initial size
    updateCanvasSize();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Force canvas resize when animation completes
  dc.useEffect(() => {
    if (isAnimating) return; // Only run when animation ends

    const container = containerRef.current;
    if (!container) return;

    // Wait one more frame to ensure CSS transition is fully complete
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    });
  }, [isAnimating]);

  // Render canvas whenever relevant state changes
  useCanvasRenderer(canvasRef, fogCanvasRef, mapData, geometry, selectedItems, isResizeMode, theme, showCoordinates, layerVisibility);

  // Trigger redraw when canvas dimensions change (from expand/collapse)
  dc.useEffect(() => {
    if (!canvasRef.current || !mapData || !geometry) return;

    const canvas = canvasRef.current;
    const fogCanvas = fogCanvasRef.current;

    // During animation, preserve canvas content
    if (isAnimating) {
      // Save current canvas content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0);

      // Update canvas size
      canvas.width = canvasDimensions.width;
      canvas.height = canvasDimensions.height;
      
      // Also update fog canvas size
      if (fogCanvas) {
        fogCanvas.width = canvasDimensions.width;
        fogCanvas.height = canvasDimensions.height;
      }

      // Restore content (will stretch/compress during animation)
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    } else {
      // After animation, do a proper redraw with correct dimensions
      renderCanvas(canvas, fogCanvas, mapData, geometry, selectedItem, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [canvasDimensions.width, canvasDimensions.height, isAnimating, showCoordinates, layerVisibility]);

  // 'C' key handler for coordinate overlay (hex maps only)
  dc.useEffect(() => {
    // Get the coordinate key mode from settings ('hold' or 'toggle')
    const keyMode = getSetting('coordinateKeyMode') || 'hold';
    
    // Only attach listeners if focused and on a hex map
    if (!isFocused || mapData?.mapType !== 'hex') {
      // Always hide coordinates on non-hex maps
      // In 'hold' mode, also hide when losing focus
      // In 'toggle' mode, keep coordinates visible when mouse leaves (but hide on non-hex maps)
      if (showCoordinates && (mapData?.mapType !== 'hex' || keyMode === 'hold')) {
        setShowCoordinates(false);
      }
      return;
    }
    
    const handleKeyDown = (e) => {
      // Only track 'C' key when focused, and only if not typing in an input
      if (e.key.toLowerCase() === 'c' && !e.shiftKey && !e.ctrlKey && !e.metaKey &&
          e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        // Ignore key repeat events in toggle mode
        if (e.repeat && keyMode === 'toggle') return;
        
        e.preventDefault();
        
        if (keyMode === 'toggle') {
          // Toggle mode: flip the state
          setShowCoordinates(!showCoordinates);
        } else {
          // Hold mode: show on keydown
          setShowCoordinates(true);
        }
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.key.toLowerCase() === 'c') {
        // Only hide on keyup in 'hold' mode
        if (keyMode === 'hold') {
          setShowCoordinates(false);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFocused, mapData?.mapType, showCoordinates, setShowCoordinates]);

  // Determine cursor class based on current tool and interaction state
  const getCursorClass = () => {
    // Get state
    const effectiveDrawingState = drawingLayerStateRef.current;
    const effectivePanZoomState = panZoomLayerStateRef.current;

    // Space key override - show grab cursor
    if (effectivePanZoomState.spaceKeyPressed && !effectivePanZoomState.isPanning) return 'dmt-canvas-space-grab';
    
    if (effectivePanZoomState.isPanning || effectivePanZoomState.isTouchPanning) return 'dmt-canvas-panning';
    if (isDraggingSelection) return 'dmt-canvas-selecting';
    if (currentTool === 'select') return 'dmt-canvas-select';
    if (currentTool === 'measure') return 'dmt-canvas-measure';
    if (currentTool === 'addObject') {
      return selectedObjectType ? 'dmt-canvas-add-object' : 'dmt-canvas';
    }
    if (currentTool === 'addText') {
      return 'dmt-canvas-add-text';
    }
    if (currentTool === 'rectangle') {
      return effectiveDrawingState.rectangleStart ? 'dmt-canvas-rectangle-active' : 'dmt-canvas-rectangle';
    }
    if (currentTool === 'circle') {
      return effectiveDrawingState.circleStart ? 'dmt-canvas-circle-active' : 'dmt-canvas-circle';
    }
    if (currentTool === 'clearArea') {
      return effectiveDrawingState.rectangleStart ? 'dmt-canvas-cleararea-active' : 'dmt-canvas-cleararea';
    }
    if (effectiveDrawingState.isDrawing) {
      return currentTool === 'draw' ? 'dmt-canvas-drawing' : 'dmt-canvas-erasing';
    }
    return currentTool === 'erase' ? 'dmt-canvas-erase' : 'dmt-canvas';
  };

  // Build context values for providers
  const mapStateValue = dc.useMemo(() => ({
    canvasRef,
    containerRef,
    mapData,
    geometry,
    currentTool,
    selectedColor,
    selectedObjectType,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry,
    HexGeometry,
    // State change callbacks for layers
    onDrawingStateChange: handleDrawingStateChange,
    onPanZoomStateChange: handlePanZoomStateChange
  }), [canvasRef, containerRef, mapData, geometry, currentTool, selectedColor,
    selectedObjectType, screenToGrid, screenToWorld, getClientCoords,
    handleDrawingStateChange, handlePanZoomStateChange]);

  const mapOperationsValue = dc.useMemo(() => ({
    // Object operations
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    canResizeObject,
    removeObjectAtPosition,
    removeObjectsInRectangle,

    // Text operations
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel,

    // Callbacks
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    onMapDataUpdate
  }), [onCellsChange, onObjectsChange, onTextLabelsChange, onEdgesChange, onViewStateChange, onTextLabelSettingsChange]);



  return (
    <EventHandlerProvider>
      <MapStateProvider value={mapStateValue}>
        <MapOperationsProvider value={mapOperationsValue}>
          {/* Coordinators - must be inside provider tree to access contexts */}
          <Coordinators
            canvasRef={canvasRef}
            mapData={mapData}
            geometry={geometry}
            isFocused={isFocused}
            isColorPickerOpen={isColorPickerOpen}
            isAlignmentMode={isAlignmentMode}
          />
          
          <div className="dmt-canvas-container" ref={containerRef}>
            {/* Wrapper for canvas alignment - fog canvas positions relative to this */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              {/* Main canvas */}
              <canvas
                ref={canvasRef}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                className={getCursorClass()}
                style={{ touchAction: 'none', display: 'block' }}
              />
              
              {/* Fog blur overlay canvas */}
              <canvas
                ref={fogCanvasRef}
                width={canvasDimensions.width}
                height={canvasDimensions.height}
                style={{ 
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  pointerEvents: 'none'
                }}
              />
            </div>

            <LinkedNoteHoverOverlays
              canvasRef={canvasRef}
              mapData={mapData}
              selectedItem={selectedItem}
              geometry={geometry}
              layerVisibility={layerVisibility}
            />

            {/* Render child layers */}
            {children}
          </div>
        </MapOperationsProvider>
      </MapStateProvider>
    </EventHandlerProvider>
  );
};

const MapCanvas = (props) => {
  const { children, layerVisibility, ...restProps } = props;

  return (
    <MapSelectionProvider layerVisibility={layerVisibility}>
      <MapCanvasContent {...restProps}>
        {children}
      </MapCanvasContent>
    </MapSelectionProvider>
  );
};

// Attach layer components using dot notation
MapCanvas.ObjectLayer = ObjectLayer;
MapCanvas.DrawingLayer = DrawingLayer;
MapCanvas.TextLayer = TextLayer;
MapCanvas.NotePinLayer = NotePinLayer;
MapCanvas.HexCoordinateLayer = HexCoordinateLayer;
MapCanvas.MeasurementLayer = MeasurementLayer;
MapCanvas.AreaSelectLayer = AreaSelectLayer;
MapCanvas.FogOfWarLayer = FogOfWarLayer;

return { MapCanvas };