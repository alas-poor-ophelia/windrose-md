import type { App } from 'obsidian';
import { Platform } from 'obsidian';
import { readTileBlob, readTileThumbBlob } from './tileBytes';

const THUMB_SIZE = 64;
const SCAN_SIZE = 128;
// Images decoded at once per batch. Each full-size decode is a full bitmap
// (a 795x691 tile is ~2.2 MB), so mobile keeps the batch small: 20 at once
// pushed an iPad over its memory limit on a 441-tile set.
const BATCH_SIZE_DESKTOP = 20;
const BATCH_SIZE_MOBILE = 4;

function batchSize(): number {
  return Platform.isMobile ? BATCH_SIZE_MOBILE : BATCH_SIZE_DESKTOP;
}
// Must exceed the largest tile-image working set. With compact (non-virtualized)
// browser modes requesting every filtered tile, a cache smaller than the set
// evicts entries the same pass created — every later re-render then re-reads,
// re-decodes, and re-scans thousands of images (vault has 2,271+ tile images).
const MAX_CACHE = 3000;

const cache = new Map<string, string>();
const pending = new Set<string>();
const queue: Array<{ path: string; app: App }> = [];
let processing = false;
/** Decodes currently awaiting loadSourceImage (perf recorder snapshot). */
let inFlightDecodes = 0;
/** Bumped by clearAll so a batch in flight across a clear is discarded (MEM-05). */
let queueGeneration = 0;
const subscribers = new Set<() => void>();

const scratchCanvas = createEl('canvas');
scratchCanvas.width = THUMB_SIZE;
scratchCanvas.height = THUMB_SIZE;

const scanCanvas = createEl('canvas');

/** Read-only snapshot for the performance recorder. */
function getThumbnailCacheStats(): { cached: number; queued: number; inFlightDecodes: number } {
  return { cached: cache.size, queued: queue.length, inFlightDecodes };
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  return () => { subscribers.delete(cb); };
}

function notify(): void {
  for (const cb of subscribers) cb();
}

function getUrl(path: string): string | null {
  const url = cache.get(path);
  if (url == null) return null;
  cache.delete(path);
  cache.set(path, url);
  return url;
}

function request(app: App, path: string): void {
  if (cache.has(path) || pending.has(path)) return;
  pending.add(path);
  queue.push({ path, app });
  if (!processing) void processQueue();
}

function requestBatch(app: App, paths: string[]): void {
  let added = false;
  for (const path of paths) {
    if (cache.has(path) || pending.has(path)) continue;
    pending.add(path);
    queue.push({ path, app });
    added = true;
  }
  if (added && !processing) void processQueue();
}

/**
 * Drain the queue in batches. Each item is isolated (MEM-21): a throw while
 * rendering one thumbnail still closes its bitmap, clears its pending flag and
 * caches an empty sentinel, and `processing` is always reset in `finally` so a
 * single failure can never stall the queue. clearAll() stops the loop: the
 * generation check drops the in-flight batch and leaves `processing` to the
 * next run.
 */
async function processQueue(): Promise<void> {
  const generation = queueGeneration;
  processing = true;
  try {
    while (queue.length > 0 && generation === queueGeneration) {
      const batch = queue.splice(0, batchSize());

      const loaded = await Promise.all(
        batch.map(async ({ path, app }) => {
          inFlightDecodes++;
          try {
            const src = await loadSourceImage(app, path);
            return { path, img: src?.img ?? null, cropped: src?.cropped ?? false };
          } finally {
            inFlightDecodes--;
          }
        })
      );

      if (generation !== queueGeneration) {
        for (const { img } of loaded) img?.close();
        return;
      }

      for (const { path, img, cropped } of loaded) {
        try {
          // A null img is a terminal failure (missing/unreadable file); the
          // sentinel below covers it.
          if (img) renderThumbnail(path, img, cropped);
        } catch (error) {
          console.warn(`[thumbnailCache] Failed to render thumbnail: ${path}`, error);
        } finally {
          img?.close();
          // Empty sentinel for anything that did not produce a URL. Leaving it
          // un-cached keeps the UI in "loading" forever — the shimmer
          // placeholder animates indefinitely, which is per-frame main-thread
          // paint work for every dead tile.
          if (!cache.has(path)) cache.set(path, '');
          pending.delete(path);
        }
      }

      notify();

      await new Promise<void>(resolve => { window.setTimeout(resolve, 0); });
    }
  } finally {
    if (generation === queueGeneration) processing = false;
  }
}

/**
 * Decode the thumbnail source. A bundled tile's pre-rendered thumb (already
 * alpha-cropped, <= 64 px) is preferred, so a bundled set never decodes its
 * full-size art just to draw a 64 px icon; anything else decodes the full image.
 */
async function loadSourceImage(app: App, vaultPath: string): Promise<{ img: ImageBitmap; cropped: boolean } | null> {
  try {
    const thumb = await readTileThumbBlob(app, vaultPath);
    if (thumb != null) {
      try {
        return { img: await createImageBitmap(thumb), cropped: true };
      } catch {
        // A thumb that will not decode: fall through to the full image.
      }
    }
    const blob = await readTileBlob(app, vaultPath);
    if (blob == null) return null;
    return { img: await createImageBitmap(blob), cropped: false };
  } catch {
    return null;
  }
}

/**
 * Bounding box of the non-transparent pixels (alpha > 10) of `img`, padded by
 * 2 px, in source pixels; the whole image when it is fully transparent or the
 * scan canvas is unavailable. Scans a <= 128 px downscale. The bundle writer
 * uses it so bundled thumbs are cropped exactly like cache-rendered ones.
 */
function scanBounds(img: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const natW = img.width;
  const natH = img.height;
  if (natW === 0 || natH === 0) return { x: 0, y: 0, w: natW, h: natH };

  const scale = Math.min(1, SCAN_SIZE / Math.max(natW, natH));
  const scanW = Math.ceil(natW * scale);
  const scanH = Math.ceil(natH * scale);

  scanCanvas.width = scanW;
  scanCanvas.height = scanH;
  // willReadFrequently keeps this canvas software-backed: getImageData becomes
  // a memcpy instead of a GPU pipeline flush + readback. Without it, each
  // thumbnail scan stalls the compositor the entire app shares.
  const ctx = scanCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { x: 0, y: 0, w: natW, h: natH };

  ctx.clearRect(0, 0, scanW, scanH);
  ctx.drawImage(img, 0, 0, scanW, scanH);
  const data = ctx.getImageData(0, 0, scanW, scanH).data;

  let minX = scanW, minY = scanH, maxX = 0, maxY = 0;
  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      if (data[(y * scanW + x) * 4 + 3] > 10) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX) return { x: 0, y: 0, w: natW, h: natH };

  const invScale = 1 / scale;
  const pad = 2;
  const bx = Math.max(0, Math.floor(minX * invScale) - pad);
  const by = Math.max(0, Math.floor(minY * invScale) - pad);
  const bx2 = Math.min(natW, Math.ceil((maxX + 1) * invScale) + pad);
  const by2 = Math.min(natH, Math.ceil((maxY + 1) * invScale) + pad);

  return { x: bx, y: by, w: bx2 - bx, h: by2 - by };
}

function renderThumbnail(path: string, img: ImageBitmap, cropped = false): void {
  const bounds = cropped ? { x: 0, y: 0, w: img.width, h: img.height } : scanBounds(img);
  // willReadFrequently: toDataURL below reads this canvas back every call.
  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    pending.delete(path);
    return;
  }

  ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
  const scale = Math.min(THUMB_SIZE / bounds.w, THUMB_SIZE / bounds.h);
  const dw = bounds.w * scale;
  const dh = bounds.h * scale;
  ctx.drawImage(img, bounds.x, bounds.y, bounds.w, bounds.h,
    (THUMB_SIZE - dw) / 2, (THUMB_SIZE - dh) / 2, dw, dh);

  cache.set(path, scratchCanvas.toDataURL());
  pending.delete(path);

  if (cache.size > MAX_CACHE) {
    const iter = cache.keys();
    let excess = cache.size - MAX_CACHE;
    while (excess-- > 0) {
      const key = iter.next().value;
      if (key != null) cache.delete(key);
    }
  }
}

function clearAll(): void {
  queueGeneration++;
  cache.clear();
  pending.clear();
  queue.length = 0;
  processing = false;
}

export { getThumbnailCacheStats, subscribe, getUrl, request, requestBatch, clearAll, scanBounds as computeAlphaBounds, THUMB_SIZE };
