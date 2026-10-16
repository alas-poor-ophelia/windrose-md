/**
 * Static-layer cache lifecycle for the lattice ladder, against the real cache:
 * a crossing frame (first frame at a new level) never bakes synchronously, a
 * bake frees the canvas's other levels whose key went stale, the per-canvas and
 * global budgets evict in order, and dispose returns the registry to zero.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Platform } from "obsidian";

import {
  blitStaticContent,
  computeStaticPad,
  releaseStaticLayerCache,
  setStaticSettleCallback,
  staticKeysEqual,
} from "../../../../src/geometry/renderers/staticLayerCache";
import {
  currentBytes,
  maxSurfacePixels,
  resetSurfaceBudget,
  setActiveCanvas,
  snapshot,
  SURFACE_BYTES_PER_PX,
} from "../../../../src/geometry/renderers/surfaceBudget";
import { ladderTileClipKnob } from "../../../../src/geometry/renderers/mapRenderer";

const platformFlags = Platform as unknown as { isIosApp: boolean };

function fakeCtx() {
  return { save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true };
}

let ladderKnobs: { tileClip?: unknown } | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetSurfaceBudget();
  platformFlags.isIosApp = false;
  ladderKnobs = undefined;
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("activeWindow", {
    createEl: () => {
      const octx = fakeCtx();
      return { width: 0, height: 0, getContext: () => octx };
    },
    get __windroseLadder() {
      return ladderKnobs;
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  platformFlags.isIosApp = false;
});

const W = 800;
const H = 600;

/** One ladder canvas driven through blitStaticContent like mapRenderer does. */
function ladderCanvas(width = W, height = H) {
  const canvas = {} as HTMLCanvasElement;
  const ctx = fakeCtx();
  const draw = vi.fn();
  setStaticSettleCallback(canvas, () => undefined);
  const frame = (level: number, zoom: number, key: readonly unknown[]) =>
    blitStaticContent(canvas, ctx as unknown as CanvasRenderingContext2D, draw, 0, 0, zoom, width, height, key, 1, 0, level, true);
  /** A settled frame: let the settle timer fire, then render again. */
  const settle = (level: number, zoom: number, key: readonly unknown[]) => {
    vi.advanceTimersByTime(200);
    frame(level, zoom, key);
  };
  const levels = () => snapshot().surfaces.filter((s) => s.alive).map((s) => s.level);
  return { canvas, ctx, draw, frame, settle, levels };
}

describe("crossing frames never bake (MEM-03)", () => {
  it("bake L0, cross to L1, bake L1, change key, bake L1, cross back to L0: draw not called in the crossing frame", () => {
    const { ctx, draw, frame, settle, levels } = ladderCanvas();
    const keyA = ["a"];
    const keyB = ["b"];

    frame(0, 1, keyA); // first mount: the one legitimate synchronous bake
    expect(draw).toHaveBeenCalledTimes(1);

    frame(1, 1.2, keyA); // crossing L0 -> L1: drift from L0
    expect(draw).toHaveBeenCalledTimes(1);

    settle(1, 1.2, keyA); // settle bakes L1
    expect(draw).toHaveBeenCalledTimes(2);

    frame(1, 1.2, keyB); // paint at L1: new key, own surface re-bakes
    expect(draw).toHaveBeenCalledTimes(3);
    // L0 was baked under the old key and can never be blitted again: freed.
    expect(levels()).toEqual([1]);

    ctx.drawImage.mockClear();
    frame(0, 1, keyB); // zoom back out: crossing into L0
    expect(draw).toHaveBeenCalledTimes(3);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1); // the finer L1 surface, scaled

    settle(0, 1, keyB); // and the crisp L0 bake waits for settle
    expect(draw).toHaveBeenCalledTimes(4);
  });

  it("a crossing into a level whose own surface was stamped stale by a settle drifts instead of baking", () => {
    const { draw, frame, settle } = ladderCanvas();
    const key = ["a"];
    frame(1, 1, key);
    frame(2, 1.2, key); // crossing, drift from L1
    settle(2, 1.2, key); // L1 and L2 both cached under the live key
    expect(draw).toHaveBeenCalledTimes(2);

    frame(1, 1.1, key); // crossing back to L1: its own surface scale-blits
    vi.advanceTimersByTime(200); // the settle stamps L1 stale and asks for a bake
    frame(2, 1.2, key); // but the user has already zoomed back in to L2
    expect(draw).toHaveBeenCalledTimes(2);

    frame(1, 1.1, key); // crossing to L1 again: own surface stale, L2 still fits
    expect(draw).toHaveBeenCalledTimes(2);
    settle(1, 1.1, key); // the crisp L1 bake happens at settle instead
    expect(draw).toHaveBeenCalledTimes(3);
  });

  it("outside a crossing a level that owns a surface still bakes rather than drifting", () => {
    const { draw, frame, settle } = ladderCanvas();
    frame(0, 1, ["a"]);
    frame(1, 1.2, ["a"]);
    settle(1, 1.2, ["a"]);
    expect(draw).toHaveBeenCalledTimes(2);
    frame(1, 1.2, ["b"]); // same level, new key: the rung's paint must show now
    expect(draw).toHaveBeenCalledTimes(3);
  });
});

describe("drift-then-bake lifecycle with eviction (TEST-10)", () => {
  it("bakes L1, L2, L3 under the iOS budget: evicts in order, serves the coarser fallback, disposes to zero", () => {
    platformFlags.isIosApp = true;
    const background = ladderCanvas(1400, 1000);
    const active = ladderCanvas(1400, 1000);
    setActiveCanvas(active.canvas);
    const key = ["k"];

    background.frame(0, 1, key);
    const bgId = snapshot().surfaces[0].canvasId;
    expect(currentBytes()).toBeGreaterThan(0);

    active.frame(1, 1, key); // first bake of the active canvas
    // Each surface obeys the per-surface cap.
    for (const s of snapshot().surfaces) expect(s.bytes).toBeLessThanOrEqual(maxSurfacePixels() * SURFACE_BYTES_PER_PX);

    active.frame(2, 1.2, key); // crossing: drift from L1, no bake
    expect(active.draw).toHaveBeenCalledTimes(1);
    active.settle(2, 1.2, key); // L2 baked: the active canvas now holds two
    expect(active.draw).toHaveBeenCalledTimes(2);
    // Over the 32 MiB budget: the background canvas went first, to zero.
    expect(snapshot().surfaces.some((s) => s.canvasId === bgId)).toBe(false);
    expect(active.levels()).toEqual([1, 2]);
    expect(currentBytes()).toBeLessThanOrEqual(32 * 1024 * 1024);

    active.frame(3, 1.44, key); // crossing: drift from L2 (nearest coarser)
    expect(active.draw).toHaveBeenCalledTimes(2);
    active.ctx.drawImage.mockClear();
    active.settle(3, 1.44, key); // L3 baked: the per-canvas cap drops LRU L1
    expect(active.draw).toHaveBeenCalledTimes(3);
    expect(active.levels()).toEqual([2, 3]);

    // Zoom back out to L1, which was evicted and has nothing coarser left: the
    // finer L2 drift source covers the crossing frame.
    active.ctx.drawImage.mockClear();
    active.frame(1, 1.1, key);
    expect(active.draw).toHaveBeenCalledTimes(3);
    expect(active.ctx.drawImage).toHaveBeenCalledTimes(1);

    // And a zoom-in crossing to L4 is served by the coarser L3 surface.
    active.frame(3, 1.44, key);
    active.ctx.drawImage.mockClear();
    active.frame(4, 1.7, key);
    expect(active.draw).toHaveBeenCalledTimes(3);
    expect(active.ctx.drawImage).toHaveBeenCalledTimes(1);

    releaseStaticLayerCache(active.canvas);
    releaseStaticLayerCache(background.canvas);
    expect(currentBytes()).toBe(0);
    expect(snapshot().surfaces).toHaveLength(0);
  });

  it("classic canvases register uncounted and leave the registry on dispose", () => {
    const canvas = {} as HTMLCanvasElement;
    const draw = vi.fn();
    blitStaticContent(canvas, fakeCtx() as unknown as CanvasRenderingContext2D, draw, 0, 0, 1, W, H, ["c"], 1);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(currentBytes()).toBe(0);
    expect(snapshot().uncountedBytes).toBeGreaterThan(0);
    expect(snapshot().surfaces[0].counted).toBe(false);
    releaseStaticLayerCache(canvas);
    expect(snapshot().uncountedBytes).toBe(0);
  });
});

describe("per-surface pad cap (MEM-05)", () => {
  it("a budgeted cap shrinks the pad; the unbudgeted call is unchanged", () => {
    const full = computeStaticPad(1400, 1000, 0)!;
    expect(full).toEqual({ padX: 700, padY: 500 });
    platformFlags.isIosApp = true;
    const capped = computeStaticPad(1400, 1000, 0, maxSurfacePixels())!;
    expect((1400 + 2 * capped.padX) * (1000 + 2 * capped.padY)).toBeLessThanOrEqual(maxSurfacePixels());
  });
});

describe("static key carries the tile-clip knob (MEM-08)", () => {
  it("knob change makes staticKeysEqual false", () => {
    const shared = { layers: [] };
    const before = [shared, ladderTileClipKnob()];
    expect(before[1]).toBeNull();
    ladderKnobs = { tileClip: "rungs" };
    const after = [shared, ladderTileClipKnob()];
    expect(staticKeysEqual(before, after)).toBe(false);
    expect(staticKeysEqual(after, [shared, ladderTileClipKnob()])).toBe(true);
  });
});
