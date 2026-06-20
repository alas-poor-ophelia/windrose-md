/**
 * tileImageScan.ts
 *
 * Eager, decoupled detection scan for tile images.
 *
 * Produces the per-tile signals that drive render-mode and footprint
 * auto-detection: opaque-pixel fraction (terrain-vs-stamp) and the tight
 * opaque bounding box (prop footprint span). Runs once per tile and the
 * result is cached in tileMetadata, so it is NOT tied to thumbnail
 * generation (which is lazy, virtualized, and LRU-evicted — see the
 * detection plan: the thumbnail cache is not a detection substrate).
 *
 * The pixel analysis is a pure function (analyzeAlphaPixels) so it can be
 * unit-tested without a DOM canvas; the scanner wraps a downscaled canvas
 * read around it.
 */

import type { App } from 'obsidian';
import { TFile } from 'obsidian';

/** Downscale target for the scan canvas (longest edge). Keeps getImageData cheap. */
const SCAN_SIZE = 128;
/** Alpha value (0-255) above which a pixel counts as opaque. */
const ALPHA_OPAQUE_THRESHOLD = 10;

export interface TileImageSignals {
  /** Opaque-pixel fraction 0-1 (terrain fills approach 1, stamps are low). */
  alphaCoverage: number;
  /** Tight opaque-bounds width in source pixels (0 if fully transparent). */
  opaqueW: number;
  /** Tight opaque-bounds height in source pixels. */
  opaqueH: number;
  /** Full natural image dimensions in source pixels. */
  naturalW: number;
  naturalH: number;
}

export interface AlphaAnalysis {
  alphaCoverage: number;
  /** Tight opaque box in SCAN pixels, or null when fully transparent. */
  bounds: { x: number; y: number; w: number; h: number } | null;
}

/**
 * Pure pixel analysis: opaque fraction + tight opaque bounds (in scan pixels).
 * Operates on RGBA data laid out row-major (length = scanW * scanH * 4).
 */
export function analyzeAlphaPixels(
  data: Uint8ClampedArray | number[],
  scanW: number,
  scanH: number,
  alphaThreshold: number = ALPHA_OPAQUE_THRESHOLD,
): AlphaAnalysis {
  const total = scanW * scanH;
  if (total === 0) return { alphaCoverage: 0, bounds: null };

  let opaque = 0;
  let minX = scanW, minY = scanH, maxX = -1, maxY = -1;
  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      if (data[(y * scanW + x) * 4 + 3] > alphaThreshold) {
        opaque++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return { alphaCoverage: 0, bounds: null };
  return {
    alphaCoverage: opaque / total,
    bounds: { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 },
  };
}

// Reusable offscreen canvas — matches the thumbnailCache pattern (one canvas,
// resized per scan) to avoid per-call allocation.
let scanCanvas: HTMLCanvasElement | null = null;
function getScanCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (scanCanvas == null) scanCanvas = document.createElement('canvas');
  scanCanvas.width = w;
  scanCanvas.height = h;
  return scanCanvas.getContext('2d', { willReadFrequently: true });
}

async function loadBitmap(app: App, vaultPath: string): Promise<ImageBitmap | null> {
  try {
    const file = app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) return null;
    const binary = await app.vault.readBinary(file);
    return await createImageBitmap(new Blob([binary]));
  } catch {
    return null;
  }
}

/** Scan a single tile image into detection signals, or null if it can't be read. */
export async function scanTileImageSignals(
  app: App,
  vaultPath: string,
): Promise<TileImageSignals | null> {
  const bmp = await loadBitmap(app, vaultPath);
  if (bmp == null) return null;
  try {
    const natW = bmp.width;
    const natH = bmp.height;
    if (natW === 0 || natH === 0) return null;

    const scale = Math.min(1, SCAN_SIZE / Math.max(natW, natH));
    const scanW = Math.max(1, Math.ceil(natW * scale));
    const scanH = Math.max(1, Math.ceil(natH * scale));

    const ctx = getScanCtx(scanW, scanH);
    if (ctx == null) return null;
    ctx.clearRect(0, 0, scanW, scanH);
    ctx.drawImage(bmp, 0, 0, scanW, scanH);
    const { data } = ctx.getImageData(0, 0, scanW, scanH);

    const { alphaCoverage, bounds } = analyzeAlphaPixels(data, scanW, scanH);
    const invScale = 1 / scale;
    return {
      alphaCoverage,
      opaqueW: bounds == null ? 0 : Math.round(bounds.w * invScale),
      opaqueH: bounds == null ? 0 : Math.round(bounds.h * invScale),
      naturalW: natW,
      naturalH: natH,
    };
  } finally {
    bmp.close();
  }
}

export interface ScannedEntry {
  vaultPath: string;
  signals: TileImageSignals;
}

/**
 * Eager batch scan: scans every vaultPath that has not been scanned yet
 * (concurrency-limited), returning the collected signals. The caller persists
 * them (bulkSetDetectionSignals) — this mirrors the depth-prediction pattern.
 *
 * @param needsScan vault paths lacking cached signals (caller pre-filters)
 * @param opts.concurrency  max images decoded at once (default 4)
 * @param opts.signal       abort to stop mid-batch (e.g. component unmount)
 */
export async function runDetectionScan(
  app: App,
  needsScan: string[],
  opts?: { concurrency?: number; signal?: AbortSignal },
): Promise<ScannedEntry[]> {
  const concurrency = Math.max(1, opts?.concurrency ?? 4);
  const results: ScannedEntry[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < needsScan.length) {
      if (opts?.signal?.aborted === true) return;
      const vaultPath = needsScan[cursor++];
      const signals = await scanTileImageSignals(app, vaultPath);
      if (signals != null) results.push({ vaultPath, signals });
    }
  }

  const workers: Array<Promise<void>> = [];
  for (let i = 0; i < Math.min(concurrency, needsScan.length); i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}
