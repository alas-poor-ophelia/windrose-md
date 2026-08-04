/**
 * isTrackpadPanWheel Unit Tests
 *
 * Tests the wheel-event heuristic that routes trackpad two-finger scrolls
 * to pan and mouse wheel notches to zoom.
 */

import { describe, it, expect } from "vitest";

import { isTrackpadPanWheel } from "../../../../src/hooks/canvas/useCanvasInteraction";

/** Minimal WheelEvent stand-in (jsdom-free unit env) */
function wheel(overrides: Partial<WheelEvent>): WheelEvent {
  return {
    deltaMode: 0, // DOM_DELTA_PIXEL
    deltaX: 0,
    deltaY: 0,
    ctrlKey: false,
    metaKey: false,
    ...overrides,
  } as WheelEvent;
}

describe("isTrackpadPanWheel", () => {
  it("treats line-mode deltas as mouse (zoom)", () => {
    expect(isTrackpadPanWheel(wheel({ deltaMode: 1, deltaY: 3 }))).toBe(false);
  });

  it("treats page-mode deltas as mouse (zoom)", () => {
    expect(isTrackpadPanWheel(wheel({ deltaMode: 2, deltaY: 1 }))).toBe(false);
  });

  it("treats any horizontal component as trackpad (pan)", () => {
    expect(isTrackpadPanWheel(wheel({ deltaX: 4, deltaY: 2 }))).toBe(true);
    expect(isTrackpadPanWheel(wheel({ deltaX: -12, deltaY: 180 }))).toBe(true);
  });

  it("treats small vertical pixel deltas as trackpad (pan)", () => {
    expect(isTrackpadPanWheel(wheel({ deltaY: 4 }))).toBe(true);
    expect(isTrackpadPanWheel(wheel({ deltaY: -18 }))).toBe(true);
    expect(isTrackpadPanWheel(wheel({ deltaY: 49 }))).toBe(true);
  });

  it("treats large quantized vertical deltas as mouse notches (zoom)", () => {
    expect(isTrackpadPanWheel(wheel({ deltaY: 100 }))).toBe(false);
    expect(isTrackpadPanWheel(wheel({ deltaY: -100 }))).toBe(false);
    expect(isTrackpadPanWheel(wheel({ deltaY: 120 }))).toBe(false);
  });
});
