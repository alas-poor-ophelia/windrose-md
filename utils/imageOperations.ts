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
async function buildImageIndex(): Promise<ImageIndexEntry[]> {
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
  const index = await buildImageIndex();
  return index.map(item => item.displayName);
}

/**
 * Get full vault path from display name
 * If multiple files have same name, returns first match
 */
async function getFullPathFromDisplayName(displayName: string): Promise<string | null> {
  const index = await buildImageIndex();
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
async function preloadImage(vaultPath: string): Promise<HTMLImageElement | null> {
  if (!vaultPath) return null;

  // Return cached if available
  if (imageCache.has(vaultPath)) {
    return imageCache.get(vaultPath)!;
  }

  // Return existing load promise if in progress
  if (loadingPromises.has(vaultPath)) {
    return loadingPromises.get(vaultPath)!;
  }

  // Start new load
  const loadPromise = (async (): Promise<HTMLImageElement | null> => {
    try {
      // Get file from vault
      const file = app.vault.getAbstractFileByPath(vaultPath);
      if (!file) {
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

      // Cache the loaded image
      imageCache.set(vaultPath, img);
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

/**
 * Synchronous cache read for renderer.
 * Returns null if image not cached (renderer should handle gracefully).
 */
function getCachedImage(vaultPath: string): HTMLImageElement | null {
  return imageCache.get(vaultPath) || null;
}

/**
 * Get image dimensions (loads image if needed, caches result)
 */
async function getImageDimensions(vaultPath: string): Promise<ImageDimensions | null> {
  if (!vaultPath) return null;

  // Return cached dimensions if available
  if (dimensionsCache.has(vaultPath)) {
    return dimensionsCache.get(vaultPath)!;
  }

  // Load image (which will cache dimensions)
  const img = await preloadImage(vaultPath);

  if (!img) return null;

  // Should be in cache now
  return dimensionsCache.get(vaultPath) || null;
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
  let hexSize: number, hexWidth: number, hexHeight: number, vertSpacing: number;

  if (orientation === 'pointy') {
    // For pointy-top hexes in offset coordinate system:
    // - Each column adds hexSize * sqrt(3) to the width
    // - Total width = columns * hexSize * sqrt(3)
    // - Therefore: hexSize = width / (columns * sqrt(3))
    const sqrt3 = Math.sqrt(3);
    hexSize = imageWidth / (columns * sqrt3);
    hexWidth = hexSize * sqrt3;
    hexHeight = hexSize * 2;

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
    hexHeight = hexSize * Math.sqrt(3);

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

return {
  buildImageIndex,
  getImageDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath,
  preloadImage,
  getCachedImage,
  getImageDimensions,
  clearCachedImage,
  calculateGridFromImage,
  GRID_DENSITY_PRESETS
};
