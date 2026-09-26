/**
 * exportOperations — deep export level and zoom (design 06 s19 item 8).
 *
 * Export paints the deepest authored rung of the EXPORTED layers, at a zoom that
 * makes that rung crisp (its crossing zoom), capped so the canvas stays bounded.
 */

import { describe, it, expect } from "vitest";

import { deepestAuthoredLevel, exportZoomForLevel } from "../../../src/persistence/exportOperations";
import { LADDER_DEFAULTS, crossingZoom } from "../../../src/geometry/core/lattice";

import { makeLayer } from "../helpers/fixtures";

const params = { hexSize: 80, ...LADDER_DEFAULTS };
const cell = { q: 1, r: 2, color: "#fff" };

describe("deepestAuthoredLevel", () => {
  it("is 0 for classic layers and for no layers", () => {
    expect(deepestAuthoredLevel([])).toBe(0);
    expect(deepestAuthoredLevel([makeLayer({ id: "a", cells: [cell] })])).toBe(0);
  });

  it("is the max rung across the given layers only", () => {
    const shallow = makeLayer({ id: "a", levels: { 1: [cell] } });
    const deep = makeLayer({ id: "b", levels: { 1: [cell], 3: [cell] } });
    expect(deepestAuthoredLevel([shallow])).toBe(1);
    expect(deepestAuthoredLevel([shallow, deep])).toBe(3);
  });
});

describe("exportZoomForLevel", () => {
  it("level 0 exports at exactly 1", () => {
    expect(exportZoomForLevel(0, params, 500, 400)).toBe(1);
  });

  it("a rung exports at its crossing zoom when the canvas fits", () => {
    expect(exportZoomForLevel(2, params, 500, 400)).toBeCloseTo(crossingZoom(2, params));
  });

  it("caps the longest side at 8192 px, never below 1", () => {
    const zoom = exportZoomForLevel(3, params, 2000, 1000);
    expect(zoom).toBeLessThan(crossingZoom(3, params));
    expect(2000 * zoom).toBeCloseTo(8192);
    expect(exportZoomForLevel(3, params, 20000, 100)).toBe(1);
  });
});
