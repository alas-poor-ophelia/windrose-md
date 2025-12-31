/**
 * useAreaSelect.js
 * 
 * Custom hook for managing area selection tool:
 * - Two-click rectangle selection (matching other area tools)
 * - First click places start corner marker
 * - Second click completes selection of all items in rectangle
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { getItemsInWorldRect } = await requireModuleByName("multiSelectOperations.ts");
const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");

/**
 * Hook for managing area selection tool
 * @param {string} currentTool - Current active tool
 * @returns {Object} Area select handlers and state
 */
const useAreaSelect = (currentTool) => {
  const {
    canvasRef,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    getClientCoords
  } = useMapState();
  
  const {
    areaSelectStart,
    setAreaSelectStart,
    selectMultiple,
    clearSelection
  } = useMapSelection();
  
  const isAreaSelectTool = currentTool === 'areaSelect';
  
  /**
   * Handle click for area select tool
   * First click: Set start corner
   * Second click: Complete selection
   * @param {Event} e - Pointer event
   * @returns {boolean} True if handled
   */
  const handleAreaSelectClick = dc.useCallback((e) => {
    if (!isAreaSelectTool || !mapData || !geometry) {
      return false;
    }
    
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    const gridCoords = screenToGrid(clientX, clientY);
    
    if (!worldCoords || !gridCoords) {
      return false;
    }
    
    // First click - set start corner
    if (!areaSelectStart) {
      // Clear any existing selection when starting a new area select
      clearSelection();
      
      setAreaSelectStart({
        worldX: worldCoords.worldX,
        worldY: worldCoords.worldY,
        x: gridCoords.x,
        y: gridCoords.y
      });
      return true;
    }
    
    // Second click - complete selection
    const corner1 = {
      worldX: areaSelectStart.worldX,
      worldY: areaSelectStart.worldY
    };
    const corner2 = {
      worldX: worldCoords.worldX,
      worldY: worldCoords.worldY
    };
    
    // Get canvas context for text measurement
    const ctx = canvasRef.current?.getContext('2d');
    
    // Find all items in the selection rectangle
    const items = getItemsInWorldRect(mapData, corner1, corner2, geometry, ctx);
    
    // Update selection
    if (items.length > 0) {
      selectMultiple(items);
    } else {
      clearSelection();
    }
    
    // Clear the start marker
    setAreaSelectStart(null);
    
    return true;
  }, [isAreaSelectTool, mapData, geometry, areaSelectStart, getClientCoords, 
      screenToWorld, screenToGrid, canvasRef, setAreaSelectStart, selectMultiple, clearSelection]);
  
  /**
   * Cancel area selection (e.g., on tool change or Escape)
   */
  const cancelAreaSelect = dc.useCallback(() => {
    if (areaSelectStart) {
      setAreaSelectStart(null);
    }
  }, [areaSelectStart, setAreaSelectStart]);
  
  /**
   * Check if area selection is in progress (first corner placed)
   */
  const isAreaSelecting = !!areaSelectStart;
  
  return {
    // State
    areaSelectStart,
    isAreaSelecting,
    
    // Handlers
    handleAreaSelectClick,
    cancelAreaSelect
  };
};

return { useAreaSelect };