/**
 * fileOperations.ts
 *
 * File I/O operations for map data persistence.
 * Handles loading/saving map data to the Obsidian vault.
 */

import type { MapData, MapType, ViewState } from '#types/core/map.types';
import type { HexOrientation } from '#types/settings/settings.types';
import type { Layer } from '#types/core/layer.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

/** Constants module */
interface ConstantsModule {
  DEFAULTS: {
    hexSize: number;
    hexOrientation: HexOrientation;
    hexBounds: { maxCol: number; maxRow: number };
    dimensions: { width: number; height: number };
    gridSize: number;
    initialZoom: number;
  };
  DATA_FILE_PATH: string;
  SCHEMA_VERSION: number;
}

/** Layer accessor module */
interface LayerAccessorModule {
  migrateToLayerSchema: (mapData: MapData) => MapData;
  needsMigration: (mapData: MapData) => boolean;
  generateLayerId: () => string;
}

/** Settings accessor module */
interface SettingsAccessorModule {
  getSettings: () => { hexSize?: number; hexOrientation?: HexOrientation };
}

/** Offset coordinates module */
interface OffsetCoordsModule {
  offsetToAxial: (col: number, row: number, orientation: HexOrientation) => { q: number; r: number };
}

const { DEFAULTS, DATA_FILE_PATH, SCHEMA_VERSION } = await requireModuleByName("dmtConstants.ts") as ConstantsModule;
const { offsetToAxial } = await requireModuleByName("offsetCoordinates.ts") as OffsetCoordsModule;
const { getSettings } = await requireModuleByName("settingsAccessor.ts") as SettingsAccessorModule;
const {
  migrateToLayerSchema,
  needsMigration,
  generateLayerId
} = await requireModuleByName("layerAccessor.ts") as LayerAccessorModule;

/** Data file structure */
interface DataFile {
  maps: Record<string, MapData>;
}

/**
 * Load map data from vault
 */
async function loadMapData(mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<MapData> {
  try {
    const file = app.vault.getAbstractFileByPath(DATA_FILE_PATH);

    if (!file) {
      return createNewMap(mapId, mapName, mapType);
    }

    const content = await app.vault.read(file);
    const data = JSON.parse(content) as DataFile;

    if (data.maps && data.maps[mapId]) {
      const mapData = data.maps[mapId];

      // Ensure all arrays exist
      if (!mapData.objects) {
        mapData.objects = [];
      }
      if (!mapData.textLabels) {
        mapData.textLabels = [];
      }
      if (!mapData.customColors) {
        mapData.customColors = [];
      }
      // Ensure edges array exists (for edge painting feature)
      if (!mapData.edges) {
        mapData.edges = [];
      }
      // Ensure mapType exists (backward compatibility)
      if (!mapData.mapType) {
        mapData.mapType = 'grid';
      }
      // Ensure settings exist (backward compatibility)
      if (!mapData.settings) {
        mapData.settings = {
          useGlobalSettings: true,
          overrides: {}
        };
      }
      // Ensure uiPreferences exist (backward compatibility)
      if (!mapData.uiPreferences) {
        mapData.uiPreferences = {
          rememberPanZoom: true,
          rememberSidebarState: true,
          rememberExpandedState: false
        };
      }
      // Ensure expandedState exists (backward compatibility)
      if (mapData.expandedState === undefined) {
        mapData.expandedState = false;
      }
      // Ensure lastTextLabelSettings exists (backward compatibility)
      if (!mapData.lastTextLabelSettings) {
        mapData.lastTextLabelSettings = null;
      }
      // Ensure hexBounds exists for hex maps (use defaults, handle migration)
      if (mapData.mapType === 'hex') {
        if (!mapData.hexBounds) {
          // No bounds at all - use defaults
          mapData.hexBounds = { ...DEFAULTS.hexBounds };
        } else if ((mapData.hexBounds as any).maxQ !== undefined) {
          // Old axial bounds format - convert to offset format
          mapData.hexBounds = {
            maxCol: (mapData.hexBounds as any).maxQ,
            maxRow: (mapData.hexBounds as any).maxR
          };
        }
        // else: already has maxCol/maxRow (new format) - no action needed

        // Ensure backgroundImage exists for hex maps (backward compatibility)
        if (!mapData.backgroundImage) {
          mapData.backgroundImage = {
            path: null,
            lockBounds: false,
            gridDensity: 'medium',
            customColumns: 24,
            sizingMode: 'density',
            measurementMethod: 'corner',
            measurementSize: 86,
            fineTuneOffset: 0
          };
        } else {
          // Ensure new fields exist on existing backgroundImage objects
          if (mapData.backgroundImage.gridDensity === undefined) {
            mapData.backgroundImage.gridDensity = 'medium';
          }
          if (mapData.backgroundImage.customColumns === undefined) {
            mapData.backgroundImage.customColumns = 24;
          }
          // Add new fields for measurement mode (v1.1.0)
          if (mapData.backgroundImage.sizingMode === undefined) {
            mapData.backgroundImage.sizingMode = 'density';
          }
          if (mapData.backgroundImage.measurementMethod === undefined) {
            mapData.backgroundImage.measurementMethod = 'corner';
          }
          if (mapData.backgroundImage.measurementSize === undefined) {
            mapData.backgroundImage.measurementSize = 86;
          }
          if (mapData.backgroundImage.fineTuneOffset === undefined) {
            mapData.backgroundImage.fineTuneOffset = 0;
          }
        }
      }
      // Migrate to layer schema if needed (v2)
      if (needsMigration(mapData)) {
        data.maps[mapId] = migrateToLayerSchema(mapData);
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

/**
 * Save map data to vault
 */
async function saveMapData(mapId: string, mapData: MapData): Promise<boolean> {
  try {
    let allData: DataFile = { maps: {} };

    // Load existing data
    const file = app.vault.getAbstractFileByPath(DATA_FILE_PATH);
    if (file) {
      const content = await app.vault.read(file);
      allData = JSON.parse(content) as DataFile;
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

/**
 * Create a new map with defaults
 */
function createNewMap(mapId: string, mapName: string = '', mapType: MapType = 'grid'): MapData {
  if (!DEFAULTS) {
    console.error('[createNewMap] CRITICAL: DEFAULTS is undefined!');
    throw new Error('DEFAULTS is undefined - constants.js import failed');
  }

  // Generate layer ID for initial layer
  const initialLayerId = generateLayerId();

  // Initial layer
  const initialLayer: Layer = {
    id: initialLayerId,
    name: '1',
    order: 0,
    visible: true,
    cells: [],
    edges: [],
    objects: [],
    textLabels: [],
    fogOfWar: null
  };

  // Base map structure with layer schema (v2)
  const baseMap: MapData = {
    // Global settings
    name: mapName,
    description: "",
    mapType: mapType,
    northDirection: 0,
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
    },
    lastTextLabelSettings: null,

    // Layer system (v2)
    schemaVersion: SCHEMA_VERSION,
    activeLayerId: initialLayerId,
    layerPanelVisible: false,
    layers: [initialLayer],

    // Will be set below based on mapType
    gridSize: DEFAULTS.gridSize,
    dimensions: { ...DEFAULTS.dimensions },
    viewState: {
      zoom: DEFAULTS.initialZoom,
      center: { x: 0, y: 0 }
    }
  };

  // Add type-specific properties
  if (mapType === 'hex') {
    // Get global settings to respect user configuration
    const globalSettings = getSettings();

    baseMap.hexSize = globalSettings.hexSize || DEFAULTS.hexSize;
    baseMap.orientation = globalSettings.hexOrientation || DEFAULTS.hexOrientation;
    baseMap.hexBounds = { ...DEFAULTS.hexBounds };
    baseMap.dimensions = { ...DEFAULTS.dimensions };

    // Calculate proper viewport center for hex map using offset coordinates
    const hexSize = baseMap.hexSize;
    const orientation = baseMap.orientation;

    // Calculate center in offset coordinates (rectangular bounds)
    const centerCol = Math.floor(DEFAULTS.hexBounds.maxCol / 2);
    const centerRow = Math.floor(DEFAULTS.hexBounds.maxRow / 2);

    // Convert offset center to axial coordinates
    const { q: centerQ, r: centerR } = offsetToAxial(centerCol, centerRow, orientation);

    // Convert hex center to world coordinates (using axial coords)
    let worldX: number, worldY: number;
    if (orientation === 'flat') {
      worldX = hexSize * (3 / 2) * centerQ;
      worldY = hexSize * (Math.sqrt(3) / 2 * centerQ + Math.sqrt(3) * centerR);
    } else {
      // pointy
      worldX = hexSize * (Math.sqrt(3) * centerQ + Math.sqrt(3) / 2 * centerR);
      worldY = hexSize * (3 / 2) * centerR;
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
