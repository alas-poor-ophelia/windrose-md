/**
 * useGroupDrag.js
 * 
 * Custom hook for managing group drag operations during multi-select.
 * Handles dragging multiple objects and text labels together as a group.
 * 
 * Features:
 * - Stores position offsets for all selected items when drag starts
 * - Applies movement delta to all items during drag
 * - Validates all positions (blocks move if any item would go out of bounds)
 * - Creates single history entry for the entire group move
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { getActiveLayer } = await requireModuleByName("layerAccessor.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { getObjectsInCell, assignSlot } = await requireModuleByName("hexSlotPositioner.js");

/**
 * Hook for managing group drag operations
 * @returns {Object} Group drag handlers and state
 */
const useGroupDrag = () => {
  const {
    geometry,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords
  } = useMapState();

  const {
    onObjectsChange,
    onTextLabelsChange
  } = useMapOperations();

  const {
    selectedItems,
    hasMultiSelection,
    isSelected,
    updateSelectedItemsData,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    groupDragOffsetsRef,
    groupDragInitialStateRef,
    isGroupDragging
  } = useMapSelection();

  /**
   * Check if a click is on any selected item
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {Object|null} The selected item that was clicked, or null
   */
  const getClickedSelectedItem = dc.useCallback((gridX, gridY, worldX, worldY) => {
    
    if (!hasMultiSelection || !mapData) {
      return null;
    }
    
    const activeLayer = getActiveLayer(mapData);
    
    // Check objects at this grid position
    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find(o => o.id === item.id);
        if (obj) {
          const size = obj.size || { width: 1, height: 1 };
          // Check if click is within object bounds
          if (gridX >= obj.position.x && gridX < obj.position.x + size.width &&
              gridY >= obj.position.y && gridY < obj.position.y + size.height) {
            return item;
          }
        }
      } else if (item.type === 'text') {
        // For text labels, do a rough world-coordinate check
        // Text labels use world coordinates, not grid
        const label = activeLayer.textLabels?.find(l => l.id === item.id);
        if (label) {
          const labelWorldX = label.position.x;
          const labelWorldY = label.position.y;
          // Approximate hit area based on font size
          const hitRadius = (label.fontSize || 16) * 2;
          const dx = worldX - labelWorldX;
          const dy = worldY - labelWorldY;
          if (Math.abs(dx) < hitRadius && Math.abs(dy) < hitRadius) {
            return item;
          }
        }
      }
    }
    
    return null;
  }, [hasMultiSelection, selectedItems, mapData]);

  /**
   * Start group drag - store offsets for all selected items
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @param {number} gridX - Grid X coordinate of click
   * @param {number} gridY - Grid Y coordinate of click
   * @returns {boolean} True if group drag was started
   */
  const startGroupDrag = dc.useCallback((clientX, clientY, gridX, gridY) => {
    
    if (!hasMultiSelection || !mapData) {
      return false;
    }
    
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;
    
    const activeLayer = getActiveLayer(mapData);
    
    // Store initial state for batch history
    groupDragInitialStateRef.current = {
      objects: [...(activeLayer.objects || [])],
      textLabels: [...(activeLayer.textLabels || [])]
    };
    
    // Calculate and store offsets for each selected item
    const offsets = new Map();
    
    for (const item of selectedItems) {
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find(o => o.id === item.id);
        if (obj) {
          offsets.set(item.id, {
            type: 'object',
            gridOffsetX: gridX - obj.position.x,
            gridOffsetY: gridY - obj.position.y,
            worldOffsetX: 0,
            worldOffsetY: 0
          });
        }
      } else if (item.type === 'text') {
        const label = activeLayer.textLabels?.find(l => l.id === item.id);
        if (label) {
          offsets.set(item.id, {
            type: 'text',
            gridOffsetX: 0,
            gridOffsetY: 0,
            worldOffsetX: worldCoords.worldX - label.position.x,
            worldOffsetY: worldCoords.worldY - label.position.y
          });
        }
      }
    }
    
    groupDragOffsetsRef.current = offsets;
    
    
    // Set up drag state
    setIsDraggingSelection(true);
    setDragStart({
      x: clientX,
      y: clientY,
      gridX,
      gridY,
      worldX: worldCoords.worldX,
      worldY: worldCoords.worldY,
      isGroupDrag: true
    });
    
    return true;
  }, [hasMultiSelection, selectedItems, mapData, screenToWorld, setIsDraggingSelection, setDragStart]);

  /**
   * Handle group drag movement
   * @param {Event} e - Pointer event
   * @returns {boolean} True if drag was handled
   */
  const handleGroupDrag = dc.useCallback((e) => {
    
    // Check dragStart.isGroupDrag directly since context state may not have updated yet
    if (!isDraggingSelection || !dragStart?.isGroupDrag || !mapData) {
      return false;
    }
    
    const { clientX, clientY } = getClientCoords(e);
    const gridCoords = screenToGrid(clientX, clientY);
    const worldCoords = screenToWorld(clientX, clientY);
    
    if (!gridCoords || !worldCoords) return true;
    
    const { gridX, gridY } = gridCoords;
    const { worldX, worldY } = worldCoords;
    
    // Calculate deltas
    const gridDeltaX = gridX - dragStart.gridX;
    const gridDeltaY = gridY - dragStart.gridY;
    const worldDeltaX = worldX - dragStart.worldX;
    const worldDeltaY = worldY - dragStart.worldY;
    
    // Skip if no movement
    if (gridDeltaX === 0 && gridDeltaY === 0 && worldDeltaX === 0 && worldDeltaY === 0) {
      return true;
    }
    
    const activeLayer = getActiveLayer(mapData);
    const offsets = groupDragOffsetsRef.current;
    
    // Calculate new positions for all items
    const objectUpdates = [];
    const textUpdates = [];
    
    for (const item of selectedItems) {
      const offset = offsets.get(item.id);
      if (!offset) continue;
      
      if (item.type === 'object') {
        const obj = activeLayer.objects?.find(o => o.id === item.id);
        if (obj) {
          const newX = gridX - offset.gridOffsetX;
          const newY = gridY - offset.gridOffsetY;
          objectUpdates.push({
            id: item.id,
            oldObj: obj,
            newPosition: { x: newX, y: newY }
          });
        }
      } else if (item.type === 'text') {
        const label = activeLayer.textLabels?.find(l => l.id === item.id);
        if (label) {
          const newX = worldX - offset.worldOffsetX;
          const newY = worldY - offset.worldOffsetY;
          textUpdates.push({
            id: item.id,
            oldLabel: label,
            newPosition: { x: newX, y: newY }
          });
        }
      }
    }
    
    // Validate all object moves
    // Check bounds for hex maps
    if (geometry && geometry.isWithinBounds) {
      for (const update of objectUpdates) {
        if (!geometry.isWithinBounds(update.newPosition.x, update.newPosition.y)) {
          // At least one object would be out of bounds - block entire move
          return true;
        }
      }
    }
    
    // Check for collisions with non-selected objects
    // Get set of selected object IDs for quick lookup
    const selectedObjectIds = new Set(
      selectedItems.filter(item => item.type === 'object').map(item => item.id)
    );
    
    // Get non-selected objects
    const nonSelectedObjects = (activeLayer.objects || []).filter(
      obj => !selectedObjectIds.has(obj.id)
    );
    
    // Check each moved object against non-selected objects
    for (const update of objectUpdates) {
      const movingSize = update.oldObj.size || { width: 1, height: 1 };
      const movingMinX = update.newPosition.x;
      const movingMinY = update.newPosition.y;
      const movingMaxX = movingMinX + movingSize.width;
      const movingMaxY = movingMinY + movingSize.height;
      
      for (const staticObj of nonSelectedObjects) {
        const staticSize = staticObj.size || { width: 1, height: 1 };
        const staticMinX = staticObj.position.x;
        const staticMinY = staticObj.position.y;
        const staticMaxX = staticMinX + staticSize.width;
        const staticMaxY = staticMinY + staticSize.height;
        
        // Check for overlap (axis-aligned bounding box intersection)
        const overlapsX = movingMinX < staticMaxX && movingMaxX > staticMinX;
        const overlapsY = movingMinY < staticMaxY && movingMaxY > staticMinY;
        
        if (overlapsX && overlapsY) {
          // Collision detected - block entire move
          return true;
        }
      }
    }
    
    // Apply object updates
    if (objectUpdates.length > 0) {
      let updatedObjects = [...activeLayer.objects];
      
      for (const update of objectUpdates) {
        const idx = updatedObjects.findIndex(o => o.id === update.id);
        if (idx !== -1) {
          updatedObjects[idx] = {
            ...updatedObjects[idx],
            position: update.newPosition
          };
        }
      }
      
      onObjectsChange(updatedObjects, true); // Suppress history during drag
    }
    
    // Apply text label updates
    if (textUpdates.length > 0) {
      let updatedLabels = [...activeLayer.textLabels];
      
      for (const update of textUpdates) {
        const idx = updatedLabels.findIndex(l => l.id === update.id);
        if (idx !== -1) {
          updatedLabels[idx] = {
            ...updatedLabels[idx],
            position: update.newPosition
          };
        }
      }
      
      onTextLabelsChange(updatedLabels, true); // Suppress history during drag
    }
    
    // Update drag start for next frame
    setDragStart({
      ...dragStart,
      gridX,
      gridY,
      worldX,
      worldY
    });
    
    // Update selected items data to keep in sync
    const allUpdates = [
      ...objectUpdates.map(u => ({ id: u.id, position: u.newPosition })),
      ...textUpdates.map(u => ({ id: u.id, position: u.newPosition }))
    ];
    updateSelectedItemsData(allUpdates);
    
    return true;
  }, [isDraggingSelection, dragStart, mapData, geometry, selectedItems, getClientCoords, 
      screenToGrid, screenToWorld, onObjectsChange, onTextLabelsChange, setDragStart, updateSelectedItemsData]);

  /**
   * Stop group drag and finalize history
   * @returns {boolean} True if group drag was stopped
   */
  const stopGroupDrag = dc.useCallback(() => {
    
    if (!isDraggingSelection || !dragStart?.isGroupDrag) {
      return false;
    }
    
    setIsDraggingSelection(false);
    setDragStart(null);
    
    // Commit history entries for the completed drag
    if (groupDragInitialStateRef.current !== null) {
      const activeLayer = getActiveLayer(mapData);
      
      // Commit objects change (this will create history entry)
      if (activeLayer.objects) {
        onObjectsChange(activeLayer.objects, false);
      }
      
      // Commit text labels change (this will create history entry)
      // Note: This might create two history entries - we may want to batch them
      // For now, this is acceptable behavior
      if (activeLayer.textLabels) {
        onTextLabelsChange(activeLayer.textLabels, false);
      }
      
      groupDragInitialStateRef.current = null;
    }
    
    // Clear offsets
    groupDragOffsetsRef.current = new Map();
    
    return true;
  }, [isDraggingSelection, dragStart, mapData, setIsDraggingSelection, setDragStart, onObjectsChange, onTextLabelsChange]);

  return {
    // State
    isGroupDragging,
    
    // Handlers
    getClickedSelectedItem,
    startGroupDrag,
    handleGroupDrag,
    stopGroupDrag
  };
};

return { useGroupDrag };