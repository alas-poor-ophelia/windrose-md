/**
 * resizeOperations.ts
 *
 * Pure helpers that let "what does this map contain" readers and the hex-bounds
 * resize writer see cells stored on ladder rungs >= 1 (`layer.levels`) and
 * elements homed on them (objects, text labels, tiles with `homeLevel > 0`).
 *
 * Rung cells live in their rung's OWN axial coordinates, so every per-cell
 * question goes through a `GeometryLadder`: `geometryForLevel(L)` for world
 * placement, `existsAt(L, q, r)` for "is this inside the root bounds".
 *
 * Classic maps carry no depth content: `ladderForAuthoredRungs` returns null
 * and every caller reduces to its level-0 loop.
 */

import type { HexBounds, MapData, MapLayer } from '#types/core/map.types';
import { isHexCell } from '#types/core/cell.types';

import { HexGeometry } from '../geometry/core/HexGeometry';
import { createGeometryLadder, type GeometryLadder } from '../geometry/core/createGeometryLadder';
import { hasDepthContent, isDepthQuarantined, ladderParamsFor } from '../core/lodFlags';
import { DEFAULTS } from '../core/dmtConstants';
import { homeLevelOf } from '../core/homeLevel';
import { authoredCells, authoredLevels, setLevelCells } from './layerAccessor';

/**
 * Ladder rooted at `root` (a hex geometry carrying the bounds to test against),
 * or null when no layer has rung cells or elements homed on a rung >= 1. The
 * ladder's hexSize comes from `root`; m / minCellPx / maxLevel come from the
 * map (`lod`, else defaults).
 */
function ladderForAuthoredRungs(mapData: MapData, root: HexGeometry): GeometryLadder | null {
  if (!hasDepthContent(mapData)) return null;
  // A quarantined map keeps its bytes untouched (design 06, s19 item 1): its
  // rungs are neither counted nor filtered, and an invalid `lod` never reaches
  // createGeometryLadder, which throws on it. A resize must not proceed
  // silently over such a map: see depthResizeBlocker.
  if (isDepthQuarantined(mapData).quarantined) return null;
  const { m, minCellPx, maxLevel } = ladderParamsFor(mapData);
  return createGeometryLadder(root, { m, minCellPx, maxLevel });
}

type HomedList = 'objects' | 'textLabels' | 'tiles';
const HOMED_LISTS: readonly HomedList[] = ['objects', 'textLabels', 'tiles'];

/**
 * Does a homed element's rung cell still exist under the ladder's root bounds?
 * Objects and snapped tiles index their home rung's lattice (position, or
 * col/row). Text labels, freeform objects and freeform tiles sit at world
 * coordinates, which every rung shares, so they are snapped onto the home rung
 * first.
 */
function homedElementExists(list: HomedList, item: unknown, home: number, ladder: GeometryLadder): boolean {
  const atWorld = (x: number, y: number): boolean => {
    const cell = ladder.geometryForLevel(home).worldToGrid(x, y);
    return ladder.existsAt(home, cell.x, cell.y);
  };
  if (list === 'textLabels') {
    const { position } = item as { position: { x: number; y: number } };
    return atWorld(position.x, position.y);
  }
  if (list === 'tiles') {
    const tile = item as { col: number; row: number; freeform?: boolean; worldX?: number; worldY?: number };
    if (tile.freeform === true && tile.worldX !== undefined && tile.worldY !== undefined) return atWorld(tile.worldX, tile.worldY);
    return ladder.existsAt(home, tile.col, tile.row);
  }
  const obj = item as { position: { x: number; y: number }; freeform?: boolean; worldPosition?: { x: number; y: number } | null };
  if (obj.freeform === true && obj.worldPosition != null) return atWorld(obj.worldPosition.x, obj.worldPosition.y);
  return ladder.existsAt(home, obj.position.x, obj.position.y);
}

/** Is `item` an element homed on a rung >= 1 whose rung cell falls outside the ladder's root bounds? */
function isHomedOrphan(list: HomedList, item: unknown, ladder: GeometryLadder): boolean {
  const home = homeLevelOf(item);
  return home > 0 && !homedElementExists(list, item, home, ladder);
}

/** Homed (rung >= 1) objects, text labels and tiles on `layer` whose rung cell falls outside the ladder's root bounds. */
function countHomedOrphans(layer: MapLayer, ladder: GeometryLadder): number {
  let orphans = 0;
  for (const list of HOMED_LISTS) {
    for (const item of (layer[list] ?? []) as unknown[]) {
      if (isHomedOrphan(list, item, ladder)) orphans++;
    }
  }
  return orphans;
}

/**
 * Depth content on `layer` whose lattice ancestor falls outside the ladder's
 * root bounds: rung (>= 1) cells plus homed objects, text labels and tiles.
 */
function countLevelOrphans(layer: MapLayer, ladder: GeometryLadder): number {
  let orphans = 0;
  for (const level of authoredLevels(layer)) {
    if (level === 0) continue;
    for (const cell of authoredCells(layer, level)) {
      if (!isHexCell(cell) || !ladder.existsAt(level, cell.q, cell.r)) orphans++;
    }
  }
  return orphans + countHomedOrphans(layer, ladder);
}

/** All depth content on `layer`: rung (>= 1) cells plus homed elements. */
function countDepthContent(layer: MapLayer): number {
  let count = 0;
  for (const level of authoredLevels(layer)) {
    if (level >= 1) count += authoredCells(layer, level).length;
  }
  for (const list of HOMED_LISTS) {
    for (const item of (layer[list] ?? []) as unknown[]) {
      if (homeLevelOf(item) > 0) count++;
    }
  }
  return count;
}

/**
 * Why a hex-bounds resize cannot account for this map's depth content, or null
 * when it can. A quarantined map builds no ladder (its `lod` is missing or
 * invalid), so its rung cells and homed elements can be neither tested nor
 * filtered, and a shrink would strand them. Callers should refuse the shrink
 * (or confirm with this reason) rather than proceed silently.
 */
function depthResizeBlocker(mapData: MapData): string | null {
  if (mapData.mapType !== 'hex' || !hasDepthContent(mapData)) return null;
  const { quarantined, reason } = isDepthQuarantined(mapData);
  return quarantined ? `depth content is quarantined (${reason ?? 'unknown'})` : null;
}

/**
 * Depth orphans on `layer` if the map were resized to `bounds` (the map's own
 * hexSize and orientation). 0 for classic maps (no depth content, no ladder).
 * A quarantined map with depth content cannot be tested against a ladder, so
 * ALL of that layer's depth content is reported: the resize confirm dialog
 * opens instead of the shrink stranding it silently (Codex review).
 */
function countLevelOrphansForBounds(mapData: MapData, layer: MapLayer, bounds: HexBounds): number {
  if (mapData.mapType !== 'hex') return 0;
  if (depthResizeBlocker(mapData) !== null) return countDepthContent(layer);
  const root = new HexGeometry(mapData.hexSize ?? DEFAULTS.hexSize, mapData.orientation ?? 'flat', bounds);
  const ladder = ladderForAuthoredRungs(mapData, root);
  return ladder === null ? 0 : countLevelOrphans(layer, ladder);
}

/**
 * Drop every rung (>= 1) cell, and every object, text label and tile homed on
 * a rung >= 1, on every layer, that no longer exists under the ladder's root
 * bounds. Rung cells are written only through `setLevelCells`, so an emptied
 * rung (and an emptied `levels` container) is deleted. Level 0 is not touched.
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
  let layersChanged = false;
  const layers = (next.layers ?? []).map((layer) => {
    let patched: MapLayer = layer;
    for (const list of HOMED_LISTS) {
      const items = layer[list] as unknown[] | undefined;
      if (items === undefined) continue;
      const kept = items.filter(item => !isHomedOrphan(list, item, ladder));
      if (kept.length !== items.length) patched = { ...patched, [list]: kept };
    }
    if (patched !== layer) layersChanged = true;
    return patched;
  });
  return layersChanged ? { ...next, layers } : next;
}

export {
  ladderForAuthoredRungs, countLevelOrphans, countLevelOrphansForBounds,
  depthResizeBlocker, filterLevelsToBounds
};
