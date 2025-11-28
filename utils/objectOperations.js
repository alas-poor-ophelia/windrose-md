const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { OBJECT_TYPES } = await requireModuleByName("objectTypes.js");

/**
 * Get object type definition by ID
 * @param {string} typeId - The object type ID
 * @returns {Object|null} Object type definition or null if not found
 */
function getObjectType(typeId) {
  return OBJECT_TYPES.find(type => type.id === typeId) || null;
}

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
  if (!objectType) {
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

return { 
  getObjectType,
  generateObjectId,
  getObjectAtPosition,
  addObject,
  removeObject,
  removeObjectAtPosition,
  removeObjectsInRectangle,
  updateObject,
  isAreaFree,
  canResizeObject,
  calculateEdgeAlignment,
  getAlignmentOffset
};