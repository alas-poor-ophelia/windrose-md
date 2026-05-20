/**
 * Unit tests for tilesetOperations.ts
 * Tests pure functions: generateTilesetId, autoDetectOverflow, createTilesetFromTiles.
 * probeFirstTileImage and scanTilesetFolder require DOM/vault APIs and are not unit-tested here.
 */

import { describe, it, expect } from 'vitest';

import {
  generateTilesetId,
  autoDetectOverflow,
  createTilesetFromTiles,
  ALPHA_COVERAGE_THRESHOLD,
} from '../../../src/assets/tilesetOperations';

import type { TileEntry } from '#types/tiles/tile.types';

// ===========================================
// Tests
// ===========================================

describe('tilesetOperations', () => {
  describe('generateTilesetId', () => {
    it('returns a string starting with tileset-', () => {
      const id = generateTilesetId();
      expect(id).toMatch(/^tileset-/);
    });

    it('generates unique random IDs when no folder path given', () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateTilesetId()));
      expect(ids.size).toBe(20);
    });

    it('returns deterministic ID for a given folder path', () => {
      const id1 = generateTilesetId('Hex Samples');
      const id2 = generateTilesetId('Hex Samples');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^tileset-/);
    });

    it('returns different IDs for different folder paths', () => {
      const id1 = generateTilesetId('Hex Samples');
      const id2 = generateTilesetId('Other Tiles');
      expect(id1).not.toBe(id2);
    });

    it('handles empty string input (treated as falsy, generates random)', () => {
      const id1 = generateTilesetId('');
      const id2 = generateTilesetId('');
      // Empty string is falsy, so each call should produce a random ID
      expect(id1).toMatch(/^tileset-/);
      expect(id2).toMatch(/^tileset-/);
      expect(id1).not.toBe(id2);
    });

    it('handles very long path deterministically', () => {
      const longPath = 'a/'.repeat(500) + 'tiles';
      const id1 = generateTilesetId(longPath);
      const id2 = generateTilesetId(longPath);
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^tileset-/);
    });

    it('handles non-ASCII characters in path', () => {
      const id1 = generateTilesetId('地图/タイル/карта');
      const id2 = generateTilesetId('地图/タイル/карта');
      expect(id1).toBe(id2);
      expect(id1).toMatch(/^tileset-/);
      // Different unicode path produces different ID
      const id3 = generateTilesetId('другой/путь');
      expect(id3).not.toBe(id1);
    });
  });

  describe('autoDetectOverflow', () => {
    it('returns no overflow for square tiles', () => {
      const result = autoDetectOverflow(256, 256);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('returns top overflow for tall tiles', () => {
      const result = autoDetectOverflow(256, 384);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 128,
        overflowBottom: 0,
      });
    });

    it('returns no overflow for wide tiles', () => {
      const result = autoDetectOverflow(512, 256);
      expect(result).toEqual({
        hexHeight: 256,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles 1:1 small tiles', () => {
      const result = autoDetectOverflow(64, 64);
      expect(result).toEqual({
        hexHeight: 64,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles extreme vertical overflow', () => {
      const result = autoDetectOverflow(128, 512);
      expect(result).toEqual({
        hexHeight: 128,
        overflowTop: 384,
        overflowBottom: 0,
      });
    });

    it('handles zero dimensions', () => {
      const result = autoDetectOverflow(0, 0);
      expect(result).toEqual({
        hexHeight: 0,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles zero width with nonzero height', () => {
      const result = autoDetectOverflow(0, 100);
      expect(result).toEqual({
        hexHeight: 0,
        overflowTop: 100,
        overflowBottom: 0,
      });
    });

    it('handles tileHeight much larger than tileWidth (e.g., 100x500)', () => {
      const result = autoDetectOverflow(100, 500);
      expect(result).toEqual({
        hexHeight: 100,
        overflowTop: 400,
        overflowBottom: 0,
      });
    });

    it('handles negative dimensions gracefully', () => {
      // Negative values are nonsensical but should not throw
      const result = autoDetectOverflow(-10, -20);
      // -20 is not > -10, so goes to the else branch
      expect(result).toEqual({
        hexHeight: -20,
        overflowTop: 0,
        overflowBottom: 0,
      });
    });

    it('handles negative width with positive height', () => {
      // height > width triggers overflow branch
      const result = autoDetectOverflow(-5, 100);
      expect(result).toEqual({
        hexHeight: -5,
        overflowTop: 105,
        overflowBottom: 0,
      });
    });
  });

  describe('createTilesetFromTiles', () => {
    const sampleTiles: TileEntry[] = [
      { id: 'grass', filename: 'grass.png', vaultPath: 'Tiles/grass.png' },
      { id: 'forest', filename: 'forest.png', vaultPath: 'Tiles/trees/forest.png', category: 'trees' },
      { id: 'water', filename: 'water.png', vaultPath: 'Tiles/water/water.png', category: 'water' },
    ];

    it('creates a tileset with correct basic fields', () => {
      const result = createTilesetFromTiles('Tiles', 'My Tileset', sampleTiles);
      expect(result.name).toBe('My Tileset');
      expect(result.folderPath).toBe('Tiles');
      expect(result.tiles).toBe(sampleTiles);
      expect(result.id).toMatch(/^tileset-/);
    });

    it('uses default dimensions (256x256) when no options provided', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles);
      expect(result.tileWidth).toBe(256);
      expect(result.tileHeight).toBe(256);
      expect(result.hexHeight).toBe(256);
      expect(result.overflowTop).toBe(0);
      expect(result.overflowBottom).toBe(0);
    });

    it('uses provided tileWidth and tileHeight', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles, {
        tileWidth: 128,
        tileHeight: 192,
      });
      expect(result.tileWidth).toBe(128);
      expect(result.tileHeight).toBe(192);
      // autoDetectOverflow should apply: 192 > 128 → overflow = 64
      expect(result.hexHeight).toBe(128);
      expect(result.overflowTop).toBe(64);
    });

    it('allows hexHeight option to override auto-detected value', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles, {
        tileWidth: 128,
        tileHeight: 192,
        hexHeight: 100,
      });
      expect(result.hexHeight).toBe(100);
      // Overflow still uses auto-detect since not overridden
      expect(result.overflowTop).toBe(64);
    });

    it('allows overflowTop/overflowBottom options to override auto-detected values', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles, {
        tileWidth: 128,
        tileHeight: 192,
        overflowTop: 20,
        overflowBottom: 10,
      });
      expect(result.overflowTop).toBe(20);
      expect(result.overflowBottom).toBe(10);
    });

    it('passes through fitMode option', () => {
      const fill = createTilesetFromTiles('Tiles', 'Test', sampleTiles, { fitMode: 'fill' });
      const contain = createTilesetFromTiles('Tiles', 'Test', sampleTiles, { fitMode: 'contain' });
      expect(fill.fitMode).toBe('fill');
      expect(contain.fitMode).toBe('contain');
    });

    it('fitMode is undefined when not specified', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles);
      expect(result.fitMode).toBeUndefined();
    });

    it('generates a deterministic ID from folderPath', () => {
      const result1 = createTilesetFromTiles('Tiles/forest', 'Forest', sampleTiles);
      const result2 = createTilesetFromTiles('Tiles/forest', 'Forest', sampleTiles);
      expect(result1.id).toBe(result2.id);
    });

    it('handles empty tiles array', () => {
      const result = createTilesetFromTiles('Tiles', 'Empty', []);
      expect(result.tiles).toEqual([]);
      expect(result.name).toBe('Empty');
      expect(result.tileWidth).toBe(256);
    });

    it('handles a single tile', () => {
      const single: TileEntry[] = [
        { id: 'solo', filename: 'solo.png', vaultPath: 'Tiles/solo.png' },
      ];
      const result = createTilesetFromTiles('Tiles', 'Solo', single);
      expect(result.tiles).toHaveLength(1);
      expect(result.tiles[0].id).toBe('solo');
    });

    it('preserves tile categories from input', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles);
      const forest = result.tiles.find(t => t.id === 'forest');
      expect(forest?.category).toBe('trees');
    });
  });

  describe('ALPHA_COVERAGE_THRESHOLD', () => {
    it('is a number between 0 and 1', () => {
      expect(ALPHA_COVERAGE_THRESHOLD).toBeGreaterThan(0);
      expect(ALPHA_COVERAGE_THRESHOLD).toBeLessThanOrEqual(1);
    });

    it('equals 0.6', () => {
      expect(ALPHA_COVERAGE_THRESHOLD).toBe(0.6);
    });
  });

  // probeFirstTileImage and measureAlphaCoverage require DOM Image/Canvas APIs
  // and app.vault access. They are intentionally not unit-tested here.
  // Integration coverage would require a browser environment or extensive DOM mocking.
});
