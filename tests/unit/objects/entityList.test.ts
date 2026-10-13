import { describe, it, expect } from 'vitest';
import { updateById, removeById, upsertById } from '../../../src/objects/entityList';
import { rotateObjectInList, updateObject, removeObject } from '../../../src/objects/objectOperations';
import type { MapObject } from '#types/objects/object.types';

const obj = (id: string, rotation?: number): MapObject =>
  ({ id, type: 't', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, ...(rotation === undefined ? {} : { rotation }) }) as MapObject;

describe('entityList', () => {
  it('null policy returns empty', () => {
    expect(updateById(null, 'a', {})).toEqual([]);
    expect(removeById(undefined, 'a')).toEqual([]);
    expect(upsertById(null, { id: 'a' })).toEqual([{ id: 'a' }]);
  });
  it('updates, removes, upserts by id without mutating', () => {
    const list = [{ id: 'a', n: 1 }, { id: 'b', n: 2 }];
    expect(updateById(list, 'b', { n: 9 })).toEqual([{ id: 'a', n: 1 }, { id: 'b', n: 9 }]);
    expect(removeById(list, 'a')).toEqual([{ id: 'b', n: 2 }]);
    expect(upsertById(list, { id: 'a', n: 5 })[0].n).toBe(5);
    expect(upsertById(list, { id: 'c', n: 3 })).toHaveLength(3);
    expect(list[1].n).toBe(2);
  });
});

describe('objectOperations by-id wrappers', () => {
  it('keep legacy behaviour', () => {
    expect(updateObject(null, 'a', {})).toEqual([]);
    expect(removeObject(null, 'a')).toEqual([]);
    expect(updateObject([obj('a')], 'a', { color: 'red' })[0].color).toBe('red');
    expect(removeObject([obj('a'), obj('b')], 'a').map(o => o.id)).toEqual(['b']);
  });
  it('rotateObjectInList steps 45 degrees, snaps odd values to 0, ignores unknown ids', () => {
    expect(rotateObjectInList([obj('a')], 'a')[0].rotation).toBe(45);
    expect(rotateObjectInList([obj('a', 315)], 'a')[0].rotation).toBe(0);
    expect(rotateObjectInList([obj('a', 10)], 'a')[0].rotation).toBe(0);
    expect(rotateObjectInList([obj('a')], 'zzz')[0].rotation).toBeUndefined();
    expect(rotateObjectInList(null, 'a')).toEqual([]);
  });
});
