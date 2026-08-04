import { describe, it, expect } from 'vitest';

import { applyLockedViewState, createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData, StoredViewState } from '../../../types/core/map.types';

const VIEW_A: StoredViewState = { zoom: 1.5, center: { x: 10, y: 20 } };
const VIEW_B: StoredViewState = { zoom: 0.75, center: { x: 100, y: 200 } };

function mapWith(overrides: Partial<MapData>): MapData {
  return { ...createNewMap('Test map', 'grid'), ...overrides };
}

describe('applyLockedViewState', () => {
  it('replaces viewState with lockedViewState when picture frame is active', () => {
    const result = applyLockedViewState(mapWith({
      pictureFrame: true,
      viewState: VIEW_A,
      lockedViewState: VIEW_B
    }));
    expect(result.viewState).toEqual(VIEW_B);
    expect(result.lockedViewState).toEqual(VIEW_B);
  });

  it('returns a copy of the locked view, not a shared reference', () => {
    const locked: StoredViewState = { zoom: 2, center: { x: 1, y: 2 } };
    const result = applyLockedViewState(mapWith({
      pictureFrame: true,
      viewState: VIEW_A,
      lockedViewState: locked
    }));
    expect(result.viewState).not.toBe(locked);
  });

  it('keeps last-left viewState when picture frame is off', () => {
    const result = applyLockedViewState(mapWith({
      pictureFrame: false,
      viewState: VIEW_A,
      lockedViewState: VIEW_B
    }));
    expect(result.viewState).toEqual(VIEW_A);
  });

  it('keeps last-left viewState when no locked view is set', () => {
    const result = applyLockedViewState(mapWith({
      pictureFrame: true,
      viewState: VIEW_A
    }));
    expect(result.viewState).toEqual(VIEW_A);
  });

  it('handles maps that predate the feature (both fields absent)', () => {
    const base = mapWith({ viewState: VIEW_A });
    delete base.pictureFrame;
    delete base.lockedViewState;
    const result = applyLockedViewState(base);
    expect(result.viewState).toEqual(VIEW_A);
  });
});
