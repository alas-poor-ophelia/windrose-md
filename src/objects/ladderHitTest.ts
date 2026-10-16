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
import type { MapLayer } from '#types/core/map.types';
import type { GeometryLadder } from '../geometry/core/createGeometryLadder';

import { calculateObjectPosition } from '../geometry/renderers/objectRenderer';
import {
  OBJECT_FLOOR_PX,
  depthModeOf,
  elementScale,
  elementVisibleAt,
  groupByDepth,
  groupVisibleAt,
  objectRenderedPx,
  scaledSizeForRung
} from '../geometry/renderers/elementBands';
import { getObjectsInCell, getSlotOffset, getMultiObjectScale } from './hexSlotPositioner';
import { rungFogPredicate } from '../geometry/fog/rungFog';
import type { FogPredicate } from '../geometry/fog/rungFog';

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

type SlotDeps = { getObjectsInCell: typeof getObjectsInCell; getSlotOffset: typeof getSlotOffset; getMultiObjectScale: typeof getMultiObjectScale };

const slotDeps: SlotDeps = { getObjectsInCell, getSlotOffset, getMultiObjectScale };

/**
 * Slot deps whose cell lookup is a prebuilt index of `objects` by rung and
 * cell: a pick walks every object, and each footprint asks for its cell-mates,
 * so the plain O(n) filter would make hover O(n^2) per pointermove.
 */
function indexedSlotDeps(objects: MapObject[]): SlotDeps {
  const byCell = new Map<string, MapObject[]>();
  for (const o of objects) {
    if (o.position == null) continue;
    const key = (o.homeLevel ?? 0) + ':' + o.position.x + ',' + o.position.y;
    const bucket = byCell.get(key);
    if (bucket === undefined) byCell.set(key, [o]); else bucket.push(o);
  }
  return {
    ...slotDeps,
    getObjectsInCell: (_objects, x, y, homeLevel) =>
      homeLevel === undefined ? getObjectsInCell(objects, x, y) : (byCell.get(homeLevel + ':' + x + ',' + y) ?? [])
  };
}

/**
 * The rect an object is drawn in under `view`, or null when the live element
 * pass would not draw it (hidden by its depth mode, or under the pixel floor).
 * `allObjects` is the whole active layer: the hex slot layout needs the
 * object's cell-mates.
 */
function ladderObjectFootprint(obj: MapObject, allObjects: MapObject[], view: LadderHitView, deps: SlotDeps = slotDeps): FootprintRect | null {
  const home = obj.homeLevel ?? 0;
  const mode = depthModeOf(obj);
  if (!elementVisibleAt(obj, view.level, 'object')) return null;
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
    deps
  );
}

function rectContains(rect: FootprintRect, px: number, py: number): boolean {
  return px >= rect.screenX && px < rect.screenX + rect.objectWidth &&
         py >= rect.screenY && py < rect.screenY + rect.objectHeight;
}

/**
 * Whether world point (worldX, worldY) falls inside `obj`'s drawn footprint
 * under `view` (false when the object is not drawn). The per-object test a
 * caller uses when it already knows which objects are candidates (group drag
 * grabbing a selected member).
 */
function ladderFootprintContains(obj: MapObject, allObjects: MapObject[], worldX: number, worldY: number, view: LadderHitView): boolean {
  const rect = ladderObjectFootprint(obj, allObjects, view);
  return rect !== null && rectContains(rect, worldX * view.zoom, worldY * view.zoom);
}

/**
 * Fog input for a pick: the layer whose fog applies and its level-0 predicate.
 * Pass it only when that layer's fog is enabled.
 */
interface LadderPickFog {
  layer: MapLayer;
  isCellFogged: FogPredicate;
}

/**
 * The object drawn under world point (worldX, worldY), or null. Walks the same
 * depth-group order the renderer paints in and keeps the LAST hit, so the
 * object painted on top is the one picked. With `fog`, an object the renderer
 * hides under fog (a deep one at its root ancestor, via rungFogPredicate) is
 * skipped, so a visible object beneath it is picked instead.
 */
function pickLadderObject(objects: MapObject[], worldX: number, worldY: number, view: LadderHitView, fog?: LadderPickFog): MapObject | null {
  const px = worldX * view.zoom;
  const py = worldY * view.zoom;
  const deps = indexedSlotDeps(objects);
  const { root } = view.ladder;
  let hit: MapObject | null = null;
  for (const group of groupByDepth(objects)) {
    if (!groupVisibleAt(group, view.level, 'object')) continue;
    const fogged = fog === undefined ? null : rungFogPredicate(view.ladder, group.home, fog.isCellFogged);
    for (const obj of group.members) {
      const rect = ladderObjectFootprint(obj, objects, view, deps);
      if (rect === null || !rectContains(rect, px, py)) continue;
      if (fogged !== null && fog !== undefined) {
        const offset = root.toOffsetCoords(obj.position.x, obj.position.y);
        if (fogged(fog.layer, offset.col, offset.row)) continue;
      }
      hit = obj;
    }
  }
  return hit;
}

export type { LadderHitView, FootprintRect };
export { ladderObjectFootprint, ladderFootprintContains, pickLadderObject };
