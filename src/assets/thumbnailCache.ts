import type { App } from 'obsidian';
import { TFile } from 'obsidian';

const THUMB_SIZE = 64;
const SCAN_SIZE = 128;
const BATCH_SIZE = 20;
const MAX_CACHE = 500;

const cache = new Map<string, string>();
const pending = new Set<string>();
const queue: Array<{ path: string; app: App }> = [];
let processing = false;
const subscribers = new Set<() => void>();

const scratchCanvas = document.createElement('canvas');
scratchCanvas.width = THUMB_SIZE;
scratchCanvas.height = THUMB_SIZE;

const scanCanvas = document.createElement('canvas');

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

async function processQueue(): Promise<void> {
  if (queue.length === 0) {
    processing = false;
    return;
  }
  processing = true;

  const batch = queue.splice(0, BATCH_SIZE);

  const loaded = await Promise.all(
    batch.map(async ({ path, app }) => {
      const img = await loadSourceImage(app, path);
      return { path, img };
    })
  );

  for (const { path, img } of loaded) {
    if (!img) {
      pending.delete(path);
      continue;
    }
    renderThumbnail(path, img);
    img.close();
  }

  notify();

  await new Promise<void>(resolve => { setTimeout(resolve, 0); });
  void processQueue();
}

async function loadSourceImage(app: App, vaultPath: string): Promise<ImageBitmap | null> {
  try {
    const file = app.vault.getAbstractFileByPath(vaultPath);
    if (!(file instanceof TFile)) return null;

    const binary = await app.vault.readBinary(file);
    const blob = new Blob([binary]);
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

function scanBounds(img: ImageBitmap): { x: number; y: number; w: number; h: number } {
  const natW = img.width;
  const natH = img.height;
  if (natW === 0 || natH === 0) return { x: 0, y: 0, w: natW, h: natH };

  const scale = Math.min(1, SCAN_SIZE / Math.max(natW, natH));
  const scanW = Math.ceil(natW * scale);
  const scanH = Math.ceil(natH * scale);

  scanCanvas.width = scanW;
  scanCanvas.height = scanH;
  const ctx = scanCanvas.getContext('2d');
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

function renderThumbnail(path: string, img: ImageBitmap): void {
  const bounds = scanBounds(img);
  const ctx = scratchCanvas.getContext('2d');
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

function clearThumbnail(path: string): void {
  cache.delete(path);
  pending.delete(path);
}

function clearAll(): void {
  cache.clear();
  pending.clear();
  queue.length = 0;
}

export { subscribe, getUrl, request, requestBatch, clearThumbnail, clearAll, THUMB_SIZE };
