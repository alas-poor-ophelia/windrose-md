// utils/constants.js - Theme, defaults, and dynamic path resolution

const pathResolverPath = dc.resolvePath("pathResolver.js");
const pathResolverImport = await dc.require(pathResolverPath);
const { getJsonPath } = pathResolverImport;

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
const DATA_FILE_PATH = getJsonPath();

return { THEME, DEFAULTS, DATA_FILE_PATH };