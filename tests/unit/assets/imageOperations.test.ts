/**
 * Unit tests for imageOperations.ts
 *
 * Tests cover:
 * - getDisplayNameFromPath (pure function)
 * - calculateGridFromImage (pure function)
 * - GRID_DENSITY_PRESETS (constant)
 * - getCachedImage / clearCachedImage / clearUnusedTileImages (cache operations)
 *
 * Cache tests use preloadImage with mocked app.vault and DOM APIs to seed
 * the internal imageCache, then verify behavior through the public interface.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TFile } from 'obsidian';

// We need to set up globals BEFORE importing the module, since it runs
// at import time and may reference `app` or DOM APIs.

// Minimal mock for app.vault used by preloadImage
const mockVault = {
  getFiles: vi.fn(() => []),
  getAbstractFileByPath: vi.fn(),
  readBinary: vi.fn(),
};

// Stub the global `app` object that Datacore modules expect
vi.stubGlobal('app', { vault: mockVault });

// Stub URL.createObjectURL / revokeObjectURL
vi.stubGlobal('URL', {
  ...globalThis.URL,
  createObjectURL: vi.fn(() => 'blob:mock-url'),
  revokeObjectURL: vi.fn(),
});

import {
  getDisplayNameFromPath,
  calculateGridFromImage,
  getCachedImage,
  clearCachedImage,
  clearUnusedTileImages,
  preloadImage,
  GRID_DENSITY_PRESETS,
  MAX_CACHE_SIZE,
  setMaxCacheSize,
} from '../../../src/assets/imageOperations';

/**
 * Helper: seed the image cache by calling preloadImage with mocked vault/DOM.
 * Returns the mock HTMLImageElement that was cached.
 */
async function seedCache(vaultPath: string, width = 100, height = 100): Promise<void> {
  const mockFile = Object.assign(new TFile(), { path: vaultPath });
  const mockBinary = new ArrayBuffer(8);

  mockVault.getAbstractFileByPath.mockReturnValue(mockFile);
  mockVault.readBinary.mockResolvedValue(mockBinary);

  // Mock the Image constructor to simulate successful loading
  const mockImg = {
    naturalWidth: width,
    naturalHeight: height,
    src: '',
    onload: null as (() => void) | null,
    onerror: null as (() => void) | null,
  };

  vi.stubGlobal('Image', vi.fn(() => mockImg));

  // Mock Blob constructor
  vi.stubGlobal('Blob', vi.fn(() => ({})));

  const loadPromise = preloadImage((globalThis as any).app, vaultPath);

  // Trigger the onload callback (preloadImage sets img.src which triggers load)
  // We need to wait a tick for the promise setup, then fire onload
  await vi.waitFor(() => {
    if (mockImg.onload) {
      mockImg.onload();
      return true;
    }
    throw new Error('onload not set yet');
  }, { timeout: 1000 });

  await loadPromise;
}

describe('imageOperations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============================================
  // getDisplayNameFromPath — pure function
  // ============================================
  describe('getDisplayNameFromPath', () => {
    it('extracts filename from a vault path', () => {
      expect(getDisplayNameFromPath('Folder/subfolder/image.png')).toBe('image.png');
    });

    it('handles paths with no folder', () => {
      expect(getDisplayNameFromPath('image.png')).toBe('image.png');
    });

    it('handles deeply nested paths', () => {
      expect(getDisplayNameFromPath('a/b/c/d/photo.jpg')).toBe('photo.jpg');
    });

    it('returns empty string for empty input', () => {
      expect(getDisplayNameFromPath('')).toBe('');
    });

    it('returns empty string for falsy input', () => {
      // The function checks `if (!fullPath) return ""`
      expect(getDisplayNameFromPath(undefined as unknown as string)).toBe('');
      expect(getDisplayNameFromPath(null as unknown as string)).toBe('');
    });
  });

  // ============================================
  // calculateGridFromImage — pure function
  // ============================================
  describe('calculateGridFromImage', () => {
    describe('flat-top orientation (default)', () => {
      it('calculates hex size for given columns and image width', () => {
        // hexSize = width / (2 + (columns - 1) * 1.5)
        // For 800px wide, 12 columns: hexSize = 800 / (2 + 11 * 1.5) = 800 / 18.5 ≈ 43.24
        const result = calculateGridFromImage(800, 600, 12);
        expect(result.columns).toBe(12);
        expect(result.hexSize).toBeCloseTo(800 / 18.5, 5);
        expect(result.rows).toBeGreaterThan(0);
        expect(result.hexWidth).toBeGreaterThan(0);
      });

      it('calculates rows to cover image height', () => {
        const result = calculateGridFromImage(800, 600, 12, 'flat');
        // vertSpacing = hexSize * sqrt(3)
        const hexSize = 800 / (2 + 11 * 1.5);
        const vertSpacing = hexSize * Math.sqrt(3);
        const expectedRows = Math.ceil(600 / vertSpacing);
        expect(result.rows).toBe(expectedRows);
      });

      it('hexWidth is 2 * hexSize for flat-top', () => {
        const result = calculateGridFromImage(1000, 500, 20, 'flat');
        const expectedHexSize = 1000 / (2 + 19 * 1.5);
        expect(result.hexWidth).toBe(Math.round(expectedHexSize * 2));
      });

      it('handles single column', () => {
        // hexSize = width / (2 + 0 * 1.5) = width / 2
        const result = calculateGridFromImage(200, 100, 1, 'flat');
        expect(result.hexSize).toBe(100);
        expect(result.columns).toBe(1);
      });
    });

    describe('pointy-top orientation', () => {
      it('calculates hex size for pointy-top', () => {
        // hexSize = width / (columns * sqrt(3))
        const sqrt3 = Math.sqrt(3);
        const result = calculateGridFromImage(800, 600, 12, 'pointy');
        expect(result.hexSize).toBeCloseTo(800 / (12 * sqrt3), 5);
        expect(result.columns).toBe(12);
      });

      it('calculates rows for pointy-top', () => {
        const sqrt3 = Math.sqrt(3);
        const result = calculateGridFromImage(800, 600, 12, 'pointy');
        const hexSize = 800 / (12 * sqrt3);
        const vertSpacing = hexSize * 1.5;
        const expectedRows = Math.ceil(600 / vertSpacing);
        expect(result.rows).toBe(expectedRows);
      });

      it('hexWidth is hexSize * sqrt(3) for pointy-top', () => {
        const sqrt3 = Math.sqrt(3);
        const result = calculateGridFromImage(1000, 500, 20, 'pointy');
        const expectedHexSize = 1000 / (20 * sqrt3);
        expect(result.hexWidth).toBe(Math.round(expectedHexSize * sqrt3));
      });
    });

    describe('edge cases', () => {
      it('handles very large column counts', () => {
        const result = calculateGridFromImage(10000, 10000, 200, 'flat');
        expect(result.columns).toBe(200);
        expect(result.hexSize).toBeGreaterThan(0);
        expect(result.rows).toBeGreaterThan(0);
      });

      it('produces consistent results for both orientations with square image', () => {
        const flat = calculateGridFromImage(1000, 1000, 10, 'flat');
        const pointy = calculateGridFromImage(1000, 1000, 10, 'pointy');
        // Both should have 10 columns
        expect(flat.columns).toBe(10);
        expect(pointy.columns).toBe(10);
        // Hex sizes differ due to different formulas
        expect(flat.hexSize).not.toBeCloseTo(pointy.hexSize, 1);
      });
    });
  });

  // ============================================
  // GRID_DENSITY_PRESETS — constant
  // ============================================
  describe('GRID_DENSITY_PRESETS', () => {
    it('has sparse, medium, and dense presets', () => {
      expect(GRID_DENSITY_PRESETS).toHaveProperty('sparse');
      expect(GRID_DENSITY_PRESETS).toHaveProperty('medium');
      expect(GRID_DENSITY_PRESETS).toHaveProperty('dense');
    });

    it('sparse has 12 columns', () => {
      expect(GRID_DENSITY_PRESETS.sparse.columns).toBe(12);
    });

    it('medium has 24 columns', () => {
      expect(GRID_DENSITY_PRESETS.medium.columns).toBe(24);
    });

    it('dense has 48 columns', () => {
      expect(GRID_DENSITY_PRESETS.dense.columns).toBe(48);
    });

    it('each preset has label and description', () => {
      for (const key of ['sparse', 'medium', 'dense']) {
        const preset = GRID_DENSITY_PRESETS[key];
        expect(preset.label).toBeTruthy();
        expect(preset.description).toBeTruthy();
      }
    });
  });

  // ============================================
  // Cache operations: getCachedImage, clearCachedImage, clearUnusedTileImages
  // These require seeding the internal cache via preloadImage with mocked deps.
  // ============================================
  describe('getCachedImage', () => {
    afterEach(() => {
      // Clean up any cached entries to avoid cross-test pollution
      clearCachedImage('test/image1.png');
      clearCachedImage('test/image2.png');
      clearCachedImage('test/image3.png');
    });

    it('returns null for an unknown path', () => {
      expect(getCachedImage('nonexistent/path.png')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(getCachedImage('')).toBeNull();
    });

    it('returns the cached image after preloadImage succeeds', async () => {
      await seedCache('test/image1.png', 200, 150);
      const cached = getCachedImage('test/image1.png');
      expect(cached).not.toBeNull();
      expect(cached!.naturalWidth).toBe(200);
      expect(cached!.naturalHeight).toBe(150);
    });

    it('returns null for a path that was never loaded', async () => {
      await seedCache('test/image1.png');
      expect(getCachedImage('test/other.png')).toBeNull();
    });
  });

  describe('clearCachedImage', () => {
    afterEach(() => {
      clearCachedImage('test/image1.png');
      clearCachedImage('test/image2.png');
    });

    it('does not throw when clearing a non-existent path', () => {
      expect(() => clearCachedImage('nonexistent/path.png')).not.toThrow();
    });

    it('removes a cached image so getCachedImage returns null', async () => {
      await seedCache('test/image1.png');
      expect(getCachedImage('test/image1.png')).not.toBeNull();

      clearCachedImage('test/image1.png');
      expect(getCachedImage('test/image1.png')).toBeNull();
    });

    it('only clears the specified path, leaving others intact', async () => {
      await seedCache('test/image1.png');
      await seedCache('test/image2.png');

      clearCachedImage('test/image1.png');
      expect(getCachedImage('test/image1.png')).toBeNull();
      expect(getCachedImage('test/image2.png')).not.toBeNull();
    });
  });

  describe('clearUnusedTileImages', () => {
    afterEach(() => {
      // Cleanup
      clearCachedImage('tiles/forest.png');
      clearCachedImage('tiles/water.png');
      clearCachedImage('tiles/mountain.png');
    });

    it('does not crash when cache is empty', () => {
      expect(() => clearUnusedTileImages(new Set())).not.toThrow();
    });

    it('does not crash with an empty active set and empty cache', () => {
      expect(() => clearUnusedTileImages(new Set<string>())).not.toThrow();
    });

    it('evicts all cached images when active set is empty', async () => {
      await seedCache('tiles/forest.png');
      await seedCache('tiles/water.png');

      clearUnusedTileImages(new Set());

      expect(getCachedImage('tiles/forest.png')).toBeNull();
      expect(getCachedImage('tiles/water.png')).toBeNull();
    });

    it('keeps images whose paths are in the active set', async () => {
      await seedCache('tiles/forest.png');
      await seedCache('tiles/water.png');

      clearUnusedTileImages(new Set(['tiles/forest.png', 'tiles/water.png']));

      expect(getCachedImage('tiles/forest.png')).not.toBeNull();
      expect(getCachedImage('tiles/water.png')).not.toBeNull();
    });

    it('evicts only non-matching paths from the cache', async () => {
      await seedCache('tiles/forest.png');
      await seedCache('tiles/water.png');
      await seedCache('tiles/mountain.png');

      clearUnusedTileImages(new Set(['tiles/water.png']));

      expect(getCachedImage('tiles/forest.png')).toBeNull();
      expect(getCachedImage('tiles/water.png')).not.toBeNull();
      expect(getCachedImage('tiles/mountain.png')).toBeNull();
    });
  });

  // ============================================
  // LRU eviction
  // ============================================
  describe('LRU cache eviction', () => {
    const TEST_CACHE_SIZE = 5;

    beforeEach(() => {
      setMaxCacheSize(TEST_CACHE_SIZE);
    });

    afterEach(() => {
      // Clean up all test entries
      for (let i = 0; i <= TEST_CACHE_SIZE + 5; i++) {
        clearCachedImage(`lru/img${i}.png`);
      }
      setMaxCacheSize(200);
    });

    it('exports MAX_CACHE_SIZE as a positive number', () => {
      expect(MAX_CACHE_SIZE).toBeGreaterThan(0);
      expect(typeof MAX_CACHE_SIZE).toBe('number');
    });

    it('evicts oldest entry when cache exceeds max size', async () => {
      for (let i = 0; i < TEST_CACHE_SIZE; i++) {
        await seedCache(`lru/img${i}.png`);
      }

      // All should be present
      expect(getCachedImage('lru/img0.png')).not.toBeNull();
      expect(getCachedImage(`lru/img${TEST_CACHE_SIZE - 1}.png`)).not.toBeNull();

      // Add one more — img0 was just touched by getCachedImage, so img1 is oldest
      await seedCache(`lru/img${TEST_CACHE_SIZE}.png`);

      expect(getCachedImage('lru/img1.png')).toBeNull();
      expect(getCachedImage('lru/img0.png')).not.toBeNull();
      expect(getCachedImage(`lru/img${TEST_CACHE_SIZE}.png`)).not.toBeNull();
    });

    it('getCachedImage promotes entry to most recently used', async () => {
      for (let i = 0; i < TEST_CACHE_SIZE; i++) {
        await seedCache(`lru/img${i}.png`);
      }

      // Touch img0 to promote it
      getCachedImage('lru/img0.png');

      // Add 2 more to evict the 2 oldest untouched (img1, img2)
      await seedCache(`lru/img${TEST_CACHE_SIZE}.png`);
      await seedCache(`lru/img${TEST_CACHE_SIZE + 1}.png`);

      expect(getCachedImage('lru/img0.png')).not.toBeNull();
      expect(getCachedImage('lru/img1.png')).toBeNull();
      expect(getCachedImage('lru/img2.png')).toBeNull();
    });

    it('preloadImage of existing entry promotes it without eviction', async () => {
      for (let i = 0; i < TEST_CACHE_SIZE; i++) {
        await seedCache(`lru/img${i}.png`);
      }

      // Re-preload img0 (cache hit) — should promote, not add
      await preloadImage((globalThis as any).app, 'lru/img0.png');

      // No eviction should have occurred
      expect(getCachedImage('lru/img0.png')).not.toBeNull();
      expect(getCachedImage(`lru/img${TEST_CACHE_SIZE - 1}.png`)).not.toBeNull();
    });

    it('evicts multiple entries to stay within max size', async () => {
      for (let i = 0; i < TEST_CACHE_SIZE; i++) {
        await seedCache(`lru/img${i}.png`);
      }

      // Add 3 more — should evict img0, img1, img2
      await seedCache(`lru/img${TEST_CACHE_SIZE}.png`);
      await seedCache(`lru/img${TEST_CACHE_SIZE + 1}.png`);
      await seedCache(`lru/img${TEST_CACHE_SIZE + 2}.png`);

      expect(getCachedImage('lru/img0.png')).toBeNull();
      expect(getCachedImage('lru/img1.png')).toBeNull();
      expect(getCachedImage('lru/img2.png')).toBeNull();
      expect(getCachedImage('lru/img3.png')).not.toBeNull();
      expect(getCachedImage('lru/img4.png')).not.toBeNull();
    });
  });

  // ============================================
  // preloadImage — tested lightly for edge cases
  // ============================================
  describe('preloadImage', () => {
    afterEach(() => {
      clearCachedImage('test/loaded.png');
    });

    it('returns null for empty vault path', async () => {
      const result = await preloadImage((globalThis as any).app, '');
      expect(result).toBeNull();
    });

    it('returns null when file is not found in vault', async () => {
      mockVault.getAbstractFileByPath.mockReturnValue(null);
      const result = await preloadImage((globalThis as any).app, 'missing/file.png');
      expect(result).toBeNull();
    });

    it('returns cached image on subsequent calls', async () => {
      await seedCache('test/loaded.png');
      // Second call should return from cache without hitting vault
      mockVault.getAbstractFileByPath.mockClear();
      const result = await preloadImage((globalThis as any).app, 'test/loaded.png');
      expect(result).not.toBeNull();
      // Should NOT have called vault again — served from cache
      expect(mockVault.getAbstractFileByPath).not.toHaveBeenCalled();
    });
  });
});
