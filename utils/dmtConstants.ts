// Path: dmtConstants.ts
// Converted from dmtConstants.js - Theme, defaults, and dynamic path resolution

// Type-only imports
import type { SegmentName } from '#types/core/cell.types';
import type { HexBounds } from '#types/core/map.types';

// =============================================================================
// Type Definitions
// =============================================================================

/** Hex color string (e.g., "#ff0000") */
type HexColor = string;

/** Grid visual theme settings */
interface GridTheme {
  lines: HexColor;
  lineWidth: number;
  background: HexColor;
}

/** Cell visual theme settings */
interface CellTheme {
  fill: HexColor;
  border: HexColor;
  borderWidth: number;
}

/** Coordinate key theme (letter labels) */
interface CoordinateKeyTheme {
  color: HexColor;
}

/** Coordinate text theme (number labels) */
interface CoordinateTextTheme {
  color: HexColor;
  shadow: HexColor;
}

/** Compass rose theme */
interface CompassTheme {
  color: HexColor;
  size: number;
}

/** Fog of war visual settings */
interface FogOfWarTheme {
  color: HexColor;
  opacity: number;
  blurEnabled: boolean;
  blurFactor: number;
}

/** Complete theme configuration */
interface Theme {
  grid: GridTheme;
  cells: CellTheme;
  coordinateKey: CoordinateKeyTheme;
  coordinateText: CoordinateTextTheme;
  compass: CompassTheme;
  fogOfWar: FogOfWarTheme;
}

/** Map dimensions (width/height in cells) */
interface Dimensions {
  width: number;
  height: number;
}

/** Canvas size in pixels */
interface CanvasSize {
  width: number;
  height: number;
}

/** Hex orientation options */
type HexOrientation = 'flat' | 'pointy';

/** Map type options */
type MapType = 'grid' | 'hex';

/** Grid diagonal measurement rules */
type DiagonalRule = 'alternating' | 'equal' | 'euclidean';

/** Distance display format options */
type DistanceDisplayFormat = 'cells' | 'units' | 'both';

/** Distance measurement settings */
interface DistanceDefaults {
  perCellGrid: number;
  perCellHex: number;
  unitGrid: string;
  unitHex: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** Complete defaults configuration */
interface Defaults {
  gridSize: number;
  dimensions: Dimensions;
  hexSize: number;
  hexOrientation: HexOrientation;
  hexBounds: HexBounds;
  mapType: MapType;
  initialZoom: number;
  canvasSize: CanvasSize;
  maxHistory: number;
  minZoom: number;
  maxZoom: number;
  zoomButtonStep: number;
  zoomWheelStep: number;
  distance: DistanceDefaults;
}

// =============================================================================
// Segment System Types
// =============================================================================

// SegmentName imported from '#types/core/cell.types' (canonical source)

/** Vertex identifier for segment triangle definitions */
type VertexName = 'TL' | 'TR' | 'BR' | 'BL' | 'TM' | 'RM' | 'BM' | 'LM' | 'C';

/** Vertex position as ratio (0-1) within cell bounds */
interface VertexRatio {
  xRatio: number;
  yRatio: number;
}

/** Triangle definition as array of vertex names [center, vertex1, vertex2] */
type TriangleDefinition = [VertexName, VertexName, VertexName];

/** Internal edge key format */
type InternalEdgeKey = 'C-TL' | 'C-TM' | 'C-TR' | 'C-RM' | 'C-BR' | 'C-BM' | 'C-BL' | 'C-LM';

/** Cross-cell adjacency definition */
interface CrossCellAdjacency {
  dx: number;
  dy: number;
  neighborSegment: SegmentName;
}

/** Cell edge names */
type CellEdge = 'top' | 'right' | 'bottom' | 'left';

/** Edge half (for segment positioning) */
type EdgeHalf = 'first' | 'second';

/** External edge definition for a segment */
interface ExternalEdge {
  edge: CellEdge;
  half: EdgeHalf;
}

// =============================================================================
// Diagonal Fill Tool Types
// =============================================================================

/** Corner identifier */
type CornerName = 'TL' | 'TR' | 'BR' | 'BL';

/** Neighbor offset for corner validation */
interface NeighborOffset {
  dx: number;
  dy: number;
}

/** Diagonal direction identifier */
type DiagonalDirection = 'TL-BR' | 'TR-BL';

// =============================================================================
// Datacore Imports
// =============================================================================

const pathResolverPath = dc.resolvePath("pathResolver.js");
const pathResolverImport = await dc.require(pathResolverPath) as { getJsonPath: () => string };
const { getJsonPath } = pathResolverImport;

// =============================================================================
// Theme Configuration
// =============================================================================

const THEME: Theme = {
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
    blurEnabled: false,
    blurFactor: 0.99
  }
};

// =============================================================================
// Schema Version
// =============================================================================

/**
 * Schema version for data migration (Z-Layer Architecture)
 * Increment when mapData structure changes in a breaking way
 */
const SCHEMA_VERSION: number = 2;

// =============================================================================
// Defaults Configuration
// =============================================================================

const DEFAULTS: Defaults = {
  // Grid map defaults
  gridSize: 32,
  dimensions: { 
    width: 300,
    height: 300 
  },
  
  // Hex map defaults
  hexSize: 80,
  hexOrientation: 'flat',
  hexBounds: {
    maxCol: 26,
    maxRow: 20
  },
  
  // Map type
  mapType: 'grid',
  
  // Shared defaults
  initialZoom: 1.5,
  canvasSize: {              
    width: 800, 
    height: 900 
  },
  maxHistory: 50,
  minZoom: 0.1,       
  maxZoom: 4,         
  zoomButtonStep: 0.05,
  zoomWheelStep: 0.05,
  
  // Distance measurement defaults
  distance: {
    perCellGrid: 5,
    perCellHex: 6,
    unitGrid: 'ft',
    unitHex: 'mi',
    gridDiagonalRule: 'alternating',
    displayFormat: 'both'
  }
};

// Dynamically resolve the correct JSON path
const DATA_FILE_PATH: string = getJsonPath();

// =============================================================================
// Segment System Constants
// =============================================================================

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
const SEGMENT_NAMES: readonly SegmentName[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const;

/**
 * Vertex positions for segment triangle definitions
 * Each segment is defined by: center + two boundary vertices
 */
const SEGMENT_VERTICES: Record<VertexName, VertexRatio> = {
  // Corner vertices
  TL: { xRatio: 0, yRatio: 0 },
  TR: { xRatio: 1, yRatio: 0 },
  BR: { xRatio: 1, yRatio: 1 },
  BL: { xRatio: 0, yRatio: 1 },
  // Midpoint vertices
  TM: { xRatio: 0.5, yRatio: 0 },
  RM: { xRatio: 1, yRatio: 0.5 },
  BM: { xRatio: 0.5, yRatio: 1 },
  LM: { xRatio: 0, yRatio: 0.5 },
  // Center vertex
  C:  { xRatio: 0.5, yRatio: 0.5 }
};

/**
 * Triangle vertex definitions for each segment
 * Each segment is a triangle: [center, vertex1, vertex2] (clockwise order)
 */
const SEGMENT_TRIANGLES: Record<SegmentName, TriangleDefinition> = {
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
 */
const SEGMENT_INTERNAL_ADJACENCY: Record<InternalEdgeKey, [SegmentName, SegmentName]> = {
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
 */
const SEGMENT_CROSS_CELL_ADJACENCY: Record<SegmentName, CrossCellAdjacency> = {
  nw: { dx: 0, dy: -1, neighborSegment: 's' },
  n:  { dx: 0, dy: -1, neighborSegment: 'se' },
  ne: { dx: 1, dy: 0, neighborSegment: 'w' },
  e:  { dx: 1, dy: 0, neighborSegment: 'sw' },
  se: { dx: 0, dy: 1, neighborSegment: 'nw' },
  s:  { dx: 0, dy: 1, neighborSegment: 'n' },
  sw: { dx: -1, dy: 0, neighborSegment: 'ne' },
  w:  { dx: -1, dy: 0, neighborSegment: 'e' }
};

/**
 * External edge definitions for each segment
 * Maps segment to which cell boundary edge it touches
 */
const SEGMENT_EXTERNAL_EDGES: Record<SegmentName, ExternalEdge> = {
  nw: { edge: 'top', half: 'first' },
  n:  { edge: 'top', half: 'second' },
  ne: { edge: 'right', half: 'first' },
  e:  { edge: 'right', half: 'second' },
  se: { edge: 'bottom', half: 'second' },
  s:  { edge: 'bottom', half: 'first' },
  sw: { edge: 'left', half: 'second' },
  w:  { edge: 'left', half: 'first' }
};

// =============================================================================
// Diagonal Fill Tool Constants
// =============================================================================

/**
 * Segment fill mapping for diagonal fill tool
 * Maps corner to the 4 segments that create a diagonal border through that corner
 */
const CORNER_SEGMENT_FILL: Record<CornerName, [SegmentName, SegmentName, SegmentName, SegmentName]> = {
  'TL': ['n', 'nw', 'w', 'sw'],
  'TR': ['nw', 'n', 'ne', 'e'],
  'BR': ['ne', 'e', 'se', 's'],
  'BL': ['se', 's', 'sw', 'w']
};

/**
 * Neighbor checks for concave corner validation
 * For each corner, lists the two neighbor offsets that must be painted
 */
const CORNER_NEIGHBOR_CHECKS: Record<CornerName, [NeighborOffset, NeighborOffset]> = {
  'TL': [{ dx: 0, dy: -1 }, { dx: -1, dy: 0 }],
  'TR': [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }],
  'BR': [{ dx: 0, dy: 1 }, { dx: 1, dy: 0 }],
  'BL': [{ dx: 0, dy: 1 }, { dx: -1, dy: 0 }]
};

/**
 * Diagonal direction based on corner type
 */
const CORNER_DIAGONAL_DIRECTION: Record<CornerName, DiagonalDirection> = {
  'TL': 'TR-BL',
  'BR': 'TR-BL',
  'TR': 'TL-BR',
  'BL': 'TL-BR'
};

// =============================================================================
// Type Exports (for consuming modules)
// These are stripped at transpile time, so they must come before return
// =============================================================================

export type {
  // Theme types
  Theme,
  GridTheme,
  CellTheme,
  FogOfWarTheme,
  // Defaults types
  Defaults,
  Dimensions,
  HexBounds,
  CanvasSize,
  DistanceDefaults,
  HexOrientation,
  MapType,
  DiagonalRule,
  DistanceDisplayFormat,
  // Segment types
  SegmentName,
  VertexName,
  VertexRatio,
  TriangleDefinition,
  InternalEdgeKey,
  CrossCellAdjacency,
  CellEdge,
  EdgeHalf,
  ExternalEdge,
  // Diagonal fill types
  CornerName,
  NeighborOffset,
  DiagonalDirection
};

// =============================================================================
// Module Exports (Datacore pattern)
// =============================================================================

return {
  // Theme and defaults
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
  SEGMENT_EXTERNAL_EDGES,
  // Diagonal fill tool constants
  CORNER_SEGMENT_FILL,
  CORNER_NEIGHBOR_CHECKS,
  CORNER_DIAGONAL_DIRECTION
};