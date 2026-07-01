/**
 * tilePlacementOps.ts
 *
 * Pure cell-space helpers for the tile placement subtools: brush footprints,
 * Bresenham drag interpolation, and footprint-aware flood fill. Extracted from
 * TilePlacementLayer so the placement math is unit-testable without Preact.
 */

import type { TileAssignment } from '#types/tiles/tile.types';

import { cellsCoveredByAssignment, assignmentCoversCell } from '../assets/tileFootprint';

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

const FLOOD_FILL_MAX = 10000;

/**
 * Contiguous-region fill: clicking a cell occupied by tile T collects the
 * connected T-region; clicking empty collects the connected empty area bounded
 * by any snapped tile footprint (freeform stamps do not block). 4-neighbour
 * expansion, clamped to 3x map bounds and FLOOD_FILL_MAX cells.
 */
function floodFillCells(
  tiles: TileAssignment[],
  startCol: number,
  startRow: number,
  mapWidth: number,
  mapHeight: number
): Array<{ col: number; row: number }> {
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

  const visited = new Set<string>();
  const result: Array<{ col: number; row: number }> = [];
  const stack = [{ col: startCol, row: startRow }];

  while (stack.length > 0 && result.length < FLOOD_FILL_MAX) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stack is non-empty: the while-loop condition guarantees stack.length > 0
    const { col, row } = stack.pop()!;
    const key = `${col},${row}`;
    if (visited.has(key)) continue;
    visited.add(key);

    if (col < -mapWidth || col > mapWidth * 2 || row < -mapHeight || row > mapHeight * 2) continue;

    const cellId = tileMap.get(key) ?? '';
    if (cellId !== targetId) continue;

    result.push({ col, row });
    stack.push({ col: col + 1, row }, { col: col - 1, row }, { col, row: row + 1 }, { col, row: row - 1 });
  }
  return result;
}

export { getBrushCells, bresenhamLine, floodFillCells, FLOOD_FILL_MAX };
