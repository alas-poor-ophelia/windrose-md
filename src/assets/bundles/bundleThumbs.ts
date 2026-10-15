/**
 * bundleThumbs.ts
 * Shared helpers for writing bundle entries: decode a tile once for its index
 * dims and a thumbnail, and vet a thumbnail a source pack already ships.
 *
 * Public API
 *   decodeTile(bytes, mime, { renderThumb? })  -> { dims, thumb } | null
 *   renderThumbPng(bmp)                         -> PNG bytes | null
 *   imageDimsFromHeader(bytes)                  -> { w, h } | null   (PNG / WebP header only)
 *   acceptShippedThumb(bytes)                   -> bytes | null      (PNG/WebP, longest side <= SHIPPED_THUMB_MAX)
 *
 * The rendered thumb is the opaque-pixel crop (computeAlphaBounds, as the
 * thumbnail cache does) fitted into THUMB_SIZE px, aspect preserved, never
 * upscaled. A thumb failure never fails the tile: callers bundle it without one.
 *
 * thumbnailCache is imported lazily: it allocates canvases at module load, and
 * the import pipeline (and its unit tests) load this module without a DOM.
 */

/** Largest side a shipped thumbnail may have and still be stored as the bundle thumb. */
export const SHIPPED_THUMB_MAX = 128;

/** Encode a canvas as PNG bytes; null when the browser yields no blob. */
function canvasPng(canvas: HTMLCanvasElement): Promise<Uint8Array | null> {
  return new Promise(resolve => {
    canvas.toBlob(blob => {
      if (blob == null) { resolve(null); return; }
      blob.arrayBuffer().then(buf => resolve(new Uint8Array(buf)), () => resolve(null));
    }, 'image/png');
  });
}

/** Render the bundle thumbnail from a decoded tile; null on any failure. */
export async function renderThumbPng(bmp: ImageBitmap): Promise<Uint8Array | null> {
  try {
    const { computeAlphaBounds, THUMB_SIZE } = await import('../thumbnailCache');
    const b = computeAlphaBounds(bmp);
    if (b.w <= 0 || b.h <= 0) return null;
    const scale = Math.min(1, THUMB_SIZE / Math.max(b.w, b.h));
    const canvas = createEl('canvas');
    canvas.width = Math.max(1, Math.round(b.w * scale));
    canvas.height = Math.max(1, Math.round(b.h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bmp, b.x, b.y, b.w, b.h, 0, 0, canvas.width, canvas.height);
    return await canvasPng(canvas);
  } catch {
    return null;
  }
}

/**
 * Decode once for the index dims and (unless renderThumb is false) the
 * thumbnail; null when the image will not decode. The bitmap is always closed.
 */
export async function decodeTile(
  bytes: ArrayBuffer | Uint8Array,
  mime: string,
  opts: { renderThumb?: boolean } = {},
): Promise<{ dims: { w: number; h: number }; thumb: Uint8Array | null } | null> {
  let bmp: ImageBitmap;
  try {
    const part = bytes instanceof Uint8Array ? bytes.slice() : bytes;
    bmp = await createImageBitmap(new Blob([part], { type: mime }));
  } catch {
    return null;
  }
  try {
    const thumb = opts.renderThumb === false ? null : await renderThumbPng(bmp);
    return { dims: { w: bmp.width, h: bmp.height }, thumb };
  } finally {
    bmp.close();
  }
}

function ascii(b: Uint8Array, at: number, s: string): boolean {
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
}

/** Pixel dims read from a PNG IHDR or a WebP (VP8 / VP8L / VP8X) header; null otherwise. */
export function imageDimsFromHeader(b: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b.byteLength >= 24 && b[0] === 0x89 && ascii(b, 1, 'PNG') && ascii(b, 12, 'IHDR')) {
    return { w: v.getUint32(16), h: v.getUint32(20) };
  }
  if (b.byteLength < 30 || !ascii(b, 0, 'RIFF') || !ascii(b, 8, 'WEBP')) return null;
  if (ascii(b, 12, 'VP8X')) {
    const u24 = (o: number): number => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16);
    return { w: u24(24) + 1, h: u24(27) + 1 };
  }
  if (ascii(b, 12, 'VP8L') && b[20] === 0x2f) {
    const bits = v.getUint32(21, true);
    return { w: (bits & 0x3fff) + 1, h: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (ascii(b, 12, 'VP8 ') && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
    return { w: v.getUint16(26, true) & 0x3fff, h: v.getUint16(28, true) & 0x3fff };
  }
  return null;
}

/** The shipped thumbnail bytes when they are a PNG/WebP no larger than SHIPPED_THUMB_MAX; else null. */
export function acceptShippedThumb(bytes: Uint8Array): Uint8Array | null {
  const dims = imageDimsFromHeader(bytes);
  if (dims == null || dims.w <= 0 || dims.h <= 0) return null;
  return Math.max(dims.w, dims.h) <= SHIPPED_THUMB_MAX ? bytes : null;
}
