/**
 * useFogOfWar.ts
 *
 * Manages Fog of War UI state and high-level operations for DungeonMapTracker.
 * This is distinct from useFogTools.ts which handles canvas-level interactions.
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

// Type-only imports
import type { MapLayer, FogOfWar } from '#types/core/map.types';
import type {
  FogToolId,
  CurrentFogState,
  UseFogOfWarOptions,
  FogStateValues,
  FogActions,
  UseFogOfWarResult,
} from '#types/hooks/fog.types';

import { useCallback, useMemo, useState } from 'preact/hooks';
import { getActiveLayer, updateActiveLayer, initializeFogOfWar, fogAll, fogPaintedCells, revealAll, toggleFogVisibility, getFogState } from '../../persistence/layerAccessor';


/**
 * Hook for managing Fog of War UI state and high-level operations
 *
 * @param options - Configuration options
 * @returns Fog state and actions
 */
function useFogOfWar({
  mapData,
  geometry,
  updateMapData
}: UseFogOfWarOptions): UseFogOfWarResult {
  const [showFogTools, setShowFogTools] = useState<boolean>(false);
  const [fogActiveTool, setFogActiveTool] = useState<FogToolId | null>(null);

  // =========================================================================
  // Computed State
  // =========================================================================

  // Get current fog state for UI (combines layer data + UI state)
  const currentFogState = useMemo((): CurrentFogState => {
    if (!mapData) {
      return { initialized: false, enabled: false, activeTool: null };
    }
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

  const handleFogToolsToggle = useCallback((): void => {
    setShowFogTools((prev: boolean) => !prev);
    // Clear active tool when closing panel
    if (showFogTools) {
      setFogActiveTool(null);
    }
  }, [showFogTools]);

  const handleFogToolSelect = useCallback((tool: FogToolId): void => {
    setFogActiveTool((prev: FogToolId | null) => prev === tool ? null : tool);
  }, []);

  const handleFogVisibilityToggle = useCallback((): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;

    const updatedLayer = toggleFogVisibility(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);

  // Fill all cells with fog
  // For bounded maps (hex): fogs all cells within bounds
  // For unbounded maps (grid): fogs only painted cells
  const handleFogFillAll = useCallback((): void => {
    if (!mapData || !geometry) return;

    let workingMapData = mapData;
    let activeLayer = getActiveLayer(workingMapData);

    // Initialize FoW if needed
    if (!activeLayer.fogOfWar) {
      workingMapData = initializeFogOfWar(workingMapData, workingMapData.activeLayerId);
      activeLayer = getActiveLayer(workingMapData);
    }

    // Use geometry to determine fog strategy
    let updatedLayer: MapLayer;
    if (geometry.isBounded()) {
      // Bounded maps: fog all cells within bounds
      const bounds = geometry.getBounds();
      if (!bounds) return;
      updatedLayer = fogAll(activeLayer, bounds);
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
        ...updatedLayer.fogOfWar!,
        enabled: true
      }
    }));
  }, [mapData, geometry, updateMapData]);

  const handleFogClearAll = useCallback((): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;

    const updatedLayer = revealAll(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);

  // Handle fog changes from FogOfWarLayer (for paint/erase/rectangle operations)
  const handleFogChange = useCallback((updatedFogOfWar: FogOfWar): void => {
    if (!mapData) return;
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedFogOfWar }));
  }, [mapData, updateMapData]);

  // =========================================================================
  // Return Value
  // =========================================================================

  const fogState: FogStateValues = {
    showFogTools,
    fogActiveTool,
    currentFogState
  };

  const fogActions: FogActions = {
    handleFogToolsToggle,
    handleFogToolSelect,
    handleFogVisibilityToggle,
    handleFogFillAll,
    handleFogClearAll,
    handleFogChange
  };

  return {
    fogState,
    fogActions,
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

export { useFogOfWar };