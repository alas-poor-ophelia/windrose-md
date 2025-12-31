const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);


const { DEFAULTS, DATA_FILE_PATH, SCHEMA_VERSION } = await requireModuleByName("dmtConstants.ts");
const { offsetToAxial } = await requireModuleByName("offsetCoordinates.js");
const { getSettings } = await requireModuleByName("settingsAccessor.ts");
const { 
  migrateToLayerSchema, 
  needsMigration, 
  generateLayerId
} = await requireModuleByName("layerAccessor.ts");

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
      // Ensure lastTextLabelSettings exists (backward compatibility)
      if (!data.maps[mapId].lastTextLabelSettings) {
        data.maps[mapId].lastTextLabelSettings = null;
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
            customColumns: 24,
            sizingMode: 'density',  // 'density' or 'measurement'
            measurementMethod: 'corner',  // 'edge' or 'corner'
            measurementSize: 86,  // Size in pixels
            fineTuneOffset: 0  // Fine-tune adjustment (0 = no adjustment)
          };
        } else {
          // Ensure new fields exist on existing backgroundImage objects
          if (data.maps[mapId].backgroundImage.gridDensity === undefined) {
            data.maps[mapId].backgroundImage.gridDensity = 'medium';
          }
          if (data.maps[mapId].backgroundImage.customColumns === undefined) {
            data.maps[mapId].backgroundImage.customColumns = 24;
          }
          // Add new fields for measurement mode (v1.1.0)
          if (data.maps[mapId].backgroundImage.sizingMode === undefined) {
            data.maps[mapId].backgroundImage.sizingMode = 'density';
          }
          if (data.maps[mapId].backgroundImage.measurementMethod === undefined) {
            data.maps[mapId].backgroundImage.measurementMethod = 'corner';
          }
          if (data.maps[mapId].backgroundImage.measurementSize === undefined) {
            data.maps[mapId].backgroundImage.measurementSize = 86;
          }
          if (data.maps[mapId].backgroundImage.fineTuneOffset === undefined) {
            data.maps[mapId].backgroundImage.fineTuneOffset = 0;
          }
        }
      }
      // Migrate to layer schema if needed (v2)
      if (needsMigration(data.maps[mapId])) {
        data.maps[mapId] = migrateToLayerSchema(data.maps[mapId]);
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
  
  // Generate layer ID for initial layer
  const initialLayerId = generateLayerId();
  
  // Base map structure with layer schema (v2)
  const baseMap = {
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
    lastTextLabelSettings: null,  // Stores {fontFace, fontSize, color} for new labels
    
    // Layer system (v2)
    schemaVersion: SCHEMA_VERSION,
    activeLayerId: initialLayerId,
    layerPanelVisible: false,
    layers: [
      {
        id: initialLayerId,
        name: 'Layer 1',
        order: 0,
        visible: true,
        cells: [],
        edges: [],  // For edge painting (grid maps only)
        objects: [],
        textLabels: [],
        fogOfWar: null  //Fog of War
      }
    ]
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