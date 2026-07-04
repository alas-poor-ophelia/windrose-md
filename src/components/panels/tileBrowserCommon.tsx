// Shared tile-browser internals — content-cropped thumbnail rendering, vault
// image loading for the hover preview, width observation for the virtualized
// grids, and footprint prediction from cached detection signals. Used by
// TileAssetBrowser and its sibling panes (organize, tileset config).

import type { TileMetadataEntry } from '#types/tiles/tile.types';
import type { VNode } from 'preact';
import { TFile } from 'obsidian';
import type { App } from 'obsidian';

import { memo } from 'preact/compat';
import { THUMB_SIZE } from '../../assets/thumbnailCache';
import { predictSpan } from '../../assets/spanPredictor';

/** Pure ref-callback body: (re)binds a ResizeObserver to whichever node is
 *  currently mounted. Module-level on purpose — it must not close over
 *  component state, so the zero-dep useCallback wrappers can never go stale. */
function observeWidth(
  store: { current: HTMLDivElement | null },
  roStore: { current: ResizeObserver | null },
  setWidth: (w: number) => void,
  node: HTMLDivElement | null
): void {
  store.current = node;
  roStore.current?.disconnect();
  roStore.current = null;
  if (node == null) return;
  const ro = new ResizeObserver(entries => {
    const entry = entries[0];
    if (entry != null) setWidth(entry.contentRect.width);
  });
  ro.observe(node);
  roStore.current = ro;
}

/** Footprint from cached natural dims ÷ the tileset's pixels-per-cell ruler;
 *  null when the detection scan hasn't cached the dims yet. */
function predictSpanFromMeta(
  meta: TileMetadataEntry | undefined,
  pixelsPerCell: number,
): { spanW: number; spanH: number } | null {
  if (meta?.srcW == null || meta.srcH == null) return null;
  return predictSpan(meta.srcW, meta.srcH, pixelsPerCell);
}

// ===========================================
// Content-bounds detection for tile thumbnails
// ===========================================

const BOUNDS_CACHE_MAX = 256;
const boundsCache = new Map<string, { x: number; y: number; w: number; h: number }>();
const scratchCanvas = createEl('canvas');

function putBounds(key: string, bounds: { x: number; y: number; w: number; h: number }): void {
  if (boundsCache.size >= BOUNDS_CACHE_MAX) {
    // FIFO eviction (insertion order), not LRU — bounds are cheap to recompute
    const first = boundsCache.keys().next().value;
    if (first != null) boundsCache.delete(first);
  }
  boundsCache.set(key, bounds);
}

function getContentBounds(img: HTMLImageElement, cacheKey: string): { x: number; y: number; w: number; h: number } {
  const cached = boundsCache.get(cacheKey);
  if (cached) return cached;

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w === 0 || h === 0) return { x: 0, y: 0, w, h };

  scratchCanvas.width = w;
  scratchCanvas.height = h;
  // willReadFrequently: software-backed canvas so getImageData doesn't stall the GPU.
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  if (ctx == null) return { x: 0, y: 0, w, h };
  ctx.clearRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, w, h).data;

  let minX = w, minY = h, maxX = 0, maxY = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) {
    const bounds = { x: 0, y: 0, w, h };
    putBounds(cacheKey, bounds);
    return bounds;
  }

  const pad = 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);

  const bounds = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  putBounds(cacheKey, bounds);
  return bounds;
}

// ===========================================
// Tile thumbnail with content cropping
// ===========================================

const PREVIEW_SIZE = 192;

interface TileThumbnailProps {
  url: string | null;
}

function drawTileToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  size: number,
  cacheKey: string,
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, size, size);
  try {
    const bounds = getContentBounds(img, cacheKey);
    const scale = Math.min(size / bounds.w, size / bounds.h);
    const dw = bounds.w * scale;
    const dh = bounds.h * scale;
    ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h,
      (size - dw) / 2, (size - dh) / 2, dw, dh);
  } catch {
    const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  }
}

function loadVaultImage(
  app: App,
  vaultPath: string,
  getCachedImage: ((path: string) => HTMLImageElement | null) | undefined,
  onDraw: (img: HTMLImageElement) => void,
): (() => void) | undefined {
  const cached = getCachedImage?.(vaultPath);
  if (cached?.complete === true) {
    onDraw(cached);
    return undefined;
  }
  let blobUrl: string | null = null;
  const file = app.vault.getAbstractFileByPath(vaultPath);
  if (file instanceof TFile) {
    void app.vault.readBinary(file).then((binary: ArrayBuffer) => {
      const blob = new Blob([binary]);
      blobUrl = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        if (blobUrl != null) URL.revokeObjectURL(blobUrl);
        blobUrl = null;
        onDraw(img);
      };
      img.onerror = () => {
        if (blobUrl != null) URL.revokeObjectURL(blobUrl);
        blobUrl = null;
      };
      img.src = blobUrl;
    });
  }
  return () => {
    if (blobUrl != null) URL.revokeObjectURL(blobUrl);
  };
}

const TileThumbnail = memo(({ url }: TileThumbnailProps): VNode => {
  if (url != null && url !== '') {
    return <img src={url} className="windrose-tile-thumb-img" width={THUMB_SIZE} height={THUMB_SIZE} alt="" />;
  }
  // '' = terminal load failure (static placeholder); null = still loading (shimmer).
  const failed = url === '';
  return (
    <div
      className={failed ? 'windrose-tile-thumb-placeholder is-failed' : 'windrose-tile-thumb-placeholder'}
      style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
    />
  );
});

export { observeWidth, predictSpanFromMeta, drawTileToCanvas, loadVaultImage, TileThumbnail, PREVIEW_SIZE };
