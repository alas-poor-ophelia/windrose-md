/**
 * MEM-21 / MEM-05: thumbnail queue isolates per-item failures and stops on clearAll.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TFile } from 'obsidian';

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
vi.stubGlobal('createImageBitmap', vi.fn(async (blob: { tag: string }) => ({
  width: 32,
  height: 32,
  close: () => { closes.push(blob.tag); },
})));
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

describe('thumbnailCache queue', () => {
  beforeEach(() => {
    thumbs.clearAll();
    closes.length = 0;
    throwOnGetImageData = false;
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
