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

/** Generate a deterministic tileset ID from folder path */
function generateTilesetId(folderPath?: string): string {
  if (folderPath) {
    // Deterministic: same folder always produces the same ID
    let hash = 0;
    for (let i = 0; i < folderPath.length; i++) {
      hash = ((hash << 5) - hash + folderPath.charCodeAt(i)) | 0;
    }
    return 'tileset-' + Math.abs(hash).toString(36);
  }
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
 * Probe tile images to find the dominant (most common) pixel dimensions.
 * Samples up to 5 images, skipping tiny ones (< 64px), and returns
 * the most frequently occurring size.
 */
async function probeFirstTileImage(tiles: TileEntry[]): Promise<{ width: number; height: number } | null> {
  const MIN_SIZE = 64;
  const MAX_PROBES = 5;
  const sizes: { width: number; height: number }[] = [];

  for (const tile of tiles) {
    if (sizes.length >= MAX_PROBES) break;
    try {
      const file = app.vault.getAbstractFileByPath(tile.vaultPath);
      if (!file) continue;

      const binary = await app.vault.readBinary(file);
      const blob = new Blob([binary]);
      const url = URL.createObjectURL(blob);

      const dims = await new Promise<{ width: number; height: number } | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
          URL.revokeObjectURL(url);
        };
        img.onerror = () => {
          resolve(null);
          URL.revokeObjectURL(url);
        };
        img.src = url;
      });

      if (dims && dims.width >= MIN_SIZE && dims.height >= MIN_SIZE) {
        sizes.push(dims);
      }
    } catch {
      continue;
    }
  }

  if (sizes.length === 0) return null;

  // Return the most common size
  const counts = new Map<string, { count: number; dims: { width: number; height: number } }>();
  for (const s of sizes) {
    const key = `${s.width}x${s.height}`;
    const entry = counts.get(key);
    if (entry) {
      entry.count++;
    } else {
      counts.set(key, { count: 1, dims: s });
    }
  }

  let best = sizes[0];
  let bestCount = 0;
  for (const entry of counts.values()) {
    if (entry.count > bestCount) {
      bestCount = entry.count;
      best = entry.dims;
    }
  }

  return best;
}

/**
 * Create a TilesetDef by scanning a vault folder for tile images.
 * Call probeFirstTileImage() first for accurate dimensions.
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
    id: generateTilesetId(folderPath),
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
  probeFirstTileImage,
  autoDetectOverflow,
  generateTilesetId,
};
