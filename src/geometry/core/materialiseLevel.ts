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
 * Phase 3c (design 06 D3/D4): a cell resolves as `authored[L] ?? resolve(L-1,
 * parentOf)` (section 1 "Resolve"). The rung's own authored cells REPLACE the
 * inherited fill at their (q,r) and draw even over an unfilled ancestor; an
 * authored cell on an intermediate rung 1..L-1 is inherited like a root fill.
 * Rungs deeper than L are never read (D4: a level's cells render only when that
 * level is active). With no `levels` on the layer the output is byte-identical to
 * the Phase 1 inherit-only materialiser, memo key included.
 *
 * Every non-cell collection on the synthetic layer is emptied — curves, edges,
 * objects, labels, tiles, wall paths, terrain strokes and fog stay on the
 * level-0 pass and must never be drawn twice.
 */
import { hasSegments, isHexCell } from '#types/core/cell.types';
import { cellKey, forEachCellInWorldRect } from './lattice';
import { authoredCells } from '../../persistence/layerAccessor';

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
   * 'key-changed' — this `cells` array is memoised, but for a different level, epoch, rect or rung array.
   * 'capped' — the rect would hold more than MATERIALISE_CELL_CAP cells at this level; nothing was
   *   enumerated and the synthetic layer is empty (a safety net for one-shot renders, never the live view).
   */
  missReason: 'hit' | 'no-entry' | 'key-changed' | 'capped';
}

/**
 * Upper bound on candidate cells one materialisation may enumerate. The live
 * view never comes near it: the active rung keeps cells at >= minCellPx on
 * screen, so a 4K viewport holds a few thousand. Only a level OVERRIDE (preview,
 * export) can ask for a rung whose cells are sub-pixel over a large rect; those
 * callers clamp their rung first (elementBands.overrideRungFor), and this cap is
 * the net under them (kgc.20: 2.3M cells, ~1 s, for one unclamped preview).
 */
const MATERIALISE_CELL_CAP = 250_000;

/** Cheap over-estimate of the candidate cells `forEachCellInWorldRect` would visit. */
function estimateCellsInRect(cellSize: number, x0: number, y0: number, x1: number, y1: number): number {
  const cols = (x1 - x0) / (1.5 * cellSize) + 3;
  const rows = (y1 - y0) / (SQRT3 * cellSize) + 3;
  return cols * rows;
}

interface MemoEntry {
  /** level | epoch | rung ids: everything but the rect. */
  key: string;
  /** The dilated world rect this entry enumerated; any request inside it is served from it. */
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  layer: MapLayer;
  cells: number;
}

/** Distinct (level, epoch, rect) results retained per cells array; oldest is dropped first. */
const MEMO_LIMIT = 4;

/**
 * Keyed on the ladder identity, then on `layer.cells` identity, never on the
 * layer object: the layer is re-spread on every cosmetic change, the cells
 * array is the stable sub-array that only a cell edit replaces (H-1478). The
 * ladder is part of the key because existence and ownership are its functions:
 * a bounds change builds a new ladder, and the old fills must not survive it.
 *
 * INVARIANT (kgc.23 c): because the key ignores the layer object, a memo hit
 * returns a synthetic layer whose non-cell fields were spread from WHATEVER
 * layer object first missed for this `cells` array. Those fields can be stale.
 * The synthetic layer may therefore be read ONLY for `cells` (the materialised
 * fills) and the deliberately emptied arrays (`edges`, `curves`, `objects`,
 * `textLabels`, `tiles`, `wallPaths`, `terrainStrokes`, `fogOfWar: null`).
 * Today its sole consumer is the cells pass of `renderLayerComposite` in
 * renderers/staticPasses.ts, which hands it to `renderLayerCellsAndEdges`;
 * that reads `cells` and `edges` and nothing else. A renderer that needs any
 * other layer field (opacity, visibility, fog, rungs, ...) must read it from the
 * real layer, never from this result. Keying on layer identity instead would
 * defeat the memo: the layer is re-spread on cosmetic changes that leave
 * `cells` untouched, so every such frame would re-materialise.
 */
const memo = new WeakMap<GeometryLadder, WeakMap<Cell[], MemoEntry[]>>();

const SQRT3 = Math.sqrt(3);

/**
 * Identity ids for rung arrays. A deep edit replaces a RUNG array through
 * `setLevelCells`, never `layer.cells`, so the cells-keyed memo alone would
 * serve stale fills; each rung 1..L contributes its array identity to the key.
 */
const rungIds = new WeakMap<Cell[], number>();
let nextRungId = 1;

function rungId(cells: Cell[]): number {
  // An absent rung reads as a fresh `[]` on every call: all empties are id 0.
  if (cells.length === 0) return 0;
  let id = rungIds.get(cells);
  if (id === undefined) {
    id = nextRungId++;
    rungIds.set(cells, id);
  }
  return id;
}

/** Key term for the rung arrays 1..level; '' when none holds cells, so a classic layer's key is unchanged. */
function rungKeyTerm(rungs: Cell[][]): string {
  const ids = rungs.map(rungId);
  return ids.some(id => id !== 0) ? `|r${ids.join('.')}` : '';
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

function memoKey(level: number, epoch: number): string {
  return `${level}|${epoch}`;
}

/** Slack on the containment test, in world px: float noise between two bakes of the same view. */
const RECT_SLACK = 1e-3;

/**
 * The entry that can answer this request: same key, and a dilated rect that CONTAINS the
 * requested one (MEM-12). A held layer that covers more than asked is still correct: its
 * extra cells lie outside the target and are culled at draw, and every cell inside the
 * request was resolved exactly as a fresh materialisation would resolve it. Containment is
 * what lets a zoom-in within a rung, or a settle bake inside an earlier larger one, hit.
 */
function findContaining(
  entries: MemoEntry[] | undefined,
  key: string,
  x0: number,
  y0: number,
  x1: number,
  y1: number
): MemoEntry | undefined {
  if (entries === undefined) return undefined;
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.key === key
      && x0 >= e.x0 - RECT_SLACK && y0 >= e.y0 - RECT_SLACK
      && x1 <= e.x1 + RECT_SLACK && y1 <= e.y1 + RECT_SLACK) return e;
  }
  return undefined;
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

  // The depth bake draws this layer with exactly `ladder.geometryForLevel(level)`, and it
  // fills every existing rung cell in the padded offscreen: opt that rung geometry into
  // string-built fills (MEM-12). Root geometry (level 0) is never touched, so classic
  // maps keep their exact context calls.
  ladder.geometryForLevel(level).batchedFills = true;

  // Dilate by one whole cell: the corner-to-corner extent is 2 * cellSize, and a
  // neighbour centre is only sqrt3 * cellSize away, so 2 * cellSize on every side
  // is guaranteed to include the complete neighbour ring of any cell inside rect.
  const cellSize = ladder.cellSizeAt(level);
  const pad = 2 * cellSize;
  const x0 = Math.min(rect.x0, rect.x1) - pad;
  const y0 = Math.min(rect.y0, rect.y1) - pad;
  const x1 = Math.max(rect.x0, rect.x1) + pad;
  const y1 = Math.max(rect.y0, rect.y1) + pad;

  // rungs[k - 1] is rung k, for k = 1..level. Deeper rungs are never read (D4).
  const rungs: Cell[][] = [];
  for (let k = 1; k <= level; k++) rungs.push(authoredCells(layer, k));
  const key = memoKey(level, epoch) + rungKeyTerm(rungs);
  const byCells = memo.get(ladder);
  const entries = byCells === undefined ? undefined : byCells.get(layer.cells);
  const cached = findContaining(entries, key, x0, y0, x1, y1);
  if (cached !== undefined) {
    return { layer: cached.layer, stats: { cells: cached.cells, enumerated: 0, missReason: 'hit' } };
  }
  const missReason: MaterialiseStats['missReason'] =
    entries === undefined || entries.length === 0 ? 'no-entry' : 'key-changed';

  if (estimateCellsInRect(cellSize, x0, y0, x1, y1) > MATERIALISE_CELL_CAP) {
    const { cells: _dropped, ...rest } = layer;
    void _dropped;
    const empty: MapLayer = { ...rest, cells: [], curves: [], edges: [], objects: [], textLabels: [], tiles: [], wallPaths: [], terrainStrokes: [] };
    return { layer: empty, stats: { cells: 0, enumerated: 0, missReason: 'capped' } };
  }

  const fills = buildRootFillLookup(layer.cells);
  // The rung's own authored hex cells, drawn as authored in place of any inherited fill.
  const own = new Map<string, HexCell>();
  for (const cell of rungs[level - 1]) {
    if (isHexCell(cell) === true) own.set(cellKey(cell.q, cell.r), cell);
  }
  // Intermediate rungs 1..level-1 with plain fills; null where the rung is empty.
  const between: Array<Map<string, string> | null> = rungs.slice(0, level - 1).map(cells => {
    const lookup = buildRootFillLookup(cells);
    return lookup.size > 0 ? lookup : null;
  });
  const walkRungs = between.some(lookup => lookup !== null);
  const synthetic: HexCell[] = [];
  let enumerated = 0;

  forEachCellInWorldRect(ladder.root.orientation, cellSize, x0, y0, x1, y1, (q, r, worldX, worldY) => {
    if (worldX < x0 || worldX > x1 || worldY < y0 || worldY > y1) return;
    enumerated++;
    // existsAt is the ONLY existence gate: rung geometries carry no bounds.
    if (ladder.existsAt(level, q, r) === false) return;
    const authored = own.size > 0 ? own.get(cellKey(q, r)) : undefined;
    if (authored !== undefined) {
      synthetic.push(authored);
      return;
    }
    let color: string | undefined;
    if (walkRungs === true) {
      // Nearest authored ancestor wins: rung level-1 first, the root last.
      let Q = q;
      let R = r;
      for (let k = level - 1; k >= 0 && color === undefined; k--) {
        const p = ladder.ladder.parentOf(Q, R);
        Q = p.Q;
        R = p.R;
        const lookup = k === 0 ? fills : between[k - 1];
        if (lookup !== null) color = lookup.get(cellKey(Q, R));
      }
    } else {
      const ancestor = ladder.ladder.ancestorAt(level, q, r);
      color = fills.get(cellKey(ancestor.q, ancestor.r));
    }
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

  const bucket = entries ?? [];
  // An entry this one now covers (same key, rect inside the new one) can never be
  // the better answer again: drop it so the four slots hold distinct coverage.
  const kept = bucket.filter(e => !(e.key === key && e.x0 >= x0 && e.y0 >= y0 && e.x1 <= x1 && e.y1 <= y1));
  kept.push({ key, x0, y0, x1, y1, layer: result, cells: synthetic.length });
  while (kept.length > MEMO_LIMIT) kept.shift();
  const ladderBucket = byCells ?? new WeakMap<Cell[], MemoEntry[]>();
  ladderBucket.set(layer.cells, kept);
  memo.set(ladder, ladderBucket);

  return { layer: result, stats: { cells: synthetic.length, enumerated, missReason } };
}

export { materialiseLevelLayer, estimateCellsInRect, MATERIALISE_CELL_CAP };
