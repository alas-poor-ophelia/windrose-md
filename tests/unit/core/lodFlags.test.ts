import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { isLodLadderEnabled, isLadderMap, getMaxZoom } = await import('../../../src/core/lodFlags');
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

describe('lodFlags: isLadderMap', () => {
  beforeEach(() => { getSettings.mockReset(); withLadderOverride(undefined); });
  afterEach(() => { clearLadderGlobal(); });

  it('is false for every map while the capability is off', () => {
    getSettings.mockReturnValue({});
    expect(isLadderMap(hexMap())).toBe(false);
  });

  it('is true for an unrotated hex map with the capability on', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderMap(hexMap())).toBe(true);
    expect(isLadderMap(hexMap({ northDirection: 0 }))).toBe(true);
    expect(isLadderMap(hexMap({ northDirection: 360 }))).toBe(true);
  });

  it('is false for a grid map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderMap({ mapType: 'grid' } as MapData)).toBe(false);
  });

  it('is false for a rotated hex map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderMap(hexMap({ northDirection: 90 }))).toBe(false);
    expect(isLadderMap(hexMap({ northDirection: 270 }))).toBe(false);
  });

  it('is false for a missing map', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(isLadderMap(null)).toBe(false);
    expect(isLadderMap(undefined)).toBe(false);
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
    expect(getMaxZoom(hexMap())).toBeCloseTo(1638.4, 6);
    expect(getMaxZoom(hexMap({ hexSize: 120 }))).toBeCloseTo(1092.2666666666667, 6);
  });

  it('falls back to the default hex size when the map has none', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    expect(getMaxZoom({ mapType: 'hex' } as MapData)).toBeCloseTo(1638.4, 6);
  });

  it('honours the developer minCellPx override', () => {
    getSettings.mockReturnValue({ lodLadder: true });
    withLadderOverride({ minCellPx: 40 });
    expect(getMaxZoom(hexMap())).toBe(1024);
  });
});
