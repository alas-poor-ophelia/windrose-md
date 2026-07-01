/**
 * scatterBrush Unit Tests
 *
 * Deterministic via injected RNG: spacing math and per-drop jitter bounds
 * (position, scale, legal rotation steps, flip).
 */

import { describe, it, expect } from 'vitest';
import {
  scatterSpacing,
  makeScatterDrop,
  SCATTER_SPACING_CELLS,
  SCATTER_POS_JITTER_CELLS,
  SCATTER_SCALE_MIN,
  SCATTER_SCALE_MAX,
  GRID_ROTATIONS,
  HEX_ROTATIONS,
} from '../../../src/drawing/scatterBrush';
import type { ScatterParams } from '../../../src/drawing/scatterBrush';

/** RNG that replays a fixed sequence (wraps around). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function params(over?: Partial<ScatterParams>): ScatterParams {
  return { cellSize: 100, tileScale: 1, isHex: false, rng: seqRng([0.5]), ...over };
}

describe('scatterSpacing', () => {
  it('scales with cell size and tile scale', () => {
    expect(scatterSpacing(100, 1)).toBeCloseTo(SCATTER_SPACING_CELLS * 100);
    expect(scatterSpacing(100, 2)).toBeCloseTo(SCATTER_SPACING_CELLS * 200);
  });

  it('clamps tiny tile scales so drops never machine-gun', () => {
    expect(scatterSpacing(100, 0.01)).toBeCloseTo(SCATTER_SPACING_CELLS * 100 * 0.25);
  });
});

describe('makeScatterDrop', () => {
  it('rng 0.5 everywhere = no positional jitter, mid scale', () => {
    const drop = makeScatterDrop(50, 60, params());
    expect(drop.worldX).toBeCloseTo(50);
    expect(drop.worldY).toBeCloseTo(60);
    expect(drop.scale).toBeCloseTo((SCATTER_SCALE_MIN + SCATTER_SCALE_MAX) / 2);
    expect(drop.flipH).toBe(false); // 0.5 is not < 0.5
  });

  it('position jitter stays within ±0.25 cell at the RNG extremes', () => {
    const lo = makeScatterDrop(0, 0, params({ rng: seqRng([0]) }));
    expect(lo.worldX).toBeCloseTo(-SCATTER_POS_JITTER_CELLS * 100);
    expect(lo.worldY).toBeCloseTo(-SCATTER_POS_JITTER_CELLS * 100);

    const hi = makeScatterDrop(0, 0, params({ rng: seqRng([0.999999]) }));
    expect(Math.abs(hi.worldX)).toBeLessThanOrEqual(SCATTER_POS_JITTER_CELLS * 100);
    expect(Math.abs(hi.worldY)).toBeLessThanOrEqual(SCATTER_POS_JITTER_CELLS * 100);
  });

  it('scale jitter multiplies around the brush tileScale within [0.8, 1.2]', () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
      const drop = makeScatterDrop(0, 0, params({ tileScale: 2, rng: seqRng([r]) }));
      expect(drop.scale).toBeGreaterThanOrEqual(SCATTER_SCALE_MIN * 2);
      expect(drop.scale).toBeLessThanOrEqual(SCATTER_SCALE_MAX * 2);
    }
  });

  it('grid rotation jitter picks only 90° steps', () => {
    for (const r of [0, 0.3, 0.6, 0.9]) {
      const drop = makeScatterDrop(0, 0, params({ rng: seqRng([0.5, 0.5, 0.5, r, 0.5]) }));
      expect(GRID_ROTATIONS).toContain(drop.rotation);
    }
  });

  it('hex rotation jitter picks only 60° steps', () => {
    for (const r of [0, 0.2, 0.4, 0.6, 0.8, 0.99]) {
      const drop = makeScatterDrop(0, 0, params({ isHex: true, rng: seqRng([0.5, 0.5, 0.5, r, 0.5]) }));
      expect(HEX_ROTATIONS).toContain(drop.rotation);
    }
  });

  it('flips roughly half the time at the boundary', () => {
    expect(makeScatterDrop(0, 0, params({ rng: seqRng([0.5, 0.5, 0.5, 0.5, 0.49]) })).flipH).toBe(true);
    expect(makeScatterDrop(0, 0, params({ rng: seqRng([0.5, 0.5, 0.5, 0.5, 0.51]) })).flipH).toBe(false);
  });

  it('consumes rng in a stable order (pos x, pos y, scale, rotation, flip)', () => {
    const drop = makeScatterDrop(0, 0, params({ rng: seqRng([0, 1, 0, 0, 0.9]) }));
    expect(drop.worldX).toBeCloseTo(-25); // first draw → x low
    expect(drop.worldY).toBeCloseTo(25); // second draw → y high (1 wraps? no: literal 1)
    expect(drop.scale).toBeCloseTo(SCATTER_SCALE_MIN); // third draw → min scale
    expect(drop.rotation).toBe(0); // fourth draw → first step
    expect(drop.flipH).toBe(false); // fifth draw 0.9 → no flip
  });
});
