/**
 * Lattice ladder math: the Phase-0 oracles.
 *
 * Design: .claude/lod-rd/06-integration-design.md sections 1, 4.1, 12.
 *  - the (m,0) rung is a pure scale on axial indices, with a deterministic tie rule
 *  - ownership matches Euclidean nearest-centre under a REAL HexGeometry, both orientations
 *  - chooseLevel is exact at the closed-form crossings
 *  - the dormancy inequality holds at the shipped defaults and visibly fails at hexSize 120
 *  - existsAt is the single existence gate: level geometries carry no bounds (D18)
 *  - the rosette seating proof for legacy sub-hex content (tiebreak T1)
 */

import { describe, it, expect } from "vitest";

import {
  buildLadder,
  chooseLevel,
  crossingZoom,
  cellPx,
  coarseCells,
  existsAt,
  hexRing,
  loeschianNorm,
  measureRosetteSeat,
  opensAtLevelZero,
  cellKey,
  LADDER_DEFAULTS,
  LADDER_M_ALLOWLIST,
  type LadderParams,
} from "../../../../src/geometry/core/lattice";
import { HexGeometry } from "../../../../src/geometry/core/HexGeometry";
import { DEFAULTS } from "../../../../src/core/dmtConstants";

const SHIPPED: LadderParams = { hexSize: DEFAULTS.hexSize, ...LADDER_DEFAULTS };

describe("buildLadder: the (m,0) rung", () => {
  it("rejects a non-integer or sub-2 m", () => {
    expect(() => buildLadder(1)).toThrow(RangeError);
    expect(() => buildLadder(2.5)).toThrow(RangeError);
  });

  it.each(LADDER_M_ALLOWLIST)("m=%i: parentToChild is a pure scale and parentOf round-trips it without a tie", (m) => {
    const ladder = buildLadder(m);
    for (let Q = -5; Q <= 5; Q++) {
      for (let R = -5; R <= 5; R++) {
        const child = ladder.parentToChild(Q, R);
        expect(child).toEqual({ q: Q * m, r: R * m });
        expect(ladder.parentOf(child.q, child.r)).toEqual({ Q, R, tie: false });
      }
    }
  });

  it.each([2, 3, 4, 15, 16])("m=%i: exactly m^2 child cells are owned by parent (0,0)", (m) => {
    const ladder = buildLadder(m);
    const span = m + 2;
    let owned = 0;
    for (let q = -span; q <= span; q++) {
      for (let r = -span; r <= span; r++) {
        const p = ladder.parentOf(q, r);
        if (p.Q === 0 && p.R === 0) owned++;
      }
    }
    expect(owned).toBe(m * m);
  });

  it("breaks ties to the lexicographically smallest (Q, R)", () => {
    const ladder = buildLadder(2);
    // (1,0) is one cell from parent (0,0) and one cell from parent (1,0)'s centre child (2,0).
    expect(loeschianNorm(1 - 0, 0)).toBe(loeschianNorm(1 - 2, 0));
    expect(ladder.parentOf(1, 0)).toEqual({ Q: 0, R: 0, tie: true });
    // Mirror: (-1,0) is equidistant from (0,0) and (-1,0); the smaller Q wins.
    expect(ladder.parentOf(-1, 0)).toEqual({ Q: -1, R: 0, tie: true });
  });

  it("is deterministic across calls and ladder instances", () => {
    const a = buildLadder(4);
    const b = buildLadder(4);
    for (let q = -12; q <= 12; q++) {
      for (let r = -12; r <= 12; r++) {
        expect(a.parentOf(q, r)).toEqual(b.parentOf(q, r));
      }
    }
  });

  it.each(["flat", "pointy"] as const)(
    "%s: parentOf agrees with Euclidean nearest-centre under a real HexGeometry at every rung",
    (orientation) => {
      for (const m of [2, 4, 15]) {
        const ladder = buildLadder(m);
        const parent = new HexGeometry(DEFAULTS.hexSize, orientation, null);
        const child = new HexGeometry(DEFAULTS.hexSize / m, orientation, null);
        for (let q = -2 * m; q <= 2 * m; q++) {
          for (let r = -2 * m; r <= 2 * m; r++) {
            const cw = child.hexToWorld(q, r);
            const seedQ = Math.round(q / m);
            const seedR = Math.round(r / m);
            let best = Infinity;
            let bestQR: [number, number] = [seedQ, seedR];
            let second = Infinity;
            for (let dQ = -2; dQ <= 2; dQ++) {
              for (let dR = -2; dR <= 2; dR++) {
                const pw = parent.hexToWorld(seedQ + dQ, seedR + dR);
                const d = Math.hypot(pw.worldX - cw.worldX, pw.worldY - cw.worldY);
                if (d < best - 1e-9) {
                  second = best;
                  best = d;
                  bestQR = [seedQ + dQ, seedR + dR];
                } else if (d < second) {
                  second = d;
                }
              }
            }
            const got = ladder.parentOf(q, r);
            if (second - best > 1e-6) {
              expect([got.Q, got.R, got.tie]).toEqual([bestQR[0], bestQR[1], false]);
            } else {
              expect(got.tie).toBe(true);
            }
          }
        }
      }
    },
  );

  it("ancestorAt walks exactly `level` rungs and is the identity at level 0", () => {
    const ladder = buildLadder(4);
    expect(ladder.ancestorAt(0, 7, -3)).toEqual({ q: 7, r: -3 });
    const c1 = ladder.parentToChild(3, -2);
    const c2 = ladder.parentToChild(c1.q, c1.r);
    expect(ladder.ancestorAt(1, c1.q, c1.r)).toEqual({ q: 3, r: -2 });
    expect(ladder.ancestorAt(2, c2.q, c2.r)).toEqual({ q: 3, r: -2 });
    expect(() => ladder.ancestorAt(-1, 0, 0)).toThrow(RangeError);
  });
});

describe("chooseLevel and the closed-form crossings", () => {
  it("matches the design table at the shipped defaults (hexSize 80, m 4, minCellPx 64)", () => {
    expect(crossingZoom(0, SHIPPED)).toBeCloseTo(0.4, 12);
    expect(crossingZoom(1, SHIPPED)).toBeCloseTo(1.6, 12);
    expect(crossingZoom(2, SHIPPED)).toBeCloseTo(6.4, 12);
    expect(crossingZoom(3, SHIPPED)).toBeCloseTo(25.6, 12);
    expect(crossingZoom(4, SHIPPED)).toBeCloseTo(102.4, 12);
    expect(crossingZoom(5, SHIPPED)).toBeCloseTo(409.6, 12);
  });

  it("is exact at each crossing: level L becomes active at z_L and not one ulp below", () => {
    for (let L = 1; L <= SHIPPED.maxLevel; L++) {
      const z = crossingZoom(L, SHIPPED);
      expect(chooseLevel(z, SHIPPED)).toBe(L);
      expect(chooseLevel(z * (1 - 1e-9), SHIPPED)).toBe(L - 1);
      expect(cellPx(SHIPPED.hexSize, SHIPPED.m, L, z)).toBeCloseTo(SHIPPED.minCellPx, 9);
    }
  });

  it("never exceeds maxLevel and never goes below 0", () => {
    expect(chooseLevel(1e9, SHIPPED)).toBe(SHIPPED.maxLevel);
    expect(chooseLevel(DEFAULTS.minZoom, SHIPPED)).toBe(0);
    expect(chooseLevel(0, SHIPPED)).toBe(0);
  });

  it("has exactly one crossing inside today's zoom range at the shipped defaults, and two with the Phase-1 fixture's minCellPx 40", () => {
    const inRange = (p: LadderParams): number[] =>
      [1, 2, 3, 4, 5].map((L) => crossingZoom(L, p)).filter((z) => z > DEFAULTS.minZoom && z <= DEFAULTS.maxZoom);
    expect(inRange(SHIPPED)).toEqual([1.6]);
    const fixture: LadderParams = { ...SHIPPED, minCellPx: 40 };
    expect(inRange(fixture).map((z) => +z.toFixed(9))).toEqual([1, 4]);
  });
});

describe("dormancy inequality (D16): a flagged classic map opens at level 0", () => {
  it("holds at the shipped defaults with a 6.7% margin", () => {
    const rhs = (2 * SHIPPED.hexSize * DEFAULTS.initialZoom) / SHIPPED.m;
    expect(rhs).toBe(60);
    expect(SHIPPED.minCellPx / rhs).toBeCloseTo(1.0667, 3);
    expect(opensAtLevelZero(SHIPPED, DEFAULTS.initialZoom)).toBe(true);
    expect(chooseLevel(DEFAULTS.initialZoom, SHIPPED)).toBe(0);
  });

  it.each([
    [40, true, 0],
    [80, true, 0],
    [84, true, 0],
    [86, false, 1],
    [120, false, 1],
  ])("hexSize %i: opens at level 0 = %s (chooseLevel(initialZoom) = %i)", (hexSize, dormant, level) => {
    const p: LadderParams = { ...SHIPPED, hexSize };
    expect(opensAtLevelZero(p, DEFAULTS.initialZoom)).toBe(dormant);
    expect(chooseLevel(DEFAULTS.initialZoom, p)).toBe(level);
  });

  it("agrees with chooseLevel for every open zoom in today's range", () => {
    for (let z = DEFAULTS.minZoom; z <= DEFAULTS.maxZoom; z += 0.01) {
      expect(opensAtLevelZero(SHIPPED, z)).toBe(chooseLevel(z, SHIPPED) === 0);
    }
  });
});

describe("existsAt: the bounds gate (D18)", () => {
  const ladder = buildLadder(4);

  it("rect map: a level-2 cell far outside the level-0 offset box exists iff its ancestor does", () => {
    const root = new HexGeometry(DEFAULTS.hexSize, "flat", { maxCol: 26, maxRow: 20 });
    const inRoot = (Q: number, R: number): boolean => root.isWithinBounds(Q, R);

    // Level-0 cell (10, 5) is inside the 26x20 box; its centre grandchild is (160, 80).
    expect(inRoot(10, 5)).toBe(true);
    const fine = ladder.parentToChild(...Object.values(ladder.parentToChild(10, 5)) as [number, number]);
    expect(fine).toEqual({ q: 160, r: 80 });
    // A per-level bounds check would reject it: (160, 80) is nowhere near a 26x20 box.
    expect(root.isWithinBounds(fine.q, fine.r)).toBe(false);
    // The ancestor walk accepts it.
    expect(existsAt(ladder, 2, fine.q, fine.r, inRoot)).toBe(true);

    // A fine cell whose ancestor is outside the box does not exist, however small its indices.
    const outside = ladder.parentToChild(...Object.values(ladder.parentToChild(40, 40)) as [number, number]);
    expect(existsAt(ladder, 2, outside.q, outside.r, inRoot)).toBe(false);
    expect(existsAt(ladder, 0, 40, 40, inRoot)).toBe(false);
  });

  it("radial map: a level-2 cell far outside ring maxRing exists iff its ancestor does", () => {
    const root = new HexGeometry(DEFAULTS.hexSize, "pointy", { maxCol: 0, maxRow: 0, maxRing: 5 });
    const inRoot = (Q: number, R: number): boolean => root.isWithinBounds(Q, R);
    expect(inRoot(3, -1)).toBe(true);
    const fine = ladder.parentToChild(...Object.values(ladder.parentToChild(3, -1)) as [number, number]);
    expect(hexRing(fine.q, fine.r)).toBeGreaterThan(5);
    expect(root.isWithinBounds(fine.q, fine.r)).toBe(false);
    expect(existsAt(ladder, 2, fine.q, fine.r, inRoot)).toBe(true);

    const outside = ladder.parentToChild(...Object.values(ladder.parentToChild(10, 0)) as [number, number]);
    expect(existsAt(ladder, 2, outside.q, outside.r, inRoot)).toBe(false);
  });

  it("level geometries carry no bounds: a rung geometry answers isWithinBounds true everywhere", () => {
    const rung = new HexGeometry(DEFAULTS.hexSize / 16, "flat", null);
    expect(rung.isWithinBounds(160, 80)).toBe(true);
    expect(rung.isWithinBounds(-1e6, 1e6)).toBe(true);
  });

  it("district rungs (L < 0): coarse cells are exactly the parents of authored root cells", () => {
    const rootKeys = [cellKey(0, 0), cellKey(1, 0), cellKey(5, 5), cellKey(-9, 2)];
    const district = coarseCells(ladder, rootKeys, -1);
    const expected = new Set(rootKeys.map((k) => {
      const [q, r] = k.split(",").map(Number);
      const p = ladder.parentOf(q, r);
      return cellKey(p.Q, p.R);
    }));
    expect(district).toEqual(expected);
    expect(district.has(cellKey(0, 0))).toBe(true);
    // Two rungs up collapses further, never expands.
    expect(coarseCells(ladder, rootKeys, -2).size).toBeLessThanOrEqual(district.size);
    expect(() => coarseCells(ladder, rootKeys, 0)).toThrow(RangeError);
  });
});

/**
 * Computed 2026-09-25 (Phase 0). The design's T1 text claimed "ring-7 at scale 15 seats onto
 * rung 16 as the identity on axial indices, and ring 9 loses 60 of 271". Computation:
 *  - a SINGLE sixteen-fold rung (m=16, one step) does seat all 169 ring-7 cells;
 *  - the plugin's ladder is m=4 walked TWO rungs, and chained nearest-centre ownership is a
 *    different partition from the single-step one: 12 of 169 ring-7 cells belong to a
 *    neighbouring level-0 parent (36 seat only by the tie rule);
 *  - ring 9 loses 27 (single step) or 40 (chained), never 60.
 * These assertions enshrine the chain, because `existsAt` and every edit at depth walk the
 * chain. The converter contract (design section 9.1) must be corrected before it is built.
 */
describe("rosette seating (T1): legacy sub-hex content on a ladder rung", () => {
  it("a single sixteen-fold rung seats the whole ring-7 rosette (169 cells)", () => {
    expect(measureRosetteSeat(7, 16, 1)).toEqual({ total: 169, seated: 169, lost: 0, ties: 0 });
  });

  it("the shipped scale (a single m=15 rung) is trivially the identity for ring 7", () => {
    expect(measureRosetteSeat(7, 15, 1)).toEqual({ total: 169, seated: 169, lost: 0, ties: 0 });
  });

  it("the m=4 ladder walked two rungs is NOT the identity: 12 of 169 ring-7 cells seat under a neighbour", () => {
    const chained = measureRosetteSeat(7, 4, 2);
    expect(chained.total).toBe(169);
    expect(chained.lost).toBe(12);
    expect(chained.ties).toBe(36);
    expect(chained).not.toEqual(measureRosetteSeat(7, 16, 1));
  });

  it("ring 9 (271 cells): 27 lost on a single m=16 rung, 40 lost on the chained m=4 ladder", () => {
    expect(measureRosetteSeat(9, 16, 1).lost).toBe(27);
    expect(measureRosetteSeat(9, 4, 2).lost).toBe(40);
  });

  it("the shipped scale 15 rescales to 16 with a 6.7% margin", () => {
    expect(16 / 15 - 1).toBeCloseTo(0.0667, 3);
  });
});

/**
 * Cross-model review item 5: ownership (`ancestorAt`, nested nearest-centre
 * rounding, the STORAGE key) is not geometric containment (the root hex the
 * rung cell's centre visibly sits in). Measured 2026-10-12, m 4, hexSize 80,
 * every rung cell whose centre lies within ring 6 of the origin (127 roots):
 *
 *   flat   L1 230/2045 (11.2%, all on a shared edge)   pointy L1 219/2045 (10.7%, all on an edge)
 *   flat   L2 3815/32583 (11.7%; 2794 strictly inside)  pointy L2 3797/32569 (11.7%; 2794 strictly inside)
 *   flat   L3 62855/520487 (12.1%; 58674 strictly inside) pointy L3 62827/520453 (12.1%; 58674 strictly inside)
 *
 * Every disagreement is with an ADJACENT root, so the effect is a ragged
 * ownership edge one root-hex wide (design 06 s20). The ownership rule stays;
 * visual questions (the smart tile clip) use containment instead. The bounds
 * below pin the measured rates with a little headroom so a change to the tie
 * rule or the rounding shows up here.
 */
describe("ancestorAt vs geometric containment (m 4, hexSize 80)", () => {
  const RING = 6;
  const MAX_RATE: Record<number, number> = { 1: 0.115, 2: 0.12, 3: 0.125 };
  const MAX_INTERIOR_RATE: Record<number, number> = { 1: 0, 2: 0.09, 3: 0.115 };

  it.each(["flat", "pointy"] as const)("%s: mismatch rate per rung stays within the measured bound", (orientation) => {
    const m = 4;
    const ladder = buildLadder(m);
    const root = new HexGeometry(80, orientation, null);
    for (let L = 1; L <= 3; L++) {
      const rung = new HexGeometry(80 / Math.pow(m, L), orientation, null);
      const reach = (RING + 1) * Math.pow(m, L);
      let total = 0;
      let mismatch = 0;
      let interior = 0;
      for (let q = -reach; q <= reach; q++) {
        for (let r = -reach; r <= reach; r++) {
          const c = rung.getCellCenter(q, r);
          const geo = root.worldToGrid(c.worldX, c.worldY);
          if (hexRing(geo.x, geo.y) > RING) continue;
          total++;
          const own = ladder.ancestorAt(L, q, r);
          if (own.q === geo.x && own.r === geo.y) continue;
          mismatch++;
          // Always an adjacent root: the ragged edge is one hex wide.
          expect(hexRing(own.q - geo.x, own.r - geo.y)).toBe(1);
          const gc = root.getCellCenter(geo.x, geo.y);
          const oc = root.getCellCenter(own.q, own.r);
          const onEdge = Math.abs(
            Math.hypot(c.worldX - gc.worldX, c.worldY - gc.worldY) - Math.hypot(c.worldX - oc.worldX, c.worldY - oc.worldY)
          ) < 1e-6;
          if (!onEdge) interior++;
        }
      }
      expect(total).toBeGreaterThan(127 * Math.pow(m, 2 * L) * 0.99);
      expect(mismatch).toBeGreaterThan(0);
      expect(mismatch / total).toBeLessThanOrEqual(MAX_RATE[L]);
      expect(interior / total).toBeLessThanOrEqual(MAX_INTERIOR_RATE[L]);
    }
  });
});
