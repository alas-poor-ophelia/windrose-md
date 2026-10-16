/**
 * MEM-04 / MEM-05: refcounted image pins and disposeImageCache.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TFile } from 'obsidian';

const mockVault = {
  getFiles: vi.fn(() => []),
  getAbstractFileByPath: vi.fn(),
  readBinary: vi.fn(),
};

const revokeObjectURL = vi.fn();
let urlCounter = 0;
vi.stubGlobal('URL', {
  ...globalThis.URL,
  createObjectURL: vi.fn(() => `blob:mock-${++urlCounter}`),
  revokeObjectURL,
});
(globalThis as unknown as { window?: unknown }).window ??= globalThis;

import {
  preloadImage,
  getCachedImage,
  pinImage,
  unpinImage,
  getPinCount,
  disposeImageCache,
  clearUnusedTileImages,
} from '../../../src/assets/imageOperations';

const app = { vault: mockVault } as unknown as Parameters<typeof preloadImage>[0];

async function seed(vaultPath: string): Promise<void> {
  mockVault.getAbstractFileByPath.mockReturnValue(Object.assign(new TFile(), { path: vaultPath }));
  mockVault.readBinary.mockResolvedValue(new ArrayBuffer(8));
  const mockImg = {
    naturalWidth: 10,
    naturalHeight: 10,
    src: '',
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };
  vi.stubGlobal('Image', vi.fn(function () { return mockImg; }));
  vi.stubGlobal('Blob', vi.fn(function () { return {}; }));
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
  const p = preloadImage(app, vaultPath);
  for (let i = 0; i < 50 && !mockImg.onload; i++) await Promise.resolve();
  mockImg.onload?.();
  await p;
}

describe('image pin refcounts (MEM-04)', () => {
  beforeEach(() => {
    disposeImageCache();
    revokeObjectURL.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts pins and unpins', () => {
    pinImage('bg.png');
    pinImage('bg.png');
    expect(getPinCount('bg.png')).toBe(2);
    unpinImage('bg.png');
    expect(getPinCount('bg.png')).toBe(1);
    unpinImage('bg.png');
    expect(getPinCount('bg.png')).toBe(0);
    unpinImage('bg.png'); // extra unpin is a no-op
    expect(getPinCount('bg.png')).toBe(0);
  });

  it('protects a pinned image from clearUnusedTileImages', async () => {
    await seed('bg.png');
    pinImage('bg.png');
    clearUnusedTileImages(new Set());
    expect(getCachedImage('bg.png')).not.toBeNull();
  });

  it('evicts after the grace period once the refcount reaches 0', async () => {
    await seed('bg.png');
    vi.useFakeTimers();
    pinImage('bg.png');
    unpinImage('bg.png');
    expect(getCachedImage('bg.png')).not.toBeNull();
    vi.advanceTimersByTime(5000);
    expect(getCachedImage('bg.png')).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalled();
  });

  it('keeps the image when it is re-pinned within the grace period (remount)', async () => {
    await seed('bg.png');
    vi.useFakeTimers();
    pinImage('bg.png');
    unpinImage('bg.png');
    pinImage('bg.png');
    vi.advanceTimersByTime(5000);
    expect(getCachedImage('bg.png')).not.toBeNull();
    expect(getPinCount('bg.png')).toBe(1);
  });
});

describe('disposeImageCache (MEM-05)', () => {
  it('revokes every blob URL and empties the cache and pins', async () => {
    disposeImageCache();
    await seed('a.png');
    await seed('b.png');
    pinImage('a.png');
    revokeObjectURL.mockClear();

    disposeImageCache();

    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(getCachedImage('a.png')).toBeNull();
    expect(getCachedImage('b.png')).toBeNull();
    expect(getPinCount('a.png')).toBe(0);
  });
});
