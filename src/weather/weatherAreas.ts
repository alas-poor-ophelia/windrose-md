/**
 * weatherAreas.ts
 *
 * Pure resolution of the weather areas of the map level being shown: each
 * weather-bound region, then the map-level ("whole map") area. A sub-hex
 * level without its own map-level zone inherits the weather of the hex it
 * was drilled from, walking up the sub-hex path to the root.
 */

// Type-only imports
import type { MapData } from '#types/core/map.types';
import type { WeatherArea } from '#types/contexts/weather.types';
import type { SubHexPath } from '../persistence/subHexPath';

import { getMapAtSubHexPath } from '../persistence/subHexPath';
import { buildMapZoneSnapshot, cellKey, hasWeatherZone, mapLevelZoneId, zoneAtHex } from './weatherZones';

/** Id of the map-level area */
const MAP_AREA_ID = 'map';

/** Parse a sub-hex hexKey ("q,r") */
function parseHexKey(key: string): { q: number; r: number } | null {
  const [q, r] = key.split(',').map(Number);
  return Number.isInteger(q) && Number.isInteger(r) ? { q, r } : null;
}

/**
 * The zone a sub-hex level inherits: the zone at the drilled hex in its
 * parent (that hex's bound region, else the parent's map-level zone),
 * walking further up while a level has none. Null at the root or when no
 * ancestor has weather there.
 */
function inheritedZoneId(root: MapData | null | undefined, path: SubHexPath): string | null {
  for (let depth = path.length; depth > 0; depth--) {
    const parent = getMapAtSubHexPath(root, path.slice(0, depth - 1));
    const hex = parseHexKey(path[depth - 1]);
    if (parent == null || hex == null) return null;
    const zone = zoneAtHex(buildMapZoneSnapshot(parent), hex.q, hex.r);
    if (zone != null) return zone;
  }
  return null;
}

/**
 * Weather areas of the level at `path`: bound regions topmost first (the
 * region drawn on top wins a shared hex, matching what the user sees),
 * then the map-level area covering every other cell.
 */
function resolveWeatherAreas(root: MapData | null | undefined, path: SubHexPath = []): WeatherArea[] {
  const level = getMapAtSubHexPath(root, path);
  if (level == null) return [];

  const areas: WeatherArea[] = [];
  const bound = (level.regions ?? []).filter(hasWeatherZone).sort((a, b) => b.order - a.order);
  for (const region of bound) {
    areas.push({
      id: `region:${region.id}`,
      kind: 'region',
      zoneId: region.weatherZoneId,
      name: region.name,
      cells: region.hexes,
      regionId: region.id,
    });
  }

  const mapZone = mapLevelZoneId(level) ?? inheritedZoneId(root, path);
  if (mapZone != null) {
    areas.push({ id: MAP_AREA_ID, kind: 'map', zoneId: mapZone, name: 'Whole map', cells: 'all' });
  }
  return areas;
}

/**
 * The Sky animation setting of the level at `path`, inherited like the
 * zone: the level's own `weatherAnimate` when set, else the nearest
 * ancestor's (walking up the sub-hex path to the root), else true.
 */
function resolveWeatherAnimate(root: MapData | null | undefined, path: SubHexPath = []): boolean {
  for (let depth = path.length; depth >= 0; depth--) {
    const level = getMapAtSubHexPath(root, path.slice(0, depth));
    const value = level?.weatherAnimate;
    if (typeof value === 'boolean') return value;
  }
  return true;
}

/**
 * A cell lookup over areas: the topmost region containing the cell, else
 * the map-level area, else null.
 */
function buildAreaLookup(areas: WeatherArea[]): (cell: { x: number; y: number }) => WeatherArea | null {
  const byCell = new Map<string, WeatherArea>();
  let wholeMap: WeatherArea | null = null;
  for (const area of areas) {
    if (area.cells === 'all') {
      wholeMap ??= area;
      continue;
    }
    for (const cell of area.cells) {
      const key = cellKey(cell.x, cell.y);
      if (!byCell.has(key)) byCell.set(key, area);
    }
  }
  return cell => byCell.get(cellKey(cell.x, cell.y)) ?? wholeMap;
}

/**
 * Same areas, same order, same zones and the same cell arrays: consumers
 * can keep the previous list (and skip a store version bump) on edits that
 * did not touch weather.
 */
function sameWeatherAreas(a: WeatherArea[], b: WeatherArea[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  return a.every((area, i) => {
    const other = b[i];
    return area.id === other.id && area.zoneId === other.zoneId && area.name === other.name && area.cells === other.cells;
  });
}

export { inheritedZoneId, resolveWeatherAreas, resolveWeatherAnimate, buildAreaLookup, sameWeatherAreas };
