/**
 * imageOperations.ts
 *
 * Utilities for working with vault images:
 * - Building image index for autocomplete
 * - Loading and caching images
 * - Calculating grid dimensions from image size
 */

import type {
  HexOrientation,
  ImageDimensions,
  GridCalculation,
  GridDensityPreset,
} from '#types/settings/settings.types';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

import { getApp } from '../core/settingsAccessor';

/** Image file index entry */
interface ImageIndexEntry {
  path: string;
  displayName: string;
}

/** Grid density presets map */
type GridDensityPresets = Record<string, GridDensityPreset>;

// Module-level caches (persist across renders)
const imageCache = new Map<string, HTMLImageElement>();
const loadingPromises = new Map<string, Promise<HTMLImageElement | null>>();
const dimensionsCache = new Map<string, ImageDimensions>();
const pinnedImages = new Set<string>();

/**
 * Downscaled render-source cache. Large tile source images (e.g. Dungeondraft
 * "fill" terrain textures at 2560px+) are 6.5MP+; the first time one is drawn the
 * GPU uploads the full texture, stalling a render frame (~200ms) — and it repeats
 * whenever the LRU evicts and reloads it. We build a capped copy ONCE at load time
 * (off the render frame) and hand THAT to the whole-image tile draw path, so the
 * renderer never uploads the full-res texture during a gesture. Keyed by the
 * source image element, so it is GC'd when the image is evicted. Full-res stays in
 * imageCache for alpha-scans / wall sub-rect draws / naturalWidth math.
 */
const TILE_RENDER_SOURCE_MAX_PX = 1280;
const renderSourceCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();

/** Bumped whenever an image finishes loading into the cache. Lets render-side
 *  caches (static-layer cache) key on "the set of ready images changed". */
let imageCacheVersion = 0;

function getImageCacheVersion(): number {
  return imageCacheVersion;
}

let MAX_CACHE_SIZE = 200;

function setMaxCacheSize(size: number): void {
  MAX_CACHE_SIZE = size;
}

function pinImage(path: string): void {
  pinnedImages.add(path);
}

function unpinImage(path: string): void {
  pinnedImages.delete(path);
}

/** Move key to end of Map (most recently used position) */
function touchCacheEntry(key: string): void {
  const value = imageCache.get(key);
  if (value !== undefined) {
    imageCache.delete(key);
    imageCache.set(key, value);
  }
}

/** Evict oldest non-pinned entries until cache is within MAX_CACHE_SIZE */
function evictIfNeeded(): void {
  while (imageCache.size > MAX_CACHE_SIZE) {
    let evicted = false;
    for (const key of imageCache.keys()) {
      if (!pinnedImages.has(key)) {
        clearCachedImage(key);
        evicted = true;
        break;
      }
    }
    if (!evicted) break;
  }
}

/**
 * Grid density presets for hex maps
 */
const GRID_DENSITY_PRESETS: GridDensityPresets = {
  sparse: { columns: 12, label: 'Sparse (~12 columns)', description: 'Regional scale' },
  medium: { columns: 24, label: 'Medium (~24 columns)', description: 'Dungeon scale' },
  dense: { columns: 48, label: 'Dense (~48 columns)', description: 'Tactical scale' }
};

/**
 * Build index of all image files in vault for autocomplete
 */
async function buildImageIndex(app: App): Promise<ImageIndexEntry[]> {
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'];
  const imageFiles: ImageIndexEntry[] = [];

  // Get all files from vault
  const files = app.vault.getFiles();

  for (const file of files) {
    const ext = file.extension.toLowerCase();
    if (imageExtensions.includes(ext)) {
      imageFiles.push({
        path: file.path,
        displayName: file.basename + '.' + file.extension
      });
    }
  }

  // Sort by display name for better UX
  imageFiles.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return imageFiles;
}

/**
 * Get image display names only (for autocomplete suggestions)
 */
async function getImageDisplayNames(): Promise<string[]> {
  const index = await buildImageIndex(getApp());
  return index.map(item => item.displayName);
}

/**
 * Get full vault path from display name
 * If multiple files have same name, returns first match
 */
async function getFullPathFromDisplayName(displayName: string): Promise<string | null> {
  const index = await buildImageIndex(getApp());
  const match = index.find(item => item.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path
 */
function getDisplayNameFromPath(fullPath: string): string {
  if (!fullPath) return '';
  const parts = fullPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Preload image into cache. Safe to call multiple times.
 * Returns cached image if available, otherwise loads and caches.
 */
async function preloadImage(app: App, vaultPath: string): Promise<HTMLImageElement | null> {
  if (!vaultPath) return null;

  // Return cached if available
  if (imageCache.has(vaultPath)) {
    touchCacheEntry(vaultPath);
    return imageCache.get(vaultPath) ?? null;
  }

  // Return existing load promise if in progress
  if (loadingPromises.has(vaultPath)) {
    return loadingPromises.get(vaultPath) ?? null;
  }

  // Start new load
  const loadPromise = (async (): Promise<HTMLImageElement | null> => {
    try {
      // Get file from vault
      const file = app.vault.getAbstractFileByPath(vaultPath);
      if (!(file instanceof TFile)) {
        console.warn(`[imageOperations] Image file not found: ${vaultPath}`);
        loadingPromises.delete(vaultPath);
        return null;
      }

      // Read as binary
      const binary = await app.vault.readBinary(file);

      // Convert to blob URL (SVGs need explicit MIME type to parse correctly)
      const isSvg = vaultPath.toLowerCase().endsWith('.svg');
      const blob = isSvg
        ? new Blob([binary], { type: 'image/svg+xml' })
        : new Blob([binary]);
      const url = URL.createObjectURL(blob);

      // Create and load image
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          // Cache dimensions (SVGs with viewBox but no width/height report 0)
          let width = img.naturalWidth;
          let height = img.naturalHeight;
          if (width === 0 || height === 0) {
            width = 100;
            height = 100;
          }
          dimensionsCache.set(vaultPath, { width, height });
          resolve();
        };
        img.onerror = () => {
          console.error(`[imageOperations] Failed to load image: ${vaultPath}`);
          URL.revokeObjectURL(url);
          reject(new Error(`Failed to load image: ${vaultPath}`));
        };
        img.src = url;
      });

      // Cache the loaded image — keep the blob URL alive so the browser
      // can re-decode under memory pressure. clearCachedImage revokes it
      // when the entry is actually evicted.
      imageCache.set(vaultPath, img);
      // Build the capped render-source now (off the render frame) so oversized
      // textures never stall an interactive frame on first draw.
      buildRenderSource(img);
      imageCacheVersion++;
      evictIfNeeded();
      loadingPromises.delete(vaultPath);

      return img;
    } catch (error) {
      console.error('[imageOperations] Error loading image:', error);
      loadingPromises.delete(vaultPath);
      return null;
    }
  })();

  loadingPromises.set(vaultPath, loadPromise);
  return loadPromise;
}

/** Build the capped render-source for a large image (no-op for small ones). */
function buildRenderSource(img: HTMLImageElement): void {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const maxDim = Math.max(w, h);
  if (maxDim <= TILE_RENDER_SOURCE_MAX_PX) return;
  const scale = TILE_RENDER_SOURCE_MAX_PX / maxDim;
  const canvas = activeWindow.createEl('canvas');
  canvas.width = Math.max(1, Math.round(w * scale));
  canvas.height = Math.max(1, Math.round(h * scale));
  const cctx = canvas.getContext('2d');
  if (cctx == null) return;
  cctx.imageSmoothingQuality = 'high';
  cctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  renderSourceCache.set(img, canvas);
}

/**
 * Render source for a cached tile image: a capped downscaled copy for oversized
 * images (built at load), else the image itself. Use ONLY for whole-image scaled
 * draws (drawCellTile) — NOT for pixel-coord source sub-rects or naturalWidth math.
 */
function getRenderSource(img: HTMLImageElement): HTMLImageElement | HTMLCanvasElement {
  return renderSourceCache.get(img) ?? img;
}

/**
 * Synchronous cache read for renderer.
 * Returns null if image not cached (renderer should handle gracefully).
 */
function getCachedImage(vaultPath: string): HTMLImageElement | null {
  const img = imageCache.get(vaultPath);
  if (img) {
    touchCacheEntry(vaultPath);
    return img;
  }
  return null;
}

/**
 * Get image dimensions (loads image if needed, caches result)
 */
async function getImageDimensions(vaultPath: string): Promise<ImageDimensions | null> {
  if (!vaultPath) return null;

  // Return cached dimensions if available
  if (dimensionsCache.has(vaultPath)) {
    return dimensionsCache.get(vaultPath) ?? null;
  }

  // Load image (which will cache dimensions)
  const img = await preloadImage(getApp(), vaultPath);

  if (!img) return null;

  // Should be in cache now
  return dimensionsCache.get(vaultPath) ?? null;
}

/**
 * Clear image from all caches
 */
function clearCachedImage(vaultPath: string): void {
  const img = imageCache.get(vaultPath);
  if (img && img.src) {
    // Revoke blob URL if it exists
    if (img.src.startsWith('blob:')) {
      URL.revokeObjectURL(img.src);
    }
  }

  imageCache.delete(vaultPath);
  loadingPromises.delete(vaultPath);
  dimensionsCache.delete(vaultPath);
}

/**
 * Calculate grid dimensions from image size and desired columns
 * Supports both flat-top and pointy-top hex orientations.
 *
 * For flat-top hexes:
 * - Horizontal spacing: hexSize * 1.5 per column
 * - Vertical spacing: hexSize * sqrt(3) per row
 *
 * For pointy-top hexes:
 * - Horizontal spacing: hexSize * sqrt(3) per column
 * - Vertical spacing: hexSize * 1.5 per row
 */
function calculateGridFromImage(
  imageWidth: number,
  imageHeight: number,
  columns: number,
  orientation: HexOrientation = 'flat'
): GridCalculation {
  let hexSize: number, hexWidth: number, vertSpacing: number;

  if (orientation === 'pointy') {
    // For pointy-top hexes in offset coordinate system:
    // - Each column adds hexSize * sqrt(3) to the width
    // - Total width = columns * hexSize * sqrt(3)
    // - Therefore: hexSize = width / (columns * sqrt(3))
    const sqrt3 = Math.sqrt(3);
    hexSize = imageWidth / (columns * sqrt3);
    hexWidth = hexSize * sqrt3;

    // Vertical spacing = hexSize * 1.5 for pointy-top hexes
    vertSpacing = hexSize * 1.5;
  } else {
    // For flat-top hexes in offset coordinate system:
    // - Each column adds hexSize * 1.5 to the width
    // - First hex takes hexSize * 2, subsequent hexes add hexSize * 1.5 each
    // - Total width = hexSize * 2 + (columns - 1) * hexSize * 1.5
    // - Simplified: width = hexSize * (2 + (columns - 1) * 1.5)
    // - Therefore: hexSize = width / (2 + (columns - 1) * 1.5)
    hexSize = imageWidth / (2 + (columns - 1) * 1.5);
    hexWidth = hexSize * 2;

    // Vertical spacing = hexSize * sqrt(3) for flat-top hexes
    vertSpacing = hexSize * Math.sqrt(3);
  }

  // Calculate rows needed to cover image height
  const rows = Math.ceil(imageHeight / vertSpacing);

  return {
    columns,
    rows,
    hexSize: hexSize,
    hexWidth: Math.round(hexWidth)
  };
}

/**
 * Evict cached tile images that are no longer in any active tileset.
 * Call during tileset rebuild to prevent unbounded memory growth.
 */
function clearUnusedTileImages(activePaths: Set<string>): void {
  for (const path of imageCache.keys()) {
    if (!activePaths.has(path) && !pinnedImages.has(path)) {
      clearCachedImage(path);
    }
  }
}

export { buildImageIndex, getImageDisplayNames, getFullPathFromDisplayName, getDisplayNameFromPath, preloadImage, getCachedImage, getRenderSource, getImageDimensions, getImageCacheVersion, clearCachedImage, clearUnusedTileImages, calculateGridFromImage, GRID_DENSITY_PRESETS, MAX_CACHE_SIZE, setMaxCacheSize, pinImage, unpinImage };