import { describe, it, expect } from 'vitest';
import { isSameHistoryState } from '../../../../src/hooks/state/useHistory';

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
