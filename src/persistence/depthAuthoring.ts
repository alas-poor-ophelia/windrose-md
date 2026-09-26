/**
 * The single gate every deep (rung >= 1) write passes through.
 *
 * Design .claude/lod-rd/06-integration-design.md section 19 items 1, 2, 9:
 *  - authoring at depth needs the capability flag, a ladder view, and no
 *    quarantine; the FIRST deep write stamps `lod` onto the map in the same
 *    update, so the map is a ladder map on every install from then on;
 *  - a single operation may not produce more than MAX_CELLS_PER_DEPTH_OP cells;
 *  - a write that would push the serialised map past DEPTH_BUDGET_BYTES is
 *    REFUSED, not warned about: the save journal silently skips payloads over
 *    its cap, so crossing it would silently drop crash protection.
 *
 * Tools, the MCP bridge and any future caller use `writeDepthCells`; nothing
 * else may call `setLevelCells` for a user action.
 */
import type { LadderConfig, MapData } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { LayerId } from '#types/core/map.types';

import { LADDER_DEFAULTS } from '../geometry/core/lattice';
import { isDepthQuarantined, isLadderView, isLodLadderEnabled, ladderParamsFor } from '../core/lodFlags';
import { authoredCells, getActiveLayer, setLevelCells } from './layerAccessor';
import { MAX_JOURNAL_PAYLOAD } from './saveJournal';

/** Hard refusal threshold: 80% of the save journal's payload cap. */
const DEPTH_BUDGET_BYTES = Math.floor(MAX_JOURNAL_PAYLOAD * 0.8);
/** Cells one operation may ADD to a rung (design section 3.6). */
const MAX_CELLS_PER_DEPTH_OP = 4096;
/** Serialised bytes per hex cell, measured on the fixture (q, r, colour). */
const BYTES_PER_CELL_ESTIMATE = 36;

type DepthWriteRefusal =
  | 'not-a-ladder'
  | 'quarantined'
  | 'level-out-of-range'
  | 'too-many-cells'
  | 'over-budget';

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

/** The map with a `lod` block, stamped from the defaults when absent. Same reference when present. */
function withLod(mapData: MapData): MapData {
  if (mapData.lod !== undefined) return mapData;
  const lod: LadderConfig = { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel };
  return { ...mapData, lod };
}

/**
 * Check a proposed rung write without applying it. `nextCells` is the FULL
 * intended content of the rung after the write.
 */
function guardDepthWrite(mapData: MapData, layerId: LayerId, level: number, nextCells: Cell[]): DepthWriteRefusal | null {
  if (!canBeginDepthAuthoring(mapData)) {
    return isDepthQuarantined(mapData).quarantined ? 'quarantined' : 'not-a-ladder';
  }
  const params = ladderParamsFor(withLod(mapData));
  if (!Number.isInteger(level) || level < 1 || level > params.maxLevel) return 'level-out-of-range';
  const layer = mapData.layers.find((l) => l.id === layerId) ?? getActiveLayer(mapData);
  const current = authoredCells(layer, level);
  const added = nextCells.length - current.length;
  if (added > MAX_CELLS_PER_DEPTH_OP) return 'too-many-cells';
  if (added > 0) {
    const projected = JSON.stringify(mapData).length + added * BYTES_PER_CELL_ESTIMATE;
    if (projected > DEPTH_BUDGET_BYTES) return 'over-budget';
  }
  return null;
}

/** Apply a guarded rung write. On refusal the original map is returned untouched. */
function writeDepthCells(mapData: MapData, layerId: LayerId, level: number, nextCells: Cell[]): DepthWriteResult {
  const reason = guardDepthWrite(mapData, layerId, level, nextCells);
  if (reason !== null) return { ok: false, reason, mapData };
  const stamped = withLod(mapData);
  return { ok: true, mapData: setLevelCells(stamped, layerId, level, nextCells) };
}

export type { DepthWriteRefusal, DepthWriteResult };
export { DEPTH_BUDGET_BYTES, MAX_CELLS_PER_DEPTH_OP, canBeginDepthAuthoring, withLod, guardDepthWrite, writeDepthCells };
