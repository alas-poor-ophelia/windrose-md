/**
 * tileIds.ts
 * Tile id minting and tileId -> TileEntry resolution (pure, hot path).
 * All stored tilesetId/tileId resolution must go through resolveTileEntry().
 */

import type { TilesetDef, TileEntry } from '#types/tiles/tile.types';

/**
 * Mint a tile id from its folder-relative path: the relative path with the
 * extension stripped. Unique across subfolders by construction (paths are
 * unique), and root-level tiles keep their historical basename-derived ids —
 * placements saved under those never need remapping. If two files in one
 * folder share a stem (rock.png + rock.webp), later ones keep the extension.
 */
function mintTileId(relativePath: string, seenIds: Set<string>): string {
  const dotIdx = relativePath.lastIndexOf('.');
  const stem = dotIdx > 0 ? relativePath.slice(0, dotIdx) : relativePath;
  const id = seenIds.has(stem) ? relativePath : stem;
  seenIds.add(id);
  return id;
}

/** Last path segment of a tile id. Folder-relative ids ("terrain/Natural/X")
 *  reduce to their basename ("X") for legacy-reference matching. */
function tileIdBasename(id: string): string {
  const idx = id.lastIndexOf('/');
  return idx >= 0 ? id.slice(idx + 1) : id;
}

/**
 * Resolve a tile entry within a tileset by tile ID.
 *
 * Single source of truth for tileId → TileEntry resolution — every lookup of
 * a stored tilesetId/tileId pair must go through this (or mirror its
 * semantics exactly, as the renderer's entry map does):
 *   1. Exact id match — FIRST occurrence wins. Dungeondraft packs reuse
 *      basenames across subfolders, so ids can be duplicated within one
 *      tileset; divergent pick order between resolution sites renders
 *      placements invisible (preloader loads one twin, renderer asks the
 *      cache for the other).
 *   2. Legacy fallback — match the basename of a folder-relative entry id,
 *      so placements saved under old basename-derived ids keep resolving
 *      after ids become folder-relative paths.
 */
function resolveTileEntry(
  tileset: Pick<TilesetDef, 'tiles'> | undefined,
  tileId: string | undefined
): TileEntry | undefined {
  if (tileset == null || tileId == null || tileId === '') return undefined;
  let legacy: TileEntry | undefined;
  for (const entry of tileset.tiles) {
    if (entry.id === tileId) return entry;
    if (legacy === undefined && entry.id !== tileIdBasename(entry.id) && tileIdBasename(entry.id) === tileId) {
      legacy = entry;
    }
  }
  return legacy;
}

/**
 * Lookup index over one tileset's entries: every exact id plus every legacy
 * basename alias, with resolveTileEntry's precedence baked in (exact id
 * first-wins beats any alias; among aliases the first folder-relative entry
 * wins). Built once per `tiles` array identity — rescans and id re-mints
 * always REPLACE the array, so a WeakMap keyed on it never goes stale and is
 * collected with it. Per-tileset (not per-map), so two open maps sharing or
 * not sharing tilesets never evict each other (STRUCT-B-08 / MEM-10).
 */
const tileEntryIndexCache = new WeakMap<readonly TileEntry[], Map<string, TileEntry>>();

function getTileEntryIndex(tileset: Pick<TilesetDef, 'tiles'>): Map<string, TileEntry> {
  const tiles = tileset.tiles;
  let index = tileEntryIndexCache.get(tiles);
  if (index === undefined) {
    index = new Map<string, TileEntry>();
    for (const entry of tiles) {
      if (!index.has(entry.id)) index.set(entry.id, entry);
    }
    for (const entry of tiles) {
      const base = tileIdBasename(entry.id);
      if (base !== entry.id && !index.has(base)) index.set(base, entry);
    }
    tileEntryIndexCache.set(tiles, index);
  }
  return index;
}

/**
 * Constant-time resolveTileEntry for hot paths (the renderer resolves every
 * placed tile every frame). Same contract and same answer as resolveTileEntry.
 */
function resolveTileEntryIndexed(
  tileset: Pick<TilesetDef, 'tiles'> | undefined,
  tileId: string | undefined
): TileEntry | undefined {
  if (tileset == null || tileId == null || tileId === '') return undefined;
  return getTileEntryIndex(tileset).get(tileId);
}

export { mintTileId, tileIdBasename, resolveTileEntry, resolveTileEntryIndexed, getTileEntryIndex };
