/**
 * compactEncode: the skip rules (floor, 16-bit / iCCP PNG, ICC / animated /
 * lossy WebP), the encoder outcomes (no blob, wrong type, poor gain) and the
 * pixel verification (alpha delta, PSNR, strided sampling), through an
 * injected codec (the unit environment has no canvas).
 */
import { describe, it, expect } from 'vitest';
import {
  COMPACT_FLOOR_BYTES, compactEncode, estimateCompactRatio,
} from '../../../../src/assets/bundles/bundleCompact';
import type { CompactCodec, CompactPixels } from '../../../../src/assets/bundles/bundleCompact';

const ascii = (s: string): number[] => [...s].map(c => c.charCodeAt(0));
const u32be = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const u32le = (n: number): number[] => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];

function chunkPng(type: string, data: number[]): number[] {
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0];
}

/** A PNG of `size` bytes: IHDR (bit depth `depth`), optional iCCP, one IDAT filling the rest. */
function png(size: number, opts: { depth?: number; iccp?: boolean } = {}): Uint8Array {
  const ihdr = [...u32be(64), ...u32be(64), opts.depth ?? 8, 6, 0, 0, 0];
  const head = [0x89, ...ascii('PNG'), 0x0d, 0x0a, 0x1a, 0x0a, ...chunkPng('IHDR', ihdr),
    ...(opts.iccp === true ? chunkPng('iCCP', ascii('icc\0\0xx')) : [])];
  const idatLen = size - head.length - 12;
  const out = new Uint8Array(size);
  out.set(head, 0);
  out.set([...u32be(idatLen), ...ascii('IDAT')], head.length);
  return out;
}

/** A WebP of `size` bytes whose chunks are `pre` followed by one image chunk `fourcc` filling the rest. */
function webp(size: number, fourcc: 'VP8L' | 'VP8 ', pre: number[] = []): Uint8Array {
  const head = [...ascii('RIFF'), ...u32le(size - 8), ...ascii('WEBP'), ...pre];
  const len = size - head.length - 8;
  const out = new Uint8Array(size);
  out.set([...head, ...ascii(fourcc), ...u32le(len)], 0);
  return out;
}
const vp8x = (flags: number): number[] => [...ascii('VP8X'), ...u32le(10), flags, 0, 0, 0, 63, 0, 0, 63, 0, 0];

function pixels(w: number, h: number, fill: (i: number) => [number, number, number, number]): CompactPixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(fill(i), i * 4);
  return { width: w, height: h, data };
}
const solid = (w: number, h: number): CompactPixels => pixels(w, h, () => [120, 80, 40, 255]);

/** A codec whose encoder yields `blob` and whose decode returns `decoded` (default: the source). */
function codec(opts: {
  source?: CompactPixels;
  blob?: Blob | null;
  decoded?: CompactPixels | null;
} = {}): CompactCodec & { encodes: number } {
  const source = opts.source ?? solid(8, 8);
  const c = {
    encodes: 0,
    encode: () => {
      c.encodes++;
      const blob = opts.blob === undefined ? new Blob([new Uint8Array(1000)], { type: 'image/webp' }) : opts.blob;
      return Promise.resolve({ source, blob });
    },
    decode: () => Promise.resolve(opts.decoded === undefined ? source : opts.decoded),
  };
  return c;
}

const SIZE = 100_000;
const run = (bytes: Uint8Array, mime: string, c: CompactCodec) =>
  compactEncode(bytes, mime, { quality: 0.9, floorBytes: COMPACT_FLOOR_BYTES, codec: c });

describe('compactEncode skip rules', () => {
  it('keeps a source below the 64 KB floor exact without encoding', async () => {
    const c = codec();
    const r = await run(png(COMPACT_FLOOR_BYTES - 1), 'image/png', c);
    expect(r.kind).toBe('exact');
    expect(c.encodes).toBe(0);
    expect((await run(png(COMPACT_FLOOR_BYTES), 'image/png', c)).kind).toBe('compact');
  });

  it('keeps 16-bit and iCCP PNGs exact', async () => {
    const c = codec();
    expect(await run(png(SIZE, { depth: 16 }), 'image/png', c)).toEqual({ kind: 'exact', reason: '16-bit PNG' });
    expect((await run(png(SIZE, { iccp: true }), 'image/png', c)).kind).toBe('exact');
    expect(c.encodes).toBe(0);
  });

  it('keeps ICC, animated and already lossy WebPs exact', async () => {
    const c = codec();
    expect((await run(webp(SIZE, 'VP8L', vp8x(0x20)), 'image/webp', c)).kind).toBe('exact');
    expect((await run(webp(SIZE, 'VP8L', [...vp8x(0), ...ascii('ICCP'), ...u32le(2), 0, 0]), 'image/webp', c)).kind).toBe('exact');
    expect((await run(webp(SIZE, 'VP8L', [...vp8x(0), ...ascii('ANIM'), ...u32le(6), 0, 0, 0, 0, 0, 0]), 'image/webp', c)).kind).toBe('exact');
    expect(await run(webp(SIZE, 'VP8 '), 'image/webp', c)).toEqual({ kind: 'exact', reason: 'already lossy WebP' });
    expect(c.encodes).toBe(0);
    expect((await run(webp(SIZE, 'VP8L'), 'image/webp', c)).kind).toBe('compact');
  });

  it('keeps sources that are neither PNG nor WebP exact', async () => {
    const jpeg = new Uint8Array(SIZE);
    jpeg.set([0xff, 0xd8, 0xff]);
    expect((await run(jpeg, 'image/jpeg', codec())).kind).toBe('exact');
  });
});

describe('compactEncode encoder outcomes', () => {
  it('re-encodes a large lossless PNG as WebP', async () => {
    const r = await run(png(SIZE), 'image/png', codec());
    expect(r.kind).toBe('compact');
    if (r.kind === 'compact') {
      expect(r.mime).toBe('image/webp');
      expect(r.bytes.byteLength).toBe(1000);
    }
  });

  it('stays exact when toBlob yields null or a PNG', async () => {
    expect((await run(png(SIZE), 'image/png', codec({ blob: null }))).kind).toBe('exact');
    const pngBlob = new Blob([new Uint8Array(1000)], { type: 'image/png' });
    expect((await run(png(SIZE), 'image/png', codec({ blob: pngBlob }))).kind).toBe('exact');
  });

  it('stays exact when the gain is too small (> 0.8 of the source)', async () => {
    const big = new Blob([new Uint8Array(SIZE * 0.8 + 1)], { type: 'image/webp' });
    expect(await run(png(SIZE), 'image/png', codec({ blob: big }))).toEqual({ kind: 'exact', reason: 'too little size gain' });
    const ok = new Blob([new Uint8Array(SIZE * 0.8)], { type: 'image/webp' });
    expect((await run(png(SIZE), 'image/png', codec({ blob: ok }))).kind).toBe('compact');
  });
});

describe('compactEncode verification', () => {
  it('rejects a re-encode whose alpha moved by more than 2', async () => {
    const decoded = pixels(8, 8, i => (i === 5 ? [120, 80, 40, 252] : [120, 80, 40, 255]));
    const r = await run(png(SIZE), 'image/png', codec({ decoded }));
    expect(r).toEqual({ kind: 'exact', reason: 'alpha changed beyond tolerance' });
    const within = pixels(8, 8, i => (i === 5 ? [120, 80, 40, 253] : [120, 80, 40, 255]));
    expect((await run(png(SIZE), 'image/png', codec({ decoded: within }))).kind).toBe('compact');
  });

  it('rejects a re-encode below 36 dB PSNR, ignoring color under alpha 8', async () => {
    const noisy = pixels(8, 8, i => (i % 2 === 0 ? [140, 60, 40, 255] : [120, 80, 40, 255]));
    const r = await run(png(SIZE), 'image/png', codec({ decoded: noisy }));
    expect(r.kind).toBe('exact');
    expect(r.kind === 'exact' ? r.reason : '').toMatch(/PSNR/);

    const source = pixels(8, 8, i => (i % 2 === 0 ? [0, 0, 0, 4] : [120, 80, 40, 255]));
    const decoded = pixels(8, 8, i => (i % 2 === 0 ? [255, 255, 255, 4] : [120, 80, 40, 255]));
    expect((await run(png(SIZE), 'image/png', codec({ source, decoded }))).kind).toBe('compact');
  });

  it('rejects a decode failure or a dimension change', async () => {
    expect((await run(png(SIZE), 'image/png', codec({ decoded: null }))).kind).toBe('exact');
    expect((await run(png(SIZE), 'image/png', codec({ decoded: solid(8, 7) }))).kind).toBe('exact');
  });

  it('samples at most ~1M pixels with a stride on big images', async () => {
    // 2000 x 1000 = 2M pixels -> stride 2: odd pixels are never inspected.
    const source = solid(2000, 1000);
    const oddBad = { ...source, data: source.data.slice() };
    oddBad.data[1 * 4 + 3] = 0;
    expect((await run(png(SIZE), 'image/png', codec({ source, decoded: oddBad }))).kind).toBe('compact');
    const evenBad = { ...source, data: source.data.slice() };
    evenBad.data[2 * 4 + 3] = 0;
    expect((await run(png(SIZE), 'image/png', codec({ source, decoded: evenBad }))).kind).toBe('exact');
  });
});

describe('estimateCompactRatio', () => {
  it('aggregates stored bytes over source bytes, small samples counted exact', async () => {
    const samples = [
      { bytes: png(SIZE), mime: 'image/png' },
      { bytes: png(1000), mime: 'image/png' },
    ];
    const ratio = await estimateCompactRatio(samples, { codec: codec() });
    expect(ratio).toBeCloseTo((1000 + 1000) / (SIZE + 1000), 6);
    expect(await estimateCompactRatio([])).toBe(1);
  });
});
