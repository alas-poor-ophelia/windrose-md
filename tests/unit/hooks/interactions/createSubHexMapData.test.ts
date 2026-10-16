/**
 * createSubHexMapData builds through createNewMap (STRUCT-B-23), so a new
 * sub-map carries the boards registry like every other map.
 */

import { describe, it, expect } from 'vitest';

import type { MapData } from '#types/core/map.types';
import { createSubHexMapData } from '../../../../src/hooks/interactions/useSubHexNavigation';
import { DEFAULT_BOARD_ID, addBoard, getBoardsOrdered } from '../../../../src/persistence/layerAccessor';

const parent = {
  name: 'World',
  mapType: 'hex',
  hexSize: 40,
  orientation: 'pointy',
  layers: [],
} as unknown as MapData;

describe('createSubHexMapData', () => {
  const sub = createSubHexMapData(parent, 2, -1);

  it('has a boards registry, activeBoardId and a board-stamped layer', () => {
    expect(sub.mapData.boards).toEqual([{ id: DEFAULT_BOARD_ID, name: 'Ground Floor', order: 0 }]);
    expect(sub.mapData.activeBoardId).toBe(DEFAULT_BOARD_ID);
    expect(sub.mapData.layers).toHaveLength(1);
    expect(sub.mapData.layers[0].boardId).toBe(DEFAULT_BOARD_ID);
    expect(sub.mapData.activeLayerId).toBe(sub.mapData.layers[0].id);
  });

  it('keeps the sub-hex specifics', () => {
    expect(sub.subdivisionRings).toBe(7);
    expect(sub.mapData.name).toBe('Hex (2, -1)');
    expect(sub.mapData.mapType).toBe('hex');
    expect(sub.mapData.hexSize).toBe(40);
    expect(sub.mapData.orientation).toBe('pointy');
    expect(sub.mapData.hexBounds).toEqual({ maxCol: 15, maxRow: 15, maxRing: 7 });
    expect(sub.mapData.viewState?.center).toEqual({ x: 0, y: 0 });
    expect(sub.mapData.viewState?.zoom).toBeGreaterThan(0);
  });

  it('adding a floor to a new sub-map keeps the ground floor', () => {
    const next = addBoard(sub.mapData);
    expect(getBoardsOrdered(next).map(b => b.id)).toEqual([DEFAULT_BOARD_ID, next.activeBoardId]);
  });
});
