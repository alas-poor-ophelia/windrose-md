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
