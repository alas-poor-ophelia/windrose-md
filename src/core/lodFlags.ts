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
import type { MapData, LadderConfig } from '#types/core/map.types';
import { getSettings } from './settingsAccessor';
import { DEFAULTS } from './dmtConstants';
import { chooseLevel, crossingZoom, rungMiddleZoom, LADDER_DEFAULTS, LADDER_M_ALLOWLIST, type LadderParams } from '../geometry/core/lattice';
import { authoredLevels } from '../persistence/layerAccessor';
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
  // `activeWindow` is an Obsidian global; absent on node (unit tests) and in any headless caller.
  if (typeof activeWindow === 'undefined') return {};
  const raw: unknown = (activeWindow as unknown as { __windroseLadder?: unknown }).__windroseLadder;
  if (raw === null || raw === undefined || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const out: LadderOverrides = {};
  if (typeof o.m === 'number' && Number.isInteger(o.m) && o.m >= 2) out.m = o.m;
  if (typeof o.minCellPx === 'number' && o.minCellPx > 0) out.minCellPx = o.minCellPx;
  if (typeof o.maxLevel === 'number' && Number.isInteger(o.maxLevel) && o.maxLevel >= 0) out.maxLevel = o.maxLevel;
  return out;
}

/** How the ladder clips root tiles on a rung: no clip, the whole own hexagon,
 *  or the "smart" union (own hex + neighbours without deep content). */
type LadderTileClipMode = 'none' | 'hex' | 'smart';

/**
 * How the ladder clips root tiles when painting rung `level`.
 *
 * Level 0 never clips (it is the classic draw). At rungs >= 1 the default is
 * 'smart' (kgc.26): a root tile is clipped to the union of its own hexagon and
 * every neighbouring root hexagon that holds no deep content, so wide art keeps
 * running across empty neighbours (the 2026-10-12 lineup rejected the whole-hex
 * clip for cutting wall art into one-hex dashes, kgc.23 item k) but stops hard
 * at the edge of a neighbour with deep paint instead of covering it.
 *
 * Developer knob for comparisons, flag-gated like the other overrides:
 * `activeWindow.__windroseLadder.tileClip` = 'smart' (default), 'none' (the
 * previous unclipped default), 'rungs' (whole hex on rungs >= 1) or 'all'
 * (whole hex at level 0 too). Without the capability flag the knob is ignored
 * and the default policy applies (a map carrying `lod` is a ladder map anyway).
 */
function ladderTileClipAt(level: number): LadderTileClipMode {
  const policy: LadderTileClipMode = level >= 1 ? 'smart' : 'none';
  if (!isLodLadderEnabled() || typeof activeWindow === 'undefined') return policy;
  const raw: unknown = (activeWindow as unknown as { __windroseLadder?: { tileClip?: unknown } }).__windroseLadder?.tileClip;
  if (raw === 'none') return 'none';
  if (raw === 'all') return 'hex';
  if (raw === 'rungs') return level >= 1 ? 'hex' : 'none';
  return policy;
}

/**
 * Is THIS map shown as a ladder? The single definition, shared by the ladder
 * memo, the camera clamps and the seamless-dive bail, so they can never disagree.
 *
 * Hex only, and never a rotated map: the rotated branch of the renderer
 * bypasses the surface cache the ladder's per-rung bake lives in. Mode is data
 * (design 06, s19 item 2): a map carrying `lod` is a ladder map on every
 * install, flag or no flag; without `lod` the capability flag decides.
 *
 * Never a quarantined map (s19 item 1): it renders level 0 on the classic
 * path, clamps at the classic zoom, and refuses deep edits. Gating here, in
 * the one predicate every ladder consumer shares, is what keeps an invalid
 * `lod` (an m off the allowlist, a non-positive minCellPx) away from
 * `createGeometryLadder`, which throws on it.
 */
function isLadderView(mapData: MapData | null | undefined): boolean {
  if (mapData === null || mapData === undefined) return false;
  if (mapData.mapType !== 'hex') return false;
  if (((mapData.northDirection ?? 0) % 360) !== 0) return false;
  if (mapData.lod === undefined) {
    if (!isLodLadderEnabled()) return false;
    // A classic map with sub-hex children keeps the classic dive and cannot
    // enter ladder mode in v1 (design s9 / T1): the flag alone never ladders it.
    if (hasSubHexChildren(mapData)) return false;
  }
  return !isDepthQuarantined(mapData).quarantined;
}

/** Does this map nest classic sub-hex maps? Such a map cannot enter ladder mode in v1 (design s9). */
function hasSubHexChildren(mapData: MapData): boolean {
  const children = mapData.subHexMaps;
  return children !== undefined && children !== null && Object.keys(children).length > 0;
}

/** Deepest rung >= 1 holding authored cells on any layer; 0 when none. */
function deepestAuthoredRung(mapData: MapData): number {
  let deepest = 0;
  for (const layer of mapData.layers ?? []) {
    const levels = authoredLevels(layer);
    const last = levels.length > 0 ? levels[levels.length - 1] : 0;
    if (last > deepest) deepest = last;
    // Elements homed on a rung (kgc.12) are laid out on the lattice like cells.
    for (const list of [layer.objects, layer.textLabels, layer.tiles]) {
      for (const item of list ?? []) {
        const home = (item as { homeLevel?: number }).homeLevel ?? 0;
        if (home > deepest) deepest = home;
      }
    }
  }
  return deepest;
}

/**
 * Does any layer hold authored cells on a rung >= 1? Such content is laid out
 * on the unrotated lattice, so rotating the map would misplace it (design 06,
 * s19 item 2). False on every classic map, including one with `levels: {}`.
 */
function hasDepthContent(mapData: MapData): boolean {
  return deepestAuthoredRung(mapData) > 0;
}

/**
 * Depth quarantine (design 06, s19 item 1): a PURE derived predicate, never
 * persisted. A quarantined map renders level 0, refuses deep edits, and keeps
 * its bytes untouched.
 */
function isDepthQuarantined(mapData: MapData): { quarantined: boolean; reason: string | null } {
  const deepest = deepestAuthoredRung(mapData);
  const lod = mapData.lod;
  if (lod === undefined || lod === null) {
    return deepest > 0
      ? { quarantined: true, reason: 'levels-without-lod' }
      : { quarantined: false, reason: null };
  }
  if (typeof lod.m !== 'number' || !Number.isInteger(lod.m) || !LADDER_M_ALLOWLIST.includes(lod.m)) {
    return { quarantined: true, reason: 'unknown-m' };
  }
  if (typeof lod.minCellPx !== 'number' || !Number.isFinite(lod.minCellPx) || lod.minCellPx <= 0) {
    return { quarantined: true, reason: 'invalid-min-cell-px' };
  }
  if (typeof lod.maxLevel !== 'number' || !Number.isFinite(lod.maxLevel) || lod.maxLevel < deepest) {
    return { quarantined: true, reason: 'max-level-below-content' };
  }
  return { quarantined: false, reason: null };
}

/** May this map take deep (rung >= 1) edits? Ladder view, `lod` present, not quarantined, capability on. */
function canAuthorDepth(mapData: MapData | null | undefined): boolean {
  if (mapData === null || mapData === undefined) return false;
  if (!isLadderView(mapData)) return false; // includes the quarantine gate
  if (mapData.lod === undefined) return false;
  return isLodLadderEnabled();
}

/**
 * Ladder parameters for a map. A map carrying `lod` uses its stored m /
 * minCellPx / maxLevel, and the developer override may adjust minCellPx and
 * maxLevel only, NEVER m (design 06, s19 item 1). Otherwise: defaults, then the
 * full developer override.
 */
function ladderParamsFor(mapData: MapData): LadderParams {
  const hexSize = mapData.hexSize ?? DEFAULTS.hexSize;
  const overrides = getLadderOverrides();
  const lod = mapData.lod;
  if (lod !== undefined && lod !== null) {
    const { m: _ignoredM, ...viewOverrides } = overrides;
    void _ignoredM;
    return { hexSize, m: lod.m, minCellPx: lod.minCellPx, maxLevel: lod.maxLevel, ...viewOverrides };
  }
  return { hexSize, ...LADDER_DEFAULTS, ...overrides };
}

/**
 * Upper zoom clamp for a map. `DEFAULTS.maxZoom` on every classic path — the
 * constant itself is never touched, so unflagged maps clamp at exactly 4.
 *
 * A ladder map instead climbs to the ladder's CEILING: the crossing zoom one
 * rung past `maxLevel`, i.e. the zoom at which the deepest rung's cells have
 * grown to `m * minCellPx` on screen and there is nothing finer to cross into.
 * 102.4 at the shipped defaults (hexSize 80, m 4, minCellPx 64, maxLevel 3).
 */
function getMaxZoom(mapData: MapData | null | undefined): number {
  if (mapData === null || mapData === undefined) return DEFAULTS.maxZoom;
  if (!isLadderView(mapData)) return DEFAULTS.maxZoom;
  const params = ladderParamsFor(mapData);
  return crossingZoom(params.maxLevel + 1, params);
}

/**
 * The rung a map opens at: the active level at its opening zoom for the given
 * ladder settings (`config` null = LADDER_DEFAULTS). Pure; the settings
 * readout ("Opens at L<n>") recomputes it from pending edits.
 */
function ladderOpensAt(hexSize: number, config: Omit<LadderConfig, 'distanceOverrides'> | null, openZoom: number): number {
  const c = config ?? LADDER_DEFAULTS;
  return chooseLevel(openZoom, { hexSize, m: c.m, minCellPx: c.minCellPx, maxLevel: c.maxLevel });
}

/**
 * Merge a settings-panel ladder edit over the stored `lod`. Returns null when
 * there is nothing to write: no edit, or the edit equals what is stored.
 * Keeps every stored key the panel does not edit (`distanceOverrides`).
 */
function mergeLadderConfig(stored: LadderConfig | null | undefined, edited: LadderConfig | null | undefined): LadderConfig | null {
  if (edited === null || edited === undefined) return null;
  // Unchanged against what the map already holds (or, with nothing stored,
  // against the defaults it would inherit anyway) writes nothing: a classic
  // hex map only gains a `lod` block from a real edit.
  const baseline = stored ?? LADDER_DEFAULTS;
  if (baseline.m === edited.m && baseline.minCellPx === edited.minCellPx && baseline.maxLevel === edited.maxLevel) {
    return null;
  }
  return { ...(stored ?? {}), m: edited.m, minCellPx: edited.minCellPx, maxLevel: edited.maxLevel };
}

/**
 * Zoom that puts the camera in the middle of rung `level`'s band
 * (`crossingZoom(level) * sqrt(m)`), clamped to the map's max zoom. Null when
 * the map is not a ladder view or `level` is not an integer in [0, maxLevel],
 * so callers fall back to their own zoom.
 */
function zoomForLevel(mapData: MapData | null | undefined, level: number): number | null {
  if (mapData === null || mapData === undefined) return null;
  if (!isLadderView(mapData)) return null;
  const params = ladderParamsFor(mapData);
  if (!Number.isInteger(level) || level < 0 || level > params.maxLevel) return null;
  return Math.max(DEFAULTS.minZoom, Math.min(rungMiddleZoom(level, params), getMaxZoom(mapData)));
}

export {
  zoomForLevel, isLodLadderEnabled, getLadderOverrides, ladderTileClipAt, isLadderView, isDepthQuarantined, canAuthorDepth,
  ladderParamsFor, getMaxZoom, hasDepthContent, hasSubHexChildren, deepestAuthoredRung,
  ladderOpensAt, mergeLadderConfig
};
export type { LadderTileClipMode };
