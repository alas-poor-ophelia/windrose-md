/**
 * layerHistoryOps.ts
 *
 * Pure helpers that let the undo stack see ladder rungs (`MapLayer.levels`;
 * see src/geometry/CLAUDE.md, Ladder invariants). Kept out of the hooks so they can be
 * unit tested without a DOM.
 *
 * - Snapshots carry `levels` BY REFERENCE and only when the layer has it; a
 *   classic layer's snapshot has no `levels` key at all.
 * - In the field diffs (useLayerHistory) a layer WITHOUT rungs reads as the
 *   frozen `EMPTY_LEVELS` sentinel, never `undefined`: "no rungs" must be a
 *   recordable value, or erasing the last rung to empty is skipped by the
 *   diff and every earlier deep entry fails its guard (MERGE-01 / PX-01).
 * - Restoring writes the WHOLE `levels` record back, or strips the key for
 *   `undefined` / `EMPTY_LEVELS`. `snapshot.level` is UI/telemetry only and
 *   is never used to choose what to restore.
 */

import type { MapData, MapLayer, LadderConfig } from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { LayerHistorySnapshot } from '#types/hooks/layerHistory.types';
import type { StoredViewState } from '#types/core/map.types';

import { DEFAULTS } from '../../core/dmtConstants';
import { isLadderView, ladderParamsFor, getMaxZoom, hasDepthContent } from '../../core/lodFlags';
import { chooseLevel, crossingZoom, rungMiddleZoom, type LadderParams } from '../../geometry/core/lattice';

type LevelsRecord = Record<number, Cell[]>;

/**
 * "This layer has no rungs" as a diffable value. Shared and frozen, so it is
 * compared by reference and never written onto a layer (applySnapshotLevels
 * strips the key for it).
 */
const EMPTY_LEVELS: LevelsRecord = Object.freeze({});

/** Conditional-spread source: `{ levels }` when the layer has rungs, `{}` otherwise. */
function snapshotLevelsOf(source: { levels?: LevelsRecord }): { levels?: LevelsRecord } {
  return source.levels !== undefined ? { levels: source.levels } : {};
}

/**
 * Put a snapshot's `levels` record onto a layer: the whole record by reference,
 * or no `levels` key when the snapshot has none (`undefined` or the
 * `EMPTY_LEVELS` sentinel). Returns the same layer when nothing changes, so a
 * classic undo stays reference-identical.
 */
function applySnapshotLevels(layer: MapLayer, snapshot: Pick<LayerHistorySnapshot, 'levels'>): MapLayer {
  const levels = snapshot.levels === EMPTY_LEVELS ? undefined : snapshot.levels;
  if (layer.levels === levels && (levels !== undefined || !('levels' in layer))) {
    return layer;
  }
  const { levels: _dropped, ...rest } = layer;
  return levels !== undefined ? { ...rest, levels } : rest;
}

/**
 * Cross-rung undo (an undo that lands off-screen reads as dead): a history entry edited on rung
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

/**
 * The view that shows rung `level`, unconditionally (the level chip row and
 * MCP `setViewport(..., level)`; undo keeps `viewStateForRung`). Same centre,
 * zoom at the geometric middle of the rung's band: `crossingZoom(L) * sqrt(m)`
 * for L >= 1, and `crossingZoom(1) / sqrt(m)` for the root (the same middle
 * mirrored below the first crossing). `level` is rounded and clamped to
 * [0, maxLevel]; zoom is clamped to [DEFAULTS.minZoom, maxZoom].
 */
function viewStateAtRung(view: StoredViewState, level: number, params: LadderParams, maxZoom: number): StoredViewState {
  const rung = Math.max(0, Math.min(params.maxLevel, Math.round(level)));
  const zoom = Math.max(DEFAULTS.minZoom, Math.min(maxZoom, rungMiddleZoom(rung, params)));
  return { ...view, zoom };
}

/**
 * The rung authoring tools write to (the edit-level lock, session-only): the camera's rung, or the
 * locked rung when it is SHALLOWER. A lock deeper than the camera cannot be
 * honoured (the finer rung is not materialised on screen), so it falls back to
 * the camera's rung. `lock === null` means unlocked.
 */
function resolveEditLevel(lock: number | null, cameraLevel: number): number {
  return lock === null ? cameraLevel : Math.min(lock, cameraLevel);
}

/**
 * Zoom for an external viewport request (MCP `setViewport`). `level`, when
 * given on a ladder view, wins and yields that rung's band-middle zoom;
 * otherwise the requested zoom (or `fallback`) is clamped to the map's own
 * range [DEFAULTS.minZoom, getMaxZoom(mapData)], so a classic map can never be
 * stored past its ceiling.
 */
function resolveViewportZoom(mapData: MapData, zoom: number | undefined, level: number | undefined, fallback: number): number {
  const maxZoom = getMaxZoom(mapData);
  if (level !== undefined && Number.isFinite(level) && isLadderView(mapData)) {
    const view = mapData.viewState ?? { zoom: fallback, center: { x: 0, y: 0 } };
    return viewStateAtRung(view, level, ladderParamsFor(mapData), maxZoom).zoom;
  }
  const requested = zoom ?? fallback;
  const finite = Number.isFinite(requested) ? requested : fallback;
  return Math.max(DEFAULTS.minZoom, Math.min(maxZoom, finite));
}

/**
 * The first deep write on a classic map stamps `lod` (depthAuthoring.withLod).
 * Its history entry records that block, so the stamp is as reversible as the
 * cells it came with. `{}` for every other write, so classic snapshots and
 * later rung writes carry no `lodStamped` key.
 * Dormant since 2.5.0: `lod` is created only by the opt-in paths, so no live write stamps it.
 */
function stampedLodOf(before: MapData, after: MapData): { lodStamped?: LadderConfig } {
  return before.lod === undefined && after.lod !== undefined ? { lodStamped: after.lod } : {};
}

/** A `lod` stamp made on a suppressed (batched) tick, waiting for its stroke's commit. */
type ParkedLodStamp = { channel: string; lod: LadderConfig } | null;

/**
 * The `lodStamped` a write's history entry should carry, and the new parked
 * stamp. A suppressed tick that stamps parks the block under `channel` (a
 * layer field, or `level:N` for a rung) and records nothing. A committing
 * write claims a parked stamp ONLY on the same channel; every commit clears
 * the park, so a cancelled stroke (Escape, tool switch, pointercancel) can
 * never hand its stamp to an unrelated later edit (Codex review, blocking).
 */
function lodStampForCommit(
  parked: ParkedLodStamp, before: MapData, after: MapData, suppressHistory: boolean, channel: string
): { parked: ParkedLodStamp; stamp: { lodStamped?: LadderConfig } } {
  const stamped = stampedLodOf(before, after);
  if (suppressHistory) {
    return { parked: stamped.lodStamped !== undefined ? { channel, lod: stamped.lodStamped } : parked, stamp: {} };
  }
  if (stamped.lodStamped !== undefined) return { parked: null, stamp: stamped };
  return { parked: null, stamp: parked !== null && parked.channel === channel ? { lodStamped: parked.lod } : {} };
}

/** Same ladder block by value (`distanceOverrides` compared structurally). */
function sameLadderConfig(a: LadderConfig, b: LadderConfig): boolean {
  if (a === b) return true;
  return a.m === b.m && a.minCellPx === b.minCellPx && a.maxLevel === b.maxLevel
    && JSON.stringify(a.distanceOverrides ?? null) === JSON.stringify(b.distanceOverrides ?? null);
}

/**
 * Undo LEAVING the entry that stamped `lod`: the map is classic again. Same map
 * otherwise. `mapData` is the map being restored TO; the stamp is lifted only
 * when it holds no authored rung and no homed element anywhere. A stamp can
 * land on an entry that does not own every deep write (a cancelled stroke's
 * cells stay on the map), and stripping `lod` there would leave
 * `levels-without-lod` and quarantine the map (Codex review, blocking).
 * The stamp is also kept when the live `lod` no longer equals the stamped
 * block: a settings save after the stamp (minCellPx, maxLevel, distance
 * overrides) is not a history entry, and undo must not discard it (DATA-12).
 */
function undoLodStamp(mapData: MapData, leaving: Pick<LayerHistorySnapshot, 'lodStamped'> | null | undefined): MapData {
  if (leaving?.lodStamped === undefined || mapData.lod === undefined) return mapData;
  if (!sameLadderConfig(mapData.lod, leaving.lodStamped)) return mapData;
  if (hasDepthContent(mapData)) return mapData;
  const { lod: _dropped, ...rest } = mapData;
  return rest;
}

/** Redo ONTO the entry that stamped `lod`: the block comes back. Same map otherwise. */
function redoLodStamp(mapData: MapData, entering: Pick<LayerHistorySnapshot, 'lodStamped'>): MapData {
  if (entering.lodStamped === undefined || mapData.lod !== undefined) return mapData;
  return { ...mapData, lod: entering.lodStamped };
}

export {
  EMPTY_LEVELS, snapshotLevelsOf, applySnapshotLevels, viewStateForRung, viewStateAtRung,
  resolveEditLevel, resolveViewportZoom, stampedLodOf, lodStampForCommit, undoLodStamp, redoLodStamp
};
export type { ParkedLodStamp };
