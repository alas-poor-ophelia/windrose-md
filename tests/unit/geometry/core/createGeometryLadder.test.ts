/**
 * createGeometryLadder: the per-map ladder wrapper around lattice.ts + HexGeometry.
 *
 * Design .claude/lod-rd/06-integration-design.md 4.1 and D18: level 0 IS the map's own
 * geometry (bounds intact); every other rung is bounds-free; existsAt walks the ownership
 * chain up to the root's bounds.
 */
import { describe, it, expect } from "vitest";

import { createGeometryLadder } from "../../../../src/geometry/core/createGeometryLadder";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { chooseLevel, crossingZoom, LADDER_DEFAULTS, type LadderParams } from "../../../../src/geometry/core/lattice";
import { offsetToAxial } from "../../../../src/geometry/core/offsetCoordinates";
import { DEFAULTS } from "../../../../src/core/dmtConstants";

describe("createGeometryLadder: params", () => {
  it("takes hexSize from the root geometry and defaults m/minCellPx/maxLevel to LADDER_DEFAULTS", () => {
    const root = new HexGeometry(80, "flat", null);
    const ladder = createGeometryLadder(root);
    expect(ladder.params).toEqual({ hexSize: 80, ...LADDER_DEFAULTS });
    expect(ladder.params.m).toBe(4);
    expect(ladder.params.minCellPx).toBe(64);
    expect(ladder.params.maxLevel).toBe(5);
  });

  it("applies overrides on top of the defaults", () => {
    const root = new HexGeometry(120, "pointy", null);
    const ladder = createGeometryLadder(root, { m: 2, minCellPx: 32, maxLevel: 3 });
    expect(ladder.params).toEqual({ hexSize: 120, m: 2, minCellPx: 32, maxLevel: 3 });
  });
});

describe("createGeometryLadder: geometryForLevel(0) is the root", () => {
  it("returns the SAME object as root, bounds intact", () => {
    const root = new HexGeometry(80, "flat", { maxCol: 26, maxRow: 20 });
    const ladder = createGeometryLadder(root);
    const g0 = ladder.geometryForLevel(0);
    expect(g0).toBe(root);
    expect(g0.bounds).toEqual({ maxCol: 26, maxRow: 20 });
  });
});

describe("createGeometryLadder: non-zero rungs", () => {
  const root = new HexGeometry(80, "flat", { maxCol: 26, maxRow: 20 });
  const ladder = createGeometryLadder(root);

  it.each([1, 2, 3, -1, -2])("level %i: frozen identity, bounds-free, root orientation, scaled hexSize", (level) => {
    const a = ladder.geometryForLevel(level);
    const b = ladder.geometryForLevel(level);
    expect(a).toBe(b);
    expect(a.bounds).toBeNull();
    expect(a.orientation).toBe(root.orientation);
    const expectedHexSize = root.hexSize / Math.pow(ladder.params.m, level);
    expect(a.hexSize).toBeCloseTo(expectedHexSize, 12);
    expect(ladder.cellSizeAt(level)).toBeCloseTo(expectedHexSize, 12);
  });

  it("a negative level yields a larger cell than the root", () => {
    expect(ladder.geometryForLevel(-1).hexSize).toBeGreaterThan(root.hexSize);
    expect(ladder.geometryForLevel(-2).hexSize).toBeGreaterThan(ladder.geometryForLevel(-1).hexSize);
  });

  it("throws RangeError for a non-integer level", () => {
    expect(() => ladder.geometryForLevel(1.5)).toThrow(RangeError);
  });
});

describe("createGeometryLadder: activeLevel matches chooseLevel at the closed-form crossings", () => {
  const root = new HexGeometry(80, "flat", null);
  const ladder = createGeometryLadder(root);
  const params: LadderParams = ladder.params;

  it("matches at 0.4, 1.6, 6.4 (shipped defaults: m=4, hexSize 80, minCellPx 64)", () => {
    expect(crossingZoom(0, params)).toBeCloseTo(0.4, 12);
    expect(crossingZoom(1, params)).toBeCloseTo(1.6, 12);
    expect(crossingZoom(2, params)).toBeCloseTo(6.4, 12);
    for (const zoom of [0.4, 1.6, 6.4]) {
      expect(ladder.activeLevel(zoom)).toBe(chooseLevel(zoom, params));
    }
  });

  it("matches one ulp below each crossing too", () => {
    for (const zoom of [0.4, 1.6, 6.4]) {
      const justBelow = zoom * (1 - 1e-9);
      expect(ladder.activeLevel(justBelow)).toBe(chooseLevel(justBelow, params));
    }
  });
});

describe("createGeometryLadder: existsAt on a RECT root", () => {
  it.each(["flat", "pointy"] as const)("%s: level >= 0 follows the ancestor chain to the bounds", (orientation) => {
    const root = new HexGeometry(80, orientation, { maxCol: 26, maxRow: 20 });
    const ladder = createGeometryLadder(root);

    // (10, 5) is inside the box; its level-2 descendant is far outside the box in raw indices
    // but exists because its ancestor does.
    const child1 = ladder.ladder.parentToChild(10, 5);
    const child2 = ladder.ladder.parentToChild(child1.q, child1.r);
    expect(root.isWithinBounds(10, 5)).toBe(true);
    expect(root.isWithinBounds(child2.q, child2.r)).toBe(false);
    expect(ladder.existsAt(2, child2.q, child2.r)).toBe(true);

    // (40, 40) is outside the box; its level-2 descendant does not exist either.
    const outside1 = ladder.ladder.parentToChild(40, 40);
    const outside2 = ladder.ladder.parentToChild(outside1.q, outside1.r);
    expect(root.isWithinBounds(40, 40)).toBe(false);
    expect(ladder.existsAt(2, outside2.q, outside2.r)).toBe(false);

    // Level 0 matches root.isWithinBounds directly.
    expect(ladder.existsAt(0, 10, 5)).toBe(root.isWithinBounds(10, 5));
    expect(ladder.existsAt(0, 40, 40)).toBe(root.isWithinBounds(40, 40));
  });
});

describe("createGeometryLadder: existsAt on a RADIAL root", () => {
  it("level >= 0 follows the ancestor chain to the ring bound", () => {
    const root = new HexGeometry(80, "pointy", { maxCol: 0, maxRow: 0, maxRing: 5 });
    const ladder = createGeometryLadder(root);

    const child1 = ladder.ladder.parentToChild(3, -1);
    const child2 = ladder.ladder.parentToChild(child1.q, child1.r);
    expect(root.isWithinBounds(3, -1)).toBe(true);
    expect(root.isWithinBounds(child2.q, child2.r)).toBe(false);
    expect(ladder.existsAt(2, child2.q, child2.r)).toBe(true);

    const outside1 = ladder.ladder.parentToChild(10, 0);
    const outside2 = ladder.ladder.parentToChild(outside1.q, outside1.r);
    expect(root.isWithinBounds(10, 0)).toBe(false);
    expect(ladder.existsAt(2, outside2.q, outside2.r)).toBe(false);
  });
});

describe("createGeometryLadder: district rungs (level < 0) on a RECT root", () => {
  const bounds = { maxCol: 26, maxRow: 20 };
  const root = new HexGeometry(80, "flat", bounds);
  const ladder = createGeometryLadder(root);

  // Independently computed: the set of level -1 parent keys owning at least one in-bounds root cell.
  const expectedDistrict1 = new Set<string>();
  for (let col = 0; col < bounds.maxCol; col++) {
    for (let row = 0; row < bounds.maxRow; row++) {
      const { q, r } = offsetToAxial(col, row, root.orientation);
      const p = ladder.ladder.parentOf(q, r);
      expectedDistrict1.add(`${p.Q},${p.R}`);
    }
  }
  // One more rung up: parents of the level -1 parent set.
  const expectedDistrict2 = new Set<string>();
  for (const key of expectedDistrict1) {
    const [Q, R] = key.split(",").map(Number);
    const p = ladder.ladder.parentOf(Q, R);
    expectedDistrict2.add(`${p.Q},${p.R}`);
  }

  it("existsAt(-1, Q, R) is true exactly for the independently-computed parent set", () => {
    for (let Q = -6; Q <= 30; Q++) {
      for (let R = -6; R <= 24; R++) {
        expect(ladder.existsAt(-1, Q, R)).toBe(expectedDistrict1.has(`${Q},${R}`));
      }
    }
    expect(ladder.existsAt(-1, 5000, -5000)).toBe(false);
  });

  it("existsAt(-2, Q, R) is true exactly for the independently-computed grandparent set", () => {
    for (let Q = -6; Q <= 30; Q++) {
      for (let R = -6; R <= 24; R++) {
        expect(ladder.existsAt(-2, Q, R)).toBe(expectedDistrict2.has(`${Q},${R}`));
      }
    }
    expect(ladder.existsAt(-2, 5000, -5000)).toBe(false);
  });

  it("is deterministic across repeated calls (memoized set never changes the answer)", () => {
    for (let i = 0; i < 3; i++) {
      expect(ladder.existsAt(-1, 0, 0)).toBe(expectedDistrict1.has("0,0"));
      expect(ladder.existsAt(-2, 0, 0)).toBe(expectedDistrict2.has("0,0"));
    }
  });
});

describe("createGeometryLadder: unbounded root", () => {
  it("existsAt is true at every level, including huge indices", () => {
    const root = new HexGeometry(80, "flat", null);
    const ladder = createGeometryLadder(root);
    for (const level of [3, 0, -1, -3]) {
      expect(ladder.existsAt(level, 0, 0)).toBe(true);
      expect(ladder.existsAt(level, 1_000_000, -1_000_000)).toBe(true);
    }
  });
});

describe("createGeometryLadder: district rungs on a RADIAL root", () => {
  it("existsAt(-1, 0, 0) is true (the centre's parent); a far cell is false", () => {
    const root = new HexGeometry(80, "pointy", { maxCol: 0, maxRow: 0, maxRing: 5 });
    const ladder = createGeometryLadder(root);
    expect(ladder.existsAt(-1, 0, 0)).toBe(true);
    expect(ladder.existsAt(-1, 1000, 1000)).toBe(false);
  });
});

// Sanity: DEFAULTS is imported so a future change to the shipped hexSize is visible here too.
describe("createGeometryLadder: shipped hexSize sanity", () => {
  it("DEFAULTS.hexSize is 80, matching the crossing-zoom fixtures above", () => {
    expect(DEFAULTS.hexSize).toBe(80);
  });
});
