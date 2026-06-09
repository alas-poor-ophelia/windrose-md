/**
 * spanPredictor.ts
 *
 * Per-tile footprint (multi-cell span) detection — sibling to renderModePredictor.
 *
 * A prop image whose tight opaque content is clearly larger than one cell in a
 * dimension should occupy that many cells. Compares the TIGHT opaque bounds from
 * the eager scan (opaqueW/opaqueH, in source pixels) against the tileset's
 * per-cell pixel size, so transparent padding can't inflate the footprint.
 *
 * Region (terrain) tiles tile seamlessly and have no footprint — callers skip
 * them. 1x1 is the implicit default, so callers persist only spans that exceed 1.
 */

import { MAX_TILE_SPAN } from './tileRenderResolution';

/**
 * A dimension's opaque/cell ratio must reach this before the span promotes above
 * 1. Combined with round-to-nearest this means promotion effectively begins near
 * 1.5x; the floor keeps props that are only marginally larger than one cell at 1.
 */
export const SPAN_PROMOTE_RATIO = 1.4;

export interface SpanPrediction {
  /** Footprint width in cells (>= 1). */
  spanW: number;
  /** Footprint height in cells (>= 1). */
  spanH: number;
}

/** Cells occupied along one axis from tight opaque extent vs. per-cell size. */
function spanForDimension(opaque: number, cell: number): number {
  if (!(opaque > 0) || !(cell > 0)) return 1;
  const ratio = opaque / cell;
  if (ratio < SPAN_PROMOTE_RATIO) return 1;
  return Math.min(Math.max(1, Math.round(ratio)), MAX_TILE_SPAN);
}

/**
 * Predict a cell tile's default footprint from its tight opaque bounds.
 *
 * @param opaqueW    tight opaque width in source pixels (from the eager scan)
 * @param opaqueH    tight opaque height in source pixels
 * @param tileWidth  tileset per-cell width in source pixels
 * @param tileHeight tileset per-cell height in source pixels
 */
export function predictSpan(
  opaqueW: number,
  opaqueH: number,
  tileWidth: number,
  tileHeight: number,
): SpanPrediction {
  return {
    spanW: spanForDimension(opaqueW, tileWidth),
    spanH: spanForDimension(opaqueH, tileHeight),
  };
}
