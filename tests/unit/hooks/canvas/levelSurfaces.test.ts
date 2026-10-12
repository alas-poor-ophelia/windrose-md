/**
 * Crossing is a drift (D17), design section 3.1 / 12 item 4.
 *
 * After a level change with no cached entry for the new level, the crossing
 * frame blits the nearest coarser surface at scale. Zero synchronous bakes
 * happen in that frame; exactly one bake is scheduled at settle. The only
 * synchronous bake is the first mount, when nothing is cached at all.
 *
 * Scope: Phase 0. These tests pin the SELECTION rule. The sweep below is a
 * model of the intended integration built in the test itself; it is not
 * coverage of useCanvasRenderer's static cache, which is untouched until
 * Phase 1 re-keys it per level. The assertion "zero synchronous
 * drawStaticContent calls at a crossing" lands there, against the real cache.
 */

import { describe, it, expect } from "vitest";

import { pickDriftSource, driftAllowed, driftCandidates } from "../../../../src/hooks/canvas/levelSurfaces";

describe("driftAllowed (kgc.19: drift only while the level owns no surface)", () => {
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
});

describe("pickDriftSource", () => {
  it("returns the exact level when it is cached", () => {
    const entries = new Map([[0, "L0"], [1, "L1"]]);
    expect(pickDriftSource(entries, 1)).toEqual({ level: 1, entry: "L1" });
    expect(pickDriftSource(entries, 0)).toEqual({ level: 0, entry: "L0" });
  });

  it("falls back to the nearest coarser cached level on a miss", () => {
    const entries = new Map([[0, "L0"], [2, "L2"]]);
    expect(pickDriftSource(entries, 1)).toEqual({ level: 0, entry: "L0" });
    expect(pickDriftSource(entries, 3)).toEqual({ level: 2, entry: "L2" });
    expect(pickDriftSource(entries, 5)).toEqual({ level: 2, entry: "L2" });
  });

  it("returns null only when nothing at or below the level is cached", () => {
    expect(pickDriftSource(new Map(), 0)).toBeNull();
    expect(pickDriftSource(new Map([[3, "L3"]]), 2)).toBeNull();
  });

  it("a zoom-in sweep across every crossing does zero synchronous bakes after first mount and schedules one bake per crossing", () => {
    const cache = new Map<number, string>();
    let syncBakes = 0;
    let scheduledBakes = 0;
    const settle = (level: number): void => {
      scheduledBakes++;
      cache.set(level, `L${level}`);
    };

    const enter = (level: number): void => {
      const source = pickDriftSource(cache, level);
      if (source === null) {
        syncBakes++;
        cache.set(level, `L${level}`);
        return;
      }
      if (source.level !== level) settle(level);
    };

    enter(0);
    expect(syncBakes).toBe(1);
    for (let level = 1; level <= 5; level++) {
      const before = scheduledBakes;
      enter(level);
      expect(scheduledBakes).toBe(before + 1);
    }
    expect(syncBakes).toBe(1);
    expect(scheduledBakes).toBe(5);
  });
});

describe("driftCandidates (kgc.23 i: a zoom-out crossing may drift from the finer surface)", () => {
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
    // The renderer only walks driftCandidates when driftAllowed is true (kgc.19).
    expect(driftAllowed(true, 1, false)).toBe(false);
    expect(driftAllowed(false, 1, false) && driftCandidates(1, [2]).length > 0).toBe(true);
  });
});
