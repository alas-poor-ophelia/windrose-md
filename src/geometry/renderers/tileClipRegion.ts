/**
 * tileClipRegion.ts
 *
 * Pure helpers for the ladder's "smart" root-tile clip (bead kgc.26). At rungs
 * >= 1 a ROOT tile (homeLevel 0, snapped) is clipped to the union of its own
 * hexagon and every neighbouring root hexagon that holds NO deep content, so
 * wide art keeps bleeding into empty neighbours but stops hard at the shared
 * edge with a neighbour whose fine paint it would otherwise cover. A tile with
 * no deep neighbour is not clipped at all (no Path2D is built).
 *
 * Hex tile (col, row) are axial (q, r) on the root lattice, the same space as
 * `ancestorAt`'s result, so keys compare directly.
 */

import type { Cell } from '#types/core/cell.types';
import type { MapLayer } from '#types/core/map.types';
import type { GeometryLadder } from '../core/createGeometryLadder';
import { authoredCells } from '../../persistence/layerAccessor';

/**
 * Pure: SVG path string for one hexagon in SCREEN space - centre (cx, cy),
 * circumradius `radius` (hexSize * zoom). Corner angles match
 * HexGeometry.getHexVertices (flat: 0deg + 60i, pointy: 30deg + 60i), so the clip
 * lines up with the lattice. Built as one string for a single `new Path2D(d)`.
 */
function hexClipPathString(cx: number, cy: number, radius: number, orientation: string): string {
  const angleOffset = orientation === 'flat' ? 0 : 30;
  let d = '';
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i + angleOffset);
    d += (i === 0 ? 'M' : 'L') + (cx + radius * Math.cos(a)).toFixed(3) + ' ' + (cy + radius * Math.sin(a)).toFixed(3);
  }
  return d + 'Z';
}

/** Axial neighbour directions, in the lattice's usual order. */
const AXIAL_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

const EMPTY: ReadonlySet<string> = new Set<string>();

/** Memo: ladder -> layer.levels identity -> activeLevel -> root keys. A deep edit
 *  replaces `levels` (setLevelCells spreads it), so identity tracks content. */
const memo = new WeakMap<GeometryLadder, WeakMap<object, Map<number, ReadonlySet<string>>>>();

function cellQR(cell: Cell): { q: number; r: number } {
  return 'q' in cell ? { q: cell.q, r: cell.r } : { q: cell.x, r: cell.y };
}

/**
 * Keys `${q},${r}` of every ROOT hex holding at least one authored cell on any
 * rung 1..activeLevel of `layer` (rungs finer than the active one are not
 * drawn, so they do not count). Memoised per (ladder, layer.levels identity,
 * activeLevel): the tile pass runs once per surface bake.
 */
function deepRootCellKeys(layer: MapLayer, ladder: GeometryLadder, activeLevel: number): ReadonlySet<string> {
  const levels = layer.levels;
  if (levels == null || activeLevel < 1) return EMPTY;
  let byLevels = memo.get(ladder);
  if (byLevels === undefined) {
    byLevels = new WeakMap();
    memo.set(ladder, byLevels);
  }
  let byActive = byLevels.get(levels);
  if (byActive === undefined) {
    byActive = new Map();
    byLevels.set(levels, byActive);
  }
  const hit = byActive.get(activeLevel);
  if (hit !== undefined) return hit;

  const keys = new Set<string>();
  for (let level = 1; level <= activeLevel; level++) {
    for (const cell of authoredCells(layer, level)) {
      const { q, r } = cellQR(cell);
      const root = ladder.ladder.ancestorAt(level, q, r);
      keys.add(`${root.q},${root.r}`);
    }
  }
  byActive.set(activeLevel, keys);
  return keys;
}

/**
 * The root hexes a tile at axial (col, row) should be clipped to: null when no
 * neighbour is in `deepRoots` (draw unclipped), otherwise the tile's own cell
 * plus every neighbour NOT in `deepRoots`. At most 6 hexagons (one neighbour
 * is always excluded).
 */
function tileClipHexes(col: number, row: number, deepRoots: ReadonlySet<string>): Array<{ q: number; r: number }> | null {
  if (deepRoots.size === 0) return null;
  const keep: Array<{ q: number; r: number }> = [{ q: col, r: row }];
  let blocked = false;
  for (const [dq, dr] of AXIAL_DIRECTIONS) {
    const q = col + dq;
    const r = row + dr;
    if (deepRoots.has(`${q},${r}`)) blocked = true;
    else keep.push({ q, r });
  }
  return blocked ? keep : null;
}

interface ClipShim {
  hexToWorld(q: number, r: number): { worldX: number; worldY: number };
  worldToScreen(wx: number, wy: number, offsetX: number, offsetY: number, zoom: number): { screenX: number; screenY: number };
  orientation: string;
}

/**
 * One SVG path string holding a hexagon per cell at its screen centre. The
 * hexagons are edge-adjacent and all wound the same way, so under the default
 * nonzero fill rule their overlap along shared edges adds rather than cancels
 * and the clip is exactly their union. Built once per tile for one Path2D.
 */
function unionHexClipPath(
  cells: ReadonlyArray<{ q: number; r: number }>,
  shim: ClipShim,
  viewState: { x: number; y: number; zoom: number },
  radiusPx: number
): string {
  let d = '';
  for (const c of cells) {
    const w = shim.hexToWorld(c.q, c.r);
    const s = shim.worldToScreen(w.worldX, w.worldY, viewState.x, viewState.y, viewState.zoom);
    d += hexClipPathString(s.screenX, s.screenY, radiusPx, shim.orientation);
  }
  return d;
}

export { hexClipPathString, deepRootCellKeys, tileClipHexes, unionHexClipPath };
