/**
 * layerAccessor.ts
 * Layer and board (floor) selectors and immutable reducers, strata promotion,
 * and the v1 -> v2 layer-schema migration helpers (migrateToLayerSchema,
 * needsMigration). Fog-of-war reducers live in fogOperations.ts and are
 * re-exported from here.
 */

// Type-only imports
import type {
  MapData,
  MapLayer,
  LayerId,
  Board,
  BoardId,
  LayerUpdate,
  LegacyMapData,
  MigrationValidation
} from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { TileLayerRole } from '#types/tiles/tile.types';
import type { ExportLayerOption } from '#types/core/export.types';

import { DEFAULT_TILE_LAYERS } from '#types/tiles/tile.types';
import { SCHEMA_VERSION } from '../core/dmtConstants';

// ============================================================================
// BOARD (FLOOR) CONSTANTS
// ============================================================================

/** Stable id for the implicit board every migrated/legacy map gets. */
const DEFAULT_BOARD_ID = 'board-default';

/** Generate a unique id for a board. */
function generateBoardId(): BoardId {
  return 'board-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}


// ============================================================================
// UUID GENERATION
// ============================================================================

/**
 * Generate a unique ID for a layer
 */
function generateLayerId(): LayerId {
  return 'layer-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/**
 * Fresh id with the same `<prefix>-<timestamp>-<random>` shape the entity's
 * own generator mints (obj-, text-, curve-, edge-, wall-, tstroke-, gap-).
 * Local so layerAccessor stays free of drawing/objects imports.
 */
function freshEntityId(prefix: string): string {
  return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
}

/** Schema version the v1 -> v2 layer migration produces (step 2 of the runner). */
const LAYER_SCHEMA_VERSION = 2;

// ============================================================================
// LAYER ACCESS FUNCTIONS
// ============================================================================

/**
 * Get the currently active layer data
 */
function getActiveLayer(mapData: MapData | null | undefined): MapLayer {
  if (!mapData?.layers || !mapData.activeLayerId) {
    // Legacy fallback (should not happen after migration)
    return {
      id: 'legacy',
      name: '1',
      order: 0,
      visible: true,
      cells: (mapData as LegacyMapData)?.cells ?? [],
      curves: [],
      edges: (mapData as LegacyMapData)?.edges ?? [],
      objects: ((mapData as LegacyMapData)?.objects ?? []) as unknown as MapObject[],
      textLabels: (mapData as LegacyMapData)?.textLabels ?? [],
      fogOfWar: null
    };
  }
  const layer = mapData.layers.find(l => l.id === mapData.activeLayerId);
  if (layer) return layer;
  // M2: board-scoped fallback — never cross boards into a foreign layers[0].
  const boardLayers = getActiveBoardLayers(mapData);
  return boardLayers[0] ?? mapData.layers[0];
}

/**
 * Get all layers sorted by order (ascending - lowest order first)
 */
function getLayersOrdered(mapData: MapData | null | undefined): MapLayer[] {
  if (!mapData?.layers) return [];
  return [...mapData.layers].sort((a, b) => a.order - b.order);
}

/**
 * Get layer by ID
 */
function getLayerById(mapData: MapData | null | undefined, layerId: LayerId): MapLayer | null {
  return mapData?.layers?.find(l => l.id === layerId) ?? null;
}

/**
 * Get the index of a layer in the layers array
 */
function getLayerIndex(mapData: MapData | null | undefined, layerId: LayerId): number {
  if (!mapData?.layers) return -1;
  return mapData.layers.findIndex(l => l.id === layerId);
}

/**
 * Get the layer directly below the specified layer (by order).
 * Returns null if no layer exists below (i.e., this is the bottom layer).
 */
function getLayerBelow(mapData: MapData | null | undefined, layerId: LayerId): MapLayer | null {
  if (!mapData?.layers) return null;

  const layer = getLayerById(mapData, layerId);
  if (!layer) return null;

  // C3: only consider layers on the SAME board — the ghost must respect board bounds.
  const sortedLayers = getBoardLayers(mapData, layerBoardId(layer));
  let layerBelow: MapLayer | null = null;

  for (const candidate of sortedLayers) {
    if (candidate.order < layer.order) {
      // This candidate is below our layer; keep the highest one
      if (!layerBelow || candidate.order > layerBelow.order) {
        layerBelow = candidate;
      }
    }
  }

  return layerBelow;
}

// ============================================================================
// BOARD (FLOOR) ACCESS & PROJECTION
// ============================================================================

/** The board id a layer belongs to (default board when unset). */
function layerBoardId(layer: MapLayer | null | undefined): BoardId {
  return (layer?.boardId != null && layer.boardId !== '') ? layer.boardId : DEFAULT_BOARD_ID;
}

/** All boards sorted by order (ascending). */
function getBoardsOrdered(mapData: MapData | null | undefined): Board[] {
  if (!mapData?.boards) return [];
  return [...mapData.boards].sort((a, b) => a.order - b.order);
}

/** The active board id, with safe fallbacks for un-migrated/partial data. */
function getActiveBoardId(mapData: MapData | null | undefined): BoardId {
  if (!mapData) return DEFAULT_BOARD_ID;
  if (mapData.activeBoardId != null && mapData.activeBoardId !== '') return mapData.activeBoardId;
  const active = mapData.layers?.find(l => l.id === mapData.activeLayerId);
  if (active != null) return layerBoardId(active);
  const first = getBoardsOrdered(mapData)[0];
  return first?.id ?? DEFAULT_BOARD_ID;
}

/** Layers belonging to a board, sorted by order (ascending). */
function getBoardLayers(mapData: MapData | null | undefined, boardId: BoardId): MapLayer[] {
  if (!mapData?.layers) return [];
  return mapData.layers.filter(l => layerBoardId(l) === boardId).sort((a, b) => a.order - b.order);
}

/** Layers belonging to the active board, sorted by order (ascending). */
function getActiveBoardLayers(mapData: MapData | null | undefined): MapLayer[] {
  return getBoardLayers(mapData, getActiveBoardId(mapData));
}

/**
 * Get the board (floor) directly below the specified board (by order): the board
 * with the highest `order` strictly less than the given board's. Returns null when
 * the given board is the bottom board (or the board id is unknown).
 */
function getBoardBelow(mapData: MapData | null | undefined, boardId: BoardId): Board | null {
  const boards = getBoardsOrdered(mapData);
  const board = boards.find(b => b.id === boardId);
  if (!board) return null;

  let below: Board | null = null;
  for (const candidate of boards) {
    if (candidate.order < board.order) {
      if (!below || candidate.order > below.order) {
        below = candidate;
      }
    }
  }
  return below;
}

/** Update a specific board's fields (immutable). */
function updateBoard(mapData: MapData, boardId: BoardId, updates: Partial<Omit<Board, 'id'>>): MapData {
  if (!mapData.boards) return mapData;
  return {
    ...mapData,
    boards: mapData.boards.map(board =>
      board.id === boardId ? { ...board, ...updates } : board
    )
  };
}

/**
 * The layers the canvas should COMPOSITE (cells/curves/tiles), in draw order.
 * Strata maps composite the active board's visible layers as stacked strata;
 * every other map renders just the active layer (today's single-layer behavior).
 * The persisted `layerMode` flag is the authority — never inferred from shape, so
 * un-migrated/Simple maps never mass-render during the migration window.
 */
function getRenderLayers(mapData: MapData | null | undefined): MapLayer[] {
  if (!mapData) return [];
  if (mapData.layerMode === 'strata') {
    return getActiveBoardLayers(mapData).filter(l => l.visible !== false);
  }
  // getActiveLayer always resolves to a layer (legacy fallback included).
  return [getActiveLayer(mapData)];
}

/**
 * Resolve the layers an image export should composite, from the dialog's
 * selection. Unknown ids are dropped and the result is sorted by layer order
 * (ascending) so the export draws bottom-to-top like the live canvas.
 */
function getExportLayers(
  mapData: MapData | null | undefined,
  selections: ExportLayerOption[]
): MapLayer[] {
  if (!mapData?.layers) return [];
  const byId = new Map<LayerId, MapLayer>(mapData.layers.map(l => [l.id, l]));
  const resolved: MapLayer[] = [];
  const seen = new Set<LayerId>();
  for (const selection of selections) {
    if (seen.has(selection.id)) continue;
    const layer = byId.get(selection.id);
    if (layer) {
      resolved.push(layer);
      seen.add(selection.id);
    }
  }
  return resolved.sort((a, b) => a.order - b.order);
}

/**
 * Default export selection: the layers the live canvas is currently drawing,
 * each at full opacity.
 */
function getDefaultExportLayers(mapData: MapData | null | undefined): ExportLayerOption[] {
  return getRenderLayers(mapData).map(layer => ({ id: layer.id, opacity: 1 }));
}

/**
 * Idempotently ensure board structure exists: every layer has a boardId, the
 * `boards` registry covers all referenced boards, and activeBoardId is valid and
 * matches the active layer's board (M2 invariant). Mutates in place to match the
 * load-path migration idiom, and returns mapData.
 */
function ensureBoards(mapData: MapData): MapData {
  const layers = mapData.layers;
  if (!Array.isArray(layers) || layers.length === 0) return mapData;

  // 1. Stamp a default board id on any layer missing one.
  for (const layer of layers) {
    if (layer.boardId == null || layer.boardId === '') layer.boardId = DEFAULT_BOARD_ID;
  }

  // 2. Ensure the boards registry covers every referenced board id.
  const referenced = new Set<BoardId>(layers.map(l => layerBoardId(l)));
  const existing = Array.isArray(mapData.boards) ? mapData.boards : [];
  const byId = new Map<BoardId, Board>(existing.map(b => [b.id, b]));
  let nextOrder = existing.length;
  for (const id of referenced) {
    if (!byId.has(id)) {
      byId.set(id, {
        id,
        name: id === DEFAULT_BOARD_ID ? 'Ground Floor' : 'Floor ' + (nextOrder + 1),
        order: nextOrder,
      });
      nextOrder += 1;
    }
  }
  // Drop orphan boards (no layers); always keep at least one.
  let boards = [...byId.values()].filter(b => referenced.has(b.id)).sort((a, b) => a.order - b.order);
  if (boards.length === 0) boards = [{ id: DEFAULT_BOARD_ID, name: 'Ground Floor', order: 0 }];
  mapData.boards = boards;

  // 3. Enforce activeBoardId validity + the active-layer-belongs-to-active-board invariant.
  const isValid = (id: BoardId | undefined): boolean => id != null && id !== '' && boards.some(b => b.id === id);
  const activeLayer = layers.find(l => l.id === mapData.activeLayerId);
  if (activeLayer != null && isValid(layerBoardId(activeLayer))) {
    mapData.activeBoardId = layerBoardId(activeLayer);
  } else if (!isValid(mapData.activeBoardId)) {
    mapData.activeBoardId = boards[0].id;
  }
  return mapData;
}

/**
 * Add a new board (floor) seeded with the default tile-layer stack
 * (one MapLayer per DEFAULT_TILE_LAYERS role) and switch to it.
 */
function addBoard(mapData: MapData, name: string | null = null): MapData {
  // A map with no boards registry (e.g. a sub-map created before it was built
  // via createNewMap) implicitly lives on the default board. Register that
  // board first, or the new floor would be the only one and the original
  // layers would be stranded. ensureBoards mutates, so give it copies.
  if (!Array.isArray(mapData.boards) || mapData.boards.length === 0) {
    mapData = ensureBoards({ ...mapData, layers: mapData.layers.map(l => ({ ...l })) });
  }
  const boards = getBoardsOrdered(mapData);
  const boardId = generateBoardId();
  const order = boards.length > 0 ? Math.max(...boards.map(b => b.order)) + 1 : 0;
  const board: Board = { id: boardId, name: name ?? 'Floor ' + (order + 1), order };

  // Seed the board's strata. Orders are board-local (0..3 per DEFAULT_TILE_LAYERS).
  const newLayers: MapLayer[] = DEFAULT_TILE_LAYERS.map((def, i) => ({
    id: generateLayerId() + '-' + i,
    name: def.name,
    order: def.order,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null,
    tiles: [],
    tileRole: def.role,
    boardId,
  }));

  return {
    ...mapData,
    boards: [...boards, board],
    layers: [...mapData.layers, ...newLayers],
    activeLayerId: newLayers[0].id,
    activeBoardId: boardId,
    // Acquiring a real board promotes the map to strata rendering (composite the
    // active board's strata). Never auto-demoted; Simple maps never reach here.
    layerMode: 'strata',
  };
}

/**
 * Remove a board (floor) and all its layers. Refuses to remove the last board
 * or to leave the map with zero layers. Reassigns active board/layer if needed.
 */
function removeBoard(mapData: MapData, boardId: BoardId): MapData {
  const boards = getBoardsOrdered(mapData);
  if (boards.length <= 1) {
    console.warn('Cannot remove the last board');
    return mapData;
  }
  const remainingBoards = boards.filter(b => b.id !== boardId);
  const remainingLayers = mapData.layers.filter(l => layerBoardId(l) !== boardId);
  if (remainingLayers.length === 0) {
    console.warn('Cannot remove board: would leave no layers');
    return mapData;
  }

  let activeBoardId = mapData.activeBoardId;
  let activeLayerId = mapData.activeLayerId;
  const removedActiveBoard = getActiveBoardId(mapData) === boardId;
  const removedActiveLayer = !remainingLayers.some(l => l.id === activeLayerId);
  if (removedActiveBoard || removedActiveLayer) {
    const target = remainingBoards[0];
    activeBoardId = target.id;
    const targetLayers = remainingLayers
      .filter(l => layerBoardId(l) === target.id)
      .sort((a, b) => a.order - b.order);
    activeLayerId = targetLayers[0]?.id ?? remainingLayers[0].id;
  }

  return { ...mapData, boards: remainingBoards, layers: remainingLayers, activeBoardId, activeLayerId };
}

/**
 * Switch the active board (floor). Single setter that keeps activeLayerId on the
 * target board (M2 invariant): keeps the current layer if it's already on the
 * board, else picks the board's top layer.
 */
function setActiveBoard(mapData: MapData, boardId: BoardId): MapData {
  if (mapData.boards == null || !mapData.boards.some(b => b.id === boardId)) {
    console.warn('Cannot set active board: board ' + boardId + ' not found');
    return mapData;
  }
  const layers = getBoardLayers(mapData, boardId);
  const keep = layers.some(l => l.id === mapData.activeLayerId);
  const topLayer = layers[layers.length - 1];
  const activeLayerId = keep ? mapData.activeLayerId : (topLayer?.id ?? mapData.activeLayerId);
  return { ...mapData, activeBoardId: boardId, activeLayerId };
}

/**
 * Promote a map to strata rendering, ensuring the ACTIVE board has the four
 * stratum layers (one per tileRole). Best-effort, idempotent:
 *  - if the board already covers all four roles, just flips the flag;
 *  - otherwise folds the board's content into four stratum layers — the first
 *    layer becomes the ground stratum (keeps its id/name/cells/curves/objects/fog),
 *    tiles are redistributed by their `depth` tier, and any extra board layers'
 *    non-tile content merges into ground. Single-layer boards (the common case)
 *    convert losslessly; multi-layer boards merge — hand-fixable, by design.
 */
function promoteToStrata(mapData: MapData): MapData {
  const boardId = getActiveBoardId(mapData);
  const boardLayers = getBoardLayers(mapData, boardId);
  if (boardLayers.length === 0) return { ...mapData, layerMode: 'strata' };

  const roles = new Set(
    boardLayers
      .map(l => l.tileRole)
      .filter((r): r is TileLayerRole => r != null)
  );
  const hasAllStrata = DEFAULT_TILE_LAYERS.every(d => roles.has(d.role));
  if (hasAllStrata) return { ...mapData, layerMode: 'strata' };

  const base = boardLayers[0];
  const allTiles = boardLayers.flatMap(l => l.tiles ?? []);
  const mergedCells = boardLayers.flatMap(l => l.cells);
  const mergedCurves = boardLayers.flatMap(l => l.curves);
  const mergedEdges = boardLayers.flatMap(l => l.edges);
  const mergedObjects = boardLayers.flatMap(l => l.objects);
  const mergedText = boardLayers.flatMap(l => l.textLabels);

  const strata: MapLayer[] = DEFAULT_TILE_LAYERS.map((def, i) => {
    const isGround = def.role === 'ground';
    return {
      id: isGround ? base.id : generateLayerId() + '-' + i,
      name: isGround ? base.name : def.name,
      order: def.order,
      visible: true,
      cells: isGround ? mergedCells : [],
      curves: isGround ? mergedCurves : [],
      edges: isGround ? mergedEdges : [],
      objects: isGround ? mergedObjects : [],
      textLabels: isGround ? mergedText : [],
      fogOfWar: isGround ? base.fogOfWar : null,
      tiles: allTiles.filter(t => (t.depth ?? 'ground') === def.role),
      tileRole: def.role,
      boardId,
    };
  });

  const otherLayers = mapData.layers.filter(l => layerBoardId(l) !== boardId);
  return {
    ...mapData,
    layers: [...otherLayers, ...strata],
    activeLayerId: base.id,
    activeBoardId: boardId,
    layerMode: 'strata',
  };
}

/** Set the layer rendering mode. 'strata' runs the best-effort promotion; 'simple'
 *  just flips the flag (keeps any stratum layers, renders active-only). */
function setLayerMode(mapData: MapData, mode: 'simple' | 'strata'): MapData {
  if (mode === 'strata') return promoteToStrata(mapData);
  return { ...mapData, layerMode: 'simple' };
}

// ============================================================================
// LAYER MODIFICATION FUNCTIONS
// ============================================================================

/**
 * Update a specific layer's data (immutable)
 */
function updateLayer(mapData: MapData, layerId: LayerId, updates: LayerUpdate): MapData {
  return {
    ...mapData,
    layers: mapData.layers.map(layer =>
      layer.id === layerId ? { ...layer, ...updates } : layer
    )
  };
}

/**
 * Update the active layer's data (convenience function)
 */
function updateActiveLayer(mapData: MapData, updates: LayerUpdate): MapData {
  if (mapData.activeLayerId == null || mapData.activeLayerId === '') return mapData;
  return updateLayer(mapData, mapData.activeLayerId, updates);
}

/**
 * Set the active layer by ID
 */
function setActiveLayer(mapData: MapData, layerId: LayerId): MapData {
  // Verify the layer exists
  const target = getLayerById(mapData, layerId);
  if (!target) {
    console.warn(`Cannot set active layer: layer ${layerId} not found`);
    return mapData;
  }

  // M2: single setter — keep activeBoardId in sync with the active layer's board.
  const updated: MapData = { ...mapData, activeLayerId: layerId };
  if (mapData.boards != null) updated.activeBoardId = layerBoardId(target);
  return updated;
}

/**
 * Add a new layer to the map
 */
function addLayer(mapData: MapData, name: string | null = null): MapData {
  // M5: seed order from the ACTIVE BOARD's max, and stamp the active board id.
  const boardId = getActiveBoardId(mapData);
  const boardLayers = getBoardLayers(mapData, boardId);
  const maxOrder = boardLayers.length > 0
    ? Math.max(...boardLayers.map(l => l.order))
    : -1;

  const newLayer: MapLayer = {
    id: generateLayerId(),
    name: name ?? String(boardLayers.length + 1),
    order: maxOrder + 1,
    visible: true,
    cells: [],
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null
  };
  if (mapData.boards != null) newLayer.boardId = boardId;

  return {
    ...mapData,
    layers: [...mapData.layers, newLayer],
    activeLayerId: newLayer.id  // Auto-switch to new layer (stays on active board)
  };
}

/**
 * Remove a layer from the map (prevents removing last layer)
 */
function removeLayer(mapData: MapData, layerId: LayerId): MapData {
  const target = getLayerById(mapData, layerId);
  if (!target) return mapData;

  // C1: guard on the last layer ON THIS BOARD, not the global count. Deleting a
  // whole floor goes through removeBoard (which lifts this guard intentionally).
  const boardId = layerBoardId(target);
  const boardLayers = getBoardLayers(mapData, boardId);
  if (boardLayers.length <= 1) {
    console.warn('Cannot remove the last layer on its board');
    return mapData;
  }

  const newLayers = mapData.layers.filter(l => l.id !== layerId);
  let newActiveId = mapData.activeLayerId;
  let newActiveBoardId = mapData.activeBoardId;

  // If we removed the active layer, switch to the first remaining layer ON THE SAME
  // board (never cross boards). The board still has >= 1 layer per the guard above.
  if (mapData.activeLayerId === layerId) {
    const remainingOnBoard = newLayers
      .filter(l => layerBoardId(l) === boardId)
      .sort((a, b) => a.order - b.order);
    newActiveId = remainingOnBoard[0].id;
    newActiveBoardId = boardId;
  }

  return {
    ...mapData,
    layers: newLayers,
    activeLayerId: newActiveId,
    activeBoardId: newActiveBoardId
  };
}

/**
 * Clone a layer and insert it directly above the source layer.
 * @param mode 'all' copies everything; 'mapOnly' copies cells, curves, edges, tiles only
 */
function cloneLayer(mapData: MapData, layerId: LayerId, mode: 'all' | 'mapOnly'): MapData {

  const sourceLayer = getLayerById(mapData, layerId);
  if (!sourceLayer) {
    console.warn(`Cannot clone: layer ${layerId} not found`);
    return mapData;
  }

  const cloneId = generateLayerId();
  const cloneOrder = sourceLayer.order + 1;
  const sourceBoardId = layerBoardId(sourceLayer);

  // Shift layers above the source up by 1 to make room — ONLY within the source's
  // board, so other boards' order values are never disturbed.
  const shiftedLayers = mapData.layers.map(layer =>
    layerBoardId(layer) === sourceBoardId && layer.order > sourceLayer.order
      ? { ...layer, order: layer.order + 1 }
      : layer
  );

  // Deep copy via JSON round-trip (same pattern as createBackup)
  const deepCopy = <T>(data: T): T => JSON.parse(JSON.stringify(data)) as T;

  const sourceName = sourceLayer.name || String(sourceLayer.order + 1);

  // Every entity in the copy gets a fresh id: ids are looked up map-wide
  // (party range results by objectId, travel label maps, deep links,
  // selection restore), so a duplicate would resolve to the wrong copy.
  const withFreshIds = <T extends { id?: string }>(items: T[] | undefined, prefix: string): T[] =>
    deepCopy(items ?? []).map(item => (item.id != null ? { ...item, id: freshEntityId(prefix) } : item));

  const wallPaths = withFreshIds(sourceLayer.wallPaths, 'wall').map(w =>
    w.gaps != null ? { ...w, gaps: w.gaps.map(g => ({ ...g, id: freshEntityId('gap') })) } : w
  );

  // Object links are pairs ({layerId, objectId} on both ends). A cloned object
  // must not point at the source's partner: that partner links back to the
  // source, and unlinking from the clone would strip the original pair. A
  // link inside the source layer is remapped to the cloned partner; a link to
  // another layer is dropped (the partner stays paired with the original).
  const sourceObjects = sourceLayer.objects ?? [];
  const freshObjects = mode === 'all' ? withFreshIds(sourceObjects, 'obj') : [];
  const objectIdMap = new Map<string, string>();
  freshObjects.forEach((o, i) => { objectIdMap.set(sourceObjects[i].id, o.id); });
  const objects = freshObjects.map((o) => {
    const next = o.layerId != null ? { ...o, layerId: cloneId } : { ...o };
    const link = next.linkedObject;
    if (link == null) return next;
    const partner = link.layerId === sourceLayer.id ? objectIdMap.get(link.objectId) : undefined;
    if (partner != null) return { ...next, linkedObject: { ...link, layerId: cloneId, objectId: partner } };
    delete next.linkedObject;
    return next;
  });

  const clonedLayer: MapLayer = {
    id: cloneId,
    name: `Copy of ${sourceName}`,
    order: cloneOrder,
    visible: true,
    cells: deepCopy(sourceLayer.cells),
    curves: withFreshIds(sourceLayer.curves, 'curve'),
    edges: withFreshIds(sourceLayer.edges, 'edge'),
    objects,
    textLabels: mode === 'all' ? withFreshIds(sourceLayer.textLabels, 'text') : [],
    fogOfWar: mode === 'all' && sourceLayer.fogOfWar ? deepCopy(sourceLayer.fogOfWar) : null,
    tiles: deepCopy(sourceLayer.tiles ?? []),
    // Map content in both modes (walls and terrain paint are drawn map
    // features, like cells/curves/tiles). Previously omitted entirely.
    wallPaths,
    terrainStrokes: withFreshIds(sourceLayer.terrainStrokes, 'tstroke'),
  };

  // Clone stays on the same board (and same stratum, if any).
  if (sourceLayer.boardId != null) clonedLayer.boardId = sourceLayer.boardId;
  if (sourceLayer.tileRole != null) clonedLayer.tileRole = sourceLayer.tileRole;

  if (mode === 'all') {
    if (sourceLayer.icon != null && sourceLayer.icon !== '') clonedLayer.icon = sourceLayer.icon;
    if (sourceLayer.showLayerBelow !== undefined) clonedLayer.showLayerBelow = sourceLayer.showLayerBelow;
    if (sourceLayer.layerBelowOpacity !== undefined) clonedLayer.layerBelowOpacity = sourceLayer.layerBelowOpacity;
  }

  return {
    ...mapData,
    layers: [...shiftedLayers, clonedLayer],
    activeLayerId: cloneId
  };
}

/**
 * Reorder layers by moving a layer to a new position
 */
function reorderLayers(mapData: MapData, layerId: LayerId, newIndex: number): MapData {
  const target = getLayerById(mapData, layerId);
  if (!target) {
    console.warn(`Cannot reorder: layer ${layerId} not found`);
    return mapData;
  }

  // C2: reorder WITHIN the layer's board only. Other boards keep their order values.
  const boardId = layerBoardId(target);
  const boardLayers = getBoardLayers(mapData, boardId); // sorted ascending by order
  const slots = boardLayers.map(l => l.order);          // order values owned by this board
  const currentIndex = boardLayers.findIndex(l => l.id === layerId);

  // Clamp newIndex to the board's range
  const clampedIndex = Math.max(0, Math.min(newIndex, boardLayers.length - 1));
  if (currentIndex === clampedIndex) {
    return mapData; // No change needed
  }

  const arranged = [...boardLayers];
  const [moved] = arranged.splice(currentIndex, 1);
  arranged.splice(clampedIndex, 0, moved);

  // Map each board layer onto this board's existing order slots in the new arrangement.
  const orderById = new Map<LayerId, number>();
  arranged.forEach((l, i) => orderById.set(l.id, slots[i]));

  const reorderedLayers = mapData.layers.map(l => {
    const o = orderById.get(l.id);
    return o !== undefined ? { ...l, order: o } : l;
  });

  return {
    ...mapData,
    layers: reorderedLayers
  };
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Create a deep clone of map data for backup purposes (internal to migration)
 */
function createBackup<T>(mapData: T): T | null {
  try {
    return JSON.parse(JSON.stringify(mapData)) as T;
  } catch (error) {
    console.error('[layerAccessor] Failed to create backup:', error);
    return null;
  }
}

/**
 * Validate that layer data was properly migrated
 */
function validateMigration(originalData: LegacyMapData, migratedData: MapData): MigrationValidation {
  const errors: string[] = [];
  
  // Check that layers array has content
  if (migratedData.layers.length === 0) {
    errors.push('Migration failed: layers array is empty');
    return { valid: false, errors };
  }
  
  const layer = migratedData.layers[0];
  
  // Check that layer has required structure
  if (!layer.id || typeof layer.id !== 'string') {
    errors.push('Migration failed: layer missing valid id');
  }
  
  // Verify data was actually copied (not just empty arrays when original had data)
  const originalCells = originalData.cells ?? [];
  const originalObjects = originalData.objects ?? [];
  const originalTextLabels = originalData.textLabels ?? [];
  const originalEdges = originalData.edges ?? [];

  const layerCells = layer.cells;
  const layerObjects = layer.objects;
  const layerTextLabels = layer.textLabels;
  const layerEdges = layer.edges;
  
  // Check cell count matches
  if (originalCells.length !== layerCells.length) {
    errors.push(`Migration data loss: cells count mismatch (original: ${originalCells.length}, migrated: ${layerCells.length})`);
  }
  
  // Check objects count matches
  if (originalObjects.length !== layerObjects.length) {
    errors.push(`Migration data loss: objects count mismatch (original: ${originalObjects.length}, migrated: ${layerObjects.length})`);
  }
  
  // Check text labels count matches
  if (originalTextLabels.length !== layerTextLabels.length) {
    errors.push(`Migration data loss: textLabels count mismatch (original: ${originalTextLabels.length}, migrated: ${layerTextLabels.length})`);
  }
  
  // Check edges count matches
  if (originalEdges.length !== layerEdges.length) {
    errors.push(`Migration data loss: edges count mismatch (original: ${originalEdges.length}, migrated: ${layerEdges.length})`);
  }
  
  // Check schemaVersion is set correctly (this step produces v2 exactly)
  if (migratedData.schemaVersion !== LAYER_SCHEMA_VERSION) {
    errors.push(`Migration failed: schemaVersion incorrect (expected: ${LAYER_SCHEMA_VERSION}, got: ${migratedData.schemaVersion})`);
  }
  
  return { 
    valid: errors.length === 0, 
    errors 
  };
}

/**
 * Migrate legacy (v1) map data to the layer schema (v2): the v1 -> v2 step of
 * the schema runner (schemaMigration.ts).
 * Includes backup creation and validation with automatic rollback on failure.
 *
 * The rebuild runs ONLY when the map has no layers array. A map that already
 * has layers is v2+ by shape, whatever its schemaVersion says: it is stamped
 * (when the version is missing or below 2), never rebuilt — rebuilding would
 * replace every real layer with one built from empty root-level arrays.
 */
function migrateToLayerSchema(legacyMapData: LegacyMapData): MapData | LegacyMapData {
  if (Array.isArray((legacyMapData as Partial<MapData>).layers)) {
    const v = legacyMapData.schemaVersion;
    if (typeof v === 'number' && v >= LAYER_SCHEMA_VERSION) return legacyMapData;
    return { ...legacyMapData, schemaVersion: LAYER_SCHEMA_VERSION };
  }

  console.debug('[layerAccessor] Starting migration to schema version', LAYER_SCHEMA_VERSION);

  // Create backup BEFORE any modifications
  const backup = createBackup(legacyMapData);
  if (!backup) {
    console.error('[layerAccessor] CRITICAL: Could not create backup, aborting migration');
    return legacyMapData; // Return original unchanged
  }
  
  try {
    // Generate layer ID for the migrated content
    const layerId = generateLayerId();
    
    // IMPORTANT: Extract data BEFORE creating migrated structure
    // Use explicit array copying to ensure data is preserved
    const cellsData = Array.isArray(legacyMapData.cells) 
      ? [...legacyMapData.cells] 
      : [];
    const edgesData = Array.isArray(legacyMapData.edges) 
      ? [...legacyMapData.edges] 
      : [];
    const objectsData = Array.isArray(legacyMapData.objects) 
      ? [...legacyMapData.objects] 
      : [];
    const textLabelsData = Array.isArray(legacyMapData.textLabels) 
      ? [...legacyMapData.textLabels] 
      : [];
    
    console.debug('[layerAccessor] Migrating data:', {
      cells: cellsData.length,
      edges: edgesData.length,
      objects: objectsData.length,
      textLabels: textLabelsData.length
    });
    
    // Create the layer with copied data
    const layerData: MapLayer = {
      id: layerId,
      name: '1',
      order: 0,
      visible: true,
      cells: cellsData,
      curves: [],
      edges: edgesData,
      objects: objectsData as unknown as MapObject[],
      textLabels: textLabelsData,
      fogOfWar: null
    };
    
    // Build migrated structure (spread original first, then override)
    const migratedData: MapData = {
      ...legacyMapData as Partial<MapData>,
      schemaVersion: LAYER_SCHEMA_VERSION,
      mapType: legacyMapData.mapType ?? 'grid',
      activeLayerId: layerId,
      layerPanelVisible: false,
      layers: [layerData]
    };
    
    // Validate BEFORE removing legacy fields
    const validation = validateMigration(backup, migratedData);
    
    if (!validation.valid) {
      console.error('[layerAccessor] Migration validation failed:', validation.errors);
      console.error('[layerAccessor] Restoring from backup');
      return backup; // Return the backup (original data)
    }
    
    // Only NOW remove legacy root-level layer data (after validation passed)
    // TypeScript doesn't like delete on typed objects, so we use a workaround
    const cleanedData = { ...migratedData } as MapData & Partial<LegacyMapData>;
    delete cleanedData.cells;
    delete cleanedData.edges;
    delete cleanedData.objects;
    delete cleanedData.textLabels;
    
    // Store migration metadata for debugging
    cleanedData._migratedAt = new Date().toISOString();
    
    console.debug('[layerAccessor] Migration successful to schema version', LAYER_SCHEMA_VERSION);

    return cleanedData;

  } catch (error) {
    console.error('[layerAccessor] Migration failed with error:', error);
    console.error('[layerAccessor] Restoring from backup');
    return backup; // Return the backup (original data)
  }
}

/**
 * Whether map data needs ANY schema work on load: a v1 rebuild (no layers
 * array), a registered step, or just a version stamp. It does NOT mean "run
 * migrateToLayerSchema" — the version-stepped runner in schemaMigration.ts
 * decides what each map gets; an existing layers array is never rebuilt.
 */
function needsMigration(mapData: MapData | LegacyMapData | null | undefined): boolean {
  if (!mapData) return false;

  const hasLayers = Array.isArray((mapData as Partial<MapData>).layers);
  const needsIt = !hasLayers ||
                  mapData.schemaVersion == null ||
                  mapData.schemaVersion < SCHEMA_VERSION;

  if (needsIt) {
    console.debug('[layerAccessor] Map needs migration:', {
      currentVersion: mapData.schemaVersion ?? 'none',
      targetVersion: SCHEMA_VERSION,
      hasLayers
    });
  }

  return needsIt;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  generateLayerId,
  getActiveLayer, getLayersOrdered, getLayerById, getLayerIndex, getLayerBelow,
  updateLayer, updateActiveLayer, setActiveLayer, addLayer, cloneLayer, removeLayer, reorderLayers,
  migrateToLayerSchema, needsMigration, LAYER_SCHEMA_VERSION,
  // Board (floor) projection
  DEFAULT_BOARD_ID, generateBoardId, layerBoardId, getBoardsOrdered, getActiveBoardId,
  getBoardLayers, getActiveBoardLayers, getBoardBelow, updateBoard, getRenderLayers, getExportLayers, getDefaultExportLayers, ensureBoards, addBoard, removeBoard, setActiveBoard,
  promoteToStrata, setLayerMode
};

export {
  initializeFogOfWar, isCellFogged, fogCell, revealCell,
  fogRectangle, revealRectangle, fogAll, fogPaintedCells, revealAll,
  toggleFogVisibility, setFogVisibility, hasFogData, getFogState
} from './fogOperations';
