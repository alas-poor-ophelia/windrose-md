/**
 * Sub-hex bounds fences + "+" slot computation
 *
 * Regression coverage for the phantom-create bug: clicking/double-clicking
 * where a non-existent adjacent sibling region would be used to fall through
 * to the drill-in path and create a sub-map NESTED under the current sub-hex
 * at a far out-of-bounds hex (screenToGrid has no bounds clamp; enterSubHex
 * created unconditionally). The fix fences creation on
 * geometry.isWithinBounds — these tests pin the fence semantics and the
 * adjacentEmptySlots ("+" affordance) computation.
 */

import { describe, it, expect } from 'vitest';

import type { MapData } from '#types/core/map.types';
import { HexGeometry } from '../../../../src/geometry/core/HexGeometry';
import { createGeometry } from '../../../../src/geometry/core/createGeometry';
import { computeAdjacentEmptySlots } from '../../../../src/hooks/interactions/useSubHexNavigation';

/** Minimal radial hex sub-map (the shape createSubHexMapData produces). */
function radialHexMap(maxRing: number, subHexMaps?: MapData['subHexMaps']): MapData {
  return {
    id: 'test-map',
    mapType: 'hex',
    hexSize: 24,
    orientation: 'flat',
    hexBounds: { maxCol: 0, maxRow: 0, maxRing },
    subHexMaps,
  } as unknown as MapData;
}

describe('bounds fence semantics (the phantom-create regression)', () => {
  it('radial bounds reject the ghost-territory coordinate a sibling click resolves to', () => {
    // A click over an adjacent sibling's ghost preview resolves through
    // screenToGrid to a hex ~tileStep = 2*maxRing+1 steps away. With the
    // default maxRing=7 that's q=15 — far outside the current map's grid.
    const geom = new HexGeometry(24, 'flat', { maxCol: 0, maxRow: 0, maxRing: 7 });
    expect(geom.isWithinBounds(15, 0)).toBe(false);
    expect(geom.isWithinBounds(0, 15)).toBe(false);
    expect(geom.isWithinBounds(8, 0)).toBe(false); // first ring past the edge
  });

  it('radial bounds accept every hex up to and including maxRing', () => {
    const geom = new HexGeometry(24, 'flat', { maxCol: 0, maxRow: 0, maxRing: 7 });
    expect(geom.isWithinBounds(0, 0)).toBe(true);
    expect(geom.isWithinBounds(7, 0)).toBe(true);
    expect(geom.isWithinBounds(0, -7)).toBe(true);
    expect(geom.isWithinBounds(4, -7)).toBe(true); // ring = max(|q|,|r|,|q+r|) = 7
  });

  it('rectangular bounds (root maps) reject out-of-grid coordinates too', () => {
    const geom = new HexGeometry(24, 'flat', { maxCol: 10, maxRow: 10 });
    expect(geom.renderingMode).toBe('rectangular');
    expect(geom.isWithinBounds(-20, 0)).toBe(false);
    expect(geom.isWithinBounds(0, 0)).toBe(true);
  });

  it('createGeometry builds a bounds-aware geometry from sub-map data', () => {
    const geom = createGeometry(radialHexMap(7));
    expect(geom.isWithinBounds(15, 0)).toBe(false);
    expect(geom.isWithinBounds(3, 2)).toBe(true);
  });

  it('boundless maps (legacy, hexBounds absent) never reject — fence stays open by design', () => {
    const geom = createGeometry({ id: 'x', mapType: 'hex' } as unknown as MapData);
    expect(geom.isWithinBounds(999, 999)).toBe(true);
  });
});

describe('computeAdjacentEmptySlots ("+" affordances)', () => {
  it('returns all six neighbors for an interior hex with no siblings', () => {
    const parent = radialHexMap(7);
    const slots = computeAdjacentEmptySlots(parent, '0,0', new Set());
    expect(slots).toHaveLength(6);
    expect(slots.every(s => !s.exists)).toBe(true);
    expect(new Set(slots.map(s => s.hexKey)).size).toBe(6);
  });

  it('excludes navigable siblings and marks existing-but-empty ones', () => {
    const parent = radialHexMap(7, {
      '1,0': { mapData: { id: 's1', mapType: 'hex' } },
      '0,1': { mapData: { id: 's2', mapType: 'hex' } },
    } as unknown as MapData['subHexMaps']);
    // '1,0' has content → navigable; '0,1' exists but is empty.
    const slots = computeAdjacentEmptySlots(parent, '0,0', new Set(['1,0']));
    expect(slots).toHaveLength(5);
    expect(slots.find(s => s.hexKey === '1,0')).toBeUndefined();
    expect(slots.find(s => s.hexKey === '0,1')?.exists).toBe(true);
    expect(slots.find(s => s.hexKey === '-1,0')?.exists).toBe(false);
  });

  it('drops neighbors outside the parent grid at an edge hex', () => {
    // Current hex at the parent's rim (ring 2 of a maxRing-2 parent): the
    // three outward neighbors are out of bounds and must NOT get a "+".
    const parent = radialHexMap(2);
    const slots = computeAdjacentEmptySlots(parent, '2,0', new Set());
    expect(slots.map(s => s.hexKey).sort()).toEqual(['1,0', '1,1', '2,-1'].sort());
  });

  it('slot deltas are consistent with their hexKeys', () => {
    const slots = computeAdjacentEmptySlots(radialHexMap(7), '3,-2', new Set());
    for (const s of slots) {
      const [q, r] = s.hexKey.split(',').map(Number);
      expect(q).toBe(3 + s.dq);
      expect(r).toBe(-2 + s.dr);
    }
  });
});
