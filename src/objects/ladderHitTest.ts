/**
 * ladderHitTest.ts
 *
 * Pointer hit-testing for objects under the lattice ladder (bead kgc.12).
 *
 * The drawn footprint is the ONE shared derived value: the renderer's own
 * calculateObjectPosition, called with the same home-rung geometry, scaledSize
 * and elementScale the live element pass draws with. What the pointer hits is
 * exactly what was painted: a `persist` object held past its crossing keeps its
 * held disc (a click beside it in the same root hex misses), and a `pop` object
 * finer than its home, which is not drawn, is not hit at all. Every ladder
 * hit-test, overlay anchor and resize handle goes through here; none of them
 * may keep a private copy of the footprint math.
 *
 * Rects are in zoomed world px, i.e. canvas px with the pan offset removed: a
 * world point (wx, wy) sits at (wx * zoom, wy * zoom). Ladder views are never
 * rotated (lodFlags.isLadderView), so no rotation step is needed.
 */

import type { MapObject } from '#types/objects/object.types';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';

import { calculateObjectPosition } from '../geometry/renderers/objectRenderer';
import {
  OBJECT_FLOOR_PX,
  depthModeOf,
  elementScale,
  groupByDepth,
  objectRenderedPx,
  objectVisible,
  scaledSizeForRung
} from '../geometry/renderers/elementBands';
import { getObjectsInCell, getSlotOffset, getMultiObjectScale } from './hexSlotPositioner';

/** The camera as the hit-test sees it: the ladder, its active rung and the live zoom. */
interface LadderHitView {
  ladder: GeometryLadder;
  /** The rung the zoom activates (`ladder.activeLevel(zoom)`), latched by the caller. */
  level: number;
  zoom: number;
  orientation: 'flat' | 'pointy';
}

/** Top-left rect in zoomed world px (see module note). */
interface FootprintRect {
  screenX: number;
  screenY: number;
  objectWidth: number;
  objectHeight: number;
}

const slotDeps = { getObjectsInCell, getSlotOffset, getMultiObjectScale };

/**
 * The rect an object is drawn in under `view`, or null when the live element
 * pass would not draw it (hidden by its depth mode, or under the pixel floor).
 * `allObjects` is the whole active layer: the hex slot layout needs the
 * object's cell-mates.
 */
function ladderObjectFootprint(obj: MapObject, allObjects: MapObject[], view: LadderHitView): FootprintRect | null {
  const home = obj.homeLevel ?? 0;
  const mode = depthModeOf(obj);
  if (!objectVisible(home, view.level, mode)) return null;
  if (objectRenderedPx(view.ladder, home, view.zoom, obj.size?.width ?? 1, mode) < OBJECT_FLOOR_PX) return null;
  return calculateObjectPosition(
    obj,
    allObjects,
    view.ladder.geometryForLevel(home),
    {
      offsetX: 0,
      offsetY: 0,
      zoom: view.zoom,
      scaledSize: scaledSizeForRung(view.ladder, home, view.zoom),
      elementScale: elementScale(view.ladder, home, view.zoom, mode)
    },
    true,
    view.orientation,
    slotDeps
  );
}

function rectContains(rect: FootprintRect, px: number, py: number): boolean {
  return px >= rect.screenX && px < rect.screenX + rect.objectWidth &&
         py >= rect.screenY && py < rect.screenY + rect.objectHeight;
}

/**
 * The object drawn under world point (worldX, worldY), or null. Walks the same
 * depth-group order the renderer paints in and keeps the LAST hit, so the
 * object painted on top is the one picked.
 */
function pickLadderObject(objects: MapObject[], worldX: number, worldY: number, view: LadderHitView): MapObject | null {
  const px = worldX * view.zoom;
  const py = worldY * view.zoom;
  let hit: MapObject | null = null;
  for (const { members } of groupByDepth(objects)) {
    for (const obj of members) {
      const rect = ladderObjectFootprint(obj, objects, view);
      if (rect !== null && rectContains(rect, px, py)) hit = obj;
    }
  }
  return hit;
}

export type { LadderHitView, FootprintRect };
export { ladderObjectFootprint, pickLadderObject };
