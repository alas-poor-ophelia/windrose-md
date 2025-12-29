const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { useRegisteredHandlers } = await requireModuleByName("EventHandlerContext.jsx");
const { useGroupDrag } = await requireModuleByName("useGroupDrag.js");

/**
 * useEventCoordinator.js
 * 
 * Coordinator hook that manages pointer event coordination across all interaction layers.
 * Attaches event listeners to canvas and routes events to registered handlers
 * based on current tool, modifier keys, touch state, and selection state.
 * 
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */
const useEventCoordinator = ({
  isColorPickerOpen,
  showObjectColorPicker = false,
  isAlignmentMode = false
}) => {
  // Get shared state from contexts
  const { canvasRef, currentTool, screenToGrid, screenToWorld, getClientCoords, geometry } = useMapState();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, layerVisibility, hasMultiSelection, isSelected, isGroupDragging, clearSelection } = useMapSelection();
  const { getHandlers } = useRegisteredHandlers();
  
  // Group drag for multi-select
  const { getClickedSelectedItem, startGroupDrag, handleGroupDrag, stopGroupDrag } = useGroupDrag();
  
  // Local state for multi-touch and pending actions
  const [recentMultiTouch, setRecentMultiTouch] = dc.useState(false);
  const [pendingToolAction, setPendingToolAction] = dc.useState(null);
  const pendingToolTimeoutRef = dc.useRef(null);
  
  // Track pan start position for click vs drag detection
  const panStartPositionRef = dc.useRef(null);
  const panMoveThreshold = 5; // pixels
  
  // Track pending area select start (for when empty space is clicked but drag may occur)
  const areaSelectPendingRef = dc.useRef(null);
  
  /**
   * Handle pointer down events
   * Routes to appropriate layer handlers based on current tool
   */
  const handlePointerDown = dc.useCallback((e) => {
    // Get registered handlers for each layer
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const notePinHandlers = getHandlers('notePin');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    const alignmentHandlers = getHandlers('imageAlignment');
    const fogHandlers = getHandlers('fogOfWar');
    
    if (!panZoomHandlers) return;
    
    // In alignment mode, skip all normal tool handling except two-finger gestures
    if (isAlignmentMode && (!e.touches || e.touches.length === 1)) {
      // Let alignment mode canvas listeners handle single-finger/mouse events
      // Don't process any normal tool actions
      return;
    }
    
    const {
      getClientCoords,
      screenToGrid,
      lastTouchTimeRef,
      getTouchCenter,
      getTouchDistance,
      startPan,
      startTouchPan,
      setInitialPinchDistance,
      spaceKeyPressed
    } = panZoomHandlers;
    
    // Ignore synthetic mousedown events that occur shortly after touchstart
    if (e.type === 'mousedown') {
      const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
      if (timeSinceTouch < 500) {
        return;
      }
    }
    
    // Track touch events
    if (e.type === 'touchstart') {
      lastTouchTimeRef.current = Date.now();
    }
    
    // If color picker is open, check if this click is outside of it
    if (isColorPickerOpen || showObjectColorPicker) {
      const pickerElement = e.target.closest('.dmt-color-picker');
      const toolBtnElement = e.target.closest('.dmt-color-tool-btn');
      const objectBtnElement = e.target.closest('.dmt-object-color-button');
      
      if (!pickerElement && !toolBtnElement && !objectBtnElement) {
        return; // Click outside - let color picker handlers close it
      }
    }
    
    // Handle two-finger touch (pan/pinch)
    if (e.touches && e.touches.length === 2) {
      // Check if any touches are on color picker
      if (isColorPickerOpen || showObjectColorPicker) {
        const touch1Target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
        const touch2Target = document.elementFromPoint(e.touches[1].clientX, e.touches[1].clientY);
        
        const pickerOrButton1 = touch1Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');
        const pickerOrButton2 = touch2Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');
        
        if (pickerOrButton1 || pickerOrButton2) {
          return;
        }
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
      
      setRecentMultiTouch(true);
      const center = getTouchCenter(e.touches);
      const distance = getTouchDistance(e.touches);
      if (center && distance) {
        startTouchPan(center);
        setInitialPinchDistance(distance);
      }
      return;
    }
    
    if (recentMultiTouch || panZoomHandlers.isTouchPanning) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;
    
    // Extract coordinates - handle both grid {gridX, gridY} and hex {q, r} formats
    // Objects and operations expect properties named x/y regardless of geometry type
    const gridX = coords.gridX !== undefined ? coords.gridX : coords.q;
    const gridY = coords.gridY !== undefined ? coords.gridY : coords.r;
    
    
    // Capture event properties before any delays (for touch event pooling)
    const eventType = e.type;
    const isTouchEvent = !!e.touches;
    const targetElement = e.target;
    
    const syntheticEvent = {
      type: eventType,
      clientX: clientX,
      clientY: clientY,
      button: e.button ?? 0,  // Include button for click detection (default 0 for touch)
      preventDefault: () => {},
      stopPropagation: () => {},
      target: targetElement
    };
    
    // Function to execute the tool action
    const executeToolAction = () => {
      // Space key override - start panning
      if (spaceKeyPressed && !isTouchEvent) {
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        return;
      }
      
      // Fog of War tools take precedence when active
      if (fogHandlers?.handlePointerDown) {
        fogHandlers.handlePointerDown(syntheticEvent);
        return;
      }
      
      // Route to appropriate handler based on current tool
      if (currentTool === 'select') {
        // Multi-select: check if clicking on an already-selected item to start group drag
        if (hasMultiSelection) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY);
            if (clickedItem) {
              // Start group drag
              startGroupDrag(clientX, clientY, gridX, gridY);
              return;
            }
          }
        }
        
        // Try object selection first (only if objects layer is visible)
        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY);
          if (objectHandled) return;
        }
        
        // Try text selection (only if text labels layer is visible)
        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }
        
        // Nothing selected - start panning with select tool on empty space
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        
      } else if (currentTool === 'areaSelect') {
        // Area select tool - handles both selection AND interaction with selected items
        
        // First: check if clicking on an already-selected item to start group drag
        if (hasMultiSelection) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY);
            if (clickedItem) {
              // Start group drag - don't start new area selection
              startGroupDrag(clientX, clientY, gridX, gridY);
              return;
            }
          }
          // Clicked on empty space while having selection - just clear, don't start new area select
          clearSelection();
          return;
        }
        
        // No multi-selection - check if we're in the middle of an area select (first corner already placed)
        const areaSelectHandlers = getHandlers('areaSelect');
        if (areaSelectHandlers?.areaSelectStart) {
          // Second click - complete the area selection
          if (areaSelectHandlers.handleAreaSelectClick) {
            areaSelectHandlers.handleAreaSelectClick(syntheticEvent);
          }
          return;
        }
        
        // No multi-selection, no area select in progress - check if clicking on an object or text to select it
        // Try object selection first (only if objects layer is visible)
        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY);
          if (objectHandled) return;
        }
        
        // Try text selection (only if text labels layer is visible)
        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }
        
        // Clicked on empty space with no selection - start panning
        // Store the click position so we can start area select on pointer up if no drag occurred
        panStartPositionRef.current = { x: clientX, y: clientY };
        areaSelectPendingRef.current = { clientX, clientY, syntheticEvent };
        startPan(clientX, clientY);
        
      } else if (currentTool === 'draw' || currentTool === 'erase' || 
                 currentTool === 'rectangle' || currentTool === 'circle' || 
                 currentTool === 'clearArea' || currentTool === 'line' ||
                 currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
                 currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
        // Drawing tools (including edge tools) - clear any multi-selection
        if (hasMultiSelection) clearSelection();
        
        if (drawingHandlers?.handleDrawingPointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          drawingHandlers.handleDrawingPointerDown(eventToUse, gridX, gridY, isTouchEvent);
        }
        
      } else if (currentTool === 'addObject') {
        // Clear any multi-selection when adding objects
        if (hasMultiSelection) clearSelection();
        
        // Skip if objects layer is hidden
        if (!layerVisibility.objects) return;
        
        // Try Note Pin placement first
        if (notePinHandlers?.handleNotePinPlacement) {
          const notePinHandled = notePinHandlers.handleNotePinPlacement(gridX, gridY);
          if (notePinHandled) return;
        }
        
        // Fall back to regular object placement (pass raw coords for edge snap)
        if (objectHandlers?.handleObjectPlacement) {
          objectHandlers.handleObjectPlacement(gridX, gridY, clientX, clientY);
        }
        
      } else if (currentTool === 'addText') {
        // Clear any multi-selection when adding text
        if (hasMultiSelection) clearSelection();
        
        // Skip if text labels layer is hidden
        if (!layerVisibility.textLabels) return;
        
        if (textHandlers?.handleTextPlacement) {
          textHandlers.handleTextPlacement(clientX, clientY);
        }
        
      } else if (currentTool === 'measure') {
        // Clear any multi-selection when measuring
        if (hasMultiSelection) clearSelection();
        
        // Distance measurement tool
        if (measureHandlers?.handleMeasureClick) {
          measureHandlers.handleMeasureClick(gridX, gridY, isTouchEvent);
        }
      }
    };
    
    // For touch events, add delay to distinguish from pan gestures
    if (isTouchEvent) {
      setPendingToolAction({ execute: executeToolAction });
      pendingToolTimeoutRef.current = setTimeout(() => {
        executeToolAction();
        setPendingToolAction(null);
        pendingToolTimeoutRef.current = null;
      }, 50); // 50ms delay for touch
    } else {
      // Mouse events execute immediately
      executeToolAction();
    }
  }, [currentTool, isColorPickerOpen, showObjectColorPicker, recentMultiTouch, selectedItem, hasMultiSelection, clearSelection, screenToWorld, getClickedSelectedItem, startGroupDrag, getHandlers, layerVisibility, isAlignmentMode]);
  
  /**
   * Handle pointer move events
   * Routes to dragging/resizing handlers or hover updates
   */
  const handlePointerMove = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    const alignmentHandlers = getHandlers('imageAlignment');
    const fogHandlers = getHandlers('fogOfWar');
    
    if (!panZoomHandlers) return;
    
    // In alignment mode, skip all normal tool handling except two-finger gestures
    if (isAlignmentMode && (!e.touches || e.touches.length !== 2)) {
      return;
    }
    
    const { 
      getClientCoords, 
      isTouchPanning, 
      updateTouchPan,
      isPanning,
      updatePan,
      panStart,
      touchPanStart
    } = panZoomHandlers;
    
    const { clientX, clientY } = getClientCoords(e);
    
    // Handle touch pan with 2 fingers
    if (e.touches && e.touches.length === 2 && isTouchPanning && touchPanStart) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
      e.preventDefault();
      e.stopPropagation();
      updateTouchPan(e.touches);
      return;
    }
    
    // Handle middle-button pan
    if (isPanning && panStart) {
      e.preventDefault();
      updatePan(clientX, clientY);
      return;
    }
    
    // For multi-touch (non-panning), clear pending actions
    if (e.touches && e.touches.length > 1) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
    }
    
    // Handle resize mode (skip if objects hidden)
    if (layerVisibility.objects && objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.handleObjectResizing) {
        objectHandlers.handleObjectResizing(e);
      }
      return;
    }
    
    // Handle group drag (multi-select) - check dragStart.isGroupDrag flag directly
    // since context's isGroupDragging may not have updated yet after startGroupDrag
    if (isDraggingSelection && dragStart?.isGroupDrag) {
      handleGroupDrag(e);
      return;
    }
    
    // Handle dragging selection (respect layer visibility) - single item
    if (isDraggingSelection && selectedItem) {
      if (selectedItem.type === 'object' && layerVisibility.objects && objectHandlers?.handleObjectDragging) {
        objectHandlers.handleObjectDragging(e);
      } else if (selectedItem.type === 'text' && layerVisibility.textLabels && textHandlers?.handleTextDragging) {
        textHandlers.handleTextDragging(e);
      }
      return;
    }
    
    // Handle Fog of War tools
    if (fogHandlers?.handlePointerMove) {
      fogHandlers.handlePointerMove(e);
      // Don't return - allow hover updates to still work
    }
    
    // Handle drawing tools (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
      
      if (drawingHandlers?.handleDrawingPointerMove) {
        drawingHandlers.handleDrawingPointerMove(e);
      }
      
      // Track hover position for shape preview (KBM mode)
      // Only track if preview is enabled and not a touch event
      const isTouch = e.touches !== undefined || e.pointerType === 'touch';
      if (!isTouch && drawingHandlers?.previewEnabled && drawingHandlers?.updateShapeHover) {
        const { screenToGrid, screenToWorld } = panZoomHandlers;
        
        // For edge line tool, track intersection position
        if (currentTool === 'edgeLine' && drawingHandlers.edgeLineStart && screenToWorld) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords && geometry) {
            const cellSize = geometry.cellSize;
            const nearestX = Math.round(worldCoords.worldX / cellSize);
            const nearestY = Math.round(worldCoords.worldY / cellSize);
            if (drawingHandlers.updateEdgeLineHover) {
              drawingHandlers.updateEdgeLineHover(nearestX, nearestY);
            }
          }
        }
        // For rectangle/circle/clearArea, track cell position
        else if ((currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') && screenToGrid) {
          const hasStart = (currentTool === 'circle' && drawingHandlers.circleStart) ||
                           ((currentTool === 'rectangle' || currentTool === 'clearArea') && drawingHandlers.rectangleStart);
          if (hasStart) {
            const coords = screenToGrid(clientX, clientY);
            const gridX = coords.gridX !== undefined ? coords.gridX : coords.q;
            const gridY = coords.gridY !== undefined ? coords.gridY : coords.r;
            drawingHandlers.updateShapeHover(gridX, gridY);
          }
        }
      }
      
      // Track segment hover for segment paint tool (desktop only)
      if (!isTouch && currentTool === 'segmentDraw' && drawingHandlers?.updateSegmentHover) {
        // Note: screenToWorld comes from useMapState context (line 24), not panZoomHandlers
        if (screenToWorld && geometry) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const cellSize = geometry.cellSize;
            // Get cell coordinates
            const cellX = Math.floor(worldCoords.worldX / cellSize);
            const cellY = Math.floor(worldCoords.worldY / cellSize);
            // Get local position within cell (0-1)
            const localX = (worldCoords.worldX / cellSize) - cellX;
            const localY = (worldCoords.worldY / cellSize) - cellY;
            drawingHandlers.updateSegmentHover(cellX, cellY, localX, localY);
          }
        }
      }
      
      // Update hover only if objects visible
      if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
        objectHandlers.handleHoverUpdate(e);
      }
      return;
    }
    
    // Handle measure tool - live distance updates
    if (currentTool === 'measure' && measureHandlers?.handleMeasureMove) {
      // Get grid coordinates for measure update
      const { screenToGrid } = panZoomHandlers;
      if (screenToGrid) {
        const coords = screenToGrid(clientX, clientY);
        const gridX = coords.gridX !== undefined ? coords.gridX : coords.q;
        const gridY = coords.gridY !== undefined ? coords.gridY : coords.r;
        measureHandlers.handleMeasureMove(gridX, gridY);
      }
      return;
    }
    
    // Update hover state for objects (only if objects layer is visible)
    if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
      objectHandlers.handleHoverUpdate(e);
    }
  }, [currentTool, isDraggingSelection, dragStart, selectedItem, isGroupDragging, handleGroupDrag, getHandlers, layerVisibility, isAlignmentMode, geometry]);
  
  /**
   * Handle pointer up events
   * Stops dragging, resizing, drawing, panning
   */
  const handlePointerUp = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const alignmentHandlers = getHandlers('imageAlignment');
    const fogHandlers = getHandlers('fogOfWar');
    
    if (!panZoomHandlers) return;
    
    // In alignment mode, skip all normal tool handling
    if (isAlignmentMode) {
      return;
    }
    
    const { 
      getClientCoords,
      stopPan,
      isPanning 
    } = panZoomHandlers;
    
    // Reset multi-touch flag after a delay
    if (recentMultiTouch) {
      setTimeout(() => setRecentMultiTouch(false), 300);
    }
    
    // Stop panning
    if (isPanning) {
      stopPan();
      
      // Check if this was a click (no movement) vs a drag with select tool
      if (currentTool === 'select' && panStartPositionRef.current) {
        const { clientX, clientY } = getClientCoords(e);
        const deltaX = Math.abs(clientX - panStartPositionRef.current.x);
        const deltaY = Math.abs(clientY - panStartPositionRef.current.y);
        
        // If mouse/finger didn't move much, treat as a deselect click
        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold && selectedItem) {
          // If in edge snap mode (for objects), first tap-off exits snap mode
          // Second tap-off (or first when not in snap mode) deselects
          if (selectedItem.type === 'object' && objectHandlers?.edgeSnapMode) {
            objectHandlers.setEdgeSnapMode(false);
          } else {
            setSelectedItem(null);
          }
        }
        
        panStartPositionRef.current = null;
      }
      
      // Check if this was a click (no movement) vs a drag with areaSelect tool
      // If click, start area select; if drag, was panning (already handled)
      if (currentTool === 'areaSelect' && areaSelectPendingRef.current) {
        const { clientX, clientY } = getClientCoords(e);
        const deltaX = Math.abs(clientX - areaSelectPendingRef.current.clientX);
        const deltaY = Math.abs(clientY - areaSelectPendingRef.current.clientY);
        
        // If mouse/finger didn't move much, treat as area select click (start first corner)
        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold) {
          const areaSelectHandlers = getHandlers('areaSelect');
          if (areaSelectHandlers?.handleAreaSelectClick) {
            areaSelectHandlers.handleAreaSelectClick(areaSelectPendingRef.current.syntheticEvent);
          }
        }
        
        areaSelectPendingRef.current = null;
        panStartPositionRef.current = null;
      }
      
      return;
    }
    
    // Handle resize mode
    if (objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      return;
    }
    
    // Handle group drag (multi-select)
    if (isDraggingSelection && dragStart?.isGroupDrag) {
      stopGroupDrag();
      return;
    }
    
    // Handle dragging (single item)
    if (isDraggingSelection) {
      if (selectedItem?.type === 'object' && objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      } else if (selectedItem?.type === 'text' && textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }
      return;
    }
    
    // Handle drawing tools (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
      if (drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing(e);
      }
    }
    
    // Handle Fog of War tools
    if (fogHandlers?.handlePointerUp) {
      fogHandlers.handlePointerUp(e);
    }
  }, [currentTool, recentMultiTouch, isDraggingSelection, dragStart, selectedItem, setSelectedItem, isGroupDragging, stopGroupDrag, getHandlers, isAlignmentMode]);
  
  /**
   * Handle pointer leave events
   * Cancels pending actions and in-progress drawing
   */
  const handlePointerLeave = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    
    // Clear pending tool action
    if (pendingToolTimeoutRef.current) {
      clearTimeout(pendingToolTimeoutRef.current);
      pendingToolTimeoutRef.current = null;
      setPendingToolAction(null);
    }
    
    // Cancel any in-progress drawing (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
      if (drawingHandlers?.cancelDrawing) {
        drawingHandlers.cancelDrawing();
      }
    }
  }, [currentTool, getHandlers]);
  
  /**
   * Handle middle mouse button for panning
   */
  const handlePanStart = dc.useCallback((e) => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;
    
    if (e.button === 1) {
      e.preventDefault();
      panZoomHandlers.startPan(e.clientX, e.clientY);
    }
  }, [getHandlers]);
  
  const handlePanEnd = dc.useCallback((e) => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;
    
    if (panZoomHandlers.isPanning && e.button === 1) {
      e.preventDefault();
      panZoomHandlers.stopPan();
    }
  }, [getHandlers]);
  
  /**
   * Handle wheel events for zoom or object scaling
   */
  const handleWheel = dc.useCallback((e) => {
    // First, check if we should scale an object (when hovering over selected object)
    const objectHandlers = getHandlers('object');
    if (objectHandlers?.handleObjectWheel) {
      const handled = objectHandlers.handleObjectWheel(e);
      if (handled) return;
    }
    
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers?.handleWheel) return;
    
    // Skip zoom if actively panning with middle mouse button
    // This prevents conflicts between pan and zoom operations
    if (panZoomHandlers.isPanning) {
      return;
    }
    
    panZoomHandlers.handleWheel(e);
  }, [getHandlers]);
  
  /**
   * Handle double-click for text editing
   */
  const handleCanvasDoubleClick = dc.useCallback((e) => {
    const textHandlers = getHandlers('text');
    if (!textHandlers?.handleCanvasDoubleClick) return;
    
    textHandlers.handleCanvasDoubleClick(e);
  }, [getHandlers]);
  
  /**
   * Handle right-click: prevent context menu and cancel any shape preview
   */
  const handleContextMenu = dc.useCallback((e) => {
    e.preventDefault();
    const drawingHandlers = getHandlers('drawing');
    // Cancel any in-progress shape preview
    if (drawingHandlers?.cancelShapePreview) {
      drawingHandlers.cancelShapePreview();
    }
  }, [getHandlers]);
  
  // Attach event listeners to canvas
  dc.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e) => {
      if (e.button === 1) {
        handlePanStart(e);
      } else {
        handlePointerDown(e);
      }
    };
    
    const handleMouseUp = (e) => {
      handlePanEnd(e);
      handlePointerUp(e);
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('touchmove', handlePointerMove);
    canvas.addEventListener('touchend', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handlePointerDown);
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('touchmove', handlePointerMove);
      canvas.removeEventListener('touchend', handlePointerUp);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleCanvasDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    canvasRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePanStart,
    handlePanEnd,
    handleWheel,
    handleCanvasDoubleClick,
    handleContextMenu
  ]);
  
  // Add global pointer up listener for cleanup
  dc.useEffect(() => {
    const handleGlobalPointerUp = (e) => {
      const drawingHandlers = getHandlers('drawing');
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      const panZoomHandlers = getHandlers('panZoom');
      
      if (drawingHandlers?.isDrawing && drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing();
      }
      
      if (panZoomHandlers?.isPanning && e.button === 1) {
        panZoomHandlers.stopPan();
      }
      
      if (panZoomHandlers?.isTouchPanning) {
        panZoomHandlers.stopTouchPan();
        setTimeout(() => setRecentMultiTouch(false), 100);
      }
      
      if (objectHandlers?.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      
      // Stop group drag if active
      if (isDraggingSelection && dragStart?.isGroupDrag) {
        stopGroupDrag();
      }
      
      if (objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      }
      
      if (textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }
      
      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }
    };
    
    const handleGlobalMouseMove = (e) => {
      const panZoomHandlers = getHandlers('panZoom');
      if (panZoomHandlers?.isPanning && panZoomHandlers?.updatePan) {
        panZoomHandlers.updatePan(e.clientX, e.clientY);
      }
    };
    
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDraggingSelection, dragStart, setIsDraggingSelection, setDragStart, isGroupDragging, stopGroupDrag, getHandlers]);
  
  /**
   * Handle keyboard events
   * Dispatches to registered layer handlers for keyboard shortcuts
   */
  dc.useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle keyboard events when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Get registered handlers
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      
      // Try object handlers first (for rotation, deletion, etc.)
      if (objectHandlers?.handleObjectKeyDown) {
        const handled = objectHandlers.handleObjectKeyDown(e);
        if (handled) return;
      }
      
      // Try text label handlers
      if (textHandlers?.handleTextKeyDown) {
        const handled = textHandlers.handleTextKeyDown(e);
        if (handled) return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getHandlers]);
  
  // Clean up pending tool timeout on unmount
  dc.useEffect(() => {
    return () => {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
      }
    };
  }, []);
  
  // Coordinator hooks don't return anything - they just set up behavior
};

return { useEventCoordinator };