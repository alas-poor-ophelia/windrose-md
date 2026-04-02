/**
 * Hex Tile Type Definitions
 * Path: types/tiles/tile.types.ts
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
  /** Rotation in 60-degree increments: 0, 60, 120, 180, 240, 300 */
  rotation?: number;
  flipH?: boolean;
}
