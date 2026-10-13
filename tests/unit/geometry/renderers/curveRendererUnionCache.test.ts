import { describe, it, expect, vi, beforeAll } from 'vitest';
import type { Curve } from '#types/core/curve.types';

// Union math is not under test here: return a fixed square multipolygon.
vi.mock('../../../../src/geometry/curves/curveBoolean', () => ({
  unionCurves: (): [number, number][][][] => [[[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]]],
}));

class FakePath2D {
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
}

beforeAll(() => {
  (globalThis as unknown as { Path2D: unknown }).Path2D = FakePath2D;
});

function square(id: string, x: number): Curve {
  return {
    id,
    start: [x, 0],
    segments: [[x, 0, x + 10, 0, x + 10, 0], [x + 10, 10, x, 10, x, 0]],
    closed: true,
    color: '#ff0000',
    opacity: 1,
    strokeColor: '#000000',
    strokeWidth: 1,
  } as unknown as Curve;
}

describe('curveRenderer union cache (MEM-03)', () => {
  it('stays bounded across many cluster membership changes', async () => {
    const { preprocessCurves, getUnionCacheSize, UNION_CACHE_MAX } =
      await import('../../../../src/geometry/renderers/curveRenderer');

    for (let gen = 0; gen < 300; gen++) {
      // Two overlapping closed curves with fresh ids each generation = a new cluster key
      const curves = [square(`a${gen}`, 0), square(`b${gen}`, 5)];
      const result = preprocessCurves(curves);
      expect(result.unionGroups).toHaveLength(1);
    }

    expect(getUnionCacheSize()).toBeLessThanOrEqual(UNION_CACHE_MAX);
    expect(getUnionCacheSize()).toBe(UNION_CACHE_MAX);
  });

  it('reuses a cached union while its curve refs are unchanged', async () => {
    const { preprocessCurves } = await import('../../../../src/geometry/renderers/curveRenderer');
    const a = square('keep-a', 0);
    const b = square('keep-b', 5);
    const first = preprocessCurves([a, b]);
    // New array identity (level-1 miss), same curve refs (level-2 hit)
    const second = preprocessCurves([a, b]);
    expect(second.unionGroups[0].path).toBe(first.unionGroups[0].path);
  });
});
