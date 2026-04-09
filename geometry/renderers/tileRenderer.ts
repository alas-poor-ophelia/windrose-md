/**
 * tileRenderer.ts
 *
 * Renders hex tile images on the canvas with Baumgart-style z-sorting.
 * Tiles are sorted by offset row (back to front) so overflow from
 * background hexes is naturally occluded by foreground hex content.
 */

import type { HexTileAssignment, TilesetDef } from '#types/tiles/tile.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { axialToOffset } = await requireModuleByName("offsetCoordinates.ts") as {
  axialToOffset: (q: number, r: number, orientation: string) => { col: number; row: number };
};

// ===========================================
// Types
// ===========================================

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
}

// ===========================================
// Pure Helpers
// ===========================================

const SQRT3 = Math.sqrt(3);

/**
 * Sort tiles by offset row ascending (back → front), then col for stability.
 * Returns a new array; does not mutate the original.
 */
function sortTilesForRendering(
  tiles: HexTileAssignment[],
  orientation: string
): HexTileAssignment[] {
  return [...tiles].sort((a, b) => {
    const oa = axialToOffset(a.q, a.r, orientation);
    const ob = axialToOffset(b.q, b.r, orientation);
    if (oa.row !== ob.row) return oa.row - ob.row;
    return oa.col - ob.col;
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
  orientation: string
): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
  // On-screen hex dimensions (corner-to-corner)
  const hexScreenWidth = orientation === 'flat'
    ? 2 * hexSize * zoom
    : SQRT3 * hexSize * zoom;
  const hexScreenHeight = orientation === 'flat'
    ? SQRT3 * hexSize * zoom
    : 2 * hexSize * zoom;

  // Independent scale factors:
  // tileWidth maps to hex width, hexHeight maps to hex height
  const scaleX = hexScreenWidth / tileset.tileWidth;
  const scaleY = hexScreenHeight / tileset.hexHeight;
  const drawWidth = tileset.tileWidth * scaleX;
  const drawHeight = tileset.tileHeight * scaleY;

  // Position: center the hex-area portion on the hex center
  // The hex area starts at overflowTop pixels from the top of the tile image
  const hexAreaCenterInTile = tileset.overflowTop + tileset.hexHeight / 2;
  const drawX = screenX - drawWidth / 2;
  const drawY = screenY - hexAreaCenterInTile * scaleY;

  return { drawX, drawY, drawWidth, drawHeight };
}

// ===========================================
// Main Render Function
// ===========================================

/**
 * Render hex tile images onto the canvas with z-sorted overflow.
 */
function renderTiles(
  ctx: CanvasRenderingContext2D,
  tiles: HexTileAssignment[],
  tilesets: TilesetDef[],
  geometry: TileGeometry,
  viewState: TileViewState,
  options?: TileRenderOptions
): void {
  if (!tiles || tiles.length === 0) return;
  if (!tilesets || tilesets.length === 0) return;

  const getCachedImage = options?.getCachedImage;
  if (!getCachedImage) return;

  // Build tileset lookup
  const tilesetMap = new Map<string, TilesetDef>();
  for (const ts of tilesets) {
    tilesetMap.set(ts.id, ts);
  }

  // Build tile entry lookup (tilesetId:tileId → TileEntry)
  const entryMap = new Map<string, { entry: { vaultPath: string }; tileset: TilesetDef }>();
  for (const ts of tilesets) {
    for (const entry of ts.tiles) {
      entryMap.set(ts.id + ':' + entry.id, { entry, tileset: ts });
    }
  }

  // Two-pass rendering: base tiles first, overlay tiles second
  const baseTiles = tiles.filter((t: HexTileAssignment) => (t.layer || 'base') === 'base');
  const overlayTiles = tiles.filter((t: HexTileAssignment) => t.layer === 'overlay');
  const sortedBase = sortTilesForRendering(baseTiles, geometry.orientation);
  const sortedOverlay = sortTilesForRendering(overlayTiles, geometry.orientation);
  const sorted = [...sortedBase, ...sortedOverlay];

  const previousAlpha = ctx.globalAlpha;
  const opacity = options?.opacity ?? 1;
  const canvasW = options?.canvasWidth ?? 4000;
  const canvasH = options?.canvasHeight ?? 4000;

  for (const tile of sorted) {
    const lookup = entryMap.get(tile.tilesetId + ':' + tile.tileId);
    if (!lookup) continue;

    const { entry, tileset } = lookup;
    const img = getCachedImage(entry.vaultPath);
    if (!img) continue;

    // Convert to screen coordinates
    const world = geometry.hexToWorld(tile.q, tile.r);
    const screen = geometry.worldToScreen(
      world.worldX, world.worldY,
      viewState.x, viewState.y, viewState.zoom
    );

    // Viewport culling (generous margin for overflow)
    const maxOverflow = Math.max(tileset.overflowTop, tileset.overflowBottom, tileset.tileHeight);
    const margin = maxOverflow * viewState.zoom * 2;
    if (screen.screenX < -margin || screen.screenX > canvasW + margin ||
        screen.screenY < -margin || screen.screenY > canvasH + margin) {
      continue;
    }

    const rect = calculateTileDrawRect(
      screen.screenX, screen.screenY,
      tileset, geometry.hexSize, viewState.zoom, geometry.orientation
    );

    // Apply opacity
    if (opacity < 1) {
      ctx.globalAlpha = previousAlpha * opacity;
    }

    // Apply rotation/flip if needed
    const needsTransform = tile.rotation || tile.flipH;
    if (needsTransform) {
      ctx.save();
      ctx.translate(screen.screenX, screen.screenY);
      if (tile.rotation) {
        ctx.rotate((tile.rotation * Math.PI) / 180);
      }
      if (tile.flipH) {
        ctx.scale(-1, 1);
      }
      ctx.translate(-screen.screenX, -screen.screenY);
    }

    ctx.drawImage(img, rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);

    if (needsTransform) {
      ctx.restore();
    }

    // Restore opacity
    if (opacity < 1) {
      ctx.globalAlpha = previousAlpha;
    }
  }
}

return { renderTiles, sortTilesForRendering, calculateTileDrawRect };

