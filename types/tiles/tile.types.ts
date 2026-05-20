/**
 * Hex Tile Type Definitions
 *
 * Tileset definitions, tile entries, and per-hex tile assignments
 * for image-based hex tile rendering with Baumgart-style overflow.
 */

// ===========================================
// Tileset Definition
// ===========================================

/** A collection of tile images imported from a vault folder */
export interface TilesetDef {
  id: string;
  name: string;
  folderPath: string;
  tileWidth: number;
  tileHeight: number;
  /** Height of the hex-area within the tile image (px) */
  hexHeight: number;
  /** Pixels of overflow above the hex area (e.g. tree canopy) */
  overflowTop: number;
  /** Pixels of overflow below the hex area */
  overflowBottom: number;
  /** How tile images are scaled into the hex bounding box. @default 'fill'
   *  'fill' = independent X/Y scaling (stretches to hex shape, good for terrain).
   *  'contain' = uniform scaling preserving aspect ratio (good for stamps/objects). */
  fitMode?: 'fill' | 'contain';
  /** Ratio threshold below which a tile is auto-detected as a stamp.
   *  If naturalWidth/tileWidth < this OR naturalHeight/hexHeight < this,
   *  the tile uses stamp rendering instead of hex-filling. @default 0.5 */
  stampThreshold?: number;
  /** Minimum stamp scale as fraction of hex's smaller screen dimension.
   *  Prevents tiny stamps from becoming invisible at low zoom. @default 0.2 */
  minStampScale?: number;
  tiles: TileEntry[];
}

// ===========================================
// Tileset Overrides
// ===========================================

/** User-configurable overrides for a tileset's rendering defaults */
export interface TilesetOverrides {
  fitMode?: 'fill' | 'contain';
  stampThreshold?: number;
  minStampScale?: number;
}

// ===========================================
// Tile Entry
// ===========================================

/** A single tile image within a tileset */
export interface TileEntry {
  id: string;
  filename: string;
  vaultPath: string;
  category?: string;
  tags?: string[];
}

// ===========================================
// Tile Rotation
// ===========================================

/** Valid rotation angles for hex tiles (60-degree increments) */
export type TileRotation = 0 | 60 | 120 | 180 | 240 | 300;

// ===========================================
// Hex Tile Assignment
// ===========================================

/** Shared fields for all hex tile assignments */
interface HexTileAssignmentBase {
  q: number;
  r: number;
  tilesetId: string;
  tileId: string;
  /** Rotation in 60-degree increments */
  rotation?: TileRotation;
  flipH?: boolean;
  /** Tile layer: 'base' (default) or 'overlay' (stamp atop base) */
  layer?: 'base' | 'overlay';
  /** Override tileset fitMode for this specific placement */
  fitMode?: 'fill' | 'contain';
  /** Per-tile size multiplier (default 1.0) */
  scale?: number;
  /** World-space X coordinate (present when freeform is true) */
  worldX?: number;
  /** World-space Y coordinate (present when freeform is true) */
  worldY?: number;
}

/** A tile snapped to a hex grid cell */
interface GridTileAssignment extends HexTileAssignmentBase {
  freeform?: false;
}

/** A tile placed at arbitrary world coordinates (not snapped to hex) */
interface FreeformTileAssignment extends HexTileAssignmentBase {
  freeform: true;
  /** World-space X coordinate */
  worldX: number;
  /** World-space Y coordinate */
  worldY: number;
}

/** A tile placed on a specific hex cell (axial coordinates), or freeform at world coords */
export type HexTileAssignment = GridTileAssignment | FreeformTileAssignment;
