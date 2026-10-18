/**
 * MEM-21 / MEM-05: thumbnail queue isolates per-item failures and stops on clearAll.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Platform, TFile } from 'obsidian';

// Bundle thumbs: paths listed here get a pre-rendered thumb blob.
const thumbPaths = new Set<string>();
vi.mock('../../../src/assets/tileBytes', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../src/assets/tileBytes')>();
  return {
    ...real,
    readTileThumbBlob: vi.fn(async (_app: unknown, path: string) =>
      (thumbPaths.has(path) ? new Blob([`thumb:${path}`]) : null)),
  };
});

let throwOnGetImageData = false;
const fakeCtx = {
  clearRect: vi.fn(),
  drawImage: vi.fn(),
  getImageData: vi.fn(() => {
    if (throwOnGetImageData) throw new Error('tainted canvas');
    return { data: new Uint8ClampedArray(4 * 128 * 128).fill(255) };
  }),
};
function fakeCanvas(): unknown {
  return { width: 0, height: 0, getContext: () => fakeCtx, toDataURL: () => 'data:thumb' };
}
const g = globalThis as unknown as Record<string, unknown>;
g.window ??= globalThis;
g.createEl = () => fakeCanvas();

const closes: string[] = [];
let decodeDelayMs = 0;
const decoding = { now: 0, max: 0 };
vi.stubGlobal('createImageBitmap', vi.fn(async (blob: { tag: string }) => {
  decoding.now++;
  decoding.max = Math.max(decoding.max, decoding.now);
  if (decodeDelayMs > 0) await new Promise(r => setTimeout(r, decodeDelayMs));
  decoding.now--;
  return { width: 32, height: 32, close: () => { closes.push(blob.tag); } };
}));
vi.stubGlobal('Blob', vi.fn(function (this: unknown, parts: unknown[]) { return { tag: String(parts[0]) }; }));

const thumbs = await import('../../../src/assets/thumbnailCache');

const app = {
  vault: {
    getAbstractFileByPath: (path: string) => Object.assign(new TFile(), { path }),
    readBinary: async (file: { path: string }) => file.path,
  },
} as unknown as Parameters<typeof thumbs.request>[0];

async function drain(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise(r => setTimeout(r, 0));
}

async function drainUntil(paths: string[]): Promise<void> {
  for (let i = 0; i < 200 && paths.some(p => thumbs.getUrl(p) == null); i++) {
    await new Promise(r => setTimeout(r, 2));
  }
}

describe('thumbnailCache queue', () => {
  beforeEach(() => {
    thumbs.clearAll();
    closes.length = 0;
    throwOnGetImageData = false;
    thumbPaths.clear();
    decodeDelayMs = 0;
    decoding.now = 0;
    decoding.max = 0;
    fakeCtx.getImageData.mockClear();
  });
  afterEach(() => {
    Platform.isMobile = false;
  });

  it('decodes a bundle thumb instead of the full image and skips the alpha scan', async () => {
    thumbPaths.add('packs/b/t.png');
    thumbs.request(app, 'packs/b/t.png');
    await drain();
    expect(thumbs.getUrl('packs/b/t.png')).toBe('data:thumb');
    expect(closes).toEqual(['thumb:packs/b/t.png']);
    expect(fakeCtx.getImageData).not.toHaveBeenCalled();

    // A tile without a thumb still decodes the full image and scans it.
    thumbs.request(app, 'loose.png');
    await drain();
    expect(closes).toContain('loose.png');
    expect(fakeCtx.getImageData).toHaveBeenCalledTimes(1);
  });

  it('decodes at most 4 images at once on mobile and 20 on desktop', async () => {
    decodeDelayMs = 3;
    Platform.isMobile = true;
    const mobilePaths = Array.from({ length: 12 }, (_, i) => `m${i}.png`);
    thumbs.requestBatch(app, mobilePaths);
    await drainUntil(mobilePaths);
    expect(decoding.max).toBe(4);

    Platform.isMobile = false;
    decoding.max = 0;
    const desktopPaths = Array.from({ length: 30 }, (_, i) => `d${i}.png`);
    thumbs.requestBatch(app, desktopPaths);
    await drainUntil(desktopPaths);
    expect(decoding.max).toBe(20);
  });

  it('keeps processing after one render throws, closing every bitmap', async () => {
    throwOnGetImageData = true;
    thumbs.requestBatch(app, ['bad1.png', 'bad2.png']);
    await drain();
    // Failed items cache the empty sentinel (not stuck "loading") and close their bitmap
    expect(thumbs.getUrl('bad1.png')).toBe('');
    expect(thumbs.getUrl('bad2.png')).toBe('');
    expect(closes.sort()).toEqual(['bad1.png', 'bad2.png']);

    // The queue was not left stalled: a later request still renders
    throwOnGetImageData = false;
    thumbs.request(app, 'good.png');
    await drain();
    expect(thumbs.getUrl('good.png')).toBe('data:thumb');
  });

  it('drops an in-flight batch when cleared and accepts new work afterwards', async () => {
    thumbs.requestBatch(app, ['a.png', 'b.png']);
    thumbs.clearAll();
    await drain();
    expect(thumbs.getUrl('a.png')).toBeNull();
    expect(thumbs.getUrl('b.png')).toBeNull();
    expect(closes.sort()).toEqual(['a.png', 'b.png']);

    thumbs.request(app, 'c.png');
    await drain();
    expect(thumbs.getUrl('c.png')).toBe('data:thumb');
  });
});
