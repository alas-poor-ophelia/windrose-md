/**
 * useObjectInteractions.js
 * 
 * Custom hook for managing object interactions including:
 * - Object placement on click
 * - Object selection
 * - Object dragging with grid snapping
 * - Object resizing with corner handles
 * - Hover state management
 * - Object note and color management
 * - Button position calculations for object UI
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { calculateObjectScreenPosition: calculateScreenPos, applyInverseRotation } = await requireModuleByName("screenPositionUtils.js");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { calculateEdgeAlignment, getAlignmentOffset, placeObject, canPlaceObjectAt, removeObjectFromHex, generateObjectId } = await requireModuleByName("objectOperations.js");
const { getClickedObjectInCell, getObjectsInCell, canAddObjectToCell, assignSlot } = await requireModuleByName("hexSlotPositioner.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { getActiveLayer } = await requireModuleByName("layerAccessor.js");

/**
 * Hook for managing object interactions
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Array} customColors - Array of custom colors
 */
const useObjectInteractions = (
  currentTool,
  selectedObjectType,
  onAddCustomColor,
  customColors
) => {
  // Get all required state and operations from Context
  const {
    geometry,
    canvasRef,
    containerRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();

  const {
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    onObjectsChange
  } = useMapOperations();

  const {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition
  } = useMapSelection();

  // Object-specific state
  const [isResizing, setIsResizing] = dc.useState(false);
  const [resizeCorner, setResizeCorner] = dc.useState(null); // 'tl', 'tr', 'bl', 'br'
  const resizeInitialStateRef = dc.useRef(null);
  const dragInitialStateRef = dc.useRef(null); // Store initial state for batched drag history

  // Edge snap mode state
  const [edgeSnapMode, setEdgeSnapMode] = dc.useState(false);
  const longPressTimerRef = dc.useRef(null);
  const altKeyPressedRef = dc.useRef(false);

  // Hover state now comes from shared MapSelectionContext (passed as parameters)
  // hoveredObject, setHoveredObject, mousePosition, setMousePosition

  // Object color picker refs (state managed in MapCanvas)
  const objectColorBtnRef = dc.useRef(null);
  const pendingObjectCustomColorRef = dc.useRef(null);

  // Keyboard event listener for Alt key (edge snap toggle)
  dc.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Alt' && !altKeyPressedRef.current) {
        altKeyPressedRef.current = true;
        // Enable edge snap mode for both placement (addObject tool) and dragging (selected object)
        if (currentTool === 'addObject' || selectedItem?.type === 'object') {
          setEdgeSnapMode(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Alt') {
        altKeyPressedRef.current = false;
        setEdgeSnapMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedItem, currentTool]);

  // Clear up long press timer on unmount
  dc.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Clear selection when switching away from select tool, and clear edgeSnapMode when deselected
  const prevToolRef = dc.useRef(currentTool);
  dc.useEffect(() => {
    // Clear edgeSnapMode if no object is selected
    if (!selectedItem || selectedItem.type !== 'object') {
      setEdgeSnapMode(false);
    }
    
    // If tool changed and we had something selected
    if (prevToolRef.current !== currentTool && selectedItem) {
      // Clear selection when switching to any tool other than select
      if (currentTool !== 'select') {
        setSelectedItem(null);
        setEdgeSnapMode(false);
      }
    }
    prevToolRef.current = currentTool;
  }, [currentTool, selectedItem, setSelectedItem]);

  /**
   * Check if click is on a resize corner handle and return which corner
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @param {Object} object - Object to check corners for
   * @returns {string|null} Corner name ('tl', 'tr', 'bl', 'br') or null
   */
  const getClickedCorner = dc.useCallback((clientX, clientY, object) => {
    if (!object || !mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { gridSize, viewState, northDirection, mapType } = mapData;
    const { zoom, center } = viewState;

    // Calculate offset based on map type
    let offsetX, offsetY, objectWidth, objectHeight;
    if (mapType === 'hex') {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
      
      // Calculate object dimensions to match symbol rendering (use hexSize, not 2*hexSize)
      const hexSize = geometry.hexSize;
      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * hexSize * zoom;
      objectHeight = size.height * hexSize * zoom;
    } else {
      // Grid: center is in grid cell coordinates
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledGridSize;
      offsetY = canvas.height / 2 - center.y * scaledGridSize;
      
      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * scaledGridSize;
      objectHeight = size.height * scaledGridSize;
    }

    // Apply inverse rotation transformation
    const rotated = applyInverseRotation(x, y, canvas.width, canvas.height, northDirection);
    x = rotated.x;
    y = rotated.y;

    // Get screen position - for hex this is the center, for grid it's top-left
    let screenX, screenY;
    if (mapType === 'hex') {
      // For hex: calculate true center position in screen space
      const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;
      
      // Convert from center to top-left for corner calculations
      screenX -= objectWidth / 2;
      screenY -= objectHeight / 2;
    } else {
      // For grid: gridToScreen returns top-left
      const pos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
      screenX = pos.screenX;
      screenY = pos.screenY;
    }

    const handleSize = isResizeMode ? 14 : 8;
    const hitMargin = handleSize / 2 + 4; // Extra margin for easier clicking

    // Check each corner (corners are relative to top-left)
    const corners = [
      { name: 'tl', cx: screenX + 2, cy: screenY + 2 },
      { name: 'tr', cx: screenX + objectWidth - 2, cy: screenY + 2 },
      { name: 'bl', cx: screenX + 2, cy: screenY + objectHeight - 2 },
      { name: 'br', cx: screenX + objectWidth - 2, cy: screenY + objectHeight - 2 }
    ];

    for (const corner of corners) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      if (Math.abs(dx) <= hitMargin && Math.abs(dy) <= hitMargin) {
        return corner.name;
      }
    }

    return null;
  }, [mapData, isResizeMode, canvasRef, geometry]);

  /**
   * Handle object placement for addObject tool
   * @param {number} gridX - Grid X coordinate (q for hex maps) - snapped integer
   * @param {number} gridY - Grid Y coordinate (r for hex maps) - snapped integer  
   * @param {number} clientX - Raw client X coordinate (for edge snap detection)
   * @param {number} clientY - Raw client Y coordinate (for edge snap detection)
   * @returns {boolean} True if placement was handled
   */
  const handleObjectPlacement = dc.useCallback((gridX, gridY, clientX, clientY) => {
    if (currentTool !== 'addObject' || !selectedObjectType) {
      return false;
    }

    // Check bounds for hex maps (using geometry.isWithinBounds which handles offset conversion)
    if (geometry && geometry.isWithinBounds) {
      if (!geometry.isWithinBounds(gridX, gridY)) {
        return true; // Handled but blocked (outside bounds)
      }
    }

    const mapType = mapData.mapType || 'grid';
    
    // Check if placement is allowed
    if (!canPlaceObjectAt(getActiveLayer(mapData).objects || [], gridX, gridY, mapType)) {
      return true; // Handled but blocked (cell occupied/full)
    }

    // Determine alignment for grid maps with edge snap
    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords && geometry) {
        const cellSize = mapData.gridSize || geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    // Place object using unified API
    const result = placeObject(
      getActiveLayer(mapData).objects || [],
      selectedObjectType,
      gridX,
      gridY,
      { mapType, alignment }
    );
    
    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, edgeSnapMode, 
      onObjectsChange, screenToWorld]);



  /**
   * Handle object selection for select tool
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} True if selection was handled
   */
  const handleObjectSelection = dc.useCallback((clientX, clientY, gridX, gridY) => {
    if (currentTool !== 'select') {
      return false;
    }

    // If in resize mode with selected object, check for corner clicks FIRST
    if (selectedItem?.type === 'object' && isResizeMode) {
      const selectedObject = getActiveLayer(mapData).objects?.find(obj => obj.id === selectedItem.id);
      if (selectedObject) {
        const corner = getClickedCorner(clientX, clientY, selectedObject);
        if (corner) {
          // Store initial object state for batched history entry at resize end
          resizeInitialStateRef.current = [...(getActiveLayer(mapData).objects || [])];
          setIsResizing(true);
          setResizeCorner(corner);
          setDragStart({ x: clientX, y: clientY, gridX, gridY, object: { ...selectedObject } });
          return true;
        }
      }
    }

    // For hex maps with multi-object support: resolve click to specific object
    let object = null;
    if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
      const cellObjects = getObjectsInCell(getActiveLayer(mapData).objects || [], gridX, gridY);
      
      if (cellObjects.length > 1) {
        // Calculate click offset within hex (relative to hex center)
        const worldCoords = screenToWorld(clientX, clientY);
        if (worldCoords && geometry.hexToWorld) {
          const { worldX: hexCenterX, worldY: hexCenterY } = geometry.hexToWorld(gridX, gridY);
          // Offset in hex-width units (hexWidth = 2 * hexSize)
          const hexWidth = geometry.hexSize * 2;
          const clickOffsetX = (worldCoords.worldX - hexCenterX) / hexWidth;
          const clickOffsetY = (worldCoords.worldY - hexCenterY) / hexWidth;
          
          object = getClickedObjectInCell(
            getActiveLayer(mapData).objects || [],
            gridX,
            gridY,
            clickOffsetX,
            clickOffsetY,
            mapData.orientation || 'flat'
          );
        }
      } else if (cellObjects.length === 1) {
        object = cellObjects[0];
      }
    } else {
      // Grid maps: use standard single-object lookup
      object = getObjectAtPosition(getActiveLayer(mapData).objects || [], gridX, gridY);
    }
    
    if (object) {
      // Check if this object is already selected
      const isAlreadySelected = selectedItem?.type === 'object' && selectedItem.id === object.id;

      if (isAlreadySelected) {
        // Already selected - start long press detection for touch devices
        // Clear any existing timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        
        // Start long press timer (500ms threshold) - grid maps only
        // Edge snap mode is not implemented for hex maps
        if (mapData.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            // Toggle edge snap mode on long press
            setEdgeSnapMode(prev => !prev);
            
            // Haptic feedback if available
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            
            longPressTimerRef.current = null;
          }, 500);
        }
        
        // Start dragging
        dragInitialStateRef.current = [...(getActiveLayer(mapData).objects || [])];
        setIsDraggingSelection(true);
        // Store the offset from where we clicked to the object's actual position
        // This ensures enlarged objects don't jump when first moved
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY });
        setIsResizeMode(false);
      } else {
        // Not selected - select it and set up for potential drag
        setSelectedItem({ type: 'object', id: object.id, data: object });
        setIsResizeMode(false);
        
        // Set up drag state so user can continue into a drag without releasing
        // Store the object reference in dragStart since selectedItem state update is async
        dragInitialStateRef.current = [...(getActiveLayer(mapData).objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({ 
          x: clientX, 
          y: clientY, 
          gridX, 
          gridY, 
          offsetX, 
          offsetY,
          objectId: object.id  // Store object ID for immediate drag support
        });
        
        // Clear any existing timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        
        // Start long press timer - will enable edge snap mode if held (grid maps only)
        // Edge snap mode is not implemented for hex maps
        if (mapData.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            // Enable edge snap mode on long press (not toggle, since we just selected)
            setEdgeSnapMode(true);
            
            // Haptic feedback if available
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            
            longPressTimerRef.current = null;
          }, 500);
        }
      }

      return true;
    }

    return false;
  }, [currentTool, selectedObjectType, selectedItem, isResizeMode, mapData,
    getObjectAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart, setIsResizing
  ]);

  /**
   * Handle object dragging during pointer move
   * @param {Object} e - Event object
   * @returns {boolean} True if dragging was handled
   */
  const handleObjectDragging = dc.useCallback((e) => {
    // Check if we're dragging - use dragStart.objectId as fallback when selectedItem hasn't updated yet
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (!isDraggingSelection || !isDraggingObject || !dragStart || !mapData) {
      return false;
    }

    // Get the object ID from either selectedItem or dragStart
    const objectId = selectedItem?.id || dragStart.objectId;

    const { clientX, clientY } = getClientCoords(e);
    
    // Cancel long press timer if user has moved beyond a small threshold (5 pixels)
    // This prevents accidental edge-snap activation during normal dragging
    if (longPressTimerRef.current) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { gridX, gridY } = coords;
    

    // Calculate target position using the stored offset
    const offsetX = dragStart.offsetX || 0;
    const offsetY = dragStart.offsetY || 0;
    const targetX = gridX - offsetX;
    const targetY = gridY - offsetY;

    // Only update if we've moved to a different grid cell
    if (gridX !== dragStart.gridX || gridY !== dragStart.gridY) {
      const currentObject = getActiveLayer(mapData).objects?.find(o => o.id === objectId);
      if (!currentObject) return true;
      
      const isMovingWithinSameCell = currentObject.position.x === targetX && currentObject.position.y === targetY;
      
      // For hex maps: handle multi-object cell logic
      if (mapData.mapType === 'hex' && !isMovingWithinSameCell) {
        // Check if target cell can accept this object
        const targetCellObjects = getObjectsInCell(getActiveLayer(mapData).objects || [], targetX, targetY);
        
        if (targetCellObjects.length >= 4) {
          // Target cell is full - block the move
          return true;
        }
        
        // Assign new slot in target cell
        const targetSlots = targetCellObjects.map(o => o.slot ?? 0);
        const newSlot = assignSlot(targetSlots);
        
        // Remove from old cell with reorganization, then update position and slot
        let updatedObjects = removeObjectFromHex(getActiveLayer(mapData).objects, objectId);
        
        // Re-add the moved object with new position and slot
        updatedObjects = [...updatedObjects, {
          ...currentObject,
          position: { x: targetX, y: targetY },
          slot: newSlot
        }];
        
        onObjectsChange(updatedObjects, true); // Suppress history during drag
        
        // Update drag start and selected item
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY, objectId });
        const movedObject = updatedObjects.find(obj => obj.id === objectId);
        if (movedObject) {
          setSelectedItem({
            type: 'object',
            id: objectId,
            data: movedObject
          });
        }
      } else {
        // Grid maps or same-cell movement: use existing single-object logic
        const existingObj = getObjectAtPosition(getActiveLayer(mapData).objects || [], targetX, targetY);
        
        if (!existingObj || existingObj.id === objectId) {
          // Determine alignment if in edge snap mode
          let alignment = 'center';
          if (edgeSnapMode) {
            const worldCoords = screenToWorld(clientX, clientY);
            if (worldCoords && geometry.worldToGrid) {
              const fractionalX = worldCoords.worldX / (mapData.gridSize || geometry.cellSize);
              const fractionalY = worldCoords.worldY / (mapData.gridSize || geometry.cellSize);
              alignment = calculateEdgeAlignment(fractionalX, fractionalY, targetX, targetY);
            }
          }
          
          // Update object position and alignment (suppress history during drag)
          const updatedObjects = updateObject(
            getActiveLayer(mapData).objects,
            objectId,
            { position: { x: targetX, y: targetY }, alignment }
          );
          onObjectsChange(updatedObjects, true); // Suppress history

          // Update drag start and selected item data for next frame (preserve offset and objectId)
          setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY, objectId });
          const updatedObject = updatedObjects.find(obj => obj.id === objectId);
          if (updatedObject) {
            setSelectedItem({
              type: 'object',
              id: objectId,
              data: updatedObject
            });
          }
        }
      }
    }
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, edgeSnapMode, geometry,
    getClientCoords, screenToGrid, screenToWorld, updateObject, onObjectsChange, setDragStart, setSelectedItem, calculateEdgeAlignment]);

  /**
   * Handle object resizing during pointer move
   * @param {Object} e - Event object
   * @returns {boolean} True if resizing was handled
   */
  const handleObjectResizing = dc.useCallback((e) => {
    if (!isResizing || !dragStart || !mapData || selectedItem?.type !== 'object') {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { gridX, gridY } = coords;
    const originalObject = dragStart.object;
    const originalPos = originalObject.position;
    const originalSize = originalObject.size || { width: 1, height: 1 };

    // Calculate new dimensions based on corner being dragged
    let newX = originalPos.x;
    let newY = originalPos.y;
    let newWidth = originalSize.width;
    let newHeight = originalSize.height;

    switch (resizeCorner) {
      case 'tl': // Top-left: adjust position and size
        newX = Math.min(gridX, originalPos.x + originalSize.width - 1);
        newY = Math.min(gridY, originalPos.y + originalSize.height - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'tr': // Top-right: adjust Y and width
        newY = Math.min(gridY, originalPos.y + originalSize.height - 1);
        newWidth = Math.max(1, gridX - originalPos.x + 1);
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'bl': // Bottom-left: adjust X and height
        newX = Math.min(gridX, originalPos.x + originalSize.width - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = Math.max(1, gridY - originalPos.y + 1);
        break;
      case 'br': // Bottom-right: just increase size
        newWidth = Math.max(1, gridX - originalPos.x + 1);
        newHeight = Math.max(1, gridY - originalPos.y + 1);
        break;
    }

    // Clamp to max size of 5
    newWidth = Math.min(newWidth, 5);
    newHeight = Math.min(newHeight, 5);

    // Try progressive fallback: both dimensions -> width only -> height only
    let finalWidth = newWidth;
    let finalHeight = newHeight;
    let finalX = newX;
    let finalY = newY;
    let resizeSucceeded = false;

    // First attempt: both dimensions
    if (isAreaFree(getActiveLayer(mapData).objects, newX, newY, newWidth, newHeight, selectedItem.id)) {
      resizeSucceeded = true;
    }

    // If both dimensions failed, try just width (keep original height)
    if (!resizeSucceeded && newWidth !== originalSize.width) {
      if (isAreaFree(getActiveLayer(mapData).objects, newX, originalPos.y, newWidth, originalSize.height, selectedItem.id)) {
        finalWidth = newWidth;
        finalHeight = originalSize.height;
        finalX = newX;
        finalY = originalPos.y;
        resizeSucceeded = true;
      }
    }

    // If width also failed, try just height (keep original width)
    if (!resizeSucceeded && newHeight !== originalSize.height) {
      if (isAreaFree(getActiveLayer(mapData).objects, originalPos.x, newY, originalSize.width, newHeight, selectedItem.id)) {
        finalWidth = originalSize.width;
        finalHeight = newHeight;
        finalX = originalPos.x;
        finalY = newY;
        resizeSucceeded = true;
      }
    }

    // Apply the resize if any attempt succeeded
    if (resizeSucceeded) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        {
          position: { x: finalX, y: finalY },
          size: { width: finalWidth, height: finalHeight }
        }
      );
      // Suppress history during drag (we'll add single entry when resize ends)
      onObjectsChange(updatedObjects, true);

      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
    }
    return true;
  }, [isResizing, dragStart, mapData, selectedItem, resizeCorner,
    getClientCoords, screenToGrid, isAreaFree, updateObject, onObjectsChange, setSelectedItem]
  );

  /**
   * Handle hover state updates during pointer move
   * @param {Object} e - Event object
   */
  const handleHoverUpdate = dc.useCallback((e) => {
    if (!e.touches && mapData && getActiveLayer(mapData).objects) {
      const { clientX, clientY } = getClientCoords(e);
      const coords = screenToGrid(clientX, clientY);
      if (coords) {
        let obj = null;
        
        // coords always has gridX and gridY for both hex and grid maps
        const { gridX, gridY } = coords;
        
        // For hex maps, try using getClickedObjectInCell to handle multi-object cells
        if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
          // Get world coordinates for click offset calculation
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            // Calculate click offset from hex center
            const hexCenter = geometry.gridToWorld(gridX, gridY);
            const clickOffsetX = (worldCoords.worldX - hexCenter.worldX) / geometry.width;
            const clickOffsetY = (worldCoords.worldY - hexCenter.worldY) / geometry.width;
            
            obj = getClickedObjectInCell(
              getActiveLayer(mapData).objects,
              gridX, gridY,
              clickOffsetX, clickOffsetY,
              mapData.orientation || 'flat'
            );
          }
        }
        
        // Fallback to simple position lookup if getClickedObjectInCell didn't find anything
        // or if not a hex map
        if (!obj) {
          obj = getObjectAtPosition(getActiveLayer(mapData).objects, gridX, gridY);
        }
        
        setHoveredObject(obj);

        // Calculate position relative to container for absolute positioning
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        setMousePosition({ x: relativeX, y: relativeY });
      } else {
        setHoveredObject(null);
      }
    }
  }, [mapData, geometry, getClientCoords, screenToGrid, screenToWorld, getObjectAtPosition, setHoveredObject, setMousePosition, containerRef]
  );

  /**
   * Stop dragging selection and finalize history
   */
  const stopObjectDragging = dc.useCallback(() => {
    // Check dragStart.objectId as fallback for when selectedItem hasn't updated yet
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (isDraggingSelection && isDraggingObject) {
      // Cancel any pending long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      setIsDraggingSelection(false);
      setDragStart(null);

      // Add single history entry for the completed drag
      if (dragInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData).objects, false);
        dragInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isDraggingSelection, selectedItem, dragStart, setIsDraggingSelection, setDragStart, onObjectsChange, mapData]);


  /**
   * Stop resizing and finalize history
   */
  const stopObjectResizing = dc.useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      setResizeCorner(null);
      setDragStart(null);

      // Add single history entry for the completed resize
      if (resizeInitialStateRef.current !== null) {
        onObjectsChange(getActiveLayer(mapData).objects, false);
        resizeInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isResizing, setIsResizing, setResizeCorner, setDragStart, onObjectsChange, mapData]
  );

  /**
   * Handle keyboard shortcuts for objects
   */
  const handleObjectKeyDown = dc.useCallback((e) => {
    // Only handle if an object is selected
    if (selectedItem?.type !== 'object') {
      return false;
    }
    
    // Rotation with R key
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      // Cycle through rotations
      const rotations = [0, 90, 180, 270];
      const currentRotation = selectedItem.data?.rotation || 0;
      const currentIndex = rotations.indexOf(currentRotation);
      const nextRotation = rotations[(currentIndex + 1) % 4];
      
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        { rotation: nextRotation }
      );
      onObjectsChange(updatedObjects);
      
      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
      return true;
    }
    
    // Deletion with Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const updatedObjects = removeObject(getActiveLayer(mapData).objects, selectedItem.id);
      onObjectsChange(updatedObjects);
      setSelectedItem(null);
      setIsResizeMode(false);
      return true;
    }

    // Escape key to exit resize mode
    if (e.key === 'Escape' && isResizeMode) {
      e.preventDefault();
      setIsResizeMode(false);
      return true;
    }

    return false;
  }, [selectedItem, isResizeMode, mapData, removeObject, updateObject, onObjectsChange, setSelectedItem, setIsResizeMode]
  );

  /**
   * Handle mouse wheel for object scaling when hovering over selected object
   * @param {WheelEvent} e - Wheel event
   * @returns {boolean} True if wheel was handled
   */
  const handleObjectWheel = dc.useCallback((e) => {
    // Only handle if an object is selected and we're hovering over it
    if (selectedItem?.type !== 'object' || !mapData?.objects) {
      return false;
    }
    
    // Check if mouse is over the selected object
    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return false;
    
    const { gridX, gridY } = coords;
    const selectedObject = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!selectedObject) return false;
    
    // Check if cursor is over the selected object's cell
    const isOverObject = gridX >= selectedObject.position.x && 
                         gridX < selectedObject.position.x + (selectedObject.size?.width || 1) &&
                         gridY >= selectedObject.position.y && 
                         gridY < selectedObject.position.y + (selectedObject.size?.height || 1);
    
    if (!isOverObject) return false;
    
    // Prevent page scroll
    e.preventDefault();
    
    // Calculate new scale (allow up to 130% for symbols with inherent padding)
    const currentScale = selectedObject.scale ?? 1.0;
    const delta = e.deltaY > 0 ? -0.05 : 0.05; // Scroll down = smaller, scroll up = larger
    const newScale = Math.max(0.25, Math.min(1.3, currentScale + delta));
    
    // Only update if scale changed
    if (newScale !== currentScale) {
      const updatedObjects = updateObject(getActiveLayer(mapData).objects, selectedItem.id, { scale: newScale });
      onObjectsChange(updatedObjects);
      
      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({ ...selectedItem, data: updatedObject });
      }
    }
    
    return true;
  }, [selectedItem, mapData, screenToGrid, updateObject, onObjectsChange, setSelectedItem]);

  /**
   * Calculate note button position (top-right corner)
   */
  const calculateLabelButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;

    // Position button at top-right corner of selection box
    const buttonX = screenX + (objectWidth / 2) + buttonOffset;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22; // 22 = half button height // 16 = half button height

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate object color button position (bottom-left corner, avoiding resize button)
   */
  const calculateLinkNoteButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;
    const buttonHeight = 44;
    const minSpacing = 8;

    // Calculate base position at BOTTOM-LEFT corner
    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    // Check if buttons would overlap (Add/edit note button is at top-right)
    // Add/edit note button bottom edge: screenY - (objectHeight / 2) - buttonOffset - 16 + buttonHeight
    const addEditNoteButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    // If our top edge would be above the add/edit note button's bottom edge, push us down
    if (buttonY - 22 < addEditNoteButtonBottom + minSpacing) {
      buttonY = addEditNoteButtonBottom + minSpacing + 22;
    }

    // Position at BOTTOM-RIGHT corner (or further down if needed to avoid overlap)
    const buttonX = screenX + (objectWidth / 2) + buttonOffset;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate resize button position (top-left corner)
   */
  const calculateResizeButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44; // Updated to match CSS media query // CSS button width

    // Position resize button at top-LEFT corner (opposite of note button)
    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22; // 22 = half button height // 16 = half button height

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate object color button position (bottom-left corner, avoiding resize button)
   */
  const calculateObjectColorButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44; // Updated to match CSS media query
    const buttonHeight = 44; // Updated to match CSS media query
    const minSpacing = 8; // Minimum gap between buttons

    // Calculate base position at BOTTOM-LEFT corner
    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    // Check if buttons would overlap (resize button is at top-left)
    // Resize button bottom edge: screenY - (objectHeight / 2) - buttonOffset - 16 + buttonHeight
    const resizeButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    // If our top edge would be above the resize button's bottom edge, push us down
    if (buttonY - 22 < resizeButtonBottom + minSpacing) {
      buttonY = resizeButtonBottom + minSpacing + 22; // 16 = half our button height
    }

    // Position at BOTTOM-LEFT corner (or further down if needed to avoid overlap)
    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Handle object note modal submit
   */
  const handleNoteSubmit = dc.useCallback((content, editingObjectId) => {
    if (editingObjectId && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        editingObjectId,
        { customTooltip: content && content.trim() ? content.trim() : undefined }
      );
      onObjectsChange(updatedObjects);

      // Update selected item data if it's still selected
      if (selectedItem?.id === editingObjectId) {
        const updatedObject = updatedObjects.find(obj => obj.id === editingObjectId);
        if (updatedObject) {
          setSelectedItem({
            ...selectedItem,
            data: updatedObject
          });
        }
      }
    }
  }, [mapData, onObjectsChange, selectedItem, setSelectedItem]
  );

  /**
   * Handle object color selection
   */
  const handleObjectColorSelect = dc.useCallback((color) => {
    if (selectedItem?.type === 'object' && mapData) {
      const updatedObjects = updateObject(
        getActiveLayer(mapData).objects,
        selectedItem.id,
        { color: color }
      );
      onObjectsChange(updatedObjects);

      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange, setSelectedItem]
  );


  /**
   * Handle object color reset
   */
  const handleObjectColorReset = dc.useCallback((setShowObjectColorPicker) => {
    handleObjectColorSelect('#ffffff');
    setShowObjectColorPicker(false);
  }, [handleObjectColorSelect]);

  /**
   * Handle object rotation (cycles 0Â° -> 90Â° -> 180Â° -> 270Â° -> 0Â°)
   */
  const handleObjectRotation = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }
    
    // Cycle through rotations
    const rotations = [0, 90, 180, 270];
    const currentRotation = selectedItem.data?.rotation || 0;
    const currentIndex = rotations.indexOf(currentRotation);
    const nextRotation = rotations[(currentIndex + 1) % 4];
    
    const updatedObjects = updateObject(
      getActiveLayer(mapData).objects,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onObjectsChange(updatedObjects);
    
    // Update selected item data
    const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({
        ...selectedItem,
        data: updatedObject
      });
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange, setSelectedItem]);

  /**
   * Handle object deletion
   */
  const handleObjectDeletion = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }
    
    const updatedObjects = removeObject(getActiveLayer(mapData).objects, selectedItem.id);
    onObjectsChange(updatedObjects);
    setSelectedItem(null);
  }, [selectedItem, mapData, removeObject, onObjectsChange, setSelectedItem]);

  /**
   * Handle object duplication - creates a copy at nearest empty space
   */
  const handleObjectDuplicate = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }
    
    const sourceObject = getActiveLayer(mapData).objects.find(obj => obj.id === selectedItem.id);
    if (!sourceObject) return;
    
    const { mapType } = mapData;
    const { x: sourceX, y: sourceY } = sourceObject.position;
    
    // Spiral search for nearby empty cell
    // Direction vectors for spiral: right, down, left, up
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    let targetX = sourceX;
    let targetY = sourceY;
    let found = false;
    
    // Start by checking adjacent cells, then spiral outward
    for (let ring = 1; ring <= 10 && !found; ring++) {
      for (let dir = 0; dir < 4 && !found; dir++) {
        for (let step = 0; step < ring && !found; step++) {
          const checkX = sourceX + directions[dir][0] * ring;
          const checkY = sourceY + directions[dir][1] * (step + 1 - ring);
          
          if (canPlaceObjectAt(getActiveLayer(mapData).objects, checkX, checkY, mapType)) {
            targetX = checkX;
            targetY = checkY;
            found = true;
          }
        }
      }
      
      // If not found in simple checks, try each position in ring
      if (!found) {
        for (let dx = -ring; dx <= ring && !found; dx++) {
          for (let dy = -ring; dy <= ring && !found; dy++) {
            if (Math.abs(dx) === ring || Math.abs(dy) === ring) {
              const checkX = sourceX + dx;
              const checkY = sourceY + dy;
              
              if (canPlaceObjectAt(getActiveLayer(mapData).objects, checkX, checkY, mapType)) {
                targetX = checkX;
                targetY = checkY;
                found = true;
              }
            }
          }
        }
      }
    }
    
    if (!found) {
      console.warn('No empty space found for duplicate');
      return;
    }
    
    // Clone the object with new ID and position
    const newObject = {
      ...sourceObject,
      id: generateObjectId(),
      position: { x: targetX, y: targetY }
    };
    
    // For hex maps, assign a slot
    if (mapType === 'hex') {
      const occupiedSlots = getActiveLayer(mapData).objects
        .filter(obj => obj.position.x === targetX && obj.position.y === targetY)
        .map(obj => obj.slot)
        .filter(s => s !== undefined);
      newObject.slot = assignSlot(occupiedSlots);
    }
    
    const updatedObjects = [...getActiveLayer(mapData).objects, newObject];
    onObjectsChange(updatedObjects);
    
    // Select the new object
    setSelectedItem({
      type: 'object',
      id: newObject.id,
      data: newObject
    });
  }, [selectedItem, mapData, onObjectsChange, setSelectedItem]);

  // Reset resize mode when switching away from select tool
  dc.useEffect(() => {
    if (currentTool !== 'select') {
      setIsResizeMode(false);
    }
  }, [currentTool]);

  return {
    // State
    isResizeMode,
    setIsResizeMode,
    isResizing,
    resizeCorner,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    longPressTimerRef,

    // Handlers
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleObjectWheel,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    handleObjectRotation,
    handleObjectDeletion,
    handleObjectDuplicate,

    // Button position calculators
    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition,

    // Modal handlers
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,

    // Utility
    getClickedCorner
  };
};

return { useObjectInteractions };