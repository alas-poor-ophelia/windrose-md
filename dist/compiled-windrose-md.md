<!-- Compiled by Datacore Script Compiler -->
<!-- Source: Projects/dungeon-map-tracker -->
<!-- Main Component: DungeonMapTracker -->
<!-- Compiled: 2025-12-04T03:16:15.624Z -->
<!-- Files: 63 -->
<!-- Version: 1.1.0 -->
<!-- CSS Files: 1 -->

# Demo

```datacorejsx
// Example: How to use the compiled DungeonMapTracker component
const { View: DungeonMapTracker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "DungeonMapTracker"));

// Pass props to your component as needed:
// return <DungeonMapTracker someProp="value" />;

return <DungeonMapTracker />;
```

# dmtConstants

```js
// utils/constants.js - Theme, defaults, and dynamic path resolution

const THEME = {
  grid: {
    lines: '#666666',
    lineWidth: 1,
    background: '#1a1a1a'
  },
  cells: {
    fill: '#c4a57b',
    border: '#8b6842',
    borderWidth: 2
  },
  coordinateKey: {
    color: '#c4a57b'
  },
  coordinateText: {
    color: '#ffffff',
    shadow: '#000000'
  },
  compass: {
    color: '#ffffff',
    size: 40
  }
};

const DEFAULTS = {
  // Grid map defaults
  gridSize: 32,
  dimensions: { 
    width: 300,
    height: 300 
  },
  
  // Hex map defaults
  hexSize: 80,              // Radius from center to vertex
  hexOrientation: 'flat',   // 'flat' or 'pointy'
  hexBounds: {
    maxCol: 26,             // Default 27 columns (0-26) Ã¢â€ â€™ A-AA for coordinate keys
    maxRow: 20              // Default 21 rows (0-20) Ã¢â€ â€™ 1-21 for coordinate keys
  },
  
  // Map type
  mapType: 'grid',          // 'grid' or 'hex'
  
  // Shared defaults
  initialZoom: 1.5,
  canvasSize: {              
    width: 800, 
    height: 600 
  },
  maxHistory: 50,
  minZoom: 0.1,       
  maxZoom: 4,         
  zoomButtonStep: 0.05, // zoom step for buttons 
  zoomWheelStep: 0.05,  // zoom step for wheel
  
  // Distance measurement defaults
  distance: {
    perCellGrid: 5,              // Grid maps: 5 ft per cell (D&D standard)
    perCellHex: 6,               // Hex maps: 6 miles per hex (common world map)
    unitGrid: 'ft',              // Grid default unit
    unitHex: 'mi',               // Hex default unit
    gridDiagonalRule: 'alternating',  // 'alternating' | 'equal' | 'euclidean'
    displayFormat: 'both'        // 'cells' | 'units' | 'both'
  }
};

// Dynamically resolve the correct JSON path
const DATA_FILE_PATH = dc.resolvePath("windrose-md-data.json");

return { THEME, DEFAULTS, DATA_FILE_PATH };
```

# offsetCoordinates

```js
/**
 * offsetCoordinates.js
 * 
 * Utilities for converting between axial and offset coordinates
 * for hexagonal grids (both flat-top and pointy-top).
 * 
 * Coordinate Systems:
 * - Axial (q, r): Used for storage and hex math. Creates parallelogram when iterated.
 * - Offset (col, row): Used for bounds and iteration. Creates rectangle when iterated.
 * 
 * For flat-top hexes (odd-q offset):
 * - Columns are vertical (odd columns shift down by 0.5 hex)
 * - Rows are horizontal
 * - maxCol = width, maxRow = height
 * 
 * For pointy-top hexes (odd-r offset):
 * - Rows are vertical (odd rows shift right by 0.5 hex)
 * - Columns are horizontal  
 * - maxCol = horizontal extent, maxRow = vertical extent
 * 
 * Both systems create rectangular iteration while preserving hex geometry.
 */

/**
 * Convert axial coordinates to offset coordinates
 * For flat-top hexes: uses odd-q offset (columns vertical, odd cols shift down)
 * For pointy-top hexes: uses odd-r offset (rows vertical, odd rows shift right)
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @param {string} orientation - 'flat' or 'pointy' (default: 'flat')
 * @returns {{col: number, row: number}} Offset coordinates
 */
function axialToOffset(q, r, orientation = 'flat') {
  if (orientation === 'flat') {
    // Odd-Q offset: columns are vertical, odd columns shift down by 0.5 hex
    const col = q;
    const row = r + (q - (q & 1)) / 2;
    return { col, row };
  } else {
    // Odd-R offset: rows are vertical, odd rows shift right by 0.5 hex
    const col = q + (r - (r & 1)) / 2;
    const row = r;
    return { col, row };
  }
}

/**
 * Convert offset coordinates to axial coordinates
 * For flat-top hexes: uses odd-q offset (columns vertical)
 * For pointy-top hexes: uses odd-r offset (rows vertical)
 * @param {number} col - Column coordinate
 * @param {number} row - Row coordinate
 * @param {string} orientation - 'flat' or 'pointy' (default: 'flat')
 * @returns {{q: number, r: number}} Axial coordinates
 */
function offsetToAxial(col, row, orientation = 'flat') {
  if (orientation === 'flat') {
    // Odd-Q offset: columns are vertical, odd columns shift down by 0.5 hex
    const q = col;
    const r = row - (col - (col & 1)) / 2;
    return { q, r };
  } else {
    // Odd-R offset: rows are vertical, odd rows shift right by 0.5 hex
    const q = col - (row - (row & 1)) / 2;
    const r = row;
    return { q, r };
  }
}

/**
 * Check if offset coordinates are within rectangular bounds
 * Works for both flat-top and pointy-top hexes
 * @param {number} col - Column coordinate
 * @param {number} row - Row coordinate
 * @param {{maxCol: number, maxRow: number}} bounds - Rectangular bounds
 * @returns {boolean} True if within bounds
 */
function isWithinOffsetBounds(col, row, bounds) {
  if (!bounds) return true; // No bounds = infinite
  // Exclusive bounds: maxCol=26 means 26 columns (indices 0-25)
  return col >= 0 && col < bounds.maxCol && 
         row >= 0 && row < bounds.maxRow;
}

/**
 * Convert column number to Excel-style letter label
 * For flat-top: represents vertical columns (A, B, C...)
 * For pointy-top: represents horizontal columns (A, B, C...)
 * @param {number} col - Column number (0-based)
 * @returns {string} Letter label (A, B, C... Z, AA, AB...)
 */
function columnToLabel(col) {
  let label = '';
  let num = col;
  
  while (num >= 0) {
    label = String.fromCharCode(65 + (num % 26)) + label;
    num = Math.floor(num / 26) - 1;
  }
  
  return label;
}

/**
 * Convert row number to 1-based numeric label
 * For flat-top: represents horizontal rows (1, 2, 3...)
 * For pointy-top: represents vertical rows (1, 2, 3...)
 * @param {number} row - Row number (0-based)
 * @returns {string} Numeric label (1, 2, 3...)
 */
function rowToLabel(row) {
  return String(row + 1);
}


// Export the module
return { 
  axialToOffset, 
  offsetToAxial, 
  isWithinOffsetBounds,
  columnToLabel,
  rowToLabel
};
```

# settingsAccessor

```js
// settingsAccessor.js - Utility to access plugin settings with fallback defaults

const { THEME, DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));

// Fallback settings based on theme constants
const FALLBACK_SETTINGS = {
  version: '1.0.0',
  hexOrientation: DEFAULTS.hexOrientation,
  gridLineColor: THEME.grid.lines,
  gridLineWidth: THEME.grid.lineWidth,
  backgroundColor: THEME.grid.background,
  borderColor: THEME.cells.border,  
  coordinateKeyColor: THEME.coordinateKey.color,
  coordinateTextColor: THEME.coordinateText.color,
  coordinateTextShadow: THEME.coordinateText.shadow,
  coordinateKeyMode: 'hold', // 'hold' or 'toggle'
  expandedByDefault: false,
  
  // Distance measurement settings
  distancePerCellGrid: DEFAULTS.distance.perCellGrid,
  distancePerCellHex: DEFAULTS.distance.perCellHex,
  distanceUnitGrid: DEFAULTS.distance.unitGrid,
  distanceUnitHex: DEFAULTS.distance.unitHex,
  gridDiagonalRule: DEFAULTS.distance.gridDiagonalRule,
  distanceDisplayFormat: DEFAULTS.distance.displayFormat
};

/**
 * Get settings from the plugin, or return fallback defaults if plugin not available
 */
function getSettings() {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return FALLBACK_SETTINGS;
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      // Merge with fallbacks to ensure all keys exist
      return { ...FALLBACK_SETTINGS, ...plugin.settings };
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access plugin settings:', error);
  }
  
  // Return fallbacks if plugin not available
  return FALLBACK_SETTINGS;
}

/**
 * Get a specific setting value
 */
function getSetting(key) {
  try {
    const settings = getSettings();
    return settings[key];
  } catch (error) {
    console.warn('[settingsAccessor] Error getting setting:', key, error);
    return FALLBACK_SETTINGS[key];
  }
}

/**
 * Check if the settings plugin is installed and enabled
 */
function isPluginAvailable() {
  try {
    if (!dc || !dc.app || !dc.app.plugins) {
      return false;
    }
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    return !!(plugin && plugin.settings);
  } catch (error) {
    return false;
  }
}

/**
 * Get complete theme object with configurable values from settings
 * and non-configurable values from constants
 * This is the facade/wrapper that components should use
 */
function getTheme() {
  const settings = getSettings();
  
  return {
    grid: {
      lines: settings.gridLineColor,
      lineWidth: settings.gridLineWidth,
      background: settings.backgroundColor
    },
    cells: {
      fill: THEME.cells.fill,
      border: settings.borderColor,  // Configurable cell/wall border color
      borderWidth: THEME.cells.borderWidth
    },
    compass: {
      color: THEME.compass.color,
      size: THEME.compass.size
    },
    decorativeBorder: THEME.decorativeBorder,  // Hardcoded decorative border (not configurable)
    coordinateKey: settings.coordinateKeyColor
  };
}

/**
 * Get effective settings for a map, merging map-specific overrides with global settings
 * @param {Object} mapSettings - Map-specific settings object { useGlobalSettings, overrides }
 * @param {Object} globalSettings - Optional global settings (will be fetched if not provided)
 * @returns {Object} - Merged settings object
 */
function getEffectiveSettings(mapSettings, globalSettings = null) {
  // Get global settings if not provided
  const globals = globalSettings || getSettings();
  
  // If map has no settings or is using global settings, return global settings
  if (!mapSettings || mapSettings.useGlobalSettings) {
    return globals;
  }
  
  // Merge global settings with map overrides (map overrides take precedence)
  return {
    ...globals,
    ...mapSettings.overrides
  };
}

/**
 * Default object customization settings
 * Used when settings plugin is not available or doesn't have object settings
 */
const FALLBACK_OBJECT_SETTINGS = {
  objectOverrides: {},
  customObjects: [],
  customCategories: []
};

/**
 * Get object customization settings from the plugin
 * Returns object overrides, custom objects, and custom categories
 * @returns {Object} Object settings { objectOverrides, customObjects, customCategories }
 */
function getObjectSettings() {
  try {
    // Check if dc.app exists and is ready
    if (!dc || !dc.app || !dc.app.plugins) {
      return FALLBACK_OBJECT_SETTINGS;
    }
    
    // Try to get plugin settings
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    
    if (plugin && plugin.settings) {
      return {
        objectOverrides: plugin.settings.objectOverrides || {},
        customObjects: plugin.settings.customObjects || [],
        customCategories: plugin.settings.customCategories || []
      };
    }
  } catch (error) {
    console.warn('[settingsAccessor] Could not access object settings:', error);
  }
  
  return FALLBACK_OBJECT_SETTINGS;
}

return { getSettings, getSetting, isPluginAvailable, getTheme, getEffectiveSettings, getObjectSettings, FALLBACK_SETTINGS };
```

# fileOperations

```js
const { DEFAULTS, DATA_FILE_PATH } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));
const { offsetToAxial } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "offsetCoordinates"));
const { getSettings } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));

async function loadMapData(mapId, mapName = '', mapType = 'grid') {
  try {
    const file = app.vault.getAbstractFileByPath(DATA_FILE_PATH);
    
    if (!file) {
      return createNewMap(mapId, mapName, mapType);
    }
    
    const content = await app.vault.read(file);
    const data = JSON.parse(content);
    
    if (data.maps && data.maps[mapId]) {
      // Map exists - ensure all arrays exist
      if (!data.maps[mapId].objects) {
        data.maps[mapId].objects = [];
      }
      if (!data.maps[mapId].textLabels) {
        data.maps[mapId].textLabels = [];
      }
      if (!data.maps[mapId].customColors) {
        data.maps[mapId].customColors = [];
      }
      // Ensure edges array exists (for edge painting feature)
      if (!data.maps[mapId].edges) {
        data.maps[mapId].edges = [];
      }
      // Ensure mapType exists (backward compatibility)
      if (!data.maps[mapId].mapType) {
        data.maps[mapId].mapType = 'grid';
      }
      // Ensure settings exist (backward compatibility)
      if (!data.maps[mapId].settings) {
        data.maps[mapId].settings = {
          useGlobalSettings: true,
          overrides: {}
        };
      }
      // Ensure uiPreferences exist (backward compatibility)
      if (!data.maps[mapId].uiPreferences) {
        data.maps[mapId].uiPreferences = {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        };
      }
      // Ensure expandedState exists (backward compatibility)
      if (data.maps[mapId].expandedState === undefined) {
        data.maps[mapId].expandedState = false;
      }
      // Ensure hexBounds exists for hex maps (use defaults, handle migration)
      if (data.maps[mapId].mapType === 'hex') {
        if (!data.maps[mapId].hexBounds) {
          // No bounds at all - use defaults
          data.maps[mapId].hexBounds = { ...DEFAULTS.hexBounds };
        } else if (data.maps[mapId].hexBounds.maxQ !== undefined) {
          // Old axial bounds format - convert to offset format
          data.maps[mapId].hexBounds = {
            maxCol: data.maps[mapId].hexBounds.maxQ,
            maxRow: data.maps[mapId].hexBounds.maxR
          };
        }
        // else: already has maxCol/maxRow (new format) - no action needed
        
        // Ensure backgroundImage exists for hex maps (backward compatibility)
        if (!data.maps[mapId].backgroundImage) {
          data.maps[mapId].backgroundImage = { 
            path: null, 
            lockBounds: false,
            gridDensity: 'medium',
            customColumns: 24
          };
        } else {
          // Ensure new fields exist on existing backgroundImage objects
          if (data.maps[mapId].backgroundImage.gridDensity === undefined) {
            data.maps[mapId].backgroundImage.gridDensity = 'medium';
          }
          if (data.maps[mapId].backgroundImage.customColumns === undefined) {
            data.maps[mapId].backgroundImage.customColumns = 24;
          }
        }
      }
      return data.maps[mapId];
    } else {
      return createNewMap(mapId, mapName, mapType);
    }
  } catch (error) {
    console.error('[loadMapData] Error:', error);
    return createNewMap(mapId, mapName, mapType);
  }
}

async function saveMapData(mapId, mapData) {
  try {
    let allData = { maps: {} };
    
    // Load existing data
    const file = app.vault.getAbstractFileByPath(DATA_FILE_PATH);
    if (file) {
      const content = await app.vault.read(file);
      allData = JSON.parse(content);
    }
    
    // Update specific map
    if (!allData.maps) allData.maps = {};
    allData.maps[mapId] = mapData;
    
    // Save back
    const jsonString = JSON.stringify(allData, null, 2);
    
    if (file) {
      await app.vault.modify(file, jsonString);
    } else {
      await app.vault.create(DATA_FILE_PATH, jsonString);
    }
    
    return true;
  } catch (error) {
    console.error('Error saving map data:', error);
    return false;
  }
}

function createNewMap(mapId, mapName = '', mapType = 'grid') {

  if (!DEFAULTS) {
    console.error('[createNewMap] CRITICAL: DEFAULTS is undefined!');
    throw new Error('DEFAULTS is undefined - constants.js import failed');
  }
  
  // Base map structure shared by all map types
  const baseMap = {
    name: mapName,  
    description: "",
    mapType: mapType,
    northDirection: 0,
    cells: [],
    edges: [],  // For edge painting (grid maps only)
    objects: [],
    textLabels: [],
    customColors: [],
    sidebarCollapsed: false,
    expandedState: false,
    settings: {
      useGlobalSettings: true,
      overrides: {}
    },
    uiPreferences: {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false
    }
  };
  
  // Add type-specific properties
  if (mapType === 'hex') {
    // Get global settings to respect user configuration
    const globalSettings = getSettings();
    
    baseMap.hexSize = globalSettings.hexSize || DEFAULTS.hexSize;
    baseMap.orientation = globalSettings.hexOrientation || DEFAULTS.hexOrientation;
    baseMap.hexBounds = { ...DEFAULTS.hexBounds }; // Now {maxCol, maxRow}
    baseMap.dimensions = { ...DEFAULTS.dimensions };
    
    // Calculate proper viewport center for hex map using offset coordinates
    // Center on the middle of the rectangular bounds, then convert to axial for world coords
    const hexSize = baseMap.hexSize;
    const orientation = baseMap.orientation;
    
    // Calculate center in offset coordinates (rectangular bounds)
    const centerCol = Math.floor(DEFAULTS.hexBounds.maxCol / 2);
    const centerRow = Math.floor(DEFAULTS.hexBounds.maxRow / 2);
    
    // Convert offset center to axial coordinates
    const { q: centerQ, r: centerR } = offsetToAxial(centerCol, centerRow, orientation);
    
    // Convert hex center to world coordinates (using axial coords)
    let worldX, worldY;
    if (orientation === 'flat') {
      worldX = hexSize * (3/2) * centerQ;
      worldY = hexSize * (Math.sqrt(3) / 2 * centerQ + Math.sqrt(3) * centerR);
    } else {
      // pointy
      worldX = hexSize * (Math.sqrt(3) * centerQ + Math.sqrt(3) / 2 * centerR);
      worldY = hexSize * (3/2) * centerR;
    }
    
    baseMap.viewState = {
      zoom: DEFAULTS.initialZoom,
      center: { 
        x: worldX, 
        y: worldY 
      }
    };
    
  } else {
    // Grid map
    baseMap.gridSize = DEFAULTS.gridSize;
    baseMap.dimensions = { ...DEFAULTS.dimensions };
    baseMap.viewState = {
      zoom: DEFAULTS.initialZoom,
      center: { 
        x: Math.floor(DEFAULTS.dimensions.width / 2), 
        y: Math.floor(DEFAULTS.dimensions.height / 2) 
      }
    };
  }
  
  return baseMap;
}

return { loadMapData, saveMapData, createNewMap };
```

# imageOperations

```js
/**
 * imageOperations.js
 * 
 * Utilities for working with vault images:
 * - Building image index for autocomplete
 * - Loading and caching images
 * - Calculating grid dimensions from image size
 */

// Module-level caches (persist across renders)
const imageCache = new Map();        // path â†’ HTMLImageElement
const loadingPromises = new Map();   // path â†’ Promise (prevents duplicate loads)
const dimensionsCache = new Map();   // path â†’ {width, height}

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
```

# useMapData

```js
const { loadMapData, saveMapData } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "fileOperations"));
const { preloadImage } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "imageOperations"));


function useMapData(mapId, mapName = '', mapType = 'grid') {
  const [mapData, setMapData] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(true);
  const [saveStatus, setSaveStatus] = dc.useState('Saved');
  const [pendingData, setPendingData] = dc.useState(null);
  const [backgroundImageReady, setBackgroundImageReady] = dc.useState(false);
  const saveTimerRef = dc.useRef(null);
  

  //Load map data on mount
  dc.useEffect(() => {
    async function load() {
      const data = await loadMapData(mapId, mapName, mapType);
      setMapData(data);
      setIsLoading(false);
    }
    load();
  }, [mapId, mapName, mapType]);
  
  // Preload background image when map data loads
  dc.useEffect(() => {
    if (mapData?.backgroundImage?.path) {
      setBackgroundImageReady(false);
      preloadImage(mapData.backgroundImage.path).then((img) => {
        if (img) {
          setBackgroundImageReady(true);
        }
      });
    } else {
      setBackgroundImageReady(false);
    }
  }, [mapData?.backgroundImage?.path]);
  
  // Debounced save effect
  dc.useEffect(() => {
    if (!pendingData) return;
    
    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    
    // Set new timer for 2 seconds
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      setSaveStatus(success ? 'Saved' : 'Save failed');
      setPendingData(null);
      saveTimerRef.current = null;
    }, 2000);
    
    // Cleanup function
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData, mapId]);
  
  // Update map data and trigger debounced save
  const updateMapData = dc.useCallback((newMapData) => {
    setMapData(newMapData);
    setPendingData(newMapData);
    setSaveStatus('Unsaved changes');
  }, []);
  
  // Force immediate save (for when component unmounts or critical saves)
  const forceSave = dc.useCallback(async () => {
    if (pendingData) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);
      setSaveStatus(success ? 'Saved' : 'Save failed');
      setPendingData(null);
    }
  }, [pendingData, mapId]);
  
  // Save on unmount if there's pending data
  dc.useEffect(() => {
    return () => {
      if (pendingData && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Fire and forget save on unmount
        saveMapData(mapId, pendingData);
      }
    };
  }, [pendingData, mapId]);
  
  return { mapData, isLoading, saveStatus, updateMapData, forceSave, backgroundImageReady };
}

return { useMapData };
```

# useHistory

```js
const { DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));

function useHistory(initialState) {
  // Combine history and index into single state for better synchronization
  const [historyState, setHistoryState] = dc.useState({
    history: [initialState],
    currentIndex: 0
  });
  
  // Add a new state to history
  const addToHistory = dc.useCallback((newState) => {
    setHistoryState(prev => {
      // Remove any "future" states (redo states) when adding new state
      const newHistory = prev.history.slice(0, prev.currentIndex + 1);
      
      // Add new state
      newHistory.push(newState);
      
      // Limit history size
      let newIndex = newHistory.length - 1;
      if (newHistory.length > DEFAULTS.maxHistory) {
        newHistory.shift();
        newIndex = prev.currentIndex; // Index stays the same since we removed from beginning
      }
      
      return {
        history: newHistory,
        currentIndex: newIndex
      };
    });
  }, []);
  
  // Undo to previous state
  const undo = dc.useCallback(() => {
    let result = null;
    setHistoryState(prev => {
      if (prev.currentIndex > 0) {
        result = prev.history[prev.currentIndex - 1];
        return {
          ...prev,
          currentIndex: prev.currentIndex - 1
        };
      }
      return prev;
    });
    return result;
  }, []);
  
  // Redo to next state
  const redo = dc.useCallback(() => {
    let result = null;
    setHistoryState(prev => {
      if (prev.currentIndex < prev.history.length - 1) {
        result = prev.history[prev.currentIndex + 1];
        return {
          ...prev,
          currentIndex: prev.currentIndex + 1
        };
      }
      return prev;
    });
    return result;
  }, []);
  
  // Reset history (useful when loading new map)
  const resetHistory = dc.useCallback((newState) => {
    setHistoryState({
      history: [newState],
      currentIndex: 0
    });
  }, []);
  
  // Check if undo/redo are available
  const canUndo = historyState.currentIndex > 0;
  const canRedo = historyState.currentIndex < historyState.history.length - 1;
  
  // Get current state
  const currentState = historyState.history[historyState.currentIndex];
  
  return {
    currentState,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  };
}

return { useHistory };
```

# MapHeader

```jsx
// components/MapHeader.jsx - Map name and save status header

const MapHeader = ({ mapData, onNameChange, saveStatus, showFooter, onToggleFooter }) => {
  // Determine icon and CSS class based on save status
  const getStatusIcon = () => {
    if (saveStatus === 'Unsaved changes') return '○';
    if (saveStatus === 'Saving...') return '⟳';
    if (saveStatus === 'Save failed') return '✗';
    return '✔'; // Saved
  };
  
  const getStatusClass = () => {
    if (saveStatus === 'Unsaved changes') return 'dmt-save-status dmt-save-status-unsaved';
    if (saveStatus === 'Saving...') return 'dmt-save-status dmt-save-status-saving';
    if (saveStatus === 'Save failed') return 'dmt-save-status dmt-save-status-error';
    return 'dmt-save-status';
  };
  
  const getStatusTitle = () => {
    return saveStatus; // Show full text in tooltip
  };
  
  return (
    <div className="dmt-header">
      <input
        type="text"
        className="dmt-map-name"
        placeholder="Map Name (optional)"
        value={mapData.name}
        onChange={(e) => onNameChange(e.target.value)}
      />
      <div className="dmt-header-controls">
        <button
          className={`dmt-info-toggle ${showFooter ? 'dmt-info-toggle-active' : ''}`}
          onClick={onToggleFooter}
          title={showFooter ? 'Hide footer info' : 'Show footer info'}
        >
          <dc.Icon icon="lucide-info" />
        </button>
        <span 
          className={getStatusClass()}
          title={getStatusTitle()}
        >
          {getStatusIcon()}
        </span>
      </div>
    </div>
  );
};

return { MapHeader };
```

# borderCalculator

```js
// utils/borderCalculator.js - Smart border detection for exterior edges

// Check if a cell exists at given coordinates
function cellExists(cells, x, y) {
    return cells.some(cell => cell.x === x && cell.y === y);
  }
  
  // Calculate which borders should be drawn for a cell
  // Only returns borders where there's NO adjacent cell (exterior edges)
  function calculateBorders(cells, x, y) {
    const borders = [];
    
    // Check all 4 directions
    const adjacent = [
      { dx: 0, dy: -1, side: 'top' },
      { dx: 1, dy: 0, side: 'right' },
      { dx: 0, dy: 1, side: 'bottom' },
      { dx: -1, dy: 0, side: 'left' }
    ];
    
    for (const dir of adjacent) {
      const adjX = x + dir.dx;
      const adjY = y + dir.dy;
      
      // If there's no cell adjacent, this is an exterior edge
      if (!cellExists(cells, adjX, adjY)) {
        borders.push(dir.side);
      }
    }
    
    return borders;
  }
  
  // Build a lookup map for faster cell existence checks
  // Returns a Set with keys like "x,y"
  function buildCellLookup(cells) {
    const lookup = new Set();
    for (const cell of cells) {
      lookup.add(`${cell.x},${cell.y}`);
    }
    return lookup;
  }
  
  // Optimized version using lookup map
  function cellExistsInLookup(lookup, x, y) {
    return lookup.has(`${x},${y}`);
  }
  
  // Calculate borders using lookup map for better performance
  function calculateBordersOptimized(lookup, x, y) {
    const borders = [];
    
    const adjacent = [
      { dx: 0, dy: -1, side: 'top' },
      { dx: 1, dy: 0, side: 'right' },
      { dx: 0, dy: 1, side: 'bottom' },
      { dx: -1, dy: 0, side: 'left' }
    ];
    
    for (const dir of adjacent) {
      const adjX = x + dir.dx;
      const adjY = y + dir.dy;
      
      if (!cellExistsInLookup(lookup, adjX, adjY)) {
        borders.push(dir.side);
      }
    }
    
    return borders;
  }
  
  return { 
    calculateBorders, 
    cellExists, 
    buildCellLookup, 
    calculateBordersOptimized 
  };
```

# objectTypes

```js
// utils/objectTypes.js - Object type definitions for dungeon mapping

const OBJECT_TYPES = [
    // Notes
    { id: 'note_pin', symbol: '📌', label: 'Note Pin', category: 'notes' },

    // Navigation
    { id: 'entrance', symbol: '⬤', label: 'Entrance/Exit', category: 'navigation' },
    { id: 'stairs-up', symbol: '▲', label: 'Stairs Up', category: 'navigation' },
    { id: 'stairs-down', symbol: '▼', label: 'Stairs Down', category: 'navigation' },
    { id: 'ladder', symbol: '⚍', label: 'Ladder', category: 'navigation' },
    { id: 'door-vertical', symbol: '║', label: 'Door (Vertical)', category: 'navigation' },
    { id: 'door-horizontal', symbol: '═', label: 'Door (Horizontal)', category: 'navigation' },
    { id: 'secret-door', symbol: '≡', label: 'Secret Door', category: 'navigation' },
    { id: 'portal', symbol: '⊛', label: 'Portal/Teleport', category: 'navigation' },
    
    // Hazards
    { id: 'trap', symbol: '✱', label: 'Trap', category: 'hazards' },
    { id: 'hazard', symbol: '⚠', label: 'Hazard', category: 'hazards' },
    { id: 'pit', symbol: '◊', label: 'Pit', category: 'hazards' },
    { id: 'poison', symbol: '☠', label: 'Poison', category: 'hazards' },
    
    // Features
    { id: 'chest', symbol: '🪎', label: 'Chest/Treasure', category: 'features' },
    { id: 'crate', symbol: '📦', label: 'Crate/Barrel', category: 'features' },
    { id: 'sack', symbol: '💰', label: 'Sack/Bag', category: 'features' },
    { id: 'altar', symbol: '⛧', label: 'Altar', category: 'features' },
	{ id: 'coffin', symbol: '⚰', label: 'Coffin', category: 'features' },
    { id: 'statue', symbol: '♜', label: 'Statue', category: 'features' },
    { id: 'cage', symbol: '⛓', label: 'Chains/Cage', category: 'features' },
	{ id: 'book', symbol: '🕮', label: 'Book/Shelf', category: 'features'},
    { id: 'table', symbol: '▭', label: 'Table', category: 'features' },
    { id: 'chair', symbol: '🪑', label: 'Chair', category: 'features' },
    { id: 'bed', symbol: '🛏', label: 'Bed', category: 'features' },
    { id: 'anvil', symbol: '⚒', label: 'Anvil/Forge', category: 'features' },
    { id: 'cauldron', symbol: '⚗', label: 'Cauldron', category: 'features' },
    { id: 'fountain', symbol: '⛲', label: 'Fountain', category: 'features' },
    { id: 'lever', symbol: '⚡', label: 'Lever/Switch', category: 'features' },
    { id: 'flower', symbol: '⚘', label: 'Flower', category: 'features' },
    { id: 'plant', symbol: '❊', label: 'Plant', category: 'features' },
	{ id: 'tree-dec', symbol: '🌳', label: 'Tree', category: 'features'},
	{ id: 'tree-ev', symbol: '🌲', label: 'Tree', category: 'features'},
	{ id: 'tree-lfls', symbol: '🪾', label: 'Tree', category: 'features'},
    
    // Encounters
    { id: 'monster', symbol: '♅', label: 'Monster/Enemy', category: 'encounters' },
    { id: 'boss', symbol: '♛', label: 'Boss', category: 'encounters' },
	{ id: 'boss-alt', symbol: '💀', label: 'Boss (alt)', category: 'encounters'},
    { id: 'npc', symbol: '☺', label: 'NPC', category: 'encounters' },
	{ id: 'npc-alt', symbol: '🧝', label: 'NPC', category: 'encounters' },
    { id: 'guard', symbol: '⚔', label: 'Guard', category: 'encounters' },
    
    // Markers
    { id: 'poi', symbol: '◉', label: 'Point of Interest', category: 'markers' },
    { id: 'flag', symbol: '⚑', label: 'Note/Flag', category: 'markers' }
  ];
  
  // Get all categories for organizing the sidebar
  const CATEGORIES = [
    { id: 'navigation', label: 'Navigation' },
    { id: 'hazards', label: 'Hazards' },
    { id: 'features', label: 'Features' },
    { id: 'encounters', label: 'Encounters' },
    { id: 'markers', label: 'Markers' }
  ];
  
  return { OBJECT_TYPES, CATEGORIES };

```

# rpgAwesomeIcons

```js
// rpgAwesomeIcons.js - Icon mapping and categories for RPGAwesome font
// Generated from official rpg-awesome npm package v0.2.0
// Source: scss/_variables.scss
// License: SIL OFL 1.1 (Font), MIT (CSS)
// Total icons: 496

/**
 * Icon categories for filtering in the picker UI
 */
const RA_CATEGORIES = [
  { id: 'weapons', label: 'Weapons', order: 10 },
  { id: 'armor', label: 'Armor & Defense', order: 20 },
  { id: 'creatures', label: 'Creatures', order: 30 },
  { id: 'potions', label: 'Potions', order: 40 },
  { id: 'magic', label: 'Magic', order: 50 },
  { id: 'food', label: 'Food & Drink', order: 60 },
  { id: 'plants', label: 'Plants', order: 70 },
  { id: 'astrology', label: 'Astrology', order: 80 },
  { id: 'cards-dice', label: 'Cards & Dice', order: 90 },
  { id: 'electronics', label: 'Electronics', order: 100 },
  { id: 'dangers', label: 'Dangers', order: 110 },
  { id: 'player', label: 'Player', order: 120 },
  { id: 'inventory', label: 'Inventory', order: 130 },
  { id: 'rpg', label: 'RPG & Misc', order: 140 },
];

/**
 * Icon definitions - char is the actual Unicode character for canvas rendering
 * Codepoints are from the official _variables.scss file
 */
const RA_ICONS = {
  'ra-acid': { char: '\ue900', label: 'Acid', category: 'dangers' },
  'ra-acorn': { char: '\ue901', label: 'Acorn', category: 'food' },
  'ra-alien-fire': { char: '\ue902', label: 'Alien Fire', category: 'magic' },
  'ra-all-for-one': { char: '\ue903', label: 'All For One', category: 'rpg' },
  'ra-alligator-clip': { char: '\ue904', label: 'Alligator Clip', category: 'inventory' },
  'ra-ammo-bag': { char: '\ue905', label: 'Ammo Bag', category: 'inventory' },
  'ra-anchor': { char: '\ue906', label: 'Anchor', category: 'rpg' },
  'ra-angel-wings': { char: '\ue907', label: 'Angel Wings', category: 'rpg' },
  'ra-ankh': { char: '\ue908', label: 'Ankh', category: 'rpg' },
  'ra-anvil': { char: '\ue909', label: 'Anvil', category: 'rpg' },
  'ra-apple': { char: '\ue90a', label: 'Apple', category: 'food' },
  'ra-aquarius': { char: '\ue90b', label: 'Aquarius', category: 'astrology' },
  'ra-arcane-mask': { char: '\ue90c', label: 'Arcane Mask', category: 'armor' },
  'ra-archer': { char: '\ue90d', label: 'Archer', category: 'weapons' },
  'ra-archery-target': { char: '\ue90e', label: 'Archery Target', category: 'weapons' },
  'ra-arena': { char: '\ue90f', label: 'Arena', category: 'rpg' },
  'ra-aries': { char: '\ue910', label: 'Aries', category: 'astrology' },
  'ra-arrow-cluster': { char: '\ue911', label: 'Arrow Cluster', category: 'weapons' },
  'ra-arrow-flights': { char: '\ue912', label: 'Arrow Flights', category: 'weapons' },
  'ra-arson': { char: '\ue913', label: 'Arson', category: 'dangers' },
  'ra-aura': { char: '\ue914', label: 'Aura', category: 'magic' },
  'ra-aware': { char: '\ue915', label: 'Aware', category: 'player' },
  'ra-axe': { char: '\ue917', label: 'Axe', category: 'weapons' },
  'ra-axe-swing': { char: '\ue916', label: 'Axe Swing', category: 'weapons' },
  'ra-ball': { char: '\ue918', label: 'Ball', category: 'inventory' },
  'ra-barbed-arrow': { char: '\ue919', label: 'Barbed Arrow', category: 'weapons' },
  'ra-barrier': { char: '\ue91a', label: 'Barrier', category: 'armor' },
  'ra-bat-sword': { char: '\ue91b', label: 'Bat Sword', category: 'weapons' },
  'ra-battered-axe': { char: '\ue91c', label: 'Battered Axe', category: 'weapons' },
  'ra-batteries': { char: '\ue91d', label: 'Batteries', category: 'electronics' },
  'ra-battery-0': { char: '\ue91e', label: 'Battery 0', category: 'electronics' },
  'ra-battery-100': { char: '\ue922', label: 'Battery 100', category: 'electronics' },
  'ra-battery-25': { char: '\ue91f', label: 'Battery 25', category: 'electronics' },
  'ra-battery-50': { char: '\ue920', label: 'Battery 50', category: 'electronics' },
  'ra-battery-75': { char: '\ue921', label: 'Battery 75', category: 'electronics' },
  'ra-battery-black': { char: '\ue923', label: 'Battery Black', category: 'electronics' },
  'ra-battery-negative': { char: '\ue924', label: 'Battery Negative', category: 'electronics' },
  'ra-battery-positive': { char: '\ue925', label: 'Battery Positive', category: 'electronics' },
  'ra-battery-white': { char: '\ue926', label: 'Battery White', category: 'electronics' },
  'ra-batwings': { char: '\ue927', label: 'Batwings', category: 'rpg' },
  'ra-beam-wake': { char: '\ue928', label: 'Beam Wake', category: 'rpg' },
  'ra-bear-trap': { char: '\ue929', label: 'Bear Trap', category: 'dangers' },
  'ra-beer': { char: '\ue92a', label: 'Beer', category: 'food' },
  'ra-beetle': { char: '\ue92b', label: 'Beetle', category: 'creatures' },
  'ra-bell': { char: '\ue92c', label: 'Bell', category: 'inventory' },
  'ra-biohazard': { char: '\ue92d', label: 'Biohazard', category: 'dangers' },
  'ra-bird-claw': { char: '\ue92e', label: 'Bird Claw', category: 'creatures' },
  'ra-bird-mask': { char: '\ue92f', label: 'Bird Mask', category: 'armor' },
  'ra-blade-bite': { char: '\ue930', label: 'Blade Bite', category: 'dangers' },
  'ra-blast': { char: '\ue931', label: 'Blast', category: 'dangers' },
  'ra-blaster': { char: '\ue932', label: 'Blaster', category: 'weapons' },
  'ra-bleeding-eye': { char: '\ue933', label: 'Bleeding Eye', category: 'dangers' },
  'ra-bleeding-hearts': { char: '\ue934', label: 'Bleeding Hearts', category: 'dangers' },
  'ra-bolt-shield': { char: '\ue935', label: 'Bolt Shield', category: 'armor' },
  'ra-bomb-explosion': { char: '\ue936', label: 'Bomb Explosion', category: 'dangers' },
  'ra-bombs': { char: '\ue937', label: 'Bombs', category: 'weapons' },
  'ra-bone-bite': { char: '\ue938', label: 'Bone Bite', category: 'dangers' },
  'ra-bone-knife': { char: '\ue939', label: 'Bone Knife', category: 'weapons' },
  'ra-book': { char: '\ue93a', label: 'Book', category: 'inventory' },
  'ra-boomerang': { char: '\ue93b', label: 'Boomerang', category: 'weapons' },
  'ra-boot-stomp': { char: '\ue93c', label: 'Boot Stomp', category: 'armor' },
  'ra-bottle-vapors': { char: '\ue93d', label: 'Bottle Vapors', category: 'potions' },
  'ra-bottled-bolt': { char: '\ue93e', label: 'Bottled Bolt', category: 'potions' },
  'ra-bottom-right': { char: '\ue93f', label: 'Bottom Right', category: 'cards-dice' },
  'ra-bowie-knife': { char: '\ue940', label: 'Bowie Knife', category: 'weapons' },
  'ra-bowling-pin': { char: '\ue941', label: 'Bowling Pin', category: 'inventory' },
  'ra-brain-freeze': { char: '\ue942', label: 'Brain Freeze', category: 'magic' },
  'ra-brandy-bottle': { char: '\ue943', label: 'Brandy Bottle', category: 'food' },
  'ra-bridge': { char: '\ue944', label: 'Bridge', category: 'rpg' },
  'ra-broadhead-arrow': { char: '\ue945', label: 'Broadhead Arrow', category: 'weapons' },
  'ra-broadsword': { char: '\ue946', label: 'Broadsword', category: 'weapons' },
  'ra-broken-bone': { char: '\ue947', label: 'Broken Bone', category: 'dangers' },
  'ra-broken-bottle': { char: '\ue948', label: 'Broken Bottle', category: 'potions' },
  'ra-broken-heart': { char: '\ue949', label: 'Broken Heart', category: 'dangers' },
  'ra-broken-shield': { char: '\ue94a', label: 'Broken Shield', category: 'armor' },
  'ra-broken-skull': { char: '\ue94b', label: 'Broken Skull', category: 'dangers' },
  'ra-bubbling-potion': { char: '\ue94c', label: 'Bubbling Potion', category: 'potions' },
  'ra-bullets': { char: '\ue94d', label: 'Bullets', category: 'weapons' },
  'ra-burning-book': { char: '\ue94e', label: 'Burning Book', category: 'magic' },
  'ra-burning-embers': { char: '\ue94f', label: 'Burning Embers', category: 'magic' },
  'ra-burning-eye': { char: '\ue950', label: 'Burning Eye', category: 'magic' },
  'ra-burning-meteor': { char: '\ue951', label: 'Burning Meteor', category: 'magic' },
  'ra-burst-blob': { char: '\ue952', label: 'Burst Blob', category: 'magic' },
  'ra-butterfly': { char: '\ue953', label: 'Butterfly', category: 'creatures' },
  'ra-campfire': { char: '\ue954', label: 'Campfire', category: 'rpg' },
  'ra-cancel': { char: '\ue955', label: 'Cancel', category: 'cards-dice' },
  'ra-cancer': { char: '\ue956', label: 'Cancer', category: 'astrology' },
  'ra-candle': { char: '\ue958', label: 'Candle', category: 'inventory' },
  'ra-candle-fire': { char: '\ue957', label: 'Candle Fire', category: 'inventory' },
  'ra-cannon-shot': { char: '\ue959', label: 'Cannon Shot', category: 'weapons' },
  'ra-capitol': { char: '\ue95a', label: 'Capitol', category: 'rpg' },
  'ra-capricorn': { char: '\ue95b', label: 'Capricorn', category: 'astrology' },
  'ra-carrot': { char: '\ue95c', label: 'Carrot', category: 'food' },
  'ra-castle-emblem': { char: '\ue95d', label: 'Castle Emblem', category: 'rpg' },
  'ra-castle-flag': { char: '\ue95e', label: 'Castle Flag', category: 'inventory' },
  'ra-cat': { char: '\ue95f', label: 'Cat', category: 'creatures' },
  'ra-chain': { char: '\ue960', label: 'Chain', category: 'inventory' },
  'ra-cheese': { char: '\ue961', label: 'Cheese', category: 'food' },
  'ra-chemical-arrow': { char: '\ue962', label: 'Chemical Arrow', category: 'weapons' },
  'ra-chessboard': { char: '\ue963', label: 'Chessboard', category: 'cards-dice' },
  'ra-chicken-leg': { char: '\ue964', label: 'Chicken Leg', category: 'food' },
  'ra-circle-of-circles': { char: '\ue965', label: 'Circle Of Circles', category: 'rpg' },
  'ra-circular-saw': { char: '\ue966', label: 'Circular Saw', category: 'weapons' },
  'ra-circular-shield': { char: '\ue967', label: 'Circular Shield', category: 'armor' },
  'ra-cloak-and-dagger': { char: '\ue968', label: 'Cloak And Dagger', category: 'weapons' },
  'ra-clockwork': { char: '\ue969', label: 'Clockwork', category: 'electronics' },
  'ra-clover': { char: '\ue96a', label: 'Clover', category: 'plants' },
  'ra-clovers': { char: '\ue96c', label: 'Clovers', category: 'cards-dice' },
  'ra-clovers-card': { char: '\ue96b', label: 'Clovers Card', category: 'cards-dice' },
  'ra-cluster-bomb': { char: '\ue96d', label: 'Cluster Bomb', category: 'weapons' },
  'ra-coffee-mug': { char: '\ue96e', label: 'Coffee Mug', category: 'food' },
  'ra-cog': { char: '\ue970', label: 'Cog', category: 'electronics' },
  'ra-cog-wheel': { char: '\ue96f', label: 'Cog Wheel', category: 'electronics' },
  'ra-cold-heart': { char: '\ue971', label: 'Cold Heart', category: 'magic' },
  'ra-compass': { char: '\ue972', label: 'Compass', category: 'inventory' },
  'ra-corked-tube': { char: '\ue973', label: 'Corked Tube', category: 'potions' },
  'ra-crab-claw': { char: '\ue974', label: 'Crab Claw', category: 'creatures' },
  'ra-cracked-helm': { char: '\ue975', label: 'Cracked Helm', category: 'armor' },
  'ra-cracked-shield': { char: '\ue976', label: 'Cracked Shield', category: 'armor' },
  'ra-croc-sword': { char: '\ue977', label: 'Croc Sword', category: 'weapons' },
  'ra-crossbow': { char: '\ue978', label: 'Crossbow', category: 'weapons' },
  'ra-crossed-axes': { char: '\ue979', label: 'Crossed Axes', category: 'weapons' },
  'ra-crossed-bones': { char: '\ue97a', label: 'Crossed Bones', category: 'dangers' },
  'ra-crossed-pistols': { char: '\ue97b', label: 'Crossed Pistols', category: 'weapons' },
  'ra-crossed-sabres': { char: '\ue97c', label: 'Crossed Sabres', category: 'weapons' },
  'ra-crossed-swords': { char: '\ue97d', label: 'Crossed Swords', category: 'weapons' },
  'ra-crown': { char: '\ue97f', label: 'Crown', category: 'armor' },
  'ra-crown-of-thorns': { char: '\ue97e', label: 'Crown Of Thorns', category: 'armor' },
  'ra-crowned-heart': { char: '\ue980', label: 'Crowned Heart', category: 'player' },
  'ra-crush': { char: '\ue981', label: 'Crush', category: 'dangers' },
  'ra-crystal-ball': { char: '\ue982', label: 'Crystal Ball', category: 'magic' },
  'ra-crystal-cluster': { char: '\ue983', label: 'Crystal Cluster', category: 'magic' },
  'ra-crystal-wand': { char: '\ue984', label: 'Crystal Wand', category: 'magic' },
  'ra-crystals': { char: '\ue985', label: 'Crystals', category: 'magic' },
  'ra-cubes': { char: '\ue986', label: 'Cubes', category: 'rpg' },
  'ra-cut-palm': { char: '\ue987', label: 'Cut Palm', category: 'player' },
  'ra-cycle': { char: '\ue988', label: 'Cycle', category: 'rpg' },
  'ra-daggers': { char: '\ue989', label: 'Daggers', category: 'weapons' },
  'ra-daisy': { char: '\ue98a', label: 'Daisy', category: 'plants' },
  'ra-dead-tree': { char: '\ue98b', label: 'Dead Tree', category: 'plants' },
  'ra-death-skull': { char: '\ue98c', label: 'Death Skull', category: 'dangers' },
  'ra-decapitation': { char: '\ue98d', label: 'Decapitation', category: 'dangers' },
  'ra-defibrillate': { char: '\ue98e', label: 'Defibrillate', category: 'electronics' },
  'ra-demolish': { char: '\ue98f', label: 'Demolish', category: 'dangers' },
  'ra-dervish-swords': { char: '\ue990', label: 'Dervish Swords', category: 'weapons' },
  'ra-desert-skull': { char: '\ue991', label: 'Desert Skull', category: 'dangers' },
  'ra-diamond': { char: '\ue992', label: 'Diamond', category: 'magic' },
  'ra-diamonds': { char: '\ue994', label: 'Diamonds', category: 'cards-dice' },
  'ra-diamonds-card': { char: '\ue993', label: 'Diamonds Card', category: 'cards-dice' },
  'ra-dice-five': { char: '\ue995', label: 'Dice Five', category: 'cards-dice' },
  'ra-dice-four': { char: '\ue996', label: 'Dice Four', category: 'cards-dice' },
  'ra-dice-one': { char: '\ue997', label: 'Dice One', category: 'cards-dice' },
  'ra-dice-six': { char: '\ue998', label: 'Dice Six', category: 'cards-dice' },
  'ra-dice-three': { char: '\ue999', label: 'Dice Three', category: 'cards-dice' },
  'ra-dice-two': { char: '\ue99a', label: 'Dice Two', category: 'cards-dice' },
  'ra-dinosaur': { char: '\ue99b', label: 'Dinosaur', category: 'creatures' },
  'ra-divert': { char: '\ue99c', label: 'Divert', category: 'magic' },
  'ra-diving-dagger': { char: '\ue99d', label: 'Diving Dagger', category: 'weapons' },
  'ra-double-team': { char: '\ue99e', label: 'Double Team', category: 'player' },
  'ra-doubled': { char: '\ue99f', label: 'Doubled', category: 'magic' },
  'ra-dragon': { char: '\ue9a2', label: 'Dragon', category: 'creatures' },
  'ra-dragon-breath': { char: '\ue9a0', label: 'Dragon Breath', category: 'magic' },
  'ra-dragon-wing': { char: '\ue9a1', label: 'Dragon Wing', category: 'creatures' },
  'ra-dragonfly': { char: '\ue9a3', label: 'Dragonfly', category: 'creatures' },
  'ra-drill': { char: '\ue9a4', label: 'Drill', category: 'weapons' },
  'ra-dripping-blade': { char: '\ue9a5', label: 'Dripping Blade', category: 'weapons' },
  'ra-dripping-knife': { char: '\ue9a6', label: 'Dripping Knife', category: 'weapons' },
  'ra-dripping-sword': { char: '\ue9a7', label: 'Dripping Sword', category: 'weapons' },
  'ra-droplet': { char: '\ue9a9', label: 'Droplet', category: 'magic' },
  'ra-droplet-splash': { char: '\ue9a8', label: 'Droplet Splash', category: 'magic' },
  'ra-droplets': { char: '\ue9aa', label: 'Droplets', category: 'rpg' },
  'ra-duel': { char: '\ue9ab', label: 'Duel', category: 'weapons' },
  'ra-egg': { char: '\ue9ad', label: 'Egg', category: 'food' },
  'ra-egg-pod': { char: '\ue9ac', label: 'Egg Pod', category: 'food' },
  'ra-eggplant': { char: '\ue9ae', label: 'Eggplant', category: 'food' },
  'ra-emerald': { char: '\ue9af', label: 'Emerald', category: 'magic' },
  'ra-energise': { char: '\ue9b0', label: 'Energise', category: 'electronics' },
  'ra-explosion': { char: '\ue9b1', label: 'Explosion', category: 'dangers' },
  'ra-explosive-materials': { char: '\ue9b2', label: 'Explosive Materials', category: 'weapons' },
  'ra-eye-monster': { char: '\ue9b3', label: 'Eye Monster', category: 'creatures' },
  'ra-eye-shield': { char: '\ue9b4', label: 'Eye Shield', category: 'armor' },
  'ra-eyeball': { char: '\ue9b5', label: 'Eyeball', category: 'magic' },
  'ra-fairy': { char: '\ue9b7', label: 'Fairy', category: 'creatures' },
  'ra-fairy-wand': { char: '\ue9b6', label: 'Fairy Wand', category: 'magic' },
  'ra-fall-down': { char: '\ue9b8', label: 'Fall Down', category: 'dangers' },
  'ra-falling': { char: '\ue9b9', label: 'Falling', category: 'player' },
  'ra-fast-ship': { char: '\ue9ba', label: 'Fast Ship', category: 'electronics' },
  'ra-feather-wing': { char: '\ue9bb', label: 'Feather Wing', category: 'rpg' },
  'ra-feathered-wing': { char: '\ue9bc', label: 'Feathered Wing', category: 'rpg' },
  'ra-fedora': { char: '\ue9bd', label: 'Fedora', category: 'armor' },
  'ra-fire': { char: '\ue9c3', label: 'Fire', category: 'magic' },
  'ra-fire-bomb': { char: '\ue9be', label: 'Fire Bomb', category: 'weapons' },
  'ra-fire-breath': { char: '\ue9bf', label: 'Fire Breath', category: 'magic' },
  'ra-fire-ring': { char: '\ue9c0', label: 'Fire Ring', category: 'magic' },
  'ra-fire-shield': { char: '\ue9c1', label: 'Fire Shield', category: 'armor' },
  'ra-fire-symbol': { char: '\ue9c2', label: 'Fire Symbol', category: 'magic' },
  'ra-fireball-sword': { char: '\ue9c4', label: 'Fireball Sword', category: 'weapons' },
  'ra-fish': { char: '\ue9c5', label: 'Fish', category: 'creatures' },
  'ra-fizzing-flask': { char: '\ue9c6', label: 'Fizzing Flask', category: 'potions' },
  'ra-flame-symbol': { char: '\ue9c7', label: 'Flame Symbol', category: 'magic' },
  'ra-flaming-arrow': { char: '\ue9c8', label: 'Flaming Arrow', category: 'weapons' },
  'ra-flaming-claw': { char: '\ue9c9', label: 'Flaming Claw', category: 'weapons' },
  'ra-flaming-trident': { char: '\ue9ca', label: 'Flaming Trident', category: 'weapons' },
  'ra-flask': { char: '\ue9cb', label: 'Flask', category: 'potions' },
  'ra-flat-hammer': { char: '\ue9cc', label: 'Flat Hammer', category: 'weapons' },
  'ra-flower': { char: '\ue9cd', label: 'Flower', category: 'plants' },
  'ra-flowers': { char: '\ue9ce', label: 'Flowers', category: 'plants' },
  'ra-fluffy-swirl': { char: '\ue9cf', label: 'Fluffy Swirl', category: 'rpg' },
  'ra-focused-lightning': { char: '\ue9d0', label: 'Focused Lightning', category: 'magic' },
  'ra-food-chain': { char: '\ue9d1', label: 'Food Chain', category: 'dangers' },
  'ra-footprint': { char: '\ue9d2', label: 'Footprint', category: 'player' },
  'ra-forging': { char: '\ue9d3', label: 'Forging', category: 'rpg' },
  'ra-forward': { char: '\ue9d4', label: 'Forward', category: 'rpg' },
  'ra-fox': { char: '\ue9d5', label: 'Fox', category: 'creatures' },
  'ra-frost-emblem': { char: '\ue9d6', label: 'Frost Emblem', category: 'magic' },
  'ra-frostfire': { char: '\ue9d7', label: 'Frostfire', category: 'magic' },
  'ra-frozen-arrow': { char: '\ue9d8', label: 'Frozen Arrow', category: 'weapons' },
  'ra-gamepad-cross': { char: '\ue9d9', label: 'Gamepad Cross', category: 'electronics' },
  'ra-gavel': { char: '\ue9da', label: 'Gavel', category: 'weapons' },
  'ra-gear-hammer': { char: '\ue9db', label: 'Gear Hammer', category: 'weapons' },
  'ra-gear-heart': { char: '\ue9dc', label: 'Gear Heart', category: 'electronics' },
  'ra-gears': { char: '\ue9dd', label: 'Gears', category: 'electronics' },
  'ra-gecko': { char: '\ue9de', label: 'Gecko', category: 'creatures' },
  'ra-gem': { char: '\ue9e0', label: 'Gem', category: 'magic' },
  'ra-gem-pendant': { char: '\ue9df', label: 'Gem Pendant', category: 'magic' },
  'ra-gemini': { char: '\ue9e1', label: 'Gemini', category: 'astrology' },
  'ra-glass-heart': { char: '\ue9e2', label: 'Glass Heart', category: 'player' },
  'ra-gloop': { char: '\ue9e3', label: 'Gloop', category: 'magic' },
  'ra-gold-bar': { char: '\ue9e4', label: 'Gold Bar', category: 'magic' },
  'ra-grappling-hook': { char: '\ue9e5', label: 'Grappling Hook', category: 'weapons' },
  'ra-grass': { char: '\ue9e7', label: 'Grass', category: 'plants' },
  'ra-grass-patch': { char: '\ue9e6', label: 'Grass Patch', category: 'plants' },
  'ra-grenade': { char: '\ue9e8', label: 'Grenade', category: 'weapons' },
  'ra-groundbreaker': { char: '\ue9e9', label: 'Groundbreaker', category: 'rpg' },
  'ra-guarded-tower': { char: '\ue9ea', label: 'Guarded Tower', category: 'rpg' },
  'ra-guillotine': { char: '\ue9eb', label: 'Guillotine', category: 'weapons' },
  'ra-halberd': { char: '\ue9ec', label: 'Halberd', category: 'weapons' },
  'ra-hammer': { char: '\ue9ee', label: 'Hammer', category: 'weapons' },
  'ra-hammer-drop': { char: '\ue9ed', label: 'Hammer Drop', category: 'weapons' },
  'ra-hand': { char: '\ue9f1', label: 'Hand', category: 'player' },
  'ra-hand-emblem': { char: '\ue9ef', label: 'Hand Emblem', category: 'player' },
  'ra-hand-saw': { char: '\ue9f0', label: 'Hand Saw', category: 'weapons' },
  'ra-harpoon-trident': { char: '\ue9f2', label: 'Harpoon Trident', category: 'weapons' },
  'ra-health': { char: '\ue9f5', label: 'Health', category: 'magic' },
  'ra-health-decrease': { char: '\ue9f3', label: 'Health Decrease', category: 'magic' },
  'ra-health-increase': { char: '\ue9f4', label: 'Health Increase', category: 'magic' },
  'ra-heart-bottle': { char: '\ue9f6', label: 'Heart Bottle', category: 'potions' },
  'ra-heart-tower': { char: '\ue9f7', label: 'Heart Tower', category: 'rpg' },
  'ra-heartburn': { char: '\ue9f8', label: 'Heartburn', category: 'dangers' },
  'ra-hearts': { char: '\ue9fa', label: 'Hearts', category: 'cards-dice' },
  'ra-hearts-card': { char: '\ue9f9', label: 'Hearts Card', category: 'cards-dice' },
  'ra-heat-haze': { char: '\ue9fb', label: 'Heat Haze', category: 'rpg' },
  'ra-heavy-fall': { char: '\ue9fc', label: 'Heavy Fall', category: 'dangers' },
  'ra-heavy-shield': { char: '\ue9fd', label: 'Heavy Shield', category: 'armor' },
  'ra-helmet': { char: '\ue9fe', label: 'Helmet', category: 'armor' },
  'ra-help': { char: '\ue9ff', label: 'Help', category: 'rpg' },
  'ra-hive-emblem': { char: '\uea00', label: 'Hive Emblem', category: 'rpg' },
  'ra-hole-ladder': { char: '\uea01', label: 'Hole Ladder', category: 'rpg' },
  'ra-honeycomb': { char: '\uea02', label: 'Honeycomb', category: 'food' },
  'ra-hood': { char: '\uea03', label: 'Hood', category: 'armor' },
  'ra-horn-call': { char: '\uea04', label: 'Horn Call', category: 'rpg' },
  'ra-horns': { char: '\uea05', label: 'Horns', category: 'rpg' },
  'ra-horseshoe': { char: '\uea06', label: 'Horseshoe', category: 'inventory' },
  'ra-hospital-cross': { char: '\uea07', label: 'Hospital Cross', category: 'magic' },
  'ra-hot-surface': { char: '\uea08', label: 'Hot Surface', category: 'magic' },
  'ra-hourglass': { char: '\uea09', label: 'Hourglass', category: 'inventory' },
  'ra-hydra': { char: '\uea0b', label: 'Hydra', category: 'creatures' },
  'ra-hydra-shot': { char: '\uea0a', label: 'Hydra Shot', category: 'magic' },
  'ra-ice-cube': { char: '\uea0c', label: 'Ice Cube', category: 'food' },
  'ra-implosion': { char: '\uea0d', label: 'Implosion', category: 'dangers' },
  'ra-incense': { char: '\uea0e', label: 'Incense', category: 'magic' },
  'ra-insect-jaws': { char: '\uea0f', label: 'Insect Jaws', category: 'creatures' },
  'ra-interdiction': { char: '\uea10', label: 'Interdiction', category: 'rpg' },
  'ra-jetpack': { char: '\uea11', label: 'Jetpack', category: 'electronics' },
  'ra-jigsaw-piece': { char: '\uea12', label: 'Jigsaw Piece', category: 'inventory' },
  'ra-kaleidoscope': { char: '\uea13', label: 'Kaleidoscope', category: 'magic' },
  'ra-kettlebell': { char: '\uea14', label: 'Kettlebell', category: 'inventory' },
  'ra-key': { char: '\uea16', label: 'Key', category: 'inventory' },
  'ra-key-basic': { char: '\uea15', label: 'Key Basic', category: 'inventory' },
  'ra-kitchen-knives': { char: '\uea17', label: 'Kitchen Knives', category: 'weapons' },
  'ra-knife': { char: '\uea19', label: 'Knife', category: 'weapons' },
  'ra-knife-fork': { char: '\uea18', label: 'Knife Fork', category: 'food' },
  'ra-knight-helmet': { char: '\uea1a', label: 'Knight Helmet', category: 'armor' },
  'ra-kunai': { char: '\uea1b', label: 'Kunai', category: 'weapons' },
  'ra-lantern-flame': { char: '\uea1c', label: 'Lantern Flame', category: 'inventory' },
  'ra-large-hammer': { char: '\uea1d', label: 'Large Hammer', category: 'weapons' },
  'ra-laser-blast': { char: '\uea1e', label: 'Laser Blast', category: 'weapons' },
  'ra-laser-site': { char: '\uea1f', label: 'Laser Site', category: 'electronics' },
  'ra-lava': { char: '\uea20', label: 'Lava', category: 'magic' },
  'ra-leaf': { char: '\uea21', label: 'Leaf', category: 'plants' },
  'ra-leo': { char: '\uea22', label: 'Leo', category: 'astrology' },
  'ra-level-four': { char: '\uea24', label: 'Level Four', category: 'magic' },
  'ra-level-four-advanced': { char: '\uea23', label: 'Level Four Advanced', category: 'magic' },
  'ra-level-three': { char: '\uea26', label: 'Level Three', category: 'magic' },
  'ra-level-three-advanced': { char: '\uea25', label: 'Level Three Advanced', category: 'magic' },
  'ra-level-two': { char: '\uea28', label: 'Level Two', category: 'magic' },
  'ra-level-two-advanced': { char: '\uea27', label: 'Level Two Advanced', category: 'magic' },
  'ra-lever': { char: '\uea29', label: 'Lever', category: 'electronics' },
  'ra-libra': { char: '\uea2a', label: 'Libra', category: 'astrology' },
  'ra-light-bulb': { char: '\uea2b', label: 'Light Bulb', category: 'electronics' },
  'ra-lighthouse': { char: '\uea2c', label: 'Lighthouse', category: 'electronics' },
  'ra-lightning': { char: '\uea31', label: 'Lightning', category: 'magic' },
  'ra-lightning-bolt': { char: '\uea2d', label: 'Lightning Bolt', category: 'magic' },
  'ra-lightning-storm': { char: '\uea2e', label: 'Lightning Storm', category: 'magic' },
  'ra-lightning-sword': { char: '\uea2f', label: 'Lightning Sword', category: 'weapons' },
  'ra-lightning-trio': { char: '\uea30', label: 'Lightning Trio', category: 'magic' },
  'ra-lion': { char: '\uea32', label: 'Lion', category: 'creatures' },
  'ra-lit-candelabra': { char: '\uea33', label: 'Lit Candelabra', category: 'inventory' },
  'ra-load': { char: '\uea34', label: 'Load', category: 'electronics' },
  'ra-locked-fortress': { char: '\uea35', label: 'Locked Fortress', category: 'rpg' },
  'ra-love-howl': { char: '\uea36', label: 'Love Howl', category: 'creatures' },
  'ra-maggot': { char: '\uea37', label: 'Maggot', category: 'creatures' },
  'ra-magnet': { char: '\uea38', label: 'Magnet', category: 'electronics' },
  'ra-mass-driver': { char: '\uea39', label: 'Mass Driver', category: 'weapons' },
  'ra-match': { char: '\uea3a', label: 'Match', category: 'inventory' },
  'ra-meat': { char: '\uea3c', label: 'Meat', category: 'food' },
  'ra-meat-hook': { char: '\uea3b', label: 'Meat Hook', category: 'weapons' },
  'ra-medical-pack': { char: '\uea3d', label: 'Medical Pack', category: 'inventory' },
  'ra-metal-gate': { char: '\uea3e', label: 'Metal Gate', category: 'rpg' },
  'ra-microphone': { char: '\uea3f', label: 'Microphone', category: 'electronics' },
  'ra-mine-wagon': { char: '\uea40', label: 'Mine Wagon', category: 'rpg' },
  'ra-mining-diamonds': { char: '\uea41', label: 'Mining Diamonds', category: 'magic' },
  'ra-mirror': { char: '\uea42', label: 'Mirror', category: 'inventory' },
  'ra-monster-skull': { char: '\uea43', label: 'Monster Skull', category: 'creatures' },
  'ra-moon-sun': { char: '\uea45', label: 'Moon Sun', category: 'astrology' },
  'ra-mountains': { char: '\uea44', label: 'Mountains', category: 'rpg' },
  'ra-mp5': { char: '\uea46', label: 'Mp5', category: 'weapons' },
  'ra-muscle-fat': { char: '\uea47', label: 'Muscle Fat', category: 'player' },
  'ra-muscle-up': { char: '\uea48', label: 'Muscle Up', category: 'player' },
  'ra-musket': { char: '\uea49', label: 'Musket', category: 'weapons' },
  'ra-nails': { char: '\uea4a', label: 'Nails', category: 'inventory' },
  'ra-nodular': { char: '\uea4b', label: 'Nodular', category: 'rpg' },
  'ra-noose': { char: '\uea4c', label: 'Noose', category: 'dangers' },
  'ra-nuclear': { char: '\uea4d', label: 'Nuclear', category: 'electronics' },
  'ra-ocarina': { char: '\uea4e', label: 'Ocarina', category: 'inventory' },
  'ra-ocean-emblem': { char: '\uea4f', label: 'Ocean Emblem', category: 'rpg' },
  'ra-octopus': { char: '\uea50', label: 'Octopus', category: 'creatures' },
  'ra-omega': { char: '\uea51', label: 'Omega', category: 'rpg' },
  'ra-on-target': { char: '\uea52', label: 'On Target', category: 'rpg' },
  'ra-ophiuchus': { char: '\uea53', label: 'Ophiuchus', category: 'astrology' },
  'ra-overhead': { char: '\uea54', label: 'Overhead', category: 'rpg' },
  'ra-overmind': { char: '\uea55', label: 'Overmind', category: 'rpg' },
  'ra-palm-tree': { char: '\uea56', label: 'Palm Tree', category: 'plants' },
  'ra-pawn': { char: '\uea57', label: 'Pawn', category: 'cards-dice' },
  'ra-pawprint': { char: '\uea58', label: 'Pawprint', category: 'player' },
  'ra-perspective-dice-five': { char: '\uea59', label: 'Perspective Dice Five', category: 'cards-dice' },
  'ra-perspective-dice-four': { char: '\uea5a', label: 'Perspective Dice Four', category: 'cards-dice' },
  'ra-perspective-dice-one': { char: '\uea5b', label: 'Perspective Dice One', category: 'cards-dice' },
  'ra-perspective-dice-random': { char: '\uea5c', label: 'Perspective Dice Random', category: 'cards-dice' },
  'ra-perspective-dice-six': { char: '\uea5e', label: 'Perspective Dice Six', category: 'cards-dice' },
  'ra-perspective-dice-three': { char: '\uea5f', label: 'Perspective Dice Three', category: 'cards-dice' },
  'ra-perspective-dice-two': { char: '\uea5d', label: 'Perspective Dice Two', category: 'cards-dice' },
  'ra-pill': { char: '\uea60', label: 'Pill', category: 'inventory' },
  'ra-pills': { char: '\uea61', label: 'Pills', category: 'inventory' },
  'ra-pine-tree': { char: '\uea62', label: 'Pine Tree', category: 'plants' },
  'ra-ping-pong': { char: '\uea63', label: 'Ping Pong', category: 'inventory' },
  'ra-pisces': { char: '\uea64', label: 'Pisces', category: 'astrology' },
  'ra-plain-dagger': { char: '\uea65', label: 'Plain Dagger', category: 'weapons' },
  'ra-player': { char: '\uea6f', label: 'Player', category: 'player' },
  'ra-player-despair': { char: '\uea66', label: 'Player Despair', category: 'player' },
  'ra-player-dodge': { char: '\uea67', label: 'Player Dodge', category: 'player' },
  'ra-player-king': { char: '\uea68', label: 'Player King', category: 'player' },
  'ra-player-lift': { char: '\uea69', label: 'Player Lift', category: 'player' },
  'ra-player-pain': { char: '\uea6a', label: 'Player Pain', category: 'player' },
  'ra-player-pyromaniac': { char: '\uea6b', label: 'Player Pyromaniac', category: 'player' },
  'ra-player-shot': { char: '\uea6c', label: 'Player Shot', category: 'player' },
  'ra-player-teleport': { char: '\uea6d', label: 'Player Teleport', category: 'player' },
  'ra-player-thunder-struck': { char: '\uea6e', label: 'Player Thunder Struck', category: 'player' },
  'ra-podium': { char: '\uea70', label: 'Podium', category: 'rpg' },
  'ra-poison-cloud': { char: '\uea71', label: 'Poison Cloud', category: 'dangers' },
  'ra-potion': { char: '\uea72', label: 'Potion', category: 'potions' },
  'ra-pyramids': { char: '\uea73', label: 'Pyramids', category: 'rpg' },
  'ra-queen-crown': { char: '\uea74', label: 'Queen Crown', category: 'armor' },
  'ra-quill-ink': { char: '\uea75', label: 'Quill Ink', category: 'inventory' },
  'ra-rabbit': { char: '\uea76', label: 'Rabbit', category: 'creatures' },
  'ra-radar-dish': { char: '\uea77', label: 'Radar Dish', category: 'electronics' },
  'ra-radial-balance': { char: '\uea78', label: 'Radial Balance', category: 'rpg' },
  'ra-radioactive': { char: '\uea79', label: 'Radioactive', category: 'electronics' },
  'ra-raven': { char: '\uea7a', label: 'Raven', category: 'creatures' },
  'ra-reactor': { char: '\uea7b', label: 'Reactor', category: 'electronics' },
  'ra-recycle': { char: '\uea7c', label: 'Recycle', category: 'electronics' },
  'ra-regeneration': { char: '\uea7d', label: 'Regeneration', category: 'electronics' },
  'ra-relic-blade': { char: '\uea7e', label: 'Relic Blade', category: 'weapons' },
  'ra-repair': { char: '\uea7f', label: 'Repair', category: 'electronics' },
  'ra-reverse': { char: '\uea80', label: 'Reverse', category: 'rpg' },
  'ra-revolver': { char: '\uea81', label: 'Revolver', category: 'weapons' },
  'ra-rifle': { char: '\uea82', label: 'Rifle', category: 'weapons' },
  'ra-ringing-bell': { char: '\uea83', label: 'Ringing Bell', category: 'inventory' },
  'ra-roast-chicken': { char: '\uea84', label: 'Roast Chicken', category: 'food' },
  'ra-robot-arm': { char: '\uea85', label: 'Robot Arm', category: 'electronics' },
  'ra-round-bottom-flask': { char: '\uea86', label: 'Round Bottom Flask', category: 'potions' },
  'ra-round-shield': { char: '\uea87', label: 'Round Shield', category: 'armor' },
  'ra-rss': { char: '\uea88', label: 'Rss', category: 'electronics' },
  'ra-rune-stone': { char: '\uea89', label: 'Rune Stone', category: 'magic' },
  'ra-sagittarius': { char: '\uea8a', label: 'Sagittarius', category: 'astrology' },
  'ra-sapphire': { char: '\uea8b', label: 'Sapphire', category: 'magic' },
  'ra-satellite': { char: '\uea8c', label: 'Satellite', category: 'electronics' },
  'ra-save': { char: '\uea8d', label: 'Save', category: 'electronics' },
  'ra-scorpio': { char: '\uea8e', label: 'Scorpio', category: 'astrology' },
  'ra-scroll-unfurled': { char: '\uea8f', label: 'Scroll Unfurled', category: 'magic' },
  'ra-scythe': { char: '\uea90', label: 'Scythe', category: 'weapons' },
  'ra-sea-serpent': { char: '\uea91', label: 'Sea Serpent', category: 'creatures' },
  'ra-seagull': { char: '\uea92', label: 'Seagull', category: 'creatures' },
  'ra-shark': { char: '\uea93', label: 'Shark', category: 'creatures' },
  'ra-sheep': { char: '\uea94', label: 'Sheep', category: 'creatures' },
  'ra-sheriff': { char: '\uea95', label: 'Sheriff', category: 'inventory' },
  'ra-shield': { char: '\uea96', label: 'Shield', category: 'armor' },
  'ra-ship-emblem': { char: '\uea97', label: 'Ship Emblem', category: 'inventory' },
  'ra-shoe-prints': { char: '\uea98', label: 'Shoe Prints', category: 'player' },
  'ra-shot-through-the-heart': { char: '\uea99', label: 'Shot Through The Heart', category: 'dangers' },
  'ra-shotgun-shell': { char: '\uea9a', label: 'Shotgun Shell', category: 'weapons' },
  'ra-shovel': { char: '\uea9b', label: 'Shovel', category: 'weapons' },
  'ra-shuriken': { char: '\uea9c', label: 'Shuriken', category: 'weapons' },
  'ra-sickle': { char: '\uea9d', label: 'Sickle', category: 'weapons' },
  'ra-sideswipe': { char: '\uea9e', label: 'Sideswipe', category: 'rpg' },
  'ra-site': { char: '\uea9f', label: 'Site', category: 'rpg' },
  'ra-skull': { char: '\ueaa1', label: 'Skull', category: 'dangers' },
  'ra-skull-trophy': { char: '\ueaa0', label: 'Skull Trophy', category: 'dangers' },
  'ra-slash-ring': { char: '\ueaa2', label: 'Slash Ring', category: 'inventory' },
  'ra-small-fire': { char: '\ueaa3', label: 'Small Fire', category: 'magic' },
  'ra-snail': { char: '\ueaa4', label: 'Snail', category: 'creatures' },
  'ra-snake': { char: '\ueaa5', label: 'Snake', category: 'creatures' },
  'ra-snorkel': { char: '\ueaa6', label: 'Snorkel', category: 'inventory' },
  'ra-snowflake': { char: '\ueaa7', label: 'Snowflake', category: 'magic' },
  'ra-soccer-ball': { char: '\ueaa8', label: 'Soccer Ball', category: 'inventory' },
  'ra-spades': { char: '\ueaaa', label: 'Spades', category: 'cards-dice' },
  'ra-spades-card': { char: '\ueaa9', label: 'Spades Card', category: 'cards-dice' },
  'ra-spawn-node': { char: '\ueaab', label: 'Spawn Node', category: 'rpg' },
  'ra-spear-head': { char: '\ueaac', label: 'Spear Head', category: 'weapons' },
  'ra-speech-bubble': { char: '\ueaad', label: 'Speech Bubble', category: 'electronics' },
  'ra-speech-bubbles': { char: '\ueaae', label: 'Speech Bubbles', category: 'electronics' },
  'ra-spider-face': { char: '\ueaaf', label: 'Spider Face', category: 'creatures' },
  'ra-spikeball': { char: '\ueab0', label: 'Spikeball', category: 'dangers' },
  'ra-spiked-mace': { char: '\ueab1', label: 'Spiked Mace', category: 'weapons' },
  'ra-spiked-tentacle': { char: '\ueab2', label: 'Spiked Tentacle', category: 'creatures' },
  'ra-spinning-sword': { char: '\ueab3', label: 'Spinning Sword', category: 'weapons' },
  'ra-spiral-shell': { char: '\ueab4', label: 'Spiral Shell', category: 'creatures' },
  'ra-splash': { char: '\ueab5', label: 'Splash', category: 'rpg' },
  'ra-spray-can': { char: '\ueab6', label: 'Spray Can', category: 'inventory' },
  'ra-sprout': { char: '\ueab8', label: 'Sprout', category: 'plants' },
  'ra-sprout-emblem': { char: '\ueab7', label: 'Sprout Emblem', category: 'plants' },
  'ra-stopwatch': { char: '\ueab9', label: 'Stopwatch', category: 'inventory' },
  'ra-suckered-tentacle': { char: '\ueaba', label: 'Suckered Tentacle', category: 'creatures' },
  'ra-suits': { char: '\ueabb', label: 'Suits', category: 'cards-dice' },
  'ra-sun': { char: '\ueabd', label: 'Sun', category: 'magic' },
  'ra-sun-symbol': { char: '\ueabc', label: 'Sun Symbol', category: 'magic' },
  'ra-sunbeams': { char: '\ueabe', label: 'Sunbeams', category: 'magic' },
  'ra-super-mushroom': { char: '\ueabf', label: 'Super Mushroom', category: 'plants' },
  'ra-supersonic-arrow': { char: '\ueac0', label: 'Supersonic Arrow', category: 'weapons' },
  'ra-surveillance-camera': { char: '\ueac1', label: 'Surveillance Camera', category: 'electronics' },
  'ra-sword': { char: '\ue946', label: 'Sword', category: 'weapons' },
  'ra-syringe': { char: '\ueac2', label: 'Syringe', category: 'inventory' },
  'ra-target-arrows': { char: '\ueac3', label: 'Target Arrows', category: 'weapons' },
  'ra-target-laser': { char: '\ueac4', label: 'Target Laser', category: 'rpg' },
  'ra-targeted': { char: '\ueac5', label: 'Targeted', category: 'rpg' },
  'ra-taurus': { char: '\ueac6', label: 'Taurus', category: 'astrology' },
  'ra-telescope': { char: '\ueac7', label: 'Telescope', category: 'electronics' },
  'ra-tentacle': { char: '\ueac8', label: 'Tentacle', category: 'creatures' },
  'ra-tesla': { char: '\ueac9', label: 'Tesla', category: 'electronics' },
  'ra-thorn-arrow': { char: '\ueaca', label: 'Thorn Arrow', category: 'weapons' },
  'ra-thorny-vine': { char: '\ueacb', label: 'Thorny Vine', category: 'plants' },
  'ra-three-keys': { char: '\ueacc', label: 'Three Keys', category: 'inventory' },
  'ra-tic-tac-toe': { char: '\ueacd', label: 'Tic Tac Toe', category: 'inventory' },
  'ra-toast': { char: '\ueace', label: 'Toast', category: 'food' },
  'ra-tombstone': { char: '\ueacf', label: 'Tombstone', category: 'dangers' },
  'ra-tooth': { char: '\uead0', label: 'Tooth', category: 'inventory' },
  'ra-torch': { char: '\uead1', label: 'Torch', category: 'inventory' },
  'ra-tower': { char: '\uead2', label: 'Tower', category: 'rpg' },
  'ra-trail': { char: '\uead3', label: 'Trail', category: 'rpg' },
  'ra-trefoil-lily': { char: '\uead4', label: 'Trefoil Lily', category: 'plants' },
  'ra-trident': { char: '\uead5', label: 'Trident', category: 'weapons' },
  'ra-triforce': { char: '\uead6', label: 'Triforce', category: 'magic' },
  'ra-trophy': { char: '\uead7', label: 'Trophy', category: 'inventory' },
  'ra-turd': { char: '\uead8', label: 'Turd', category: 'inventory' },
  'ra-two-dragons': { char: '\uead9', label: 'Two Dragons', category: 'creatures' },
  'ra-two-hearts': { char: '\ueada', label: 'Two Hearts', category: 'magic' },
  'ra-uncertainty': { char: '\ueadb', label: 'Uncertainty', category: 'rpg' },
  'ra-underhand': { char: '\ueadc', label: 'Underhand', category: 'rpg' },
  'ra-unplugged': { char: '\ueadd', label: 'Unplugged', category: 'electronics' },
  'ra-vase': { char: '\ueade', label: 'Vase', category: 'potions' },
  'ra-venomous-snake': { char: '\ueadf', label: 'Venomous Snake', category: 'creatures' },
  'ra-vest': { char: '\ueae0', label: 'Vest', category: 'armor' },
  'ra-vial': { char: '\ueae1', label: 'Vial', category: 'potions' },
  'ra-vine-whip': { char: '\ueae2', label: 'Vine Whip', category: 'weapons' },
  'ra-virgo': { char: '\ueae3', label: 'Virgo', category: 'astrology' },
  'ra-water-drop': { char: '\ueae4', label: 'Water Drop', category: 'magic' },
  'ra-wifi': { char: '\ueae5', label: 'Wifi', category: 'electronics' },
  'ra-wireless-signal': { char: '\ueae6', label: 'Wireless Signal', category: 'electronics' },
  'ra-wolf-head': { char: '\ueae7', label: 'Wolf Head', category: 'creatures' },
  'ra-wolf-howl': { char: '\ueae8', label: 'Wolf Howl', category: 'creatures' },
  'ra-wooden-sign': { char: '\ueae9', label: 'Wooden Sign', category: 'inventory' },
  'ra-wrench': { char: '\ueaea', label: 'Wrench', category: 'inventory' },
  'ra-wyvern': { char: '\ueaeb', label: 'Wyvern', category: 'creatures' },
  'ra-x-mark': { char: '\ueaec', label: 'X Mark', category: 'dangers' },
  'ra-zebra-shield': { char: '\ueaed', label: 'Zebra Shield', category: 'armor' },
  'ra-zigzag-leaf': { char: '\ueaee', label: 'Zigzag Leaf', category: 'plants' },
};

/**
 * Get the character for an icon class
 * @param {string} iconClass - The icon class name (e.g., 'ra-sword')
 * @returns {string|null} The unicode character or null if not found
 */
function getIconChar(iconClass) {
  const icon = RA_ICONS[iconClass];
  return icon ? icon.char : null;
}

/**
 * Get full info for an icon
 * @param {string} iconClass - The icon class name
 * @returns {Object|null} Icon info object or null
 */
function getIconInfo(iconClass) {
  return RA_ICONS[iconClass] || null;
}

/**
 * Get all icons in a category
 * @param {string} categoryId - The category ID
 * @returns {Array} Array of icon objects with iconClass property
 */
function getIconsByCategory(categoryId) {
  return Object.entries(RA_ICONS)
    .filter(([_, data]) => data.category === categoryId)
    .map(([iconClass, data]) => ({ iconClass, ...data }));
}

/**
 * Search icons by label or class name
 * @param {string} query - Search query
 * @returns {Array} Matching icons
 */
function searchIcons(query) {
  const lowerQuery = query.toLowerCase();
  return Object.entries(RA_ICONS)
    .filter(([iconClass, data]) => 
      iconClass.toLowerCase().includes(lowerQuery) || 
      data.label.toLowerCase().includes(lowerQuery)
    )
    .map(([iconClass, data]) => ({ iconClass, ...data }));
}

/**
 * Get all icon class names
 * @returns {Array} Array of icon class names
 */
function getAllIconClasses() {
  return Object.keys(RA_ICONS);
}

// Datacore module export
return { 
  RA_CATEGORIES, 
  RA_ICONS, 
  getIconChar, 
  getIconInfo, 
  getIconsByCategory, 
  searchIcons,
  getAllIconClasses
};
```

# objectTypeResolver

```js
/**
 * objectTypeResolver.js
 * 
 * Resolves object types by merging built-in definitions with user customizations.
 * Handles:
 * - Object overrides (modified built-ins)
 * - Hidden objects
 * - Custom objects
 * - Custom categories
 * - Unknown object fallback
 */

const { OBJECT_TYPES, CATEGORIES } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypes"));
const { getObjectSettings } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));
const { RA_ICONS, getIconChar, getIconInfo } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "rpgAwesomeIcons"));

/**
 * Fallback for unknown/deleted object types
 * Used when a map references an object type that no longer exists
 */
const UNKNOWN_OBJECT_FALLBACK = {
  id: '__unknown__',
  symbol: '?',
  label: 'Unknown Object',
  category: 'markers',
  isUnknown: true
};

/**
 * Check if an object type uses an RPGAwesome icon
 * @param {Object} objectType - The object type definition
 * @returns {boolean} True if the object uses an icon font
 */
function hasIconClass(objectType) {
  return objectType && typeof objectType.iconClass === 'string' && objectType.iconClass.length > 0;
}

/**
 * Get the render character for an object type
 * Handles both iconClass (RPGAwesome) and symbol (Unicode) with fallback
 * 
 * @param {Object} objectType - The object type definition
 * @returns {{ char: string, isIcon: boolean }} Character to render and whether it's an icon font
 */
function getRenderChar(objectType) {
  if (!objectType) {
    return { char: '?', isIcon: false };
  }
  
  // If iconClass is set, try to get the icon character
  if (hasIconClass(objectType)) {
    const iconChar = getIconChar(objectType.iconClass);
    if (iconChar) {
      return { char: iconChar, isIcon: true };
    }
    // iconClass was set but invalid - fall through to symbol/fallback
    console.warn(`[objectTypeResolver] Invalid iconClass: ${objectType.iconClass}`);
  }
  
  // Use symbol if available
  if (objectType.symbol) {
    return { char: objectType.symbol, isIcon: false };
  }
  
  // Final fallback
  return { char: '?', isIcon: false };
}

/**
 * Validate an iconClass value
 * @param {string} iconClass - The icon class to validate (e.g., 'ra-sword')
 * @returns {boolean} True if valid
 */
function isValidIconClass(iconClass) {
  if (!iconClass || typeof iconClass !== 'string') return false;
  return RA_ICONS.hasOwnProperty(iconClass);
}

/**
 * Default category order for built-in categories
 */
const BUILT_IN_CATEGORY_ORDER = {
  'notes': 0,
  'navigation': 10,
  'hazards': 20,
  'features': 30,
  'encounters': 40,
  'markers': 50
};

/**
 * Get effective object types list (built-ins + overrides + custom)
 * This is the main function consumers should use for listing available objects.
 * 
 * @returns {Array} Merged and filtered object types
 */
function getResolvedObjectTypes() {
  const settings = getObjectSettings();
  const { objectOverrides = {}, customObjects = [] } = settings;
  
  // Apply overrides to built-ins, filter out hidden ones
  // Built-in objects get default order based on their index in OBJECT_TYPES
  const resolvedBuiltIns = OBJECT_TYPES
    .filter(obj => !objectOverrides[obj.id]?.hidden)
    .map((obj, index) => {
      const override = objectOverrides[obj.id];
      const defaultOrder = index * 10; // Leave gaps for reordering
      if (override) {
        // Merge override properties (excluding 'hidden' which is handled above)
        const { hidden, ...overrideProps } = override;
        return {
          ...obj,
          ...overrideProps,
          order: override.order ?? defaultOrder,
          isBuiltIn: true,
          isModified: true
        };
      }
      return {
        ...obj,
        order: defaultOrder,
        isBuiltIn: true,
        isModified: false
      };
    });
  
  // Add custom objects with their flag
  // Custom objects use their order or a high default to appear at the end
  const resolvedCustom = customObjects.map((obj, index) => ({
    ...obj,
    order: obj.order ?? (1000 + index * 10),
    isCustom: true,
    isBuiltIn: false
  }));
  
  return [...resolvedBuiltIns, ...resolvedCustom];
}

/**
 * Get effective categories list (built-ins + custom), sorted by order
 * 
 * @returns {Array} Merged and sorted categories
 */
function getResolvedCategories() {
  const settings = getObjectSettings();
  const { customCategories = [] } = settings;
  
  // Add order to built-in categories
  const resolvedBuiltIns = CATEGORIES.map(c => ({
    ...c,
    isBuiltIn: true,
    order: BUILT_IN_CATEGORY_ORDER[c.id] ?? 50
  }));
  
  // Add custom categories with their flags
  const resolvedCustom = customCategories.map(c => ({
    ...c,
    isCustom: true,
    isBuiltIn: false,
    order: c.order ?? 100  // Default custom categories to end
  }));
  
  // Combine and sort by order
  return [...resolvedBuiltIns, ...resolvedCustom]
    .sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
}

/**
 * Get list of hidden built-in objects
 * Useful for showing a "hidden objects" section in settings
 * 
 * @returns {Array} Hidden object definitions
 */
function getHiddenObjects() {
  const settings = getObjectSettings();
  const { objectOverrides = {} } = settings;
  
  return OBJECT_TYPES
    .filter(obj => objectOverrides[obj.id]?.hidden)
    .map(obj => ({
      ...obj,
      isBuiltIn: true,
      isHidden: true
    }));
}

/**
 * Get a single object type by ID
 * Returns the resolved version (with overrides applied) or fallback for unknown
 * 
 * @param {string} typeId - The object type ID to look up
 * @returns {Object} Object type definition (never null - returns fallback for unknown)
 */
function getObjectType(typeId) {
  // Handle null/undefined
  if (!typeId) {
    return UNKNOWN_OBJECT_FALLBACK;
  }
  
  // Special case: return the fallback directly if requested
  if (typeId === '__unknown__') {
    return UNKNOWN_OBJECT_FALLBACK;
  }
  
  const settings = getObjectSettings();
  const { objectOverrides = {}, customObjects = [] } = settings;
  
  // Check built-in objects first (including hidden ones - they still need to render)
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  if (builtIn) {
    const override = objectOverrides[typeId];
    if (override) {
      const { hidden, ...overrideProps } = override;
      return {
        ...builtIn,
        ...overrideProps,
        isBuiltIn: true,
        isModified: true,
        isHidden: hidden || false
      };
    }
    return {
      ...builtIn,
      isBuiltIn: true,
      isModified: false
    };
  }
  
  // Check custom objects
  const custom = customObjects.find(t => t.id === typeId);
  if (custom) {
    return {
      ...custom,
      isCustom: true,
      isBuiltIn: false
    };
  }
  
  // Not found - return fallback
  return UNKNOWN_OBJECT_FALLBACK;
}

/**
 * Check if an object type exists (built-in or custom, not hidden)
 * 
 * @param {string} typeId - The object type ID
 * @returns {boolean} True if type exists and is not hidden
 */
function objectTypeExists(typeId) {
  const objType = getObjectType(typeId);
  return objType.id !== '__unknown__' && !objType.isHidden;
}

/**
 * Get the original (unmodified) built-in object definition
 * Used for "reset to default" functionality
 * 
 * @param {string} typeId - The built-in object type ID
 * @returns {Object|null} Original definition or null if not a built-in
 */
function getOriginalBuiltIn(typeId) {
  const builtIn = OBJECT_TYPES.find(t => t.id === typeId);
  return builtIn ? { ...builtIn, isBuiltIn: true } : null;
}

/**
 * Generate a unique ID for a custom object
 * 
 * @returns {string} Unique ID with 'custom-' prefix
 */
function generateCustomObjectId() {
  return 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Generate a unique ID for a custom category
 * 
 * @returns {string} Unique ID with 'custom-cat-' prefix
 */
function generateCustomCategoryId() {
  return 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Validate a symbol string
 * Returns true if the symbol is valid (non-empty, reasonable length)
 * 
 * @param {string} symbol - The symbol to validate
 * @returns {boolean} True if valid
 */
function isValidSymbol(symbol) {
  if (!symbol || typeof symbol !== 'string') return false;
  // Allow 1-4 characters (some emoji are multi-codepoint)
  const trimmed = symbol.trim();
  return trimmed.length >= 1 && trimmed.length <= 8;
}

/**
 * Validate an object definition
 * Objects can have either a symbol (Unicode) OR an iconClass (RPGAwesome), or both
 * 
 * @param {Object} obj - Object definition to validate
 * @returns {{ valid: boolean, errors: string[] }} Validation result
 */
function validateObjectDefinition(obj) {
  const errors = [];
  
  const hasSymbol = obj.symbol && isValidSymbol(obj.symbol);
  const hasIcon = obj.iconClass && isValidIconClass(obj.iconClass);
  
  // Must have at least one of symbol or iconClass
  if (!hasSymbol && !hasIcon) {
    if (obj.iconClass && !hasIcon) {
      errors.push('Invalid icon selection');
    } else if (obj.symbol && !hasSymbol) {
      errors.push('Symbol must be 1-8 characters');
    } else {
      errors.push('Either a symbol or an icon is required');
    }
  }
  
  if (!obj.label || typeof obj.label !== 'string' || obj.label.trim().length === 0) {
    errors.push('Label is required');
  }
  
  if (!obj.category || typeof obj.category !== 'string') {
    errors.push('Category is required');
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
}

// Export all functions
return {
  // Core resolution
  getResolvedObjectTypes,
  getResolvedCategories,
  getObjectType,
  getHiddenObjects,
  
  // Icon/symbol helpers
  hasIconClass,
  getRenderChar,
  isValidIconClass,
  
  // Utilities
  objectTypeExists,
  getOriginalBuiltIn,
  generateCustomObjectId,
  generateCustomCategoryId,
  isValidSymbol,
  validateObjectDefinition,
  
  // Constants
  UNKNOWN_OBJECT_FALLBACK,
  BUILT_IN_CATEGORY_ORDER,
  
  // Re-export icon data for convenience
  RA_ICONS
};
```

# hexSlotPositioner

```js
/**
 * hexSlotPositioner.js
 * 
 * Manages object positioning within hex cells for multi-object support.
 * 
 * Slot arrangements vary by object count:
 * - 1 object:  Center
 * - 2 objects: Horizontal row (flat-top) or vertical stack (pointy-top)
 * - 3 objects: Triangle formation
 * - 4 objects: Diamond/cross pattern
 * 
 * Offsets are in hex-size units (-0.5 to 0.5 range), where 1.0 = full hex width/height.
 * These get multiplied by the actual hex size during rendering.
 */

/**
 * Flat-top hex arrangements
 * For flat-top hexes, the "top" is a flat edge, so horizontal arrangements
 * work well as there's more horizontal space.
 */
const FLAT_TOP_ARRANGEMENTS = {
  1: [
    { slot: 0, offsetX: 0, offsetY: 0 }
  ],
  2: [
    { slot: 0, offsetX: -0.22, offsetY: 0 },
    { slot: 1, offsetX: 0.22, offsetY: 0 }
  ],
  3: [
    { slot: 0, offsetX: -0.20, offsetY: -0.15 },
    { slot: 1, offsetX: 0.20, offsetY: -0.15 },
    { slot: 2, offsetX: 0, offsetY: 0.20 }
  ],
  4: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },      // North
    { slot: 1, offsetX: 0.20, offsetY: 0 },       // East
    { slot: 2, offsetX: 0, offsetY: 0.20 },       // South
    { slot: 3, offsetX: -0.20, offsetY: 0 }       // West
  ]
};

/**
 * Pointy-top hex arrangements
 * For pointy-top hexes, the "top" is a point, so vertical arrangements
 * work better as there's more vertical space.
 */
const POINTY_TOP_ARRANGEMENTS = {
  1: [
    { slot: 0, offsetX: 0, offsetY: 0 }
  ],
  2: [
    { slot: 0, offsetX: 0, offsetY: -0.22 },
    { slot: 1, offsetX: 0, offsetY: 0.22 }
  ],
  3: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },
    { slot: 1, offsetX: -0.18, offsetY: 0.15 },
    { slot: 2, offsetX: 0.18, offsetY: 0.15 }
  ],
  4: [
    { slot: 0, offsetX: 0, offsetY: -0.20 },      // North
    { slot: 1, offsetX: 0.20, offsetY: 0 },       // East
    { slot: 2, offsetX: 0, offsetY: 0.20 },       // South
    { slot: 3, offsetX: -0.20, offsetY: 0 }       // West
  ]
};

/**
 * Get slot offset for rendering
 * @param {number} slot - Slot index (0-3)
 * @param {number} objectCount - Total objects in this cell (1-4)
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {{ offsetX: number, offsetY: number }}
 */
function getSlotOffset(slot, objectCount, orientation = 'flat') {
  const arrangements = orientation === 'pointy' 
    ? POINTY_TOP_ARRANGEMENTS 
    : FLAT_TOP_ARRANGEMENTS;
  
  // Clamp object count to valid range
  const count = Math.min(Math.max(objectCount, 1), 4);
  const arrangement = arrangements[count];
  const position = arrangement?.find(p => p.slot === slot);
  
  return position 
    ? { offsetX: position.offsetX, offsetY: position.offsetY }
    : { offsetX: 0, offsetY: 0 };
}

/**
 * Assign next available slot for a new object
 * @param {number[]} existingSlots - Slots already occupied in cell
 * @returns {number} Next available slot (0-3), or -1 if cell is full
 */
function assignSlot(existingSlots) {
  for (let i = 0; i < 4; i++) {
    if (!existingSlots.includes(i)) {
      return i;
    }
  }
  return -1; // Cell is full
}

/**
 * Reorganize slots after object removal to maintain compact arrangement
 * This ensures objects are always in slots 0, 1, 2... without gaps.
 * 
 * @param {number[]} currentSlots - Current slot assignments (may have gaps)
 * @returns {Map<number, number>} Map of oldSlot -> newSlot for slots that need updating
 * 
 * @example
 * // If objects are in slots [0, 2, 3] after removing slot 1:
 * reorganizeSlots([0, 2, 3])
 * // Returns: Map { 2 -> 1, 3 -> 2 }
 * // Slot 0 stays, slot 2 becomes 1, slot 3 becomes 2
 */
function reorganizeSlots(currentSlots) {
  // Sort existing slots
  const sorted = [...currentSlots].sort((a, b) => a - b);
  const remapping = new Map();
  
  // Assign new slots sequentially (0, 1, 2, ...)
  sorted.forEach((oldSlot, newSlot) => {
    if (oldSlot !== newSlot) {
      remapping.set(oldSlot, newSlot);
    }
  });
  
  return remapping;
}

/**
 * Get the maximum number of objects allowed per cell
 * @returns {number}
 */
function getMaxObjectsPerCell() {
  return 4;
}

/**
 * Calculate scale factor for objects in multi-object cells
 * Objects should be smaller when sharing space to avoid overlap.
 * 
 * @param {number} objectCount - Number of objects in cell
 * @returns {number} Scale factor (0.55-1.0)
 */
function getMultiObjectScale(objectCount) {
  if (objectCount <= 1) return 1.0;
  if (objectCount === 2) return 0.7;
  if (objectCount === 3) return 0.6;
  return 0.55; // 4 objects
}

/**
 * Get objects in a specific cell
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate (q for hex)
 * @param {number} y - Cell y coordinate (r for hex)
 * @returns {Array} Objects in this cell
 */
function getObjectsInCell(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  
  return objects.filter(obj => 
    obj.position && 
    obj.position.x === x && 
    obj.position.y === y
  );
}

/**
 * Check if a cell can accept another object
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {boolean} True if cell has room for another object
 */
function canAddObjectToCell(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  return cellObjects.length < getMaxObjectsPerCell();
}

/**
 * Get occupied slots in a cell
 * @param {Array} objects - All objects array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {number[]} Array of occupied slot indices
 */
function getOccupiedSlots(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  return cellObjects
    .map(obj => obj.slot)
    .filter(slot => slot !== undefined && slot !== null);
}

/**
 * Prepare objects array after removing an object from a multi-object cell.
 * Reorganizes remaining objects to fill gaps in slot assignments.
 * 
 * @param {Array} objects - Current objects array (after removal)
 * @param {number} x - Cell x coordinate where object was removed
 * @param {number} y - Cell y coordinate where object was removed
 * @returns {Array} Updated objects array with reorganized slots
 */
function reorganizeAfterRemoval(objects, x, y) {
  const cellObjects = getObjectsInCell(objects, x, y);
  
  // If 0 or 1 objects remain, no reorganization needed
  if (cellObjects.length <= 1) {
    // Reset single object to slot 0 if it has a different slot
    if (cellObjects.length === 1 && cellObjects[0].slot !== 0) {
      return objects.map(obj => {
        if (obj.id === cellObjects[0].id) {
          return { ...obj, slot: 0 };
        }
        return obj;
      });
    }
    return objects;
  }
  
  // Get current slots and compute remapping
  const currentSlots = cellObjects.map(obj => obj.slot).filter(s => s !== undefined);
  const remapping = reorganizeSlots(currentSlots);
  
  // If no remapping needed, return unchanged
  if (remapping.size === 0) return objects;
  
  // Apply remapping to objects in this cell
  return objects.map(obj => {
    if (obj.position?.x === x && obj.position?.y === y && obj.slot !== undefined) {
      const newSlot = remapping.get(obj.slot);
      if (newSlot !== undefined) {
        return { ...obj, slot: newSlot };
      }
    }
    return obj;
  });
}

/**
 * Find which object in a multi-object cell was clicked based on proximity to slot positions.
 * 
 * @param {Array} objects - All objects array
 * @param {number} hexX - Hex q coordinate
 * @param {number} hexY - Hex r coordinate  
 * @param {number} clickOffsetX - Click offset from hex center (in hex-width units, roughly -0.5 to 0.5)
 * @param {number} clickOffsetY - Click offset from hex center (in hex-width units, roughly -0.5 to 0.5)
 * @param {string} orientation - 'flat' or 'pointy'
 * @returns {Object|null} The clicked object, or null if no objects in cell
 */
function getClickedObjectInCell(objects, hexX, hexY, clickOffsetX, clickOffsetY, orientation) {
  const cellObjects = getObjectsInCell(objects, hexX, hexY);
  
  if (cellObjects.length === 0) return null;
  if (cellObjects.length === 1) return cellObjects[0];
  
  // Find object whose slot position is closest to click point
  let closest = null;
  let closestDist = Infinity;
  
  for (const obj of cellObjects) {
    // Get slot position (default to slot 0 if undefined)
    const effectiveSlot = obj.slot ?? cellObjects.indexOf(obj);
    const { offsetX, offsetY } = getSlotOffset(
      effectiveSlot,
      cellObjects.length,
      orientation
    );
    
    // Calculate distance from click to this slot position
    const dist = Math.sqrt(
      Math.pow(clickOffsetX - offsetX, 2) +
      Math.pow(clickOffsetY - offsetY, 2)
    );
    
    if (dist < closestDist) {
      closestDist = dist;
      closest = obj;
    }
  }
  
  return closest;
}

return {
  // Arrangement data
  FLAT_TOP_ARRANGEMENTS,
  POINTY_TOP_ARRANGEMENTS,
  
  // Core positioning functions
  getSlotOffset,
  assignSlot,
  reorganizeSlots,
  
  // Utility functions
  getMaxObjectsPerCell,
  getMultiObjectScale,
  getObjectsInCell,
  canAddObjectToCell,
  getOccupiedSlots,
  reorganizeAfterRemoval,
  getClickedObjectInCell
};
```

# objectOperations

```js
// Import getObjectType from the resolver (handles overrides, custom objects, fallback)
const { getObjectType } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypeResolver"));
const { 
  assignSlot, 
  getObjectsInCell, 
  canAddObjectToCell, 
  getOccupiedSlots,
  reorganizeAfterRemoval 
} = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "hexSlotPositioner"));

// Note: getObjectType is imported from objectTypeResolver.js
// It handles built-in objects, overrides, custom objects, and unknown fallback

/**
 * Generate a unique ID for an object
 * @returns {string} UUID string
 */
function generateObjectId() {
  return 'obj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Find object at specific grid coordinates
 * @param {Array} objects - Array of objects
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Object|null} Object at position or null
 */
function getObjectAtPosition(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return null;
  
  return objects.find(obj => {
    // Ensure size exists (backward compatibility)
    const size = obj.size || { width: 1, height: 1 };
    const pos = obj.position;
    
    // Check if (x, y) is within object bounds
    return x >= pos.x && x < pos.x + size.width &&
           y >= pos.y && y < pos.y + size.height;
  }) || null;
}

/**
 * Add a new object to the objects array
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Array} New objects array with added object
 */
function addObject(objects, typeId, x, y) {
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    console.error(`Unknown object type: ${typeId}`);
    return objects;
  }
  
  // Check if object already exists at position
  const existing = getObjectAtPosition(objects, x, y);
  if (existing) {
    console.warn(`Object already exists at position (${x}, ${y})`);
    return objects;
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,  // Phase 1: Note integration - path to linked note
    alignment: 'center'  // Default: 'center' | 'north' | 'south' | 'east' | 'west'
  };
  
  return [...objects, newObject];
}

/**
 * Add a new object to a hex cell with automatic slot assignment.
 * Supports up to 4 objects per hex cell.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID
 * @param {number} x - Hex q coordinate
 * @param {number} y - Hex r coordinate
 * @returns {{ objects: Array, success: boolean, error?: string }} Result with new array or error
 */
function addObjectToHex(objects, typeId, x, y) {
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    return { 
      objects, 
      success: false, 
      error: `Unknown object type: ${typeId}` 
    };
  }
  
  // Check if cell can accept another object
  if (!canAddObjectToCell(objects, x, y)) {
    return { 
      objects, 
      success: false, 
      error: 'Cell is full (maximum 4 objects)' 
    };
  }
  
  // Get occupied slots and assign next available
  const occupiedSlots = getOccupiedSlots(objects, x, y);
  const slot = assignSlot(occupiedSlots);
  
  if (slot === -1) {
    return { 
      objects, 
      success: false, 
      error: 'No available slots' 
    };
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment: 'center',
    slot: slot  // Slot assignment for multi-object cells
  };
  
  return { 
    objects: [...objects, newObject], 
    success: true 
  };
}

/**
 * Remove object by ID
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to remove
 * @returns {Array} New objects array without the specified object
 */
function removeObject(objects, objectId) {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => obj.id !== objectId);
}

/**
 * Remove object by ID from a hex map, with slot reorganization.
 * After removal, remaining objects in the same cell have their slots
 * reorganized to maintain compact arrangement.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to remove
 * @returns {Array} New objects array with object removed and slots reorganized
 */
function removeObjectFromHex(objects, objectId) {
  if (!objects || !Array.isArray(objects)) return [];
  
  // Find the object to get its position before removal
  const objectToRemove = objects.find(obj => obj.id === objectId);
  if (!objectToRemove) return objects;
  
  const { x, y } = objectToRemove.position;
  
  // Remove the object
  const afterRemoval = objects.filter(obj => obj.id !== objectId);
  
  // Reorganize remaining slots in that cell
  return reorganizeAfterRemoval(afterRemoval, x, y);
}

/**
 * Remove object at specific position
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @returns {Array} New objects array without object at position
 */
function removeObjectAtPosition(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  return objects.filter(obj => !(obj.position.x === x && obj.position.y === y));
}

/**
 * Remove a single object from a hex cell (the one with the highest slot number).
 * Use this for eraser tool on hex maps - removes one object at a time.
 * After removal, remaining objects have their slots reorganized.
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Hex q coordinate
 * @param {number} y - Hex r coordinate
 * @returns {Array} New objects array with one object removed
 */
function removeOneObjectFromHex(objects, x, y) {
  if (!objects || !Array.isArray(objects)) return [];
  
  // Get objects in this cell
  const cellObjects = getObjectsInCell(objects, x, y);
  if (cellObjects.length === 0) return objects;
  
  // Find object with highest slot (most recently added)
  // If no slots assigned, just remove the last one
  const toRemove = cellObjects.reduce((highest, obj) => {
    const objSlot = obj.slot ?? -1;
    const highestSlot = highest.slot ?? -1;
    return objSlot > highestSlot ? obj : highest;
  }, cellObjects[0]);
  
  // Remove and reorganize
  return removeObjectFromHex(objects, toRemove.id);
}

/**
 * Remove all objects within a rectangular area
 * @param {Array} objects - Current objects array
 * @param {number} x1 - First corner X
 * @param {number} y1 - First corner Y
 * @param {number} x2 - Second corner X
 * @param {number} y2 - Second corner Y
 * @returns {Array} New objects array without objects in rectangle
 */
function removeObjectsInRectangle(objects, x1, y1, x2, y2) {
  if (!objects || !Array.isArray(objects)) return [];
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return objects.filter(obj => {
    return !(obj.position.x >= minX && obj.position.x <= maxX && 
             obj.position.y >= minY && obj.position.y <= maxY);
  });
}

/**
 * Update object properties by ID
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to update
 * @param {Object} updates - Object with properties to update
 * @returns {Array} New objects array with updated object
 */
function updateObject(objects, objectId, updates) {
  if (!objects || !Array.isArray(objects)) return [];
  
  return objects.map(obj => {
    if (obj.id === objectId) {
      return { ...obj, ...updates };
    }
    return obj;
  });
}

/**
 * Check if an area is occupied by any object (excluding optional exception)
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid X coordinate
 * @param {number} y - Grid Y coordinate
 * @param {number} width - Width in grid cells
 * @param {number} height - Height in grid cells
 * @param {string} excludeId - Optional object ID to exclude from check
 * @returns {boolean} True if area is free, false if occupied
 */
function isAreaFree(objects, x, y, width, height, excludeId = null) {
  if (!objects || !Array.isArray(objects)) return true;
  
  for (const obj of objects) {
    if (excludeId && obj.id === excludeId) continue;
    
    const size = obj.size || { width: 1, height: 1 };
    const pos = obj.position;
    
    // Check if rectangles overlap
    const objRight = pos.x + size.width;
    const objBottom = pos.y + size.height;
    const areaRight = x + width;
    const areaBottom = y + height;
    
    const overlaps = !(objRight <= x || pos.x >= areaRight || 
                      objBottom <= y || pos.y >= areaBottom);
    
    if (overlaps) return false;
  }
  
  return true;
}

/**
 * Check if an object can be resized to new dimensions
 * @param {Array} objects - Current objects array
 * @param {string} objectId - Object ID to resize
 * @param {number} newWidth - New width in grid cells
 * @param {number} newHeight - New height in grid cells
 * @param {number} maxSize - Maximum size allowed (default 5)
 * @returns {boolean} True if resize is valid
 */
function canResizeObject(objects, objectId, newWidth, newHeight, maxSize = 5) {
  if (newWidth < 1 || newHeight < 1) return false;
  if (newWidth > maxSize || newHeight > maxSize) return false;
  
  const object = objects.find(obj => obj.id === objectId);
  if (!object) return false;
  
  // Check if new size would overlap with other objects
  return isAreaFree(objects, object.position.x, object.position.y, newWidth, newHeight, objectId);
}

/**
 * Calculate the nearest edge alignment based on pointer position within a cell
 * @param {number} pointerX - Pointer X in grid coordinates (can be fractional)
 * @param {number} pointerY - Pointer Y in grid coordinates (can be fractional)
 * @param {number} gridX - Snapped grid X coordinate
 * @param {number} gridY - Snapped grid Y coordinate
 * @param {number} threshold - Distance threshold for edge detection (0-0.5, default 0.3)
 * @returns {string} Alignment: 'center' | 'north' | 'south' | 'east' | 'west'
 */
function calculateEdgeAlignment(pointerX, pointerY, gridX, gridY, threshold = 0.3) {
  // Calculate position within the cell (0-1 range)
  const offsetX = pointerX - gridX;
  const offsetY = pointerY - gridY;
  
  // Check edges in order of priority
  // Use threshold to determine if we're close enough to an edge
  if (offsetY < threshold) return 'north';
  if (offsetY > (1 - threshold)) return 'south';
  if (offsetX < threshold) return 'west';
  if (offsetX > (1 - threshold)) return 'east';
  
  return 'center';
}

/**
 * Get the position offset for a given alignment
 * @param {string} alignment - Alignment: 'center' | 'north' | 'south' | 'east' | 'west'
 * @returns {Object} { offsetX, offsetY } in grid cell units (-0.5 to 0.5)
 */
function getAlignmentOffset(alignment) {
  switch (alignment) {
    case 'north': return { offsetX: 0, offsetY: -0.5 };
    case 'south': return { offsetX: 0, offsetY: 0.5 };
    case 'east': return { offsetX: 0.5, offsetY: 0 };
    case 'west': return { offsetX: -0.5, offsetY: 0 };
    case 'center':
    default: return { offsetX: 0, offsetY: 0 };
  }
}

// =============================================================================
// UNIFIED PLACEMENT API
// =============================================================================
// These functions provide a consistent interface for object operations
// regardless of map type (grid vs hex). They encapsulate the map-type-specific
// logic and return structured results suitable for TypeScript migration.
// =============================================================================

/**
 * @typedef {'grid' | 'hex'} MapType
 */

/**
 * @typedef {Object} PlacementOptions
 * @property {MapType} mapType - The type of map ('grid' or 'hex')
 * @property {string} [alignment] - Object alignment for grid maps ('center' | 'north' | 'south' | 'east' | 'west')
 */

/**
 * @typedef {Object} PlacementResult
 * @property {Array} objects - The updated objects array
 * @property {boolean} success - Whether the operation succeeded
 * @property {string} [error] - Error message if operation failed
 * @property {Object} [object] - The newly created object (on success)
 */

/**
 * @typedef {Object} RemovalResult
 * @property {Array} objects - The updated objects array
 * @property {boolean} success - Whether any object was removed
 * @property {Object} [removed] - The removed object (if any)
 */

/**
 * Place an object at the specified position.
 * Handles both grid (single object per cell) and hex (up to 4 objects per cell) maps.
 * 
 * @param {Array} objects - Current objects array
 * @param {string} typeId - Object type ID from objectTypes
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {PlacementOptions} options - Placement options including mapType
 * @returns {PlacementResult} Result with updated objects array and status
 * 
 * @example
 * // Grid map placement with edge alignment
 * const result = placeObject(objects, 'chest', 5, 3, { mapType: 'grid', alignment: 'north' });
 * if (result.success) {
 *   setObjects(result.objects);
 * }
 * 
 * @example
 * // Hex map placement (auto slot assignment)
 * const result = placeObject(objects, 'treasure', 2, 4, { mapType: 'hex' });
 * if (!result.success) {
 *   console.log(result.error); // "Cell is full (maximum 4 objects)"
 * }
 */
function placeObject(objects, typeId, x, y, options) {
  const { mapType, alignment = 'center' } = options;
  
  if (mapType === 'hex') {
    // Hex: use multi-object placement with slot assignment
    const result = addObjectToHex(objects, typeId, x, y);
    if (result.success) {
      const newObject = result.objects[result.objects.length - 1];
      return { ...result, object: newObject };
    }
    return result;
  }
  
  // Grid: single object per cell
  const objectType = getObjectType(typeId);
  if (objectType.isUnknown) {
    return { 
      objects, 
      success: false, 
      error: `Unknown object type: ${typeId}` 
    };
  }
  
  const existing = getObjectAtPosition(objects, x, y);
  if (existing) {
    return { 
      objects, 
      success: false, 
      error: `Cell (${x}, ${y}) is occupied` 
    };
  }
  
  const newObject = {
    id: generateObjectId(),
    type: typeId,
    position: { x, y },
    size: { width: 1, height: 1 },
    label: objectType.label,
    linkedNote: null,
    alignment
  };
  
  return { 
    objects: [...objects, newObject], 
    success: true,
    object: newObject
  };
}

/**
 * Remove object(s) at the specified position.
 * - Grid maps: removes all objects at position (typically just one)
 * - Hex maps: removes one object (highest slot), reorganizes remaining slots
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {MapType} mapType - The type of map ('grid' or 'hex')
 * @returns {RemovalResult} Result with updated objects array and status
 * 
 * @example
 * // Hex map: removes one object at a time
 * let result = eraseObjectAt(objects, 2, 4, 'hex');
 * while (result.success) {
 *   objects = result.objects;
 *   result = eraseObjectAt(objects, 2, 4, 'hex');
 * }
 */
function eraseObjectAt(objects, x, y, mapType) {
  if (!objects || !Array.isArray(objects)) {
    return { objects: [], success: false };
  }
  
  // Check if any object exists at position
  const existing = getObjectAtPosition(objects, x, y);
  if (!existing) {
    return { objects, success: false };
  }
  
  if (mapType === 'hex') {
    // Hex: remove one object (highest slot), reorganize remaining
    const newObjects = removeOneObjectFromHex(objects, x, y);
    // Find what was removed by comparing arrays
    const removed = objects.find(o => !newObjects.some(n => n.id === o.id));
    return { 
      objects: newObjects, 
      success: true,
      removed
    };
  }
  
  // Grid: remove all objects at position
  const newObjects = removeObjectAtPosition(objects, x, y);
  return { 
    objects: newObjects, 
    success: true,
    removed: existing
  };
}

/**
 * Check if an object can be placed at the specified position.
 * 
 * @param {Array} objects - Current objects array
 * @param {number} x - Grid/hex x coordinate
 * @param {number} y - Grid/hex y coordinate
 * @param {MapType} mapType - The type of map ('grid' or 'hex')
 * @returns {boolean} True if placement is allowed
 */
function canPlaceObjectAt(objects, x, y, mapType) {
  if (mapType === 'hex') {
    return canAddObjectToCell(objects, x, y);
  }
  // Grid: check if cell is empty
  return getObjectAtPosition(objects, x, y) === null;
}

return { 
  // Core operations
  getObjectType,
  generateObjectId,
  getObjectAtPosition,
  updateObject,
  isAreaFree,
  canResizeObject,
  
  // Grid-specific operations (legacy, prefer unified API)
  addObject,
  removeObject,
  removeObjectAtPosition,
  removeObjectsInRectangle,
  calculateEdgeAlignment,
  getAlignmentOffset,
  
  // Hex-specific operations (internal, prefer unified API)
  addObjectToHex,
  removeObjectFromHex,
  removeOneObjectFromHex,
  
  // Unified API (preferred for new code)
  placeObject,
  eraseObjectAt,
  canPlaceObjectAt
};
```

# colorOperations

```js
// utils/colorOperations.js - Color palette and utilities

const DEFAULT_COLOR = '#c4a57b'; // Tan/brown - the original default

const COLOR_PALETTE = [
  { id: 'default', color: '#c4a57b', label: 'Default (Tan)' },
  { id: 'stone', color: '#808080', label: 'Stone Gray' },
  { id: 'dark-stone', color: '#505050', label: 'Dark Gray' },
  { id: 'water', color: '#4a9eff', label: 'Water Blue' },
  { id: 'forest', color: '#4ade80', label: 'Forest Green' },
  { id: 'danger', color: '#ef4444', label: 'Danger Red' },
  { id: 'sand', color: '#fbbf24', label: 'Sand Yellow' },
  { id: 'magic', color: '#a855f7', label: 'Magic Purple' },
  { id: 'fire', color: '#fb923c', label: 'Fire Orange' },
  { id: 'ice', color: '#14b8a6', label: 'Ice Teal' }
];

/**
 * Get color for a cell (handles backward compatibility)
 * @param {Object} cell - Cell object
 * @returns {string} Hex color
 */
function getCellColor(cell) {
  return cell.color || DEFAULT_COLOR;
}

/**
 * Get color definition by hex value
 * @param {string} colorHex - Hex color value
 * @returns {Object|null} Color definition or null
 */
function getColorByHex(colorHex) {
  return COLOR_PALETTE.find(c => c.color === colorHex) || null;
}

/**
 * Check if color is default
 * @param {string} colorHex - Hex color value
 * @returns {boolean} True if default color
 */
function isDefaultColor(colorHex) {
  return !colorHex || colorHex === DEFAULT_COLOR;
}

return {
  DEFAULT_COLOR,
  COLOR_PALETTE,
  getCellColor,
  getColorByHex,
  isDefaultColor
};
```

# fontOptions

```js
// fontOptions.js - Cross-platform font definitions for text labels

/**
 * Font options with CSS font stacks optimized for cross-platform compatibility
 * Each stack prioritizes system fonts and falls back gracefully
 */
const FONT_OPTIONS = [
    {
        id: 'sans',
        name: 'Sans-Serif',
        css: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    },
    {
        id: 'serif',
        name: 'Serif',
        css: 'Georgia, Cambria, "Times New Roman", Times, serif'
    },
    {
        id: 'mono',
        name: 'Monospace',
        css: '"Courier New", Courier, "Liberation Mono", monospace'
    },
    {
        id: 'script',
        name: 'Script',
        css: '"Brush Script MT", "Bradley Hand", "Segoe Script", "Lucida Handwriting", "Apple Chancery", cursive'
    },
    {
        id: 'cinzel',
        name: 'Cinzel',
        css: '"Cinzel", serif'
    },
    {
        id: 'IM Fell English',
        name: 'IM Fell English',
        css: '"IM Fell English", serif'
    },
    {
        id: 'MedievalSharp',
        name: 'MedievalSharp',
        css: '"MedievalSharp", cursive'
    },
    {
        id: 'Pirata One',
        name: 'Pirata One',
        css: '"Pirata One", cursive'
    },
];

/**
 * Default font settings for new text labels
 */
const DEFAULT_FONT = 'sans';
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_TEXT_COLOR = '#ffffff';

/**
 * Font size constraints
 */
const FONT_SIZE_MIN = 8;
const FONT_SIZE_MAX = 72;
const FONT_SIZE_STEP = 2;

/**
 * Get CSS font family string by font ID
 * @param {string} fontId - Font option ID
 * @returns {string} CSS font-family value
 */
function getFontCss(fontId) {
    const font = FONT_OPTIONS.find(f => f.id === fontId);
    return font ? font.css : FONT_OPTIONS[0].css; // Default to sans-serif
}

/**
 * Get font option by ID
 * @param {string} fontId - Font option ID
 * @returns {Object|null} Font option object or null
 */
function getFontOption(fontId) {
    return FONT_OPTIONS.find(f => f.id === fontId) || FONT_OPTIONS[0];
}

return {
    FONT_OPTIONS,
    DEFAULT_FONT,
    DEFAULT_FONT_SIZE,
    DEFAULT_TEXT_COLOR,
    FONT_SIZE_MIN,
    FONT_SIZE_MAX,
    FONT_SIZE_STEP,
    getFontCss,
    getFontOption
};
```

# BaseGeometry

```js
/**
 * BaseGeometry.js
 * 
 * Abstract base class for geometry implementations (GridGeometry, HexGeometry).
 * Defines the common interface that all geometry classes must implement,
 * and provides shared utility methods.
 * 
 * This class uses JavaScript with TypeScript-style JSDoc annotations to:
 * - Document the expected API contract
 * - Provide IDE autocomplete and type checking
 * - Enable runtime validation of abstract methods
 * - Facilitate future TypeScript migration
 * 
 * COORDINATE SYSTEMS (implemented by subclasses):
 * - Grid coordinates: Integer indices in the geometry's native coordinate system
 *   (gridX, gridY) for GridGeometry, (q, r) for HexGeometry
 * 
 * - World coordinates: Float pixel coordinates in the map's coordinate system
 *   Origin and scale defined by geometry implementation
 * 
 * - Screen coordinates: Pixel coordinates on the canvas
 *   Includes viewport transforms (pan/zoom/rotation)
 * 
 * IMPLEMENTATION GUIDELINES:
 * - Subclasses MUST implement all abstract methods defined below
 * - Subclasses SHOULD provide consistent public APIs for polymorphic usage
 * - Helper methods (e.g., offsetToWorld, getCellCenter) should exist in both
 *   implementations, even if one is a simple passthrough, to enable code
 *   that works with BaseGeometry references without type-checking
 * 
 * @abstract
 */
class BaseGeometry {
  /**
   * @throws {Error} If instantiated directly (must use subclass)
   */
  constructor() {
    if (new.target === BaseGeometry) {
      throw new Error('BaseGeometry is abstract and cannot be instantiated directly');
    }
  }
  
  // ============================================================================
  // CONCRETE METHODS (Shared implementation for all geometry types)
  // ============================================================================
  
  /**
   * Apply iOS-safe stroke style to canvas context
   * 
   * iOS may corrupt stroke-related canvas state during memory pressure events
   * (when app is backgrounded). This helper ensures all stroke properties are
   * explicitly set to valid values before any stroke operations.
   * 
   * Usage pattern:
   * ```javascript
   * this.withStrokeStyle(ctx, { lineColor: '#333', lineWidth: 1 }, () => {
   *   // All stroke operations here
   *   ctx.beginPath();
   *   ctx.moveTo(x1, y1);
   *   ctx.lineTo(x2, y2);
   *   ctx.stroke();
   * });
   * ```
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Object} style - Stroke style options
   * @param {string} style.lineColor - Stroke color (default: '#333333')
   * @param {number} style.lineWidth - Line width (default: 1)
   * @param {Function} callback - Function containing stroke operations
   */
  withStrokeStyle(ctx, style, callback) {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Save context state
    ctx.save();
    
    // Explicitly reset ALL stroke-related properties
    // This protects against iOS state corruption
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 10;
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    
    // Execute stroke operations
    callback();
    
    // Restore context state
    ctx.restore();
  }
  
  /**
   * Convert world coordinates to screen coordinates (for rendering)
   * This is a pure coordinate transform that works identically for all geometry types
   * 
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {number} offsetX - Screen offset X (viewport pan)
   * @param {number} offsetY - Screen offset Y (viewport pan)
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  worldToScreen(worldX, worldY, offsetX, offsetY, zoom) {
    const screenX = offsetX + worldX * zoom;
    const screenY = offsetY + worldY * zoom;
    return { screenX, screenY };
  }

  /**
   * Convert screen coordinates to world coordinates
   * This is the inverse of worldToScreen and works identically for all geometry types
   * Useful for calculating visible bounds and converting pointer events
   * 
   * @param {number} screenX - Screen X coordinate
   * @param {number} screenY - Screen Y coordinate
   * @param {number} zoom - Current zoom level
   * @returns {{worldX: number, worldY: number}} World coordinates
   */
  screenToWorld(screenX, screenY, zoom) {
    return {
      worldX: screenX / zoom,
      worldY: screenY / zoom
    };
  }
  
  // ============================================================================
  // ABSTRACT METHODS (Must be implemented by subclasses)
  // ============================================================================
  
  /**
   * Convert world coordinates to grid coordinates
   * @abstract
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid coordinates (property names may vary by implementation)
   * @throws {Error} If not implemented by subclass
   */
  worldToGrid(worldX, worldY) {
    throw new Error('worldToGrid() must be implemented by subclass');
  }
  
  /**
   * Convert grid coordinates to world coordinates
   * @abstract
   * @param {number} x - Grid X coordinate (gridX for grid, q for hex)
   * @param {number} y - Grid Y coordinate (gridY for grid, r for hex)
   * @returns {{worldX: number, worldY: number}} World coordinates
   * @throws {Error} If not implemented by subclass
   */
  gridToWorld(x, y) {
    throw new Error('gridToWorld() must be implemented by subclass');
  }
  
  /**
   * Convert grid coordinates to screen coordinates
   * @abstract
   * @param {number} x - Grid X coordinate (gridX for grid, q for hex)
   * @param {number} y - Grid Y coordinate (gridY for grid, r for hex)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   * @throws {Error} If not implemented by subclass
   */
  gridToScreen(x, y, offsetX, offsetY, zoom) {
    throw new Error('gridToScreen() must be implemented by subclass');
  }
  
  /**
   * Get the scaled cell/hex size at current zoom level
   * @abstract
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled size in screen pixels
   * @throws {Error} If not implemented by subclass
   */
  getScaledCellSize(zoom) {
    throw new Error('getScaledCellSize() must be implemented by subclass');
  }
  
  /**
   * Create a cell object in the geometry's native format
   * @abstract
   * @param {{gridX: number, gridY: number}|{q: number, r: number}|{x: number, y: number}} coords - Coordinates
   * @param {string} color - Cell color
   * @returns {Object} Cell object in native format
   * @throws {Error} If not implemented by subclass
   */
  createCellObject(coords, color) {
    throw new Error('createCellObject() must be implemented by subclass');
  }
  
  /**
   * Check if a cell matches given coordinates
   * @abstract
   * @param {Object} cell - Cell object to check
   * @param {{gridX: number, gridY: number}|{q: number, r: number}|{x: number, y: number}} coords - Coordinates
   * @returns {boolean} True if cell matches coordinates
   * @throws {Error} If not implemented by subclass
   */
  cellMatchesCoords(cell, coords) {
    throw new Error('cellMatchesCoords() must be implemented by subclass');
  }
  
  /**
   * Get all cells within a rectangular area
   * @abstract
   * @param {number} x1 - First corner X
   * @param {number} y1 - First corner Y
   * @param {number} x2 - Second corner X
   * @param {number} y2 - Second corner Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInRectangle(x1, y1, x2, y2) {
    throw new Error('getCellsInRectangle() must be implemented by subclass');
  }
  
  /**
   * Get all cells within a circular area
   * @abstract
   * @param {number} centerX - Center X coordinate
   * @param {number} centerY - Center Y coordinate
   * @param {number} radius - Radius in cells
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInCircle(centerX, centerY, radius) {
    throw new Error('getCellsInCircle() must be implemented by subclass');
  }
  
  /**
   * Get all cells along a line between two cells
   * @abstract
   * @param {number} x1 - Start X coordinate
   * @param {number} y1 - Start Y coordinate
   * @param {number} x2 - End X coordinate
   * @param {number} y2 - End Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   * @throws {Error} If not implemented by subclass
   */
  getCellsInLine(x1, y1, x2, y2) {
    throw new Error('getCellsInLine() must be implemented by subclass');
  }
  
  /**
   * Calculate distance between two cells
   * @abstract
   * @param {number} x1 - First cell X
   * @param {number} y1 - First cell Y
   * @param {number} x2 - Second cell X
   * @param {number} y2 - Second cell Y
   * @returns {number} Distance in cells
   * @throws {Error} If not implemented by subclass
   */
  getEuclideanDistance(x1, y1, x2, y2) {
    throw new Error('getEuclideanDistance() must be implemented by subclass');
  }
  
  /**
   * Calculate Manhattan distance between two cells
   * @abstract
   * @param {number} x1 - First cell X
   * @param {number} y1 - First cell Y
   * @param {number} x2 - Second cell X
   * @param {number} y2 - Second cell Y
   * @returns {number} Manhattan distance in cells
   * @throws {Error} If not implemented by subclass
   */
  getManhattanDistance(x1, y1, x2, y2) {
    throw new Error('getManhattanDistance() must be implemented by subclass');
  }
  
  /**
   * Calculate "game distance" between two cells with configurable rules
   * For grid: supports different diagonal calculation rules (alternating, equal, euclidean)
   * For hex: returns hex distance (options are ignored - hex has no diagonal ambiguity)
   * @abstract
   * @param {number} x1 - First cell X (gridX or q)
   * @param {number} y1 - First cell Y (gridY or r)
   * @param {number} x2 - Second cell X (gridX or q)
   * @param {number} y2 - Second cell Y (gridY or r)
   * @param {Object} options - Distance calculation options
   * @param {string} options.diagonalRule - For grid: 'alternating' | 'equal' | 'euclidean'
   * @returns {number} Distance in cells
   * @throws {Error} If not implemented by subclass
   */
  getCellDistance(x1, y1, x2, y2, options = {}) {
    throw new Error('getCellDistance() must be implemented by subclass');
  }
  
  /**
   * Get all neighboring cells
   * @abstract
   * @param {number} x - Cell X coordinate
   * @param {number} y - Cell Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   * @throws {Error} If not implemented by subclass
   */
  getNeighbors(x, y) {
    throw new Error('getNeighbors() must be implemented by subclass');
  }
  
  /**
   * Check if coordinates are within bounds
   * @abstract
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if within bounds
   * @throws {Error} If not implemented by subclass
   */
  isWithinBounds(x, y) {
    throw new Error('isWithinBounds() must be implemented by subclass');
  }
  
  /**
   * Clamp coordinates to bounds
   * @abstract
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {{x: number, y: number}} Clamped coordinates (property names may vary)
   * @throws {Error} If not implemented by subclass
   */
  clampToBounds(x, y) {
    throw new Error('clampToBounds() must be implemented by subclass');
  }
  
  /**
   * Draw grid lines on canvas
   * @abstract
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @param {Object} style - Grid style options
   * @throws {Error} If not implemented by subclass
   */
  drawGrid(ctx, offsetX, offsetY, width, height, zoom, style) {
    throw new Error('drawGrid() must be implemented by subclass');
  }
}

return { BaseGeometry };
```

# GridGeometry

```js
/**
 * GridGeometry.js
 * 
 * Handles all grid-specific geometric calculations and rendering.
 * This class abstracts square grid mathematics, coordinate conversions,
 * and basic rendering operations.
 * 
 * Extends BaseGeometry to implement the standard geometry interface
 * for square grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Grid coordinates (gridX, gridY): Integer cell indices
 *   Used internally for all grid math and storage. Origin at (0,0) in top-left.
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates in the map's coordinate system
 *   Used for positioning and measurements. Origin at (0,0) at top-left corner of cell (0,0).
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on the canvas
 *   Used for rendering. Includes viewport transforms (pan/zoom/rotation).
 * 
 * COORDINATE NAMING CONVENTION:
 * - Storage format: Cells stored as {x, y, color} using grid coordinates
 * - API methods: Use (gridX, gridY) as parameter names for clarity
 * - API returns: Collection methods return {x, y} where x=gridX, y=gridY
 * - Objects: Store position as {x, y} using grid coordinates
 * 
 * IMPORTANT: For API consistency with HexGeometry, both classes:
 * - Return {x, y} from collection methods (getCellsInRectangle, etc.)
 * - Store cells/objects with {x, y} coordinate properties
 * - Use their respective coordinate systems internally (grid vs axial)
 * 
 * @extends BaseGeometry
 */

// Import base geometry class
const { BaseGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "BaseGeometry"));

class GridGeometry extends BaseGeometry {
  /**
   * @param {number} cellSize - Base size of each grid cell in pixels (before zoom)
   */
  constructor(cellSize) {
    super(); // Call base class constructor
    this.cellSize = cellSize;
  }
  
  /**
   * Convert world coordinates to grid cell coordinates
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid cell coordinates
   */
  worldToGrid(worldX, worldY) {
    const gridX = Math.floor(worldX / this.cellSize);
    const gridY = Math.floor(worldY / this.cellSize);
    return { gridX, gridY };
  }
  
  /**
   * Convert grid cell coordinates to world coordinates (top-left corner of cell)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates
   */
  gridToWorld(gridX, gridY) {
    const worldX = gridX * this.cellSize;
    const worldY = gridY * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Get the center point of a grid cell in world coordinates
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of cell center
   */
  getCellCenter(gridX, gridY) {
    const worldX = (gridX + 0.5) * this.cellSize;
    const worldY = (gridY + 0.5) * this.cellSize;
    return { worldX, worldY };
  }
  
  /**
   * Convert offset coordinates to world coordinates
   * 
   * GRID-SPECIFIC IMPLEMENTATION (for BaseGeometry API consistency)
   * 
   * For GridGeometry, offset coordinates are identical to grid coordinates
   * (no coordinate system conversion needed). This method exists for API
   * consistency with HexGeometry, enabling polymorphic code that works
   * with both geometry types.
   * 
   * @param {number} col - Column (equivalent to gridX)
   * @param {number} row - Row (equivalent to gridY)
   * @returns {{worldX: number, worldY: number}} World coordinates of cell center
   */
  offsetToWorld(col, row) {
    return this.gridToWorld(col, row);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell (top-left corner)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates
   */
  snapToGrid(worldX, worldY) {
    const { gridX, gridY } = this.worldToGrid(worldX, worldY);
    return this.gridToWorld(gridX, gridY);
  }
  
  /**
   * Snap world coordinates to the nearest grid cell center
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates (cell center)
   */
  snapToCellCenter(worldX, worldY) {
    const { gridX, gridY } = this.worldToGrid(worldX, worldY);
    return this.getCellCenter(gridX, gridY);
  }
  
  /**
   * Calculate visible grid range for a given viewport
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @returns {{startX: number, endX: number, startY: number, endY: number}} Visible grid range
   */
  getVisibleGridRange(offsetX, offsetY, width, height, zoom) {
    const scaledCellSize = this.cellSize * zoom;
    
    const startX = Math.floor(-offsetX / scaledCellSize);
    const endX = Math.ceil((width - offsetX) / scaledCellSize);
    const startY = Math.floor(-offsetY / scaledCellSize);
    const endY = Math.ceil((height - offsetY) / scaledCellSize);
    
    return { startX, endX, startY, endY };
  }
  
  /**
   * Convert grid coordinates to screen coordinates (for rendering)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  gridToScreen(gridX, gridY, offsetX, offsetY, zoom) {
    const scaledCellSize = this.cellSize * zoom;
    const screenX = offsetX + gridX * scaledCellSize;
    const screenY = offsetY + gridY * scaledCellSize;
    return { screenX, screenY };
  }
  
  /**
   * Determine which edge of a cell was clicked based on world coordinates
   * 
   * Used for edge painting - detects if a click was near a cell edge rather
   * than in the cell center. Returns the cell coordinates and which side
   * of that cell the click was near.
   * 
   * @param {number} worldX - World X coordinate (from screenToWorld)
   * @param {number} worldY - World Y coordinate (from screenToWorld)
   * @param {number} threshold - Distance from edge to count as hit (0-0.5, default 0.15)
   *                             Expressed as fraction of cell size
   * @returns {{ x: number, y: number, side: string } | null} 
   *          Edge info with cell coords and side ('top'|'right'|'bottom'|'left'), 
   *          or null if click was in cell center
   */
  screenToEdge(worldX, worldY, threshold = 0.15) {
    // Get the cell coordinates
    const cellX = Math.floor(worldX / this.cellSize);
    const cellY = Math.floor(worldY / this.cellSize);
    
    // Calculate position within the cell (0-1 range)
    const offsetX = (worldX / this.cellSize) - cellX;
    const offsetY = (worldY / this.cellSize) - cellY;
    
    // Check proximity to each edge
    // Priority order: top, bottom, left, right (for corner disambiguation)
    // A click in a corner will prefer vertical edges (top/bottom)
    if (offsetY < threshold) {
      return { x: cellX, y: cellY, side: 'top' };
    }
    if (offsetY > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'bottom' };
    }
    if (offsetX < threshold) {
      return { x: cellX, y: cellY, side: 'left' };
    }
    if (offsetX > 1 - threshold) {
      return { x: cellX, y: cellY, side: 'right' };
    }
    
    // Click was in cell center, not near any edge
    return null;
  }
  
  /**
   * Draw grid lines on the canvas using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state. Fill-based
   * rendering is unaffected by this issue.
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @param {Object} style - Grid style options
   * @param {string} style.lineColor - Grid line color
   * @param {number} style.lineWidth - Grid line width
   */
  drawGrid(ctx, offsetX, offsetY, width, height, zoom, style = {}) {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    const scaledCellSize = this.cellSize * zoom;
    
    // For rotation handling, calculate the visible range then add symmetric padding
    const { startX, endX, startY, endY } = this.getVisibleGridRange(
      offsetX, offsetY, width, height, zoom
    );
    
    // Add extra padding in all directions to handle rotation
    // Use 2x diagonal to ensure full coverage at any rotation angle
    const diagonal = Math.sqrt(width * width + height * height);
    const extraCells = Math.ceil(diagonal / scaledCellSize);
    
    const paddedStartX = startX - extraCells;
    const paddedEndX = endX + extraCells;
    const paddedStartY = startY - extraCells;
    const paddedEndY = endY + extraCells;
    
    // Calculate how far to extend lines beyond the viewport
    const lineExtension = diagonal * 1.5;
    
    // Use fillRect instead of stroke for iOS/CodeMirror compatibility
    // fillRect is immune to strokeStyle state corruption
    ctx.fillStyle = lineColor;
    
    // For centered lines, offset by half the line width
    const halfWidth = lineWidth / 2;
    
    // Draw vertical lines with symmetric padding
    for (let x = paddedStartX; x <= paddedEndX; x++) {
      const screenX = offsetX + x * scaledCellSize;
      // fillRect(x, y, width, height) - vertical line is narrow width, tall height
      ctx.fillRect(
        screenX - halfWidth,
        -lineExtension,
        lineWidth,
        height + lineExtension * 2
      );
    }
    
    // Draw horizontal lines with symmetric padding
    for (let y = paddedStartY; y <= paddedEndY; y++) {
      const screenY = offsetY + y * scaledCellSize;
      // fillRect(x, y, width, height) - horizontal line is wide width, narrow height
      ctx.fillRect(
        -lineExtension,
        screenY - halfWidth,
        width + lineExtension * 2,
        lineWidth
      );
    }
  }


  
  /**
   * Draw a filled cell on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawCell(ctx, gridX, gridY, offsetX, offsetY, zoom, color) {
    const scaledCellSize = this.cellSize * zoom;
    const { screenX, screenY } = this.gridToScreen(gridX, gridY, offsetX, offsetY, zoom);
    
    ctx.fillStyle = color;
    ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
  }
  
  /**
   * Draw multiple cells of the same color (optimized batch rendering)
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {Array<{x: number, y: number}>} cells - Array of cell coordinates
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawCells(ctx, cells, offsetX, offsetY, zoom, color) {
    const scaledCellSize = this.cellSize * zoom;
    ctx.fillStyle = color;
    
    for (const cell of cells) {
      const { screenX, screenY } = this.gridToScreen(cell.x, cell.y, offsetX, offsetY, zoom);
      ctx.fillRect(screenX, screenY, scaledCellSize, scaledCellSize);
    }
  }
  
  /**
   * Get the size of a cell in screen pixels at current zoom
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled cell size
   */
  getScaledCellSize(zoom) {
    return this.cellSize * zoom;
  }
  
  /**
   * Check if coordinates are within bounds
   * GridGeometry is unbounded by default, always returns true
   * Override this if you need bounded grid behavior
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} True (always, grid is unbounded)
   */
  isWithinBounds(gridX, gridY) {
    // GridGeometry is unbounded - always return true
    // If bounds are needed in the future, add a bounds property like HexGeometry
    return true;
  }
  
  /**
   * Clamp coordinates to bounds
   * GridGeometry is unbounded by default, returns input unchanged
   * Override this if you need bounded grid behavior
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {{gridX: number, gridY: number}} Input coordinates unchanged
   */
  clampToBounds(gridX, gridY) {
    // GridGeometry is unbounded - return input unchanged
    return { gridX, gridY };
  }
  
  /**
   * Get all grid cells within a rectangular area
   * @param {number} gridX1 - First corner X
   * @param {number} gridY1 - First corner Y
   * @param {number} gridX2 - Second corner X
   * @param {number} gridY2 - Second corner Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   */
  getCellsInRectangle(gridX1, gridY1, gridX2, gridY2) {
    const minX = Math.min(gridX1, gridX2);
    const maxX = Math.max(gridX1, gridX2);
    const minY = Math.min(gridY1, gridY2);
    const maxY = Math.max(gridY1, gridY2);
    
    const cells = [];
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        cells.push({ x, y });
      }
    }
    
    return cells;
  }
  
  /**
   * Get all grid cells within a circle
   * @param {number} centerGridX - Center X in grid coordinates
   * @param {number} centerGridY - Center Y in grid coordinates
   * @param {number} radiusInCells - Radius in grid cells
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates
   */
  getCellsInCircle(centerGridX, centerGridY, radiusInCells) {
    const cells = [];
    const radiusSquared = radiusInCells * radiusInCells;
    
    // Bounding box for optimization
    const minX = Math.floor(centerGridX - radiusInCells);
    const maxX = Math.ceil(centerGridX + radiusInCells);
    const minY = Math.floor(centerGridY - radiusInCells);
    const maxY = Math.ceil(centerGridY + radiusInCells);
    
    for (let x = minX; x <= maxX; x++) {
      for (let y = minY; y <= maxY; y++) {
        // Check if cell center is within circle
        const dx = x + 0.5 - centerGridX;
        const dy = y + 0.5 - centerGridY;
        const distSquared = dx * dx + dy * dy;
        
        if (distSquared <= radiusSquared) {
          cells.push({ x, y });
        }
      }
    }
    
    return cells;
  }
  
  /**
   * Get grid cells along a line (Bresenham's algorithm)
   * @param {number} gridX1 - Start X
   * @param {number} gridY1 - Start Y
   * @param {number} gridX2 - End X
   * @param {number} gridY2 - End Y
   * @returns {Array<{x: number, y: number}>} Array of cell coordinates along the line
   */
  getCellsInLine(gridX1, gridY1, gridX2, gridY2) {
    const cells = [];
    
    let x = gridX1;
    let y = gridY1;
    
    const dx = Math.abs(gridX2 - gridX1);
    const dy = Math.abs(gridY2 - gridY1);
    const sx = gridX1 < gridX2 ? 1 : -1;
    const sy = gridY1 < gridY2 ? 1 : -1;
    let err = dx - dy;
    
    while (true) {
      cells.push({ x, y });
      
      if (x === gridX2 && y === gridY2) break;
      
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    
    return cells;
  }
  
  /**
   * Calculate distance between two grid cells (Manhattan distance)
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @returns {number} Manhattan distance in cells
   */
  getManhattanDistance(gridX1, gridY1, gridX2, gridY2) {
    return Math.abs(gridX2 - gridX1) + Math.abs(gridY2 - gridY1);
  }
  
  /**
   * Calculate distance between two grid cells (Euclidean distance)
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @returns {number} Euclidean distance in cells
   */
  getEuclideanDistance(gridX1, gridY1, gridX2, gridY2) {
    const dx = gridX2 - gridX1;
    const dy = gridY2 - gridY1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  
  /**
   * Calculate game distance between two grid cells with configurable diagonal rules
   * @param {number} gridX1 - First cell X
   * @param {number} gridY1 - First cell Y
   * @param {number} gridX2 - Second cell X
   * @param {number} gridY2 - Second cell Y
   * @param {Object} options - Distance options
   * @param {string} options.diagonalRule - 'alternating' | 'equal' | 'euclidean'
   * @returns {number} Distance in cells
   */
  getCellDistance(gridX1, gridY1, gridX2, gridY2, options = {}) {
    const { diagonalRule = 'alternating' } = options;
    
    const dx = Math.abs(gridX2 - gridX1);
    const dy = Math.abs(gridY2 - gridY1);
    
    switch (diagonalRule) {
      case 'equal':
        // Chebyshev distance - every step (including diagonal) = 1
        return Math.max(dx, dy);
        
      case 'euclidean':
        // True geometric distance
        return Math.sqrt(dx * dx + dy * dy);
        
      case 'alternating':
      default:
        // D&D 5e / Pathfinder style: 5-10-5-10
        // Each diagonal costs 1.5 on average (first = 1, second = 2, etc.)
        const straights = Math.abs(dx - dy);
        const diagonals = Math.min(dx, dy);
        return straights + diagonals + Math.floor(diagonals / 2);
    }
  }
  
  /**
   * Create a cell object in grid coordinate format
   * Abstraction layer for cell creation - isolates coordinate property naming
   * @param {{gridX: number, gridY: number}} coords - Grid coordinates from worldToGrid()
   * @param {string} color - Cell color
   * @returns {{x: number, y: number, color: string}} Cell object
   */
  createCellObject(coords, color) {
    return { x: coords.gridX, y: coords.gridY, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * Abstraction layer for cell comparison - isolates coordinate property naming
   * @param {{x: number, y: number}} cell - Cell object to check
   * @param {{gridX: number, gridY: number}} coords - Grid coordinates from worldToGrid()
   * @returns {boolean} True if cell matches coordinates
   */
  cellMatchesCoords(cell, coords) {
    return cell.x === coords.gridX && cell.y === coords.gridY;
  }

  /**
   * Get all neighboring cells (4-directional: up, down, left, right)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   */
  getNeighbors(gridX, gridY) {
    // 4-directional neighbors (cardinal directions only)
    return [
      { x: gridX + 1, y: gridY },     // Right
      { x: gridX - 1, y: gridY },     // Left
      { x: gridX, y: gridY + 1 },     // Down
      { x: gridX, y: gridY - 1 }      // Up
    ];
  }

  /**
   * Get all neighboring cells including diagonals (8-directional)
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {Array<{x: number, y: number}>} Array of neighbor coordinates
   */
  getNeighbors8(gridX, gridY) {
    // 8-directional neighbors (including diagonals)
    return [
      { x: gridX + 1, y: gridY },     // Right
      { x: gridX + 1, y: gridY - 1 }, // Top-right
      { x: gridX, y: gridY - 1 },     // Up
      { x: gridX - 1, y: gridY - 1 }, // Top-left
      { x: gridX - 1, y: gridY },     // Left
      { x: gridX - 1, y: gridY + 1 }, // Bottom-left
      { x: gridX, y: gridY + 1 },     // Down
      { x: gridX + 1, y: gridY + 1 }  // Bottom-right
    ];
  }
}

return { GridGeometry };
```

# HexGeometry

```js
/**
 * HexGeometry.js
 * 
 * Handles all hex-specific geometric calculations and rendering.
 * This class abstracts hexagonal grid mathematics, coordinate conversions,
 * and basic rendering operations.
 * 
 * Extends BaseGeometry to implement the standard geometry interface
 * for hexagonal grid-based maps.
 * 
 * COORDINATE SYSTEMS:
 * - Axial coordinates (q, r): Integer hex indices using axial coordinate system
 *   Used internally for hex math and storage. Creates parallelogram when iterated.
 * 
 * - Offset coordinates (col, row): Integer indices in rectangular space
 *   Used for bounds checking and rectangular iteration via offsetCoordinates.js
 *   Makes rectangular grid display possible. Min is always (0,0).
 * 
 * - World coordinates (worldX, worldY): Float pixel coordinates in the map's coordinate system
 *   Used for positioning and measurements. Origin at (0,0) in center of hex (0,0).
 * 
 * - Screen coordinates (screenX, screenY): Pixel coordinates on the canvas
 *   Used for rendering. Includes viewport transforms (pan/zoom/rotation).
 * 
 * COORDINATE NAMING CONVENTION:
 * - Storage format: Cells stored as {q, r, color} using axial coordinates
 * - API methods: Use (q, r) as parameter names for clarity
 * - API returns: Collection methods return {x, y} where x=q, y=r for consistency with GridGeometry
 * - Objects: Store position as {x, y} where x=q, y=r (axial coordinates in hex map context)
 * 
 * Hex Size Definition:
 * - hexSize is the radius from center to vertex
 * - For flat-top: width = 2 * hexSize, height = sqrt(3) * hexSize
 * - For pointy-top: width = sqrt(3) * hexSize, height = 2 * hexSize
 * 
 * @extends BaseGeometry
 */

// Import offset coordinate utilities for rectangular bounds and iteration
const { BaseGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "BaseGeometry"));
const { axialToOffset, offsetToAxial, isWithinOffsetBounds } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "offsetCoordinates"));

class HexGeometry extends BaseGeometry {
  /**
   * @param {number} hexSize - Radius from hex center to vertex in pixels
   * @param {string} orientation - Either 'flat' or 'pointy'
   * @param {Object} bounds - Optional bounds {maxCol, maxRow} in offset coordinates (min is always 0,0)
   */
  constructor(hexSize, orientation = 'flat', bounds = null) {
    super(); // Call base class constructor
    this.hexSize = hexSize;
    this.orientation = orientation;
    this.bounds = bounds; // {maxCol: number, maxRow: number} or null for infinite
    
    // Precalculate commonly used values
    this.sqrt3 = Math.sqrt(3);
    
    // Layout constants depend on orientation
    if (orientation === 'flat') {
      // Flat-top hexagon
      this.width = hexSize * 2;           // Distance between parallel sides
      this.height = hexSize * this.sqrt3; // Point-to-point height
      this.horizSpacing = hexSize * 1.5;  // Horizontal distance between hex centers
      this.vertSpacing = hexSize * this.sqrt3; // Vertical distance between hex centers
    } else {
      // Pointy-top hexagon
      this.width = hexSize * this.sqrt3;
      this.height = hexSize * 2;
      this.horizSpacing = hexSize * this.sqrt3;
      this.vertSpacing = hexSize * 1.5;
    }
  }
  
  /**
   * Convert world (pixel) coordinates to axial hex coordinates
   * Uses the standard axial coordinate system (q, r)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{q: number, r: number}} Axial hex coordinates
   */
  worldToHex(worldX, worldY) {
    if (this.orientation === 'flat') {
      // Flat-top conversion
      const q = (worldX * (2/3)) / this.hexSize;
      const r = ((-worldX / 3) + (this.sqrt3 / 3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    } else {
      // Pointy-top conversion
      const q = ((this.sqrt3 / 3) * worldX - (1/3) * worldY) / this.hexSize;
      const r = ((2/3) * worldY) / this.hexSize;
      return this.roundHex(q, r);
    }
  }
  
  /**
   * Alias for worldToHex - provides consistent API with GridGeometry
   * Returns gridX/gridY property names for consistency with GridGeometry
   * (gridX = q, gridY = r for hex maps)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{gridX: number, gridY: number}} Grid coordinates (q as gridX, r as gridY)
   */
  worldToGrid(worldX, worldY) {
    const { q, r } = this.worldToHex(worldX, worldY);
    // Return with property names matching GridGeometry API
    return { gridX: q, gridY: r };
  }
  
  /**
   * Round fractional hex coordinates to nearest integer hex
   * Uses cube coordinate rounding for accuracy
   * @param {number} q - Fractional q coordinate
   * @param {number} r - Fractional r coordinate
   * @returns {{q: number, r: number}} Rounded axial coordinates
   */
  roundHex(q, r) {
    // Convert axial to cube coordinates
    const x = q;
    const z = r;
    const y = -x - z;
    
    // Round each coordinate
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    
    // Fix rounding errors (cube coords must sum to 0)
    const xDiff = Math.abs(rx - x);
    const yDiff = Math.abs(ry - y);
    const zDiff = Math.abs(rz - z);
    
    if (xDiff > yDiff && xDiff > zDiff) {
      rx = -ry - rz;
    } else if (yDiff > zDiff) {
      ry = -rx - rz;
    } else {
      rz = -rx - ry;
    }
    
    // Convert back to axial
    return { q: rx, r: rz };
  }
  
  /**
   * Convert axial hex coordinates to world (pixel) coordinates
   * Returns the center point of the hex
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  hexToWorld(q, r) {
    if (this.orientation === 'flat') {
      // Flat-top conversion
      const worldX = this.hexSize * (3/2) * q;
      const worldY = this.hexSize * (this.sqrt3 / 2 * q + this.sqrt3 * r);
      return { worldX, worldY };
    } else {
      // Pointy-top conversion
      const worldX = this.hexSize * (this.sqrt3 * q + this.sqrt3 / 2 * r);
      const worldY = this.hexSize * (3/2) * r;
      return { worldX, worldY };
    }
  }
  
  /**
   * Alias for hexToWorld - provides consistent API with GridGeometry
   * GridGeometry uses gridToWorld(), HexGeometry uses this alias
   * @param {number} q - Axial q coordinate (or x for API consistency)
   * @param {number} r - Axial r coordinate (or y for API consistency)
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  gridToWorld(q, r) {
    return this.hexToWorld(q, r);
  }
  
  /**
   * Get the center point of a hex in world coordinates
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  getHexCenter(q, r) {
    return this.hexToWorld(q, r);
  }
  
  /**
   * Convert offset coordinates to world coordinates
   * 
   * HEX-SPECIFIC IMPLEMENTATION (for BaseGeometry API consistency)
   * 
   * Offset coordinates (col, row) are used for rectangular bounds in hex maps.
   * This method combines offsetToAxial + hexToWorld. GridGeometry implements
   * the same method as a passthrough to gridToWorld() for polymorphic usage.
   * 
   * Primarily used for calculating grid center when positioning background images.
   * 
   * @param {number} col - Column in offset coordinates (0 to maxCol-1)
   * @param {number} row - Row in offset coordinates (0 to maxRow-1)
   * @returns {{worldX: number, worldY: number}} World coordinates of hex center
   */
  offsetToWorld(col, row) {
    const { q, r } = offsetToAxial(col, row, this.orientation);
    return this.hexToWorld(q, r);
  }
  
  /**
   * Get the six vertices of a hex in world coordinates
   * Vertices are returned in clockwise order starting from the rightmost point (flat-top)
   * or top point (pointy-top)
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {Array<{worldX: number, worldY: number}>} Array of 6 vertex positions
   */
  getHexVertices(q, r) {
    const center = this.hexToWorld(q, r);
    const vertices = [];
    
    // Angle offset depends on orientation
    const angleOffset = this.orientation === 'flat' ? 0 : 30;
    
    for (let i = 0; i < 6; i++) {
      const angleDeg = 60 * i + angleOffset;
      const angleRad = (Math.PI / 180) * angleDeg;
      vertices.push({
        worldX: center.worldX + this.hexSize * Math.cos(angleRad),
        worldY: center.worldY + this.hexSize * Math.sin(angleRad)
      });
    }
    
    return vertices;
  }
  
  /**
   * Snap world coordinates to the nearest hex center
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @returns {{worldX: number, worldY: number}} Snapped world coordinates (hex center)
   */
  snapToHexCenter(worldX, worldY) {
    const { q, r } = this.worldToHex(worldX, worldY);
    return this.getHexCenter(q, r);
  }
  
  /**
   * Calculate visible hex range for a given viewport
   * Returns a bounding box in hex coordinates (may include negative values)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @returns {{minQ: number, maxQ: number, minR: number, maxR: number}} Visible hex range
   */
  getVisibleHexRange(offsetX, offsetY, width, height, zoom) {
    // Convert viewport corners to world coordinates
    const topLeft = this.screenToWorld(-offsetX, -offsetY, zoom);
    const topRight = this.screenToWorld(width - offsetX, -offsetY, zoom);
    const bottomLeft = this.screenToWorld(-offsetX, height - offsetY, zoom);
    const bottomRight = this.screenToWorld(width - offsetX, height - offsetY, zoom);
    
    // Convert corners to hex coordinates
    const corners = [
      this.worldToHex(topLeft.worldX, topLeft.worldY),
      this.worldToHex(topRight.worldX, topRight.worldY),
      this.worldToHex(bottomLeft.worldX, bottomLeft.worldY),
      this.worldToHex(bottomRight.worldX, bottomRight.worldY)
    ];
    
    // Find bounding box with some padding
    const padding = 2;
    const minQ = Math.min(...corners.map(c => c.q)) - padding;
    const maxQ = Math.max(...corners.map(c => c.q)) + padding;
    const minR = Math.min(...corners.map(c => c.r)) - padding;
    const maxR = Math.max(...corners.map(c => c.r)) + padding;
    
    // Don't clamp here - return full visible range
    // Bounds enforcement happens at the rendering level
    return { minQ, maxQ, minR, maxR };
  }
  

  /**
   * Convert hex coordinates to screen coordinates (for rendering)
   * Provides API consistency with GridGeometry.gridToScreen()
   * Returns position offset such that adding objectSize/2 centers the object in the hex
   * @param {number} q - Hex q coordinate (or x for API consistency)
   * @param {number} r - Hex r coordinate (or y for API consistency)
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @returns {{screenX: number, screenY: number}} Screen coordinates
   */
  gridToScreen(q, r, offsetX, offsetY, zoom) {
    // Get hex center in world coordinates
    const { worldX, worldY } = this.hexToWorld(q, r);
    
    // Object rendering adds objectWidth/2 and objectHeight/2 to center the object
    // where objectWidth = hexSize * zoom
    // So we need to return: hexCenter - (hexSize/2, hexSize/2)
    // This way: returned_position + hexSize/2 = hexCenter
    const topLeftWorldX = worldX - (this.hexSize / 2);
    const topLeftWorldY = worldY - (this.hexSize / 2);
    
    // Convert to screen coordinates
    return this.worldToScreen(topLeftWorldX, topLeftWorldY, offsetX, offsetY, zoom);
  }
  
  /**
   * Draw hex grid on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} width - Canvas width
   * @param {number} height - Canvas height
   * @param {number} zoom - Current zoom level
   * @param {Object} style - Grid style options
   * @param {string} style.lineColor - Grid line color
   * @param {number} style.lineWidth - Grid line width
   */
  drawGrid(ctx, offsetX, offsetY, width, height, zoom, style = {}) {
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Safety check: validate inputs to prevent runaway iteration
    if (!isFinite(width) || !isFinite(height) || !isFinite(zoom) || 
        !isFinite(offsetX) || !isFinite(offsetY) || zoom <= 0) {
      console.warn('[HexGeometry.drawGrid] Invalid input values, skipping render');
      return;
    }
    
    let minCol, maxCol, minRow, maxRow;
    
    // For BOUNDED hex maps, use the bounds directly
    // This is much more efficient and prevents runaway iteration
    if (this.bounds) {
      minCol = 0;
      maxCol = this.bounds.maxCol - 1;
      minRow = 0;
      maxRow = this.bounds.maxRow - 1;
    } else {
      // For rotation handling, we need to calculate the visible range based on 
      // an expanded viewport that covers the entire rotated canvas area
      // Use 2x the diagonal to ensure we cover all rotations
      const diagonal = Math.sqrt(width * width + height * height) * 2;
      const expandedWidth = diagonal;
      const expandedHeight = diagonal;
      
      const { minQ, maxQ, minR, maxR } = this.getVisibleHexRange(
        offsetX, offsetY, expandedWidth, expandedHeight, zoom
      );
      
      // Safety limit: prevent iteration over more than 10000 hexes in unbounded mode
      const maxHexCount = 10000;
      const axialRange = (maxQ - minQ + 1) * (maxR - minR + 1);
      if (axialRange > maxHexCount) {
        console.warn(`[HexGeometry.drawGrid] Visible range too large (${axialRange} hexes), limiting`);
        // Fall back to a reasonable default visible area
        const halfRange = Math.floor(Math.sqrt(maxHexCount) / 2);
        const centerQ = Math.floor((minQ + maxQ) / 2);
        const centerR = Math.floor((minR + maxR) / 2);
        
        // Convert limited axial range to offset
        const corners = [
          axialToOffset(centerQ - halfRange, centerR - halfRange, this.orientation),
          axialToOffset(centerQ + halfRange, centerR + halfRange, this.orientation)
        ];
        minCol = Math.min(corners[0].col, corners[1].col);
        maxCol = Math.max(corners[0].col, corners[1].col);
        minRow = Math.min(corners[0].row, corners[1].row);
        maxRow = Math.max(corners[0].row, corners[1].row);
      } else {
        // Convert axial visible range to offset coordinates
        // Build bounding box without creating intermediate array (optimization)
        minCol = Infinity;
        maxCol = -Infinity;
        minRow = Infinity;
        maxRow = -Infinity;
        
        for (let q = minQ; q <= maxQ; q++) {
          for (let r = minR; r <= maxR; r++) {
            const { col, row } = axialToOffset(q, r, this.orientation);
            if (col < minCol) minCol = col;
            if (col > maxCol) maxCol = col;
            if (row < minRow) minRow = row;
            if (row > maxRow) maxRow = row;
          }
        }
      }
    }
    
    // Final safety check on iteration count
    const totalHexes = (maxCol - minCol + 1) * (maxRow - minRow + 1);
    if (totalHexes > 50000 || !isFinite(totalHexes)) {
      console.warn(`[HexGeometry.drawGrid] Too many hexes to draw (${totalHexes}), aborting`);
      return;
    }
    
    // Use fillStyle instead of strokeStyle for fill-based hex outline rendering
    // This works around strokeStyle state corruption in Obsidian's Live Preview mode
    ctx.fillStyle = lineColor;
    
    // CRITICAL: Iterate in OFFSET space (rectangular)
    // This creates a rectangular grid instead of a parallelogram
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        // Convert offset coords to axial for drawing
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only draw if within bounds (or no bounds set for infinite maps)
        if (!this.bounds || this.isWithinBounds(q, r)) {
          this.drawHexOutline(ctx, q, r, offsetX, offsetY, zoom, lineWidth);
        }
      }
    }
  }

  
  /**
   * Draw a line segment as a filled rectangle
   * 
   * Used to work around strokeStyle state corruption in Obsidian's Live Preview mode.
   * Converts a line segment into a thin rectangle oriented along the line.
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} x1 - Start X (screen coordinates)
   * @param {number} y1 - Start Y (screen coordinates)
   * @param {number} x2 - End X (screen coordinates)
   * @param {number} y2 - End Y (screen coordinates)
   * @param {number} lineWidth - Width of the line
   */
  drawLineAsFill(ctx, x1, y1, x2, y2, lineWidth) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return;
    
    // Calculate perpendicular offset for line thickness
    const nx = -dy / length * (lineWidth / 2);
    const ny = dx / length * (lineWidth / 2);
    
    // Draw as a quadrilateral (4-point polygon)
    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.lineTo(x2 - nx, y2 - ny);
    ctx.lineTo(x1 - nx, y1 - ny);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Draw a single hex outline using fill-based rendering
   * 
   * NOTE: This uses ctx.fill() with polygon shapes instead of ctx.stroke() to 
   * work around a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   * 
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {number} lineWidth - Line width (optional, defaults to context lineWidth or 1)
   */
  drawHexOutline(ctx, q, r, offsetX, offsetY, zoom, lineWidth = null) {
    const vertices = this.getHexVertices(q, r);
    const width = lineWidth !== null ? lineWidth : (ctx.lineWidth || 1);
    
    // Convert all vertices to screen coordinates
    const screenVertices = vertices.map(v => 
      this.worldToScreen(v.worldX, v.worldY, offsetX, offsetY, zoom)
    );
    
    // Draw each edge as a filled polygon
    for (let i = 0; i < 6; i++) {
      const v1 = screenVertices[i];
      const v2 = screenVertices[(i + 1) % 6];
      this.drawLineAsFill(ctx, v1.screenX, v1.screenY, v2.screenX, v2.screenY, width);
    }
  }
  
  /**
   * Draw a filled hex on the canvas
   * @param {CanvasRenderingContext2D} ctx - Canvas context
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @param {number} offsetX - Screen offset X
   * @param {number} offsetY - Screen offset Y
   * @param {number} zoom - Current zoom level
   * @param {string} color - Fill color
   */
  drawHex(ctx, q, r, offsetX, offsetY, zoom, color) {
    const vertices = this.getHexVertices(q, r);
    
    ctx.fillStyle = color;
    ctx.beginPath();
    
    // Convert first vertex to screen coordinates and move to it
    const first = this.worldToScreen(vertices[0].worldX, vertices[0].worldY, offsetX, offsetY, zoom);
    ctx.moveTo(first.screenX, first.screenY);
    
    // Draw lines to remaining vertices
    for (let i = 1; i < vertices.length; i++) {
      const vertex = this.worldToScreen(vertices[i].worldX, vertices[i].worldY, offsetX, offsetY, zoom);
      ctx.lineTo(vertex.screenX, vertex.screenY);
    }
    
    // Close the path and fill
    ctx.closePath();
    ctx.fill();
  }
  
  /**
   * Get the size of a hex in screen pixels at current zoom
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled hex size
   */
  getScaledHexSize(zoom) {
    return this.hexSize * zoom;
  }
  
  /**
   * Alias for getScaledHexSize - provides consistent API with GridGeometry
   * GridGeometry calls this "CellSize" while HexGeometry calls it "HexSize"
   * @param {number} zoom - Current zoom level
   * @returns {number} Scaled hex size
   */
  getScaledCellSize(zoom) {
    return this.getScaledHexSize(zoom);
  }

  /**
   * Calculate distance between two hexes (in hex units)
   * Uses cube coordinate system for accurate hex distance
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getHexDistance(q1, r1, q2, r2) {
    // Convert to cube coordinates
    const x1 = q1;
    const z1 = r1;
    const y1 = -x1 - z1;
    
    const x2 = q2;
    const z2 = r2;
    const y2 = -x2 - z2;
    
    // Cube distance formula
    return (Math.abs(x1 - x2) + Math.abs(y1 - y2) + Math.abs(z1 - z2)) / 2;
  }
  
  /**
   * Get all neighboring hexes
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {Array<{q: number, r: number}>} Array of neighbor coordinates
   */
  getNeighbors(q, r) {
    // Axial direction vectors (same for both orientations)
    const directions = [
      { q: 1, r: 0 },   // East
      { q: 1, r: -1 },  // Northeast
      { q: 0, r: -1 },  // Northwest
      { q: -1, r: 0 },  // West
      { q: -1, r: 1 },  // Southwest
      { q: 0, r: 1 }    // Southeast
    ];
    
    return directions.map(dir => ({
      q: q + dir.q,
      r: r + dir.r
    }));
  }
  
  /**
   * Check if hex coordinates are within bounds
   * Converts axial coords to offset and checks rectangular bounds
   * If no bounds are set, always returns true
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {boolean} True if coordinates are within bounds
   */
  isWithinBounds(q, r) {
    if (!this.bounds) return true; // No bounds = infinite map
    
    // Convert axial to offset coordinates
    const { col, row } = axialToOffset(q, r, this.orientation);
    
    // Check rectangular bounds (exclusive: maxCol=26 means 26 columns, indices 0-25)
    return col >= 0 && col < this.bounds.maxCol && 
           row >= 0 && row < this.bounds.maxRow;
  }
  
  /**
   * Clamp hex coordinates to bounds
   * Converts to offset, clamps, then converts back to axial
   * If no bounds are set, returns coordinates unchanged
   * @param {number} q - Axial q coordinate
   * @param {number} r - Axial r coordinate
   * @returns {{q: number, r: number}} Clamped coordinates in axial
   */
  clampToBounds(q, r) {
    if (!this.bounds) return { q, r }; // No bounds = infinite map
    
    // Convert to offset
    const { col, row } = axialToOffset(q, r, this.orientation);
    
    // Clamp in offset space (max valid index is maxCol-1 since bounds are exclusive)
    const clampedCol = Math.max(0, Math.min(this.bounds.maxCol - 1, col));
    const clampedRow = Math.max(0, Math.min(this.bounds.maxRow - 1, row));
    
    // Convert back to axial
    return offsetToAxial(clampedCol, clampedRow, this.orientation);
  }
  
  /**
   * Create a cell object in hex coordinate format
   * Abstraction layer for cell creation - isolates coordinate property naming
   * @param {{q: number, r: number}} coords - Hex coordinates from worldToGrid()
   * @param {string} color - Cell color
   * @returns {{q: number, r: number, color: string}} Cell object
   */
  createCellObject(coords, color) {
    // Handle both {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    return { q, r, color };
  }
  
  /**
   * Check if a cell matches given coordinates
   * Abstraction layer for cell comparison - isolates coordinate property naming
   * @param {{q: number, r: number}} cell - Cell object to check
   * @param {{q: number, r: number}} coords - Hex coordinates from worldToGrid()
   * @returns {boolean} True if cell matches coordinates
   */
  cellMatchesCoords(cell, coords) {
    // Handle both {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    return cell.q === q && cell.r === r;
  }

  /**
   * Get all hexes within a rectangular area (defined by two corner hexes)
   * Uses offset coordinates to iterate a rectangular bounds, then converts back to axial
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} q1 - First corner q coordinate
   * @param {number} r1 - First corner r coordinate
   * @param {number} q2 - Second corner q coordinate
   * @param {number} r2 - Second corner r coordinate
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates in rectangle
   */
  getCellsInRectangle(q1, r1, q2, r2) {
    // Convert both corners to offset coordinates
    const offset1 = axialToOffset(q1, r1, this.orientation);
    const offset2 = axialToOffset(q2, r2, this.orientation);
    
    // Find rectangular bounds in offset space
    const minCol = Math.min(offset1.col, offset2.col);
    const maxCol = Math.max(offset1.col, offset2.col);
    const minRow = Math.min(offset1.row, offset2.row);
    const maxRow = Math.max(offset1.row, offset2.row);
    
    // Iterate rectangle in offset space and convert back to axial
    const cells = [];
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only include if within bounds (if bounds are set)
        if (this.isWithinBounds(q, r)) {
          // Return as {x, y} for API consistency with GridGeometry
          cells.push({ x: q, y: r });
        }
      }
    }
    
    return cells;
  }

  /**
   * Get all hexes within a circular area (defined by center and radius in hex units)
   * Uses hex distance calculation for accurate circular selection
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} centerQ - Center hex q coordinate
   * @param {number} centerR - Center hex r coordinate
   * @param {number} radiusInHexes - Radius in hex units
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates in circle
   */
  getCellsInCircle(centerQ, centerR, radiusInHexes) {
    const cells = [];
    
    // Convert center to offset to establish rectangular search bounds
    const centerOffset = axialToOffset(centerQ, centerR, this.orientation);
    const minCol = Math.floor(centerOffset.col - radiusInHexes);
    const maxCol = Math.ceil(centerOffset.col + radiusInHexes);
    const minRow = Math.floor(centerOffset.row - radiusInHexes);
    const maxRow = Math.ceil(centerOffset.row + radiusInHexes);
    
    // Iterate rectangular bounds and filter by hex distance
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, this.orientation);
        
        // Only include if within bounds and within circular radius
        if (this.isWithinBounds(q, r)) {
          const distance = this.getHexDistance(centerQ, centerR, q, r);
          if (distance <= radiusInHexes) {
            // Return as {x, y} for API consistency with GridGeometry
            cells.push({ x: q, y: r });
          }
        }
      }
    }
    
    return cells;
  }

  /**
   * Calculate distance between two hexes
   * Alias for getHexDistance() - provides API consistency with GridGeometry
   * GridGeometry uses getEuclideanDistance(), hex maps use hex distance which is more natural
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getEuclideanDistance(q1, r1, q2, r2) {
    // For hexes, use hex distance (which is more natural than Euclidean)
    return this.getHexDistance(q1, r1, q2, r2);
  }

  /**
   * Calculate Manhattan distance between two hexes
   * For hexes, this is the same as hex distance
   * Provided for API consistency with GridGeometry
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @returns {number} Distance in hexes
   */
  getManhattanDistance(q1, r1, q2, r2) {
    // For hexes, Manhattan distance is the same as hex distance
    return this.getHexDistance(q1, r1, q2, r2);
  }

  /**
   * Calculate game distance between two hexes
   * For hexes, this is simply the hex distance - no diagonal rules apply
   * The options parameter is included for API consistency with GridGeometry
   * @param {number} q1 - First hex q coordinate
   * @param {number} r1 - First hex r coordinate
   * @param {number} q2 - Second hex q coordinate
   * @param {number} r2 - Second hex r coordinate
   * @param {Object} options - Ignored for hex (included for API consistency)
   * @returns {number} Distance in hexes
   */
  getCellDistance(q1, r1, q2, r2, options = {}) {
    // Hex grids have no diagonal ambiguity - all neighbors are equidistant
    return this.getHexDistance(q1, r1, q2, r2);
  }

  /**
   * Get hexes along a line between two hexes
   * Uses hex line traversal algorithm (linear interpolation in cube coordinates)
   * Returns cells in format {x, y} for API consistency with GridGeometry
   * @param {number} q1 - Start hex q coordinate
   * @param {number} r1 - Start hex r coordinate
   * @param {number} q2 - End hex q coordinate
   * @param {number} r2 - End hex r coordinate
   * @returns {Array<{x: number, y: number}>} Array of hex coordinates along the line
   */
  getCellsInLine(q1, r1, q2, r2) {
    const distance = this.getHexDistance(q1, r1, q2, r2);
    const cells = [];
    
    // If distance is 0, return just the start hex
    if (distance === 0) {
      return [{ x: q1, y: r1 }];
    }
    
    // Use linear interpolation in cube coordinates
    for (let i = 0; i <= distance; i++) {
      const t = i / distance;
      
      // Interpolate in cube coordinates
      const x1 = q1;
      const z1 = r1;
      const y1 = -x1 - z1;
      
      const x2 = q2;
      const z2 = r2;
      const y2 = -x2 - z2;
      
      // Linear interpolation
      const x = x1 + (x2 - x1) * t;
      const y = y1 + (y2 - y1) * t;
      const z = z1 + (z2 - z1) * t;
      
      // Round to nearest hex
      const rounded = this.roundHex(x, z);
      
      // Only include if within bounds
      if (this.isWithinBounds(rounded.q, rounded.r)) {
        // Return as {x, y} for API consistency with GridGeometry
        cells.push({ x: rounded.q, y: rounded.r });
      }
    }
    
    return cells;
  }
}

return { HexGeometry };
```

# gridRenderer

```js
/**
 * gridRenderer.js
 * Pure functions for rendering grid-based maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with GridGeometry instances
 */

const gridRenderer = {
  /**
   * Render grid overlay lines
   * @param {CanvasRenderingContext2D} ctx
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} canvasDimensions - {width, height}
   * @param {boolean} showGrid
   * @param {Object} style - Grid style options
   */
  renderGrid(ctx, geometry, viewState, canvasDimensions, showGrid, style = {}) {
    if (!showGrid) return;
    
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Use geometry's built-in drawGrid method which handles rotation
    geometry.drawGrid(
      ctx,
      viewState.x,
      viewState.y,
      canvasDimensions.width,
      canvasDimensions.height,
      viewState.zoom,
      { lineColor, lineWidth }
    );
  },

  /**
   * Render painted cells
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color, opacity?}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   */
  renderPaintedCells(ctx, cells, geometry, viewState) {
    if (!cells || cells.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    // Separate cells by whether they have custom opacity
    const fullOpacityCells = [];
    const customOpacityCells = [];
    
    for (const cell of cells) {
      const opacity = cell.opacity ?? 1;
      if (opacity === 1) {
        fullOpacityCells.push(cell);
      } else {
        customOpacityCells.push(cell);
      }
    }
    
    // Draw full opacity cells grouped by color (efficient batch rendering)
    if (fullOpacityCells.length > 0) {
      const cellsByColor = {};
      for (const cell of fullOpacityCells) {
        const color = cell.color;
        if (!cellsByColor[color]) {
          cellsByColor[color] = [];
        }
        cellsByColor[color].push(cell);
      }
      
      for (const [color, cellGroup] of Object.entries(cellsByColor)) {
        geometry.drawCells(ctx, cellGroup, viewState.x, viewState.y, viewState.zoom, color);
      }
    }
    
    // Draw cells with custom opacity individually
    if (customOpacityCells.length > 0) {
      for (const cell of customOpacityCells) {
        const opacity = cell.opacity ?? 1;
        ctx.globalAlpha = opacity;
        ctx.fillStyle = cell.color;
        const { screenX, screenY } = geometry.gridToScreen(cell.x, cell.y, viewState.x, viewState.y, viewState.zoom);
        ctx.fillRect(screenX, screenY, scaledSize, scaledSize);
      }
      ctx.globalAlpha = 1; // Reset
    }
  },

  /**
   * Render interior grid lines between adjacent painted cells
   * These are drawn on top of painted cells to restore grid visibility
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} style - Grid style options
   * @param {string} style.lineColor - Grid line color
   * @param {number} style.lineWidth - Base grid line width
   * @param {number} style.interiorRatio - Ratio for interior lines (default 0.5)
   */
  renderInteriorGridLines(ctx, cells, geometry, viewState, style = {}) {
    if (!cells || cells.length === 0) return;
    
    const { lineColor = '#666666', lineWidth = 1, interiorRatio = 0.5 } = style;
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    // Build lookup set for O(1) cell existence checks
    const cellSet = new Set(cells.map(c => `${c.x},${c.y}`));
    
    // Track which interior lines we've already drawn to avoid duplicates
    const drawnLines = new Set();
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = Math.max(1, lineWidth * interiorRatio);
    ctx.beginPath();
    
    for (const cell of cells) {
      const { screenX, screenY } = geometry.gridToScreen(
        cell.x,
        cell.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Check right neighbor - draw vertical line between them
      const rightKey = `${cell.x + 1},${cell.y}`;
      if (cellSet.has(rightKey)) {
        const lineKey = `v:${cell.x + 1},${cell.y}`;
        if (!drawnLines.has(lineKey)) {
          ctx.moveTo(screenX + scaledSize, screenY);
          ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
          drawnLines.add(lineKey);
        }
      }
      
      // Check bottom neighbor - draw horizontal line between them
      const bottomKey = `${cell.x},${cell.y + 1}`;
      if (cellSet.has(bottomKey)) {
        const lineKey = `h:${cell.x},${cell.y + 1}`;
        if (!drawnLines.has(lineKey)) {
          ctx.moveTo(screenX, screenY + scaledSize);
          ctx.lineTo(screenX + scaledSize, screenY + scaledSize);
          drawnLines.add(lineKey);
        }
      }
    }
    
    ctx.stroke();
  },

  /**
   * Render painted edges (custom colored grid lines)
   * 
   * Edges are rendered after cells and before cell borders, appearing
   * as colored overlays on specific grid lines.
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} edges - Array of {x, y, side, color, opacity?} where side is 'right' or 'bottom'
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} style - Edge style options
   * @param {number} style.lineWidth - Base line width (will be scaled for visibility)
   */
  renderEdges(ctx, edges, geometry, viewState, style = {}) {
    if (!edges || edges.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    // Edge thickness: slightly thicker than grid lines for visibility
    // Use 2.5x grid line width, clamped between 2 and borderWidth
    const baseWidth = style.lineWidth || 1;
    const edgeWidth = Math.min(Math.max(2, baseWidth * 2.5), style.borderWidth || 4);
    const halfWidth = edgeWidth / 2;
    
    for (const edge of edges) {
      // Skip malformed edges
      if (!edge || typeof edge.x !== 'number' || typeof edge.y !== 'number' || !edge.side || !edge.color) {
        continue;
      }
      
      const { screenX, screenY } = geometry.gridToScreen(
        edge.x,
        edge.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Apply opacity if specified
      const opacity = edge.opacity ?? 1;
      if (opacity < 1) {
        ctx.globalAlpha = opacity;
      }
      
      ctx.fillStyle = edge.color;
      
      // Edges are stored normalized as 'right' or 'bottom' only
      if (edge.side === 'right') {
        // Right edge of cell (x,y) - vertical line at x+1 boundary
        ctx.fillRect(
          screenX + scaledSize - halfWidth,
          screenY - halfWidth,
          edgeWidth,
          scaledSize + edgeWidth
        );
      } else if (edge.side === 'bottom') {
        // Bottom edge of cell (x,y) - horizontal line at y+1 boundary
        ctx.fillRect(
          screenX - halfWidth,
          screenY + scaledSize - halfWidth,
          scaledSize + edgeWidth,
          edgeWidth
        );
      }
      
      // Reset opacity
      if (opacity < 1) {
        ctx.globalAlpha = 1;
      }
    }
  },

  /**
   * Render smart borders for painted cells using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.stroke() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {x, y, color}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Function} buildCellLookup - Function to build cell lookup map
   * @param {Function} calculateBorders - Function to calculate borders for a cell
   * @param {Object} theme - Border styling from theme
   */
  renderCellBorders(ctx, cells, geometry, viewState, buildCellLookup, calculateBorders, theme) {
    if (!cells || cells.length === 0) return;
    
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    const cellLookup = buildCellLookup(cells);
    const borderWidth = theme.borderWidth;
    const halfWidth = borderWidth / 2;
    
    // Use fillStyle instead of strokeStyle for fill-based rendering
    ctx.fillStyle = theme.border;
    
    for (const cell of cells) {
      const { screenX, screenY } = geometry.gridToScreen(
        cell.x,
        cell.y,
        viewState.x,
        viewState.y,
        viewState.zoom
      );
      
      // Calculate which borders this cell needs
      const borders = calculateBorders(cellLookup, cell.x, cell.y);
      
      // Draw each border as a filled rectangle
      for (const side of borders) {
        switch (side) {
          case 'top':
            ctx.fillRect(
              screenX - halfWidth,
              screenY - halfWidth,
              scaledSize + borderWidth,
              borderWidth
            );
            break;
          case 'right':
            ctx.fillRect(
              screenX + scaledSize - halfWidth,
              screenY - halfWidth,
              borderWidth,
              scaledSize + borderWidth
            );
            break;
          case 'bottom':
            ctx.fillRect(
              screenX - halfWidth,
              screenY + scaledSize - halfWidth,
              scaledSize + borderWidth,
              borderWidth
            );
            break;
          case 'left':
            ctx.fillRect(
              screenX - halfWidth,
              screenY - halfWidth,
              borderWidth,
              scaledSize + borderWidth
            );
            break;
        }
      }
    }
  },

  /**
   * Render selection highlight for a cell using fill-based rendering
   * 
   * NOTE: This uses ctx.fillRect() instead of ctx.strokeRect() to work around
   * a rendering bug in Obsidian's Live Preview mode where CodeMirror's
   * canvas operations can corrupt the strokeStyle state.
   * 
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} cell - {x, y}
   * @param {GridGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {boolean} isResizeMode
   */
  renderCellHighlight(ctx, cell, geometry, viewState, isResizeMode) {
    const scaledSize = geometry.getScaledCellSize(viewState.zoom);
    
    const { screenX, screenY } = geometry.gridToScreen(
      cell.x,
      cell.y,
      viewState.x,
      viewState.y,
      viewState.zoom
    );
    
    // Selection border - draw as 4 filled rectangles instead of strokeRect
    const color = isResizeMode ? '#ff6b6b' : '#4dabf7';
    const lineWidth = 2;
    const halfWidth = lineWidth / 2;
    
    ctx.fillStyle = color;
    
    // Top border
    ctx.fillRect(
      screenX - halfWidth,
      screenY - halfWidth,
      scaledSize + lineWidth,
      lineWidth
    );
    // Bottom border
    ctx.fillRect(
      screenX - halfWidth,
      screenY + scaledSize - halfWidth,
      scaledSize + lineWidth,
      lineWidth
    );
    // Left border
    ctx.fillRect(
      screenX - halfWidth,
      screenY - halfWidth,
      lineWidth,
      scaledSize + lineWidth
    );
    // Right border
    ctx.fillRect(
      screenX + scaledSize - halfWidth,
      screenY - halfWidth,
      lineWidth,
      scaledSize + lineWidth
    );
    
    // Corner handles for resize mode (grid cells don't resize, but kept for API consistency)
    if (isResizeMode) {
      const handleSize = 8;
      ctx.fillStyle = '#ff6b6b';
      
      // Top-left
      ctx.fillRect(screenX - handleSize/2, screenY - handleSize/2, handleSize, handleSize);
      // Top-right
      ctx.fillRect(screenX + scaledSize - handleSize/2, screenY - handleSize/2, handleSize, handleSize);
      // Bottom-left
      ctx.fillRect(screenX - handleSize/2, screenY + scaledSize - handleSize/2, handleSize, handleSize);
      // Bottom-right
      ctx.fillRect(screenX + scaledSize - handleSize/2, screenY + scaledSize - handleSize/2, handleSize, handleSize);
    }
  }
};

return { gridRenderer };
```

# hexRenderer

```js
/**
 * hexRenderer.js
 * Pure functions for rendering hexagonal maps
 * 
 * All functions are stateless and side-effect free (except canvas drawing)
 * Designed to work with HexGeometry instances
 */

const hexRenderer = {
  /**
   * Render hex grid overlay
   * @param {CanvasRenderingContext2D} ctx
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {Object} canvasDimensions - {width, height}
   * @param {boolean} showGrid
   * @param {Object} style - Grid style options
   */
  renderGrid(ctx, geometry, viewState, canvasDimensions, showGrid, style = {}) {
    if (!showGrid) return;
    
    const { lineColor = '#333333', lineWidth = 1 } = style;
    
    // Use geometry's built-in drawGrid method which handles rotation
    geometry.drawGrid(
      ctx,
      viewState.x,
      viewState.y,
      canvasDimensions.width,
      canvasDimensions.height,
      viewState.zoom,
      { lineColor, lineWidth }
    );
  },

  /**
   * Render painted hexes
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells - Array of {q, r, color, opacity?}
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   */
  renderPaintedCells(ctx, cells, geometry, viewState) {
    if (!cells || cells.length === 0) return;
    
    cells.forEach(cell => {
      // Apply opacity if specified
      const opacity = cell.opacity ?? 1;
      if (opacity < 1) {
        ctx.globalAlpha = opacity;
      }
      
      geometry.drawHex(
        ctx,
        cell.q,
        cell.r,
        viewState.x,
        viewState.y,
        viewState.zoom,
        cell.color
      );
      
      // Reset opacity
      if (opacity < 1) {
        ctx.globalAlpha = 1;
      }
    });
  },

  /**
   * Render smart borders for painted hexes
   * NOTE: Hex maps don't use smart borders like grid maps
   * This is a no-op for API consistency with gridRenderer
   * @param {CanvasRenderingContext2D} ctx
   * @param {Array} cells
   * @param {HexGeometry} geometry
   * @param {Object} viewState
   * @param {Function} buildCellLookup
   * @param {Function} calculateBorders
   * @param {Object} theme
   */
  renderCellBorders(ctx, cells, geometry, viewState, buildCellLookup, calculateBorders, theme) {
    // Hex rendering already draws complete hex shapes, no separate borders needed
    // This method exists for API consistency with gridRenderer
  },

  /**
   * Render selection highlight for a hex
   * @param {CanvasRenderingContext2D} ctx
   * @param {Object} cell - {q, r}
   * @param {HexGeometry} geometry
   * @param {Object} viewState - {x, y, zoom}
   * @param {boolean} isResizeMode
   */
  renderCellHighlight(ctx, cell, geometry, viewState, isResizeMode) {
    // Selection border (thicker for hex to be visible)
    // Use fillStyle since drawHexOutline now uses fill-based rendering
    ctx.fillStyle = isResizeMode ? '#ff6b6b' : '#4dabf7';
    const lineWidth = 3;
    
    geometry.drawHexOutline(
      ctx,
      cell.q,
      cell.r,
      viewState.x,
      viewState.y,
      viewState.zoom,
      lineWidth
    );
    
    // Note: Resize mode doesn't apply to individual hexes (no corner handles)
  }
};

return { hexRenderer };
```

# useCanvasRenderer

```js
const { getTheme } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));
const { buildCellLookup, calculateBordersOptimized } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "borderCalculator"));
const { getObjectType } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectOperations"));
const { getRenderChar } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypeResolver"));
const { getCellColor } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "colorOperations"));
const { getFontCss } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "fontOptions"));
const { GridGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "GridGeometry"));
const { HexGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "HexGeometry"));
const { gridRenderer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "gridRenderer"));
const { hexRenderer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "hexRenderer"));
const { getCachedImage } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "imageOperations"));
const { getSlotOffset, getMultiObjectScale, getObjectsInCell } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "hexSlotPositioner"));

/**
 * Get appropriate renderer for geometry type
 * @param {GridGeometry|HexGeometry} geometry
 * @returns {Object} Renderer object with render methods
 */
function getRenderer(geometry) {
  return geometry instanceof HexGeometry ? hexRenderer : gridRenderer;
}

function renderCanvas(canvas, mapData, geometry, selectedItem = null, isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  if (!canvas) return;
  
  // Default layer visibility
  const visibility = layerVisibility || { objects: true, textLabels: true, hexCoordinates: true };
  
  // Get theme with current settings (use provided theme or fetch global)
  const THEME = theme || getTheme();
  
  const ctx = canvas.getContext('2d');
  const { width, height } = canvas;
  const { viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  
  // Clear canvas
  ctx.fillStyle = THEME.grid.background;
  ctx.fillRect(0, 0, width, height);
  
  // Save context and apply rotation
  ctx.save();
  
  // Translate to center, rotate, translate back
  ctx.translate(width / 2, height / 2);
  ctx.rotate((northDirection * Math.PI) / 180);
  ctx.translate(-width / 2, -height / 2);
  
  // Get appropriate renderer for this geometry
  const renderer = getRenderer(geometry);
  
  // Calculate viewport based on geometry type
  let scaledSize, offsetX, offsetY;
  
  if (geometry instanceof GridGeometry) {
    scaledSize = geometry.getScaledCellSize(zoom);
    // Grid: center is in grid cell coordinates, multiply by cell size
    offsetX = width / 2 - center.x * scaledSize;
    offsetY = height / 2 - center.y * scaledSize;
  } else {
    // HexGeometry: center is in world pixel coordinates, multiply by zoom only
    scaledSize = geometry.getScaledHexSize(zoom); // Get scaled hex size for object rendering
    offsetX = width / 2 - center.x * zoom;
    offsetY = height / 2 - center.y * zoom;
  }
  
  // Draw background image for hex maps (if available)
  // Must happen after offsetX/offsetY calculation but before grid rendering
  if (geometry instanceof HexGeometry && mapData.backgroundImage?.path) {
    const bgImage = getCachedImage(mapData.backgroundImage.path);
    if (bgImage && bgImage.complete && mapData.hexBounds) {
      // Get orientation from mapData (default to 'flat' for backward compatibility)
      const orientation = mapData.orientation || 'flat';
      
      // Calculate the center of the hex grid in WORLD coordinates
      // The spacing formulas differ based on orientation
      let gridCenterX, gridCenterY;
      
      if (orientation === 'pointy') {
        // For pointy-top hexes:
        // - Horizontal spacing: hexSize * sqrt(3)
        // - Vertical spacing: hexSize * 1.5
        gridCenterX = ((mapData.hexBounds.maxCol - 1) / 2) * (geometry.hexSize * geometry.sqrt3);
        gridCenterY = ((mapData.hexBounds.maxRow - 1) / 2) * (geometry.hexSize * 1.5);
      } else {
        // For flat-top hexes:
        // - Horizontal spacing: hexSize * 1.5
        // - Vertical spacing: hexSize * sqrt(3)
        gridCenterX = ((mapData.hexBounds.maxCol - 1) / 2) * (geometry.hexSize * 1.5);
        gridCenterY = ((mapData.hexBounds.maxRow - 1) / 2) * (geometry.hexSize * geometry.sqrt3);
      }
      
      // Calculate image dimensions
      const imgWidth = bgImage.naturalWidth;
      const imgHeight = bgImage.naturalHeight;
      
      // Get offset values (default to 0 for backward compatibility)
      const imgOffsetX = mapData.backgroundImage.offsetX ?? 0;
      const imgOffsetY = mapData.backgroundImage.offsetY ?? 0;
      
      // Position image centered at grid center in screen coordinates
      // Apply user offset (scaled by zoom to maintain position at different zoom levels)
      const screenCenterX = offsetX + gridCenterX * zoom;
      const screenCenterY = offsetY + gridCenterY * zoom;
      const screenX = screenCenterX - (imgWidth * zoom) / 2 + (imgOffsetX * zoom);
      const screenY = screenCenterY - (imgHeight * zoom) / 2 + (imgOffsetY * zoom);
      
      // Apply opacity if specified (default to 1 for backward compatibility)
      const opacity = mapData.backgroundImage.opacity ?? 1;
      if (opacity < 1) {
        ctx.save();
        ctx.globalAlpha = opacity;
      }
      
      // Draw image with current zoom level
      ctx.drawImage(
        bgImage,
        screenX,
        screenY,
        imgWidth * zoom,
        imgHeight * zoom
      );
      
      // Restore opacity
      if (opacity < 1) {
        ctx.restore();
      }
    }
  }
  
  // Create renderer viewState object (transformed for screen coordinates)
  const rendererViewState = {
    x: offsetX,
    y: offsetY,
    zoom: zoom
  };
  
  // Draw grid lines using renderer
  renderer.renderGrid(ctx, geometry, rendererViewState, { width, height }, true, {
    lineColor: THEME.grid.lines,
    lineWidth: THEME.grid.lineWidth || 1
  });
  
  // Draw filled cells using renderer
  if (mapData.cells && mapData.cells.length > 0) {
    // Add color to cells that don't have it (for backward compatibility)
    const cellsWithColor = mapData.cells.map(cell => ({
      ...cell,
      color: getCellColor(cell)
    }));
    
    // Render painted cells using renderer
    renderer.renderPaintedCells(ctx, cellsWithColor, geometry, rendererViewState);
    
    // Render interior grid lines on top of painted cells (grid only)
    // These are slightly thinner than exterior lines for visual distinction
    if (renderer.renderInteriorGridLines) {
      renderer.renderInteriorGridLines(ctx, cellsWithColor, geometry, rendererViewState, {
        lineColor: THEME.grid.lines,
        lineWidth: THEME.grid.lineWidth || 1,
        interiorRatio: 0.5
      });
    }
    
    // Render smart borders using renderer (grid only - hex renderer no-ops this)
    renderer.renderCellBorders(
      ctx,
      cellsWithColor,
      geometry,
      rendererViewState,
      buildCellLookup,
      calculateBordersOptimized,
      {
        border: THEME.cells.border,
        borderWidth: THEME.cells.borderWidth
      }
    );
  }
  
  // Draw painted edges (grid maps only, after cells/borders)
  // Edges are custom-colored grid lines that overlay the base grid
  if (mapData.edges && mapData.edges.length > 0 && geometry instanceof GridGeometry) {
    renderer.renderEdges(ctx, mapData.edges, geometry, rendererViewState, {
      lineWidth: 1,
      borderWidth: THEME.cells.borderWidth
    });
  }
  
  // Draw objects (after cells and borders, so they appear on top)
  // Skip when coordinate overlay is visible or objects layer is hidden
  if (mapData.objects && mapData.objects.length > 0 && !showCoordinates && visibility.objects) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    for (const obj of mapData.objects) {
      const objType = getObjectType(obj.type);
      if (!objType) continue;
      
      // Ensure size exists (backward compatibility)
      const size = obj.size || { width: 1, height: 1 };
      
      let { screenX, screenY } = geometry.gridToScreen(obj.position.x, obj.position.y, offsetX, offsetY, zoom);
      
      // Calculate base dimensions
      let objectWidth = size.width * scaledSize;
      let objectHeight = size.height * scaledSize;
      
      // For hex maps with multi-object support
      if (geometry instanceof HexGeometry) {
        // Count objects in same cell
        const cellObjects = getObjectsInCell(mapData.objects, obj.position.x, obj.position.y);
        const objectCount = cellObjects.length;
        
        if (objectCount > 1) {
          // Apply multi-object scaling
          const multiScale = getMultiObjectScale(objectCount);
          objectWidth *= multiScale;
          objectHeight *= multiScale;
          
          // Get this object's slot (default to index in cell if no slot assigned)
          let effectiveSlot = obj.slot;
          if (effectiveSlot === undefined || effectiveSlot === null) {
            // Legacy object without slot - assign based on position in cell objects array
            effectiveSlot = cellObjects.findIndex(o => o.id === obj.id);
          }
          
          // Get slot offset
          const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
            effectiveSlot,
            objectCount,
            mapData.orientation || 'flat'
          );
          
          // Calculate hex center from the top-left position
          // gridToScreen returns top-left such that topLeft + scaledSize/2 = hexCenter
          const hexCenterX = screenX + scaledSize / 2;
          const hexCenterY = screenY + scaledSize / 2;
          
          // Apply slot offset to get object center
          // scaledSize = hexSize (radius), but hex width = 2 * hexSize
          // So we multiply by 2 * scaledSize to get offsets relative to hex width
          const hexWidth = scaledSize * 2;
          const objectCenterX = hexCenterX + slotOffsetX * hexWidth;
          const objectCenterY = hexCenterY + slotOffsetY * hexWidth;
          
          // Convert back to top-left for rendering
          screenX = objectCenterX - objectWidth / 2;
          screenY = objectCenterY - objectHeight / 2;
        }
        // Single object in hex: no changes needed, renders centered as before
      }
      
      // Apply alignment offset (edge snapping)
      const alignment = obj.alignment || 'center';
      if (alignment !== 'center') {
        const halfCell = scaledSize / 2;
        switch (alignment) {
          case 'north': screenY -= halfCell; break;
          case 'south': screenY += halfCell; break;
          case 'east': screenX += halfCell; break;
          case 'west': screenX -= halfCell; break;
        }
      }
      
      // Object center for rotation
      const centerX = screenX + objectWidth / 2;
      const centerY = screenY + objectHeight / 2;
      
      // Apply user-defined object scale (0.25 to 1.0, default 1.0)
      const objectScale = obj.scale ?? 1.0;
      
      // Object symbol sized to fit within the multi-cell bounds, with user scale applied
      const fontSize = Math.min(objectWidth, objectHeight) * 0.8 * objectScale;
      
      // Apply rotation if object has rotation property
      const rotation = obj.rotation || 0;
      if (rotation !== 0) {
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate((rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      
      // Get the character to render (handles both icons and symbols with fallback)
      const { char: renderChar, isIcon } = getRenderChar(objType);
      
      // Use RPGAwesome font for icons, Noto for symbols
      if (isIcon) {
        ctx.font = `${fontSize}px rpgawesome`;
      } else {
        ctx.font = `${fontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
      }
      
      // Draw shadow/stroke for visibility
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = Math.max(2, fontSize * 0.08);
      ctx.strokeText(renderChar, centerX, centerY);
      
      // Draw the object symbol with object's color (defaults to white for backward compatibility)
      ctx.fillStyle = obj.color || '#ffffff';
      ctx.fillText(renderChar, centerX, centerY);
      
      // Restore context if we applied rotation
      if (rotation !== 0) {
        ctx.restore();
      }
      
      // Draw note badge if object has linkedNote (top-right corner)
      // Skip for note_pin objects as it's redundant
      if (obj.linkedNote && obj.type !== 'note_pin') {
        // Scale badge proportionally to object size, with reasonable limits
        // Cap at 30% of smallest object dimension to prevent overwhelming the object
        const maxBadgeSize = Math.min(objectWidth, objectHeight) * 0.3;
        const badgeSize = Math.min(maxBadgeSize, Math.max(8, scaledSize * 0.25));
        const badgeX = screenX + objectWidth - badgeSize - 3;  // Added 3px gap
        const badgeY = screenY + 3;  // Added 3px gap from top
        
        // Draw badge background circle
        ctx.fillStyle = 'rgba(74, 158, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(
          badgeX + badgeSize / 2,
          badgeY + badgeSize / 2,
          badgeSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Draw scroll-text icon
        const badgeFontSize = badgeSize * 0.7;
        ctx.font = `${badgeFontSize}px 'Noto Emoji', 'Noto Sans Symbols 2', monospace`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          '\u{1F4DC}',
          badgeX + badgeSize / 2,
          badgeY + badgeSize / 2
        );
      }
      
      // Draw note indicator if object has a custom tooltip (bottom-right corner)
      if (obj.customTooltip) {
        const indicatorSize = Math.max(4, scaledSize * 0.12);
        const indicatorX = screenX + objectWidth - indicatorSize - 2;
        const indicatorY = screenY + objectHeight - indicatorSize - 2;
        
        // Draw small circular indicator in bottom-right corner
        ctx.fillStyle = '#4a9eff';
        ctx.beginPath();
        ctx.arc(
          indicatorX + indicatorSize / 2,
          indicatorY + indicatorSize / 2,
          indicatorSize / 2,
          0,
          Math.PI * 2
        );
        ctx.fill();
        
        // Add white border to indicator for visibility
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
  
  // Draw text labels (after objects, before selection indicators)
  // Text labels use world pixel coordinates, not grid coordinates
  // Skip when coordinate overlay is visible or text layer is hidden
  if (mapData.textLabels && mapData.textLabels.length > 0 && !showCoordinates && visibility.textLabels) {
    for (const label of mapData.textLabels) {
      ctx.save();
      
      // Convert world coordinates to screen coordinates
      // Text labels store position in world pixels (independent of grid)
      const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);
      
      // Translate to label position
      ctx.translate(screenX, screenY);
      
      // Apply label rotation (independent of map rotation)
      ctx.rotate((label.rotation * Math.PI) / 180);
      
      // Set font and alignment
      const fontSize = label.fontSize * zoom;
      const fontFamily = getFontCss(label.fontFace || 'sans');
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      // Draw black outline (stroke) for visibility on any background
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.strokeText(label.content, 0, 0);
      
      // Draw fill with label's color (defaults to white)
      ctx.fillStyle = label.color || '#ffffff';
      ctx.fillText(label.content, 0, 0);
      
      ctx.restore();
    }
  }
  
  // Draw selection indicator for text labels
  // Skip when coordinate overlay is visible or text layer is hidden
  if (selectedItem && selectedItem.type === 'text' && mapData.textLabels && !showCoordinates && visibility.textLabels) {
    const label = mapData.textLabels.find(l => l.id === selectedItem.id);
    if (label) {
      ctx.save();
      
      const { screenX, screenY } = geometry.worldToScreen(label.position.x, label.position.y, offsetX, offsetY, zoom);
      
      ctx.translate(screenX, screenY);
      ctx.rotate((label.rotation * Math.PI) / 180);
      
      // Measure text to get bounding box
      const fontSize = label.fontSize * zoom;
      const fontFamily = getFontCss(label.fontFace || 'sans');
      ctx.font = `${fontSize}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const metrics = ctx.measureText(label.content);
      const width = metrics.width;
      const height = fontSize * 1.2;
      
      // Draw selection rectangle with dashed border
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(
        -width/2 - 4, 
        -height/2 - 2, 
        width + 8, 
        height + 4
      );
      
      // Draw corner handles
      ctx.setLineDash([]);
      ctx.fillStyle = '#4a9eff';
      const handleSize = 6;
      
      // Top-left
      ctx.fillRect(-width/2 - 4 - handleSize/2, -height/2 - 2 - handleSize/2, handleSize, handleSize);
      // Top-right
      ctx.fillRect(width/2 + 4 - handleSize/2, -height/2 - 2 - handleSize/2, handleSize, handleSize);
      // Bottom-left
      ctx.fillRect(-width/2 - 4 - handleSize/2, height/2 + 2 - handleSize/2, handleSize, handleSize);
      // Bottom-right
      ctx.fillRect(width/2 + 4 - handleSize/2, height/2 + 2 - handleSize/2, handleSize, handleSize);
      
      ctx.restore();
    }
  }
  
  // Draw selection indicator for objects
  // Skip when coordinate overlay is visible or objects layer is hidden
  if (selectedItem && selectedItem.type === 'object' && mapData.objects && !showCoordinates && visibility.objects) {
    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (object) {
      const size = object.size || { width: 1, height: 1 };
      const alignment = object.alignment || 'center';
      
      // Calculate position and dimensions based on geometry type
      let screenX, screenY, objectWidth, objectHeight, cellWidth, cellHeight;
      
      if (geometry instanceof HexGeometry) {
        // For hex: calculate position accounting for multi-object slots
        const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
        
        // Count objects in same cell for multi-object support
        const cellObjects = getObjectsInCell(mapData.objects, object.position.x, object.position.y);
        const objectCount = cellObjects.length;
        
        // Base object dimensions
        objectWidth = size.width * scaledSize;
        objectHeight = size.height * scaledSize;
        cellWidth = scaledSize;
        cellHeight = scaledSize;
        
        // Apply multi-object scaling if needed
        if (objectCount > 1) {
          const multiScale = getMultiObjectScale(objectCount);
          objectWidth *= multiScale;
          objectHeight *= multiScale;
        }
        
        // Calculate center in screen space
        let centerScreenX = offsetX + worldX * zoom;
        let centerScreenY = offsetY + worldY * zoom;
        
        // Apply slot offset for multi-object cells
        if (objectCount > 1) {
          const effectiveSlot = object.slot ?? cellObjects.findIndex(o => o.id === object.id);
          const { offsetX: slotOffsetX, offsetY: slotOffsetY } = getSlotOffset(
            effectiveSlot,
            objectCount,
            mapData.orientation || 'flat'
          );
          // Offset is in hex-width units (2 * scaledSize)
          const hexWidth = scaledSize * 2;
          centerScreenX += slotOffsetX * hexWidth;
          centerScreenY += slotOffsetY * hexWidth;
        }
        
        // Apply alignment offset
        if (alignment !== 'center') {
          const halfCell = scaledSize / 2;
          switch (alignment) {
            case 'north': centerScreenY -= halfCell; break;
            case 'south': centerScreenY += halfCell; break;
            case 'east': centerScreenX += halfCell; break;
            case 'west': centerScreenX -= halfCell; break;
          }
        }
        
        // Get top-left from center for rendering
        screenX = centerScreenX - objectWidth / 2;
        screenY = centerScreenY - objectHeight / 2;
      } else {
        // For grid: gridToScreen returns top-left directly
        const gridPos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
        screenX = gridPos.screenX;
        screenY = gridPos.screenY;
        
        // Apply alignment offset
        if (alignment !== 'center') {
          const halfCell = scaledSize / 2;
          switch (alignment) {
            case 'north': screenY -= halfCell; break;
            case 'south': screenY += halfCell; break;
            case 'east': screenX += halfCell; break;
            case 'west': screenX -= halfCell; break;
          }
        }
        
        objectWidth = size.width * scaledSize;
        objectHeight = size.height * scaledSize;
        cellWidth = scaledSize;
        cellHeight = scaledSize;
      }
      
      // Draw occupied cells overlay when in resize mode
      if (isResizeMode) {
        ctx.fillStyle = 'rgba(74, 158, 255, 0.15)';
        for (let dx = 0; dx < size.width; dx++) {
          for (let dy = 0; dy < size.height; dy++) {
            const cellScreenX = screenX + dx * cellWidth;
            const cellScreenY = screenY + dy * cellHeight;
            ctx.fillRect(cellScreenX + 2, cellScreenY + 2, cellWidth - 4, cellHeight - 4);
          }
        }
      }
      
      // Draw selection rectangle with dashed border
      ctx.strokeStyle = '#4a9eff';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(
        screenX + 2,
        screenY + 2,
        objectWidth - 4,
        objectHeight - 4
      );
      
      // Draw corner handles (larger in resize mode for better touch targets)
      ctx.setLineDash([]);
      ctx.fillStyle = '#4a9eff';
      const handleSize = isResizeMode ? 14 : 8;
      
      // Top-left
      ctx.fillRect(screenX + 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
      // Top-right
      ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + 2 - handleSize/2, handleSize, handleSize);
      // Bottom-left
      ctx.fillRect(screenX + 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
      // Bottom-right
      ctx.fillRect(screenX + objectWidth - 2 - handleSize/2, screenY + objectHeight - 2 - handleSize/2, handleSize, handleSize);
    }
  }
  
  // Restore context (undo rotation)
  ctx.restore();
}

function useCanvasRenderer(canvasRef, mapData, geometry, selectedItem = null, isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null) {
  dc.useEffect(() => {
    if (mapData && geometry && canvasRef.current) {
      renderCanvas(canvasRef.current, mapData, geometry, selectedItem, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [mapData, geometry, selectedItem, isResizeMode, theme, canvasRef, showCoordinates, layerVisibility]);
}

return { useCanvasRenderer, renderCanvas };
```

# useCanvasInteraction

```js
/**
 * useCanvasInteraction.js
 * 
 * Custom hook that handles all canvas interaction state and logic including:
 * - Pan state (mouse pan, touch pan, space key pan)
 * - Zoom state (wheel zoom, pinch zoom)
 * - Coordinate transformation helpers
 * - Touch event helpers
 * 
 * This hook manages the viewport state (zoom, center) and provides
 * helper functions for coordinate conversions that depend on viewport.
 */

const { DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));
const { GridGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "GridGeometry"));


function useCanvasInteraction(canvasRef, mapData, geometry, onViewStateChange, focused) {
  // Pan state
  const [isPanning, setIsPanning] = dc.useState(false);
  const [isTouchPanning, setIsTouchPanning] = dc.useState(false);
  const [panStart, setPanStart] = dc.useState(null);
  const [touchPanStart, setTouchPanStart] = dc.useState(null);
  
  // Zoom state
  const [initialPinchDistance, setInitialPinchDistance] = dc.useState(null);
  
  // Space key panning state
  const [spaceKeyPressed, setSpaceKeyPressed] = dc.useState(false);
  
  // Track recent touch to ignore synthetic mouse events
  const lastTouchTimeRef = dc.useRef(0);
  
  // Get client coordinates from mouse or touch event
  const getClientCoords = (e) => {
    if (e.touches && e.touches.length > 0) {
      return {
        clientX: e.touches[0].clientX,
        clientY: e.touches[0].clientY
      };
    } else if (e.changedTouches && e.changedTouches.length > 0) {
      return {
        clientX: e.changedTouches[0].clientX,
        clientY: e.changedTouches[0].clientY
      };
    } else {
      return {
        clientX: e.clientX,
        clientY: e.clientY
      };
    }
  };
  
  // Get center point of two touches for two-finger pan
  const getTouchCenter = (touches) => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };
  
  // Calculate distance between two touches for pinch-to-zoom
  const getTouchDistance = (touches) => {
    if (touches.length < 2) return null;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };
  
  // Convert screen coordinates to grid coordinates
  const screenToGrid = (clientX, clientY) => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      x -= centerX;
      y -= centerY;
      
      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
      
      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }
    
    // Calculate offset based on geometry type
    let offsetX, offsetY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cell coordinates
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }
    
    // Convert canvas coordinates to world coordinates
    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;
    
    // Convert world coordinates to grid coordinates
    return geometry.worldToGrid(worldX, worldY);
  };
  
  // Convert screen coordinates to world coordinates (for text labels)
  const screenToWorld = (clientX, clientY) => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    let x = clientX - rect.left;
    let y = clientY - rect.top;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    // Calculate offset based on geometry type
    let offsetX, offsetY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cell coordinates
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }
    
    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      x -= centerX;
      y -= centerY;
      
      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);
      
      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }
    
    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;
    
    return { worldX, worldY };
  };
  
  // Handle wheel zoom
  const handleWheel = (e) => {
    e.preventDefault();
    
    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, mapData.viewState.zoom + delta));
    
    const { gridSize, viewState } = mapData;
    const { zoom: oldZoom, center: oldCenter } = viewState;
    

    const scaledGridSize = geometry.getScaledCellSize(oldZoom);
    const offsetX = canvas.width / 2 - oldCenter.x * scaledGridSize;
    const offsetY = canvas.height / 2 - oldCenter.y * scaledGridSize;
    
    const worldX = (mouseX - offsetX) / scaledGridSize;
    const worldY = (mouseY - offsetY) / scaledGridSize;
    
    const newScaledGridSize = geometry.getScaledCellSize(newZoom);
    const newOffsetX = mouseX - worldX * newScaledGridSize;
    const newOffsetY = mouseY - worldY * newScaledGridSize;
    
    const newCenterX = (canvas.width / 2 - newOffsetX) / newScaledGridSize;
    const newCenterY = (canvas.height / 2 - newOffsetY) / newScaledGridSize;
    
    onViewStateChange({
      zoom: newZoom,
      center: { x: newCenterX, y: newCenterY }
    });
  };
  
  // Start panning
  const startPan = (clientX, clientY) => {
    if (!mapData) return;
    setIsPanning(true);
    setPanStart({ 
      x: clientX, 
      y: clientY, 
      centerX: mapData.viewState.center.x, 
      centerY: mapData.viewState.center.y 
    });
  };
  
  // Update pan (mouse/space key pan)
  const updatePan = (clientX, clientY) => {
    if (!isPanning || !panStart || !mapData) return;
    if (!geometry) return;
    
    const deltaX = clientX - panStart.x;
    const deltaY = clientY - panStart.y;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    
    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);
    
    // Calculate delta based on geometry type
    let gridDeltaX, gridDeltaY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cells, divide by scaledGridSize
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      // Hex: center is in world pixels, divide by zoom only
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    
    onViewStateChange({
      zoom: viewState.zoom,
      center: {
        x: center.x + gridDeltaX,
        y: center.y + gridDeltaY
      }
    });
    
    setPanStart({ x: clientX, y: clientY, centerX: center.x + gridDeltaX, centerY: center.y + gridDeltaY });
  };
  
  // Stop panning
  const stopPan = () => {
    setIsPanning(false);
    setPanStart(null);
  };
  
  // Start touch pan
  const startTouchPan = (center) => {
    setIsTouchPanning(true);
    setTouchPanStart(center);
  };
  
  // Update touch pan with pinch zoom
  const updateTouchPan = (touches) => {
    if (!isTouchPanning || !touchPanStart || !mapData) return;
    if (!geometry) return;
    
    const center = getTouchCenter(touches);
    const distance = getTouchDistance(touches);
    if (!center || !distance) return;
    
    const deltaX = center.x - touchPanStart.x;
    const deltaY = center.y - touchPanStart.y;
    
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center: viewCenter } = viewState;
    

    
    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);
    
    // Calculate delta based on geometry type
    let gridDeltaX, gridDeltaY;
    if (geometry instanceof GridGeometry) {
      // Grid: center is in grid cells, divide by scaledGridSize
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      // Hex: center is in world pixels, divide by zoom only
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    let newZoom = zoom;
    if (initialPinchDistance) {
      const scale = distance / initialPinchDistance;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, zoom * scale));
    }
    
    onViewStateChange({
      zoom: newZoom,
      center: {
        x: viewCenter.x + gridDeltaX,
        y: viewCenter.y + gridDeltaY
      }
    });
    
    setTouchPanStart(center);
    setInitialPinchDistance(distance);
  };
  
  // Stop touch pan
  const stopTouchPan = () => {
    setIsTouchPanning(false);
    setTouchPanStart(null);
    setInitialPinchDistance(null);
  };
  
  // Space key handlers
  dc.useEffect(() => {
    // Don't attach listeners if not focused
    if (!focused) {
      // Clear space key state when losing focus
      if (spaceKeyPressed) {
        setSpaceKeyPressed(false);
        if (isPanning) {
          stopPan();
        }
      }
      return;
    }
    
    const handleSpaceDown = (e) => {
      // Only track space key when focused, and only if not typing in an input
      if (e.key === ' ' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpaceKeyPressed(true);
      }
    };
    
    const handleSpaceUp = (e) => {
      if (e.key === ' ') {
        setSpaceKeyPressed(false);
        // If we were panning with space, stop panning
        if (isPanning) {
          stopPan();
        }
      }
    };
    
    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
  }, [focused, isPanning, spaceKeyPressed]);
  
  return {
    // State
    isPanning,
    isTouchPanning,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,
    
    // Coordinate helpers
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,
    
    // Zoom handlers
    handleWheel,
    
    // Pan handlers
    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,
    
    // Setters (for external control)
    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance,
    setSpaceKeyPressed
  };
}

return { useCanvasInteraction };
```

# textLabelOperations

```js
/**
 * Generate a unique ID for a text label
 * @returns {string} UUID string
 */
function generateTextLabelId() {
  return 'text-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Add a new text label
 * @param {Array} labels - Current labels array
 * @param {string} content - Label text
 * @param {number} x - Pixel X coordinate (world space)
 * @param {number} y - Pixel Y coordinate (world space)
 * @param {Object} options - Optional styling options (fontSize, fontFace, color)
 * @returns {Array} New labels array with added label
 */
function addTextLabel(labels, content, x, y, options = {}) {
  // Validate content
  const trimmed = content.trim();
  if (!trimmed || trimmed.length === 0) {
    console.warn('Cannot add empty text label');
    return labels;
  }
  
  if (trimmed.length > 200) {
    console.warn('Text label content exceeds 200 character limit');
    return labels;
  }
  
  const newLabel = {
    id: generateTextLabelId(),
    content: trimmed,
    position: { x, y },
    rotation: 0,
    fontSize: options.fontSize || 16,
    fontFace: options.fontFace || 'sans',
    color: options.color || '#ffffff'
  };
  
  return [...(labels || []), newLabel];
}

/**
 * Update an existing text label
 * @param {Array} labels - Current labels array
 * @param {string} id - Label ID to update
 * @param {Object} updates - Fields to update (e.g., { position: {x, y}, rotation: 90 })
 * @returns {Array} New labels array with updated label
 */
function updateTextLabel(labels, id, updates) {
  if (!labels || !Array.isArray(labels)) return [];
  
  return labels.map(label => 
    label.id === id ? { ...label, ...updates } : label
  );
}

/**
 * Remove a text label by ID
 * @param {Array} labels - Current labels array
 * @param {string} id - Label ID to remove
 * @returns {Array} New labels array without the specified label
 */
function removeTextLabel(labels, id) {
  if (!labels || !Array.isArray(labels)) return [];
  return labels.filter(label => label.id !== id);
}

/**
 * Check if a point is inside a rotated rectangle (for text label hit detection)
 * @param {number} px - Point X coordinate
 * @param {number} py - Point Y coordinate
 * @param {number} rectX - Rectangle center X
 * @param {number} rectY - Rectangle center Y
 * @param {number} rectWidth - Rectangle width
 * @param {number} rectHeight - Rectangle height
 * @param {number} rotation - Rotation in degrees
 * @returns {boolean} True if point is inside the rotated rectangle
 */
function isPointInRotatedRect(px, py, rectX, rectY, rectWidth, rectHeight, rotation) {
  // Translate point to rectangle's local space (centered at origin)
  const dx = px - rectX;
  const dy = py - rectY;
  
  // Rotate point by negative rotation to "unrotate" it
  const angleRad = (-rotation * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotatedX = dx * cos - dy * sin;
  const rotatedY = dx * sin + dy * cos;
  
  // Check if point is inside the axis-aligned rectangle
  const halfWidth = rectWidth / 2;
  const halfHeight = rectHeight / 2;
  
  return Math.abs(rotatedX) <= halfWidth && Math.abs(rotatedY) <= halfHeight;
}

/**
 * Find text label at given coordinates using proper bounding box collision
 * @param {Array} labels - Current labels array
 * @param {number} x - Pixel X coordinate (world space)
 * @param {number} y - Pixel Y coordinate (world space)
 * @param {CanvasRenderingContext2D} ctx - Canvas context for text measurement (optional)
 * @returns {Object|null} Label at position or null
 */
function getTextLabelAtPosition(labels, x, y, ctx = null) {
  if (!labels || !Array.isArray(labels)) return null;
  
  // Create temporary canvas context if none provided
  let tempCanvas = null;
  if (!ctx) {
    tempCanvas = document.createElement('canvas');
    ctx = tempCanvas.getContext('2d');
  }
  
  // Check labels in reverse order (top to bottom, most recent first)
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i];
    
    // Set font to measure text accurately
    const fontSize = label.fontSize || 16;
    const fontFace = label.fontFace || 'sans';
    
    // Import getFontCss if available, otherwise use simple mapping
    let fontFamily;
    if (typeof getFontCss === 'function') {
      fontFamily = getFontCss(fontFace);
    } else {
      // Fallback font mapping
      const fontMap = {
        'sans': 'system-ui, -apple-system, sans-serif',
        'serif': 'Georgia, Times, serif',
        'mono': '"Courier New", monospace',
        'script': '"Brush Script MT", cursive',
        'fantasy': 'Impact, sans-serif'
      };
      fontFamily = fontMap[fontFace] || 'sans-serif';
    }
    
    ctx.font = `${fontSize}px ${fontFamily}`;
    
    // Measure text to get bounding box
    const metrics = ctx.measureText(label.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // Same multiplier as renderer
    
    // Add padding (same as selection box: 4px horizontal, 2px vertical)
    const paddingX = 4;
    const paddingY = 2;
    const boundingWidth = textWidth + paddingX * 2;
    const boundingHeight = textHeight + paddingY * 2;
    
    // Check if point is inside the rotated bounding box
    if (isPointInRotatedRect(
      x, y,
      label.position.x, label.position.y,
      boundingWidth, boundingHeight,
      label.rotation || 0
    )) {
      // Clean up temporary canvas if created
      if (tempCanvas) {
        tempCanvas = null;
      }
      return label;
    }
  }
  
  // Clean up temporary canvas if created
  if (tempCanvas) {
    tempCanvas = null;
  }
  
  return null;
}

/**
 * Remove all text labels within a rectangular area (for clear area tool)
 * @param {Array} labels - Current labels array
 * @param {number} x1 - First corner X (world space)
 * @param {number} y1 - First corner Y (world space)
 * @param {number} x2 - Second corner X (world space)
 * @param {number} y2 - Second corner Y (world space)
 * @returns {Array} New labels array without labels in rectangle
 */
function removeTextLabelsInRectangle(labels, x1, y1, x2, y2) {
  if (!labels || !Array.isArray(labels)) return [];
  
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  
  return labels.filter(label => {
    return !(label.position.x >= minX && label.position.x <= maxX && 
             label.position.y >= minY && label.position.y <= maxY);
  });
}

return {
  generateTextLabelId,
  addTextLabel,
  updateTextLabel,
  removeTextLabel,
  getTextLabelAtPosition,
  removeTextLabelsInRectangle
};
```

# screenPositionUtils

```js
// utils/screenPositionUtils.js - Shared screen position calculations for objects

/**
 * Calculate an object's screen position accounting for zoom, pan, rotation, alignment, and container positioning
 * @param {Object} object - The object to position
 * @param {HTMLCanvasElement} canvas - Canvas reference
 * @param {Object} mapData - Map data with gridSize, viewState, northDirection, mapType
 * @param {Object} geometry - Geometry instance (GridGeometry or HexGeometry)
 * @returns {Object|null} { screenX, screenY, objectWidth, objectHeight } or null if inputs invalid
 */
function calculateObjectScreenPosition(object, canvas, mapData, geometry) {
  if (!mapData || !canvas || !geometry) {
    return null;
  }
  
  const { gridSize, viewState, northDirection, mapType } = mapData;
  const { zoom, center } = viewState;
  const size = object.size || { width: 1, height: 1 };
  const alignment = object.alignment || 'center'; // Backward compatible default
  
  
  // Calculate offsets accounting for map rotation
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  let offsetX, offsetY, screenX, screenY, objectWidth, objectHeight;
  
  // Handle coordinate conversion based on map type
  if (mapType === 'hex') {
    // For hex maps: object.position contains axial coordinates {x: q, y: r}
    // We need to convert to world coordinates first
    const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
    
    // For button/selection box positioning, use same dimensions as symbol rendering
    // Symbols render at hexSize, so buttons should position based on hexSize too
    const hexSize = geometry.hexSize;
    objectWidth = size.width * hexSize * zoom;
    objectHeight = size.height * hexSize * zoom;
    
    // Hex: center is in world pixel coordinates
    offsetX = centerX - center.x * zoom;
    offsetY = centerY - center.y * zoom;
    
    // Get object CENTER in screen space (button calculators expect center, not top-left)
    screenX = offsetX + worldX * zoom;
    screenY = offsetY + worldY * zoom;
    
    // Apply alignment offset for hex maps
    screenX += getAlignmentScreenOffset(alignment, hexSize, zoom).x;
    screenY += getAlignmentScreenOffset(alignment, hexSize, zoom).y;
  } else {
    // For grid maps: object.position contains grid coordinates {x, y}
    const scaledGridSize = gridSize * zoom;
    offsetX = centerX - center.x * scaledGridSize;
    offsetY = centerY - center.y * scaledGridSize;
    
    // Get object center position in screen space (accounting for full object size)
    screenX = offsetX + (object.position.x + size.width / 2) * scaledGridSize;
    screenY = offsetY + (object.position.y + size.height / 2) * scaledGridSize;
    
    // Apply alignment offset for grid maps
    screenX += getAlignmentScreenOffset(alignment, scaledGridSize, 1).x;
    screenY += getAlignmentScreenOffset(alignment, scaledGridSize, 1).y;
    
    // Object selection box size (full object bounds)
    objectWidth = size.width * scaledGridSize;
    objectHeight = size.height * scaledGridSize;
  }
  
  // Apply canvas rotation if present
  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }
  
  // Account for canvas position within centered container
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvas.parentElement.getBoundingClientRect();
  
  // Calculate canvas offset within container (due to flex centering)
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  
  // Scale from canvas internal coordinates to displayed coordinates
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  return { 
    screenX: (screenX * scaleX) + canvasOffsetX, 
    screenY: (screenY * scaleY) + canvasOffsetY, 
    objectWidth: objectWidth * scaleX, 
    objectHeight: objectHeight * scaleY 
  };
}

/**
 * Calculate screen space offset for edge alignment
 * @param {string} alignment - 'center' | 'north' | 'south' | 'east' | 'west'
 * @param {number} cellSize - Cell size in pixels
 * @param {number} zoom - Zoom level (for hex, already included in cellSize for grid)
 * @returns {Object} { x, y } offset in screen pixels
 */
function getAlignmentScreenOffset(alignment, cellSize, zoom) {
  const halfCell = (cellSize * zoom) / 2;
  
  switch (alignment) {
    case 'north': return { x: 0, y: -halfCell };
    case 'south': return { x: 0, y: halfCell };
    case 'east': return { x: halfCell, y: 0 };
    case 'west': return { x: -halfCell, y: 0 };
    case 'center':
    default: return { x: 0, y: 0 };
  }
}

/**
 * Apply inverse rotation transformation to coordinates
 * Used when converting screen/canvas coordinates back to world/grid coordinates
 * @param {number} x - X coordinate to transform
 * @param {number} y - Y coordinate to transform
 * @param {number} canvasWidth - Canvas width for center calculation
 * @param {number} canvasHeight - Canvas height for center calculation
 * @param {number} northDirection - Rotation angle in degrees (0, 90, 180, 270)
 * @returns {Object} { x, y } - Transformed coordinates
 */
function applyInverseRotation(x, y, canvasWidth, canvasHeight, northDirection) {
  if (northDirection === 0) {
    return { x, y };
  }
  
  const centerX = canvasWidth / 2;
  const centerY = canvasHeight / 2;
  
  // Translate to origin
  let translatedX = x - centerX;
  let translatedY = y - centerY;
  
  // Apply inverse rotation (negative angle)
  const angleRad = (-northDirection * Math.PI) / 180;
  const rotatedX = translatedX * Math.cos(angleRad) - translatedY * Math.sin(angleRad);
  const rotatedY = translatedX * Math.sin(angleRad) + translatedY * Math.cos(angleRad);
  
  // Translate back
  return {
    x: rotatedX + centerX,
    y: rotatedY + centerY
  };
}

return { calculateObjectScreenPosition, applyInverseRotation, getAlignmentScreenOffset };
```

# noteOperations

```js
/**
 * Build an index of all markdown notes in the vault
 * Returns array of note paths suitable for autocomplete
 * @returns {Promise<Array<string>>} Array of vault-relative note paths
 */
async function buildNoteIndex() {
  try {
    const markdownFiles = app.vault.getMarkdownFiles();
    
    // Return array of paths without the .md extension for cleaner display
    // Store full path for actual linking
    return markdownFiles.map(file => ({
      path: file.path,           // Full path with .md
      displayName: file.basename // Name without extension
    }));
  } catch (error) {
    console.error('[buildNoteIndex] Error indexing vault notes:', error);
    return [];
  }
}

/**
 * Get note suggestions for autocomplete
 * Returns array of display names only
 * @returns {Promise<Array<string>>} Array of note display names
 */
async function getNoteDisplayNames() {
  const index = await buildNoteIndex();
  return index.map(note => note.displayName);
}

/**
 * Get full note path from display name
 * @param {string} displayName - Note name without extension
 * @returns {Promise<string|null>} Full vault path or null if not found
 */
async function getFullPathFromDisplayName(displayName) {
  const index = await buildNoteIndex();
  const match = index.find(note => note.displayName === displayName);
  return match ? match.path : null;
}

/**
 * Get display name from full path
 * @param {string} fullPath - Full vault path with .md extension
 * @returns {string} Display name without extension
 */
function getDisplayNameFromPath(fullPath) {
  if (!fullPath) return '';
  // Remove .md extension and get just the filename
  return fullPath.replace(/\.md$/, '').split('/').pop();
}

/**
 * Open a note in a new tab using Obsidian API
 * @param {string} notePath - Vault-relative note path
 * @returns {Promise<boolean>} True if successful
 */
async function openNoteInNewTab(notePath) {
  if (!notePath) {
    console.warn('[openNoteInNewTab] No note path provided');
    return false;
  }
  
  try {
    // Open in new tab (third parameter true = new leaf)
    // Second parameter empty string means no source file for relative links
    await app.workspace.openLinkText(notePath.replace(/\.md$/, ''), '', true);
    return true;
  } catch (error) {
    console.error('[openNoteInNewTab] Error opening note:', error);
    return false;
  }
}

/**
 * Validate that a note path exists in the vault
 * @param {string} notePath - Vault-relative note path
 * @returns {Promise<boolean>} True if note exists
 */
async function isValidNotePath(notePath) {
  if (!notePath) return false;
  
  try {
    const file = app.vault.getAbstractFileByPath(notePath);
    return file !== null && file !== undefined;
  } catch (error) {
    console.error('[isValidNotePath] Error validating path:', error);
    return false;
  }
}

/**
 * Format a note path for display (remove .md, show just basename)
 * @param {string} notePath - Full vault path
 * @returns {string} Formatted display name
 */
function formatNoteForDisplay(notePath) {
  if (!notePath) return '';
  return getDisplayNameFromPath(notePath);
}

return {
  buildNoteIndex,
  getNoteDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath,
  openNoteInNewTab,
  isValidNotePath,
  formatNoteForDisplay
};
```

# LinkedNoteHoverOverlays

```jsx
// components/LinkedNoteHoverOverlays.jsx - Invisible hover links for objects with linked notes
const { calculateObjectScreenPosition } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "screenPositionUtils"));
const { openNoteInNewTab } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "noteOperations"));

const LinkedNoteHoverOverlays = ({ canvasRef, mapData, selectedItem, geometry }) => {
  // Don't render anything if prerequisites aren't met
  if (!canvasRef.current || !mapData?.objects || !geometry) return null;
  
  // Filter: must have linkedNote AND not be currently selected
  const objectsWithLinks = mapData.objects.filter(obj => {
    return obj.linkedNote && 
           typeof obj.linkedNote === 'string' && 
           !(selectedItem?.type === 'object' && selectedItem?.id === obj.id);
  });
  
  return (
    <>
      {objectsWithLinks.map(obj => {
        const position = calculateObjectScreenPosition(obj, canvasRef.current, mapData, geometry);
        if (!position) return null;
        
        const { screenX, screenY, objectWidth, objectHeight } = position;
        
        const notePath = obj.linkedNote.replace(/\.md$/, '');
        if (!notePath) return null;
        
        // Touch handling state (local to each overlay)
        let touchStartTime = null;
        let touchTimer = null;
        
        const handleTouchStart = (e) => {
          touchStartTime = Date.now();
          
          // Set up long-press detection (500ms)
          touchTimer = setTimeout(() => {
            // Long press detected - open note
            openNoteInNewTab(obj.linkedNote);
            touchStartTime = null; // Prevent click from also firing
          }, 500);
        };
        
        const handleTouchEnd = (e) => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
          
          // If it was a quick tap (not a long press), let it pass through
          if (touchStartTime && (Date.now() - touchStartTime < 500)) {
            // Quick tap - pass through to canvas
            e.preventDefault();
            e.stopPropagation();
            
            // Dispatch both mousedown and mouseup to complete the click
            const mouseDownEvent = new MouseEvent('mousedown', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: e.changedTouches[0].clientX,
              clientY: e.changedTouches[0].clientY,
              screenX: e.changedTouches[0].screenX,
              screenY: e.changedTouches[0].screenY
            });
            
            const mouseUpEvent = new MouseEvent('mouseup', {
              bubbles: true,
              cancelable: true,
              view: window,
              clientX: e.changedTouches[0].clientX,
              clientY: e.changedTouches[0].clientY,
              screenX: e.changedTouches[0].screenX,
              screenY: e.changedTouches[0].screenY
            });
            
            canvasRef.current.dispatchEvent(mouseDownEvent);
            // Small delay to ensure mousedown is processed first
            setTimeout(() => {
              canvasRef.current.dispatchEvent(mouseUpEvent);
            }, 0);
          }
          
          touchStartTime = null;
        };
        
        const handleTouchCancel = () => {
          if (touchTimer) {
            clearTimeout(touchTimer);
            touchTimer = null;
          }
          touchStartTime = null;
        };
        
        return (
          <div
            key={`hover-link-${obj.id}`}
            className="dmt-object-hover-link"
            style={{
              position: 'absolute',
              left: `${screenX - objectWidth / 2}px`,
              top: `${screenY - objectHeight / 2}px`,
              width: `${objectWidth}px`,
              height: `${objectHeight}px`,
              zIndex: 10
            }}
            onClickCapture={(e) => {
              if (e.ctrlKey || e.metaKey) {
                // Ctrl/Cmd+Click: Open note
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(obj.linkedNote);
              } else {
                // Regular click: Pass through to canvas for tool interaction
                e.preventDefault();
                e.stopPropagation();
                
                // Create synthetic mousedown and mouseup events for canvas
                const mouseDownEvent = new MouseEvent('mousedown', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  screenX: e.screenX,
                  screenY: e.screenY,
                  button: e.button,
                  buttons: e.buttons
                });
                
                const mouseUpEvent = new MouseEvent('mouseup', {
                  bubbles: true,
                  cancelable: true,
                  view: window,
                  clientX: e.clientX,
                  clientY: e.clientY,
                  screenX: e.screenX,
                  screenY: e.screenY,
                  button: e.button,
                  buttons: e.buttons
                });
                
                canvasRef.current.dispatchEvent(mouseDownEvent);
                // Small delay to ensure mousedown is processed first
                setTimeout(() => {
                  canvasRef.current.dispatchEvent(mouseUpEvent);
                }, 0);
              }
            }}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchCancel}
          >
            <dc.Link link={dc.resolvePath(notePath)} />
          </div>
        );
      })}
    </>
  );
};

return { LinkedNoteHoverOverlays };
```

# MapContext

```jsx
/**
 * MapContext.jsx
 * Provides shared map state and operations to all layers via Context
 */

const MapStateContext = dc.createContext(null);
const MapOperationsContext = dc.createContext(null);

/**
 * Hook to access shared map state
 * @returns {Object} Map state (canvasRef, mapData, geometry, coordinate utils)
 * @throws {Error} If used outside MapStateProvider
 */
function useMapState() {
  const context = dc.useContext(MapStateContext);
  if (!context) {
    throw new Error('useMapState must be used within MapStateProvider');
  }
  return context;
}

/**
 * Hook to access map operations
 * @returns {Object} Map operations (getObjectAtPosition, addObject, etc.)
 * @throws {Error} If used outside MapOperationsProvider
 */
function useMapOperations() {
  const context = dc.useContext(MapOperationsContext);
  if (!context) {
    throw new Error('useMapOperations must be used within MapOperationsProvider');
  }
  return context;
}

/**
 * Provider component for map state
 * Wraps children and provides read-only map state via Context
 */
const MapStateProvider = ({ value, children }) => {
  return (
    <MapStateContext.Provider value={value}>
      {children}
    </MapStateContext.Provider>
  );
};

/**
 * Provider component for map operations
 * Wraps children and provides map operation functions via Context
 */
const MapOperationsProvider = ({ value, children }) => {
  return (
    <MapOperationsContext.Provider value={value}>
      {children}
    </MapOperationsContext.Provider>
  );
};

// Datacore export
return { 
  MapStateProvider, 
  MapOperationsProvider,
  useMapState, 
  useMapOperations,
  MapStateContext,
  MapOperationsContext
};
```

# MapSelectionContext

```jsx
/**
 * MapSelectionContext.js
 * Shared selection state for coordinating between layers
 * Allows multiple layers (ObjectLayer, TextLayer) to share selection state
 */

const MapSelectionContext = dc.createContext(null);

/**
 * Hook to access shared selection state
 * @returns {Object} Selection state and setters
 * @throws {Error} If used outside MapSelectionProvider
 */
function useMapSelection() {
  const context = dc.useContext(MapSelectionContext);
  if (!context) {
    throw new Error('useMapSelection must be used within MapSelectionProvider');
  }
  return context;
}

/**
 * Provider component for shared selection state
 * Wraps children and provides selection coordination via Context
 */
const MapSelectionProvider = ({ children, layerVisibility }) => {
  const [selectedItem, setSelectedItem] = dc.useState(null);
  const [isDraggingSelection, setIsDraggingSelection] = dc.useState(false);
  const [dragStart, setDragStart] = dc.useState(null);
  const [isResizeMode, setIsResizeMode] = dc.useState(false);
  
  // Hover state (shared between layers for tooltips)
  const [hoveredObject, setHoveredObject] = dc.useState(null);
  const [mousePosition, setMousePosition] = dc.useState(null);
  
  // Note pin modal state (shared for note_pin placement flow)
  const [showNoteLinkModal, setShowNoteLinkModal] = dc.useState(false);
  const [pendingNotePinId, setPendingNotePinId] = dc.useState(null);
  const [editingNoteObjectId, setEditingNoteObjectId] = dc.useState(null);
  
  // Coordinate overlay state (for hex maps - toggled by holding 'C' key)
  const [showCoordinates, setShowCoordinates] = dc.useState(false);
  
  // Use the layerVisibility prop directly, with fallback
  const effectiveLayerVisibility = layerVisibility || {
    objects: true,
    textLabels: true,
    hexCoordinates: true
  };
  
  // Create context value
  const value = {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition,
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId,
    showCoordinates,
    setShowCoordinates,
    layerVisibility: effectiveLayerVisibility
  };
  
  return (
    <MapSelectionContext.Provider value={value}>
      {children}
    </MapSelectionContext.Provider>
  );
};

return { MapSelectionProvider, useMapSelection };
```

# EventHandlerContext

```jsx
/**
 * EventHandlerContext.jsx
 * 
 * Provides a registration system for event handlers from different layers.
 * Layers register their handlers (object, text, drawing, notePin, panZoom)
 * and the EventCoordinationLayer uses these to route pointer events.
 * 
 * This enables clean separation: each layer owns its handlers,
 * EventCoordinationLayer owns the routing logic.
 */

const EventHandlerContext = dc.createContext(null);

/**
 * Hook for layers to register their event handlers
 * @returns {Function} registerHandlers - Function to register handlers for a layer type
 */
function useEventHandlerRegistration() {
  const context = dc.useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useEventHandlerRegistration must be used within EventHandlerProvider');
  }
  return context;
}

/**
 * Hook for EventCoordinationLayer to access all registered handlers
 * @returns {Function} getHandlers - Function to get handlers for a layer type
 */
function useRegisteredHandlers() {
  const context = dc.useContext(EventHandlerContext);
  if (!context) {
    throw new Error('useRegisteredHandlers must be used within EventHandlerProvider');
  }
  return context;
}

/**
 * Provider component that manages handler registration
 * Wraps the entire layer system to provide registration capabilities
 */
const EventHandlerProvider = ({ children }) => {
  // Store handlers by layer type: { object: {...}, text: {...}, drawing: {...}, etc. }
  const handlersRef = dc.useRef({});
  
  /**
   * Register handlers for a specific layer type
   * @param {string} layerType - Type of layer ('object', 'text', 'drawing', 'notePin', 'panZoom')
   * @param {Object} handlers - Handler functions for this layer
   */
  const registerHandlers = dc.useCallback((layerType, handlers) => {
    handlersRef.current[layerType] = handlers;
  }, []);
  
  /**
   * Unregister handlers for a specific layer type
   * @param {string} layerType - Type of layer to unregister
   */
  const unregisterHandlers = dc.useCallback((layerType) => {
    delete handlersRef.current[layerType];
  }, []);
  
  /**
   * Get handlers for a specific layer type
   * @param {string} layerType - Type of layer
   * @returns {Object|null} Handler functions or null if not registered
   */
  const getHandlers = dc.useCallback((layerType) => {
    return handlersRef.current[layerType] || null;
  }, []);
  
  /**
   * Get all registered handlers
   * @returns {Object} All handlers by layer type
   */
  const getAllHandlers = dc.useCallback(() => {
    return handlersRef.current;
  }, []);
  
  const contextValue = dc.useMemo(() => ({
    registerHandlers,
    unregisterHandlers,
    getHandlers,
    getAllHandlers
  }), [registerHandlers, unregisterHandlers, getHandlers, getAllHandlers]);
  
  return (
    <EventHandlerContext.Provider value={contextValue}>
      {children}
    </EventHandlerContext.Provider>
  );
};

return {
  EventHandlerProvider,
  useEventHandlerRegistration,
  useRegisteredHandlers,
  EventHandlerContext
};
```

# useObjectInteractions

```js
/**
 * useObjectInteractions.js
 * 
 * Custom hook for managing object interactions including:
 * - Object placement on click
 * - Object selection
 * - Object dragging with grid snapping
 * - Object resizing with corner handles
 * - Hover state management
 * - Object note and color management
 * - Button position calculations for object UI
 */

const { calculateObjectScreenPosition: calculateScreenPos, applyInverseRotation } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "screenPositionUtils"));
const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { calculateEdgeAlignment, getAlignmentOffset, placeObject, canPlaceObjectAt, removeObjectFromHex } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectOperations"));
const { getClickedObjectInCell, getObjectsInCell, canAddObjectToCell, assignSlot } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "hexSlotPositioner"));
const { HexGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "HexGeometry"));

/**
 * Hook for managing object interactions
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Array} customColors - Array of custom colors
 */
const useObjectInteractions = (
  currentTool,
  selectedObjectType,
  onAddCustomColor,
  customColors
) => {
  // Get all required state and operations from Context
  const {
    geometry,
    canvasRef,
    containerRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();

  const {
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    onObjectsChange
  } = useMapOperations();

  const {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart,
    isResizeMode,
    setIsResizeMode,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    setMousePosition
  } = useMapSelection();

  // Object-specific state
  const [isResizing, setIsResizing] = dc.useState(false);
  const [resizeCorner, setResizeCorner] = dc.useState(null); // 'tl', 'tr', 'bl', 'br'
  const resizeInitialStateRef = dc.useRef(null);
  const dragInitialStateRef = dc.useRef(null); // Store initial state for batched drag history

  // Edge snap mode state
  const [edgeSnapMode, setEdgeSnapMode] = dc.useState(false);
  const longPressTimerRef = dc.useRef(null);
  const altKeyPressedRef = dc.useRef(false);

  // Hover state now comes from shared MapSelectionContext (passed as parameters)
  // hoveredObject, setHoveredObject, mousePosition, setMousePosition

  // Object color picker refs (state managed in MapCanvas)
  const objectColorBtnRef = dc.useRef(null);
  const pendingObjectCustomColorRef = dc.useRef(null);

  // Keyboard event listener for Alt key (edge snap toggle)
  dc.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Alt' && !altKeyPressedRef.current) {
        altKeyPressedRef.current = true;
        // Enable edge snap mode for both placement (addObject tool) and dragging (selected object)
        if (currentTool === 'addObject' || selectedItem?.type === 'object') {
          setEdgeSnapMode(true);
        }
      }
    };

    const handleKeyUp = (e) => {
      if (e.key === 'Alt') {
        altKeyPressedRef.current = false;
        setEdgeSnapMode(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [selectedItem, currentTool]);

  // Clear up long press timer on unmount
  dc.useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Clear selection when switching away from select tool, and clear edgeSnapMode when deselected
  const prevToolRef = dc.useRef(currentTool);
  dc.useEffect(() => {
    // Clear edgeSnapMode if no object is selected
    if (!selectedItem || selectedItem.type !== 'object') {
      setEdgeSnapMode(false);
    }
    
    // If tool changed and we had something selected
    if (prevToolRef.current !== currentTool && selectedItem) {
      // Clear selection when switching to any tool other than select
      if (currentTool !== 'select') {
        setSelectedItem(null);
        setEdgeSnapMode(false);
      }
    }
    prevToolRef.current = currentTool;
  }, [currentTool, selectedItem, setSelectedItem]);

  /**
   * Check if click is on a resize corner handle and return which corner
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @param {Object} object - Object to check corners for
   * @returns {string|null} Corner name ('tl', 'tr', 'bl', 'br') or null
   */
  const getClickedCorner = dc.useCallback((clientX, clientY, object) => {
    if (!object || !mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { gridSize, viewState, northDirection, mapType } = mapData;
    const { zoom, center } = viewState;

    // Calculate offset based on map type
    let offsetX, offsetY, objectWidth, objectHeight;
    if (mapType === 'hex') {
      // Hex: center is in world pixel coordinates
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
      
      // Calculate object dimensions to match symbol rendering (use hexSize, not 2*hexSize)
      const hexSize = geometry.hexSize;
      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * hexSize * zoom;
      objectHeight = size.height * hexSize * zoom;
    } else {
      // Grid: center is in grid cell coordinates
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledGridSize;
      offsetY = canvas.height / 2 - center.y * scaledGridSize;
      
      const size = object.size || { width: 1, height: 1 };
      objectWidth = size.width * scaledGridSize;
      objectHeight = size.height * scaledGridSize;
    }

    // Apply inverse rotation transformation
    const rotated = applyInverseRotation(x, y, canvas.width, canvas.height, northDirection);
    x = rotated.x;
    y = rotated.y;

    // Get screen position - for hex this is the center, for grid it's top-left
    let screenX, screenY;
    if (mapType === 'hex') {
      // For hex: calculate true center position in screen space
      const { worldX, worldY } = geometry.hexToWorld(object.position.x, object.position.y);
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;
      
      // Convert from center to top-left for corner calculations
      screenX -= objectWidth / 2;
      screenY -= objectHeight / 2;
    } else {
      // For grid: gridToScreen returns top-left
      const pos = geometry.gridToScreen(object.position.x, object.position.y, offsetX, offsetY, zoom);
      screenX = pos.screenX;
      screenY = pos.screenY;
    }

    const handleSize = isResizeMode ? 14 : 8;
    const hitMargin = handleSize / 2 + 4; // Extra margin for easier clicking

    // Check each corner (corners are relative to top-left)
    const corners = [
      { name: 'tl', cx: screenX + 2, cy: screenY + 2 },
      { name: 'tr', cx: screenX + objectWidth - 2, cy: screenY + 2 },
      { name: 'bl', cx: screenX + 2, cy: screenY + objectHeight - 2 },
      { name: 'br', cx: screenX + objectWidth - 2, cy: screenY + objectHeight - 2 }
    ];

    for (const corner of corners) {
      const dx = x - corner.cx;
      const dy = y - corner.cy;
      if (Math.abs(dx) <= hitMargin && Math.abs(dy) <= hitMargin) {
        return corner.name;
      }
    }

    return null;
  }, [mapData, isResizeMode, canvasRef, geometry]);

  /**
   * Handle object placement for addObject tool
   * @param {number} gridX - Grid X coordinate (q for hex maps) - snapped integer
   * @param {number} gridY - Grid Y coordinate (r for hex maps) - snapped integer  
   * @param {number} clientX - Raw client X coordinate (for edge snap detection)
   * @param {number} clientY - Raw client Y coordinate (for edge snap detection)
   * @returns {boolean} True if placement was handled
   */
  const handleObjectPlacement = dc.useCallback((gridX, gridY, clientX, clientY) => {
    if (currentTool !== 'addObject' || !selectedObjectType) {
      return false;
    }

    // Check bounds for hex maps (using geometry.isWithinBounds which handles offset conversion)
    if (geometry && geometry.isWithinBounds) {
      if (!geometry.isWithinBounds(gridX, gridY)) {
        return true; // Handled but blocked (outside bounds)
      }
    }

    const mapType = mapData.mapType || 'grid';
    
    // Check if placement is allowed
    if (!canPlaceObjectAt(mapData.objects || [], gridX, gridY, mapType)) {
      return true; // Handled but blocked (cell occupied/full)
    }

    // Determine alignment for grid maps with edge snap
    let alignment = 'center';
    if (mapType === 'grid' && edgeSnapMode && clientX !== undefined && clientY !== undefined) {
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords && geometry) {
        const cellSize = mapData.gridSize || geometry.cellSize;
        const fractionalX = worldCoords.worldX / cellSize;
        const fractionalY = worldCoords.worldY / cellSize;
        alignment = calculateEdgeAlignment(fractionalX, fractionalY, gridX, gridY);
      }
    }

    // Place object using unified API
    const result = placeObject(
      mapData.objects || [],
      selectedObjectType,
      gridX,
      gridY,
      { mapType, alignment }
    );
    
    if (result.success) {
      onObjectsChange(result.objects);
    }
    return true;
  }, [currentTool, selectedObjectType, mapData, geometry, edgeSnapMode, 
      onObjectsChange, screenToWorld]);



  /**
   * Handle object selection for select tool
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} True if selection was handled
   */
  const handleObjectSelection = dc.useCallback((clientX, clientY, gridX, gridY) => {
    if (currentTool !== 'select') {
      return false;
    }

    // If in resize mode with selected object, check for corner clicks FIRST
    if (selectedItem?.type === 'object' && isResizeMode) {
      const selectedObject = mapData.objects?.find(obj => obj.id === selectedItem.id);
      if (selectedObject) {
        const corner = getClickedCorner(clientX, clientY, selectedObject);
        if (corner) {
          // Store initial object state for batched history entry at resize end
          resizeInitialStateRef.current = [...(mapData.objects || [])];
          setIsResizing(true);
          setResizeCorner(corner);
          setDragStart({ x: clientX, y: clientY, gridX, gridY, object: { ...selectedObject } });
          return true;
        }
      }
    }

    // For hex maps with multi-object support: resolve click to specific object
    let object = null;
    if (mapData.mapType === 'hex' && geometry instanceof HexGeometry) {
      const cellObjects = getObjectsInCell(mapData.objects || [], gridX, gridY);
      
      if (cellObjects.length > 1) {
        // Calculate click offset within hex (relative to hex center)
        const worldCoords = screenToWorld(clientX, clientY);
        if (worldCoords && geometry.hexToWorld) {
          const { worldX: hexCenterX, worldY: hexCenterY } = geometry.hexToWorld(gridX, gridY);
          // Offset in hex-width units (hexWidth = 2 * hexSize)
          const hexWidth = geometry.hexSize * 2;
          const clickOffsetX = (worldCoords.worldX - hexCenterX) / hexWidth;
          const clickOffsetY = (worldCoords.worldY - hexCenterY) / hexWidth;
          
          object = getClickedObjectInCell(
            mapData.objects || [],
            gridX,
            gridY,
            clickOffsetX,
            clickOffsetY,
            mapData.orientation || 'flat'
          );
        }
      } else if (cellObjects.length === 1) {
        object = cellObjects[0];
      }
    } else {
      // Grid maps: use standard single-object lookup
      object = getObjectAtPosition(mapData.objects || [], gridX, gridY);
    }
    
    if (object) {
      // Check if this object is already selected
      const isAlreadySelected = selectedItem?.type === 'object' && selectedItem.id === object.id;

      if (isAlreadySelected) {
        // Already selected - start long press detection for touch devices
        // Clear any existing timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        
        // Start long press timer (500ms threshold) - grid maps only
        // Edge snap mode is not implemented for hex maps
        if (mapData.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            // Toggle edge snap mode on long press
            setEdgeSnapMode(prev => !prev);
            
            // Haptic feedback if available
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            
            longPressTimerRef.current = null;
          }, 500);
        }
        
        // Start dragging
        dragInitialStateRef.current = [...(mapData.objects || [])];
        setIsDraggingSelection(true);
        // Store the offset from where we clicked to the object's actual position
        // This ensures enlarged objects don't jump when first moved
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY });
        setIsResizeMode(false);
      } else {
        // Not selected - select it and set up for potential drag
        setSelectedItem({ type: 'object', id: object.id, data: object });
        setIsResizeMode(false);
        
        // Set up drag state so user can continue into a drag without releasing
        // Store the object reference in dragStart since selectedItem state update is async
        dragInitialStateRef.current = [...(mapData.objects || [])];
        setIsDraggingSelection(true);
        const offsetX = gridX - object.position.x;
        const offsetY = gridY - object.position.y;
        setDragStart({ 
          x: clientX, 
          y: clientY, 
          gridX, 
          gridY, 
          offsetX, 
          offsetY,
          objectId: object.id  // Store object ID for immediate drag support
        });
        
        // Clear any existing timer
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
        }
        
        // Start long press timer - will enable edge snap mode if held (grid maps only)
        // Edge snap mode is not implemented for hex maps
        if (mapData.mapType !== 'hex') {
          longPressTimerRef.current = setTimeout(() => {
            // Enable edge snap mode on long press (not toggle, since we just selected)
            setEdgeSnapMode(true);
            
            // Haptic feedback if available
            if (navigator.vibrate) {
              navigator.vibrate(50);
            }
            
            longPressTimerRef.current = null;
          }, 500);
        }
      }

      return true;
    }

    return false;
  }, [currentTool, selectedObjectType, selectedItem, isResizeMode, mapData,
    getObjectAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart, setIsResizing
  ]);

  /**
   * Handle object dragging during pointer move
   * @param {Object} e - Event object
   * @returns {boolean} True if dragging was handled
   */
  const handleObjectDragging = dc.useCallback((e) => {
    // Check if we're dragging - use dragStart.objectId as fallback when selectedItem hasn't updated yet
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (!isDraggingSelection || !isDraggingObject || !dragStart || !mapData) {
      return false;
    }

    // Get the object ID from either selectedItem or dragStart
    const objectId = selectedItem?.id || dragStart.objectId;

    const { clientX, clientY } = getClientCoords(e);
    
    // Cancel long press timer if user has moved beyond a small threshold (5 pixels)
    // This prevents accidental edge-snap activation during normal dragging
    if (longPressTimerRef.current) {
      const dx = clientX - dragStart.x;
      const dy = clientY - dragStart.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance > 5) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }

    e.preventDefault();
    e.stopPropagation();

    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { gridX, gridY } = coords;
    

    // Calculate target position using the stored offset
    const offsetX = dragStart.offsetX || 0;
    const offsetY = dragStart.offsetY || 0;
    const targetX = gridX - offsetX;
    const targetY = gridY - offsetY;

    // Only update if we've moved to a different grid cell
    if (gridX !== dragStart.gridX || gridY !== dragStart.gridY) {
      const currentObject = mapData.objects?.find(o => o.id === objectId);
      if (!currentObject) return true;
      
      const isMovingWithinSameCell = currentObject.position.x === targetX && currentObject.position.y === targetY;
      
      // For hex maps: handle multi-object cell logic
      if (mapData.mapType === 'hex' && !isMovingWithinSameCell) {
        // Check if target cell can accept this object
        const targetCellObjects = getObjectsInCell(mapData.objects || [], targetX, targetY);
        
        if (targetCellObjects.length >= 4) {
          // Target cell is full - block the move
          return true;
        }
        
        // Assign new slot in target cell
        const targetSlots = targetCellObjects.map(o => o.slot ?? 0);
        const newSlot = assignSlot(targetSlots);
        
        // Remove from old cell with reorganization, then update position and slot
        let updatedObjects = removeObjectFromHex(mapData.objects, objectId);
        
        // Re-add the moved object with new position and slot
        updatedObjects = [...updatedObjects, {
          ...currentObject,
          position: { x: targetX, y: targetY },
          slot: newSlot
        }];
        
        onObjectsChange(updatedObjects, true); // Suppress history during drag
        
        // Update drag start and selected item
        setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY, objectId });
        const movedObject = updatedObjects.find(obj => obj.id === objectId);
        if (movedObject) {
          setSelectedItem({
            type: 'object',
            id: objectId,
            data: movedObject
          });
        }
      } else {
        // Grid maps or same-cell movement: use existing single-object logic
        const existingObj = getObjectAtPosition(mapData.objects || [], targetX, targetY);
        
        if (!existingObj || existingObj.id === objectId) {
          // Determine alignment if in edge snap mode
          let alignment = 'center';
          if (edgeSnapMode) {
            const worldCoords = screenToWorld(clientX, clientY);
            if (worldCoords && geometry.worldToGrid) {
              const fractionalX = worldCoords.worldX / (mapData.gridSize || geometry.cellSize);
              const fractionalY = worldCoords.worldY / (mapData.gridSize || geometry.cellSize);
              alignment = calculateEdgeAlignment(fractionalX, fractionalY, targetX, targetY);
            }
          }
          
          // Update object position and alignment (suppress history during drag)
          const updatedObjects = updateObject(
            mapData.objects,
            objectId,
            { position: { x: targetX, y: targetY }, alignment }
          );
          onObjectsChange(updatedObjects, true); // Suppress history

          // Update drag start and selected item data for next frame (preserve offset and objectId)
          setDragStart({ x: clientX, y: clientY, gridX, gridY, offsetX, offsetY, objectId });
          const updatedObject = updatedObjects.find(obj => obj.id === objectId);
          if (updatedObject) {
            setSelectedItem({
              type: 'object',
              id: objectId,
              data: updatedObject
            });
          }
        }
      }
    }
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, edgeSnapMode, geometry,
    getClientCoords, screenToGrid, screenToWorld, updateObject, onObjectsChange, setDragStart, setSelectedItem, calculateEdgeAlignment]);

  /**
   * Handle object resizing during pointer move
   * @param {Object} e - Event object
   * @returns {boolean} True if resizing was handled
   */
  const handleObjectResizing = dc.useCallback((e) => {
    if (!isResizing || !dragStart || !mapData || selectedItem?.type !== 'object') {
      return false;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return true;

    const { gridX, gridY } = coords;
    const originalObject = dragStart.object;
    const originalPos = originalObject.position;
    const originalSize = originalObject.size || { width: 1, height: 1 };

    // Calculate new dimensions based on corner being dragged
    let newX = originalPos.x;
    let newY = originalPos.y;
    let newWidth = originalSize.width;
    let newHeight = originalSize.height;

    switch (resizeCorner) {
      case 'tl': // Top-left: adjust position and size
        newX = Math.min(gridX, originalPos.x + originalSize.width - 1);
        newY = Math.min(gridY, originalPos.y + originalSize.height - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'tr': // Top-right: adjust Y and width
        newY = Math.min(gridY, originalPos.y + originalSize.height - 1);
        newWidth = Math.max(1, gridX - originalPos.x + 1);
        newHeight = originalPos.y + originalSize.height - newY;
        break;
      case 'bl': // Bottom-left: adjust X and height
        newX = Math.min(gridX, originalPos.x + originalSize.width - 1);
        newWidth = originalPos.x + originalSize.width - newX;
        newHeight = Math.max(1, gridY - originalPos.y + 1);
        break;
      case 'br': // Bottom-right: just increase size
        newWidth = Math.max(1, gridX - originalPos.x + 1);
        newHeight = Math.max(1, gridY - originalPos.y + 1);
        break;
    }

    // Clamp to max size of 5
    newWidth = Math.min(newWidth, 5);
    newHeight = Math.min(newHeight, 5);

    // Try progressive fallback: both dimensions -> width only -> height only
    let finalWidth = newWidth;
    let finalHeight = newHeight;
    let finalX = newX;
    let finalY = newY;
    let resizeSucceeded = false;

    // First attempt: both dimensions
    if (isAreaFree(mapData.objects, newX, newY, newWidth, newHeight, selectedItem.id)) {
      resizeSucceeded = true;
    }

    // If both dimensions failed, try just width (keep original height)
    if (!resizeSucceeded && newWidth !== originalSize.width) {
      if (isAreaFree(mapData.objects, newX, originalPos.y, newWidth, originalSize.height, selectedItem.id)) {
        finalWidth = newWidth;
        finalHeight = originalSize.height;
        finalX = newX;
        finalY = originalPos.y;
        resizeSucceeded = true;
      }
    }

    // If width also failed, try just height (keep original width)
    if (!resizeSucceeded && newHeight !== originalSize.height) {
      if (isAreaFree(mapData.objects, originalPos.x, newY, originalSize.width, newHeight, selectedItem.id)) {
        finalWidth = originalSize.width;
        finalHeight = newHeight;
        finalX = originalPos.x;
        finalY = newY;
        resizeSucceeded = true;
      }
    }

    // Apply the resize if any attempt succeeded
    if (resizeSucceeded) {
      const updatedObjects = updateObject(
        mapData.objects,
        selectedItem.id,
        {
          position: { x: finalX, y: finalY },
          size: { width: finalWidth, height: finalHeight }
        }
      );
      // Suppress history during drag (we'll add single entry when resize ends)
      onObjectsChange(updatedObjects, true);

      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
    }
    return true;
  }, [isResizing, dragStart, mapData, selectedItem, resizeCorner,
    getClientCoords, screenToGrid, isAreaFree, updateObject, onObjectsChange, setSelectedItem]
  );

  /**
   * Handle hover state updates during pointer move
   * @param {Object} e - Event object
   */
  const handleHoverUpdate = dc.useCallback((e) => {
    if (!e.touches && mapData && mapData.objects) {
      const { clientX, clientY } = getClientCoords(e);
      const coords = screenToGrid(clientX, clientY);
      if (coords) {
        const obj = getObjectAtPosition(mapData.objects, coords.gridX, coords.gridY);
        setHoveredObject(obj);

        // Calculate position relative to container for absolute positioning
        const container = containerRef.current;
        const rect = container.getBoundingClientRect();
        const relativeX = clientX - rect.left;
        const relativeY = clientY - rect.top;
        setMousePosition({ x: relativeX, y: relativeY });
      } else {
        setHoveredObject(null);
      }
    }
  }, [mapData, getClientCoords, screenToGrid, getObjectAtPosition, setHoveredObject, setMousePosition, containerRef]
  );

  /**
   * Stop dragging selection and finalize history
   */
  const stopObjectDragging = dc.useCallback(() => {
    // Check dragStart.objectId as fallback for when selectedItem hasn't updated yet
    const isDraggingObject = selectedItem?.type === 'object' || dragStart?.objectId;
    if (isDraggingSelection && isDraggingObject) {
      // Cancel any pending long press timer
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      
      setIsDraggingSelection(false);
      setDragStart(null);

      // Add single history entry for the completed drag
      if (dragInitialStateRef.current !== null) {
        onObjectsChange(mapData.objects, false);
        dragInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isDraggingSelection, selectedItem, dragStart, setIsDraggingSelection, setDragStart, onObjectsChange, mapData]);


  /**
   * Stop resizing and finalize history
   */
  const stopObjectResizing = dc.useCallback(() => {
    if (isResizing) {
      setIsResizing(false);
      setResizeCorner(null);
      setDragStart(null);

      // Add single history entry for the completed resize
      if (resizeInitialStateRef.current !== null) {
        onObjectsChange(mapData.objects, false);
        resizeInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  }, [isResizing, setIsResizing, setResizeCorner, setDragStart, onObjectsChange, mapData]
  );

  /**
   * Handle keyboard shortcuts for objects
   */
  const handleObjectKeyDown = dc.useCallback((e) => {
    // Only handle if an object is selected
    if (selectedItem?.type !== 'object') {
      return false;
    }
    
    // Rotation with R key
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      // Cycle through rotations
      const rotations = [0, 90, 180, 270];
      const currentRotation = selectedItem.data?.rotation || 0;
      const currentIndex = rotations.indexOf(currentRotation);
      const nextRotation = rotations[(currentIndex + 1) % 4];
      
      const updatedObjects = updateObject(
        mapData.objects,
        selectedItem.id,
        { rotation: nextRotation }
      );
      onObjectsChange(updatedObjects);
      
      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
      return true;
    }
    
    // Deletion with Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      const updatedObjects = removeObject(mapData.objects, selectedItem.id);
      onObjectsChange(updatedObjects);
      setSelectedItem(null);
      setIsResizeMode(false);
      return true;
    }

    // Escape key to exit resize mode
    if (e.key === 'Escape' && isResizeMode) {
      e.preventDefault();
      setIsResizeMode(false);
      return true;
    }

    return false;
  }, [selectedItem, isResizeMode, mapData, removeObject, updateObject, onObjectsChange, setSelectedItem, setIsResizeMode]
  );

  /**
   * Handle mouse wheel for object scaling when hovering over selected object
   * @param {WheelEvent} e - Wheel event
   * @returns {boolean} True if wheel was handled
   */
  const handleObjectWheel = dc.useCallback((e) => {
    // Only handle if an object is selected and we're hovering over it
    if (selectedItem?.type !== 'object' || !mapData?.objects) {
      return false;
    }
    
    // Check if mouse is over the selected object
    const coords = screenToGrid(e.clientX, e.clientY);
    if (!coords) return false;
    
    const { gridX, gridY } = coords;
    const selectedObject = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (!selectedObject) return false;
    
    // Check if cursor is over the selected object's cell
    const isOverObject = gridX >= selectedObject.position.x && 
                         gridX < selectedObject.position.x + (selectedObject.size?.width || 1) &&
                         gridY >= selectedObject.position.y && 
                         gridY < selectedObject.position.y + (selectedObject.size?.height || 1);
    
    if (!isOverObject) return false;
    
    // Prevent page scroll
    e.preventDefault();
    
    // Calculate new scale (allow up to 130% for symbols with inherent padding)
    const currentScale = selectedObject.scale ?? 1.0;
    const delta = e.deltaY > 0 ? -0.05 : 0.05; // Scroll down = smaller, scroll up = larger
    const newScale = Math.max(0.25, Math.min(1.3, currentScale + delta));
    
    // Only update if scale changed
    if (newScale !== currentScale) {
      const updatedObjects = updateObject(mapData.objects, selectedItem.id, { scale: newScale });
      onObjectsChange(updatedObjects);
      
      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({ ...selectedItem, data: updatedObject });
      }
    }
    
    return true;
  }, [selectedItem, mapData, screenToGrid, updateObject, onObjectsChange, setSelectedItem]);

  /**
   * Calculate note button position (top-right corner)
   */
  const calculateLabelButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;

    // Position button at top-right corner of selection box
    const buttonX = screenX + (objectWidth / 2) + buttonOffset;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22; // 22 = half button height // 16 = half button height

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate object color button position (bottom-left corner, avoiding resize button)
   */
  const calculateLinkNoteButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44;
    const buttonHeight = 44;
    const minSpacing = 8;

    // Calculate base position at BOTTOM-LEFT corner
    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    // Check if buttons would overlap (Add/edit note button is at top-right)
    // Add/edit note button bottom edge: screenY - (objectHeight / 2) - buttonOffset - 16 + buttonHeight
    const addEditNoteButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    // If our top edge would be above the add/edit note button's bottom edge, push us down
    if (buttonY - 22 < addEditNoteButtonBottom + minSpacing) {
      buttonY = addEditNoteButtonBottom + minSpacing + 22;
    }

    // Position at BOTTOM-RIGHT corner (or further down if needed to avoid overlap)
    const buttonX = screenX + (objectWidth / 2) + buttonOffset;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate resize button position (top-left corner)
   */
  const calculateResizeButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44; // Updated to match CSS media query // CSS button width

    // Position resize button at top-LEFT corner (opposite of note button)
    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;
    const buttonY = screenY - (objectHeight / 2) - buttonOffset - 22; // 22 = half button height // 16 = half button height

    return { x: buttonX, y: buttonY };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Calculate object color button position (bottom-left corner, avoiding resize button)
   */
  const calculateObjectColorButtonPosition = dc.useCallback(() => {
    if (selectedItem?.type !== 'object' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }

    const object = mapData.objects.find(obj => obj.id === selectedItem.id);
    if (!object) return { x: 0, y: 0 };

    const pos = calculateScreenPos(object, canvasRef.current, mapData, geometry);
    if (!pos) return { x: 0, y: 0 };

    const { screenX, screenY, objectWidth, objectHeight } = pos;
    const buttonOffset = 4;
    const buttonSize = 44; // Updated to match CSS media query
    const buttonHeight = 44; // Updated to match CSS media query
    const minSpacing = 8; // Minimum gap between buttons

    // Calculate base position at BOTTOM-LEFT corner
    let buttonY = screenY + (objectHeight / 2) + buttonOffset;

    // Check if buttons would overlap (resize button is at top-left)
    // Resize button bottom edge: screenY - (objectHeight / 2) - buttonOffset - 16 + buttonHeight
    const resizeButtonBottom = screenY - (objectHeight / 2) - buttonOffset - 22 + buttonHeight;

    // If our top edge would be above the resize button's bottom edge, push us down
    if (buttonY - 22 < resizeButtonBottom + minSpacing) {
      buttonY = resizeButtonBottom + minSpacing + 22; // 16 = half our button height
    }

    // Position at BOTTOM-LEFT corner (or further down if needed to avoid overlap)
    const buttonX = screenX - (objectWidth / 2) - buttonOffset - buttonSize;

    return { x: buttonX, y: buttonY - 22 };
  }, [selectedItem, mapData, canvasRef, geometry]
  );

  /**
   * Handle object note modal submit
   */
  const handleNoteSubmit = dc.useCallback((content, editingObjectId) => {
    if (editingObjectId && mapData) {
      const updatedObjects = updateObject(
        mapData.objects,
        editingObjectId,
        { customTooltip: content && content.trim() ? content.trim() : undefined }
      );
      onObjectsChange(updatedObjects);

      // Update selected item data if it's still selected
      if (selectedItem?.id === editingObjectId) {
        const updatedObject = updatedObjects.find(obj => obj.id === editingObjectId);
        if (updatedObject) {
          setSelectedItem({
            ...selectedItem,
            data: updatedObject
          });
        }
      }
    }
  }, [mapData, onObjectsChange, selectedItem, setSelectedItem]
  );

  /**
   * Handle object color selection
   */
  const handleObjectColorSelect = dc.useCallback((color) => {
    if (selectedItem?.type === 'object' && mapData) {
      const updatedObjects = updateObject(
        mapData.objects,
        selectedItem.id,
        { color: color }
      );
      onObjectsChange(updatedObjects);

      // Update selected item data
      const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
      if (updatedObject) {
        setSelectedItem({
          ...selectedItem,
          data: updatedObject
        });
      }
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange, setSelectedItem]
  );


  /**
   * Handle object color reset
   */
  const handleObjectColorReset = dc.useCallback((setShowObjectColorPicker) => {
    handleObjectColorSelect('#ffffff');
    setShowObjectColorPicker(false);
  }, [handleObjectColorSelect]);

  /**
   * Handle object rotation (cycles 0Ãƒâ€šÃ‚Â° ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 90Ãƒâ€šÃ‚Â° ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 180Ãƒâ€šÃ‚Â° ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 270Ãƒâ€šÃ‚Â° ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 0Ãƒâ€šÃ‚Â°)
   */
  const handleObjectRotation = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }
    
    // Cycle through rotations
    const rotations = [0, 90, 180, 270];
    const currentRotation = selectedItem.data?.rotation || 0;
    const currentIndex = rotations.indexOf(currentRotation);
    const nextRotation = rotations[(currentIndex + 1) % 4];
    
    const updatedObjects = updateObject(
      mapData.objects,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onObjectsChange(updatedObjects);
    
    // Update selected item data
    const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({
        ...selectedItem,
        data: updatedObject
      });
    }
  }, [selectedItem, mapData, updateObject, onObjectsChange, setSelectedItem]);

  /**
   * Handle object deletion
   */
  const handleObjectDeletion = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData) {
      return;
    }
    
    const updatedObjects = removeObject(mapData.objects, selectedItem.id);
    onObjectsChange(updatedObjects);
    setSelectedItem(null);
  }, [selectedItem, mapData, removeObject, onObjectsChange, setSelectedItem]);

  // Reset resize mode when switching away from select tool
  dc.useEffect(() => {
    if (currentTool !== 'select') {
      setIsResizeMode(false);
    }
  }, [currentTool]);

  return {
    // State
    isResizeMode,
    setIsResizeMode,
    isResizing,
    resizeCorner,
    hoveredObject,
    setHoveredObject,
    mousePosition,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    longPressTimerRef,

    // Handlers
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleObjectWheel,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    handleObjectRotation,
    handleObjectDeletion,

    // Button position calculators
    calculateLabelButtonPosition,
    calculateLinkNoteButtonPosition,
    calculateResizeButtonPosition,
    calculateObjectColorButtonPosition,

    // Modal handlers
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,

    // Utility
    getClickedCorner
  };
};

return { useObjectInteractions };
```

# TextInputModal

```jsx
// components/TextInputModal.jsx - Modal dialog for text label entry

const TextInputModal = ({ initialValue = '', onSubmit, onCancel, title = 'Add Text Label', placeholder = 'Enter label text...' }) => {
    const [text, setText] = dc.useState(initialValue);
    const inputRef = dc.useRef(null);
    
    // Auto-focus input when modal opens
    dc.useEffect(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        // Select all text if editing existing label
        if (initialValue) {
          inputRef.current.select();
        }
      }
    }, []);
    
    // Handle keyboard shortcuts
    const handleKeyDown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    
    const handleSubmit = () => {
      const trimmed = text.trim();
      if (trimmed.length > 0 && trimmed.length <= 200) {
        onSubmit(trimmed);
      }
    };
    
    // Prevent clicks inside modal from closing it
    const handleModalClick = (e) => {
      e.stopPropagation();
    };
    
    return (
      <div className="dmt-modal-overlay" onClick={onCancel}>
        <div 
          className="dmt-modal-content" 
          onClick={handleModalClick}
        >
          <h3 className="dmt-modal-title">{title}</h3>
          
          <input
            ref={inputRef}
            type="text"
            className="dmt-modal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={200}
            placeholder={placeholder}
          />
          
          <div className="dmt-modal-buttons">
            <button 
              className="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button 
              className="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSubmit}
              disabled={text.trim().length === 0}
            >
              {initialValue ? 'Update' : 'Add Label'}
            </button>
          </div>
          
          <div className="dmt-modal-hint">
            Press Enter to confirm, Esc to cancel
          </div>
        </div>
      </div>
    );
  };
  
  return { TextInputModal };
```

# NoteLinkModal

```jsx
const { 
  getNoteDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath
} = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "noteOperations"));

const { getObjectType } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypeResolver"));

/**
 * Modal for linking notes to objects
 * Similar structure to TextLabelEditor
 */
function NoteLinkModal({ 
  isOpen, 
  onClose, 
  onSave, 
  currentNotePath = null,
  objectType = null
}) {
  const [noteInput, setNoteInput] = dc.useState('');
  const [isLoading, setIsLoading] = dc.useState(false);
  
  // Initialize input with current note display name
  dc.useEffect(() => {
    if (isOpen) {
      const displayName = getDisplayNameFromPath(currentNotePath);
      setNoteInput(displayName);
    }
  }, [isOpen, currentNotePath]);
  
  // Get suggestions callback for AutocompleteInput
  const getSuggestions = dc.useCallback(async (query) => {
    try {
      const allNotes = await getNoteDisplayNames();
      return allNotes;
    } catch (error) {
      console.error('[NoteLinkModal] Error getting suggestions:', error);
      return [];
    }
  }, []);
  
  const handleSave = dc.useCallback(async () => {
    setIsLoading(true);
    
    try {
      if (!noteInput.trim()) {
        // Empty input means remove link
        onSave(null);
        onClose();
        return;
      }
      
      // Convert display name back to full path
      const fullPath = await getFullPathFromDisplayName(noteInput);
      
      if (!fullPath) {
        console.warn('[NoteLinkModal] Note not found:', noteInput);
        // Still save what user typed - they might be creating a new note
        onSave(noteInput + '.md');
      } else {
        onSave(fullPath);
      }
      
      onClose();
    } catch (error) {
      console.error('[NoteLinkModal] Error saving note link:', error);
    } finally {
      setIsLoading(false);
    }
  }, [noteInput, onSave, onClose]);
  
  const handleRemove = dc.useCallback(() => {
    onSave(null);
    onClose();
  }, [onSave, onClose]);
  
  const handleCancel = dc.useCallback(() => {
    onClose();
  }, [onClose]);
  
  const handleInputChange = dc.useCallback((e) => {
    setNoteInput(e.target.value);
  }, []);
  
  // Get object type label for display
  const objectTypeLabel = dc.useMemo(() => {
    if (!objectType) return 'Object';
    const type = getObjectType(objectType);
    return type ? type.label : 'Object';
  }, [objectType]);
  
  if (!isOpen) return null;
  
  return (
    <div class="dmt-modal-overlay" onClick={handleCancel}>
      <div class="dmt-modal-content" onClick={(e) => e.stopPropagation()}>
        <div class="dmt-modal-header">
          <h3>Link Note to {objectTypeLabel}</h3>
        </div>
        
        <div class="dmt-modal-body">
          <div class="dmt-form-group">
            <label class="dmt-form-label">Note Name</label>
            <AutocompleteInput
              value={noteInput}
              onChange={handleInputChange}
              onSelect={(value) => setNoteInput(value)}
              placeholder="Type to search notes..."
              disabled={isLoading}
              getSuggestions={getSuggestions}
              maxSuggestions={10}
            />
          </div>
        </div>
        
        <div class="dmt-modal-footer">
          <button 
            class="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={handleCancel}
            disabled={isLoading}
          >
            Cancel
          </button>
          
          {currentNotePath && (
            <button 
              class="dmt-modal-btn dmt-modal-btn-danger"
              onClick={handleRemove}
              disabled={isLoading}
            >
              Remove Link
            </button>
          )}
          
          <button 
            class="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSave}
            disabled={isLoading}
          >
            {isLoading ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  let queryIndex = 0;
  for (let i = 0; i < textLower.length && queryIndex < queryLower.length; i++) {
    if (textLower[i] === queryLower[queryIndex]) {
      queryIndex++;
    }
  }
  return queryIndex === queryLower.length;
}

function scoreMatch(text, query) {
  if (!query) return 0;
  
  const textLower = text.toLowerCase();
  const queryLower = query.toLowerCase();
  
  if (textLower === queryLower) return 1000;
  if (textLower.startsWith(queryLower)) return 500;
  if (textLower.includes(queryLower)) return 250;
  return 100;
}

function AutocompleteInput({ 
  value, 
  onChange, 
  onSelect,
  placeholder, 
  disabled,
  getSuggestions,
  maxSuggestions = 10
}) {
  const [suggestions, setSuggestions] = dc.useState([]);
  const [showSuggestions, setShowSuggestions] = dc.useState(false);
  const [selectedIndex, setSelectedIndex] = dc.useState(-1);
  const [isLoading, setIsLoading] = dc.useState(false);
  const [userIsTyping, setUserIsTyping] = dc.useState(false);
  
  const containerRef = dc.useRef(null);
  const inputRef = dc.useRef(null);
  const justSelectedRef = dc.useRef(false);
  const suggestionRefs = dc.useRef([]);
  const isKeyboardNavRef = dc.useRef(false);

  // Scroll selected item into view when navigating with keyboard only
  dc.useEffect(() => {
    if (selectedIndex >= 0 && suggestionRefs.current[selectedIndex] && isKeyboardNavRef.current) {
      const element = suggestionRefs.current[selectedIndex];
      const container = element?.parentElement;
      if (container) {
        const elementTop = element.offsetTop;
        const elementBottom = elementTop + element.offsetHeight;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        
        if (elementTop < containerTop) {
          container.scrollTop = elementTop;
        } else if (elementBottom > containerBottom) {
          container.scrollTop = elementBottom - container.clientHeight;
        }
      }
      isKeyboardNavRef.current = false;
    }
  }, [selectedIndex]);

  dc.useEffect(() => {
    const loadSuggestions = async () => {
      if (!value || value.length < 1) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      if (justSelectedRef.current) {
        justSelectedRef.current = false;
        return;
      }

      setIsLoading(true);
      
      try {
        const allSuggestions = await getSuggestions(value);
        
        const matches = allSuggestions
          .filter(item => fuzzyMatch(item, value))
          .map(item => ({
            text: item,
            score: scoreMatch(item, value)
          }))
          .sort((a, b) => b.score - a.score)
          .slice(0, maxSuggestions)
          .map(item => item.text);

        setSuggestions(matches);
        
        if (userIsTyping) {
          setShowSuggestions(matches.length > 0);
        }
        
        if (matches.length > 0 && selectedIndex >= matches.length) {
          setSelectedIndex(matches.length - 1);
        }
      } catch (error) {
        console.error('Error loading suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadSuggestions();
  }, [value, getSuggestions, maxSuggestions, userIsTyping]);

  dc.useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleInputChange = (e) => {
    setUserIsTyping(true);
    onChange(e);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => 
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      
      case 'ArrowUp':
        e.preventDefault();
        isKeyboardNavRef.current = true;
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      
      case 'Enter':
        if (selectedIndex >= 0) {
          e.preventDefault();
          selectSuggestion(suggestions[selectedIndex]);
        }
        break;
      
      case 'Escape':
        e.preventDefault();
        setShowSuggestions(false);
        setUserIsTyping(false);
        setSelectedIndex(-1);
        break;
    }
  };

  const selectSuggestion = (suggestion) => {
    justSelectedRef.current = true;
    setUserIsTyping(false);
    onChange({ target: { value: suggestion } });
    if (onSelect) onSelect(suggestion);
    setShowSuggestions(false);
    setSelectedIndex(-1);
  };

  const handleFocus = () => {
    if (value && suggestions.length > 0 && userIsTyping) {
      setShowSuggestions(true);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      setUserIsTyping(false);
    }, 200);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        disabled={disabled}
        style={{ 
          width: '100%',
          padding: '10px 12px',
          fontSize: '14px',
          backgroundColor: 'var(--background-primary-alt)',
          color: 'var(--text-normal)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          boxSizing: 'border-box'
        }}
      />
      
      {showSuggestions && suggestions.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: 'var(--background-primary)',
          border: '1px solid var(--background-modifier-border)',
          borderRadius: '4px',
          maxHeight: '200px',
          overflowY: 'auto',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)'
        }}>
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion}
              ref={el => suggestionRefs.current[index] = el}
              onClick={() => selectSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
              style={{
                padding: '8px 12px',
                cursor: 'pointer',
                backgroundColor: index === selectedIndex 
                  ? 'var(--background-modifier-hover)' 
                  : 'transparent',
                fontSize: '14px',
                color: 'var(--text-normal)',
                fontFamily: 'var(--font-monospace)'
              }}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
      
      {isLoading && (
        <div style={{
          position: 'absolute',
          right: '12px',
          top: '50%',
          transform: 'translateY(-50%)',
          fontSize: '12px',
          color: 'var(--text-muted)'
        }}>
          Loading...
        </div>
      )}
    </div>
  );
}

return { NoteLinkModal };
```

# ColorPicker

```jsx
// components/ColorPicker.jsx - With custom color delete functionality
const { COLOR_PALETTE, DEFAULT_COLOR } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "colorOperations"));

const ColorPicker = ({ 
  isOpen, 
  selectedColor, 
  onColorSelect, 
  onClose, 
  onReset,
  customColors = [],
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  title = 'Color',
  position = 'below', // 'below' or 'above'
  opacity = 1,  // Current opacity value (0-1), optional
  onOpacityChange = null  // Callback when opacity changes, optional
}) => {
  const [previewColor, setPreviewColor] = dc.useState(null);
  const [deleteTargetId, setDeleteTargetId] = dc.useState(null);
  const colorInputRef = dc.useRef(null);
  const longPressTimerRef = dc.useRef(null);
  
  if (!isOpen) return null;
  
  // Prevent clicks inside picker from closing it
  const handlePickerClick = (e) => {
    e.stopPropagation();
  };
  
  // Prevent touch events from propagating to canvas (which would trigger panning)
  const handlePickerTouch = (e) => {
    e.stopPropagation();
  };
  
  const handleColorClick = (colorHex) => {
    onColorSelect(colorHex);
  };
  
  const handleReset = (e) => {
    e.stopPropagation();
    onReset();
  };
  
  // Handle live color preview
  const handleColorInput = (e) => {
    setPreviewColor(e.target.value);
    if (pendingCustomColorRef) {
      pendingCustomColorRef.current = e.target.value;
    }
  };
  
  // When the color input loses focus, SAVE THE PREVIEW
  const handleColorBlur = (e) => {
    if (previewColor && onAddCustomColor) {
      // Convert preview to actual custom color
      onAddCustomColor(previewColor);
      onColorSelect(previewColor);
      setPreviewColor(null);
    }
  };
  
  // Handle click on the add button to show preview immediately
  const handleAddClick = () => {
    setPreviewColor('#888888');
  };
  
  // Handle right-click on custom color to show delete option
  const handleColorContextMenu = (e, colorDef) => {
    if (!colorDef.isCustom) return; // Only allow deleting custom colors
    e.preventDefault();
    e.stopPropagation();
    setDeleteTargetId(colorDef.id);
  };
  
  // Handle long-press start for touch devices
  const handleLongPressStart = (colorDef) => {
    if (!colorDef.isCustom) return;
    longPressTimerRef.current = setTimeout(() => {
      setDeleteTargetId(colorDef.id);
    }, 500); // 500ms for long press
  };
  
  // Handle long-press cancel
  const handleLongPressCancel = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };
  
  // Handle delete button click
  const handleDeleteClick = (e, colorId) => {
    e.preventDefault();
    e.stopPropagation();
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
    setDeleteTargetId(null);
  };
  
  // Close delete UI when clicking elsewhere
  dc.useEffect(() => {
    if (deleteTargetId) {
      const handleClickOutside = () => {
        setDeleteTargetId(null);
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [deleteTargetId]);
  
  // Combine all colors into a single array for rendering
  const allColors = [
    { id: 'reset', color: null, label: 'Reset to default', isReset: true },
    ...COLOR_PALETTE,
    ...customColors.map(c => ({ ...c, isCustom: true })),
    // Add preview color if one exists
    ...(previewColor ? [{
      id: 'preview',
      color: previewColor,
      label: 'Selecting...',
      isPreview: true
    }] : []),
    { id: 'add-custom', color: null, label: 'Add custom color', isAddButton: true }
  ];
  
  return (
    <div 
      className="dmt-color-picker" 
      onClick={handlePickerClick}
      onTouchStart={handlePickerTouch}
      onTouchMove={handlePickerTouch}
      onTouchEnd={handlePickerTouch}
      style={{
        position: 'absolute',
        ...(position === 'above' 
          ? { bottom: 'calc(100% + 8px)', top: 'auto' }
          : { top: 'calc(100% + 8px)' }
        ),
        left: '0',
        zIndex: 1501
      }}
    >
      <div className="dmt-color-picker-header">
        <span className="dmt-color-picker-title">{title}</span>
      </div>
      
      <div className="dmt-color-grid">
        {allColors.map(colorDef => {
          if (colorDef.isReset) {
            return (
              <button
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-reset"
                onClick={handleReset}
                title={colorDef.label}
              >
                <dc.Icon icon="lucide-circle-x" />
              </button>
            );
          } else if (colorDef.isPreview) {
            // Render preview color swatch
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-preview"
                style={{ backgroundColor: colorDef.color }}
                title={colorDef.label}
              >
                <span className="dmt-color-preview-spinner">
                  <dc.Icon icon="lucide-loader" />
                </span>
              </div>
            );
          } else if (colorDef.isAddButton) {
            // Add button with hidden color input
            return (
              <div
                key={colorDef.id}
                className="dmt-color-swatch dmt-color-swatch-add"
                title={colorDef.label}
                onClick={handleAddClick}
              >
                <input
                  ref={colorInputRef}
                  type="color"
                  className="dmt-color-input-as-button"
                  onInput={handleColorInput}
                  onBlur={handleColorBlur}
                  defaultValue={selectedColor || '#ffffff'}
                  aria-label="Add custom color"
                />
                <span className="dmt-color-add-icon-overlay">+</span>
              </div>
            );
          } else {
            // Regular color swatch with optional delete button
            const isShowingDelete = deleteTargetId === colorDef.id;
            
            return (
              <div key={colorDef.id} style={{ position: 'relative', display: 'inline-block' }}>
                <button
                  className={`dmt-color-swatch ${selectedColor === colorDef.color ? 'dmt-color-swatch-selected' : ''}`}
                  style={{ backgroundColor: colorDef.color }}
                  onClick={() => handleColorClick(colorDef.color)}
                  onContextMenu={(e) => handleColorContextMenu(e, colorDef)}
                  onTouchStart={() => handleLongPressStart(colorDef)}
                  onTouchEnd={handleLongPressCancel}
                  onTouchMove={handleLongPressCancel}
                  onMouseDown={colorDef.isCustom ? handleLongPressCancel : undefined}
                  title={colorDef.label}
                >
                  {selectedColor === colorDef.color && (
                    <span className="dmt-color-checkmark">            
                    <dc.Icon icon="lucide-check" />
                    </span>
                  )}
                </button>
                
                {isShowingDelete && colorDef.isCustom && (
                  <div
                    className="dmt-color-delete-button"
                    onClick={(e) => handleDeleteClick(e, colorDef.id)}
                    onMouseDown={(e) => e.stopPropagation()}
                    title="Delete custom color"
                  >
                    <dc.Icon icon="lucide-trash-2" />
                  </div>
                )}
              </div>
            );
          }
        })}
      </div>
      
      {/* Opacity slider - only show when onOpacityChange is provided */}
      {onOpacityChange && (
        <div className="dmt-color-opacity-section">
          <div className="dmt-color-opacity-header">
            <span className="dmt-color-opacity-label">Opacity</span>
            <span className="dmt-color-opacity-value">{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round(opacity * 100)}
            onChange={(e) => onOpacityChange(parseInt(e.target.value, 10) / 100)}
            className="dmt-color-opacity-slider"
          />
        </div>
      )}
    </div>
  );
};

return { ColorPicker };
```

# SelectionToolbar

```jsx
/**
 * SelectionToolbar.jsx
 * 
 * Unified toolbar component that appears below (or above) selected objects/text labels.
 * Consolidates all action buttons into a single horizontal toolbar with context-aware buttons.
 */

const { calculateObjectScreenPosition } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "screenPositionUtils"));
const { openNoteInNewTab } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "noteOperations"));
const { ColorPicker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ColorPicker"));

/**
 * Calculate bounding box for a text label in screen coordinates
 */
function calculateTextLabelBounds(label, canvasRef, mapData) {
  if (!label || !canvasRef.current || !mapData) return null;
  
  const canvas = canvasRef.current;
  const { gridSize, viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  const scaledGridSize = gridSize * zoom;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const offsetX = centerX - center.x * scaledGridSize;
  const offsetY = centerY - center.y * scaledGridSize;
  
  // Get label position in screen space
  let screenX = offsetX + label.position.x * zoom;
  let screenY = offsetY + label.position.y * zoom;
  
  // Apply canvas rotation if present
  if (northDirection !== 0) {
    const relX = screenX - centerX;
    const relY = screenY - centerY;
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
    const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
    screenX = centerX + rotatedX;
    screenY = centerY + rotatedY;
  }
  
  // Measure text to get bounding box
  const ctx = canvas.getContext('2d');
  const fontSize = label.fontSize * zoom;
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(label.content);
  const textWidth = metrics.width;
  const textHeight = fontSize * 1.2;
  
  // Calculate rotated bounding box for the label itself
  const labelAngle = ((label.rotation || 0) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(labelAngle));
  const sin = Math.abs(Math.sin(labelAngle));
  const rotatedWidth = textWidth * cos + textHeight * sin;
  const rotatedHeight = textWidth * sin + textHeight * cos;
  
  // Account for canvas position within container
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvas.parentElement.getBoundingClientRect();
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  // Selection box padding
  const paddingX = 4;
  const paddingY = 2;
  
  return {
    screenX: (screenX * scaleX) + canvasOffsetX,
    screenY: (screenY * scaleY) + canvasOffsetY,
    width: (rotatedWidth + paddingX * 2) * scaleX,
    height: (rotatedHeight + paddingY * 2) * scaleY
  };
}

/**
 * SelectionToolbar Component
 */
const SelectionToolbar = ({
  // Selection info
  selectedItem,
  mapData,
  canvasRef,
  containerRef,
  geometry,
  
  // Object-specific handlers
  onRotate,
  onLabel,
  onLinkNote,
  onColorClick,
  onResize,
  onDelete,
  onScaleChange,  // NEW: handler for scale slider
  
  // Text-specific handlers
  onEdit,
  
  // State
  isResizeMode,
  showColorPicker,
  
  // Color picker props
  currentColor,
  onColorSelect,
  onColorPickerClose,
  onColorReset,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  pendingCustomColorRef,
  colorButtonRef
}) => {
  // Don't render if no selection or missing dependencies
  if (!selectedItem || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }
  
  const isObject = selectedItem.type === 'object';
  const isText = selectedItem.type === 'text';
  
  // Calculate selection bounding box based on type
  let bounds = null;
  
  if (isObject) {
    const object = mapData.objects?.find(obj => obj.id === selectedItem.id);
    if (!object) return null;
    
    const pos = calculateObjectScreenPosition(object, canvasRef.current, mapData, geometry);
    if (!pos) return null;
    
    bounds = {
      screenX: pos.screenX,
      screenY: pos.screenY,
      width: pos.objectWidth,
      height: pos.objectHeight
    };
  } else if (isText) {
    const label = mapData.textLabels?.find(l => l.id === selectedItem.id);
    if (!label) return null;
    
    bounds = calculateTextLabelBounds(label, canvasRef, mapData);
    if (!bounds) return null;
  }
  
  if (!bounds) return null;
  
  // Calculate toolbar dimensions
  const buttonSize = 44;
  const buttonGap = 4;
  const toolbarGap = 4; // Gap between selection and toolbar
  
  // Count buttons for this selection type
  let buttonCount = 0;
  if (isObject) {
    buttonCount = 6; // Rotate, Label, Link Note, Color, Resize, Delete
    // Hide label button for note_pin objects
    if (selectedItem.data?.type === 'note_pin') {
      buttonCount = 5;
    }
  } else if (isText) {
    buttonCount = 3; // Edit, Rotate, Delete
  }
  
  const toolbarWidth = buttonCount * buttonSize + (buttonCount - 1) * buttonGap;
  const toolbarHeight = buttonSize;
  
  // Get container bounds for edge detection
  const containerRect = containerRef.current.getBoundingClientRect();
  const containerHeight = containerRect.height;
  
  // Calculate linked note display height (if applicable)
  const hasLinkedNote = isObject && selectedItem.data?.linkedNote && typeof selectedItem.data.linkedNote === 'string';
  const linkedNoteHeight = hasLinkedNote ? 32 : 0; // Approximate height of note display
  const linkedNoteGap = hasLinkedNote ? 4 : 0;
  
  // Calculate total height needed below selection
  const totalHeightBelow = toolbarGap + toolbarHeight + linkedNoteGap + linkedNoteHeight;
  
  // Selection box edges
  const selectionBottom = bounds.screenY + bounds.height / 2;
  const selectionTop = bounds.screenY - bounds.height / 2;
  
  // Determine if we need to flip above
  const spaceBelow = containerHeight - selectionBottom;
  const shouldFlipAbove = spaceBelow < totalHeightBelow + 20; // 20px margin
  
  // Calculate toolbar position
  let toolbarX = bounds.screenX - toolbarWidth / 2;
  let toolbarY;
  let linkedNoteY;
  
  if (shouldFlipAbove) {
    // Position above: Linked Note (top) Ã¢â€ â€™ Toolbar Ã¢â€ â€™ Selection (bottom)
    toolbarY = selectionTop - toolbarGap - toolbarHeight;
    linkedNoteY = toolbarY - linkedNoteGap - linkedNoteHeight;
  } else {
    // Position below: Selection (top) Ã¢â€ â€™ Toolbar Ã¢â€ â€™ Linked Note (bottom)
    toolbarY = selectionBottom + toolbarGap;
    linkedNoteY = toolbarY + toolbarHeight + linkedNoteGap;
  }
  
  // Clamp horizontal position to container bounds
  const minX = 4;
  const maxX = containerRect.width - toolbarWidth - 4;
  toolbarX = Math.max(minX, Math.min(maxX, toolbarX));
  
  // During resize mode, show scale slider instead of action buttons
  if (isResizeMode && isObject) {
    // Read scale from actual object in mapData, not from selectedItem.data which may be stale
    const actualObject = mapData.objects?.find(obj => obj.id === selectedItem.id);
    const currentScale = actualObject?.scale ?? 1.0;
    const sliderWidth = 140;
    const sliderHeight = 36;
    const sliderGap = 8;
    
    // Position slider above the selection
    const sliderX = bounds.screenX - sliderWidth / 2;
    const sliderY = selectionTop - sliderGap - sliderHeight;
    
    // Clamp horizontal position
    const clampedSliderX = Math.max(4, Math.min(containerRect.width - sliderWidth - 4, sliderX));
    
    return (
      <div 
        className="dmt-scale-slider-container"
        style={{
          position: 'absolute',
          left: `${clampedSliderX}px`,
          top: `${sliderY}px`,
          width: `${sliderWidth}px`,
          height: `${sliderHeight}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        <div className="dmt-scale-slider-inner">
          <dc.Icon icon="lucide-scaling" size={14} />
          <input
            type="range"
            className="dmt-scale-slider"
            min="25"
            max="130"
            step="5"
            value={Math.round(currentScale * 100)}
            onInput={(e) => {
              const newScale = parseInt(e.target.value) / 100;
              onScaleChange?.(newScale);
            }}
            title={`Scale: ${Math.round(currentScale * 100)}%`}
          />
          <span className="dmt-scale-value">{Math.round(currentScale * 100)}%</span>
        </div>
      </div>
    );
  }
  
  // Don't show toolbar during resize mode for non-objects
  if (isResizeMode) {
    return null;
  }
  
  return (
    <>
      {/* Linked Note Display (for objects with linked notes) */}
      {hasLinkedNote && (
        <div 
          className="dmt-selection-linked-note"
          style={{
            position: 'absolute',
            left: `${bounds.screenX}px`,
            top: `${linkedNoteY}px`,
            transform: 'translateX(-50%)',
            pointerEvents: 'auto',
            zIndex: 150
          }}
        >
          <div className="dmt-note-display-link">
            <dc.Icon icon="lucide-scroll-text" />
            <dc.Link 
              link={dc.resolvePath(selectedItem.data.linkedNote.replace(/\.md$/, ''))}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openNoteInNewTab(selectedItem.data.linkedNote);
              }}
            />
            <dc.Icon icon="lucide-external-link" />
          </div>
        </div>
      )}
      
      {/* Toolbar */}
      <div 
        className="dmt-selection-toolbar"
        style={{
          position: 'absolute',
          left: `${toolbarX}px`,
          top: `${toolbarY}px`,
          pointerEvents: 'auto',
          zIndex: 150
        }}
      >
        {/* Object buttons */}
        {isObject && (
          <>
            {/* Rotate */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onRotate) onRotate(e);
              }}
              title="Rotate 90Ã‚Â° (or press R)"
            >
              <dc.Icon icon="lucide-rotate-cw" />
            </button>
            
            {/* Label (not for note_pin) */}
            {selectedItem.data?.type !== 'note_pin' && (
              <button
                className="dmt-toolbar-button"
                onClick={(e) => {
                  if (onLabel) onLabel(e);
                }}
                title="Add/Edit Label"
              >
                <dc.Icon icon="lucide-sticky-note" />
              </button>
            )}
            
            {/* Link Note */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onLinkNote) onLinkNote(e);
              }}
              title={selectedItem.data?.linkedNote ? "Edit linked note" : "Link note"}
            >
              <dc.Icon icon="lucide-scroll-text" />
            </button>
            
            {/* Color */}
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button
                ref={colorButtonRef}
                className="dmt-toolbar-button dmt-toolbar-color-button"
                onClick={(e) => {
                  if (onColorClick) onColorClick(e);
                }}
                title="Change Object Color"
                style={{
                  backgroundColor: currentColor || '#ffffff'
                }}
              >
                <dc.Icon icon="lucide-palette" />
              </button>
              
              {showColorPicker && (
                <ColorPicker
                  isOpen={showColorPicker}
                  selectedColor={currentColor || '#ffffff'}
                  onColorSelect={onColorSelect}
                  onClose={onColorPickerClose}
                  onReset={onColorReset}
                  customColors={customColors || []}
                  onAddCustomColor={onAddCustomColor}
                  onDeleteCustomColor={onDeleteCustomColor}
                  pendingCustomColorRef={pendingCustomColorRef}
                  title="Object Color"
                  position="above"
                />
              )}
            </div>
            
            {/* Resize */}
            <button
              className="dmt-toolbar-button"
              onClick={(e) => {
                if (onResize) onResize(e);
              }}
              title="Resize Object"
            >
              <dc.Icon icon="lucide-scaling" />
            </button>
            
            {/* Delete */}
            <button
              className="dmt-toolbar-button dmt-toolbar-delete-button"
              onClick={(e) => {
                if (onDelete) onDelete(e);
              }}
              title="Delete (or press Delete/Backspace)"
            >
              <dc.Icon icon="lucide-trash-2" />
            </button>
          </>
        )}
        
        {/* Text label buttons */}
        {isText && (
          <>
            {/* Edit */}
            <button
              className="dmt-toolbar-button"
              onClick={onEdit}
              title="Edit Text Label"
            >
              <dc.Icon icon="lucide-pencil" />
            </button>
            
            {/* Rotate */}
            <button
              className="dmt-toolbar-button"
              onClick={onRotate}
              title="Rotate 90Ã‚Â° (or press R)"
            >
              <dc.Icon icon="lucide-rotate-cw" />
            </button>
            
            {/* Delete */}
            <button
              className="dmt-toolbar-button dmt-toolbar-delete-button"
              onClick={onDelete}
              title="Delete (or press Delete/Backspace)"
            >
              <dc.Icon icon="lucide-trash-2" />
            </button>
          </>
        )}
      </div>
    </>
  );
};

return { SelectionToolbar };
```

# ObjectLayer

```jsx
/**
 * ObjectLayer.jsx
 * Handles all object-related interactions:
 * - Object placement
 * - Object selection and dragging
 * - Object resizing
 * - Object color and notes
 * - Hover tooltips
 */

const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));
const { useObjectInteractions } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useObjectInteractions"));
const { TextInputModal } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "TextInputModal"));
const { NoteLinkModal } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "NoteLinkModal"));
const { SelectionToolbar } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "SelectionToolbar"));
const { calculateObjectScreenPosition } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "screenPositionUtils"));

/**
 * ObjectLayer Component
 * 
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 * @param {Function} onObjectsChange - Callback when objects change
 * @param {Array} customColors - Array of custom colors
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Function} onDeleteCustomColor - Callback to delete custom color
 */
const ObjectLayer = ({ 
  currentTool,
  selectedObjectType,
  onObjectsChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  // Get shared state from Context
  const { canvasRef, containerRef, mapData, geometry, screenToGrid, screenToWorld, getClientCoords, GridGeometry } = useMapState();
  const { getObjectAtPosition, addObject, updateObject, removeObject, isAreaFree, onObjectsChange: contextOnObjectsChange } = useMapOperations();
  const { 
    selectedItem, setSelectedItem, 
    isDraggingSelection, setIsDraggingSelection, 
    dragStart, setDragStart, 
    isResizeMode, setIsResizeMode,
    hoveredObject, setHoveredObject,
    mousePosition, setMousePosition,
    showNoteLinkModal, setShowNoteLinkModal,
    editingNoteObjectId, setEditingNoteObjectId,
    showCoordinates,
    layerVisibility
  } = useMapSelection();
  
  // Object note modal state
  const [showNoteModal, setShowNoteModal] = dc.useState(false);
  const [editingObjectId, setEditingObjectId] = dc.useState(null);
  
  // Object color picker state
  const [showObjectColorPicker, setShowObjectColorPicker] = dc.useState(false);
  
  // Handle object scale change from slider
  const handleScaleChange = dc.useCallback((newScale) => {
    if (!selectedItem || selectedItem.type !== 'object' || !mapData?.objects) return;
    
    const updatedObjects = updateObject(mapData.objects, selectedItem.id, { scale: newScale });
    contextOnObjectsChange(updatedObjects);
    
    // Update selected item data
    const updatedObject = updatedObjects.find(obj => obj.id === selectedItem.id);
    if (updatedObject) {
      setSelectedItem({ ...selectedItem, data: updatedObject });
    }
  }, [selectedItem, mapData, updateObject, contextOnObjectsChange, setSelectedItem]);
  
  // Note link modal state is now from MapSelectionContext (shared with NotePinLayer)
  
  // Use object interactions hook (optimized - gets most values from Context)
  const {
    isResizing,
    resizeCorner,
    objectColorBtnRef,
    pendingObjectCustomColorRef,
    edgeSnapMode,
    setEdgeSnapMode,
    longPressTimerRef,
    handleObjectPlacement,
    handleObjectSelection,
    handleObjectDragging,
    handleObjectResizing,
    handleObjectWheel,
    handleHoverUpdate,
    stopObjectDragging,
    stopObjectResizing,
    handleObjectKeyDown,
    handleObjectRotation,
    handleObjectDeletion,
    handleNoteSubmit,
    handleObjectColorSelect,
    handleObjectColorReset,
    getClickedCorner
  } = useObjectInteractions(
    currentTool,
    selectedObjectType,
    onAddCustomColor,
    customColors
  );
  
  // Register object handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register object handlers when they change
  dc.useEffect(() => {
    registerHandlers('object', {
      // Placement and selection
      handleObjectPlacement,
      handleObjectSelection,
      // Dragging and resizing
      handleObjectDragging,
      handleObjectResizing,
      stopObjectDragging,
      stopObjectResizing,
      // Hover updates
      handleHoverUpdate,
      // Wheel for scaling
      handleObjectWheel,
      // Keyboard handling
      handleObjectKeyDown,
      // State for coordination
      isResizing,
      resizeCorner,
      edgeSnapMode,
      setEdgeSnapMode
    });
    
    return () => unregisterHandlers('object');
  }, [
    registerHandlers, unregisterHandlers,
    handleObjectPlacement, handleObjectSelection,
    handleObjectDragging, handleObjectResizing,
    stopObjectDragging, stopObjectResizing,
    handleHoverUpdate, handleObjectWheel, handleObjectKeyDown,
    isResizing, resizeCorner,
    edgeSnapMode, setEdgeSnapMode
  ]);
  
  // Handle opening note modal
  const handleNoteButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setEditingObjectId(selectedItem.id);
      setShowNoteModal(true);
    }
  };
  
  // Handle resize button click
  const handleResizeButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setIsResizeMode(true);
    }
  };
  
  // Handle note modal submit
  const handleNoteModalSubmit = (content) => {
    handleNoteSubmit(content, editingObjectId);
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Handle note modal cancel
  const handleNoteCancel = () => {
    setShowNoteModal(false);
    setEditingObjectId(null);
  };
  
  // Handle object color picker button click
  const handleObjectColorButtonClick = (e) => {
    if (selectedItem?.type === 'object') {
      e.preventDefault();
      e.stopPropagation();
      setShowObjectColorPicker(!showObjectColorPicker);
    }
  };
  
  // Handle object color picker close
  const handleObjectColorPickerClose = () => {
    setShowObjectColorPicker(false);
  };
  
  // Handle object color reset (wrapper)
  const handleObjectColorResetWrapper = () => {
    handleObjectColorReset(setShowObjectColorPicker);
  };
  
  // Handle edit note link button click
  const handleEditNoteLink = (objectId) => {
    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };
  
  // Handle note link save
  const handleNoteLinkSave = (notePath) => {
    if (!mapData || !editingNoteObjectId) return;
    
    const updatedObjects = mapData.objects.map(obj => {
      if (obj.id === editingNoteObjectId) {
        return { ...obj, linkedNote: notePath };
      }
      return obj;
    });
    
    onObjectsChange(updatedObjects);
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };
  
  // Handle note link cancel
  const handleNoteLinkCancel = () => {
    setShowNoteLinkModal(false);
    setEditingNoteObjectId(null);
  };
  
  // Close object color picker when clicking outside
  dc.useEffect(() => {
    if (showObjectColorPicker) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-object-color-button');
        
        if (!pickerElement && !buttonElement) {
          if (pendingObjectCustomColorRef.current && onAddCustomColor) {
            onAddCustomColor(pendingObjectCustomColorRef.current);
            handleObjectColorSelect(pendingObjectCustomColorRef.current);
            pendingObjectCustomColorRef.current = null;
          }
          
          handleObjectColorPickerClose();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [showObjectColorPicker]);
  
  // Hide object UI when coordinate overlay is visible or objects layer is hidden
  if (showCoordinates || !layerVisibility.objects) {
    return null;
  }
  
  // Calculate positions for cardinal direction indicators
  const getCardinalIndicatorPositions = (selectedObject) => {
    if (!selectedObject || !canvasRef.current || !containerRef.current || !mapData) {
      return null;
    }
    
    const screenPos = calculateObjectScreenPosition(
      selectedObject, 
      canvasRef.current, 
      mapData, 
      geometry
    );
    
    if (!screenPos) return null;
    
    const { screenX, screenY, objectWidth, objectHeight } = screenPos;
    const indicatorSize = 12; // Size of arrow indicators
    const gap = 6; // Gap between object edge and indicator
    
    // screenX/screenY are the CENTER of the object
    // Position arrows just outside the object bounds
    return {
      north: { 
        x: screenX - indicatorSize/2, 
        y: screenY - objectHeight/2 - gap - indicatorSize 
      },
      south: { 
        x: screenX - indicatorSize/2, 
        y: screenY + objectHeight/2 + gap 
      },
      east: { 
        x: screenX + objectWidth/2 + gap, 
        y: screenY - indicatorSize/2 
      },
      west: { 
        x: screenX - objectWidth/2 - gap - indicatorSize, 
        y: screenY - indicatorSize/2 
      }
    };
  };
  
  const selectedObject = selectedItem?.type === 'object' && mapData?.objects 
    ? mapData.objects.find(obj => obj.id === selectedItem.id)
    : null;
  
  const indicatorPositions = edgeSnapMode && selectedObject && mapData?.mapType !== 'hex'
    ? getCardinalIndicatorPositions(selectedObject)
    : null;
  
  // Render object-specific UI
  return (
    <>
      {/* Edge Snap Mode Indicators - positioned directly like SelectionToolbar */}
      {edgeSnapMode && selectedItem?.type === 'object' && indicatorPositions && (
        <>
          {/* North indicator */}
          <div 
            className="dmt-edge-snap-indicator north"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.north.x}px`,
              top: `${indicatorPositions.north.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderBottom: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* South indicator */}
          <div 
            className="dmt-edge-snap-indicator south"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.south.x}px`,
              top: `${indicatorPositions.south.y}px`,
              width: 0,
              height: 0,
              borderLeft: '6px solid transparent',
              borderRight: '6px solid transparent',
              borderTop: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* East indicator */}
          <div 
            className="dmt-edge-snap-indicator east"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.east.x}px`,
              top: `${indicatorPositions.east.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderLeft: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
          {/* West indicator */}
          <div 
            className="dmt-edge-snap-indicator west"
            style={{
              position: 'absolute',
              left: `${indicatorPositions.west.x}px`,
              top: `${indicatorPositions.west.y}px`,
              width: 0,
              height: 0,
              borderTop: '6px solid transparent',
              borderBottom: '6px solid transparent',
              borderRight: '8px solid var(--interactive-accent, #4a9eff)',
              filter: 'drop-shadow(0 0 3px var(--interactive-accent, #4a9eff))',
              pointerEvents: 'none',
              zIndex: 1000
            }}
          />
        </>
      )}
      
      {/* Selection Toolbar for objects - only render when an object is selected and not dragging */}
      {selectedItem?.type === 'object' && !isDraggingSelection && (
        <SelectionToolbar
          selectedItem={selectedItem}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          
          // Object handlers
          onRotate={handleObjectRotation}
          onLabel={handleNoteButtonClick}
          onLinkNote={() => handleEditNoteLink(selectedItem?.id)}
          onColorClick={handleObjectColorButtonClick}
          onResize={handleResizeButtonClick}
          onDelete={handleObjectDeletion}
          onScaleChange={handleScaleChange}
          
          // State
          isResizeMode={isResizeMode}
          showColorPicker={showObjectColorPicker}
          
          // Color picker props
          currentColor={selectedItem?.data?.color}
          onColorSelect={handleObjectColorSelect}
          onColorPickerClose={handleObjectColorPickerClose}
          onColorReset={handleObjectColorResetWrapper}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          pendingCustomColorRef={pendingObjectCustomColorRef}
          colorButtonRef={objectColorBtnRef}
        />
      )}
      
      {/* Object note modal */}
      {showNoteModal && editingObjectId && mapData && (
        <TextInputModal
          onSubmit={handleNoteModalSubmit}
          onCancel={handleNoteCancel}
          title={`Note for ${mapData.objects.find(obj => obj.id === editingObjectId)?.label || 'Object'}`}
          placeholder="Add a custom note..."
          initialValue={mapData.objects.find(obj => obj.id === editingObjectId)?.customTooltip || ''}
        />
      )}
      
      {/* Note Link Modal */}
      {showNoteLinkModal && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.linkedNote || null
              : null
          }
          objectType={
            editingNoteObjectId
              ? mapData.objects?.find(obj => obj.id === editingNoteObjectId)?.type || null
              : null
          }
        />
      )}
      
      {/* Hover tooltips for objects */}
      {hoveredObject && mousePosition && hoveredObject.type !== 'note_pin' && (
        <div 
          className="dmt-object-tooltip"
          style={{
            position: 'absolute',
            left: mousePosition.x + 20,
            top: mousePosition.y + 25,
            pointerEvents: 'none',
            zIndex: 1000
          }}
        >
          {hoveredObject.customTooltip 
            ? `${hoveredObject.label} - ${hoveredObject.customTooltip}`
            : hoveredObject.label
          }
        </div>
      )}
    </>
  );
};

// Datacore export
return { ObjectLayer };
```

# edgeOperations

```js
/**
 * edgeOperations.js
 * 
 * Pure functions for edge manipulation in grid maps.
 * Edges represent painted grid lines between cells.
 * 
 * EDGE DATA STRUCTURE:
 * {
 *   id: string,      // Unique identifier
 *   x: number,       // Cell x coordinate
 *   y: number,       // Cell y coordinate
 *   side: string,    // 'top' | 'right' | 'bottom' | 'left'
 *   color: string    // Hex color code
 * }
 * 
 * NORMALIZATION:
 * Each physical edge between two cells has two possible representations:
 * - "right edge of cell (5,3)" === "left edge of cell (6,3)"
 * - "bottom edge of cell (5,3)" === "top edge of cell (5,4)"
 * 
 * To avoid duplicates, we normalize to always use 'right' and 'bottom' sides:
 * - 'left' edges become 'right' edges of the cell to the left (x-1)
 * - 'top' edges become 'bottom' edges of the cell above (y-1)
 */

/**
 * Normalize edge to canonical representation.
 * Converts 'left' to 'right' of adjacent cell, 'top' to 'bottom' of adjacent cell.
 * This ensures each physical edge has exactly one storage representation.
 * 
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - 'top' | 'right' | 'bottom' | 'left'
 * @returns {{ x: number, y: number, side: string }} Normalized edge coordinates
 */
function normalizeEdge(x, y, side) {
  switch (side) {
    case 'left':
      // Left edge of (x,y) = Right edge of (x-1,y)
      return { x: x - 1, y, side: 'right' };
    case 'top':
      // Top edge of (x,y) = Bottom edge of (x,y-1)
      return { x, y: y - 1, side: 'bottom' };
    default:
      // 'right' and 'bottom' are already canonical
      return { x, y, side };
  }
}

/**
 * Generate unique edge ID
 * @returns {string} Unique identifier for edge
 */
function generateEdgeId() {
  return 'edge-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

/**
 * Find edge at position (handles normalization internally)
 * @param {Array} edges - Edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @returns {Object|null} Edge object if found, null otherwise
 */
function getEdgeAt(edges, x, y, side) {
  if (!edges || !Array.isArray(edges)) return null;
  
  const normalized = normalizeEdge(x, y, side);
  return edges.find(e => 
    e.x === normalized.x && 
    e.y === normalized.y && 
    e.side === normalized.side
  ) || null;
}

/**
 * Add edge or update color if edge already exists
 * @param {Array} edges - Current edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @param {string} color - Edge color (hex code)
 * @param {number} opacity - Edge opacity (0-1, optional, defaults to 1)
 * @returns {Array} New edges array with added/updated edge
 */
function addEdge(edges, x, y, side, color, opacity = 1) {
  // Validate inputs - return unchanged array if invalid
  if (typeof x !== 'number' || typeof y !== 'number' || !side || !color) {
    return edges || [];
  }
  
  const edgeArray = edges || [];
  const normalized = normalizeEdge(x, y, side);
  const existing = getEdgeAt(edgeArray, x, y, side);
  
  if (existing) {
    // Update existing edge color and opacity
    return edgeArray.map(e => 
      e.id === existing.id ? { ...e, color, opacity } : e
    );
  }
  
  // Add new edge
  return [...edgeArray, {
    id: generateEdgeId(),
    x: normalized.x,
    y: normalized.y,
    side: normalized.side,
    color,
    opacity
  }];
}

/**
 * Remove edge at position
 * @param {Array} edges - Current edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @param {string} side - Edge side ('top' | 'right' | 'bottom' | 'left')
 * @returns {Array} New edges array without the specified edge
 */
function removeEdge(edges, x, y, side) {
  if (!edges || !Array.isArray(edges)) return [];
  
  const normalized = normalizeEdge(x, y, side);
  return edges.filter(e => 
    !(e.x === normalized.x && 
      e.y === normalized.y && 
      e.side === normalized.side)
  );
}

/**
 * Remove edge by ID
 * @param {Array} edges - Current edges array
 * @param {string} edgeId - Edge ID to remove
 * @returns {Array} New edges array without the specified edge
 */
function removeEdgeById(edges, edgeId) {
  if (!edges || !Array.isArray(edges)) return [];
  return edges.filter(e => e.id !== edgeId);
}

/**
 * Update edge properties by ID
 * @param {Array} edges - Current edges array
 * @param {string} edgeId - Edge ID to update
 * @param {Object} updates - Properties to update
 * @returns {Array} New edges array with updated edge
 */
function updateEdge(edges, edgeId, updates) {
  if (!edges || !Array.isArray(edges)) return [];
  
  return edges.map(e => {
    if (e.id === edgeId) {
      return { ...e, ...updates };
    }
    return e;
  });
}

/**
 * Generate edges for a horizontal or vertical line between two intersection points
 * Used for the edge line tool to paint multiple edges at once.
 * 
 * Intersection points are at grid corners (where 4 cells meet).
 * - A vertical line from (x, y1) to (x, y2) paints 'right' edges of column x-1
 * - A horizontal line from (x1, y) to (x2, y) paints 'bottom' edges of row y-1
 * 
 * @param {number} startX - Start intersection x coordinate
 * @param {number} startY - Start intersection y coordinate
 * @param {number} endX - End intersection x coordinate
 * @param {number} endY - End intersection y coordinate
 * @param {string} color - Edge color (hex code)
 * @returns {Array} Array of edge objects (without IDs - add IDs when merging)
 */
function generateEdgeLine(startX, startY, endX, endY, color) {
  const result = [];
  
  if (startX === endX) {
    // Vertical line at intersection column startX
    // This paints the 'right' edges of cells in column (startX - 1)
    const minY = Math.min(startY, endY);
    const maxY = Math.max(startY, endY);
    const cellX = startX - 1; // The cell column whose right edges we're painting
    
    // Paint edges from minY to maxY-1 (edges between intersections)
    for (let y = minY; y < maxY; y++) {
      const normalized = normalizeEdge(cellX, y, 'right');
      result.push({ 
        x: normalized.x, 
        y: normalized.y, 
        side: normalized.side, 
        color 
      });
    }
  } else if (startY === endY) {
    // Horizontal line at intersection row startY
    // This paints the 'bottom' edges of cells in row (startY - 1)
    const minX = Math.min(startX, endX);
    const maxX = Math.max(startX, endX);
    const cellY = startY - 1; // The cell row whose bottom edges we're painting
    
    // Paint edges from minX to maxX-1 (edges between intersections)
    for (let x = minX; x < maxX; x++) {
      const normalized = normalizeEdge(x, cellY, 'bottom');
      result.push({ 
        x: normalized.x, 
        y: normalized.y, 
        side: normalized.side, 
        color 
      });
    }
  }
  // If neither same x nor same y, return empty (diagonal not supported)
  
  return result;
}

/**
 * Merge new edges into existing edges array
 * Handles duplicates by updating color of existing edges.
 * 
 * @param {Array} edges - Current edges array
 * @param {Array} newEdges - Edges to add (from generateEdgeLine, without IDs)
 * @returns {Array} Merged edges array
 */
function mergeEdges(edges, newEdges) {
  let result = [...(edges || [])];
  
  for (const edge of newEdges) {
    result = addEdge(result, edge.x, edge.y, edge.side, edge.color);
  }
  
  return result;
}

/**
 * Remove edges along a line between two intersection points
 * 
 * @param {Array} edges - Current edges array
 * @param {number} startX - Start intersection x coordinate
 * @param {number} startY - Start intersection y coordinate
 * @param {number} endX - End intersection x coordinate
 * @param {number} endY - End intersection y coordinate
 * @returns {Array} Edges array with line edges removed
 */
function removeEdgeLine(edges, startX, startY, endX, endY) {
  // Generate the edges that would be in this line (color doesn't matter for removal)
  const lineEdges = generateEdgeLine(startX, startY, endX, endY, null);
  
  let result = [...(edges || [])];
  for (const edge of lineEdges) {
    result = removeEdge(result, edge.x, edge.y, edge.side);
  }
  
  return result;
}

/**
 * Get all edges adjacent to a specific cell
 * Useful for highlighting or bulk operations.
 * 
 * @param {Array} edges - Edges array
 * @param {number} x - Cell x coordinate
 * @param {number} y - Cell y coordinate
 * @returns {Array} Edges touching this cell (may include edges "owned" by adjacent cells)
 */
function getEdgesForCell(edges, x, y) {
  if (!edges || !Array.isArray(edges)) return [];
  
  return edges.filter(e => {
    // Check if edge is one of the 4 edges of this cell
    // Right edge of (x,y)
    if (e.x === x && e.y === y && e.side === 'right') return true;
    // Bottom edge of (x,y)
    if (e.x === x && e.y === y && e.side === 'bottom') return true;
    // Left edge of (x,y) = Right edge of (x-1,y)
    if (e.x === x - 1 && e.y === y && e.side === 'right') return true;
    // Top edge of (x,y) = Bottom edge of (x,y-1)
    if (e.x === x && e.y === y - 1 && e.side === 'bottom') return true;
    
    return false;
  });
}

/**
 * Clear all edges from the array
 * @returns {Array} Empty array
 */
function clearAllEdges() {
  return [];
}

return {
  // Normalization
  normalizeEdge,
  
  // ID generation
  generateEdgeId,
  
  // Single edge operations
  getEdgeAt,
  addEdge,
  removeEdge,
  removeEdgeById,
  updateEdge,
  
  // Line operations (for edge line tool)
  generateEdgeLine,
  mergeEdges,
  removeEdgeLine,
  
  // Query operations
  getEdgesForCell,
  
  // Bulk operations
  clearAllEdges
};
```

# useDrawingTools

```js
/**
 * useDrawingTools.js
 * 
 * Custom hook for managing drawing tools (paint, rectangle, circle, clear area, edge paint).
 * Handles all drawing-related state and operations including:
 * - Paint tool (draw/erase) with cell tracking
 * - Edge paint tool for painting grid edges
 * - Rectangle drawing
 * - Circle drawing
 * - Clear area tool
 * - Batched history management for strokes
 */

const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { addEdge, removeEdge, getEdgeAt, generateEdgeLine, mergeEdges } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "edgeOperations"));
const { eraseObjectAt } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectOperations"));

/**
 * Hook for managing drawing tools
 * @param {string} currentTool - Current active tool
 * @param {string} selectedColor - Currently selected color
 * @param {number} selectedOpacity - Currently selected opacity (0-1)
 */
const useDrawingTools = (
  currentTool,
  selectedColor,
  selectedOpacity = 1
) => {
  // Get all required state and operations from Context
  const {
    geometry,
    canvasRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();
  
  const {
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    getTextLabelAtPosition,
    removeTextLabel,
    getObjectAtPosition,
    removeObjectAtPosition,
    removeObjectsInRectangle
  } = useMapOperations();
  
  // Drawing state
  const [isDrawing, setIsDrawing] = dc.useState(false);
  const [processedCells, setProcessedCells] = dc.useState(new Set());
  const [processedEdges, setProcessedEdges] = dc.useState(new Set()); // Track processed edges for edge paint
  const [rectangleStart, setRectangleStart] = dc.useState(null);
  const [circleStart, setCircleStart] = dc.useState(null);
  const [edgeLineStart, setEdgeLineStart] = dc.useState(null); // For edge line tool (two-click)
  
  // Track initial state at start of drag stroke for batched history
  // This allows immediate visual updates while creating a single undo entry
  const strokeInitialStateRef = dc.useRef(null);
  const strokeInitialEdgesRef = dc.useRef(null); // For edge strokes
  
  /**
   * Toggle a single cell (paint or erase)
   * Handles painting cells, erasing cells, objects, and text labels
   */
  const toggleCell = (coords, shouldFill, dragStart = null) => {
    if (!mapData || !geometry) return;
    
    // Check bounds for hex maps (only applies to hex geometry with bounds set)
    // Handle both coordinate formats: {gridX, gridY} from screenToGrid and {q, r} from cells
    const q = coords.q !== undefined ? coords.q : coords.gridX;
    const r = coords.r !== undefined ? coords.r : coords.gridY;
    
    if (geometry.isWithinBounds && !geometry.isWithinBounds(q, r)) {
      return; // Silently reject cells outside bounds
    }
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialStateRef.current !== null;
    
    const existingCellIndex = mapData.cells.findIndex(
      cell => geometry.cellMatchesCoords(cell, coords)
    );
    
    if (shouldFill) {
      if (existingCellIndex !== -1) {
        // Cell exists - update its color and opacity (paint over)
        const newCells = [...mapData.cells];
        newCells[existingCellIndex] = {
          ...newCells[existingCellIndex],
          color: selectedColor,
          opacity: selectedOpacity
        };
        onCellsChange(newCells, isBatchedStroke);
      } else {
        // Cell doesn't exist - create new with selected color and opacity
        const newCell = geometry.createCellObject(coords, selectedColor);
        newCell.opacity = selectedOpacity;
        const newCells = [...mapData.cells, newCell];
        onCellsChange(newCells, isBatchedStroke);
      }
    } else if (!shouldFill) {
      // When erasing: check text first, then objects, then edges, then cells
      // First check for text label (requires world coordinates)
      const { clientX, clientY } = dragStart || { clientX: 0, clientY: 0 };
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;
        const textLabel = getTextLabelAtPosition(
          mapData.textLabels || [],
          worldCoords.worldX,
          worldCoords.worldY,
          ctx
        );
        if (textLabel) {
          const newLabels = removeTextLabel(mapData.textLabels || [], textLabel.id);
          onTextLabelsChange(newLabels);
          return;
        }
        
        // Check for edge if this is a grid map and we're near an edge
        if (geometry instanceof GridGeometry && onEdgesChange) {
          const edgeInfo = geometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
          if (edgeInfo) {
            // Create edge key for tracking processed edges during drag
            const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;
            
            // Skip if already processed this edge during current stroke
            if (!processedEdges.has(edgeKey)) {
              const existingEdge = getEdgeAt(mapData.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                setProcessedEdges(prev => new Set([...prev, edgeKey]));
                const newEdges = removeEdge(mapData.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
                onEdgesChange(newEdges, isBatchedStroke);
                return;
              }
            }
          }
        }
      }
      
      // Then check for object (extract coordinates based on map type)
      const coordX = coords.gridX !== undefined ? coords.gridX : coords.q;
      const coordY = coords.gridY !== undefined ? coords.gridY : coords.r;
      const obj = getObjectAtPosition(mapData.objects || [], coordX, coordY);
      if (obj) {
        // Use unified API - handles hex (one at a time) vs grid (all at position)
        const mapType = mapData.mapType || 'grid';
        const result = eraseObjectAt(mapData.objects || [], coordX, coordY, mapType);
        if (result.success) {
          onObjectsChange(result.objects);
        }
      } else if (existingCellIndex !== -1) {
        // Finally remove cell if no text or object
        const newCells = mapData.cells.filter(
          cell => !geometry.cellMatchesCoords(cell, coords)
        );
        onCellsChange(newCells, isBatchedStroke);
      }
    }
  };
  
  /**
   * Paint or erase a single edge
   * Only works for grid maps (edges are a grid-only feature)
   * @param {number} worldX - World X coordinate
   * @param {number} worldY - World Y coordinate
   * @param {boolean} shouldPaint - True to paint, false to erase
   */
  const toggleEdge = (worldX, worldY, shouldPaint) => {
    if (!mapData || !geometry || !onEdgesChange) return;
    
    // Edge painting only works for grid geometry
    if (!(geometry instanceof GridGeometry)) return;
    
    // Use screenToEdge to detect which edge was clicked
    const edgeInfo = geometry.screenToEdge(worldX, worldY, 0.15);
    if (!edgeInfo) return; // Click was in cell center, not near an edge
    
    const { x, y, side } = edgeInfo;
    
    // Check if we're in a batched stroke (suppress history for intermediate updates)
    const isBatchedStroke = strokeInitialEdgesRef.current !== null;
    
    if (shouldPaint) {
      // Paint the edge with selected color and opacity
      const newEdges = addEdge(mapData.edges || [], x, y, side, selectedColor, selectedOpacity);
      onEdgesChange(newEdges, isBatchedStroke);
    } else {
      // Erase the edge
      const newEdges = removeEdge(mapData.edges || [], x, y, side);
      onEdgesChange(newEdges, isBatchedStroke);
    }
  };
  
  /**
   * Process edge during drag (for edgeDraw/edgeErase tools)
   */
  const processEdgeDuringDrag = (e) => {
    if (!geometry || !(geometry instanceof GridGeometry)) return;
    
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return;
    
    // Detect edge at this position
    const edgeInfo = geometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
    if (!edgeInfo) return;
    
    // Generate unique key for this edge (using normalized position)
    const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;
    
    if (processedEdges.has(edgeKey)) return;
    
    setProcessedEdges(prev => new Set([...prev, edgeKey]));
    
    const shouldPaint = currentTool === 'edgeDraw';
    toggleEdge(worldCoords.worldX, worldCoords.worldY, shouldPaint);
  };
  
  /**
   * Start edge drawing stroke
   */
  const startEdgeDrawing = (e) => {
    if (!mapData) return;
    
    setIsDrawing(true);
    setProcessedEdges(new Set());
    // Store initial edge state for batched history entry at stroke end
    strokeInitialEdgesRef.current = [...(mapData.edges || [])];
    processEdgeDuringDrag(e);
  };
  
  /**
   * Stop edge drawing stroke and create history entry
   */
  const stopEdgeDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(mapData.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };
  
  /**
   * Fill edges along a line between two grid intersections
   * Constrains to horizontal or vertical based on dominant axis
   * @param {number} x1 - Start grid x
   * @param {number} y1 - Start grid y
   * @param {number} x2 - End grid x
   * @param {number} y2 - End grid y
   */
  const fillEdgeLine = (x1, y1, x2, y2) => {
    if (!mapData || !onEdgesChange) return;
    if (!(geometry instanceof GridGeometry)) return;
    
    // Determine if this is more horizontal or vertical
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    
    let lineX1, lineY1, lineX2, lineY2;
    
    if (dx >= dy) {
      // Horizontal line - constrain y to start point
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x2;
      lineY2 = y1; // Same y as start
    } else {
      // Vertical line - constrain x to start point
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x1; // Same x as start
      lineY2 = y2;
    }
    
    // Generate the edges for this line
    const newEdgesData = generateEdgeLine(lineX1, lineY1, lineX2, lineY2, selectedColor);
    
    // Merge with existing edges
    const newEdges = mergeEdges(mapData.edges || [], newEdgesData);
    onEdgesChange(newEdges);
  };
  
  /**
   * Fill a rectangle of cells
   */
  const fillRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    if (!geometry) return;
    
    // Use geometry from context (passed via MapState)
    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);
    
    const newCells = [...mapData.cells];
    
    for (const cellCoords of cellsInRect) {
      // Convert {x, y} coordinates to proper coords format for geometry
      const coords = { gridX: cellCoords.x, gridY: cellCoords.y };
      const existingIndex = newCells.findIndex(c => geometry.cellMatchesCoords(c, coords));
      
      if (existingIndex !== -1) {
        // Cell exists - update its color and opacity (paint over)
        newCells[existingIndex] = {
          ...newCells[existingIndex],
          color: selectedColor,
          opacity: selectedOpacity
        };
      } else {
        // Cell doesn't exist - create new with opacity
        const newCell = geometry.createCellObject(coords, selectedColor);
        newCell.opacity = selectedOpacity;
        newCells.push(newCell);
      }
    }
    
    onCellsChange(newCells);
  };
  
  /**
   * Fill a circle of cells
   */
  const fillCircle = (edgeX, edgeY, centerX, centerY) => {
    if (!mapData) return;
    
    if (!geometry) return;
    // Use geometry from context (passed via MapState)
    const radius = geometry.getEuclideanDistance(centerX, centerY, edgeX, edgeY);
    const cellsInCircle = geometry.getCellsInCircle(centerX, centerY, radius);
    
    const newCells = [...mapData.cells];
    
    for (const cellCoords of cellsInCircle) {
      // Convert {x, y} coordinates to proper coords format for geometry
      const coords = { gridX: cellCoords.x, gridY: cellCoords.y };
      const existingIndex = newCells.findIndex(c => geometry.cellMatchesCoords(c, coords));
      
      if (existingIndex !== -1) {
        // Cell exists - update its color and opacity (paint over)
        newCells[existingIndex] = {
          ...newCells[existingIndex],
          color: selectedColor,
          opacity: selectedOpacity
        };
      } else {
        // Cell doesn't exist - create new with opacity
        const newCell = geometry.createCellObject(coords, selectedColor);
        newCell.opacity = selectedOpacity;
        newCells.push(newCell);
      }
    }
    
    onCellsChange(newCells);
  };
  
  /**
   * Clear a rectangle of cells, objects, and text labels
   */
  const clearRectangle = (x1, y1, x2, y2) => {
    if (!mapData) return;
    
    if (!geometry) return;
    // Use geometry from context (passed via MapState)
    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);
    
    // Remove all objects within the rectangle (grid coordinates)
    const newObjects = removeObjectsInRectangle(mapData.objects || [], x1, y1, x2, y2);
    onObjectsChange(newObjects);
    
    // Remove all text labels within the rectangle (need to convert to world coordinates)
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    
    const { worldX: worldMinX, worldY: worldMinY } = geometry.gridToWorld(minX, minY);
    const { worldX: worldMaxX, worldY: worldMaxY } = geometry.gridToWorld(maxX + 1, maxY + 1);
    
    const newTextLabels = (mapData.textLabels || []).filter(label => {
      return !(label.position.x >= worldMinX && label.position.x <= worldMaxX && 
               label.position.y >= worldMinY && label.position.y <= worldMaxY);
    });
    onTextLabelsChange(newTextLabels);
    
    // Remove all cells within the rectangle - check against each cell coordinate
    const newCells = mapData.cells.filter(cell => {
      // Check if this cell is within the rectangle bounds
      // For grid cells with {x, y}, check directly
      if (cell.x !== undefined) {
        return !(cell.x >= minX && cell.x <= maxX && cell.y >= minY && cell.y <= maxY);
      }
      // For hex cells with {q, r}, this tool shouldn't be available anyway
      return true;
    });
    
    onCellsChange(newCells);
  };
  
  /**
   * Process cell during drag (for draw/erase tools)
   */
  const processCellDuringDrag = (e, dragStart = null) => {
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;
    
    // Generate cell key based on coordinate type
    const cellKey = coords.gridX !== undefined 
      ? `${coords.gridX},${coords.gridY}` 
      : `${coords.q},${coords.r}`;
    
    if (processedCells.has(cellKey)) return;
    
    setProcessedCells(prev => new Set([...prev, cellKey]));
    
    const shouldFill = currentTool === 'draw';
    // Pass the current event coordinates for edge/text detection during erase
    toggleCell(coords, shouldFill, { clientX, clientY });
  };
  const startDrawing = (e, dragStart = null) => {
    if (!mapData) return;
    
    setIsDrawing(true);
    setProcessedCells(new Set());
    setProcessedEdges(new Set()); // Also reset processed edges for erase strokes
    // Store initial cell state for batched history entry at stroke end
    strokeInitialStateRef.current = [...mapData.cells];
    // Also store initial edge state for erase strokes that may remove edges
    strokeInitialEdgesRef.current = mapData.edges ? [...mapData.edges] : [];
    processCellDuringDrag(e, dragStart);
  };
  
  /**
   * Stop a drawing stroke and create history entry
   */
  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());
    
    // Add single history entry for the completed stroke (cells)
    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(mapData.cells, false);
      strokeInitialStateRef.current = null;
    }
    // Add single history entry for edges if any were erased
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(mapData.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };
  
  /**
   * Handle pointer down for drawing tools
   * Returns true if the event was handled by drawing tools
   */
  const handleDrawingPointerDown = (e, gridX, gridY) => {
    if (!mapData) return false;
    
    // Handle rectangle and circle tools
    if (currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') {
      if (currentTool === 'circle') {
        if (!circleStart) {
          setCircleStart({ x: gridX, y: gridY });
        } else {
          fillCircle(circleStart.x, circleStart.y, gridX, gridY);
          setCircleStart(null);
        }
      } else if (!rectangleStart) {
        const { clientX, clientY } = getClientCoords(e);
        setRectangleStart({ x: gridX, y: gridY });
      } else {
        if (currentTool === 'rectangle') {
          fillRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        } else {
          clearRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        }
        setRectangleStart(null);
      }
      return true;
    }
    
    // Handle edge line tool (two-click, grid maps only)
    // Snaps to nearest grid intersection point
    if (currentTool === 'edgeLine') {
      if (!(geometry instanceof GridGeometry)) return false;
      
      // Get world coordinates to find nearest intersection
      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return false;
      
      // Find nearest grid intersection by rounding world coords to cell size
      const cellSize = geometry.cellSize;
      const nearestX = Math.round(worldCoords.worldX / cellSize);
      const nearestY = Math.round(worldCoords.worldY / cellSize);
      
      if (!edgeLineStart) {
        setEdgeLineStart({ x: nearestX, y: nearestY });
      } else {
        fillEdgeLine(edgeLineStart.x, edgeLineStart.y, nearestX, nearestY);
        setEdgeLineStart(null);
      }
      return true;
    }
    
    // Handle edge paint/erase tools (grid maps only)
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      startEdgeDrawing(e);
      return true;
    }
    
    // Handle paint/erase tools
    if (currentTool === 'draw' || currentTool === 'erase') {
      startDrawing(e);
      return true;
    }
    
    return false;
  };
  
  /**
   * Handle pointer move for drawing tools
   * Returns true if the event was handled by drawing tools
   */
  const handleDrawingPointerMove = (e, dragStart = null) => {
    // Handle edge paint/erase during drag
    if (isDrawing && (currentTool === 'edgeDraw' || currentTool === 'edgeErase')) {
      processEdgeDuringDrag(e);
      return true;
    }
    
    // Handle cell paint/erase during drag
    if (isDrawing && (currentTool === 'draw' || currentTool === 'erase')) {
      processCellDuringDrag(e, dragStart);
      return true;
    }
    return false;
  };
  
  /**
   * Cancel any active drawing operation
   */
  const cancelDrawing = () => {
    if (isDrawing) {
      setIsDrawing(false);
      setProcessedCells(new Set());
      setProcessedEdges(new Set());
      strokeInitialStateRef.current = null;
      strokeInitialEdgesRef.current = null;
    }
  };
  
  /**
   * Reset drawing state (called when tool changes)
   */
  const resetDrawingState = () => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
    cancelDrawing();
  };
  
  // Reset drawing state when tool changes
  dc.useEffect(() => {
    resetDrawingState();
  }, [currentTool]);
  
  return {
    // State
    isDrawing,
    rectangleStart,
    circleStart,
    edgeLineStart,
    
    // Cell Functions
    toggleCell,
    fillRectangle,
    fillCircle,
    clearRectangle,
    processCellDuringDrag,
    startDrawing,
    stopDrawing,
    
    // Edge Functions
    toggleEdge,
    processEdgeDuringDrag,
    startEdgeDrawing,
    stopEdgeDrawing,
    fillEdgeLine,
    
    // Handler Functions
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,
    
    // Setters (for advanced use cases)
    setIsDrawing,
    setProcessedCells,
    setProcessedEdges,
    setRectangleStart,
    setCircleStart,
    setEdgeLineStart
  };
};


return { useDrawingTools };
```

# DrawingLayer

```jsx
const { useDrawingTools } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useDrawingTools"));
const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));

/**
 * DrawingLayer.jsx
 * FIX v3: Use inverse screenToGrid transformation instead of gridToScreen
 */
const DrawingLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity = 1,
  onDrawingStateChange
}) => {
  const { 
    canvasRef, 
    mapData, 
    screenToGrid, 
    screenToWorld, 
    getClientCoords, 
    GridGeometry,
    geometry
  } = useMapState();
  
  const { 
    getTextLabelAtPosition, 
    removeTextLabel, 
    getObjectAtPosition, 
    removeObjectAtPosition, 
    removeObjectsInRectangle 
  } = useMapOperations();
  
  const {
    isDrawing,
    rectangleStart,
    circleStart,
    edgeLineStart,
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    stopDrawing,
    stopEdgeDrawing,
    cancelDrawing
  } = useDrawingTools(
    currentTool,
    selectedColor,
    selectedOpacity
  );
  
  // Combined stop function that handles both cell and edge drawing
  const handleStopDrawing = dc.useCallback(() => {
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      stopEdgeDrawing();
    } else {
      stopDrawing();
    }
  }, [currentTool, stopDrawing, stopEdgeDrawing]);
  
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('drawing', {
      handleDrawingPointerDown,
      handleDrawingPointerMove,
      stopDrawing: handleStopDrawing,
      cancelDrawing,
      isDrawing,
      rectangleStart,
      circleStart,
      edgeLineStart
    });
    
    return () => unregisterHandlers('drawing');
  }, [registerHandlers, unregisterHandlers, handleDrawingPointerDown, handleDrawingPointerMove, handleStopDrawing, cancelDrawing, isDrawing, rectangleStart, circleStart, edgeLineStart]);
  
  dc.useEffect(() => {
    if (onDrawingStateChange) {
      onDrawingStateChange({
        isDrawing,
        rectangleStart,
        circleStart,
        edgeLineStart,
        handlers: {
          handleDrawingPointerDown,
          handleDrawingPointerMove,
          stopDrawing: handleStopDrawing,
          cancelDrawing
        }
      });
    }
  }, [isDrawing, rectangleStart, circleStart, edgeLineStart, onDrawingStateChange, handleStopDrawing]);
  
  const renderPreviewOverlay = () => {
    if (!canvasRef.current || !geometry) return null;
    
    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;
    
    // Calculate viewport parameters based on geometry type
    let scaledSize, offsetX, offsetY;
    
    if (geometry.constructor.name === 'GridGeometry') {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      // Hex: center is in world pixel coordinates, not hex coordinates
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }
    
    const containerRect = canvas.parentElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    
    const displayScale = canvasRect.width / width;
    
    // NEW APPROACH: Use the inverse of screenToGrid transformation
    // This ensures perfect symmetry with how clicks are converted to grid cells
    const gridToCanvasPosition = (gridX, gridY) => {
      // Convert grid to world coordinates (cell center for better accuracy)
      const worldX = (gridX + 0.5) * geometry.cellSize;
      const worldY = (gridY + 0.5) * geometry.cellSize;
      
      // Convert world to canvas coordinates (non-rotated)
      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;
      
      // Apply rotation around canvas center (matching canvas rendering)
      if (northDirection !== 0) {
        const centerX = width / 2;
        const centerY = height / 2;
        
        screenX -= centerX;
        screenY -= centerY;
        
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
        const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
        
        screenX = rotatedX + centerX;
        screenY = rotatedY + centerY;
      }
      
      // Scale to display coordinates
      screenX *= displayScale;
      screenY *= displayScale;
      
      // Add canvas offset and adjust back to top-left corner
      const cellHalfSize = (scaledSize * displayScale) / 2;
      return { 
        x: canvasOffsetX + screenX - cellHalfSize, 
        y: canvasOffsetY + screenY - cellHalfSize
      };
    };
    
    // Convert grid intersection point to canvas position
    // Unlike gridToCanvasPosition, this targets the corner/intersection, not cell center
    const intersectionToCanvasPosition = (intX, intY) => {
      // Intersection point - no +0.5 offset since we want the corner
      const worldX = intX * geometry.cellSize;
      const worldY = intY * geometry.cellSize;
      
      // Convert world to canvas coordinates (non-rotated)
      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;
      
      // Apply rotation around canvas center (matching canvas rendering)
      if (northDirection !== 0) {
        const centerX = width / 2;
        const centerY = height / 2;
        
        screenX -= centerX;
        screenY -= centerY;
        
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
        const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
        
        screenX = rotatedX + centerX;
        screenY = rotatedY + centerY;
      }
      
      // Scale to display coordinates
      screenX *= displayScale;
      screenY *= displayScale;
      
      return { 
        x: canvasOffsetX + screenX, 
        y: canvasOffsetY + screenY
      };
    };
    
    const overlays = [];
    const displayScaledSize = scaledSize * displayScale;
    
    // Rectangle start indicator  
    if (rectangleStart) {
      const pos = gridToCanvasPosition(rectangleStart.x, rectangleStart.y);
      
      const highlightColor = currentTool === 'clearArea' ? '#ff0000' : '#00ff00';
      
      overlays.push(
        <div
          key="rectangle-preview"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${displayScaledSize}px`,
            height: `${displayScaledSize}px`,
            border: `2px solid ${highlightColor}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 100
          }}
        />
      );
    }
    
    if (circleStart) {
      const pos = gridToCanvasPosition(circleStart.x, circleStart.y);
      
      const highlightColor = '#00aaff';
      
      overlays.push(
        <div
          key="circle-preview"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${displayScaledSize}px`,
            height: `${displayScaledSize}px`,
            border: `2px solid ${highlightColor}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 100
          }}
        />
      );
    }
    
    // Edge line start indicator - X marker at grid intersection
    if (edgeLineStart) {
      // Use intersection positioning since edgeLineStart stores intersection coords
      const pos = intersectionToCanvasPosition(edgeLineStart.x, edgeLineStart.y);
      
      const highlightColor = '#ff9500'; // Orange for edge line
      const markerSize = Math.max(16, displayScaledSize * 0.4); // Scale with zoom but min 16px
      const halfMarker = markerSize / 2;
      const strokeWidth = Math.max(2, markerSize / 8);
      
      overlays.push(
        <svg
          key="edgeline-preview"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x - halfMarker}px`,
            top: `${pos.y - halfMarker}px`,
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            pointerEvents: 'none',
            zIndex: 100,
            overflow: 'visible'
          }}
          viewBox={`0 0 ${markerSize} ${markerSize}`}
        >
          {/* X mark centered on intersection */}
          <line
            x1={strokeWidth}
            y1={strokeWidth}
            x2={markerSize - strokeWidth}
            y2={markerSize - strokeWidth}
            stroke={highlightColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={markerSize - strokeWidth}
            y1={strokeWidth}
            x2={strokeWidth}
            y2={markerSize - strokeWidth}
            stroke={highlightColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      );
    }
    
    return overlays.length > 0 ? <>{overlays}</> : null;
  };
  
  return renderPreviewOverlay();
};

return { DrawingLayer };
```

# useTextLabelInteraction

```js
/**
 * useTextLabelInteraction.js
 * 
 * Custom hook for managing text label interactions:
 * - Placement of new text labels
 * - Selection and deselection
 * - Dragging to reposition
 * - Rotation (R key and button)
 * - Deletion (Delete/Backspace)
 * - Editing (double-click and edit button)
 * - Modal state management
 * - Button position calculations
 */

const { applyInverseRotation } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "screenPositionUtils"));
const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));

/**
 * Hook for managing text label interactions
 * @param {string} currentTool - Current active tool
 * @param {Function} onAddCustomColor - Callback to add custom color
 * @param {Array} customColors - Array of custom colors
 */
const useTextLabelInteraction = (
  currentTool,
  onAddCustomColor,
  customColors
) => {
  // Get all required state and operations from Context
  const {
    canvasRef,
    mapData,
    screenToWorld,
    getClientCoords
  } = useMapState();
  
  const {
    onTextLabelsChange,
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel
  } = useMapOperations();
  
  const {
    selectedItem,
    setSelectedItem,
    isDraggingSelection,
    setIsDraggingSelection,
    dragStart,
    setDragStart
  } = useMapSelection();

  // Text label modal state
  const [showTextModal, setShowTextModal] = dc.useState(false);
  const [pendingTextPosition, setPendingTextPosition] = dc.useState(null);
  const [editingTextId, setEditingTextId] = dc.useState(null); // ID of text label being edited
  const dragInitialStateRef = dc.useRef(null); // Store initial state for batched drag history
  
  /**
   * Handle text label placement - opens modal to create new label
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @returns {boolean} - True if placement was handled
   */
  const handleTextPlacement = dc.useCallback((clientX, clientY) => {
    if (currentTool !== 'addText' || !canvasRef.current || !mapData) {
      return false;
    }
    
    // Use screenToWorld helper which handles both grid and hex geometries
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;
    
    setPendingTextPosition({ x: worldCoords.worldX, y: worldCoords.worldY });
    setShowTextModal(true);
    return true;
  }, [currentTool, canvasRef, mapData, screenToWorld]);
  
  /**
   * Handle text label selection
   * @param {number} clientX - Client X coordinate
   * @param {number} clientY - Client Y coordinate
   * @returns {boolean} - True if a text label was selected
   */
  const handleTextSelection = dc.useCallback((clientX, clientY) => {
    if (currentTool !== 'select' || !mapData?.textLabels || !canvasRef.current) {
      return false;
    }
    
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const textLabel = getTextLabelAtPosition(
      mapData.textLabels,
      worldCoords.worldX,
      worldCoords.worldY,
      ctx
    );
    
    if (textLabel) {
      // Store initial text label state for batched history entry at drag end
      dragInitialStateRef.current = [...(mapData.textLabels || [])];
      setSelectedItem({ type: 'text', id: textLabel.id, data: textLabel });
      setIsDraggingSelection(true);
      setDragStart({ x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
      return true;
    }
    
    return false;
  }, [currentTool, mapData, canvasRef, screenToWorld, getTextLabelAtPosition, setSelectedItem, setIsDraggingSelection, setDragStart]);  
  
  /**
   * Handle text label dragging
   * @param {Event} e - Pointer event
   * @returns {boolean} - True if dragging was handled
   */
  const handleTextDragging = dc.useCallback((e) => {
    if (!isDraggingSelection || selectedItem?.type !== 'text' || !dragStart || !mapData) {
      return false;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return false;
    
    // Calculate delta from drag start
    const deltaWorldX = worldCoords.worldX - dragStart.worldX;
    const deltaWorldY = worldCoords.worldY - dragStart.worldY;
    
    // Update text label position (suppress history during drag)
    const updatedLabels = updateTextLabel(
      mapData.textLabels,
      selectedItem.id,
      {
        position: {
          x: selectedItem.data.position.x + deltaWorldX,
          y: selectedItem.data.position.y + deltaWorldY
        }
      }
    );
    onTextLabelsChange(updatedLabels, true); // Suppress history
    
    // Update drag start and selected item data for next frame
    setDragStart({ x: clientX, y: clientY, worldX: worldCoords.worldX, worldY: worldCoords.worldY });
    setSelectedItem({
      ...selectedItem,
      data: {
        ...selectedItem.data,
        position: {
          x: selectedItem.data.position.x + deltaWorldX,
          y: selectedItem.data.position.y + deltaWorldY
        }
      }
    });
    
    return true;
  }, [isDraggingSelection, selectedItem, dragStart, mapData, getClientCoords, screenToWorld, updateTextLabel, onTextLabelsChange, setDragStart, setSelectedItem]);  
  
  /**
   * Handle text label rotation
   */
  const handleTextRotation = dc.useCallback(() => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData) {
      return;
    }
    
    // Cycle through 0° -> 90° -> 180° -> 270° -> 0°
    const rotations = [0, 90, 180, 270];
    const currentRotation = selectedItem.data.rotation || 0;
    const currentIndex = rotations.indexOf(currentRotation);
    const nextRotation = rotations[(currentIndex + 1) % 4];
    
    const updatedLabels = updateTextLabel(
      mapData.textLabels,
      selectedItem.id,
      { rotation: nextRotation }
    );
    onTextLabelsChange(updatedLabels);
    
    // Update selected item data
    setSelectedItem({
      ...selectedItem,
      data: {
        ...selectedItem.data,
        rotation: nextRotation
      }
    });
  }, [selectedItem, mapData, updateTextLabel, onTextLabelsChange, setSelectedItem]);   
  
  /**
   * Handle text label deletion
   */
  const handleTextDeletion = () => {
    if (!selectedItem || selectedItem.type !== 'text' || !mapData) {
      return;
    }
    
    const updatedLabels = removeTextLabel(
      mapData.textLabels,
      selectedItem.id
    );
    onTextLabelsChange(updatedLabels);
    setSelectedItem(null);
  };
  
  /**
   * Handle keyboard shortcuts for text labels
   * @param {KeyboardEvent} e - Keyboard event
   * @returns {boolean} - True if a text label shortcut was handled
   */
  const handleTextKeyDown = (e) => {
    if (!selectedItem || selectedItem.type !== 'text') {
      return false;
    }
    
    // Rotation with R key
    if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      handleTextRotation();
      return true;
    }
    
    // Deletion with Delete or Backspace
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      handleTextDeletion();
      return true;
    }
    
    return false;
  };
  
  /**
   * Handle text label modal submission
   * @param {Object} labelData - Label data from modal
   */
  const handleTextSubmit = (labelData) => {
    if (!labelData || !labelData.content || !labelData.content.trim()) {
      return;
    }
    
    if (editingTextId) {
      // Update existing label
      const newLabels = updateTextLabel(
        mapData.textLabels || [],
        editingTextId,
        {
          content: labelData.content.trim(),
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color
        }
      );
      onTextLabelsChange(newLabels);
    } else if (pendingTextPosition && mapData) {
      // Create new label
      const newLabels = addTextLabel(
        mapData.textLabels || [],
        labelData.content.trim(),
        pendingTextPosition.x,
        pendingTextPosition.y,
        {
          fontSize: labelData.fontSize,
          fontFace: labelData.fontFace,
          color: labelData.color
        }
      );
      onTextLabelsChange(newLabels);
    }
    
    setShowTextModal(false);
    setPendingTextPosition(null);
    setEditingTextId(null);
  };
  
  /**
   * Handle text label modal cancellation
   */
  const handleTextCancel = () => {
    setShowTextModal(false);
    setPendingTextPosition(null);
    setEditingTextId(null);
  };
  
  /**
   * Handle rotate button click
   * @param {Event} e - Click event
   */
  const handleRotateClick = (e) => {
    if (selectedItem?.type === 'text') {
      e.preventDefault();
      e.stopPropagation();
      handleTextRotation();
    }
  };
  
  /**
   * Handle edit button click
   * @param {Event} e - Click event
   */
  const handleEditClick = (e) => {
    if (selectedItem?.type === 'text') {
      e.preventDefault();
      e.stopPropagation();
      
      // Open editor with current label data
      setEditingTextId(selectedItem.id);
      setShowTextModal(true);
    }
  };
  
  /**
   * Handle double-click to edit selected text label
   * @param {Event} e - Double-click event
   */
  const handleCanvasDoubleClick = (e) => {
    // Only handle double-click for text labels in select mode
    if (currentTool !== 'select' || !selectedItem || selectedItem.type !== 'text') {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    // Open editor with current label data
    setEditingTextId(selectedItem.id);
    setShowTextModal(true);
  };
  
  /**
   * Calculate rotate button position
   * @returns {Object} - {x, y} coordinates for button positioning
   */
  const calculateRotateButtonPosition = () => {
    if (!selectedItem?.type === 'text' || !mapData || !canvasRef.current) {
      return { x: 0, y: 0 };
    }
    
    const label = mapData.textLabels.find(l => l.id === selectedItem.id);
    if (!label) return { x: 0, y: 0 };
    
    const canvas = canvasRef.current;
    const { gridSize, viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const scaledGridSize = gridSize * zoom;
    
    // Calculate offsets accounting for map rotation
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const offsetX = centerX - center.x * scaledGridSize;
    const offsetY = centerY - center.y * scaledGridSize;
    
    // Get label position in world space, then convert to screen space
    let screenX = offsetX + label.position.x * zoom;
    let screenY = offsetY + label.position.y * zoom;
    
    // Apply canvas rotation if present
    if (northDirection !== 0) {
      // Translate to canvas center
      const relX = screenX - centerX;
      const relY = screenY - centerY;
      
      // Apply rotation
      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
      const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
      
      // Translate back
      screenX = centerX + rotatedX;
      screenY = centerY + rotatedY;
    }
    
    // Measure text to get bounding box (same as selection box calculation)
    const ctx = canvas.getContext('2d');
    const fontSize = label.fontSize * zoom;
    ctx.font = `${fontSize}px sans-serif`;
    const metrics = ctx.measureText(label.content);
    const textWidth = metrics.width;
    const textHeight = fontSize * 1.2; // Same as selection box
    
    // Calculate rotated bounding box for the label itself
    const labelAngle = (label.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(labelAngle));
    const sin = Math.abs(Math.sin(labelAngle));
    const rotatedWidth = textWidth * cos + textHeight * sin;
    const rotatedHeight = textWidth * sin + textHeight * cos;
    
    // Position button at top-right corner of selection box
    // Selection box has 4px padding on sides and 2px on top/bottom
    const selectionPaddingX = 4;
    const selectionPaddingY = 2;
    const buttonOffset = 4; // Small gap between selection box and button
    const buttonHeight = 32;
    
    // Return canvas-relative coordinates for absolute positioning
    const buttonX = screenX + (rotatedWidth / 2) + selectionPaddingX + buttonOffset;
    const buttonY = screenY - (rotatedHeight / 2) - selectionPaddingY - buttonOffset - buttonHeight;
    
    const rect = canvas.getBoundingClientRect();
    const containerRect = canvas.parentElement.getBoundingClientRect();
    
    // Calculate canvas offset within container (due to flex centering)
    const canvasOffsetX = rect.left - containerRect.left;
    const canvasOffsetY = rect.top - containerRect.top;
    
    // Scale from canvas internal coordinates to displayed coordinates
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
    
    return { x: (buttonX * scaleX) + canvasOffsetX, y: (buttonY * scaleY) + canvasOffsetY };
  };
  
  /**
   * Calculate edit button position (to the left of rotate button)
   * @returns {Object} - {x, y} coordinates for button positioning
   */
  const calculateEditButtonPosition = () => {
    const rotatePos = calculateRotateButtonPosition();
    // Position edit button 40px to the left of rotate button (32px button + 8px gap)
    return { x: rotatePos.x - 40, y: rotatePos.y };
  };
  
  /**
   * Stop text label dragging and finalize history
   */
  const stopTextDragging = () => {
    if (isDraggingSelection && selectedItem?.type === 'text') {
      setIsDraggingSelection(false);
      setDragStart(null);
      
      // Add single history entry for the completed drag
      if (dragInitialStateRef.current !== null) {
        onTextLabelsChange(mapData.textLabels, false);
        dragInitialStateRef.current = null;
      }
      return true;
    }
    return false;
  };
  
  return {
    // State
    showTextModal,
    editingTextId,
    
    // Handlers
    handleTextPlacement,
    handleTextSelection,
    handleTextDragging,
    stopTextDragging,
    handleTextRotation,
    handleTextDeletion,
    handleTextKeyDown,
    handleTextSubmit,
    handleTextCancel,
    handleRotateClick,
    handleEditClick,
    handleCanvasDoubleClick,
    
    // Position calculators
    calculateRotateButtonPosition,
    calculateEditButtonPosition
  };
};

return { useTextLabelInteraction };
```

# TextLabelEditor

```jsx
// components/TextLabelEditor.jsx - Comprehensive text label editor with styling options

const { FONT_OPTIONS, DEFAULT_FONT, DEFAULT_FONT_SIZE, DEFAULT_TEXT_COLOR, FONT_SIZE_MIN, FONT_SIZE_MAX, FONT_SIZE_STEP, getFontOption } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "fontOptions"));
const { ColorPicker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ColorPicker"));
const { COLOR_PALETTE } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "colorOperations"));

const TextLabelEditor = ({ 
  initialValue = '', 
  initialFontSize = DEFAULT_FONT_SIZE,
  initialFontFace = DEFAULT_FONT,
  initialColor = DEFAULT_TEXT_COLOR,
  onSubmit, 
  onCancel, 
  isEditing = false,
  customColors = [],
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  const [text, setText] = dc.useState(initialValue);
  const [fontSize, setFontSize] = dc.useState(initialFontSize);
  const [fontFace, setFontFace] = dc.useState(initialFontFace);
  const [color, setColor] = dc.useState(initialColor);
  const [isColorPickerOpen, setIsColorPickerOpen] = dc.useState(false);
  const [showPreview, setShowPreview] = dc.useState(false);
  
  const inputRef = dc.useRef(null);
  const colorBtnRef = dc.useRef(null);
  const pendingCustomColorRef = dc.useRef(null);
  
  // Auto-focus input when modal opens
  dc.useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
      // Select all text if editing existing label
      if (initialValue) {
        inputRef.current.select();
      }
    }
  }, []);
  
  // Handle keyboard shortcuts
  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };
  
  const handleSubmit = () => {
    const trimmed = text.trim();
    if (trimmed.length > 0 && trimmed.length <= 200) {
      const labelData = {
        content: trimmed,
        fontSize: fontSize,
        fontFace: fontFace,
        color: color
      };
      onSubmit(labelData);
    }
  };
  
  // Prevent clicks inside modal from closing it
  const handleModalClick = (e) => {
    e.stopPropagation();
  };
  
  // Handle font size change with validation
  const handleFontSizeChange = (e) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value)) {
      const clamped = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, value));
      setFontSize(clamped);
    }
  };
  
  // Handle font face change
  const handleFontFaceChange = (e) => {
    setFontFace(e.target.value);
  };
  
  // Color picker handlers
  const handleColorPickerToggle = (e) => {
    e.stopPropagation();
    setIsColorPickerOpen(!isColorPickerOpen);
  };
  
  const handleColorSelect = (newColor) => {
    setColor(newColor);
  };
  
  const handleColorReset = () => {
    setColor(DEFAULT_TEXT_COLOR);
    setIsColorPickerOpen(false);
  };
  
  const handleCloseColorPicker = () => {
    setIsColorPickerOpen(false);
  };
  
  const handleAddCustomColor = (newColor) => {
    if (onAddCustomColor) {
      // Pass raw color string - parent handles wrapping into color object
      onAddCustomColor(newColor);
    }
  };
  
  const handleDeleteCustomColor = (colorId) => {
    if (onDeleteCustomColor) {
      onDeleteCustomColor(colorId);
    }
  };
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (isColorPickerOpen) {
      const handleClickOutside = (e) => {
        // Check if click is inside the color picker or the color button
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-text-editor-color-button');
        
        if (!pickerElement && !buttonElement) {
          // Click is outside - save any pending color and close the picker
          if (pendingCustomColorRef.current) {
            handleAddCustomColor(pendingCustomColorRef.current);
            setColor(pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          
          handleCloseColorPicker();
        }
      };
      
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isColorPickerOpen]);
  
  return (
    <div className="dmt-modal-overlay" onClick={onCancel}>
      <div 
        className="dmt-modal-content dmt-text-editor-modal" 
        onClick={handleModalClick}
      >
        <h3 className="dmt-modal-title">
          {isEditing ? 'Edit Text Label' : 'Add Text Label'}
        </h3>
        
        {/* Text input */}
        <div className="dmt-text-editor-section">
          <label className="dmt-text-editor-label">Text</label>
          <input
            ref={inputRef}
            type="text"
            className="dmt-modal-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={200}
            placeholder="Enter label text..."
          />
        </div>
        
        {/* Font controls row */}
        <div className="dmt-text-editor-row">
          {/* Font face dropdown */}
          <div className="dmt-text-editor-section dmt-text-editor-section-grow">
            <label className="dmt-text-editor-label">Font</label>
            <select 
              className="dmt-text-editor-select"
              value={fontFace}
              onChange={handleFontFaceChange}
            >
              {FONT_OPTIONS.map(font => (
                <option key={font.id} value={font.id}>
                  {font.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Font size input */}
          <div className="dmt-text-editor-section dmt-text-editor-section-small">
            <label className="dmt-text-editor-label">Size</label>
            <input
              type="number"
              className="dmt-text-editor-number"
              value={fontSize}
              onChange={handleFontSizeChange}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              step={FONT_SIZE_STEP}
            />
          </div>
        </div>
        
        {/* Color picker section */}
        <div className="dmt-text-editor-section">
          <label className="dmt-text-editor-label">Color</label>
          <div style={{ position: 'relative' }}>
            <button
              ref={colorBtnRef}
              className="dmt-text-editor-color-button"
              onClick={handleColorPickerToggle}
              style={{ backgroundColor: color }}
              title="Select text color"
            >
              <span className="dmt-text-editor-color-label">
                {color.toUpperCase()}
              </span>
            </button>
            
            {isColorPickerOpen && (
              <ColorPicker
                isOpen={isColorPickerOpen}
                selectedColor={color}
                onColorSelect={handleColorSelect}
                onClose={handleCloseColorPicker}
                onReset={handleColorReset}
                customColors={customColors}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                pendingCustomColorRef={pendingCustomColorRef}
                title="Text Color"
              />
            )}
          </div>
        </div>
        
        {/* Live Preview Toggle & Section */}
        {text.trim().length > 0 && (
          <div className="dmt-text-editor-section">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
              <label className="dmt-text-editor-label">Preview</label>
              <button
                type="button"
                className="dmt-text-editor-preview-toggle"
                onClick={() => setShowPreview(!showPreview)}
                title={showPreview ? 'Hide preview' : 'Show preview'}
              >
                <dc.Icon icon="lucide-eye" />
              </button>
            </div>
            
            {showPreview && (
              <div 
                className="dmt-text-editor-preview"
                style={{
                  fontSize: `${fontSize}px`,
                  fontFamily: getFontOption(fontFace)?.css || 'sans-serif',
                  color: color,
                  textShadow: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000'
                }}
              >
                {text}
              </div>
            )}
          </div>
        )}
        
        {/* Action buttons */}
        <div className="dmt-modal-buttons">
          <button 
            className="dmt-modal-btn dmt-modal-btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="dmt-modal-btn dmt-modal-btn-submit"
            onClick={handleSubmit}
            disabled={text.trim().length === 0}
          >
            {isEditing ? 'Update' : 'Add Label'}
          </button>
        </div>
        
        <div className="dmt-modal-hint">
          Press Enter to confirm, Esc to cancel
        </div>
      </div>
    </div>
  );
};

return { TextLabelEditor };
```

# TextLayer

```jsx
const { useTextLabelInteraction } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useTextLabelInteraction"));
const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { TextLabelEditor } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "TextLabelEditor"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));
const { SelectionToolbar } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "SelectionToolbar"));

/**
 * TextLayer.jsx
 * Handles all text label interactions:
 * - Text label placement
 * - Text label selection and dragging
 * - Text label rotation and editing
 * - Text label UI controls (rotate button, edit button)
 * - Text label modal
 */
const TextLayer = ({
  currentTool,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor
}) => {
  // Get values needed for rendering from Context
  const { mapData, canvasRef, containerRef, geometry } = useMapState();
  const { selectedItem, showCoordinates, layerVisibility, isDraggingSelection } = useMapSelection();
  
  // Use text label interaction hook (optimized - gets most values from Context)
  const {
    showTextModal,
    editingTextId,
    handleTextPlacement,
    handleTextSelection,
    handleTextDragging,
    stopTextDragging,
    handleTextKeyDown,
    handleTextSubmit,
    handleTextCancel,
    handleRotateClick,
    handleEditClick,
    handleCanvasDoubleClick,
    handleTextRotation,
    handleTextDeletion
  } = useTextLabelInteraction(
    currentTool,
    onAddCustomColor,
    customColors
  );
  
  
  // Register text handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register text label handlers when they change
  dc.useEffect(() => {
    registerHandlers('text', {
      // Placement and selection
      handleTextPlacement,
      handleTextSelection,
      // Dragging
      handleTextDragging,
      stopTextDragging,
      // Editing
      handleCanvasDoubleClick,
      handleEditClick,
      // Keyboard handling
      handleTextKeyDown
    });
    
    return () => unregisterHandlers('text');
  }, [
    registerHandlers, unregisterHandlers,
    handleTextPlacement, handleTextSelection,
    handleTextDragging, stopTextDragging,
    handleCanvasDoubleClick, handleEditClick,
    handleTextKeyDown
  ]);
  
  // Hide text UI when coordinate overlay is visible or text layer is hidden
  if (showCoordinates || !layerVisibility.textLabels) {
    return null;
  }
  
  // Render text label UI controls and modals
  return (
    <>
      {/* Selection Toolbar for text labels - only render when a text label is selected and not dragging */}
      {selectedItem?.type === 'text' && !isDraggingSelection && (
        <SelectionToolbar
          selectedItem={selectedItem}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
          geometry={geometry}
          
          // Text handlers
          onEdit={handleEditClick}
          onRotate={handleRotateClick}
          onDelete={handleTextDeletion}
          
          // Not used for text but required by component
          isResizeMode={false}
          showColorPicker={false}
        />
      )}
      
      {/* Text Label Editor Modal */}
      {showTextModal && (() => {
        let currentLabel = null;
        if (editingTextId && mapData?.textLabels) {
          currentLabel = mapData.textLabels.find(l => l.id === editingTextId);
        }
        
        return (
          <TextLabelEditor
            initialValue={currentLabel?.content || ''}
            initialFontSize={currentLabel?.fontSize || 16}
            initialFontFace={currentLabel?.fontFace || 'sans'}
            initialColor={currentLabel?.color || '#ffffff'}
            isEditing={!!editingTextId}
            customColors={customColors || []}
            onAddCustomColor={onAddCustomColor}
            onDeleteCustomColor={onDeleteCustomColor}
            onSubmit={handleTextSubmit}
            onCancel={handleTextCancel}
          />
        );
      })()}
    </>
  );
};

return { TextLayer };
```

# useNotePinInteraction

```js
/**
 * useNotePinInteraction.js
 * 
 * Custom hook for managing Note Pin interactions:
 * - Placement of Note Pin objects (click → place → modal → confirm/cancel)
 * - Note link management for all objects
 * - Modal state management
 * - Note Pin special behavior (inseparable from note)
 */

const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));

/**
 * Hook for managing note pin interactions
 * @param {string} currentTool - Current active tool
 * @param {string} selectedObjectType - Currently selected object type
 */
const useNotePinInteraction = (
  currentTool,
  selectedObjectType
) => {
  // Get all required state and operations from Context
  const { mapData } = useMapState();
  
  const {
    onObjectsChange,
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject
  } = useMapOperations();
  
  const {
    showNoteLinkModal,
    setShowNoteLinkModal,
    pendingNotePinId,
    setPendingNotePinId,
    editingNoteObjectId,
    setEditingNoteObjectId
  } = useMapSelection();
  
  // Track if we just saved (to prevent race condition with cancel)
  const justSavedRef = dc.useRef(false);
  
  /**
   * Handle Note Pin placement - places pin and opens modal
   * @param {number} gridX - Grid X coordinate
   * @param {number} gridY - Grid Y coordinate
   * @returns {boolean} - True if placement was handled
   */
  const handleNotePinPlacement = (gridX, gridY) => {
    if (currentTool !== 'addObject' || selectedObjectType !== 'note_pin') {
      return false;
    }
    
    // Check if position is occupied
    const existingObj = getObjectAtPosition(mapData.objects || [], gridX, gridY);
    if (existingObj) {
      return true; // Handled but blocked
    }
    
    // Place the Note Pin object (without linkedNote initially)
    const newObjects = addObject(mapData.objects || [], 'note_pin', gridX, gridY);
    
    // Find the newly created pin
    const newPin = newObjects[newObjects.length - 1];
    
    // Reset save flag for new interaction
    justSavedRef.current = false;
    
    // Store its ID and open modal
    setPendingNotePinId(newPin.id);
    setShowNoteLinkModal(true);
    
    // Update map with new pin
    onObjectsChange(newObjects);
    
    return true;
  };
  
  /**
   * Handle note link save from modal
   * Special behavior for Note Pins vs regular objects
   * @param {string|null} notePath - Full vault path to note, or null to remove
   */
  const handleNoteLinkSave = (notePath) => {
    if (!mapData) return;
    
    // Mark that we're saving (not canceling)
    justSavedRef.current = true;
    
    let updatedObjects;
    
    // Determine which object we're working with
    const objectId = pendingNotePinId || editingNoteObjectId;
    if (!objectId) return;
    
    const object = mapData.objects?.find(obj => obj.id === objectId);
    if (!object) return;
    
    const isNotePin = object.type === 'note_pin';
    
    // Handle based on object type and whether note is being added or removed
    if (!notePath || !notePath.trim()) {
      // Removing note link
      if (isNotePin) {
        // Note Pins are inseparable from notes - remove the entire pin
        updatedObjects = removeObject(mapData.objects, objectId);
      } else {
        // Regular objects - just clear the linkedNote field
        updatedObjects = updateObject(mapData.objects, objectId, { linkedNote: null });
      }
    } else {
      // Adding/updating note link
      updatedObjects = updateObject(mapData.objects, objectId, { linkedNote: notePath });
    }
    
    onObjectsChange(updatedObjects);
    
    // Close modal and clear state
    setShowNoteLinkModal(false);
    setPendingNotePinId(null);
    setEditingNoteObjectId(null);
  };
  
  /**
   * Handle note link modal cancellation
   * If canceling a pending Note Pin, remove it entirely
   */
  const handleNoteLinkCancel = () => {
    // If we just saved, don't remove the object (modal calls both onSave and onClose)
    if (justSavedRef.current) {
      justSavedRef.current = false; // Reset for next time
      return;
    }
    
    if (pendingNotePinId && mapData) {
      // Remove the pending Note Pin since user canceled
      const updatedObjects = removeObject(mapData.objects, pendingNotePinId);
      onObjectsChange(updatedObjects);
    }
    
    // Close modal and clear state
    setShowNoteLinkModal(false);
    setPendingNotePinId(null);
    setEditingNoteObjectId(null);
  };
  
  /**
   * Handle edit note link button click for existing objects
   * @param {string} objectId - ID of object to edit note link for
   */
  const handleEditNoteLink = (objectId) => {
    if (!objectId) return;
    
    // Reset save flag for new interaction
    justSavedRef.current = false;
    
    setEditingNoteObjectId(objectId);
    setShowNoteLinkModal(true);
  };
  
  return {
    // Handlers
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
    handleEditNoteLink
  };
};

return { useNotePinInteraction };
```

# NotePinLayer

```jsx
const { useNotePinInteraction } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useNotePinInteraction"));
const { useMapState, useMapOperations } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { NoteLinkModal } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "NoteLinkModal"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));

/**
 * NotePinLayer.jsx
 * Handles note pin placement interactions:
 * - Places note_pin objects on click
 * - Opens note link modal for new pins
 * - Handles save/cancel for pending note pins
 * 
 * Note: Editing note links on existing objects (including note_pins) 
 * is handled by ObjectLayer via the "link note" button
 */
const NotePinLayer = ({
  currentTool,
  selectedObjectType
}) => {
  // Context values are now fetched inside useNotePinInteraction
  // We only need mapData here for rendering the modal
  
  // Get mapData and modal state for rendering
  const { mapData } = useMapState();
  const { 
    showNoteLinkModal,
    pendingNotePinId,
    showCoordinates
  } = useMapSelection();
  
  // Use note pin interaction hook (optimized - gets most values from Context)
  const {
    handleNotePinPlacement,
    handleNoteLinkSave,
    handleNoteLinkCancel,
    handleEditNoteLink
  } = useNotePinInteraction(
    currentTool,
    selectedObjectType
  );
  
  
  // Register note pin handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register note pin handlers when they change
  dc.useEffect(() => {
    registerHandlers('notePin', {
      // Placement (checks internally if selectedObjectType is note_pin)
      handleNotePinPlacement
    });
    
    return () => unregisterHandlers('notePin');
  }, [registerHandlers, unregisterHandlers, handleNotePinPlacement]);
  
  // Hide note pin UI when coordinate overlay is visible
  if (showCoordinates) {
    return null;
  }
  
  // Render note link modal ONLY for pending note pins
  // (ObjectLayer handles the modal for editing existing note links)
  return (
    <>
      {/* Note Link Modal - only for newly placed note_pin objects */}
      {showNoteLinkModal && pendingNotePinId && mapData && (
        <NoteLinkModal
          isOpen={showNoteLinkModal}
          onClose={handleNoteLinkCancel}
          onSave={handleNoteLinkSave}
          currentNotePath={
            mapData.objects?.find(obj => obj.id === pendingNotePinId)?.linkedNote || null
          }
          objectType="note_pin"
        />
      )}
    </>
  );
};

return { NotePinLayer };
```

# HexCoordinateLayer

```jsx
/**
 * HexCoordinateLayer.jsx
 * Renders coordinate labels inside each visible hex
 * Supports two modes:
 * - Rectangular: A1, B2, etc. (column-row)
 * - Radial: 0, 1-1, 2-5, etc. (ring-position from center)
 * 
 * Uses HTML overlay positioned via viewport transforms (no canvas rendering)
 * Only renders for hex maps when showCoordinates is true (toggled by 'C' key)
 */

const { useMapState } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { axialToOffset, offsetToAxial, columnToLabel, rowToLabel } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "offsetCoordinates"));
const { getEffectiveSettings } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));

/**
 * Calculate the ring (distance from origin) for a hex in axial coordinates
 * Ring 0 = center, Ring 1 = 6 adjacent hexes, Ring 2 = 12 hexes, etc.
 * @param {number} q - Axial q coordinate
 * @param {number} r - Axial r coordinate
 * @returns {number} Ring number (0 = center)
 */
function getHexRing(q, r) {
  // Hex distance formula: (|q| + |q + r| + |r|) / 2
  return (Math.abs(q) + Math.abs(q + r) + Math.abs(r)) / 2;
}

/**
 * Check if a world-space point is inside a flat-topped regular hexagon
 * Used for creating flat-topped radial coordinate boundaries
 * A flat-topped hexagon has flat edges at top/bottom and pointed vertices at left/right
 * @param {number} wx - World X coordinate relative to hexagon center
 * @param {number} wy - World Y coordinate relative to hexagon center  
 * @param {number} circumradius - Distance from center to vertex
 * @returns {boolean} True if point is inside the hexagon
 */
function isInsideFlatToppedHexagon(wx, wy, circumradius) {
  const dx = Math.abs(wx);
  const dy = Math.abs(wy);
  const sqrt3 = Math.sqrt(3);
  
  // Flat-topped hexagon constraints:
  // 1. Top/bottom flat edges: |y| <= inradius (R * sqrt(3)/2)
  // 2. Four diagonal edges: |x| + |y|/sqrt(3) <= R
  const inradius = circumradius * sqrt3 / 2;
  return dy <= inradius && dx + dy / sqrt3 <= circumradius;
}

/**
 * Calculate position within a ring (1-indexed, clockwise from north)
 * @param {number} q - Axial q coordinate (relative to center)
 * @param {number} r - Axial r coordinate (relative to center)
 * @param {number} ring - The ring number
 * @returns {number} Position within ring (1 to 6*ring), or 0 for center
 */
function getPositionInRing(q, r, ring) {
  if (ring === 0) return 0;
  
  // The ring is divided into 6 edges, each with 'ring' hexes
  // We traverse clockwise starting from the "north" hex (0, -ring)
  
  // Direction vectors for traversing each edge of the ring clockwise
  // These move along the ring, not toward center
  const directions = [
    { dq: 1, dr: 0 },   // Edge 0: E (moving from N toward NE corner)
    { dq: 0, dr: 1 },   // Edge 1: SE (moving from NE toward SE corner)
    { dq: -1, dr: 1 },  // Edge 2: SW (moving from SE toward S corner)
    { dq: -1, dr: 0 },  // Edge 3: W (moving from S toward SW corner)
    { dq: 0, dr: -1 },  // Edge 4: NW (moving from SW toward NW corner)
    { dq: 1, dr: -1 }   // Edge 5: NE (moving from NW back toward N)
  ];
  
  // Starting hex of the ring (top/north hex): q=0, r=-ring
  let currentQ = 0;
  let currentR = -ring;
  let position = 1;
  
  for (let edge = 0; edge < 6; edge++) {
    for (let step = 0; step < ring; step++) {
      if (currentQ === q && currentR === r) {
        return position;
      }
      currentQ += directions[edge].dq;
      currentR += directions[edge].dr;
      position++;
    }
  }
  
  // Should not reach here for valid ring hexes
  return position;
}

/**
 * Calculate visible hexes with screen positions (in display coordinates)
 * Supports both rectangular and radial display modes
 * @param {Object} geometry - HexGeometry instance
 * @param {Object} mapData - Map data with viewState
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} displayMode - 'rectangular' or 'radial'
 * @returns {{hexes: Array<{col, row, q, r, displayX, displayY, label}>, scaleX: number, scaleY: number}} Visible hexes with display positions and scale factors
 */
function getVisibleHexes(geometry, mapData, canvas, displayMode = 'rectangular') {
  if (!canvas || !geometry || !mapData) return { hexes: [], scaleX: 1, scaleY: 1 };
  
  const { viewState, northDirection } = mapData;
  const { zoom, center } = viewState;
  
  // Calculate offset from center (hex maps use world pixel coordinates for center)
  const offsetX = canvas.width / 2 - center.x * zoom;
  const offsetY = canvas.height / 2 - center.y * zoom;
  
  // Get canvas display rect for coordinate scaling
  const rect = canvas.getBoundingClientRect();
  const containerRect = canvas.parentElement?.getBoundingClientRect() || rect;
  
  // Calculate canvas offset within container (due to flex centering)
  const canvasOffsetX = rect.left - containerRect.left;
  const canvasOffsetY = rect.top - containerRect.top;
  
  // Scale factors from canvas internal to display coordinates
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  // Helper to convert axial coords to display position
  const getDisplayPosition = (q, r) => {
    const { worldX, worldY } = geometry.hexToWorld(q, r);
    
    let screenX = offsetX + worldX * zoom;
    let screenY = offsetY + worldY * zoom;
    
    // Apply rotation if north direction is set
    if (northDirection !== 0) {
      const relX = screenX - centerX;
      const relY = screenY - centerY;
      
      const angleRad = (northDirection * Math.PI) / 180;
      const rotatedX = relX * Math.cos(angleRad) - relY * Math.sin(angleRad);
      const rotatedY = relX * Math.sin(angleRad) + relY * Math.cos(angleRad);
      
      screenX = centerX + rotatedX;
      screenY = centerY + rotatedY;
    }
    
    // Check if on screen
    const padding = 50;
    if (screenX < -padding || screenX > canvas.width + padding ||
        screenY < -padding || screenY > canvas.height + padding) {
      return null;
    }
    
    // Convert to display coordinates (CSS pixels)
    return {
      displayX: (screenX * scaleX) + canvasOffsetX,
      displayY: (screenY * scaleY) + canvasOffsetY
    };
  };
  
  const visibleHexes = [];
  
  if (displayMode === 'radial') {
    // Radial mode: iterate all hexes in bounds, check flat-topped hexagonal containment
    const hexBounds = mapData.hexBounds || { maxCol: 26, maxRow: 20 };
    
    // Calculate max radius based on smaller dimension (so pattern fits in bounds)
    const maxRadius = Math.floor(Math.min(hexBounds.maxCol, hexBounds.maxRow) / 2);
    
    // Use the center hex for both boundary and labeling (ensures consistency)
    const centerCol = Math.floor((hexBounds.maxCol - 1) / 2);
    const centerRow = Math.floor((hexBounds.maxRow - 1) / 2);
    const { q: centerQ, r: centerR } = offsetToAxial(centerCol, centerRow, geometry.orientation);
    
    // Get center position in world coordinates
    const centerWorld = geometry.hexToWorld(centerQ, centerR);
    
    // Calculate circumradius for flat-topped hexagonal boundary
    // The world-space distance to a ring boundary is ring * sqrt(3) * hexSize
    const sqrt3 = Math.sqrt(3);
    const circumradius = maxRadius * sqrt3 * geometry.hexSize;
    
    // Iterate all hexes in rectangular bounds
    for (let col = 0; col < hexBounds.maxCol; col++) {
      for (let row = 0; row < hexBounds.maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, geometry.orientation);
        
        // Get this hex's world position relative to center
        const hexWorld = geometry.hexToWorld(q, r);
        const relWorldX = hexWorld.worldX - centerWorld.worldX;
        const relWorldY = hexWorld.worldY - centerWorld.worldY;
        
        // Check if inside flat-topped hexagonal boundary
        if (!isInsideFlatToppedHexagon(relWorldX, relWorldY, circumradius)) {
          continue;
        }
        
        // Calculate ring using hex distance from same center
        const dq = q - centerQ;
        const dr = r - centerR;
        const ring = getHexRing(dq, dr);
        
        const pos = getDisplayPosition(q, r);
        if (!pos) continue;
        
        // Calculate position within ring
        let label;
        if (ring === 0) {
          label = "â—ˆ";
        } else {
          const position = getPositionInRing(dq, dr, ring);
          label = `${ring}-${position}`;
        }
        
        visibleHexes.push({ 
          col, row, q, r, 
          displayX: pos.displayX, 
          displayY: pos.displayY,
          label 
        });
      }
    }
  } else {
    // Rectangular mode: iterate by offset coordinates within bounds
    const { minQ, maxQ, minR, maxR } = geometry.getVisibleHexRange(
      offsetX, offsetY, canvas.width, canvas.height, zoom
    );
    
    // Convert axial visible range to offset bounds
    const offsetCorners = [];
    for (let q = minQ; q <= maxQ; q += (maxQ - minQ) || 1) {
      for (let r = minR; r <= maxR; r += (maxR - minR) || 1) {
        offsetCorners.push(axialToOffset(q, r, geometry.orientation));
      }
    }
    
    const minCol = Math.min(...offsetCorners.map(c => c.col));
    const maxCol = Math.max(...offsetCorners.map(c => c.col));
    const minRow = Math.min(...offsetCorners.map(c => c.row));
    const maxRow = Math.max(...offsetCorners.map(c => c.row));
    
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const { q, r } = offsetToAxial(col, row, geometry.orientation);
        
        // Check if within map bounds (if bounds are set)
        if (!geometry.isWithinBounds(q, r)) continue;
        
        const pos = getDisplayPosition(q, r);
        if (!pos) continue;
        
        const label = columnToLabel(col) + rowToLabel(row);
        
        visibleHexes.push({ 
          col, row, q, r, 
          displayX: pos.displayX, 
          displayY: pos.displayY,
          label 
        });
      }
    }
  }
  
  return { hexes: visibleHexes, scaleX, scaleY };
}

/**
 * HexCoordinateLayer Component
 * Renders coordinate labels over visible hexes
 * Reads display mode settings from mapData.settings
 */
const HexCoordinateLayer = () => {
  // Get shared state from contexts
  const { canvasRef, mapData, geometry } = useMapState();
  const { showCoordinates, layerVisibility } = useMapSelection();
  
  // C key (showCoordinates) overrides layerVisibility - if C is pressed, always show
  // Otherwise, respect the toolbar visibility setting
  const effectiveVisible = showCoordinates || layerVisibility.hexCoordinates;
  
  // Don't render if not effectively visible or not a hex map
  if (!effectiveVisible || !geometry || !mapData || mapData.mapType !== 'hex') {
    return null;
  }
  
  const canvas = canvasRef.current;
  if (!canvas) return null;
  
  // Get coordinate display settings from map settings (with defaults)
  const displayMode = mapData.settings?.coordinateDisplayMode || 'rectangular';
  
  // Get effective color settings (merges global with map-specific overrides)
  const effectiveSettings = getEffectiveSettings(mapData.settings);
  const textColor = effectiveSettings.coordinateTextColor || '#ffffff';
  const shadowColor = effectiveSettings.coordinateTextShadow || '#000000';
  
  // Calculate visible hexes with display positions and labels
  const { hexes: visibleHexes, scaleX } = getVisibleHexes(
    geometry, mapData, canvas, displayMode
  );
  
  // Calculate font size based on hex size and zoom, scaled to display coordinates
  const zoom = mapData.viewState.zoom;
  const hexSize = geometry.hexSize;
  const canvasFontSize = hexSize * zoom * 0.35;
  const fontSize = Math.max(8, Math.min(24, canvasFontSize * scaleX));
  
  // Determine if we should fade labels slightly (at very low zoom)
  const shouldFade = zoom < 0.4;
  const baseOpacity = shouldFade ? 0.7 : 0.85;
  
  // Generate text-shadow CSS for readability
  const textShadow = `
    -1px -1px 0 ${shadowColor},
    1px -1px 0 ${shadowColor},
    -1px 1px 0 ${shadowColor},
    1px 1px 0 ${shadowColor},
    0 0 4px ${shadowColor},
    0 0 8px ${shadowColor}
  `.trim();
  
  return (
    <div className="dmt-coordinate-layer">
      {visibleHexes.map(({ q, r, displayX, displayY, label }) => {
        return (
          <div
            key={`coord-${q}-${r}`}
            className="dmt-hex-coordinate"
            style={{
              position: 'absolute',
              left: `${displayX}px`,
              top: `${displayY}px`,
              transform: 'translate(-50%, -50%)',
              fontSize: `${fontSize}px`,
              opacity: baseOpacity,
              color: textColor,
              textShadow: textShadow
            }}
          >
            {label}
          </div>
        );
      })}
    </div>
  );
};

return { HexCoordinateLayer };
```

# distanceOperations

```js
/**
 * distanceOperations.js
 * 
 * Utilities for distance measurement formatting and settings resolution.
 * Used by the distance measurement tool to format display output and
 * resolve effective settings from global defaults and per-map overrides.
 */

const { DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));

/**
 * Format a distance measurement for display
 * @param {number} cellDistance - Distance in cells
 * @param {number} distancePerCell - Real-world units per cell
 * @param {string} unit - Unit string (e.g., 'ft', 'mi', 'm', 'km')
 * @param {string} displayFormat - 'cells' | 'units' | 'both'
 * @returns {string} Formatted distance string
 */
function formatDistance(cellDistance, distancePerCell, unit, displayFormat) {
  const totalDistance = cellDistance * distancePerCell;
  
  // Round for cleaner display (1 decimal if needed, no trailing zeros)
  const roundedCells = Number.isInteger(cellDistance) 
    ? cellDistance 
    : Math.round(cellDistance * 10) / 10;
  const roundedDistance = Number.isInteger(totalDistance) 
    ? totalDistance 
    : Math.round(totalDistance * 10) / 10;
  
  const cellLabel = roundedCells === 1 ? 'cell' : 'cells';
  const unitDisplay = unit || '';
  
  switch (displayFormat) {
    case 'cells':
      return `${roundedCells} ${cellLabel}`;
    case 'units':
      return `${roundedDistance} ${unitDisplay}`.trim();
    case 'both':
    default:
      if (unitDisplay) {
        return `${roundedCells} ${cellLabel} (${roundedDistance} ${unitDisplay})`;
      }
      return `${roundedCells} ${cellLabel}`;
  }
}

/**
 * Get effective distance settings for a map
 * Merges global defaults with per-map overrides
 * @param {string} mapType - 'grid' or 'hex'
 * @param {Object} globalSettings - Settings from plugin or fallbacks
 * @param {Object} mapOverrides - Per-map distance settings (or null)
 * @returns {Object} Resolved distance settings
 */
function getEffectiveDistanceSettings(mapType, globalSettings, mapOverrides) {
  const isHex = mapType === 'hex';
  
  // Get appropriate defaults based on map type
  const defaultPerCell = isHex 
    ? (globalSettings?.distancePerCellHex ?? DEFAULTS.distance.perCellHex)
    : (globalSettings?.distancePerCellGrid ?? DEFAULTS.distance.perCellGrid);
  const defaultUnit = isHex
    ? (globalSettings?.distanceUnitHex ?? DEFAULTS.distance.unitHex)
    : (globalSettings?.distanceUnitGrid ?? DEFAULTS.distance.unitGrid);
  
  return {
    distancePerCell: mapOverrides?.distancePerCell ?? defaultPerCell,
    distanceUnit: mapOverrides?.distanceUnit ?? defaultUnit,
    gridDiagonalRule: mapOverrides?.gridDiagonalRule ?? globalSettings?.gridDiagonalRule ?? DEFAULTS.distance.gridDiagonalRule,
    displayFormat: mapOverrides?.displayFormat ?? globalSettings?.distanceDisplayFormat ?? DEFAULTS.distance.displayFormat
  };
}

return { formatDistance, getEffectiveDistanceSettings };
```

# useDistanceMeasurement

```js
/**
 * useDistanceMeasurement.js
 * 
 * Hook for distance measurement tool state and calculations.
 * Handles origin selection, live distance updates, and formatting.
 * Supports both mouse (live updates) and touch (tap-to-tap) modes.
 */

const { formatDistance, getEffectiveDistanceSettings } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "distanceOperations"));

/**
 * Hook for managing distance measurement state
 * @param {string} currentTool - Current active tool
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {string} mapType - 'grid' or 'hex'
 * @param {Object} globalSettings - Global settings from plugin
 * @param {Object} mapDistanceOverrides - Per-map distance settings (or null)
 */
const useDistanceMeasurement = (currentTool, geometry, mapType, globalSettings, mapDistanceOverrides) => {
  const [measureOrigin, setMeasureOrigin] = dc.useState(null);
  const [currentDistance, setCurrentDistance] = dc.useState(null);
  const [currentTarget, setCurrentTarget] = dc.useState(null);
  const [isTargetLocked, setIsTargetLocked] = dc.useState(false);
  
  // Get resolved distance settings
  const distanceSettings = dc.useMemo(() => {
    return getEffectiveDistanceSettings(mapType, globalSettings, mapDistanceOverrides);
  }, [mapType, globalSettings, mapDistanceOverrides]);
  
  // Clear state when tool changes away from measure
  dc.useEffect(() => {
    if (currentTool !== 'measure') {
      setMeasureOrigin(null);
      setCurrentDistance(null);
      setCurrentTarget(null);
      setIsTargetLocked(false);
    }
  }, [currentTool]);
  
  /**
   * Calculate distance between origin and a target point
   */
  const calculateDistance = dc.useCallback((targetX, targetY) => {
    if (!measureOrigin || !geometry) return 0;
    
    return geometry.getCellDistance(
      measureOrigin.x, measureOrigin.y,
      targetX, targetY,
      { diagonalRule: distanceSettings.gridDiagonalRule }
    );
  }, [measureOrigin, geometry, distanceSettings.gridDiagonalRule]);
  
  /**
   * Handle click/tap - behavior depends on current state and input type
   * @param {number} cellX - Cell X coordinate (gridX or q)
   * @param {number} cellY - Cell Y coordinate (gridY or r)
   * @param {boolean} isTouch - Whether this is a touch event
   */
  const handleMeasureClick = dc.useCallback((cellX, cellY, isTouch = false) => {
    if (!measureOrigin) {
      // First click/tap - set origin
      setMeasureOrigin({ x: cellX, y: cellY });
      setCurrentTarget({ x: cellX, y: cellY });
      setCurrentDistance(0);
      setIsTargetLocked(false);
    } else if (isTouch && !isTargetLocked) {
      // Touch: second tap sets and locks target
      setCurrentTarget({ x: cellX, y: cellY });
      setCurrentDistance(calculateDistance(cellX, cellY));
      setIsTargetLocked(true);
    } else {
      // Mouse: second click clears
      // Touch: third tap (after target locked) clears
      setMeasureOrigin(null);
      setCurrentDistance(null);
      setCurrentTarget(null);
      setIsTargetLocked(false);
    }
  }, [measureOrigin, isTargetLocked, calculateDistance]);
  
  /**
   * Handle cursor move - update live distance (mouse only, not when locked)
   * @param {number} cellX - Cell X coordinate (gridX or q)
   * @param {number} cellY - Cell Y coordinate (gridY or r)
   */
  const handleMeasureMove = dc.useCallback((cellX, cellY) => {
    // Don't update if no origin, locked target, or no geometry
    if (!measureOrigin || isTargetLocked || !geometry) return;
    
    setCurrentTarget({ x: cellX, y: cellY });
    setCurrentDistance(calculateDistance(cellX, cellY));
  }, [measureOrigin, isTargetLocked, geometry, calculateDistance]);
  
  /**
   * Get formatted distance string
   */
  const formattedDistance = dc.useMemo(() => {
    if (currentDistance === null) return null;
    
    return formatDistance(
      currentDistance,
      distanceSettings.distancePerCell,
      distanceSettings.distanceUnit,
      distanceSettings.displayFormat
    );
  }, [currentDistance, distanceSettings]);
  
  /**
   * Clear measurement manually
   */
  const clearMeasurement = dc.useCallback(() => {
    setMeasureOrigin(null);
    setCurrentDistance(null);
    setCurrentTarget(null);
    setIsTargetLocked(false);
  }, []);
  
  return {
    // State
    measureOrigin,
    currentTarget,
    currentDistance,
    formattedDistance,
    distanceSettings,
    isTargetLocked,
    
    // Handlers
    handleMeasureClick,
    handleMeasureMove,
    clearMeasurement
  };
};

return { useDistanceMeasurement };
```

# MeasurementOverlay

```jsx
/**
 * MeasurementOverlay.jsx
 * 
 * Visual overlay for distance measurement tool.
 * Draws a dashed line from origin to current cursor position
 * and displays the calculated distance in an auto-sized tooltip
 * anchored near the target cell.
 */

const { GridGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "GridGeometry"));

/**
 * Convert cell coordinates to screen coordinates
 * Uses the same calculation pattern as DrawingLayer and useCanvasRenderer
 * 
 * @param {number} cellX - Cell X coordinate
 * @param {number} cellY - Cell Y coordinate
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {Object} mapData - Map data containing viewState
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {{x: number, y: number}} Screen coordinates
 */
function cellToScreen(cellX, cellY, geometry, mapData, canvasWidth, canvasHeight) {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection || 0;
  
  // Get cell center in world coordinates
  let worldX, worldY;
  if (geometry.getCellCenter) {
    const cellCenter = geometry.getCellCenter(cellX, cellY);
    worldX = cellCenter.worldX;
    worldY = cellCenter.worldY;
  } else if (geometry.getHexCenter) {
    const hexCenter = geometry.getHexCenter(cellX, cellY);
    worldX = hexCenter.worldX;
    worldY = hexCenter.worldY;
  } else {
    worldX = cellX;
    worldY = cellY;
  }
  
  // Calculate offset based on geometry type (same as useCanvasRenderer)
  let offsetX, offsetY;
  if (geometry instanceof GridGeometry) {
    const scaledCellSize = geometry.getScaledCellSize(zoom);
    offsetX = canvasWidth / 2 - center.x * scaledCellSize;
    offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  } else {
    // HexGeometry: center is in world pixel coordinates
    offsetX = canvasWidth / 2 - center.x * zoom;
    offsetY = canvasHeight / 2 - center.y * zoom;
  }
  
  // Convert world to screen
  let screenX = offsetX + worldX * zoom;
  let screenY = offsetY + worldY * zoom;
  
  // Apply rotation if needed
  if (northDirection !== 0) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    screenX -= centerX;
    screenY -= centerY;
    
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
    const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
    
    screenX = rotatedX + centerX;
    screenY = rotatedY + centerY;
  }
  
  return { x: screenX, y: screenY };
}

const MeasurementOverlay = ({
  measureOrigin,
  currentTarget,
  formattedDistance,
  isTargetLocked = false,
  geometry,
  mapData,
  canvasRef
}) => {
  const textRef = dc.useRef(null);
  const [textWidth, setTextWidth] = dc.useState(80);
  
  // Measure text width for auto-sizing tooltip
  dc.useEffect(() => {
    if (textRef.current && formattedDistance) {
      const bbox = textRef.current.getBBox();
      setTextWidth(Math.max(bbox.width + 20, 60));
    }
  }, [formattedDistance]);
  
  if (!measureOrigin || !currentTarget || !geometry || !mapData || !canvasRef?.current) {
    return null;
  }
  
  // Get canvas dimensions (same approach as DrawingLayer)
  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;
  
  // Get canvas offset within its container (SVG is positioned relative to container)
  const containerRect = canvas.parentElement?.getBoundingClientRect();
  const canvasOffsetX = containerRect ? canvasRect.left - containerRect.left : 0;
  const canvasOffsetY = containerRect ? canvasRect.top - containerRect.top : 0;
  
  // Calculate screen coordinates for origin and target
  const originScreen = cellToScreen(
    measureOrigin.x, measureOrigin.y,
    geometry, mapData, canvasWidth, canvasHeight
  );
  const targetScreen = cellToScreen(
    currentTarget.x, currentTarget.y,
    geometry, mapData, canvasWidth, canvasHeight
  );
  
  // Apply display scale and canvas offset (canvas may be offset within container due to sidebar)
  const scaledOrigin = {
    x: originScreen.x * displayScale + canvasOffsetX,
    y: originScreen.y * displayScale + canvasOffsetY
  };
  const scaledTarget = {
    x: targetScreen.x * displayScale + canvasOffsetX,
    y: targetScreen.y * displayScale + canvasOffsetY
  };
  
  const tooltipX = scaledTarget.x + 15;
  const tooltipY = scaledTarget.y - 30;
  
  return (
    <svg 
      className="dmt-measurement-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
        overflow: 'visible'
      }}
    >
      {/* Measurement line - solid when locked, dashed when live */}
      <line
        x1={scaledOrigin.x}
        y1={scaledOrigin.y}
        x2={scaledTarget.x}
        y2={scaledTarget.y}
        stroke="#c4a57b"
        strokeWidth={2}
        strokeDasharray={isTargetLocked ? "none" : "8,4"}
        strokeLinecap="round"
      />
      
      {/* Origin marker */}
      <circle
        cx={scaledOrigin.x}
        cy={scaledOrigin.y}
        r={8}
        fill="rgba(196, 165, 123, 0.8)"
        stroke="#c4a57b"
        strokeWidth={2}
      />
      
      {/* Target marker - larger and more opaque when locked */}
      <circle
        cx={scaledTarget.x}
        cy={scaledTarget.y}
        r={isTargetLocked ? 6 : 5}
        fill={isTargetLocked ? "rgba(196, 165, 123, 0.9)" : "rgba(196, 165, 123, 0.6)"}
        stroke="#c4a57b"
        strokeWidth={isTargetLocked ? 2 : 1.5}
      />
      
      {/* Distance tooltip */}
      {formattedDistance && (
        <g transform={`translate(${tooltipX}, ${tooltipY})`}>
          <rect
            x={0}
            y={-14}
            width={textWidth}
            height={28}
            rx={4}
            fill="rgba(26, 26, 26, 0.95)"
            stroke="#c4a57b"
            strokeWidth={1}
          />
          <text
            ref={textRef}
            x={textWidth / 2}
            y={5}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={13}
            fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
            fontWeight="500"
          >
            {formattedDistance}
          </text>
        </g>
      )}
    </svg>
  );
};

return { MeasurementOverlay };
```

# MeasurementLayer

```jsx
/**
 * MeasurementLayer.jsx
 * 
 * Layer component for distance measurement tool.
 * Combines the measurement hook, overlay rendering, and event handler registration.
 * 
 * Usage:
 * <MapCanvas.MeasurementLayer
 *   currentTool={currentTool}
 *   globalSettings={globalSettings}
 *   mapDistanceOverrides={mapData.distanceSettings}
 * />
 */

const { useDistanceMeasurement } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useDistanceMeasurement"));
const { MeasurementOverlay } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MeasurementOverlay"));
const { useMapState } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));

const MeasurementLayer = ({
  currentTool,
  globalSettings,
  mapDistanceOverrides
}) => {
  const { 
    mapData, 
    geometry,
    canvasRef
  } = useMapState();
  
  const mapType = mapData?.mapType || 'grid';
  
  // Use the distance measurement hook
  const {
    measureOrigin,
    currentTarget,
    formattedDistance,
    isTargetLocked,
    handleMeasureClick,
    handleMeasureMove,
    clearMeasurement
  } = useDistanceMeasurement(
    currentTool,
    geometry,
    mapType,
    globalSettings,
    mapDistanceOverrides
  );
  
  // Register handlers with event coordinator
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('measure', {
      handleMeasureClick,
      handleMeasureMove,
      clearMeasurement,
      measureOrigin
    });
    return () => unregisterHandlers('measure');
  }, [registerHandlers, unregisterHandlers, handleMeasureClick, handleMeasureMove, clearMeasurement, measureOrigin]);
  
  // Only render overlay when measure tool is active and we have an origin
  if (currentTool !== 'measure' || !measureOrigin) {
    return null;
  }
  
  return (
    <MeasurementOverlay
      measureOrigin={measureOrigin}
      currentTarget={currentTarget}
      formattedDistance={formattedDistance}
      isTargetLocked={isTargetLocked}
      geometry={geometry}
      mapData={mapData}
      canvasRef={canvasRef}
    />
  );
};

return { MeasurementLayer };
```

# usePanZoomCoordinator

```js
const { useCanvasInteraction } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useCanvasInteraction"));
const { useEventHandlerRegistration } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));

/**
 * usePanZoomCoordinator.js
 * 
 * Coordinator hook that handles pan and zoom interactions:
 * - Mouse wheel zoom
 * - Space + drag pan
 * - Select tool drag pan (on empty space)
 * - Touch pinch-to-zoom
 * - Touch two-finger pan
 * - Middle-click pan
 * 
 * Registers pan/zoom handlers with EventHandlerContext for event coordination.
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */
const usePanZoomCoordinator = ({
  canvasRef,
  mapData,
  geometry,
  onViewStateChange,
  isFocused
}) => {
  // Use canvas interaction hook for pan/zoom logic
  const {
    isPanning,
    isTouchPanning,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,
    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,
    handleWheel,
    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,
    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance,
    setSpaceKeyPressed
  } = useCanvasInteraction(canvasRef, mapData, geometry, onViewStateChange, isFocused);
  
  // Register pan/zoom handlers with EventHandlerContext for event coordination
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register pan/zoom handlers and state when they change
  dc.useEffect(() => {
    registerHandlers('panZoom', {
      // Pan handlers
      startPan,
      updatePan,
      stopPan,
      // Touch pan handlers
      startTouchPan,
      updateTouchPan,
      stopTouchPan,
      // Zoom handler
      handleWheel,
      // Helper functions
      getClientCoords,
      getTouchCenter,
      getTouchDistance,
      screenToGrid,
      // State for coordination
      isPanning,
      isTouchPanning,
      panStart,
      touchPanStart,
      spaceKeyPressed,
      lastTouchTimeRef,
      initialPinchDistance,
      // State setters (for coordination layer to manage state)
      setIsPanning,
      setIsTouchPanning,
      setPanStart,
      setTouchPanStart,
      setInitialPinchDistance
    });
    
    return () => unregisterHandlers('panZoom');
  }, [
    registerHandlers, unregisterHandlers,
    startPan, updatePan, stopPan,
    startTouchPan, updateTouchPan, stopTouchPan,
    handleWheel,
    getClientCoords, getTouchCenter, getTouchDistance, screenToGrid,
    isPanning, isTouchPanning, panStart, touchPanStart, spaceKeyPressed, initialPinchDistance,
    setIsPanning, setIsTouchPanning, setPanStart, setTouchPanStart, setInitialPinchDistance
  ]);
  
  // Coordinator hooks don't return anything - they just set up behavior
};

// Datacore export
return { usePanZoomCoordinator };
```

# useEventCoordinator

```js
const { useMapState } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { useRegisteredHandlers } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));

/**
 * useEventCoordinator.js
 * 
 * Coordinator hook that manages pointer event coordination across all interaction layers.
 * Attaches event listeners to canvas and routes events to registered handlers
 * based on current tool, modifier keys, touch state, and selection state.
 * 
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */
const useEventCoordinator = ({
  isColorPickerOpen,
  showObjectColorPicker = false
}) => {
  // Get shared state from contexts
  const { canvasRef, currentTool } = useMapState();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, setDragStart, layerVisibility } = useMapSelection();
  const { getHandlers } = useRegisteredHandlers();
  
  // Local state for multi-touch and pending actions
  const [recentMultiTouch, setRecentMultiTouch] = dc.useState(false);
  const [pendingToolAction, setPendingToolAction] = dc.useState(null);
  const pendingToolTimeoutRef = dc.useRef(null);
  
  // Track pan start position for click vs drag detection
  const panStartPositionRef = dc.useRef(null);
  const panMoveThreshold = 5; // pixels
  
  /**
   * Handle pointer down events
   * Routes to appropriate layer handlers based on current tool
   */
  const handlePointerDown = dc.useCallback((e) => {
    // Get registered handlers for each layer
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const notePinHandlers = getHandlers('notePin');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    
    if (!panZoomHandlers) return; // Need pan/zoom handlers at minimum
    
    const {
      getClientCoords,
      screenToGrid,
      lastTouchTimeRef,
      getTouchCenter,
      getTouchDistance,
      startPan,
      startTouchPan,
      setInitialPinchDistance,
      spaceKeyPressed
    } = panZoomHandlers;
    
    // Ignore synthetic mousedown events that occur shortly after touchstart
    if (e.type === 'mousedown') {
      const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
      if (timeSinceTouch < 500) {
        return;
      }
    }
    
    // Track touch events
    if (e.type === 'touchstart') {
      lastTouchTimeRef.current = Date.now();
    }
    
    // If color picker is open, check if this click is outside of it
    if (isColorPickerOpen || showObjectColorPicker) {
      const pickerElement = e.target.closest('.dmt-color-picker');
      const toolBtnElement = e.target.closest('.dmt-color-tool-btn');
      const objectBtnElement = e.target.closest('.dmt-object-color-button');
      
      if (!pickerElement && !toolBtnElement && !objectBtnElement) {
        return; // Click outside - let color picker handlers close it
      }
    }
    
    // Handle two-finger touch (pan/pinch)
    if (e.touches && e.touches.length === 2) {
      // Check if any touches are on color picker
      if (isColorPickerOpen || showObjectColorPicker) {
        const touch1Target = document.elementFromPoint(e.touches[0].clientX, e.touches[0].clientY);
        const touch2Target = document.elementFromPoint(e.touches[1].clientX, e.touches[1].clientY);
        
        const pickerOrButton1 = touch1Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');
        const pickerOrButton2 = touch2Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');
        
        if (pickerOrButton1 || pickerOrButton2) {
          return;
        }
      }
      
      e.preventDefault();
      e.stopPropagation();
      
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
      
      setRecentMultiTouch(true);
      const center = getTouchCenter(e.touches);
      const distance = getTouchDistance(e.touches);
      if (center && distance) {
        startTouchPan(center);
        setInitialPinchDistance(distance);
      }
      return;
    }
    
    if (recentMultiTouch || panZoomHandlers.isTouchPanning) {
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;
    
    // Extract coordinates - handle both grid {gridX, gridY} and hex {q, r} formats
    // Objects and operations expect properties named x/y regardless of geometry type
    const gridX = coords.gridX !== undefined ? coords.gridX : coords.q;
    const gridY = coords.gridY !== undefined ? coords.gridY : coords.r;
    
    
    // Capture event properties before any delays (for touch event pooling)
    const eventType = e.type;
    const isTouchEvent = !!e.touches;
    const targetElement = e.target;
    
    const syntheticEvent = {
      type: eventType,
      clientX: clientX,
      clientY: clientY,
      preventDefault: () => {},
      stopPropagation: () => {},
      target: targetElement
    };
    
    // Function to execute the tool action
    const executeToolAction = () => {
      // Space key override - start panning
      if (spaceKeyPressed && !isTouchEvent) {
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        return;
      }
      
      // Route to appropriate handler based on current tool
      if (currentTool === 'select') {
        // Try object selection first (only if objects layer is visible)
        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY);
          if (objectHandled) return;
        }
        
        // Try text selection (only if text labels layer is visible)
        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }
        
        // Nothing selected - start panning with select tool on empty space
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        
      } else if (currentTool === 'draw' || currentTool === 'erase' || 
                 currentTool === 'rectangle' || currentTool === 'circle' || 
                 currentTool === 'clearArea' || currentTool === 'line' ||
                 currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
                 currentTool === 'edgeLine') {
        // Drawing tools (including edge tools)
        if (drawingHandlers?.handleDrawingPointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          drawingHandlers.handleDrawingPointerDown(eventToUse, gridX, gridY);
        }
        
      } else if (currentTool === 'addObject') {
        // Skip if objects layer is hidden
        if (!layerVisibility.objects) return;
        
        // Try Note Pin placement first
        if (notePinHandlers?.handleNotePinPlacement) {
          const notePinHandled = notePinHandlers.handleNotePinPlacement(gridX, gridY);
          if (notePinHandled) return;
        }
        
        // Fall back to regular object placement (pass raw coords for edge snap)
        if (objectHandlers?.handleObjectPlacement) {
          objectHandlers.handleObjectPlacement(gridX, gridY, clientX, clientY);
        }
        
      } else if (currentTool === 'addText') {
        // Skip if text labels layer is hidden
        if (!layerVisibility.textLabels) return;
        
        if (textHandlers?.handleTextPlacement) {
          textHandlers.handleTextPlacement(clientX, clientY);
        }
        
      } else if (currentTool === 'measure') {
        // Distance measurement tool
        if (measureHandlers?.handleMeasureClick) {
          measureHandlers.handleMeasureClick(gridX, gridY, isTouchEvent);
        }
      }
    };
    
    // For touch events, add delay to distinguish from pan gestures
    if (isTouchEvent) {
      setPendingToolAction({ execute: executeToolAction });
      pendingToolTimeoutRef.current = setTimeout(() => {
        executeToolAction();
        setPendingToolAction(null);
        pendingToolTimeoutRef.current = null;
      }, 50); // 50ms delay for touch
    } else {
      // Mouse events execute immediately
      executeToolAction();
    }
  }, [currentTool, isColorPickerOpen, showObjectColorPicker, recentMultiTouch, selectedItem, getHandlers, layerVisibility]);
  
  /**
   * Handle pointer move events
   * Routes to dragging/resizing handlers or hover updates
   */
  const handlePointerMove = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    
    if (!panZoomHandlers) return;
    
    const { 
      getClientCoords, 
      isTouchPanning, 
      updateTouchPan,
      isPanning,
      updatePan,
      panStart,
      touchPanStart
    } = panZoomHandlers;
    
    const { clientX, clientY } = getClientCoords(e);
    
    // Handle touch pan with 2 fingers
    if (e.touches && e.touches.length === 2 && isTouchPanning && touchPanStart) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
      e.preventDefault();
      e.stopPropagation();
      updateTouchPan(e.touches);
      return;
    }
    
    // Handle middle-button pan
    if (isPanning && panStart) {
      e.preventDefault();
      updatePan(clientX, clientY);
      return;
    }
    
    // For multi-touch (non-panning), clear pending actions
    if (e.touches && e.touches.length > 1) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
    }
    
    // Handle resize mode (skip if objects hidden)
    if (layerVisibility.objects && objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.handleObjectResizing) {
        objectHandlers.handleObjectResizing(e);
      }
      return;
    }
    
    // Handle dragging selection (respect layer visibility)
    if (isDraggingSelection && selectedItem) {
      if (selectedItem.type === 'object' && layerVisibility.objects && objectHandlers?.handleObjectDragging) {
        objectHandlers.handleObjectDragging(e);
      } else if (selectedItem.type === 'text' && layerVisibility.textLabels && textHandlers?.handleTextDragging) {
        textHandlers.handleTextDragging(e);
      }
      return;
    }
    
    // Handle drawing tools (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine') {
      if (drawingHandlers?.handleDrawingPointerMove) {
        drawingHandlers.handleDrawingPointerMove(e);
      }
      // Update hover only if objects visible
      if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
        objectHandlers.handleHoverUpdate(e);
      }
      return;
    }
    
    // Handle measure tool - live distance updates
    if (currentTool === 'measure' && measureHandlers?.handleMeasureMove) {
      // Get grid coordinates for measure update
      const { screenToGrid } = panZoomHandlers;
      if (screenToGrid) {
        const coords = screenToGrid(clientX, clientY);
        const gridX = coords.gridX !== undefined ? coords.gridX : coords.q;
        const gridY = coords.gridY !== undefined ? coords.gridY : coords.r;
        measureHandlers.handleMeasureMove(gridX, gridY);
      }
      return;
    }
    
    // Update hover state for objects (only if objects layer is visible)
    if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
      objectHandlers.handleHoverUpdate(e);
    }
  }, [currentTool, isDraggingSelection, selectedItem, getHandlers, layerVisibility]);
  
  /**
   * Handle pointer up events
   * Stops dragging, resizing, drawing, panning
   */
  const handlePointerUp = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    
    if (!panZoomHandlers) return;
    
    const { 
      getClientCoords,
      stopPan,
      isPanning 
    } = panZoomHandlers;
    
    // Reset multi-touch flag after a delay
    if (recentMultiTouch) {
      setTimeout(() => setRecentMultiTouch(false), 300);
    }
    
    // Stop panning
    if (isPanning) {
      stopPan();
      
      // Check if this was a click (no movement) vs a drag with select tool
      if (currentTool === 'select' && panStartPositionRef.current) {
        const { clientX, clientY } = getClientCoords(e);
        const deltaX = Math.abs(clientX - panStartPositionRef.current.x);
        const deltaY = Math.abs(clientY - panStartPositionRef.current.y);
        
        // If mouse/finger didn't move much, treat as a deselect click
        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold && selectedItem) {
          // If in edge snap mode (for objects), first tap-off exits snap mode
          // Second tap-off (or first when not in snap mode) deselects
          if (selectedItem.type === 'object' && objectHandlers?.edgeSnapMode) {
            objectHandlers.setEdgeSnapMode(false);
          } else {
            setSelectedItem(null);
          }
        }
        
        panStartPositionRef.current = null;
      }
      
      return;
    }
    
    // Handle resize mode
    if (objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      return;
    }
    
    // Handle dragging
    if (isDraggingSelection) {
      if (selectedItem?.type === 'object' && objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      } else if (selectedItem?.type === 'text' && textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }
      return;
    }
    
    // Handle drawing tools (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine') {
      if (drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing(e);
      }
    }
  }, [currentTool, recentMultiTouch, isDraggingSelection, selectedItem, setSelectedItem, getHandlers]);
  
  /**
   * Handle pointer leave events
   * Cancels pending actions and in-progress drawing
   */
  const handlePointerLeave = dc.useCallback((e) => {
    const drawingHandlers = getHandlers('drawing');
    
    // Clear pending tool action
    if (pendingToolTimeoutRef.current) {
      clearTimeout(pendingToolTimeoutRef.current);
      pendingToolTimeoutRef.current = null;
      setPendingToolAction(null);
    }
    
    // Cancel any in-progress drawing (including edge tools)
    if (currentTool === 'draw' || currentTool === 'erase' || 
        currentTool === 'rectangle' || currentTool === 'circle' || 
        currentTool === 'line' || currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' || 
        currentTool === 'edgeLine') {
      if (drawingHandlers?.cancelDrawing) {
        drawingHandlers.cancelDrawing();
      }
    }
  }, [currentTool, getHandlers]);
  
  /**
   * Handle middle mouse button for panning
   */
  const handlePanStart = dc.useCallback((e) => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;
    
    if (e.button === 1) {
      e.preventDefault();
      panZoomHandlers.startPan(e.clientX, e.clientY);
    }
  }, [getHandlers]);
  
  const handlePanEnd = dc.useCallback((e) => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;
    
    if (panZoomHandlers.isPanning && e.button === 1) {
      e.preventDefault();
      panZoomHandlers.stopPan();
    }
  }, [getHandlers]);
  
  /**
   * Handle wheel events for zoom or object scaling
   */
  const handleWheel = dc.useCallback((e) => {
    // First, check if we should scale an object (when hovering over selected object)
    const objectHandlers = getHandlers('object');
    if (objectHandlers?.handleObjectWheel) {
      const handled = objectHandlers.handleObjectWheel(e);
      if (handled) return;
    }
    
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers?.handleWheel) return;
    
    // Skip zoom if actively panning with middle mouse button
    // This prevents conflicts between pan and zoom operations
    if (panZoomHandlers.isPanning) {
      return;
    }
    
    panZoomHandlers.handleWheel(e);
  }, [getHandlers]);
  
  /**
   * Handle double-click for text editing
   */
  const handleCanvasDoubleClick = dc.useCallback((e) => {
    const textHandlers = getHandlers('text');
    if (!textHandlers?.handleCanvasDoubleClick) return;
    
    textHandlers.handleCanvasDoubleClick(e);
  }, [getHandlers]);
  
  // Attach event listeners to canvas
  dc.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const handleMouseDown = (e) => {
      if (e.button === 1) {
        handlePanStart(e);
      } else {
        handlePointerDown(e);
      }
    };
    
    const handleMouseUp = (e) => {
      handlePanEnd(e);
      handlePointerUp(e);
    };
    
    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handlePointerDown);
    canvas.addEventListener('mousemove', handlePointerMove);
    canvas.addEventListener('touchmove', handlePointerMove);
    canvas.addEventListener('touchend', handlePointerUp);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    
    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handlePointerDown);
      canvas.removeEventListener('mousemove', handlePointerMove);
      canvas.removeEventListener('touchmove', handlePointerMove);
      canvas.removeEventListener('touchend', handlePointerUp);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleCanvasDoubleClick);
      canvas.removeEventListener('contextmenu', (e) => e.preventDefault());
    };
  }, [
    canvasRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePanStart,
    handlePanEnd,
    handleWheel,
    handleCanvasDoubleClick
  ]);
  
  // Add global pointer up listener for cleanup
  dc.useEffect(() => {
    const handleGlobalPointerUp = (e) => {
      const drawingHandlers = getHandlers('drawing');
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      const panZoomHandlers = getHandlers('panZoom');
      
      if (drawingHandlers?.isDrawing && drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing();
      }
      
      if (panZoomHandlers?.isPanning && e.button === 1) {
        panZoomHandlers.stopPan();
      }
      
      if (panZoomHandlers?.isTouchPanning) {
        panZoomHandlers.stopTouchPan();
        setTimeout(() => setRecentMultiTouch(false), 100);
      }
      
      if (objectHandlers?.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      
      if (objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      }
      
      if (textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }
      
      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }
    };
    
    const handleGlobalMouseMove = (e) => {
      const panZoomHandlers = getHandlers('panZoom');
      if (panZoomHandlers?.isPanning && panZoomHandlers?.updatePan) {
        panZoomHandlers.updatePan(e.clientX, e.clientY);
      }
    };
    
    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp);
    window.addEventListener('mousemove', handleGlobalMouseMove);
    
    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDraggingSelection, setIsDraggingSelection, setDragStart, getHandlers]);
  
  /**
   * Handle keyboard events
   * Dispatches to registered layer handlers for keyboard shortcuts
   */
  dc.useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't handle keyboard events when typing in inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      
      // Get registered handlers
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      
      // Try object handlers first (for rotation, deletion, etc.)
      if (objectHandlers?.handleObjectKeyDown) {
        const handled = objectHandlers.handleObjectKeyDown(e);
        if (handled) return;
      }
      
      // Try text label handlers
      if (textHandlers?.handleTextLabelKeyDown) {
        const handled = textHandlers.handleTextLabelKeyDown(e);
        if (handled) return;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getHandlers]);
  
  // Clean up pending tool timeout on unmount
  dc.useEffect(() => {
    return () => {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
      }
    };
  }, []);
  
  // Coordinator hooks don't return anything - they just set up behavior
};

return { useEventCoordinator };
```

# MapCanvas

```jsx
const { useCanvasRenderer, renderCanvas } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useCanvasRenderer"));
const { useCanvasInteraction } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useCanvasInteraction"));
const { GridGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "GridGeometry"));
const { DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));
const { getObjectAtPosition, addObject, removeObject, removeObjectAtPosition, removeObjectsInRectangle, updateObject, isAreaFree, canResizeObject } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectOperations"));
const { addTextLabel, getTextLabelAtPosition, removeTextLabel, updateTextLabel } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "textLabelOperations"));
const { HexGeometry } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "HexGeometry"));
const { LinkedNoteHoverOverlays } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "LinkedNoteHoverOverlays"));
const { MapStateProvider, MapOperationsProvider } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapContext"));
const { MapSelectionProvider, useMapSelection } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSelectionContext"));
const { ObjectLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ObjectLayer"));
const { DrawingLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "DrawingLayer"));
const { TextLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "TextLayer"));
const { NotePinLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "NotePinLayer"));
const { EventHandlerProvider } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "EventHandlerContext"));
const { HexCoordinateLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "HexCoordinateLayer"));
const { MeasurementLayer } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MeasurementLayer"));
const { getSetting } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));
const { usePanZoomCoordinator } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "usePanZoomCoordinator"));
const { useEventCoordinator } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useEventCoordinator"));

/**
 * Coordinators - Internal component that calls coordinator hooks
 * This component must be rendered inside the Context provider tree
 * so the hooks have access to MapState, MapSelection, and EventHandler contexts.
 * Returns null (no visual rendering) - only manages behavioral coordination.
 */
const Coordinators = ({ canvasRef, mapData, geometry, onViewStateChange, isFocused, isColorPickerOpen }) => {
  // Coordinator hooks need to be called inside the provider tree
  usePanZoomCoordinator({
    canvasRef,
    mapData,
    geometry,
    onViewStateChange,
    isFocused
  });

  useEventCoordinator({
    canvasRef,
    isColorPickerOpen,
    showObjectColorPicker: false
  });

  return null; // No UI - coordinators only manage behavior
};

/**
 * MapCanvasContent - Inner component that uses context hooks
 * Contains all the map canvas logic and interacts with shared selection state
 */
const MapCanvasContent = ({ mapData, onCellsChange, onObjectsChange, onTextLabelsChange, onEdgesChange, currentTool, onViewStateChange, selectedObjectType, selectedColor, isColorPickerOpen, customColors, onAddCustomColor, onDeleteCustomColor, isFocused, isAnimating, theme, children }) => {
  const canvasRef = dc.useRef(null);
  const containerRef = dc.useRef(null);
  const [canvasDimensions, setCanvasDimensions] = dc.useState({
    width: DEFAULTS.canvasSize.width,
    height: DEFAULTS.canvasSize.height
  });

  // Use shared selection from context (same state ObjectLayer uses)
  const {
    selectedItem, setSelectedItem,
    isDraggingSelection, setIsDraggingSelection,
    dragStart, setDragStart,
    isResizeMode, setIsResizeMode,
    hoveredObject, setHoveredObject,
    mousePosition, setMousePosition,
    showNoteLinkModal, setShowNoteLinkModal,
    pendingNotePinId, setPendingNotePinId,
    editingNoteObjectId, setEditingNoteObjectId,
    showCoordinates, setShowCoordinates,
    layerVisibility
  } = useMapSelection();

  // Orientation animation state

  // Refs to hold layer state for cursor coordination
  const drawingLayerStateRef = dc.useRef({ isDrawing: false, rectangleStart: null, circleStart: null });
  const panZoomLayerStateRef = dc.useRef({ isPanning: false, isTouchPanning: false, spaceKeyPressed: false });

  // Callbacks for layers to expose their state
  const handleDrawingStateChange = dc.useCallback((drawingState) => {
    drawingLayerStateRef.current = drawingState;
  }, []);

  const handlePanZoomStateChange = dc.useCallback((panZoomState) => {
    panZoomLayerStateRef.current = panZoomState;
  }, []);

  // Create geometry instance based on map type
  // Return null during loading to prevent errors
  const geometry = dc.useMemo(() => {
    if (!mapData) return null;

    const mapType = mapData.mapType || DEFAULTS.mapType;

    if (mapType === 'hex') {
      const hexSize = mapData.hexSize || DEFAULTS.hexSize;
      const orientation = mapData.orientation || DEFAULTS.hexOrientation;
      const hexBounds = mapData.hexBounds || null; // null = infinite (backward compat)
      return new HexGeometry(hexSize, orientation, hexBounds);
    } else {
      // Default to grid
      const gridSize = mapData.gridSize || DEFAULTS.gridSize;
      return new GridGeometry(gridSize);
    }
  }, [mapData?.mapType, mapData?.gridSize, mapData?.hexSize, mapData?.orientation, mapData?.hexBounds]);

  // Use canvas interaction ONLY for coordinate utility functions
  const {
    screenToGrid,
    screenToWorld,
    getClientCoords
  } = useCanvasInteraction(canvasRef, mapData, geometry, onViewStateChange, isFocused);

  dc.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateCanvasSize = () => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    };

    // Initial size
    updateCanvasSize();

    // Watch for container size changes
    const resizeObserver = new ResizeObserver(updateCanvasSize);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, []);

  // Force canvas resize when animation completes
  dc.useEffect(() => {
    if (isAnimating) return; // Only run when animation ends

    const container = containerRef.current;
    if (!container) return;

    // Wait one more frame to ensure CSS transition is fully complete
    requestAnimationFrame(() => {
      const rect = container.getBoundingClientRect();
      setCanvasDimensions({
        width: Math.max(rect.width, DEFAULTS.canvasSize.width),
        height: Math.max(rect.height, DEFAULTS.canvasSize.height)
      });
    });
  }, [isAnimating]);

  // Render canvas whenever relevant state changes
  useCanvasRenderer(canvasRef, mapData, geometry, selectedItem, isResizeMode, theme, showCoordinates, layerVisibility);

  // Trigger redraw when canvas dimensions change (from expand/collapse)
  dc.useEffect(() => {
    if (!canvasRef.current || !mapData || !geometry) return;

    const canvas = canvasRef.current;

    // During animation, preserve canvas content
    if (isAnimating) {
      // Save current canvas content
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = canvas.width;
      tempCanvas.height = canvas.height;
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.drawImage(canvas, 0, 0);

      // Update canvas size
      canvas.width = canvasDimensions.width;
      canvas.height = canvasDimensions.height;

      // Restore content (will stretch/compress during animation)
      const ctx = canvas.getContext('2d');
      ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
    } else {
      // After animation, do a proper redraw with correct dimensions
      renderCanvas(canvas, mapData, geometry, selectedItem, isResizeMode, theme, showCoordinates, layerVisibility);
    }
  }, [canvasDimensions.width, canvasDimensions.height, isAnimating, showCoordinates, layerVisibility]);

  // 'C' key handler for coordinate overlay (hex maps only)
  dc.useEffect(() => {
    // Get the coordinate key mode from settings ('hold' or 'toggle')
    const keyMode = getSetting('coordinateKeyMode') || 'hold';
    
    // Only attach listeners if focused and on a hex map
    if (!isFocused || mapData?.mapType !== 'hex') {
      // Always hide coordinates on non-hex maps
      // In 'hold' mode, also hide when losing focus
      // In 'toggle' mode, keep coordinates visible when mouse leaves (but hide on non-hex maps)
      if (showCoordinates && (mapData?.mapType !== 'hex' || keyMode === 'hold')) {
        setShowCoordinates(false);
      }
      return;
    }
    
    const handleKeyDown = (e) => {
      // Only track 'C' key when focused, and only if not typing in an input
      if (e.key.toLowerCase() === 'c' && !e.shiftKey && !e.ctrlKey && !e.metaKey &&
          e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        // Ignore key repeat events in toggle mode
        if (e.repeat && keyMode === 'toggle') return;
        
        e.preventDefault();
        
        if (keyMode === 'toggle') {
          // Toggle mode: flip the state
          setShowCoordinates(!showCoordinates);
        } else {
          // Hold mode: show on keydown
          setShowCoordinates(true);
        }
      }
    };
    
    const handleKeyUp = (e) => {
      if (e.key.toLowerCase() === 'c') {
        // Only hide on keyup in 'hold' mode
        if (keyMode === 'hold') {
          setShowCoordinates(false);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isFocused, mapData?.mapType, showCoordinates, setShowCoordinates]);

  // Determine cursor class based on current tool and interaction state
  const getCursorClass = () => {
    // Get state
    const effectiveDrawingState = drawingLayerStateRef.current;
    const effectivePanZoomState = panZoomLayerStateRef.current;

    // Space key override - show grab cursor
    if (effectivePanZoomState.spaceKeyPressed && !effectivePanZoomState.isPanning) return 'dmt-canvas-space-grab';
    
    if (effectivePanZoomState.isPanning || effectivePanZoomState.isTouchPanning) return 'dmt-canvas-panning';
    if (isDraggingSelection) return 'dmt-canvas-selecting';
    if (currentTool === 'select') return 'dmt-canvas-select';
    if (currentTool === 'measure') return 'dmt-canvas-measure';
    if (currentTool === 'addObject') {
      return selectedObjectType ? 'dmt-canvas-add-object' : 'dmt-canvas';
    }
    if (currentTool === 'addText') {
      return 'dmt-canvas-add-text';
    }
    if (currentTool === 'rectangle') {
      return effectiveDrawingState.rectangleStart ? 'dmt-canvas-rectangle-active' : 'dmt-canvas-rectangle';
    }
    if (currentTool === 'circle') {
      return effectiveDrawingState.circleStart ? 'dmt-canvas-circle-active' : 'dmt-canvas-circle';
    }
    if (currentTool === 'clearArea') {
      return effectiveDrawingState.rectangleStart ? 'dmt-canvas-cleararea-active' : 'dmt-canvas-cleararea';
    }
    if (effectiveDrawingState.isDrawing) {
      return currentTool === 'draw' ? 'dmt-canvas-drawing' : 'dmt-canvas-erasing';
    }
    return currentTool === 'erase' ? 'dmt-canvas-erase' : 'dmt-canvas';
  };

  // Build context values for providers
  const mapStateValue = dc.useMemo(() => ({
    canvasRef,
    containerRef,
    mapData,
    geometry,
    currentTool,
    selectedColor,
    selectedObjectType,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry,
    HexGeometry,
    // State change callbacks for layers
    onDrawingStateChange: handleDrawingStateChange,
    onPanZoomStateChange: handlePanZoomStateChange
  }), [canvasRef, containerRef, mapData, geometry, currentTool, selectedColor,
    selectedObjectType, screenToGrid, screenToWorld, getClientCoords,
    handleDrawingStateChange, handlePanZoomStateChange]);

  const mapOperationsValue = dc.useMemo(() => ({
    // Object operations
    getObjectAtPosition,
    addObject,
    updateObject,
    removeObject,
    isAreaFree,
    canResizeObject,
    removeObjectAtPosition,
    removeObjectsInRectangle,

    // Text operations
    getTextLabelAtPosition,
    addTextLabel,
    updateTextLabel,
    removeTextLabel,

    // Callbacks
    onCellsChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    onViewStateChange
  }), [onCellsChange, onObjectsChange, onTextLabelsChange, onEdgesChange, onViewStateChange]);



  return (
    <EventHandlerProvider>
      <MapStateProvider value={mapStateValue}>
        <MapOperationsProvider value={mapOperationsValue}>
          {/* Coordinators - must be inside provider tree to access contexts */}
          <Coordinators
            canvasRef={canvasRef}
            mapData={mapData}
            geometry={geometry}
            onViewStateChange={onViewStateChange}
            isFocused={isFocused}
            isColorPickerOpen={isColorPickerOpen}
          />
          
          <div className="dmt-canvas-container" ref={containerRef}>
            {/* Main canvas */}
            <canvas
              ref={canvasRef}
              width={canvasDimensions.width}
              height={canvasDimensions.height}
              className={getCursorClass()}
              style={{ touchAction: 'none' }}
            />
            

            <LinkedNoteHoverOverlays
              canvasRef={canvasRef}
              mapData={mapData}
              selectedItem={selectedItem}
              geometry={geometry}
              layerVisibility={layerVisibility}
            />

            {/* Render child layers */}
            {children}
          </div>
        </MapOperationsProvider>
      </MapStateProvider>
    </EventHandlerProvider>
  );
};

const MapCanvas = (props) => {
  const { children, layerVisibility, ...restProps } = props;

  return (
    <MapSelectionProvider layerVisibility={layerVisibility}>
      <MapCanvasContent {...restProps}>
        {children}
      </MapCanvasContent>
    </MapSelectionProvider>
  );
};

// Attach layer components using dot notation
MapCanvas.ObjectLayer = ObjectLayer;
MapCanvas.DrawingLayer = DrawingLayer;
MapCanvas.TextLayer = TextLayer;
MapCanvas.NotePinLayer = NotePinLayer;
MapCanvas.HexCoordinateLayer = HexCoordinateLayer;
MapCanvas.MeasurementLayer = MeasurementLayer;

return { MapCanvas };
```

# MapControls

```jsx
const MapControls = ({ onZoomIn, onZoomOut, onCompassClick, northDirection, currentZoom, isExpanded, onToggleExpand, onSettingsClick, mapType, showVisibilityToolbar, onToggleVisibilityToolbar }) => {
    // Compass SVG ids can collide, make unique
    const instanceIdRef = dc.useRef();
    if (!instanceIdRef.current) {
      instanceIdRef.current = `dmt-${Math.random().toString(36).substr(2, 9)}`;
    }
    const instanceId = instanceIdRef.current;
    const filterId = (name) => `${name}-${instanceId}`;
    
    return (
      <div className="dmt-controls">
        {/* Expand/Collapse Button */}
        <button
          className="dmt-expand-btn"
          onClick={onToggleExpand}
          title={isExpanded ? "Collapse to normal width" : "Expand to full width"}
        >
          <dc.Icon icon={isExpanded ? "lucide-minimize" : "lucide-expand"} />
        </button>
        
        {/* Compass Rose */}
        <div 
          className={`dmt-compass ${mapType === 'hex' ? 'dmt-compass-disabled' : ''}`}
          onClick={mapType === 'hex' ? () => {} : onCompassClick}
          title={mapType === 'hex' 
            ? "Map rotation temporarily disabled (coordinate key feature in development)"
            : `North is at ${northDirection}Â° (click to rotate)`
          }
        >
          <svg 
            className="dmt-compass-svg"
            viewBox="0 0 100 100"
            style={{
              transform: `rotate(${northDirection}deg)`,
              transition: 'transform 0.3s ease'
            }}
          >
            <defs>
              <filter id={filterId('glow')}>
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id={filterId('whiteGlow')}>
                <feGaussianBlur stdDeviation="1.0" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id={filterId('darkGlow')}>
                <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id={filterId('ringGlow')}>
                <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
                <feMerge>
                  <feMergeNode in="coloredBlur"/>
                  <feMergeNode in="SourceGraphic"/>
                </feMerge>
              </filter>
              <filter id={filterId('compassShadow')} x="-50%" y="-50%" width="200%" height="200%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="rgba(0, 0, 0, 0.8)"/>
              </filter>
            </defs>
            
            <g filter={`url(#${filterId('compassShadow')})`}>
            
            <circle 
              cx="50" 
              cy="50" 
              r="28" 
              fill="rgba(0, 0, 0, 0.7)"
              stroke="rgba(196, 165, 123, 0.4)"
              strokeWidth="2"
              className="dmt-compass-bg"
            />
            
            <circle 
              cx="50" 
              cy="50" 
              r="48" 
              fill="none" 
              stroke="rgba(255, 255, 255, 0.4)" 
              strokeWidth="0.8"
              filter={`url(#${filterId('ringGlow')})`}
            />
            <circle 
              cx="50" 
              cy="50" 
              r="48" 
              fill="none" 
              stroke="rgba(196, 165, 123, 0.3)" 
              strokeWidth="0.5"
            />
            <circle 
              cx="50" 
              cy="50" 
              r="45" 
              fill="none" 
              stroke="rgba(255, 255, 255, 0.4)" 
              strokeWidth="0.8"
              filter={`url(#${filterId('ringGlow')})`}
            />
            <circle 
              cx="50" 
              cy="50" 
              r="45" 
              fill="none" 
              stroke="rgba(196, 165, 123, 0.2)" 
              strokeWidth="0.5"
            />
            
            {/* Cardinal direction lines */}
            {/* North */}
            <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(0, 0, 0, 0.9)" strokeWidth="7" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="50" y1="2" x2="50" y2="22" stroke="rgba(255, 255, 255, 0.8)" strokeWidth="6" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
            <line x1="50" y1="2" x2="50" y2="22" stroke="#c4a57b" strokeWidth="2.5" strokeLinecap="round"/>
            <line x1="50" y1="2" x2="50" y2="22" stroke="#c4a57b" strokeWidth="1" strokeLinecap="round" opacity="0.5" filter={`url(#${filterId('glow')})`}/>
            
            {/* South */}
            <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
            <line x1="50" y1="78" x2="50" y2="98" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
            
            {/* East */}
            <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
            <line x1="78" y1="50" x2="98" y2="50" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
            
            {/* West */}
            <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(0, 0, 0, 0.75)" strokeWidth="5" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(255, 255, 255, 0.6)" strokeWidth="4.5" strokeLinecap="round" filter={`url(#${filterId('whiteGlow')})`}/>
            <line x1="2" y1="50" x2="22" y2="50" stroke="rgba(196, 165, 123, 0.55)" strokeWidth="0.9" strokeLinecap="round"/>
            
            {/* Secondary direction lines (NE, SE, SW, NW) */}
            <line x1="71" y1="29" x2="82" y2="18" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="71" y1="29" x2="82" y2="18" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
            
            <line x1="71" y1="71" x2="82" y2="82" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="71" y1="71" x2="82" y2="82" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
            
            <line x1="29" y1="71" x2="18" y2="82" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="29" y1="71" x2="18" y2="82" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
            
            <line x1="29" y1="29" x2="18" y2="18" stroke="rgba(0, 0, 0, 0.5)" strokeWidth="3" strokeLinecap="round" filter={`url(#${filterId('darkGlow')})`}/>
            <line x1="29" y1="29" x2="18" y2="18" stroke="rgba(196, 165, 123, 0.68)" strokeWidth="0.8" strokeLinecap="round"/>
            

            <g className="dmt-compass-star">

              <path 
                d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
                fill="rgba(0, 0, 0, 0.6)"
                stroke="rgba(0, 0, 0, 0.7)"
                strokeWidth="3"
                filter={`url(#${filterId('darkGlow')})`}
              />

              <path 
                d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
                fill="#c4a57b"
                stroke="#8b6842"
                strokeWidth="0.8"
              />

              <path 
                d="M 50 8 L 58 50 L 50 47 L 42 50 Z" 
                fill="none"
                stroke="#c4a57b"
                strokeWidth="1.5"
                opacity="0.4"
                filter={`url(#${filterId('glow')})`}
              />
              
              <path 
                d="M 50 92 L 56 50 L 50 53 L 44 50 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
              <path 
                d="M 92 50 L 50 44 L 53 50 L 50 56 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
              <path 
                d="M 8 50 L 50 44 L 47 50 L 50 56 Z" 
                fill="rgba(0, 0, 0, 0.5)"
                stroke="rgba(0, 0, 0, 0.6)"
                strokeWidth="2.5"
                filter={`url(#${filterId('darkGlow')})`}
              />
            
              <path 
                d="M 50 92 L 56 50 L 50 53 L 44 50 Z" 
                fill="rgba(196, 165, 123, 0.88)"
                stroke="rgba(139, 104, 66, 0.88)"
                strokeWidth="0.5"
              />
              <path 
                d="M 92 50 L 50 44 L 53 50 L 50 56 Z" 
                fill="rgba(196, 165, 123, 0.88)"
                stroke="rgba(139, 104, 66, 0.88)"
                strokeWidth="0.5"
              />
              <path 
                d="M 8 50 L 50 44 L 47 50 L 50 56 Z" 
                fill="rgba(196, 165, 123, 0.88)"
                stroke="rgba(139, 104, 66, 0.88)"
                strokeWidth="0.5"
              />
            </g>
            
            <circle 
              cx="50" 
              cy="50" 
              r="25" 
              fill="none"
              stroke="rgba(196, 165, 123, 0.3)"
              strokeWidth="0.5"
            />
            
            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 1)"
              strokeWidth="7.65"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 1)"
              strokeWidth="6.12"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="none"
              stroke="rgba(0, 0, 0, 0.9)"
              strokeWidth="4.59"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>

            <text 
              x="50" 
              y="62" 
              textAnchor="middle" 
              fontSize="36" 
              fontWeight="bold" 
              fill="#c4a57b"
              fontFamily="serif"
              letterSpacing="1"
            >N</text>
            
            <path 
              d="M 50 14 L 44.4 25.2 L 50 21 L 55.6 25.2 Z"
              fill="rgba(0, 0, 0, 0.7)"
              stroke="rgba(0, 0, 0, 0.8)"
              strokeWidth="2.5"
              filter={`url(#${filterId('darkGlow')})`}
            />
            <path 
              d="M 50 14 L 44.4 25.2 L 50 21 L 55.6 25.2 Z"
              fill="#e74c3c"
              stroke="#c0392b"
              strokeWidth="0.8"
            />
            <circle 
              cx="50" 
              cy="14" 
              r="3" 
              fill="#e74c3c"
              opacity="0.4"
              filter={`url(#${filterId('glow')})`}
            />
            </g>
          </svg>
        </div>
        
        {/* Zoom Controls */}
        <div className="dmt-zoom-controls">
          <button
            className="dmt-zoom-btn"
            onClick={onZoomIn}
            title="Zoom In"
          >
            +
          </button>
          <div className="dmt-zoom-level" title={`Zoom: ${Math.round(currentZoom * 100)}%`}>
            {Math.round(currentZoom * 100)}%
          </div>
          <button 
            className="dmt-zoom-btn"
            onClick={onZoomOut}
            title="Zoom Out"
          >
            -
          </button>
        </div>
        
        {/* Visibility Toggle Button */}
        <button
          className={`dmt-expand-btn ${showVisibilityToolbar ? 'dmt-expand-btn-active' : ''}`}
          onClick={onToggleVisibilityToolbar}
          title="Toggle layer visibility"
        >
          <dc.Icon icon="lucide-eye" />
        </button>
        
        {/* Settings Button */}
        <button
          className="dmt-expand-btn"
          onClick={onSettingsClick}
          title="Map Settings"
        >
          <dc.Icon icon="lucide-settings" />
        </button>
      </div>
    );
  };
  
  return { MapControls };
```

# ToolPalette

```jsx
// components/ToolPalette.jsx - Tool selection palette with sub-tool menus, history controls, and color picker

const { DEFAULT_COLOR } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "colorOperations"));
const { ColorPicker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ColorPicker"));

// Tool Palette Corner Bracket (outward-facing, simplified)
const ToolPaletteBracket = ({ position }) => {
  return (
    <svg 
      className={`dmt-tool-palette-bracket dmt-tool-palette-bracket-${position}`}
      viewBox="-5 -5 25 25"
    >
      <defs>
        <filter id={`palette-bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="1.5" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <path 
        d="M 0 15 L 0 0 L 15 0" 
        stroke="#c4a57b" 
        strokeWidth="1.5" 
        fill="none"
        filter={`url(#palette-bracket-glow-${position})`}
      />
      <path 
        d="M -2.5 18 L -2.5 -2.5 L 18 -2.5" 
        stroke="rgba(255, 255, 255, 0.4)" 
        strokeWidth="0.8" 
        fill="none"
      />
      <line 
        x1="-4" y1="7" x2="0" y2="7" 
        stroke="#c4a57b" 
        strokeWidth="1.5"
      />
      <line 
        x1="7" y1="-4" x2="7" y2="0" 
        stroke="#c4a57b" 
        strokeWidth="1.5"
      />
    </svg>
  );
};

/**
 * Sub-menu flyout component
 */
const SubMenuFlyout = ({ subTools, currentSubTool, onSelect, onClose }) => {
  return (
    <div className="dmt-subtool-menu">
      {subTools.map(subTool => (
        <button
          key={subTool.id}
          className={`dmt-subtool-option ${currentSubTool === subTool.id ? 'dmt-subtool-option-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(subTool.id);
            onClose();
          }}
          title={subTool.title}
        >
          <dc.Icon icon={subTool.icon} />
          <span>{subTool.label}</span>
        </button>
      ))}
    </div>
  );
};

/**
 * Tool button with optional sub-menu support
 */
const ToolButtonWithSubMenu = ({ 
  toolGroup,
  currentTool,
  currentSubTool,
  isSubMenuOpen,
  onToolSelect,
  onSubToolSelect,
  onSubMenuOpen,
  onSubMenuClose,
  mapType
}) => {
  const longPressTimer = dc.useRef(null);
  const LONG_PRESS_DURATION = 300;
  
  // Filter sub-tools based on map type
  const visibleSubTools = toolGroup.subTools.filter(st => 
    mapType !== 'hex' || !st.gridOnly
  );
  
  // If no visible sub-tools, don't render
  if (visibleSubTools.length === 0) return null;
  
  // Find current sub-tool definition
  const currentSubToolDef = visibleSubTools.find(st => st.id === currentSubTool) || visibleSubTools[0];
  
  // Check if this tool group (any sub-tool) is active
  const isActive = visibleSubTools.some(st => st.id === currentTool);
  
  // Only show sub-menu indicator if there are multiple sub-tools
  const hasMultipleSubTools = visibleSubTools.length > 1;
  
  const handlePointerDown = (e) => {
    if (!hasMultipleSubTools) return;
    
    longPressTimer.current = setTimeout(() => {
      onSubMenuOpen(toolGroup.id);
      longPressTimer.current = null;
    }, LONG_PRESS_DURATION);
  };
  
  const handlePointerUp = (e) => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
      // Short click - activate tool with current sub-tool
      onToolSelect(currentSubToolDef.id);
    } else if (!hasMultipleSubTools) {
      // No sub-menu, just select the tool
      onToolSelect(currentSubToolDef.id);
    }
  };
  
  const handlePointerLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  
  const handleContextMenu = (e) => {
    if (!hasMultipleSubTools) return;
    
    e.preventDefault();
    e.stopPropagation();
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    onSubMenuOpen(toolGroup.id);
  };
  
  const handleSubToolSelect = (subToolId) => {
    onSubToolSelect(toolGroup.id, subToolId);
    onToolSelect(subToolId);
  };
  
  return (
    <div className="dmt-tool-btn-container" style={{ position: 'relative', display: 'inline-block' }}>
      <button
        className={`dmt-tool-btn ${isActive ? 'dmt-tool-btn-active' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onContextMenu={handleContextMenu}
        title={currentSubToolDef?.title}
      >
        <dc.Icon icon={currentSubToolDef?.icon} />
        {hasMultipleSubTools && (
          <span className="dmt-subtool-indicator">▼</span>
        )}
      </button>
      
      {isSubMenuOpen && hasMultipleSubTools && (
        <SubMenuFlyout
          subTools={visibleSubTools}
          currentSubTool={currentSubTool}
          onSelect={handleSubToolSelect}
          onClose={onSubMenuClose}
        />
      )}
    </div>
  );
};

const ToolPalette = ({ 
  currentTool, 
  onToolChange, 
  onUndo, 
  onRedo, 
  canUndo, 
  canRedo,
  selectedColor,
  onColorChange,
  selectedOpacity = 1,
  onOpacityChange,
  isColorPickerOpen,       
  onColorPickerOpenChange,
  customColors,
  onAddCustomColor,
  onDeleteCustomColor,
  mapType,
  isFocused = false
}) => {
  const colorBtnRef = dc.useRef(null);
  const pendingCustomColorRef = dc.useRef(null);
  
  // Sub-menu state
  const [openSubMenu, setOpenSubMenu] = dc.useState(null);
  const [subToolSelections, setSubToolSelections] = dc.useState({
    draw: 'draw',           // 'draw' (cells) | 'edgeDraw' (edges)
    rectangle: 'rectangle'  // 'rectangle' (fill) | 'edgeLine'
  });
  
  // Keyboard shortcuts for common tools
  dc.useEffect(() => {
    // Don't attach keyboard shortcuts if map is not focused
    if (!isFocused) return;
    
    const handleKeyDown = (e) => {
      // Don't trigger if typing in an input or textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      // Don't trigger with modifier keys (except for special cases)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      
      const key = e.key.toLowerCase();
      
      switch (key) {
        case 'd':
          onToolChange('draw');
          break;
        case 'e':
          onToolChange('erase');
          break;
        case 's':
        case 'v':
          onToolChange('select');
          break;
        case 'm':
          onToolChange('measure');
          break;
        default:
          return; // Don't prevent default for unhandled keys
      }
      
      e.preventDefault();
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onToolChange, isFocused]);
  
  // Tool groups with sub-tools
  const toolGroups = [
    {
      id: 'draw',
      subTools: [
        { id: 'draw', label: 'Paint Cells', title: 'Draw (fill cells) (D)', icon: 'lucide-paintbrush' },
        { id: 'edgeDraw', label: 'Paint Edges', title: 'Paint Edges (grid lines)', icon: 'lucide-pencil-ruler', gridOnly: true }
      ]
    },
    {
      id: 'rectangle',
      subTools: [
        { id: 'rectangle', label: 'Fill Rectangle', title: 'Rectangle (click two corners)', icon: 'lucide-square', gridOnly: true },
        { id: 'edgeLine', label: 'Edge Line', title: 'Edge Line (click two points)', icon: 'lucide-git-commit-horizontal', gridOnly: true }
      ]
    }
  ];
  
  // Simple tools (no sub-menu)
  const simpleTools = [
    { id: 'select', title: 'Select/Move Text & Objects (S)', icon: 'lucide-hand' },
    { id: 'erase', title: 'Erase (remove text/objects/cells/edges) (E)', icon: 'lucide-eraser' },
    { id: 'circle', title: 'Circle (click edge, then center)', icon: 'lucide-circle', gridOnly: true },
    { id: 'clearArea', title: 'Clear Area (click two corners to erase)', icon: 'lucide-square-x', gridOnly: true },
    { id: 'addObject', title: 'Add Object (select from sidebar)', icon: 'lucide-map-pin-plus' },
    { id: 'addText', title: 'Add Text Label', icon: 'lucide-type' },
    { id: 'measure', title: 'Measure Distance (M)', icon: 'lucide-ruler' }
  ];
  
  // Filter simple tools for hex maps
  const visibleSimpleTools = mapType === 'hex'
    ? simpleTools.filter(tool => !tool.gridOnly)
    : simpleTools;
  
  const handleSubMenuOpen = (groupId) => {
    setOpenSubMenu(openSubMenu === groupId ? null : groupId);
  };
  
  const handleSubMenuClose = () => {
    setOpenSubMenu(null);
  };
  
  const handleSubToolSelect = (groupId, subToolId) => {
    setSubToolSelections(prev => ({
      ...prev,
      [groupId]: subToolId
    }));
  };
  
  const toggleColorPicker = (e) => {
    e.stopPropagation();
    onColorPickerOpenChange(!isColorPickerOpen);
  };
  
  const handleColorSelect = (color) => {
    onColorChange(color);
  };
  
  const handleColorReset = () => {
    onColorChange(DEFAULT_COLOR);
    onColorPickerOpenChange(false);
  };
  
  const handleCloseColorPicker = () => {
    onColorPickerOpenChange(false);
  };
  
  // Close sub-menu when clicking outside
  dc.useEffect(() => {
    if (openSubMenu) {
      const handleClickOutside = (e) => {
        const menuElement = e.target.closest('.dmt-subtool-menu');
        const buttonElement = e.target.closest('.dmt-tool-btn-container');
        
        if (!menuElement && !buttonElement) {
          handleSubMenuClose();
        }
      };
      
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 10);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [openSubMenu]);
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (isColorPickerOpen) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-color-tool-btn');
        
        if (!pickerElement && !buttonElement) {
          if (pendingCustomColorRef.current) {
            onAddCustomColor(pendingCustomColorRef.current);
            onColorChange(pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          handleCloseColorPicker();
        }
      };
      
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 10);
      
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [isColorPickerOpen]);
  
  return (
    <div className="dmt-tool-palette">
      {/* Outward-facing decorative corner brackets */}
      <ToolPaletteBracket position="tl" />
      <ToolPaletteBracket position="tr" />
      <ToolPaletteBracket position="bl" />
      <ToolPaletteBracket position="br" />
      
      {/* Select tool */}
      <button
        className={`dmt-tool-btn ${currentTool === 'select' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('select')}
        title="Select/Move Text & Objects"
      >
        <dc.Icon icon="lucide-hand" />
      </button>
      
      {/* Draw tool group (with sub-menu) */}
      <ToolButtonWithSubMenu
        toolGroup={toolGroups[0]}
        currentTool={currentTool}
        currentSubTool={subToolSelections.draw}
        isSubMenuOpen={openSubMenu === 'draw'}
        onToolSelect={onToolChange}
        onSubToolSelect={handleSubToolSelect}
        onSubMenuOpen={handleSubMenuOpen}
        onSubMenuClose={handleSubMenuClose}
        mapType={mapType}
      />
      
      {/* Color Picker Button */}
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <button
          ref={colorBtnRef}
          className={`dmt-tool-btn dmt-color-tool-btn ${isColorPickerOpen ? 'dmt-tool-btn-active' : ''}`}
          onClick={toggleColorPicker}
          title="Choose color"
          style={{
            borderBottom: `4px solid ${selectedColor || DEFAULT_COLOR}`
          }}
        >
          <dc.Icon icon="lucide-palette" />
        </button>
        
        <ColorPicker
          isOpen={isColorPickerOpen}
          selectedColor={selectedColor}
          onColorSelect={handleColorSelect}
          onClose={handleCloseColorPicker}
          onReset={handleColorReset}
          customColors={customColors}
          onAddCustomColor={onAddCustomColor}
          onDeleteCustomColor={onDeleteCustomColor}
          position={null}
          pendingCustomColorRef={pendingCustomColorRef}
          title="Color"
          opacity={selectedOpacity}
          onOpacityChange={onOpacityChange}
        />
      </div>
      
      {/* Erase tool */}
      <button
        className={`dmt-tool-btn ${currentTool === 'erase' ? 'dmt-tool-btn-active' : ''}`}
        onClick={() => onToolChange('erase')}
        title="Erase (remove text/objects/cells/edges)"
      >
        <dc.Icon icon="lucide-eraser" />
      </button>
      
      {/* Rectangle tool group (with sub-menu) - grid only */}
      {mapType !== 'hex' && (
        <ToolButtonWithSubMenu
          toolGroup={toolGroups[1]}
          currentTool={currentTool}
          currentSubTool={subToolSelections.rectangle}
          isSubMenuOpen={openSubMenu === 'rectangle'}
          onToolSelect={onToolChange}
          onSubToolSelect={handleSubToolSelect}
          onSubMenuOpen={handleSubMenuOpen}
          onSubMenuClose={handleSubMenuClose}
          mapType={mapType}
        />
      )}
      
      {/* Remaining simple tools */}
      {visibleSimpleTools.filter(t => !['select', 'erase'].includes(t.id)).map(tool => (
        <button
          key={tool.id}
          className={`dmt-tool-btn ${currentTool === tool.id ? 'dmt-tool-btn-active' : ''}`}
          onClick={() => onToolChange(tool.id)}
          title={tool.title}
        >
          <dc.Icon icon={tool.icon} />
        </button>
      ))}
      
      <div className="dmt-history-controls">
        <button 
          className="dmt-history-btn"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo"
        >
          <dc.Icon icon="lucide-undo" />
        </button>
        <button 
          className="dmt-history-btn"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo"
        >
          <dc.Icon icon="lucide-redo" />
        </button>
      </div>
    </div>
  );
};

return { ToolPalette };
```

# ObjectSidebar

```jsx
// Use resolver for dynamic object types (supports overrides and custom objects)
const { getResolvedObjectTypes, getResolvedCategories, hasIconClass } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypeResolver"));

// Ornamental Arrow SVG - Double Chevron Design
const OrnamentalArrow = ({ direction = "right" }) => {
  const rotation = direction === "left" ? 180 : 0;
  
  return (
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 16 16"
      style={{ transform: `rotate(${rotation}deg)` }}
    >
      <defs>
        <filter id={`arrow-glow-${direction}`}>
          <feGaussianBlur stdDeviation="1" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      {/* First chevron */}
      <polyline 
        points="4,4 8,8 4,12" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter={`url(#arrow-glow-${direction})`}
      />
      {/* Second chevron */}
      <polyline 
        points="8,4 12,8 8,12" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="1.5" 
        strokeLinecap="round" 
        strokeLinejoin="round"
        filter={`url(#arrow-glow-${direction})`}
      />
    </svg>
  );
};

const ObjectSidebar = ({ selectedObjectType, onObjectTypeSelect, onToolChange, isCollapsed, onCollapseChange }) => {
  // Get resolved object types and categories (includes overrides and custom)
  const allObjectTypes = getResolvedObjectTypes();
  const allCategories = getResolvedCategories();
  
  // Group objects by category (excluding 'notes' category which is handled specially)
  const objectsByCategory = allCategories
    .filter(category => category.id !== 'notes')
    .map(category => ({
      ...category,
      objects: allObjectTypes
        .filter(obj => obj.category === category.id)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))  // Sort by order
    }))
    .filter(category => category.objects.length > 0);  // Only show categories with objects
  
  const handleObjectSelect = (objectId) => {
    onObjectTypeSelect(objectId);
    if (onToolChange) {
      onToolChange('addObject');  // Automatically switch to add object tool
    }
  };
  
  const handleToggleCollapse = () => {
    onCollapseChange(!isCollapsed);
  };
  
  if (isCollapsed) {
    return (
      <div className="dmt-object-sidebar dmt-object-sidebar-collapsed">
        <button
          className="dmt-sidebar-toggle interactive-child"
          onClick={handleToggleCollapse}
          title="Show objects"
        >
          <OrnamentalArrow direction="right" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="dmt-object-sidebar">
      {/* Hidden element to force early emoji font loading */}
      <div className="dmt-font-preloader" aria-hidden="true">ðŸ“ŒðŸšªâ¬†ï¸â¬‡ï¸ðŸ—ï¸ðŸª™ðŸ‘€ðŸ‰ðŸ§™â€â™‚ï¸ðŸ›¡ï¸âš”ï¸ðŸºðŸª¤ðŸ“œðŸ”®</div>
      
      <div className="dmt-sidebar-header">
        Objects
        <button
          className="dmt-sidebar-collapse-btn interactive-child"
          onClick={handleToggleCollapse}
          title="Hide sidebar"
        >
          <OrnamentalArrow direction="left" />
        </button>
      </div>
      
      <div className="dmt-sidebar-content">
        {/* Note Pin special button */}
        <div className="dmt-sidebar-note-section">
          <button
            className={`dmt-note-pin-btn ${selectedObjectType === 'note_pin' ? 'dmt-note-pin-btn-selected' : ''}`}
            onClick={() => handleObjectSelect('note_pin')}
            title="Place Note Pin"
          >
            <dc.Icon icon="lucide-map-pinned" />
            <span>Note Pin</span>
          </button>
        </div>
        
        {/* Existing category loop */}
        {objectsByCategory.map(category => (
          <div key={category.id} className="dmt-sidebar-category">
            <div className="dmt-category-label">{category.label}</div>
            
            {category.objects.map(objType => (
              <button
                key={objType.id}
                className={`dmt-object-item ${selectedObjectType === objType.id ? 'dmt-object-item-selected' : ''}`}
                onClick={() => handleObjectSelect(objType.id)}
                title={objType.label}
              >
                <div className="dmt-object-symbol">
                  {hasIconClass(objType) ? (
                    <span className={`ra ${objType.iconClass}`}></span>
                  ) : (
                    objType.symbol || '?'
                  )}
                </div>
                <div className="dmt-object-label">{objType.label}</div>
              </button>
            ))}
          </div>
        ))}
      </div>
      
      {selectedObjectType && (
        <div className="dmt-sidebar-footer">
          <button
            className="dmt-deselect-btn"
            onClick={() => onObjectTypeSelect(null)}
            title="Deselect object"
          >
            Clear Selection
          </button>
        </div>
      )}
    </div>
  );
};

return { ObjectSidebar };
```

# VisibilityToolbar

```jsx
/**
 * VisibilityToolbar.jsx
 * Compact horizontal toolbar for toggling layer visibility
 * Overlays below the ToolPalette when eye button is clicked
 */

/**
 * VisibilityToolbar Component
 * @param {boolean} isOpen - Whether the toolbar is visible
 * @param {Object} layerVisibility - Current visibility state for each layer
 * @param {Function} onToggleLayer - Callback to toggle a layer's visibility
 * @param {string} mapType - 'grid' or 'hex' - hex coordinates only show for hex maps
 */
const VisibilityToolbar = ({ 
  isOpen, 
  layerVisibility, 
  onToggleLayer,
  mapType 
}) => {
  if (!isOpen) return null;
  
  const layers = [
    { 
      id: 'objects', 
      icon: 'lucide-boxes', 
      tooltip: 'Toggle object visibility'
    },
    { 
      id: 'textLabels', 
      icon: 'lucide-type', 
      tooltip: 'Toggle text label visibility'
    },
    { 
      id: 'hexCoordinates', 
      icon: 'lucide-key-round', 
      tooltip: 'Toggle coordinate visibility (or hold C)',
      hexOnly: true
    }
  ];
  
  // Filter out hex-only layers for grid maps
  const visibleLayers = layers.filter(layer => !layer.hexOnly || mapType === 'hex');
  
  return (
    <div className="dmt-visibility-toolbar">
      {visibleLayers.map(layer => {
        const isVisible = layerVisibility[layer.id];
        
        return (
          <button
            key={layer.id}
            className={`dmt-visibility-btn ${!isVisible ? 'dmt-visibility-btn-hidden' : ''}`}
            onClick={() => onToggleLayer(layer.id)}
            title={`${layer.tooltip} (currently ${isVisible ? 'visible' : 'hidden'})`}
          >
            <dc.Icon icon={layer.icon} />
            {!isVisible && (
              <svg 
                className="dmt-visibility-strikethrough" 
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <line 
                  x1="4" y1="4" 
                  x2="20" y2="20" 
                  stroke="currentColor" 
                  strokeWidth="2.5" 
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
};

return { VisibilityToolbar };
```

# settingsPluginMain

```js
// settingsPluginMain.js - Template for Windrose MapDesigner Settings Plugin
// Returns the plugin source as a string for templating by SettingsPluginInstaller
// This wrapper allows the file to be dc.require()'d without Datacore trying to execute it as an Obsidian plugin

return `// settingsPluginMain.js - Windrose MapDesigner Settings Plugin
// This file is generated from a template by SettingsPluginInstaller
// Default values are injected at install time from dmtConstants and objectTypes

/**
 * ============================================================================
 * TABLE OF CONTENTS
 * ============================================================================
 * 
 * Line ~25:   VERSION & IMPORTS
 * Line ~35:   DATA CONSTANTS (BUILT_IN_OBJECTS, CATEGORIES, QUICK_SYMBOLS)
 * Line ~100:  HELPER NAMESPACES (ObjectHelpers, DragHelpers, IconHelpers)
 * Line ~200:  STYLES (DMT_SETTINGS_STYLES)
 * Line ~520:  MODAL CLASSES (ObjectEditModal, CategoryEditModal, ExportModal, ImportModal)
 * Line ~900:  MAIN PLUGIN CLASS (WindroseMDSettingsPlugin)
 * Line ~1000: SETTINGS TAB CLASS (WindroseMDSettingsTab)
 * 
 * ============================================================================
 */

// =============================================================================
// VERSION & IMPORTS
// =============================================================================

const PLUGIN_VERSION = '{{PLUGIN_VERSION}}';

const { Plugin, PluginSettingTab, Setting, Modal, setIcon } = require('obsidian');

// =============================================================================
// DATA CONSTANTS
// Injected from objectTypes.js at install time - single source of truth
// =============================================================================

const BUILT_IN_OBJECTS = {{BUILT_IN_OBJECTS}};

const BUILT_IN_CATEGORIES = {{BUILT_IN_CATEGORIES}};

const CATEGORY_ORDER = {{CATEGORY_ORDER}};

// RPGAwesome icon data - injected from rpgAwesomeIcons.js at install time
const RA_ICONS = {{RA_ICONS}};

const RA_CATEGORIES = {{RA_CATEGORIES}};

// Quick symbols palette for object creation
const QUICK_SYMBOLS = [
  '★', '☆', '✦', '✧', '✪', '✫', '✯', '⚝',
  '●', '○', '◆', '◇', '■', '□', '▲', '△', '▼', '▽',
  '♠', '♤', '♣', '♧', '♥', '♡', '♦', '♢',
  '⚔', '⚒', '🗡', '🏹', '⚓', '⛏', '🔱',
  '☠', '⚠', '☢', '☣', '⚡', '🔥', '💧',
  '⚑', '⚐', '⛳', '🚩', '➤', '➜', '⬤',
  '⚙', '⚗', '🔮', '💎', '🗝', '📜', '🎭', '👁',
  '🏛', '🏰', '⛪', '🗿', '⚱', '🏺', '🪔'
];

// =============================================================================
// HELPER NAMESPACES
// Pure functions for data transformation - no side effects, easy to test/debug
// =============================================================================

/**
 * Object resolution helpers
 * Transform raw settings into resolved object/category lists
 */
const ObjectHelpers = {
  /**
   * Get all resolved object types (built-in + custom, with overrides applied)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Resolved object array with isBuiltIn, isModified flags
   */
  getResolved(settings) {
    const { objectOverrides = {}, customObjects = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_OBJECTS
      .filter(obj => !objectOverrides[obj.id]?.hidden)
      .map((obj, index) => {
        const override = objectOverrides[obj.id];
        const defaultOrder = index * 10;
        if (override) {
          const { hidden, ...overrideProps } = override;
          return { 
            ...obj, 
            ...overrideProps, 
            order: override.order ?? defaultOrder, 
            isBuiltIn: true, 
            isModified: true 
          };
        }
        return { ...obj, order: defaultOrder, isBuiltIn: true, isModified: false };
      });
    
    const resolvedCustom = customObjects.map((obj, index) => ({
      ...obj,
      order: obj.order ?? (1000 + index * 10),
      isCustom: true,
      isBuiltIn: false
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom];
  },
  
  /**
   * Get all resolved categories (built-in + custom, sorted by order)
   * @param {Object} settings - Plugin settings
   * @returns {Array} Sorted category array with isBuiltIn flag
   */
  getCategories(settings) {
    const { customCategories = [] } = settings;
    
    const resolvedBuiltIns = BUILT_IN_CATEGORIES.map(c => ({
      ...c,
      isBuiltIn: true,
      order: CATEGORY_ORDER[c.id] ?? 50
    }));
    
    const resolvedCustom = customCategories.map(c => ({
      ...c,
      isCustom: true,
      isBuiltIn: false,
      order: c.order ?? 100
    }));
    
    return [...resolvedBuiltIns, ...resolvedCustom].sort((a, b) => (a.order ?? 50) - (b.order ?? 50));
  },
  
  /**
   * Get hidden built-in objects
   * @param {Object} settings - Plugin settings
   * @returns {Array} Hidden objects with isBuiltIn, isHidden flags
   */
  getHidden(settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(obj => objectOverrides[obj.id]?.hidden)
      .map(obj => ({ ...obj, isBuiltIn: true, isHidden: true }));
  },
  
  /**
   * Get all categories including notes (for dropdowns)
   * @param {Object} settings - Plugin settings
   * @returns {Array} All categories
   */
  getAllCategories(settings) {
    const { customCategories = [] } = settings;
    const builtIn = BUILT_IN_CATEGORIES.map(c => ({ ...c, isBuiltIn: true }));
    const custom = customCategories.map(c => ({ ...c, isCustom: true }));
    return [...builtIn, ...custom];
  },
  
  /**
   * Get default ID order for a category (for drag/drop comparison)
   * @param {string} categoryId - Category ID
   * @param {Object} settings - Plugin settings
   * @returns {Array} Array of object IDs in default order
   */
  getDefaultIdOrder(categoryId, settings) {
    const { objectOverrides = {} } = settings;
    return BUILT_IN_OBJECTS
      .filter(o => o.category === categoryId && !objectOverrides[o.id]?.hidden)
      .map(o => o.id);
  }
};

/**
 * Drag and drop helpers
 */
const DragHelpers = {
  /**
   * Find element to insert before during drag operation
   * @param {HTMLElement} container - Container element
   * @param {number} y - Mouse Y position
   * @returns {HTMLElement|undefined} Element to insert before
   */
  getAfterElement(container, y) {
    const draggableElements = [...container.querySelectorAll('.dmt-settings-object-row:not(.dmt-dragging)')];
    
    return draggableElements.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) {
        return { offset: offset, element: child };
      } else {
        return closest;
      }
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }
};

/**
 * Icon helpers
 */
const IconHelpers = {
  /**
   * Set icon on element with fallback
   * @param {HTMLElement} el - Target element
   * @param {string} iconId - Lucide icon ID
   */
  set(el, iconId) {
    if (typeof setIcon !== 'undefined') {
      setIcon(el, iconId);
    } else {
      // Fallback: create a simple text representation
      const icons = {
        'pencil': 'âœŽ',
        'eye': 'ðŸ‘',
        'eye-off': 'ðŸš«',
        'rotate-ccw': 'â†º',
        'trash-2': 'ðŸ—‘',
        'grip-vertical': 'â‹®â‹®',
        'x': 'âœ•'
      };
      el.textContent = icons[iconId] || '?';
    }
  }
};

/**
 * RPGAwesome icon helpers
 */
const RPGAwesomeHelpers = {
  /**
   * Get icons filtered by category
   * @param {string} categoryId - Category ID or 'all'
   * @returns {Array} Array of { iconClass, char, label, category }
   */
  getByCategory(categoryId) {
    const icons = Object.entries(RA_ICONS).map(([iconClass, data]) => ({
      iconClass,
      ...data
    }));
    
    if (categoryId === 'all') return icons;
    return icons.filter(i => i.category === categoryId);
  },
  
  /**
   * Search icons by label
   * @param {string} query - Search query
   * @returns {Array} Matching icons
   */
  search(query) {
    const q = query.toLowerCase().trim();
    if (!q) return this.getByCategory('all');
    
    return Object.entries(RA_ICONS)
      .filter(([iconClass, data]) => 
        iconClass.toLowerCase().includes(q) || 
        data.label.toLowerCase().includes(q)
      )
      .map(([iconClass, data]) => ({ iconClass, ...data }));
  },
  
  /**
   * Get sorted categories for tab display
   * @returns {Array} Array of { id, label, order }
   */
  getCategories() {
    return [...RA_CATEGORIES].sort((a, b) => a.order - b.order);
  },
  
  /**
   * Validate an icon class exists
   * @param {string} iconClass - Icon class to validate
   * @returns {boolean}
   */
  isValid(iconClass) {
    return iconClass && RA_ICONS.hasOwnProperty(iconClass);
  },
  
  /**
   * Get icon info
   * @param {string} iconClass - Icon class
   * @returns {Object|null} Icon data or null
   */
  getInfo(iconClass) {
    return RA_ICONS[iconClass] || null;
  }
};

// =============================================================================
// STYLES
// All CSS for the settings UI - injected into document.head when tab is shown
// =============================================================================

const DMT_SETTINGS_STYLES = \`
  /* Subheadings */
  .dmt-settings-subheading {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-muted);
    margin: 1.5em 0 0.5em 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  /* Search/Filter */
  .dmt-settings-search-container {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 1em;
  }
  
  .dmt-settings-search-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    font-size: 14px;
  }
  
  .dmt-settings-search-input:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }
  
  .dmt-settings-search-clear {
    background: transparent;
    border: none;
    padding: 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-search-clear:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-settings-no-results {
    text-align: center;
    padding: 2em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Category containers */
  .dmt-settings-category {
    margin: 1em 0;
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    overflow: hidden;
  }
  
  .dmt-settings-category-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    background: var(--background-secondary);
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .dmt-settings-category-label {
    font-weight: 600;
    font-size: 0.95em;
  }
  
  .dmt-settings-category-actions {
    display: flex;
    gap: 4px;
  }
  
  /* Object rows */
  .dmt-settings-object-list {
    padding: 4px 0;
  }
  
  .dmt-settings-object-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    transition: background-color 0.15s ease;
  }
  
  .dmt-settings-object-row:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-drag-handle {
    color: var(--text-muted);
    cursor: grab;
    padding: 0 4px;
    font-size: 1em;
    opacity: 0.4;
    user-select: none;
    flex-shrink: 0;
  }
  
  .dmt-settings-object-row:hover .dmt-drag-handle {
    opacity: 1;
  }
  
  .dmt-dragging {
    opacity: 0.5;
    background: var(--interactive-accent) !important;
    border-radius: 4px;
  }
  
  .dmt-settings-object-symbol {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 1.4em;
    width: 32px;
    text-align: center;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-object-symbol .ra {
    font-size: 1.2em;
    line-height: 1;
  }
  
  .dmt-settings-object-label {
    flex: 1;
    min-width: 0;
  }
  
  .dmt-settings-object-label.dmt-settings-modified {
    font-style: italic;
    color: var(--text-accent);
  }
  
  .dmt-settings-object-label.dmt-settings-modified::after {
    content: ' (modified)';
    font-size: 0.8em;
    opacity: 0.7;
  }
  
  .dmt-settings-object-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }
  
  .dmt-settings-icon-btn {
    background: transparent;
    border: none;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-settings-icon-btn:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-settings-icon-btn-danger:hover {
    color: var(--text-error);
  }
  
  /* Hidden section */
  .dmt-settings-hidden-section {
    margin-top: 2em;
    padding-top: 1em;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  .dmt-settings-hidden-list {
    margin-top: 8px;
    opacity: 0.7;
  }
  
  .dmt-settings-hidden-list .dmt-settings-object-row {
    background: var(--background-secondary);
  }
  
  /* Modal Styles */
  .dmt-object-edit-modal,
  .dmt-category-edit-modal {
    padding: 0;
  }
  
  .dmt-symbol-input {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 1.5em;
    width: 80px;
    text-align: center;
    padding: 8px;
  }
  
  .dmt-symbol-preview {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    font-size: 2em;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background-secondary);
    border-radius: 8px;
    margin-left: 8px;
  }
  
  .dmt-quick-symbols {
    margin: 1em 0;
  }
  
  .dmt-quick-symbols-label {
    display: block;
    font-size: 0.9em;
    color: var(--text-muted);
    margin-bottom: 8px;
  }
  
  .dmt-quick-symbols-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 150px;
    overflow-y: auto;
    padding: 4px;
    background: var(--background-secondary);
    border-radius: 8px;
  }
  
  .dmt-quick-symbol-btn {
    font-family: 'Noto Emoji', 'Noto Sans Symbols 2', sans-serif;
    width: 32px;
    height: 32px;
    font-size: 1.2em;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  
  .dmt-quick-symbol-btn:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
  }
  
  .dmt-modal-buttons {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 1.5em;
    padding-top: 1em;
    border-top: 1px solid var(--background-modifier-border);
  }
  
  /* Import/Export Modal Styles */
  .dmt-export-modal,
  .dmt-import-modal {
    padding: 0;
  }
  
  .dmt-export-empty {
    text-align: center;
    padding: 1em;
    color: var(--text-muted);
    font-style: italic;
  }
  
  .dmt-import-file-container {
    margin: 1em 0;
  }
  
  .dmt-import-file-container input[type="file"] {
    width: 100%;
    padding: 1em;
    border: 2px dashed var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    cursor: pointer;
  }
  
  .dmt-import-file-container input[type="file"]:hover {
    border-color: var(--interactive-accent);
  }
  
  .dmt-import-preview {
    margin: 1em 0;
    padding: 1em;
    background: var(--background-secondary);
    border-radius: 8px;
  }
  
  .dmt-import-preview p {
    margin: 0.25em 0;
  }
  
  .dmt-import-date {
    font-size: 0.85em;
    color: var(--text-muted);
  }
  
  .dmt-import-error {
    color: var(--text-error);
    font-weight: 500;
  }
  
  .dmt-import-options {
    margin-top: 1em;
  }
  
  /* Icon Type Toggle */
  .dmt-icon-type-toggle {
    display: flex;
    gap: 8px;
    margin-bottom: 1em;
  }
  
  .dmt-icon-type-btn {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.15s ease;
  }
  
  .dmt-icon-type-btn:hover {
    background: var(--background-modifier-hover);
  }
  
  .dmt-icon-type-btn.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  /* Icon Picker Container */
  .dmt-icon-picker {
    border: 1px solid var(--background-modifier-border);
    border-radius: 8px;
    background: var(--background-secondary);
    margin-bottom: 1em;
  }
  
  .dmt-icon-picker-search {
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
  }
  
  .dmt-icon-picker-search input {
    width: 100%;
    padding: 6px 10px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    background: var(--background-primary);
    font-size: 14px;
  }
  
  .dmt-icon-picker-search input:focus {
    border-color: var(--interactive-accent);
    outline: none;
  }
  
  /* Category Tabs */
  .dmt-icon-picker-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 8px;
    border-bottom: 1px solid var(--background-modifier-border);
    background: var(--background-primary-alt);
  }
  
  .dmt-icon-picker-tab {
    padding: 4px 8px;
    border: 1px solid transparent;
    background: transparent;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    color: var(--text-muted);
    transition: all 0.15s ease;
  }
  
  .dmt-icon-picker-tab:hover {
    background: var(--background-modifier-hover);
    color: var(--text-normal);
  }
  
  .dmt-icon-picker-tab.active {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
  }
  
  /* Icon Grid */
  .dmt-icon-picker-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 4px;
    padding: 8px;
    max-height: 200px;
    overflow-y: auto;
  }
  
  .dmt-icon-picker-icon {
    width: 40px;
    height: 40px;
    border: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
    border-radius: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    transition: all 0.15s ease;
  }
  
  .dmt-icon-picker-icon:hover {
    background: var(--background-modifier-hover);
    border-color: var(--interactive-accent);
    transform: scale(1.1);
  }
  
  .dmt-icon-picker-icon.selected {
    background: var(--interactive-accent);
    color: var(--text-on-accent);
    border-color: var(--interactive-accent);
  }
  
  .dmt-icon-picker-icon .ra {
    font-size: 20px;
    line-height: 1;
  }
  
  .dmt-icon-picker-empty {
    padding: 2em;
    text-align: center;
    color: var(--text-muted);
    font-style: italic;
  }
  
  /* Selected Icon Preview */
  .dmt-icon-preview-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px;
    border-top: 1px solid var(--background-modifier-border);
    background: var(--background-primary);
  }
  
  .dmt-icon-preview-large {
    width: 48px;
    height: 48px;
    border: 1px solid var(--background-modifier-border);
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 28px;
    background: var(--background-secondary);
  }
  
  .dmt-icon-preview-large .ra {
    font-size: 28px;
    line-height: 1;
  }
  
  .dmt-icon-preview-info {
    flex: 1;
  }
  
  .dmt-icon-preview-label {
    font-weight: 500;
    margin-bottom: 2px;
  }
  
  .dmt-icon-preview-class {
    font-size: 12px;
    color: var(--text-muted);
    font-family: var(--font-monospace);
  }
  
  /* RPGAwesome icon font - must be bundled in DungeonMapTracker - FONTS.css */
  /* Font-family name must be exactly 'rpgawesome' */
  .ra {
    font-family: 'rpgawesome' !important;
    font-style: normal;
    font-variant: normal;
    font-weight: normal;
    line-height: 1;
    speak: never;
    text-transform: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
\`;

// =============================================================================
// MODAL CLASSES
// Each modal is self-contained with its own state and rendering logic
// =============================================================================

/**
 * Modal for creating/editing objects
 */
class ObjectEditModal extends Modal {
  constructor(app, plugin, existingObject, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingObject = existingObject;
    this.onSave = onSave;
    
    // Form state
    this.symbol = existingObject?.symbol || '';
    this.iconClass = existingObject?.iconClass || '';
    this.label = existingObject?.label || '';
    this.category = existingObject?.category || 'features';
    
    // UI state - determine initial mode based on existing object
    this.useIcon = !!existingObject?.iconClass;
    this.iconSearchQuery = '';
    this.iconCategory = 'all';
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-object-edit-modal');
    
    const isEditing = !!this.existingObject;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Object' : 'Create Custom Object' });
    
    // Icon type toggle
    const toggleContainer = contentEl.createDiv({ cls: 'dmt-icon-type-toggle' });
    
    const unicodeBtn = toggleContainer.createEl('button', { 
      text: 'Unicode Symbol',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? '' : ' active'),
      attr: { type: 'button' }
    });
    
    const iconBtn = toggleContainer.createEl('button', { 
      text: 'RPGAwesome Icon',
      cls: 'dmt-icon-type-btn' + (this.useIcon ? ' active' : ''),
      attr: { type: 'button' }
    });
    
    // Container for symbol input (shown when useIcon is false)
    this.symbolContainer = contentEl.createDiv({ cls: 'dmt-symbol-container' });
    
    // Container for icon picker (shown when useIcon is true)
    this.iconPickerContainer = contentEl.createDiv({ cls: 'dmt-icon-picker-container' });
    
    // Toggle handlers
    unicodeBtn.onclick = () => {
      if (!this.useIcon) return;
      this.useIcon = false;
      unicodeBtn.addClass('active');
      iconBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    iconBtn.onclick = () => {
      if (this.useIcon) return;
      this.useIcon = true;
      iconBtn.addClass('active');
      unicodeBtn.removeClass('active');
      this.renderSymbolInput();
      this.renderIconPicker();
    };
    
    // Initial render of symbol/icon sections
    this.renderSymbolInput();
    this.renderIconPicker();
    
    // Label input
    new Setting(contentEl)
      .setName('Label')
      .setDesc('Display name for this object')
      .addText(text => text
        .setValue(this.label)
        .setPlaceholder('e.g., Treasure Chest')
        .onChange(value => {
          this.label = value;
        }));
    
    // Category dropdown
    const allCategories = ObjectHelpers.getAllCategories(this.plugin.settings);
    new Setting(contentEl)
      .setName('Category')
      .setDesc('Group this object belongs to')
      .addDropdown(dropdown => {
        for (const cat of allCategories) {
          dropdown.addOption(cat.id, cat.label);
        }
        dropdown.setValue(this.category);
        dropdown.onChange(value => {
          this.category = value;
        });
      });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  renderSymbolInput() {
    const container = this.symbolContainer;
    container.empty();
    
    if (this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    // Symbol input with preview
    const symbolSetting = new Setting(container)
      .setName('Symbol')
      .setDesc('Paste any Unicode character or emoji');
    
    const symbolInput = symbolSetting.controlEl.createEl('input', {
      type: 'text',
      cls: 'dmt-symbol-input',
      value: this.symbol,
      attr: { placeholder: 'Paste symbol...' }
    });
    symbolInput.addEventListener('input', (e) => {
      this.symbol = e.target.value.trim();
      this.updateSymbolPreview();
    });
    
    // Focus the symbol input after a short delay
    setTimeout(() => symbolInput.focus(), 50);
    
    // Symbol preview
    const previewEl = symbolSetting.controlEl.createDiv({ cls: 'dmt-symbol-preview' });
    previewEl.textContent = this.symbol || '?';
    this.symbolPreviewEl = previewEl;
    this.symbolInputEl = symbolInput;
    
    // Quick symbols
    const quickSymbolsContainer = container.createDiv({ cls: 'dmt-quick-symbols' });
    quickSymbolsContainer.createEl('label', { text: 'Quick Symbols', cls: 'dmt-quick-symbols-label' });
    const symbolGrid = quickSymbolsContainer.createDiv({ cls: 'dmt-quick-symbols-grid' });
    
    for (const sym of QUICK_SYMBOLS) {
      const symBtn = symbolGrid.createEl('button', { 
        text: sym, 
        cls: 'dmt-quick-symbol-btn',
        attr: { type: 'button' }
      });
      symBtn.onclick = () => {
        this.symbol = sym;
        symbolInput.value = sym;
        this.updateSymbolPreview();
      };
    }
  }
  
  renderIconPicker() {
    const container = this.iconPickerContainer;
    container.empty();
    
    if (!this.useIcon) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    
    const picker = container.createDiv({ cls: 'dmt-icon-picker' });
    
    // Search input
    const searchContainer = picker.createDiv({ cls: 'dmt-icon-picker-search' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      value: this.iconSearchQuery,
      attr: { placeholder: 'Search icons...' }
    });
    searchInput.addEventListener('input', (e) => {
      this.iconSearchQuery = e.target.value;
      this.renderIconGrid();
    });
    
    // Category tabs
    const tabsContainer = picker.createDiv({ cls: 'dmt-icon-picker-tabs' });
    
    // "All" tab
    const allTab = tabsContainer.createEl('button', {
      text: 'All',
      cls: 'dmt-icon-picker-tab' + (this.iconCategory === 'all' ? ' active' : ''),
      attr: { type: 'button' }
    });
    allTab.onclick = () => {
      this.iconCategory = 'all';
      this.renderIconTabs(tabsContainer);
      this.renderIconGrid();
    };
    
    // Category tabs
    const categories = RPGAwesomeHelpers.getCategories();
    for (const cat of categories) {
      const tab = tabsContainer.createEl('button', {
        text: cat.label,
        cls: 'dmt-icon-picker-tab' + (this.iconCategory === cat.id ? ' active' : ''),
        attr: { type: 'button', 'data-category': cat.id }
      });
      tab.onclick = () => {
        this.iconCategory = cat.id;
        this.renderIconTabs(tabsContainer);
        this.renderIconGrid();
      };
    }
    this.tabsContainer = tabsContainer;
    
    // Icon grid
    this.iconGridContainer = picker.createDiv({ cls: 'dmt-icon-picker-grid' });
    this.renderIconGrid();
    
    // Selected icon preview
    this.iconPreviewContainer = picker.createDiv({ cls: 'dmt-icon-preview-row' });
    this.updateIconPreview();
  }
  
  renderIconTabs(container) {
    // Update active state on all tabs
    const tabs = container.querySelectorAll('.dmt-icon-picker-tab');
    tabs.forEach(tab => {
      const catId = tab.getAttribute('data-category') || 'all';
      if (catId === this.iconCategory) {
        tab.addClass('active');
      } else {
        tab.removeClass('active');
      }
    });
  }
  
  renderIconGrid() {
    const container = this.iconGridContainer;
    if (!container) return;
    container.empty();
    
    // Get icons based on search or category
    let icons;
    if (this.iconSearchQuery.trim()) {
      icons = RPGAwesomeHelpers.search(this.iconSearchQuery);
    } else {
      icons = RPGAwesomeHelpers.getByCategory(this.iconCategory);
    }
    
    if (icons.length === 0) {
      container.createDiv({ cls: 'dmt-icon-picker-empty', text: 'No icons found' });
      return;
    }
    
    // Render icon buttons
    for (const icon of icons) {
      const iconBtn = container.createEl('button', {
        cls: 'dmt-icon-picker-icon' + (this.iconClass === icon.iconClass ? ' selected' : ''),
        attr: { 
          type: 'button',
          title: icon.label
        }
      });
      
      // Create the icon span with the character
      const iconSpan = iconBtn.createEl('span', { cls: 'ra' });
      iconSpan.textContent = icon.char;
      
      iconBtn.onclick = () => {
        this.iconClass = icon.iconClass;
        // Update selection state
        container.querySelectorAll('.dmt-icon-picker-icon').forEach(btn => btn.removeClass('selected'));
        iconBtn.addClass('selected');
        this.updateIconPreview();
      };
    }
  }
  
  updateSymbolPreview() {
    if (this.symbolPreviewEl) {
      this.symbolPreviewEl.textContent = this.symbol || '?';
    }
  }
  
  updateIconPreview() {
    const container = this.iconPreviewContainer;
    if (!container) return;
    container.empty();
    
    if (!this.iconClass) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Select an icon above' });
      return;
    }
    
    const iconInfo = RPGAwesomeHelpers.getInfo(this.iconClass);
    if (!iconInfo) {
      container.createDiv({ cls: 'dmt-icon-preview-info', text: 'Invalid icon selected' });
      return;
    }
    
    // Large preview
    const previewBox = container.createDiv({ cls: 'dmt-icon-preview-large' });
    const iconSpan = previewBox.createEl('span', { cls: 'ra' });
    iconSpan.textContent = iconInfo.char;
    
    // Info
    const infoBox = container.createDiv({ cls: 'dmt-icon-preview-info' });
    infoBox.createDiv({ cls: 'dmt-icon-preview-label', text: iconInfo.label });
    infoBox.createDiv({ cls: 'dmt-icon-preview-class', text: this.iconClass });
  }
  
  save() {
    // Validate based on mode
    if (this.useIcon) {
      if (!this.iconClass || !RPGAwesomeHelpers.isValid(this.iconClass)) {
        alert('Please select a valid icon');
        return;
      }
    } else {
      if (!this.symbol || this.symbol.length === 0 || this.symbol.length > 8) {
        alert('Please enter a valid symbol (1-8 characters)');
        return;
      }
    }
    
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a label');
      return;
    }
    
    if (this.existingObject?.isBuiltIn) {
      // Modifying a built-in: save as override
      if (!this.plugin.settings.objectOverrides) {
        this.plugin.settings.objectOverrides = {};
      }
      
      const original = BUILT_IN_OBJECTS.find(o => o.id === this.existingObject.id);
      const override = {};
      
      // Handle symbol/iconClass based on mode
      if (this.useIcon) {
        if (this.iconClass !== original.iconClass) override.iconClass = this.iconClass;
        // Clear symbol override if switching to icon
        if (original.symbol && !this.iconClass) override.symbol = null;
      } else {
        if (this.symbol !== original.symbol) override.symbol = this.symbol;
        // Clear iconClass override if switching to symbol
        if (original.iconClass) override.iconClass = null;
      }
      
      if (this.label !== original.label) override.label = this.label;
      if (this.category !== original.category) override.category = this.category;
      
      // Preserve hidden state if it exists
      if (this.plugin.settings.objectOverrides[this.existingObject.id]?.hidden) {
        override.hidden = true;
      }
      
      // Preserve order if it exists
      if (this.plugin.settings.objectOverrides[this.existingObject.id]?.order !== undefined) {
        override.order = this.plugin.settings.objectOverrides[this.existingObject.id].order;
      }
      
      if (Object.keys(override).length > 0) {
        this.plugin.settings.objectOverrides[this.existingObject.id] = override;
      } else {
        delete this.plugin.settings.objectOverrides[this.existingObject.id];
      }
    } else if (this.existingObject?.isCustom) {
      // Editing existing custom object
      const idx = this.plugin.settings.customObjects.findIndex(o => o.id === this.existingObject.id);
      if (idx !== -1) {
        const updated = {
          ...this.plugin.settings.customObjects[idx],
          label: this.label.trim(),
          category: this.category
        };
        
        // Set symbol or iconClass based on mode
        if (this.useIcon) {
          updated.iconClass = this.iconClass;
          delete updated.symbol;
        } else {
          updated.symbol = this.symbol;
          delete updated.iconClass;
        }
        
        this.plugin.settings.customObjects[idx] = updated;
      }
    } else {
      // Creating new custom object
      if (!this.plugin.settings.customObjects) {
        this.plugin.settings.customObjects = [];
      }
      
      const newObject = {
        id: 'custom-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        category: this.category
      };
      
      // Set symbol or iconClass based on mode
      if (this.useIcon) {
        newObject.iconClass = this.iconClass;
      } else {
        newObject.symbol = this.symbol;
      }
      
      this.plugin.settings.customObjects.push(newObject);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for creating/editing categories
 */
class CategoryEditModal extends Modal {
  constructor(app, plugin, existingCategory, onSave) {
    super(app);
    this.plugin = plugin;
    this.existingCategory = existingCategory;
    this.onSave = onSave;
    
    this.label = existingCategory?.label || '';
    this.order = existingCategory?.order ?? 100;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-category-edit-modal');
    
    const isEditing = !!this.existingCategory;
    
    contentEl.createEl('h2', { text: isEditing ? 'Edit Category' : 'Create Custom Category' });
    
    let nameInputEl = null;
    new Setting(contentEl)
      .setName('Name')
      .setDesc('Display name for this category')
      .addText(text => {
        nameInputEl = text.inputEl;
        text.setValue(this.label)
          .setPlaceholder('e.g., Alchemy')
          .onChange(value => {
            this.label = value;
          });
      });
    
    // Focus the name input after a short delay
    if (nameInputEl) {
      setTimeout(() => nameInputEl.focus(), 50);
    }
    
    new Setting(contentEl)
      .setName('Sort Order')
      .setDesc('Lower numbers appear first (built-ins use 0-50)')
      .addText(text => text
        .setValue(String(this.order))
        .setPlaceholder('100')
        .onChange(value => {
          const num = parseInt(value, 10);
          if (!isNaN(num)) {
            this.order = num;
          }
        }));
    
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const saveBtn = buttonContainer.createEl('button', { text: 'Save', cls: 'mod-cta' });
    saveBtn.onclick = () => this.save();
  }
  
  save() {
    if (!this.label || this.label.trim().length === 0) {
      alert('Please enter a category name');
      return;
    }
    
    if (!this.plugin.settings.customCategories) {
      this.plugin.settings.customCategories = [];
    }
    
    if (this.existingCategory) {
      const idx = this.plugin.settings.customCategories.findIndex(c => c.id === this.existingCategory.id);
      if (idx !== -1) {
        this.plugin.settings.customCategories[idx] = {
          ...this.plugin.settings.customCategories[idx],
          label: this.label.trim(),
          order: this.order
        };
      }
    } else {
      const newCategory = {
        id: 'custom-cat-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        label: this.label.trim(),
        order: this.order
      };
      
      this.plugin.settings.customCategories.push(newCategory);
    }
    
    this.onSave();
    this.close();
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for exporting object customizations
 */
class ExportModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-export-modal');
    
    contentEl.createEl('h2', { text: 'Export Object Customizations' });
    
    const { objectOverrides = {}, customObjects = [], customCategories = [] } = this.plugin.settings;
    const hasOverrides = Object.keys(objectOverrides).length > 0;
    const hasCustom = customObjects.length > 0 || customCategories.length > 0;
    
    // Selection checkboxes
    let exportOverrides = hasOverrides;
    let exportCustom = hasCustom;
    
    // Explain what will be exported
    if (hasOverrides || hasCustom) {
      contentEl.createEl('p', { 
        text: 'Select what to include in the export file:',
        cls: 'setting-item-description'
      });
    }
    
    if (hasOverrides) {
      new Setting(contentEl)
        .setName(\`Built-in modifications (\${Object.keys(objectOverrides).length})\`)
        .setDesc('Changes to symbol, label, or order of built-in objects')
        .addToggle(toggle => toggle
          .setValue(exportOverrides)
          .onChange(v => { exportOverrides = v; }));
    }
    
    if (hasCustom) {
      const customCount = customObjects.length + customCategories.length;
      new Setting(contentEl)
        .setName(\`Custom objects & categories (\${customCount})\`)
        .setDesc(\`\${customObjects.length} object(s), \${customCategories.length} category(ies)\`)
        .addToggle(toggle => toggle
          .setValue(exportCustom)
          .onChange(v => { exportCustom = v; }));
    }
    
    if (!hasOverrides && !hasCustom) {
      contentEl.createEl('p', { 
        text: 'No customizations to export. Modify built-in objects or create custom ones first.',
        cls: 'dmt-export-empty'
      });
      return;
    }
    
    // Filename input
    const defaultFilename = \`windrose-objects-\${new Date().toISOString().split('T')[0]}.json\`;
    let filename = defaultFilename;
    
    new Setting(contentEl)
      .setName('Filename')
      .setDesc('Will be saved to your vault root')
      .addText(text => text
        .setValue(filename)
        .onChange(v => { filename = v; }));
    
    // Export button
    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText('Export to Vault')
        .setCta()
        .onClick(async () => {
          const exportData = {
            windroseMD_objectExport: true,
            exportedAt: new Date().toISOString(),
            version: '1.0'
          };
          
          if (exportOverrides && hasOverrides) {
            exportData.objectOverrides = objectOverrides;
          }
          if (exportCustom && hasCustom) {
            if (customObjects.length > 0) exportData.customObjects = customObjects;
            if (customCategories.length > 0) exportData.customCategories = customCategories;
          }
          
          // Save to vault
          const json = JSON.stringify(exportData, null, 2);
          const finalFilename = filename.endsWith('.json') ? filename : filename + '.json';
          
          try {
            // Check if file exists
            const existingFile = this.app.vault.getAbstractFileByPath(finalFilename);
            if (existingFile) {
              if (!confirm(\`File "\${finalFilename}" already exists. Overwrite?\`)) {
                return;
              }
              await this.app.vault.modify(existingFile, json);
            } else {
              await this.app.vault.create(finalFilename, json);
            }
            
            alert(\`Exported to: \${finalFilename}\`);
            this.close();
          } catch (err) {
            alert(\`Export failed: \${err.message}\`);
          }
        }));
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

/**
 * Modal for importing object customizations
 */
class ImportModal extends Modal {
  constructor(app, plugin, onImport) {
    super(app);
    this.plugin = plugin;
    this.onImport = onImport;
    this.importData = null;
  }
  
  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('dmt-import-modal');
    
    contentEl.createEl('h2', { text: 'Import Object Customizations' });
    
    contentEl.createEl('p', { 
      text: 'Select a Windrose MD object export file (.json) to import.',
      cls: 'setting-item-description'
    });
    
    // File picker
    const fileContainer = contentEl.createDiv({ cls: 'dmt-import-file-container' });
    const fileInput = fileContainer.createEl('input', {
      type: 'file',
      attr: { accept: '.json' }
    });
    
    // Preview area (hidden until file selected)
    const previewArea = contentEl.createDiv({ cls: 'dmt-import-preview' });
    previewArea.style.display = 'none';
    
    // Import options (hidden until file validated)
    const optionsArea = contentEl.createDiv({ cls: 'dmt-import-options' });
    optionsArea.style.display = 'none';
    
    let mergeMode = 'merge'; // 'merge' or 'replace'
    
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        // Validate it's a Windrose export
        if (!data.windroseMD_objectExport) {
          previewArea.empty();
          previewArea.createEl('p', { 
            text: 'This file is not a valid Windrose MD object export.',
            cls: 'dmt-import-error'
          });
          previewArea.style.display = 'block';
          optionsArea.style.display = 'none';
          this.importData = null;
          return;
        }
        
        this.importData = data;
        
        // Show preview
        previewArea.empty();
        previewArea.createEl('p', { text: 'Valid Windrose MD export file' });
        if (data.exportedAt) {
          previewArea.createEl('p', { 
            text: \`Exported: \${new Date(data.exportedAt).toLocaleString()}\`,
            cls: 'dmt-import-date'
          });
        }
        
        const overrideCount = data.objectOverrides ? Object.keys(data.objectOverrides).length : 0;
        const customObjCount = data.customObjects?.length || 0;
        const customCatCount = data.customCategories?.length || 0;
        
        if (overrideCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${overrideCount} built-in modification(s)\` });
        }
        if (customObjCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${customObjCount} custom object(s)\` });
        }
        if (customCatCount > 0) {
          previewArea.createEl('p', { text: \`â€¢ \${customCatCount} custom category(ies)\` });
        }
        
        previewArea.style.display = 'block';
        
        // Show import options
        optionsArea.empty();
        new Setting(optionsArea)
          .setName('Import Mode')
          .setDesc('How to handle existing customizations')
          .addDropdown(dropdown => dropdown
            .addOption('merge', 'Merge (keep existing, add new)')
            .addOption('replace', 'Replace (remove existing first)')
            .setValue(mergeMode)
            .onChange(v => { mergeMode = v; }));
        
        optionsArea.style.display = 'block';
        
      } catch (err) {
        previewArea.empty();
        previewArea.createEl('p', { 
          text: \`Error reading file: \${err.message}\`,
          cls: 'dmt-import-error'
        });
        previewArea.style.display = 'block';
        optionsArea.style.display = 'none';
        this.importData = null;
      }
    });
    
    // Buttons
    const buttonContainer = contentEl.createDiv({ cls: 'dmt-modal-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: 'Cancel' });
    cancelBtn.onclick = () => this.close();
    
    const importBtn = buttonContainer.createEl('button', { text: 'Import', cls: 'mod-cta' });
    importBtn.onclick = async () => {
      if (!this.importData) {
        alert('Please select a valid export file first.');
        return;
      }
      
      const data = this.importData;
      
      if (mergeMode === 'replace') {
        // Clear existing
        this.plugin.settings.objectOverrides = {};
        this.plugin.settings.customObjects = [];
        this.plugin.settings.customCategories = [];
      }
      
      // Import overrides
      if (data.objectOverrides) {
        if (!this.plugin.settings.objectOverrides) {
          this.plugin.settings.objectOverrides = {};
        }
        Object.assign(this.plugin.settings.objectOverrides, data.objectOverrides);
      }
      
      // Import custom objects (avoid duplicates by ID)
      if (data.customObjects) {
        if (!this.plugin.settings.customObjects) {
          this.plugin.settings.customObjects = [];
        }
        for (const obj of data.customObjects) {
          const existingIdx = this.plugin.settings.customObjects.findIndex(o => o.id === obj.id);
          if (existingIdx !== -1) {
            this.plugin.settings.customObjects[existingIdx] = obj;
          } else {
            this.plugin.settings.customObjects.push(obj);
          }
        }
      }
      
      // Import custom categories (avoid duplicates by ID)
      if (data.customCategories) {
        if (!this.plugin.settings.customCategories) {
          this.plugin.settings.customCategories = [];
        }
        for (const cat of data.customCategories) {
          const existingIdx = this.plugin.settings.customCategories.findIndex(c => c.id === cat.id);
          if (existingIdx !== -1) {
            this.plugin.settings.customCategories[existingIdx] = cat;
          } else {
            this.plugin.settings.customCategories.push(cat);
          }
        }
      }
      
      await this.plugin.saveSettings();
      this.onImport();
      this.close();
    };
  }
  
  onClose() {
    this.contentEl.empty();
  }
}

// =============================================================================
// MAIN PLUGIN CLASS
// =============================================================================

class WindroseMDSettingsPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new WindroseMDSettingsTab(this.app, this));
  }

  onunload() {}

  async loadSettings() {
    try {
      const data = await this.loadData();
      this.settings = Object.assign({
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        // Object customization
        objectOverrides: {},
        customObjects: [],
        customCategories: []
      }, data || {});
    } catch (error) {
      console.warn('[DMT Settings] Error loading settings, using defaults:', error);
      this.settings = {
        version: '{{PLUGIN_VERSION}}',
        hexOrientation: '{{DEFAULT_HEX_ORIENTATION}}',
        gridLineColor: '{{DEFAULT_GRID_LINE_COLOR}}',
        gridLineWidth: 1,
        backgroundColor: '{{DEFAULT_BACKGROUND_COLOR}}',
        borderColor: '{{DEFAULT_BORDER_COLOR}}',
        coordinateKeyColor: '{{DEFAULT_COORDINATE_KEY_COLOR}}',
        coordinateTextColor: '{{DEFAULT_COORDINATE_TEXT_COLOR}}',
        coordinateTextShadow: '{{DEFAULT_COORDINATE_TEXT_SHADOW}}',
        coordinateKeyMode: 'hold',
        expandedByDefault: false,
        // Distance measurement settings
        distancePerCellGrid: 5,
        distancePerCellHex: 6,
        distanceUnitGrid: 'ft',
        distanceUnitHex: 'mi',
        gridDiagonalRule: 'alternating',
        distanceDisplayFormat: 'both',
        objectOverrides: {},
        customObjects: [],
        customCategories: []
      };
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// =============================================================================
// SETTINGS TAB CLASS
// =============================================================================

class WindroseMDSettingsTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.settingsChanged = false;
    this.styleEl = null;
    this.objectFilter = '';
  }

  // ---------------------------------------------------------------------------
  // Main display method - orchestrates section rendering
  // ---------------------------------------------------------------------------
  
  display() {
    const { containerEl } = this;
    containerEl.empty();
    
    this.injectStyles();
    
    this.renderHexSettings(containerEl);
    this.renderColorSettings(containerEl);
    this.renderMapBehaviorSettings(containerEl);
    this.renderDistanceMeasurementSettings(containerEl);
    this.renderObjectTypesSection(containerEl);
  }

  // ---------------------------------------------------------------------------
  // Section: Hex Map Settings
  // ---------------------------------------------------------------------------
  
  renderHexSettings(containerEl) {
    new Setting(containerEl).setName("Hex Map Settings").setHeading();

    // Hex Orientation
    new Setting(containerEl)
      .setName('Hex Grid Orientation')
      .setDesc('Default orientation for hex grids (flat-top or pointy-top)')
      .addDropdown(dropdown => dropdown
        .addOption('flat', 'Flat-Top')
        .addOption('pointy', 'Pointy-Top')
        .setValue(this.plugin.settings.hexOrientation)
        .onChange(async (value) => {
          this.plugin.settings.hexOrientation = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Key Mode
    new Setting(containerEl)
      .setName('Coordinate Overlay Mode')
      .setDesc('How the C key activates coordinate labels: hold to show temporarily, or toggle on/off')
      .addDropdown(dropdown => dropdown
        .addOption('hold', 'Hold to Show')
        .addOption('toggle', 'Toggle On/Off')
        .setValue(this.plugin.settings.coordinateKeyMode || 'hold')
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyMode = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Coordinate Text Color
    new Setting(containerEl)
      .setName('Coordinate Text Color')
      .setDesc('Primary color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_COLOR}}')
        .setValue(this.plugin.settings.coordinateTextColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextColor = '{{DEFAULT_COORDINATE_TEXT_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Text Shadow
    new Setting(containerEl)
      .setName('Coordinate Text Shadow')
      .setDesc('Shadow/outline color for hex coordinate overlay text (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          this.plugin.settings.coordinateTextShadow = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_TEXT_SHADOW}}')
        .setValue(this.plugin.settings.coordinateTextShadow)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateTextShadow = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateTextShadow = '{{DEFAULT_COORDINATE_TEXT_SHADOW}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Color Settings
  // ---------------------------------------------------------------------------
  
  renderColorSettings(containerEl) {
    new Setting(containerEl).setName("Color Settings").setHeading();
    containerEl.createEl('p', { 
      text: 'These settings control default colors and behavior for all WindroseMD maps in this vault.',
      cls: 'setting-item-description'
    });
    
    // Grid Line Color
    new Setting(containerEl)
      .setName('Grid Line Color')
      .setDesc('Color for grid lines (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          this.plugin.settings.gridLineColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_GRID_LINE_COLOR}}')
        .setValue(this.plugin.settings.gridLineColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.gridLineColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.gridLineColor = '{{DEFAULT_GRID_LINE_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Grid Line Width (grid maps only)
    new Setting(containerEl)
      .setName('Grid Line Width')
      .setDesc('Thickness of grid lines in pixels (1-5). Applies to grid maps only.')
      .addSlider(slider => slider
        .setLimits(1, 5, 1)
        .setValue(this.plugin.settings.gridLineWidth ?? 1)
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings.gridLineWidth = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default (1px)')
        .onClick(async () => {
          this.plugin.settings.gridLineWidth = 1;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Background Color
    new Setting(containerEl)
      .setName('Background Color')
      .setDesc('Canvas background color (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          this.plugin.settings.backgroundColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BACKGROUND_COLOR}}')
        .setValue(this.plugin.settings.backgroundColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.backgroundColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.backgroundColor = '{{DEFAULT_BACKGROUND_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Border Color
    new Setting(containerEl)
      .setName('Border Color')
      .setDesc('Color for painted cell borders (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          this.plugin.settings.borderColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_BORDER_COLOR}}')
        .setValue(this.plugin.settings.borderColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.borderColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.borderColor = '{{DEFAULT_BORDER_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));

    // Coordinate Key Color
    new Setting(containerEl)
      .setName('Coordinate Key Color')
      .setDesc('Background color for coordinate key indicator (hex format: #RRGGBB)')
      .addColorPicker(color => color
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          this.plugin.settings.coordinateKeyColor = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }))
      .addText(text => text
        .setPlaceholder('{{DEFAULT_COORDINATE_KEY_COLOR}}')
        .setValue(this.plugin.settings.coordinateKeyColor)
        .onChange(async (value) => {
          if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
            this.plugin.settings.coordinateKeyColor = value;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addExtraButton(btn => btn
        .setIcon('rotate-ccw')
        .setTooltip('Reset to default')
        .onClick(async () => {
          this.plugin.settings.coordinateKeyColor = '{{DEFAULT_COORDINATE_KEY_COLOR}}';
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Map Behavior
  // ---------------------------------------------------------------------------
  
  renderMapBehaviorSettings(containerEl) {
    new Setting(containerEl).setName("Map Behavior").setHeading();

    // Expanded by Default
    new Setting(containerEl)
      .setName('Start Maps Expanded')
      .setDesc('When enabled, maps will start in expanded (fullscreen) mode by default')
      .addToggle(toggle => toggle
        .setValue(this.plugin.settings.expandedByDefault)
        .onChange(async (value) => {
          this.plugin.settings.expandedByDefault = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Distance Measurement
  // ---------------------------------------------------------------------------
  
  renderDistanceMeasurementSettings(containerEl) {
    new Setting(containerEl).setName("Distance Measurement").setHeading();

    // Grid: Distance per cell
    new Setting(containerEl)
      .setName('Grid Map: Distance per Cell')
      .setDesc('Distance each cell represents on grid maps (default: 5 ft for D&D)')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.distancePerCellGrid))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellGrid = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitGrid)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitGrid = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Hex: Distance per cell
    new Setting(containerEl)
      .setName('Hex Map: Distance per Hex')
      .setDesc('Distance each hex represents on hex maps (default: 6 miles for world maps)')
      .addText(text => text
        .setPlaceholder('6')
        .setValue(String(this.plugin.settings.distancePerCellHex))
        .onChange(async (value) => {
          const num = parseFloat(value);
          if (!isNaN(num) && num > 0) {
            this.plugin.settings.distancePerCellHex = num;
            this.settingsChanged = true;
            await this.plugin.saveSettings();
          }
        }))
      .addDropdown(dropdown => dropdown
        .addOption('mi', 'miles')
        .addOption('km', 'kilometers')
        .addOption('ft', 'feet')
        .addOption('m', 'meters')
        .addOption('yd', 'yards')
        .setValue(this.plugin.settings.distanceUnitHex)
        .onChange(async (value) => {
          this.plugin.settings.distanceUnitHex = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Grid diagonal rule
    new Setting(containerEl)
      .setName('Grid Diagonal Movement')
      .setDesc('How to calculate diagonal distance on grid maps')
      .addDropdown(dropdown => dropdown
        .addOption('alternating', 'Alternating (5-10-5-10, D&D 5e)')
        .addOption('equal', 'Equal (Chebyshev, all moves = 1)')
        .addOption('euclidean', 'True Distance (Euclidean)')
        .setValue(this.plugin.settings.gridDiagonalRule)
        .onChange(async (value) => {
          this.plugin.settings.gridDiagonalRule = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));

    // Display format
    new Setting(containerEl)
      .setName('Distance Display Format')
      .setDesc('How to display measured distances')
      .addDropdown(dropdown => dropdown
        .addOption('both', 'Cells and Units (e.g., "3 cells (15 ft)")')
        .addOption('cells', 'Cells Only (e.g., "3 cells")')
        .addOption('units', 'Units Only (e.g., "15 ft")')
        .setValue(this.plugin.settings.distanceDisplayFormat)
        .onChange(async (value) => {
          this.plugin.settings.distanceDisplayFormat = value;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
        }));
  }

  // ---------------------------------------------------------------------------
  // Section: Object Types
  // ---------------------------------------------------------------------------
  
  renderObjectTypesSection(containerEl) {
    new Setting(containerEl).setName("Object Types").setHeading();
    
    containerEl.createEl('p', { 
      text: 'Customize map objects: modify built-in objects, create custom objects, or hide objects you don\\'t use.',
      cls: 'setting-item-description'
    });
    
    // Add Custom Object button
    new Setting(containerEl)
      .setName('Add Custom Object')
      .setDesc('Create a new map object with your own symbol')
      .addButton(btn => btn
        .setButtonText('+ Add Object')
        .setCta()
        .onClick(() => {
          new ObjectEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    
    // Add Custom Category button
    new Setting(containerEl)
      .setName('Add Custom Category')
      .setDesc('Create a new category to organize objects')
      .addButton(btn => btn
        .setButtonText('+ Add Category')
        .onClick(() => {
          new CategoryEditModal(this.app, this.plugin, null, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    
    // Import/Export buttons
    new Setting(containerEl)
      .setName('Import / Export')
      .setDesc('Share object configurations as JSON files')
      .addButton(btn => btn
        .setButtonText('Import')
        .onClick(() => {
          new ImportModal(this.app, this.plugin, async () => {
            this.settingsChanged = true;
            this.display();
          }).open();
        }))
      .addButton(btn => btn
        .setButtonText('Export')
        .onClick(() => {
          new ExportModal(this.app, this.plugin).open();
        }));
    
    // Get resolved data using helpers
    const allCategories = ObjectHelpers.getCategories(this.plugin.settings);
    const allObjects = ObjectHelpers.getResolved(this.plugin.settings);
    const hiddenObjects = ObjectHelpers.getHidden(this.plugin.settings);
    
    // Check if there are any customizations
    const hasOverrides = Object.keys(this.plugin.settings.objectOverrides || {}).length > 0;
    const hasCustomObjects = (this.plugin.settings.customObjects || []).length > 0;
    const hasCustomCategories = (this.plugin.settings.customCategories || []).length > 0;
    const hasAnyCustomizations = hasOverrides || hasCustomObjects || hasCustomCategories;
    
    // Reset All button (only show if there are customizations)
    if (hasAnyCustomizations) {
      new Setting(containerEl)
        .setName('Reset All Customizations')
        .setDesc('Remove all custom objects, categories, and modifications to built-in objects')
        .addButton(btn => btn
          .setButtonText('Reset All')
          .setWarning()
          .onClick(async () => {
            const counts = [];
            if (hasOverrides) counts.push(\`\${Object.keys(this.plugin.settings.objectOverrides).length} modification(s)\`);
            if (hasCustomObjects) counts.push(\`\${this.plugin.settings.customObjects.length} custom object(s)\`);
            if (hasCustomCategories) counts.push(\`\${this.plugin.settings.customCategories.length} custom category(ies)\`);
            
            if (confirm(\`This will remove \${counts.join(', ')}. Maps using custom objects will show "?" placeholders.\\n\\nContinue?\`)) {
              this.plugin.settings.objectOverrides = {};
              this.plugin.settings.customObjects = [];
              this.plugin.settings.customCategories = [];
              this.settingsChanged = true;
              await this.plugin.saveSettings();
              this.display();
            }
          }));
    }
    
    // Search/filter input
    const searchContainer = containerEl.createDiv({ cls: 'dmt-settings-search-container' });
    const searchInput = searchContainer.createEl('input', {
      type: 'text',
      cls: 'dmt-settings-search-input',
      attr: { placeholder: 'Filter objects...' },
      value: this.objectFilter || ''
    });
    searchInput.addEventListener('input', (e) => {
      this.objectFilter = e.target.value.toLowerCase().trim();
      this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
    });
    
    if (this.objectFilter) {
      const clearBtn = searchContainer.createEl('button', {
        cls: 'dmt-settings-search-clear',
        attr: { 'aria-label': 'Clear filter', title: 'Clear filter' }
      });
      IconHelpers.set(clearBtn, 'x');
      clearBtn.onclick = () => {
        this.objectFilter = '';
        searchInput.value = '';
        this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
      };
    }
    
    // Object list container (for filtered re-renders)
    const objectListContainer = containerEl.createDiv({ cls: 'dmt-settings-object-list-container' });
    this.renderObjectList(objectListContainer, allCategories, allObjects, hiddenObjects);
  }

  // ---------------------------------------------------------------------------
  // Object list rendering (called by renderObjectTypesSection)
  // ---------------------------------------------------------------------------
  
  renderObjectList(container, allCategories, allObjects, hiddenObjects) {
    container.empty();
    
    const filter = this.objectFilter || '';
    const isDraggable = !filter; // Disable drag when filtering
    
    // Filter objects if search term present
    const filteredObjects = filter
      ? allObjects.filter(obj => 
          obj.label.toLowerCase().includes(filter) || 
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : allObjects;
    
    const filteredHidden = filter
      ? hiddenObjects.filter(obj =>
          obj.label.toLowerCase().includes(filter) ||
          (obj.symbol && obj.symbol.toLowerCase().includes(filter)) ||
          (obj.iconClass && obj.iconClass.toLowerCase().includes(filter)))
      : hiddenObjects;
    
    // Show "no results" message if filter returns nothing
    if (filter && filteredObjects.length === 0 && filteredHidden.length === 0) {
      container.createDiv({ 
        cls: 'dmt-settings-no-results',
        text: \`No objects matching "\${filter}"\`
      });
      return;
    }
    
    // Render each category (skip 'notes' - note_pin is handled specially in the map UI)
    for (const category of allCategories) {
      if (category.id === 'notes') continue;
      
      let categoryObjects = filteredObjects.filter(obj => obj.category === category.id);
      if (categoryObjects.length === 0 && category.isBuiltIn) continue;
      if (categoryObjects.length === 0 && filter) continue;
      
      // Sort by order
      categoryObjects = categoryObjects.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      
      const categoryContainer = container.createDiv({ cls: 'dmt-settings-category' });
      
      // Category header with object count
      const categoryHeader = categoryContainer.createDiv({ cls: 'dmt-settings-category-header' });
      const labelText = category.label + (categoryObjects.length > 0 ? \` (\${categoryObjects.length})\` : '');
      categoryHeader.createSpan({ text: labelText, cls: 'dmt-settings-category-label' });
      
      // Edit/Delete for custom categories
      if (category.isCustom) {
        const categoryActions = categoryHeader.createDiv({ cls: 'dmt-settings-category-actions' });
        
        const editBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit category', title: 'Edit category' } });
        IconHelpers.set(editBtn, 'pencil');
        editBtn.onclick = () => {
          new CategoryEditModal(this.app, this.plugin, category, async () => {
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        };
        
        // Get unfiltered count for delete validation
        const allCategoryObjects = allObjects.filter(obj => obj.category === category.id);
        const deleteBtn = categoryActions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete category', title: 'Delete category' } });
        IconHelpers.set(deleteBtn, 'trash-2');
        deleteBtn.onclick = async () => {
          if (allCategoryObjects.length > 0) {
            alert(\`Cannot delete "\${category.label}" - it contains \${allCategoryObjects.length} object(s). Move or delete them first.\`);
            return;
          }
          if (confirm(\`Delete category "\${category.label}"?\`)) {
            this.plugin.settings.customCategories = this.plugin.settings.customCategories.filter(c => c.id !== category.id);
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
      
      // Object list with drag/drop support
      const objectList = categoryContainer.createDiv({ cls: 'dmt-settings-object-list' });
      objectList.dataset.categoryId = category.id;
      
      // Only enable drag/drop when not filtering
      if (!filter) {
        this.setupDragDropForList(objectList, category);
      }
      
      for (const obj of categoryObjects) {
        this.renderObjectRow(objectList, obj, false, !filter);
      }
    }
    
    // Hidden objects section
    if (filteredHidden.length > 0) {
      const hiddenContainer = container.createDiv({ cls: 'dmt-settings-hidden-section' });
      
      const hiddenHeader = new Setting(hiddenContainer)
        .setName(\`Hidden Objects (\${filteredHidden.length})\`)
        .setDesc('Built-in objects you\\'ve hidden from the palette');
      
      const hiddenList = hiddenContainer.createDiv({ cls: 'dmt-settings-object-list dmt-settings-hidden-list' });
      hiddenList.style.display = 'none';
      
      hiddenHeader.addButton(btn => btn
        .setButtonText('Show')
        .onClick(() => {
          const isVisible = hiddenList.style.display !== 'none';
          hiddenList.style.display = isVisible ? 'none' : 'block';
          btn.setButtonText(isVisible ? 'Show' : 'Hide');
        }));
      
      for (const obj of filteredHidden) {
        this.renderObjectRow(hiddenList, obj, true);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Drag/drop setup for object lists
  // ---------------------------------------------------------------------------
  
  setupDragDropForList(objectList, category) {
    objectList.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      
      const dragging = objectList.querySelector('.dmt-dragging');
      if (!dragging) return;
      
      const afterElement = DragHelpers.getAfterElement(objectList, e.clientY);
      if (afterElement == null) {
        objectList.appendChild(dragging);
      } else {
        objectList.insertBefore(dragging, afterElement);
      }
    });
    
    objectList.addEventListener('dragenter', (e) => {
      e.preventDefault();
    });
    
    objectList.addEventListener('drop', async (e) => {
      e.preventDefault();
      
      // Get new order from DOM positions
      const rows = [...objectList.querySelectorAll('.dmt-settings-object-row')];
      
      // Get default ID order for this category
      const defaultIdOrder = ObjectHelpers.getDefaultIdOrder(category.id, this.plugin.settings);
      
      // Apply new orders to settings
      rows.forEach((row, actualPosition) => {
        const id = row.dataset.objectId;
        const isBuiltIn = row.dataset.isBuiltIn === 'true';
        const newOrder = actualPosition * 10;
        
        if (isBuiltIn) {
          const defaultPosition = defaultIdOrder.indexOf(id);
          
          if (actualPosition === defaultPosition) {
            // In default position - remove order override if present
            if (this.plugin.settings.objectOverrides[id]) {
              delete this.plugin.settings.objectOverrides[id].order;
              if (Object.keys(this.plugin.settings.objectOverrides[id]).length === 0) {
                delete this.plugin.settings.objectOverrides[id];
              }
            }
          } else {
            // Not in default position - save order override
            if (!this.plugin.settings.objectOverrides[id]) {
              this.plugin.settings.objectOverrides[id] = {};
            }
            this.plugin.settings.objectOverrides[id].order = newOrder;
          }
          
          // Update modified indicator in DOM immediately
          const labelEl = row.querySelector('.dmt-settings-object-label');
          if (labelEl) {
            const override = this.plugin.settings.objectOverrides[id];
            const hasAnyOverride = override && Object.keys(override).length > 0;
            labelEl.classList.toggle('dmt-settings-modified', !!hasAnyOverride);
          }
        } else {
          // Custom objects - always save order
          const customObj = this.plugin.settings.customObjects.find(o => o.id === id);
          if (customObj) {
            customObj.order = newOrder;
          }
        }
      });
      
      this.settingsChanged = true;
      await this.plugin.saveSettings();
    });
  }

  // ---------------------------------------------------------------------------
  // Single object row rendering
  // ---------------------------------------------------------------------------
  
  renderObjectRow(container, obj, isHiddenSection = false, canDrag = false) {
    const row = container.createDiv({ cls: 'dmt-settings-object-row' });
    
    // Data attributes for drag/drop
    row.dataset.objectId = obj.id;
    row.dataset.isBuiltIn = String(!!obj.isBuiltIn);
    row.dataset.originalOrder = String(obj.order ?? 0);
    
    // Drag handle (only if draggable and not in hidden section)
    if (canDrag && !isHiddenSection) {
      row.setAttribute('draggable', 'true');
      row.classList.add('dmt-draggable');
      
      const dragHandle = row.createSpan({ cls: 'dmt-drag-handle' });
      IconHelpers.set(dragHandle, 'grip-vertical');
      
      row.style.userSelect = 'none';
      row.style.webkitUserSelect = 'none';
      
      row.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', obj.id);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => {
          row.classList.add('dmt-dragging');
        }, 0);
      });
      
      row.addEventListener('dragend', (e) => {
        row.classList.remove('dmt-dragging');
      });
    }
    
    // Symbol or Icon
    const symbolEl = row.createSpan({ cls: 'dmt-settings-object-symbol' });
    if (obj.iconClass && RPGAwesomeHelpers.isValid(obj.iconClass)) {
      const iconInfo = RPGAwesomeHelpers.getInfo(obj.iconClass);
      const iconSpan = symbolEl.createEl('span', { cls: 'ra' });
      iconSpan.textContent = iconInfo.char;
    } else {
      symbolEl.textContent = obj.symbol || '?';
    }
    
    // Label
    const labelEl = row.createSpan({ text: obj.label, cls: 'dmt-settings-object-label' });
    if (obj.isModified) {
      labelEl.addClass('dmt-settings-modified');
    }
    
    // Actions
    const actions = row.createDiv({ cls: 'dmt-settings-object-actions' });
    
    // Edit button
    const editBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Edit', title: 'Edit object' } });
    IconHelpers.set(editBtn, 'pencil');
    editBtn.onclick = () => {
      new ObjectEditModal(this.app, this.plugin, obj, async () => {
        this.settingsChanged = true;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    };
    
    if (obj.isBuiltIn) {
      if (isHiddenSection) {
        // Unhide button
        const unhideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Unhide', title: 'Show in palette' } });
        IconHelpers.set(unhideBtn, 'eye');
        unhideBtn.onclick = async () => {
          if (this.plugin.settings.objectOverrides[obj.id]) {
            delete this.plugin.settings.objectOverrides[obj.id].hidden;
            if (Object.keys(this.plugin.settings.objectOverrides[obj.id]).length === 0) {
              delete this.plugin.settings.objectOverrides[obj.id];
            }
          }
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      } else {
        // Hide button
        const hideBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Hide', title: 'Hide from palette' } });
        IconHelpers.set(hideBtn, 'eye-off');
        hideBtn.onclick = async () => {
          if (!this.plugin.settings.objectOverrides[obj.id]) {
            this.plugin.settings.objectOverrides[obj.id] = {};
          }
          this.plugin.settings.objectOverrides[obj.id].hidden = true;
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        };
      }
      
      // Reset button (only for modified)
      if (obj.isModified) {
        const resetBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn', attr: { 'aria-label': 'Reset to default', title: 'Reset to default' } });
        IconHelpers.set(resetBtn, 'rotate-ccw');
        resetBtn.onclick = async () => {
          if (confirm(\`Reset "\${obj.label}" to its default symbol and name?\`)) {
            delete this.plugin.settings.objectOverrides[obj.id];
            this.settingsChanged = true;
            await this.plugin.saveSettings();
            this.display();
          }
        };
      }
    } else {
      // Delete button for custom objects
      const deleteBtn = actions.createEl('button', { cls: 'dmt-settings-icon-btn dmt-settings-icon-btn-danger', attr: { 'aria-label': 'Delete', title: 'Delete object' } });
      IconHelpers.set(deleteBtn, 'trash-2');
      deleteBtn.onclick = async () => {
        if (confirm(\`Delete "\${obj.label}"? Maps using this object will show a "?" placeholder.\`)) {
          this.plugin.settings.customObjects = this.plugin.settings.customObjects.filter(o => o.id !== obj.id);
          this.settingsChanged = true;
          await this.plugin.saveSettings();
          this.display();
        }
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Styles injection
  // ---------------------------------------------------------------------------
  
  injectStyles() {
    if (this.styleEl) {
      this.styleEl.remove();
    }
    
    this.styleEl = document.createElement('style');
    this.styleEl.textContent = DMT_SETTINGS_STYLES;
    document.head.appendChild(this.styleEl);
  }
  
  hide() {
    // Only dispatch event if settings were actually changed
    if (this.settingsChanged) {
      window.dispatchEvent(new CustomEvent('dmt-settings-changed', {
        detail: { timestamp: Date.now() }
      }));
      this.settingsChanged = false;
    }
    
    // Clean up injected styles
    if (this.styleEl) {
      this.styleEl.remove();
      this.styleEl = null;
    }
  }
}

module.exports = WindroseMDSettingsPlugin;`;
```

# SettingsPluginInstaller

```jsx
// SettingsPluginInstaller.jsx - Inline prompt for settings plugin installation

const { THEME, DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));

// Import the plugin template as a string (allows bundling without Datacore trying to execute it)
const SETTINGS_PLUGIN_TEMPLATE = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsPluginMain"));

// Import object types for template injection (single source of truth)
const { OBJECT_TYPES, CATEGORIES } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "objectTypes"));

// Import RPGAwesome icon data for template injection
const { RA_ICONS, RA_CATEGORIES } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "rpgAwesomeIcons"));

// Plugin version from template
const PACKAGED_PLUGIN_VERSION = '0.8.2';

// LocalStorage keys for tracking user preferences
const STORAGE_KEYS = {
  INSTALL_DECLINED: 'dmt-plugin-install-declined',
  UPGRADE_DECLINED_VERSION: 'dmt-plugin-upgrade-declined-version'
};

/**
 * Compare semantic version strings (e.g., "1.2.3" vs "1.1.0")
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;
    
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  
  return 0;
}

/**
 * Get the installed plugin's version from its manifest
 */
function getInstalledPluginVersion() {
  try {
    const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
    return plugin?.manifest?.version || null;
  } catch (error) {
    return null;
  }
}

/**
 * Check if plugin is installed
 */
function isPluginInstalled() {
  try {
    const adapter = dc.app.vault.adapter;
    // We'll do an async check in the component, this is just a quick sync check
    return !!dc.app.plugins.plugins['dungeon-map-tracker-settings'];
  } catch (error) {
    return false;
  }
}

/**
 * Check if an upgrade is available and not declined
 */
function shouldOfferUpgrade() {
  const installedVersion = getInstalledPluginVersion();
  if (!installedVersion) return false;
  
  // Check if upgrade is available
  const upgradeAvailable = compareVersions(PACKAGED_PLUGIN_VERSION, installedVersion) > 0;
  if (!upgradeAvailable) return false;
  
  // Check if user declined this specific version
  const declinedVersion = localStorage.getItem(STORAGE_KEYS.UPGRADE_DECLINED_VERSION);
  if (declinedVersion === PACKAGED_PLUGIN_VERSION) return false;
  
  return true;
}

/**
 * Generate manifest object with current version
 */
function generateManifest() {
  return {
    id: 'dungeon-map-tracker-settings',
    name: 'Windrose MapDesigner Settings',
    version: PACKAGED_PLUGIN_VERSION,
    minAppVersion: '0.15.0',
    description: 'Global settings for Windrose MapDesigner - customize default colors, hex orientation, and visual preferences.',
    author: 'Windrose MD',
    isDesktopOnly: false
  };
}

/**
 * Escape non-ASCII unicode characters in a string as \uXXXX sequences.
 * Required for PUA (Private Use Area) characters in RA_ICONS that can
 * cause parsing issues on some platforms when embedded as raw characters.
 */
function escapeUnicode(str) {
  return str.replace(/[\u0080-\uffff]/g, (c) => {
    return '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0');
  });
}

/**
 * Generate main.js content from template with injected constants
 */
function generateMainJs() {
  // Build category order map from CATEGORIES
  const categoryOrder = {};
  CATEGORIES.forEach(c => { categoryOrder[c.id] = c.order; });
  
  return SETTINGS_PLUGIN_TEMPLATE
    .replace(/\{\{PLUGIN_VERSION\}\}/g, PACKAGED_PLUGIN_VERSION)
    .replace(/\{\{DEFAULT_HEX_ORIENTATION\}\}/g, DEFAULTS.hexOrientation)
    .replace(/\{\{DEFAULT_GRID_LINE_COLOR\}\}/g, THEME.grid.lines)
    .replace(/\{\{DEFAULT_BACKGROUND_COLOR\}\}/g, THEME.grid.background)
    .replace(/\{\{DEFAULT_BORDER_COLOR\}\}/g, THEME.cells.border)
    .replace(/\{\{DEFAULT_COORDINATE_KEY_COLOR\}\}/g, THEME.coordinateKey.color)
    .replace(/\{\{DEFAULT_COORDINATE_TEXT_COLOR\}\}/g, THEME.coordinateText.color)
    .replace(/\{\{DEFAULT_COORDINATE_TEXT_SHADOW\}\}/g, THEME.coordinateText.shadow)
    .replace('{{BUILT_IN_OBJECTS}}', JSON.stringify(OBJECT_TYPES, null, 2))
    .replace('{{BUILT_IN_CATEGORIES}}', JSON.stringify(CATEGORIES, null, 2))
    .replace('{{CATEGORY_ORDER}}', JSON.stringify(categoryOrder, null, 2))
    .replace('{{RA_ICONS}}', escapeUnicode(JSON.stringify(RA_ICONS, null, 2)))
    .replace('{{RA_CATEGORIES}}', JSON.stringify(RA_CATEGORIES, null, 2));
}

const SettingsPluginInstaller = ({ onInstall, onDecline, mode = 'auto' }) => {
  const [isInstalling, setIsInstalling] = dc.useState(false);
  const [installError, setInstallError] = dc.useState(null);
  const [showSuccessModal, setShowSuccessModal] = dc.useState(false);
  
  // Determine if we're in install or upgrade mode
  const installedVersion = getInstalledPluginVersion();
  const isUpgradeMode = mode === 'upgrade' || (mode === 'auto' && installedVersion && shouldOfferUpgrade());
  const actionMode = isUpgradeMode ? 'upgrade' : 'install';

  const handleInstall = async () => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
      const adapter = dc.app.vault.adapter;

      // Check if plugin directory already exists
      const exists = await adapter.exists(pluginDir);
      if (exists) {
        setInstallError('Plugin directory already exists. Please enable it in Community Plugins settings.');
        setIsInstalling(false);
        return;
      }

      // Create plugin directory
      await adapter.mkdir(pluginDir);

      // Write manifest.json
      await adapter.write(
        `${pluginDir}/manifest.json`,
        JSON.stringify(generateManifest(), null, 2)
      );

      // Write main.js from template
      const mainJs = generateMainJs();
      await adapter.write(`${pluginDir}/main.js`, mainJs);

      // Create initial data.json with defaults from dmtConstants
      const defaultData = {
        version: '1.0.0',
        hexOrientation: DEFAULTS.hexOrientation,
        gridLineColor: THEME.grid.lines,
        gridLineWidth: THEME.grid.lineWidth,
        backgroundColor: THEME.grid.background,
        borderColor: THEME.cells.border,
        coordinateKeyColor: THEME.coordinateKey.color,
        expandedByDefault: false,
        // Object customization
        objectOverrides: {},
        customObjects: [],
        customCategories: []
      };
      await adapter.write(
        `${pluginDir}/data.json`,
        JSON.stringify(defaultData, null, 2)
      );

      // Add plugin to community-plugins.json so it persists across reloads
      try {
        const communityPluginsPath = '.obsidian/community-plugins.json';
        let enabledPlugins = [];
        
        // Read existing community-plugins.json if it exists
        if (await adapter.exists(communityPluginsPath)) {
          const content = await adapter.read(communityPluginsPath);
          enabledPlugins = JSON.parse(content);
        }
        
        // Add our plugin if not already in the list
        if (!enabledPlugins.includes('dungeon-map-tracker-settings')) {
          enabledPlugins.push('dungeon-map-tracker-settings');
          await adapter.write(communityPluginsPath, JSON.stringify(enabledPlugins, null, 2));
        }
        
        // Reload plugins to detect the new plugin (but don't enable yet)
        await dc.app.plugins.loadManifests();
      } catch (manifestError) {
        console.warn('[SettingsPluginInstaller] Could not reload manifests:', manifestError);
        // Not critical - plugin will be detected on next Obsidian restart
      }

      setIsInstalling(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('[SettingsPluginInstaller] Installation error:', error);
      setInstallError(`Installation failed: ${error.message}`);
      setIsInstalling(false);
    }
  };

  const handleUpgrade = async () => {
    setIsInstalling(true);
    setInstallError(null);

    try {
      const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
      const adapter = dc.app.vault.adapter;

      // Verify plugin exists
      const exists = await adapter.exists(pluginDir);
      if (!exists) {
        setInstallError('Plugin not found. Please install it first.');
        setIsInstalling(false);
        return;
      }

      // Write updated manifest.json
      await adapter.write(
        `${pluginDir}/manifest.json`,
        JSON.stringify(generateManifest(), null, 2)
      );

      // Write updated main.js from template
      const mainJs = generateMainJs();
      await adapter.write(`${pluginDir}/main.js`, mainJs);

      // DO NOT overwrite data.json - preserve user settings!

      // Reload the plugin
      try {
        await dc.app.plugins.disablePlugin('dungeon-map-tracker-settings');
        await dc.app.plugins.loadManifests();
        await dc.app.plugins.enablePlugin('dungeon-map-tracker-settings');
      } catch (reloadError) {
        console.warn('[SettingsPluginInstaller] Could not reload plugin:', reloadError);
        // Not critical - plugin will be updated on next Obsidian restart
      }

      setIsInstalling(false);
      setShowSuccessModal(true);
    } catch (error) {
      console.error('[SettingsPluginInstaller] Upgrade error:', error);
      setInstallError(`Upgrade failed: ${error.message}`);
      setIsInstalling(false);
    }
  };

  const handleAction = () => {
    if (actionMode === 'upgrade') {
      handleUpgrade();
    } else {
      handleInstall();
    }
  };

  const handleDecline = () => {
    if (actionMode === 'upgrade') {
      // Store the declined version
      localStorage.setItem(STORAGE_KEYS.UPGRADE_DECLINED_VERSION, PACKAGED_PLUGIN_VERSION);
    } else {
      // Store that install was declined
      localStorage.setItem(STORAGE_KEYS.INSTALL_DECLINED, 'true');
    }
    onDecline();
  };

  const handleEnableNow = async () => {
    try {
      // Small delay to ensure manifest is loaded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Enable the plugin
      await dc.app.plugins.enablePlugin('dungeon-map-tracker-settings');
      
      setShowSuccessModal(false);
      onInstall();
    } catch (enableError) {
      console.error('[SettingsPluginInstaller] Failed to enable plugin:', enableError);
      setInstallError(`Failed to enable plugin: ${enableError.message}`);
      setShowSuccessModal(false);
    }
  };

  const handleContinueWithoutEnabling = () => {
    setShowSuccessModal(false);
    onInstall();
  };

  return (
    <div className="dmt-plugin-installer">
      <div className="dmt-plugin-installer-card">
        <div className="dmt-plugin-installer-icon">
          <dc.Icon icon="lucide-settings" />
        </div>
        <div className="dmt-plugin-installer-content">
          <h3>
            {actionMode === 'upgrade' 
              ? `Update Available (v${installedVersion} â†’ v${PACKAGED_PLUGIN_VERSION})`
              : 'Enhance Your Mapping Experience'
            }
          </h3>
          <p>
            {actionMode === 'upgrade'
              ? `A new version of the Windrose MapDesigner Settings plugin is available.`
              : `Install the Windrose MapDesigner Settings plugin to customize:`
            }
          </p>
          {actionMode === 'install' && (
            <ul>
              <li>Default colors for grids, borders, and backgrounds</li>
              <li>Hex grid orientation (flat-top or pointy-top)</li>
              <li>Coordinate label colors</li>
              <li>Custom map objects and symbols</li>
              <li>Visual preferences across all your maps</li>
            </ul>
          )}
          {actionMode === 'upgrade' && (
            <p className="dmt-plugin-installer-note">
              Your settings will be preserved during the update.
            </p>
          )}
          <p className="dmt-plugin-installer-note">
            {actionMode === 'upgrade'
              ? 'You can update now or continue with your current version.'
              : 'This is a one-time setup. You can change settings anytime in Obsidian\'s Settings panel. If you decline, default colors will be used.'
            }
          </p>
          {installError && (
            <div className="dmt-plugin-installer-error">
              {installError}
            </div>
          )}
        </div>
        <div className="dmt-plugin-installer-actions">
          <button
            className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
            onClick={handleAction}
            disabled={isInstalling}
          >
            {isInstalling 
              ? (actionMode === 'upgrade' ? 'Updating...' : 'Installing...') 
              : (actionMode === 'upgrade' ? 'Update Plugin' : 'Install Plugin')
            }
          </button>
          <button
            className="dmt-plugin-installer-btn dmt-plugin-installer-btn-secondary"
            onClick={handleDecline}
            disabled={isInstalling}
          >
            {actionMode === 'upgrade' ? 'Not Now' : 'Use Defaults'}
          </button>
        </div>
      </div>

      {showSuccessModal && (
        <div className="dmt-plugin-success-modal-overlay">
          <div className="dmt-plugin-success-modal">
            <div className="dmt-plugin-success-icon">
              <dc.Icon icon="lucide-check-circle" />
            </div>
            <h3>
              {actionMode === 'upgrade' 
                ? 'Plugin Updated Successfully!'
                : 'Plugin Installed Successfully!'
              }
            </h3>
            <p>
              {actionMode === 'upgrade'
                ? `The Windrose MD Settings plugin has been updated to v${PACKAGED_PLUGIN_VERSION}.`
                : `The Windrose MD Settings plugin has been installed.`
              }
              {actionMode === 'install' && ' Would you like to enable it now?'}
            </p>
            {actionMode === 'install' && (
              <p className="dmt-plugin-success-note">
                You can always enable or disable this plugin later in Obsidian's Community Plugins settings.
              </p>
            )}
            <div className="dmt-plugin-success-actions">
              {actionMode === 'install' ? (
                <>
                  <button
                    className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
                    onClick={handleEnableNow}
                  >
                    Enable Now
                  </button>
                  <button
                    className="dmt-plugin-installer-btn dmt-plugin-installer-btn-secondary"
                    onClick={handleContinueWithoutEnabling}
                  >
                    Continue Without Enabling
                  </button>
                </>
              ) : (
                <button
                  className="dmt-plugin-installer-btn dmt-plugin-installer-btn-primary"
                  onClick={() => {
                    setShowSuccessModal(false);
                    onInstall();
                  }}
                >
                  Continue
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

return { 
  SettingsPluginInstaller,
  // Export utilities for other components to check upgrade status
  PACKAGED_PLUGIN_VERSION,
  shouldOfferUpgrade,
  getInstalledPluginVersion,
  isPluginInstalled,
  compareVersions,
  STORAGE_KEYS
};
```

# ModalPortal

```jsx
/**
 * ModalPortal - Reusable portal component for rendering modals to document.body
 * 
 * This renders children normally, then uses DOM manipulation to move the rendered
 * content to a portal container in document.body, fixing mobile viewport issues.
 */

const ModalPortal = ({ children }) => {
  const wrapperRef = dc.useRef(null);
  const portalContainerRef = dc.useRef(null);
  
  // Create portal container on mount
  dc.useEffect(() => {
    let portal = document.getElementById('dmt-modal-portal');
    if (!portal) {
      portal = document.createElement('div');
      portal.id = 'dmt-modal-portal';
      portal.className = 'dmt-modal-portal';
      document.body.appendChild(portal);
    }
    portalContainerRef.current = portal;
    
    return () => {
      // Clean up portal container if it's empty
      if (portal && portal.childNodes.length === 0 && portal.parentNode) {
        portal.parentNode.removeChild(portal);
      }
    };
  }, []);
  
  // Move wrapper to portal container after render
  dc.useEffect(() => {
    if (wrapperRef.current && portalContainerRef.current) {
      // Move the wrapper element to the portal
      portalContainerRef.current.appendChild(wrapperRef.current);
    }
    
    return () => {
      // Remove from portal on unmount
      if (wrapperRef.current && wrapperRef.current.parentNode) {
        wrapperRef.current.parentNode.removeChild(wrapperRef.current);
      }
    };
  }, []);
  
  // Render wrapper that will be moved to portal
  return (
    <div ref={wrapperRef} className="dmt-modal-portal-content">
      {children}
    </div>
  );
};

return { ModalPortal };
```

# MapSettingsModal

```jsx
const { ColorPicker } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ColorPicker"));
const { ModalPortal } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ModalPortal"));
const { getSettings, FALLBACK_SETTINGS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));
const { THEME } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));
const { axialToOffset, isWithinOffsetBounds } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "offsetCoordinates"));
const { 
  getImageDisplayNames, 
  getFullPathFromDisplayName, 
  getDisplayNameFromPath,
  getImageDimensions,
  calculateGridFromImage,
  GRID_DENSITY_PRESETS 
} = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "imageOperations"));

/**
 * Modal for configuring per-map settings and UI preferences
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Preferences - UI state persistence options
 */
function MapSettingsModal({ 
  isOpen, 
  onClose, 
  onSave,
  mapType = 'grid',  // 'grid' or 'hex'
  orientation = 'flat',  // 'flat' or 'pointy' - for hex maps
  currentSettings = null,  // { useGlobalSettings: bool, overrides: {...} }
  currentPreferences = null,  // { rememberPanZoom: bool, rememberSidebarState: bool, rememberExpandedState: bool }
  currentHexBounds = null,  // { maxCol: number, maxRow: number } - for hex maps only
  currentBackgroundImage = null,  // { path: string|null, lockBounds: bool, opacity: number } - for hex maps only
  currentDistanceSettings = null,  // { distancePerCell: number, distanceUnit: string, gridDiagonalRule: string, displayFormat: string }
  currentCells = [],  // Array of {q, r, color} - painted cells for hex maps
  currentObjects = []  // Array of objects with {x, y} positions - for checking orphaned content
}) {
  // Get global settings for comparison/defaults
  const globalSettings = getSettings();
  
  // Tab state - default to first tab
  const [activeTab, setActiveTab] = dc.useState('appearance');
  
  // Initialize state with current values or defaults
  const [useGlobalSettings, setUseGlobalSettings] = dc.useState(
    currentSettings?.useGlobalSettings ?? true
  );
  
  const [overrides, setOverrides] = dc.useState({
    gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor,
    gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
    backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor,
    borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor,
    coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor,
    coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor,
    coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow
  });
  
  const [preferences, setPreferences] = dc.useState({
    rememberPanZoom: currentPreferences?.rememberPanZoom ?? true,
    rememberSidebarState: currentPreferences?.rememberSidebarState ?? true,
    rememberExpandedState: currentPreferences?.rememberExpandedState ?? false
  });
  
  // Distance measurement settings (per-map overrides)
  const isHexMap = mapType === 'hex';
  const defaultDistancePerCell = isHexMap 
    ? (globalSettings.distancePerCellHex ?? 6) 
    : (globalSettings.distancePerCellGrid ?? 5);
  const defaultDistanceUnit = isHexMap 
    ? (globalSettings.distanceUnitHex ?? 'mi') 
    : (globalSettings.distanceUnitGrid ?? 'ft');
  
  const [distanceSettings, setDistanceSettings] = dc.useState({
    useGlobalDistance: currentDistanceSettings?.useGlobalDistance ?? true,
    distancePerCell: currentDistanceSettings?.distancePerCell ?? defaultDistancePerCell,
    distanceUnit: currentDistanceSettings?.distanceUnit ?? defaultDistanceUnit,
    gridDiagonalRule: currentDistanceSettings?.gridDiagonalRule ?? (globalSettings.gridDiagonalRule ?? 'alternating'),
    displayFormat: currentDistanceSettings?.displayFormat ?? (globalSettings.distanceDisplayFormat ?? 'both')
  });
  
  const [hexBounds, setHexBounds] = dc.useState({
    maxCol: currentHexBounds?.maxCol ?? 26,
    maxRow: currentHexBounds?.maxRow ?? 20
  });
  
  // Coordinate display settings (for hex maps)
  const [coordinateDisplayMode, setCoordinateDisplayMode] = dc.useState(
    currentSettings?.coordinateDisplayMode ?? 'rectangular'
  );
  
  // Background image state (hex maps only)
  const [backgroundImagePath, setBackgroundImagePath] = dc.useState(
    currentBackgroundImage?.path ?? null
  );
  const [backgroundImageDisplayName, setBackgroundImageDisplayName] = dc.useState(
    currentBackgroundImage?.path ? getDisplayNameFromPath(currentBackgroundImage.path) : ''
  );
  const [imageDimensions, setImageDimensions] = dc.useState(null);
  const [gridDensity, setGridDensity] = dc.useState('medium');
  const [customColumns, setCustomColumns] = dc.useState(24);
  const [savedDensity, setSavedDensity] = dc.useState(null);  // Track saved density preference
  const [boundsLocked, setBoundsLocked] = dc.useState(
    currentBackgroundImage?.lockBounds ?? true  // Lock by default when image exists
  );
  const [imageOpacity, setImageOpacity] = dc.useState(
    currentBackgroundImage?.opacity ?? 1  // Default to fully opaque
  );
  const [imageOffsetX, setImageOffsetX] = dc.useState(
    currentBackgroundImage?.offsetX ?? 0  // Horizontal offset in pixels
  );
  const [imageOffsetY, setImageOffsetY] = dc.useState(
    currentBackgroundImage?.offsetY ?? 0  // Vertical offset in pixels
  );
  const [imageSearchResults, setImageSearchResults] = dc.useState([]);
  
  const [activeColorPicker, setActiveColorPicker] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(false);
  
  // Resize confirmation dialog state
  const [showResizeConfirm, setShowResizeConfirm] = dc.useState(false);
  const [pendingBoundsChange, setPendingBoundsChange] = dc.useState(null); // { newBounds, previousBounds }
  const [orphanInfo, setOrphanInfo] = dc.useState({ cells: 0, objects: 0 });
  const [deleteOrphanedContent, setDeleteOrphanedContent] = dc.useState(false);
  
  // Helper function to check if content would be orphaned by new bounds
  const getOrphanedContentInfo = dc.useCallback((newBounds) => {
    if (mapType !== 'hex') return { cells: 0, objects: 0 };
    
    let orphanedCells = 0;
    let orphanedObjects = 0;
    
    // Check cells (stored as {q, r, color})
    if (currentCells && currentCells.length > 0) {
      currentCells.forEach(cell => {
        const { col, row } = axialToOffset(cell.q, cell.r, orientation);
        if (!isWithinOffsetBounds(col, row, newBounds)) {
          orphanedCells++;
        }
      });
    }
    
    // Check objects (position.x=q, position.y=r for hex maps)
    if (currentObjects && currentObjects.length > 0) {
      currentObjects.forEach(obj => {
        const { col, row } = axialToOffset(obj.position.x, obj.position.y, orientation);
        if (!isWithinOffsetBounds(col, row, newBounds)) {
          orphanedObjects++;
        }
      });
    }
    
    return { cells: orphanedCells, objects: orphanedObjects };
  }, [mapType, currentCells, currentObjects, orientation]);
  
  // Refs for color buttons to detect clicks outside
  const gridLineColorBtnRef = dc.useRef(null);
  const backgroundColorBtnRef = dc.useRef(null);
  const borderColorBtnRef = dc.useRef(null);
  const coordinateKeyColorBtnRef = dc.useRef(null);
  const coordinateTextColorBtnRef = dc.useRef(null);
  const coordinateTextShadowBtnRef = dc.useRef(null);
  const pendingCustomColorRef = dc.useRef(null);
  const mouseDownTargetRef = dc.useRef(null);
  
  // Reset state when modal opens
  dc.useEffect(() => {
    if (isOpen) {
      setUseGlobalSettings(currentSettings?.useGlobalSettings ?? true);
      setOverrides({
        gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor,
        gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
        backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor,
        borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor,
        coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor,
        coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor,
        coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow
      });
      setPreferences({
        rememberPanZoom: currentPreferences?.rememberPanZoom ?? true,
        rememberSidebarState: currentPreferences?.rememberSidebarState ?? true,
        rememberExpandedState: currentPreferences?.rememberExpandedState ?? false
      });
      setHexBounds({
        maxCol: currentHexBounds?.maxCol ?? 26,
        maxRow: currentHexBounds?.maxRow ?? 20
      });
      setCoordinateDisplayMode(currentSettings?.coordinateDisplayMode ?? 'rectangular');
      
      // Reset distance settings
      const savedDistanceSettings = currentSettings?.distanceSettings;
      const currentGlobalSettings = getSettings();
      const isHex = mapType === 'hex';
      const defaultPerCell = isHex 
        ? (currentGlobalSettings.distancePerCellHex ?? 6) 
        : (currentGlobalSettings.distancePerCellGrid ?? 5);
      const defaultUnit = isHex 
        ? (currentGlobalSettings.distanceUnitHex ?? 'mi') 
        : (currentGlobalSettings.distanceUnitGrid ?? 'ft');
      setDistanceSettings({
        useGlobalDistance: !savedDistanceSettings,
        distancePerCell: savedDistanceSettings?.distancePerCell ?? defaultPerCell,
        distanceUnit: savedDistanceSettings?.distanceUnit ?? defaultUnit,
        gridDiagonalRule: savedDistanceSettings?.gridDiagonalRule ?? (currentGlobalSettings.gridDiagonalRule ?? 'alternating'),
        displayFormat: savedDistanceSettings?.displayFormat ?? (currentGlobalSettings.distanceDisplayFormat ?? 'both')
      });
      
      // Reset background image state
      const bgImage = currentBackgroundImage || {};
      setBackgroundImagePath(bgImage.path ?? null);
      setBackgroundImageDisplayName(
        bgImage.path ? getDisplayNameFromPath(bgImage.path) : ''
      );
      setImageDimensions(null);
      setGridDensity(bgImage.gridDensity ?? 'medium');
      setCustomColumns(bgImage.customColumns ?? 24);
      setBoundsLocked(bgImage.path ? (bgImage.lockBounds ?? true) : false);
      setImageOpacity(bgImage.opacity ?? 1);
      setImageOffsetX(bgImage.offsetX ?? 0);
      setImageOffsetY(bgImage.offsetY ?? 0);
      setImageSearchResults([]);
      
      // Load image dimensions if path exists
      if (bgImage.path) {
        getImageDimensions(bgImage.path).then((dims) => {
          if (dims) {
            setImageDimensions(dims);
            
            // Recalculate bounds if locked (ensures consistency)
            const shouldLock = bgImage.lockBounds ?? true;
            if (shouldLock) {
              const density = bgImage.gridDensity ?? 'medium';
              const customCols = bgImage.customColumns ?? 24;
              const columns = density === 'custom' ? customCols : GRID_DENSITY_PRESETS[density]?.columns ?? 24;
              const calculated = calculateGridFromImage(dims.width, dims.height, columns, orientation);
              setHexBounds({
                maxCol: calculated.columns,
                maxRow: calculated.rows
              });
            }
          }
        });
      }
      
      setActiveColorPicker(null);
      setActiveTab('appearance');
      
      // Reset resize confirmation state
      setShowResizeConfirm(false);
      setPendingBoundsChange(null);
      setOrphanInfo({ cells: 0, objects: 0 });
      setDeleteOrphanedContent(false);
    }
  }, [isOpen, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings, mapType]);
  
  const handleToggleUseGlobal = dc.useCallback(() => {
    setUseGlobalSettings(prev => !prev);
  }, []);
  
  const handleColorChange = dc.useCallback((colorKey, newColor) => {
    setOverrides(prev => ({
      ...prev,
      [colorKey]: newColor
    }));
  }, []);
  
  const handleLineWidthChange = dc.useCallback((value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
      setOverrides(prev => ({
        ...prev,
        gridLineWidth: numValue
      }));
    }
  }, []);
  
  const handlePreferenceToggle = dc.useCallback((prefKey) => {
    setPreferences(prev => ({
      ...prev,
      [prefKey]: !prev[prefKey]
    }));
  }, []);
  
  const handleHexBoundsChange = dc.useCallback((axis, value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 1000) {
      const newBounds = {
        ...hexBounds,
        [axis]: numValue
      };
      
      // Check if this is a reduction that would orphan content
      const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
      
      if (isReduction) {
        const orphans = getOrphanedContentInfo(newBounds);
        
        if (orphans.cells > 0 || orphans.objects > 0) {
          // Show confirmation dialog
          setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
          setOrphanInfo(orphans);
          setShowResizeConfirm(true);
          return; // Don't apply change yet
        }
      }
      
      // No orphaned content or expanding bounds - apply directly
      setHexBounds(newBounds);
    }
  }, [hexBounds, getOrphanedContentInfo]);
  
  // Background image handlers
  const handleImageSearch = dc.useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
      setImageSearchResults([]);
      return;
    }
    
    const allImages = await getImageDisplayNames();
    const filtered = allImages.filter(name => 
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setImageSearchResults(filtered.slice(0, 10)); // Limit to 10 results
  }, []);
  
  const handleImageSelect = dc.useCallback(async (displayName) => {
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (!fullPath) return;
    
    setBackgroundImagePath(fullPath);
    setBackgroundImageDisplayName(displayName);
    setImageSearchResults([]);
    
    // Load dimensions and calculate default grid
    const dims = await getImageDimensions(fullPath);
    if (dims) {
      setImageDimensions(dims);
      
      // Auto-calculate bounds based on current density and enable lock
      const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity].columns;
      const calculated = calculateGridFromImage(dims.width, dims.height, columns, orientation);
      
      // Always set bounds when selecting new image, and enable lock
      setHexBounds({
        maxCol: calculated.columns,
        maxRow: calculated.rows
      });
      setBoundsLocked(true);
    }
  }, [gridDensity, customColumns, boundsLocked, orientation]);
  
  const handleImageClear = dc.useCallback(() => {
    setBackgroundImagePath(null);
    setBackgroundImageDisplayName('');
    setImageDimensions(null);
    setBoundsLocked(false);
    setImageSearchResults([]);
  }, []);
  
  const handleDensityChange = dc.useCallback((density) => {
    setGridDensity(density);
    
    // Recalculate bounds if we have dimensions and bounds are locked
    if (imageDimensions && boundsLocked) {
      const columns = density === 'custom' ? customColumns : GRID_DENSITY_PRESETS[density].columns;
      const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, columns, orientation);
      const newBounds = {
        maxCol: calculated.columns,
        maxRow: calculated.rows
      };
      
      // Check if this is a reduction that would orphan content
      const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
      
      if (isReduction) {
        const orphans = getOrphanedContentInfo(newBounds);
        
        if (orphans.cells > 0 || orphans.objects > 0) {
          // Show confirmation dialog
          setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
          setOrphanInfo(orphans);
          setShowResizeConfirm(true);
          return; // Don't apply change yet
        }
      }
      
      setHexBounds(newBounds);
    }
  }, [imageDimensions, boundsLocked, customColumns, orientation, hexBounds, getOrphanedContentInfo]);
  
  const handleCustomColumnsChange = dc.useCallback((value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setCustomColumns(numValue);
      
      // Recalculate bounds if we have dimensions and bounds are locked
      if (imageDimensions && boundsLocked && gridDensity === 'custom') {
        const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, numValue, orientation);
        const newBounds = {
          maxCol: calculated.columns,
          maxRow: calculated.rows
        };
        
        // Check if this is a reduction that would orphan content
        const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
        
        if (isReduction) {
          const orphans = getOrphanedContentInfo(newBounds);
          
          if (orphans.cells > 0 || orphans.objects > 0) {
            // Show confirmation dialog
            setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
            setOrphanInfo(orphans);
            setShowResizeConfirm(true);
            return; // Don't apply change yet
          }
        }
        
        setHexBounds(newBounds);
      }
    }
  }, [imageDimensions, boundsLocked, gridDensity, orientation, hexBounds, getOrphanedContentInfo]);
  
  const handleBoundsLockToggle = dc.useCallback(() => {
    setBoundsLocked(prev => !prev);
  }, []);
  
  // Resize confirmation dialog handlers
  const handleResizeConfirmDelete = dc.useCallback(() => {
    if (pendingBoundsChange) {
      setHexBounds(pendingBoundsChange.newBounds);
      setDeleteOrphanedContent(true);
    }
    setShowResizeConfirm(false);
    setPendingBoundsChange(null);
  }, [pendingBoundsChange]);
  
  const handleResizeConfirmCancel = dc.useCallback(() => {
    // Revert to previous bounds - don't apply the change
    setShowResizeConfirm(false);
    setPendingBoundsChange(null);
  }, []);
  
  const handleSave = dc.useCallback(() => {
    setIsLoading(true);
    
    const settingsData = {
      useGlobalSettings,
      overrides: useGlobalSettings ? {} : overrides,  // Only save overrides if not using global
      // Always save coordinate display settings for hex maps (independent of color overrides)
      coordinateDisplayMode,
      // Distance measurement settings (per-map overrides)
      distanceSettings: distanceSettings.useGlobalDistance ? null : {
        distancePerCell: distanceSettings.distancePerCell,
        distanceUnit: distanceSettings.distanceUnit,
        gridDiagonalRule: distanceSettings.gridDiagonalRule,
        displayFormat: distanceSettings.displayFormat
      }
    };
    
    // Prepare background image data for hex maps
    const backgroundImageData = mapType === 'hex' ? {
      path: backgroundImagePath,
      lockBounds: boundsLocked,
      gridDensity: gridDensity,
      customColumns: customColumns,
      opacity: imageOpacity,
      offsetX: imageOffsetX,
      offsetY: imageOffsetY
    } : undefined;
    
    // Calculate hexSize if we have an image with locked bounds
    let calculatedHexSize = null;
    if (mapType === 'hex' && backgroundImagePath && boundsLocked && imageDimensions && hexBounds) {
      // Use the actual hexBounds.maxCol value, not the density preset
      // This ensures we use the exact bounds that will be saved
      const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, hexBounds.maxCol, orientation);
      calculatedHexSize = calculated.hexSize;
    }
    
    onSave(settingsData, preferences, mapType === 'hex' ? hexBounds : null, backgroundImageData, calculatedHexSize, deleteOrphanedContent);
    
    // Reset the delete flag after saving
    setDeleteOrphanedContent(false);
    setIsLoading(false);
    onClose();
  }, [useGlobalSettings, overrides, preferences, hexBounds, mapType, coordinateDisplayMode, distanceSettings, onSave, onClose, backgroundImagePath, boundsLocked, imageDimensions, gridDensity, customColumns, imageOpacity, imageOffsetX, imageOffsetY, orientation, deleteOrphanedContent]);
  
  const handleCancel = dc.useCallback(() => {
    onClose();
  }, [onClose]);
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (activeColorPicker) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-color-button');
        const modalContent = e.target.closest('.dmt-settings-modal');
        
        // Only close if clicking outside both picker and button, but still inside modal
        if (!pickerElement && !buttonElement && modalContent) {
          // If there's a pending custom color, apply it before closing
          if (pendingCustomColorRef.current) {
            handleColorChange(activeColorPicker, pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          
          setActiveColorPicker(null);
        }
      };
      
      // Use setTimeout to avoid immediate closure on button click
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [activeColorPicker]);
  
  // Define available tabs based on map type
  const tabs = dc.useMemo(() => {
    const baseTabs = [
      { id: 'appearance', label: 'Appearance' },
    ];
    if (mapType === 'hex') {
      baseTabs.push({ id: 'hexgrid', label: 'Hex Grid' });
    }
    baseTabs.push({ id: 'measurement', label: 'Measurement' });
    baseTabs.push({ id: 'preferences', label: 'Preferences' });
    return baseTabs;
  }, [mapType]);
  
  // Color picker item component for the 2x2 grid
  const ColorPickerItem = ({ colorKey, label, buttonRef, defaultColor }) => (
    <div class="dmt-color-grid-item">
      <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
        <button
          ref={buttonRef}
          class="dmt-color-button"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && setActiveColorPicker(colorKey)}
          style={{ 
            backgroundColor: overrides[colorKey],
            cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
            minWidth: '80px'
          }}
        >
          <span class="dmt-color-button-label">{overrides[colorKey]}</span>
        </button>
        
        <button
          class="dmt-color-reset-btn"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && handleColorChange(colorKey, defaultColor)}
          title="Reset to default"
          style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
        >
          <dc.Icon icon="lucide-rotate-ccw" />
        </button>
        
        <ColorPicker
          isOpen={activeColorPicker === colorKey && !useGlobalSettings}
          selectedColor={overrides[colorKey]}
          onColorSelect={(color) => handleColorChange(colorKey, color)}
          onClose={() => setActiveColorPicker(null)}
          onReset={() => handleColorChange(colorKey, globalSettings[colorKey])}
          customColors={[]}
          pendingCustomColorRef={pendingCustomColorRef}
          title={label}
          position="below"
        />
      </div>
    </div>
  );
  
  if (!isOpen) return null;
  
  return (
    <ModalPortal>
      <div 
        class="dmt-modal-overlay" 
        onMouseDown={(e) => mouseDownTargetRef.current = e.target}
        onClick={(e) => {
          if (mouseDownTargetRef.current === e.target) {
            handleCancel();
          }
          mouseDownTargetRef.current = null;
        }}
      >
        <div 
          class="dmt-modal-content dmt-settings-modal" 
          onClick={(e) => e.stopPropagation()}
          style={{ width: '480px', maxWidth: '90vw' }}
        >
          <div class="dmt-modal-header">
            <h3>Map Settings</h3>
          </div>
          
          {/* Tab Bar */}
          <div class="dmt-settings-tab-bar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          <div class="dmt-modal-body" style={{ paddingTop: '16px' }}>
            {/* Tab: Appearance */}
            {activeTab === 'appearance' && (
              <div class="dmt-settings-tab-content">
                <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!useGlobalSettings}
                      onChange={handleToggleUseGlobal}
                      class="dmt-checkbox"
                    />
                    <span>Use custom colors for this map</span>
                  </label>
                </div>
                
                {/* 2x2 Color picker grid */}
                <div 
                  class="dmt-color-grid" 
                  style={{ 
                    opacity: useGlobalSettings ? 0.5 : 1,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px'
                  }}
                >
                  <ColorPickerItem
                    colorKey="gridLineColor"
                    label="Grid Lines"
                    buttonRef={gridLineColorBtnRef}
                    defaultColor={THEME.grid.lines}
                  />
                  <ColorPickerItem
                    colorKey="backgroundColor"
                    label="Background"
                    buttonRef={backgroundColorBtnRef}
                    defaultColor={THEME.grid.background}
                  />
                  <ColorPickerItem
                    colorKey="borderColor"
                    label="Cell Border"
                    buttonRef={borderColorBtnRef}
                    defaultColor={THEME.cells.border}
                  />
                  <ColorPickerItem
                    colorKey="coordinateKeyColor"
                    label="Coord Key"
                    buttonRef={coordinateKeyColorBtnRef}
                    defaultColor={THEME.coordinateKey.color}
                  />
                </div>
                
                {/* Grid Line Width slider (grid maps only) */}
                {mapType === 'grid' && (
                  <div 
                    class="dmt-form-group" 
                    style={{ 
                      marginTop: '20px',
                      opacity: useGlobalSettings ? 0.5 : 1
                    }}
                  >
                    <label class="dmt-form-label" style={{ marginBottom: '8px' }}>
                      Grid Line Width: {overrides.gridLineWidth ?? 1}px
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={overrides.gridLineWidth ?? 1}
                        onInput={(e) => handleLineWidthChange(e.target.value)}
                        disabled={useGlobalSettings}
                        style={{
                          flex: 1,
                          cursor: useGlobalSettings ? 'not-allowed' : 'pointer'
                        }}
                      />
                      <button
                        class="dmt-color-reset-btn"
                        disabled={useGlobalSettings}
                        onClick={() => !useGlobalSettings && handleLineWidthChange(1)}
                        title="Reset to default (1px)"
                        style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
                      >
                        <dc.Icon icon="lucide-rotate-ccw" />
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Thickness of the grid lines (1-5 pixels)
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Tab: Hex Grid (hex maps only) */}
            {activeTab === 'hexgrid' && mapType === 'hex' && (
              <div class="dmt-settings-tab-content">
                {/* Background Image Section */}
                <div class="dmt-form-group" style={{ 
                  borderBottom: '1px solid var(--background-modifier-border)', 
                  paddingBottom: '16px',
                  marginBottom: '20px'
                }}>
                  <label class="dmt-form-label">Background Image</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Add an image to automatically size the hex grid
                  </p>
                  
                  {/* Image picker */}
                  <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Search for image..."
                      value={backgroundImageDisplayName}
                      onChange={(e) => {
                        setBackgroundImageDisplayName(e.target.value);
                        handleImageSearch(e.target.value);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 32px 8px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--background-modifier-border)',
                        background: 'var(--background-primary)',
                        color: 'var(--text-normal)',
                        fontSize: '14px'
                      }}
                    />
                    
                    {backgroundImagePath && (
                      <button
                        onClick={handleImageClear}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          fontSize: '16px',
                          lineHeight: '1'
                        }}
                        title="Clear image"
                      >
                        Ã—
                      </button>
                    )}
                    
                    {/* Autocomplete dropdown */}
                    {imageSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: 'var(--background-primary)',
                        border: '1px solid var(--background-modifier-border)',
                        borderRadius: '4px',
                        marginTop: '2px',
                        zIndex: 1000,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }}>
                        {imageSearchResults.map((name, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleImageSelect(name)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              borderBottom: idx < imageSearchResults.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--background-modifier-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Show dimensions when image is selected */}
                  {imageDimensions && (
                    <div style={{ marginBottom: '16px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Detected: {imageDimensions.width} Ã— {imageDimensions.height} px
                      </p>
                    </div>
                  )}
                  
                  {/* Grid density options - only show when image is selected */}
                  {backgroundImagePath && imageDimensions && (
                    <div style={{ marginBottom: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Grid Density</label>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="sparse"
                            checked={gridDensity === 'sparse'}
                            onChange={() => handleDensityChange('sparse')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.sparse.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.sparse.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="medium"
                            checked={gridDensity === 'medium'}
                            onChange={() => handleDensityChange('medium')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.medium.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.medium.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="dense"
                            checked={gridDensity === 'dense'}
                            onChange={() => handleDensityChange('dense')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.dense.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.dense.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="custom"
                            checked={gridDensity === 'custom'}
                            onChange={() => handleDensityChange('custom')}
                          />
                          <span style={{ fontWeight: 500 }}>Custom</span>
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={customColumns}
                            onChange={(e) => handleCustomColumnsChange(e.target.value)}
                            disabled={gridDensity !== 'custom'}
                            style={{
                              width: '60px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--background-modifier-border)',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)',
                              fontSize: '13px',
                              opacity: gridDensity !== 'custom' ? 0.5 : 1
                            }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>columns</span>
                        </label>
                      </div>
                      
                      {/* Show calculated result */}
                      <div style={{ marginTop: '12px', padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Result: {hexBounds.maxCol} columns Ã— {hexBounds.maxRow} rows
                          {imageDimensions && (() => {
                            const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity]?.columns || 24;
                            const calc = calculateGridFromImage(imageDimensions.width, imageDimensions.height, columns, orientation);
                            return ` (~${calc.hexWidth}px hex width)`;
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Lock bounds checkbox - only show when image is selected */}
                  {backgroundImagePath && (
                    <label class="dmt-checkbox-label" style={{ marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        checked={boundsLocked}
                        onChange={handleBoundsLockToggle}
                        class="dmt-checkbox"
                      />
                      <span>Lock bounds to image dimensions</span>
                    </label>
                  )}
                  
                  {/* Opacity slider - only show when image is selected */}
                  {backgroundImagePath && (
                    <div style={{ marginTop: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        Image Opacity: {Math.round(imageOpacity * 100)}%
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(imageOpacity * 100)}
                          onChange={(e) => setImageOpacity(parseInt(e.target.value, 10) / 100)}
                          style={{
                            flex: 1,
                            height: '6px',
                            cursor: 'pointer',
                            accentColor: 'var(--interactive-accent)'
                          }}
                        />
                        <span style={{ 
                          fontSize: '12px', 
                          color: 'var(--text-muted)',
                          minWidth: '35px',
                          textAlign: 'right'
                        }}>
                          {Math.round(imageOpacity * 100)}%
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Lower opacity makes the grid more visible over the image
                      </p>
                    </div>
                  )}
                  
                  {/* Image offset controls - only show when image is selected */}
                  {backgroundImagePath && (
                    <div style={{ marginTop: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        Image Offset (pixels)
                      </label>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>X:</span>
                          <input
                            type="number"
                            value={imageOffsetX}
                            onChange={(e) => setImageOffsetX(parseInt(e.target.value, 10) || 0)}
                            class="dmt-number-input"
                            style={{
                              width: '80px',
                              padding: '6px 8px',
                              border: '1px solid var(--background-modifier-border)',
                              borderRadius: '4px',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Y:</span>
                          <input
                            type="number"
                            value={imageOffsetY}
                            onChange={(e) => setImageOffsetY(parseInt(e.target.value, 10) || 0)}
                            class="dmt-number-input"
                            style={{
                              width: '80px',
                              padding: '6px 8px',
                              border: '1px solid var(--background-modifier-border)',
                              borderRadius: '4px',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)'
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setImageOffsetX(0); setImageOffsetY(0); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Fine-tune image alignment with the hex grid
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Bounds - Columns and Rows on same row */}
                <div class="dmt-form-group">
                  <label class="dmt-form-label">
                    Map Bounds
                    {boundsLocked && backgroundImagePath && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>
                        (controlled by background image)
                      </span>
                    )}
                  </label>
                  <div style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    opacity: boundsLocked && backgroundImagePath ? 0.6 : 1
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Columns:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={hexBounds.maxCol}
                        onChange={(e) => handleHexBoundsChange('maxCol', e.target.value)}
                        disabled={boundsLocked && backgroundImagePath}
                        class="dmt-number-input"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--background-modifier-border)',
                          background: boundsLocked && backgroundImagePath ? 'var(--background-secondary)' : 'var(--background-primary)',
                          color: boundsLocked && backgroundImagePath ? 'var(--text-muted)' : 'var(--text-normal)',
                          fontSize: '14px',
                          width: '70px'
                        }}
                      />
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>Ã—</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Rows:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={hexBounds.maxRow}
                        onChange={(e) => handleHexBoundsChange('maxRow', e.target.value)}
                        disabled={boundsLocked && backgroundImagePath}
                        class="dmt-number-input"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--background-modifier-border)',
                          background: boundsLocked && backgroundImagePath ? 'var(--background-secondary)' : 'var(--background-primary)',
                          color: boundsLocked && backgroundImagePath ? 'var(--text-muted)' : 'var(--text-normal)',
                          fontSize: '14px',
                          width: '70px'
                        }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Playable area: A1 to {String.fromCharCode(65 + Math.min(hexBounds.maxCol - 1, 25))}{hexBounds.maxCol > 26 ? '+' : ''}{hexBounds.maxRow}
                  </p>
                </div>
                
                {/* Coordinate Display Mode */}
                <div class="dmt-form-group" style={{ marginTop: '20px' }}>
                  <label class="dmt-form-label">Coordinate Display Mode</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    How coordinates appear when pressing C
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="coordMode"
                        value="rectangular"
                        checked={coordinateDisplayMode === 'rectangular'}
                        onChange={() => setCoordinateDisplayMode('rectangular')}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>Rectangular (A1, B2, ...)</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Column-row labels for standard grid layouts
                        </p>
                      </div>
                    </label>
                    
                    <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="coordMode"
                        value="radial"
                        checked={coordinateDisplayMode === 'radial'}
                        onChange={() => setCoordinateDisplayMode('radial')}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>Radial (⬡, 1-1, 2-5, ...)</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Ring-position labels centered in grid
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
                
                {/* Coordinate Text Colors */}
                <div class="dmt-form-group" style={{ marginTop: '20px' }}>
                  <label class="dmt-form-label">Coordinate Text Colors</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    {useGlobalSettings ? 'Using global settings (enable custom colors in Appearance tab to override)' : 'Custom colors for coordinate overlay text'}
                  </p>
                  
                  <div 
                    style={{ 
                      opacity: useGlobalSettings ? 0.5 : 1,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '16px'
                    }}
                  >
                    <ColorPickerItem
                      colorKey="coordinateTextColor"
                      label="Text Color"
                      buttonRef={coordinateTextColorBtnRef}
                      defaultColor={THEME.coordinateText.color}
                    />
                    <ColorPickerItem
                      colorKey="coordinateTextShadow"
                      label="Text Shadow"
                      buttonRef={coordinateTextShadowBtnRef}
                      defaultColor={THEME.coordinateText.shadow}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Tab: Measurement */}
            {activeTab === 'measurement' && (
              <div class="dmt-settings-tab-content">
                <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!distanceSettings.useGlobalDistance}
                      onChange={() => setDistanceSettings(prev => ({
                        ...prev,
                        useGlobalDistance: !prev.useGlobalDistance
                      }))}
                      class="dmt-checkbox"
                    />
                    <span>Use custom measurement settings for this map</span>
                  </label>
                </div>
                
                <div style={{ opacity: distanceSettings.useGlobalDistance ? 0.5 : 1 }}>
                  <div class="dmt-form-group">
                    <label class="dmt-form-label">Distance per {isHexMap ? 'Hex' : 'Cell'}</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={distanceSettings.distancePerCell}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setDistanceSettings(prev => ({ ...prev, distancePerCell: val }));
                          }
                        }}
                        class="dmt-form-input"
                        style={{ width: '80px' }}
                      />
                      <select
                        value={distanceSettings.distanceUnit}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => setDistanceSettings(prev => ({ ...prev, distanceUnit: e.target.value }))}
                        class="dmt-form-select"
                        style={{ width: '120px' }}
                      >
                        <option value="ft">feet</option>
                        <option value="m">meters</option>
                        <option value="mi">miles</option>
                        <option value="km">kilometers</option>
                        <option value="yd">yards</option>
                      </select>
                    </div>
                  </div>
                  
                  {!isHexMap && (
                    <div class="dmt-form-group">
                      <label class="dmt-form-label">Diagonal Movement</label>
                      <select
                        value={distanceSettings.gridDiagonalRule}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => setDistanceSettings(prev => ({ ...prev, gridDiagonalRule: e.target.value }))}
                        class="dmt-form-select"
                      >
                        <option value="alternating">Alternating (5-10-5-10, D&D 5e)</option>
                        <option value="equal">Equal (Chebyshev, all moves = 1)</option>
                        <option value="euclidean">True Distance (Euclidean)</option>
                      </select>
                    </div>
                  )}
                  
                  <div class="dmt-form-group">
                    <label class="dmt-form-label">Display Format</label>
                    <select
                      value={distanceSettings.displayFormat}
                      disabled={distanceSettings.useGlobalDistance}
                      onChange={(e) => setDistanceSettings(prev => ({ ...prev, displayFormat: e.target.value }))}
                      class="dmt-form-select"
                    >
                      <option value="both">Cells and Units (e.g., "3 cells (15 ft)")</option>
                      <option value="cells">Cells Only (e.g., "3 cells")</option>
                      <option value="units">Units Only (e.g., "15 ft")</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {/* Tab: Preferences */}
            {activeTab === 'preferences' && (
              <div class="dmt-settings-tab-content">
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Control what state is remembered for this map
                </p>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberPanZoom}
                      onChange={() => handlePreferenceToggle('rememberPanZoom')}
                      class="dmt-checkbox"
                    />
                    <span>Remember pan and zoom position</span>
                  </label>
                </div>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberSidebarState}
                      onChange={() => handlePreferenceToggle('rememberSidebarState')}
                      class="dmt-checkbox"
                    />
                    <span>Remember sidebar collapsed state</span>
                  </label>
                </div>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberExpandedState}
                      onChange={() => handlePreferenceToggle('rememberExpandedState')}
                      class="dmt-checkbox"
                    />
                    <span>Remember expanded state</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          
          <div class="dmt-modal-footer">
            <button 
              class="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            
            <button 
              class="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Resize Confirmation Dialog - in separate portal to render above settings */}
      {showResizeConfirm && (
        <ModalPortal>
          <div 
            class="dmt-modal-backdrop" 
            style={{ 
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              class="dmt-confirm-dialog"
              style={{
                background: 'var(--background-primary)',
                borderRadius: '8px',
                padding: '20px',
                maxWidth: '400px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--background-modifier-border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--text-warning)', display: 'flex' }}>
                  <dc.Icon icon="lucide-alert-triangle" />
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-normal)' }}>
                  Content Outside New Grid
                </h3>
              </div>
              
              <p style={{ fontSize: '14px', color: 'var(--text-normal)', marginBottom: '12px', lineHeight: '1.5' }}>
                Resizing the grid will remove content outside the new boundaries:
              </p>
              
              <ul style={{ 
                fontSize: '13px', 
                color: 'var(--text-muted)', 
                marginBottom: '16px', 
                paddingLeft: '20px',
                lineHeight: '1.6'
              }}>
                {orphanInfo.cells > 0 && (
                  <li>{orphanInfo.cells} painted cell{orphanInfo.cells !== 1 ? 's' : ''}</li>
                )}
                {orphanInfo.objects > 0 && (
                  <li>{orphanInfo.objects} object{orphanInfo.objects !== 1 ? 's' : ''}/pin{orphanInfo.objects !== 1 ? 's' : ''}</li>
                )}
              </ul>
              
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.5' }}>
                This content will be permanently deleted when you save. To recover it, cancel and expand the grid bounds instead.
              </p>
              
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  class="dmt-modal-btn"
                  onClick={handleResizeConfirmCancel}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--background-modifier-border)',
                    background: 'var(--background-secondary)',
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  class="dmt-modal-btn"
                  onClick={handleResizeConfirmDelete}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'var(--text-error)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                >
                  Delete & Resize
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModalPortal>
  );
}

return { MapSettingsModal };
```

# rpgAwesomeLoader

```js
// rpgAwesomeLoader.js - Font loading utility for RPGAwesome icon font
// Handles loading the font for both canvas rendering and CSS display

/**
 * Font loading state
 */
let fontLoaded = false;
let fontLoadPromise = null;

/**
 * CSS for the @font-face declaration
 * This will be injected into the document when needed
 */
const RPGAWESOME_FONT_CSS = `
@font-face {
  font-family: 'rpgawesome';
  src: url('{{FONT_PATH}}') format('woff');
  font-weight: normal;
  font-style: normal;
}

/* Base class for RPGAwesome icons */
.ra {
  font-family: 'rpgawesome' !important;
  font-style: normal;
  font-variant: normal;
  font-weight: normal;
  line-height: 1;
  speak: never;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
`;

/**
 * Load the RPGAwesome font
 * @param {string} fontPath - Path to the woff font file
 * @returns {Promise<boolean>} True if font loaded successfully
 */
async function loadRPGAwesomeFont(fontPath) {
  // Return cached promise if already loading/loaded
  if (fontLoadPromise) {
    return fontLoadPromise;
  }
  
  fontLoadPromise = new Promise(async (resolve) => {
    try {
      // Check if font is already available
      if (document.fonts.check('1em rpgawesome')) {
        fontLoaded = true;
        resolve(true);
        return;
      }
      
      // Use FontFace API if available (modern browsers)
      if (typeof FontFace !== 'undefined') {
        try {
          const font = new FontFace('rpgawesome', `url(${fontPath})`);
          await font.load();
          document.fonts.add(font);
          fontLoaded = true;
          resolve(true);
          return;
        } catch (fontFaceError) {
          console.warn('[RPGAwesome] FontFace API failed, falling back to CSS injection:', fontFaceError);
        }
      }
      
      // Fallback: inject CSS @font-face
      const styleId = 'rpgawesome-font-style';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = RPGAWESOME_FONT_CSS.replace('{{FONT_PATH}}', fontPath);
        document.head.appendChild(style);
      }
      
      // Wait for font to load via document.fonts
      await document.fonts.load('1em rpgawesome');
      
      // Verify it loaded
      if (document.fonts.check('1em rpgawesome')) {
        fontLoaded = true;
        resolve(true);
      } else {
        console.warn('[RPGAwesome] Font may not have loaded correctly');
        resolve(false);
      }
    } catch (error) {
      console.error('[RPGAwesome] Failed to load font:', error);
      fontLoaded = false;
      resolve(false);
    }
  });
  
  return fontLoadPromise;
}

/**
 * Check if font is currently loaded
 * @returns {boolean}
 */
function isRPGAwesomeFontLoaded() {
  return fontLoaded || document.fonts.check('1em rpgawesome');
}

/**
 * Reset font loading state (for testing/debugging)
 */
function resetFontLoadState() {
  fontLoaded = false;
  fontLoadPromise = null;
}

/**
 * Inject RPGAwesome CSS classes into document
 * This is separate from font loading - used for the icon class definitions
 * @param {Object} iconMap - The RA_ICONS map from rpgAwesomeIcons.js
 */
function injectIconCSS(iconMap) {
  const styleId = 'rpgawesome-icon-classes';
  if (document.getElementById(styleId)) {
    return; // Already injected
  }
  
  // Build CSS for each icon class
  let css = '';
  for (const [iconClass, data] of Object.entries(iconMap)) {
    // Convert unicode character to CSS content format
    // data.char is the actual unicode character, get its code point
    const codePoint = data.char.charCodeAt(0).toString(16);
    css += '.ra.' + iconClass + ':before { content: "\\' + codePoint + '"; }\n';
  }
  
  const style = document.createElement('style');
  style.id = styleId;
  style.textContent = css;
  document.head.appendChild(style);
}

return {
  loadRPGAwesomeFont,
  isRPGAwesomeFontLoaded,
  resetFontLoadState,
  injectIconCSS,
  RPGAWESOME_FONT_CSS
};
```

# DungeonMapTracker

```jsx
// DungeonMapTracker.jsx - Main component with undo/redo, objects, text labels, and color support

// ============================================================================
// IMPORTS
// ============================================================================

const css = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "DungeonMapTrackerCSS"))

const combinedCss = [
  css,
].join('\n');


const { useMapData } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useMapData"));
const { useHistory } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "useHistory"));
const { MapHeader } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapHeader"));
const { MapCanvas } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapCanvas"));
const { MapControls } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapControls"));
const { ToolPalette } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ToolPalette"));
const { ObjectSidebar } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "ObjectSidebar"));
const { VisibilityToolbar } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "VisibilityToolbar"));
const { SettingsPluginInstaller, shouldOfferUpgrade } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "SettingsPluginInstaller"));
const { MapSettingsModal } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "MapSettingsModal"));
const { getSetting, getTheme, getEffectiveSettings } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "settingsAccessor"));
const { DEFAULTS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "dmtConstants"));
const { DEFAULT_COLOR, getColorByHex, isDefaultColor } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "colorOperations"));
const { axialToOffset, isWithinOffsetBounds } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "offsetCoordinates"));

// RPGAwesome icon font support
const { RA_ICONS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "rpgAwesomeIcons"));
const { injectIconCSS } = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "rpgAwesomeLoader"));

// Inject RPGAwesome icon CSS classes on module load
injectIconCSS(RA_ICONS);


// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Corner Bracket SVG Component
const CornerBracket = ({ position }) => {
  return (
    <svg
      className={`dmt-corner-bracket dmt-corner-bracket-${position}`}
      viewBox="0 0 50 50"
    >
      <defs>
        <filter id={`bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Main L-bracket with ornamental details */}
      <path
        d="M 0 18 L 0 0 L 18 0"
        stroke="#c4a57b"
        strokeWidth="3"
        fill="none"
        filter={`url(#bracket-glow-${position})`}
      />
      {/* Inner detail line */}
      <path
        d="M 3 15 L 3 3 L 15 3"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* Small notches for detail */}
      <line
        x1="0" y1="9" x2="5" y2="9"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      <line
        x1="9" y1="0" x2="9" y2="5"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      {/* Corner ornament */}
      <circle
        cx="18" cy="18" r="3"
        fill="none"
        stroke="#c4a57b"
        strokeWidth="1.5"
        filter={`url(#bracket-glow-${position})`}
      />
    </svg>
  );
};

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid' }) => {
  const { mapData, isLoading, saveStatus, updateMapData, forceSave } = useMapData(mapId, mapName, mapType);
  const [currentTool, setCurrentTool] = dc.useState('draw');
  const [selectedObjectType, setSelectedObjectType] = dc.useState(null);
  const [selectedColor, setSelectedColor] = dc.useState(DEFAULT_COLOR);
  const [selectedOpacity, setSelectedOpacity] = dc.useState(1);  // Opacity for painting (0-1)
  const [isColorPickerOpen, setIsColorPickerOpen] = dc.useState(false);
  const [showFooter, setShowFooter] = dc.useState(false);
  const [isFocused, setIsFocused] = dc.useState(false);
  const [isExpanded, setIsExpanded] = dc.useState(false);
  const [isAnimating, setIsAnimating] = dc.useState(false);
  const [pluginInstalled, setPluginInstalled] = dc.useState(null); // null = checking, true/false = result
  const [showPluginInstaller, setShowPluginInstaller] = dc.useState(false);
  const [settingsVersion, setSettingsVersion] = dc.useState(0); // Incremented to force re-render on settings change
  const [showSettingsModal, setShowSettingsModal] = dc.useState(false);
  const [showVisibilityToolbar, setShowVisibilityToolbar] = dc.useState(false);
  
  // Layer visibility state (session-only, resets on reload)
  const [layerVisibility, setLayerVisibility] = dc.useState({
    objects: true,
    textLabels: true,
    hexCoordinates: false
  });
  
  // Toggle a specific layer's visibility
  const handleToggleLayerVisibility = dc.useCallback((layerId) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  }, []);
  
  // Get current theme with effective settings (global + map overrides)
  // This will be called on every render, fetching fresh settings each time
  const effectiveSettings = mapData ? getEffectiveSettings(mapData.settings) : null;
  const theme = effectiveSettings ? {
    grid: {
      lines: effectiveSettings.gridLineColor,
      lineWidth: effectiveSettings.gridLineWidth,
      background: effectiveSettings.backgroundColor
    },
    cells: {
      fill: getTheme().cells.fill,
      border: effectiveSettings.borderColor,
      borderWidth: getTheme().cells.borderWidth
    },
    compass: getTheme().compass,
    decorativeBorder: getTheme().decorativeBorder,
    coordinateKey: effectiveSettings.coordinateKeyColor
  } : getTheme();

  // Check if settings plugin is installed
  dc.useEffect(() => {
    async function checkPlugin() {
      try {
        const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
        const exists = await dc.app.vault.adapter.exists(pluginDir);
        setPluginInstalled(exists);
      } catch (error) {
        console.error('[DungeonMapTracker] Error checking plugin:', error);
        setPluginInstalled(false);
      }
    }
    checkPlugin();
  }, []);

  // Determine if we should show the plugin installer (install or upgrade mode)
  dc.useEffect(() => {
    if (pluginInstalled === null || !mapData) return; // Still checking or data not loaded
    
    // Check if we should show installer for new install
    if (!pluginInstalled && !mapData.settingsPluginDeclined) {
      setShowPluginInstaller(true);
      return;
    }
    
    // Check if we should show installer for upgrade
    if (pluginInstalled && shouldOfferUpgrade()) {
      setShowPluginInstaller(true);
      return;
    }
    
    // Otherwise, hide installer
    setShowPluginInstaller(false);
  }, [pluginInstalled, mapData]);

  // Initialize expanded state from settings or saved state (only if not showing installer)
  dc.useEffect(() => {
    if (showPluginInstaller || !mapData) return; // Don't apply if showing installer or no data
    
    // Small delay to ensure plugins are loaded
    const timer = setTimeout(() => {
      try {
        // Check if we should remember expanded state for this map
        if (mapData.uiPreferences?.rememberExpandedState && mapData.expandedState !== undefined) {
          // Use saved expanded state
          if (mapData.expandedState && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        } else {
          // Fall back to global expandedByDefault setting
          const expandedByDefault = getSetting('expandedByDefault');
          if (expandedByDefault && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        }
      } catch (error) {
        console.warn('[DungeonMapTracker] Error reading expanded state:', error);
        // Continue with default (not expanded)
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [showPluginInstaller, mapData]); // Run when installer status or map data changes

  // Listen for settings changes and force re-render
  dc.useEffect(() => {
    const handleSettingsChange = () => {
      // Increment settingsVersion to force component re-render
      // This causes getTheme() to be called again with fresh settings
      setSettingsVersion(prev => prev + 1);
    };
    
    window.addEventListener('dmt-settings-changed', handleSettingsChange);
    
    return () => {
      window.removeEventListener('dmt-settings-changed', handleSettingsChange);
    };
  }, []);

  // Handle plugin installation
  const handlePluginInstall = () => {
    setPluginInstalled(true);
    setShowPluginInstaller(false);
  };

  // Handle plugin decline
  const handlePluginDecline = () => {
    if (mapData) {
      updateMapData({
        ...mapData,
        settingsPluginDeclined: true
      });
    }
    setShowPluginInstaller(false);
  };

  // Initialize history with empty state (including objects, text labels, and edges)
  const {
    currentState: historyState,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useHistory({ cells: [], name: "", objects: [], textLabels: [], edges: [] });

  const containerRef = dc.useRef(null);

  // Effect to manage parent element classes
  dc.useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    // Walk up to find cm-embed-block
    let cmEmbedBlock = container.parentElement;
    while (cmEmbedBlock && !cmEmbedBlock.classList.contains('cm-embed-block')) {
      cmEmbedBlock = cmEmbedBlock.parentElement;
      if (cmEmbedBlock?.classList.contains('cm-editor')) {
        cmEmbedBlock = null;
        break;
      }
    }
    
    // Manage classes on container
    container.classList.toggle('dmt-expanded', isExpanded);
    container.classList.toggle('dmt-animating', isAnimating);
    
    // Manage classes on parent if found
    if (cmEmbedBlock) {
      cmEmbedBlock.classList.add('dmt-cm-parent');
      cmEmbedBlock.classList.toggle('dmt-cm-expanded', isExpanded);
      cmEmbedBlock.classList.toggle('dmt-cm-animating', isAnimating);
    }
    
    // Cleanup
    return () => {
      container.classList.remove('dmt-expanded', 'dmt-animating');
      cmEmbedBlock?.classList.remove('dmt-cm-parent', 'dmt-cm-expanded', 'dmt-cm-animating');
    };
  }, [isExpanded, isAnimating]);

  // Track if we're applying history (to avoid adding to history during undo/redo)
  const isApplyingHistoryRef = dc.useRef(false);
  const historyInitialized = dc.useRef(false);

  // Initialize history when map data loads (only once)
  dc.useEffect(() => {
    if (mapData && !isLoading && !historyInitialized.current) {
      resetHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: mapData.textLabels || [],
        edges: mapData.edges || []
      });
      historyInitialized.current = true;
    }
  }, [mapData, isLoading]);

  // Handle map name change
  const handleNameChange = (newName) => {
    if (isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, name: newName };
    updateMapData(newMapData);
    addToHistory({
      cells: mapData.cells,
      name: newName,
      objects: mapData.objects || [],
      textLabels: mapData.textLabels || [],
      edges: mapData.edges || []
    });
  };

  // Handle cells change (unified handler for all tools)
  const handleCellsChange = (newCells, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, cells: newCells };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched stroke updates)
    if (!suppressHistory) {
      addToHistory({
        cells: newCells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: mapData.textLabels || [],
        edges: mapData.edges || []
      });
    }
  };

  // Handle objects change
  const handleObjectsChange = (newObjects, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, objects: newObjects };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched operations like resizing)
    if (!suppressHistory) {
      addToHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: newObjects,
        textLabels: mapData.textLabels || [],
        edges: mapData.edges || []
      });
    }
  };

  // Handle text labels change
  const handleTextLabelsChange = (newTextLabels, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, textLabels: newTextLabels };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched operations like dragging)
    if (!suppressHistory) {
      addToHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: newTextLabels,
        edges: mapData.edges || []
      });
    }
  };

  // Handle edges change (for edge painting feature)
  const handleEdgesChange = (newEdges, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, edges: newEdges };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched operations)
    if (!suppressHistory) {
      addToHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: mapData.textLabels || [],
        edges: newEdges
      });
    }
  };

  // Handle color change
  const handleColorChange = (newColor) => {
    setSelectedColor(newColor);
  };

  const handleAddCustomColor = (newColor) => {
    if (!mapData) {
      return;
    }

    // Generate a unique ID and label for the custom color
    const customColorId = `custom-${Date.now()}`;
    const customColorNumber = (mapData.customColors?.length || 0) + 1;
    const customColorLabel = `Custom ${customColorNumber}`;

    const newCustomColor = {
      id: customColorId,
      color: newColor,
      label: customColorLabel
    };

    const newCustomColors = [...(mapData.customColors || []), newCustomColor];
    const newMapData = {
      ...mapData,
      customColors: newCustomColors
    };

    updateMapData(newMapData);
  };

  const handleDeleteCustomColor = (colorId) => {
    if (!mapData) {
      return;
    }

    const newCustomColors = (mapData.customColors || []).filter(c => c.id !== colorId);
    const newMapData = {
      ...mapData,
      customColors: newCustomColors
    };

    updateMapData(newMapData);
  };

  // Handle view state change (zoom/pan) - NOT tracked in history
  const handleViewStateChange = (newViewState) => {
    if (!mapData) return;
    const newMapData = {
      ...mapData,
      viewState: newViewState
    };
    updateMapData(newMapData);
  };

  // Handle undo
  const handleUndo = () => {
    const previousState = undo();
    if (previousState && mapData) {
      isApplyingHistoryRef.current = true;
      const newMapData = {
        ...mapData,
        cells: previousState.cells,
        name: previousState.name,
        objects: previousState.objects || [],
        textLabels: previousState.textLabels || [],
        edges: previousState.edges || []
      };
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  };

  // Handle redo
  const handleRedo = () => {
    const nextState = redo();
    if (nextState && mapData) {
      isApplyingHistoryRef.current = true;
      const newMapData = {
        ...mapData,
        cells: nextState.cells,
        name: nextState.name,
        objects: nextState.objects || [],
        textLabels: nextState.textLabels || [],
        edges: nextState.edges || []
      };
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  };

  // Zoom in (increase zoom by step)
  const handleZoomIn = () => {
    if (!mapData) return;
    const newZoom = Math.min(
      DEFAULTS.maxZoom,
      mapData.viewState.zoom + DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  // Zoom out (decrease zoom by step)
  const handleZoomOut = () => {
    if (!mapData) return;
    const newZoom = Math.max(
      DEFAULTS.minZoom,
      mapData.viewState.zoom - DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  // Compass click - cycle through rotations
  const handleCompassClick = () => {
    if (!mapData) return;

    // Cycle through: 0Â° -> 90Â° -> 180Â° -> 270Â° -> 0Â°
    const rotations = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(mapData.northDirection);
    const nextIndex = (currentIndex + 1) % rotations.length;
    const newRotation = rotations[nextIndex];

    const newMapData = {
      ...mapData,
      northDirection: newRotation
    };
    updateMapData(newMapData);
  };

  const animationTimeoutRef = dc.useRef(null);

  const handleToggleExpand = () => {
    
    // Clear any pending animation timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    
    const newExpandedState = !isExpanded;
    
    if (newExpandedState) {
      setIsExpanded(true);
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      setIsExpanded(false);
      
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        animationTimeoutRef.current = null;
      }, 300);
    }
    
    // Save expanded state if preference is enabled
    if (mapData && mapData.uiPreferences?.rememberExpandedState) {
      const newMapData = {
        ...mapData,
        expandedState: newExpandedState
      };
      updateMapData(newMapData);
    }
  };

  const handleSidebarCollapseChange = (isCollapsed) => {
    if (!mapData) return;
    const newMapData = {
      ...mapData,
      sidebarCollapsed: isCollapsed
    };
    updateMapData(newMapData);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleSettingsSave = (settingsData, preferencesData, hexBounds = null, backgroundImage = undefined, hexSize = null, deleteOrphanedContent = false) => {
    if (!mapData) return;
    
    const newMapData = {
      ...mapData,
      settings: settingsData,
      uiPreferences: preferencesData
    };
    
    // Only update hexBounds for hex maps
    if (hexBounds !== null && mapData.mapType === 'hex') {
      newMapData.hexBounds = hexBounds;
      
      // If requested, delete content that would be outside the new bounds
      if (deleteOrphanedContent) {
        const orientation = mapData.orientation || 'flat';
        
        // Filter cells to keep only those within new bounds
        if (newMapData.cells && newMapData.cells.length > 0) {
          newMapData.cells = newMapData.cells.filter(cell => {
            const { col, row } = axialToOffset(cell.q, cell.r, orientation);
            return isWithinOffsetBounds(col, row, hexBounds);
          });
        }
        
        // Filter objects to keep only those within new bounds
        if (newMapData.objects && newMapData.objects.length > 0) {
          newMapData.objects = newMapData.objects.filter(obj => {
            const { col, row } = axialToOffset(obj.position.x, obj.position.y, orientation);
            return isWithinOffsetBounds(col, row, hexBounds);
          });
        }
      }
    }
    
    // Only update backgroundImage for hex maps
    if (backgroundImage !== undefined && mapData.mapType === 'hex') {
      newMapData.backgroundImage = backgroundImage;
    }
    
    // Update hexSize if calculated from background image
    if (hexSize !== null && mapData.mapType === 'hex') {
      newMapData.hexSize = hexSize;
    }
    
    updateMapData(newMapData);
    
    // Force re-render to apply new settings
    setSettingsVersion(prev => prev + 1);
  };

  const handleSettingsClose = () => {
    setShowSettingsModal(false);
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="dmt-loading">
        Loading map...
      </div>
    );
  }

  // Show plugin installer if needed (before map renders)
  if (showPluginInstaller) {
    return (
      <>
        <style>{combinedCss}</style>
        <div ref={containerRef} className={`dmt-container interactive-child`}>
          <SettingsPluginInstaller 
            onInstall={handlePluginInstall}
            onDecline={handlePluginDecline}
          />
        </div>
      </>
    );
  }

  // Get color display name
  const getColorDisplayName = () => {
    if (isDefaultColor(selectedColor)) return 'Default';
    const colorDef = getColorByHex(selectedColor);
    return colorDef ? colorDef.label : selectedColor;
  };

  // Main render
  return (
    <>
      <style>{combinedCss}</style>
      <div 
        ref={containerRef} 
        className={`dmt-container interactive-child`}
      >
        {/* Decorative corner brackets */}
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />

        <MapHeader
          mapData={mapData}
          onNameChange={handleNameChange}
          saveStatus={saveStatus}
          onToggleFooter={() => setShowFooter(!showFooter)}
        />

        <ToolPalette
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          selectedColor={selectedColor}
          onColorChange={handleColorChange}
          selectedOpacity={selectedOpacity}
          onOpacityChange={setSelectedOpacity}
          isColorPickerOpen={isColorPickerOpen}
          onColorPickerOpenChange={setIsColorPickerOpen}
          customColors={mapData.customColors || []}
          onAddCustomColor={handleAddCustomColor}
          onDeleteCustomColor={handleDeleteCustomColor}
          mapType={mapData.mapType}
          isFocused={isFocused}
        />

        <VisibilityToolbar
          isOpen={showVisibilityToolbar}
          layerVisibility={layerVisibility}
          onToggleLayer={handleToggleLayerVisibility}
          mapType={mapData.mapType}
        />

        <div
          className="dmt-canvas-wrapper"
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          <ObjectSidebar
            selectedObjectType={selectedObjectType}
            onObjectTypeSelect={setSelectedObjectType}
            onToolChange={setCurrentTool}
            isCollapsed={mapData.sidebarCollapsed || false}
            onCollapseChange={handleSidebarCollapseChange}
          />

          <div className="dmt-canvas-and-controls">
            <MapCanvas
              mapData={mapData}
              onCellsChange={handleCellsChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
              onViewStateChange={handleViewStateChange}
              currentTool={currentTool}
              selectedObjectType={selectedObjectType}
              selectedColor={selectedColor}
              isColorPickerOpen={isColorPickerOpen}
              customColors={mapData.customColors || []}
              onAddCustomColor={handleAddCustomColor}
              onDeleteCustomColor={handleDeleteCustomColor}
              isFocused={isFocused}
              isAnimating={isAnimating}
              theme={theme}
              layerVisibility={layerVisibility}
            >
              {/* DrawingLayer - handles all drawing tools */}
              <MapCanvas.DrawingLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
              />
              
              {/* ObjectLayer - handles object placement and interactions */}
              <MapCanvas.ObjectLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
                customColors={mapData.customColors || []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
              />
              
              {/* TextLayer - handles text label interactions */}
              <MapCanvas.TextLayer
                currentTool={currentTool}
                customColors={mapData.customColors || []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
              />
              
              {/* NotePinLayer - handles note pin placement */}
              <MapCanvas.NotePinLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
              />
              
              {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
              <MapCanvas.HexCoordinateLayer />

              {/* MeasurementLayer - distance measurement tool overlay */}
              <MapCanvas.MeasurementLayer
                currentTool={currentTool}
                globalSettings={effectiveSettings}
                mapDistanceOverrides={mapData?.distanceSettings}
              />
            </MapCanvas>
          </div>

          <MapControls
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onCompassClick={handleCompassClick}
            onSettingsClick={handleSettingsClick}
            northDirection={mapData.northDirection}
            currentZoom={mapData.viewState.zoom}
            isExpanded={isExpanded}
            onToggleExpand={handleToggleExpand}
            mapType={mapData.mapType}
            showVisibilityToolbar={showVisibilityToolbar}
            onToggleVisibilityToolbar={() => setShowVisibilityToolbar(!showVisibilityToolbar)}
          />
        </div>

        {showFooter && (
          <div className="dmt-footer">
            Map ID: {mapId} | Color: {getColorDisplayName()} | {
              currentTool === 'select' ? 'Click to select text/objects | Drag to move | Press R to rotate | Press Delete to remove' :
                currentTool === 'draw' ? 'Click/drag to draw' :
                  currentTool === 'erase' ? 'Click/drag to erase (text first, then objects, then cells)' :
                    currentTool === 'rectangle' ? 'Click two corners to fill rectangle' :
                      currentTool === 'circle' ? 'Click edge point, then center to fill circle' :
                        currentTool === 'clearArea' ? 'Click two corners to clear area' :
                          currentTool === 'addObject' ? (selectedObjectType ? 'Click to place object' : 'Select an object from the sidebar') :
                            currentTool === 'addText' ? 'Click to add text label' :
                              'Select a tool'
            } | Undo/redo available | Middle-click or two-finger drag to pan | Scroll to zoom | Click compass to rotate | {mapData.cells.length} cells filled | {(mapData.objects || []).length} objects placed | {(mapData.textLabels || []).length} text labels
          </div>
        )}

        {/* Map Settings Modal */}
        <MapSettingsModal
          isOpen={showSettingsModal}
          onClose={handleSettingsClose}
          onSave={handleSettingsSave}
          mapType={mapData?.mapType || 'grid'}
          orientation={mapData?.orientation || 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentBackgroundImage={mapData.mapType === 'hex' ? mapData.backgroundImage : null}
          currentCells={mapData.mapType === 'hex' ? (mapData.cells || []) : []}
          currentObjects={mapData.mapType === 'hex' ? (mapData.objects || []) : []}
        />
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

return { View: DungeonMapTracker };
```

---

# CSS Styles

> [!TIP] Using CSS Files
> CSS files are bundled as JavaScript modules that return CSS strings:
> ```javascript
> const myStyles = await dc.require(dc.headerLink(dc.resolvePath("compiled-windrose-md"), "styleName"));
> // Use in JSX: <style>{myStyles}</style>
> ```

## DungeonMapTrackerCSS

```js
const css = `
/* ============================================
   WINDROSE MAPDESIGNER STYLES
   ============================================ */

/* CSS Custom Properties */
:root {
  --dmt-bg-primary: #1a1a1a;
  --dmt-bg-secondary: #2a2a2a;
  --dmt-bg-tertiary: #3a3a3a;
  --dmt-border-primary: #c4a57b;
  --dmt-border-secondary: #3a3a3a;
  --dmt-text-primary: #ffffff;
  --dmt-text-secondary: #cccccc;
  --dmt-text-muted: #888;
  --dmt-text-disabled: #666;
  --dmt-accent-blue: #4a9eff;
  --dmt-accent-red: #8b0000;
  --dmt-warning: #ffaa00;
  --dmt-error: #ff4444;
  --dmt-success: var(--dmt-accent-blue);
  --dmt-transition: all 0.15s ease;
}

/* ============================================
   RPGAWESOME ICON FONT BASE STYLES
   ============================================ */

/* Base class for RPGAwesome icons */
.ra {
  font-family: 'rpgawesome' !important;
  font-style: normal;
  font-variant: normal;
  font-weight: normal;
  line-height: 1;
  text-transform: none;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* ============================================
   CONTAINER & LAYOUT
   ============================================ */

.dmt-container {
  font-family: var(--font-interface);
  background-color: var(--dmt-bg-primary);
  padding: 12px;
  border-radius: 6px;
  color: var(--dmt-text-primary);
  position: relative;
  border: 2px solid var(--dmt-border-primary);
  box-shadow:
    inset 0 0 0 4px var(--dmt-bg-primary),
    inset 0 0 0 5px rgba(196, 165, 123, 0.3),
    0 0 20px rgba(196, 165, 123, 0.2);
  width: 100%;
  transition: width 0.3s ease, margin-left 0.3s ease;
}

.callout[data-callout="dungeon-map"],
.callout[data-callout="dungeon-map"] .callout-content {
  overflow: visible !important;
}

.dmt-container.dmt-expanded {
  --dmt-offset: 0px;
  width: calc(100cqi - 2 * var(--dmt-offset));
  margin-inline: calc((100% - 100cqi) / 2 + var(--dmt-offset));
}

.markdown-source-view.is-live-preview {
  & .dmt-container.dmt-expanded,
  & .dmt-container.dmt-animating {
    --dmt-offset: 20px;
  }

  .cm-content > .cm-embed-block[contenteditable=false].dmt-cm-expanded,
  .cm-content > .cm-embed-block[contenteditable=false].dmt-cm-animating {
    contain: none !important;
    overflow: normal; 
    animation: none;
  }

  & .cm-embed-block:hover.dmt-cm-parent.dmt-cm-expanded,
  & .cm-embed-block:hover.dmt-cm-parent.dmt-cm-animating {
    overflow: visible;
    animation: none;
  }
}

.dmt-loading {
  padding: 20px;
  text-align: center;
  color: var(--dmt-text-muted);
}

.dmt-canvas-wrapper {
  display: flex;
  flex-direction: row;
  position: relative;
  background-color: var(--dmt-bg-primary);
  border-radius: 4px;
  overflow: hidden;
  height: 600px;
  width: 100%;
}

.dmt-canvas-and-controls {
  flex: 1;
  position: relative;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  display: flex;
  justify-content: center;
  align-items: center;
}

.dmt-canvas-container {
  position: relative;
  background-color: var(--dmt-bg-primary);
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  overflow: hidden;

  canvas {
    display: block;
  }
}

/* ============================================
   HEADER
   ============================================ */

.dmt-header {
  margin-bottom: 12px;
  padding: 4px;
  background-color: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dmt-map-name {
  background: transparent;
  border: none;
  color: var(--dmt-text-primary);
  font-size: 16px;
  font-weight: bold;
  outline: none;
  flex: 1;
  margin-right: 16px;

  &::placeholder {
    color: var(--dmt-text-disabled);
  }
}

.dmt-header-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* Info Toggle Button */
.dmt-info-toggle {
  background: transparent !important;
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 4px;
  color: var(--dmt-text-disabled);
  cursor: pointer;
  padding: 4px 8px;
  transition: var(--dmt-transition);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 28px;
  width: 28px;
  box-shadow: none !important;
  appearance: none !important;
  outline: none;

  svg {
    width: 16px;
    height: 16px;
    color: currentColor;
  }

  &::before,
  &::after {
    display: none !important;
  }

  &:hover {
    border-color: #4a4a4a;
    color: var(--dmt-border-primary);
  }

  &.dmt-info-toggle-active {
    border-color: var(--dmt-border-primary);
    color: var(--dmt-border-primary);

    &:hover {
      border-color: #8b6842;
      color: #8b6842;
    }
  }
}

/* Save Status */
.dmt-save-status {
  font-size: 18px;
  color: var(--dmt-success);
  padding: 0 8px;
  display: flex;
  align-items: center;
  line-height: 1;

  &.dmt-save-status-unsaved {
    color: var(--dmt-warning);
  }

  &.dmt-save-status-saving {
    animation: rotate 1s linear infinite;
  }

  &.dmt-save-status-error {
    color: var(--dmt-error);
  }
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* Orientation change animation */


/* ============================================
   FOOTER
   ============================================ */

.dmt-footer {
  margin-top: 8px;
  font-size: 11px;
  color: var(--dmt-text-disabled);
  text-align: center;
}

/* ============================================
   DECORATIVE CORNER BRACKETS
   ============================================ */

.dmt-corner-bracket {
  position: absolute;
  width: 50px;
  height: 50px;
  pointer-events: none;
  z-index: 10;

  /* Style all SVG paths and elements to use CSS variable */
  path, line, circle {
    stroke: var(--dmt-border-primary);
  }

  &.dmt-corner-bracket-tl {
    top: -2px;
    left: -2px;
  }

  &.dmt-corner-bracket-tr {
    top: -2px;
    right: -2px;
    transform: scaleX(-1);
  }

  &.dmt-corner-bracket-bl {
    bottom: -2px;
    left: -2px;
    transform: scaleY(-1);
  }

  &.dmt-corner-bracket-br {
    bottom: -2px;
    right: -2px;
    transform: scale(-1);
  }
}

/* Tool Palette Brackets (Outward facing) */
.dmt-tool-palette-bracket {
  position: absolute;
  width: 40px;
  height: 40px;
  pointer-events: none;
  z-index: 10;

  &.dmt-tool-palette-bracket-tl {
    top: -2px;
    left: -2px;
    transform: rotate(0deg);
  }

  &.dmt-tool-palette-bracket-tr {
    top: -2px;
    right: -2px;
    transform: scaleX(-1);
  }

  &.dmt-tool-palette-bracket-bl {
    bottom: -2px;
    left: -2px;
    transform: scaleY(-1);
  }

  &.dmt-tool-palette-bracket-br {
    bottom: -2px;
    right: -2px;
    transform: scale(-1);
  }
}

/* ============================================
   CANVAS CURSOR STATES
   ============================================ */

.dmt-canvas,
.dmt-canvas-drawing,
.dmt-canvas-erasing,
.dmt-canvas-erase,
.dmt-canvas-rectangle,
.dmt-canvas-rectangle-active,
.dmt-canvas-circle,
.dmt-canvas-circle-active,
.dmt-canvas-cleararea,
.dmt-canvas-cleararea-active,
.dmt-canvas-panning,
.dmt-canvas-space-grab,
.dmt-canvas-select,
.dmt-canvas-selecting {
  border: 1px solid var(--dmt-border-secondary);
}

.dmt-canvas,
.dmt-canvas-rectangle,
.dmt-canvas-circle,
.dmt-canvas-cleararea,
.dmt-canvas-add-object,
.dmt-canvas-add-text,
.dmt-canvas-measure {
  cursor: crosshair;
}

.dmt-canvas-drawing,
.dmt-canvas-rectangle-active,
.dmt-canvas-circle-active,
.dmt-canvas-measure-active {
  cursor: cell;
}

.dmt-canvas-erasing,
.dmt-canvas-erase,
.dmt-canvas-cleararea-active {
  cursor: not-allowed;
}

.dmt-canvas-panning {
  cursor: grabbing;
}

.dmt-canvas-space-grab {
  cursor: grab;
}

.dmt-canvas-select {
  cursor: default;
}

.dmt-canvas-selecting {
  cursor: move;
}

/* ============================================
   TOOL PALETTE
   ============================================ */

.dmt-tool-palette {
  display: flex;
  gap: 4px;
  padding: 8px;
  background-color: var(--dmt-bg-primary);
  border: 2px solid var(--dmt-border-primary);
  border-radius: 4px;
  align-items: center;
  margin-bottom: 8px;
  position: relative;
  box-shadow:
    inset 0 0 0 3px var(--dmt-bg-primary),
    inset 0 0 0 4px rgba(196, 165, 123, 0.3),
    0 0 15px rgba(196, 165, 123, 0.15);
}

.dmt-tool-btn {
  position: relative;
  background-color: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 3px;
  color: var(--dmt-text-primary);
  cursor: pointer;
  padding: 6px 8px;
  font-size: 16px;
  transition: var(--dmt-transition);
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover:not(.dmt-tool-btn-active) {
    background-color: var(--dmt-bg-tertiary);
    border-color: #4a4a4a;

    svg {
      color: var(--dmt-text-primary);
    }
  }

  &.dmt-tool-btn-active {
    background-color: var(--dmt-border-primary);
    border-color: #8b6842;
    color: var(--dmt-bg-primary);

    svg {
      color: var(--dmt-accent-red);
      filter:
        drop-shadow(1px 0 0 var(--dmt-border-primary)) drop-shadow(-1px 0 0 var(--dmt-border-primary)) drop-shadow(0 1px 0 var(--dmt-border-primary)) drop-shadow(0 -1px 0 var(--dmt-border-primary));
    }
  }

  svg {
    color: var(--dmt-border-primary);
    width: 20px;
    height: 20px;
  }
}

.dmt-color-tool-btn {
  position: relative;
  /* Bottom border shows current color - defined inline via style attribute */
}

/* Sub-tool indicator triangle */
.dmt-subtool-indicator {
  position: absolute;
  bottom: 1px;
  right: 1px;
  font-size: 7px;
  opacity: 0.6;
  pointer-events: none;
  line-height: 1;
}

.dmt-tool-btn-active .dmt-subtool-indicator {
  opacity: 0.9;
  color: var(--dmt-bg-primary);
}

/* Tool button container for sub-menu positioning */
.dmt-tool-btn-container {
  position: relative;
  display: inline-block;
}

/* Sub-menu flyout */
.dmt-subtool-menu {
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-left: 6px;
  background: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-primary);
  border-radius: 6px;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  z-index: 1001;
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.4),
    inset 0 1px 0 rgba(255, 255, 255, 0.05);
  min-width: 120px;
}

.dmt-subtool-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: var(--dmt-text-primary);
  cursor: pointer;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 13px;
  transition: var(--dmt-transition);

  svg {
    width: 16px;
    height: 16px;
    color: var(--dmt-border-primary);
  }

  &:hover {
    background: var(--dmt-bg-tertiary);
  }

  &.dmt-subtool-option-active {
    background: var(--dmt-border-primary);
    color: var(--dmt-bg-primary);

    svg {
      color: var(--dmt-bg-primary);
    }
  }
}

/* History Controls */
.dmt-history-controls {
  display: flex;
  gap: 4px;
  margin-left: 4px;
  padding-left: 8px;
  border-left: 1px solid var(--dmt-border-secondary);
}

.dmt-history-btn {
  background-color: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 3px;
  color: var(--dmt-text-primary);
  cursor: pointer;
  padding: 6px 8px;
  font-size: 16px;
  transition: var(--dmt-transition);
  min-width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    color: var(--dmt-text-muted);
    width: 18px;
    height: 18px;
  }

  &:hover:not(:disabled) {
    background-color: var(--dmt-bg-tertiary);
    border-color: #4a4a4a;

    svg {
      color: var(--dmt-border-primary);
    }
  }

  &:disabled {
    opacity: 0.3;
    cursor: not-allowed;

    svg {
      color: #444;
    }
  }
}

/* ============================================
   MAP CONTROLS (COMPASS & ZOOM)
   ============================================ */

.dmt-controls {
  position: absolute;
  top: 12px;
  right: 4px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 100;
  min-width: 80px;
  width: 80px;
  align-items: center;
}

.dmt-compass {
  width: 70px;
  height: 70px;
  min-width: 70px;
  min-height: 70px;
  max-width: 70px;
  max-height: 70px;
  background-color: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  user-select: none;
  transition: all 0.2s ease;
  position: relative;
  flex-shrink: 0;

  &:hover {
    transform: scale(1.03);
  }
}

.dmt-compass-disabled {
  filter: grayscale(1);
  opacity: 0.5;
  
  &:hover {
    transform: none;
  }
}

.dmt-compass-svg {
  width: 100%;
  height: 100%;
  overflow: visible;
}

.dmt-zoom-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
  align-items: center;
}

button.dmt-zoom-btn,
.is-tablet button.dmt-zoom-btn,
button.dmt-expand-btn,
.is-tablet button.dmt-expand-btn,
button.dmt-orientation-btn,
.is-tablet button.dmt-orientation-btn {
  width: 35px;
  height: 35px;
  min-width: 35px;
  min-height: 35px;
  max-width: 35px;
  max-height: 35px;
  background-color: rgba(0, 0, 0, 0.7);
  border: 2px solid rgba(196, 165, 123, 0.4);
  color: var(--dmt-text-primary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 18px;
  font-weight: bold;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  flex: 0 0 auto;
  padding: 0;
  box-sizing: border-box;
  overflow: hidden;
  user-select: none;

  &:hover {
    background-color: rgba(0, 0, 0, 0.85);
    border-color: rgba(196, 165, 123, 0.6);
    transform: scale(1.05);
  }
}

.dmt-zoom-level {
  font-size: 10px;
  font-weight: 600;
  color: rgba(196, 165, 123, 0.8);
  text-align: center;
  padding: 3px 6px;
  user-select: none;
  background-color: rgba(0, 0, 0, 0.5);
  border-radius: 6px;
  width: 38px;
  box-sizing: border-box;
}

/* ============================================
   OBJECT SIDEBAR
   ============================================ */

.dmt-object-sidebar {
  width: 110px;
  min-width: 110px;
  height: 100%;
  background-color: var(--dmt-bg-primary);
  border-right: 2px solid var(--dmt-border-primary);
  border-top: 1px solid rgba(196, 165, 123, 0.4);
  border-bottom: 1px solid rgba(196, 165, 123, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
  transition: all 0.3s ease;
  position: relative;
  box-shadow:
    inset -3px 0 0 0 var(--dmt-bg-primary),
    inset -4px 0 0 0 rgba(196, 165, 123, 0.4);

  &.dmt-object-sidebar-collapsed {
    width: 0;
    min-width: 0;
    border-right: none;
    overflow: visible;
  }
}

.dmt-sidebar-header {
  font-size: 10pt;
  font-weight: 600;
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid var(--dmt-border-secondary);
  color: var(--dmt-text-primary);
  background-color: #252525;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.dmt-sidebar-collapse-btn {
  background: transparent;
  border: 1.5px solid rgba(196, 165, 123, 0.4);
  border-radius: 3px;
  color: var(--dmt-border-primary) !important;
  cursor: pointer;
  padding: 4px;
  font-size: 10px;
  line-height: 1;
  transition: var(--dmt-transition);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  box-shadow: 0 0 8px rgba(196, 165, 123, 0.2) !important;

  &:hover {
    color: var(--dmt-text-primary);
    border-color: var(--dmt-border-primary);
    background-color: rgba(196, 165, 123, 0.1);
    box-shadow: 0 0 12px rgba(196, 165, 123, 0.4);
  }

  svg {
    display: block;
    flex-shrink: 0;
  }
}

.dmt-sidebar-toggle {
  position: absolute;
  left: 0;
  top: 8px;
  background-color: rgba(42, 42, 42, 0.95) !important;
  border: 1.5px solid var(--dmt-border-primary);
  border-radius: 0 6px 6px 0;
  color: var(--dmt-border-primary) !important;
  cursor: pointer;
  padding: 4px 6px;
  font-size: 14px;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  z-index: 200;
  box-shadow:
    2px 2px 6px rgba(0, 0, 0, 0.4),
    0 0 12px rgba(196, 165, 123, 0.3) !important;
  overflow: visible;

  svg {
    display: block;
    flex-shrink: 0;
  }

  &:hover {
    background-color: rgba(58, 58, 58, 0.95);
    border-color: var(--dmt-border-primary);
    color: var(--dmt-text-primary);
    box-shadow:
      2px 2px 8px rgba(0, 0, 0, 0.5),
      0 0 16px rgba(196, 165, 123, 0.5);
    transform: translateX(3px);
  }
}

.dmt-sidebar-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--dmt-bg-primary);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--dmt-bg-tertiary);
    border-radius: 3px;

    &:hover {
      background: #4a4a4a;
    }
  }
}

.dmt-sidebar-category {
  margin-bottom: 8px;
}

.dmt-category-label {
  font-size: 8pt;
  font-weight: 500;
  color: var(--dmt-text-muted);
  padding: 4px 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dmt-object-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  margin: 2px 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  cursor: pointer;
  transition: var(--dmt-transition);
  width: 100%;
  min-height: 58px;
  box-sizing: border-box;

  &:hover {
    background-color: var(--dmt-bg-secondary);
    border-color: var(--dmt-border-secondary);
  }

  &.dmt-object-item-selected {
    background-color: var(--dmt-bg-tertiary);
    border-color: var(--dmt-border-primary);

    &:hover {
      background-color: #454545;
    }

    .dmt-object-label {
      color: var(--dmt-text-primary);
      font-weight: 500;
    }
  }
}

/* Force early loading of emoji fonts to prevent flash */
.dmt-font-preloader {
  position: absolute;
  left: -9999px;
  font-family: 'Noto Emoji', 'Noto Sans Symbols 2', monospace;
  visibility: hidden;
}

.dmt-object-symbol {
  font-size: 18px;
  font-family: 'Noto Emoji', 'Noto Sans Symbols 2', monospace;
  line-height: 1.1;
  margin-bottom: 4px;
  color: var(--dmt-text-primary);
  
  /* Optimize rendering and prepare font early */
  will-change: contents;
  text-rendering: optimizeSpeed;
}

.dmt-object-label {
  font-size: 8pt;
  line-height: 1.2;
  color: var(--dmt-text-secondary);
  word-wrap: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
  text-align: center;
}

.dmt-sidebar-footer {
  padding: 6px;
  border-top: 1px solid var(--dmt-border-secondary);
  background-color: #252525;
}

.dmt-deselect-btn {
  width: 100%;
  padding: 6px 4px;
  font-size: 9pt;
  background-color: var(--dmt-bg-tertiary);
  color: var(--dmt-text-primary);
  border: 1px solid #4a4a4a;
  border-radius: 3px;
  cursor: pointer;
  transition: var(--dmt-transition);

  &:hover {
    background-color: #454545;
    border-color: #5a5a5a;
  }

  &:active {
    background-color: var(--dmt-bg-secondary);
  }
}

/* Note Pin Special Button */
.dmt-sidebar-note-section {
  padding: 8px 4px;
  border-bottom: 1px solid var(--background-modifier-border);
  margin-bottom: 4px;
}

.dmt-note-pin-btn {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: var(--background-primary-alt);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  color: var(--text-normal);
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
  box-sizing: border-box;

  svg {
    width: 16px;
    height: 16px;
    min-width: 16px;
    flex-shrink: 0;
  }

  span {
    flex: 1;
    white-space: nowrap;
  }

  &:hover {
    background: var(--background-modifier-hover);
  }
}

.dmt-note-pin-btn-selected {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border-color: var(--interactive-accent);
}

/* ============================================
   OBJECT INTERACTION BUTTONS
   ============================================ */

.dmt-object-tooltip {
  background-color: rgba(42, 42, 42, 0.95);
  color: var(--dmt-text-primary);
  font-size: 11pt;
  padding: 6px 10px;
  border-radius: 4px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  border: 1px solid #4a4a4a;
  font-family: sans-serif;
  pointer-events: none;
  position: fixed;
  z-index: 1000;
}

.dmt-rotate-button,
.dmt-note-button,
.dmt-link-note-button,
.dmt-resize-button {
  width: 32px;
  height: 32px;
  background-color: rgba(74, 158, 255, 0.9);
  border: 2px solid var(--dmt-text-primary);
  border-radius: 50%;
  color: var(--dmt-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--dmt-transition);
  z-index: 150;
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

  &:hover {
    background-color: rgba(74, 158, 255, 1);
    transform: scale(1.1);
  }

  &:active {
    transform: scale(0.95);
  }
}

.dmt-rotate-button {
  font-size: 20px;
}

.dmt-resize-button {
  font-size: 18px;
}

.dmt-note-button svg {
  width: 18px;
  height: 18px;
  color: var(--dmt-text-primary);
}

.dmt-link-note-button svg {
  width: 18px;
  height: 18px;
  color: var(--dmt-text-primary);
}

/* Visible Note Link Display */
.dmt-selected-object-note {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 4px 8px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 150;
  position: relative;
}

.dmt-note-display-link {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-accent);
  text-decoration: none;
  font-size: 13px;
  cursor: pointer;
  position: relative;
  z-index: 2;
  
  &:hover {
    color: var(--text-accent-hover);
    text-decoration: underline;
  }
}

/* Selection Toolbar */
.dmt-selection-toolbar {
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 0;
  z-index: 150;
}

.dmt-toolbar-button {
  width: 44px;
  height: 44px;
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border-hover);
  border-radius: 6px;
  color: var(--text-normal);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--dmt-transition);
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);

  &:hover {
    background: var(--background-modifier-hover);
    border-color: var(--text-accent);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  }

  &:active {
    transform: translateY(0);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
  }

  svg {
    width: 20px;
    height: 20px;
  }
}

.dmt-toolbar-color-button {
  border: 2px solid rgba(255, 255, 255, 0.3);
  
  svg {
    filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
    color: #000;
  }

  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
  }
}

.dmt-toolbar-delete-button {
  &:hover {
    background: var(--background-modifier-error);
    border-color: var(--text-error);
    color: var(--text-on-accent);
  }
}

/* Linked note display when used with toolbar */
.dmt-selection-linked-note {
  background: var(--background-primary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  padding: 4px 8px;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  z-index: 150;
}

/* Invisible hover links over objects */
.dmt-object-hover-link {
  pointer-events: auto;  /* Changed: We handle clicks in JS now */
  overflow: hidden;
  cursor: default;  /* Show default cursor instead of pointer */
  
  /* Hide dc.Link text visually but keep it functional for hover */
  & > * {
    color: transparent !important;
    text-indent: -9999px !important;
  }
}

/* ============================================
   TEXT LABEL/MODAL SYSTEM
   ============================================ */

.dmt-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.15s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

.dmt-modal-content {
  background-color: var(--dmt-bg-secondary);
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  padding: 20px;
  width: 400px;
  max-width: 90vw;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  animation: slideUp 0.2s ease;
}

@keyframes slideUp {
  from {
    transform: translateY(20px);
    opacity: 0;
  }

  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dmt-modal-title {
  margin: 0 0 16px 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--dmt-text-primary);
}

.dmt-modal-input {
  width: 100%;
  padding: 10px 12px;
  font-size: 16px;
  background-color: var(--dmt-bg-primary);
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 4px;
  color: var(--dmt-text-primary);
  outline: none;
  transition: border-color 0.15s ease;
  box-sizing: border-box;

  &:focus {
    border-color: var(--dmt-accent-blue);
  }

  &::placeholder {
    color: var(--dmt-text-disabled);
  }
}

.dmt-modal-buttons {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.dmt-modal-header {
  margin-bottom: 16px;
  
  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--dmt-text-primary);
  }
}

.dmt-modal-body {
  margin-bottom: 16px;
}

/* Settings modal specific - cap height and make scrollable */
.dmt-settings-modal {
  max-height: 500px;
  display: flex;
  flex-direction: column;
  
  .dmt-modal-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    min-height: 0;
  }
}

.dmt-modal-footer {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.dmt-form-group {
  margin-bottom: 12px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.dmt-form-label {
  display: block;
  margin-bottom: 6px;
  font-size: 14px;
  font-weight: 500;
  color: var(--dmt-text-secondary);
}

.dmt-modal-btn {
  flex: 1;
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 500;
  border-radius: 4px;
  border: 1px solid;
  cursor: pointer;
  transition: var(--dmt-transition);

  &.dmt-modal-btn-cancel {
    background-color: var(--dmt-bg-tertiary);
    border-color: #4a4a4a;
    color: var(--dmt-text-primary);

    &:hover {
      background-color: #454545;
      border-color: #5a5a5a;
    }
  }

  &.dmt-modal-btn-submit {
    background-color: var(--dmt-accent-blue);
    border-color: var(--dmt-accent-blue);
    color: var(--dmt-text-primary);

    &:hover:not(:disabled) {
      background-color: #3a8eef;
      border-color: #3a8eef;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }

  &.dmt-modal-btn-danger {
    background-color: var(--dmt-accent-red);
    border-color: var(--dmt-accent-red);
    color: var(--dmt-text-primary);

    &:hover:not(:disabled) {
      background-color: #a00000;
      border-color: #a00000;
    }

    &:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  }
}

.dmt-modal-hint {
  margin-top: 12px;
  font-size: 11px;
  color: var(--dmt-text-muted);
  text-align: center;
}

/* Settings Modal Specific Styles */
.dmt-settings-section {
  margin-bottom: 16px;
}

/* Modal Portal - for rendering modals outside viewport */
.dmt-modal-portal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10000;
  pointer-events: none;
}

.dmt-modal-portal-content {
  pointer-events: auto;
}

.dmt-settings-section-header {
  margin-bottom: 12px;
}

.dmt-settings-section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--dmt-text-primary);
  margin: 0 0 4px 0;
}

.dmt-settings-section-description {
  font-size: 12px;
  color: var(--dmt-text-muted);
  margin: 0;
}

/* Settings Modal Tab Bar */
.dmt-settings-tab-bar {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--background-modifier-border);
  margin: 0 -20px;
  padding: 0 20px;
}

.dmt-settings-tab {
  padding: 10px 16px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s ease, border-color 0.15s ease;
  margin-bottom: -1px;
  
  &:hover {
    color: var(--text-normal);
  }
}

.dmt-settings-tab-active {
  color: var(--text-normal);
  border-bottom-color: var(--interactive-accent);
}

.dmt-settings-tab-content {
  min-height: 325px;
}

/* Color picker 2x2 grid items */
.dmt-color-grid-item {
  display: flex;
  flex-direction: column;
}

/* Upgrade Banner */
.dmt-settings-upgrade-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  margin: -8px -8px 16px -8px;
  background: linear-gradient(135deg, rgba(74, 158, 255, 0.1), rgba(74, 158, 255, 0.05));
  border: 1px solid rgba(74, 158, 255, 0.3);
  border-radius: 6px;
  animation: slideDown 0.3s ease;
}

.dmt-settings-upgrade-info {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: var(--dmt-text-primary);
  
  svg {
    width: 18px;
    height: 18px;
    color: var(--dmt-accent-blue);
    flex-shrink: 0;
  }
}

.dmt-settings-upgrade-btn {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 600;
  background-color: var(--dmt-accent-blue);
  border: 1px solid var(--dmt-accent-blue);
  border-radius: 4px;
  color: var(--dmt-text-primary);
  cursor: pointer;
  transition: var(--dmt-transition);
  white-space: nowrap;
  
  &:hover {
    background-color: #3a8eef;
    border-color: #3a8eef;
  }
}

.dmt-settings-upgrade-container {
  margin: -8px -8px 16px -8px;
  padding: 12px;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
  
  .dmt-plugin-installer-card {
    margin: 0;
  }
}

.dmt-form-group {
  margin-bottom: 12px;
}

.dmt-form-label {
  display: block;
  font-size: 12px;
  font-weight: 500;
  color: var(--dmt-text-secondary);
  margin-bottom: 6px;
}

.dmt-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--dmt-text-primary);
  user-select: none;
  
  &:hover {
    color: var(--dmt-accent-blue);
  }
}

.dmt-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--dmt-accent-blue);
}

.dmt-color-button {
  width: 100%;
  height: 36px;
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: var(--dmt-transition);
  position: relative;
  
  &:hover:not(:disabled) {
    border-color: var(--dmt-accent-blue);
    transform: scale(1.01);
  }
  
  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
}

.dmt-color-button-label {
  font-size: 12px;
  font-weight: 600;
  text-shadow: 
    0 0 4px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.9);
  color: white;
  padding: 2px 8px;
  background-color: rgba(0, 0, 0, 0.4);
  border-radius: 3px;
  font-family: var(--font-monospace);
}

.dmt-color-settings {
  transition: opacity 0.2s ease;
}

/* ============================================
   COLOR PICKER SYSTEM
   ============================================ */

.dmt-color-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: transparent;
  z-index: 2099;
  pointer-events: auto;
}

.dmt-color-picker {
  background-color: var(--dmt-bg-secondary);
  border: 1px solid #4a4a4a;
  border-radius: 8px;
  padding: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
  z-index: 2100;
  min-width: 290px;
  animation: slideDown 0.15s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.dmt-color-picker-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.dmt-color-picker-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--dmt-text-primary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dmt-color-reset-btn {
  background-color: transparent;
  border: 1px solid var(--dmt-text-disabled);
  color: var(--dmt-text-primary);
  width: 24px;
  height: 24px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: var(--dmt-transition);

  &:hover {
    background-color: var(--dmt-bg-tertiary);
    border-color: var(--dmt-text-muted);
  }
}

.dmt-color-grid {
  display: grid;
  grid-template-columns: repeat(6, 40px);
  gap: 6px;
}

.dmt-color-swatch {
  width: 40px;
  height: 40px;
  border: 2px solid #4a4a4a;
  border-radius: 6px;
  cursor: pointer;
  transition: var(--dmt-transition);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;

  &:hover {
    border-color: var(--dmt-text-primary);
    transform: scale(1.1);
  }

  &.dmt-color-swatch-selected {
    border-color: var(--dmt-text-primary);
    border-width: 3px;
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.3);
  }

  &.dmt-color-swatch-reset {
    background-color: var(--dmt-bg-tertiary);
    border: 2px solid var(--dmt-text-disabled);

    &:hover {
      background-color: #4a4a4a;
      border-color: var(--dmt-text-muted);
    }
  }

  &.dmt-color-swatch-preview {
    border: 2px dashed var(--dmt-accent-blue);
    position: relative;
    animation: pulse 1s ease-in-out infinite;
  }

  &.dmt-color-swatch-add {
    background-color: var(--dmt-bg-secondary);
    border: 2px dashed var(--dmt-text-disabled);
    position: relative;
    overflow: hidden;

    &:hover {
      background-color: var(--dmt-bg-tertiary);
      border-color: var(--dmt-text-muted);
      border-style: solid;
    }
  }
}

@keyframes pulse {

  0%,
  100% {
    opacity: 0.7;
  }

  50% {
    opacity: 1;
  }
}

.dmt-color-reset-icon,
.dmt-color-checkmark {
  color: var(--dmt-text-primary);
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
}

.dmt-color-reset-icon {
  font-size: 18px;
}

.dmt-color-checkmark {
  font-size: 20px;
  pointer-events: none;
}

.dmt-color-preview-spinner {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--dmt-text-primary);
  font-size: 18px;
  font-weight: bold;
  text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
  animation: spin 2s linear infinite;
  mix-blend-mode: difference;
}

@keyframes spin {
  from {
    transform: translate(-50%, -50%) rotate(0deg);
  }

  to {
    transform: translate(-50%, -50%) rotate(360deg);
  }
}

.dmt-color-add-icon,
.dmt-color-add-icon-overlay {
  color: var(--dmt-text-primary);
  font-size: 24px;
  font-weight: bold;
}

.dmt-color-add-icon-overlay {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 1;
}

.dmt-color-input-as-button {
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
}

.dmt-color-delete-button {
  position: absolute;
  left: calc(100% + 4px);
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  background-color: rgba(239, 68, 68, 0.9);
  border: 2px solid var(--dmt-text-primary);
  border-radius: 50%;
  color: var(--dmt-text-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: var(--dmt-transition);
  z-index: 150;
  user-select: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);

  svg {
    width: 16px;
    height: 16px;
    color: var(--dmt-text-primary);
  }

  &:hover {
    background-color: rgba(239, 68, 68, 1);
    transform: translateY(-50%) scale(1.1);
  }

  &:active {
    transform: translateY(-50%) scale(0.95);
  }
}

/* Color picker opacity slider */
.dmt-color-opacity-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--dmt-bg-tertiary);
}

.dmt-color-opacity-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.dmt-color-opacity-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--dmt-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.dmt-color-opacity-value {
  font-size: 12px;
  color: var(--dmt-text-primary);
  font-weight: 500;
  min-width: 35px;
  text-align: right;
}

.dmt-color-opacity-slider {
  width: 100%;
  height: 6px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--dmt-bg-tertiary);
  border-radius: 3px;
  outline: none;
  cursor: pointer;
}

.dmt-color-opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  background: var(--dmt-accent-blue);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--dmt-text-primary);
  transition: transform 0.15s ease;
}

.dmt-color-opacity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.15);
}

.dmt-color-opacity-slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  background: var(--dmt-accent-blue);
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid var(--dmt-text-primary);
  transition: transform 0.15s ease;
}

.dmt-color-opacity-slider::-moz-range-thumb:hover {
  transform: scale(1.15);
}

/* ============================================
   TOUCH/TABLET RESPONSIVE ADJUSTMENTS
   ============================================ */

@media (hover: none) and (pointer: coarse) {
  .dmt-canvas-wrapper {
    height: 400px;
  }

  .dmt-compass {
    width: 35px;
    height: 35px;
    max-width: 35px;
    max-height: 35px;
  }

  .dmt-zoom-btn {
    width: 35px;
    height: 35px;
    max-width: 35px;
    max-height: 35px;
  }

  .dmt-modal-input {
    font-size: 18px;
    padding: 12px;
  }

  .dmt-modal-btn {
    padding: 14px 16px;
    font-size: 16px;
  }

  .dmt-rotate-button,
  .dmt-note-button,
  .dmt-link-note-button,
  .dmt-resize-button,
  .dmt-object-color-button {
    width: 44px;
    height: 44px;
  }

  .dmt-rotate-button {
    font-size: 24px;
  }

  .dmt-resize-button {
    font-size: 22px;
  }

  .dmt-note-button svg {
    width: 22px;
    height: 22px;
  }

  .dmt-link-note-button svg {
    width: 22px;
    height: 22px;
  }

  .dmt-color-swatch {
    width: 44px;
    height: 44px;
  }

  .dmt-color-grid {
    grid-template-columns: repeat(6, 44px);
    gap: 8px;
  }

  .dmt-color-picker {
    min-width: 320px;
  }

  .dmt-color-reset-btn {
    width: 28px;
    height: 28px;
  }

  .dmt-color-delete-button {
    width: 44px;
    height: 44px;

    svg {
      width: 20px;
      height: 20px;
    }
  }
}

/* Text Label Editor Modal Styles */
.dmt-text-editor-modal {
  width: 420px;
  max-width: 90vw;
}

.dmt-text-editor-section {
  margin-bottom: 16px;
}

.dmt-text-editor-section-grow {
  flex: 1;
}

.dmt-text-editor-section-small {
  width: 80px;
}

.dmt-text-editor-label {
  display: block;
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
  font-weight: 500;
}

.dmt-text-editor-row {
  display: flex;
  gap: 12px;
}

.dmt-text-editor-select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: inherit;
  font-size: 14px;
  line-height: 1.6;
  cursor: pointer;
  min-height: 40px;
}

.dmt-text-editor-select:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.dmt-text-editor-number {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid var(--background-modifier-border);
  border-radius: 4px;
  background: var(--background-primary);
  color: var(--text-normal);
  font-family: inherit;
  font-size: 14px;
}

.dmt-text-editor-number:focus {
  outline: none;
  border-color: var(--interactive-accent);
}

.dmt-text-editor-color-button {
  width: 100%;
  height: 40px;
  border: 2px solid var(--background-modifier-border);
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.dmt-text-editor-color-button:hover {
  border-color: var(--interactive-accent);
  transform: translateY(-1px);
}

.dmt-text-editor-color-label {
  font-size: 11px;
  font-weight: 600;
  color: white;
  text-shadow:
    -1px -1px 0 #000,
    1px -1px 0 #000,
    -1px 1px 0 #000,
    1px 1px 0 #000,
    0 0 3px rgba(0, 0, 0, 0.8);
  letter-spacing: 0.5px;
}

/* Live Preview Section */
.dmt-text-editor-preview-toggle {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.dmt-text-editor-preview-toggle:hover {
  background: var(--background-modifier-hover);
  color: var(--text-normal);
}

.dmt-text-editor-preview-toggle svg {
  width: 16px;
  height: 16px;
}

.dmt-text-editor-preview {
  padding: 16px;
  text-align: center;
  background: #2a2a2a;
  border-radius: 4px;
  min-height: 60px;
  max-height: 200px;
  overflow: auto;
  display: flex;
  align-items: center;
  justify-content: center;
  word-wrap: break-word;
  overflow-wrap: break-word;
  border: 1px solid var(--background-modifier-border);
  margin-top: 8px;
}

/* Edit Button (for text labels) */
.dmt-edit-button {
  position: absolute;
  width: 32px;
  height: 32px;
  background: linear-gradient(135deg, #4a9eff 0%, #357abd 100%);
  color: white;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  z-index: 1000;
}

.dmt-edit-button:hover {
  background: linear-gradient(135deg, #5aa5ff 0%, #4088cd 100%);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
}

.dmt-edit-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

/* Object Color Button (for objects) */
.dmt-object-color-button {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  z-index: 1000;
}

.dmt-object-color-button svg {
  width: 16px;
  height: 16px;
  filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.8));
  color: #000;
}

.dmt-object-color-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  border-color: rgba(255, 255, 255, 0.5);
}

.dmt-object-color-button:active {
  transform: translateY(0);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
}

.dmt-object-color-button .dmt-color-picker {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 8px;
}

/* Mobile/tablet adjustments for text editor */
@media (max-width: 768px) {
  .dmt-text-editor-modal {
    width: 360px;
  }

  .dmt-text-editor-number {
    width: 60px;
  }

  .dmt-edit-button {
    width: 44px;
    height: 44px;
    font-size: 22px;
  }
}

/* ============================================
   PLUGIN INSTALLER
   ============================================ */

.dmt-plugin-installer {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 20px;
  background: var(--dmt-bg-primary);
}

.dmt-plugin-installer-card {
  max-width: 600px;
  background: var(--dmt-bg-secondary);
  border: 2px solid var(--dmt-border-primary);
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3),
              inset 0 0 0 1px rgba(196, 165, 123, 0.2);
}

.dmt-plugin-installer-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24px;
  
  svg {
    width: 64px;
    height: 64px;
    color: var(--dmt-border-primary);
    filter: drop-shadow(0 0 8px rgba(196, 165, 123, 0.4));
  }
}

.dmt-plugin-installer-content {
  h3 {
    margin: 0 0 16px 0;
    font-size: 24px;
    font-weight: 600;
    color: var(--dmt-text-primary);
    text-align: center;
  }
  
  p {
    margin: 0 0 12px 0;
    font-size: 15px;
    line-height: 1.6;
    color: var(--dmt-text-secondary);
  }
  
  ul {
    margin: 16px 0;
    padding-left: 24px;
    
    li {
      margin: 8px 0;
      font-size: 14px;
      color: var(--dmt-text-secondary);
    }
  }
  
  .dmt-plugin-installer-note {
    margin-top: 20px;
    padding: 12px;
    background: rgba(196, 165, 123, 0.1);
    border-left: 3px solid var(--dmt-border-primary);
    border-radius: 4px;
    font-size: 13px;
    color: var(--dmt-text-muted);
  }
}

.dmt-plugin-installer-error {
  margin-top: 16px;
  padding: 12px;
  background: rgba(255, 68, 68, 0.1);
  border: 1px solid var(--dmt-error);
  border-radius: 4px;
  color: var(--dmt-error);
  font-size: 14px;
  text-align: center;
}

.dmt-plugin-installer-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: center;
}

.dmt-plugin-installer-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  font-size: 15px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.dmt-plugin-installer-btn-primary {
  background: linear-gradient(135deg, var(--dmt-border-primary) 0%, #8b6842 100%);
  color: var(--dmt-bg-primary);
  box-shadow: 0 2px 8px rgba(196, 165, 123, 0.3);
  
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 16px rgba(196, 165, 123, 0.4);
  }
  
  &:active:not(:disabled) {
    transform: translateY(0);
  }
}

.dmt-plugin-installer-btn-secondary {
  background: var(--dmt-bg-tertiary);
  color: var(--dmt-text-secondary);
  border: 1px solid var(--dmt-border-secondary);
  
  &:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--dmt-text-primary);
  }
}

/* Success Modal */
.dmt-plugin-success-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.dmt-plugin-success-modal {
  max-width: 500px;
  background: var(--dmt-bg-secondary);
  border: 2px solid var(--dmt-border-primary);
  border-radius: 8px;
  padding: 32px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5),
              inset 0 0 0 1px rgba(196, 165, 123, 0.2);
  animation: dmt-modal-fade-in 0.2s ease;
}

@keyframes dmt-modal-fade-in {
  from {
    opacity: 0;
    transform: scale(0.95) translateY(-10px);
  }
  to {
    opacity: 1;
    transform: scale(1) translateY(0);
  }
}

.dmt-plugin-success-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  
  svg {
    width: 56px;
    height: 56px;
    color: #4ade80;
    filter: drop-shadow(0 0 12px rgba(74, 222, 128, 0.5));
  }
}

.dmt-plugin-success-modal h3 {
  margin: 0 0 16px 0;
  font-size: 22px;
  font-weight: 600;
  color: var(--dmt-text-primary);
  text-align: center;
}

.dmt-plugin-success-modal p {
  margin: 0 0 12px 0;
  font-size: 15px;
  line-height: 1.6;
  color: var(--dmt-text-secondary);
  text-align: center;
}

.dmt-plugin-success-note {
  margin-top: 16px;
  padding: 12px;
  background: rgba(196, 165, 123, 0.1);
  border-left: 3px solid var(--dmt-border-primary);
  border-radius: 4px;
  font-size: 13px;
  color: var(--dmt-text-muted);
  text-align: left;
}

.dmt-plugin-success-actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
  justify-content: center;
}

/* ============================================
   Hex Coordinate Layer
   ============================================ */

.dmt-coordinate-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  z-index: 15; /* Above drawing/objects, below UI controls */
  overflow: hidden;
}

.dmt-hex-coordinate {
  font-family: var(--font-monospace);
  font-weight: 600;
  /* color and text-shadow applied via inline styles from settings */
  user-select: none;
  white-space: nowrap;
  letter-spacing: 0.5px;
}

/* ============================================
   Visibility Toolbar
   ============================================ */

.dmt-visibility-toolbar {
  position: absolute;
  top: 128px; /* Below MapHeader + ToolPalette + extra spacing for iPad/mobile (header ~44px + palette ~60px + container padding 12px + gap 12px) */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 4px;
  padding: 4px;
  background-color: var(--dmt-bg-primary);
  border: 2px solid var(--dmt-border-primary);
  border-radius: 4px;
  z-index: 200;
  box-shadow:
    0 4px 12px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(196, 165, 123, 0.2);
  animation: dmt-visibility-slide-in 0.15s ease-out;
}

@keyframes dmt-visibility-slide-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.dmt-visibility-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-secondary);
  border-radius: 3px;
  color: var(--dmt-text-primary);
  cursor: pointer;
  padding: 6px;
  width: 32px;
  height: 32px;
  transition: var(--dmt-transition);

  &:hover:not(.dmt-visibility-btn-hidden) {
    background-color: var(--dmt-bg-tertiary);
    border-color: var(--dmt-border-primary);
  }

  svg:not(.dmt-visibility-strikethrough) {
    color: var(--dmt-border-primary);
    width: 18px;
    height: 18px;
  }
}

.dmt-visibility-strikethrough {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 24px;
  height: 24px;
  color: var(--dmt-accent-red);
  pointer-events: none;
}

.dmt-visibility-btn-hidden {
  opacity: 0.6;
  background-color: rgba(0, 0, 0, 0.3);
  
  &:hover {
    background-color: rgba(0, 0, 0, 0.4);
    border-color: var(--dmt-border-secondary);
  }

  svg:not(.dmt-visibility-strikethrough) {
    color: var(--dmt-text-muted);
  }
}

/* Active state for visibility toggle button in controls */
.dmt-expand-btn-active {
  background-color: var(--dmt-border-primary) !important;
  border-color: #8b6842 !important;
  
  svg {
    color: var(--dmt-bg-primary);
  }
}
/* ==========================================================================
   Scale Slider (shown during resize mode)
   ========================================================================== */

.dmt-scale-slider-container {
  background: var(--dmt-bg-secondary);
  border: 1px solid var(--dmt-border-primary);
  border-radius: 6px;
  padding: 6px 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3),
              inset 0 1px 0 rgba(255, 255, 255, 0.05);
}

.dmt-scale-slider-inner {
  display: flex;
  align-items: center;
  gap: 8px;
  
  svg {
    color: var(--dmt-text-muted);
    flex-shrink: 0;
  }
}

.dmt-scale-slider {
  flex: 1;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: var(--dmt-bg-tertiary);
  border-radius: 2px;
  cursor: pointer;
  
  &::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 14px;
    height: 14px;
    background: var(--dmt-border-primary);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid var(--dmt-bg-secondary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s ease;
    
    &:hover {
      transform: scale(1.15);
    }
  }
  
  &::-moz-range-thumb {
    width: 14px;
    height: 14px;
    background: var(--dmt-border-primary);
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid var(--dmt-bg-secondary);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
    transition: transform 0.1s ease;
    
    &:hover {
      transform: scale(1.15);
    }
  }
  
  &::-webkit-slider-runnable-track {
    height: 4px;
    background: var(--dmt-bg-tertiary);
    border-radius: 2px;
  }
  
  &::-moz-range-track {
    height: 4px;
    background: var(--dmt-bg-tertiary);
    border-radius: 2px;
  }
}

.dmt-scale-value {
  font-size: 12px;
  font-weight: 600;
  color: var(--dmt-text-muted);
  min-width: 36px;
  text-align: right;
  font-family: var(--font-monospace);
}
`;

return css;
```
