/**
 * subHexPath.ts
 *
 * Pure helpers for addressing a nested sub-hex map by its PATH from the root:
 * an ordered list of "q,r" hexKeys (persisted/embedded form: '/'-joined, e.g.
 * "0,0/2,-1").
 *
 * Sub-hex navigation keeps only this path. The map shown at a level is always
 * derived from the LIVE root, and every write goes through setAtSubHexPath
 * inside a functional root update, so it lands on the latest root instead of
 * a copy taken when the user dived in (STRUCT-B-22 / DATA-04: tileset rescans,
 * journal restores and MCP writes made after a dive used to be reverted by
 * the next sub-hex edit).
 */

import type { MapData, SubHexMapData } from '#types/core/map.types';

/** hexKeys from the root down to the addressed level; empty = the root. */
type SubHexPath = readonly string[];

/** Updater for the map at a path. Returning null/undefined leaves it unchanged. */
type SubHexMapUpdater = (map: MapData) => MapData | null | undefined;

/** Split a '/'-joined path ("0,0/2,-1") into hexKeys; blank segments dropped. */
function parseSubHexPath(path: string | null | undefined): string[] {
  return (path ?? '').split('/').map(s => s.trim()).filter(s => s !== '');
}

/** '/'-joined form of a path; null for the root. */
function formatSubHexPath(path: SubHexPath): string | null {
  return path.length > 0 ? path.join('/') : null;
}

/** The map at `path` (the root itself for an empty path), or null when any segment is missing. */
function getMapAtSubHexPath(root: MapData | null | undefined, path: SubHexPath): MapData | null {
  let map: MapData | null = root ?? null;
  for (const key of path) {
    if (map == null) return null;
    map = map.subHexMaps?.[key]?.mapData ?? null;
  }
  return map;
}

/** The subHexMaps entry holding the map at `path` (null for the root or a missing segment). */
function getSubHexEntryAtPath(root: MapData | null | undefined, path: SubHexPath): SubHexMapData | null {
  if (path.length === 0) return null;
  const parent = getMapAtSubHexPath(root, path.slice(0, -1));
  return parent?.subHexMaps?.[path[path.length - 1]] ?? null;
}

/** How many leading segments of `path` resolve to an existing sub-map. */
function resolvableSubHexDepth(root: MapData | null | undefined, path: SubHexPath): number {
  let map: MapData | null = root ?? null;
  let depth = 0;
  for (const key of path) {
    map = map?.subHexMaps?.[key]?.mapData ?? null;
    if (map == null) break;
    depth++;
  }
  return depth;
}

/**
 * The ONE writer for nested sub-hex maps: a new root in which the map at
 * `path` is replaced by `updater(map)`. Each ancestor on the path is
 * shallow-copied (its subHexMaps entry gets a fresh lastModified); everything
 * off the path keeps its identity. Returns `root` unchanged (same reference)
 * when a segment is missing or the updater returns null/undefined or the
 * same map, so a write aimed at a level that no longer exists never mints it.
 */
function setAtSubHexPath(root: MapData, path: SubHexPath, updater: SubHexMapUpdater): MapData {
  if (path.length === 0) return updater(root) ?? root;

  const [key, ...rest] = path;
  const entry = root.subHexMaps?.[key];
  if (entry?.mapData == null) return root;

  const nextChild = setAtSubHexPath(entry.mapData, rest, updater);
  if (nextChild === entry.mapData) return root;

  return {
    ...root,
    subHexMaps: {
      ...root.subHexMaps,
      [key]: { ...entry, mapData: nextChild, lastModified: new Date().toISOString() }
    }
  };
}

/**
 * Add a sub-map entry at `hexKey` under the map at `parentPath`, unless one
 * already exists there (a concurrent writer that created it first wins, so
 * its content is never clobbered by a fresh empty map).
 */
function addSubHexEntryAtPath(root: MapData, parentPath: SubHexPath, hexKey: string, entry: SubHexMapData): MapData {
  return setAtSubHexPath(root, parentPath, parent =>
    parent.subHexMaps?.[hexKey] != null
      ? parent
      : { ...parent, subHexMaps: { ...parent.subHexMaps, [hexKey]: entry } }
  );
}

/**
 * Lift an update meant for the map at `path` (a whole replacement map or a
 * functional updater, as MapDataUpdater accepts) into a functional ROOT
 * updater. This is what the active-level updater hands the root store, so
 * the edit is applied to whatever the root is when it runs.
 */
function toRootUpdater(
  path: SubHexPath,
  updaterOrData: MapData | ((prev: MapData) => MapData)
): (root: MapData) => MapData {
  return (root) => setAtSubHexPath(root, path, map =>
    typeof updaterOrData === 'function' ? updaterOrData(map) : updaterOrData
  );
}

export type { SubHexPath, SubHexMapUpdater };
export {
  parseSubHexPath,
  formatSubHexPath,
  getMapAtSubHexPath,
  getSubHexEntryAtPath,
  resolvableSubHexDepth,
  setAtSubHexPath,
  addSubHexEntryAtPath,
  toRootUpdater
};
