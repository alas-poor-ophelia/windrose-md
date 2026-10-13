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
import type { MapData, MapLayer, LadderConfig, StoredViewState, TextLabelSettings, Region,Outline, ShapeOverlay, FogOfWar, PartyPin, SavedRoute, MeasurementRoute, MapTravelSettings } from '#types/core/map.types';
import type { CustomColor } from '#types/core/common.types';
import type { Cell } from '#types/core/cell.types';
import type { Curve } from '#types/core/curve.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexColor } from '#types/core/common.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';
import type {
  UseDataHandlersOptions,
  UseDataHandlersResult,
  LayerDataHandlers,
  MapDataHandlers,
} from '#types/hooks/dataHandlers.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';

import { useCallback, useMemo, useRef } from 'preact/hooks';
import { getActiveLayer, updateActiveLayer, promoteToStrata, getActiveBoardLayers, setActiveLayer, authoredCells } from '../../persistence/layerAccessor';
import { snapshotLevelsOf, lodStampForCommit, type ParkedLodStamp } from './layerHistoryOps';
import { writeDepthCells, withLod, type DepthWriteContext, type DepthWriteResult } from '../../persistence/depthAuthoring';

/** Does any element in the written value sit on a ladder rung >= 1? */
function hasDeepElement(value: unknown): boolean {
  return Array.isArray(value) && value.some((item: unknown) =>
    typeof item === 'object' && item !== null && ((item as { homeLevel?: number }).homeLevel ?? 0) > 0);
}

/** The map with `lod` stamped when `value` carries a deep element; same reference otherwise. */
function stampLodForDeepElements(mapData: MapData, value: unknown): MapData {
  return mapData.lod === undefined && hasDeepElement(value) ? withLod(mapData) : mapData;
}


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
    fogOfWar: FogOfWar | null = null,
    partyPins: PartyPin[] = [],
    savedRoutes: SavedRoute[] = []
  ): LayerHistorySnapshot => ({
    cells: overrides.cells ?? layer.cells ?? [],
    curves: overrides.curves ?? layer.curves ?? [],
    name: name,
    objects: overrides.objects ?? layer.objects ?? [],
    textLabels: overrides.textLabels ?? layer.textLabels ?? [],
    edges: overrides.edges ?? layer.edges ?? [],
    tiles: overrides.tiles ?? layer.tiles ?? [],
    wallPaths: overrides.wallPaths ?? layer.wallPaths ?? [],
    terrainStrokes: overrides.terrainStrokes ?? layer.terrainStrokes ?? [],
    regions: overrides.regions ?? regions,
    outlines: overrides.outlines ?? outlines,
    shapeOverlays: overrides.shapeOverlays ?? shapeOverlays,
    fogOfWar: overrides.fogOfWar ?? fogOfWar,
    partyPins: overrides.partyPins ?? partyPins,
    savedRoutes: overrides.savedRoutes ?? savedRoutes,
    // Ladder rungs by reference, only when present (an override that names
    // `levels` wins, including one that removes them); `level` is UI-only.
    ...snapshotLevelsOf('levels' in overrides ? overrides : layer),
    ...(overrides.level !== undefined ? { level: overrides.level } : {}),
    ...(overrides.lodStamped !== undefined ? { lodStamped: overrides.lodStamped } : {})
  }), []);

  // =========================================================================
  // Factory: Create layer data change handler
  // =========================================================================

  type LayerField = 'cells' | 'curves' | 'objects' | 'textLabels' | 'edges' | 'tiles' | 'wallPaths' | 'terrainStrokes';

  // A batched stroke writes with suppressHistory until pointerup. If one of
  // those ticks stamped `lod` (first deep element), the stamp must still land on
  // the entry that finally records the stroke, or undo would restore the
  // elements but leave the map a ladder map. Parked here until that commit,
  // keyed by the channel that parked it (a layer field, or `level:N` for a
  // rung): only a commit on the SAME channel claims it. Any other commit drops
  // it, so a cancelled stroke (Escape, tool switch, pointercancel) can never
  // hand its stamp to an unrelated later edit (layerHistoryOps.lodStampForCommit).
  // undoLodStamp also refuses to lift a stamp while depth content remains.
  const pendingLodStampRef = useRef<ParkedLodStamp>(null);
  const lodStampForHistory = useCallback((before: MapData, after: MapData, suppressHistory: boolean, channel: string): { lodStamped?: LadderConfig } => {
    const { parked, stamp } = lodStampForCommit(pendingLodStampRef.current, before, after, suppressHistory, channel);
    pendingLodStampRef.current = parked;
    return stamp;
  }, []);

  const createLayerDataHandler = useCallback(<T,>(field: LayerField) => {
    return (newValue: T, suppressHistory = false): void => {
      if (isApplyingHistory()) return;

      updateMapData((currentMapData) => {
        if (currentMapData == null) return currentMapData;

        // An element homed on a rung >= 1 is laid out on the ladder's lattice:
        // the first such write stamps `lod` exactly as the first deep cell
        // write does (and the history entry records it, so undo lifts it).
        const newMapData = stampLodForDeepElements(updateActiveLayer(currentMapData, { [field]: newValue }), newValue);
        const lodStamp = lodStampForHistory(currentMapData, newMapData, suppressHistory, field);

        if (!suppressHistory) {
          const activeLayer = getActiveLayer(currentMapData);
          addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', { [field]: newValue, ...lodStamp }, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));
        }

        return newMapData;
      });
    };
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot, lodStampForHistory]);

  // =========================================================================
  // Ladder rung handler (level >= 1)
  // =========================================================================

  // The level-aware sibling of createLayerDataHandler: `update` maps the active
  // layer's CURRENT rung to its next content inside the functional updater, and
  // the write goes through writeDepthCells (the only sanctioned deep writer; it
  // refuses over budget and stamps `lod` on the first deep write). A refusal
  // leaves the map untouched and records nothing. The history snapshot is taken
  // from the WRITTEN layer so it carries the whole new `levels` record, plus the
  // UI-only `level` (design section 19 item 10: undo restores the record).
  const handleLevelCellsChange = useCallback(
    (level: number, update: (current: Cell[]) => Cell[], suppressHistory = false, context?: DepthWriteContext): DepthWriteResult | null => {
      if (isApplyingHistory()) return null;

      // Preact applies a functional update synchronously inside the setter, so
      // the guard's verdict against the LIVE map can be handed back to the
      // caller. Callers must report this, never a pre-check against their own
      // (possibly stale) snapshot (review finding, phase 3c).
      let outcome: DepthWriteResult | null = null;
      updateMapData((currentMapData) => {
        if (currentMapData == null) return currentMapData;

        const layer = getActiveLayer(currentMapData);
        const result = writeDepthCells(currentMapData, layer.id, level, update(authoredCells(layer, level)), context);
        outcome = result;
        if (!result.ok) return currentMapData;

        // The first deep write also stamps `lod`; its entry remembers that, so
        // undo takes the stamp back out with the cells (review finding kgc.15).
        // A batched stroke stamps on a suppressed tick and records on an
        // identity commit, so the stamp is parked under this rung's channel.
        const lodStamp = lodStampForHistory(currentMapData, result.mapData, suppressHistory, `level:${level}`);
        if (!suppressHistory) {
          const written = getActiveLayer(result.mapData);
          addToHistory(buildLayerHistorySnapshot(written, result.mapData.name ?? '', { ...snapshotLevelsOf(written), level, ...lodStamp }, result.mapData.regions ?? [], result.mapData.outlines ?? [], result.mapData.shapeOverlays ?? [], written.fogOfWar, result.mapData.partyPins ?? [], result.mapData.savedRoutes ?? []));
        }

        return result.mapData;
      });
      return outcome;
    },
    [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot, lodStampForHistory]
  );

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

  // Tiles get a dedicated handler (not the generic factory): the first time a
  // Simple map ever gains a tile it is promoted to Strata mode, so tile maps
  // surface the Board→Strata→Layer hierarchy by default. promoteToStrata is the
  // same idempotent operation the Simple/Strata toggle runs.
  const handleTilesChange = useCallback(
    (newValue: TileAssignment[], suppressHistory = false): void => {
      if (isApplyingHistory()) return;

      updateMapData((currentMapData) => {
        if (currentMapData == null) return currentMapData;

        const activeLayer = getActiveLayer(currentMapData);
        let nextMapData = stampLodForDeepElements(updateActiveLayer(currentMapData, { tiles: newValue }), newValue);
        const lodStamp = lodStampForHistory(currentMapData, nextMapData, suppressHistory, 'tiles');
        if (!suppressHistory) {
          addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', { tiles: newValue, ...lodStamp }, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));
        }

        // 0→first-tile transition (anywhere on the map) promotes Simple → Strata, once.
        const mapHadTiles = currentMapData.layers.some(l => (l.tiles?.length ?? 0) > 0);
        if (currentMapData.layerMode !== 'strata' && !mapHadTiles && newValue.length > 0) {
          nextMapData = promoteToStrata(nextMapData);
          // Land on the stratum the user was painting into: promotion keeps the
          // ground layer active, but the just-placed tile's depth says which
          // band was armed — without this the NEXT stroke writes to the wrong
          // stratum (depth band and active layer are coupled selectors).
          const placedDepth = newValue[newValue.length - 1]?.depth ?? 'ground';
          const target = getActiveBoardLayers(nextMapData).find(l => l.tileRole === placedDepth);
          if (target != null && target.id !== nextMapData.activeLayerId) {
            nextMapData = setActiveLayer(nextMapData, target.id);
          }
        }

        return nextMapData;
      });
    },
    [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot, lodStampForHistory]
  );

  const handleWallPathsChange = useMemo(
    () => createLayerDataHandler<WallPath[]>('wallPaths'),
    [createLayerDataHandler]
  );

  const handleTerrainStrokesChange = useMemo(
    () => createLayerDataHandler<TerrainStroke[]>('terrainStrokes'),
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
      addToHistory(buildLayerHistorySnapshot(activeLayer, newName, {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));

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

  // Handle view state change - NOT tracked in history. Cosmetic: a pan/zoom
  // write refused as stale (map open in another pane) is dropped silently
  // instead of blocking the pane behind the conflict panel.
  const handleViewStateChange = useCallback((newViewState: StoredViewState): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, viewState: newViewState };
    }, { cosmetic: true });
  }, [updateMapData]);

  // Handle sidebar collapse state change - NOT tracked in history (cosmetic,
  // same rationale as handleViewStateChange)
  const handleSidebarCollapseChange = useCallback((collapsed: boolean): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, sidebarCollapsed: collapsed };
    }, { cosmetic: true });
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
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, regions, currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));

      return { ...currentMapData, regions };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle outlines change (hex maps only) - tracked in history for undo/redo
  const handleOutlinesChange = useCallback((outlines: Outline[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], outlines, currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));

      return { ...currentMapData, outlines };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle shape overlays change - tracked in history for undo/redo
  const handleShapeOverlaysChange = useCallback((shapeOverlays: ShapeOverlay[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], shapeOverlays, activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []));

      return { ...currentMapData, shapeOverlays };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle party pins change - tracked in history; suppressHistory skips the
  // snapshot during live drag so the whole drag undoes as one step
  const handlePartyPinsChange = useCallback((partyPins: PartyPin[], suppressHistory = false): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      if (!suppressHistory) {
        const activeLayer = getActiveLayer(currentMapData);
        addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, partyPins, currentMapData.savedRoutes ?? []));
      }

      return { ...currentMapData, partyPins };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle the in-progress measurement route change - NOT tracked in history.
  // This is measure-tool working state that persists with the map so a
  // measurement survives closing and reopening the view.
  const handleMeasurementRouteChange = useCallback((measurementRoute: MeasurementRoute): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, measurementRoute };
    });
  }, [updateMapData]);

  // Handle per-map travel display selection - NOT tracked in history
  const handleTravelSettingsChange = useCallback((travelSettings: MapTravelSettings): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, travelSettings };
    });
  }, [updateMapData]);

  // Handle saved routes change - tracked in history so save-as-route,
  // edits, and deletions all undo/redo like other map elements
  const handleSavedRoutesChange = useCallback((savedRoutes: SavedRoute[]): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], savedRoutes));

      return { ...currentMapData, savedRoutes };
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
    handleTilesChange,
    handleWallPathsChange,
    handleTerrainStrokesChange
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
    handleShapeOverlaysChange,
    handlePartyPinsChange,
    handleMeasurementRouteChange,
    handleSavedRoutesChange,
    handleTravelSettingsChange
  };

  return {
    // Grouped access
    layerDataHandlers,
    mapDataHandlers,

    // Direct access
    handleNameChange,
    handleCellsChange,
    handleLevelCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange,
    handleWallPathsChange,
    handleTerrainStrokesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange,
    handleShapeOverlaysChange,
    handlePartyPinsChange,
    handleMeasurementRouteChange,
    handleSavedRoutesChange,
    handleTravelSettingsChange
  };
}

export { useDataHandlers };