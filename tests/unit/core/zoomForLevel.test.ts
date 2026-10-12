import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { MapData } from '#types/core/map.types';

const getSettings = vi.fn(() => ({} as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', () => ({ getSettings }));

const { zoomForLevel, getMaxZoom, ladderParamsFor } = await import('../../../src/core/lodFlags');
const { crossingZoom } = await import('../../../src/geometry/core/lattice');

const ladderMap = (over: Partial<MapData> = {}): MapData =>
  ({ mapType: 'hex', hexSize: 80, lod: { m: 4, minCellPx: 64, maxLevel: 3 }, ...over } as MapData);

describe('zoomForLevel', () => {
  beforeEach(() => { getSettings.mockReset(); getSettings.mockReturnValue({ lodLadder: true }); });

  it('returns the band middle of the rung on a ladder map', () => {
    const map = ladderMap();
    const p = ladderParamsFor(map);
    expect(zoomForLevel(map, 2)).toBeCloseTo(crossingZoom(2, p) * Math.sqrt(p.m));
  });

  it('level 0 is the band middle of rung 0', () => {
    const map = ladderMap();
    const p = ladderParamsFor(map);
    expect(zoomForLevel(map, 0)).toBeCloseTo(crossingZoom(0, p) * 2);
  });

  it('never exceeds the map max zoom', () => {
    const map = ladderMap();
    expect(zoomForLevel(map, 3)).toBeLessThanOrEqual(getMaxZoom(map));
  });

  it('is null above maxLevel, negative or fractional', () => {
    const map = ladderMap();
    expect(zoomForLevel(map, 4)).toBeNull();
    expect(zoomForLevel(map, -1)).toBeNull();
    expect(zoomForLevel(map, 1.5)).toBeNull();
  });

  it('is null for a classic map and for a null map', () => {
    getSettings.mockReturnValue({});
    expect(zoomForLevel({ mapType: 'hex', hexSize: 80 } as MapData, 1)).toBeNull();
    expect(zoomForLevel({ mapType: 'grid' } as MapData, 1)).toBeNull();
    expect(zoomForLevel(null, 1)).toBeNull();
  });
});
