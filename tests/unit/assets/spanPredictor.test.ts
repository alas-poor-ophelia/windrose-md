import { describe, it, expect } from 'vitest';
import { predictSpan, SPAN_PROMOTE_RATIO, DEFAULT_PIXELS_PER_CELL } from '../../../src/assets/spanPredictor';
import { MAX_TILE_SPAN } from '../../../src/assets/tileRenderResolution';

describe('predictSpan', () => {
  const PPC = DEFAULT_PIXELS_PER_CELL; // 256

  it('defaults to 1x1 for a single-cell prop authored under one cell', () => {
    // 200px source inside a 256px authoring cell → ratio 0.78 → no promotion
    expect(predictSpan(200, 200, PPC)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('keeps span 1 for a prop only marginally larger than one cell', () => {
    // ratio 1.3 is below the promote threshold — the case that regressed to 2x2
    expect(predictSpan(Math.round(PPC * 1.3), 200, PPC)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('keeps a 315px prop at 1x1 (the 8-cell-chair regression)', () => {
    // 315/256 = 1.23 → under threshold → stays 1; the original bug divided by a
    // sampled sibling width and promoted this to 2x2.
    expect(predictSpan(315, 315, PPC)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('promotes a clearly two-cell-wide prop to span 2 in that axis only', () => {
    expect(predictSpan(512, 240, PPC)).toEqual({ spanW: 2, spanH: 1 });
  });

  it('handles non-square footprints independently per axis', () => {
    expect(predictSpan(256, 768, PPC)).toEqual({ spanW: 1, spanH: 3 });
  });

  it('rounds to nearest cell count', () => {
    // 2.6 cells → 3
    expect(predictSpan(Math.round(PPC * 2.6), Math.round(PPC * 2.6), PPC))
      .toEqual({ spanW: 3, spanH: 3 });
  });

  it('promotion boundary: ~1.4 stays 1, ~1.5 becomes 2', () => {
    expect(predictSpan(Math.round(PPC * SPAN_PROMOTE_RATIO), 10, PPC).spanW).toBe(1);
    expect(predictSpan(Math.round(PPC * 1.5), 10, PPC).spanW).toBe(2);
  });

  it('caps span at MAX_TILE_SPAN', () => {
    expect(predictSpan(PPC * 50, PPC * 50, PPC))
      .toEqual({ spanW: MAX_TILE_SPAN, spanH: MAX_TILE_SPAN });
  });

  it('returns 1 for zero / negative / missing dimensions', () => {
    expect(predictSpan(0, 0, PPC)).toEqual({ spanW: 1, spanH: 1 });
    expect(predictSpan(512, 512, 0)).toEqual({ spanW: 1, spanH: 1 });
    expect(predictSpan(-100, -100, PPC)).toEqual({ spanW: 1, spanH: 1 });
  });

  it('respects a non-standard authoring resolution (deviating pack, 110px/cell)', () => {
    // 220px source at 110px/cell = 2 cells; at the 256 default it would be 1.
    expect(predictSpan(220, 220, 110)).toEqual({ spanW: 2, spanH: 2 });
    expect(predictSpan(220, 220, PPC)).toEqual({ spanW: 1, spanH: 1 });
  });
});
