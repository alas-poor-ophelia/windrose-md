/**
 * Lattice ladder phase 6 (windrose-kgc.7): new-map ladder preset, the
 * "opens at" readout, the settings save-path merge and the reducer action.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import type { LadderConfig } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSettings,
}));

const { createNewMap, loadMapDataWithGeneration, setPendingNewMapOptions } = await import('../../../src/persistence/fileOperations');
const { ladderOpensAt, mergeLadderConfig, ladderSettingsPatch } = await import('../../../src/core/lodFlags');
const { chooseLevel, LADDER_DEFAULTS } = await import('../../../src/geometry/core/lattice');
const { settingsReducer, buildInitialState, Actions } = await import('../../../src/components/settings/settingsReducer');

/** App whose data file is absent: every load creates a fresh map. */
function emptyVaultApp(): App {
  return { vault: { getAbstractFileByPath: () => null } } as unknown as App;
}

describe('createNewMap ladder preset', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });

  it('writes no lod key without a preset', () => {
    const map = createNewMap('Plain', 'hex');
    expect('lod' in map).toBe(false);
  });

  it('writes lod with the chosen m and default minCellPx / maxLevel when the flag is on', () => {
    const map = createNewMap('Ladder', 'hex', { ladderM: 15 });
    expect(map.lod).toEqual({ m: 15, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel });
  });

  it('ignores the preset while the capability flag is off', () => {
    getSettings.mockReturnValue({});
    const map = createNewMap('Off', 'hex', { ladderM: 2 });
    expect('lod' in map).toBe(false);
  });

  it('ignores the preset on grid maps and for an m off the allowlist', () => {
    expect('lod' in createNewMap('Grid', 'grid', { ladderM: 4 })).toBe(false);
    expect('lod' in createNewMap('Bad', 'hex', { ladderM: 3 })).toBe(false);
  });

  it('a pending preset seeds the lazily created map on its first load', async () => {
    setPendingNewMapOptions('map-pending-1', { ladderM: 2 });
    const { data } = await loadMapDataWithGeneration(emptyVaultApp(), 'map-pending-1', 'Pending', 'hex');
    expect(data.lod?.m).toBe(2);
    const { data: other } = await loadMapDataWithGeneration(emptyVaultApp(), 'map-pending-2', 'Other', 'hex');
    expect('lod' in other).toBe(false);
  });
});

describe('ladderOpensAt', () => {
  it('matches chooseLevel at the opening zoom', () => {
    for (const zoom of [0.25, 1, 2, 4, 16]) {
      expect(ladderOpensAt(80, { m: 4, minCellPx: 64, maxLevel: 3 }, zoom))
        .toBe(chooseLevel(zoom, { hexSize: 80, m: 4, minCellPx: 64, maxLevel: 3 }));
    }
  });

  it('uses the defaults when no config is stored', () => {
    expect(ladderOpensAt(80, null, 1)).toBe(0);
    // Crossing into L1 at defaults: minCellPx * m / (2 * hexSize) = 1.6
    expect(ladderOpensAt(80, null, 1.6)).toBe(1);
  });

  it('a smaller minCellPx opens deeper', () => {
    expect(ladderOpensAt(80, { m: 2, minCellPx: 8, maxLevel: 6 }, 1)).toBeGreaterThan(0);
  });
});

describe('mergeLadderConfig', () => {
  const stored: LadderConfig = { m: 4, minCellPx: 64, maxLevel: 3, distanceOverrides: { 1: { distancePerCell: 1 } as never } };

  it('returns null when nothing was edited', () => {
    expect(mergeLadderConfig(stored, null)).toBeNull();
    expect(mergeLadderConfig(undefined, null)).toBeNull();
  });

  it('returns null when the edit equals the stored values', () => {
    expect(mergeLadderConfig(stored, { m: 4, minCellPx: 64, maxLevel: 3 })).toBeNull();
  });

  it('keeps distanceOverrides and takes the edited fields', () => {
    expect(mergeLadderConfig(stored, { m: 4, minCellPx: 40, maxLevel: 5 }))
      .toEqual({ m: 4, minCellPx: 40, maxLevel: 5, distanceOverrides: stored.distanceOverrides });
  });

  it('produces a full config for a map with no stored lod', () => {
    expect(mergeLadderConfig(undefined, { m: 2, minCellPx: 64, maxLevel: 3 })).toEqual({ m: 2, minCellPx: 64, maxLevel: 3 });
  });
});

describe('ladderSettingsPatch', () => {
  const stored: LadderConfig = { m: 4, minCellPx: 64, maxLevel: 3, distanceOverrides: { 1: { distancePerCell: 1 } as never } };
  const defaults = { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel };

  it('keeps when nothing was touched', () => {
    expect(ladderSettingsPatch(undefined, false, null, false)).toEqual({ kind: 'keep' });
    expect(ladderSettingsPatch(stored, true, stored, false)).toEqual({ kind: 'keep' });
  });

  it('sets when enabling a classic map, even at the default values', () => {
    expect(ladderSettingsPatch(undefined, true, defaults, false)).toEqual({ kind: 'set', lod: defaults });
    expect(ladderSettingsPatch(null, true, null, false)).toEqual({ kind: 'set', lod: defaults });
  });

  it('removes when disabling a map with no depth content', () => {
    expect(ladderSettingsPatch(stored, false, stored, false)).toEqual({ kind: 'remove' });
  });

  it('keeps (never removes) when disabling would drop depth content', () => {
    expect(ladderSettingsPatch(stored, false, stored, true)).toEqual({ kind: 'keep' });
  });

  it("sets when editing an enabled map's values, keeping distanceOverrides", () => {
    expect(ladderSettingsPatch(stored, true, { m: 4, minCellPx: 40, maxLevel: 5 }, false))
      .toEqual({ kind: 'set', lod: { m: 4, minCellPx: 40, maxLevel: 5, distanceOverrides: stored.distanceOverrides } });
  });

  it('keeps when the edit equals the stored values', () => {
    expect(ladderSettingsPatch(stored, true, { m: 4, minCellPx: 64, maxLevel: 3 }, true)).toEqual({ kind: 'keep' });
  });
});

describe('settingsReducer ladder field', () => {
  const init = (currentLod?: LadderConfig | null) =>
    buildInitialState({ mapType: 'hex', currentLod }, {} as never);

  it('initialises lod from the stored config, null when absent', () => {
    expect(init().lod).toBeNull();
    const lod = { m: 15, minCellPx: 64, maxLevel: 2 };
    expect(init(lod).lod).toEqual(lod);
  });

  it('SET_LADDER_CONFIG merges over defaults when nothing is stored', () => {
    const next = settingsReducer(init(), { type: Actions.SET_LADDER_CONFIG, payload: { minCellPx: 40 } });
    expect(next.lod).toEqual({ ...LADDER_DEFAULTS, minCellPx: 40 });
  });

  it('SET_LADDER_CONFIG merges over the stored config', () => {
    const next = settingsReducer(init({ m: 2, minCellPx: 50, maxLevel: 4 }), { type: Actions.SET_LADDER_CONFIG, payload: { maxLevel: 6 } });
    expect(next.lod).toEqual({ m: 2, minCellPx: 50, maxLevel: 6 });
  });

  it('ladderEnabled starts on only for a map that stores a lod', () => {
    expect(init().ladderEnabled).toBe(false);
    expect(init({ m: 2, minCellPx: 50, maxLevel: 4 }).ladderEnabled).toBe(true);
  });

  it('SET_LADDER_ENABLED seeds the defaults when nothing is stored', () => {
    const next = settingsReducer(init(), { type: Actions.SET_LADDER_ENABLED, payload: true });
    expect(next.ladderEnabled).toBe(true);
    expect(next.lod).toEqual({ m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel });
  });

  it('SET_LADDER_ENABLED off keeps the pending config for a re-enable', () => {
    const edited = settingsReducer(init({ m: 2, minCellPx: 50, maxLevel: 4 }), { type: Actions.SET_LADDER_CONFIG, payload: { maxLevel: 6 } });
    const off = settingsReducer(edited, { type: Actions.SET_LADDER_ENABLED, payload: false });
    expect(off.ladderEnabled).toBe(false);
    const on = settingsReducer(off, { type: Actions.SET_LADDER_ENABLED, payload: true });
    expect(on.lod).toEqual({ m: 2, minCellPx: 50, maxLevel: 6 });
  });
});

