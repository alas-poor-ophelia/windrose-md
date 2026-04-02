/**
 * tilesetOperations.ts
 * Operations for importing and managing hex tile sets from vault folders.
 */

import type { TilesetDef, TileEntry } from '#types/tiles/tile.types';

// ===========================================
// Constants
// ===========================================

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

// ===========================================
// ID Generation
// ===========================================

/** Generate a unique tileset ID */
function generateTilesetId(): string {
  return 'tileset-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
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

// ===========================================
// Folder Scanning
// ===========================================

/**
 * Scan a vault folder for tile images.
 * Returns TileEntry[] with subfolder-based categories.
 */
function scanTilesetFolder(folderPath: string): TileEntry[] {
  const allFiles = app.vault.getFiles();
  const normalizedFolder = folderPath.endsWith('/')
    ? folderPath.slice(0, -1)
    : folderPath;

  const tiles: TileEntry[] = [];

  for (const file of allFiles) {
    // Must be inside the target folder
    if (!file.path.startsWith(normalizedFolder + '/')) continue;

    // Must be an image
    const ext = file.extension?.toLowerCase();
    if (!ext || !IMAGE_EXTENSIONS.has(ext)) continue;

    // Determine category from immediate subfolder
    const relativePath = file.path.slice(normalizedFolder.length + 1);
    const parts = relativePath.split('/');
    const category = parts.length > 1 ? parts[0] : undefined;

    // ID = filename without extension
    const id = file.basename;

    tiles.push({
      id,
      filename: file.name,
      vaultPath: file.path,
      category,
    });
  }

  return tiles;
}

// ===========================================
// Tileset Creation
// ===========================================

/**
 * Create a TilesetDef by scanning a vault folder for tile images.
 */
function createTileset(
  folderPath: string,
  name: string,
  options?: {
    tileWidth?: number;
    tileHeight?: number;
    hexHeight?: number;
    overflowTop?: number;
    overflowBottom?: number;
  }
): TilesetDef {
  const tiles = scanTilesetFolder(folderPath);
  const tileWidth = options?.tileWidth ?? 256;
  const tileHeight = options?.tileHeight ?? 256;

  const detected = autoDetectOverflow(tileWidth, tileHeight);

  return {
    id: generateTilesetId(),
    name,
    folderPath,
    tileWidth,
    tileHeight,
    hexHeight: options?.hexHeight ?? detected.hexHeight,
    overflowTop: options?.overflowTop ?? detected.overflowTop,
    overflowBottom: options?.overflowBottom ?? detected.overflowBottom,
    tiles,
  };
}

// ===========================================
// Module Exports
// ===========================================

return {
  scanTilesetFolder,
  createTileset,
  autoDetectOverflow,
  generateTilesetId,
};
