/**
 * Unit tests for shape-overlay load normalization.
 *
 * Rectangles (2.4.0) added per-axis half-extents and a rotation. Saves written
 * before that only carry the single `size` half-extent, so load must backfill
 * both axes from it and leave everything else alone. The fields are additive:
 * `size` stays populated so older builds still render the shape.
 */

import { describe, it, expect } from 'vitest';
import { migrateMapData, createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData, ShapeOverlay } from '../../../types/core/map.types';

function shape(over: Partial<ShapeOverlay> = {}): ShapeOverlay {
  return {
    id: 'shape-1',
    shape: 'square',
    worldPosition: { x: 100, y: 100 },
    size: 48,
    color: '#c4a57b',
    opacity: 0.4,
    freeform: false,
    visible: true,
    ...over
  };
}

function mapWithShapes(shapes: ShapeOverlay[]): MapData {
  const map = createNewMap('test', 'grid');
  map.shapeOverlays = shapes;
  return map;
}

describe('shape overlay load normalization', () => {
  it('backfills both half-extents from size on a pre-2.4.0 square', () => {
    const migrated = migrateMapData(mapWithShapes([shape()]));
    const s = migrated.shapeOverlays?.[0];
    expect(s?.halfWidth).toBe(48);
    expect(s?.halfHeight).toBe(48);
    expect(s?.size).toBe(48);
  });

  it('leaves an already-rectangular shape untouched', () => {
    const migrated = migrateMapData(mapWithShapes([shape({ size: 60, halfWidth: 60, halfHeight: 20 })]));
    const s = migrated.shapeOverlays?.[0];
    expect(s?.halfWidth).toBe(60);
    expect(s?.halfHeight).toBe(20);
  });

  it('replaces non-finite or non-positive half-extents with size', () => {
    const migrated = migrateMapData(mapWithShapes([
      shape({ halfWidth: Number.NaN, halfHeight: 0 })
    ]));
    const s = migrated.shapeOverlays?.[0];
    expect(s?.halfWidth).toBe(48);
    expect(s?.halfHeight).toBe(48);
  });

  it('backfills circles too, so the bounding box is always available', () => {
    const migrated = migrateMapData(mapWithShapes([shape({ shape: 'circle', size: 30 })]));
    const s = migrated.shapeOverlays?.[0];
    expect(s?.halfWidth).toBe(30);
    expect(s?.halfHeight).toBe(30);
  });

  it('keeps a valid rotation and drops a non-finite one', () => {
    const migrated = migrateMapData(mapWithShapes([
      shape({ id: 'keeps', rotation: 135 }),
      shape({ id: 'drops', rotation: Number.NaN })
    ]));
    expect(migrated.shapeOverlays?.[0].rotation).toBe(135);
    expect(migrated.shapeOverlays?.[1]).not.toHaveProperty('rotation');
  });

  it('normalizes sub-hex shape overlays as well', () => {
    const map = mapWithShapes([]);
    const sub = createNewMap('sub', 'grid');
    sub.shapeOverlays = [shape({ size: 16 })];
    map.subHexMaps = { '0,0': { mapData: sub } } as unknown as MapData['subHexMaps'];

    const migrated = migrateMapData(map);
    const s = migrated.subHexMaps?.['0,0'].mapData.shapeOverlays?.[0];
    expect(s?.halfWidth).toBe(16);
    expect(s?.halfHeight).toBe(16);
  });
});
