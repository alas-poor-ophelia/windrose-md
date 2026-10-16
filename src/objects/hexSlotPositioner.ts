/**
 * hexSlotPositioner.ts
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

import type { MapObject } from '#types/objects/object.types';
import type { HexOrientation } from '#types/settings/settings.types';

/** Slot position data */
interface SlotPosition {
  slot: number;
  offsetX: number;
  offsetY: number;
}

/** Slot offset result */
interface SlotOffset {
  offsetX: number;
  offsetY: number;
}

/** Arrangement map by object count */
type ArrangementMap = Record<number, SlotPosition[]>;

/**
 * Flat-top hex arrangements
 */
const FLAT_TOP_ARRANGEMENTS: ArrangementMap = {
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
    { slot: 0, offsetX: 0, offsetY: -0.20 },
    { slot: 1, offsetX: 0.20, offsetY: 0 },
    { slot: 2, offsetX: 0, offsetY: 0.20 },
    { slot: 3, offsetX: -0.20, offsetY: 0 }
  ]
};

/**
 * Pointy-top hex arrangements
 */
const POINTY_TOP_ARRANGEMENTS: ArrangementMap = {
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
    { slot: 0, offsetX: 0, offsetY: -0.20 },
    { slot: 1, offsetX: 0.20, offsetY: 0 },
    { slot: 2, offsetX: 0, offsetY: 0.20 },
    { slot: 3, offsetX: -0.20, offsetY: 0 }
  ]
};

/**
 * Get slot offset for rendering
 */
function getSlotOffset(slot: number, objectCount: number, orientation: HexOrientation = 'flat'): SlotOffset {
  const arrangements = orientation === 'pointy'
    ? POINTY_TOP_ARRANGEMENTS
    : FLAT_TOP_ARRANGEMENTS;

  const count = Math.min(Math.max(objectCount, 1), 4);
  const arrangement = arrangements[count];
  const position = arrangement?.find(p => p.slot === slot);

  return position
    ? { offsetX: position.offsetX, offsetY: position.offsetY }
    : { offsetX: 0, offsetY: 0 };
}

/**
 * Assign next available slot for a new object
 */
function assignSlot(existingSlots: number[]): number {
  for (let i = 0; i < 4; i++) {
    if (!existingSlots.includes(i)) {
      return i;
    }
  }
  return -1;
}

/**
 * Reorganize slots after object removal to maintain compact arrangement
 */
function reorganizeSlots(currentSlots: number[]): Map<number, number> {
  const sorted = [...currentSlots].sort((a, b) => a - b);
  const remapping = new Map<number, number>();

  sorted.forEach((oldSlot, newSlot) => {
    if (oldSlot !== newSlot) {
      remapping.set(oldSlot, newSlot);
    }
  });

  return remapping;
}

/**
 * Get the maximum number of objects allowed per cell
 */
function getMaxObjectsPerCell(): number {
  return 4;
}

/**
 * Calculate scale factor for objects in multi-object cells
 */
function getMultiObjectScale(objectCount: number): number {
  if (objectCount <= 1) return 1.0;
  if (objectCount === 2) return 0.7;
  if (objectCount === 3) return 0.6;
  return 0.55;
}

/** The ladder rung an object is homed on (absent = 0). */
function homeLevelOf(obj: { homeLevel?: number }): number {
  return obj.homeLevel ?? 0;
}

/**
 * Rung scope for an index hit-test on the CLASSIC branch (no ladder view).
 *
 * A map carrying `lod` that is not shown as a ladder (quarantined, or rotated)
 * draws level 0 only, so its deep objects are undrawn and must not be hit,
 * dragged or deleted by their index (a rung-2 object at (3, -1) is not the
 * root hex (3, -1)): scope to rung 0. A map without `lod` returns undefined,
 * which keeps every call byte-identical to the unscoped (main) one.
 */
function classicHitRung(mapData: { lod?: unknown } | null | undefined): 0 | undefined {
  return mapData !== null && mapData !== undefined && mapData.lod !== undefined && mapData.lod !== null ? 0 : undefined;
}

/**
 * Get objects in a specific cell.
 *
 * Rung cells of different ladder levels share index space: (3, -1) on rung 2 is
 * a different place from (3, -1) on the root. Pass `homeLevel` to restrict the
 * cell to one rung (the renderer and every ladder hit-test do); omitted, the
 * match is by index alone, which is the classic (single-rung) behaviour.
 */
function getObjectsInCell(objects: MapObject[], x: number, y: number, homeLevel?: number): MapObject[] {
  if (objects == null || !Array.isArray(objects)) return [];

  return objects.filter(obj =>
    obj.position != null &&
    obj.position.x === x &&
    obj.position.y === y &&
    (homeLevel === undefined || homeLevelOf(obj) === homeLevel)
  );
}

/** Per-cell buckets of one objects array, keyed `home:x,y`, plus the length it was built at. */
interface ObjectCellIndex { length: number; byCell: Map<string, MapObject[]> }

const objectCellIndexes = new WeakMap<readonly MapObject[], ObjectCellIndex>();

/**
 * `getObjectsInCell` through a per-cell index of `objects`, built once per
 * array identity (objects arrays are replaced, never edited, on every write;
 * the length check also rebuilds after an in-place push). Same members in the
 * same order as the filter, so slot layouts are identical. The render pass
 * asks for every drawn object's cell-mates, which made the plain filter O(n^2)
 * per frame. Without `homeLevel` it falls back to the index-only filter.
 */
function getObjectsInCellIndexed(objects: MapObject[], x: number, y: number, homeLevel?: number): MapObject[] {
  if (objects == null || !Array.isArray(objects)) return [];
  if (homeLevel === undefined) return getObjectsInCell(objects, x, y);
  let index = objectCellIndexes.get(objects);
  if (index === undefined || index.length !== objects.length) {
    const byCell = new Map<string, MapObject[]>();
    for (const obj of objects) {
      if (obj.position == null) continue;
      const key = homeLevelOf(obj) + ':' + obj.position.x + ',' + obj.position.y;
      const bucket = byCell.get(key);
      if (bucket === undefined) byCell.set(key, [obj]); else bucket.push(obj);
    }
    index = { length: objects.length, byCell };
    objectCellIndexes.set(objects, index);
  }
  return index.byCell.get(homeLevel + ':' + x + ',' + y) ?? [];
}

/**
 * Check if a cell can accept another object
 */
function canAddObjectToCell(objects: MapObject[], x: number, y: number, homeLevel?: number): boolean {
  const cellObjects = getObjectsInCell(objects, x, y, homeLevel);
  return cellObjects.length < getMaxObjectsPerCell();
}

/**
 * Get occupied slots in a cell
 */
function getOccupiedSlots(objects: MapObject[], x: number, y: number, homeLevel?: number): number[] {
  const cellObjects = getObjectsInCell(objects, x, y, homeLevel);
  return cellObjects
    .map(obj => obj.slot)
    .filter((slot): slot is number => slot !== undefined && slot !== null);
}

/**
 * Prepare objects array after removing an object from a multi-object cell
 */
function reorganizeAfterRemoval(objects: MapObject[], x: number, y: number, homeLevel?: number): MapObject[] {
  const cellObjects = getObjectsInCell(objects, x, y, homeLevel);

  if (cellObjects.length <= 1) {
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

  const currentSlots = cellObjects.map(obj => obj.slot).filter((s): s is number => s !== undefined);
  const remapping = reorganizeSlots(currentSlots);

  if (remapping.size === 0) return objects;

  return objects.map(obj => {
    if (obj.position?.x === x && obj.position?.y === y && obj.slot !== undefined &&
        (homeLevel === undefined || homeLevelOf(obj) === homeLevel)) {
      const newSlot = remapping.get(obj.slot);
      if (newSlot !== undefined) {
        return { ...obj, slot: newSlot };
      }
    }
    return obj;
  });
}

/**
 * Find which object in a multi-object cell was clicked based on proximity to slot positions
 */
function getClickedObjectInCell(
  objects: MapObject[],
  hexX: number,
  hexY: number,
  clickOffsetX: number,
  clickOffsetY: number,
  orientation: HexOrientation,
  homeLevel?: number
): MapObject | null {
  const cellObjects = getObjectsInCell(objects, hexX, hexY, homeLevel);

  if (cellObjects.length === 0) return null;
  if (cellObjects.length === 1) return cellObjects[0];

  let closest: MapObject | null = null;
  let closestDist = Infinity;

  for (const obj of cellObjects) {
    const effectiveSlot = obj.slot ?? cellObjects.indexOf(obj);
    const { offsetX, offsetY } = getSlotOffset(
      effectiveSlot,
      cellObjects.length,
      orientation
    );

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

export { getSlotOffset, assignSlot, getMaxObjectsPerCell, getMultiObjectScale, getObjectsInCell, getObjectsInCellIndexed, canAddObjectToCell, getOccupiedSlots, reorganizeAfterRemoval, getClickedObjectInCell, homeLevelOf, classicHitRung };
