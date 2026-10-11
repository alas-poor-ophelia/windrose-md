/**
 * elementBands.ts
 *
 * Visibility bands and sizing for map elements under the global-lattice ladder.
 * Design `.claude/lod-rd/06-integration-design.md` section 8 (and 3.4): every
 * element has a HOME rung (`homeLevel`, absent = 0) and is drawn over a band of
 * active rungs around it, sized from its home rung's cell size (never the active
 * rung's) and dropped once it falls under a screen-pixel floor.
 *
 * Depth mode (kgc.13) decides what happens when the camera dives FINER than the
 * home rung:
 *   - `pop`: the element is hidden as soon as the active rung is finer than its home.
 *   - `persist` (default): the element stays at every finer rung, growing with the
 *     zoom until rung home+1 activates and holding that on-screen size from then
 *     on, so it never overtakes the viewport. The hold is continuous at the
 *     crossing: no jump, just a stop.
 * Above the home rung (coarser camera) both modes behave alike: the element
 * shrinks by m per rung and drops out under its floor or its band edge.
 *
 * Pure functions only: the renderer applies them per frame in its live pass.
 */

import type { GeometryLadder } from '../core/createGeometryLadder';
import { crossingZoom } from '../core/lattice';

type DepthMode = 'pop' | 'persist';

/** Elements without an explicit mode persist: nothing a reader placed vanishes under them. */
const DEFAULT_DEPTH_MODE: DepthMode = 'persist';

/** An object smaller than this on screen (rendered width, px) is not drawn. */
const OBJECT_FLOOR_PX = 6;

/** A text label whose on-screen font size (px) is under this is not drawn. */
const LABEL_FLOOR_PX = 6;

function depthModeOf(element: { depthMode?: DepthMode }): DepthMode {
  return element.depthMode ?? DEFAULT_DEPTH_MODE;
}

/** The other mode: what a toggle writes. Always explicit, so intent survives a default change. */
function toggledDepthMode(element: { depthMode?: DepthMode }): DepthMode {
  return depthModeOf(element) === 'pop' ? 'persist' : 'pop';
}

interface DepthGroup<T> {
  home: number;
  mode: DepthMode;
  members: T[];
}

/**
 * Buckets elements by (home rung, depth mode): every member of a group is
 * visible, sized and held identically, so the renderer draws one group per call.
 * Insertion order is preserved within a group; groups are ordered by the first
 * appearance of each key, so toggling an element's mode can change its stacking
 * against overlapping elements of another group.
 */
function groupByDepth<T extends { homeLevel?: number; depthMode?: DepthMode }>(elements: readonly T[]): DepthGroup<T>[] {
  const groups = new Map<string, DepthGroup<T>>();
  for (const element of elements) {
    const home = element.homeLevel ?? 0;
    const mode = depthModeOf(element);
    const key = `${home}:${mode}`;
    const group = groups.get(key);
    if (group !== undefined) group.members.push(element);
    else groups.set(key, { home, mode, members: [element] });
  }
  return [...groups.values()];
}

/** Objects appear one rung above their home; `pop` hides them past it, `persist` keeps them at every finer rung. */
function objectVisible(homeLevel: number, activeLevel: number, mode: DepthMode = DEFAULT_DEPTH_MODE): boolean {
  if (activeLevel < homeLevel - 1) return false;
  return mode === 'persist' || activeLevel <= homeLevel;
}

/** Text labels appear two rungs above their home; `pop` hides them past it, `persist` keeps them at every finer rung. */
function labelVisible(homeLevel: number, activeLevel: number, mode: DepthMode = DEFAULT_DEPTH_MODE): boolean {
  if (activeLevel < homeLevel - 2) return false;
  return mode === 'persist' || activeLevel <= homeLevel;
}

/** Party pins are drawn at every level. */
function pinVisible(): boolean {
  return true;
}

/**
 * The zoom an element's SIZE is computed at. `persist` caps it at the zoom where
 * rung home+1 activates (`crossingZoom`), so the element holds the size it had at
 * that crossing; `pop` never reaches a finer rung, so the cap is moot and the
 * real zoom is returned. Position always uses the real zoom - only size is capped.
 */
function elementZoom(ladder: GeometryLadder, homeLevel: number, zoom: number, mode: DepthMode = DEFAULT_DEPTH_MODE): number {
  if (mode !== 'persist') return zoom;
  // The hold begins where a finer rung takes over; on the finest rung none ever does.
  if (homeLevel >= ladder.params.maxLevel) return zoom;
  return Math.min(zoom, crossingZoom(homeLevel + 1, ladder.params));
}

/**
 * Shrink factor (0 < f <= 1) the renderer applies around an element's own centre:
 * 1 while the element grows naturally, `ceiling / zoom` once it is held.
 */
function elementScale(ladder: GeometryLadder, homeLevel: number, zoom: number, mode: DepthMode = DEFAULT_DEPTH_MODE): number {
  if (zoom <= 0) return 1;
  return elementZoom(ladder, homeLevel, zoom, mode) / zoom;
}

/**
 * An object's RENDERED width on screen: `size.width * scaledSize(home)` at the
 * element zoom, the same product the object renderer draws with (review finding:
 * the cell width is the wrong quantity, an object smaller than a cell would pass
 * the floor and still draw as a speck).
 */
function objectRenderedPx(ladder: GeometryLadder, homeLevel: number, zoom: number, sizeWidth: number, mode: DepthMode = DEFAULT_DEPTH_MODE): number {
  return sizeWidth * scaledSizeForRung(ladder, homeLevel, elementZoom(ladder, homeLevel, zoom, mode));
}

/**
 * The renderer's `scaledSize` for an element homed on `homeLevel`: exactly what
 * `hexRenderer.getScaledSize(geometry, zoom)` returns (`geometry.getScaledCellSize(zoom)`),
 * but taken from the HOME rung's geometry.
 */
function scaledSizeForRung(ladder: GeometryLadder, homeLevel: number, zoom: number): number {
  return ladder.geometryForLevel(homeLevel).getScaledCellSize(zoom);
}

export type { DepthMode, DepthGroup };
export {
  DEFAULT_DEPTH_MODE,
  OBJECT_FLOOR_PX,
  LABEL_FLOOR_PX,
  depthModeOf,
  toggledDepthMode,
  groupByDepth,
  objectVisible,
  labelVisible,
  pinVisible,
  elementZoom,
  elementScale,
  objectRenderedPx,
  scaledSizeForRung
};
