/**
 * tilesetOperations.ts
 * Tileset construction plus a re-export barrel over tileIds, tilesetScan and
 * tileArtAnalysis (kept so existing importers need no changes).
 */

import type { FolderTileset, TileEntry, TilesetOrigin } from '#types/tiles/tile.types';

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
  return 'tileset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 11);
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

export { scanTilesetFolder } from './tilesetScan';
export { mintTileId, tileIdBasename, resolveTileEntry, resolveTileEntryIndexed, getTileEntryIndex } from './tileIds';
export { measureAlphaCoverage, probeCandidateOrder, probeFirstTileImage, readTileImageBinary, classifyTileArtMask, analyzeTileArtMask, detectHexArtAnalysis, fitHexCellCenterY, ALPHA_COVERAGE_THRESHOLD } from './tileArtAnalysis';
export type { HexArtMask, HexArtAnalysis } from './tileArtAnalysis';
export { createTilesetFromTiles, autoDetectOverflow, generateTilesetId };
