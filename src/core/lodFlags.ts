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

/** True when the lattice ladder capability is switched on in plugin settings. */
function isLodLadderEnabled(): boolean {
  return getSettings().lodLadder === true;
}

export { isLodLadderEnabled };
