/**
 * groupDragOps.ts
 *
 * Pure placement checks for a multi-select group drag. A group may mix ladder
 * rungs (objects carry `homeLevel`, absent = 0); rung cells of different levels
 * share index space but are different places, so every check is scoped to the
 * moving object's own rung. On classic maps every object is home 0, which makes
 * these checks identical to the old root-only ones.
 */

import type { Point } from '#types/core/geometry.types';
import type { MapObject } from '#types/objects/object.types';
import { isAreaFree } from './objectOperations';
import {
  homeLevelOf,
  assignSlot,
  getMaxObjectsPerCell,
  getObjectsInCell,
  getOccupiedSlots,
  reorganizeAfterRemoval
} from './hexSlotPositioner';

/** One grid-anchored object's proposed cell during a group drag. */
interface GroupGridMove {
  oldObj: MapObject;
  newPosition: Point;
}

/** Existence gate for a cell on rung `home` (root bounds at 0, ladder.existsAt deeper). */
type RungCellExists = (home: number, x: number, y: number) => boolean;

/**
 * True when the group move must be refused: any moving object lands on a cell
 * that does not exist on its rung, or overlaps a static (non-selected) object
 * on the same rung. Static objects on other rungs never block.
 */
function isGroupGridMoveBlocked(
  moves: readonly GroupGridMove[],
  staticObjects: readonly MapObject[],
  cellExists: RungCellExists
): boolean {
  for (const move of moves) {
    if (!cellExists(homeLevelOf(move.oldObj), move.newPosition.x, move.newPosition.y)) {
      return true;
    }
  }

  for (const move of moves) {
    const size = move.oldObj.size ?? { width: 1, height: 1 };
    if (!isAreaFree(
      staticObjects as MapObject[],
      move.newPosition.x,
      move.newPosition.y,
      size.width,
      size.height,
      null,
      homeLevelOf(move.oldObj)
    )) {
      return true;
    }
  }

  return false;
}

/**
 * Whether a selected object's footprint covers the pointer cell on its own rung.
 * `cellOnRung` resolves the pointer cell on a given rung (null when unresolvable).
 */
function groupItemHitsCell(
  obj: MapObject,
  cellOnRung: (home: number) => Point | null
): boolean {
  const cell = cellOnRung(homeLevelOf(obj));
  if (cell === null) return false;
  const size = obj.size ?? { width: 1, height: 1 };
  return cell.x >= obj.position.x && cell.x < obj.position.x + size.width &&
    cell.y >= obj.position.y && cell.y < obj.position.y + size.height;
}

const cellKey = (home: number, x: number, y: number): string => home + ':' + x + ',' + y;

const staysPut = (move: GroupGridMove): boolean =>
  move.oldObj.position.x === move.newPosition.x && move.oldObj.position.y === move.newPosition.y;

/**
 * Hex slots for a group move, per target cell per rung, or null when any
 * target cell would hold more than getMaxObjectsPerCell() objects (the move is
 * refused, like an overlap). Each mover takes the next free slot against the
 * slots already held there by static objects on its rung plus the members
 * already placed in this move. A mover that keeps its cell (zero delta on its
 * rung) keeps its slot; movers arriving together keep their relative order.
 */
function assignGroupSlots(
  moves: readonly GroupGridMove[],
  staticObjects: readonly MapObject[]
): Map<string, number> | null {
  const byCell = new Map<string, GroupGridMove[]>();
  for (const move of moves) {
    const key = cellKey(homeLevelOf(move.oldObj), move.newPosition.x, move.newPosition.y);
    const bucket = byCell.get(key);
    if (bucket === undefined) byCell.set(key, [move]); else bucket.push(move);
  }

  const statics = staticObjects as MapObject[];
  const slots = new Map<string, number>();
  for (const cellMoves of byCell.values()) {
    const { x, y } = cellMoves[0].newPosition;
    const home = homeLevelOf(cellMoves[0].oldObj);
    const staticCount = getObjectsInCell(statics, x, y, home).length;
    if (staticCount + cellMoves.length > getMaxObjectsPerCell()) return null;

    const occupied = getOccupiedSlots(statics, x, y, home);
    const arriving: GroupGridMove[] = [];
    for (const move of cellMoves) {
      const slot = move.oldObj.slot;
      if (staysPut(move) && slot !== undefined && !occupied.includes(slot)) {
        occupied.push(slot);
        slots.set(move.oldObj.id, slot);
      } else {
        arriving.push(move);
      }
    }
    arriving.sort((a, b) => (a.oldObj.slot ?? 0) - (b.oldObj.slot ?? 0));
    for (const move of arriving) {
      const slot = assignSlot(occupied);
      occupied.push(slot);
      slots.set(move.oldObj.id, slot);
    }
  }
  return slots;
}

/**
 * Compact the slots of every cell a mover LEFT (per rung), on the objects as
 * they stand after the move. Cells a mover stayed in are untouched.
 */
function reorganizeVacatedCells(
  objects: MapObject[],
  moves: readonly GroupGridMove[]
): MapObject[] {
  const done = new Set<string>();
  let result = objects;
  for (const move of moves) {
    if (staysPut(move)) continue;
    const home = homeLevelOf(move.oldObj);
    const { x, y } = move.oldObj.position;
    const key = cellKey(home, x, y);
    if (done.has(key)) continue;
    done.add(key);
    result = reorganizeAfterRemoval(result, x, y, home);
  }
  return result;
}

/**
 * Do group moves on this map stack into hex slots? Only on a hex map that is a
 * ladder map (live ladder, or a stored `lod` block even while quarantined or
 * rotated). A classic hex map keeps main's contract: a group move onto any
 * occupied cell is refused (bbox overlap), slots are kept as they were and
 * vacated cells are not compacted (cross-model review item 3).
 */
function groupMoveStacksInSlots(mapType: string | undefined, hasLadder: boolean, hasLod: boolean): boolean {
  return mapType === 'hex' && (hasLadder || hasLod);
}

/** Outcome of a group grid move: refused, or accepted with hex slots (null when the map does not stack). */
type GroupGridPlan = { blocked: true } | { blocked: false; slots: Map<string, number> | null };

/**
 * The whole placement decision for a group grid move. `stackInSlots` (see
 * groupMoveStacksInSlots): overlap is replaced by per-cell slot assignment,
 * refused only when a cell would overflow. Otherwise every static object on
 * the mover's rung blocks by bbox overlap, exactly like main.
 */
function planGroupGridMove(
  moves: readonly GroupGridMove[],
  staticObjects: readonly MapObject[],
  cellExists: RungCellExists,
  stackInSlots: boolean
): GroupGridPlan {
  if (isGroupGridMoveBlocked(moves, stackInSlots ? [] : staticObjects, cellExists)) return { blocked: true };
  if (!stackInSlots) return { blocked: false, slots: null };
  const slots = assignGroupSlots(moves, staticObjects);
  return slots === null ? { blocked: true } : { blocked: false, slots };
}

export { isGroupGridMoveBlocked, groupItemHitsCell, assignGroupSlots, reorganizeVacatedCells, groupMoveStacksInSlots, planGroupGridMove };
export type { GroupGridMove, RungCellExists, GroupGridPlan };
