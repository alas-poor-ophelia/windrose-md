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
 * Pre-computes offsets to avoid redundant axialToOffset calls during sort.
 * Returns a new array; does not mutate the original.
 */
function sortTilesForRendering(
  tiles: HexTileAssignment[],
  orientation: string
): HexTileAssignment[] {
  const offsets = new Map<HexTileAssignment, { col: number; row: number }>();
  for (const t of tiles) {
    offsets.set(t, axialToOffset(t.q, t.r, orientation));
  }
  return [...tiles].sort((a, b) => {
    const oa = offsets.get(a)!;
    const ob = offsets.get(b)!;
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
  orientation: string,
  fitMode?: 'fill' | 'contain'
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

  const effectiveFit = fitMode || tileset.fitMode || 'fill';

  if (effectiveFit === 'contain') {
    // Uniform scaling: preserve aspect ratio, fit within hex bounding box
    const uniformScale = Math.min(scaleX, scaleY);
    const drawWidth = tileset.tileWidth * uniformScale;
    const drawHeight = tileset.tileHeight * uniformScale;

    // Center within the hex bounding box
    const drawX = screenX - drawWidth / 2;
    const hexAreaCenterInTile = tileset.overflowTop + tileset.hexHeight / 2;
    const drawY = screenY - hexAreaCenterInTile * uniformScale;

    return { drawX, drawY, drawWidth, drawHeight };
  }

  // 'fill' mode: independent X/Y scaling (original behavior)
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

  // Build tile entry lookup (tilesetId:tileId → TileEntry)
  const entryMap = new Map<string, { entry: { vaultPath: string }; tileset: TilesetDef }>();
  for (const ts of tilesets) {
    for (const entry of ts.tiles) {
      entryMap.set(ts.id + ':' + entry.id, { entry, tileset: ts });
    }
  }

  // Pre-compute hex screen dimensions (constant for all tiles in this frame)
  const hexScreenWidth = geometry.orientation === 'flat'
    ? 2 * geometry.hexSize * viewState.zoom
    : SQRT3 * geometry.hexSize * viewState.zoom;
  const hexScreenHeight = geometry.orientation === 'flat'
    ? SQRT3 * geometry.hexSize * viewState.zoom
    : 2 * geometry.hexSize * viewState.zoom;

  // Single-pass partition: base, overlay, freeform
  const baseTiles: HexTileAssignment[] = [];
  const overlayTiles: HexTileAssignment[] = [];
  const freeformTiles: HexTileAssignment[] = [];
  for (const t of tiles) {
    if (t.freeform) freeformTiles.push(t);
    else if (t.layer === 'overlay') overlayTiles.push(t);
    else baseTiles.push(t);
  }
  // Sort grid-aligned tiles back→front; freeform in insertion order
  const sortedBase = sortTilesForRendering(baseTiles, geometry.orientation);
  const sortedOverlay = sortTilesForRendering(overlayTiles, geometry.orientation);
  // Iterate sequentially instead of concatenating
  const sorted = [sortedBase, sortedOverlay, freeformTiles];

  const previousAlpha = ctx.globalAlpha;
  const opacity = options?.opacity ?? 1;
  const canvasW = options?.canvasWidth ?? 4000;
  const canvasH = options?.canvasHeight ?? 4000;

  for (const group of sorted) for (const tile of group) {
    const lookup = entryMap.get(tile.tilesetId + ':' + tile.tileId);
    if (!lookup) continue;

    const { entry, tileset } = lookup;
    const img = getCachedImage(entry.vaultPath);
    if (!img) continue;

    // Convert to screen coordinates
    // Freeform stamps use stored world coordinates directly
    const screen = tile.freeform && tile.worldX != null && tile.worldY != null
      ? geometry.worldToScreen(tile.worldX, tile.worldY, viewState.x, viewState.y, viewState.zoom)
      : (() => {
          const world = geometry.hexToWorld(tile.q, tile.r);
          return geometry.worldToScreen(world.worldX, world.worldY, viewState.x, viewState.y, viewState.zoom);
        })();

    // Viewport culling (generous margin for overflow)
    const maxOverflow = Math.max(tileset.overflowTop, tileset.overflowBottom, tileset.tileHeight);
    const margin = maxOverflow * viewState.zoom * 2;
    if (screen.screenX < -margin || screen.screenX > canvasW + margin ||
        screen.screenY < -margin || screen.screenY > canvasH + margin) {
      continue;
    }

    // Auto-detect fit mode for mixed tilesets: if the actual image dimensions
    // differ significantly from the tileset's declared dimensions, this tile
    // is a stamp/object (not hex-filling). Scale it relative to the tileset's
    // coordinate space so a 55px stamp in a 256px tileset stays small.
    let drawOverride: { drawX: number; drawY: number; drawWidth: number; drawHeight: number } | null = null;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (natW > 0 && natH > 0 && !tile.fitMode) {
      const wRatio = natW / tileset.tileWidth;
      const hRatio = natH / tileset.hexHeight;
      if (wRatio < 0.5 || hRatio < 0.5) {
        // Scale relative to the hex using pre-computed screen dimensions
        const fillScaleX = hexScreenWidth / tileset.tileWidth;
        const fillScaleY = hexScreenHeight / tileset.hexHeight;
        // Use the smaller fill scale to preserve aspect ratio
        const baseScale = Math.min(fillScaleX, fillScaleY);
        const drawWidth = natW * baseScale;
        const drawHeight = natH * baseScale;
        drawOverride = {
          drawX: screen.screenX - drawWidth / 2,
          drawY: screen.screenY - drawHeight / 2,
          drawWidth,
          drawHeight,
        };
      }
    }

    const rect = drawOverride || calculateTileDrawRect(
      screen.screenX, screen.screenY,
      tileset, geometry.hexSize, viewState.zoom, geometry.orientation,
      tile.fitMode
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

