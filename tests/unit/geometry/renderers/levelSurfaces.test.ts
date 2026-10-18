/**
 * Drift policy for the lattice ladder's per-level surfaces: a crossing frame
 * (first frame at a new level) never bakes synchronously; it blits another
 * level's cached surface and the bake waits for settle. Outside a crossing a
 * level that owns a surface never drifts (a coarser surface lacks the rung's
 * authored cells). These tests pin the pure rules; the real cache lifecycle is
 * covered in tests/unit/geometry/renderers/staticLayerCache.test.ts.
 */

import { describe, it, expect } from "vitest";

import { driftAllowed, driftCandidates } from "../../../../src/geometry/renderers/levelSurfaces";

describe("driftAllowed (outside a crossing, drift only while the level owns no surface)", () => {
  it("drifts on a crossing in progress: no own surface, rung above 0, no bake request", () => {
    expect(driftAllowed(false, 1, false)).toBe(true);
    expect(driftAllowed(false, 3, false)).toBe(true);
  });

  it("never drifts once the level owns a surface, even one that stopped fitting (pan past the pad)", () => {
    expect(driftAllowed(true, 1, false)).toBe(false);
    expect(driftAllowed(true, 2, true)).toBe(false);
  });

  it("never drifts at level 0 and never over a settle's bake request", () => {
    expect(driftAllowed(false, 0, false)).toBe(false);
    expect(driftAllowed(false, 1, true)).toBe(false);
  });

  it("on a crossing frame level 0 may drift too (a zoom-out into level 0 must not bake inline)", () => {
    expect(driftAllowed(false, 0, false, true)).toBe(true);
    expect(driftAllowed(false, 2, false, true)).toBe(true);
    // A usable own surface still wins on a crossing frame.
    expect(driftAllowed(true, 0, false, true)).toBe(false);
  });
});

describe("driftCandidates (a zoom-out crossing may drift from the finer surface)", () => {
  it("orders nearest coarser first, then nearest finer, never the level itself", () => {
    expect(driftCandidates(2, [0, 1, 2, 3, 4])).toEqual([1, 0, 3, 4]);
    expect(driftCandidates(2, new Map([[4, "L4"], [0, "L0"], [3, "L3"]]).keys())).toEqual([0, 3, 4]);
  });

  it("zoom-out crossing L -> L-1 with no coarser surface offers the finer L surface", () => {
    expect(driftCandidates(1, [2])).toEqual([2]);
    expect(driftCandidates(2, [3])).toEqual([3]);
  });

  it("a zoom-in crossing keeps preferring the coarser surface over any finer one", () => {
    expect(driftCandidates(2, [3, 1])).toEqual([1, 3]);
  });

  it("offers nothing when only the level itself (or nothing) is cached, and ignores district rungs below 0", () => {
    expect(driftCandidates(1, [])).toEqual([]);
    expect(driftCandidates(1, [1])).toEqual([]);
    expect(driftCandidates(1, [-1])).toEqual([]);
  });

  it("is still gated by driftAllowed: a level that owns a surface never consults candidates", () => {
    // The renderer only walks driftCandidates when driftAllowed is true.
    expect(driftAllowed(true, 1, false)).toBe(false);
    expect(driftAllowed(false, 1, false) && driftCandidates(1, [2]).length > 0).toBe(true);
  });
});
