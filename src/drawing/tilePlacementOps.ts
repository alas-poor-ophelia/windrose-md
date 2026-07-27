/**
 * tilePlacementOps.ts
 *
 * Pure cell-space helpers for the tile placement subtools: brush footprints,
 * Bresenham drag interpolation, and footprint-aware flood fill. Extracted from
 * TilePlacementLayer so the placement math is unit-testable without Preact.
 */

import type { TileAssignment } from '#types/tiles/tile.types';

import { cellsCoveredByAssignment, assignmentCoversCell } from '../assets/tileFootprint';
import type { CellCoord } from '../assets/tileFootprint';

function getBrushCells(col: number, row: number, brushSize: number): Array<{ col: number; row: number }> {
  if (brushSize <= 1) return [{ col, row }];
  const half = Math.floor(brushSize / 2);
  const cells: Array<{ col: number; row: number }> = [];
  for (let dr = -half; dr <= half; dr++)
    for (let dc = -half; dc <= half; dc++)
      cells.push({ col: col + dc, row: row + dr });
  return cells;
}

function bresenhamLine(x0: number, y0: number, x1: number, y1: number): Array<{ col: number; row: number }> {
  const points: Array<{ col: number; row: number }> = [];
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let cx = x0, cy = y0;
  while (true) {
    points.push({ col: cx, row: cy });
    if (cx === x1 && cy === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }
  }
  return points;
}

/**
 * Hard ceiling on a single flood fill. A region larger than this is treated as
 * unbounded/runaway: the fill reports `aborted` and the caller places nothing
 * rather than committing a partial fill (Guildmaster policy 2026-07-26).
 */
const FLOOD_FILL_LIMIT = 1000;

interface FloodFillOptions {
  /** Cell keys ("col,row") that block expansion regardless of tile match —
   *  e.g. structure-stratum tiles bounding a ground-layer terrain fill. */
  blockedCells?: ReadonlySet<string>;
  /** Extra bounds predicate; cells failing it stop expansion (e.g. hex map
   *  bounds, which the rectangular width/height clamp cannot express). */
  inBounds?: (col: number, row: number) => boolean;
  /** Reject a single 4-neighbour expansion step when this returns false — e.g.
   *  a wall centerline runs between the two cell centers. Tested per step. */
  canCross?: (from: CellCoord, to: CellCoord) => boolean;
}

interface FloodFillResult {
  cells: CellCoord[];
  /** True when the region exceeded FLOOD_FILL_LIMIT (unbounded / too large).
   *  Callers must place nothing and warn rather than commit a partial fill. */
  aborted: boolean;
}

/**
 * Contiguous-region fill: clicking a cell occupied by tile T collects the
 * connected T-region; clicking empty collects the connected empty area bounded
 * by any snapped tile footprint (freeform stamps do not block). 4-neighbour
 * expansion, clamped to 3x map bounds, plus any caller-supplied blocked cells /
 * bounds predicate / cross predicate. If the region exceeds FLOOD_FILL_LIMIT the
 * result is flagged `aborted` (the caller discards it).
 */
function floodFillCells(
  tiles: TileAssignment[],
  startCol: number,
  startRow: number,
  mapWidth: number,
  mapHeight: number,
  options?: FloodFillOptions
): FloodFillResult {
  const targetKey = tiles.find(t => t.freeform !== true && assignmentCoversCell(t, startCol, startRow));
  const targetId = targetKey ? `${targetKey.tilesetId}:${targetKey.tileId}` : '';

  // Register every cell of each prop's footprint so multi-cell occupants block
  // the fill across their whole area, not just the anchor.
  const tileMap = new Map<string, string>();
  for (const t of tiles) {
    if (t.freeform === true) continue;
    const id = `${t.tilesetId}:${t.tileId}`;
    for (const c of cellsCoveredByAssignment(t)) tileMap.set(`${c.col},${c.row}`, id);
  }

  const blocked = options?.blockedCells;
  const inBounds = options?.inBounds;
  const canCross = options?.canCross;
  const visited = new Set<string>();
  const result: CellCoord[] = [];
  const stack: CellCoord[] = [{ col: startCol, row: startRow }];
  let aborted = false;

  while (stack.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stack is non-empty: the while-loop condition guarantees stack.length > 0
    const current = stack.pop()!;
    const { col, row } = current;
    const key = `${col},${row}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (col < -mapWidth || col > mapWidth * 2 || row < -mapHeight || row > mapHeight * 2) continue;
    if (blocked?.has(key) === true) continue;
    if (inBounds != null && !inBounds(col, row)) continue;

    const cellId = tileMap.get(key) ?? '';
    if (cellId !== targetId) continue;

    // A genuine (LIMIT+1)th matching cell means the region is runaway; abort and
    // let the caller discard. Exactly-LIMIT regions complete normally.
    if (result.length >= FLOOD_FILL_LIMIT) { aborted = true; break; }
    result.push(current);

    const neighbors: CellCoord[] = [
      { col: col + 1, row }, { col: col - 1, row },
      { col, row: row + 1 }, { col, row: row - 1 },
    ];
    for (const nb of neighbors) {
      if (canCross != null && !canCross(current, nb)) continue;
      stack.push(nb);
    }
  }
  return { cells: result, aborted };
}

/** A wall centerline flattened to a world-space polyline (>= 2 points). */
type WallPolyline = ReadonlyArray<readonly [number, number]>;

interface WallBarrier {
  /** True when the segment between the two cell centers crosses no wall. */
  canCross: (from: CellCoord, to: CellCoord) => boolean;
}

/** Cross product of (a->b) x (a->c); >0 CCW, <0 CW, 0 collinear. */
function cross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

/** True when point (px,py) is collinear with and within the bounding box of a->b. */
function pointOnSegment(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  const EPS = 1e-6;
  if (Math.abs(cross(ax, ay, bx, by, px, py)) > EPS) return false;
  return px >= Math.min(ax, bx) - EPS && px <= Math.max(ax, bx) + EPS &&
         py >= Math.min(ay, by) - EPS && py <= Math.max(ay, by) + EPS;
}

/**
 * Intersection test for segments a1->a2 and b1->b2, INCLUSIVE of endpoint
 * touching and collinear overlap. Hex-map walls snap to hex centers by
 * default, so a wall centerline routinely shares an endpoint with (or runs
 * exactly along) the flood fill's cell-center-to-cell-center probe segment; a
 * strict "proper" (non-degenerate) intersection test misses those cases and
 * lets the fill leak through a wall the player can plainly see. Standard
 * orientation/CCW sign test for the general crossing case, falling back to
 * point-on-segment checks to catch the collinear/touching (d == 0) cases.
 * Kept local to avoid coupling this lean placement-ops module to the
 * polygon-clipping boolean stack.
 */
function segmentsIntersect(
  ax1: number, ay1: number, ax2: number, ay2: number,
  bx1: number, by1: number, bx2: number, by2: number
): boolean {
  const d1 = cross(bx1, by1, bx2, by2, ax1, ay1);
  const d2 = cross(bx1, by1, bx2, by2, ax2, ay2);
  const d3 = cross(ax1, ay1, ax2, ay2, bx1, by1);
  const d4 = cross(ax1, ay1, ax2, ay2, bx2, by2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return pointOnSegment(bx1, by1, bx2, by2, ax1, ay1) ||
         pointOnSegment(bx1, by1, bx2, by2, ax2, ay2) ||
         pointOnSegment(ax1, ay1, ax2, ay2, bx1, by1) ||
         pointOnSegment(ax1, ay1, ax2, ay2, bx2, by2);
}

/**
 * Build a coarse per-cell spatial hash of wall centerline segments, returning a
 * `canCross` predicate for floodFillCells. Each segment is bucketed into the grid
 * cells it traverses (sampled along its length, +1-cell margin), so a per-step
 * query only tests segments near the two cells involved — built ONCE per fill
 * gesture. Centerline only: widthScale is ignored because the centerline is the
 * semantic barrier.
 *
 * @param polylines  wall centerlines in world coordinates
 * @param cellCenter maps a cell (col,row) to its world-space center
 * @param worldToCell maps a world point to its integer grid cell (col,row)
 */
function buildWallBarrier(
  polylines: WallPolyline[],
  cellCenter: (col: number, row: number) => { x: number; y: number },
  worldToCell: (wx: number, wy: number) => CellCoord
): WallBarrier {
  // Each segment stored flattened as [x1, y1, x2, y2] (world coords).
  const buckets = new Map<string, number[][]>();
  const register = (col: number, row: number, seg: number[]): void => {
    const k = `${col},${row}`;
    let arr = buckets.get(k);
    if (arr == null) { arr = []; buckets.set(k, arr); }
    arr.push(seg);
  };

  for (const line of polylines) {
    for (let i = 1; i < line.length; i++) {
      const [x1, y1] = line[i - 1];
      const [x2, y2] = line[i];
      const seg = [x1, y1, x2, y2];
      const a = worldToCell(x1, y1);
      const b = worldToCell(x2, y2);
      // Sample the segment finely enough to hit every cell it traverses; the
      // 3x3 margin absorbs sampling gaps and hex-rounding error.
      const steps = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row), 1) * 2;
      const seen = new Set<string>();
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const cc = worldToCell(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t);
        for (let dc = -1; dc <= 1; dc++)
          for (let dr = -1; dr <= 1; dr++) {
            const kc = cc.col + dc, kr = cc.row + dr;
            const mk = `${kc},${kr}`;
            if (seen.has(mk)) continue;
            seen.add(mk);
            register(kc, kr, seg);
          }
      }
    }
  }

  const canCross = (from: CellCoord, to: CellCoord): boolean => {
    if (buckets.size === 0) return true;
    const p0 = cellCenter(from.col, from.row);
    const p1 = cellCenter(to.col, to.row);
    const tested = new Set<number[]>();
    for (const cell of [from, to]) {
      const arr = buckets.get(`${cell.col},${cell.row}`);
      if (arr == null) continue;
      for (const seg of arr) {
        if (tested.has(seg)) continue;
        tested.add(seg);
        if (segmentsIntersect(p0.x, p0.y, p1.x, p1.y, seg[0], seg[1], seg[2], seg[3])) return false;
      }
    }
    return true;
  };

  return { canCross };
}

export { getBrushCells, bresenhamLine, floodFillCells, buildWallBarrier, segmentsIntersect, FLOOD_FILL_LIMIT };
export type { FloodFillOptions, FloodFillResult, WallBarrier, WallPolyline };
