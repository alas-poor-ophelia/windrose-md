/**
 * useDataHandlers.js
 * 
 * Manages data change handlers for DungeonMapTracker.
 * Provides handlers for updating layer data (cells, objects, textLabels, edges)
 * and map-level data (name, custom colors).
 * 
 * All layer data handlers use functional updaters for consistency and to avoid
 * stale closure issues. History tracking is integrated into each handler.
 * 
 * Handlers provided:
 * - handleNameChange: Update map name
 * - handleCellsChange: Update painted cells
 * - handleObjectsChange: Update placed objects
 * - handleTextLabelsChange: Update text labels
 * - handleEdgesChange: Update painted edges
 * - handleAddCustomColor: Add a custom color to the palette
 * - handleDeleteCustomColor: Remove a custom color from the palette
 * - handleViewStateChange: Update zoom/pan state (no history)
 * - handleSidebarCollapseChange: Update sidebar collapsed state (no history)
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getActiveLayer, updateActiveLayer } = await requireModuleByName("layerAccessor.js");

/**
 * Hook for managing data change handlers
 * 
 * @param {Object} options - Configuration options
 * @param {Object} options.mapData - Current map data (used for non-functional-updater cases)
 * @param {Function} options.updateMapData - Function to update map data (supports functional updaters)
 * @param {Function} options.addToHistory - Function to add state to history
 * @param {Function} options.isApplyingHistory - Function to check if undo/redo is in progress
 * @returns {Object} Data change handlers
 */
function useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory }) {
  
  // =========================================================================
  // Helper: Build history state from layer + name
  // =========================================================================
  
  const buildHistoryState = dc.useCallback((layer, name, overrides = {}) => ({
    cells: overrides.cells ?? layer.cells ?? [],
    name: name,
    objects: overrides.objects ?? layer.objects ?? [],
    textLabels: overrides.textLabels ?? layer.textLabels ?? [],
    edges: overrides.edges ?? layer.edges ?? []
  }), []);

  // =========================================================================
  // Factory: Create layer data change handler
  // =========================================================================
  
  /**
   * Creates a handler for updating a specific layer data field.
   * All handlers use functional updaters for consistency.
   * 
   * @param {string} field - The field to update ('cells', 'objects', 'textLabels', 'edges')
   * @returns {Function} Handler function (newValue, suppressHistory?) => void
   */
  const createLayerDataHandler = dc.useCallback((field) => {
    return (newValue, suppressHistory = false) => {
      if (isApplyingHistory()) return;

      updateMapData(currentMapData => {
        if (!currentMapData) return currentMapData;
        
        const newMapData = updateActiveLayer(currentMapData, { [field]: newValue });
        
        if (!suppressHistory) {
          const activeLayer = getActiveLayer(currentMapData);
          addToHistory(buildHistoryState(activeLayer, currentMapData.name, { [field]: newValue }));
        }
        
        return newMapData;
      });
    };
  }, [updateMapData, addToHistory, isApplyingHistory, buildHistoryState]);

  // =========================================================================
  // Layer Data Handlers (using factory)
  // =========================================================================
  
  const handleCellsChange = dc.useMemo(
    () => createLayerDataHandler('cells'),
    [createLayerDataHandler]
  );
  
  const handleObjectsChange = dc.useMemo(
    () => createLayerDataHandler('objects'),
    [createLayerDataHandler]
  );
  
  const handleTextLabelsChange = dc.useMemo(
    () => createLayerDataHandler('textLabels'),
    [createLayerDataHandler]
  );
  
  const handleEdgesChange = dc.useMemo(
    () => createLayerDataHandler('edges'),
    [createLayerDataHandler]
  );

  // =========================================================================
  // Map-Level Data Handlers
  // =========================================================================
  
  // Handle map name change (updates root-level name, not layer data)
  const handleNameChange = dc.useCallback((newName) => {
    if (isApplyingHistory()) return;

    updateMapData(currentMapData => {
      if (!currentMapData) return currentMapData;
      
      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildHistoryState(activeLayer, newName));
      
      return { ...currentMapData, name: newName };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildHistoryState]);

  // Handle adding a custom color
  const handleAddCustomColor = dc.useCallback((newColor) => {
    updateMapData(currentMapData => {
      if (!currentMapData) return currentMapData;
      
      const customColorId = `custom-${Date.now()}`;
      const customColorNumber = (currentMapData.customColors?.length || 0) + 1;
      const customColorLabel = `Custom ${customColorNumber}`;

      const newCustomColor = {
        id: customColorId,
        color: newColor,
        label: customColorLabel
      };

      return {
        ...currentMapData,
        customColors: [...(currentMapData.customColors || []), newCustomColor]
      };
    });
  }, [updateMapData]);

  // Handle deleting a custom color
  const handleDeleteCustomColor = dc.useCallback((colorId) => {
    updateMapData(currentMapData => {
      if (!currentMapData) return currentMapData;
      
      return {
        ...currentMapData,
        customColors: (currentMapData.customColors || []).filter(c => c.id !== colorId)
      };
    });
  }, [updateMapData]);

  // Handle view state change (zoom/pan) - NOT tracked in history
  const handleViewStateChange = dc.useCallback((newViewState) => {
    updateMapData(currentMapData => {
      if (!currentMapData) return currentMapData;
      return { ...currentMapData, viewState: newViewState };
    });
  }, [updateMapData]);

  // Handle sidebar collapse state change - NOT tracked in history
  const handleSidebarCollapseChange = dc.useCallback((collapsed) => {
    updateMapData(currentMapData => {
      if (!currentMapData) return currentMapData;
      return { ...currentMapData, sidebarCollapsed: collapsed };
    });
  }, [updateMapData]);

  // =========================================================================
  // Return Value
  // =========================================================================

  // Grouped by category
  const layerDataHandlers = {
    handleCellsChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange
  };

  const mapDataHandlers = {
    handleNameChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleViewStateChange,
    handleSidebarCollapseChange
  };

  return {
    // Grouped access
    layerDataHandlers,
    mapDataHandlers,
    
    // Direct access
    handleNameChange,
    handleCellsChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleViewStateChange,
    handleSidebarCollapseChange
  };
}

return { useDataHandlers };