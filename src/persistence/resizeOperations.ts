/**
 * resizeOperations.ts
 *
 * Pure helpers that let "what does this map contain" readers and the hex-bounds
 * resize writer see cells stored on ladder rungs >= 1 (`layer.levels`).
 *
 * Rung cells live in their rung's OWN axial coordinates, so every per-cell
 * question goes through a `GeometryLadder`: `geometryForLevel(L)` for world
 * placement, `existsAt(L, q, r)` for "is this inside the root bounds".
 *
 * Classic maps carry no rungs: `ladderForAuthoredRungs` returns null and every
 * caller reduces to its level-0 loop.
 */

import type { HexBounds, MapData, MapLayer } from '#types/core/map.types';
import { isHexCell } from '#types/core/cell.types';

import { HexGeometry } from '../geometry/core/HexGeometry';
import { createGeometryLadder, type GeometryLadder } from '../geometry/core/createGeometryLadder';
import { isDepthQuarantined, ladderParamsFor } from '../core/lodFlags';
import { DEFAULTS } from '../core/dmtConstants';
import { authoredCells, authoredLevels, setLevelCells } from './layerAccessor';

/** True when any layer holds authored cells on a rung >= 1. */
function hasAuthoredRungs(mapData: MapData): boolean {
  return (mapData.layers ?? []).some(layer => authoredLevels(layer).some(level => level >= 1));
}

/**
 * Ladder rooted at `root` (a hex geometry carrying the bounds to test against),
 * or null when no layer has rung cells. The ladder's hexSize comes from `root`;
 * m / minCellPx / maxLevel come from the map (`lod`, else defaults).
 */
function ladderForAuthoredRungs(mapData: MapData, root: HexGeometry): GeometryLadder | null {
  if (!hasAuthoredRungs(mapData)) return null;
  // A quarantined map keeps its bytes untouched (design 06, s19 item 1): its
  // rungs are neither counted nor filtered, and an invalid `lod` never reaches
  // createGeometryLadder, which throws on it.
  if (isDepthQuarantined(mapData).quarantined) return null;
  const { m, minCellPx, maxLevel } = ladderParamsFor(mapData);
  return createGeometryLadder(root, { m, minCellPx, maxLevel });
}

/** Number of rung (>= 1) cells on `layer` whose lattice ancestor falls outside the ladder's root bounds. */
function countLevelOrphans(layer: MapLayer, ladder: GeometryLadder): number {
  let orphans = 0;
  for (const level of authoredLevels(layer)) {
    if (level === 0) continue;
    for (const cell of authoredCells(layer, level)) {
      if (!isHexCell(cell) || !ladder.existsAt(level, cell.q, cell.r)) orphans++;
    }
  }
  return orphans;
}

/**
 * Rung orphans on `layer` if the map were resized to `bounds` (the map's own
 * hexSize and orientation). 0 for classic maps (no rungs, no ladder built).
 */
function countLevelOrphansForBounds(mapData: MapData, layer: MapLayer, bounds: HexBounds): number {
  if (mapData.mapType !== 'hex') return 0;
  const root = new HexGeometry(mapData.hexSize ?? DEFAULTS.hexSize, mapData.orientation ?? 'flat', bounds);
  const ladder = ladderForAuthoredRungs(mapData, root);
  return ladder === null ? 0 : countLevelOrphans(layer, ladder);
}

/**
 * Drop every rung (>= 1) cell, on every layer, that no longer exists under the
 * ladder's root bounds. Writes only through `setLevelCells`, so an emptied rung
 * (and an emptied `levels` container) is deleted. Level 0 is not touched.
 * Returns the same `mapData` reference when nothing is removed.
 */
function filterLevelsToBounds(mapData: MapData, ladder: GeometryLadder): MapData {
  let next = mapData;
  for (const layer of mapData.layers ?? []) {
    for (const level of authoredLevels(layer)) {
      if (level === 0) continue;
      const cells = authoredCells(layer, level);
      const kept = cells.filter(cell => isHexCell(cell) && ladder.existsAt(level, cell.q, cell.r));
      if (kept.length !== cells.length) next = setLevelCells(next, layer.id, level, kept);
    }
  }
  return next;
}

export { hasAuthoredRungs, ladderForAuthoredRungs, countLevelOrphans, countLevelOrphansForBounds, filterLevelsToBounds };
