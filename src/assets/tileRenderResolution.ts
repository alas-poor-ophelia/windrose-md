/**
 * tileRenderResolution.ts
 *
 * Single source of truth for resolving a tile's effective render settings.
 *
 * Render flags are per-tile (stored in tileMetadata, keyed by vaultPath) rather
 * than per-tileset, because one imported tileset (a Dungeondraft pack or an
 * artist folder) commonly holds terrain, patterns, and props together.
 *
 * Resolution chain (highest priority first):
 *   1. per-placement override on the TileAssignment
 *   2. per-tile classification in TileMetadataEntry (auto-detected or user-set)
 *   3. per-tileset default  ← TEMPORARY fallback tier, removed once the legacy
 *      per-tileset render UI / tilesetOverrides plumbing is deleted
 *   4. global default constant
 */

import type { TileAssignment, TileMetadataEntry, TilesetDef } from '#types/tiles/tile.types';

/** Cells per full texture span for region (seamless terrain) fills. */
export const DEFAULT_WORLD_REPEAT = 4;
/** Region-fill edge feather as a fraction of one cell (0 = hard edges).
 *  Hard by default — the soft terrain brush covers organic edges, so painted
 *  region cells keep crisp corners unless the tile opts into edge blend. */
export const DEFAULT_EDGE_FEATHER = 0;
/** Feather stamped onto region placements painted with edge blend enabled. */
export const EDGE_BLEND_FEATHER = 0.25;
/** Ratio below which a tile auto-detects as a stamp (natW/tileWidth or natH/cellH). */
export const DEFAULT_STAMP_THRESHOLD = 0.5;
/** Minimum stamp scale as a fraction of the cell's smaller screen dimension.
 *  NOTE: this matches the historical renderer runtime fallback (0.35); the legacy
 *  type doc/UI showed 0.2. Canonical value lives here now. */
export const DEFAULT_MIN_STAMP_SCALE = 0.35;
/** Maximum auto/edited footprint span in cells (sanity cap). */
export const MAX_TILE_SPAN = 16;

export interface ResolvedTileRender {
  renderMode: 'cell' | 'region';
  /** Footprint width in cells (>= 1). */
  spanW: number;
  /** Footprint height in cells (>= 1). */
  spanH: number;
  /** undefined = let the renderer auto-detect fill vs contain. */
  fitMode: 'fill' | 'contain' | undefined;
  worldRepeat: number;
  edgeFeather: number;
  stampThreshold: number;
  minStampScale: number;
}

function clampSpan(n: number | undefined): number {
  if (n == null || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.round(n), MAX_TILE_SPAN);
}

/**
 * Resolve a tile's effective render settings from the override chain.
 *
 * @param assignment per-placement record (may carry spanW/spanH/fitMode overrides)
 * @param meta       per-tile metadata classification (may be undefined)
 * @param tileset    temporary per-tileset fallback (may be undefined)
 */
export function resolveTileRender(
  assignment: Pick<TileAssignment, 'spanW' | 'spanH' | 'fitMode' | 'feather'> | undefined,
  meta: TileMetadataEntry | undefined,
  tileset: TilesetDef | undefined,
): ResolvedTileRender {
  const renderMode = meta?.renderMode ?? tileset?.renderMode ?? 'cell';
  return {
    renderMode,
    // Region tiles pattern-fill per anchor cell; a footprint span on them never
    // affects rendering but poisons overlap-removal and erase hit-tests (each
    // placement would swallow its neighbours), so region forces a 1x1 span.
    spanW: renderMode === 'region' ? 1 : clampSpan(assignment?.spanW ?? meta?.defaultSpanW),
    spanH: renderMode === 'region' ? 1 : clampSpan(assignment?.spanH ?? meta?.defaultSpanH),
    fitMode: assignment?.fitMode ?? tileset?.fitMode,
    worldRepeat: meta?.worldRepeat ?? tileset?.worldRepeat ?? DEFAULT_WORLD_REPEAT,
    edgeFeather: assignment?.feather ?? meta?.edgeFeather ?? tileset?.edgeFeather ?? DEFAULT_EDGE_FEATHER,
    stampThreshold: tileset?.stampThreshold ?? DEFAULT_STAMP_THRESHOLD,
    minStampScale: tileset?.minStampScale ?? DEFAULT_MIN_STAMP_SCALE,
  };
}
