/**
 * addBoard on a map with no boards registry (STRUCT-B-23).
 *
 * Sub-maps created live before the fix had no `boards`; addBoard appended the
 * new floor to an empty registry, so the original floor was stranded and
 * setActiveBoard('board-default') was refused until reload.
 */

import { describe, it, expect } from 'vitest';

import type { MapData, MapLayer } from '#types/core/map.types';
import {
  DEFAULT_BOARD_ID,
  addBoard,
  getBoardsOrdered,
  setActiveBoard,
} from '../../../src/persistence/layerAccessor';

function boardlessMap(): MapData {
  const layer = {
    id: 'layer-1', name: '1', order: 0, visible: true,
    cells: [], curves: [], edges: [], objects: [], textLabels: [], fogOfWar: null,
  } as unknown as MapLayer;
  return {
    name: 'Hex (1, 0)',
    mapType: 'hex',
    activeLayerId: 'layer-1',
    layers: [layer],
  } as unknown as MapData;
}

describe('addBoard without a boards registry', () => {
  it('keeps the original floor alongside the new one', () => {
    const next = addBoard(boardlessMap(), 'Upstairs');
    const boards = getBoardsOrdered(next);
    expect(boards.map(b => b.id)).toContain(DEFAULT_BOARD_ID);
    expect(boards).toHaveLength(2);
    expect(boards[0].id).toBe(DEFAULT_BOARD_ID);
    expect(boards[1].name).toBe('Upstairs');
    expect(next.activeBoardId).toBe(boards[1].id);
    // the original layer is stamped onto the default board
    expect(next.layers.find(l => l.id === 'layer-1')?.boardId).toBe(DEFAULT_BOARD_ID);
  });

  it('lets the user switch back to the original floor', () => {
    const next = addBoard(boardlessMap());
    const back = setActiveBoard(next, DEFAULT_BOARD_ID);
    expect(back.activeBoardId).toBe(DEFAULT_BOARD_ID);
    expect(back.activeLayerId).toBe('layer-1');
  });

  it('does not mutate the input map or its layers', () => {
    const input = boardlessMap();
    addBoard(input);
    expect(input.boards).toBeUndefined();
    expect(input.layers[0].boardId).toBeUndefined();
  });
});
