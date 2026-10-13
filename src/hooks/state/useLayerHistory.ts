/**
 * useLayerHistory.ts
 *
 * Layer switching plus per-layer undo/redo (DATA-06 redesign).
 *
 * History entries are field diffs, not full snapshots: each entry records the
 * layer it was made on and the before/after values of ONLY the layer fields
 * and map-wide fields (name, regions, outlines, shapes, Beacons, routes) that
 * the edit changed. Undo/redo:
 * - write back only the entry's own fields, through a functional updater on
 *   the live map (never a render-time or dive-time copy);
 * - skip any field whose live value no longer matches what the entry left
 *   behind, so undo never clobbers an edit made since (e.g. a Beacon placed on
 *   another layer, or a fog reveal).
 *
 * Stacks are kept per layer (undo acts on the active layer's edits) and are
 * cleared whenever the open sub-hex level changes (levelKey or
 * navigationVersion): each level has its own data and history never crosses
 * levels.
 *
 * Fog operations enter history through recordMapChange (prev -> next diff);
 * fog brush strokes coalesce into one entry.
 */

// Type-only imports
import type { MapData, MapLayer, LayerId } from '#types/core/map.types';
import type {
  LayerHistorySnapshot,
  LayerHistoryEntry,
  LayerHistoryStacks,
  LayerHistoryLayerKey,
  LayerHistoryMapKey,
  LayerHistoryLayerValues,
  LayerHistoryMapValues,
  RecordMapChangeOptions,
  UseLayerHistoryOptions,
  LayerActions,
  HistoryActions,
  UseLayerHistoryResult,
} from '#types/hooks/layerHistory.types';
import type { FieldDiff } from '#types/hooks/history.types';

import { useCallback, useRef, useState } from 'preact/hooks';
import {
  createHistoryStack,
  diffHistoryFields,
  guardedPatch,
  mergeFieldDiffs,
  peekTopHistoryEntry,
  pushHistoryEntry,
  replaceTopHistoryEntry,
  stepHistoryRedo,
  stepHistoryUndo,
} from './useHistory';
import { getLayerById, updateLayer, addLayer, cloneLayer, removeLayer, reorderLayers, setActiveLayer } from '../../persistence/layerAccessor';


const LAYER_KEYS: readonly LayerHistoryLayerKey[] = [
  'cells', 'curves', 'objects', 'textLabels', 'edges', 'tiles', 'wallPaths', 'terrainStrokes', 'fogOfWar'
];
const MAP_KEYS: readonly LayerHistoryMapKey[] = [
  'name', 'regions', 'outlines', 'shapeOverlays', 'partyPins', 'savedRoutes'
];

/** Entries with the same coalesce key pushed within this window merge. */
const COALESCE_WINDOW_MS = 1000;

function emptyDiff<T>(): FieldDiff<T> {
  return { before: {}, after: {} };
}

function readLayerValues(layer: MapLayer): LayerHistoryLayerValues {
  return {
    cells: layer.cells,
    curves: layer.curves,
    objects: layer.objects,
    textLabels: layer.textLabels,
    edges: layer.edges,
    tiles: layer.tiles,
    wallPaths: layer.wallPaths,
    terrainStrokes: layer.terrainStrokes,
    fogOfWar: layer.fogOfWar
  };
}

function readMapValues(map: MapData): LayerHistoryMapValues {
  return {
    name: map.name ?? '',
    regions: map.regions,
    outlines: map.outlines,
    shapeOverlays: map.shapeOverlays,
    partyPins: map.partyPins,
    savedRoutes: map.savedRoutes
  };
}

function pickLayerValues(s: LayerHistorySnapshot): Partial<LayerHistoryLayerValues> {
  return {
    cells: s.cells, curves: s.curves, objects: s.objects, textLabels: s.textLabels, edges: s.edges,
    tiles: s.tiles, wallPaths: s.wallPaths, terrainStrokes: s.terrainStrokes, fogOfWar: s.fogOfWar
  };
}

function pickMapValues(s: LayerHistorySnapshot): Partial<LayerHistoryMapValues> {
  return {
    name: s.name, regions: s.regions, outlines: s.outlines, shapeOverlays: s.shapeOverlays,
    partyPins: s.partyPins, savedRoutes: s.savedRoutes
  };
}

/**
 * Write one entry's fields onto the live map. `undo` moves after -> before,
 * `redo` before -> after; a field is written only while its live value still
 * equals the value the entry expects (see guardedPatch). Pure.
 */
export function applyLayerHistoryEntry(prev: MapData, entry: LayerHistoryEntry, direction: 'undo' | 'redo'): MapData {
  const isUndo = direction === 'undo';
  let next = prev;

  const mapPatch = guardedPatch(
    readMapValues(prev),
    isUndo ? entry.map.after : entry.map.before,
    isUndo ? entry.map.before : entry.map.after
  );
  if (mapPatch != null) next = { ...next, ...mapPatch };

  const layer = getLayerById(prev, entry.layerId);
  if (layer != null) {
    const layerPatch = guardedPatch(
      readLayerValues(layer),
      isUndo ? entry.layer.after : entry.layer.before,
      isUndo ? entry.layer.before : entry.layer.after
    );
    if (layerPatch != null) next = updateLayer(next, entry.layerId, layerPatch);
  }
  return next;
}

/** Last known values for the open level: the last rendered map plus edits recorded since. */
interface KnownValues {
  source: MapData | null;
  activeLayerId: LayerId | null;
  map: Partial<LayerHistoryMapValues>;
  layers: Record<LayerId, Partial<LayerHistoryLayerValues>>;
}

/**
 * Hook for managing layer switching with per-layer diff history
 *
 * @param options - Configuration options
 * @returns Layer and history state/actions
 */
function useLayerHistory({
  mapData,
  updateMapData,
  isLoading,
  navigationVersion = 0,
  levelKey = null
}: UseLayerHistoryOptions): UseLayerHistoryResult {
  // Undo stacks per layer. Refs, because pushes happen inside other state
  // updaters; the version counter re-renders consumers of canUndo/canRedo.
  const stacksRef = useRef<LayerHistoryStacks>({});
  const [, setVersion] = useState(0);
  const bump = useCallback((): void => setVersion((v: number) => v + 1), []);

  // Track if we're applying history (to avoid adding to history during undo/redo)
  const isApplyingHistoryRef = useRef<boolean>(false);

  // History is per level and per load. Clear it while loading and whenever
  // the open level changes. levelKey (the sub-hex path) changes in the same
  // render as the level's map data, so a fallback to an ancestor level (trim)
  // clears history before any undo can run; navigationVersion is kept as a
  // second trigger for re-entering the same path.
  const levelRef = useRef<{ nav: number; key: string | null }>({ nav: navigationVersion, key: levelKey });
  if (isLoading || levelRef.current.nav !== navigationVersion || levelRef.current.key !== levelKey) {
    levelRef.current = { nav: navigationVersion, key: levelKey };
    stacksRef.current = {};
  }

  // Sync known values from the rendered map. Pushes diff against these, so
  // edits that bypass history (and land in a render) are never folded into
  // the next entry's "before".
  const knownRef = useRef<KnownValues>({ source: null, activeLayerId: null, map: {}, layers: {} });
  if (mapData != null && mapData !== knownRef.current.source) {
    const layers: Record<LayerId, Partial<LayerHistoryLayerValues>> = {};
    for (const layer of mapData.layers) layers[layer.id] = readLayerValues(layer);
    knownRef.current = { source: mapData, activeLayerId: mapData.activeLayerId, map: readMapValues(mapData), layers };
  }

  // =========================================================================
  // Recording
  // =========================================================================

  const recordEntry = useCallback(
    (
      layerId: LayerId,
      layerDiff: FieldDiff<LayerHistoryLayerValues> | null,
      mapDiff: FieldDiff<LayerHistoryMapValues> | null,
      coalesceKey?: string
    ): void => {
      if (layerDiff == null && mapDiff == null) return;
      const now = Date.now();
      const stack = stacksRef.current[layerId] ?? createHistoryStack<LayerHistoryEntry>();
      const entry: LayerHistoryEntry = {
        layerId,
        layer: layerDiff ?? emptyDiff<LayerHistoryLayerValues>(),
        map: mapDiff ?? emptyDiff<LayerHistoryMapValues>(),
        coalesceKey,
        time: now
      };

      const top = coalesceKey != null ? peekTopHistoryEntry(stack) : null;
      if (top != null && top.coalesceKey === coalesceKey && now - top.time <= COALESCE_WINDOW_MS) {
        stacksRef.current[layerId] = replaceTopHistoryEntry(stack, {
          ...entry,
          layer: mergeFieldDiffs(top.layer, entry.layer),
          map: mergeFieldDiffs(top.map, entry.map)
        });
      } else {
        stacksRef.current[layerId] = pushHistoryEntry(stack, entry);
      }

      const known = knownRef.current;
      if (layerDiff != null) known.layers[layerId] = { ...known.layers[layerId], ...layerDiff.after };
      if (mapDiff != null) known.map = { ...known.map, ...mapDiff.after };
      bump();
    },
    [bump]
  );

  /**
   * Add a post-edit snapshot to history (data change handlers). Diffed
   * against the last known values of the active layer and the map; only
   * changed fields are recorded.
   */
  const addToHistory = useCallback(
    (state: LayerHistorySnapshot): void => {
      if (isApplyingHistoryRef.current) return;
      const known = knownRef.current;
      const layerId = known.activeLayerId;
      if (layerId == null) return;
      const knownLayer = known.layers[layerId] as Partial<LayerHistoryLayerValues> | undefined;
      // A layer not yet rendered has no known baseline: record only map-wide fields.
      const layerDiff = knownLayer != null
        ? diffHistoryFields(LAYER_KEYS, knownLayer, pickLayerValues(state), true)
        : null;
      const mapDiff = diffHistoryFields(MAP_KEYS, known.map, pickMapValues(state), true);
      recordEntry(layerId, layerDiff, mapDiff);
    },
    [recordEntry]
  );

  /**
   * Record an exact prev -> next transition (fog operations): diffs the
   * active layer of `prev` and the map-wide fields.
   */
  const recordMapChange = useCallback(
    (prev: MapData, next: MapData, options?: RecordMapChangeOptions): void => {
      if (isApplyingHistoryRef.current || prev === next) return;
      const layerId = prev.activeLayerId;
      const prevLayer = getLayerById(prev, layerId);
      const nextLayer = getLayerById(next, layerId);
      const layerDiff = prevLayer != null && nextLayer != null
        ? diffHistoryFields(LAYER_KEYS, readLayerValues(prevLayer), readLayerValues(nextLayer), false)
        : null;
      const mapDiff = diffHistoryFields(MAP_KEYS, readMapValues(prev), readMapValues(next), false);
      recordEntry(layerId, layerDiff, mapDiff, options?.coalesceKey);
      knownRef.current.activeLayerId = next.activeLayerId;
    },
    [recordEntry]
  );

  // =========================================================================
  // Undo/Redo Handlers
  // =========================================================================

  const applyStep = useCallback(
    (direction: 'undo' | 'redo'): void => {
      const layerId = knownRef.current.activeLayerId;
      if (layerId == null) return;
      const stack = stacksRef.current[layerId] as LayerHistoryStacks[LayerId] | undefined;
      if (stack == null) return;
      const step = direction === 'undo' ? stepHistoryUndo(stack) : stepHistoryRedo(stack);
      if (step == null) return;
      stacksRef.current[layerId] = step.stack;
      bump();

      isApplyingHistoryRef.current = true;
      updateMapData((prev: MapData) => applyLayerHistoryEntry(prev, step.entry, direction));
      // Re-enable recording once the update has been dispatched.
      window.setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    },
    [updateMapData, bump]
  );

  const handleUndo = useCallback((): void => applyStep('undo'), [applyStep]);
  const handleRedo = useCallback((): void => applyStep('redo'), [applyStep]);

  /**
   * Check if we're currently applying history (undo/redo in progress)
   * Data handlers should skip adding to history when this returns true
   */
  const isApplyingHistory = useCallback((): boolean => {
    return isApplyingHistoryRef.current;
  }, []);

  // =========================================================================
  // Layer Management Handlers (functional updates on the live map)
  // =========================================================================

  // Stacks are keyed by layer id, so switching/adding/cloning needs no history work.
  const handleLayerSelect = useCallback(
    (layerId: LayerId): void => {
      updateMapData((prev: MapData) => prev.activeLayerId === layerId ? prev : setActiveLayer(prev, layerId));
    },
    [updateMapData]
  );

  const handleLayerAdd = useCallback((): void => {
    updateMapData((prev: MapData) => addLayer(prev));
  }, [updateMapData]);

  const handleLayerClone = useCallback(
    (layerId: LayerId, mode: 'all' | 'mapOnly'): void => {
      updateMapData((prev: MapData) => cloneLayer(prev, layerId, mode));
    },
    [updateMapData]
  );

  const handleLayerDelete = useCallback(
    (layerId: LayerId): void => {
      updateMapData((prev: MapData) => {
        // removeLayer handles preventing deletion of last layer
        const next = removeLayer(prev, layerId);
        if (next !== prev) delete stacksRef.current[layerId];
        return next;
      });
    },
    [updateMapData]
  );

  const handleLayerReorder = useCallback(
    (layerId: LayerId, newIndex: number): void => {
      updateMapData((prev: MapData) => reorderLayers(prev, layerId, newIndex));
    },
    [updateMapData]
  );

  const handleToggleShowLayerBelow = useCallback(
    (layerId: LayerId): void => {
      updateMapData((prev: MapData) => {
        const layer = getLayerById(prev, layerId);
        if (!layer) return prev;
        return updateLayer(prev, layerId, { showLayerBelow: layer.showLayerBelow !== true });
      });
    },
    [updateMapData]
  );

  const handleSetLayerBelowOpacity = useCallback(
    (layerId: LayerId, opacity: number): void => {
      // Clamp opacity to valid range
      const clampedOpacity = Math.max(0.1, Math.min(0.5, opacity));
      updateMapData((prev: MapData) => updateLayer(prev, layerId, { layerBelowOpacity: clampedOpacity }));
    },
    [updateMapData]
  );

  const handleUpdateLayerDisplay = useCallback(
    (layerId: LayerId, newName: string, icon: string | null): void => {
      // A null icon removes it
      const updates: Partial<MapLayer> = { name: newName, icon: icon ?? undefined };
      updateMapData((prev: MapData) => updateLayer(prev, layerId, updates));
    },
    [updateMapData]
  );

  // =========================================================================
  // Return Value
  // =========================================================================

  const activeStack = mapData != null
    ? stacksRef.current[mapData.activeLayerId] as LayerHistoryStacks[LayerId] | undefined
    : undefined;
  const canUndo = activeStack != null && activeStack.index > 0;
  const canRedo = activeStack != null && activeStack.index < activeStack.entries.length;

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
    recordMapChange,
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
    recordMapChange,
    isApplyingHistory
  };
}

export { useLayerHistory };
