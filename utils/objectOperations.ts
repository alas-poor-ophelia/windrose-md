/**
 * objectOperations.ts
 * Operations for managing map objects - placement, removal, updates.
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { MapType } from '#types/core/map.types';

// ===========================================
// Local Type Definitions
// (Until object.types.ts is updated with these)
// ===========================================

/** Unique object instance ID */
type ObjectId = string;

/** Object category for grouping in UI */
type ObjectCategory = 
  | 'structures'
  | 'doors'
  | 'furniture'
  | 'hazards'
  | 'nature'
  | 'symbols'
  | 'custom';

/** Object alignment within a cell (grid maps) */
type ObjectAlignment = 'center' | 'north' | 'south' | 'east' | 'west';

/** Object type definition */
interface ObjectTypeDef {
  id: string;
  name: string;
  label?: string;
  category: ObjectCategory;
  symbol: string;
  defaultSize?: number;
  rotatable?: boolean;
  isUnknown?: boolean;
  isCustom?: boolean;
}

/** Object size in grid cells */
interface ObjectSize {
  width: number;
  height: number;
}

/** A placed object on the map */
interface MapObject {
  id: ObjectId;
  type: string;
  position: Point;
  size: ObjectSize;
  label?: string;
  linkedNote?: string | null;
  alignment?: ObjectAlignment;
  slot?: number;
  scale?: number;
  rotation?: number;
  color?: string;
  opacity?: number;
  locked?: boolean;
  layerId?: string;
}

/** Partial object for updates */
type ObjectUpdate = Partial<Omit<MapObject, 'id'>>;

/** Result of object placement operation */
interface PlacementResult {
  objects: MapObject[];
  success: boolean;
  error?: string;
  object?: MapObject;
}

/** Result of object removal operation */
interface RemovalResult {
  objects: MapObject[];
  success: boolean;
  removed?: MapObject;
}

/** Options for placeObject unified API */
interface PlacementOptions {
  mapType: MapType;
  alignment?: ObjectAlignment;
}

/** Position offset for alignment rendering */
interface AlignmentOffset {
  offsetX: number;
  offsetY: number;
}

/** Slot position for multi-object hex cells */
type HexSlot = 0 | 1 | 2 | 3;

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Import getObjectType from the resolver (handles overrides, custom objects, fallback)
const { getObjectType } = await requireModuleByName("objectTypeResolver.js") as {
  getObjectType: (typeId: string) => ObjectTypeDef
};

const { 
  assignSlot, 
  getObjectsInCell, 
  canAddObjectToCell, 
  getOccupiedSlots,
  reorganizeAfterRemoval 
} = await requireModuleByName("hexSlotPositioner.js") as {
  assignSlot: (occupiedSlots: HexSlot[]) => HexSlot | -1;
  getObjectsInCell: (objects: MapObject[], x: number, y: number) => MapObject[];
  canAddObjectToCell: (objects: MapObject[], x: number, y: number) => boolean;
  getOccupiedSlots: (objects: MapObject[], x: number, y: number) => HexSlot[];
  reorganizeAfterRemoval: (objects: MapObject[], x: number, y: number) => MapObject[];
};

// ===========================================
// ID Generation
// ===========================================

/**
 * Generate a unique ID for an object
 */
function generateObjectId(): ObjectId {
  return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ===========================================
// Object Lookup
// ===========================================

/**
 * Find object at specific grid coordinates
 */
function getObjectAtPosition(objects: MapObject[] | null | undefined, x: number, y: number): MapObject | null {
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

// ===========================================
// Grid Object Operations
// ===========================================

/**
 * Add a new object to the objects array (grid maps - single object per cell)
 */
function addObject(objects: MapObject[], typeId: string, x: number, y: number): MapObject[] {
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
  
  const newObject: MapObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment: 'center'
  };
  
  return [...objects, newObject];
}

/**
 * Remove object by ID
 */
function removeObject(objects: MapObject[] | null | undefined, objectId: ObjectId): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => obj.id !== objectId);
}

/**
 * Remove object at specific position
 */
function removeObjectAtPosition(objects: MapObject[] | null | undefined, x: number, y: number): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => !(obj.position.x === x && obj.position.y === y));
}

/**
 * Remove all objects within a rectangular area
 */
function removeObjectsInRectangle(
  objects: MapObject[] | null | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): MapObject[] {
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

// ===========================================
// Hex Object Operations
// ===========================================

/**
 * Add a new object to a hex cell with automatic slot assignment.
 * Supports up to 4 objects per hex cell.
 */
function addObjectToHex(
  objects: MapObject[],
  typeId: string,
  x: number,
  y: number
): PlacementResult {
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
  
  const newObject: MapObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment: 'center',
    slot: slot
  };
  
  return { 
    objects: [...objects, newObject], 
    success: true,
    object: newObject
  };
}

/**
 * Remove object by ID from a hex map, with slot reorganization.
 */
function removeObjectFromHex(objects: MapObject[] | null | undefined, objectId: ObjectId): MapObject[] {
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
 * Remove a single object from a hex cell (the one with the highest slot number).
 */
function removeOneObjectFromHex(objects: MapObject[] | null | undefined, x: number, y: number): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];
  
  // Get objects in this cell
  const cellObjects = getObjectsInCell(objects, x, y);
  if (cellObjects.length === 0) return objects;
  
  // Find object with highest slot (most recently added)
  const toRemove = cellObjects.reduce((highest, obj) => {
    const objSlot = obj.slot ?? -1;
    const highestSlot = highest.slot ?? -1;
    return objSlot > highestSlot ? obj : highest;
  }, cellObjects[0]);
  
  // Remove and reorganize
  return removeObjectFromHex(objects, toRemove.id);
}

// ===========================================
// Object Updates
// ===========================================

/**
 * Update object properties by ID
 */
function updateObject(
  objects: MapObject[] | null | undefined,
  objectId: ObjectId,
  updates: ObjectUpdate
): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];
  
  return objects.map(obj => {
    if (obj.id === objectId) {
      return { ...obj, ...updates };
    }
    return obj;
  });
}

// ===========================================
// Area Checking
// ===========================================

/**
 * Check if an area is occupied by any object (excluding optional exception)
 */
function isAreaFree(
  objects: MapObject[] | null | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  excludeId: ObjectId | null = null
): boolean {
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
 */
function canResizeObject(
  objects: MapObject[],
  objectId: ObjectId,
  newWidth: number,
  newHeight: number,
  maxSize: number = 5
): boolean {
  if (newWidth < 1 || newHeight < 1) return false;
  if (newWidth > maxSize || newHeight > maxSize) return false;
  
  const object = objects.find(obj => obj.id === objectId);
  if (!object) return false;
  
  // Check if new size would overlap with other objects
  return isAreaFree(objects, object.position.x, object.position.y, newWidth, newHeight, objectId);
}

// ===========================================
// Alignment Utilities
// ===========================================

/**
 * Calculate the nearest edge alignment based on pointer position within a cell
 */
function calculateEdgeAlignment(
  pointerX: number,
  pointerY: number,
  gridX: number,
  gridY: number,
  threshold: number = 0.3
): ObjectAlignment {
  // Calculate position within the cell (0-1 range)
  const offsetX = pointerX - gridX;
  const offsetY = pointerY - gridY;
  
  // Check edges in order of priority
  if (offsetY < threshold) return 'north';
  if (offsetY > (1 - threshold)) return 'south';
  if (offsetX < threshold) return 'west';
  if (offsetX > (1 - threshold)) return 'east';
  
  return 'center';
}

/**
 * Get the position offset for a given alignment
 */
function getAlignmentOffset(alignment: ObjectAlignment): AlignmentOffset {
  switch (alignment) {
    case 'north': return { offsetX: 0, offsetY: -0.5 };
    case 'south': return { offsetX: 0, offsetY: 0.5 };
    case 'east': return { offsetX: 0.5, offsetY: 0 };
    case 'west': return { offsetX: -0.5, offsetY: 0 };
    case 'center':
    default: return { offsetX: 0, offsetY: 0 };
  }
}

// ===========================================
// Unified Placement API
// ===========================================

/**
 * Place an object at the specified position.
 * Handles both grid (single object per cell) and hex (up to 4 objects per cell) maps.
 */
function placeObject(
  objects: MapObject[],
  typeId: string,
  x: number,
  y: number,
  options: PlacementOptions
): PlacementResult {
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
  
  const newObject: MapObject = {
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
 */
function eraseObjectAt(
  objects: MapObject[] | null | undefined,
  x: number,
  y: number,
  mapType: MapType
): RemovalResult {
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
 */
function canPlaceObjectAt(
  objects: MapObject[] | null | undefined,
  x: number,
  y: number,
  mapType: MapType
): boolean {
  if (mapType === 'hex') {
    return canAddObjectToCell(objects as MapObject[], x, y);
  }
  // Grid: check if cell is empty
  return getObjectAtPosition(objects, x, y) === null;
}

// ===========================================
// Exports
// ===========================================

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