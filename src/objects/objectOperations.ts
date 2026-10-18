/**
 * objectOperations.ts
 * Operations for managing map objects - placement, removal, updates.
 */

import { mintId } from '../core/ids';
import type { MapType } from '#types/core/map.types';
import type {
  ObjectId,
  ObjectAlignment,
  MapObject,
  ObjectUpdate,
  PlacementResult,
  RemovalResult,
  PlacementOptions,
  AlignmentOffset,
} from '#types/objects/object.types';

import { getNextRotation } from '../drawing/rotationOperations';
import { getObjectType } from './objectTypeResolver';
import { updateById, removeById } from './entityList';
import { assignSlot, getObjectsInCell, canAddObjectToCell, getOccupiedSlots, reorganizeAfterRemoval, homeLevelOf } from './hexSlotPositioner';


// Import getObjectType from the resolver (handles overrides, custom objects, fallback)




// ===========================================
// ID Generation
// ===========================================

/**
 * Generate a unique ID for an object
 */
function generateObjectId(): ObjectId {
  return mintId('obj');
}

// ===========================================
// Object Lookup
// ===========================================

/**
 * Find object at specific grid coordinates.
 *
 * `homeLevel` restricts the search to objects homed on that ladder rung, since
 * rung cells of different levels share index space; omitted, any rung matches
 * (the classic single-rung behaviour).
 */
function getObjectAtPosition(objects: MapObject[] | null | undefined, x: number, y: number, homeLevel?: number): MapObject | null {
  if (objects == null || !Array.isArray(objects)) return null;

  return objects.find(obj => {
    if (homeLevel !== undefined && homeLevelOf(obj) !== homeLevel) return false;
    // Ensure size exists (backward compatibility)
    const size = obj.size ?? { width: 1, height: 1 };
    const pos = obj.position;
    
    // Check if (x, y) is within object bounds
    return x >= pos.x && x < pos.x + size.width &&
           y >= pos.y && y < pos.y + size.height;
  }) ?? null;
}

/** `{ homeLevel }` for a rung above the root, `{}` otherwise: root objects never carry the key. */
function homeLevelField(homeLevel: number | undefined): { homeLevel?: number } {
  return homeLevel !== undefined && homeLevel > 0 ? { homeLevel } : {};
}

// ===========================================
// Grid Object Operations
// ===========================================

/**
 * Add a new object to the objects array (grid maps - single object per cell)
 */
function addObject(objects: MapObject[], typeId: string, x: number, y: number, mapType: MapType = 'grid', objectSetId?: string | null): MapObject[] {
  const objectType = getObjectType(typeId, mapType, objectSetId);
  if (objectType.isUnknown === true) {
    console.error(`Unknown object type: ${typeId}`);
    return objects;
  }
  
  // Check if object already exists at position (addObject is root-only: note pins)
  const existing = getObjectAtPosition(objects, x, y, 0);
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
  return removeById<MapObject>(objects, objectId);
}

/**
 * Remove object at specific position
 */
function removeObjectAtPosition(objects: MapObject[] | null | undefined, x: number, y: number, homeLevel?: number): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => !(obj.position.x === x && obj.position.y === y &&
    (homeLevel === undefined || homeLevelOf(obj) === homeLevel)));
}

/**
 * Remove all objects within a rectangular area
 */
function removeObjectsInRectangle(
  objects: MapObject[] | null | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  homeLevel?: number
): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  return objects.filter(obj => {
    if (homeLevel !== undefined && homeLevelOf(obj) !== homeLevel) return true;
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
  y: number,
  objectSetId?: string | null,
  homeLevel?: number
): PlacementResult {
  const objectType = getObjectType(typeId, 'hex', objectSetId);
  if (objectType.isUnknown === true) {
    return {
      objects,
      success: false,
      error: `Unknown object type: ${typeId}`
    };
  }

  // Check if cell can accept another object (on this rung)
  if (!canAddObjectToCell(objects, x, y, homeLevel ?? 0)) {
    return { 
      objects, 
      success: false, 
      error: 'Cell is full (maximum 4 objects)' 
    };
  }
  
  // Get occupied slots and assign next available
  const occupiedSlots = getOccupiedSlots(objects, x, y, homeLevel ?? 0);
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
    slot: slot,
    ...homeLevelField(homeLevel)
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
  
  // Reorganize remaining slots in that cell, on the removed object's rung
  return reorganizeAfterRemoval(afterRemoval, x, y, homeLevelOf(objectToRemove));
}

/**
 * Remove a single object from a hex cell (the one with the highest slot number).
 */
function removeOneObjectFromHex(objects: MapObject[] | null | undefined, x: number, y: number, homeLevel?: number): MapObject[] {
  if (!objects || !Array.isArray(objects)) return [];

  // Get objects in this cell
  const cellObjects = getObjectsInCell(objects, x, y, homeLevel);
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
  return updateById<MapObject>(objects, objectId, updates);
}

/**
 * Advance one object's rotation to the next 45-degree step (non-standard values snap to 0).
 * Shared by the keyboard shortcut and the toolbar action.
 */
function rotateObjectInList(
  objects: MapObject[] | null | undefined,
  objectId: ObjectId
): MapObject[] {
  const current = objects?.find(obj => obj.id === objectId);
  return updateObject(objects, objectId, { rotation: getNextRotation(current?.rotation ?? 0) });
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
  excludeId: ObjectId | null = null,
  homeLevel?: number
): boolean {
  if (!objects || !Array.isArray(objects)) return true;

  for (const obj of objects) {
    if (excludeId != null && excludeId !== '' && obj.id === excludeId) continue;
    if (homeLevel !== undefined && homeLevelOf(obj) !== homeLevel) continue;

    const size = obj.size ?? { width: 1, height: 1 };
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
  
  // Check if new size would overlap with other objects on the same rung
  return isAreaFree(objects, object.position.x, object.position.y, newWidth, newHeight, objectId, object.homeLevel ?? 0);
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
  const { mapType, alignment = 'center', objectSetId, homeLevel } = options;

  if (mapType === 'hex') {
    // Hex: use multi-object placement with slot assignment
    const result = addObjectToHex(objects, typeId, x, y, objectSetId, homeLevel);
    if (result.success) {
      const newObject = result.objects[result.objects.length - 1];
      return { ...result, object: newObject };
    }
    return result;
  }

  // Grid: single object per cell
  const objectType = getObjectType(typeId, mapType, objectSetId);
  if (objectType.isUnknown === true) {
    return { 
      objects, 
      success: false, 
      error: `Unknown object type: ${typeId}` 
    };
  }
  
  const existing = getObjectAtPosition(objects, x, y, homeLevel ?? 0);
  if (existing != null) {
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
    alignment,
    ...homeLevelField(homeLevel)
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
  mapType: MapType,
  homeLevel?: number
): RemovalResult {
  if (!objects || !Array.isArray(objects)) {
    return { objects: [], success: false };
  }

  // Check if any object exists at position
  const existing = getObjectAtPosition(objects, x, y, homeLevel);
  if (!existing) {
    return { objects, success: false };
  }

  if (mapType === 'hex') {
    // Hex: remove one object (highest slot), reorganize remaining
    const newObjects = removeOneObjectFromHex(objects, x, y, homeLevel);
    // Find what was removed by comparing arrays
    const removed = objects.find(o => !newObjects.some(n => n.id === o.id));
    return { 
      objects: newObjects, 
      success: true,
      removed
    };
  }
  
  // Grid: remove all objects at position
  const newObjects = removeObjectAtPosition(objects, x, y, homeLevel);
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
  mapType: MapType,
  homeLevel?: number
): boolean {
  if (mapType === 'hex') {
    return canAddObjectToCell(objects as MapObject[], x, y, homeLevel ?? 0);
  }
  // Grid: check if cell is empty
  return getObjectAtPosition(objects, x, y, homeLevel ?? 0) === null;
}

// ===========================================
// Duplicate Placement
// ===========================================

/** Where a duplicate of an object lands: a cell, plus the sub-cell slot on hex maps. */
interface DuplicateTarget {
  x: number;
  y: number;
  /** Hex only: the first free slot in the target cell. */
  slot?: number;
}

/** Furthest ring searched for a free cell when every immediate neighbour is full. */
const DUPLICATE_MAX_RING = 10;

/**
 * Find the cell a duplicate of `source` should go to: the first neighbour that
 * can take another object (6 axial directions on hex, 4 on grid), then square
 * rings out to DUPLICATE_MAX_RING. On hex the result carries the free slot in
 * that cell. Returns null when nothing in range is free.
 *
 * `objects` must include everything already placed, including copies made
 * earlier in the same bulk duplicate, so successive copies do not collide.
 *
 * `cellExists(home, x, y)`, when given, skips cells that do not exist on the
 * source's rung (a deep rung cell past the root edge), so a duplicate lands
 * only where placement could put it. Omitted, every cell counts as existing.
 */
function findDuplicateTarget(
  objects: MapObject[] | null | undefined,
  source: Pick<MapObject, 'position' | 'homeLevel'>,
  mapType: MapType,
  cellExists?: (home: number, x: number, y: number) => boolean
): DuplicateTarget | null {
  const list = objects ?? [];
  const { x: sourceX, y: sourceY } = source.position;
  // The copy keeps the source's ladder rung (callers spread the source), so it
  // looks for room among that rung's cells, not the root's.
  const home = homeLevelOf(source);

  const free = (x: number, y: number): boolean =>
    (cellExists === undefined || cellExists(home, x, y)) && canPlaceObjectAt(list, x, y, mapType, home);

  const withSlot = (x: number, y: number): DuplicateTarget => {
    if (mapType !== 'hex') return { x, y };
    return { x, y, slot: assignSlot(getOccupiedSlots(list, x, y, home)) };
  };

  const directions = mapType === 'hex'
    ? [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]]
    : [[1, 0], [0, 1], [-1, 0], [0, -1]];

  for (const [dx, dy] of directions) {
    if (free(sourceX + dx, sourceY + dy)) {
      return withSlot(sourceX + dx, sourceY + dy);
    }
  }

  for (let ring = 2; ring <= DUPLICATE_MAX_RING; ring++) {
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        if (free(sourceX + dx, sourceY + dy)) {
          return withSlot(sourceX + dx, sourceY + dy);
        }
      }
    }
  }

  return null;
}

// ===========================================
// Freeform Placement API
// ===========================================

/**
 * Place an object at exact world coordinates (freeform, not grid-snapped).
 * No collision check â€” freeform objects can overlap anything.
 */
function placeObjectFreeform(
  objects: MapObject[],
  typeId: string,
  worldX: number,
  worldY: number,
  nearestGridPos: { x: number; y: number },
  mapType: MapType,
  objectSetId?: string | null,
  homeLevel?: number
): PlacementResult {
  const objectType = getObjectType(typeId, mapType, objectSetId);
  if (objectType.isUnknown === true) {
    return { objects, success: false, error: `Unknown object type: ${typeId}` };
  }

  const newObject: MapObject = {
    id: generateObjectId(),
    type: typeId,
    position: nearestGridPos,
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    freeform: true,
    worldPosition: { x: worldX, y: worldY },
    ...homeLevelField(homeLevel)
  };

  return { objects: [...objects, newObject], success: true, object: newObject };
}

/**
 * Convert a grid-anchored object to freeform.
 * Computes worldPosition from grid position + alignment offset using cell center coords.
 */
function convertObjectToFreeform(
  obj: MapObject,
  cellCenterWorldX: number,
  cellCenterWorldY: number,
  cellSize: number
): ObjectUpdate {
  const alignOffset = getAlignmentOffset(obj.alignment ?? 'center');
  return {
    freeform: true,
    worldPosition: {
      x: cellCenterWorldX + alignOffset.offsetX * cellSize,
      y: cellCenterWorldY + alignOffset.offsetY * cellSize
    },
    alignment: 'center'
  };
}

/**
 * Convert a freeform object to grid-anchored.
 * Snaps to the nearest grid cell and clears freeform fields.
 */
function snapObjectToGrid(
  nearestGridPos: { x: number; y: number }
): ObjectUpdate {
  return {
    position: nearestGridPos,
    freeform: undefined,
    worldPosition: undefined,
    alignment: 'center'
  };
}

// ===========================================
// Exports
// ===========================================

export { // Core operations
  getObjectType, generateObjectId, getObjectAtPosition, updateObject, rotateObjectInList, isAreaFree, canResizeObject, // Grid-specific operations (legacy, prefer unified API)
  addObject, removeObject, removeObjectAtPosition, removeObjectsInRectangle, calculateEdgeAlignment, // Hex-specific operations (internal, prefer unified API)
  addObjectToHex, removeObjectFromHex, // Unified API (preferred for new code)
  placeObject, eraseObjectAt, canPlaceObjectAt, findDuplicateTarget, // Freeform placement API
  placeObjectFreeform, convertObjectToFreeform, snapObjectToGrid };
export type { DuplicateTarget };