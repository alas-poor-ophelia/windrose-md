/**
 * useDataHandlers.ts
 *
 * Manages data change handlers for DungeonMapTracker.
 * Provides handlers for updating layer data (cells, objects, textLabels, edges)
 * and map-level data (name, custom colors).
 *
 * All layer data handlers use functional updaters for consistency and to avoid
 * stale closure issues. History tracking is integrated into each handler.
 */

// Type-only imports
import type { MapData, MapLayer, ViewState, TextLabelSettings } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { Curve } from '#types/core/curve.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type {
  UseDataHandlersOptions,
  UseDataHandlersResult,
  HistoryState,
  CustomColor,
  LayerDataHandlers,
  MapDataHandlers,
} from '#types/hooks/dataHandlers.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { getActiveLayer, updateActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
  updateActiveLayer: (mapData: MapData, updates: Partial<MapLayer>) => MapData;
};

/**
 * Hook for managing data change handlers
 */
function useDataHandlers({
  mapData,
  updateMapData,
  addToHistory,
  isApplyingHistory
}: UseDataHandlersOptions): UseDataHandlersResult {

  // =========================================================================
  // Helper: Build history state from layer + name
  // =========================================================================

  const buildHistoryState = dc.useCallback((
    layer: MapLayer,
    name: string,
    overrides: Partial<HistoryState> = {}
  ): HistoryState => ({
    cells: overrides.cells ?? layer.cells ?? [],
    curves: overrides.curves ?? layer.curves ?? [],
    name: name,
    objects: overrides.objects ?? layer.objects ?? [],
    textLabels: overrides.textLabels ?? layer.textLabels ?? [],
    edges: overrides.edges ?? layer.edges ?? []
  }), []);

  // =========================================================================
  // Factory: Create layer data change handler
  // =========================================================================

  type LayerField = 'cells' | 'curves' | 'objects' | 'textLabels' | 'edges';

  const createLayerDataHandler = dc.useCallback(<T,>(field: LayerField) => {
    return (newValue: T, suppressHistory = false): void => {
      if (isApplyingHistory()) return;

      updateMapData((currentMapData: MapData | null) => {
        if (!currentMapData) return currentMapData;

        const newMapData = updateActiveLayer(currentMapData, { [field]: newValue });

        if (!suppressHistory) {
          const activeLayer = getActiveLayer(currentMapData);
          addToHistory(buildHistoryState(activeLayer, currentMapData.name, { [field]: newValue as unknown as Cell[] | MapObject[] | TextLabel[] | unknown[] }));
        }

        return newMapData;
      });
    };
  }, [updateMapData, addToHistory, isApplyingHistory, buildHistoryState]);

  // =========================================================================
  // Layer Data Handlers (using factory)
  // =========================================================================

  const handleCellsChange = dc.useMemo(
    () => createLayerDataHandler<Cell[]>('cells'),
    [createLayerDataHandler]
  );

  const handleCurvesChange = dc.useMemo(
    () => createLayerDataHandler<Curve[]>('curves'),
    [createLayerDataHandler]
  );

  const handleObjectsChange = dc.useMemo(
    () => createLayerDataHandler<MapObject[]>('objects'),
    [createLayerDataHandler]
  );

  const handleTextLabelsChange = dc.useMemo(
    () => createLayerDataHandler<TextLabel[]>('textLabels'),
    [createLayerDataHandler]
  );

  const handleEdgesChange = dc.useMemo(
    () => createLayerDataHandler<unknown[]>('edges'),
    [createLayerDataHandler]
  );

  // =========================================================================
  // Map-Level Data Handlers
  // =========================================================================

  // Handle map name change
  const handleNameChange = dc.useCallback((newName: string): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildHistoryState(activeLayer, newName));

      return { ...currentMapData, name: newName };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildHistoryState]);

  // Handle adding a custom color
  const handleAddCustomColor = dc.useCallback((newColor: HexColor): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;

      const customColorId = `custom-${Date.now()}`;
      const customColorNumber = (currentMapData.customColors?.length || 0) + 1;
      const customColorLabel = `Custom ${customColorNumber}`;

      const newCustomColor: CustomColor = {
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
  const handleDeleteCustomColor = dc.useCallback((colorId: string): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;

      return {
        ...currentMapData,
        customColors: (currentMapData.customColors || []).filter(c => c.id !== colorId)
      };
    });
  }, [updateMapData]);

  // Handle updating a color's opacity
  const handleUpdateColorOpacity = dc.useCallback((colorId: string, newOpacity: number): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;

      const isCustomColor = (currentMapData.customColors || []).some(c => c.id === colorId);

      if (isCustomColor) {
        return {
          ...currentMapData,
          customColors: currentMapData.customColors!.map(c =>
            c.id === colorId ? { ...c, opacity: newOpacity } : c
          )
        };
      } else {
        return {
          ...currentMapData,
          paletteColorOpacityOverrides: {
            ...(currentMapData.paletteColorOpacityOverrides || {}),
            [colorId]: newOpacity
          }
        };
      }
    });
  }, [updateMapData]);

  // Handle view state change - NOT tracked in history
  const handleViewStateChange = dc.useCallback((newViewState: ViewState): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;
      return { ...currentMapData, viewState: newViewState };
    });
  }, [updateMapData]);

  // Handle sidebar collapse state change - NOT tracked in history
  const handleSidebarCollapseChange = dc.useCallback((collapsed: boolean): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;
      return { ...currentMapData, sidebarCollapsed: collapsed };
    });
  }, [updateMapData]);

  // Handle text label settings change - NOT tracked in history
  const handleTextLabelSettingsChange = dc.useCallback((settings: TextLabelSettings): void => {
    updateMapData((currentMapData: MapData | null) => {
      if (!currentMapData) return currentMapData;
      return { ...currentMapData, lastTextLabelSettings: settings };
    });
  }, [updateMapData]);

  // =========================================================================
  // Return Value
  // =========================================================================

  const layerDataHandlers: LayerDataHandlers = {
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange
  };

  const mapDataHandlers: MapDataHandlers = {
    handleNameChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleTextLabelSettingsChange
  };

  return {
    // Grouped access
    layerDataHandlers,
    mapDataHandlers,

    // Direct access
    handleNameChange,
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleTextLabelSettingsChange
  };
}

return { useDataHandlers };
