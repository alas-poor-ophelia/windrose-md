/**
 * weatherZones.ts
 *
 * Pure lookups from map cells to weather zones. A region carries an
 * optional `weatherZoneId` (absent = no weather); its member hexes inherit
 * the zone; a map may also carry a map-level `weatherZoneId` that covers
 * every hex no bound region claims. Also the registry of mounted maps the
 * weather plugin's zone resolver reads, and the per-segment fold used by
 * route travel times.
 */

// Type-only imports
import type { Point } from '#types/core/geometry.types';
import type { MapData, Region } from '#types/core/map.types';
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
 * from the cells each segment crosses. `zoneAt` answers the weather zone of
 * a cell (null = no weather). A segment that touches no weather comes back
 * as the neutral effect, so the result always lines up with the route's
 * segment arrays.
 */
function computeSegmentWeatherEffects(
  points: Point[],
  getCellsInLine: (x1: number, y1: number, x2: number, y2: number) => Point[],
  zoneAt: (x: number, y: number) => string | null,
  effectForZone: (zoneId: string) => WeatherTravelEffect | null
): WeatherTravelEffect[] {
  const effects: WeatherTravelEffect[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const cells = getCellsInLine(a.x, a.y, b.x, b.y);
    effects.push(combineCellEffects(cells.map(cell => {
      const zoneId = zoneAt(cell.x, cell.y);
      return zoneId != null ? effectForZone(zoneId) : null;
    })));
  }
  return effects;
}

// ===========================================
// Map zone snapshots (zone resolver backing)
// ===========================================

/** Everything the zone resolver needs to answer for one map */
export interface MapZoneSnapshot {
  /** Hex cell key → zone of the topmost bound region */
  cells: CellZoneIndex;
  /** Region id → zone */
  regions: Map<string, string>;
  /** The map-level zone ("whole map"), or null */
  mapZoneId: string | null;
}

/** Zone fields of a map (root or sub-hex level) */
type ZoneSource = Pick<MapData, 'regions' | 'weatherZoneId'> | null | undefined;

function mapLevelZoneId(map: ZoneSource): string | null {
  const id = map?.weatherZoneId;
  return typeof id === 'string' && id !== '' ? id : null;
}

function buildMapZoneSnapshot(map: ZoneSource): MapZoneSnapshot {
  const regions = new Map<string, string>();
  for (const region of map?.regions ?? []) {
    if (hasWeatherZone(region)) regions.set(region.id, region.weatherZoneId);
  }
  return { cells: buildCellZoneIndex(map?.regions), regions, mapZoneId: mapLevelZoneId(map) };
}

/** Zone at a hex: its bound region's, else the map-level zone, else null */
function zoneAtHex(snapshot: MapZoneSnapshot, q: number, r: number): string | null {
  return snapshot.cells.get(cellKey(q, r)) ?? snapshot.mapZoneId;
}

/** Zone a region is bound to, else the map-level zone (a region of an unbound map has none) */
function zoneOfRegion(snapshot: MapZoneSnapshot, regionId: string): string | null {
  return snapshot.regions.get(regionId) ?? snapshot.mapZoneId;
}

// ===========================================
// Mounted-map registry
// ===========================================

/**
 * The weather plugin's synchronous resolver can only answer for maps that
 * are open, so each mounted map publishes a snapshot of its ROOT level
 * here (WeatherProvider). Unmounted maps are answered by resolveAsync.
 */
const mountedMapZones = new Map<string, MapZoneSnapshot[]>();

/**
 * Publish a mounted map's snapshot; returns the retraction for unmount. One
 * map can be open in several views at once (an embed and a full pane), so
 * each view's snapshot is kept and closing one leaves the others answering.
 */
function publishMapZones(mapId: string, snapshot: MapZoneSnapshot): () => void {
  const published = mountedMapZones.get(mapId) ?? [];
  published.push(snapshot);
  mountedMapZones.set(mapId, published);
  return () => {
    const remaining = (mountedMapZones.get(mapId) ?? []).filter(entry => entry !== snapshot);
    if (remaining.length > 0) mountedMapZones.set(mapId, remaining);
    else mountedMapZones.delete(mapId);
  };
}

/** The latest published snapshot of an open map, or null when it is not open */
function getMountedMapZones(mapId: string): MapZoneSnapshot | null {
  const published = mountedMapZones.get(mapId);
  // Most recently published view first: it holds the latest edit
  return published != null && published.length > 0 ? published[published.length - 1] : null;
}

/** Zone at a hex of an open map, or null (no weather there, or map not open) */
function resolveMountedHexZone(mapId: string, q: number, r: number): string | null {
  const snapshot = getMountedMapZones(mapId);
  return snapshot != null ? zoneAtHex(snapshot, q, r) : null;
}

export type { CellZoneIndex };
export {
  cellKey,
  hasWeatherZone,
  mapLevelZoneId,
  buildCellZoneIndex,
  collectBoundZoneIds,
  computeSegmentWeatherEffects,
  buildMapZoneSnapshot,
  zoneAtHex,
  zoneOfRegion,
  publishMapZones,
  getMountedMapZones,
  resolveMountedHexZone,
};
