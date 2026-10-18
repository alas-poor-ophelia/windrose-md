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
 * Stacks are kept per layer (undo acts on the active layer's edits) and per
 * level: history never crosses levels. The root level's stacks are set aside
 * while a sub-hex is open and come back on return; a sub-hex level's stacks
 * are cleared when it is left (levelKey or navigationVersion change).
 *
 * An undo/redo step whose entry no longer applies to the live map (every
 * field changed since by a write outside history) is dropped and the next
 * entry is tried, inside the same functional update, so a keypress never
 * spends an entry on a silent no-op (parallax wave-7 finding 2). handleUndo
 * and handleRedo report whether the map changed.
 *
 * Live drags write with suppressHistory and commit once at drop. Each live
 * write calls addToHistory(snapshot, { transient: true }), which records
 * nothing but pins the fields it changes at their pre-drag values; the drop
 * commit diffs against those pins, not against the last render (which already
 * shows the dragged position), so the whole drag is one undoable step.
 *
 * Fog operations enter history through recordMapChange (prev -> next diff);
 * fog brush strokes coalesce into one entry, never across a layer switch.
 *
 * Ladder rungs (design 06 s5): a layer's `levels` record is one diffed layer
 * field, restored whole (or stripped when the entry had none). A layer with no
 * rungs reads as the `EMPTY_LEVELS` sentinel, so erasing the last rung to
 * empty is a recorded change like any other (MERGE-01). An entry also
 * carries the rung it edited (`level`, camera only) and the `lod` block its
 * first deep write stamped (`lodStamped`): undo lifts the stamp unless depth
 * content remains, redo puts it back, and both bring the camera to the rung.
 */

// Type-only imports
import type { MapData, MapLayer, LayerId } from '#types/core/map.types';
import type {
  AddToHistoryOptions,
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
  dropHistoryStep,
  guardedPatch,
  mergeFieldDiffs,
  peekTopHistoryEntry,
  pushHistoryEntry,
  replaceTopHistoryEntry,
  stepHistoryRedo,
  stepHistoryUndo,
} from './useHistory';
import { getLayerById, updateLayer, addLayer, cloneLayer, removeLayer, reorderLayers, setActiveLayer } from '../../persistence/layerAccessor';
import { EMPTY_LEVELS, applySnapshotLevels, viewStateForRung, undoLodStamp, redoLodStamp } from './layerHistoryOps';


const LAYER_KEYS: readonly LayerHistoryLayerKey[] = [
  'cells', 'curves', 'objects', 'textLabels', 'edges', 'tiles', 'wallPaths', 'terrainStrokes', 'fogOfWar', 'levels'
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
    fogOfWar: layer.fogOfWar,
    // "No rungs" is a value (never undefined), so removing them diffs.
    levels: layer.levels ?? EMPTY_LEVELS
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

/**
 * The snapshot's layer fields. A snapshot without `levels` means "no rungs"
 * (EMPTY_LEVELS) when it came from a rung write (`level` set) or the base
 * still has rungs: snapshot builders copy the layer's `levels` whenever it
 * has any, so its absence there is the last rung being emptied. Otherwise
 * (a classic snapshot over a classic layer) the key is left out of the diff.
 */
function pickLayerValues(
  s: LayerHistorySnapshot,
  base: Partial<LayerHistoryLayerValues> | null
): Partial<LayerHistoryLayerValues> {
  const baseHasRungs = base?.levels !== undefined && base.levels !== EMPTY_LEVELS;
  return {
    cells: s.cells, curves: s.curves, objects: s.objects, textLabels: s.textLabels, edges: s.edges,
    tiles: s.tiles, wallPaths: s.wallPaths, terrainStrokes: s.terrainStrokes, fogOfWar: s.fogOfWar,
    levels: s.levels ?? (s.level !== undefined || baseHasRungs ? EMPTY_LEVELS : undefined)
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
    if (layerPatch != null) {
      const { levels, ...fields } = layerPatch;
      next = updateLayer(next, entry.layerId, fields);
      // Rungs go back whole, or the key is stripped for EMPTY_LEVELS (never
      // `levels: undefined`, never the sentinel itself on a layer).
      if ('levels' in layerPatch) {
        next = { ...next, layers: next.layers.map((l) => l.id === entry.layerId ? applySnapshotLevels(l, { levels }) : l) };
      }
    }
  }
  if (next === prev) return prev;
  // Leaving the entry that stamped `lod` makes the map classic again (kept
  // while depth content remains); entering it puts the block back.
  return isUndo ? undoLodStamp(next, entry) : redoLodStamp(next, entry);
}

/** Last known values for the open level: the last rendered map plus edits recorded since. */
interface PinnedValues {
  map: Partial<LayerHistoryMapValues>;
  layers: Record<LayerId, Partial<LayerHistoryLayerValues>>;
}

/** Pin each changed field's `before` unless a pin for it is already held. */
function pinBefore<T extends object>(pins: Partial<T>, diff: FieldDiff<T> | null): Partial<T> {
  if (diff == null) return pins;
  const next: Partial<T> = { ...pins };
  for (const key of Object.keys(diff.before) as (keyof T)[]) {
    if (!(key in next)) next[key] = diff.before[key];
  }
  return next;
}

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
  // The root level's stacks survive a dive and come back on exit (parallax
  // wave-7 finding 7); entries guard against the live values on apply, so a
  // root field changed meanwhile is never clobbered.
  const levelRef = useRef<{ nav: number; key: string | null }>({ nav: navigationVersion, key: levelKey });
  const rootStacksRef = useRef<LayerHistoryStacks | null>(null);
  // Layer of the last recorded entry; coalescing requires it to be unchanged
  // (no merge across an A -> B -> A round trip, parallax wave-7 finding 8).
  const lastRecordLayerRef = useRef<LayerId | null>(null);
  // Pre-drag baselines pinned by transient (live-drag) writes, consumed by the
  // next committed snapshot. See the file header.
  const pinnedRef = useRef<PinnedValues>({ map: {}, layers: {} });
  if (isLoading) {
    levelRef.current = { nav: navigationVersion, key: levelKey };
    stacksRef.current = {};
    rootStacksRef.current = null;
    lastRecordLayerRef.current = null;
    pinnedRef.current = { map: {}, layers: {} };
  } else if (levelRef.current.key === levelKey && levelRef.current.nav !== navigationVersion && mapData?.lod !== undefined) {
    // A map that IS a ladder (it carries `lod`) has no sub-hex navigation: a
    // navigationVersion bump is a camera move and keeps history (design 06 s5).
    // The test is the map's own `lod`, NOT the capability flag: a flag-on
    // install still navigates legacy sub-hex maps (review finding, phase 3b).
    levelRef.current = { nav: navigationVersion, key: levelKey };
  } else if (levelRef.current.nav !== navigationVersion || levelRef.current.key !== levelKey) {
    pinnedRef.current = { map: {}, layers: {} };
    const leaving = levelRef.current.key;
    if (leaving !== levelKey) {
      if (leaving === null) rootStacksRef.current = stacksRef.current;
      stacksRef.current = levelKey === null ? (rootStacksRef.current ?? {}) : {};
      if (levelKey === null) rootStacksRef.current = null;
    } else if (levelKey !== null) {
      // The same sub-hex path re-entered: it may be a recreated level.
      stacksRef.current = {};
    }
    levelRef.current = { nav: navigationVersion, key: levelKey };
    lastRecordLayerRef.current = null;
  }
  if (mapData != null && lastRecordLayerRef.current !== mapData.activeLayerId) {
    lastRecordLayerRef.current = null;
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
      coalesceKey?: string,
      meta?: Pick<LayerHistorySnapshot, 'level' | 'lodStamped'>
    ): void => {
      if (layerDiff == null && mapDiff == null) return;
      const now = Date.now();
      const stack = stacksRef.current[layerId] ?? createHistoryStack<LayerHistoryEntry>();
      const entry: LayerHistoryEntry = {
        layerId,
        layer: layerDiff ?? emptyDiff<LayerHistoryLayerValues>(),
        map: mapDiff ?? emptyDiff<LayerHistoryMapValues>(),
        coalesceKey,
        time: now,
        ...(meta?.level !== undefined ? { level: meta.level } : {}),
        ...(meta?.lodStamped !== undefined ? { lodStamped: meta.lodStamped } : {})
      };

      const top = coalesceKey != null && lastRecordLayerRef.current === layerId ? peekTopHistoryEntry(stack) : null;
      lastRecordLayerRef.current = layerId;
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
    (state: LayerHistorySnapshot, options?: AddToHistoryOptions): void => {
      if (isApplyingHistoryRef.current) return;
      const known = knownRef.current;
      const layerId = known.activeLayerId;
      if (layerId == null) return;
      const knownLayer = known.layers[layerId] as Partial<LayerHistoryLayerValues> | undefined;
      const pinned = pinnedRef.current;
      const pinnedLayer = pinned.layers[layerId] ?? {};

      if (options?.transient === true) {
        // Live drag write: pin the pre-drag values of the fields it changes.
        // `known` still holds them on the first move (no render in between);
        // later moves find the pin already held and leave it.
        const liveLayerDiff = knownLayer != null
          ? diffHistoryFields(LAYER_KEYS, knownLayer, pickLayerValues(state, knownLayer), true)
          : null;
        const liveMapDiff = diffHistoryFields(MAP_KEYS, known.map, pickMapValues(state), true);
        pinnedRef.current = {
          map: pinBefore(pinned.map, liveMapDiff),
          layers: { ...pinned.layers, [layerId]: pinBefore(pinnedLayer, liveLayerDiff) }
        };
        return;
      }

      // Committed snapshot: diff against the pre-drag pins where held (the last
      // render already shows the dragged value), then release them.
      const baseLayer = knownLayer != null ? { ...knownLayer, ...pinnedLayer } : null;
      const baseMap = { ...known.map, ...pinned.map };
      pinnedRef.current = { map: {}, layers: { ...pinned.layers, [layerId]: {} } };
      // A layer not yet rendered has no known baseline: record only map-wide fields.
      const layerDiff = baseLayer != null
        ? diffHistoryFields(LAYER_KEYS, baseLayer, pickLayerValues(state, baseLayer), true)
        : null;
      const mapDiff = diffHistoryFields(MAP_KEYS, baseMap, pickMapValues(state), true);
      recordEntry(layerId, layerDiff, mapDiff, undefined, { level: state.level, lodStamped: state.lodStamped });
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

  /**
   * One undo/redo keypress. The stack moves only once an entry actually
   * changes the live map; an entry that no longer applies (every field
   * changed since by a write outside history) is dropped and the next one is
   * tried. All of it runs against the live map inside the functional update,
   * computed from the stack as it was at the call, so the result is the same
   * however often the updater runs. Returns whether the map changed (known at
   * return because updaters run at dispatch; false if it was deferred).
   */
  const applyStep = useCallback(
    (direction: 'undo' | 'redo'): boolean => {
      // Pins from an uncommitted drag would mis-baseline the next entry.
      pinnedRef.current = { map: {}, layers: {} };
      const layerId = knownRef.current.activeLayerId;
      if (layerId == null) return false;
      const startStack = stacksRef.current[layerId] as LayerHistoryStacks[LayerId] | undefined;
      if (startStack == null) return false;
      if (direction === 'undo' ? startStack.index === 0 : startStack.index >= startStack.entries.length) return false;

      let applied = false;
      isApplyingHistoryRef.current = true;
      updateMapData((prev: MapData) => {
        let stack = startStack;
        let next = prev;
        for (;;) {
          const step = direction === 'undo' ? stepHistoryUndo(stack) : stepHistoryRedo(stack);
          if (step == null) break;
          const candidate = applyLayerHistoryEntry(prev, step.entry, direction);
          if (candidate !== prev) {
            stack = step.stack;
            // Cross-rung undo/redo: bring the camera to the rung the change lives on.
            const view = viewStateForRung(candidate, step.entry.level);
            next = view !== null ? { ...candidate, viewState: view } : candidate;
            break;
          }
          stack = dropHistoryStep(stack, direction);
        }
        stacksRef.current[layerId] = stack;
        applied = next !== prev;
        return next;
      });
      if (stacksRef.current[layerId] !== startStack) bump();
      // Re-enable recording once the update has been dispatched.
      window.setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
      return applied;
    },
    [updateMapData, bump]
  );

  const handleUndo = useCallback((): boolean => applyStep('undo'), [applyStep]);
  const handleRedo = useCallback((): boolean => applyStep('redo'), [applyStep]);

  /**
   * Check if we're currently applying history (undo/redo in progress)
   * Data handlers should skip adding to history when this returns true
   */
  const isApplyingHistory = useCallback((): boolean => {
    return isApplyingHistoryRef.current;
  }, []);

  /**
   * Drop the transient pins (parallax-livefix 2). A drag that ends without its
   * commit (pointercancel, a release the drag hook never sees) would otherwise
   * leave its pre-drag baseline held, and the next commit of ANY field would
   * diff against it and record the abandoned move as part of that entry. The
   * abandoned live values then count as the baseline, like any other write
   * outside history.
   */
  const clearTransient = useCallback((): void => {
    pinnedRef.current = { map: {}, layers: {} };
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
    isApplyingHistory,
    clearTransient
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
    isApplyingHistory,
    clearTransient
  };
}

export { useLayerHistory };
