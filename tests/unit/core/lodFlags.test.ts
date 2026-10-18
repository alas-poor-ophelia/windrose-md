import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { isLodLadderEnabled, isLadderView, isDepthQuarantined, canAuthorDepth, ladderParamsFor, getMaxZoom, hasDepthContent, hasSubHexChildren, ladderTileClipAt, deepestAuthoredRung } =
  await import('../../../src/core/lodFlags');
const { setLevelCells } = await import('../../../src/persistence/layerAccessor');
const { calculateContentBounds, exportLadderFor } = await import('../../../src/persistence/exportOperations');
const { HexGeometry } = await import('../../../src/geometry/core/HexGeometry');
const { DEFAULTS } = await import('../../../src/core/dmtConstants');
const { LADDER_DEFAULTS } = await import('../../../src/geometry/core/lattice');
const DEFAULT_LOD = { m: LADDER_DEFAULTS.m, minCellPx: LADDER_DEFAULTS.minCellPx, maxLevel: LADDER_DEFAULTS.maxLevel };

/** `activeWindow` is an Obsidian global; the override reader goes through it. */
interface LadderGlobal { activeWindow?: { __windroseLadder?: unknown } }
const withLadderOverride = (value: unknown): void => {
  (globalThis as unknown as LadderGlobal).activeWindow = { __windroseLadder: value };
};
const clearLadderGlobal = (): void => {
  delete (globalThis as unknown as LadderGlobal).activeWindow;
};

const hexMap = (over: Partial<MapData> = {}): MapData =>
  ({ mapType: 'hex', hexSize: 80, ...over } as MapData);

describe('lodFlags: lattice ladder capability', () => {
  beforeEach(() => { getSettings.mockReset(); });

  it('is on when the setting is absent (absent = enabled, like every feature toggle)', () => {
    getSettings.mockReturnValue({});
    expect(isLodLadderEnabled()).toBe(true);
  });

  it('is off when the setting is explicitly false', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLodLadderEnabled()).toBe(false);
  });

  it('is off only for a literal false', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLodLadderEnabled()).toBe(true);
    getSettings.mockReturnValue({ lodLadder: 'yes' });
    expect(isLodLadderEnabled()).toBe(true);
    getSettings.mockReturnValue({ lodLadder: 0 });
    expect(isLodLadderEnabled()).toBe(true);
  });
});

describe('lodFlags: isLadderView (capability path)', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('is false for every map while the capability is off', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLadderView(hexMap())).toBe(false);
  });

  it('the capability flag never ladders a map without lod; an opted-in unrotated hex map is a ladder view', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView(hexMap())).toBe(false);
    getSettings.mockReturnValue({});
    expect(isLadderView(hexMap())).toBe(false);
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView(hexMap({ lod: DEFAULT_LOD }))).toBe(true);
    expect(isLadderView(hexMap({ lod: DEFAULT_LOD, northDirection: 0 }))).toBe(true);
    expect(isLadderView(hexMap({ lod: DEFAULT_LOD, northDirection: 360 }))).toBe(true);
  });

  it('is false for a grid map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView({ mapType: 'grid' } as MapData)).toBe(false);
  });

  it('is false for a rotated hex map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView(hexMap({ northDirection: 90 }))).toBe(false);
    expect(isLadderView(hexMap({ northDirection: 270 }))).toBe(false);
  });

  it('is false for a missing map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView(null)).toBe(false);
    expect(isLadderView(undefined)).toBe(false);
  });
});

describe('lodFlags: getMaxZoom', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('is the shipped ceiling on every classic path, including a hex map without lod under the capability', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(getMaxZoom(hexMap())).toBe(DEFAULTS.maxZoom);
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom(hexMap())).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(null)).toBe(DEFAULTS.maxZoom);
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom({ mapType: 'grid' } as MapData)).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(hexMap({ northDirection: 90 }))).toBe(DEFAULTS.maxZoom);
  });

  it('climbs to the ladder ceiling on a ladder map, scaled by hex size', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom(hexMap({ lod: DEFAULT_LOD }))).toBeCloseTo(102.4, 6);
    expect(getMaxZoom(hexMap({ lod: DEFAULT_LOD, hexSize: 120 }))).toBeCloseTo(102.4 * 80 / 120, 6);
  });

  it('falls back to the default hex size when the map has none', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom({ mapType: 'hex', lod: DEFAULT_LOD } as MapData)).toBeCloseTo(102.4, 6);
  });

  it('honours the developer minCellPx override in Developer mode', () => {
    getSettings.mockReturnValue({ lodLadder: true, developerMode: true });
    withLadderOverride({ minCellPx: 40 });
    expect(getMaxZoom(hexMap({ lod: DEFAULT_LOD }))).toBeCloseTo(64, 9);
  });

  it('ignores the developer minCellPx override with Developer mode off', () => {
    getSettings.mockReturnValue({ lodLadder: true, developerMode: false });
    withLadderOverride({ minCellPx: 40 });
    expect(getMaxZoom(hexMap({ lod: DEFAULT_LOD }))).toBeCloseTo(102.4, 9);
  });
});

const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };
const cell = (x: number, y: number): { x: number; y: number; color: string } => ({ x, y, color: '#123456' });
const withLayers = (over: Partial<MapData>, levels?: Record<number, unknown[]>): MapData =>
  hexMap({
    layers: [{ id: 'L1', name: '1', order: 0, visible: true, cells: [cell(0, 0)], curves: [], edges: [],
      objects: [], textLabels: [], fogOfWar: null, ...(levels ? { levels } : {}) }],
    ...over,
  } as Partial<MapData>);

describe('lodFlags: ladderTileClipAt (kgc.23 k, kgc.26)', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });
  afterEach(clearLadderGlobal);

  it('defaults to the smart clip on rungs and no clip at level 0', () => {
    clearLadderGlobal();
    expect(ladderTileClipAt(0)).toBe('none');
    expect(ladderTileClipAt(1)).toBe('smart');
    expect(ladderTileClipAt(3)).toBe('smart');
  });

  it('honours the developer knob in Developer mode: none, rungs (whole hex >= 1), all (whole hex everywhere), smart', () => {
    getSettings.mockReturnValue({ lodLadder: true, developerMode: true });
    withLadderOverride({ tileClip: 'none' });
    expect(ladderTileClipAt(0)).toBe('none');
    expect(ladderTileClipAt(2)).toBe('none');
    withLadderOverride({ tileClip: 'rungs' });
    expect(ladderTileClipAt(0)).toBe('none');
    expect(ladderTileClipAt(1)).toBe('hex');
    withLadderOverride({ tileClip: 'all' });
    expect(ladderTileClipAt(0)).toBe('hex');
    expect(ladderTileClipAt(2)).toBe('hex');
    withLadderOverride({ tileClip: 'smart' });
    expect(ladderTileClipAt(0)).toBe('none');
    expect(ladderTileClipAt(1)).toBe('smart');
    withLadderOverride({ tileClip: 'bogus' });
    expect(ladderTileClipAt(2)).toBe('smart');
  });

  it('ignores the knob with Developer mode off (default policy applies)', () => {
    getSettings.mockReturnValue({ lodLadder: true, developerMode: false });
    withLadderOverride({ tileClip: 'all' });
    expect(ladderTileClipAt(0)).toBe('none');
    expect(ladderTileClipAt(1)).toBe('smart');
  });
});

describe('lodFlags: isDepthQuarantined', () => {
  it('is clear for a classic map and for a valid ladder map', () => {
    expect(isDepthQuarantined(withLayers({}))).toEqual({ quarantined: false, reason: null });
    expect(isDepthQuarantined(withLayers({ lod: LOD }, { 2: [cell(1, 1)] }))).toEqual({ quarantined: false, reason: null });
  });

  it('quarantines rung content without a lod block', () => {
    expect(isDepthQuarantined(withLayers({}, { 1: [cell(1, 1)] }))).toEqual({ quarantined: true, reason: 'levels-without-lod' });
  });

  it('counts an element homed on a rung as depth content (kgc.12)', () => {
    const deepObject = { id: 'o', type: 'entrance', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, homeLevel: 2 };
    const map = withLayers({});
    const withObject = { ...map, layers: [{ ...map.layers[0], objects: [deepObject] }] } as MapData;
    expect(hasDepthContent(withObject)).toBe(true);
    expect(isDepthQuarantined(withObject).reason).toBe('levels-without-lod');
    expect(isDepthQuarantined({ ...withObject, lod: LOD }).quarantined).toBe(false);
    expect(isDepthQuarantined({ ...withObject, lod: { ...LOD, maxLevel: 1 } }).reason).toBe('max-level-below-content');
  });

  it('quarantines an unknown or non-integer m', () => {
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, m: 3 } })).reason).toBe('unknown-m');
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, m: 4.5 } })).reason).toBe('unknown-m');
  });

  it('quarantines a maxLevel below the deepest non-empty rung', () => {
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, maxLevel: 1 } }, { 2: [cell(1, 1)] })).reason)
      .toBe('max-level-below-content');
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, maxLevel: 1 } }, { 1: [cell(1, 1)] })).quarantined).toBe(false);
  });

  it('quarantines a non-positive minCellPx', () => {
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, minCellPx: 0 } })).reason).toBe('invalid-min-cell-px');
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, minCellPx: -5 } })).reason).toBe('invalid-min-cell-px');
  });
});

describe('lodFlags: isLadderView, canAuthorDepth, ladderParamsFor', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('a hex map carrying lod is a ladder view with the capability OFF', () => {
    getSettings.mockReturnValue({});
    expect(isLadderView(withLayers({ lod: LOD }))).toBe(true);
    expect(isLadderView(withLayers({ lod: LOD, northDirection: 90 }))).toBe(false);
    expect(isLadderView({ mapType: 'grid', lod: LOD } as MapData)).toBe(false);
  });

  it('a quarantined map is never a ladder view, flag or no flag (kgc.21)', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    // an m off the allowlist would throw inside createGeometryLadder
    expect(isLadderView(withLayers({ lod: { ...LOD, m: 1 } }))).toBe(false);
    expect(isLadderView(withLayers({ lod: { ...LOD, m: 3 } }))).toBe(false);
    expect(isLadderView(withLayers({ lod: { ...LOD, minCellPx: 0 } }))).toBe(false);
    // rung content without a lod block
    expect(isLadderView(withLayers({}, { 1: [cell(1, 1)] }))).toBe(false);
    // a maxLevel below the deepest rung
    expect(isLadderView(withLayers({ lod: { ...LOD, maxLevel: 1 } }, { 2: [cell(1, 1)] }))).toBe(false);
    // and the healthy neighbours stay ladder views
    expect(isLadderView(withLayers({ lod: LOD }, { 2: [cell(1, 1)] }))).toBe(true);
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLadderView(withLayers({ lod: { ...LOD, m: 1 } }))).toBe(false);
    expect(isLadderView(withLayers({ lod: LOD }))).toBe(true);
  });

  it('a classic map, with or without sub-hex children, is never laddered by the flag alone (kgc.15, design s9)', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    const child = { mapData: hexMap() } as unknown as NonNullable<MapData['subHexMaps']>[string];
    expect(hasSubHexChildren(withLayers({ subHexMaps: { '1,1': child } }))).toBe(true);
    expect(hasSubHexChildren(withLayers({ subHexMaps: {} }))).toBe(false);
    expect(hasSubHexChildren(withLayers({}))).toBe(false);
    expect(isLadderView(withLayers({ subHexMaps: { '1,1': child } }))).toBe(false);
    expect(isLadderView(withLayers({ subHexMaps: {} }))).toBe(false);
    // mode is data: with lod the map is a ladder regardless of children
    expect(isLadderView(withLayers({ lod: LOD, subHexMaps: { '1,1': child } }))).toBe(true);
    expect(getMaxZoom(withLayers({ subHexMaps: { '1,1': child } }))).toBe(DEFAULTS.maxZoom);
  });

  it('a quarantined map clamps at the classic zoom ceiling', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom(withLayers({ lod: { ...LOD, m: 1 } }))).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(withLayers({}, { 1: [cell(1, 1)] }))).toBe(DEFAULTS.maxZoom);
  });

  it('canAuthorDepth needs lod and no quarantine, whatever the capability (mode is data)', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(canAuthorDepth(withLayers({ lod: LOD }))).toBe(true);
    expect(canAuthorDepth(withLayers({}))).toBe(false);
    expect(canAuthorDepth(withLayers({ lod: { ...LOD, m: 3 } }))).toBe(false);
    getSettings.mockReturnValue({});
    expect(canAuthorDepth(withLayers({ lod: LOD }))).toBe(true);
    getSettings.mockReturnValue({ lodLadder: false });
    expect(canAuthorDepth(withLayers({ lod: LOD }))).toBe(true);
    expect(canAuthorDepth(withLayers({}))).toBe(false);
    expect(canAuthorDepth(withLayers({ lod: { ...LOD, m: 3 } }))).toBe(false);
  });

  it('a lod map uses its stored params; the dev override never applies m', () => {
    getSettings.mockReturnValue({ lodLadder: true, developerMode: true });
    withLadderOverride({ m: 2, minCellPx: 40, maxLevel: 2 });
    const p = ladderParamsFor(withLayers({ lod: { m: 15, minCellPx: 50, maxLevel: 1 } }));
    expect(p).toEqual({ hexSize: 80, m: 15, minCellPx: 40, maxLevel: 2 });
    expect(ladderParamsFor(withLayers({})).m).toBe(2);
  });
});

describe('lodFlags: hasDepthContent', () => {
  it('is true when any layer holds a rung >= 1 cell', () => {
    expect(hasDepthContent(withLayers({ lod: LOD }, { 2: [cell(1, 1)] }))).toBe(true);
  });

  it('is false on a classic map and on an empty levels container', () => {
    expect(hasDepthContent(withLayers({}))).toBe(false);
    expect(hasDepthContent(withLayers({}, {}))).toBe(false);
    expect(hasDepthContent(withLayers({ lod: LOD }, { 1: [] }))).toBe(false);
    expect(hasDepthContent(hexMap())).toBe(false);
  });
});

describe('lodFlags: bounded ladder depth and zoom (cross-model review item 1)', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('exports the shared caps', async () => {
    const { MAX_LADDER_LEVEL, MAX_LADDER_ZOOM } = await import('../../../src/core/lodFlags');
    expect(MAX_LADDER_LEVEL).toBe(6);
    expect(MAX_LADDER_ZOOM).toBe(2048);
  });

  it('quarantines a maxLevel past MAX_LADDER_LEVEL', () => {
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, maxLevel: 40 } }))).toEqual({ quarantined: true, reason: 'max-level-too-deep' });
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, maxLevel: 7 } })).reason).toBe('max-level-too-deep');
    expect(isDepthQuarantined(withLayers({ lod: { ...LOD, maxLevel: 6 } })).quarantined).toBe(false);
  });

  it('a too-deep lod is not a ladder view and clamps at the classic zoom', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    const deep = withLayers({ lod: { ...LOD, maxLevel: 40 } });
    expect(isLadderView(deep)).toBe(false);
    expect(getMaxZoom(deep)).toBe(DEFAULTS.maxZoom);
  });

  it('clamps a legal but extreme ceiling to MAX_LADDER_ZOOM (m 15, maxLevel 3 asks for ~20k)', () => {
    getSettings.mockReturnValue({});
    const wide = withLayers({ lod: { m: 15, minCellPx: 64, maxLevel: 3 } });
    expect(isLadderView(wide)).toBe(true);
    expect(getMaxZoom(wide)).toBe(2048);
  });

  it('ignores a developer maxLevel override past the cap', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    withLadderOverride({ maxLevel: 40 });
    expect(ladderParamsFor(hexMap()).maxLevel).toBe(3);
  });
});

describe('lodFlags: wave 1 predicates (DATA-08, C3, MEM-06)', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({}); });

  it("homeLevel 1.5 or '2' counts as 0: not quarantined, export does not throw", () => {
    for (const homeLevel of [1.5, '2', -1, Number.NaN] as unknown[]) {
      const obj = { id: 'o', type: 'entrance', position: { x: 1, y: 1 }, size: { width: 1, height: 1 }, homeLevel };
      const base = withLayers({ lod: { ...LOD, maxLevel: 1 } }, { 1: [cell(1, 1)] });
      const map = { ...base, layers: [{ ...base.layers[0], objects: [obj] }] } as MapData;
      expect(deepestAuthoredRung(map)).toBe(1);
      expect(isDepthQuarantined(map)).toEqual({ quarantined: false, reason: null });
      const root = new HexGeometry(80, 'flat', { maxCol: 10, maxRow: 10 });
      const ladder = exportLadderFor(map, root);
      expect(ladder).not.toBeNull();
      // Bounded at the root, never through geometryForLevel(1.5), which throws.
      expect(() => calculateContentBounds(map.layers[0], root, ladder, 1)).not.toThrow();
    }
  });

  it('array-shaped levels quarantines', () => {
    const base = withLayers({ lod: LOD });
    const map = { ...base, layers: [{ ...base.layers[0], levels: [[cell(1, 1)]] }] } as unknown as MapData;
    expect(isDepthQuarantined(map)).toEqual({ quarantined: true, reason: 'invalid-levels-key' });
    expect(isLadderView(map)).toBe(false);
  });

  it('memo misses after setLevelCells', () => {
    const map = withLayers({ lod: LOD });
    expect(deepestAuthoredRung(map)).toBe(0);
    expect(deepestAuthoredRung(map)).toBe(0); // memo hit, same answer
    const next = setLevelCells(map, 'L1', 2, [cell(1, 1)]);
    expect(next.layers).not.toBe(map.layers);
    expect(deepestAuthoredRung(next)).toBe(2);
    expect(deepestAuthoredRung(map)).toBe(0);
  });
});
