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
import { calculateFitZoom } from '../geometry/core/hexMeasurements';

/** Data file structure */
interface DataFile {
  maps: Record<string, MapData>;
}

function migrateMapData(mapData: MapData): MapData {
  if (!mapData.objects) mapData.objects = [];
  if (!mapData.textLabels) mapData.textLabels = [];
  if (!mapData.customColors) mapData.customColors = [];
  if (!mapData.edges) mapData.edges = [];
  if (!mapData.regions) mapData.regions = [];
  if (!mapData.outlines) mapData.outlines = [];
  if (!mapData.shapeOverlays) mapData.shapeOverlays = [];
  if (!mapData.mapType) mapData.mapType = 'grid';
  if (!mapData.settings) {
    mapData.settings = { useGlobalSettings: true, overrides: {} };
  }
  if (!mapData.uiPreferences) {
    mapData.uiPreferences = {
      rememberPanZoom: true,
      rememberSidebarState: true,
      rememberExpandedState: false
    };
  }
  if (mapData.expandedState === undefined) mapData.expandedState = false;
  if (!mapData.lastTextLabelSettings) mapData.lastTextLabelSettings = null;

  // Hex-specific migration
  if (mapData.mapType === 'hex') {
    if (!mapData.hexBounds) {
      mapData.hexBounds = { ...DEFAULTS.hexBounds };
    } else if ((mapData.hexBounds as unknown as Record<string, unknown>).maxQ !== undefined) {
      // Old axial bounds format → offset format (boundary cast: legacy schema)
      const legacyBounds = mapData.hexBounds as unknown as Record<string, unknown>;
      mapData.hexBounds = {
        maxCol: legacyBounds.maxQ as number,
        maxRow: legacyBounds.maxR as number
      };
    }

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
      if (mapData.backgroundImage.gridDensity === undefined) mapData.backgroundImage.gridDensity = 'medium';
      if (mapData.backgroundImage.customColumns === undefined) mapData.backgroundImage.customColumns = 24;
      if (mapData.backgroundImage.sizingMode === undefined) mapData.backgroundImage.sizingMode = 'density';
      if (mapData.backgroundImage.measurementMethod === undefined) mapData.backgroundImage.measurementMethod = 'corner';
      if (mapData.backgroundImage.measurementSize === undefined) mapData.backgroundImage.measurementSize = 86;
      if (mapData.backgroundImage.fineTuneOffset === undefined) mapData.backgroundImage.fineTuneOffset = 0;
    }
  }

  // Layer schema migration (v2)
  if (needsMigration(mapData)) {
    mapData = migrateToLayerSchema(mapData) as MapData;
  }

  // Tileset source migration: add source: 'folder' to legacy tilesets
  if (!mapData.tilesets) mapData.tilesets = [];
  for (const ts of mapData.tilesets) {
    if (!('source' in ts)) {
      (ts as Record<string, unknown>).source = 'folder';
    }
  }

  // Layer-level arrays and curve migration
  for (const layer of mapData.layers) {
    if (!layer.tiles) layer.tiles = [];

    // Tile assignment migration: q→col, r→row, layer→placement (boundary cast: legacy schema)
    for (const tile of layer.tiles) {
      const legacy = tile as unknown as Record<string, unknown>;
      if ('q' in legacy && !('col' in legacy)) {
        legacy.col = legacy.q;
        legacy.row = legacy.r;
        delete legacy.q;
        delete legacy.r;
      }
      if ('layer' in legacy && !('placement' in legacy)) {
        const oldLayer = legacy.layer as string;
        legacy.placement = oldLayer === 'base' ? undefined : oldLayer;
        delete legacy.layer;
      }
    }

    if (!layer.curves) layer.curves = [];
    layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
    for (const curve of layer.curves) {
      // Migrate legacy holes (flat number[]) to innerRings (boundary cast: legacy schema)
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

  // Sub-hex migration
  if (mapData.subHexMaps) {
    for (const hexKey of Object.keys(mapData.subHexMaps)) {
      const subHex = mapData.subHexMaps[hexKey];
      if (subHex?.mapData != null) {
        for (const layer of subHex.mapData.layers) {
          if (!layer.tiles) layer.tiles = [];
          if (!layer.curves) layer.curves = [];
          layer.curves = layer.curves.filter(c => c.start != null && c.segments != null);
        }
        if (!subHex.mapData.regions) subHex.mapData.regions = [];
        if (!subHex.mapData.outlines) subHex.mapData.outlines = [];
        if (!subHex.mapData.shapeOverlays) subHex.mapData.shapeOverlays = [];
      }
    }
  }

  return mapData;
}

async function loadMapData(app: App, mapId: string, mapName: string = '', mapType: MapType = 'grid'): Promise<MapData> {
  try {
    const dataPath = getDataFilePath();
    const file = app.vault.getAbstractFileByPath(dataPath);

    if (!(file instanceof TFile)) {
      return createNewMap(mapName, mapType);
    }

    const content = await app.vault.read(file);
    const data = JSON.parse(content) as DataFile;

    if (data.maps[mapId] != null) {
      data.maps[mapId] = migrateMapData(data.maps[mapId]);
      if (data.maps[mapId].name == null && mapName) {
        data.maps[mapId].name = mapName;
      }
      return data.maps[mapId];
    }

    return createNewMap(mapName, mapType);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[loadMapData] Failed to load map data, creating new map:', error);
    return createNewMap(mapName, mapType);
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

function createNewMap(mapName: string = '', mapType: MapType = 'grid'): MapData {
  // Generate layer ID for initial layer
  const initialLayerId = generateLayerId();

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
    fogOfWar: null,
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

interface MapListEntry {
  id: string;
  name: string;
  type: MapType;
}

async function listMaps(app: App): Promise<MapListEntry[]> {
  try {
    const dataPath = getDataFilePath();
    const file = app.vault.getAbstractFileByPath(dataPath);
    if (!(file instanceof TFile)) return [];

    const content = await app.vault.read(file);
    const data = JSON.parse(content) as DataFile;

    return Object.entries(data.maps).map(([id, mapData]) => ({
      id,
      name: mapData.name || id,
      type: mapData.mapType || 'grid',
    }));
  } catch {
    return [];
  }
}

export { loadMapData, saveMapData, createNewMap, listMaps };
export type { MapListEntry };