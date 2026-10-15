/**
 * Static-layer cache on rotated maps: mid-zoom frames must not scale-blit the
 * snapshot under the rotation transform (visibly soft); they draw directly and
 * one re-bake follows at the settled zoom. Unrotated maps keep the scale-blit.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { blitStaticContent, setStaticSettleCallback } from "../../../../src/geometry/renderers/staticLayerCache";

function fakeCtx() {
  return { save: vi.fn(), restore: vi.fn(), clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true };
}

describe("blitStaticContent rotation", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("window", globalThis);
    vi.stubGlobal("activeWindow", {
      createEl: () => {
        const octx = fakeCtx();
        return { width: 0, height: 0, getContext: () => octx };
      },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function run(north: number) {
    const canvas = {} as HTMLCanvasElement;
    const ctx = fakeCtx();
    const draw = vi.fn();
    const settle = vi.fn();
    setStaticSettleCallback(canvas, settle);
    const key = ["k"];
    const blit = (zoom: number) =>
      blitStaticContent(canvas, ctx as unknown as CanvasRenderingContext2D, draw, 0, 0, zoom, 800, 600, key, 1, north);
    return { ctx, draw, settle, blit };
  }

  it("rotated: mid-zoom draws directly (no soft blit) and re-bakes after settle", () => {
    const { ctx, draw, settle, blit } = run(30);
    blit(4); // initial bake into the offscreen
    expect(draw).toHaveBeenCalledTimes(1);
    expect(draw.mock.calls[0][5]).toBe(0); // offscreen is unrotated
    ctx.drawImage.mockClear();

    blit(4.4); // zoom step: inside the snapshot, but scale !== 1
    expect(draw).toHaveBeenCalledTimes(2);
    expect(draw.mock.calls[1][0]).toBe(ctx); // straight onto the live canvas
    expect(draw.mock.calls[1][5]).toBe(30); // culled for the rotation
    expect(ctx.drawImage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);
    expect(settle).toHaveBeenCalledTimes(1);
    blit(4.4); // settled: re-bake at the new zoom, then a 1:1 blit
    expect(draw).toHaveBeenCalledTimes(3);
    expect(draw.mock.calls[2][5]).toBe(0);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("unrotated: mid-zoom keeps the scale-blit from the snapshot", () => {
    const { ctx, draw, blit } = run(0);
    blit(4);
    ctx.drawImage.mockClear();
    blit(4.4);
    expect(draw).toHaveBeenCalledTimes(1);
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });
});
