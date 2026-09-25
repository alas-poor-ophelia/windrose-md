/**
 * Capability flag for the global lattice ladder (zoom-native depth for hex maps).
 *
 * Two different things, both needed:
 *  - the CAPABILITY (`settings.lodLadder`): may this install use the ladder
 *    machinery at all. Developer preview, off by default.
 *  - the MAP MODE (`mapData.lod`, added in a later phase): is this particular
 *    map a ladder map. Absent means classic.
 *
 * When the capability is off, every caller must behave exactly as shipped:
 * nothing here touches `DEFAULTS`, and the unflagged paths stay byte-identical.
 * Design: .claude/lod-rd/06-integration-design.md, sections 10 and 13.
 */
import type { MapData } from '#types/core/map.types';
import { getSettings } from './settingsAccessor';
import { DEFAULTS } from './dmtConstants';
import { crossingZoom, LADDER_DEFAULTS, type LadderParams } from '../geometry/core/lattice';
import type { LadderOverrides } from '../geometry/core/createGeometryLadder';

/** True when the lattice ladder capability is switched on in plugin settings. */
function isLodLadderEnabled(): boolean {
  return getSettings().lodLadder === true;
}

/**
 * Developer override for ladder parameters, read from `window.__windroseLadder`.
 * Phase 1 has no per-map schema yet; the measurement fixture needs `minCellPx`
 * 40 so two crossings fall inside today's zoom range (design section 13).
 * Only honoured while the capability is on. Never persisted.
 */
function getLadderOverrides(): LadderOverrides {
  if (!isLodLadderEnabled()) return {};
  const raw: unknown = (activeWindow as unknown as { __windroseLadder?: unknown }).__windroseLadder;
  if (raw === null || raw === undefined || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: LadderOverrides = {};
  if (typeof o.m === 'number' && Number.isInteger(o.m) && o.m >= 2) out.m = o.m;
  if (typeof o.minCellPx === 'number' && o.minCellPx > 0) out.minCellPx = o.minCellPx;
  if (typeof o.maxLevel === 'number' && Number.isInteger(o.maxLevel) && o.maxLevel >= 0) out.maxLevel = o.maxLevel;
  return out;
}

/**
 * Is THIS map a ladder map? The single definition, shared by the ladder memo,
 * the camera clamps and the seamless-dive bail, so they can never disagree.
 *
 * Hex only, and never a rotated map: the rotated branch of the renderer
 * bypasses the surface cache the ladder's per-rung bake lives in.
 */
function isLadderMap(mapData: MapData | null | undefined): boolean {
  if (mapData === null || mapData === undefined) return false;
  if (!isLodLadderEnabled()) return false;
  if (mapData.mapType !== 'hex') return false;
  return ((mapData.northDirection ?? 0) % 360) === 0;
}

/** Ladder parameters for a map: defaults, then the developer override. */
function ladderParamsFor(mapData: MapData): LadderParams {
  return {
    hexSize: mapData.hexSize ?? DEFAULTS.hexSize,
    ...LADDER_DEFAULTS,
    ...getLadderOverrides(),
  };
}

/**
 * Upper zoom clamp for a map. `DEFAULTS.maxZoom` on every classic path — the
 * constant itself is never touched, so unflagged maps clamp at exactly 4.
 *
 * A ladder map instead climbs to the ladder's CEILING: the crossing zoom one
 * rung past `maxLevel`, i.e. the zoom at which the deepest rung's cells have
 * grown to `m * minCellPx` on screen and there is nothing finer to cross into.
 * 1638.4 at the shipped defaults (hexSize 80, m 4, minCellPx 64, maxLevel 5).
 */
function getMaxZoom(mapData: MapData | null | undefined): number {
  if (mapData === null || mapData === undefined) return DEFAULTS.maxZoom;
  if (!isLadderMap(mapData)) return DEFAULTS.maxZoom;
  const params = ladderParamsFor(mapData);
  return crossingZoom(params.maxLevel + 1, params);
}

export { isLodLadderEnabled, getLadderOverrides, isLadderMap, getMaxZoom };
