/**
 * tileRenderer.ts
 *
 * Renders tile images on the canvas with Baumgart-style z-sorting: tiles are
 * sorted back to front by WORLD y (then world x), so southern tiles paint over
 * northern ones and overflow art composites correctly.
 *
 * Composes three modules (re-exported below so importers are unchanged):
 *   computeTileDrawPlan - pure ordering / rect / orientation / entry lookup
 *   regionFillRenderer  - seamless terrain region fills (cells + strokes)
 *   canvasBlur          - blur probes, strategies and scratch canvases
 */

import type { TileAssignment, TilesetDef } from '#types/tiles/tile.types';

import { resolveTileRender } from '../../assets/tileRenderResolution';
import { effectiveSpan } from '../../assets/tileFootprint';
import { getRenderSource } from '../../assets/imageOperations';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { CAN_SET_PATTERN_TRANSFORM, shadowBlurImage, pyramidLevels, pyramidBlurImage, canvasBlurCapabilities, releaseTileScratchCanvases } from './canvasBlur';
import { renderRegionFills, computeRegionPatternTransform, regionFeatherPx } from './regionFillRenderer';
import type { RegionGroup } from './regionFillRenderer';
import { SQRT3, isFolderTileset, sortTilesForRendering, calculateTileDrawRect, tileOrientationAdaptation, makeEntryLookup } from './computeTileDrawPlan';
import type { TileGeometry, TileViewState, TileRenderOptions } from './computeTileDrawPlan';

// ===========================================
// Main Render Function
// ===========================================

/**
 * Render tile images onto the canvas with z-sorted overflow.
 */
function renderTiles(
  ctx: CanvasRenderingContext2D,
  tiles: TileAssignment[],
  tilesets: TilesetDef[],
  geometry: TileGeometry,
  viewState: TileViewState,
  options?: TileRenderOptions
): void {
  const terrainStrokes = options?.terrainStrokes ?? [];
  if ((tiles == null || tiles.length === 0) && terrainStrokes.length === 0) return;
  if (tilesets == null || tilesets.length === 0) return;
  tiles ??= [];

  const getCachedImage = options?.getCachedImage;
  if (!getCachedImage) return;

  const lookupEntry = makeEntryLookup(tilesets);

  // Per-tile metadata drives render-mode resolution (terrain → seamless region
  // fill vs. discrete cell stamp). Read fresh each frame from the global accessor
  // — same idiom as getTheme() — so it stays live without a cache-version dance.
  const metaStore = options?.tileMetadata ?? getTileMetadataForRender();

  // Pre-compute cell screen dimensions (constant for all tiles in this frame)
  const isGrid = geometry.orientation !== 'flat' && geometry.orientation !== 'pointy';
  const hexScreenWidth = isGrid
    ? geometry.hexSize * viewState.zoom
    : geometry.orientation === 'flat' ? 2 * geometry.hexSize * viewState.zoom : SQRT3 * geometry.hexSize * viewState.zoom;
  const hexScreenHeight = isGrid
    ? geometry.hexSize * viewState.zoom
    : geometry.orientation === 'flat' ? SQRT3 * geometry.hexSize * viewState.zoom : 2 * geometry.hexSize * viewState.zoom;

  // Partition by depth tier, then by placement within each tier
  const DEPTH_ORDER = ['ground', 'structure', 'props', 'decoration'] as const;
  const depthBuckets = new Map<string, { fill: TileAssignment[]; overlay: TileAssignment[]; freeform: TileAssignment[] }>();
  // Region (terrain) fills are grouped per (tileset:tile) within each depth tier.
  const regionByDepth = new Map<string, Map<string, RegionGroup>>();
  for (const d of DEPTH_ORDER) {
    depthBuckets.set(d, { fill: [], overlay: [], freeform: [] });
    regionByDepth.set(d, new Map());
  }

  // Region fills only apply to grid maps with a transformable pattern.
  const canRegion = CAN_SET_PATTERN_TRANSFORM && isGrid;
  const hiddenLayers = options?.hiddenLayers;
  for (const t of tiles) {
    const depth = t.depth ?? 'ground';
    if (hiddenLayers != null && hiddenLayers.size > 0 && hiddenLayers.has(depth)) continue;

    // Divert seamless terrain tiles into a grouped region-fill pass.
    if (canRegion && t.freeform !== true) {
      const lookup = lookupEntry(t.tilesetId, t.tileId);
      if (lookup != null) {
        // Resolution chain: per-placement → per-tile metadata → tileset fallback
        // (the tileset tier is temporary, removed once the legacy override UI dies).
        const resolved = resolveTileRender(t, metaStore[lookup.entry.vaultPath], lookup.tileset);
        if (resolved.renderMode === 'region') {
          // Feather participates in the group key: the mask blur is one pass
          // per group, so entries can only share a group when they share a
          // softness. Same feather → cells and strokes still merge seamlessly.
          const key = t.tilesetId + ':' + t.tileId + ':f' + resolved.edgeFeather;
          const groups = regionByDepth.get(depth) ?? regionByDepth.get('ground')!;
          let grp = groups.get(key);
          if (grp == null) {
            grp = {
              tileset: lookup.tileset,
              vaultPath: lookup.entry.vaultPath,
              cells: [],
              strokes: [],
              worldRepeat: resolved.worldRepeat,
              edgeFeather: resolved.edgeFeather,
            };
            groups.set(key, grp);
          }
          grp.cells.push(t);
          continue;
        }
      }
    }

    const bucket = depthBuckets.get(depth) ?? depthBuckets.get('ground')!;
    if (t.freeform === true) bucket.freeform.push(t);
    else if (t.placement === 'overlay') bucket.overlay.push(t);
    else bucket.fill.push(t);
  }

  // Terrain brush strokes join the region pass. They have no cell dependency,
  // so unlike cell region fills they are NOT gated on isGrid — world-anchored
  // pattern transforms work identically on hex (worldToScreen is affine).
  if (CAN_SET_PATTERN_TRANSFORM) {
    for (const s of terrainStrokes) {
      if (s.points.length < 2) continue;
      const depth = s.depth ?? 'ground';
      if (hiddenLayers != null && hiddenLayers.size > 0 && hiddenLayers.has(depth)) continue;
      const lookup = lookupEntry(s.tilesetId, s.tileId);
      if (lookup == null) continue;
      const resolved = resolveTileRender(undefined, metaStore[lookup.entry.vaultPath], lookup.tileset);
      // Per-stroke softness wins over the tile default; feather is part of
      // the group key (one mask blur per group), so a stroke matching a cell
      // fill's feather still merges into that group and blends seamlessly.
      const feather = s.feather ?? resolved.edgeFeather;
      const key = s.tilesetId + ':' + s.tileId + ':f' + feather;
      const groups = regionByDepth.get(depth) ?? regionByDepth.get('ground')!;
      let grp = groups.get(key);
      if (grp == null) {
        grp = {
          tileset: lookup.tileset,
          vaultPath: lookup.entry.vaultPath,
          cells: [],
          strokes: [],
          worldRepeat: resolved.worldRepeat,
          edgeFeather: feather,
        };
        groups.set(key, grp);
      }
      grp.strokes.push(s);
    }
  }

  const previousAlpha = ctx.globalAlpha;
  const opacity = options?.opacity ?? 1;
  const canvasW = options?.canvasWidth ?? 4000;
  const canvasH = options?.canvasHeight ?? 4000;

  const drawCellTile = (tile: TileAssignment): void => {
    const lookup = lookupEntry(tile.tilesetId, tile.tileId);
    if (!lookup) return;

    const { entry, tileset } = lookup;
    const img = getCachedImage(entry.vaultPath);
    if (!img || !img.naturalWidth) return;

    // Convert to screen coordinates
    // Freeform stamps use stored world coordinates directly
    const screen = tile.freeform === true && tile.worldX != null && tile.worldY != null
      ? geometry.worldToScreen(tile.worldX, tile.worldY, viewState.x, viewState.y, viewState.zoom)
      : (() => {
          const world = geometry.hexToWorld(tile.col, tile.row);
          return geometry.worldToScreen(world.worldX, world.worldY, viewState.x, viewState.y, viewState.zoom);
        })();

    // Multi-cell footprint (grid, snapped tiles only). The draw rect is sized to
    // the UNROTATED span and centered on the footprint center derived from the
    // EFFECTIVE (rotation-swapped) span; rotating that rect about the same center
    // then fills the swapped cell box exactly. 1x1 / hex / freeform tiles collapse
    // back to the anchor cell center, leaving existing behavior unchanged.
    const resolvedSpan = isGrid && tile.freeform !== true
      ? resolveTileRender(tile, metaStore[entry.vaultPath], tileset)
      : null;
    const spanW = resolvedSpan?.spanW ?? 1;
    const spanH = resolvedSpan?.spanH ?? 1;
    const eff = spanW > 1 || spanH > 1
      ? effectiveSpan({ spanW, spanH, rotation: tile.rotation })
      : { spanW, spanH };
    const centerX = screen.screenX + ((eff.spanW - 1) / 2) * hexScreenWidth;
    const centerY = screen.screenY + ((eff.spanH - 1) / 2) * hexScreenHeight;

    // Art-orientation adaptation (hex maps only): mismatched hexagonal art is
    // sized in its own orientation's frame — the transpose of the cell bbox —
    // then rotated ±30° about the cell center below.
    const adapt = tileOrientationAdaptation(geometry.orientation, tileset.artOrientation);
    const frameW = adapt.rotationDeg !== 0 ? hexScreenHeight : hexScreenWidth;
    const frameH = adapt.rotationDeg !== 0 ? hexScreenWidth : hexScreenHeight;
    const cellW = frameW * spanW;
    const cellH = frameH * spanH;

    const folder = isFolderTileset(tileset) ? tileset : null;
    const hexHeight = folder?.hexHeight ?? tileset.tileHeight;
    const maxOverflow = Math.max(folder?.overflowTop ?? 0, folder?.overflowBottom ?? 0, tileset.tileHeight);

    // Viewport culling (generous margin for overflow)
    const margin = maxOverflow * viewState.zoom * 2;
    if (screen.screenX < -margin || screen.screenX > canvasW + margin ||
        screen.screenY < -margin || screen.screenY > canvasH + margin) {
      return;
    }

    // Auto-detect fit mode for mixed tilesets: if the actual image dimensions
    // differ significantly from the tileset's declared dimensions, this tile
    // is a stamp/object (not cell-filling). Scale it relative to the tileset's
    // coordinate space so a 55px stamp in a 256px tileset stays small.
    let drawOverride: { drawX: number; drawY: number; drawWidth: number; drawHeight: number } | null = null;
    const natW = img.naturalWidth;
    const natH = img.naturalHeight;
    if (natW > 0 && natH > 0 && tile.fitMode == null) {
      const wRatio = natW / tileset.tileWidth;
      const hRatio = natH / hexHeight;
      const stampThreshold = tileset.stampThreshold ?? 0.5;
      if (wRatio < stampThreshold || hRatio < stampThreshold) {
        // Scale relative to the footprint using pre-computed screen dimensions
        const fillScaleX = cellW / tileset.tileWidth;
        const fillScaleY = cellH / hexHeight;
        // Use the smaller fill scale to preserve aspect ratio
        const baseScale = Math.min(fillScaleX, fillScaleY);
        // Ensure stamps are at least minStampScale of the footprint's smaller dimension
        const minHexDim = Math.min(cellW, cellH);
        const minStampDim = minHexDim * (tileset.minStampScale ?? 0.35);
        const naturalMinDim = Math.min(natW, natH) * baseScale;
        const effectiveScale = (naturalMinDim < minStampDim
          ? baseScale * (minStampDim / naturalMinDim)
          : baseScale) * (tile.scale ?? 1);
        const drawWidth = natW * effectiveScale;
        const drawHeight = natH * effectiveScale;
        drawOverride = {
          drawX: centerX - drawWidth / 2,
          drawY: centerY - drawHeight / 2,
          drawWidth,
          drawHeight,
        };
      }
    }

    let rect = drawOverride ?? calculateTileDrawRect(
      centerX, centerY,
      tileset, geometry.hexSize, viewState.zoom, adapt.sizeOrientation,
      tile.fitMode, spanW, spanH
    );

    // Apply per-tile scale to non-stamp tiles (stamps already applied above)
    if (drawOverride == null && tile.scale != null && tile.scale !== 1) {
      const s = tile.scale;
      const cx = rect.drawX + rect.drawWidth / 2;
      const cy = rect.drawY + rect.drawHeight / 2;
      const w = rect.drawWidth * s;
      const h = rect.drawHeight * s;
      rect = { drawX: cx - w / 2, drawY: cy - h / 2, drawWidth: w, drawHeight: h };
    }

    // Apply opacity (per-tile and layer-level)
    const tileOpacity = tile.opacity ?? 1;
    if (opacity < 1 || tileOpacity < 1) {
      ctx.globalAlpha = previousAlpha * opacity * tileOpacity;
    }

    // Apply rotation/flip if needed. Orientation adaptation composes with the
    // user rotation (both are about the cell center, so they commute).
    const totalRotation = (tile.rotation ?? 0) + adapt.rotationDeg;
    const needsTransform = totalRotation !== 0 || tile.flipH === true;
    if (needsTransform) {
      ctx.save();
      ctx.translate(centerX, centerY);
      if (totalRotation !== 0) {
        ctx.rotate((totalRotation * Math.PI) / 180);
      }
      if (tile.flipH === true) {
        ctx.scale(-1, 1);
      }
      ctx.translate(-centerX, -centerY);
    }

    // Draw the capped render-source for oversized images (built at load) so the
    // GPU never uploads a full-res 6.5MP+ texture during an interactive frame.
    ctx.drawImage(getRenderSource(img), rect.drawX, rect.drawY, rect.drawWidth, rect.drawHeight);

    if (needsTransform) {
      ctx.restore();
    }

    // Restore opacity
    if (opacity < 1 || tileOpacity < 1) {
      ctx.globalAlpha = previousAlpha;
    }
  };

  // Render in depth order. Within each tier: region fills (back) → cell fills
  // (sorted back→front) → overlays (sorted) → freeform stamps (front).
  for (const d of DEPTH_ORDER) {
    const regionGroups = regionByDepth.get(d);
    if (regionGroups != null && regionGroups.size > 0) {
      renderRegionFills(ctx, regionGroups, geometry, viewState, getCachedImage, previousAlpha * opacity, canvasW, canvasH);
    }
    const bucket = depthBuckets.get(d)!;
    if (bucket.fill.length > 0) {
      for (const tile of sortTilesForRendering(bucket.fill, geometry.orientation)) drawCellTile(tile);
    }
    if (bucket.overlay.length > 0) {
      for (const tile of sortTilesForRendering(bucket.overlay, geometry.orientation)) drawCellTile(tile);
    }
    if (bucket.freeform.length > 0) {
      for (const tile of bucket.freeform) drawCellTile(tile);
    }
  }
}

export { renderTiles, sortTilesForRendering, calculateTileDrawRect, computeRegionPatternTransform, regionFeatherPx, shadowBlurImage, pyramidLevels, pyramidBlurImage, canvasBlurCapabilities, tileOrientationAdaptation, releaseTileScratchCanvases };
