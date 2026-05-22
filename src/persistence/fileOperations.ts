/**
 * fileOperations.ts
 *
 * File I/O operations for map data persistence.
 * Handles loading/saving map data to the Obsidian vault.
 */

import type { MapData, MapLayer, MapType } from '#types/core/map.types';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { DEFAULTS, SCHEMA_VERSION } from '../core/dmtConstants';
import { getDataFilePath } from '../core/settingsAccessor';
import { offsetToAxial } from '../geometry/core/offsetCoordinates';
import { getSettings } from '../core/settingsAccessor';
import { migrateToLayerSchema, needsMigration, generateLayerId } from './layerAccessor';




/** Constants module */

/** Layer accessor module */

/** Settings accessor module */

/** Offset coordinates module */


/** Data file structure */
interface DataFile {
  maps: Record<string, MapData>;
}

/**
 * Load map data from vault
 */
async function loadMapData(app: App, mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<MapData> {
  try {
    const dataPath = getDataFilePath();
    // eslint-disable-next-line no-console
    console.log('[loadMapData] path:', dataPath, 'mapId:', mapId);
    const file = app.vault.getAbstractFileByPath(dataPath);

    if (!(file instanceof TFile)) {
      return createNewMap(mapId, mapName, mapType);
    }

    const content = await app.vault.read(file);
    const data = JSON.parse(content) as DataFile;

    if (data.maps[mapId] != null) {
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
      // Ensure regions array exists (backward compatibility)
      if (!mapData.regions) {
        mapData.regions = [];
      }
      // Ensure outlines array exists (backward compatibility)
      if (!mapData.outlines) {
        mapData.outlines = [];
      }
      // Ensure shapeOverlays array exists (backward compatibility)
      if (!mapData.shapeOverlays) {
        mapData.shapeOverlays = [];
      }
      // Ensure hexBounds exists for hex maps (use defaults, handle migration)
      if (mapData.mapType === 'hex') {
        if (!mapData.hexBounds) {
          // No bounds at all - use defaults
          mapData.hexBounds = { ...DEFAULTS.hexBounds };
        } else if ((mapData.hexBounds as unknown as Record<string, unknown>).maxQ !== undefined) {
          // Old axial bounds format - convert to offset format
          const legacyBounds = mapData.hexBounds as unknown as Record<string, unknown>;
          mapData.hexBounds = {
            maxCol: legacyBounds.maxQ as number,
            maxRow: legacyBounds.maxR as number
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
        data.maps[mapId] = migrateToLayerSchema(mapData) as MapData;
      }

      // Ensure arrays exist on all layers (backward compat)
      const loadedMap = data.maps[mapId];
      if (!loadedMap.tilesets) {
        loadedMap.tilesets = [];
      }
      for (const layer of loadedMap.layers) {
        if (!layer.tiles) {
          layer.tiles = [];
        }
        // Filter out v1 POC curves that lack required start/segments fields
        layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
        for (const curve of layer.curves) {
          // Migrate legacy holes (flat number[]) to innerRings ([[x,y],...])
          const legacy = (curve as unknown as Record<string, unknown>).holes as number[][] | undefined;
          if (legacy && legacy.length > 0) {
            const innerRings: [number, number][][] = [];
            for (const hole of legacy) {
              if (hole.length < 6) continue;
              const ring: [number, number][] = [];
              for (let i = 0; i < hole.length; i += 2) {
                ring.push([hole[i], hole[i + 1]]);
              }
              innerRings.push(ring);
            }
            if (innerRings.length > 0) {
              curve.innerRings = innerRings;
            }
            delete (curve as unknown as Record<string, unknown>).holes;
          }
        }
      }

      // Migrate sub-hex maps if present (recursive)
      if (loadedMap.subHexMaps) {
        for (const hexKey of Object.keys(loadedMap.subHexMaps)) {
          const subHex = loadedMap.subHexMaps[hexKey];
          if (subHex?.mapData != null) {
            for (const layer of subHex.mapData.layers) {
              if (!layer.tiles) layer.tiles = [];
              layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
            }
            if (!subHex.mapData.regions) subHex.mapData.regions = [];
            if (!subHex.mapData.outlines) subHex.mapData.outlines = [];
            if (!subHex.mapData.shapeOverlays) subHex.mapData.shapeOverlays = [];
          }
        }
      }

      return loadedMap;
    } else {
      return createNewMap(mapId, mapName, mapType);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[loadMapData] Error:', error);
    return createNewMap(mapId, mapName, mapType);
  }
}

/**
 * Save map data to vault
 */
async function saveMapData(app: App, mapId: string, mapData: MapData): Promise<boolean> {
  try {
    let allData: DataFile = { maps: {} };

    // Load existing data
    const abstractFile = app.vault.getAbstractFileByPath(getDataFilePath());
    const file = abstractFile instanceof TFile ? abstractFile : null;
    if (file) {
      const content = await app.vault.read(file);
      allData = JSON.parse(content) as DataFile;
    }

    // Update specific map
    allData.maps[mapId] = mapData;

    const jsonString = JSON.stringify(allData, null, 2);

    if (file) {
      await app.vault.modify(file, jsonString);
    } else {
      await app.vault.create(getDataFilePath(), jsonString);
    }

    return true;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error saving map data:', error);
    return false;
  }
}

/**
 * Create a new map with defaults
 */
/**
 * Calculate a zoom level that fits the hex grid within the canvas.
 */
function calculateFitZoom(
  hexSize: number,
  orientation: string,
  hexBounds: { maxCol: number; maxRow: number; maxRing?: number },
  canvasWidth: number,
  canvasHeight: number
): number {
  const sqrt3 = Math.sqrt(3);
  let worldWidth: number, worldHeight: number;

  if (hexBounds.maxRing !== undefined && hexBounds.maxRing > 0) {
    // Radial bounds — full diameter including outer hex edges
    if (orientation === 'flat') {
      worldWidth = hexSize * 2 * (hexBounds.maxRing * 1.5 + 1);
      worldHeight = hexSize * sqrt3 * (hexBounds.maxRing * 2 + 1);
    } else {
      worldWidth = hexSize * sqrt3 * (hexBounds.maxRing * 2 + 1);
      worldHeight = hexSize * 2 * (hexBounds.maxRing * 1.5 + 1);
    }
  } else {
    // Rectangular bounds — account for hex stagger offset
    if (orientation === 'flat') {
      worldWidth = hexSize * (1.5 * hexBounds.maxCol + 0.5);
      worldHeight = hexSize * sqrt3 * (hexBounds.maxRow + 0.5);
    } else {
      worldWidth = hexSize * sqrt3 * (hexBounds.maxCol + 0.5);
      worldHeight = hexSize * (1.5 * hexBounds.maxRow + 0.5);
    }
  }

  // Use 0.7 factor to leave comfortable margin around the grid
  const fitZoom = Math.min(canvasWidth / worldWidth, canvasHeight / worldHeight) * 0.7;
  return Math.max(DEFAULTS.minZoom, Math.min(DEFAULTS.maxZoom, fitZoom));
}

function createNewMap(_mapId: string, mapName: string = '', mapType: MapType = 'grid'): MapData {
  // Generate layer ID for initial layer
  const initialLayerId = generateLayerId();

  // Initial layer
  const initialLayer: MapLayer = {
    id: initialLayerId,
    name: '1',
    order: 0,
    visible: true,
    cells: [],
    curves: [],
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

    baseMap.hexSize = DEFAULTS.hexSize;
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

    const fitZoom = calculateFitZoom(
      hexSize, orientation, baseMap.hexBounds,
      DEFAULTS.canvasSize.width, DEFAULTS.canvasSize.height
    );

    baseMap.viewState = {
      zoom: fitZoom,
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

export { loadMapData, saveMapData, createNewMap, calculateFitZoom };