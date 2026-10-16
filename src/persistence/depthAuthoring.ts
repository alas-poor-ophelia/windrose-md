/**
 * The single gate every deep (rung >= 1) write passes through.
 *
 * Design .claude/lod-rd/06-integration-design.md section 19 items 1, 2, 9:
 *  - authoring at depth needs the capability flag, a ladder view, and no
 *    quarantine; the FIRST deep write stamps `lod` onto the map in the same
 *    update, so the map is a ladder map on every install from then on;
 *  - a single operation may not produce more than MAX_CELLS_PER_DEPTH_OP cells;
 *  - a write that would push the map's save-journal payload past
 *    DEPTH_BUDGET_BYTES is REFUSED, not warned about: the journal refuses a
 *    payload over its cap (with one notice per map per session), so crossing
 *    it would drop crash protection for every later edit of the map.
 *
 * The budget is measured in the journal's own unit: the STORED payload length
 * (journalPayloadLength: plain JSON up to RAW_PAYLOAD_LIMIT, deflated base64
 * above it). It is measured once per operation (or brush stroke) and the
 * operation's growth is added RAW on top, which over-counts (raw bytes
 * deflate roughly tenfold) and so errs toward refusing (DATA-01).
 *
 * Tools, the MCP bridge and any future caller use `writeDepthCells`; nothing
 * else may call `setLevelCells` for a user action.
 */
import type { LadderConfig, MapData } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import { isHexCell } from '#types/core/cell.types';
import type { LayerId } from '#types/core/map.types';

import { isDepthQuarantined, isLadderView, isLodLadderEnabled, ladderParamsFor, hasSubHexChildren, hasDepthContent } from '../core/lodFlags';
import { authoredCells, setLevelCells } from './layerAccessor';
import { MAX_JOURNAL_PAYLOAD, journalPayloadLength } from './saveJournal';

/**
 * Hard refusal threshold: 80% of the save journal's payload cap. Unit: the
 * stored journal payload's length in string units (journalPayloadLength), the
 * value saveJournal compares against MAX_JOURNAL_PAYLOAD. That payload is
 * deflated base64 for any large map, so a CJK-heavy or tile-heavy map is held
 * to what the journal actually stores, not to its raw JSON or UTF-8 size.
 */
const DEPTH_BUDGET_BYTES = Math.floor(MAX_JOURNAL_PAYLOAD * 0.8);
/** Cells one operation may ADD to a rung (design section 3.6). */
const MAX_CELLS_PER_DEPTH_OP = 4096;
/** Serialised bytes per hex cell, measured on the fixture (q, r, colour). */
const BYTES_PER_CELL_ESTIMATE = 36;

/**
 * The map's save-journal payload length now: the measurement an operation takes
 * once at its start and passes as `DepthWriteContext.serialisedBytes`. One
 * JSON.stringify plus, past RAW_PAYLOAD_LIMIT, one deflate.
 *
 * NOTE: inside a sub-hex view `mapData` is the child map while the journal
 * stores the root entry, so this under-counts there (DATA-01, caller side).
 */
function depthBudgetBytesOf(mapData: MapData): number {
  return journalPayloadLength(JSON.stringify(mapData));
}

/** Serialised size of one element (object, text label, tile) a deep write adds; 0 when it cannot be serialised. */
function elementBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return typeof json === 'string' ? json.length : 0;
  } catch {
    return 0;
  }
}

type DepthWriteRefusal =
  | 'not-a-ladder'
  | 'nested-classic'
  | 'quarantined'
  | 'level-out-of-range'
  | 'too-many-cells'
  | 'over-budget'
  | 'unknown-layer';

/**
 * Optional context for a write that is one tick of a longer operation (a brush
 * stroke). Both are measured at the operation's START, so the per-op cap and the
 * budget apply to the operation as a whole and the map is serialised once per
 * operation instead of once per tick (kgc.23).
 */
interface DepthWriteContext {
  /** The rung's cells when the operation began; the cap counts cells added since. Default: the rung's current cells. */
  baseline?: Cell[];
  /**
   * The map's journal payload length (depthBudgetBytesOf) when `baseline` was
   * taken. Default: measured now. A raw `JSON.stringify(mapData).length` is
   * accepted too: never smaller, so it only refuses earlier.
   */
  serialisedBytes?: number;
  /**
   * Serialised bytes the write ADDS beyond cells (objects, text, tiles homed on
   * the rung). Such a write grows the map even when the rung's cells do not, so
   * it is held to the budget (kgc.25). Default 0.
   */
  addedBytes?: number;
  /**
   * True when the map had no `lod` block when the operation began. A tick that
   * leaves such a map with no depth content again (a stroke that paints a cell
   * and erases it) returns it WITHOUT the stamp an earlier tick added, so the
   * operation as a whole cannot turn a classic map into a ladder map (DATA-02).
   * Default false: the stamp is kept.
   */
  lodAbsentAtStart?: boolean;
}

type DepthWriteResult =
  | { ok: true; mapData: MapData }
  | { ok: false; reason: DepthWriteRefusal; mapData: MapData };

/** May this map START taking deep edits? Flag on, ladder view, not quarantined. `lod` may still be absent. */
function canBeginDepthAuthoring(mapData: MapData | null | undefined): boolean {
  if (mapData === null || mapData === undefined) return false;
  if (!isLodLadderEnabled()) return false;
  if (!isLadderView(mapData)) return false;
  return !isDepthQuarantined(mapData).quarantined;
}

/**
 * Why this map may not START taking deep edits, or null when it may
 * (`canBeginDepthAuthoring`). The reason a tool names in its refusal notice.
 */
function depthEntryRefusal(mapData: MapData): DepthWriteRefusal | null {
  if (canBeginDepthAuthoring(mapData)) return null;
  if (isDepthQuarantined(mapData).quarantined) return 'quarantined';
  // A classic map with sub-hex children never takes the lod stamp (design s9):
  // the stamp would hide its children behind the ladder for good (kgc.15).
  if (mapData.lod === undefined && hasSubHexChildren(mapData)) return 'nested-classic';
  return 'not-a-ladder';
}

/**
 * The map with a `lod` block, stamped when absent from the EFFECTIVE parameters
 * (`ladderParamsFor`: the defaults, then the developer override in full). Those
 * are the parameters the view ladder laid the first stroke out on, so the
 * stored block must repeat them: stamping the bare defaults under an `m` or
 * `maxLevel` override would re-partition the map on the next frame and read the
 * stroke's cells back at the wrong positions, or quarantine the map at once for
 * content past its stored maxLevel (kgc.16). Same reference when present.
 */
function withLod(mapData: MapData): MapData {
  if (mapData.lod !== undefined) return mapData;
  const { m, minCellPx, maxLevel } = ladderParamsFor(mapData);
  const lod: LadderConfig = { m, minCellPx, maxLevel };
  return { ...mapData, lod };
}

/** Position key of a rung cell (rung cells are hex; grid cells key by x,y). */
function cellPositionKey(cell: Cell): string {
  return isHexCell(cell) ? `${cell.q},${cell.r}` : `${cell.x},${cell.y}`;
}

/** Key sets per cell array; rung arrays are immutable, so a stroke's baseline is keyed once. */
const cellKeySetCache = new WeakMap<Cell[], Set<string>>();

function cellKeySet(cells: Cell[]): Set<string> {
  let keys = cellKeySetCache.get(cells);
  if (keys === undefined) {
    keys = new Set(cells.map(cellPositionKey));
    cellKeySetCache.set(cells, keys);
  }
  return keys;
}

/** Cells in `next` whose position is not in `from` (a recolour adds nothing). */
function countAddedCells(next: Cell[], from: Cell[]): number {
  const existing = cellKeySet(from);
  let added = 0;
  for (const cell of next) {
    if (!existing.has(cellPositionKey(cell))) added++;
  }
  return added;
}

/**
 * Check a proposed rung write without applying it. `nextCells` is the FULL
 * intended content of the rung after the write. A write that adds no cell
 * position (identity, erase, recolour) and adds no element bytes is never refused on size: the stroke-end history write
 * re-writes the current rung and must always land (kgc.23 e).
 */
function guardDepthWrite(
  mapData: MapData,
  layerId: LayerId,
  level: number,
  nextCells: Cell[],
  context: DepthWriteContext = {}
): DepthWriteRefusal | null {
  const entry = depthEntryRefusal(mapData);
  if (entry !== null) return entry;
  const params = ladderParamsFor(withLod(mapData));
  if (!Number.isInteger(level) || level < 1 || level > params.maxLevel) return 'level-out-of-range';
  // Never fall back to another layer: counting the active layer while
  // setLevelCells no-ops on the unknown id would report success and stamp lod.
  const layer = mapData.layers.find((l) => l.id === layerId);
  if (layer === undefined) return 'unknown-layer';
  const current = authoredCells(layer, level);
  const addedBytes = Math.max(0, context.addedBytes ?? 0);
  // Growth is counted BY KEY, not by length delta: a write that erases N cells
  // and paints N others nets zero length but adds N cells (Codex review).
  const addedNow = nextCells === current ? 0 : countAddedCells(nextCells, current);
  if (addedNow === 0 && addedBytes === 0) return null;
  const baseline = context.baseline ?? current;
  const added = baseline === current ? addedNow : countAddedCells(nextCells, baseline);
  if (added > MAX_CELLS_PER_DEPTH_OP) return 'too-many-cells';
  // Encoded size at the operation's start plus its growth counted RAW: the
  // growth is not deflated in the projection, so it over-counts and refuses early.
  const projected = context.serialisedBytes !== undefined
    ? context.serialisedBytes + added * BYTES_PER_CELL_ESTIMATE + addedBytes
    : depthBudgetBytesOf(mapData) + addedNow * BYTES_PER_CELL_ESTIMATE + addedBytes;
  if (projected > DEPTH_BUDGET_BYTES) return 'over-budget';
  return null;
}

/**
 * Apply a guarded rung write. On refusal the original map is returned untouched.
 * A write that changes nothing (setLevelCells returns the same map: an erase on
 * an empty rung, the rung's own array) returns the SAME map without the `lod`
 * stamp, so a no-op can never turn a classic map into a ladder map (DATA-02).
 */
function writeDepthCells(
  mapData: MapData,
  layerId: LayerId,
  level: number,
  nextCells: Cell[],
  context: DepthWriteContext = {}
): DepthWriteResult {
  const reason = guardDepthWrite(mapData, layerId, level, nextCells, context);
  if (reason !== null) return { ok: false, reason, mapData };
  const written = setLevelCells(mapData, layerId, level, nextCells);
  if (written === mapData) return { ok: true, mapData };
  if (context.lodAbsentAtStart === true && written.lod !== undefined && !hasDepthContent(written)) {
    const { lod: _dropped, ...unstamped } = written;
    void _dropped;
    return { ok: true, mapData: unstamped };
  }
  return { ok: true, mapData: withLod(written) };
}

export type { DepthWriteContext, DepthWriteRefusal, DepthWriteResult };
export { BYTES_PER_CELL_ESTIMATE, elementBytes, depthBudgetBytesOf, DEPTH_BUDGET_BYTES, MAX_CELLS_PER_DEPTH_OP, canBeginDepthAuthoring, depthEntryRefusal, withLod, guardDepthWrite, writeDepthCells };
