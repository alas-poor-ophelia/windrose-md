/**
 * layerHistoryOps.ts
 *
 * Pure helpers that let the undo stack see ladder rungs (`MapLayer.levels`,
 * design 06 s5 and s19 items 3 and 10). Kept out of the hooks so they can be
 * unit tested without a DOM.
 *
 * - Snapshots carry `levels` BY REFERENCE and only when the layer has it; a
 *   classic layer's snapshot has no `levels` key at all.
 * - Restoring writes the snapshot's WHOLE `levels` record back (or strips it
 *   when the snapshot has none). `snapshot.level` is UI/telemetry only and is
 *   never used to choose what to restore.
 * - Equality keeps the classic JSON.stringify rule unless either snapshot has
 *   `levels`; then rungs compare by array reference (setLevelCells returns the
 *   prior reference on a no-op, and every real edit makes a new array).
 */

import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';
import type { StoredViewState } from '#types/core/map.types';

import { DEFAULTS } from '../../core/dmtConstants';
import { isLadderView, ladderParamsFor, getMaxZoom } from '../../core/lodFlags';
import { chooseLevel, crossingZoom } from '../../geometry/core/lattice';

type LevelsRecord = Record<number, Cell[]>;

/** Conditional-spread source: `{ levels }` when the layer has rungs, `{}` otherwise. */
function snapshotLevelsOf(source: { levels?: LevelsRecord }): { levels?: LevelsRecord } {
  return source.levels !== undefined ? { levels: source.levels } : {};
}

/**
 * Put a snapshot's `levels` record onto a layer: the whole record by reference,
 * or no `levels` key when the snapshot has none. Returns the same layer when
 * nothing changes, so a classic undo stays reference-identical.
 */
function applySnapshotLevels(layer: MapLayer, snapshot: LayerHistorySnapshot): MapLayer {
  if (layer.levels === snapshot.levels && (snapshot.levels !== undefined || !('levels' in layer))) {
    return layer;
  }
  const { levels: _dropped, ...rest } = layer;
  return snapshot.levels !== undefined ? { ...rest, levels: snapshot.levels } : rest;
}

/** Apply a snapshot's `levels` to the active layer of a map (same map when unchanged). */
function restoreSnapshotLevels(mapData: MapData, snapshot: LayerHistorySnapshot): MapData {
  const activeId = mapData.activeLayerId;
  let changed = false;
  const layers = mapData.layers.map((layer) => {
    if (layer.id !== activeId) return layer;
    const next = applySnapshotLevels(layer, snapshot);
    if (next !== layer) changed = true;
    return next;
  });
  return changed ? { ...mapData, layers } : mapData;
}

/** Same rung keys, and each rung is the same array reference. */
function levelsEqualByReference(a: LevelsRecord | undefined, b: LevelsRecord | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  const aEntries = Object.entries(a);
  const bByKey = new Map<string, Cell[]>(Object.entries(b));
  if (aEntries.length !== bByKey.size) return false;
  for (const [key, cells] of aEntries) {
    if (bByKey.get(key) !== cells) return false;
  }
  return true;
}

/**
 * History dedupe comparator. Classic snapshots (neither has `levels`) keep the
 * exact JSON.stringify rule. Otherwise: every non-level field compares by that
 * same stringify rule, and `levels` compares by rung keys + array references.
 * `level` is ignored on the ladder path (it names the edited rung, not content).
 */
function layerHistorySnapshotsEqual(a: LayerHistorySnapshot, b: LayerHistorySnapshot): boolean {
  if (a.levels === undefined && b.levels === undefined) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  if (!levelsEqualByReference(a.levels, b.levels)) return false;
  const { levels: _aLevels, level: _aLevel, ...aRest } = a;
  const { levels: _bLevels, level: _bLevel, ...bRest } = b;
  return JSON.stringify(aRest) === JSON.stringify(bRest);
}

/**
 * Cross-rung undo (design 06 s5, council KA-9): a history entry edited on rung
 * `level` is invisible unless that rung is the ACTIVE one, so applying it while
 * the camera sits on another rung looks like a dead undo. Returns the view that
 * makes `level` active (same centre, zoom at the geometric middle of the rung's
 * band), or null when no move is needed: not a ladder view, a root-level entry
 * (root fills show through every rung by inheritance), or the rung is already
 * active.
 */
function viewStateForRung(mapData: MapData, level: number | undefined): StoredViewState | null {
  if (level === undefined || level < 1) return null;
  if (!isLadderView(mapData)) return null;
  const params = ladderParamsFor(mapData);
  if (level > params.maxLevel) return null;
  const view = mapData.viewState ?? { zoom: DEFAULTS.initialZoom, center: { x: 0, y: 0 } };
  if (chooseLevel(view.zoom, params) === level) return null;
  const zoom = Math.min(getMaxZoom(mapData), crossingZoom(level, params) * Math.sqrt(params.m));
  return { ...view, zoom };
}

export { snapshotLevelsOf, applySnapshotLevels, restoreSnapshotLevels, layerHistorySnapshotsEqual, viewStateForRung };
