/**
 * Tile Type Definitions
 *
 * Geometry-agnostic tileset definitions, tile entries, and tile assignments.
 * Supports both hex and grid maps, folder-based and spritesheet-based tilesets.
 */

// ===========================================
// Tileset Source Types
// ===========================================

interface TilesetBase {
  id: string;
  name: string;
  tileWidth: number;
  tileHeight: number;
  tiles: TileEntry[];
  /** How tile images are scaled into the cell bounding box. @default 'fill'
   *  'fill' = independent X/Y scaling (stretches to cell shape, good for terrain).
   *  'contain' = uniform scaling preserving aspect ratio (good for stamps/objects). */
  fitMode?: 'fill' | 'contain';
  /** Ratio threshold below which a tile is auto-detected as a stamp.
   *  If naturalWidth/tileWidth < this OR naturalHeight/cellHeight < this,
   *  the tile uses stamp rendering instead of cell-filling. @default 0.5 */
  stampThreshold?: number;
  /** Minimum stamp scale as fraction of cell's smaller screen dimension.
   *  Prevents tiny stamps from becoming invisible at low zoom. @default 0.2 */
  minStampScale?: number;
  /** Auto-tile configuration (reserved for future use) */
  autoTileConfig?: {
    type: '4bit' | '8bit-blob' | 'dual-grid';
    bitmaskMap: Record<number, string>;
  };
  /** How tiles from this set are rasterized onto the canvas.
   *  'cell' (default) = each tile is drawn into its own cell bounding box
   *  (stamps, objects, hex artwork — the original behavior).
   *  'region' = the tile image is treated as a seamless texture anchored in
   *  world space and tiled across every painted cell at once (Dungeondraft-style
   *  terrain fill). Grid maps only; ignored on hex (falls back to 'cell'). */
  renderMode?: 'cell' | 'region';
  /** For renderMode 'region': how many grid cells one full texture span covers.
   *  Larger values make texture features bigger (fewer repeats per cell).
   *  @default 4 */
  worldRepeat?: number;
  /** Smart-edge feather for region fills, as a fraction of one cell's size.
   *  Softens only the region's outer boundary; 0 = hard edges. @default 0.25 */
  edgeFeather?: number;
  /** Authoring resolution in source pixels per grid cell, used to derive each
   *  tile's default multi-cell footprint (footprint = round(srcDim / pixelsPerCell)).
   *  This is the art's authoring scale — NOT the map's grid size and NOT a sampled
   *  sibling tile's pixel width. Dungeondraft authors at 256px = 1 cell. @default 256 */
  pixelsPerCell?: number;
}

/** Tiles sourced from individual image files in a vault folder */
export interface FolderTileset extends TilesetBase {
  source: 'folder';
  folderPath: string;
  /** Height of the hex-area within the tile image (px) */
  hexHeight: number;
  /** Pixels of overflow above the hex area (e.g. tree canopy) */
  overflowTop: number;
  /** Pixels of overflow below the hex area */
  overflowBottom: number;
}

/** Tiles sourced from a single spritesheet image */
export interface SheetTileset extends TilesetBase {
  source: 'sheet';
  /** Vault path to the spritesheet image */
  imagePath: string;
  columns: number;
  rows: number;
  /** Border around entire image in px. @default 0 */
  margin: number;
  /** Gap between tiles in px. @default 0 */
  spacing: number;
}

export type TilesetDef = FolderTileset | SheetTileset;

// ===========================================
// Tileset Overrides
// ===========================================

/** User-configurable overrides for a tileset's rendering defaults */
export interface TilesetOverrides {
  fitMode?: 'fill' | 'contain';
  stampThreshold?: number;
  minStampScale?: number;
  /** Terrain rendering mode: 'region' tiles a seamless texture across cells. */
  renderMode?: 'cell' | 'region';
  /** Cells per texture span when renderMode is 'region'. */
  worldRepeat?: number;
  /** Smart-edge feather for region fills, as a fraction of one cell (0 = hard
   *  edges). Softens only the region's outer boundary. @default 0.25 */
  edgeFeather?: number;
  /** Authoring resolution in source px per grid cell, overriding the 256 default.
   *  Set per-tileset to correct packs authored at a non-standard scale (e.g. 110). */
  pixelsPerCell?: number;
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

/** Valid rotation angles for tiles. Hex: 60° increments. Grid: 90° increments. */
export type TileRotation = 0 | 60 | 90 | 120 | 180 | 240 | 270 | 300;

// ===========================================
// Tile Layer Roles
// ===========================================

/** Fixed tile layer categories for grid maps */
export type TileLayerRole = 'ground' | 'structure' | 'props' | 'decoration';

/**
 * Derived "render form" of a tile — a composite classification over renderMode,
 * ddSourceType and autoTileConfig. NOT a stored field and NOT an overload of
 * `renderMode` ('cell'|'region' stay the only persisted render modes). It drives
 * which placement subtools the drawer ribbon lights for a selected tile.
 *   cell     — discrete per-cell stamp (the default)
 *   region   — seamless world-anchored terrain fill (renderMode === 'region')
 *   line     — wall/path/portal art meant to be drawn along edges/curves
 *   autotile — bitmask-driven auto-tiling (tileset has autoTileConfig)
 *   scatter  — freeform brush scatter (a brush mode; not derived per-tile)
 */
export type TileForm = 'cell' | 'region' | 'line' | 'autotile' | 'scatter';

/** Default layer stack for grid tile maps */
export const DEFAULT_TILE_LAYERS: ReadonlyArray<{
  name: string;
  role: TileLayerRole;
  order: number;
}> = [
  { name: 'Ground',     role: 'ground',     order: 0 },
  { name: 'Structure',  role: 'structure',  order: 1 },
  { name: 'Props',      role: 'props',      order: 2 },
  { name: 'Decoration', role: 'decoration', order: 3 },
];

// ===========================================
// Tile Assignment (unified, geometry-agnostic)
// ===========================================

/** Shared fields for all tile assignments */
interface TileAssignmentBase {
  /** Grid position: col/row for grid maps, q/r for hex maps */
  col: number;
  row: number;
  tilesetId: string;
  tileId: string;
  /** Rotation angle */
  rotation?: TileRotation;
  flipH?: boolean;
  /** Render placement within this MapLayer. @default 'fill' */
  placement?: 'fill' | 'overlay';
  /** Tile depth tier within the layer. Controls render order. @default 'ground' */
  depth?: TileLayerRole;
  /** Override tileset fitMode for this specific tile */
  fitMode?: 'fill' | 'contain';
  /** Multi-cell footprint width in cells, anchored at col/row. @default 1.
   *  Defaulted from the tile's detected metadata at placement time; editable
   *  per-placement. Absent/1 = single-cell. */
  spanW?: number;
  /** Multi-cell footprint height in cells, anchored at col/row. @default 1. */
  spanH?: number;
  /** Per-tile size multiplier. @default 1.0 */
  scale?: number;
  /** Opacity 0-1 for scatter brush placements. @default 1.0 */
  opacity?: number;
  /** World-space X coordinate (present when freeform is true) */
  worldX?: number;
  /** World-space Y coordinate (present when freeform is true) */
  worldY?: number;
}

/** A tile snapped to a grid/hex cell */
interface SnappedTile extends TileAssignmentBase {
  freeform?: false;
}

/** A tile placed at arbitrary world coordinates (scatter brush, stamps) */
interface FreeformTile extends TileAssignmentBase {
  freeform: true;
  worldX: number;
  worldY: number;
}

/** A tile placed on a map cell (grid-snapped or freeform at world coords) */
export type TileAssignment = SnappedTile | FreeformTile;

/** @deprecated Use TileAssignment instead */
export type HexTileAssignment = TileAssignment;

// ===========================================
// Tile Metadata (user tags, stars, etc.)
// ===========================================

/** Per-tile metadata overlay stored in windrose-tile-metadata.json */
export interface TileMetadataEntry {
  starred?: boolean;
  userTags?: string[];
  /** Tags preserved from Dungeondraft import — replaced on re-import */
  importTags?: string[];
  /** Predicted or user-assigned depth tier affinity */
  depthAffinity?: TileLayerRole;
  /** Original DD source directory type (objects, patterns, terrain, walls, etc.) */
  ddSourceType?: string;
  /** Auto-detected or user-set render mode for this tile. Per-tile classification
   *  that overrides the per-tileset default (a DD pack holds both terrain and props). */
  renderMode?: 'cell' | 'region';
  /** Auto-detected default footprint width in cells for multi-cell props. @default 1 */
  defaultSpanW?: number;
  /** Auto-detected default footprint height in cells for multi-cell props. @default 1 */
  defaultSpanH?: number;
  /** For region tiles: cells per texture span (relocated from per-tileset worldRepeat). */
  worldRepeat?: number;
  /** For region tiles: edge feather fraction (relocated from per-tileset edgeFeather). */
  edgeFeather?: number;
  /** Cached detection signal: opaque-pixel fraction 0-1 (from the eager scan pass). */
  alphaCoverage?: number;
  /** Cached detection signal: tight opaque-bounds width in source px. */
  opaqueW?: number;
  /** Cached detection signal: tight opaque-bounds height in source px. */
  opaqueH?: number;
  /** Cached detection signal: full natural image width in source px. Footprint is
   *  derived from this ÷ the tileset's pixelsPerCell, so it can be recomputed when
   *  that override changes without re-decoding the image. */
  srcW?: number;
  /** Cached detection signal: full natural image height in source px. */
  srcH?: number;
}

/** Metadata store keyed by vault path (stable across tileset rescans) */
export type TileMetadataStore = Record<string, TileMetadataEntry>;

// ===========================================
// Tile Render Context (geometry-agnostic)
// ===========================================

/** Narrow geometry shim for the tile renderer */
export interface TileRenderContext {
  cellToWorld: (col: number, row: number) => { worldX: number; worldY: number };
  worldToScreen: (worldX: number, worldY: number) => { screenX: number; screenY: number };
  cellWidth: number;
  cellHeight: number;
  mapType: 'grid' | 'hex';
}
