/**
 * depthCellOps.ts
 *
 * Pure helpers for authoring one ladder rung (level >= 1): the next content of
 * a rung after a paint or erase, the cell under a world point on a given rung,
 * and the user-facing text for a refused deep write.
 *
 * Rungs hold hex cells only (ladder maps are hex, unrotated). Every function
 * returns the SAME array reference when nothing changes, so callers can detect
 * a no-op stroke by reference (usePaintTool.flushStrokeHistory).
 *
 * Design: .claude/lod-rd/06-integration-design.md sections 4.1-4.3 and 19.
 */
import type { Cell, HexCell } from '#types/core/cell.types';
import type { Point } from '#types/core/geometry.types';
import type { DepthWriteRefusal } from '../persistence/depthAuthoring';

/** Anything that can map world px to a cell (every geometry, and a ladder rung). */
interface WorldToGridSource {
  worldToGrid(worldX: number, worldY: number): Point;
}

/** The subset of GeometryLadder this module needs. */
interface LevelGeometrySource {
  geometryForLevel(level: number): WorldToGridSource;
}

function isCellAt(cell: Cell, q: number, r: number): boolean {
  return 'q' in cell && cell.q === q && cell.r === r;
}

function keyOf(q: number, r: number): string {
  return `${q},${r}`;
}

/** The rung after painting (q, r): appended, recoloured, or unchanged (same reference). */
function withCellPainted(cells: Cell[], q: number, r: number, color: string, opacity: number): Cell[] {
  const index = cells.findIndex((c) => isCellAt(c, q, r));
  if (index === -1) {
    const added: HexCell = { q, r, color, opacity };
    return [...cells, added];
  }
  const existing = cells[index];
  if (existing.color === color && existing.opacity === opacity) return cells;
  const next = [...cells];
  next[index] = { ...existing, color, opacity };
  return next;
}

/** The rung after erasing (q, r); unchanged (same reference) when the cell was not authored. */
function withCellErased(cells: Cell[], q: number, r: number): Cell[] {
  const index = cells.findIndex((c) => isCellAt(c, q, r));
  if (index === -1) return cells;
  return cells.filter((_c, i) => i !== index);
}

/** The rung after painting every coordinate in `coords` (shape fill). */
function withCellsPainted(cells: Cell[], coords: readonly Point[], color: string, opacity: number): Cell[] {
  if (coords.length === 0) return cells;
  const byKey = new Map<string, number>();
  cells.forEach((c, i) => { if ('q' in c) byKey.set(keyOf(c.q, c.r), i); });
  const next = [...cells];
  let changed = false;
  for (const { x: q, y: r } of coords) {
    const key = keyOf(q, r);
    const index = byKey.get(key);
    if (index === undefined) {
      byKey.set(key, next.length);
      next.push({ q, r, color, opacity });
      changed = true;
    } else if (next[index].color !== color || next[index].opacity !== opacity) {
      next[index] = { ...next[index], color, opacity };
      changed = true;
    }
  }
  return changed ? next : cells;
}

/** The rung after erasing every coordinate in `coords` (rectangle erase). */
function withCellsErased(cells: Cell[], coords: readonly Point[]): Cell[] {
  if (coords.length === 0 || cells.length === 0) return cells;
  const doomed = new Set(coords.map((p) => keyOf(p.x, p.y)));
  const next = cells.filter((c) => !('q' in c && doomed.has(keyOf(c.q, c.r))));
  return next.length === cells.length ? cells : next;
}

/**
 * The cell under world point (worldX, worldY) on rung `level`. Level 0, or no
 * ladder, is exactly the root geometry's answer (what screenToGrid returns).
 */
function levelCellAtWorld(
  ladder: LevelGeometrySource | null,
  root: WorldToGridSource,
  level: number,
  worldX: number,
  worldY: number
): Point {
  if (ladder === null || level === 0) return root.worldToGrid(worldX, worldY);
  return ladder.geometryForLevel(level).worldToGrid(worldX, worldY);
}

/** Sentence-case notice text for a refused deep write. */
function depthRefusalMessage(reason: DepthWriteRefusal): string {
  switch (reason) {
    case 'over-budget': return 'Deep edit refused: over the map\'s size budget.';
    case 'too-many-cells': return 'Deep edit refused: too many cells in one operation.';
    case 'level-out-of-range': return 'Deep edit refused: this zoom level cannot be edited.';
    case 'quarantined': return 'Deep edit refused: this map\'s detail levels are read-only here.';
    case 'nested-classic': return 'Deep edit refused: this map has sub-maps, and converting it is not available yet.';
    case 'not-a-ladder': return 'Deep edit refused: this map cannot take detail edits.';
    case 'unknown-layer': return 'Deep edit refused: that layer no longer exists.';
  }
}

export type { LevelGeometrySource, WorldToGridSource };
export {
  withCellPainted, withCellErased, withCellsPainted, withCellsErased,
  levelCellAtWorld, depthRefusalMessage
};
