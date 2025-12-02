const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Import getObjectType from the resolver (handles overrides, custom objects, fallback)
const { getObjectType } = await requireModuleByName("objectTypeResolver.js");
const { 
  assignSlot, 
  getObjectsInCell, 
  canAddObjectToCell, 
  getOccupiedSlots,
  reorganizeAfterRemoval 
} = await requireModuleByName("hexSlotPositioner.js");

// Note: getObjectType is imported from objectTypeResolver.js
// It handles built-in objects, overrides, custom objects, and unknown fallback

/**
 * Generate a unique ID for an object
 * @returns {string} UUID string
 */
function generateObjectId() {
  return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Find object at specific grid coordinates
 * @param {Array} objects - Array of objects
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Object|null} Object at position or null
 */
function getObjectAtPosition(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return null;
  
  return objects.find(obj => {
    // Ensure size exists (backward compatibility)
    const size = obj.size || { width: 1, height: 1 };
    const pos = obj.position;
    
    // Check if (x, y) is within object bounds
    return x >= pos.x && x < pos.x + size.width &&
           y >= pos.y && y < pos.y + size.height;
  }) || null;
}

/**
 * Add a new object to the objects array
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Array} New objects array with added object
 */
function addObject(objects, typeId, x, y) {
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    console.error(`Unknown object type: ${typeId}`);
    return objects;
  }
  
  // Check if object already exists at position
  const existing = getObjectAtPosition(objects, x, y);
  if (existing) {
    console.warn(`Object already exists at position (${x}, ${y})`);
    return objects;
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,  // Phase 1: Note integration - path to linked note
    alignment: 'center'  // Default: 'center' | 'north' | 'south' | 'east' | 'west'
  };
  
  return [...objects, newObject];
}

/**
 * Add a new object to a hex cell with automatic slot assignment.
 * Supports up to 4 objects per hex cell.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID
 * @param {number} x - Hex q coordinate
 * @param {number} y - Hex r coordinate
 * @returns {{ objects: Array, success: boolean, error?: string }} Result with new array or error
 */
function addObjectToHex(objects, typeId, x, y) {
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    return { 
      objects, 
      success: false, 
      error: `Unknown object type: ${typeId}` 
    };
  }
  
  // Check if cell can accept another object
  if (!canAddObjectToCell(objects, x, y)) {
    return { 
      objects, 
      success: false, 
      error: 'Cell is full (maximum 4 objects)' 
    };
  }
  
  // Get occupied slots and assign next available
  const occupiedSlots = getOccupiedSlots(objects, x, y);
  const slot = assignSlot(occupiedSlots);
  
  if (slot === -1) {
    return { 
      objects, 
      success: false, 
      error: 'No available slots' 
    };
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment: 'center',
    slot: slot  // Slot assignment for multi-object cells
  };
  
  return { 
    objects: [...objects, newObject], 
    success: true 
  };
}

/**
 * Remove object by ID
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to remove
 * @returns {Array} New objects array without the specified object
 */
function removeObject(objects, objectId) {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => obj.id !== objectId);
}

/**
 * Remove object by ID from a hex map, with slot reorganization.
 * After removal, remaining objects in the same cell have their slots
 * reorganized to maintain compact arrangement.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to remove
 * @returns {Array} New objects array with object removed and slots reorganized
 */
function removeObjectFromHex(objects, objectId) {
  if (!objects || !Array.isArray(objects)) return [];
  
  // Find the object to get its position before removal
  const objectToRemove = objects.find(obj => obj.id === objectId);
  if (!objectToRemove) return objects;
  
  const { x, y } = objectToRemove.position;
  
  // Remove the object
  const afterRemoval = objects.filter(obj => obj.id !== objectId);
  
  // Reorganize remaining slots in that cell
  return reorganizeAfterRemoval(afterRemoval, x, y);
}

/**
 * Remove object at specific position
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Array} New objects array without object at position
 */
function removeObjectAtPosition(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => !(obj.position.x === x && obj.position.y === y));
}

/**
 * Remove a single object from a hex cell (the one with the highest slot number).
 * Use this for eraser tool on hex maps - removes one object at a time.
 * After removal, remaining objects have their slots reorganized.
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Hex q coordinate
 * @param {number} y - Hex r coordinate
 * @returns {Array} New objects array with one object removed
 */
function removeOneObjectFromHex(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  
  // Get objects in this cell
  const cellObjects = getObjectsInCell(objects, x, y);
  if (cellObjects.length === 0) return objects;
  
  // Find object with highest slot (most recently added)
  // If no slots assigned, just remove the last one
  const toRemove = cellObjects.reduce((highest, obj) => {
    const objSlot = obj.slot ?? -1;
    const highestSlot = highest.slot ?? -1;
    return objSlot > highestSlot ? obj : highest;
  }, cellObjects[0]);
  
  // Remove and reorganize
  return removeObjectFromHex(objects, toRemove.id);
}

/**
 * Remove all objects within a rectangular area
 * @param {Array} objects - Current objects array
 * @param {number} x1 - First corner X
 * @param {number} y1 - First corner Y
 * @param {number} x2 - Second corner X
 * @param {number} y2 - Second corner Y
 * @returns {Array} New objects array without objects in rectangle
 */
function removeObjectsInRectangle(objects, x1, y1, x2, y2) {
  if (!objects || !Array.isArray(objects)) return [];
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return objects.filter(obj => {
    return !(obj.position.x >= minX && obj.position.x <= maxX && 
             obj.position.y >= minY && obj.position.y <= maxY);
  });
}

/**
 * Update object properties by ID
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to update
 * @param {Object} updates - Object with properties to update
 * @returns {Array} New objects array with updated object
 */
function updateObject(objects, objectId, updates) {
  if (!objects || !Array.isArray(objects)) return [];
  
  return objects.map(obj => {
    if (obj.id === objectId) {
      return { ...obj, ...updates };
    }
    return obj;
  });
}

/**
 * Check if an area is occupied by any object (excluding optional exception)
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @param {number} width - Width in grid cells
 * @param {number} height - Height in grid cells
 * @param {string} excludeId - Optional object ID to exclude from check
 * @returns {boolean} True if area is free, false if occupied
 */
function isAreaFree(objects, x, y, width, height, excludeId = null) {
  if (!objects || !Array.isArray(objects)) return true;
  
  for (const obj of objects) {
    if (excludeId && obj.id === excludeId) continue;
    
    const size = obj.size || { width: 1, height: 1 };
    const pos = obj.position;
    
    // Check if rectangles overlap
    const objRight = pos.x + size.width;
    const objBottom = pos.y + size.height;
    const areaRight = x + width;
    const areaBottom = y + height;
    
    const overlaps = !(objRight <= x || pos.x >= areaRight || 
                      objBottom <= y || pos.y >= areaBottom);
    
    if (overlaps) return false;
  }
  
  return true;
}

/**
 * Check if an object can be resized to new dimensions
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to resize
 * @param {number} newWidth - New width in grid cells
 * @param {number} newHeight - New height in grid cells
 * @param {number} maxSize - Maximum size allowed (default 5)
 * @returns {boolean} True if resize is valid
 */
function canResizeObject(objects, objectId, newWidth, newHeight, maxSize = 5) {
  if (newWidth < 1 || newHeight < 1) return false;
  if (newWidth > maxSize || newHeight > maxSize) return false;
  
  const object = objects.find(obj => obj.id === objectId);
  if (!object) return false;
  
  // Check if new size would overlap with other objects
  return isAreaFree(objects, object.position.x, object.position.y, newWidth, newHeight, objectId);
}

/**
 * Calculate the nearest edge alignment based on pointer position within a cell
 * @param {number} pointerX - Pointer X in grid coordinates (can be fractional)
 * @param {number} pointerY - Pointer Y in grid coordinates (can be fractional)
 * @param {number} gridX - Snapped grid X coordinate
 * @param {number} gridY - Snapped grid Y coordinate
 * @param {number} threshold - Distance threshold for edge detection (0-0.5, default 0.3)
 * @returns {string} Alignment: 'center' | 'north' | 'south' | 'east' | 'west'
 */
function calculateEdgeAlignment(pointerX, pointerY, gridX, gridY, threshold = 0.3) {
  // Calculate position within the cell (0-1 range)
  const offsetX = pointerX - gridX;
  const offsetY = pointerY - gridY;
  
  // Check edges in order of priority
  // Use threshold to determine if we're close enough to an edge
  if (offsetY < threshold) return 'north';
  if (offsetY > (1 - threshold)) return 'south';
  if (offsetX < threshold) return 'west';
  if (offsetX > (1 - threshold)) return 'east';
  
  return 'center';
}

/**
 * Get the position offset for a given alignment
 * @param {string} alignment - Alignment: 'center' | 'north' | 'south' | 'east' | 'west'
 * @returns {Object} { offsetX, offsetY } in grid cell units (-0.5 to 0.5)
 */
function getAlignmentOffset(alignment) {
  switch (alignment) {
    case 'north': return { offsetX: 0, offsetY: -0.5 };
    case 'south': return { offsetX: 0, offsetY: 0.5 };
    case 'east': return { offsetX: 0.5, offsetY: 0 };
    case 'west': return { offsetX: -0.5, offsetY: 0 };
    case 'center':
    default: return { offsetX: 0, offsetY: 0 };
  }
}

// =============================================================================
// UNIFIED PLACEMENT API
// =============================================================================
// These functions provide a consistent interface for object operations
// regardless of map type (grid vs hex). They encapsulate the map-type-specific
// logic and return structured results suitable for TypeScript migration.
// =============================================================================

/**
 * @typedef {'grid' | 'hex'} MapType
 */

/**
 * @typedef {Object} PlacementOptions
 * @property {MapType} mapType - The type of map ('grid' or 'hex')
 * @property {string} [alignment] - Object alignment for grid maps ('center' | 'north' | 'south' | 'east' | 'west')
 */

/**
 * @typedef {Object} PlacementResult
 * @property {Array} objects - The updated objects array
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} [error] - Error message if operation failed
 * @property {Object} [object] - The newly created object (on success)
 */

/**
 * @typedef {Object} RemovalResult
 * @property {Array} objects - The updated objects array
 * @property {boolean} success - Whether any object was removed
 * @property {Object} [removed] - The removed object (if any)
 */

/**
 * Place an object at the specified position.
 * Handles both grid (single object per cell) and hex (up to 4 objects per cell) maps.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID from objectTypes
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {PlacementOptions} options - Placement options including mapType
 * @returns {PlacementResult} Result with updated objects array and status
 * 
 * @example
 * // Grid map placement with edge alignment
 * const result = placeObject(objects, 'chest', 5, 3, { mapType: 'grid', alignment: 'north' });
 * if (result.success) {
 *   setObjects(result.objects);
 * }
 * 
 * @example
 * // Hex map placement (auto slot assignment)
 * const result = placeObject(objects, 'treasure', 2, 4, { mapType: 'hex' });
 * if (!result.success) {
 *   console.log(result.error); // "Cell is full (maximum 4 objects)"
 * }
 */
function placeObject(objects, typeId, x, y, options) {
  const { mapType, alignment = 'center' } = options;
  
  if (mapType === 'hex') {
    // Hex: use multi-object placement with slot assignment
    const result = addObjectToHex(objects, typeId, x, y);
    if (result.success) {
      const newObject = result.objects[result.objects.length - 1];
      return { ...result, object: newObject };
    }
    return result;
  }
  
  // Grid: single object per cell
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    return { 
      objects, 
      success: false, 
      error: `Unknown object type: ${typeId}` 
    };
  }
  
  const existing = getObjectAtPosition(objects, x, y);
  if (existing) {
    return { 
      objects, 
      success: false, 
      error: `Cell (${x}, ${y}) is occupied` 
    };
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment
  };
  
  return { 
    objects: [...objects, newObject], 
    success: true,
    object: newObject
  };
}

/**
 * Remove object(s) at the specified position.
 * - Grid maps: removes all objects at position (typically just one)
 * - Hex maps: removes one object (highest slot), reorganizes remaining slots
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {MapType} mapType - The type of map ('grid' or 'hex')
 * @returns {RemovalResult} Result with updated objects array and status
 * 
 * @example
 * // Hex map: removes one object at a time
 * let result = eraseObjectAt(objects, 2, 4, 'hex');
 * while (result.success) {
 *   objects = result.objects;
 *   result = eraseObjectAt(objects, 2, 4, 'hex');
 * }
 */
function eraseObjectAt(objects, x, y, mapType) {
  if (!objects || !Array.isArray(objects)) {
    return { objects: [], success: false };
  }
  
  // Check if any object exists at position
  const existing = getObjectAtPosition(objects, x, y);
  if (!existing) {
    return { objects, success: false };
  }
  
  if (mapType === 'hex') {
    // Hex: remove one object (highest slot), reorganize remaining
    const newObjects = removeOneObjectFromHex(objects, x, y);
    // Find what was removed by comparing arrays
    const removed = objects.find(o => !newObjects.some(n => n.id === o.id));
    return { 
      objects: newObjects, 
      success: true,
      removed
    };
  }
  
  // Grid: remove all objects at position
  const newObjects = removeObjectAtPosition(objects, x, y);
  return { 
    objects: newObjects, 
    success: true,
    removed: existing
  };
}

/**
 * Check if an object can be placed at the specified position.
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {MapType} mapType - The type of map ('grid' or 'hex')
 * @returns {boolean} True if placement is allowed
 */
function canPlaceObjectAt(objects, x, y, mapType) {
  if (mapType === 'hex') {
    return canAddObjectToCell(objects, x, y);
  }
  // Grid: check if cell is empty
  return getObjectAtPosition(objects, x, y) === null;
}

return { 
  // Core operations
  getObjectType,
  generateObjectId,
  getObjectAtPosition,
  updateObject,
  isAreaFree,
  canResizeObject,
  
  // Grid-specific operations (legacy, prefer unified API)
  addObject,
  removeObject,
  removeObjectAtPosition,
  removeObjectsInRectangle,
  calculateEdgeAlignment,
  getAlignmentOffset,
  
  // Hex-specific operations (internal, prefer unified API)
  addObjectToHex,
  removeObjectFromHex,
  removeOneObjectFromHex,
  
  // Unified API (preferred for new code)
  placeObject,
  eraseObjectAt,
  canPlaceObjectAt
};