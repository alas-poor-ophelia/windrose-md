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
import { isGroupGridMoveBlocked, groupItemHitsCell, assignGroupSlots, reorganizeVacatedCells, groupMoveStacksInSlots, planGroupGridMove } from '../../../src/objects/groupDragOps';

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

describe('assignGroupSlots (hex)', () => {
  const slotted = (id: string, x: number, y: number, slot: number, homeLevel?: number): MapObject =>
    ({ ...obj(id, x, y, homeLevel), slot } as MapObject);

  it('two movers into one empty cell get slots 0 and 1', () => {
    const moves = [
      { oldObj: slotted('a', 0, 0, 0), newPosition: { x: 5, y: 5 } },
      { oldObj: slotted('b', 1, 0, 0), newPosition: { x: 5, y: 5 } }
    ];
    const slots = assignGroupSlots(moves, []);
    expect(slots).not.toBeNull();
    expect([slots!.get('a'), slots!.get('b')].sort()).toEqual([0, 1]);
  });

  it('a mover into a cell with 3 static objects gets slot 3', () => {
    const statics = [slotted('s0', 5, 5, 0), slotted('s1', 5, 5, 1), slotted('s2', 5, 5, 2)];
    const slots = assignGroupSlots([{ oldObj: slotted('a', 0, 0, 0), newPosition: { x: 5, y: 5 } }], statics);
    expect(slots?.get('a')).toBe(3);
  });

  it('a mover into a full cell blocks; so does a group that would overflow a cell', () => {
    const full = [0, 1, 2, 3].map(i => slotted('s' + i, 5, 5, i));
    expect(assignGroupSlots([{ oldObj: slotted('a', 0, 0, 0), newPosition: { x: 5, y: 5 } }], full)).toBeNull();
    const three = full.slice(0, 3);
    const moves = [
      { oldObj: slotted('a', 0, 0, 0), newPosition: { x: 5, y: 5 } },
      { oldObj: slotted('b', 1, 0, 0), newPosition: { x: 5, y: 5 } }
    ];
    expect(assignGroupSlots(moves, three)).toBeNull();
  });

  it('is rung-scoped: a static object on another rung at the same index does not count', () => {
    const otherRung = [0, 1, 2, 3].map(i => slotted('s' + i, 5, 5, i, 2));
    const slots = assignGroupSlots([{ oldObj: slotted('a', 0, 0, 3), newPosition: { x: 5, y: 5 } }], otherRung);
    expect(slots?.get('a')).toBe(0);
    // ...and on its own rung the same statics fill the cell
    expect(assignGroupSlots([{ oldObj: slotted('d', 0, 0, 0, 2), newPosition: { x: 5, y: 5 } }], otherRung)).toBeNull();
  });

  it('a mover that keeps its cell keeps its slot', () => {
    const statics = [slotted('s0', 5, 5, 0)];
    const slots = assignGroupSlots([{ oldObj: slotted('a', 5, 5, 2), newPosition: { x: 5, y: 5 } }], statics);
    expect(slots?.get('a')).toBe(2);
  });
});

describe('reorganizeVacatedCells (hex)', () => {
  it('compacts a vacated cell: the remaining slot-2 object moves to slot 0', () => {
    const before = [
      { ...obj('a', 1, 1), slot: 0 },
      { ...obj('b', 1, 1), slot: 1 },
      { ...obj('c', 1, 1), slot: 2 }
    ] as MapObject[];
    const moves = [
      { oldObj: before[0], newPosition: { x: 4, y: 4 } },
      { oldObj: before[1], newPosition: { x: 4, y: 4 } }
    ];
    const after = before.map(o => (o.id === 'c' ? o : { ...o, position: { x: 4, y: 4 } }));
    const result = reorganizeVacatedCells(after, moves);
    expect(result.find(o => o.id === 'c')?.slot).toBe(0);
  });

  it('leaves the same index on another rung alone', () => {
    const deep = { ...obj('d', 1, 1, 2), slot: 2 } as MapObject;
    const mover = { ...obj('a', 1, 1), slot: 0 } as MapObject;
    const after = [{ ...mover, position: { x: 4, y: 4 } }, deep];
    const result = reorganizeVacatedCells(after, [{ oldObj: mover, newPosition: { x: 4, y: 4 } }]);
    expect(result.find(o => o.id === 'd')?.slot).toBe(2);
  });
});

describe('group move on hex: classic refuses occupied cells, ladder stacks (cross-model review item 3)', () => {
  it('stacks only on a hex map with a ladder or a stored lod', () => {
    expect(groupMoveStacksInSlots('hex', false, false)).toBe(false);
    expect(groupMoveStacksInSlots('hex', true, false)).toBe(true);
    expect(groupMoveStacksInSlots('hex', false, true)).toBe(true);
    expect(groupMoveStacksInSlots('grid', true, true)).toBe(false);
    expect(groupMoveStacksInSlots(undefined, false, false)).toBe(false);
  });

  it('classic hex (no ladder): a move onto an occupied cell is refused, like main', () => {
    const moves = [{ oldObj: { ...obj('a', 0, 0), slot: 2 } as MapObject, newPosition: { x: 3, y: 3 } }];
    expect(planGroupGridMove(moves, [obj('s', 3, 3)], everywhere, false)).toEqual({ blocked: true });
  });

  it('classic hex: a move onto a free cell keeps slots untouched (no assignment)', () => {
    const moves = [{ oldObj: { ...obj('a', 0, 0), slot: 2 } as MapObject, newPosition: { x: 4, y: 3 } }];
    expect(planGroupGridMove(moves, [obj('s', 3, 3)], everywhere, false)).toEqual({ blocked: false, slots: null });
  });

  it('ladder hex: the same move stacks into the next free slot', () => {
    const moves = [{ oldObj: { ...obj('a', 0, 0), slot: 2 } as MapObject, newPosition: { x: 3, y: 3 } }];
    const plan = planGroupGridMove(moves, [{ ...obj('s', 3, 3), slot: 0 } as MapObject], everywhere, true);
    expect(plan.blocked).toBe(false);
    expect(plan.blocked === false ? plan.slots?.get('a') : undefined).toBe(1);
  });

  it('ladder hex: a cell that would overflow is refused', () => {
    const statics = [0, 1, 2, 3].map((i) => ({ ...obj('s' + i, 3, 3), slot: i } as MapObject));
    const moves = [{ oldObj: obj('a', 0, 0), newPosition: { x: 3, y: 3 } }];
    expect(planGroupGridMove(moves, statics, everywhere, true)).toEqual({ blocked: true });
  });

  it('both branches refuse a cell that does not exist on the rung', () => {
    const moves = [{ oldObj: obj('a', 0, 0), newPosition: { x: 9, y: 9 } }];
    const nowhere = (): boolean => false;
    expect(planGroupGridMove(moves, [], nowhere, false)).toEqual({ blocked: true });
    expect(planGroupGridMove(moves, [], nowhere, true)).toEqual({ blocked: true });
  });
});
