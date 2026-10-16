/**
 * tileRotation.ts
 *
 * Tile rotation step grids. The legal rotation steps depend on the map's
 * geometry AND the placement mode (Guildmaster ruling on windrose-mn1.81):
 *
 * - cell-snapped on a GRID map: 90-degree steps (a square tile at 60 degrees
 *   cannot sit in its square cell);
 * - cell-snapped on a HEX map: 60-degree steps;
 * - FREEFORM (world-positioned stamps) on either map: 15-degree steps.
 *
 * Stored rotations are never rewritten to fit the grid. A value that is off
 * the current grid (e.g. a tile placed at 60 on a grid map before this rule)
 * stays as authored; the next cycle step snaps to the nearest grid step in the
 * cycle direction.
 */

export type TileGeometryKind = 'grid' | 'hex';

const GRID_SNAPPED_STEPS: readonly number[] = Object.freeze([0, 90, 180, 270]);
const HEX_SNAPPED_STEPS: readonly number[] = Object.freeze([0, 60, 120, 180, 240, 300]);
/** Freeform increment, in degrees (24 positions). */
export const FREEFORM_ROTATION_INCREMENT = 15;
const FREEFORM_STEPS: readonly number[] = Object.freeze(
  Array.from({ length: 360 / FREEFORM_ROTATION_INCREMENT }, (_, i) => i * FREEFORM_ROTATION_INCREMENT),
);

/** The ascending rotation cycle (degrees, starting at 0) for a map geometry and placement mode. */
export function rotationStepsFor(geometryKind: TileGeometryKind, freeform: boolean): readonly number[] {
  if (freeform) return FREEFORM_STEPS;
  return geometryKind === 'hex' ? HEX_SNAPPED_STEPS : GRID_SNAPPED_STEPS;
}

/** Map a map-type string (mapData.mapType) to a tile geometry kind; anything not hex is grid. */
export function tileGeometryKind(mapType: string | null | undefined): TileGeometryKind {
  return mapType === 'hex' ? 'hex' : 'grid';
}

/** Normalise any angle to [0, 360). Non-finite input becomes 0. */
export function normalizeRotation(deg: number): number {
  if (!Number.isFinite(deg)) return 0;
  const r = ((deg % 360) + 360) % 360;
  return r === 360 ? 0 : r;
}

/**
 * Next rotation in the cycle. `direction` 1 = clockwise (ascending), -1 =
 * counter-clockwise. From an on-grid value this is the adjacent step; from an
 * off-grid value it is the nearest step strictly beyond it in that direction,
 * wrapping at 360.
 */
export function nextRotation(current: number, steps: readonly number[], direction: 1 | -1): number {
  if (steps.length === 0) return normalizeRotation(current);
  const cur = normalizeRotation(current);
  if (direction === 1) {
    for (const s of steps) if (s > cur) return s;
    return steps[0];
  }
  for (let i = steps.length - 1; i >= 0; i--) if (steps[i] < cur) return steps[i];
  return steps[steps.length - 1];
}

/** Whether `deg` lies on the given step grid (after normalising). */
export function isOnRotationGrid(deg: number, steps: readonly number[]): boolean {
  return steps.includes(normalizeRotation(deg));
}

/** Nearest step on the grid to `deg` (ties resolve to the lower step); used to fit a brush to a new mode. */
export function snapRotationToGrid(deg: number, steps: readonly number[]): number {
  const cur = normalizeRotation(deg);
  let best = steps[0] ?? 0;
  let bestDist = Infinity;
  for (const s of steps) {
    const d = Math.min(Math.abs(s - cur), 360 - Math.abs(s - cur));
    if (d < bestDist) { best = s; bestDist = d; }
  }
  return best;
}
