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
  tiles: TileEntry[];
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
// Hex Tile Assignment
// ===========================================

/** A tile placed on a specific hex cell (axial coordinates) */
export interface HexTileAssignment {
  q: number;
  r: number;
  tilesetId: string;
  tileId: string;
  /** Rotation in 60-degree increments */
  rotation?: 0 | 60 | 120 | 180 | 240 | 300;
  flipH?: boolean;
  /** Tile layer: 'base' (default) or 'overlay' (stamp atop base) */
  layer?: 'base' | 'overlay';
  /** Override tileset fitMode for this specific placement */
  fitMode?: 'fill' | 'contain';
  /** Freeform stamp: placed at world coordinates, not snapped to hex.
   *  When true, worldX and worldY must both be provided. */
  freeform?: boolean;
  /** World-space X coordinate (required when freeform is true) */
  worldX?: number;
  /** World-space Y coordinate (required when freeform is true) */
  worldY?: number;
}
