/**
 * cloneLayer regenerates entity ids (DATA-17) and copies wall paths and
 * terrain strokes (MEM-23).
 */

import { describe, it, expect } from 'vitest';

import { cloneLayer } from '../../../src/persistence/layerAccessor';
import { createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData, MapLayer } from '../../../types/core/map.types';

function sourceMap(): MapData {
  const map = createNewMap('Clone', 'grid');
  const layer = map.layers[0];
  Object.assign(layer, {
    id: 'src',
    objects: [{ id: 'obj-a', type: 'chest', position: { x: 0, y: 0 } }],
    textLabels: [{ id: 'text-a', content: 'hi', position: { x: 0, y: 0 } }],
    curves: [{ id: 'curve-a', start: [0, 0], segments: [] }],
    edges: [{ id: 'edge-a', x: 0, y: 0, side: 'right', color: '#000' }, { x: 1, y: 1, side: 'bottom', color: '#000' }],
    wallPaths: [{
      id: 'wall-a', tilesetId: 'ts', tileId: 'w', vertices: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
      gaps: [{ id: 'gap-a', seg: 0, t: 0.5, widthCells: 1 }],
    }],
    terrainStrokes: [{ id: 'tstroke-a', points: [0, 0, 5, 5], radius: 3, tilesetId: 'ts', tileId: 't' }],
  } as unknown as Partial<MapLayer>);
  map.activeLayerId = 'src';
  return map;
}

function cloneOf(map: MapData, mode: 'all' | 'mapOnly'): MapLayer {
  const next = cloneLayer(map, 'src', mode);
  return next.layers.find(l => l.id === next.activeLayerId) as MapLayer;
}

describe('cloneLayer ids and coverage', () => {
  it("mode 'all' gives every entity a fresh id with the same prefix and content", () => {
    const map = sourceMap();
    const clone = cloneOf(map, 'all');

    expect(clone.objects[0].id).not.toBe('obj-a');
    expect(clone.objects[0].id.startsWith('obj-')).toBe(true);
    expect(clone.textLabels[0].id).not.toBe('text-a');
    expect(clone.textLabels[0].id.startsWith('text-')).toBe(true);
    expect(clone.curves[0].id).not.toBe('curve-a');
    expect(clone.edges[0].id).not.toBe('edge-a');
    // An id-less edge stays id-less.
    expect(clone.edges[1].id).toBeUndefined();
    expect(clone.objects[0].type).toBe('chest');
  });

  it('copies wall paths (with fresh wall and gap ids) and terrain strokes in both modes', () => {
    for (const mode of ['all', 'mapOnly'] as const) {
      const clone = cloneOf(sourceMap(), mode);
      expect(clone.wallPaths).toHaveLength(1);
      expect(clone.wallPaths?.[0].id).not.toBe('wall-a');
      expect(clone.wallPaths?.[0].vertices).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }]);
      expect(clone.wallPaths?.[0].gaps?.[0].id).not.toBe('gap-a');
      expect(clone.wallPaths?.[0].gaps?.[0].t).toBe(0.5);
      expect(clone.terrainStrokes).toHaveLength(1);
      expect(clone.terrainStrokes?.[0].id).not.toBe('tstroke-a');
      expect(clone.terrainStrokes?.[0].radius).toBe(3);
    }
  });

  it('leaves the source layer untouched', () => {
    const map = sourceMap();
    const before = JSON.stringify(map.layers[0]);
    cloneOf(map, 'all');
    expect(JSON.stringify(map.layers[0])).toBe(before);
  });
});

describe('cloneLayer object links (Parallax follow-up)', () => {
  function linkedMap(): MapData {
    const map = sourceMap();
    const other = { ...map.layers[0], id: 'other', order: 5, objects: [] } as MapLayer;
    map.layers[0].objects = [
      { id: 'obj-a', type: 'door', position: { x: 0, y: 0 }, layerId: 'src', linkedObject: { layerId: 'src', objectId: 'obj-b', position: { x: 1, y: 1 } } },
      { id: 'obj-b', type: 'door', position: { x: 1, y: 1 }, linkedObject: { layerId: 'src', objectId: 'obj-a', position: { x: 0, y: 0 } } },
      { id: 'obj-c', type: 'stairs', position: { x: 2, y: 2 }, linkedObject: { layerId: 'other', objectId: 'obj-z', position: { x: 0, y: 0 } } },
    ] as unknown as MapLayer['objects'];
    other.objects = [
      { id: 'obj-z', type: 'stairs', position: { x: 0, y: 0 }, linkedObject: { layerId: 'src', objectId: 'obj-c', position: { x: 2, y: 2 } } },
    ] as unknown as MapLayer['objects'];
    map.layers.push(other);
    return map;
  }

  it('remaps links inside the source layer to the cloned partners', () => {
    const clone = cloneOf(linkedMap(), 'all');
    const [a, b] = clone.objects;
    expect(a.linkedObject).toMatchObject({ layerId: clone.id, objectId: b.id });
    expect(b.linkedObject).toMatchObject({ layerId: clone.id, objectId: a.id });
    expect(a.layerId).toBe(clone.id);
  });

  it('drops links to another layer and leaves the original pair intact', () => {
    const map = linkedMap();
    const next = cloneLayer(map, 'src', 'all');
    const clone = next.layers.find(l => l.id === next.activeLayerId) as MapLayer;
    expect(clone.objects[2].linkedObject).toBeUndefined();
    const z = (next.layers.find(l => l.id === 'other') as MapLayer).objects[0];
    expect(z.linkedObject).toMatchObject({ layerId: 'src', objectId: 'obj-c' });
    const c = (next.layers.find(l => l.id === 'src') as MapLayer).objects[2];
    expect(c.linkedObject).toMatchObject({ layerId: 'other', objectId: 'obj-z' });
  });
});
