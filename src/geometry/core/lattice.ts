/**
 * Global lattice ladder: pure math.
 *
 * Level L of a hex map is a hex lattice of cell size `hexSize / m^L`, same
 * orientation, same world origin. The generator is the rotation-free `(m, 0)`
 * Eisenstein sublattice, so a rung is a pure scale on axial indices:
 * `parentToChild(Q, R) = (Q*m, R*m)` and `parentOf` is the nearest parent
 * centre with a deterministic tie rule.
 *
 * Everything here is integer axial arithmetic plus the zoom closed forms. No
 * DOM, no geometry instances, no map data. Ported from
 * spikes/lod/h12-ladder-math/lattice.ts and spikes/lod/g1-global-lattice/main.ts.
 *
 * Distances are measured with the Loeschian norm `a^2 + a*b + b^2`, which is
 * the squared Euclidean distance between hex centres in units of the cell
 * size. It is the same number in both orientations (flat and pointy axial
 * frames differ by an isometry), so ownership is orientation-independent and
 * ties are exact integer comparisons, never float epsilons.
 */

/** Per-map ladder parameters. `m` must be an integer from the allowlist. */
export interface LadderParams {
  /** World px, hex centre to vertex, of a level-0 cell. */
  hexSize: number;
  /** Linear subdivision per rung. */
  m: number;
  /** On-screen cell width (corner to corner, world px times zoom) below which a rung is too small to be active. */
  minCellPx: number;
  /** Deepest rung the ladder subdivides to. */
  maxLevel: number;
}

export const LADDER_M_ALLOWLIST: readonly number[] = [2, 4, 15];

export const LADDER_DEFAULTS: Readonly<Omit<LadderParams, 'hexSize'>> = Object.freeze({
  m: 4,
  minCellPx: 64,
  // 3, not 5: one L4 root hex is ~2 MB of JSON (design 06, s19 item 9).
  maxLevel: 3,
});

export interface AxialCell {
  q: number;
  r: number;
}

export interface ParentCell {
  Q: number;
  R: number;
  /** True when two or more parent centres were equidistant and the tie rule chose. */
  tie: boolean;
}

export interface Ladder {
  readonly m: number;
  /** Parent axial index to the axial index of its centre child, one rung down. */
  parentToChild(Q: number, R: number): AxialCell;
  /** Child axial index to its owning parent, one rung up: nearest centre, smallest (Q, R) lexicographically on a tie. */
  parentOf(q: number, r: number): ParentCell;
  /** Walk `level` rungs up from a level-`level` cell to its level-0 ancestor. `level` must be >= 0. */
  ancestorAt(level: number, q: number, r: number): AxialCell;
}

/** Squared hex-centre distance in cell units between axial offsets (da, db). */
export function loeschianNorm(da: number, db: number): number {
  return da * da + da * db + db * db;
}

/** Cube rounding of fractional axial coordinates to the nearest cell. */
export function axialRound(qf: number, rf: number): AxialCell {
  const xf = qf;
  const zf = rf;
  const yf = -xf - zf;
  let rx = Math.round(xf);
  let ry = Math.round(yf);
  let rz = Math.round(zf);
  const dx = Math.abs(rx - xf);
  const dy = Math.abs(ry - yf);
  const dz = Math.abs(rz - zf);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}

/** Hex ring index of an axial cell around the origin. */
export function hexRing(q: number, r: number): number {
  return (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
}

export function buildLadder(m: number): Ladder {
  if (!Number.isInteger(m) || m < 2) {
    throw new RangeError(`Ladder m must be an integer >= 2, got ${m}`);
  }

  const parentToChild = (Q: number, R: number): AxialCell => ({ q: Q * m, r: R * m });

  const parentOf = (q: number, r: number): ParentCell => {
    const seed = axialRound(q / m, r / m);
    let bestQ = seed.q;
    let bestR = seed.r;
    let bestD = Infinity;
    let tie = false;
    for (let dq = -2; dq <= 2; dq++) {
      for (let dr = -2; dr <= 2; dr++) {
        const Q = seed.q + dq;
        const R = seed.r + dr;
        const d = loeschianNorm(q - Q * m, r - R * m);
        if (d < bestD) {
          bestD = d;
          bestQ = Q;
          bestR = R;
          tie = false;
        } else if (d === bestD) {
          tie = true;
          if (Q < bestQ || (Q === bestQ && R < bestR)) {
            bestQ = Q;
            bestR = R;
          }
        }
      }
    }
    return { Q: bestQ, R: bestR, tie };
  };

  const ancestorAt = (level: number, q: number, r: number): AxialCell => {
    if (level < 0) {
      throw new RangeError(`ancestorAt needs level >= 0, got ${level}; district rungs use coarseCells`);
    }
    let Q = q;
    let R = r;
    for (let i = 0; i < level; i++) {
      const p = parentOf(Q, R);
      Q = p.Q;
      R = p.R;
    }
    return { q: Q, r: R };
  };

  return { m, parentToChild, parentOf, ancestorAt };
}

// ---------------------------------------------------------------- zoom closed forms

/** World px, centre to vertex, of a level-L cell. */
export function sizeOf(hexSize: number, m: number, level: number): number {
  return hexSize / Math.pow(m, level);
}

/** On-screen width, corner to corner, of a level-L cell at `zoom`. `minCellPx` is defined against this measure. */
export function cellPx(hexSize: number, m: number, level: number, zoom: number): number {
  return 2 * sizeOf(hexSize, m, level) * zoom;
}

/** Zoom at which level L becomes active: `minCellPx * m^L / (2 * hexSize)`. */
export function crossingZoom(level: number, p: LadderParams): number {
  return (p.minCellPx * Math.pow(p.m, level)) / (2 * p.hexSize);
}

/** Active level at `zoom`: the finest L <= maxLevel whose on-screen cell width is at least minCellPx. Pure function of zoom, no hysteresis. */
export function chooseLevel(zoom: number, p: LadderParams): number {
  let level = 0;
  while (level < p.maxLevel && cellPx(p.hexSize, p.m, level + 1, zoom) >= p.minCellPx) level++;
  return level;
}

/**
 * Dormancy inequality: a map opens at level 0 iff `minCellPx > 2 * hexSize * openZoom / m`.
 * Equivalent to `chooseLevel(openZoom, p) === 0` whenever maxLevel >= 1, stated as the
 * inequality so the margin is visible.
 */
export function opensAtLevelZero(p: LadderParams, openZoom: number): boolean {
  return p.minCellPx > (2 * p.hexSize * openZoom) / p.m;
}

// ---------------------------------------------------------------- existence

export function cellKey(q: number, r: number): string {
  return `${q},${r}`;
}

/**
 * Existence at a rung L >= 0: a level-L cell exists iff its ownership chain reaches a
 * level-0 cell that exists. Level geometries carry no bounds of their own; this is the
 * single gate. `existsAtRoot` is the level-0 test (bounds or authored set).
 */
export function existsAt(
  ladder: Ladder,
  level: number,
  q: number,
  r: number,
  existsAtRoot: (Q: number, R: number) => boolean,
): boolean {
  const a = ladder.ancestorAt(level, q, r);
  return existsAtRoot(a.q, a.r);
}

/**
 * District rungs (L < 0, cells coarser than the root): the set of level-L cells that own at
 * least one level-0 cell from `rootKeys`. Computed by walking every root cell up |L| rungs.
 */
export function coarseCells(ladder: Ladder, rootKeys: Iterable<string>, level: number): Set<string> {
  if (level >= 0) {
    throw new RangeError(`coarseCells needs level < 0, got ${level}`);
  }
  let current = new Set<string>(rootKeys);
  for (let i = 0; i > level; i--) {
    const up = new Set<string>();
    for (const key of current) {
      const comma = key.indexOf(',');
      const p = ladder.parentOf(Number(key.slice(0, comma)), Number(key.slice(comma + 1)));
      up.add(cellKey(p.Q, p.R));
    }
    current = up;
  }
  return current;
}

// ---------------------------------------------------------------- rosette seating

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
