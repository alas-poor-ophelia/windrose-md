/**
 * tilesetOperations.ts
 * Tileset construction plus a re-export barrel over tileIds, tilesetScan and
 * tileArtAnalysis (kept so existing importers need no changes).
 */

import { mintId } from '../core/ids';
import type { FolderTileset, TileEntry, TilesetDef, TilesetOrigin } from '#types/tiles/tile.types';
import type { MapData } from '#types/core/map.types';
import type { PluginSettings } from '#types/settings/settings.types';
import type { App } from 'obsidian';
import { scanTilesetFolder } from './tilesetScan';
import { probeFirstTileImage } from './tileArtAnalysis';

/** Generate a deterministic tileset ID from folder path */
function generateTilesetId(folderPath?: string): string {
  if (folderPath != null && folderPath !== '') {
    // Deterministic: same folder always produces the same ID
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      hash = ((hash << 5) - hash + folderPath.charCodeAt(i)) | 0;
    }
    return 'tileset-' + Math.abs(hash).toString(36);
  }
  return mintId('tileset');
}

// ===========================================
// Dimension Helpers
// ===========================================

/**
 * Auto-detect overflow from tile dimensions.
 * If tileHeight > tileWidth, the excess is treated as top overflow
 * (e.g. tree canopy extending above the hex area).
 */
function autoDetectOverflow(tileWidth: number, tileHeight: number): {
  hexHeight: number;
  overflowTop: number;
  overflowBottom: number;
} {
  if (tileHeight > tileWidth) {
    return {
      hexHeight: tileWidth,
      overflowTop: tileHeight - tileWidth,
      overflowBottom: 0,
    };
  }
  return {
    hexHeight: tileHeight,
    overflowTop: 0,
    overflowBottom: 0,
  };
}

/**
 * Create a TilesetDef by scanning a vault folder for tile images.
 * Call probeFirstTileImage() first for accurate dimensions.
 */
function createTilesetFromTiles(
  folderPath: string,
  name: string,
  tiles: TileEntry[],
  options?: {
    tileWidth?: number;
    tileHeight?: number;
    hexWidth?: number;
    hexHeight?: number;
    fitMode?: 'fill' | 'contain';
    overflowTop?: number;
    overflowBottom?: number;
    artOrientation?: 'flat' | 'pointy';
  }
): FolderTileset {
  const tileWidth = options?.tileWidth ?? 256;
  const tileHeight = options?.tileHeight ?? 256;

  const detected = autoDetectOverflow(tileWidth, tileHeight);

  // Provenance: Dungeondraft imports extract under `.../dungeondraft-packs/`,
  // so a tile path under that segment marks the whole set as DD-origin.
  const origin: TilesetOrigin = tiles.some(t => t.vaultPath.includes('/dungeondraft-packs/'))
    ? 'dungeondraft'
    : 'native';

  return {
    source: 'folder' as const,
    id: generateTilesetId(folderPath),
    name,
    origin,
    folderPath,
    tileWidth,
    tileHeight,
    hexWidth: options?.hexWidth,
    hexHeight: options?.hexHeight ?? detected.hexHeight,
    overflowTop: options?.overflowTop ?? detected.overflowTop,
    overflowBottom: options?.overflowBottom ?? detected.overflowBottom,
    fitMode: options?.fitMode,
    artOrientation: options?.artOrientation,
    tiles,
  };
}

/**
 * Build the folder tilesets for every folder in `settings.tilesetFolders`.
 * Folder tilesets are not persisted on the map, so anything that renders a map
 * (mounted or not) rebuilds them here. `scanFailed` is true when any folder
 * threw; callers keep their existing registry when nothing scanned and
 * something failed.
 */
async function buildTilesetsFromSettings(
  app: App,
  settings: Pick<PluginSettings, 'installedContentPacks'> & { tilesetFolders?: string[] }
): Promise<{ tilesets: TilesetDef[]; scanFailed: boolean }> {
  const folders = (settings.tilesetFolders ?? []).filter((f: string) => f.trim() !== '');
  const installedPacks = settings.installedContentPacks ?? [];
  const tilesets: TilesetDef[] = [];
  let scanFailed = false;
  for (const folder of folders) {
    try {
      const parts = folder.split('/');
      const packName = installedPacks.find(p => p.vaultPath === folder)?.name;
      const name = packName ?? (parts[parts.length - 1] || folder);

      const tiles = await scanTilesetFolder(app, folder);
      const dims = await probeFirstTileImage(app, tiles);
      const options = dims
        ? {
            tileWidth: dims.width,
            tileHeight: dims.height,
            artOrientation: dims.artOrientation,
            hexWidth: dims.hexWidth,
            hexHeight: dims.hexHeight,
            overflowTop: dims.overflowTop,
          }
        : undefined;

      const tileset = createTilesetFromTiles(folder, name, tiles, options);
      if (tileset.tiles.length > 0) tilesets.push(tileset);
    } catch (e) {
      scanFailed = true;
      console.warn('[Windrose] Failed to scan tileset folder:', folder, e);
    }
  }
  return { tilesets, scanFailed };
}

/** Merge freshly built tilesets into a map: per-map overrides first, then the
 *  GLOBAL art offsets/scales from settings. Returns `current` unchanged when
 *  there is nothing to register and nothing registered. */
function applyBuiltTilesets(
  current: MapData,
  built: TilesetDef[],
  settings: Pick<PluginSettings, 'tilesetArtOffsets' | 'tilesetArtScales'>
): MapData {
  if (built.length === 0 && (current.tilesets?.length ?? 0) === 0) return current;
  const overrides = current.tilesetOverrides;
  const artOffsets = settings.tilesetArtOffsets ?? {};
  const artScales = settings.tilesetArtScales ?? {};
  const merged = built.map(ts => {
    const ov = overrides?.[ts.id];
    let m = ov != null ? { ...ts, ...ov } : ts;
    const nudge = artOffsets[ts.id];
    if (nudge != null) m = { ...m, artOffsetY: nudge };
    const scale = artScales[ts.id];
    if (scale != null) m = { ...m, artScale: scale };
    return m;
  });
  return { ...current, tilesets: merged };
}

/**
 * Install-time carry for a tree read from the store or a crash journal: its
 * folder tilesets hold `tiles: []` (derived lists are stripped on save), so
 * each one takes the tile list of the LIVE map's tileset with the same id (or
 * folder path). `needsRebuild` is true when some empty folder tileset found no
 * populated live match, i.e. only a builder rescan can fill it. Returns
 * `incoming` itself when nothing was carried. Root registry only: nested
 * sub-hex maps render from the root's tilesets.
 */
function carryLiveTileLists(incoming: MapData, live: MapData | null): { data: MapData; needsRebuild: boolean } {
  const src = incoming.tilesets;
  if (!Array.isArray(src)) return { data: incoming, needsRebuild: false };
  const liveSets = live?.tilesets ?? [];
  let out: TilesetDef[] | null = null;
  let needsRebuild = false;
  for (let i = 0; i < src.length; i++) {
    const ts = src[i];
    if (ts.source === 'sheet' || (ts.tiles?.length ?? 0) > 0) continue;
    const match = liveSets.find(l => l.id === ts.id || (l.source !== 'sheet' && ts.folderPath != null && l.folderPath === ts.folderPath));
    if (match == null || match.tiles.length === 0) { needsRebuild = true; continue; }
    out ??= src.slice();
    out[i] = { ...ts, tiles: match.tiles };
  }
  return { data: out != null ? { ...incoming, tilesets: out } : incoming, needsRebuild };
}

export { scanTilesetFolder };
export { mintTileId, tileIdBasename, resolveTileEntry, resolveTileEntryIndexed, getTileEntryIndex } from './tileIds';
export { measureAlphaCoverage, probeCandidateOrder, probeFirstTileImage, readTileImageBinary, classifyTileArtMask, analyzeTileArtMask, detectHexArtAnalysis, fitHexCellCenterY, ALPHA_COVERAGE_THRESHOLD } from './tileArtAnalysis';
export type { HexArtMask, HexArtAnalysis } from './tileArtAnalysis';
export { buildTilesetsFromSettings, applyBuiltTilesets, carryLiveTileLists, createTilesetFromTiles, autoDetectOverflow, generateTilesetId };
