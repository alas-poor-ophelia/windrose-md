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
import { homeLevelOf } from './hexSlotPositioner';

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

export { isGroupGridMoveBlocked, groupItemHitsCell };
export type { GroupGridMove, RungCellExists };
