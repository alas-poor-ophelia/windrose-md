/**
 * hexSlotPositioner.js
 * 
 * Manages object positioning within hex cells for multi-object support.
 * 
 * Slot arrangements vary by object count:
 * - 1 object:  Center
 * - 2 objects: Horizontal row (flat-top) or vertical stack (pointy-top)
 * - 3 objects: Triangle formation
 * - 4 objects: Diamond/cross pattern
 * 
 * Offsets are in hex-size units (-0.5 to 0.5 range), where 1.0 = full hex width/height.
 * These get multiplied by the actual hex size during rendering.
 */

/**
 * Flat-top hex arrangements
 * For flat-top hexes, the "top" is a flat edge, so horizontal arrangements
 * work well as there's more horizontal space.
 */
const FLAT_TOP_ARRANGEMENTS = {
  1: [
    { slot: 0, offsetX: 0, offsetY: 0 }
  ],
  2: [
    { slot: 0, offsetX: -0.22, offsetY: 0 },
    { slot: 1, offsetX: 0.22, offsetY: 0 }
  ],
  3: [
    { slot: 0, offsetX: -0.20, offsetY: -0.15 },
    { slot: 1, offsetX: 0.20, offsetY: -0.15 },
    { slot: 2, offsetX: 0, offsetY: 0.20 }
  ],
  4: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },      // North
    { slot: 1, offsetX: 0.20, offsetY: 0 },       // East
    { slot: 2, offsetX: 0, offsetY: 0.20 },       // South
    { slot: 3, offsetX: -0.20, offsetY: 0 }       // West
  ]
};

/**
 * Pointy-top hex arrangements
 * For pointy-top hexes, the "top" is a point, so vertical arrangements
 * work better as there's more vertical space.
 */
const POINTY_TOP_ARRANGEMENTS = {
  1: [
    { slot: 0, offsetX: 0, offsetY: 0 }
  ],
  2: [
    { slot: 0, offsetX: 0, offsetY: -0.22 },
    { slot: 1, offsetX: 0, offsetY: 0.22 }
  ],
  3: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },
    { slot: 1, offsetX: -0.18, offsetY: 0.15 },
    { slot: 2, offsetX: 0.18, offsetY: 0.15 }
  ],
  4: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },      // North
    { slot: 1, offsetX: 0.20, offsetY: 0 },       // East
    { slot: 2, offsetX: 0, offsetY: 0.20 },       // South
    { slot: 3, offsetX: -0.20, offsetY: 0 }       // West
  ]
};

/**
 * Get slot offset for rendering
 * @param {number} slot - Slot index (0-3)
 * @param {number} objectCount - Total objects in this cell (1-4)
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {{ offsetX: number, offsetY: number }}
 */
function getSlotOffset(slot, objectCount, orientation = 'flat') {
  const arrangements = orientation === 'pointy' 
    ? POINTY_TOP_ARRANGEMENTS 
    : FLAT_TOP_ARRANGEMENTS;
  
  // Clamp object count to valid range
  const count = Math.min(Math.max(objectCount, 1), 4);
  const arrangement = arrangements[count];
  const position = arrangement?.find(p => p.slot === slot);
  
  return position 
    ? { offsetX: position.offsetX, offsetY: position.offsetY }
    : { offsetX: 0, offsetY: 0 };
}

/**
 * Assign next available slot for a new object
 * @param {number[]} existingSlots - Slots already occupied in cell
 * @returns {number} Next available slot (0-3), or -1 if cell is full
 */
function assignSlot(existingSlots) {
  for (let i = 0; i < 4; i++) {
    if (!existingSlots.includes(i)) {
      return i;
    }
  }
  return -1; // Cell is full
}

/**
 * Reorganize slots after object removal to maintain compact arrangement
 * This ensures objects are always in slots 0, 1, 2... without gaps.
 * 
 * @param {number[]} currentSlots - Current slot assignments (may have gaps)
 * @returns {Map<number, number>} Map of oldSlot -> newSlot for slots that need updating
 * 
 * @example
 * // If objects are in slots [0, 2, 3] after removing slot 1:
 * reorganizeSlots([0, 2, 3])
 * // Returns: Map { 2 -> 1, 3 -> 2 }
 * // Slot 0 stays, slot 2 becomes 1, slot 3 becomes 2
 */
function reorganizeSlots(currentSlots) {
  // Sort existing slots
  const sorted = [...currentSlots].sort((a, b) => a - b);
  const remapping = new Map();
  
  // Assign new slots sequentially (0, 1, 2, ...)
  sorted.forEach((oldSlot, newSlot) => {
    if (oldSlot !== newSlot) {
      remapping.set(oldSlot, newSlot);
    }
  });
  
  return remapping;
}

/**
 * Get the maximum number of objects allowed per cell
 * @returns {number}
 */
function getMaxObjectsPerCell() {
  return 4;
}

/**
 * Calculate scale factor for objects in multi-object cells
 * Objects should be smaller when sharing space to avoid overlap.
 * 
 * @param {number} objectCount - Number of objects in cell
 * @returns {number} Scale factor (0.55-1.0)
 */
function getMultiObjectScale(objectCount) {
  if (objectCount <= 1) return 1.0;
  if (objectCount === 2) return 0.7;
  if (objectCount === 3) return 0.6;
  return 0.55; // 4 objects
}

/**
 * Get objects in a specific cell
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate (q for hex)
 * @param {number} y - Cell y coordinate (r for hex)
 * @returns {Array} Objects in this cell
 */
function getObjectsInCell(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  
  return objects.filter(obj => 
    obj.position && 
    obj.position.x === x && 
    obj.position.y === y
  );
}

/**
 * Check if a cell can accept another object
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {boolean} True if cell has room for another object
 */
function canAddObjectToCell(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  return cellObjects.length < getMaxObjectsPerCell();
}

/**
 * Get occupied slots in a cell
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {number[]} Array of occupied slot indices
 */
function getOccupiedSlots(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  return cellObjects
    .map(obj => obj.slot)
    .filter(slot => slot !== undefined && slot !== null);
}

/**
 * Prepare objects array after removing an object from a multi-object cell.
 * Reorganizes remaining objects to fill gaps in slot assignments.
 * 
 * @param {Array} objects - Current objects array (after removal)
 * @param {number} x - Cell x coordinate where object was removed
 * @param {number} y - Cell y coordinate where object was removed
 * @returns {Array} Updated objects array with reorganized slots
 */
function reorganizeAfterRemoval(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  
  // If 0 or 1 objects remain, no reorganization needed
  if (cellObjects.length <= 1) {
    // Reset single object to slot 0 if it has a different slot
    if (cellObjects.length === 1 && cellObjects[0].slot !== 0) {
      return objects.map(obj => {
        if (obj.id === cellObjects[0].id) {
          return { ...obj, slot: 0 };
        }
        return obj;
      });
    }
    return objects;
  }
  
  // Get current slots and compute remapping
  const currentSlots = cellObjects.map(obj => obj.slot).filter(s => s !== undefined);
  const remapping = reorganizeSlots(currentSlots);
  
  // If no remapping needed, return unchanged
  if (remapping.size === 0) return objects;
  
  // Apply remapping to objects in this cell
  return objects.map(obj => {
    if (obj.position?.x === x && obj.position?.y === y && obj.slot !== undefined) {
      const newSlot = remapping.get(obj.slot);
      if (newSlot !== undefined) {
        return { ...obj, slot: newSlot };
      }
    }
    return obj;
  });
}

/**
 * Find which object in a multi-object cell was clicked based on proximity to slot positions.
 * 
 * @param {Array} objects - All objects array
 * @param {number} hexX - Hex q coordinate
 * @param {number} hexY - Hex r coordinate  
 * @param {number} clickOffsetX - Click offset from hex center (in hex-width units, roughly -0.5 to 0.5)
 * @param {number} clickOffsetY - Click offset from hex center (in hex-width units, roughly -0.5 to 0.5)
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {Object|null} The clicked object, or null if no objects in cell
 */
function getClickedObjectInCell(objects, hexX, hexY, clickOffsetX, clickOffsetY, orientation) {
  const cellObjects = getObjectsInCell(objects, hexX, hexY);
  
  if (cellObjects.length === 0) return null;
  if (cellObjects.length === 1) return cellObjects[0];
  
  // Find object whose slot position is closest to click point
  let closest = null;
  let closestDist = Infinity;
  
  for (const obj of cellObjects) {
    // Get slot position (default to slot 0 if undefined)
    const effectiveSlot = obj.slot ?? cellObjects.indexOf(obj);
    const { offsetX, offsetY } = getSlotOffset(
      effectiveSlot,
      cellObjects.length,
      orientation
    );
    
    // Calculate distance from click to this slot position
    const dist = Math.sqrt(
      Math.pow(clickOffsetX - offsetX, 2) +
      Math.pow(clickOffsetY - offsetY, 2)
    );
    
    if (dist < closestDist) {
      closestDist = dist;
      closest = obj;
    }
  }
  
  return closest;
}

return {
  // Arrangement data
  FLAT_TOP_ARRANGEMENTS,
  POINTY_TOP_ARRANGEMENTS,
  
  // Core positioning functions
  getSlotOffset,
  assignSlot,
  reorganizeSlots,
  
  // Utility functions
  getMaxObjectsPerCell,
  getMultiObjectScale,
  getObjectsInCell,
  canAddObjectToCell,
  getOccupiedSlots,
  reorganizeAfterRemoval,
  getClickedObjectInCell
};