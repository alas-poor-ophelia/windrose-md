/**
 * The ladder of geometries for a hex map.
 *
 * Design .claude/lod-rd/06-integration-design.md section 4.1 and D18: a rung
 * is `new HexGeometry(hexSize / m^L, orientation, null)`. Level 0 IS the map's
 * own geometry, bounds intact. Every other rung carries `bounds = null`;
 * `existsAt` is the single existence gate and walks the ownership chain up to
 * the root's bounds. Never scale bounds down a rung: rectangular hex bounds are
 * offset-parity based and do not scale.
 *
 * Build it once, in one place (the geometry memo that feeds the renderer) and
 * keep it frozen: the static cache keys on geometry identity, so a rung
 * geometry constructed on demand would rebuild every surface every frame.
 */
import { HexGeometry } from './HexGeometry';
import { offsetToAxial } from './offsetCoordinates';
import {
  buildLadder,
  cellKey,
  chooseLevel,
  coarseCells,
  existsAt as latticeExistsAt,
  sizeOf,
  LADDER_DEFAULTS,
  type Ladder,
  type LadderParams,
} from './lattice';

export type LadderOverrides = Partial<Omit<LadderParams, 'hexSize'>>;

export interface GeometryLadder {
  readonly params: LadderParams;
  readonly ladder: Ladder;
  /** Level 0: the map's own geometry, bounds intact. */
  readonly root: HexGeometry;
  /** Frozen per-rung geometry. Level 0 returns `root`; any other level (including district rungs < 0) is bounds-free. */
  geometryForLevel(level: number): HexGeometry;
  /** World px, centre to vertex, of a level-L cell. */
  cellSizeAt(level: number): number;
  /** Active level for a zoom: the finest rung whose on-screen cell width is at least minCellPx. */
  activeLevel(zoom: number): number;
  /**
   * Existence at any rung. L >= 0: the ownership chain reaches a root cell inside the map's
   * bounds. L < 0 (district rungs): the coarse cell owns at least one in-bounds root cell.
   * An unbounded map exists everywhere at every rung.
   */
  existsAt(level: number, q: number, r: number): boolean;
}

/** Every level-0 cell inside the root bounds, or null when the map is unbounded. */
function rootCellKeys(root: HexGeometry): string[] | null {
  const bounds = root.bounds;
  if (!bounds) return null;
  if (root.renderingMode === 'radial') {
    return root.getAllRadialCells(bounds.maxRing ?? 0).map((c) => cellKey(c.q, c.r));
  }
  const keys: string[] = [];
  for (let col = 0; col < bounds.maxCol; col++) {
    for (let row = 0; row < bounds.maxRow; row++) {
      const { q, r } = offsetToAxial(col, row, root.orientation);
      keys.push(cellKey(q, r));
    }
  }
  return keys;
}

function createGeometryLadder(root: HexGeometry, overrides: LadderOverrides = {}): GeometryLadder {
  const params: LadderParams = { hexSize: root.hexSize, ...LADDER_DEFAULTS, ...overrides };
  const ladder = buildLadder(params.m);
  const levels = new Map<number, HexGeometry>([[0, root]]);
  const district = new Map<number, Set<string>>();
  let rootKeys: string[] | null | undefined;

  const cellSizeAt = (level: number): number => sizeOf(params.hexSize, params.m, level);

  const geometryForLevel = (level: number): HexGeometry => {
    if (!Number.isInteger(level)) throw new RangeError(`Ladder level must be an integer, got ${level}`);
    let geometry = levels.get(level);
    if (!geometry) {
      geometry = new HexGeometry(cellSizeAt(level), root.orientation, null);
      levels.set(level, geometry);
    }
    return geometry;
  };

  const existsAtRoot = (Q: number, R: number): boolean => root.isWithinBounds(Q, R);

  const existsAt = (level: number, q: number, r: number): boolean => {
    if (!Number.isInteger(level)) throw new RangeError(`Ladder level must be an integer, got ${level}`);
    if (level >= 0) return latticeExistsAt(ladder, level, q, r, existsAtRoot);
    if (rootKeys === undefined) rootKeys = rootCellKeys(root);
    if (rootKeys === null) return true;
    let coarse = district.get(level);
    if (!coarse) {
      coarse = coarseCells(ladder, rootKeys, level);
      district.set(level, coarse);
    }
    return coarse.has(cellKey(q, r));
  };

  return {
    params,
    ladder,
    root,
    geometryForLevel,
    cellSizeAt,
    activeLevel: (zoom: number) => chooseLevel(zoom, params),
    existsAt,
  };
}

export { createGeometryLadder };
