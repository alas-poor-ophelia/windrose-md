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
import type {
  LayerHistorySnapshot,
  LayerHistoryCache,
  UseLayerHistoryOptions,
  LayerActions,
  HistoryActions,
  UseLayerHistoryResult,
} from '#types/hooks/layerHistory.types';

import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useHistory } from './useHistory';
import { getActiveLayer, getLayerById, updateActiveLayer, updateLayer, addLayer, cloneLayer, removeLayer, reorderLayers, setActiveLayer } from '../../persistence/layerAccessor';


/**
 * Hook for managing layer switching with per-layer history
 *
 * @param options - Configuration options
 * @returns Layer and history state/actions
 */
function useLayerHistory({
  mapData,
  updateMapData,
  isLoading,
  navigationVersion = 0
}: UseLayerHistoryOptions): UseLayerHistoryResult {
  // =========================================================================
  // Core History Hook
  // =========================================================================

  const initialSnapshot: LayerHistorySnapshot = {
    cells: [],
    curves: [],
    name: "",
    tiles: [],
    wallPaths: [],
    objects: [],
    textLabels: [],
    edges: [],
    regions: [],
    outlines: []
  };

  const {
    currentState: _historyState,
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
  const isApplyingHistoryRef = useRef<boolean>(false);

  // Track if history has been initialized for the current session
  const historyInitialized = useRef<boolean>(false);

  // Cache history state per layer (keyed by layer ID)
  const layerHistoryCache = useRef<LayerHistoryCache>({});

  // =========================================================================
  // History Initialization Effect
  // =========================================================================

  // Initialize history when map data loads (only once)
  useEffect(() => {
    if (mapData && !isLoading && !historyInitialized.current) {
      const activeLayer = getActiveLayer(mapData);
      resetHistory({
        cells: activeLayer.cells,
        curves: activeLayer.curves,
        name: mapData.name ?? '',
        objects: activeLayer.objects,
        textLabels: activeLayer.textLabels,
        edges: activeLayer.edges,
        tiles: activeLayer.tiles,
        wallPaths: activeLayer.wallPaths,
        regions: mapData.regions ?? [],
        outlines: mapData.outlines ?? [],
        shapeOverlays: mapData.shapeOverlays ?? [],
        fogOfWar: activeLayer.fogOfWar
      });
      historyInitialized.current = true;
    }
  }, [mapData, isLoading, resetHistory]);

  // Reset history when sub-hex navigation changes level
  useEffect(() => {
    if (navigationVersion > 0) {
      layerHistoryCache.current = {};
      historyInitialized.current = false;
    }
  }, [navigationVersion]);

  // =========================================================================
  // Layer State Helpers
  // =========================================================================

  /**
   * Build a history state snapshot from layer data
   */
  const buildHistoryState = useCallback(
    (layer: MapLayer, name: string, regions: import('#types/core/map.types').Region[] = [], outlines: import('#types/core/map.types').Outline[] = [], shapeOverlays: import('#types/core/map.types').ShapeOverlay[] = [], fogOfWar: import('#types/core/map.types').FogOfWar | null = null): LayerHistorySnapshot => ({
      cells: layer.cells,
      curves: layer.curves,
      name: name,
      objects: layer.objects,
      textLabels: layer.textLabels,
      edges: layer.edges,
      tiles: layer.tiles,
      wallPaths: layer.wallPaths,
      shapeOverlays: shapeOverlays,
      fogOfWar: fogOfWar ?? layer.fogOfWar,
      regions: regions,
      outlines: outlines
    }),
    []
  );

  /**
   * Save current layer's history to cache
   */
  const saveCurrentLayerHistory = useCallback((): void => {
    if (!mapData) return;
    const currentLayerId = mapData.activeLayerId;
    layerHistoryCache.current[currentLayerId] = getHistoryState();
  }, [mapData, getHistoryState]);

  /**
   * Restore or initialize history for a layer
   */
  const restoreOrInitLayerHistory = useCallback(
    (newMapData: MapData, layerId: LayerId): void => {
      const cachedHistory = layerHistoryCache.current[layerId];
      if (cachedHistory != null) {
        restoreHistoryState(cachedHistory);
      } else {
        // No cached history for this layer - initialize fresh
        const layer = getActiveLayer(newMapData);
        historyInitialized.current = false;
        resetHistory(buildHistoryState(layer, newMapData.name ?? '', newMapData.regions ?? [], newMapData.outlines ?? [], newMapData.shapeOverlays ?? [], layer.fogOfWar));
        historyInitialized.current = true;
      }
    },
    [restoreHistoryState, resetHistory, buildHistoryState]
  );

  // =========================================================================
  // Layer Management Handlers
  // =========================================================================

  const handleLayerSelect = useCallback(
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
  const handleLayerAdd = useCallback((): void => {
    if (!mapData) return;

    // Save current layer's history before switching
    saveCurrentLayerHistory();

    const newMapData = addLayer(mapData);
    updateMapData(newMapData);

    // New layer always starts with fresh history
    const newActiveLayer = getActiveLayer(newMapData);
    historyInitialized.current = false;
    resetHistory(buildHistoryState(newActiveLayer, newMapData.name ?? '', newMapData.regions ?? [], newMapData.outlines ?? []));
    historyInitialized.current = true;
  }, [mapData, updateMapData, saveCurrentLayerHistory, resetHistory, buildHistoryState]);

  const handleLayerClone = useCallback(
    (layerId: LayerId, mode: 'all' | 'mapOnly'): void => {
      if (!mapData) return;

      saveCurrentLayerHistory();

      const newMapData = cloneLayer(mapData, layerId, mode);
      if (newMapData === mapData) return;

      updateMapData(newMapData);

      const clonedLayer = getActiveLayer(newMapData);
      historyInitialized.current = false;
      resetHistory(buildHistoryState(clonedLayer, newMapData.name ?? '', newMapData.regions ?? [], newMapData.outlines ?? []));
      historyInitialized.current = true;
    },
    [mapData, updateMapData, saveCurrentLayerHistory, resetHistory, buildHistoryState]
  );

  const handleLayerDelete = useCallback(
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
  const handleLayerReorder = useCallback(
    (layerId: LayerId, newIndex: number): void => {
      if (!mapData) return;

      const newMapData = reorderLayers(mapData, layerId, newIndex);
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // Toggle show layer below for a specific layer
  const handleToggleShowLayerBelow = useCallback(
    (layerId: LayerId): void => {
      if (!mapData) return;

      const layer = getLayerById(mapData, layerId);
      if (!layer) return;

      const newMapData = updateLayer(mapData, layerId, {
        showLayerBelow: layer.showLayerBelow !== true
      });
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // Set layer below opacity for a specific layer
  const handleSetLayerBelowOpacity = useCallback(
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

  const handleUpdateLayerDisplay = useCallback(
    (layerId: LayerId, newName: string, icon: string | null): void => {
      if (!mapData) return;

      const updates: Partial<MapLayer> = { name: newName };
      if (icon !== null) {
        updates.icon = icon;
      } else {
        // If icon is null, we need to remove it - use undefined
        updates.icon = undefined;
      }

      const newMapData = updateLayer(mapData, layerId, updates);
      updateMapData(newMapData);
    },
    [mapData, updateMapData]
  );

  // =========================================================================
  // Undo/Redo Handlers
  // =========================================================================

  const handleUndo = useCallback((): void => {
    const previousState = undoInternal();
    if (previousState && mapData) {
      isApplyingHistoryRef.current = true;
      // Apply layer-specific data to active layer, name/regions/outlines at root
      const newMapData = updateActiveLayer(
        { ...mapData, name: previousState.name, regions: previousState.regions ?? mapData.regions, outlines: previousState.outlines ?? mapData.outlines, shapeOverlays: previousState.shapeOverlays ?? mapData.shapeOverlays },
        {
          cells: previousState.cells,
          curves: previousState.curves,
          objects: previousState.objects,
          textLabels: previousState.textLabels,
          edges: previousState.edges,
          tiles: previousState.tiles,
          wallPaths: previousState.wallPaths,
          fogOfWar: previousState.fogOfWar !== undefined ? previousState.fogOfWar : undefined
        }
      );
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  }, [undoInternal, mapData, updateMapData]);

  const handleRedo = useCallback((): void => {
    const nextState = redoInternal();
    if (nextState && mapData) {
      isApplyingHistoryRef.current = true;
      // Apply layer-specific data to active layer, name/regions/outlines at root
      const newMapData = updateActiveLayer(
        { ...mapData, name: nextState.name, regions: nextState.regions ?? mapData.regions, outlines: nextState.outlines ?? mapData.outlines, shapeOverlays: nextState.shapeOverlays ?? mapData.shapeOverlays },
        {
          cells: nextState.cells,
          curves: nextState.curves,
          objects: nextState.objects,
          textLabels: nextState.textLabels,
          edges: nextState.edges,
          tiles: nextState.tiles,
          wallPaths: nextState.wallPaths,
          fogOfWar: nextState.fogOfWar !== undefined ? nextState.fogOfWar : undefined
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
  const isApplyingHistory = useCallback((): boolean => {
    return isApplyingHistoryRef.current;
  }, []);

  /**
   * Add a state to history (wrapper that checks isApplyingHistory)
   * This is what data change handlers should call
   */
  const addToHistory = useCallback(
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
    handleSetLayerBelowOpacity,
    handleUpdateLayerDisplay,
    handleLayerClone
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
    handleUpdateLayerDisplay,
    handleLayerClone,
    canUndo,
    canRedo,
    historyActions,
    handleUndo,
    handleRedo,
    addToHistory,
    isApplyingHistory
  };
}

export { useLayerHistory };