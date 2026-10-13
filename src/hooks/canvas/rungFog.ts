/**
 * Fog of war for elements homed on a finer ladder rung (kgc.23 b).
 *
 * Fog is level-0 cell data: `isCellFogged(layer, col, row)` takes OFFSET coords
 * on the ROOT geometry. The object renderer, drawing a depth group on its home
 * rung's geometry, asks with that rung's offset coords instead. This wraps the
 * predicate so a rung >= 1 query is answered at the cell's root ancestor:
 * rung offset -> rung axial -> `ladder.ancestorAt(home, q, r)` -> root offset.
 * A deep object under a fogged root hex is then hidden exactly as a root object
 * would be. Freeform deep objects need no special case: their `position` is
 * already the nearest rung cell.
 *
 * Rung geometries share the root's orientation (createGeometryLadder), so the
 * offset <-> axial conversion is the same on every rung.
 */
import type { MapLayer } from '#types/core/map.types';
import type { GeometryLadder } from '../../geometry/core/createGeometryLadder';
import { offsetToAxial } from '../../geometry/core/offsetCoordinates';

type FogPredicate = (layer: MapLayer, col: number, row: number) => boolean;

const NEVER_FOGGED: FogPredicate = () => false;

/**
 * `isCellFogged` for elements homed on rung `home`, taking that rung's offset
 * coords. Level 0 returns the predicate unchanged. District rungs (home < 0)
 * have no single root ancestor and are never fogged, as before.
 *
 * The root hex is the one CONTAINING the rung cell's centre, not its lattice
 * owner: `ancestorAt` (nested nearest-centre roundings) disagrees with
 * containment for about one deep cell in eight (lattice.test.ts oracle), and
 * fog is a visual question: what the eye sees under a fogged hex is hidden.
 * The same rule drives the smart tile clip (tileClipRegion).
 */
function rungFogPredicate(ladder: GeometryLadder, home: number, isCellFogged: FogPredicate): FogPredicate {
  if (home === 0) return isCellFogged;
  if (home < 0) return NEVER_FOGGED;
  const { root } = ladder;
  const rung = ladder.geometryForLevel(home);
  return (layer, col, row) => {
    const { q, r } = offsetToAxial(col, row, root.orientation);
    const centre = rung.getCellCenter(q, r);
    const container = root.worldToGrid(centre.worldX, centre.worldY);
    const offset = root.toOffsetCoords(container.x, container.y);
    return isCellFogged(layer, offset.col, offset.row);
  };
}

/** Object-renderer deps with `isCellFogged` mapped to the root for rung `home`. */
function fogDepsForRung<D extends { isCellFogged: FogPredicate }>(ladder: GeometryLadder, home: number, deps: D): D {
  if (home === 0) return deps;
  return { ...deps, isCellFogged: rungFogPredicate(ladder, home, deps.isCellFogged) };
}

export type { FogPredicate };
export { rungFogPredicate, fogDepsForRung };
