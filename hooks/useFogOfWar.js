/**
 * useFogOfWar.js
 * 
 * Manages Fog of War UI state and high-level operations for DungeonMapTracker.
 * This is distinct from useFogTools.js which handles canvas-level interactions.
 * 
 * State managed:
 * - showFogTools: Whether the fog tools panel is expanded
 * - fogActiveTool: Currently selected fog tool ('paint' | 'erase' | 'rectangle' | null)
 * 
 * Computed:
 * - currentFogState: Combined state from layer data + UI state
 * 
 * Operations provided:
 * - Tool panel toggle and tool selection
 * - Fog visibility toggle
 * - Fill all / Clear all fog
 * - Handle fog changes from FogOfWarLayer
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { 
  getActiveLayer, 
  updateActiveLayer,
  initializeFogOfWar,
  fogAll,
  fogPaintedCells,
  revealAll,
  toggleFogVisibility,
  getFogState
} = await requireModuleByName("layerAccessor.ts");

/**
 * Hook for managing Fog of War UI state and high-level operations
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.mapData - Current map data
 * @param {Object} options.geometry - Geometry instance for bounds checking
 * @param {Function} options.updateMapData - Function to update map data
 * @returns {Object} Fog state and actions
 */
function useFogOfWar({ mapData, geometry, updateMapData }) {
  // UI state for fog tools panel
  const [showFogTools, setShowFogTools] = dc.useState(false);
  const [fogActiveTool, setFogActiveTool] = dc.useState(null); // 'paint' | 'erase' | 'rectangle' | null

  // =========================================================================
  // Computed State
  // =========================================================================
  
  // Get current fog state for UI (combines layer data + UI state)
  const currentFogState = dc.useMemo(() => {
    if (!mapData) return { initialized: false, enabled: false, activeTool: null };
    const activeLayer = getActiveLayer(mapData);
    const state = getFogState(activeLayer);
    return {
      ...state,
      activeTool: fogActiveTool
    };
  }, [mapData, fogActiveTool]);

  // =========================================================================
  // Handlers
  // =========================================================================
  
  // Toggle FoW tools panel visibility
  const handleFogToolsToggle = dc.useCallback(() => {
    setShowFogTools(prev => !prev);
    // Clear active tool when closing panel
    if (showFogTools) {
      setFogActiveTool(null);
    }
  }, [showFogTools]);
  
  // Select a FoW tool
  const handleFogToolSelect = dc.useCallback((tool) => {
    // Toggle off if same tool selected
    setFogActiveTool(prev => prev === tool ? null : tool);
  }, []);
  
  // Toggle fog visibility (show/hide without changing fog data)
  const handleFogVisibilityToggle = dc.useCallback(() => {
    if (!mapData) return;
    
    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;
    
    const updatedLayer = toggleFogVisibility(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);
  
  // Fill all cells with fog
  // For bounded maps (hex): fogs all cells within bounds
  // For unbounded maps (grid): fogs only painted cells
  const handleFogFillAll = dc.useCallback(() => {
    if (!mapData || !geometry) return;
    
    let workingMapData = mapData;
    let activeLayer = getActiveLayer(workingMapData);
    
    // Initialize FoW if needed
    if (!activeLayer.fogOfWar) {
      workingMapData = initializeFogOfWar(workingMapData, workingMapData.activeLayerId);
      activeLayer = getActiveLayer(workingMapData);
    }
    
    // Use geometry to determine fog strategy
    let updatedLayer;
    if (geometry.isBounded()) {
      // Bounded maps: fog all cells within bounds
      updatedLayer = fogAll(activeLayer, geometry.getBounds());
    } else {
      // Unbounded maps: fog only painted cells
      if (!activeLayer.cells || activeLayer.cells.length === 0) {
        console.warn('[FoW] No painted cells to fog');
        return;
      }
      updatedLayer = fogPaintedCells(activeLayer, geometry);
    }
    
    // Ensure fog is enabled
    updateMapData(updateActiveLayer(workingMapData, {
      fogOfWar: {
        ...updatedLayer.fogOfWar,
        enabled: true
      }
    }));
  }, [mapData, geometry, updateMapData]);
  
  // Clear all fog
  const handleFogClearAll = dc.useCallback(() => {
    if (!mapData) return;
    
    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;
    
    const updatedLayer = revealAll(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);
  
  // Handle fog changes from FogOfWarLayer (for paint/erase/rectangle operations)
  const handleFogChange = dc.useCallback((updatedFogOfWar) => {
    if (!mapData) return;
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedFogOfWar }));
  }, [mapData, updateMapData]);

  // =========================================================================
  // Return Value
  // =========================================================================

  // Grouped state object
  const fogState = {
    showFogTools,
    fogActiveTool,
    currentFogState
  };

  // Grouped actions object
  const fogActions = {
    handleFogToolsToggle,
    handleFogToolSelect,
    handleFogVisibilityToggle,
    handleFogFillAll,
    handleFogClearAll,
    handleFogChange
  };

  return {
    // Grouped access
    fogState,
    fogActions,
    
    // Direct access (for convenience)
    showFogTools,
    fogActiveTool,
    currentFogState,
    handleFogToolsToggle,
    handleFogToolSelect,
    handleFogVisibilityToggle,
    handleFogFillAll,
    handleFogClearAll,
    handleFogChange
  };
}

return { useFogOfWar };