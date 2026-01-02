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
import type { MapData, MapLayer, FogOfWar, FogState } from '#types/core/map.types';
import type { IGeometry, GridBounds } from '#types/core/geometry.types';
import type {
  FogToolId,
  CurrentFogState,
  UseFogOfWarOptions,
  FogStateValues,
  FogActions,
  UseFogOfWarResult,
} from '#types/hooks/fog.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const {
  getActiveLayer,
  updateActiveLayer,
  initializeFogOfWar,
  fogAll,
  fogPaintedCells,
  revealAll,
  toggleFogVisibility,
  getFogState
} = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  updateActiveLayer: (mapData: MapData, updates: Partial<MapLayer>) => MapData;
  initializeFogOfWar: (mapData: MapData, layerId: string) => MapData;
  fogAll: (layer: MapLayer, bounds: GridBounds) => MapLayer;
  fogPaintedCells: (layer: MapLayer, geometry: IGeometry) => MapLayer;
  revealAll: (layer: MapLayer) => MapLayer;
  toggleFogVisibility: (layer: MapLayer) => MapLayer;
  getFogState: (layer: MapLayer) => FogState;
};

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
  const [showFogTools, setShowFogTools] = dc.useState<boolean>(false);
  const [fogActiveTool, setFogActiveTool] = dc.useState<FogToolId | null>(null);

  // =========================================================================
  // Computed State
  // =========================================================================

  // Get current fog state for UI (combines layer data + UI state)
  const currentFogState = dc.useMemo((): CurrentFogState => {
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

  const handleFogToolsToggle = dc.useCallback((): void => {
    setShowFogTools((prev: boolean) => !prev);
    // Clear active tool when closing panel
    if (showFogTools) {
      setFogActiveTool(null);
    }
  }, [showFogTools]);

  const handleFogToolSelect = dc.useCallback((tool: FogToolId): void => {
    setFogActiveTool((prev: FogToolId | null) => prev === tool ? null : tool);
  }, []);

  const handleFogVisibilityToggle = dc.useCallback((): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;

    const updatedLayer = toggleFogVisibility(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);

  // Fill all cells with fog
  // For bounded maps (hex): fogs all cells within bounds
  // For unbounded maps (grid): fogs only painted cells
  const handleFogFillAll = dc.useCallback((): void => {
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

  const handleFogClearAll = dc.useCallback((): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);
    if (!activeLayer.fogOfWar) return;

    const updatedLayer = revealAll(activeLayer);
    updateMapData(updateActiveLayer(mapData, { fogOfWar: updatedLayer.fogOfWar }));
  }, [mapData, updateMapData]);

  // Handle fog changes from FogOfWarLayer (for paint/erase/rectangle operations)
  const handleFogChange = dc.useCallback((updatedFogOfWar: FogOfWar): void => {
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

return { useFogOfWar };
