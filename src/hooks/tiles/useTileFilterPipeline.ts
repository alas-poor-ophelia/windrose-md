/**
 * useTileFilterPipeline.ts
 *
 * The tile browser's derivation pipeline (STRUCT-A-14), extracted verbatim
 * from TileAssetBrowser: tile pool → search / tag / pack / role / geometry /
 * feature-gate filters → available tag + pack facets → cross-pack category
 * merge → grouping → rail scoping. Pure derivation over its inputs (every
 * stage is a useMemo with the same dependency list it had in the component);
 * it never reads or writes the metadata store itself — the caller passes the
 * shared-store snapshot from useTileMetadata in.
 */

import type { TileEntry, TileLayerRole, TileMetadataStore, TilesetDef, TilesetOrigin } from '#types/tiles/tile.types';

import { useMemo } from 'preact/hooks';
import { collectUniqueTags, collectDepthAwareTags, getAllTags } from '../../persistence/tileMetadata';
import { clusterCategories, NOISE, humanizePackName, detectTileGeometry } from '../../assets/categoryMerge';
import type { FolderInput } from '../../assets/categoryMerge';

interface TileFilterPipelineInput {
  tilesets: TilesetDef[];
  /** Shared-store snapshot (useTileMetadata). Read-only here. */
  tileMetadata: TileMetadataStore;
  searchFilter: string;
  activeTags: Set<string>;
  packFilter: Set<string>;
  tileDepth: TileLayerRole;
  mapType: string | undefined;
  /** Category-rail / view selection ('all' | 'recent' | 'starred' | category). */
  railSel: string;
  /** featureFlags.walls — wall/path strips are hidden when false. */
  wallsEnabled: boolean;
}

interface AvailablePack {
  id: string;
  name: string;
  short: string;
  count: number;
  origin: TilesetOrigin;
}

interface MergedCategories {
  lookup: Map<string, string>;
  meta: Map<string, { folders: number; packs: number }>;
}

interface TileFilterPipeline {
  allTiles: TileEntry[];
  tileToTilesetId: Map<string, string>;
  availableTags: string[];
  filteredTiles: TileEntry[];
  availablePacks: AvailablePack[];
  mergedCategories: MergedCategories;
  groupedTiles: Map<string, TileEntry[]>;
  openCategoryMerge: { folders: number; packs: number } | null;
  shownGroups: Array<[string, TileEntry[]]>;
}

function useTileFilterPipeline({
  tilesets,
  tileMetadata,
  searchFilter,
  activeTags,
  packFilter,
  tileDepth,
  mapType,
  railSel,
  wallsEnabled,
}: TileFilterPipelineInput): TileFilterPipeline {
  // Merge all tileset tiles into a single pool. Wall/path strips are browsable
  // (selecting one arms the wall tool); their `_end` caps stay hidden — caps
  // are referenced indirectly via the strip's wallEndCapPath metadata.
  const allTiles = useMemo(() => {
    const tiles: TileEntry[] = [];
    for (const ts of tilesets) {
      for (const t of ts.tiles) {
        const e = tileMetadata[t.vaultPath];
        if (e?.isWallEndCap === true) continue;
        tiles.push(t);
      }
    }
    return tiles;
  }, [tilesets, tileMetadata]);

  // Map vaultPath → tilesetId for click handlers
  const tileToTilesetId = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of tilesets) {
      for (const t of ts.tiles) map.set(t.vaultPath, ts.id);
    }
    return map;
  }, [tilesets]);

  // Collect available tags for the filter chips, then drop folder/pack noise.
  // A tag is junk if it contains a grid/packaging NOISE word (hex/set/pack/… —
  // semantic tags never do, only folder & pack names) or matches a pack/dev-id
  // pattern (e.g. "FCWallsDev1": no spaces, mixes letters + digits). Clean tags
  // like "walls"/"wooden" survive. Search still matches every tag (getAllTags).
  const availableTags = useMemo(() => {
    if (allTiles.length === 0) return [];
    const raw = mapType === 'grid'
      ? collectDepthAwareTags(allTiles, tileMetadata, tileDepth)
      : collectUniqueTags(allTiles, tileMetadata);
    return raw.filter(tag => {
      if (!/\s/.test(tag) && /[a-z]/i.test(tag) && /\d/.test(tag)) return false;
      for (const piece of tag.toLowerCase().split(/[/_\-\s&,()]+/)) {
        const tok = piece.replace(/[^a-z]/g, '');
        if (tok !== '' && NOISE.has(tok)) return false;
      }
      return true;
    });
  }, [allTiles, tileMetadata, tileDepth, mapType]);

  const filteredTiles = useMemo(() => {
    if (allTiles.length === 0) return [];
    let tiles = allTiles;

    // Text search (includes import + user tags via metadata)
    if (searchFilter != null && searchFilter !== '') {
      const lower = searchFilter.toLowerCase();
      tiles = tiles.filter((t: TileEntry) => {
        if (t.filename.toLowerCase().includes(lower)) return true;
        if (t.category != null && t.category !== '' && t.category.toLowerCase().includes(lower)) return true;
        const tags = getAllTags(t, tileMetadata);
        return tags.some(tag => tag.toLowerCase().includes(lower));
      });
    }

    // Tag filter (AND logic, includes import + user tags)
    if (activeTags.size > 0) {
      tiles = tiles.filter((t: TileEntry) => {
        const tags = getAllTags(t, tileMetadata);
        const lowerTags = tags.map(tag => tag.toLowerCase());
        return Array.from(activeTags).every(tag => lowerTags.includes(tag.toLowerCase()));
      });
    }

    // Pack filter (OR within packs, AND with the other facets)
    if (packFilter.size > 0) {
      tiles = tiles.filter((t: TileEntry) => packFilter.has(tileToTilesetId.get(t.vaultPath) ?? 'unknown'));
    }

    // Role filter: on grid maps the depth selector scopes the rail to the active
    // role. A classified tile shows under its role; an unclassified tile (no
    // depthAffinity yet) is treated as 'ground' — the base role per
    // DEFAULT_TILE_LAYERS — so the non-ground roles stay clean and untagged
    // tiles land on Terrain rather than bleeding across every role.
    // Read-only use of depthAffinity (no persistence → no RCA risk).
    if (mapType === 'grid') {
      tiles = tiles.filter((t: TileEntry) => {
        const meta = tileMetadata[t.vaultPath];
        // Wall strips never receive a depthAffinity (strips are excluded from
        // depth prediction by design), but per the design IA a wall is a
        // line-form tile in the Structure role — route them there instead of
        // letting the unclassified fallback shelve them under Terrain.
        const affinity = meta?.depthAffinity
          ?? (meta?.ddSourceType?.toLowerCase() === 'walls' ? 'structure' : 'ground');
        return affinity === tileDepth;
      });
    }

    // Silent geometry scope: hide a tile only when its own folder/tags EXPLICITLY
    // declare the other geometry (a "Hex Forest" terrain on a grid map). Tiles with
    // no geometry signal are agnostic and show everywhere. Read-only derivation — no
    // metadata write, so it never touches placed-tile rendering. Backs the Filter
    // panel's "auto · {mapType} map" note row.
    tiles = tiles.filter((t: TileEntry) => {
      const geom = detectTileGeometry(t.category ?? '', getAllTags(t, tileMetadata));
      return geom == null || geom === mapType;
    });

    // Feature gate: wall/path strips arm the wall tool on select, so hide them
    // entirely when the walls feature is disabled (placed walls still render).
    if (!wallsEnabled) {
      tiles = tiles.filter((t: TileEntry) => {
        const src = tileMetadata[t.vaultPath]?.ddSourceType?.toLowerCase();
        return src !== 'walls' && src !== 'paths';
      });
    }

    return tiles;
  }, [allTiles, searchFilter, activeTags, packFilter, tileToTilesetId, tileMetadata, tileDepth, mapType, wallsEnabled]);

  // Packs present in the current role, for the Pack filter facet — with a
  // humanized short label and a per-pack count, scoped to the active depth on
  // grid maps (mirrors filteredTiles' role filter) so chips match the spec's
  // `packsHere`. Count ignores search/tag/pack filters so it stays stable.
  const availablePacks = useMemo((): AvailablePack[] => {
    const counts = new Map<string, number>();
    for (const tile of allTiles) {
      if (mapType === 'grid') {
        const affinity = tileMetadata[tile.vaultPath]?.depthAffinity ?? 'ground';
        if (affinity !== tileDepth) continue;
      }
      const id = tileToTilesetId.get(tile.vaultPath);
      if (id == null) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return tilesets
      .filter(ts => counts.has(ts.id))
      .map(ts => ({
        id: ts.id,
        name: ts.name,
        short: humanizePackName(ts.name),
        count: counts.get(ts.id) ?? 0,
        origin: ts.origin ?? 'native',
      }));
  }, [allTiles, tileToTilesetId, tilesets, tileMetadata, tileDepth, mapType]);

  // Cross-pack category merge (Phase 2): collapse messy import-time folders into
  // one canonical category, with cross-pack duplicates merged. Built over ALL tiles
  // so the category set stays stable regardless of search/tag filtering. Keyed by
  // `${pack}|${rawCategory}` so the same folder name in different packs resolves
  // independently. Replaces the old pack-name-prefix disambiguation.
  const mergedCategories = useMemo((): MergedCategories => {
    const seen = new Set<string>();
    const folders: FolderInput[] = [];
    for (const tile of allTiles) {
      // Organize's Move… reassigns the category home read-time; the raw
      // folder-derived category is never rewritten (lossless).
      const raw = tileMetadata[tile.vaultPath]?.categoryOverride ?? tile.category ?? 'Uncategorized';
      const pack = tileToTilesetId.get(tile.vaultPath) ?? 'unknown';
      const key = `${pack}|${raw}`;
      if (!seen.has(key)) {
        seen.add(key);
        folders.push({ raw, pack });
      }
    }
    const lookup = new Map<string, string>();
    // Per-canonical-label provenance for the merge banner (only where a merge happened).
    const meta = new Map<string, { folders: number; packs: number }>();
    for (const c of clusterCategories(folders)) {
      for (const m of c.members) lookup.set(`${m.pack}|${m.raw}`, c.label);
      if (c.merged) {
        const packs = new Set(c.members.map(m => m.pack));
        meta.set(c.label, { folders: c.members.length, packs: packs.size });
      }
    }
    return { lookup, meta };
  }, [allTiles, tileToTilesetId, tileMetadata]);

  const groupedTiles = useMemo(() => {
    const groups = new Map<string, TileEntry[]>();
    for (const tile of filteredTiles) {
      const raw = tileMetadata[tile.vaultPath]?.categoryOverride ?? tile.category ?? 'Uncategorized';
      const pack = tileToTilesetId.get(tile.vaultPath) ?? 'unknown';
      const cat = mergedCategories.lookup.get(`${pack}|${raw}`) ?? raw;
      const bucket = groups.get(cat);
      if (bucket === undefined) {
        groups.set(cat, [tile]);
      } else {
        bucket.push(tile);
      }
    }
    return groups;
  }, [filteredTiles, mergedCategories, tileToTilesetId, tileMetadata]);

  // Merge banner (Option B): provenance for the currently-open single category.
  const openCategoryMerge = useMemo(() => {
    if (railSel === 'all' || railSel === 'recent' || railSel === 'starred') return null;
    return mergedCategories.meta.get(railSel) ?? null;
  }, [railSel, mergedCategories]);

  // Resolve which groups to show based on rail selection
  const shownGroups = useMemo((): Array<[string, TileEntry[]]> => {
    const entries = Array.from(groupedTiles.entries());
    if (railSel === 'all' || railSel === 'recent' || railSel === 'starred') return entries;
    return entries.filter(([cat]) => cat === railSel);
  }, [groupedTiles, railSel]);

  return {
    allTiles,
    tileToTilesetId,
    availableTags,
    filteredTiles,
    availablePacks,
    mergedCategories,
    groupedTiles,
    openCategoryMerge,
    shownGroups,
  };
}

export { useTileFilterPipeline };
export type { TileFilterPipelineInput, TileFilterPipeline, AvailablePack, MergedCategories };
