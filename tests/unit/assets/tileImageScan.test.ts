import { describe, it, expect } from 'vitest';
import { analyzeAlphaPixels } from '../../../src/assets/tileImageScan';

/** Build RGBA data with the given opaque pixels set to `alpha`, rest transparent. */
function makeData(scanW: number, scanH: number, opaque: Array<[number, number]>, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(scanW * scanH * 4);
  for (const [x, y] of opaque) data[(y * scanW + x) * 4 + 3] = alpha;
  return data;
}

describe('analyzeAlphaPixels', () => {
  it('reports full coverage and full bounds for a fully opaque image', () => {
    const coords: Array<[number, number]> = [];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) coords.push([x, y]);
    const r = analyzeAlphaPixels(makeData(3, 2, coords), 3, 2);
    expect(r.alphaCoverage).toBe(1);
    expect(r.bounds).toEqual({ x: 0, y: 0, w: 3, h: 2 });
  });

  it('returns zero coverage and null bounds for a fully transparent image', () => {
    const r = analyzeAlphaPixels(makeData(4, 4, []), 4, 4);
    expect(r.alphaCoverage).toBe(0);
    expect(r.bounds).toBeNull();
  });

  it('finds a tight 1x1 box around a single opaque pixel', () => {
    const r = analyzeAlphaPixels(makeData(4, 4, [[2, 1]]), 4, 4);
    expect(r.alphaCoverage).toBeCloseTo(1 / 16, 6);
    expect(r.bounds).toEqual({ x: 2, y: 1, w: 1, h: 1 });
  });

  it('computes the bounding box spanning scattered opaque pixels', () => {
    // opaque at (1,1), (3,1), (1,3) -> box x1..3, y1..3
    const r = analyzeAlphaPixels(makeData(5, 5, [[1, 1], [3, 1], [1, 3]]), 5, 5);
    expect(r.bounds).toEqual({ x: 1, y: 1, w: 3, h: 3 });
    expect(r.alphaCoverage).toBeCloseTo(3 / 25, 6);
  });

  it('treats alpha at or below the threshold as transparent', () => {
    // default threshold 10: alpha=10 excluded, alpha=11 included
    expect(analyzeAlphaPixels(makeData(2, 2, [[0, 0]], 10), 2, 2).bounds).toBeNull();
    expect(analyzeAlphaPixels(makeData(2, 2, [[0, 0]], 11), 2, 2).bounds).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('handles a zero-size image without throwing', () => {
    const r = analyzeAlphaPixels(new Uint8ClampedArray(0), 0, 0);
    expect(r.alphaCoverage).toBe(0);
    expect(r.bounds).toBeNull();
  });
});
