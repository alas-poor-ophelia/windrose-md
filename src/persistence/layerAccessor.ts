/**
 * layerAccessor.ts
 * Helper functions for accessing and manipulating layer data in Windrose maps.
 * Part of Phase 1: Z-Layer Architecture
 */

// Type-only imports
import type { IGeometry } from '#types/core/geometry.types';
import type {
  MapData,
  MapLayer,
  LayerId,
  Board,
  BoardId,
  LayerUpdate,
  LegacyMapData,
  FoggedCell,
  FogState,
  FogBounds,
  MigrationValidation
} from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';

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
    boards: [...(mapData.boards ?? []), board],
    layers: [...mapData.layers, ...newLayers],
    activeLayerId: newLayers[0].id,
    activeBoardId: boardId,
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

  const clonedLayer: MapLayer = {
    id: cloneId,
    name: `Copy of ${sourceName}`,
    order: cloneOrder,
    visible: true,
    cells: deepCopy(sourceLayer.cells),
    curves: deepCopy(sourceLayer.curves),
    edges: deepCopy(sourceLayer.edges),
    objects: mode === 'all' ? deepCopy(sourceLayer.objects) : [],
    textLabels: mode === 'all' ? deepCopy(sourceLayer.textLabels) : [],
    fogOfWar: mode === 'all' && sourceLayer.fogOfWar ? deepCopy(sourceLayer.fogOfWar) : null,
    tiles: deepCopy(sourceLayer.tiles ?? []),
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
  
  // Check schemaVersion is set correctly
  if (migratedData.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`Migration failed: schemaVersion incorrect (expected: ${SCHEMA_VERSION}, got: ${migratedData.schemaVersion})`);
  }
  
  return { 
    valid: errors.length === 0, 
    errors 
  };
}

/**
 * Migrate legacy (v1) map data to the new layer schema (v2)
 * Includes backup creation and validation with automatic rollback on failure
 */
function migrateToLayerSchema(legacyMapData: LegacyMapData): MapData | LegacyMapData {
  // Already migrated? Return as-is
  if ((legacyMapData.schemaVersion ?? 0) >= SCHEMA_VERSION && 'layers' in legacyMapData) {
    return legacyMapData as MapData;
  }
  
  console.debug('[layerAccessor] Starting migration to schema version', SCHEMA_VERSION);

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
      schemaVersion: SCHEMA_VERSION,
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
    
    console.debug('[layerAccessor] Migration successful to schema version', SCHEMA_VERSION);

    return cleanedData as MapData;

  } catch (error) {
    console.error('[layerAccessor] Migration failed with error:', error);
    console.error('[layerAccessor] Restoring from backup');
    return backup; // Return the backup (original data)
  }
}

/**
 * Check if map data needs migration
 */
function needsMigration(mapData: MapData | LegacyMapData | null | undefined): boolean {
  if (!mapData) return false;
  
  // Needs migration if no schemaVersion, or version is old, or no layers array
  const needsIt = mapData.schemaVersion == null ||
                  mapData.schemaVersion < SCHEMA_VERSION ||
                  !('layers' in mapData);

  if (needsIt) {
    console.debug('[layerAccessor] Map needs migration:', {
      currentVersion: mapData.schemaVersion ?? 'none',
      targetVersion: SCHEMA_VERSION,
      hasLayers: 'layers' in mapData
    });
  }

  return needsIt;
}

// ============================================================================
// FOG OF WAR FUNCTIONS
// ============================================================================

/**
 * Initialize fog of war for a layer (first use)
 * Creates the fogOfWar structure with empty foggedCells array
 */
function initializeFogOfWar(mapData: MapData, layerId: LayerId): MapData {
  return updateLayer(mapData, layerId, {
    fogOfWar: {
      enabled: true,
      foggedCells: [],
      texture: null
    }
  });
}

/**
 * Check if a cell is fogged
 */
function isCellFogged(layer: MapLayer, col: number, row: number): boolean {
  if (!layer.fogOfWar || !layer.fogOfWar.enabled) return false;
  return layer.fogOfWar.foggedCells.some(c => c.col === col && c.row === row);
}

/**
 * Add fog to a single cell
 */
function fogCell(layer: MapLayer, col: number, row: number): MapLayer {
  if (!layer.fogOfWar) return layer;
  if (isCellFogged(layer, col, row)) return layer; // Already fogged
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, { col, row }]
    }
  };
}

/**
 * Remove fog from a single cell (reveal it)
 */
function revealCell(layer: MapLayer, col: number, row: number): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: layer.fogOfWar.foggedCells.filter(
        c => !(c.col === col && c.row === row)
      )
    }
  };
}

/**
 * Normalize rectangle corners and apply a fog operation to cells within bounds.
 */
function modifyRectangleFog(
  layer: MapLayer,
  startCol: number,
  startRow: number,
  endCol: number,
  endRow: number,
  operation: 'fog' | 'reveal'
): MapLayer {
  if (!layer.fogOfWar) return layer;

  const minCol = Math.min(startCol, endCol);
  const maxCol = Math.max(startCol, endCol);
  const minRow = Math.min(startRow, endRow);
  const maxRow = Math.max(startRow, endRow);

  if (operation === 'reveal') {
    return {
      ...layer,
      fogOfWar: {
        ...layer.fogOfWar,
        foggedCells: layer.fogOfWar.foggedCells.filter(c =>
          c.col < minCol || c.col > maxCol || c.row < minRow || c.row > maxRow
        )
      }
    };
  }

  // fog: add cells not already fogged
  const existingSet = new Set(
    layer.fogOfWar.foggedCells.map(c => `${c.col},${c.row}`)
  );
  const newCells: FoggedCell[] = [];
  for (let col = minCol; col <= maxCol; col++) {
    for (let row = minRow; row <= maxRow; row++) {
      if (!existingSet.has(`${col},${row}`)) {
        newCells.push({ col, row });
      }
    }
  }
  if (newCells.length === 0) return layer;
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, ...newCells]
    }
  };
}

function fogRectangle(layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number): MapLayer {
  return modifyRectangleFog(layer, startCol, startRow, endCol, endRow, 'fog');
}

function revealRectangle(layer: MapLayer, startCol: number, startRow: number, endCol: number, endRow: number): MapLayer {
  return modifyRectangleFog(layer, startCol, startRow, endCol, endRow, 'reveal');
}

/**
 * Add fog to all cells within bounds
 */
function fogAll(layer: MapLayer, bounds: FogBounds): MapLayer {
  if (!layer.fogOfWar) return layer;

  const allCells: FoggedCell[] = [];
  for (let col = 0; col < bounds.maxCol; col++) {
    for (let row = 0; row < bounds.maxRow; row++) {
      allCells.push({ col, row });
    }
  }
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: allCells
    }
  };
}

/**
 * Fog all painted cells on a layer
 * For unbounded maps where we only want to fog cells that have been drawn
 */
function fogPaintedCells(layer: MapLayer, geometry: IGeometry): MapLayer {
  if (!layer.fogOfWar) return layer;
  if (layer.cells.length === 0) return layer;
  if (typeof geometry.cellToOffsetCoords !== 'function') {
    console.warn('[fogPaintedCells] Invalid geometry provided');
    return layer;
  }
  
  const existingFogged = new Set(
    layer.fogOfWar.foggedCells.map(c => `${c.col},${c.row}`)
  );
  
  const newCells: FoggedCell[] = [];
  for (const cell of layer.cells) {
    const { col, row } = geometry.cellToOffsetCoords(cell);
    const key = `${col},${row}`;
    if (!existingFogged.has(key)) {
      newCells.push({ col, row });
      existingFogged.add(key);
    }
  }
  
  if (newCells.length === 0) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: [...layer.fogOfWar.foggedCells, ...newCells]
    }
  };
}

/**
 * Remove all fog from a layer (reveal everything)
 */
function revealAll(layer: MapLayer): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      foggedCells: []
    }
  };
}

/**
 * Toggle fog visibility without changing fogged cells
 */
function toggleFogVisibility(layer: MapLayer): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      enabled: !layer.fogOfWar.enabled
    }
  };
}

/**
 * Set fog visibility explicitly
 */
function setFogVisibility(layer: MapLayer, enabled: boolean): MapLayer {
  if (!layer.fogOfWar) return layer;
  
  return {
    ...layer,
    fogOfWar: {
      ...layer.fogOfWar,
      enabled
    }
  };
}

/**
 * Check if a layer has any fog data (regardless of visibility)
 */
function hasFogData(layer: MapLayer): boolean {
  return layer.fogOfWar != null && layer.fogOfWar.foggedCells.length > 0;
}

/**
 * Get fog state summary for UI display
 */
function getFogState(layer: MapLayer): FogState {
  if (!layer.fogOfWar) {
    return { initialized: false, enabled: false, cellCount: 0 };
  }
  return {
    initialized: true,
    enabled: layer.fogOfWar.enabled,
    cellCount: layer.fogOfWar.foggedCells.length
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  generateLayerId,
  getActiveLayer, getLayersOrdered, getLayerById, getLayerIndex, getLayerBelow,
  updateLayer, updateActiveLayer, setActiveLayer, addLayer, cloneLayer, removeLayer, reorderLayers,
  migrateToLayerSchema, needsMigration,
  // Board (floor) projection
  DEFAULT_BOARD_ID, generateBoardId, layerBoardId, getBoardsOrdered, getActiveBoardId,
  getBoardLayers, getActiveBoardLayers, ensureBoards, addBoard, removeBoard, setActiveBoard,
  initializeFogOfWar, isCellFogged, fogCell, revealCell,
  fogRectangle, revealRectangle, fogAll, fogPaintedCells, revealAll,
  toggleFogVisibility, setFogVisibility, hasFogData, getFogState
};