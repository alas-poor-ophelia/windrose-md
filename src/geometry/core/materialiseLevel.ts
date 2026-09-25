/**
 * Phase 1 level materialiser.
 *
 * Design .claude/lod-rd/06-integration-design.md section 3.2 ("Materialise, do
 * not resolve lazily — dilated by one ring"). In Phase 1 there is no authored
 * content above level 0: every level-L cell inherits the plain fill colour of
 * its level-0 ancestor (nearest-centre ownership walked up the ladder) and
 * draws as a smaller hex of that colour.
 *
 * `renderLayerCellsAndEdges` consumes a whole `MapLayer` and its border pass
 * builds a lookup over ALL `layer.cells`, so inherited cells must exist as real
 * `Cell` objects in a synthetic layer rather than be resolved lazily at draw
 * time. That keeps the level-0 path byte-identical.
 *
 * The rect is dilated by one cell on every side before enumeration: a synthetic
 * layer covering exactly the padded rect reintroduces the phantom border it
 * exists to prevent, because its boundary cells see absent neighbours. The
 * outer ring is culled at draw by the renderer's existing visibility filter.
 *
 * Every non-cell collection on the synthetic layer is emptied — curves, edges,
 * objects, labels, tiles, wall paths, terrain strokes and fog stay on the
 * level-0 pass and must never be drawn twice.
 */
import { hasSegments, isHexCell } from '#types/core/cell.types';
import { cellKey } from './lattice';

import type { Cell, HexCell } from '#types/core/cell.types';
import type { MapLayer } from '#types/core/map.types';
import type { GeometryLadder } from './createGeometryLadder';

/** A world-space rectangle. Not required to be normalised; the materialiser sorts the corners. */
export interface WorldRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface MaterialiseStats {
  /** Cells in the synthetic layer. */
  cells: number;
  /** Candidate cells whose centre fell inside the dilated rect (0 on a memo hit — nothing was enumerated). */
  enumerated: number;
  /**
   * 'hit' — the memo answered, `layer` is the same object as last time.
   * 'no-entry' — nothing memoised for this `cells` array (first call, or the array was replaced by an edit).
   * 'key-changed' — this `cells` array is memoised, but for a different level, epoch or rect.
   */
  missReason: 'hit' | 'no-entry' | 'key-changed';
}

interface MemoEntry {
  layer: MapLayer;
  cells: number;
}

/** Distinct (level, epoch, rect) results retained per cells array; oldest is dropped first. */
const MEMO_LIMIT = 4;

/**
 * Keyed on `layer.cells` identity, never on the layer object: the layer is
 * re-spread on every cosmetic change, the cells array is the stable sub-array
 * that only a cell edit replaces (H-1478).
 */
const memo = new WeakMap<Cell[], Map<string, MemoEntry>>();

const SQRT3 = Math.sqrt(3);

/**
 * Every cell centre of a hex lattice of size `cellSize` in the band covering
 * the world rect, plus a little slop. Centres outside the rect are the caller's
 * to reject. The axial-to-world math is `HexGeometry.hexToWorld` at `cellSize`:
 * flat `x = 1.5 s q`, `y = sqrt3 s (r + q/2)`; pointy `x = sqrt3 s (q + r/2)`,
 * `y = 1.5 s r`.
 *
 * Private to this module on purpose — the public enumerator lives in the
 * lattice renderer; the two are deduped by the integrator, not here.
 */
function forEachCellInWorldRect(
  orientation: 'flat' | 'pointy',
  cellSize: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  fn: (q: number, r: number, worldX: number, worldY: number) => void
): void {
  const s = cellSize;
  if (orientation === 'pointy') {
    const rA = Math.floor(y0 / (1.5 * s)) - 1;
    const rB = Math.ceil(y1 / (1.5 * s)) + 1;
    for (let r = rA; r <= rB; r++) {
      const qA = Math.floor(x0 / (SQRT3 * s) - r / 2) - 1;
      const qB = Math.ceil(x1 / (SQRT3 * s) - r / 2) + 1;
      for (let q = qA; q <= qB; q++) {
        fn(q, r, SQRT3 * s * (q + r / 2), 1.5 * s * r);
      }
    }
    return;
  }
  const qA = Math.floor(x0 / (1.5 * s)) - 1;
  const qB = Math.ceil(x1 / (1.5 * s)) + 1;
  for (let q = qA; q <= qB; q++) {
    const rA = Math.floor(y0 / (SQRT3 * s) - q / 2) - 1;
    const rB = Math.ceil(y1 / (SQRT3 * s) - q / 2) + 1;
    for (let r = rA; r <= rB; r++) {
      fn(q, r, 1.5 * s * q, SQRT3 * s * (r + q / 2));
    }
  }
}

/**
 * Level-0 plain fills, keyed `"q,r"` (the `lattice.cellKey` / `buildCellLookup`
 * format). Only hex cells with a plain fill colour are inheritable: segment
 * (half-filled) cells and colourless cells are deliberately absent, so a fine
 * cell over them is not emitted at all.
 */
function buildRootFillLookup(cells: Cell[]): Map<string, string> {
  const fills = new Map<string, string>();
  for (const cell of cells) {
    if (isHexCell(cell) === false) continue;
    if (hasSegments(cell) === true) continue;
    const { color } = cell;
    if (typeof color !== 'string' || color.length === 0) continue;
    fills.set(cellKey(cell.q, cell.r), color);
  }
  return fills;
}

function roundForKey(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function memoKey(level: number, epoch: number, x0: number, y0: number, x1: number, y1: number): string {
  return `${level}|${epoch}|${roundForKey(x0)},${roundForKey(y0)},${roundForKey(x1)},${roundForKey(y1)}`;
}

/**
 * Build the synthetic level-`level` layer for `layer` over `rect`.
 *
 * `level` must be >= 1: level 0 is the real layer and is never materialised.
 * `epoch` is the lattice epoch — bump it on any edit to invalidate the memo.
 */
function materialiseLevelLayer(
  layer: MapLayer,
  ladder: GeometryLadder,
  level: number,
  rect: WorldRect,
  epoch: number
): { layer: MapLayer; stats: MaterialiseStats } {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError(`materialiseLevelLayer needs an integer level >= 1, got ${level}; level 0 is the real layer`);
  }

  // Dilate by one whole cell: the corner-to-corner extent is 2 * cellSize, and a
  // neighbour centre is only sqrt3 * cellSize away, so 2 * cellSize on every side
  // is guaranteed to include the complete neighbour ring of any cell inside rect.
  const cellSize = ladder.cellSizeAt(level);
  const pad = 2 * cellSize;
  const x0 = Math.min(rect.x0, rect.x1) - pad;
  const y0 = Math.min(rect.y0, rect.y1) - pad;
  const x1 = Math.max(rect.x0, rect.x1) + pad;
  const y1 = Math.max(rect.y0, rect.y1) + pad;

  const key = memoKey(level, epoch, x0, y0, x1, y1);
  const entries = memo.get(layer.cells);
  const cached = entries === undefined ? undefined : entries.get(key);
  if (cached !== undefined) {
    return { layer: cached.layer, stats: { cells: cached.cells, enumerated: 0, missReason: 'hit' } };
  }
  const missReason: MaterialiseStats['missReason'] =
    entries === undefined || entries.size === 0 ? 'no-entry' : 'key-changed';

  const fills = buildRootFillLookup(layer.cells);
  const synthetic: HexCell[] = [];
  let enumerated = 0;

  forEachCellInWorldRect(ladder.root.orientation, cellSize, x0, y0, x1, y1, (q, r, worldX, worldY) => {
    if (worldX < x0 || worldX > x1 || worldY < y0 || worldY > y1) return;
    enumerated++;
    // existsAt is the ONLY existence gate: rung geometries carry no bounds.
    if (ladder.existsAt(level, q, r) === false) return;
    const ancestor = ladder.ladder.ancestorAt(level, q, r);
    const color = fills.get(cellKey(ancestor.q, ancestor.r));
    if (color === undefined) return;
    synthetic.push({ q, r, color });
  });

  const result: MapLayer = {
    ...layer,
    cells: synthetic,
    curves: [],
    edges: [],
    objects: [],
    textLabels: [],
    tiles: [],
    wallPaths: [],
    terrainStrokes: [],
    fogOfWar: null
  };

  const bucket = entries ?? new Map<string, MemoEntry>();
  bucket.set(key, { layer: result, cells: synthetic.length });
  while (bucket.size > MEMO_LIMIT) {
    const oldest = bucket.keys().next();
    if (oldest.done === true) break;
    bucket.delete(oldest.value);
  }
  memo.set(layer.cells, bucket);

  return { layer: result, stats: { cells: synthetic.length, enumerated, missReason } };
}

export { materialiseLevelLayer };
