/**
 * elementBands.test.ts
 *
 * Visibility bands, floors and home-rung sizing for elements under the ladder
 * (design 06 section 8).
 */
import { describe, it, expect } from "vitest";

import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { hexRenderer } from "../../../../src/geometry/renderers/hexRenderer";
import {
  OBJECT_FLOOR_PX,
  LABEL_FLOOR_PX,
  objectVisible,
  labelVisible,
  pinVisible,
  objectRenderedPx,
  scaledSizeForRung
} from "../../../../src/geometry/renderers/elementBands";

const root = new HexGeometry(80, "flat", null);
const ladder = createGeometryLadder(root, { m: 4, minCellPx: 32, maxLevel: 3 });

describe("objectVisible (home-1 .. home+2)", () => {
  it("shows a root object at levels 0..2 and hides it at 3", () => {
    expect(objectVisible(0, 0)).toBe(true);
    expect(objectVisible(0, 1)).toBe(true);
    expect(objectVisible(0, 2)).toBe(true);
    expect(objectVisible(0, 3)).toBe(false);
  });

  it("shows a level-2 object from level 1 to level 4 only", () => {
    expect(objectVisible(2, 0)).toBe(false);
    expect(objectVisible(2, 1)).toBe(true);
    expect(objectVisible(2, 4)).toBe(true);
    expect(objectVisible(2, 5)).toBe(false);
  });
});

describe("labelVisible (home-2 .. unbounded)", () => {
  it("shows a root label at every level", () => {
    for (let level = 0; level <= 10; level++) expect(labelVisible(0, level)).toBe(true);
  });

  it("shows a level-3 label from level 1 onward", () => {
    expect(labelVisible(3, 0)).toBe(false);
    expect(labelVisible(3, 1)).toBe(true);
    expect(labelVisible(3, 9)).toBe(true);
  });
});

describe("pinVisible", () => {
  it("is always true", () => {
    expect(pinVisible()).toBe(true);
  });
});

describe("floors and sizing", () => {
  it("uses 6 px floors", () => {
    expect(OBJECT_FLOOR_PX).toBe(6);
    expect(LABEL_FLOOR_PX).toBe(6);
  });

  it("sizes an object from its HOME rung and its own width, independent of the active rung", () => {
    const zoom = 8;
    expect(objectRenderedPx(ladder, 0, zoom, 1)).toBe(80 * zoom);
    expect(objectRenderedPx(ladder, 1, zoom, 1)).toBeCloseTo(ladder.cellSizeAt(1) * zoom);
    expect(objectRenderedPx(ladder, 1, zoom, 1)).toBeLessThan(objectRenderedPx(ladder, 0, zoom, 1));
    // a half-cell object draws at half the width; that is what the floor must judge
    expect(objectRenderedPx(ladder, 0, zoom, 0.5)).toBe(40 * zoom);
  });

  it("drops a deep object under the floor when zoomed far out, and a sub-cell object sooner", () => {
    const deep = ladder.params.maxLevel;
    const zoom = (OBJECT_FLOOR_PX / ladder.cellSizeAt(deep)) * 0.5;
    expect(objectRenderedPx(ladder, deep, zoom, 1)).toBeLessThan(OBJECT_FLOOR_PX);
    const justAbove = (OBJECT_FLOOR_PX / ladder.cellSizeAt(0)) * 1.1;
    expect(objectRenderedPx(ladder, 0, justAbove, 1)).toBeGreaterThan(OBJECT_FLOOR_PX);
    expect(objectRenderedPx(ladder, 0, justAbove, 0.4)).toBeLessThan(OBJECT_FLOOR_PX);
  });

  it("mirrors hexRenderer.getScaledSize on the home rung's geometry", () => {
    for (const home of [0, 1, 2]) {
      for (const zoom of [0.25, 1, 8]) {
        expect(scaledSizeForRung(ladder, home, zoom)).toBe(hexRenderer.getScaledSize(ladder.geometryForLevel(home), zoom));
      }
    }
    expect(scaledSizeForRung(ladder, 0, 2)).toBe(hexRenderer.getScaledSize(root, 2));
  });
});
