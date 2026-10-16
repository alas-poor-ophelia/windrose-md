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
import { homeLevelOf } from '../../core/homeLevel';
import { writeDepthCells, guardDepthWrite, elementBytes, withLod, depthBudgetBytesOf, type DepthWriteContext, type DepthWriteRefusal, type DepthWriteResult } from '../../persistence/depthAuthoring';

/** Rung (>= 1) an element is homed on; 0 for root or a malformed value. */
function elementHome(item: unknown): number {
  return homeLevelOf(item);
}

/**
 * Identity of an element on its rung. An element with an id keys by it, so a
 * move, rotation or edit keeps its key. Tiles carry no id and are rebuilt on
 * every edit, so they key structurally by tileset, tile, cell and (freeform)
 * world position: a rotation, flip or rescale keeps the key, a move changes it
 * (and is paired with the removal of the old key below, so it adds nothing).
 */
function elementKey(item: object, home: number): string {
  const el = item as { id?: unknown; tilesetId?: unknown; tileId?: unknown; col?: unknown; row?: unknown; worldX?: unknown; worldY?: unknown };
  if (typeof el.id === 'string') return `id:${el.id}@${home}`;
  return `tile:${String(el.tilesetId)}|${String(el.tileId)}|${String(el.col)},${String(el.row)}|${String(el.worldX)},${String(el.worldY)}@${home}`;
}

/** Elements one write adds to and removes from a rung (multiset by `elementKey`). */
interface RungDelta { added: unknown[]; removed: unknown[] }

/**
 * Per rung >= 1, the elements of `next` that `prev` did not hold and the
 * elements of `prev` that `next` no longer holds, compared by `elementKey` as
 * multisets (two stacked identical tiles count twice). Empty for every classic
 * write and for a write that only edits existing deep elements in place.
 */
function deepElementDelta(prev: unknown, next: unknown): Map<number, RungDelta> {
  const delta = new Map<number, RungDelta>();
  if (!Array.isArray(next)) return delta;
  const nextItems = next as unknown[];
  const pending = new Map<string, unknown[]>();
  for (const old of (Array.isArray(prev) ? prev : []) as unknown[]) {
    const home = elementHome(old);
    if (home === 0) continue;
    const key = elementKey(old as object, home);
    const list = pending.get(key);
    if (list === undefined) pending.set(key, [old]);
    else list.push(old);
  }
  const rung = (home: number): RungDelta => {
    let d = delta.get(home);
    if (d === undefined) { d = { added: [], removed: [] }; delta.set(home, d); }
    return d;
  };
  for (const item of nextItems) {
    const home = elementHome(item);
    if (home === 0) continue;
    const list = pending.get(elementKey(item as object, home));
    if (list !== undefined && list.length > 0) { list.pop(); continue; }
    rung(home).added.push(item);
  }
  for (const list of pending.values()) {
    for (const old of list) rung(elementHome(old)).removed.push(old);
  }
  return delta;
}

/**
 * Apply an element write through the depth gate (DATA-03). A rung GROWS when
 * the write adds more elements to it than it removes (a placement, a duplicate,
 * a re-home onto it); a move, rotation or rescale of an existing deep element
 * pairs one removal with one addition and is not a growth, so it is never
 * refused (flag off or near the budget alike) and never stamps. Every growing
 * rung must pass `guardDepthWrite` against the LIVE map, budgeted on the NET
 * bytes the rung gains. The map is measured at most once per write: the
 * caller's gesture measurement (`context.serialisedBytes`) when given, else
 * once here, and only when some rung grows. A refusal returns the reason and
 * the caller leaves the map alone. The first growth stamps `lod` exactly as the
 * first deep cell write does; the gate has already refused a quarantined map,
 * so a stamp never re-activates one (PX-02).
 */
function applyElementWrite(
  current: MapData,
  prevValue: unknown,
  newValue: unknown,
  write: (mapData: MapData) => MapData,
  context: DepthWriteContext = {}
): { refusal: DepthWriteRefusal } | { refusal: null; mapData: MapData } {
  const delta = deepElementDelta(prevValue, newValue);
  const growing = [...delta].filter(([, d]) => d.added.length > d.removed.length);
  if (growing.length === 0) return { refusal: null, mapData: write(current) };
  const layer = getActiveLayer(current);
  const serialisedBytes = context.serialisedBytes ?? depthBudgetBytesOf(current);
  let grownBytes = 0;
  for (const [home, d] of growing) {
    grownBytes += Math.max(0, elementBytes(d.added) - elementBytes(d.removed));
    const refusal = guardDepthWrite(current, layer.id, home, authoredCells(layer, home), { serialisedBytes, addedBytes: grownBytes, nested: context.nested });
    if (refusal !== null) return { refusal };
  }
  return { refusal: null, mapData: withLod(write(current)) };
}


/**
 * Hook for managing data change handlers
 */
function useDataHandlers({
  mapData: _mapData,
  updateMapData,
  addToHistory,
  isApplyingHistory,
  levelKey = null
}: UseDataHandlersOptions): UseDataHandlersResult {

  // A sub-hex child map (any level below the root; the same signal
  // useLayerHistory keys its stacks by) never takes depth authoring (D-1):
  // every deep write made while one is open is refused 'nested-level'. A ref,
  // so the handlers stay stable across navigation.
  const nestedRef = useRef(levelKey !== null);
  nestedRef.current = levelKey !== null;

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
    // Ladder rungs by reference, only when the layer has them (an override
    // that names `levels` wins); `level` is UI-only. A snapshot with no
    // `levels` key is not "unknown" for history: when it comes from a rung
    // write (`level` set) or the layer's last recorded value still had rungs,
    // useLayerHistory records it as the frozen EMPTY_LEVELS sentinel, i.e.
    // "all rungs removed". Erasing the last rung to empty (setLevelCells strips
    // `levels`) is therefore its own undoable entry, and undo/redo strip the
    // key rather than writing the sentinel or `levels: undefined`.
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
    return (newValue: T, suppressHistory = false, context?: DepthWriteContext): DepthWriteRefusal | null => {
      if (isApplyingHistory()) return null;

      // Like handleLevelCellsChange: Preact runs the functional update
      // synchronously, so the gate's verdict against the LIVE map is handed
      // back to the caller (the MCP bridge reports it).
      let refusal: DepthWriteRefusal | null = null;
      updateMapData((currentMapData) => {
        // Each run decides afresh: an updater run twice must not report the
        // first run's verdict.
        refusal = null;
        if (currentMapData == null) return currentMapData;

        // An element homed on a rung >= 1 is laid out on the ladder's lattice:
        // adding one passes the depth gate, and the first such write stamps
        // `lod` (the history entry records it, so undo lifts it). A refusal
        // leaves the map untouched and records nothing.
        const activeLayer = getActiveLayer(currentMapData);
        const applied = applyElementWrite(currentMapData, activeLayer[field], newValue, (m) => updateActiveLayer(m, { [field]: newValue }), { ...context, nested: context?.nested === true || nestedRef.current });
        if (applied.refusal !== null) {
          refusal = applied.refusal;
          return currentMapData;
        }
        const newMapData = applied.mapData;
        const lodStamp = lodStampForHistory(currentMapData, newMapData, suppressHistory, field);

        // A suppressed (live drag) write records nothing but pins the pre-drag
        // value, so the commit at drop undoes the whole drag in one step.
        addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', { [field]: newValue, ...lodStamp }, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []), { transient: suppressHistory });

        return newMapData;
      });
      return refusal;
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
        outcome = null;
        if (currentMapData == null) return currentMapData;

        const layer = getActiveLayer(currentMapData);
        const result = writeDepthCells(currentMapData, layer.id, level, update(authoredCells(layer, level)), { ...context, nested: context?.nested === true || nestedRef.current });
        outcome = result;
        if (!result.ok) return currentMapData;

        // The first deep write also stamps `lod`; its entry remembers that, so
        // undo takes the stamp back out with the cells (review finding kgc.15).
        // A batched stroke stamps on a suppressed tick and records on an
        // identity commit, so the stamp is parked under this rung's channel.
        const lodStamp = lodStampForHistory(currentMapData, result.mapData, suppressHistory, `level:${level}`);
        // A suppressed stroke tick pins the pre-stroke rungs; the commit at
        // pointerup records the whole deep stroke as one undo step.
        const written = getActiveLayer(result.mapData);
        addToHistory(buildLayerHistorySnapshot(written, result.mapData.name ?? '', { ...snapshotLevelsOf(written), level, ...lodStamp }, result.mapData.regions ?? [], result.mapData.outlines ?? [], result.mapData.shapeOverlays ?? [], written.fogOfWar, result.mapData.partyPins ?? [], result.mapData.savedRoutes ?? []), { transient: suppressHistory });

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
    (newValue: TileAssignment[], suppressHistory = false, context?: DepthWriteContext): DepthWriteRefusal | null => {
      if (isApplyingHistory()) return null;

      let refusal: DepthWriteRefusal | null = null;
      updateMapData((currentMapData) => {
        refusal = null;
        if (currentMapData == null) return currentMapData;

        // Deep tiles pass the same gate as deep objects (createLayerDataHandler).
        const activeLayer = getActiveLayer(currentMapData);
        const applied = applyElementWrite(currentMapData, activeLayer.tiles, newValue, (m) => updateActiveLayer(m, { tiles: newValue }), { ...context, nested: context?.nested === true || nestedRef.current });
        if (applied.refusal !== null) {
          refusal = applied.refusal;
          return currentMapData;
        }
        let nextMapData = applied.mapData;
        const lodStamp = lodStampForHistory(currentMapData, nextMapData, suppressHistory, 'tiles');
        // Suppressed (live drag) writes pin the pre-drag value; see the cells handler.
        addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', { tiles: newValue, ...lodStamp }, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []), { transient: suppressHistory });

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
      return refusal;
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

  // Handle object set change - NOT tracked in history
  // Cosmetic (DATA-18): a preference, so a stale refusal stays silent
  // instead of arming the conflict panel. Still saved normally.
  const handleObjectSetChange = useCallback((setId: string | null): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, objectSetId: setId };
    }, { cosmetic: true });
  }, [updateMapData]);

  // Handle text label settings change - NOT tracked in history
  // Cosmetic (DATA-18): a preference, so a stale refusal stays silent
  // instead of arming the conflict panel. Still saved normally.
  const handleTextLabelSettingsChange = useCallback((settings: TextLabelSettings): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, lastTextLabelSettings: settings };
    }, { cosmetic: true });
  }, [updateMapData]);

  // Handle regions change (hex maps only) - tracked in history for undo/redo
  // suppressHistory: a live region-label drag move; it pins the pre-drag value
  // and the drop commit records the whole drag as one step.
  const handleRegionsChange = useCallback((regions: Region[], suppressHistory = false): void => {
    if (isApplyingHistory()) return;

    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;

      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, regions, currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, currentMapData.partyPins ?? [], currentMapData.savedRoutes ?? []), { transient: suppressHistory });

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

      // A suppressed (live drag) write pins the pre-drag pins instead of
      // recording; the drop commit then records the whole move as one step.
      const activeLayer = getActiveLayer(currentMapData);
      addToHistory(buildLayerHistorySnapshot(activeLayer, currentMapData.name ?? '', {}, currentMapData.regions ?? [], currentMapData.outlines ?? [], currentMapData.shapeOverlays ?? [], activeLayer.fogOfWar, partyPins, currentMapData.savedRoutes ?? []), { transient: suppressHistory });

      return { ...currentMapData, partyPins };
    });
  }, [updateMapData, addToHistory, isApplyingHistory, buildLayerHistorySnapshot]);

  // Handle the in-progress measurement route change - NOT tracked in history.
  // Cosmetic (DATA-18): a preference, so a stale refusal stays silent
  // instead of arming the conflict panel. Still saved normally.
  // This is measure-tool working state that persists with the map so a
  // measurement survives closing and reopening the view.
  const handleMeasurementRouteChange = useCallback((measurementRoute: MeasurementRoute): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, measurementRoute };
    }, { cosmetic: true });
  }, [updateMapData]);

  // Handle per-map travel display selection - NOT tracked in history
  // Cosmetic (DATA-18): a preference, so a stale refusal stays silent
  // instead of arming the conflict panel. Still saved normally.
  const handleTravelSettingsChange = useCallback((travelSettings: MapTravelSettings): void => {
    updateMapData((currentMapData) => {
      if (currentMapData == null) return currentMapData;
      return { ...currentMapData, travelSettings };
    }, { cosmetic: true });
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