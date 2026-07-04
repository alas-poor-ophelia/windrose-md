/**
 * tilesetOperations.ts
 * Operations for importing and managing hex tile sets from vault folders.
 */

import type { TilesetDef, FolderTileset, TileEntry, TilesetOrigin } from '#types/tiles/tile.types';
import { TFile } from 'obsidian';
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

      // Auto-derive tags from subfolder path segments
      const tags = parts.length > 1 ? parts.slice(0, -1) : undefined;

      const slashIdx = filePath.lastIndexOf('/');
      const filename = slashIdx >= 0 ? filePath.slice(slashIdx + 1) : filePath;
      const id = filename.slice(0, filename.lastIndexOf('.'));

      tiles.push({ id, filename, vaultPath: filePath, category, tags });
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
    if (!(file instanceof TFile)) return null;

    const binary = await app.vault.readBinary(file);
    const blob = new Blob([binary]);
    const url = URL.createObjectURL(blob);

    const result = await new Promise<number | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (w === 0 || h === 0) { resolve(null); URL.revokeObjectURL(url); return; }

        const canvas = activeWindow.createEl('canvas');
        canvas.width = w;
        canvas.height = h;
        // willReadFrequently: software-backed canvas so getImageData doesn't stall the GPU.
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
async function probeFirstTileImage(app: App, tiles: TileEntry[]): Promise<{ width: number; height: number; alphaCoverage?: number; artOrientation?: 'flat' | 'pointy' } | null> {
  const MIN_SIZE = 64;
  const MAX_PROBES = 5;
  const sizes: { width: number; height: number }[] = [];
  // First probed tile per size key, for art-orientation classification of the winner
  const firstTileBySize = new Map<string, TileEntry>();

  for (const tile of tiles) {
    if (sizes.length >= MAX_PROBES) break;
    try {
      const file = app.vault.getAbstractFileByPath(tile.vaultPath);
      if (!(file instanceof TFile)) continue;

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
        const key = `${dims.width}x${dims.height}`;
        if (!firstTileBySize.has(key)) firstTileBySize.set(key, tile);
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

  const sample = firstTileBySize.get(`${best.width}x${best.height}`);
  const artOrientation = sample ? await detectArtOrientation(app, sample) : undefined;

  return { ...best, artOrientation };
}

/** Alpha coverage threshold: above this → hex-filling (fill), below → stamp (contain) */
const ALPHA_COVERAGE_THRESHOLD = 0.6;

// ===========================================
// Art Orientation Detection
// ===========================================

/** Alpha value above which a pixel counts as opaque for mask analysis. */
const MASK_ALPHA_THRESHOLD = 25;
/** Opaque-bbox coverage above this reads as square/rect art, not a hexagon. */
const MASK_SQUARE_COVERAGE = 0.88;
/** A hexagon has a straight-edge zone spanning a large fraction of its bbox
 *  (full-width rows for pointy art, full-height columns for flat art). Blobby
 *  props (trees, rocks) don't — this gate keeps them out of adaptation. */
const MASK_HEX_EDGE_FRACTION = 0.18;
/** Bottom-band width below this fraction of the bbox = bottom vertex (pointy). */
const MASK_POINTY_BOTTOM_FRACTION = 0.38;

/**
 * Classify hexagonal tile art orientation from its opaque mask.
 * Pure — operates on an alpha accessor so tests can feed synthetic masks.
 *
 * Pointy-top art narrows to a vertex at the bottom of its opaque bounds;
 * flat-top art ends in a wide horizontal edge. Square-ish art (seamless
 * textures) and non-hexagonal props return undefined (no adaptation).
 */
function classifyTileArtMask(
  alphaAt: (x: number, y: number) => number,
  width: number,
  height: number
): 'flat' | 'pointy' | undefined {
  let minX = width, maxX = -1, minY = height, maxY = -1;
  let opaque = 0;
  // Row/column opaque extents in one pass
  const rowMin = new Array<number>(height).fill(width);
  const rowMax = new Array<number>(height).fill(-1);
  const colMin = new Array<number>(width).fill(height);
  const colMax = new Array<number>(width).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (alphaAt(x, y) <= MASK_ALPHA_THRESHOLD) continue;
      opaque++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (x < rowMin[y]) rowMin[y] = x;
      if (x > rowMax[y]) rowMax[y] = x;
      if (y < colMin[x]) colMin[x] = y;
      if (y > colMax[x]) colMax[x] = y;
    }
  }
  if (maxX < 0) return undefined;

  const bboxW = maxX - minX + 1;
  const bboxH = maxY - minY + 1;
  if (bboxW < 8 || bboxH < 8) return undefined;

  const coverage = opaque / (bboxW * bboxH);
  if (coverage > MASK_SQUARE_COVERAGE) return undefined;

  // Hexagon signature: pointy art has a run of full-width rows (its vertical
  // edges); flat art has a run of full-height columns. Either qualifies.
  let fullWidthRows = 0;
  for (let y = minY; y <= maxY; y++) {
    if (rowMax[y] >= 0 && (rowMax[y] - rowMin[y] + 1) >= bboxW * 0.97) fullWidthRows++;
  }
  let fullHeightCols = 0;
  for (let x = minX; x <= maxX; x++) {
    if (colMax[x] >= 0 && (colMax[x] - colMin[x] + 1) >= bboxH * 0.97) fullHeightCols++;
  }
  const edgeFraction = Math.max(fullWidthRows / bboxH, fullHeightCols / bboxW);
  if (edgeFraction < MASK_HEX_EDGE_FRACTION) return undefined;

  // Bottom band: vertex (narrow) = pointy, edge (wide) = flat. The bottom is
  // used rather than the top because overflow art (tree canopy, mountain
  // peaks) sits above the hex area, never below it.
  const bandStart = maxY - Math.max(2, Math.round(bboxH * 0.05));
  let bandWidth = 0;
  for (let y = Math.max(minY, bandStart); y <= maxY; y++) {
    if (rowMax[y] >= 0) bandWidth = Math.max(bandWidth, rowMax[y] - rowMin[y] + 1);
  }
  return bandWidth / bboxW < MASK_POINTY_BOTTOM_FRACTION ? 'pointy' : 'flat';
}

/**
 * Detect a tileset's art orientation by decoding one representative image
 * (the first probed at the dominant size) and classifying its alpha mask.
 */
async function detectArtOrientation(app: App, tile: TileEntry): Promise<'flat' | 'pointy' | undefined> {
  try {
    const file = app.vault.getAbstractFileByPath(tile.vaultPath);
    if (!(file instanceof TFile)) return undefined;
    const binary = await app.vault.readBinary(file);
    const url = URL.createObjectURL(new Blob([binary]));
    return await new Promise<'flat' | 'pointy' | undefined>((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const w = img.naturalWidth;
          const h = img.naturalHeight;
          const canvas = activeWindow.createEl('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx || w === 0 || h === 0) { resolve(undefined); return; }
          ctx.drawImage(img, 0, 0);
          const data = ctx.getImageData(0, 0, w, h).data;
          resolve(classifyTileArtMask((x, y) => data[(y * w + x) * 4 + 3], w, h));
        } catch {
          resolve(undefined);
        } finally {
          URL.revokeObjectURL(url);
        }
      };
      img.onerror = () => { resolve(undefined); URL.revokeObjectURL(url); };
      img.src = url;
    });
  } catch {
    return undefined;
  }
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
    hexHeight: options?.hexHeight ?? detected.hexHeight,
    overflowTop: options?.overflowTop ?? detected.overflowTop,
    overflowBottom: options?.overflowBottom ?? detected.overflowBottom,
    fitMode: options?.fitMode,
    artOrientation: options?.artOrientation,
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
    artOrientation?: 'flat' | 'pointy';
  }
): Promise<TilesetDef> {
  const tiles = await scanTilesetFolder(getApp(), folderPath);
  return createTilesetFromTiles(folderPath, name, tiles, options);
}

// ===========================================
// Module Exports
// ===========================================

export { scanTilesetFolder, createTileset, createTilesetFromTiles, probeFirstTileImage, measureAlphaCoverage, autoDetectOverflow, generateTilesetId, classifyTileArtMask, detectArtOrientation, ALPHA_COVERAGE_THRESHOLD };