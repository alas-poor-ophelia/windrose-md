/**
 * importDetectionPass.ts
 *
 * Shared import-time auto-detection orchestration: detection scan (alpha
 * coverage + opaque bounds + natural dims) followed by depth, render-mode,
 * and footprint predictions. Used by the Dungeondraft import and the
 * settings folder-add path so both kinds of tileset get the same signals.
 *
 * Every write is fill-missing-only — a field that already has a value is
 * never overwritten, so the pass is idempotent and safe to re-run.
 *
 * RCA guard (2026-06-09): render-mode predictions retroactively change how
 * already-placed tiles render (per-tile metadata outranks per-tileset in
 * resolveTileRender), so callers must set `applyRenderMode` only at a
 * genuine import moment — fresh files with no possible placements.
 */

import type { App } from 'obsidian';
import type { TileEntry, TileLayerRole, TileMetadataStore } from '#types/tiles/tile.types';
import {
  bulkSetDetectionSignals,
  bulkSetDepthAffinity,
  bulkSetRenderMode,
  bulkSetDefaultSpan,
} from '../persistence/tileMetadata';
import { predictDepthTier } from './depthPredictor';
import { predictRenderMode } from './renderModePredictor';
import { predictSpan, DEFAULT_PIXELS_PER_CELL } from './spanPredictor';
import { runDetectionScan } from './tileImageScan';

/** Minimum confidence before a depth-tier prediction persists. */
export const DEPTH_CONFIDENCE_THRESHOLD = 0.4;
/** Minimum confidence before a 'region' render-mode prediction persists. */
export const RENDER_MODE_CONFIDENCE_THRESHOLD = 0.5;

export interface ImportDetectionOptions {
  /**
   * Persist confident 'region' render-mode predictions. Only enable at a
   * genuine import moment (freshly extracted/added files) — see RCA guard.
   */
  applyRenderMode: boolean;
  /** Footprint divisor (authoring px per cell); defaults to the DD 256px spec. */
  pixelsPerCell?: number;
  /**
   * Paths to scan for signals but exclude from all predictions
   * (e.g. wall/path strips — line assets, not cell tiles).
   */
  skipPredictions?: ReadonlySet<string>;
  concurrency?: number;
  signal?: AbortSignal;
  /** Called between scan batches with (scanned, total). */
  onScanProgress?: (done: number, total: number) => void;
  /** Injectable scanner for tests. */
  scanner?: typeof runDetectionScan;
}

export interface ImportDetectionStats {
  /** Images actually decoded for signals this run. */
  scanned: number;
  /** Depth-tier predictions persisted. */
  depth: number;
  /** 'region' render-mode predictions persisted. */
  region: number;
  /** Multi-cell footprint predictions persisted. */
  spans: number;
}

/** Scan-batch size between progress callbacks. */
const SCAN_BATCH = 24;

/**
 * Run the import-time detection pass over `tiles`, returning the updated
 * metadata store (the caller persists it) and per-step counts.
 */
export async function runImportDetectionPass(
  app: App,
  tiles: TileEntry[],
  metadata: TileMetadataStore,
  opts: ImportDetectionOptions,
): Promise<{ metadata: TileMetadataStore; stats: ImportDetectionStats }> {
  const scanner = opts.scanner ?? runDetectionScan;
  const skip = opts.skipPredictions;
  const stats: ImportDetectionStats = { scanned: 0, depth: 0, region: 0, spans: 0 };

  // 1. Detection signals for tiles missing them (srcW check catches older
  //    scans that cached coverage/bounds but not natural dims).
  const needsScan = tiles
    .filter(t => {
      const e = metadata[t.vaultPath];
      return e?.alphaCoverage == null || e?.srcW == null;
    })
    .map(t => t.vaultPath);
  for (let i = 0; i < needsScan.length; i += SCAN_BATCH) {
    if (opts.signal?.aborted === true) return { metadata, stats };
    const batch = needsScan.slice(i, i + SCAN_BATCH);
    const scanned = await scanner(app, batch, {
      concurrency: opts.concurrency ?? 4,
      signal: opts.signal,
    });
    if (scanned.length > 0) {
      metadata = bulkSetDetectionSignals(metadata, scanned);
      stats.scanned += scanned.length;
    }
    opts.onScanProgress?.(Math.min(i + SCAN_BATCH, needsScan.length), needsScan.length);
  }

  const predictable = tiles.filter(t => skip?.has(t.vaultPath) !== true);

  // 2. Depth tier from filename/tags — browser organization only, always safe.
  const depthEntries: Array<{ vaultPath: string; depth: TileLayerRole }> = [];
  for (const tile of predictable) {
    if (metadata[tile.vaultPath]?.depthAffinity != null) continue;
    const { tier, confidence } = predictDepthTier(tile, metadata[tile.vaultPath]);
    if (confidence >= DEPTH_CONFIDENCE_THRESHOLD) {
      depthEntries.push({ vaultPath: tile.vaultPath, depth: tier });
    }
  }
  if (depthEntries.length > 0) {
    metadata = bulkSetDepthAffinity(metadata, depthEntries);
    stats.depth = depthEntries.length;
  }

  // 3. Render mode — runs after the scan so alpha coverage feeds the
  //    prediction. 'cell' is the default, so only 'region' persists.
  if (opts.applyRenderMode) {
    const renderModeEntries: Array<{ vaultPath: string; mode: 'region' }> = [];
    for (const tile of predictable) {
      if (metadata[tile.vaultPath]?.renderMode != null) continue;
      const { mode, confidence } = predictRenderMode(tile, metadata[tile.vaultPath]);
      if (mode === 'region' && confidence >= RENDER_MODE_CONFIDENCE_THRESHOLD) {
        renderModeEntries.push({ vaultPath: tile.vaultPath, mode: 'region' });
      }
    }
    if (renderModeEntries.length > 0) {
      metadata = bulkSetRenderMode(metadata, renderModeEntries);
      stats.region = renderModeEntries.length;
    }
  }

  // 4. Footprint from natural dims ÷ authoring resolution. Region tiles tile
  //    seamlessly and have no footprint; 1×1 stays implicit (only >1 persists).
  const ppc = opts.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;
  const spanEntries: Array<{ vaultPath: string; spanW: number; spanH: number }> = [];
  for (const tile of predictable) {
    const e = metadata[tile.vaultPath];
    if (e == null || e.renderMode === 'region') continue;
    if (e.defaultSpanW != null || e.defaultSpanH != null) continue;
    if (e.srcW == null || e.srcH == null) continue;
    const { spanW, spanH } = predictSpan(e.srcW, e.srcH, ppc);
    if (spanW > 1 || spanH > 1) spanEntries.push({ vaultPath: tile.vaultPath, spanW, spanH });
  }
  if (spanEntries.length > 0) {
    metadata = bulkSetDefaultSpan(metadata, spanEntries);
    stats.spans = spanEntries.length;
  }

  return { metadata, stats };
}
