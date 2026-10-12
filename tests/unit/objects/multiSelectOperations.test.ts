/**
 * multiSelectOperations.getItemsInWorldRect: marquee selection under the
 * lattice ladder. With a view, an object's selectable bounds are its drawn
 * footprint on its home rung; without one the classic root-hex path is unchanged.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/core/settingsAccessor', () => ({
  getSettings: () => ({}),
  getObjectSettings: () => ({ objectOverrides: {}, customObjects: [], customCategories: [] }),
  getObjectSettingsForSet: () => null
}));

import type { MapObject } from '#types/objects/object.types';
import { HexGeometry } from '../../../src/geometry/core/HexGeometry';
import { createGeometryLadder } from '../../../src/geometry/core/createGeometryLadder';
import { getItemsInWorldRect } from '../../../src/objects/multiSelectOperations';
import { makeLayer, makeMapData } from '../helpers/fixtures';

const root = new HexGeometry(80, 'flat', null);
const ladder = createGeometryLadder(root, { m: 4, minCellPx: 64, maxLevel: 3 });
const ZOOM = 8; // rung 2

function obj(over: Partial<MapObject> & { id: string }): MapObject {
  return { type: 'entrance', position: { x: 3, y: -1 }, size: { width: 1, height: 1 }, ...over } as MapObject;
}

const rootObj = obj({ id: 'root' });
const deepObj = obj({ id: 'deep', homeLevel: 2 });
const popObj = obj({ id: 'pop', depthMode: 'pop' });

function mapWith(objects: MapObject[]) {
  return makeMapData({ mapType: 'hex', hexSize: 80, layers: [makeLayer({ id: 'layer-1', objects })] });
}

function around(c: { worldX: number; worldY: number }, r = 1) {
  return [{ worldX: c.worldX - r, worldY: c.worldY - r }, { worldX: c.worldX + r, worldY: c.worldY + r }] as const;
}

const view = { ladder, level: 2, zoom: ZOOM, orientation: 'flat' as const };
const ids = (items: { id: string }[]) => items.map(i => i.id).sort();

describe('getItemsInWorldRect with a ladder view', () => {
  it('a rect around the rung-2 cell selects the homeLevel 2 object, not the root one at the same index', () => {
    const [a, b] = around(ladder.geometryForLevel(2).getCellCenter(3, -1));
    const items = getItemsInWorldRect(mapWith([rootObj, deepObj]), a, b, root, null, view);
    expect(ids(items)).toEqual(['deep']);
  });

  it('a rect around the root hex selects the root object, not the deep one', () => {
    const [a, b] = around(root.getCellCenter(3, -1));
    const items = getItemsInWorldRect(mapWith([rootObj, deepObj]), a, b, root, null, view);
    expect(ids(items)).toEqual(['root']);
  });

  it('a pop root object below its home rung is not selectable', () => {
    const [a, b] = around(root.getCellCenter(3, -1));
    const items = getItemsInWorldRect(mapWith([popObj]), a, b, root, null, view);
    expect(items).toEqual([]);
  });
});

describe('getItemsInWorldRect without a view (classic)', () => {
  it('selects by the root hex at the object index regardless of homeLevel', () => {
    const [a, b] = around(root.getCellCenter(3, -1));
    const items = getItemsInWorldRect(mapWith([rootObj, deepObj, popObj]), a, b, root, null);
    expect(ids(items)).toEqual(['deep', 'pop', 'root']);
  });
});
