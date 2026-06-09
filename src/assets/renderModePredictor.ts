/**
 * renderModePredictor.ts
 *
 * Per-tile render-mode classification (sibling to depthPredictor).
 *
 * Decides whether a tile renders as a seamless terrain fill ('region') or a
 * discrete stamp/object ('cell'), from signals already available per tile:
 *   1. Dungeondraft source type (terrain/patterns -> region, objects -> cell)
 *   2. Alpha coverage from the eager scan (near-opaque -> region, sparse -> cell)
 *   3. Filename head noun (ground-tier nouns -> region, everything else -> cell)
 *
 * 'cell' is the system default, so callers persist only confident 'region'
 * predictions; a 'cell' result simply means "leave it on the default".
 */

import type { TileEntry, TileLayerRole, TileMetadataEntry, TileMetadataStore } from '#types/tiles/tile.types';
import { extractTokens, HEAD_NOUN_KEYWORDS } from './depthPredictor';

export type TileRenderMode = 'cell' | 'region';

/** DD source directory -> render intent. Seamless surfaces tile; objects stamp. */
const DD_SOURCE_TO_RENDERMODE: Record<string, TileRenderMode> = {
  terrain: 'region',
  patterns: 'region',
  tilesets: 'region',
  materials: 'region',
  objects: 'cell',
  walls: 'cell',
  portals: 'cell',
  paths: 'cell',
  lights: 'cell',
};

export interface RenderModePrediction {
  mode: TileRenderMode;
  confidence: number;
}

function predictRenderMode(
  tile: TileEntry,
  entry: TileMetadataEntry | undefined,
): RenderModePrediction {
  let region = 0;
  let cell = 0;

  // Signal 1: DD source type (weight 0.50) — strongest when present.
  const src = entry?.ddSourceType?.toLowerCase();
  if (src != null) {
    const mapped = DD_SOURCE_TO_RENDERMODE[src];
    if (mapped === 'region') region += 0.50;
    else if (mapped === 'cell') cell += 0.50;
  }

  // Signal 2: alpha coverage (weight up to 0.35) — seamless fills are near-opaque,
  // stamps are mostly transparent. The mid-band (0.65-0.75) is ambiguous.
  const cov = entry?.alphaCoverage;
  if (cov != null) {
    if (cov >= 0.92) region += 0.35;
    else if (cov >= 0.75) region += 0.15;
    else if (cov <= 0.45) cell += 0.35;
    else if (cov <= 0.65) cell += 0.15;
  }

  // Signal 3: filename head noun (0.25 head / 0.20 first) — ground tier => region.
  const tokens = extractTokens(tile.filename);
  if (tokens.length > 0) {
    const apply = (tier: TileLayerRole | undefined, weight: number): boolean => {
      if (tier == null) return false;
      if (tier === 'ground') region += weight;
      else cell += weight;
      return true;
    };
    const last = HEAD_NOUN_KEYWORDS[tokens[tokens.length - 1]];
    const first = tokens.length > 1 ? HEAD_NOUN_KEYWORDS[tokens[0]] : undefined;
    if (!apply(last, 0.25)) apply(first, 0.20);
  }

  if (region === 0 && cell === 0) return { mode: 'cell', confidence: 0 };
  return region > cell
    ? { mode: 'region', confidence: Math.min(region, 1) }
    : { mode: 'cell', confidence: Math.min(cell, 1) };
}

function predictRenderModes(
  tiles: TileEntry[],
  metadata: TileMetadataStore,
): Map<string, RenderModePrediction> {
  const results = new Map<string, RenderModePrediction>();
  for (const tile of tiles) {
    results.set(tile.vaultPath, predictRenderMode(tile, metadata[tile.vaultPath]));
  }
  return results;
}

export { predictRenderMode, predictRenderModes, DD_SOURCE_TO_RENDERMODE };
