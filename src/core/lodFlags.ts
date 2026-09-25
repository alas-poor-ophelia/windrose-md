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
import { getSettings } from './settingsAccessor';
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

export { isLodLadderEnabled, getLadderOverrides };
