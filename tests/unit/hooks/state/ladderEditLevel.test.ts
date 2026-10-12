/**
 * Ladder phase 6 (design 06 s10, s4.2): the edit level is the camera rung or a
 * shallower lock; the level chips zoom to a rung's band middle; MCP setViewport
 * clamps zoom to the map's own range and can target a rung.
 */

import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/core/settingsAccessor', () => ({ getSettings: () => ({}) }));
import type { MapData } from '#types/core/map.types';
import { viewStateAtRung, resolveEditLevel, resolveViewportZoom } from '../../../../src/hooks/state/layerHistoryOps';
import { chooseLevel, type LadderParams } from '../../../../src/geometry/core/lattice';
import { DEFAULTS } from '../../../../src/core/dmtConstants';

// Crossings at 0.4 (L0), 1.6 (L1), 6.4 (L2), 25.6 (L3); ceiling 102.4.
const params: LadderParams = { hexSize: 80, m: 4, minCellPx: 64, maxLevel: 3 };
const CEILING = 102.4;
const view = { zoom: 1, center: { x: 10, y: 20 } };

const ladderMap = (zoom: number): MapData => ({
  schemaVersion: 2, mapType: 'hex', hexSize: 80, orientation: 'flat',
  activeLayerId: 'l1', layerPanelVisible: false, layers: [],
  lod: { m: 4, minCellPx: 64, maxLevel: 3 },
  viewState: { zoom, center: { x: 10, y: 20 } },
} as unknown as MapData);

const classicMap = (zoom: number): MapData => ({
  schemaVersion: 2, mapType: 'grid', activeLayerId: 'l1', layerPanelVisible: false, layers: [],
  viewState: { zoom, center: { x: 0, y: 0 } },
} as unknown as MapData);

describe('viewStateAtRung', () => {
  it('level 0 lands at the middle of the root band, keeping the centre', () => {
    const v = viewStateAtRung(view, 0, params, CEILING);
    expect(v.center).toEqual({ x: 10, y: 20 });
    expect(v.zoom).toBeCloseTo(0.8, 10);
    expect(chooseLevel(v.zoom, params)).toBe(0);
  });

  it('level >= 1 lands at crossingZoom(L) * sqrt(m), on that rung', () => {
    for (const level of [1, 2, 3]) {
      const v = viewStateAtRung(view, level, params, CEILING);
      expect(chooseLevel(v.zoom, params)).toBe(level);
    }
    expect(viewStateAtRung(view, 2, params, CEILING).zoom).toBeCloseTo(12.8, 10);
  });

  it('returns a view even when the rung is already active (unlike viewStateForRung)', () => {
    const v = viewStateAtRung({ zoom: 8, center: { x: 0, y: 0 } }, 2, params, CEILING);
    expect(v.zoom).toBeCloseTo(12.8, 10);
  });

  it('clamps the level to [0, maxLevel] and the zoom to maxZoom', () => {
    expect(viewStateAtRung(view, 9, params, CEILING).zoom).toBeCloseTo(51.2, 10);
    expect(viewStateAtRung(view, -2, params, CEILING).zoom).toBeCloseTo(0.8, 10);
    expect(viewStateAtRung(view, 3, params, 20).zoom).toBe(20);
  });
});

describe('resolveEditLevel', () => {
  it('unlocked: follows the camera', () => {
    expect(resolveEditLevel(null, 0)).toBe(0);
    expect(resolveEditLevel(null, 2)).toBe(2);
  });

  it('a lock shallower than the camera wins', () => {
    expect(resolveEditLevel(1, 3)).toBe(1);
    expect(resolveEditLevel(0, 2)).toBe(0);
  });

  it('a lock deeper than the camera yields to the camera (the rung is not on screen)', () => {
    expect(resolveEditLevel(3, 1)).toBe(1);
    expect(resolveEditLevel(2, 2)).toBe(2);
  });
});

describe('resolveViewportZoom (MCP setViewport)', () => {
  it('clamps a classic map to its own ceiling and floor', () => {
    expect(resolveViewportZoom(classicMap(1), 500, undefined, 1)).toBe(DEFAULTS.maxZoom);
    expect(resolveViewportZoom(classicMap(1), 0.01, undefined, 1)).toBe(DEFAULTS.minZoom);
    expect(resolveViewportZoom(classicMap(1), 2, undefined, 1)).toBe(2);
  });

  it('omitted zoom keeps the fallback (current zoom), clamped', () => {
    expect(resolveViewportZoom(classicMap(1), undefined, undefined, 1.5)).toBe(1.5);
    expect(resolveViewportZoom(classicMap(1), undefined, undefined, 50)).toBe(DEFAULTS.maxZoom);
  });

  it('a ladder map clamps at its ladder ceiling, not the classic one', () => {
    expect(resolveViewportZoom(ladderMap(1), 500, undefined, 1)).toBeCloseTo(CEILING, 10);
    expect(resolveViewportZoom(ladderMap(1), 30, undefined, 1)).toBe(30);
  });

  it('level overrides zoom on a ladder map and is ignored on a classic map', () => {
    expect(resolveViewportZoom(ladderMap(1), 3, 2, 1)).toBeCloseTo(12.8, 10);
    expect(resolveViewportZoom(ladderMap(1), undefined, 0, 1)).toBeCloseTo(0.8, 10);
    expect(resolveViewportZoom(classicMap(1), 2, 2, 1)).toBe(2);
  });
});
