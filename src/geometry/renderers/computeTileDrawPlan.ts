/**
 * computeTileDrawPlan.ts
 *
 * Pure planning for tile rendering: back-to-front ordering (by world y),
 * draw-rect and art-orientation math, and per-call tile entry resolution.
 * No canvas access. Split out of tileRenderer.ts.
 */

import type { TileAssignment, TilesetDef, FolderTileset, TileMetadataStore } from '#types/tiles/tile.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';

import { resolveTileEntryIndexed } from '../../assets/tilesetOperations';

interface TileGeometry {
  hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
  worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => { screenX: number; screenY: number };
  hexSize: number;
  orientation: string;
}

interface TileViewState {
  x: number;
  y: number;
  zoom: number;
}

interface TileRenderOptions {
  opacity?: number;
  getCachedImage?: (vaultPath: string) => HTMLImageElement | null;
  canvasWidth?: number;
  canvasHeight?: number;
  hiddenLayers?: Set<string>;
  /** Per-tile metadata store for render-mode resolution. Defaults to the global
   *  render accessor (matches the getTheme() idiom); injectable for tests. */
  tileMetadata?: TileMetadataStore;
  /** Terrain brush strokes for the layer — join the region-fill pass so strokes
   *  and cell fills of the same texture share one mask (and one feather). */
  terrainStrokes?: TerrainStroke[];
  /** Ladder depth (level >= 1): clip each snapped hex tile's art to its own
   *  home-rung hexagon, so a parent tile re-drawn under its fine cells reads as
   *  the parent's texture cut to the parent hex. Ignored on grid geometry and
   *  for freeform stamps. Absent/false = today's unclipped draw. */
  clipToHex?: boolean;
  /** Ladder depth (level >= 1), "smart" clip (kgc.26): root keys `${q},${r}`
   *  holding deep content on the active rungs (`deepRootCellKeys`). A snapped
   *  ROOT tile (homeLevel absent/0) with a neighbour in this set is clipped to
   *  the union of its own hexagon and its neighbours NOT in the set; a tile
   *  with no such neighbour draws unclipped. Ignored on grid, for freeform
   *  stamps and deep tiles, and when `clipToHex` is set (whole-hex wins). */
  deepRoots?: ReadonlySet<string>;
}


const SQRT3 = Math.sqrt(3);

function isFolderTileset(ts: TilesetDef): ts is FolderTileset {
  return !('source' in ts) || ts.source === 'folder';
}


/**
 * Sort tiles back → front by WORLD y ascending (then world x for stability),
 * so southern tiles paint over northern ones — 2.5D overlap art (skirts,
 * rising peaks) composites correctly against every neighbor.
 *
 * Offset rows are NOT a paint order on hex maps: staggered columns put
 * diagonal neighbors half a cell apart in world y yet in the SAME offset row,
 * and the old row-then-col tie-break painted the eastern tile over its
 * southwest neighbor (water over the stone in front of it).
 */
function sortTilesForRendering(
  tiles: TileAssignment[],
  orientation: string
): TileAssignment[] {
  const keys = new Map<TileAssignment, { x: number; y: number }>();
  for (const t of tiles) {
    keys.set(t, orientation === 'flat'
      ? { y: t.row + t.col / 2, x: t.col }
      : orientation === 'pointy'
        ? { y: t.row, x: t.col + t.row / 2 }
        : { y: t.row, x: t.col });
  }
  return [...tiles].sort((a, b) => {
    const ka = keys.get(a);
    const kb = keys.get(b);
    if (ka == null || kb == null) return 0;
    if (ka.y !== kb.y) return ka.y - kb.y;
    return ka.x - kb.x;
  });
}

/**
 * Calculate the draw rectangle for a tile on screen.
 * The tile's hex-area portion is centered on the hex's screen position;
 * overflow extends above/below.
 *
 * Tile images contain hex-shaped artwork in a rectangular bounding box.
 * The tile's tileWidth maps to the hex's width on screen, and the tile's
 * hexHeight maps to the hex's height on screen. Since hex aspect ratios
 * differ from the rectangular tile dimensions, independent X/Y scaling
 * is needed.
 */
function calculateTileDrawRect(
  screenX: number,
  screenY: number,
  tileset: TilesetDef,
  hexSize: number,
  zoom: number,
  orientation: string,
  fitMode?: 'fill' | 'contain',
  spanW = 1,
  spanH = 1
): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
  // On-screen cell dimensions (corner-to-corner for hex, edge-to-edge for grid).
  // A multi-cell footprint scales the target box by its UNROTATED span; the
  // caller centers the rect on the footprint center and applies any rotation.
  const isGrid = orientation !== 'flat' && orientation !== 'pointy';
  const hexScreenWidth = (isGrid
    ? hexSize * zoom
    : orientation === 'flat' ? 2 * hexSize * zoom : SQRT3 * hexSize * zoom) * spanW;
  const hexScreenHeight = (isGrid
    ? hexSize * zoom
    : orientation === 'flat' ? SQRT3 * hexSize * zoom : 2 * hexSize * zoom) * spanH;

  const folder = isFolderTileset(tileset) ? tileset : null;
  const hexHeight = folder?.hexHeight ?? tileset.tileHeight;
  const overflowTop = folder?.overflowTop ?? 0;
  // Manual per-tileset vertical nudge (world px, positive raises the art) —
  // the user's final word on seating when auto-detection is a pixel off the
  // art's visual center.
  const artLift = (tileset.artOffsetY ?? 0) * zoom;

  // Manual per-tileset art scale (1 = auto): grows the art about its face
  // center — the only global transform that closes seams BETWEEN neighbors
  // (a translation preserves inter-tile gaps). Multiplies the import-time
  // edge bleed so adjacent tiles' inked borders overlap.
  const artScale = tileset.artScale ?? 1;

  // Independent scale factors:
  // hexWidth (the measured art hexagon, when the art is padded inside a larger
  // image) or tileWidth maps to hex width, hexHeight maps to hex height
  const scaleX = hexScreenWidth / (tileset.hexWidth ?? tileset.tileWidth) * artScale;
  const scaleY = hexScreenHeight / hexHeight * artScale;

  const effectiveFit = fitMode ?? tileset.fitMode ?? 'fill';

  if (effectiveFit === 'contain') {
    // Uniform scaling: preserve aspect ratio, fit within hex bounding box
    const uniformScale = Math.min(scaleX, scaleY);
    const drawWidth = tileset.tileWidth * uniformScale;
    const drawHeight = tileset.tileHeight * uniformScale;

    // Center within the hex bounding box
    const drawX = screenX - drawWidth / 2;
    const hexAreaCenterInTile = overflowTop + hexHeight / 2;
    const drawY = screenY - hexAreaCenterInTile * uniformScale - artLift;

    return { drawX, drawY, drawWidth, drawHeight };
  }

  // 'fill' mode: independent X/Y scaling (original behavior)
  const drawWidth = tileset.tileWidth * scaleX;
  const drawHeight = tileset.tileHeight * scaleY;

  // Position: center the hex-area portion on the hex center
  // The hex area starts at overflowTop pixels from the top of the tile image
  const hexAreaCenterInTile = overflowTop + hexHeight / 2;
  const drawX = screenX - drawWidth / 2;
  const drawY = screenY - hexAreaCenterInTile * scaleY - artLift;

  return { drawX, drawY, drawWidth, drawHeight };
}

/**
 * Pure: how a hex tile's art orientation adapts to the cell orientation.
 * Hexagonal art can only match a hex cell of the same orientation — non-uniform
 * scaling never turns a pointy-top hexagon into a flat-top one. When they
 * differ, the tile is sized in the ART's frame (its own orientation's cell
 * bbox) and rotated ±30° about the cell center so it lands on the cell.
 * Grid maps and unknown art orientations adapt nothing.
 */
function tileOrientationAdaptation(
  mapOrientation: string,
  artOrientation: 'flat' | 'pointy' | undefined
): { sizeOrientation: string; rotationDeg: number } {
  const isHex = mapOrientation === 'flat' || mapOrientation === 'pointy';
  if (!isHex || artOrientation == null || artOrientation === mapOrientation) {
    return { sizeOrientation: mapOrientation, rotationDeg: 0 };
  }
  return { sizeOrientation: artOrientation, rotationDeg: artOrientation === 'pointy' ? 30 : -30 };
}

// ===========================================
// Entry Lookup
// ===========================================

type EntryLookup = (tilesetId: string, tileId: string) => { entry: { vaultPath: string }; tileset: TilesetDef } | undefined;

/**
 * Per-call (tilesetId, tileId) resolver. Entry resolution goes through the
 * shared per-tileset index in tilesetOperations (resolveTileEntry semantics,
 * WeakMap-keyed on each `tiles` array), and the tileset object is read fresh
 * from the array passed in, so render-affecting tileset fields (renderMode,
 * fitMode, artScale, ...) can never be served stale. Replaces the old
 * single-slot module cache that thrashed with two maps open (STRUCT-B-08).
 * Duplicate tileset ids: first tileset that resolves the tile wins, as before.
 */
function makeEntryLookup(tilesets: TilesetDef[]): EntryLookup {
  const byId = new Map<string, TilesetDef[]>();
  for (const ts of tilesets) {
    const list = byId.get(ts.id);
    if (list) list.push(ts); else byId.set(ts.id, [ts]);
  }
  return (tilesetId, tileId) => {
    const candidates = byId.get(tilesetId);
    if (!candidates) return undefined;
    for (const ts of candidates) {
      const entry = resolveTileEntryIndexed(ts, tileId);
      if (entry) return { entry, tileset: ts };
    }
    return undefined;
  };
}


export { SQRT3, isFolderTileset, sortTilesForRendering, calculateTileDrawRect, tileOrientationAdaptation, makeEntryLookup };
export type { TileGeometry, TileViewState, TileRenderOptions, EntryLookup };
