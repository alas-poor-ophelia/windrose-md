/**
 * elementBands.ts
 *
 * Visibility bands and sizing for map elements under the global-lattice ladder.
 * Design `.claude/lod-rd/06-integration-design.md` section 8 (and 3.4): every
 * element has a HOME rung (`homeLevel`, absent = 0) and is drawn over a band of
 * active rungs around it, sized from its home rung's cell size (never the active
 * rung's) and dropped once it falls under a screen-pixel floor.
 *
 * Pure functions only: the renderer applies them per frame in its live pass.
 */

import type { GeometryLadder } from '../core/createGeometryLadder';

/** An object smaller than this on screen (cell width, px) is not drawn. */
const OBJECT_FLOOR_PX = 6;

/** A text label whose on-screen font size (px) is under this is not drawn. */
const LABEL_FLOOR_PX = 6;

/** Objects are drawn from one rung above their home to two rungs below it. */
function objectVisible(homeLevel: number, activeLevel: number): boolean {
  return activeLevel >= homeLevel - 1 && activeLevel <= homeLevel + 2;
}

/** Text labels appear two rungs above their home and stay visible at every finer rung. */
function labelVisible(homeLevel: number, activeLevel: number): boolean {
  return activeLevel >= homeLevel - 2;
}

/** Party pins are drawn at every level. */
function pinVisible(): boolean {
  return true;
}

/**
 * An object's RENDERED width on screen: `size.width * scaledSize(home)`, the
 * same product the object renderer draws with (review finding: the cell width
 * is the wrong quantity, an object smaller than a cell would pass the floor and
 * still draw as a speck).
 */
function objectRenderedPx(ladder: GeometryLadder, homeLevel: number, zoom: number, sizeWidth: number): number {
  return sizeWidth * scaledSizeForRung(ladder, homeLevel, zoom);
}

/**
 * The renderer's `scaledSize` for an element homed on `homeLevel`: exactly what
 * `hexRenderer.getScaledSize(geometry, zoom)` returns (`geometry.getScaledCellSize(zoom)`),
 * but taken from the HOME rung's geometry.
 */
function scaledSizeForRung(ladder: GeometryLadder, homeLevel: number, zoom: number): number {
  return ladder.geometryForLevel(homeLevel).getScaledCellSize(zoom);
}

export {
  OBJECT_FLOOR_PX,
  LABEL_FLOOR_PX,
  objectVisible,
  labelVisible,
  pinVisible,
  objectRenderedPx,
  scaledSizeForRung
};
