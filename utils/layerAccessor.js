/**
 * layerAccessor.js
 * Helper functions for accessing and manipulating layer data in Windrose maps.
 * Part of Phase 1: Z-Layer Architecture
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { SCHEMA_VERSION } = await requireModuleByName("dmtConstants.js");

// ============================================================================
// UUID GENERATION
// ============================================================================

/**
 * Generate a unique ID for a layer
 * @returns {string} UUID string with 'layer-' prefix
 */
function generateLayerId() {
  return 'layer-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ============================================================================
// LAYER ACCESS FUNCTIONS
// ============================================================================

/**
 * Get the currently active layer data
 * @param {Object} mapData - The full map data object
 * @returns {Object} The active layer object, or a legacy fallback
 */
function getActiveLayer(mapData) {
  if (!mapData?.layers || !mapData.activeLayerId) {
    // Legacy fallback (should not happen after migration)
    return {
      id: 'legacy',
      name: 'Layer 1',
      order: 0,
      visible: true,
      cells: mapData?.cells || [],
      edges: mapData?.edges || [],
      objects: mapData?.objects || [],
      textLabels: mapData?.textLabels || [],
      fogOfWar: null
    };
  }
  return mapData.layers.find(l => l.id === mapData.activeLayerId) || mapData.layers[0];
}

/**
 * Get all layers sorted by order (ascending - lowest order first)
 * @param {Object} mapData - The full map data object
 * @returns {Array} Array of layer objects sorted by order
 */
function getLayersOrdered(mapData) {
  if (!mapData?.layers) return [];
  return [...mapData.layers].sort((a, b) => a.order - b.order);
}

/**
 * Get layer by ID
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to find
 * @returns {Object|null} The layer object or null if not found
 */
function getLayerById(mapData, layerId) {
  return mapData?.layers?.find(l => l.id === layerId) || null;
}

/**
 * Get the index of a layer in the layers array
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to find
 * @returns {number} Index of the layer, or -1 if not found
 */
function getLayerIndex(mapData, layerId) {
  if (!mapData?.layers) return -1;
  return mapData.layers.findIndex(l => l.id === layerId);
}

// ============================================================================
// LAYER MODIFICATION FUNCTIONS
// ============================================================================

/**
 * Update a specific layer's data (immutable)
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to update
 * @param {Object} updates - Object with fields to update
 * @returns {Object} New mapData with updated layer
 */
function updateLayer(mapData, layerId, updates) {
  if (!mapData?.layers) return mapData;
  
  return {
    ...mapData,
    layers: mapData.layers.map(layer =>
      layer.id === layerId ? { ...layer, ...updates } : layer
    )
  };
}

/**
 * Update the active layer's data (convenience function)
 * @param {Object} mapData - The full map data object
 * @param {Object} updates - Object with fields to update
 * @returns {Object} New mapData with updated active layer
 */
function updateActiveLayer(mapData, updates) {
  if (!mapData?.activeLayerId) return mapData;
  return updateLayer(mapData, mapData.activeLayerId, updates);
}

/**
 * Set the active layer by ID
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to make active
 * @returns {Object} New mapData with updated activeLayerId
 */
function setActiveLayer(mapData, layerId) {
  // Verify the layer exists
  if (!getLayerById(mapData, layerId)) {
    console.warn(`Cannot set active layer: layer ${layerId} not found`);
    return mapData;
  }
  
  return {
    ...mapData,
    activeLayerId: layerId
  };
}

/**
 * Add a new layer to the map
 * @param {Object} mapData - The full map data object
 * @param {string|null} name - Optional custom name for the layer
 * @returns {Object} New mapData with added layer (and activeLayerId set to new layer)
 */
function addLayer(mapData, name = null) {
  if (!mapData?.layers) return mapData;
  
  // Calculate new order (one higher than current max)
  const maxOrder = mapData.layers.length > 0
    ? Math.max(...mapData.layers.map(l => l.order))
    : -1;
  
  const newLayer = {
    id: generateLayerId(),
    name: name || `Layer ${mapData.layers.length + 1}`,
    order: maxOrder + 1,
    visible: true,
    cells: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null
  };
  
  return {
    ...mapData,
    layers: [...mapData.layers, newLayer],
    activeLayerId: newLayer.id  // Auto-switch to new layer
  };
}

/**
 * Remove a layer from the map (prevents removing last layer)
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to remove
 * @returns {Object} New mapData without the specified layer
 */
function removeLayer(mapData, layerId) {
  if (!mapData?.layers) return mapData;
  
  // Prevent removing the last layer
  if (mapData.layers.length <= 1) {
    console.warn('Cannot remove last layer');
    return mapData;
  }
  
  const newLayers = mapData.layers.filter(l => l.id !== layerId);
  const wasActive = mapData.activeLayerId === layerId;
  
  // If we removed the active layer, switch to the first remaining layer
  // (sorted by order for consistency)
  let newActiveId = mapData.activeLayerId;
  if (wasActive) {
    const sortedRemaining = [...newLayers].sort((a, b) => a.order - b.order);
    newActiveId = sortedRemaining[0].id;
  }
  
  return {
    ...mapData,
    layers: newLayers,
    activeLayerId: newActiveId
  };
}

/**
 * Reorder layers by moving a layer to a new position
 * @param {Object} mapData - The full map data object
 * @param {string} layerId - The layer ID to move
 * @param {number} newIndex - The new index position (0-based, in sorted order)
 * @returns {Object} New mapData with reordered layers
 */
function reorderLayers(mapData, layerId, newIndex) {
  if (!mapData?.layers) return mapData;
  
  // Get layers sorted by current order
  const sortedLayers = getLayersOrdered(mapData);
  const currentIndex = sortedLayers.findIndex(l => l.id === layerId);
  
  if (currentIndex === -1) {
    console.warn(`Cannot reorder: layer ${layerId} not found`);
    return mapData;
  }
  
  // Clamp newIndex to valid range
  const clampedIndex = Math.max(0, Math.min(newIndex, sortedLayers.length - 1));
  
  if (currentIndex === clampedIndex) {
    return mapData; // No change needed
  }
  
  // Remove layer from current position and insert at new position
  const [movedLayer] = sortedLayers.splice(currentIndex, 1);
  sortedLayers.splice(clampedIndex, 0, movedLayer);
  
  // Reassign order values based on new positions
  const reorderedLayers = sortedLayers.map((layer, index) => ({
    ...layer,
    order: index
  }));
  
  return {
    ...mapData,
    layers: reorderedLayers
  };
}

// ============================================================================
// MIGRATION FUNCTIONS
// ============================================================================

/**
 * Create an empty layer structure (for new layers or migration)
 * @param {string} id - Layer ID
 * @param {string} name - Layer name
 * @param {number} order - Layer order
 * @returns {Object} New layer object with empty content
 */
function createEmptyLayer(id, name, order) {
  return {
    id,
    name,
    order,
    visible: true,
    cells: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null
  };
}

/**
 * Create a deep clone of map data for backup purposes
 * @param {Object} mapData - Map data to clone
 * @returns {Object} Deep cloned copy
 */
function createBackup(mapData) {
  try {
    return JSON.parse(JSON.stringify(mapData));
  } catch (error) {
    console.error('[layerAccessor] Failed to create backup:', error);
    return null;
  }
}

/**
 * Validate that layer data was properly migrated
 * @param {Object} originalData - Original map data before migration
 * @param {Object} migratedData - Migrated map data
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateMigration(originalData, migratedData) {
  const errors = [];
  
  // Check that layers array exists and has content
  if (!migratedData.layers || !Array.isArray(migratedData.layers)) {
    errors.push('Migration failed: layers array missing');
    return { valid: false, errors };
  }
  
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
  const originalCells = originalData.cells || [];
  const originalObjects = originalData.objects || [];
  const originalTextLabels = originalData.textLabels || [];
  const originalEdges = originalData.edges || [];
  
  const layerCells = layer.cells || [];
  const layerObjects = layer.objects || [];
  const layerTextLabels = layer.textLabels || [];
  const layerEdges = layer.edges || [];
  
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
 * 
 * @param {Object} legacyMapData - Map data in legacy format (cells/objects at root)
 * @returns {Object} Map data in new layer format, or original data if migration fails
 */
function migrateToLayerSchema(legacyMapData) {
  // Already migrated? Return as-is
  if (legacyMapData.schemaVersion >= SCHEMA_VERSION && legacyMapData.layers) {
    return legacyMapData;
  }
  
  console.log('[layerAccessor] Starting migration to schema version', SCHEMA_VERSION);
  
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
    
    console.log('[layerAccessor] Migrating data:', {
      cells: cellsData.length,
      edges: edgesData.length,
      objects: objectsData.length,
      textLabels: textLabelsData.length
    });
    
    // Create the layer with copied data
    const layerData = {
      id: layerId,
      name: 'Layer 1',
      order: 0,
      visible: true,
      cells: cellsData,
      edges: edgesData,
      objects: objectsData,
      textLabels: textLabelsData,
      fogOfWar: null
    };
    
    // Build migrated structure (spread original first, then override)
    const migratedData = {
      ...legacyMapData,
      schemaVersion: SCHEMA_VERSION,
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
    delete migratedData.cells;
    delete migratedData.edges;
    delete migratedData.objects;
    delete migratedData.textLabels;
    
    // Store migration metadata for debugging
    migratedData._migratedAt = new Date().toISOString();
    
    console.log('[layerAccessor] Migration successful to schema version', SCHEMA_VERSION);
    
    return migratedData;
    
  } catch (error) {
    console.error('[layerAccessor] Migration failed with error:', error);
    console.error('[layerAccessor] Restoring from backup');
    return backup; // Return the backup (original data)
  }
}

/**
 * Check if map data needs migration
 * @param {Object} mapData - Map data to check
 * @returns {boolean} True if migration is needed
 */
function needsMigration(mapData) {
  if (!mapData) return false;
  
  // Needs migration if no schemaVersion, or version is old, or no layers array
  const needsIt = !mapData.schemaVersion || 
                  mapData.schemaVersion < SCHEMA_VERSION || 
                  !mapData.layers;
  
  if (needsIt) {
    console.log('[layerAccessor] Map needs migration:', {
      currentVersion: mapData.schemaVersion || 'none',
      targetVersion: SCHEMA_VERSION,
      hasLayers: !!mapData.layers
    });
  }
  
  return needsIt;
}

// ============================================================================
// EXPORTS
// ============================================================================

return {
  // Constants (re-exported from dmtConstants for convenience)
  SCHEMA_VERSION,
  
  // UUID generation
  generateLayerId,
  
  // Layer access
  getActiveLayer,
  getLayersOrdered,
  getLayerById,
  getLayerIndex,
  
  // Layer modification
  updateLayer,
  updateActiveLayer,
  setActiveLayer,
  addLayer,
  removeLayer,
  reorderLayers,
  
  // Migration
  createEmptyLayer,
  createBackup,
  validateMigration,
  migrateToLayerSchema,
  needsMigration
};