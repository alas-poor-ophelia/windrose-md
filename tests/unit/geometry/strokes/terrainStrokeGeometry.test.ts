/**
 * terrainStrokeGeometry Unit Tests
 *
 * Pure stroke math: pointer thinning, commit simplification, capsule bounds,
 * and polyline distance (erase hit test).
 */

import { describe, it, expect } from 'vitest';
import {
  appendPointIfFar,
  finalizeStrokePoints,
  strokeBoundsWorld,
  distancePointToPolyline,
  MAX_STROKE_POINTS,
} from '../../../../src/geometry/strokes/terrainStrokeGeometry';
import { computeRegionPatternTransform } from '../../../../src/geometry/renderers/tileRenderer';
import type { TerrainStroke } from '../../../../types/core/terrainstroke.types';

function stroke(points: number[], radius = 40): TerrainStroke {
  return { id: 's', points, radius, tilesetId: 'ts', tileId: 't' };
}

describe('appendPointIfFar', () => {
  it('always appends the first point', () => {
    const pts: number[] = [];
    expect(appendPointIfFar(pts, 5, 6, 10)).toBe(true);
    expect(pts).toEqual([5, 6]);
  });

  it('rejects points closer than minDist to the last point', () => {
    const pts = [0, 0];
    expect(appendPointIfFar(pts, 3, 4, 10)).toBe(false); // dist 5 < 10
    expect(pts).toEqual([0, 0]);
  });

  it('appends points at or beyond minDist', () => {
    const pts = [0, 0];
    expect(appendPointIfFar(pts, 6, 8, 10)).toBe(true); // dist 10
    expect(pts).toEqual([0, 0, 6, 8]);
  });

  it('stops appending at the point cap', () => {
    const pts: number[] = [];
    for (let i = 0; i < MAX_STROKE_POINTS; i++) pts.push(i * 100, 0);
    expect(appendPointIfFar(pts, 1e9, 0, 1)).toBe(false);
    expect(pts.length).toBe(MAX_STROKE_POINTS * 2);
  });
});

describe('finalizeStrokePoints', () => {
  it('passes a single point through (dab)', () => {
    expect(finalizeStrokePoints([7, 9], 5)).toEqual([7, 9]);
  });

  it('collapses consecutive duplicates', () => {
    expect(finalizeStrokePoints([0, 0, 0, 0, 10, 0], 0.01)).toEqual([0, 0, 10, 0]);
  });

  it('removes collinear interior points via RDP', () => {
    const out = finalizeStrokePoints([0, 0, 25, 0.01, 50, 0, 75, -0.01, 100, 0], 1);
    expect(out).toEqual([0, 0, 100, 0]);
  });

  it('preserves endpoints and significant corners', () => {
    const out = finalizeStrokePoints([0, 0, 50, 0, 50, 50], 1);
    expect(out.slice(0, 2)).toEqual([0, 0]);
    expect(out.slice(-2)).toEqual([50, 50]);
    expect(out).toContain(50);
    expect(out.length).toBe(6); // the corner survives
  });

  it('returns an even-length flat array', () => {
    const out = finalizeStrokePoints([0, 0, 3, 3, 6, 6, 9, 9, 40, 80], 0.5);
    expect(out.length % 2).toBe(0);
  });
});

describe('strokeBoundsWorld', () => {
  it('pads the point bbox by the radius on every side', () => {
    const b = strokeBoundsWorld(stroke([10, 20, 110, 220], 15));
    expect(b).toEqual({ minX: -5, minY: 5, maxX: 125, maxY: 235 });
  });

  it('single-point stroke bounds are a radius square', () => {
    const b = strokeBoundsWorld(stroke([0, 0], 30));
    expect(b).toEqual({ minX: -30, minY: -30, maxX: 30, maxY: 30 });
  });
});

describe('distancePointToPolyline', () => {
  it('measures perpendicular distance to a segment interior', () => {
    expect(distancePointToPolyline(50, 30, [0, 0, 100, 0])).toBeCloseTo(30);
  });

  it('measures to the endpoint beyond the segment (round cap region)', () => {
    expect(distancePointToPolyline(130, 40, [0, 0, 100, 0])).toBeCloseTo(50); // 30-40-50 triangle
  });

  it('single-point polyline measures to the point', () => {
    expect(distancePointToPolyline(3, 4, [0, 0])).toBeCloseTo(5);
  });

  it('multi-segment takes the nearest segment', () => {
    const d = distancePointToPolyline(100, 10, [0, 0, 100, 0, 100, 100]);
    expect(d).toBeCloseTo(0); // lies on the vertical segment
  });

  it('empty points is infinitely far', () => {
    expect(distancePointToPolyline(0, 0, [])).toBe(Infinity);
  });
});

describe('pattern phase parity (strokes vs cell fills)', () => {
  it('identical inputs produce the identical world-anchored transform', () => {
    const a = computeRegionPatternTransform(512, 4, 24, 1.5, 100, 200);
    const b = computeRegionPatternTransform(512, 4, 24, 1.5, 100, 200);
    expect(a).toEqual(b);
    // Guard the seamless-merge invariant: the transform depends only on the
    // texture + terrain params + view, never on which shapes consume it.
    expect(a.scale).toBeCloseTo((1.5 * 4 * 24) / 512);
    expect(a.translateX).toBe(100);
    expect(a.translateY).toBe(200);
  });
});
