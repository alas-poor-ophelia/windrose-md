/**
 * exportOperations — export view state framing.
 *
 * The export canvas is sized to the content bounds, so the view state handed
 * to renderCanvas must map the bounds' top-left corner to canvas (0, 0).
 * Regression: exporting with the live viewState produced a viewport crop.
 */

import { describe, it, expect } from "vitest";

import { exportViewStateForBounds } from "../../../src/persistence/exportOperations";
import { calculateViewportOffset } from "../../../src/geometry/core/BaseGeometry";

import type { BoundingBox } from "#types/core/geometry.types";

const bounds: BoundingBox = { minX: 140, minY: -60, maxX: 620, maxY: 300 };
const canvas = { width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY };

describe("exportViewStateForBounds", () => {
  it("frames the bounds on a grid map (center in cell units)", () => {
    const geometry = { type: "grid", cellSize: 32 };
    const view = exportViewStateForBounds(geometry, bounds);
    expect(view.zoom).toBe(1);
    const { offsetX, offsetY } = calculateViewportOffset(geometry, view.center, canvas, view.zoom);
    // World px map to canvas as offset + world * zoom, so the top-left of the
    // bounds must land on the canvas origin.
    expect(offsetX + bounds.minX).toBeCloseTo(0, 6);
    expect(offsetY + bounds.minY).toBeCloseTo(0, 6);
  });

  it("frames the bounds on a hex map (center in world px)", () => {
    const geometry = { type: "hex", cellSize: 40 };
    const view = exportViewStateForBounds(geometry, bounds);
    expect(view.zoom).toBe(1);
    expect(view.center).toEqual({ x: 380, y: 120 });
    const { offsetX, offsetY } = calculateViewportOffset(geometry, view.center, canvas, view.zoom);
    expect(offsetX + bounds.minX).toBeCloseTo(0, 6);
    expect(offsetY + bounds.minY).toBeCloseTo(0, 6);
  });
});
