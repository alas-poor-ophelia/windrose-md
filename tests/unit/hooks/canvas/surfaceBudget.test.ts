/**
 * Global byte budget with LRU across canvases (design section 3.5).
 *
 * The registry is module global, so every test resets it first. Canvases are
 * plain objects cast to HTMLCanvasElement: the budget only ever uses them as
 * weak identity keys, never as canvases.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Platform } from 'obsidian';

import {
  budgetBytes,
  currentBytes,
  peakBytes,
  resetPeak,
  registerSurface,
  touchSurface,
  releaseSurface,
  setActiveCanvas,
  evictIfNeeded,
  snapshot,
  resetSurfaceBudget,
} from '../../../../src/hooks/canvas/surfaceBudget';

const MIB = 1024 * 1024;

/** One padded surface at a 1200x800 viewport: 2400x1600x4 = 15.36 MB. */
const SURFACE_BYTES = 2400 * 1600 * 4;

function makeCanvas(): HTMLCanvasElement {
  return {} as HTMLCanvasElement;
}

const platformFlags = Platform as unknown as { isIosApp: boolean };

beforeEach(() => {
  resetSurfaceBudget();
  platformFlags.isIosApp = false;
});

afterEach(() => {
  platformFlags.isIosApp = false;
});

describe('surfaceBudget accounting', () => {
  it('registers, resizes and releases bytes', () => {
    const canvas = makeCanvas();
    expect(currentBytes()).toBe(0);

    registerSurface(canvas, 0, 1000);
    expect(currentBytes()).toBe(1000);

    // Re-registering the same canvas+level is a resize, not a second surface.
    registerSurface(canvas, 0, 4000);
    expect(currentBytes()).toBe(4000);
    expect(snapshot().surfaces).toHaveLength(1);

    registerSurface(canvas, 1, 500);
    expect(currentBytes()).toBe(4500);

    releaseSurface(canvas, 0);
    expect(currentBytes()).toBe(500);
    releaseSurface(canvas, 1);
    expect(currentBytes()).toBe(0);
  });

  it('ignores touch and release for surfaces it does not hold', () => {
    const canvas = makeCanvas();
    releaseSurface(canvas, 0);
    touchSurface(canvas, 0);
    expect(currentBytes()).toBe(0);

    registerSurface(canvas, 0, 100);
    releaseSurface(canvas, 3);
    touchSurface(canvas, 3);
    expect(currentBytes()).toBe(100);
  });

  it('tracks a peak that only a release lowers via resetPeak', () => {
    const canvas = makeCanvas();
    registerSurface(canvas, 0, 3000);
    registerSurface(canvas, 1, 2000);
    expect(peakBytes()).toBe(5000);

    releaseSurface(canvas, 1);
    expect(currentBytes()).toBe(3000);
    expect(peakBytes()).toBe(5000);

    resetPeak();
    expect(peakBytes()).toBe(3000);
  });
});

describe('budgetBytes', () => {
  it('is 96 MiB on desktop', () => {
    expect(budgetBytes()).toBe(96 * MIB);
  });

  it('is 32 MiB on iOS', () => {
    platformFlags.isIosApp = true;
    expect(budgetBytes()).toBe(32 * MIB);
    expect(snapshot().budgetBytes).toBe(32 * MIB);
  });

  it('does not evict two surfaces on desktop that it would on iOS', () => {
    const canvas = makeCanvas();
    setActiveCanvas(canvas);
    registerSurface(canvas, 0, SURFACE_BYTES);
    registerSurface(canvas, 1, SURFACE_BYTES);
    expect(evictIfNeeded()).toEqual([]);

    platformFlags.isIosApp = true;
    // 30.7 MB of surfaces is under the iOS budget too, but a third one is not —
    // and the active canvas is never taken below two.
    expect(evictIfNeeded()).toEqual([]);
    registerSurface(canvas, 2, SURFACE_BYTES);
    const plan = evictIfNeeded();
    expect(plan).toEqual([{ canvas, level: 0 }]);
  });
});

describe('evictIfNeeded order', () => {
  it('returns nothing while under budget', () => {
    const canvas = makeCanvas();
    registerSurface(canvas, 0, SURFACE_BYTES);
    expect(evictIfNeeded()).toEqual([]);
  });

  it('evicts background canvases before the active one, least recently used first', () => {
    const active = makeCanvas();
    const oldBackground = makeCanvas();
    const newBackground = makeCanvas();
    setActiveCanvas(active);

    // 7 x 15.36 MB = 107.5 MB, over the 96 MiB desktop budget.
    registerSurface(oldBackground, 0, SURFACE_BYTES);
    registerSurface(oldBackground, 1, SURFACE_BYTES);
    registerSurface(newBackground, 0, SURFACE_BYTES);
    registerSurface(newBackground, 1, SURFACE_BYTES);
    registerSurface(active, 0, SURFACE_BYTES);
    registerSurface(active, 1, SURFACE_BYTES);
    registerSurface(active, 2, SURFACE_BYTES);

    const plan = evictIfNeeded();
    // Only one surface has to go, and it is the oldest background one.
    expect(plan).toEqual([{ canvas: oldBackground, level: 0 }]);
  });

  it('a touch moves a background canvas to the back of the eviction queue', () => {
    const active = makeCanvas();
    const first = makeCanvas();
    const second = makeCanvas();
    setActiveCanvas(active);

    registerSurface(first, 0, SURFACE_BYTES);
    registerSurface(second, 0, SURFACE_BYTES);
    registerSurface(active, 0, SURFACE_BYTES * 5);
    touchSurface(first, 0);

    expect(evictIfNeeded()).toEqual([{ canvas: second, level: 0 }]);
  });

  it('drains every background canvas before touching the active canvas', () => {
    const active = makeCanvas();
    const background = makeCanvas();
    setActiveCanvas(active);

    registerSurface(background, 0, SURFACE_BYTES);
    registerSurface(background, 1, SURFACE_BYTES);
    registerSurface(active, 0, SURFACE_BYTES);
    registerSurface(active, 1, SURFACE_BYTES);
    registerSurface(active, 2, 80 * MIB);

    const plan = evictIfNeeded();
    expect(plan.slice(0, 2)).toEqual([
      { canvas: background, level: 0 },
      { canvas: background, level: 1 },
    ]);
    // Then the active canvas's LRU levels, but never below its guaranteed two.
    expect(plan.filter((victim) => victim.canvas === active)).toEqual([{ canvas: active, level: 0 }]);
  });

  it('never takes the active canvas below two surfaces, even when still over budget', () => {
    const active = makeCanvas();
    setActiveCanvas(active);
    registerSurface(active, 0, 200 * MIB);
    registerSurface(active, 1, 200 * MIB);

    expect(evictIfNeeded()).toEqual([]);
    expect(currentBytes()).toBeGreaterThan(budgetBytes());
  });

  it('evicts an unprotected canvas down to zero when no canvas is active', () => {
    const lonely = makeCanvas();
    registerSurface(lonely, 0, 60 * MIB);
    registerSurface(lonely, 1, 60 * MIB);

    expect(evictIfNeeded()).toEqual([{ canvas: lonely, level: 0 }]);
  });

  it('does not report a plan the caller already carried out', () => {
    const active = makeCanvas();
    const background = makeCanvas();
    setActiveCanvas(active);
    registerSurface(background, 0, 60 * MIB);
    registerSurface(active, 0, 60 * MIB);

    const plan = evictIfNeeded();
    expect(plan).toEqual([{ canvas: background, level: 0 }]);
    for (const victim of plan) releaseSurface(victim.canvas, victim.level);
    expect(evictIfNeeded()).toEqual([]);
  });
});

describe('snapshot', () => {
  it('reports counters, the budget and one entry per surface without leaking canvases', () => {
    const active = makeCanvas();
    const background = makeCanvas();
    setActiveCanvas(active);
    registerSurface(active, 0, 1000);
    registerSurface(active, 1, 2000);
    registerSurface(background, 0, 3000);

    const shot = snapshot();
    expect(shot.currentBytes).toBe(6000);
    expect(shot.peakBytes).toBe(6000);
    expect(shot.budgetBytes).toBe(96 * MIB);
    expect(shot.activeCanvasId).toBeGreaterThan(0);
    expect(shot.surfaces).toHaveLength(3);

    const entry = shot.surfaces[0];
    expect(Object.keys(entry).sort()).toEqual(
      ['active', 'alive', 'bytes', 'canvasId', 'lastUsed', 'level'].sort()
    );
    expect(entry.alive).toBe(true);
    expect(entry.active).toBe(true);
    expect(entry.canvasId).toBe(shot.activeCanvasId);

    const backgroundEntry = shot.surfaces[2];
    expect(backgroundEntry.active).toBe(false);
    expect(backgroundEntry.bytes).toBe(3000);
    expect(backgroundEntry.lastUsed).toBeGreaterThan(entry.lastUsed);
  });

  it('lists surfaces in LRU order, oldest first', () => {
    const canvas = makeCanvas();
    registerSurface(canvas, 0, 10);
    registerSurface(canvas, 1, 20);
    touchSurface(canvas, 0);

    expect(snapshot().surfaces.map((surface) => surface.level)).toEqual([1, 0]);
  });
});
