/**
 * tileFootprint.ts
 *
 * Multi-cell footprint geometry for placed tiles. A snapped TileAssignment
 * anchored at (col, row) with spanW x spanH occupies a rectangular block of
 * cells extending right and down from the anchor — the anchor is the TOP-LEFT
 * cell of the footprint.
 *
 * Footprints are a GRID concept; on hex maps callers keep span at 1. A 90 or
 * 270 degree rotation swaps the effective width and height so a non-square
 * prop's covered cells (and its draw rect) track the rotated orientation —
 * without the swap the stored span would describe the unrotated box and
 * erase/hit-test would miss cells (data corruption with no migration).
 *
 * Freeform stamps are world-positioned, not cell-anchored, so they cover no
 * grid cells.
 */

import type { TileAssignment } from '#types/tiles/tile.types';
import type { MapLayer } from '#types/core/map.types';
import { MAX_TILE_SPAN } from './tileRenderResolution';

export interface CellCoord {
  col: number;
  row: number;
}

/** A tile hit resolved across several layers: the owning layer and the tile's index in it. */
export interface TileLayerHit {
  layer: MapLayer;
  index: number;
}

function clampSpan(n: number | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), MAX_TILE_SPAN);
}

/**
 * Effective footprint after rotation. 90/270 degrees swap width and height;
 * other angles (including the hex 60-degree steps) leave the box as authored.
 */
export function effectiveSpan(
  a: Pick<TileAssignment, 'spanW' | 'spanH' | 'rotation'>,
): { spanW: number; spanH: number } {
  const spanW = clampSpan(a.spanW);
  const spanH = clampSpan(a.spanH);
  const rot = (((a.rotation ?? 0) % 360) + 360) % 360;
  return rot === 90 || rot === 270 ? { spanW: spanH, spanH: spanW } : { spanW, spanH };
}

/** All grid cells a snapped assignment covers (top-left anchor, extends right/down). */
export function cellsCoveredByAssignment(a: TileAssignment): CellCoord[] {
  if (a.freeform === true) return [];
  const { spanW, spanH } = effectiveSpan(a);
  const cells: CellCoord[] = [];
  for (let dr = 0; dr < spanH; dr++) {
    for (let dc = 0; dc < spanW; dc++) {
      cells.push({ col: a.col + dc, row: a.row + dr });
    }
  }
  return cells;
}

/** Whether a snapped assignment's footprint covers the given cell. */
export function assignmentCoversCell(a: TileAssignment, col: number, row: number): boolean {
  if (a.freeform === true) return false;
  const { spanW, spanH } = effectiveSpan(a);
  return col >= a.col && col < a.col + spanW && row >= a.row && row < a.row + spanH;
}

/** Whether two snapped assignments' footprints overlap in any cell. */
export function assignmentsOverlap(a: TileAssignment, b: TileAssignment): boolean {
  if (a.freeform === true || b.freeform === true) return false;
  const sa = effectiveSpan(a);
  const sb = effectiveSpan(b);
  return (
    a.col < b.col + sb.spanW &&
    a.col + sa.spanW > b.col &&
    a.row < b.row + sb.spanH &&
    a.row + sa.spanH > b.row
  );
}

/**
 * Topmost (last-placed) snapped assignment whose footprint covers (col, row),
 * optionally constrained to a placement tier. Reverse scan = last drawn wins.
 */
export function findAssignmentAt(
  tiles: TileAssignment[],
  col: number,
  row: number,
  opts?: { placement?: 'fill' | 'overlay' },
): TileAssignment | undefined {
  for (let i = tiles.length - 1; i >= 0; i--) {
    const t = tiles[i];
    if (opts?.placement != null && (t.placement ?? 'fill') !== opts.placement) continue;
    if (assignmentCoversCell(t, col, row)) return t;
  }
  return undefined;
}

/**
 * Whether an assignment claims the given cell for hit-testing purposes.
 * Snapped tiles use their (rotation-aware) footprint; freeform stamps are
 * world-positioned and only ever match their drop cell.
 */
export function tileHitsCell(t: TileAssignment, col: number, row: number, level?: number): boolean {
  if (level !== undefined && (t.homeLevel ?? 0) !== level) return false;
  return t.freeform === true
    ? (t.col === col && t.row === row)
    : assignmentCoversCell(t, col, row);
}

/**
 * Topmost tile hit at (col, row) across a stack of layers. `level` restricts
 * the hit to tiles homed on that ladder rung (rung cells share index space);
 * omitted, any rung matches.
*
 * `layers` must be in ASCENDING draw order (as returned by
 * `getActiveBoardLayers`); the scan runs in reverse so the TOP stratum wins,
 * and within a layer an `overlay` tile wins over a `fill` tile. Layers are
 * taken as given — visibility filtering belongs to the caller, which knows
 * whether the active layer should be searched even when hidden.
 */
export function findTileHitInLayers(
  layers: readonly MapLayer[],
  col: number,
  row: number,
  level?: number,
): TileLayerHit | null {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    const tiles = layer.tiles;
    if (tiles == null || tiles.length === 0) continue;

    const overlayIdx = tiles.findIndex(t => tileHitsCell(t, col, row, level) && t.placement === 'overlay');
    if (overlayIdx >= 0) return { layer, index: overlayIdx };

    const baseIdx = tiles.findIndex(t => tileHitsCell(t, col, row, level));
    if (baseIdx >= 0) return { layer, index: baseIdx };
  }
  return null;
}
