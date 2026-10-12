/**
 * elementBands.test.ts
 *
 * Visibility bands, floors, home-rung sizing and depth modes for elements under
 * the ladder (design 06 section 8; kgc.13 depth mode).
 */
import { describe, it, expect } from "vitest";

import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { crossingZoom } from "../../../../src/geometry/core/lattice";
import { hexRenderer } from "../../../../src/geometry/renderers/hexRenderer";
import {
  DEFAULT_DEPTH_MODE,
  OBJECT_FLOOR_PX,
  LABEL_FLOOR_PX,
  depthModeOf,
  groupByDepth,
  tilesByHomeForRung,
  overrideRungFor,
  objectVisible,
  labelVisible,
  pinVisible,
  elementZoom,
  elementScale,
  objectRenderedPx,
  scaledSizeForRung
} from "../../../../src/geometry/renderers/elementBands";
import type { DepthMode } from "../../../../src/geometry/renderers/elementBands";

const root = new HexGeometry(80, "flat", null);
const ladder = createGeometryLadder(root, { m: 4, minCellPx: 32, maxLevel: 3 });

describe("depth mode default", () => {
  it("persists unless the entity says otherwise", () => {
    expect(DEFAULT_DEPTH_MODE).toBe("persist");
    expect(depthModeOf({})).toBe("persist");
    expect(depthModeOf({ depthMode: "pop" })).toBe("pop");
    expect(depthModeOf({ depthMode: "persist" })).toBe("persist");
  });
});

describe("objectVisible", () => {
  it("persist (default): one rung above home, then every finer rung", () => {
    expect(objectVisible(0, 0)).toBe(true);
    expect(objectVisible(0, 1)).toBe(true);
    expect(objectVisible(0, 2)).toBe(true);
    expect(objectVisible(0, 3)).toBe(true);
    expect(objectVisible(0, 9)).toBe(true);
    expect(objectVisible(2, 0)).toBe(false);
    expect(objectVisible(2, 1)).toBe(true);
    expect(objectVisible(2, 5, "persist")).toBe(true);
  });

  it("pop: one rung above home through home, hidden at the first finer rung", () => {
    expect(objectVisible(0, 0, "pop")).toBe(true);
    expect(objectVisible(0, 1, "pop")).toBe(false);
    expect(objectVisible(2, 0, "pop")).toBe(false);
    expect(objectVisible(2, 1, "pop")).toBe(true);
    expect(objectVisible(2, 2, "pop")).toBe(true);
    expect(objectVisible(2, 3, "pop")).toBe(false);
  });
});

describe("labelVisible", () => {
  it("persist (default): two rungs above home, then every finer rung", () => {
    for (let level = 0; level <= 10; level++) expect(labelVisible(0, level)).toBe(true);
    expect(labelVisible(3, 0)).toBe(false);
    expect(labelVisible(3, 1)).toBe(true);
    expect(labelVisible(3, 9)).toBe(true);
  });

  it("pop: two rungs above home through home, hidden at the first finer rung", () => {
    expect(labelVisible(3, 0, "pop")).toBe(false);
    expect(labelVisible(3, 1, "pop")).toBe(true);
    expect(labelVisible(3, 3, "pop")).toBe(true);
    expect(labelVisible(3, 4, "pop")).toBe(false);
    expect(labelVisible(0, 1, "pop")).toBe(false);
  });
});

describe("pinVisible", () => {
  it("is always true", () => {
    expect(pinVisible()).toBe(true);
  });
});

describe("depth hold (elementZoom / elementScale)", () => {
  const hold0 = crossingZoom(1, ladder.params);

  it("persist grows with the zoom up to the next rung's crossing, then holds", () => {
    expect(elementZoom(ladder, 0, hold0 / 2, "persist")).toBe(hold0 / 2);
    expect(elementZoom(ladder, 0, hold0, "persist")).toBe(hold0);
    expect(elementZoom(ladder, 0, hold0 * 10, "persist")).toBe(hold0);
    // continuous at the crossing: no jump
    expect(elementZoom(ladder, 0, hold0 * 1.0001, "persist")).toBeCloseTo(hold0, 6);
  });

  it("holds each home rung at its own crossing, so a deeper home holds later", () => {
    const hold2 = crossingZoom(3, ladder.params);
    expect(hold2).toBeGreaterThan(hold0);
    expect(elementZoom(ladder, 2, hold0 * 10, "persist")).toBe(hold0 * 10);
    expect(elementZoom(ladder, 2, hold2 * 10, "persist")).toBe(hold2);
  });

  it("never holds an element homed on the finest rung: no finer rung ever takes over", () => {
    const top = ladder.params.maxLevel;
    const beyond = crossingZoom(top + 1, ladder.params) * 5;
    expect(elementZoom(ladder, top, beyond, "persist")).toBe(beyond);
    expect(elementScale(ladder, top, beyond, "persist")).toBe(1);
  });

  it("pop never caps: it is hidden before the cap could matter", () => {
    expect(elementZoom(ladder, 0, hold0 * 10, "pop")).toBe(hold0 * 10);
    expect(elementScale(ladder, 0, hold0 * 10, "pop")).toBe(1);
  });

  it("elementScale is 1 while growing and ceiling/zoom while held", () => {
    expect(elementScale(ladder, 0, hold0 / 2, "persist")).toBe(1);
    expect(elementScale(ladder, 0, hold0 * 4, "persist")).toBeCloseTo(0.25, 9);
    expect(elementScale(ladder, 0, 0, "persist")).toBe(1);
  });

  it("a held root object never exceeds minCellPx * m / 2 rendered px per cell of width", () => {
    const ceilingPx = (ladder.params.minCellPx * ladder.params.m) / 2;
    for (const zoom of [hold0, hold0 * 3, hold0 * 40]) {
      expect(objectRenderedPx(ladder, 0, zoom, 1, "persist")).toBeCloseTo(ceilingPx, 6);
      expect(objectRenderedPx(ladder, 0, zoom, 2, "persist")).toBeCloseTo(2 * ceilingPx, 6);
    }
    expect(objectRenderedPx(ladder, 0, hold0 * 40, 1, "pop")).toBeGreaterThan(ceilingPx * 10);
  });
});

describe("groupByDepth", () => {
  it("buckets by (home, mode) and keeps insertion order", () => {
    type Placed = { id: string; homeLevel?: number; depthMode?: DepthMode };
    const a: Placed = { id: "a" };
    const b: Placed = { id: "b", homeLevel: 1 };
    const c: Placed = { id: "c", depthMode: "pop" };
    const d: Placed = { id: "d", homeLevel: 1, depthMode: "persist" };
    const groups = groupByDepth([a, b, c, d]);
    expect(groups.map((g) => [g.home, g.mode, g.members.map((m) => m.id)])).toEqual([
      [0, "persist", ["a"]],
      [1, "persist", ["b", "d"]],
      [0, "pop", ["c"]]
    ]);
  });

  it("returns no groups for no elements", () => {
    expect(groupByDepth([])).toEqual([]);
  });
});

describe("tilesByHomeForRung (kgc.22)", () => {
  const t = (id: string, homeLevel?: number): { id: string; homeLevel?: number } => (homeLevel === undefined ? { id } : { id, homeLevel });

  it("at level 0 only root tiles draw, and the home-0 group always exists", () => {
    const groups = tilesByHomeForRung([t("a"), t("b", 2), t("c", 0), t("d", 1)], 0);
    expect(groups.map(([home, tiles]) => [home, tiles.map((x) => x.id)])).toEqual([[0, ["a", "c"]]]);
    expect(tilesByHomeForRung([], 0)).toEqual([[0, []]]);
    expect(tilesByHomeForRung([t("deep", 3)], 0)).toEqual([[0, []]]);
  });

  it("at a deeper rung every home up to the active rung draws, coarsest first, finer ones skipped", () => {
    const groups = tilesByHomeForRung([t("x", 2), t("a"), t("y", 1), t("z", 3), t("b", 2)], 2);
    expect(groups.map(([home, tiles]) => [home, tiles.map((x) => x.id)])).toEqual([
      [0, ["a"]],
      [1, ["y"]],
      [2, ["x", "b"]]
    ]);
  });
});

describe("overrideRungFor (kgc.20)", () => {
  it("never exceeds the rung the zoom activates, nor the deepest authored rung", () => {
    const z1 = crossingZoom(1, ladder.params);
    const z2 = crossingZoom(2, ladder.params);
    expect(overrideRungFor(ladder, 3, z1 / 2)).toBe(0);
    expect(overrideRungFor(ladder, 3, z1)).toBe(1);
    expect(overrideRungFor(ladder, 3, z2 * 1.5)).toBe(2);
    expect(overrideRungFor(ladder, 1, z2 * 1.5)).toBe(1);
    expect(overrideRungFor(ladder, 0, z2 * 1.5)).toBe(0);
  });
});

describe("floors and sizing", () => {
  it("uses 6 px floors", () => {
    expect(OBJECT_FLOOR_PX).toBe(6);
    expect(LABEL_FLOOR_PX).toBe(6);
  });

  it("sizes an object from its HOME rung and its own width, independent of the active rung", () => {
    const zoom = 0.5; // under every hold
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
