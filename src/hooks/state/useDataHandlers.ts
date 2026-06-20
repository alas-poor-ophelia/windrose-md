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
import type { MapLayer, StoredViewState, TextLabelSettings, Region, Outline, ShapeOverlay, FogOfWar } from '#types/core/map.types';
import type { CustomColor } from '#types/core/common.types';
import type { Cell } from '#types/core/cell.types';
import type { Curve } from '#types/core/curve.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type {
  UseDataHandlersOptions,
  UseDataHandlersResult,
  LayerDataHandlers,
  MapDataHandlers,
} from '#types/hooks/dataHandlers.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';

import { useCallback, useMemo } from 'preact/hooks';
import { getActiveLayer, updateActiveLayer } from '../../persistence/layerAccessor';


/**
 * Hook for managing data change handlers
 */
function useDataHandlers({
  mapData: _mapData,
  updateMapData,
  addToHistory,
  isApplyingHistory
}: UseDataHandlersOptions): UseDataHandlersResult {

  // =========================================================================
  // Helper: Build history state from layer + name
  // =========================================================================

  const buildLayerHistorySnapshot = useCallback((
    layer: MapLayer,
    name: string,
    overrides: Partial<LayerHistorySnapshot> = {},
    regions: Region[] = [],
    outlines: Outline[] = [],
    shapeOverlays: ShapeOverlay[] = [],
    fogOfWar: FogOfWar | null = null
  ): LayerHistorySnapshot => ({
    cells: overrides.cells ?? layer.cells ?? [],
    curves: overrides.curves ?? layer.curves ?? [],
    name: name,
    objects: overrides.objects ?? layer.objects ?? [],
    textLabels: overrides.textLabels ?? layer.textLabels ?? [],
    edges: overrides.edges ?? layer.edges ?? [],
    tiles: overrides.tiles ?? layer.tiles ?? [],
    regions: overrides.regions ?? regions,
    outlines: overrides.outlines ?? outlines,
    shapeOverlays: overrides.shapeOverlays ?? shapeOverlays,
    fogOfWar: overrides.fogOfWar ?? fogOfWar
  }), []);

  // =========================================================================
  // Factory: Create layer data change handler
  // =========================================================================

  type LayerField = 'cells' | 'curves' | 'objects' | 'textLabels' | 'edges' | 'tiles';

  const createLayerDataHandler = useCallback(<T,>(field: LayerField) => {
    return (newValue: T, suppressHistory = false): void => {
      if (isApplyingHistory()) return;

      updateMapData((currentMapData) => {
        if (currentMapData == null) return currentMapData;

        const newMapData = updateActiveLayer(currentMapData, { [field]: newValue });

        if (!suppressHistory) {
          const activeLayer = getActiveLayer(currentMapData);
          addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', { [field]: newValue } as Partial<LayerHistorySnapshot>, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar));
        }

        return newMapData;
      });
    };
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // =========================================================================
  // Layer Data Handlers (using factory)
  // =========================================================================

  const handleCellsChange = useMemo(
    () => createLayerDataHandler<Cell[]>('cells'),
    [createLayerDataHandler]
  );

  const handleCurvesChange = useMemo(
    () => createLayerDataHandler<Curve[]>('curves'),
    [createLayerDataHandler]
  );

  const handleObjectsChange = useMemo(
    () => createLayerDataHandler<MapObject[]>('objects'),
    [createLayerDataHandler]
  );

  const handleTextLabelsChange = useMemo(
    () => createLayerDataHandler<TextLabel[]>('textLabels'),
    [createLayerDataHandler]
  );

  const handleEdgesChange = useMemo(
    () => createLayerDataHandler<unknown[]>('edges'),
    [createLayerDataHandler]
  );

  const handleTilesChange = useMemo(
    () => createLayerDataHandler<TileAssignment[]>('tiles'),
    [createLayerDataHandler]
  );

  // =========================================================================
  // Map-Level Data Handlers
  // =========================================================================

  // Handle map name change
  const handleNameChange = useCallback((newName: string): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, newName, {}, currentMapData.regions ?? []));

      return { ...currentMapData, name: newName };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle adding a custom color
  const handleAddCustomColor = useCallback((newColor: HexColor): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const customColorId = `custom-${Date.now()}`;
      const customColorNumber = (currentMapData.customColors?.length ?? 0) + 1;
      const customColorLabel = `Custom ${customColorNumber}`;

      const newCustomColor: CustomColor = {
        id: customColorId,
        color: newColor,
        label: customColorLabel
      };

      return {
        ...currentMapData,
        customColors: [...(currentMapData.customColors ?? []), newCustomColor]
      };
    });
  }, [updateMapData]);

  // Handle deleting a custom color
  const handleDeleteCustomColor = useCallback((colorId: string): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      return {
        ...currentMapData,
        customColors: (currentMapData.customColors ?? []).filter(c => c.id !== colorId)
      };
    });
  }, [updateMapData]);

  // Handle updating a color's opacity
  const handleUpdateColorOpacity = useCallback((colorId: string, newOpacity: number): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const isCustomColor = (currentMapData.customColors ?? []).some(c => c.id === colorId);

      if (isCustomColor) {
        return {
          ...currentMapData,
          customColors: (currentMapData.customColors ?? []).map(c =>
            c.id === colorId ? { ...c, opacity: newOpacity } : c
          )
        };
      } else {
        return {
          ...currentMapData,
          paletteColorOpacityOverrides: {
            ...(currentMapData.paletteColorOpacityOverrides ?? {}),
            [colorId]: newOpacity
          }
        };
      }
    });
  }, [updateMapData]);

  // Handle view state change - NOT tracked in history
  const handleViewStateChange = useCallback((newViewState: StoredViewState): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, viewState: newViewState };
    });
  }, [updateMapData]);

  // Handle sidebar collapse state change - NOT tracked in history
  const handleSidebarCollapseChange = useCallback((collapsed: boolean): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, sidebarCollapsed: collapsed };
    });
  }, [updateMapData]);

  // Handle object set change - NOT tracked in history
  const handleObjectSetChange = useCallback((setId: string | null): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, objectSetId: setId };
    });
  }, [updateMapData]);

  // Handle text label settings change - NOT tracked in history
  const handleTextLabelSettingsChange = useCallback((settings: TextLabelSettings): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, lastTextLabelSettings: settings };
    });
  }, [updateMapData]);

  // Handle regions change (hex maps only) - tracked in history for undo/redo
  const handleRegionsChange = useCallback((regions: Region[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, regions));

      return { ...currentMapData, regions };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle outlines change (hex maps only) - tracked in history for undo/redo
  const handleOutlinesChange = useCallback((outlines: Outline[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], outlines));

      return { ...currentMapData, outlines };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle shape overlays change - tracked in history for undo/redo
  const handleShapeOverlaysChange = useCallback((shapeOverlays: ShapeOverlay[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], shapeOverlays));

      return { ...currentMapData, shapeOverlays };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // =========================================================================
  // Return Value
  // =========================================================================

  const layerDataHandlers: LayerDataHandlers = {
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange
  };

  const mapDataHandlers: MapDataHandlers = {
    handleNameChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange,
    handleShapeOverlaysChange
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
    handleTilesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange,
    handleShapeOverlaysChange
  };
}

export { useDataHandlers };