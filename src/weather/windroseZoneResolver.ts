/**
 * windroseZoneResolver.ts
 *
 * Windrose's answers to the weather plugin's "which zone is this place in":
 *
 * - `{ kind: 'hex', mapId, q, r }` — axial hex of a Windrose map: the zone of
 *   the topmost weather-bound region on that hex, else the map-level zone.
 * - `{ kind: 'custom', namespace: 'windrose.region', data: { mapId, regionId } }`
 *   — a named Windrose region: its zone, else the map-level zone.
 *
 * `resolve` answers synchronously for maps open in some view (their
 * published root snapshot). `resolveAsync` also answers for maps that are
 * not open, by reading the stored entry READ-ONLY through `loadMap`; the
 * parsed zone fields are cached per map until the data file is modified
 * (getDataFileStamp: any vault modify/delete/rename of the file). Never
 * writes, never shows a Notice.
 */

// Type-only imports
import type { MapData } from '#types/core/map.types';
import type { WadjetZoneLocator } from '#types/integrations/wadjet.types';
import type { WindroseZoneAnswers } from './wadjetBridge';
import type { MapZoneSnapshot } from './weatherZones';

import { getDataFileStamp } from '../persistence/storeCache';
import { buildMapZoneSnapshot, getMountedMapZones, zoneAtHex, zoneOfRegion } from './weatherZones';

/** Custom locator namespace for Windrose regions */
const WINDROSE_REGION_NAMESPACE = 'windrose.region';

/** Reads a stored map (never writes); null when absent or unreadable */
type MapLoader = (mapId: string) => Promise<Pick<MapData, 'regions' | 'weatherZoneId'> | null>;

type ParsedLocator =
  | { kind: 'hex'; mapId: string; q: number; r: number }
  | { kind: 'region'; mapId: string; regionId: string };

function parseLocator(locator: WadjetZoneLocator | null | undefined): ParsedLocator | null {
  if (locator == null || typeof locator !== 'object') return null;
  if (locator.kind === 'hex') {
    const { mapId, q, r } = locator;
    return typeof mapId === 'string' && Number.isInteger(q) && Number.isInteger(r) ? { kind: 'hex', mapId, q, r } : null;
  }
  if (locator.kind === 'custom' && locator.namespace === WINDROSE_REGION_NAMESPACE) {
    const data = locator.data as { mapId?: unknown; regionId?: unknown } | null | undefined;
    const mapId = data?.mapId;
    const regionId = data?.regionId;
    return typeof mapId === 'string' && typeof regionId === 'string' ? { kind: 'region', mapId, regionId } : null;
  }
  return null;
}

function answer(snapshot: MapZoneSnapshot, parsed: ParsedLocator): string | null {
  return parsed.kind === 'hex'
    ? zoneAtHex(snapshot, parsed.q, parsed.r)
    : zoneOfRegion(snapshot, parsed.regionId);
}

/**
 * `getSourceStamp` names the version of the stored data: a closed map's
 * parsed zones are reused while it is unchanged (default: the data file's
 * modification stamp).
 */
function createWindroseZoneAnswers(loadMap: MapLoader, getSourceStamp: () => string = getDataFileStamp): WindroseZoneAnswers {
  /** mapId → zone snapshot of the stored (closed) map, and the stamp it was read at */
  const closedMaps = new Map<string, { stamp: string; snapshot: MapZoneSnapshot | null }>();

  const resolve = (locator: WadjetZoneLocator): string | null => {
    const parsed = parseLocator(locator);
    if (parsed == null) return null;
    const snapshot = getMountedMapZones(parsed.mapId);
    return snapshot != null ? answer(snapshot, parsed) : null;
  };

  const resolveAsync = async (locator: WadjetZoneLocator): Promise<string | null> => {
    const parsed = parseLocator(locator);
    if (parsed == null) return null;
    const mounted = getMountedMapZones(parsed.mapId);
    if (mounted != null) return answer(mounted, parsed);
    // Stamp taken BEFORE the read: a modification landing during it makes
    // the entry stale at once rather than hiding the change
    const stamp = getSourceStamp();
    const cached = closedMaps.get(parsed.mapId);
    if (cached != null && cached.stamp === stamp) {
      return cached.snapshot != null ? answer(cached.snapshot, parsed) : null;
    }
    try {
      const map = await loadMap(parsed.mapId);
      const snapshot = map != null ? buildMapZoneSnapshot(map) : null;
      closedMaps.set(parsed.mapId, { stamp, snapshot });
      return snapshot != null ? answer(snapshot, parsed) : null;
    } catch {
      return null;
    }
  };

  return { resolve, resolveAsync };
}

/** A MapLoader over a raw stored-entry reader (JSON text or null) */
function mapLoaderFromRawEntries(readRawEntry: (mapId: string) => Promise<string | null>): MapLoader {
  return async (mapId: string) => {
    const text = await readRawEntry(mapId);
    if (text == null) return null;
    const parsed = JSON.parse(text) as unknown;
    if (parsed == null || typeof parsed !== 'object') return null;
    const { regions, weatherZoneId } = parsed as Partial<MapData>;
    return {
      regions: Array.isArray(regions) ? regions.filter(region => region != null && Array.isArray(region.hexes)) : undefined,
      weatherZoneId: typeof weatherZoneId === 'string' ? weatherZoneId : undefined,
    };
  };
}

export { createWindroseZoneAnswers, mapLoaderFromRawEntries };
