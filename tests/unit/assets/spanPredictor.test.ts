import { describe, it, expect } from 'vitest';
import { predictSpan, SPAN_PROMOTE_RATIO } from '../../../src/assets/spanPredictor';
import { MAX_TILE_SPAN } from '../../../src/assets/tileRenderResolution';

describe('predictSpan', () => {
  const CELL = 256;

  it('defaults to 1x1 for a single-cell prop with padding (tight bounds stay <1)', () => {
    // 200px opaque content inside a 256px cell → ratio 0.78 → no promotion
    expect(predictSpan(200, 200, CELL, CELL)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('keeps span 1 for a prop only marginally larger than one cell', () => {
    // ratio 1.3 is below the promote threshold
    expect(predictSpan(Math.round(CELL * 1.3), 200, CELL, CELL)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('promotes a clearly two-cell-wide prop to span 2 in that axis only', () => {
    expect(predictSpan(512, 240, CELL, CELL)).toEqual({ spanW: 2, spanH: 1 });
  });

  it('handles non-square footprints independently per axis', () => {
    expect(predictSpan(256, 768, CELL, CELL)).toEqual({ spanW: 1, spanH: 3 });
  });

  it('rounds to nearest cell count', () => {
    // 2.6 cells → 3
    expect(predictSpan(Math.round(CELL * 2.6), Math.round(CELL * 2.6), CELL, CELL))
      .toEqual({ spanW: 3, spanH: 3 });
  });

  it('promotion boundary: ~1.4 stays 1, ~1.5 becomes 2', () => {
    expect(predictSpan(Math.round(CELL * SPAN_PROMOTE_RATIO), 10, CELL, CELL).spanW).toBe(1);
    expect(predictSpan(Math.round(CELL * 1.5), 10, CELL, CELL).spanW).toBe(2);
  });

  it('caps span at MAX_TILE_SPAN', () => {
    expect(predictSpan(CELL * 50, CELL * 50, CELL, CELL))
      .toEqual({ spanW: MAX_TILE_SPAN, spanH: MAX_TILE_SPAN });
  });

  it('returns 1 for zero / negative / missing dimensions', () => {
    expect(predictSpan(0, 0, CELL, CELL)).toEqual({ spanW: 1, spanH: 1 });
    expect(predictSpan(512, 512, 0, 0)).toEqual({ spanW: 1, spanH: 1 });
    expect(predictSpan(-100, -100, CELL, CELL)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('respects differing per-axis cell dimensions', () => {
    // wide cells (512) vs tall content: 512 opaque / 512 cell = 1 → span 1;
    // 512 opaque / 128 cell = 4 → span 4
    expect(predictSpan(512, 512, 512, 128)).toEqual({ spanW: 1, spanH: 4 });
  });
});
