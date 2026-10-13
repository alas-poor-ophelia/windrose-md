/**
 * foggedCellIndex.ts
 *
 * Constant-time fogged-cell lookup (STRUCT-B-05). layerAccessor.isCellFogged
 * scans the foggedCells array linearly; object rendering, hover and drag-select
 * call it per object (per footprint cell) per frame, and a "fog all" map stores
 * one entry per cell. This builds a Set of "col,row" keys once per foggedCells
 * array identity. Fog updates are immutable (a changed fog state is a new
 * array), so a WeakMap keyed on the array never goes stale and is collected
 * with the array.
 */

import type { FoggedCell, MapLayer } from '#types/core/map.types';

type FoggedCellList = readonly FoggedCell[];

const indexCache = new WeakMap<FoggedCellList, Set<string>>();

function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

/** The Set of "col,row" keys for a foggedCells array, built once per array. */
function getFoggedCellSet(foggedCells: FoggedCellList): Set<string> {
  let set = indexCache.get(foggedCells);
  if (set === undefined) {
    set = new Set<string>();
    for (const c of foggedCells) set.add(cellKey(c.col, c.row));
    indexCache.set(foggedCells, set);
  }
  return set;
}

/**
 * Same contract as layerAccessor.isCellFogged (false when fog is absent or
 * disabled), answered from the cached Set instead of a linear scan.
 */
function isCellFoggedIndexed(layer: MapLayer, col: number, row: number): boolean {
  const fow = layer.fogOfWar;
  if (!fow || !fow.enabled) return false;
  return getFoggedCellSet(fow.foggedCells).has(cellKey(col, row));
}

export { isCellFoggedIndexed, getFoggedCellSet };
