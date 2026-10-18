/**
 * bundleCompact.ts
 * Compact storage: re-encode a large lossless tile as WebP (quality 0.9),
 * keep it only when it is clearly smaller AND decodes back close to the
 * source; otherwise the entry stays exact (the original bytes).
 *
 * Public API
 *   compactEncode(bytes, mime, opts)        -> { kind: 'exact', reason? } | { kind: 'compact', bytes, mime: 'image/webp' }
 *   estimateCompactRatio(samples, opts?)    -> stored bytes / source bytes over the samples (1 when empty)
 *   COMPACT_QUALITY, COMPACT_FLOOR_BYTES, COMPACT_MAX_RATIO, COMPACT_MIN_PSNR, COMPACT_MAX_ALPHA_DELTA
 *
 * Stays exact when: the source is below floorBytes; it is not PNG or WebP;
 * a PNG is 16-bit or carries an iCCP chunk; a WebP carries ICCP or ANIM, or
 * is already lossy (a 'VP8 ' chunk: re-encoding compounds loss for little
 * gain); the encoder yields no blob, a non-WebP blob, or one larger than
 * COMPACT_MAX_RATIO of the source; the result fails to decode, changes
 * dimensions, moves any sampled alpha by more than COMPACT_MAX_ALPHA_DELTA,
 * or has an RGB PSNR below COMPACT_MIN_PSNR over the sampled pixels whose
 * source alpha is at least VERIFY_MIN_ALPHA.
 *
 * Verification samples at most VERIFY_MAX_SAMPLES pixels: every
 * ceil(pixels / VERIFY_MAX_SAMPLES)-th pixel in row-major order.
 *
 * The pixel work goes through a CompactCodec (default: createImageBitmap ->
 * canvas -> toBlob/getImageData); tests inject their own via opts.codec.
 */

export const COMPACT_QUALITY = 0.9;
/** Entries whose source bytes are below this stay exact even in compact mode. */
export const COMPACT_FLOOR_BYTES = 65536;
/** A re-encode is kept only when its size is at most this share of the source. */
export const COMPACT_MAX_RATIO = 0.8;
export const COMPACT_MIN_PSNR = 36;
export const COMPACT_MAX_ALPHA_DELTA = 2;
const VERIFY_MIN_ALPHA = 8;
const VERIFY_MAX_SAMPLES = 1_000_000;

/** Straight (non-premultiplied) RGBA pixels. */
export interface CompactPixels {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface CompactCodec {
  /** Decode the source once: its pixels plus a WebP re-encode (blob null when the encoder yields none). Null when the source will not decode. */
  encode(bytes: Uint8Array, mime: string, quality: number): Promise<{ source: CompactPixels; blob: Blob | null } | null>;
  /** Decode bytes to pixels; null on failure. */
  decode(bytes: Uint8Array, mime: string): Promise<CompactPixels | null>;
}

export interface CompactOptions {
  quality: number;
  floorBytes: number;
  /** Test hook; defaults to the canvas codec. */
  codec?: CompactCodec;
}

export type CompactResult =
  | { kind: 'exact'; reason?: string }
  | { kind: 'compact'; bytes: Uint8Array; mime: 'image/webp' };

function ascii(b: Uint8Array, at: number, s: string): boolean {
  if (at + s.length > b.byteLength) return false;
  for (let i = 0; i < s.length; i++) if (b[at + i] !== s.charCodeAt(i)) return false;
  return true;
}

/** Why a PNG must stay exact (16-bit, iCCP), or null. Walks chunks up to the first IDAT. */
function pngExactReason(b: Uint8Array): string | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 8;
  while (at + 8 <= b.byteLength) {
    const len = v.getUint32(at);
    if (ascii(b, at + 4, 'IHDR') && at + 17 <= b.byteLength && b[at + 16] === 16) return '16-bit PNG';
    if (ascii(b, at + 4, 'iCCP')) return 'PNG carries a color profile';
    if (ascii(b, at + 4, 'IDAT') || ascii(b, at + 4, 'IEND')) return null;
    at += 12 + len;
  }
  return null;
}

/** Why a WebP must stay exact (ICC, animation, already lossy), or null. */
function webpExactReason(b: Uint8Array): string | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let at = 12;
  while (at + 8 <= b.byteLength) {
    const len = v.getUint32(at + 4, true);
    if (ascii(b, at, 'VP8X') && at + 9 <= b.byteLength) {
      const flags = b[at + 8];
      if ((flags & 0x20) !== 0) return 'WebP carries a color profile';
      if ((flags & 0x02) !== 0) return 'animated WebP';
    }
    if (ascii(b, at, 'ICCP')) return 'WebP carries a color profile';
    if (ascii(b, at, 'ANIM') || ascii(b, at, 'ANMF')) return 'animated WebP';
    if (ascii(b, at, 'VP8 ')) return 'already lossy WebP';
    at += 8 + len + (len & 1);
  }
  return null;
}

/** Why these source bytes are never re-encoded, or null when they may be. */
function sourceExactReason(bytes: Uint8Array, mime: string): string | null {
  const isPng = bytes.byteLength >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 'PNG');
  const isWebp = ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP');
  if (isPng) return pngExactReason(bytes);
  if (isWebp) return webpExactReason(bytes);
  return `unsupported source type (${mime})`;
}

/** Pixel comparison: null when within tolerance, else the reason. */
function verifyPixels(src: CompactPixels, out: CompactPixels): string | null {
  if (src.width !== out.width || src.height !== out.height) return 're-encode changed the dimensions';
  const total = src.width * src.height;
  if (src.data.length < total * 4 || out.data.length < total * 4) return 're-encode pixel data incomplete';
  const stride = Math.max(1, Math.ceil(total / VERIFY_MAX_SAMPLES));
  let sq = 0;
  let n = 0;
  for (let p = 0; p < total; p += stride) {
    const i = p * 4;
    const a = src.data[i + 3];
    if (Math.abs(a - out.data[i + 3]) > COMPACT_MAX_ALPHA_DELTA) return 'alpha changed beyond tolerance';
    if (a < VERIFY_MIN_ALPHA) continue;
    for (let c = 0; c < 3; c++) {
      const d = src.data[i + c] - out.data[i + c];
      sq += d * d;
    }
    n += 3;
  }
  if (n === 0 || sq === 0) return null;
  const psnr = 10 * Math.log10((255 * 255) / (sq / n));
  return psnr >= COMPACT_MIN_PSNR ? null : `color PSNR ${psnr.toFixed(1)} dB below ${COMPACT_MIN_PSNR}`;
}

function bitmapPixels(bmp: ImageBitmap): { canvas: HTMLCanvasElement; pixels: CompactPixels } | null {
  const canvas = createEl('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  return { canvas, pixels: { width: img.width, height: img.height, data: img.data } };
}

async function openBitmap(bytes: Uint8Array, mime: string): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(new Blob([bytes.slice()], { type: mime }), { colorSpaceConversion: 'none' });
  } catch {
    return null;
  }
}

/** The browser codec: createImageBitmap -> canvas -> toBlob / getImageData. */
const canvasCodec: CompactCodec = {
  async encode(bytes, mime, quality) {
    const bmp = await openBitmap(bytes, mime);
    if (bmp == null) return null;
    try {
      const drawn = bitmapPixels(bmp);
      if (drawn == null) return null;
      const blob = await new Promise<Blob | null>(resolve => drawn.canvas.toBlob(resolve, 'image/webp', quality));
      return { source: drawn.pixels, blob };
    } finally {
      bmp.close();
    }
  },
  async decode(bytes, mime) {
    const bmp = await openBitmap(bytes, mime);
    if (bmp == null) return null;
    try {
      return bitmapPixels(bmp)?.pixels ?? null;
    } finally {
      bmp.close();
    }
  },
};

/** Re-encode one tile for compact storage, or say why it stays exact. Never throws. */
export async function compactEncode(
  bytes: Uint8Array,
  mime: string,
  opts: CompactOptions,
): Promise<CompactResult> {
  if (bytes.byteLength < opts.floorBytes) return { kind: 'exact', reason: 'below the size floor' };
  const skip = sourceExactReason(bytes, mime);
  if (skip != null) return { kind: 'exact', reason: skip };
  const codec = opts.codec ?? canvasCodec;
  try {
    const enc = await codec.encode(bytes, mime, opts.quality);
    if (enc == null) return { kind: 'exact', reason: 'source failed to decode' };
    const { blob } = enc;
    if (blob == null) return { kind: 'exact', reason: 'encoder returned no image' };
    if (blob.type !== 'image/webp') return { kind: 'exact', reason: `encoder returned ${blob.type || 'an unknown type'}, not WebP` };
    if (blob.size > COMPACT_MAX_RATIO * bytes.byteLength) return { kind: 'exact', reason: 'too little size gain' };
    const out = new Uint8Array(await blob.arrayBuffer());
    const decoded = await codec.decode(out, 'image/webp');
    if (decoded == null) return { kind: 'exact', reason: 're-encode failed to decode' };
    const bad = verifyPixels(enc.source, decoded);
    if (bad != null) return { kind: 'exact', reason: bad };
    return { kind: 'compact', bytes: out, mime: 'image/webp' };
  } catch (e) {
    return { kind: 'exact', reason: `re-encode failed (${e instanceof Error ? e.message : String(e)})` };
  }
}

/** Aggregate stored/source byte ratio a compact import would reach over these samples (1 when empty). */
export async function estimateCompactRatio(
  samples: Array<{ bytes: Uint8Array; mime: string }>,
  opts: Partial<CompactOptions> = {},
): Promise<number> {
  let source = 0;
  let stored = 0;
  for (const s of samples) {
    const r = await compactEncode(s.bytes, s.mime, {
      quality: opts.quality ?? COMPACT_QUALITY,
      floorBytes: opts.floorBytes ?? COMPACT_FLOOR_BYTES,
      codec: opts.codec,
    });
    source += s.bytes.byteLength;
    stored += r.kind === 'compact' ? r.bytes.byteLength : s.bytes.byteLength;
  }
  return source > 0 ? stored / source : 1;
}
