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
import { setSelectionVisibleLevels } from '../../../src/hooks/objects/useMultiSelectionActions';
import { ladderLabelBounds } from '../../../src/text/textLabelOperations';
import type { TextLabel } from '#types/objects/note.types';
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

describe('getItemsInWorldRect classic hex honours obj.size', () => {
  it('a 2x2 hex object is selected by a rect touching its second column; a 1x1 is not', () => {
    // Drawn from (center - hexSize/2) at size * hexSize: the second column spans
    // center + 40 .. center + 120 at hexSize 80, past the one-hex box (center + 80).
    const c = root.getCellCenter(3, -1);
    const a = { worldX: c.worldX + 100, worldY: c.worldY - 1 };
    const b = { worldX: c.worldX + 110, worldY: c.worldY + 1 };
    const big = obj({ id: 'big', size: { width: 2, height: 2 } });
    const small = obj({ id: 'small' });
    expect(ids(getItemsInWorldRect(mapWith([big]), a, b, root, null))).toEqual(['big']);
    expect(ids(getItemsInWorldRect(mapWith([small]), a, b, root, null))).toEqual([]);
  });
});

describe('getItemsInWorldRect without a view on a lod map (cross-model review item 2)', () => {
  const LOD = { m: 4, minCellPx: 64, maxLevel: 3 };
  it('a quarantined/rotated lod map selects only rung-0 objects and labels', () => {
    const [a, b] = around(root.getCellCenter(3, -1));
    const c = root.getCellCenter(3, -1);
    const labels = [
      { id: 'lab-root', position: { x: c.worldX, y: c.worldY }, content: 'a', fontSize: 12, fontFace: 'sans', color: '#000' },
      { id: 'lab-deep', position: { x: c.worldX, y: c.worldY }, content: 'b', fontSize: 12, fontFace: 'sans', color: '#000', homeLevel: 2 },
    ];
    const map = makeMapData({ mapType: 'hex', hexSize: 80, lod: LOD, layers: [makeLayer({ id: 'layer-1', objects: [rootObj, deepObj, popObj], textLabels: labels } as never)] } as never);
    expect(ids(getItemsInWorldRect(map, a, b, root, null))).toEqual(['lab-root', 'pop', 'root']);
  });

  it('the same map with a ladder view is unaffected by the filter', () => {
    const [a, b] = around(ladder.geometryForLevel(2).getCellCenter(3, -1));
    const map = makeMapData({ mapType: 'hex', hexSize: 80, lod: LOD, layers: [makeLayer({ id: 'layer-1', objects: [rootObj, deepObj] })] } as never);
    expect(ids(getItemsInWorldRect(map, a, b, root, null, view))).toEqual(['deep']);
  });
});

describe('getItemsInWorldRect labels with a ladder view (INT-02)', () => {
  function textLabel(over: Partial<TextLabel> & { id: string }): TextLabel {
    return { content: 'abcdefghij', position: { x: 0, y: 0 }, rotation: 0, fontSize: 16, fontFace: 'sans', color: '#ffffff', ...over } as TextLabel;
  }
  function labelMap(labels: TextLabel[]) {
    return makeMapData({ mapType: 'hex', hexSize: 80, layers: [makeLayer({ id: 'layer-1', textLabels: labels })] });
  }
  const tiny = around({ worldX: 0, worldY: 0 }, 0.5);

  it('marquee over a pop label at home+1 selects nothing', () => {
    const pop = textLabel({ id: 'pop', homeLevel: 1, depthMode: 'pop' });
    const persist = textLabel({ id: 'persist', homeLevel: 1, depthMode: 'persist' });
    // view is rung 2 = home + 1: the pop label is not drawn, the persist one is.
    expect(ids(getItemsInWorldRect(labelMap([pop, persist]), tiny[0], tiny[1], root, null, view))).toEqual(['persist']);
  });

  it('label whose visibleLevels exclude the current rung is not selected', () => {
    const hidden = textLabel({ id: 'hidden', homeLevel: 2, visibleLevels: [0, 1] });
    const shown = textLabel({ id: 'shown', homeLevel: 2, visibleLevels: [2] });
    expect(ids(getItemsInWorldRect(labelMap([hidden, shown]), tiny[0], tiny[1], root, null, view))).toEqual(['shown']);
  });

  it('persist label box scaled by elementScale', () => {
    // A root persist label at rung 2 is held: its drawn box is narrower in world
    // px than the raw fontSize box the classic path measures.
    const held = textLabel({ id: 'held', depthMode: 'persist' });
    const box = ladderLabelBounds(held, null, { ladder, zoom: ZOOM, activeLevel: 2 })!;
    const rawHalf = (held.content.length * held.fontSize * 0.6 + 8) / 2;
    expect(box.width / 2).toBeLessThan(rawHalf);
    const between = (box.width / 2 + rawHalf) / 2;
    const map = labelMap([held]);
    // A rect starting between the held and the raw half-width misses the label...
    const miss = getItemsInWorldRect(map, { worldX: between, worldY: -1 }, { worldX: between + 1, worldY: 1 }, root, null, view);
    expect(miss).toEqual([]);
    // ...and one just inside the held box hits it.
    const inside = box.width / 2 - 0.01;
    const hit = getItemsInWorldRect(map, { worldX: inside, worldY: -1 }, { worldX: inside + 1, worldY: 1 }, root, null, view);
    expect(ids(hit)).toEqual(['held']);
  });
});

describe('setSelectionVisibleLevels (TEST-03)', () => {
  const MAX = 3;
  const label = (over: Partial<TextLabel> & { id: string }): TextLabel =>
    ({ position: { x: 0, y: 0 }, content: 'x', fontSize: 16, fontFace: 'sans-serif', color: '#fff', ...over }) as TextLabel;
  const sel = (type: 'object' | 'text', id: string) => ({ type, id }) as never;

  // Object at home 2 is Auto-visible on rungs 1..3; an explicit [3] object only on 3.
  const autoObj = obj({ id: 'auto', homeLevel: 2 });
  const pinnedObj = obj({ id: 'pinned', homeLevel: 2, visibleLevels: [3] });
  const bystander = obj({ id: 'other', homeLevel: 2 });
  const layer = { objects: [autoObj, pinnedObj, bystander], textLabels: [] as TextLabel[] };

  it('mixed Auto and explicit: each element edits from its own effective set', () => {
    const out = setSelectionVisibleLevels(layer, [sel('object', 'auto'), sel('object', 'pinned')], { kind: 'level', level: 2, on: true }, MAX);
    expect(out.objects.find(o => o.id === 'auto')?.visibleLevels).toEqual([1, 2, 3]);
    expect(out.objects.find(o => o.id === 'pinned')?.visibleLevels).toEqual([2, 3]);
  });

  it('turning off the last visible level reverts the element to Auto (undefined)', () => {
    const out = setSelectionVisibleLevels(layer, [sel('object', 'pinned')], { kind: 'level', level: 3, on: false }, MAX);
    const edited = out.objects.find(o => o.id === 'pinned');
    expect(edited?.visibleLevels).toBeUndefined();
    expect(out.updates).toEqual([{ id: 'pinned', visibleLevels: undefined }]);
  });

  it('turning a level off from Auto seeds the set from the band, minus that level', () => {
    const out = setSelectionVisibleLevels(layer, [sel('object', 'auto')], { kind: 'level', level: 1, on: false }, MAX);
    expect(out.objects.find(o => o.id === 'auto')?.visibleLevels).toEqual([2, 3]);
  });

  it('Auto clears every selected element and leaves the rest untouched', () => {
    const out = setSelectionVisibleLevels(layer, [sel('object', 'pinned')], { kind: 'auto' }, MAX);
    expect(out.objects.find(o => o.id === 'pinned')?.visibleLevels).toBeUndefined();
    expect(out.objects.find(o => o.id === 'other')).toBe(bystander);
    expect(out.objects.find(o => o.id === 'auto')).toBe(autoObj);
  });

  it('objects and labels in one selection each use their own band', () => {
    const lab = label({ id: 'lab', homeLevel: 2 });
    const out = setSelectionVisibleLevels(
      { objects: layer.objects, textLabels: [lab, label({ id: 'unselected', homeLevel: 2 })] },
      [sel('object', 'auto'), sel('text', 'lab')],
      { kind: 'level', level: 0, on: true },
      MAX
    );
    // Objects start at home-1 (rung 1), labels at home-2 (rung 0): adding rung 0 changes only the object.
    expect(out.objects.find(o => o.id === 'auto')?.visibleLevels).toEqual([0, 1, 2, 3]);
    expect(out.textLabels.find(l => l.id === 'lab')?.visibleLevels).toEqual([0, 1, 2, 3]);
    expect(out.textLabels.find(l => l.id === 'unselected')?.visibleLevels).toBeUndefined();
  });

  it('updates lists exactly what was written, objects first then labels', () => {
    const lab = label({ id: 'lab', homeLevel: 2 });
    const out = setSelectionVisibleLevels(
      { objects: layer.objects, textLabels: [lab] },
      [sel('text', 'lab'), sel('object', 'pinned')],
      { kind: 'level', level: 1, on: true },
      MAX
    );
    expect(out.updates).toEqual([
      { id: 'pinned', visibleLevels: out.objects.find(o => o.id === 'pinned')?.visibleLevels },
      { id: 'lab', visibleLevels: out.textLabels[0].visibleLevels },
    ]);
    expect(out.updates[0].visibleLevels).toEqual([1, 3]);
  });
});
