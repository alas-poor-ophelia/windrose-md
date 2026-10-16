/**
 * Design-proof helpers for the lattice ladder (dormancy inequality, rosette seating).
 * They live here, not in src, because only the proofs in lattice.test.ts call them.
 */
import { buildLadder, type LadderParams } from "../../../../src/geometry/core/lattice";

/** Hex ring index of an axial cell around the origin. */
export function hexRing(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}


/**
 * Dormancy inequality: a map opens at level 0 iff `minCellPx > 2 * hexSize * openZoom / m`.
 * Equivalent to `chooseLevel(openZoom, p) === 0` whenever maxLevel >= 1, stated as the
 * inequality so the margin is visible.
 */
export function opensAtLevelZero(p: LadderParams, openZoom: number): boolean {
  return p.minCellPx > (2 * p.hexSize * openZoom) / p.m;
}

export interface RosetteSeat {
  /** Cells in the ring-N rosette. */
  total: number;
  /** Rosette cells whose owner under the ladder is the centre parent (0, 0). */
  seated: number;
  /** Rosette cells owned by a different parent. */
  lost: number;
  /** Rosette cells that seated only by the tie rule. */
  ties: number;
}

/**
 * Seating proof for legacy sub-hex content: place a ring-`rings` rosette of child cells,
 * indices unchanged, onto a rung of linear scale `scale` (for a ladder of `m` this is the
 * rung `L` with `m^L === scale`, walked `L` rungs). Counts how many rosette cells are still
 * owned by the centre parent.
 */
export function measureRosetteSeat(rings: number, m: number, level: number): RosetteSeat {
  const ladder = buildLadder(m);
  let total = 0;
  let seated = 0;
  let ties = 0;
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      if (hexRing(q, r) > rings) continue;
      total++;
      let Q = q;
      let R = r;
      let tie = false;
      for (let i = 0; i < level; i++) {
        const p = ladder.parentOf(Q, R);
        Q = p.Q;
        R = p.R;
        tie = tie || p.tie;
      }
      if (Q === 0 && R === 0) {
        seated++;
        if (tie) ties++;
      }
    }
  }
  return { total, seated, lost: total - seated, ties };
}
