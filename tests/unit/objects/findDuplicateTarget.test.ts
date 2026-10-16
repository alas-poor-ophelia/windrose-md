/**
 * findDuplicateTarget Unit Tests (DUP-21)
 *
 * The pure placement search shared by single duplicate
 * (useObjectModifications) and multi-select duplicate (ObjectLayer).
 */

import { describe, it, expect } from 'vitest';

import type { MapObject } from '#types/objects/object.types';
import { findDuplicateTarget } from '../../../src/objects/objectOperations';

function obj(id: string, x: number, y: number, slot?: number): MapObject {
  const o = { id, type: 'chest', position: { x, y }, size: { width: 1, height: 1 } } as unknown as MapObject;
  if (slot !== undefined) o.slot = slot;
  return o;
}

describe('findDuplicateTarget', () => {
  it('grid: picks the first free neighbour (east)', () => {
    const src = obj('a', 5, 5);
    expect(findDuplicateTarget([src], src, 'grid')).toEqual({ x: 6, y: 5 });
  });

  it('grid: skips an occupied east neighbour and takes south', () => {
    const src = obj('a', 5, 5);
    const objects = [src, obj('b', 6, 5)];
    expect(findDuplicateTarget(objects, src, 'grid')).toEqual({ x: 5, y: 6 });
  });

  it('grid: expands to ring 2 when all four neighbours are full', () => {
    const src = obj('a', 5, 5);
    const objects = [src, obj('e', 6, 5), obj('s', 5, 6), obj('w', 4, 5), obj('n', 5, 4)];
    const dest = findDuplicateTarget(objects, src, 'grid');
    expect(dest).not.toBeNull();
    expect(Math.max(Math.abs(dest!.x - 5), Math.abs(dest!.y - 5))).toBe(2);
    expect(dest!.slot).toBeUndefined();
    // first ring-2 cell in scan order (dx outer, dy inner)
    expect(dest).toEqual({ x: 3, y: 3 });
  });

  it('grid: returns null when nothing within range is free', () => {
    const src = obj('a', 0, 0);
    const objects: MapObject[] = [src];
    for (let x = -10; x <= 10; x++) {
      for (let y = -10; y <= 10; y++) {
        if (x !== 0 || y !== 0) objects.push(obj(`o${x}_${y}`, x, y));
      }
    }
    expect(findDuplicateTarget(objects, src, 'grid')).toBeNull();
  });

  it('hex: an empty neighbour gets slot 0', () => {
    const src = obj('a', 2, 2, 0);
    expect(findDuplicateTarget([src], src, 'hex')).toEqual({ x: 3, y: 2, slot: 0 });
  });

  it('hex: a partly occupied neighbour gets the next free slot, not the source slot', () => {
    const src = obj('a', 2, 2, 0);
    const objects = [src, obj('b', 3, 2, 0), obj('c', 3, 2, 2)];
    expect(findDuplicateTarget(objects, src, 'hex')).toEqual({ x: 3, y: 2, slot: 1 });
  });

  it('hex: a full neighbour (4 objects) is skipped for the next axial direction', () => {
    const src = obj('a', 2, 2, 0);
    const objects = [src, obj('b', 3, 2, 0), obj('c', 3, 2, 1), obj('d', 3, 2, 2), obj('e', 3, 2, 3)];
    expect(findDuplicateTarget(objects, src, 'hex')).toEqual({ x: 3, y: 1, slot: 0 });
  });

  it('bulk: successive copies searched against the growing list do not collide', () => {
    const a = obj('a', 0, 0);
    const objects = [a];
    const first = findDuplicateTarget(objects, a, 'grid')!;
    objects.push(obj('copy1', first.x, first.y));
    const second = findDuplicateTarget(objects, a, 'grid')!;
    expect(second).not.toEqual({ x: first.x, y: first.y });
  });

  it('findDuplicateTarget skips rung cells that do not exist', () => {
    const src = { ...obj('a', 5, 5), homeLevel: 2 } as MapObject;
    const seen: Array<[number, number, number]> = [];
    // Only x <= 5 exists on rung 2: east (6,5) is past the edge.
    const cellExists = (home: number, x: number, y: number): boolean => {
      seen.push([home, x, y]);
      return x <= 5;
    };
    const dest = findDuplicateTarget([src], src, 'grid', cellExists);
    expect(dest).toEqual({ x: 5, y: 6 });
    expect(seen.every(([home]) => home === 2)).toBe(true);
    // Nothing exists: no target rather than an off-lattice one.
    expect(findDuplicateTarget([src], src, 'grid', () => false)).toBeNull();
    // Omitted predicate keeps the shipped behaviour.
    expect(findDuplicateTarget([src], src, 'grid')).toEqual({ x: 6, y: 5 });
  });
});
