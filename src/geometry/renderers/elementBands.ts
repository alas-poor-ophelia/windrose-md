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
 * Explicit levels (kgc.31): an element carrying `visibleLevels` (sorted unique
 * rung indices) is visible on exactly those rungs, overriding the band and the
 * depth mode; absent means "Auto", the band rule above. Size floors and holds
 * still apply either way. Every per-element decision goes through
 * `elementVisibleAt`.
 *
 * Pure functions only: the renderer applies them per frame in its live pass
 * (ladderElementPass.ts). Party pins are band-exempt: they draw at every level
 * and never come through here.
 */

import type { GeometryLadder } from '../core/createGeometryLadder';
import { crossingZoom } from '../core/lattice';

type DepthMode = 'pop' | 'persist';

/** Elements without an explicit mode persist: nothing a reader placed vanishes under them. */
const DEFAULT_DEPTH_MODE: DepthMode = 'persist';

/**
 * An object smaller than this on screen (rendered width, px) is not drawn. The
 * ladder hit-test (objects/ladderHitTest.ts) applies the same constant, so an
 * object under the floor is neither painted nor pickable.
 */
const OBJECT_FLOOR_PX = 6;

/**
 * A text label whose on-screen font size (px) is under this is not drawn (nor
 * hit, textLabelOperations.ts). Independent of OBJECT_FLOOR_PX: one measures an
 * object's rendered width, the other a font size. They share the value 6 only
 * because both are "too small to read"; tune either alone.
 */
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
  /** Explicit rung set shared by every member, or undefined for Auto. */
  levels: readonly number[] | undefined;
  members: T[];
}

/** What a band decision needs from an element. */
interface BandedElement {
  homeLevel?: number;
  depthMode?: DepthMode;
  visibleLevels?: readonly number[];
}

type BandKind = 'object' | 'label';

const depthGroupMemo = new WeakMap<readonly BandedElement[], { length: number; groups: readonly DepthGroup<BandedElement>[] }>();

/**
 * Buckets elements by (home rung, depth mode, explicit levels): every member of a group is
 * visible, sized and held identically, so the renderer draws one group per call.
 * Insertion order is preserved within a group; groups are ordered by the first
 * appearance of each key, so toggling an element's mode can change its stacking
 * against overlapping elements of another group.
 */
function groupByDepth<T extends BandedElement>(elements: readonly T[]): readonly DepthGroup<T>[] {
  // Memoised on the array identity: element arrays are replaced on every write,
  // and one frame groups the same array for the draw pass, the selection chrome
  // and the hit-test. The length check rebuilds after an in-place push. The
  // groups are shared between callers: never mutate them.
  const held = depthGroupMemo.get(elements);
  if (held !== undefined && held.length === elements.length) return held.groups as readonly DepthGroup<T>[];
  const groups = new Map<string, DepthGroup<T>>();
  for (const element of elements) {
    const home = element.homeLevel ?? 0;
    const mode = depthModeOf(element);
    const levels = element.visibleLevels;
    const key = `${home}:${mode}:${levels === undefined ? 'auto' : levels.join(',')}`;
    const group = groups.get(key);
    if (group !== undefined) group.members.push(element);
    else groups.set(key, { home, mode, levels, members: [element] });
  }
  const result = [...groups.values()];
  depthGroupMemo.set(elements, { length: elements.length, groups: result });
  return result;
}

/**
 * THE visibility decision for one object or text label on `activeLevel`: the
 * explicit `visibleLevels` set when present, else the Auto band for its kind.
 */
function elementVisibleAt(element: BandedElement, activeLevel: number, kind: BandKind): boolean {
  if (element.visibleLevels !== undefined) return element.visibleLevels.includes(activeLevel);
  const home = element.homeLevel ?? 0;
  const mode = depthModeOf(element);
  return kind === 'label' ? labelInBand(home, activeLevel, mode) : objectInBand(home, activeLevel, mode);
}

/** A depth group's decision: its members share home, mode and level set. */
function groupVisibleAt<T>(group: DepthGroup<T>, activeLevel: number, kind: BandKind): boolean {
  return elementVisibleAt({ homeLevel: group.home, depthMode: group.mode, visibleLevels: group.levels }, activeLevel, kind);
}

/**
 * The rungs 0..maxLevel an element shows on today: its explicit set, or the
 * Auto band evaluated rung by rung. The level picker seeds its first edit from
 * this, so leaving Auto starts from what is already visible.
 */
function effectiveVisibleLevels(element: BandedElement, maxLevel: number, kind: BandKind): number[] {
  const out: number[] = [];
  for (let level = 0; level <= maxLevel; level++) {
    if (elementVisibleAt(element, level, kind)) out.push(level);
  }
  return out;
}

/**
 * The Auto BAND only, for objects: one rung above home, and `pop` hides them past
 * it while `persist` keeps them at every finer rung. Not the final draw answer:
 * the explicit `visibleLevels` set (elementVisibleAt) and the size floor
 * (OBJECT_FLOOR_PX via objectRenderedPx) still apply.
 */
function objectInBand(homeLevel: number, activeLevel: number, mode: DepthMode = DEFAULT_DEPTH_MODE): boolean {
  if (activeLevel < homeLevel - 1) return false;
  return mode === 'persist' || activeLevel <= homeLevel;
}

/** The Auto band only, for text labels: two rungs above home, otherwise as objectInBand (LABEL_FLOOR_PX applies separately). */
function labelInBand(homeLevel: number, activeLevel: number, mode: DepthMode = DEFAULT_DEPTH_MODE): boolean {
  if (activeLevel < homeLevel - 2) return false;
  return mode === 'persist' || activeLevel <= homeLevel;
}

/**
 * The `visibleLevels` a picker writes when rung `level` is switched `on` (or
 * off) for `element`: the edit starts from the CURRENT effective set (Auto's
 * band when the field is absent), and an emptied set reverts to Auto
 * (undefined), so no element is ever stored invisible everywhere.
 */
function withLevelMembership(element: BandedElement, level: number, on: boolean, maxLevel: number, kind: BandKind): number[] | undefined {
  const set = new Set(effectiveVisibleLevels(element, maxLevel, kind));
  if (on) set.add(level);
  else set.delete(level);
  const next = [...set].sort((a, b) => a - b);
  return next.length === 0 ? undefined : next;
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

/**
 * Snapped tiles under the ladder: each draws ONCE on its HOME rung's geometry,
 * and a tile homed on a FINER rung than the active one does not draw at all
 * (design s8, band home..home plus inheritance). Returns the drawable groups by
 * home rung, coarsest first; the home-0 group is always present, even empty,
 * because the root-anchored terrain strokes ride with it. Insertion order is
 * kept within a group. Used by the active layer and both ghost passes alike
 * (kgc.22): the level-0 band is not a special case.
 */
function tilesByHomeForRung<T extends { homeLevel?: number }>(tiles: readonly T[], activeLevel: number): Array<[number, T[]]> {
  const byHome = new Map<number, T[]>([[0, []]]);
  for (const tile of tiles) {
    const home = tile.homeLevel ?? 0;
    if (home > activeLevel) continue;
    const group = byHome.get(home);
    if (group !== undefined) group.push(tile);
    else byHome.set(home, [tile]);
  }
  return [...byHome.entries()].sort((a, b) => a[0] - b[0]);
}

/**
 * The rung a one-shot render (hover preview, export) may draw: never finer than
 * the rung its own zoom would activate. A deep-authored map previews its
 * deepest rung (design s19 item 3) only when the preview zoom actually reaches
 * it; at a zoom where those cells are sub-pixel the materialiser and the clip
 * path would still enumerate every one of them (2.3M cells, about a second in
 * Node, for a 400x300 preview of rung 3 at zoom 0.3, kgc.20) to show nothing.
 */
function overrideRungFor(ladder: GeometryLadder, deepestAuthored: number, zoom: number): number {
  return Math.max(0, Math.min(deepestAuthored, ladder.activeLevel(zoom)));
}

export type { DepthMode, DepthGroup, BandedElement, BandKind };
export {
  DEFAULT_DEPTH_MODE,
  OBJECT_FLOOR_PX,
  LABEL_FLOOR_PX,
  depthModeOf,
  toggledDepthMode,
  groupByDepth,
  elementVisibleAt,
  groupVisibleAt,
  effectiveVisibleLevels,
  withLevelMembership,
  tilesByHomeForRung,
  overrideRungFor,
  objectInBand,
  labelInBand,
  elementZoom,
  elementScale,
  objectRenderedPx,
  scaledSizeForRung
};
