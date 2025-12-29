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
  },
  fogOfWar: {
    color: '#000000',
    opacity: 0.9,
    blurEnabled: false,       // Enable soft edge blur effect
    blurFactor: 0.99         // Blur radius as percentage of cell size (8%)
  }
};

// Schema version for data migration (Z-Layer Architecture)
// Increment when mapData structure changes in a breaking way
const SCHEMA_VERSION = 2;

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
    maxCol: 26,             // Default 27 columns (0-26), A-AA for coordinate keys
    maxRow: 20              // Default 21 rows (0-20), 1-21 for coordinate keys
  },
  
  // Map type
  mapType: 'grid',          // 'grid' or 'hex'
  
  // Shared defaults
  initialZoom: 1.5,
  canvasSize: {              
    width: 800, 
    height: 900 
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


// ============================================================================
// SEGMENT SYSTEM - For partial cell painting (8-triangle subdivision)
// ============================================================================

/**
 * Segment names in clockwise order from top-left
 * 8 triangular segments radiating from cell center
 * 
 *     TL ----TM---- TR
 *     |\  nw | n  /|
 *     | \   |   / |
 *     |  \  |  /  |
 *     | w \ | / ne|
 *    LM------*------RM
 *     | sw / | \ e |
 *     |  /   |  \  |
 *     | /    |   \ |
 *     |/  s  | se \|
 *     BL ----BM---- BR
 */
const SEGMENT_NAMES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/**
 * Vertex names for segment triangle definitions
 * Each segment is defined by: center + two boundary vertices
 */
const SEGMENT_VERTICES = {
  // Corner vertices
  TL: { xRatio: 0, yRatio: 0 },      // Top-left
  TR: { xRatio: 1, yRatio: 0 },      // Top-right
  BR: { xRatio: 1, yRatio: 1 },      // Bottom-right
  BL: { xRatio: 0, yRatio: 1 },      // Bottom-left
  // Midpoint vertices
  TM: { xRatio: 0.5, yRatio: 0 },    // Top-middle
  RM: { xRatio: 1, yRatio: 0.5 },    // Right-middle
  BM: { xRatio: 0.5, yRatio: 1 },    // Bottom-middle
  LM: { xRatio: 0, yRatio: 0.5 },    // Left-middle
  // Center vertex (implicit in all triangles)
  C:  { xRatio: 0.5, yRatio: 0.5 }
};

/**
 * Triangle vertex definitions for each segment
 * Each segment is a triangle: [center, vertex1, vertex2] (clockwise order)
 */
const SEGMENT_TRIANGLES = {
  nw: ['C', 'TL', 'TM'],
  n:  ['C', 'TM', 'TR'],
  ne: ['C', 'TR', 'RM'],
  e:  ['C', 'RM', 'BR'],
  se: ['C', 'BR', 'BM'],
  s:  ['C', 'BM', 'BL'],
  sw: ['C', 'BL', 'LM'],
  w:  ['C', 'LM', 'TL']
};

/**
 * Internal adjacency within a cell
 * Maps internal edge (center to boundary point) to the two segments sharing it
 * Used for determining internal borders between filled/empty segments
 */
const SEGMENT_INTERNAL_ADJACENCY = {
  'C-TL': ['w', 'nw'],
  'C-TM': ['nw', 'n'],
  'C-TR': ['n', 'ne'],
  'C-RM': ['ne', 'e'],
  'C-BR': ['e', 'se'],
  'C-BM': ['se', 's'],
  'C-BL': ['s', 'sw'],
  'C-LM': ['sw', 'w']
};

/**
 * Cross-cell adjacency for border calculation
 * Maps each segment to its neighbor cell and which segment in that neighbor it touches
 * Format: { segment: { dx, dy, neighborSegment } }
 */
const SEGMENT_CROSS_CELL_ADJACENCY = {
  nw: { dx: 0, dy: -1, neighborSegment: 's' },   // Above, touches their s
  n:  { dx: 0, dy: -1, neighborSegment: 'se' },  // Above, touches their se
  ne: { dx: 1, dy: 0, neighborSegment: 'w' },    // Right, touches their w
  e:  { dx: 1, dy: 0, neighborSegment: 'sw' },   // Right, touches their sw
  se: { dx: 0, dy: 1, neighborSegment: 'nw' },   // Below, touches their nw
  s:  { dx: 0, dy: 1, neighborSegment: 'n' },    // Below, touches their n
  sw: { dx: -1, dy: 0, neighborSegment: 'ne' },  // Left, touches their ne
  w:  { dx: -1, dy: 0, neighborSegment: 'e' }    // Left, touches their e
};

/**
 * External edge definitions for each segment
 * Maps segment to which cell boundary edge it touches
 * Format: { segment: { edge: 'top'|'right'|'bottom'|'left', half: 'first'|'second' } }
 * 'first' = left/top half of edge, 'second' = right/bottom half
 */
const SEGMENT_EXTERNAL_EDGES = {
  nw: { edge: 'top', half: 'first' },
  n:  { edge: 'top', half: 'second' },
  ne: { edge: 'right', half: 'first' },
  e:  { edge: 'right', half: 'second' },
  se: { edge: 'bottom', half: 'second' },
  s:  { edge: 'bottom', half: 'first' },
  sw: { edge: 'left', half: 'second' },
  w:  { edge: 'left', half: 'first' }
};

return { 
  THEME, 
  DEFAULTS, 
  DATA_FILE_PATH, 
  SCHEMA_VERSION,
  // Segment system constants
  SEGMENT_NAMES,
  SEGMENT_VERTICES,
  SEGMENT_TRIANGLES,
  SEGMENT_INTERNAL_ADJACENCY,
  SEGMENT_CROSS_CELL_ADJACENCY,
  SEGMENT_EXTERNAL_EDGES
};