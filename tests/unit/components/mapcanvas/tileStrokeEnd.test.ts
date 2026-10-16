/**
 * Tile stroke end guards (parallax-livefix 3 and 5): a stroke never commits
 * onto a layer it did not start on, and a window touchend ends it only for
 * the finger that started it.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../../src/assets/imageOperations', () => ({ preloadImage: vi.fn() }));

import { strokeCommitFor, touchEndsStroke } from '../../../../src/components/mapcanvas/TilePlacementLayer';
import type { TileAssignment } from '../../../../types/tiles/tile.types';

const tiles: TileAssignment[] = [{ col: 1, row: 1, tilesetId: 'ts', tileId: 't1' }];

function touchEvent(changed: number[], remaining: number[]): TouchEvent {
  const list = (ids: number[]): TouchList => {
    const items = ids.map((identifier) => ({ identifier }));
    return Object.assign(items, { item: (i: number) => items[i] }) as unknown as TouchList;
  };
  return { changedTouches: list(changed), touches: list(remaining) } as unknown as TouchEvent;
}

describe('strokeCommitFor', () => {
  it('no open stroke commits nothing', () => {
    expect(strokeCommitFor(null, 'L1', 'L1')).toBeNull();
  });
  it('same layer commits the stroke tiles', () => {
    expect(strokeCommitFor(tiles, 'L1', 'L1')).toBe(tiles);
  });
  it('a layer switch mid-stroke skips the commit', () => {
    expect(strokeCommitFor(tiles, 'L1', 'L2')).toBeNull();
  });
});

describe('touchEndsStroke', () => {
  it('the stroke finger lifting ends it', () => {
    expect(touchEndsStroke(touchEvent([0], []), 0)).toBe(true);
  });
  it('a second finger lifting while the first is down does not', () => {
    expect(touchEndsStroke(touchEvent([1], [0]), 0)).toBe(false);
  });
  it('unknown stroke finger: ends only when no touch remains', () => {
    expect(touchEndsStroke(touchEvent([1], [0]), null)).toBe(false);
    expect(touchEndsStroke(touchEvent([0], []), null)).toBe(true);
  });
});
