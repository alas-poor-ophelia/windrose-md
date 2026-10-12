/**
 * groupDragOps.test.ts
 *
 * Rung-scoped placement checks for multi-select group drag (lattice ladder):
 * a group may mix rungs, and rung cells of different levels share index space
 * but never collide. Classic maps (every object home 0) keep the old behaviour.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/core/settingsAccessor', () => ({
  getSettings: () => ({}),
  getObjectSettings: () => ({ objectOverrides: {}, customObjects: [], customCategories: [] }),
  getObjectSettingsForSet: () => null
}));

import type { MapObject } from '#types/objects/object.types';
import { isGroupGridMoveBlocked, groupItemHitsCell } from '../../../src/objects/groupDragOps';

const obj = (id: string, x: number, y: number, homeLevel?: number, size?: { width: number; height: number }): MapObject =>
  ({ id, type: 'chest', position: { x, y }, ...(homeLevel !== undefined ? { homeLevel } : {}), ...(size ? { size } : {}) } as MapObject);

const everywhere = (): boolean => true;

describe('isGroupGridMoveBlocked', () => {
  it('blocks on a same-rung overlap (classic: all home 0)', () => {
    const moving = obj('a', 0, 0);
    expect(isGroupGridMoveBlocked([{ oldObj: moving, newPosition: { x: 3, y: 3 } }], [obj('s', 3, 3)], everywhere)).toBe(true);
    expect(isGroupGridMoveBlocked([{ oldObj: moving, newPosition: { x: 4, y: 3 } }], [obj('s', 3, 3)], everywhere)).toBe(false);
  });

  it('honours multi-cell sizes on the classic path', () => {
    const big = obj('a', 0, 0, undefined, { width: 2, height: 2 });
    expect(isGroupGridMoveBlocked([{ oldObj: big, newPosition: { x: 2, y: 2 } }], [obj('s', 3, 3)], everywhere)).toBe(true);
  });

  it('ignores static objects on another rung with the same index', () => {
    const deep = obj('a', 0, 0, 2);
    expect(isGroupGridMoveBlocked([{ oldObj: deep, newPosition: { x: 5, y: 5 } }], [obj('s', 5, 5)], everywhere)).toBe(false);
    expect(isGroupGridMoveBlocked([{ oldObj: deep, newPosition: { x: 5, y: 5 } }], [obj('s', 5, 5, 2)], everywhere)).toBe(true);
  });

  it('a mixed-rung group is blocked by either member', () => {
    const moves = [
      { oldObj: obj('root', 0, 0), newPosition: { x: 1, y: 1 } },
      { oldObj: obj('deep', 0, 0, 1), newPosition: { x: 7, y: 7 } }
    ];
    expect(isGroupGridMoveBlocked(moves, [obj('s', 7, 7)], everywhere)).toBe(false);
    expect(isGroupGridMoveBlocked(moves, [obj('s', 7, 7, 1)], everywhere)).toBe(true);
  });

  it('asks the existence gate with each object\'s own rung', () => {
    const calls: Array<[number, number, number]> = [];
    const gate = (home: number, x: number, y: number): boolean => { calls.push([home, x, y]); return home !== 3; };
    const moves = [
      { oldObj: obj('root', 0, 0), newPosition: { x: 1, y: 2 } },
      { oldObj: obj('deep', 0, 0, 3), newPosition: { x: 9, y: 8 } }
    ];
    expect(isGroupGridMoveBlocked(moves, [], gate)).toBe(true);
    expect(calls).toEqual([[0, 1, 2], [3, 9, 8]]);
  });
});

describe('groupItemHitsCell', () => {
  it('tests the pointer cell resolved on the object\'s own rung', () => {
    const cellOnRung = (home: number) => (home === 0 ? { x: 1, y: 1 } : { x: 40, y: 41 });
    expect(groupItemHitsCell(obj('root', 1, 1), cellOnRung)).toBe(true);
    expect(groupItemHitsCell(obj('deep', 40, 41, 2), cellOnRung)).toBe(true);
    // The deep object at the root cell's index is not where the pointer is
    expect(groupItemHitsCell(obj('deep', 1, 1, 2), cellOnRung)).toBe(false);
  });

  it('covers multi-cell footprints and misses when the cell is unresolvable', () => {
    const big = obj('big', 0, 0, undefined, { width: 2, height: 2 });
    expect(groupItemHitsCell(big, () => ({ x: 1, y: 1 }))).toBe(true);
    expect(groupItemHitsCell(big, () => ({ x: 2, y: 1 }))).toBe(false);
    expect(groupItemHitsCell(obj('deep', 0, 0, 1), () => null)).toBe(false);
  });
});
