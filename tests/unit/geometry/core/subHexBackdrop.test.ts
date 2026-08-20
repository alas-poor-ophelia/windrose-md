/**
 * subHexBackdrop Unit Tests
 *
 * Placement math for the parent-map snapshot drawn behind a sub-hex map.
 * Pure math with no dependencies.
 */

import { describe, it, expect } from "vitest";

import {
  computeBackdropPlacement,
} from "../../../../src/geometry/core/subHexBackdrop";
import type {
  BackdropView,
  SubHexBackdropCapture,
} from "../../../../src/geometry/core/subHexBackdrop";
import {
  subHexAnchorToChildCenter,
  subHexContinuityZoom,
} from "../../../../src/geometry/core/hexMeasurements";

// Shared scenario: flat-top parent hex at world (120, -80), 7-ring sub-grid,
// child inherits the parent's hex size — the shape every plugin-created
// sub-map has.
const PARENT_HEX_SIZE = 30;
const CHILD_HEX_SIZE = 30;
const RINGS = 7;
const ORIENTATION = "flat";
const HEX_CENTER = { x: 120, y: -80 };
const CANVAS = { width: 800, height: 600 };

/** Zoom ratio between a child view and its equivalent parent view. */
const RATIO = subHexContinuityZoom(1, PARENT_HEX_SIZE, CHILD_HEX_SIZE, RINGS);

function makeCapture(overrides: Partial<SubHexBackdropCapture> = {}): SubHexBackdropCapture {
  return {
    view: { zoom: 2, center: { x: 120, y: -80 } },
    canvasSize: { ...CANVAS },
    hexCenterWorld: { ...HEX_CENTER },
    parentHexSize: PARENT_HEX_SIZE,
    childHexSize: CHILD_HEX_SIZE,
    rings: RINGS,
    orientation: ORIENTATION,
    northDirection: 0,
    ...overrides,
  };
}

const TARGET = { ...CANVAS, northDirection: 0 };

/**
 * The child view a seamless dive opens at when the zoom anchor is the canvas
 * center: the sub-map occupies exactly the parent hex's screen footprint, and
 * the hex center stays at the canvas center.
 */
function continuityView(capture: SubHexBackdropCapture): BackdropView {
  const childCenter = subHexAnchorToChildCenter(
    capture.view.center.x - capture.hexCenterWorld.x,
    capture.view.center.y - capture.hexCenterWorld.y,
    capture.parentHexSize,
    capture.childHexSize,
    capture.rings
  );
  return {
    zoom: subHexContinuityZoom(capture.view.zoom, capture.parentHexSize, capture.childHexSize, capture.rings),
    center: childCenter,
  };
}

describe("subHexBackdrop", () => {
  // ===========================================================================
  // Identity: the dive moment
  // ===========================================================================

  describe("continuity view (the dive moment)", () => {
    it("reproduces the capture placement 1:1", () => {
      const capture = makeCapture();
      const placement = computeBackdropPlacement(continuityView(capture), capture, TARGET);

      expect(placement).not.toBeNull();
      expect(placement!.dx).toBeCloseTo(0, 6);
      expect(placement!.dy).toBeCloseTo(0, 6);
      expect(placement!.drawW).toBeCloseTo(CANVAS.width, 6);
      expect(placement!.drawH).toBeCloseTo(CANVAS.height, 6);
    });

    it("reproduces it at any parent zoom", () => {
      for (const zoom of [0.5, 1, 2.75, 4]) {
        const capture = makeCapture({ view: { zoom, center: { ...HEX_CENTER } } });
        const placement = computeBackdropPlacement(continuityView(capture), capture, TARGET);

        expect(placement).not.toBeNull();
        expect(placement!.dx).toBeCloseTo(0, 6);
        expect(placement!.dy).toBeCloseTo(0, 6);
        expect(placement!.drawW).toBeCloseTo(CANVAS.width, 6);
      }
    });

    it("offsets by the canvas-size delta when the pane resized since capture", () => {
      const capture = makeCapture();
      const placement = computeBackdropPlacement(continuityView(capture), capture, {
        width: 900,
        height: 700,
        northDirection: 0,
      });

      // Snapshot keeps its size; it re-centers on the larger canvas.
      expect(placement!.drawW).toBeCloseTo(CANVAS.width, 6);
      expect(placement!.drawH).toBeCloseTo(CANVAS.height, 6);
      expect(placement!.dx).toBeCloseTo((900 - CANVAS.width) / 2, 6);
      expect(placement!.dy).toBeCloseTo((700 - CANVAS.height) / 2, 6);
    });
  });

  // ===========================================================================
  // Zoom
  // ===========================================================================

  describe("zoom", () => {
    it("scales the snapshot up when the sub-map zooms in", () => {
      const capture = makeCapture();
      const base = continuityView(capture);
      const zoomedIn = { zoom: base.zoom * 3, center: { ...base.center } };

      const placement = computeBackdropPlacement(zoomedIn, capture, TARGET);

      expect(placement).not.toBeNull();
      expect(placement!.drawW).toBeCloseTo(CANVAS.width * 3, 6);
      expect(placement!.drawH).toBeCloseTo(CANVAS.height * 3, 6);
      // Grows about the canvas center, so the top-left moves up-left.
      expect(placement!.dx).toBeCloseTo(-CANVAS.width, 6);
      expect(placement!.dy).toBeCloseTo(-CANVAS.height, 6);
    });

    it("scales the snapshot down when the sub-map zooms out", () => {
      const capture = makeCapture();
      const base = continuityView(capture);
      const zoomedOut = { zoom: base.zoom / 2, center: { ...base.center } };

      const placement = computeBackdropPlacement(zoomedOut, capture, TARGET);

      expect(placement!.drawW).toBeCloseTo(CANVAS.width / 2, 6);
      expect(placement!.dx).toBeCloseTo(CANVAS.width / 4, 6);
      expect(placement!.dy).toBeCloseTo(CANVAS.height / 4, 6);
    });

    it("derives the equivalent parent zoom from the continuity ratio", () => {
      const capture = makeCapture({ view: { zoom: 1, center: { ...HEX_CENTER } } });
      const childZoom = 0.5;
      const placement = computeBackdropPlacement(
        { zoom: childZoom, center: { x: 0, y: 0 } },
        capture,
        TARGET
      );

      // drawW / captureWidth === parentZoomEquivalent / captureZoom
      expect(placement!.drawW / CANVAS.width).toBeCloseTo(childZoom / RATIO, 10);
    });
  });

  // ===========================================================================
  // Panning
  // ===========================================================================

  describe("center offset", () => {
    it("moves the snapshot opposite the sub-map pan", () => {
      const capture = makeCapture();
      const base = continuityView(capture);
      const panned = { zoom: base.zoom, center: { x: base.center.x + 40, y: base.center.y } };

      const centered = computeBackdropPlacement(base, capture, TARGET);
      const placement = computeBackdropPlacement(panned, capture, TARGET);

      expect(placement).not.toBeNull();
      expect(placement!.dx).toBeLessThan(centered!.dx);
      expect(placement!.dy).toBeCloseTo(centered!.dy, 6);
      // The child pan mapped to parent world units (× the continuity ratio),
      // times the equivalent parent zoom.
      const parentZoom = base.zoom / RATIO;
      const expected = -(40 * RATIO) * parentZoom;
      expect(placement!.dx - centered!.dx).toBeCloseTo(expected, 6);
    });

    it("moves it vertically for a vertical pan", () => {
      const capture = makeCapture();
      const base = continuityView(capture);
      const panned = { zoom: base.zoom, center: { x: base.center.x, y: base.center.y - 25 } };

      const centered = computeBackdropPlacement(base, capture, TARGET);
      const placement = computeBackdropPlacement(panned, capture, TARGET);

      expect(placement!.dx).toBeCloseTo(centered!.dx, 6);
      expect(placement!.dy).toBeGreaterThan(centered!.dy);
    });

    it("pans in exact lockstep with the child grid on BOTH axes (drift regression)", () => {
      // The grid layer's screen shift per unit of child-center pan is exactly
      // -childZoom (offset = canvas/2 − center·zoom). The backdrop must shift
      // at the identical rate on both axes, for both orientations — the 2.3.0
      // per-axis mapping drifted at ~1.3× on one orientation-dependent axis.
      for (const orientation of ["flat", "pointy"]) {
        const capture = makeCapture({ orientation });
        const base = continuityView(capture);
        const dCenter = 37;

        const centered = computeBackdropPlacement(base, capture, TARGET)!;
        const pannedX = computeBackdropPlacement(
          { zoom: base.zoom, center: { x: base.center.x + dCenter, y: base.center.y } },
          capture,
          TARGET
        )!;
        const pannedY = computeBackdropPlacement(
          { zoom: base.zoom, center: { x: base.center.x, y: base.center.y + dCenter } },
          capture,
          TARGET
        )!;

        expect((pannedX.dx - centered.dx) / dCenter).toBeCloseTo(-base.zoom, 10);
        expect((pannedY.dy - centered.dy) / dCenter).toBeCloseTo(-base.zoom, 10);
      }
    });

    it("returns null once the snapshot is entirely off screen", () => {
      const capture = makeCapture();
      const base = continuityView(capture);
      const farAway = { zoom: base.zoom, center: { x: base.center.x + 100000, y: base.center.y } };

      expect(computeBackdropPlacement(farAway, capture, TARGET)).toBeNull();
    });
  });

  // ===========================================================================
  // Guards
  // ===========================================================================

  describe("guards", () => {
    it("returns null when the parent map is rotated", () => {
      const capture = makeCapture({ northDirection: 30 });
      expect(computeBackdropPlacement(continuityView(capture), capture, TARGET)).toBeNull();
    });

    it("returns null when the sub-map is rotated", () => {
      const capture = makeCapture();
      const rotatedTarget = { ...TARGET, northDirection: -90 };
      expect(computeBackdropPlacement(continuityView(capture), capture, rotatedTarget)).toBeNull();
    });

    it("returns null for a non-positive zoom on either side", () => {
      const capture = makeCapture();
      const base = continuityView(capture);

      expect(computeBackdropPlacement({ ...base, zoom: 0 }, capture, TARGET)).toBeNull();
      expect(
        computeBackdropPlacement(base, makeCapture({ view: { zoom: 0, center: { ...HEX_CENTER } } }), TARGET)
      ).toBeNull();
    });

    it("returns null for a degenerate capture canvas or hex size", () => {
      const capture = makeCapture();
      const base = continuityView(capture);

      expect(
        computeBackdropPlacement(base, makeCapture({ canvasSize: { width: 0, height: 600 } }), TARGET)
      ).toBeNull();
      expect(
        computeBackdropPlacement(base, makeCapture({ childHexSize: 0 }), TARGET)
      ).toBeNull();
    });
  });

  // ===========================================================================
  // Orientation
  // ===========================================================================

  describe("pointy orientation", () => {
    it("also reproduces the capture placement at the dive moment", () => {
      const capture = makeCapture({ orientation: "pointy" });
      const placement = computeBackdropPlacement(continuityView(capture), capture, TARGET);

      expect(placement!.dx).toBeCloseTo(0, 6);
      expect(placement!.dy).toBeCloseTo(0, 6);
      expect(placement!.drawW).toBeCloseTo(CANVAS.width, 6);
    });
  });
});
