/**
 * weatherZones.ts
 *
 * Pure lookups from map cells to weather zones. A region carries an
 * optional `weatherZoneId` (absent = no weather); its member hexes inherit
 * the zone. Also the registry of mounted maps the weather plugin's zone
 * resolver reads, and the per-segment fold used by route travel times.
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { Region } from '#types/core/map.types';
import type { WeatherTravelEffect } from './weatherTravelRules';

import { combineCellEffects } from './weatherTravelRules';

/** Cell key → weather zone id, for every hex of every bound region */
type CellZoneIndex = Map<string, string>;

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

/** True when the region is bound to a weather zone */
function hasWeatherZone(region: Region): region is Region & { weatherZoneId: string } {
  return typeof region.weatherZoneId === 'string' && region.weatherZoneId !== '';
}

/**
 * Index every bound region's hexes by cell. Region membership is exclusive
 * in the editor; should data ever overlap, the region drawn on top (higher
 * `order`) wins, matching what the user sees.
 */
function buildCellZoneIndex(regions: Region[] | null | undefined): CellZoneIndex {
  const index: CellZoneIndex = new Map();
  if (regions == null) return index;
  const bound = regions.filter(hasWeatherZone).sort((a, b) => a.order - b.order);
  for (const region of bound) {
    for (const hex of region.hexes) {
      index.set(cellKey(hex.x, hex.y), region.weatherZoneId);
    }
  }
  return index;
}

/** The distinct zone ids a map's regions are bound to */
function collectBoundZoneIds(regions: Region[] | null | undefined): string[] {
  const ids: string[] = [];
  for (const region of regions ?? []) {
    if (hasWeatherZone(region) && !ids.includes(region.weatherZoneId)) ids.push(region.weatherZoneId);
  }
  return ids;
}

/**
 * Weather effect per route segment (index i = points[i] → points[i+1]),
 * from the cells each segment crosses. A segment that touches no weather
 * comes back as the neutral effect, so the result always lines up with the
 * route's segment arrays.
 */
function computeSegmentWeatherEffects(
  points: Point[],
  getCellsInLine: (x1: number, y1: number, x2: number, y2: number) => Point[],
  cellZones: CellZoneIndex,
  effectForZone: (zoneId: string) => WeatherTravelEffect | null
): WeatherTravelEffect[] {
  const effects: WeatherTravelEffect[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cells = getCellsInLine(a.x, a.y, b.x, b.y);
    effects.push(combineCellEffects(cells.map(cell => {
      const zoneId = cellZones.get(cellKey(cell.x, cell.y));
      return zoneId != null ? effectForZone(zoneId) : null;
    })));
  }
  return effects;
}

// ===========================================
// Mounted-map registry (zone resolver backing)
// ===========================================

/**
 * The weather plugin's zone resolver is synchronous and map data loads
 * asynchronously, so only maps currently open can answer "which zone is
 * this hex in". Each mounted map publishes its index here.
 */
const mountedMapZones = new Map<string, CellZoneIndex[]>();

/**
 * Publish a mounted map's index; returns the retraction for unmount. One
 * map can be open in several views at once (an embed and a full pane), so
 * each view's index is kept and closing one leaves the others answering.
 */
function publishMapZones(mapId: string, index: CellZoneIndex): () => void {
  const published = mountedMapZones.get(mapId) ?? [];
  published.push(index);
  mountedMapZones.set(mapId, published);
  return () => {
    const remaining = (mountedMapZones.get(mapId) ?? []).filter(entry => entry !== index);
    if (remaining.length > 0) mountedMapZones.set(mapId, remaining);
    else mountedMapZones.delete(mapId);
  };
}

/** Zone bound at a hex of an open map, or null (unbound hex, or map not open) */
function resolveMountedHexZone(mapId: string, q: number, r: number): string | null {
  const published = mountedMapZones.get(mapId);
  if (published == null) return null;
  // Most recently published view first: it holds the latest edit
  return published[published.length - 1].get(cellKey(q, r)) ?? null;
}

export type { CellZoneIndex };
export {
  hasWeatherZone,
  buildCellZoneIndex,
  collectBoundZoneIds,
  computeSegmentWeatherEffects,
  publishMapZones,
  resolveMountedHexZone,
};
