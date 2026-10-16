/**
 * exportOperations — deep export level and zoom (design 06 s19 item 8).
 *
 * Export paints the deepest authored rung of the EXPORTED layers, at a zoom that
 * makes that rung crisp (its crossing zoom), capped so the canvas stays bounded.
 */

import { describe, it, expect, afterEach } from "vitest";
import { Platform } from "obsidian";

import { exportZoomForLevel } from "../../../src/persistence/exportOperations";
import { deepestAuthoredRungOfLayers } from "../../../src/core/lodFlags";
import { LADDER_DEFAULTS, crossingZoom } from "../../../src/geometry/core/lattice";

import type { MapObject } from "#types/objects/object.types";
import type { TileAssignment } from "#types/tiles/tile.types";

import { makeLayer } from "../helpers/fixtures";

const params = { hexSize: 80, ...LADDER_DEFAULTS };
const cell = { q: 1, r: 2, color: "#fff" };

describe("deepestAuthoredRungOfLayers (the rung a deep export paints)", () => {
  it("is 0 for classic layers and for no layers", () => {
    expect(deepestAuthoredRungOfLayers([])).toBe(0);
    expect(deepestAuthoredRungOfLayers([makeLayer({ id: "a", cells: [cell] })])).toBe(0);
  });

  it("is the max rung across the given layers only", () => {
    const shallow = makeLayer({ id: "a", levels: { 1: [cell] } });
    const deep = makeLayer({ id: "b", levels: { 1: [cell], 3: [cell] } });
    expect(deepestAuthoredRungOfLayers([shallow])).toBe(1);
    expect(deepestAuthoredRungOfLayers([shallow, deep])).toBe(3);
  });

  it("deep-object-only map exports at the object's rung", () => {
    const deepObj = { id: "d", type: "entrance", position: { x: 5, y: 7 }, size: { width: 1, height: 1 }, homeLevel: 2 } as unknown as MapObject;
    expect(deepestAuthoredRungOfLayers([makeLayer({ objects: [deepObj] })])).toBe(2);
    const deepTile = { col: 5, row: 7, tilesetId: "ts", tileId: "t", homeLevel: 3 } as TileAssignment;
    expect(deepestAuthoredRungOfLayers([makeLayer({ tiles: [deepTile] })])).toBe(3);
  });
});

describe("exportZoomForLevel", () => {
  afterEach(() => { Platform.isMobile = false; });

  it("level 0 exports at exactly 1", () => {
    expect(exportZoomForLevel(0, params, 500, 400)).toBe(1);
  });

  it("a rung exports at its crossing zoom when the canvas fits", () => {
    expect(exportZoomForLevel(2, params, 500, 400)).toBeCloseTo(crossingZoom(2, params));
  });

  it("caps the longest side at 8192 px, never below 1", () => {
    const zoom = exportZoomForLevel(3, params, 4000, 100);
    expect(zoom).toBeLessThan(crossingZoom(3, params));
    expect(4000 * zoom).toBeCloseTo(8192);
    expect(exportZoomForLevel(3, params, 20000, 100)).toBe(1);
  });

  it("width*height stays under the cap at max rung on a large map", () => {
    const w = 3000.4;
    const h = 2500.7;
    const zoom = exportZoomForLevel(params.maxLevel, params, w, h);
    expect(zoom).toBeGreaterThan(1);
    expect(Math.ceil(w * zoom) * Math.ceil(h * zoom)).toBeLessThanOrEqual(16_000_000);
    // Two canvases are alive at once on mobile: half the area there.
    Platform.isMobile = true;
    const mobileZoom = exportZoomForLevel(params.maxLevel, params, w, h);
    expect(Math.ceil(w * mobileZoom) * Math.ceil(h * mobileZoom)).toBeLessThanOrEqual(8_000_000);
    expect(mobileZoom).toBeLessThan(zoom);
  });
});
