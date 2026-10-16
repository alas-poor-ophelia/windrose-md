import { describe, it, expect } from 'vitest';
import {
  isSameHistoryState, diffHistoryFields, guardedPatch, pushHistoryEntry, createHistoryStack, stepHistoryUndo, mergeFieldDiffs,
} from '../../../../src/hooks/state/useHistory';

describe('isSameHistoryState (MEM-01 reference change check)', () => {
  const cells = [{ x: 1, y: 2 }];
  const objects = [{ id: 'a' }];
  const base = { cells, objects, name: 'Map', fogOfWar: null as unknown };

  it('treats a snapshot sharing every field reference as unchanged (no push)', () => {
    expect(isSameHistoryState(base, { cells, objects, name: 'Map', fogOfWar: null })).toBe(true);
  });

  it('treats one new array with a different element as a change (push)', () => {
    expect(isSameHistoryState(base, { ...base, cells: [...cells, { x: 3, y: 4 }] })).toBe(false);
  });

  it('treats a fresh array holding the same element references as unchanged', () => {
    expect(isSameHistoryState(base, { ...base, objects: objects.filter(() => true) })).toBe(true);
  });

  it('treats a fresh element object as a change even if its content is equal', () => {
    expect(isSameHistoryState(base, { ...base, cells: [{ x: 1, y: 2 }] })).toBe(false);
  });

  it('treats two distinct empty arrays as unchanged', () => {
    expect(isSameHistoryState({ a: [] as number[] }, { a: [] as number[] })).toBe(true);
  });

  it('treats a missing key and an empty array as a change (matches the old JSON check)', () => {
    const a: Record<string, unknown> = { cells };
    const b: Record<string, unknown> = { cells, shapeOverlays: [] };
    expect(isSameHistoryState(a, b)).toBe(false);
    expect(isSameHistoryState(b, a)).toBe(false);
  });

  it('treats a missing key and an undefined value as unchanged', () => {
    const a: Record<string, unknown> = { cells };
    const b: Record<string, unknown> = { cells, fogOfWar: undefined };
    expect(isSameHistoryState(a, b)).toBe(true);
  });

  it('compares changed scalar fields by value', () => {
    expect(isSameHistoryState(base, { ...base, name: 'Other' })).toBe(false);
  });
});


describe('diff history helpers (DATA-06)', () => {
  const a = [1];
  const b = [2];
  it('diffs only changed keys, and skips undefined when asked', () => {
    expect(diffHistoryFields<{ x: number[]; y: number[] }>(['x', 'y'], { x: a, y: a }, { x: b, y: a }, false))
      .toEqual({ before: { x: a }, after: { x: b } });
    expect(diffHistoryFields<{ x?: number[] }>(['x'], { x: a }, { x: undefined }, true)).toBeNull();
    expect(diffHistoryFields<{ x?: number[] }>(['x'], { x: undefined }, { x: [] }, false)).toBeNull();
  });
  it('guardedPatch leaves fields changed since the entry alone', () => {
    expect(guardedPatch<{ x: number[]; y: number[] }>({ x: b, y: [9] }, { x: b, y: b }, { x: a, y: a })).toEqual({ x: a });
    expect(guardedPatch<{ x: number[] }>({ x: [9] }, { x: b }, { x: a })).toBeNull();
  });
  it('caps the stack and drops the redo tail on push', () => {
    let s = createHistoryStack<number>();
    for (let i = 0; i < 5; i++) s = pushHistoryEntry(s, i, 3);
    expect(s.entries).toEqual([2, 3, 4]);
    const undone = stepHistoryUndo(s);
    s = pushHistoryEntry(undone?.stack ?? s, 9, 3);
    expect(s.entries).toEqual([2, 3, 9]);
  });
  it('merges diffs keeping the oldest before and newest after', () => {
    expect(mergeFieldDiffs<{ x: number }>({ before: { x: 1 }, after: { x: 2 } }, { before: { x: 2 }, after: { x: 3 } }))
      .toEqual({ before: { x: 1 }, after: { x: 3 } });
  });
});
