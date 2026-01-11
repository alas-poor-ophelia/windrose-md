/**
 * useLayerHistory.ts
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

// Type-only imports
import type { MapData, MapLayer, LayerId } from '#types/core/map.types';
import type { HistoryState, UseHistoryResult } from '#types/hooks/history.types';
import type {
  LayerHistorySnapshot,
  LayerHistoryCache,
  UseLayerHistoryOptions,
  LayerActions,
  HistoryActions,
  UseLayerHistoryResult,
} from '#types/hooks/layerHistory.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { useHistory } = await requireModuleByName("useHistory.ts") as {
  useHistory: <T>(initialState: T) => UseHistoryResult<T>
};

const {
  getActiveLayer,
  getLayerById,
  updateActiveLayer,
  updateLayer,
  addLayer,
  removeLayer,
  reorderLayers,
  setActiveLayer
} = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  getLayerById: (mapData: MapData, layerId: LayerId) => MapLayer | null;
  updateActiveLayer: (mapData: MapData, updates: Partial<MapLayer>) => MapData;
  updateLayer: (mapData: MapData, layerId: LayerId, updates: Partial<MapLayer>) => MapData;
  addLayer: (mapData: MapData) => MapData;
  removeLayer: (mapData: MapData, layerId: LayerId) => MapData;
  reorderLayers: (mapData: MapData, layerId: LayerId, newIndex: number) => MapData;
  setActiveLayer: (mapData: MapData, layerId: LayerId) => MapData;
};

/**
 * Hook for managing layer switching with per-layer history
 *
 * @param options - Configuration options
 * @returns Layer and history state/actions
 */
function useLayerHistory({
  mapData,
  updateMapData,
  isLoading
}: UseLayerHistoryOptions): UseLayerHistoryResult {
  // =========================================================================
  // Core History Hook
  // =========================================================================

  const initialSnapshot: LayerHistorySnapshot = {
    cells: [],
    name: "",
    objects: [],
    textLabels: [],
    edges: []
  };

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
  } = useHistory<LayerHistorySnapshot>(initialSnapshot);

  // =========================================================================
  // Refs for History Management
  // =========================================================================

  // Track if we're applying history (to avoid adding to history during undo/redo)
  const isApplyingHistoryRef = dc.useRef<boolean>(false);

  // Track if history has been initialized for the current session
  const historyInitialized = dc.useRef<boolean>(false);

  // Cache history state per layer (keyed by layer ID)
  const layerHistoryCache = dc.useRef<LayerHistoryCache>({});

  // =========================================================================
  // History Initialization Effect
  // =========================================================================

  // Initialize history when map data loads (only once)
  dc.useEffect(() => {
    if (mapData && !isLoading && !historyInitialized.current) {
      const activeLayer = getActiveLayer(mapData);
      resetHistory({
        cells: activeLayer.cells,
        name: mapData.name || '',
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
  const buildHistoryState = dc.useCallback(
    (layer: MapLayer, name: string): LayerHistorySnapshot => ({
      cells: layer.cells || [],
      name: name,
      objects: layer.objects || [],
      textLabels: layer.textLabels || [],
      edges: layer.edges || []
    }),
    []
  );

  /**
   * Save current layer's history to cache
   */
  const saveCurrentLayerHistory = dc.useCallback((): void => {
    if (!mapData) return;
    const currentLayerId = mapData.activeLayerId;
    layerHistoryCache.current[currentLayerId] = getHistoryState();
  }, [mapData, getHistoryState]);

  /**
   * Restore or initialize history for a layer
   */
  const restoreOrInitLayerHistory = dc.useCallback(
    (newMapData: MapData, layerId: LayerId): void => {
      const cachedHistory = layerHistoryCache.current[layerId];
      if (cachedHistory) {
        restoreHistoryState(cachedHistory);
      } else {
        // No cached history for this layer - initialize fresh
        const layer = getActiveLayer(newMapData);
        historyInitialized.current = false;
        resetHistory(buildHistoryState(layer, newMapData.name || ''));
        historyInitialized.current = true;
      }
    },
    [restoreHistoryState, resetHistory, buildHistoryState]
  );

  // =========================================================================
  // Layer Management Handlers
  // =========================================================================

  const handleLayerSelect = dc.useCallback(
    (layerId: LayerId): void => {
      if (!mapData || mapData.activeLayerId === layerId) return;

      // Save current layer's history before switching
      saveCurrentLayerHistory();

      const newMapData = setActiveLayer(mapData, layerId);
      updateMapData(newMapData);

      // Restore new layer's history or initialize if none cached
      restoreOrInitLayerHistory(newMapData, layerId);
    },
    [mapData, updateMapData, saveCurrentLayerHistory, restoreOrInitLayerHistory]
  );

  // Add a new layer
  const handleLayerAdd = dc.useCallback((): void => {
    if (!mapData) return;

    // Save current layer's history before switching
    saveCurrentLayerHistory();

    const newMapData = addLayer(mapData);
    updateMapData(newMapData);

    // New layer always starts with fresh history
    const newActiveLayer = getActiveLayer(newMapData);
    historyInitialized.current = false;
    resetHistory(buildHistoryState(newActiveLayer, newMapData.name || ''));
    historyInitialized.current = true;
  }, [mapData, updateMapData, saveCurrentLayerHistory, resetHistory, buildHistoryState]);

  const handleLayerDelete = dc.useCallback(
    (layerId: LayerId): void => {
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
    },
    [mapData, updateMapData, restoreOrInitLayerHistory]
  );

  // Reorder layers (no history interaction needed)
  const handleLayerReorder = dc.useCallback(
    (layerId: LayerId, newIndex: number): void => {
      if (!mapData) return;

      const newMapData = reorderLayers(mapData, layerId, newIndex);
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // Toggle show layer below for a specific layer
  const handleToggleShowLayerBelow = dc.useCallback(
    (layerId: LayerId): void => {
      if (!mapData) return;

      const layer = getLayerById(mapData, layerId);
      if (!layer) return;

      const newMapData = updateLayer(mapData, layerId, {
        showLayerBelow: !layer.showLayerBelow
      });
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // Set layer below opacity for a specific layer
  const handleSetLayerBelowOpacity = dc.useCallback(
    (layerId: LayerId, opacity: number): void => {
      if (!mapData) return;

      // Clamp opacity to valid range
      const clampedOpacity = Math.max(0.1, Math.min(0.5, opacity));

      const newMapData = updateLayer(mapData, layerId, {
        layerBelowOpacity: clampedOpacity
      });
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // =========================================================================
  // Undo/Redo Handlers
  // =========================================================================

  const handleUndo = dc.useCallback((): void => {
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

  const handleRedo = dc.useCallback((): void => {
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
  const isApplyingHistory = dc.useCallback((): boolean => {
    return isApplyingHistoryRef.current;
  }, []);

  /**
   * Add a state to history (wrapper that checks isApplyingHistory)
   * This is what data change handlers should call
   */
  const addToHistory = dc.useCallback(
    (state: LayerHistorySnapshot): void => {
      if (!isApplyingHistoryRef.current) {
        addToHistoryInternal(state);
      }
    },
    [addToHistoryInternal]
  );

  // =========================================================================
  // Return Value
  // =========================================================================

  const layerActions: LayerActions = {
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    handleToggleShowLayerBelow,
    handleSetLayerBelowOpacity
  };

  const historyActions: HistoryActions = {
    handleUndo,
    handleRedo,
    addToHistory,
    isApplyingHistory
  };

  return {
    layerActions,
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    handleToggleShowLayerBelow,
    handleSetLayerBelowOpacity,
    canUndo,
    canRedo,
    historyActions,
    handleUndo,
    handleRedo,
    addToHistory,
    isApplyingHistory
  };
}

return { useLayerHistory };
