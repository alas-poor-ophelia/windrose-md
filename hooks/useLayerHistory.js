/**
 * useLayerHistory.js
 * 
 * Manages layer switching with per-layer undo/redo history.
 * This hook centralizes all history-related logic including:
 * - Per-layer history caching (each layer has independent undo/redo stacks)
 * - Layer select/add/delete handlers that preserve history state
 * - Undo/redo operations
 * - History tracking for data change handlers
 * 
 * The hook internally uses useHistory and manages the layer-specific caching,
 * providing a clean API for the parent component.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useHistory } = await requireModuleByName("useHistory.js");
const { 
  getActiveLayer, 
  updateActiveLayer,
  addLayer, 
  removeLayer, 
  reorderLayers, 
  setActiveLayer
} = await requireModuleByName("layerAccessor.ts");

/**
 * Hook for managing layer switching with per-layer history
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.mapData - Current map data
 * @param {Function} options.updateMapData - Function to update map data
 * @param {boolean} options.isLoading - Whether map data is still loading
 * @returns {Object} Layer and history state/actions
 */
function useLayerHistory({ mapData, updateMapData, isLoading }) {
  // =========================================================================
  // Core History Hook
  // =========================================================================
  
  const {
    currentState: historyState,
    addToHistory: addToHistoryInternal,
    undo: undoInternal,
    redo: redoInternal,
    canUndo,
    canRedo,
    resetHistory,
    getHistoryState,
    restoreHistoryState
  } = useHistory({ cells: [], name: "", objects: [], textLabels: [], edges: [] });

  // =========================================================================
  // Refs for History Management
  // =========================================================================
  
  // Track if we're applying history (to avoid adding to history during undo/redo)
  const isApplyingHistoryRef = dc.useRef(false);
  
  // Track if history has been initialized for the current session
  const historyInitialized = dc.useRef(false);
  
  // Cache history state per layer (keyed by layer ID)
  const layerHistoryCache = dc.useRef({});

  // =========================================================================
  // History Initialization Effect
  // =========================================================================
  
  // Initialize history when map data loads (only once)
  dc.useEffect(() => {
    if (mapData && !isLoading && !historyInitialized.current) {
      const activeLayer = getActiveLayer(mapData);
      resetHistory({
        cells: activeLayer.cells,
        name: mapData.name,
        objects: activeLayer.objects || [],
        textLabels: activeLayer.textLabels || [],
        edges: activeLayer.edges || []
      });
      historyInitialized.current = true;
    }
  }, [mapData, isLoading, resetHistory]);

  // =========================================================================
  // Layer State Helpers
  // =========================================================================
  
  /**
   * Build a history state snapshot from layer data
   */
  const buildHistoryState = dc.useCallback((layer, name) => ({
    cells: layer.cells || [],
    name: name,
    objects: layer.objects || [],
    textLabels: layer.textLabels || [],
    edges: layer.edges || []
  }), []);

  /**
   * Save current layer's history to cache
   */
  const saveCurrentLayerHistory = dc.useCallback(() => {
    if (!mapData) return;
    const currentLayerId = mapData.activeLayerId;
    layerHistoryCache.current[currentLayerId] = getHistoryState();
  }, [mapData, getHistoryState]);

  /**
   * Restore or initialize history for a layer
   */
  const restoreOrInitLayerHistory = dc.useCallback((newMapData, layerId) => {
    const cachedHistory = layerHistoryCache.current[layerId];
    if (cachedHistory) {
      restoreHistoryState(cachedHistory);
    } else {
      // No cached history for this layer - initialize fresh
      const layer = getActiveLayer(newMapData);
      historyInitialized.current = false;
      resetHistory(buildHistoryState(layer, newMapData.name));
      historyInitialized.current = true;
    }
  }, [restoreHistoryState, resetHistory, buildHistoryState]);

  // =========================================================================
  // Layer Management Handlers
  // =========================================================================
  
  // Switch to a different layer
  const handleLayerSelect = dc.useCallback((layerId) => {
    if (!mapData || mapData.activeLayerId === layerId) return;
    
    // Save current layer's history before switching
    saveCurrentLayerHistory();
    
    const newMapData = setActiveLayer(mapData, layerId);
    updateMapData(newMapData);
    
    // Restore new layer's history or initialize if none cached
    restoreOrInitLayerHistory(newMapData, layerId);
  }, [mapData, updateMapData, saveCurrentLayerHistory, restoreOrInitLayerHistory]);
  
  // Add a new layer
  const handleLayerAdd = dc.useCallback(() => {
    if (!mapData) return;
    
    // Save current layer's history before switching
    saveCurrentLayerHistory();
    
    const newMapData = addLayer(mapData);
    updateMapData(newMapData);
    
    // New layer always starts with fresh history
    const newActiveLayer = getActiveLayer(newMapData);
    historyInitialized.current = false;
    resetHistory(buildHistoryState(newActiveLayer, newMapData.name));
    historyInitialized.current = true;
  }, [mapData, updateMapData, saveCurrentLayerHistory, resetHistory, buildHistoryState]);
  
  // Delete a layer
  const handleLayerDelete = dc.useCallback((layerId) => {
    if (!mapData) return;
    
    // removeLayer handles preventing deletion of last layer
    const newMapData = removeLayer(mapData, layerId);
    
    // Only update if something changed
    if (newMapData !== mapData) {
      // Clear cached history for deleted layer
      delete layerHistoryCache.current[layerId];
      
      updateMapData(newMapData);
      
      // If active layer changed, restore or init history for new active layer
      if (newMapData.activeLayerId !== mapData.activeLayerId) {
        restoreOrInitLayerHistory(newMapData, newMapData.activeLayerId);
      }
    }
  }, [mapData, updateMapData, restoreOrInitLayerHistory]);
  
  // Reorder layers (no history interaction needed)
  const handleLayerReorder = dc.useCallback((layerId, newIndex) => {
    if (!mapData) return;
    
    const newMapData = reorderLayers(mapData, layerId, newIndex);
    updateMapData(newMapData);
  }, [mapData, updateMapData]);

  // =========================================================================
  // Undo/Redo Handlers
  // =========================================================================
  
  // Handle undo
  const handleUndo = dc.useCallback(() => {
    const previousState = undoInternal();
    if (previousState && mapData) {
      isApplyingHistoryRef.current = true;
      // Apply layer-specific data to active layer, name stays at root
      const newMapData = updateActiveLayer(
        { ...mapData, name: previousState.name },
        {
          cells: previousState.cells,
          objects: previousState.objects || [],
          textLabels: previousState.textLabels || [],
          edges: previousState.edges || []
        }
      );
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  }, [undoInternal, mapData, updateMapData]);

  // Handle redo
  const handleRedo = dc.useCallback(() => {
    const nextState = redoInternal();
    if (nextState && mapData) {
      isApplyingHistoryRef.current = true;
      // Apply layer-specific data to active layer, name stays at root
      const newMapData = updateActiveLayer(
        { ...mapData, name: nextState.name },
        {
          cells: nextState.cells,
          objects: nextState.objects || [],
          textLabels: nextState.textLabels || [],
          edges: nextState.edges || []
        }
      );
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  }, [redoInternal, mapData, updateMapData]);

  // =========================================================================
  // History API for Data Handlers
  // =========================================================================
  
  /**
   * Check if we're currently applying history (undo/redo in progress)
   * Data handlers should skip adding to history when this returns true
   */
  const isApplyingHistory = dc.useCallback(() => {
    return isApplyingHistoryRef.current;
  }, []);

  /**
   * Add a state to history (wrapper that checks isApplyingHistory)
   * This is what data change handlers should call
   */
  const addToHistory = dc.useCallback((state) => {
    if (!isApplyingHistoryRef.current) {
      addToHistoryInternal(state);
    }
  }, [addToHistoryInternal]);

  // =========================================================================
  // Return Value
  // =========================================================================

  // Grouped layer actions
  const layerActions = {
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder
  };

  // Grouped history actions
  const historyActions = {
    handleUndo,
    handleRedo,
    addToHistory,
    isApplyingHistory
  };

  return {
    // Layer management
    layerActions,
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    
    // History state
    canUndo,
    canRedo,
    
    // History actions
    historyActions,
    handleUndo,
    handleRedo,
    
    // For data change handlers
    addToHistory,
    isApplyingHistory
  };
}

return { useLayerHistory };