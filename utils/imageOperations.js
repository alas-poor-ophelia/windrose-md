/**
 * imageOperations.js
 * 
 * Utilities for working with vault images:
 * - Building image index for autocomplete
 * - Loading and caching images
 * - Calculating grid dimensions from image size
 */

// Module-level caches (persist across renders)
const imageCache = new Map();        // path → HTMLImageElement
const loadingPromises = new Map();   // path → Promise (prevents duplicate loads)
const dimensionsCache = new Map();   // path → {width, height}

/**
 * Grid density presets for hex maps
 */
const GRID_DENSITY_PRESETS = {
  sparse: { columns: 12, label: 'Sparse (~12 columns)', description: 'Regional scale' },
  medium: { columns: 24, label: 'Medium (~24 columns)', description: 'Dungeon scale' },
  dense:  { columns: 48, label: 'Dense (~48 columns)', description: 'Tactical scale' }
};

/**
 * Build index of all image files in vault for autocomplete
 * @returns {Promise<Array<{path: string, displayName: string}>>}
 */
async function buildImageIndex() {
  const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'];
  const imageFiles = [];
  
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
 * @returns {Promise<Array<string>>}
 */
async function getImageDisplayNames() {
  const index = await buildImageIndex();
  return index.map(item => item.displayName);
}

/**
 * Get full vault path from display name
 * If multiple files have same name, returns first match
 * @param {string} displayName
 * @returns {Promise<string|null>}
 */
async function getFullPathFromDisplayName(displayName) {
  const index = await buildImageIndex();
  const match = index.find(item => item.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path
 * @param {string} fullPath
 * @returns {string}
 */
function getDisplayNameFromPath(fullPath) {
  if (!fullPath) return '';
  const parts = fullPath.split('/');
  return parts[parts.length - 1];
}

/**
 * Preload image into cache. Safe to call multiple times.
 * Returns cached image if available, otherwise loads and caches.
 * @param {string} vaultPath - Vault-relative path to image
 * @returns {Promise<HTMLImageElement|null>}
 */
async function preloadImage(vaultPath) {
  if (!vaultPath) return null;
  
  // Return cached if available
  if (imageCache.has(vaultPath)) {
    return imageCache.get(vaultPath);
  }
  
  // Return existing load promise if in progress
  if (loadingPromises.has(vaultPath)) {
    return loadingPromises.get(vaultPath);
  }
  
  // Start new load
  const loadPromise = (async () => {
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
      
      // Convert to blob URL
      const blob = new Blob([binary]);
      const url = URL.createObjectURL(blob);
      
      // Create and load image
      const img = new Image();
      
      await new Promise((resolve, reject) => {
        img.onload = () => {
          // Cache dimensions
          dimensionsCache.set(vaultPath, {
            width: img.naturalWidth,
            height: img.naturalHeight
          });
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
 * @param {string} vaultPath
 * @returns {HTMLImageElement|null}
 */
function getCachedImage(vaultPath) {
  return imageCache.get(vaultPath) || null;
}

/**
 * Get image dimensions (loads image if needed, caches result)
 * @param {string} vaultPath
 * @returns {Promise<{width: number, height: number}|null>}
 */
async function getImageDimensions(vaultPath) {
  if (!vaultPath) return null;
  
  // Return cached dimensions if available
  if (dimensionsCache.has(vaultPath)) {
    return dimensionsCache.get(vaultPath);
  }
  
  // Load image (which will cache dimensions)
  const img = await preloadImage(vaultPath);
  
  if (!img) return null;
  
  // Should be in cache now
  return dimensionsCache.get(vaultPath) || null;
}

/**
 * Clear image from all caches
 * @param {string} vaultPath
 */
function clearCachedImage(vaultPath) {
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
 * 
 * @param {number} imageWidth - Image width in pixels
 * @param {number} imageHeight - Image height in pixels
 * @param {number} columns - Desired number of columns
 * @param {string} orientation - 'flat' or 'pointy' (default: 'flat')
 * @returns {{columns: number, rows: number, hexSize: number, hexWidth: number}}
 */
function calculateGridFromImage(imageWidth, imageHeight, columns, orientation = 'flat') {
  let hexSize, hexWidth, hexHeight, vertSpacing;
  
  if (orientation === 'pointy') {
    // For pointy-top hexes in offset coordinate system:
    // - Each column adds hexSize * sqrt(3) to the width
    // - First hex takes hexSize * sqrt(3), subsequent hexes add hexSize * sqrt(3) each
    // - Total width = columns * hexSize * sqrt(3)
    // - Therefore: hexSize = width / (columns * sqrt(3))
    const sqrt3 = Math.sqrt(3);
    hexSize = imageWidth / (columns * sqrt3);
    hexWidth = hexSize * sqrt3;
    hexHeight = hexSize * 2;
    
    // Calculate rows needed to cover image height
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
    hexSize: hexSize,  // Return the calculated hexSize so it can be stored!
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