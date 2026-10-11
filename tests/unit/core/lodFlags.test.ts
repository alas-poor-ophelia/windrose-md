import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { isLodLadderEnabled, isLadderView, isDepthQuarantined, canAuthorDepth, ladderParamsFor, getMaxZoom, hasDepthContent, hasSubHexChildren } =
  await import('../../../src/core/lodFlags');
const { DEFAULTS } = await import('../../../src/core/dmtConstants');

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

  it('is off when the setting is absent', () => {
    getSettings.mockReturnValue({});
    expect(isLodLadderEnabled()).toBe(false);
  });

  it('is off when the setting is explicitly false', () => {
    getSettings.mockReturnValue({ lodLadder: false });
    expect(isLodLadderEnabled()).toBe(false);
  });

  it('is on only for a literal true', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLodLadderEnabled()).toBe(true);
    getSettings.mockReturnValue({ lodLadder: 'yes' });
    expect(isLodLadderEnabled()).toBe(false);
  });
});

describe('lodFlags: isLadderView (capability path)', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('is false for every map while the capability is off', () => {
    getSettings.mockReturnValue({});
    expect(isLadderView(hexMap())).toBe(false);
  });

  it('is true for an unrotated hex map with the capability on', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderView(hexMap())).toBe(true);
    expect(isLadderView(hexMap({ northDirection: 0 }))).toBe(true);
    expect(isLadderView(hexMap({ northDirection: 360 }))).toBe(true);
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

  it('is the shipped ceiling on every classic path', () => {
    getSettings.mockReturnValue({});
    expect(getMaxZoom(hexMap())).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(null)).toBe(DEFAULTS.maxZoom);
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom({ mapType: 'grid' } as MapData)).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(hexMap({ northDirection: 90 }))).toBe(DEFAULTS.maxZoom);
  });

  it('climbs to the ladder ceiling on a ladder map, scaled by hex size', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom(hexMap())).toBeCloseTo(102.4, 6);
    expect(getMaxZoom(hexMap({ hexSize: 120 }))).toBeCloseTo(102.4 * 80 / 120, 6);
  });

  it('falls back to the default hex size when the map has none', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom({ mapType: 'hex' } as MapData)).toBeCloseTo(102.4, 6);
  });

  it('honours the developer minCellPx override', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    withLadderOverride({ minCellPx: 40 });
    expect(getMaxZoom(hexMap())).toBeCloseTo(64, 9);
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

describe('lodFlags: isDepthQuarantined', () => {
  it('is clear for a classic map and for a valid ladder map', () => {
    expect(isDepthQuarantined(withLayers({}))).toEqual({ quarantined: false, reason: null });
    expect(isDepthQuarantined(withLayers({ lod: LOD }, { 2: [cell(1, 1)] }))).toEqual({ quarantined: false, reason: null });
  });

  it('quarantines rung content without a lod block', () => {
    expect(isDepthQuarantined(withLayers({}, { 1: [cell(1, 1)] }))).toEqual({ quarantined: true, reason: 'levels-without-lod' });
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
    expect(isLadderView(withLayers({}))).toBe(true);
    getSettings.mockReturnValue({});
    expect(isLadderView(withLayers({ lod: { ...LOD, m: 1 } }))).toBe(false);
    expect(isLadderView(withLayers({ lod: LOD }))).toBe(true);
  });

  it('a classic map with sub-hex children is never laddered by the flag alone (kgc.15, design s9)', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    const child = { mapData: hexMap() } as unknown as NonNullable<MapData['subHexMaps']>[string];
    expect(hasSubHexChildren(withLayers({ subHexMaps: { '1,1': child } }))).toBe(true);
    expect(hasSubHexChildren(withLayers({ subHexMaps: {} }))).toBe(false);
    expect(hasSubHexChildren(withLayers({}))).toBe(false);
    expect(isLadderView(withLayers({ subHexMaps: { '1,1': child } }))).toBe(false);
    expect(isLadderView(withLayers({ subHexMaps: {} }))).toBe(true);
    // mode is data: with lod the map is a ladder regardless of children
    expect(isLadderView(withLayers({ lod: LOD, subHexMaps: { '1,1': child } }))).toBe(true);
    expect(getMaxZoom(withLayers({ subHexMaps: { '1,1': child } }))).toBe(DEFAULTS.maxZoom);
  });

  it('a quarantined map clamps at the classic zoom ceiling', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom(withLayers({ lod: { ...LOD, m: 1 } }))).toBe(DEFAULTS.maxZoom);
    expect(getMaxZoom(withLayers({}, { 1: [cell(1, 1)] }))).toBe(DEFAULTS.maxZoom);
  });

  it('canAuthorDepth needs lod, the capability, and no quarantine', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(canAuthorDepth(withLayers({ lod: LOD }))).toBe(true);
    expect(canAuthorDepth(withLayers({}))).toBe(false);
    expect(canAuthorDepth(withLayers({ lod: { ...LOD, m: 3 } }))).toBe(false);
    getSettings.mockReturnValue({});
    expect(canAuthorDepth(withLayers({ lod: LOD }))).toBe(false);
  });

  it('a lod map uses its stored params; the dev override never applies m', () => {
    getSettings.mockReturnValue({ lodLadder: true });
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
