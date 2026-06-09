/**
 * spanPredictor.ts
 *
 * Per-tile footprint (multi-cell span) detection — sibling to renderModePredictor.
 *
 * A prop image's grid footprint is its full source size divided by the art's
 * authoring resolution (pixels-per-cell) — the "first ruler". Dungeondraft authors
 * at 256px = 1 grid cell, so a 512px-wide object spans 2 cells regardless of the
 * map's own grid size. The map grid is the SECOND ruler, applied at render time
 * (footprint × cell screen size); the two are independent.
 *
 * Crucially the divisor is the tileset's authoring resolution, NOT a sampled
 * sibling tile's pixel width — dividing one tile's size by another's is meaningless
 * for packs authored at heterogeneous resolutions (the original bug: an 8-cell chair).
 *
 * Region (terrain) tiles tile seamlessly and have no footprint — callers skip
 * them. 1x1 is the implicit default, so callers persist only spans that exceed 1.
 */

import { MAX_TILE_SPAN } from './tileRenderResolution';

/** Dungeondraft's documented authoring spec: 256 source px = one grid cell. The
 *  default divisor when a tileset has no explicit pixelsPerCell override. */
export const DEFAULT_PIXELS_PER_CELL = 256;

/**
 * A dimension's source/cell ratio must reach this before the span promotes above
 * 1. Combined with round-to-nearest this means promotion effectively begins near
 * 1.5x; the floor keeps props only marginally larger than one cell at 1.
 */
export const SPAN_PROMOTE_RATIO = 1.4;

export interface SpanPrediction {
  /** Footprint width in cells (>= 1). */
  spanW: number;
  /** Footprint height in cells (>= 1). */
  spanH: number;
}

/** Cells occupied along one axis from full source extent vs. authoring px-per-cell. */
function spanForDimension(src: number, pixelsPerCell: number): number {
  if (!(src > 0) || !(pixelsPerCell > 0)) return 1;
  const ratio = src / pixelsPerCell;
  if (ratio < SPAN_PROMOTE_RATIO) return 1;
  return Math.min(Math.max(1, Math.round(ratio)), MAX_TILE_SPAN);
}

/**
 * Predict a cell tile's default footprint from its full source dimensions.
 *
 * @param srcW          full natural width in source pixels
 * @param srcH          full natural height in source pixels
 * @param pixelsPerCell the tileset's authoring resolution (source px per grid cell)
 */
export function predictSpan(
  srcW: number,
  srcH: number,
  pixelsPerCell: number,
): SpanPrediction {
  return {
    spanW: spanForDimension(srcW, pixelsPerCell),
    spanH: spanForDimension(srcH, pixelsPerCell),
  };
}
