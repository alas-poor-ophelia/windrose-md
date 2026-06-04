/**
 * tilesetOperations.ts
 * Operations for importing and managing hex tile sets from vault folders.
 */

import type { TilesetDef, FolderTileset, TileEntry } from '#types/tiles/tile.types';
import type { App } from 'obsidian';

import { getApp } from '../core/settingsAccessor';

// ===========================================
// Constants
// ===========================================

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

// ===========================================
// ID Generation
// ===========================================

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
 * Scan a vault folder for tile images using adapter.list() for folder-scoped
 * listing instead of vault.getFiles() which walks every file in the vault.
 * Returns TileEntry[] with subfolder-based categories.
 */
async function scanTilesetFolder(app: App, folderPath: string): Promise<TileEntry[]> {
  const normalizedFolder = folderPath.endsWith('/')
    ? folderPath.slice(0, -1)
    : folderPath;

  const tiles: TileEntry[] = [];

  // Recursively collect image files via adapter.list (folder-scoped, not vault-wide)
  const queue = [normalizedFolder];
  while (queue.length > 0) {
    const dir = queue.pop();
    if (dir == null) continue;
    let listing: { files: string[]; folders: string[] };
    try {
      listing = await app.vault.adapter.list(dir);
    } catch {
      continue; // folder may not exist
    }

    for (const sub of listing.folders) {
      queue.push(sub);
    }

    for (const filePath of listing.files) {
      const dotIdx = filePath.lastIndexOf('.');
      if (dotIdx < 0) continue;
      const ext = filePath.slice(dotIdx + 1).toLowerCase();
      if (!IMAGE_EXTENSIONS.has(ext)) continue;

      const relativePath = filePath.slice(normalizedFolder.length + 1);
      const parts = relativePath.split('/');
      const category = parts.length > 1 ? parts.slice(0, -1).join('/') : undefined;

      const slashIdx = filePath.lastIndexOf('/');
      const filename = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
      const id = filename.slice(0, filename.lastIndexOf('.'));

      tiles.push({ id, filename, vaultPath: filePath, category });
    }
  }

  return tiles;
}

// ===========================================
// Tileset Creation
// ===========================================

/**
 * Measure alpha coverage of a tile image (fraction of non-transparent pixels).
 * Used to auto-detect fitMode: high coverage = hex-filling terrain, low = stamp/object.
 */
async function measureAlphaCoverage(app: App, tile: TileEntry): Promise<number | null> {
  try {
    const file = app.vault.getAbstractFileByPath(tile.vaultPath);
    if (!file) return null;

    const binary = await app.vault.readBinary(file as import('obsidian').TFile);
    const blob = new Blob([binary]);
    const url = URL.createObjectURL(blob);

    const result = await new Promise<number | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w === 0 || h === 0) { resolve(null); URL.revokeObjectURL(url); return; }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); URL.revokeObjectURL(url); return; }
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, w, h).data;

        let opaque = 0;
        const total = w * h;
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 10) opaque++;
        }

        resolve(opaque / total);
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { resolve(null); URL.revokeObjectURL(url); };
      img.src = url;
    });

    return result;
  } catch {
    return null;
  }
}

/**
 * Probe tile images to find the dominant (most common) pixel dimensions.
 * Samples up to 5 images, skipping tiny ones (< 64px), and returns
 * the most frequently occurring size plus alpha coverage for fitMode detection.
 */
async function probeFirstTileImage(app: App, tiles: TileEntry[]): Promise<{ width: number; height: number; alphaCoverage?: number } | null> {
  const MIN_SIZE = 64;
  const MAX_PROBES = 5;
  const sizes: { width: number; height: number }[] = [];

  for (const tile of tiles) {
    if (sizes.length >= MAX_PROBES) break;
    try {
      const file = app.vault.getAbstractFileByPath(tile.vaultPath);
      if (!file) continue;

      const binary = await app.vault.readBinary(file as import('obsidian').TFile);
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

  return { ...best };
}

/** Alpha coverage threshold: above this → hex-filling (fill), below → stamp (contain) */
const ALPHA_COVERAGE_THRESHOLD = 0.6;

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
    hexHeight?: number;
    fitMode?: 'fill' | 'contain';
    overflowTop?: number;
    overflowBottom?: number;
  }
): FolderTileset {
  const tileWidth = options?.tileWidth ?? 256;
  const tileHeight = options?.tileHeight ?? 256;

  const detected = autoDetectOverflow(tileWidth, tileHeight);

  return {
    source: 'folder' as const,
    id: generateTilesetId(folderPath),
    name,
    folderPath,
    tileWidth,
    tileHeight,
    hexHeight: options?.hexHeight ?? detected.hexHeight,
    overflowTop: options?.overflowTop ?? detected.overflowTop,
    overflowBottom: options?.overflowBottom ?? detected.overflowBottom,
    fitMode: options?.fitMode,
    tiles,
  };
}

async function createTileset(
  folderPath: string,
  name: string,
  options?: {
    tileWidth?: number;
    tileHeight?: number;
    hexHeight?: number;
    fitMode?: 'fill' | 'contain';
    overflowTop?: number;
    overflowBottom?: number;
  }
): Promise<TilesetDef> {
  const tiles = await scanTilesetFolder(getApp(), folderPath);
  return createTilesetFromTiles(folderPath, name, tiles, options);
}

// ===========================================
// Module Exports
// ===========================================

export { scanTilesetFolder, createTileset, createTilesetFromTiles, probeFirstTileImage, measureAlphaCoverage, autoDetectOverflow, generateTilesetId, ALPHA_COVERAGE_THRESHOLD };