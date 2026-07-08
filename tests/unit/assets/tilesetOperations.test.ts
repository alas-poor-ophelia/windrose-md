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
  classifyTileArtMask,
  resolveTileEntry,
  tileIdBasename,
  mintTileId,
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

    it('marks origin native for ordinary vault folders', () => {
      const result = createTilesetFromTiles('Tiles', 'Test', sampleTiles);
      expect(result.origin).toBe('native');
    });

    it('marks origin dungeondraft when tiles live under dungeondraft-packs', () => {
      const ddTiles = [
        { id: 'wall', filename: 'wall.png', vaultPath: 'windrose-content/dungeondraft-packs/FCWalls/walls/wall.png', category: 'walls' },
      ];
      const result = createTilesetFromTiles('windrose-content/dungeondraft-packs/FCWalls', 'FC Walls', ddTiles);
      expect(result.origin).toBe('dungeondraft');
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

  describe('classifyTileArtMask', () => {
    // Synthetic alpha masks: 255 inside the shape, 0 outside.
    const W = 120;

    /** Regular pointy-top hexagon centered in a w×h box: vertices top/bottom,
     *  vertical edges left/right spanning the middle half of the height. */
    const pointyHexAlpha = (w: number, h: number) => (x: number, y: number): number => {
      const a = w / 2, b = h / 2;
      const dx = Math.abs(x - w / 2), dy = Math.abs(y - h / 2);
      return dx <= a && dy <= b - dx * (b / (2 * a)) ? 255 : 0;
    };

    /** Flat-top hexagon (transpose of pointy). */
    const flatHexAlpha = (w: number, h: number) => (x: number, y: number): number => {
      const a = w / 2, b = h / 2;
      const dx = Math.abs(x - w / 2), dy = Math.abs(y - h / 2);
      return dy <= b && dx <= a - dy * (a / (2 * b)) ? 255 : 0;
    };

    it('classifies a regular pointy-top hexagon as pointy', () => {
      const h = Math.round(W * 2 / Math.sqrt(3));
      expect(classifyTileArtMask(pointyHexAlpha(W, h), W, h)).toBe('pointy');
    });

    it('classifies a vertically squashed (isometric) pointy hexagon as pointy', () => {
      // Pseudo-3D hex tile art: pointy topology squashed to ~0.85 of its width
      const h = Math.round(W * 0.85);
      expect(classifyTileArtMask(pointyHexAlpha(W, h), W, h)).toBe('pointy');
    });

    it('classifies a regular flat-top hexagon as flat', () => {
      const h = Math.round(W * Math.sqrt(3) / 2);
      expect(classifyTileArtMask(flatHexAlpha(W, h), W, h)).toBe('flat');
    });

    it('returns undefined for fully opaque square art (seamless textures)', () => {
      expect(classifyTileArtMask(() => 255, W, W)).toBeUndefined();
    });

    it('returns undefined for fully transparent images', () => {
      expect(classifyTileArtMask(() => 0, W, W)).toBeUndefined();
    });

    it('returns undefined for blobby prop art (tree: canopy over narrow trunk)', () => {
      const h = 160;
      const alpha = (x: number, y: number): number => {
        // canopy: circle radius 40 at (60, 50); trunk: 10px column below it
        const inCanopy = (x - 60) ** 2 + (y - 50) ** 2 <= 40 ** 2;
        const inTrunk = Math.abs(x - 60) <= 5 && y >= 50 && y <= 150;
        return inCanopy || inTrunk ? 255 : 0;
      };
      expect(classifyTileArtMask(alpha, W, h)).toBeUndefined();
    });

    it('still detects pointy when overflow art sits above the hex (canopy)', () => {
      // Hex area in the lower 2/3 of a tall frame, wide blob overflow above —
      // mirrors 256×384 hex tiles with tree/mountain headroom. The bottom band
      // (vertex) decides, so the canopy must not flip the result.
      const h = 180;
      const hexTop = 60;
      const hex = pointyHexAlpha(W, h - hexTop);
      const alpha = (x: number, y: number): number => {
        if (y >= hexTop) return hex(x, y - hexTop);
        // overflow blob: wide ellipse hugging the hex top
        const dx = (x - W / 2) / (W * 0.35), dy = (y - hexTop) / 50;
        return dx * dx + dy * dy <= 1 ? 255 : 0;
      };
      expect(classifyTileArtMask(alpha, W, h)).toBe('pointy');
    });
  });

  describe('mintTileId', () => {
    it('keeps the historical basename-derived id for root-level tiles', () => {
      expect(mintTileId('grass.png', new Set())).toBe('grass');
    });

    it('mints folder-relative ids for nested tiles', () => {
      expect(mintTileId('terrain/Natural/Cracked_Stone_01_A.webp', new Set()))
        .toBe('terrain/Natural/Cracked_Stone_01_A');
    });

    it('never duplicates ids for the same basename in different folders', () => {
      const seen = new Set<string>();
      const a = mintTileId('terrain/Natural/X.webp', seen);
      const b = mintTileId('patterns/normal/Natural/X.webp', seen);
      expect(a).not.toBe(b);
      expect(a).toBe('terrain/Natural/X');
      expect(b).toBe('patterns/normal/Natural/X');
    });

    it('keeps the extension when two files in one folder share a stem', () => {
      const seen = new Set<string>();
      expect(mintTileId('rock.png', seen)).toBe('rock');
      expect(mintTileId('rock.webp', seen)).toBe('rock.webp');
    });

    it('treats a dotfile-like name without a real stem as its own id', () => {
      expect(mintTileId('.hidden', new Set())).toBe('.hidden');
    });
  });

  describe('tileIdBasename', () => {
    it('returns the id unchanged when it has no path segments', () => {
      expect(tileIdBasename('Cracked_Stone_01_A')).toBe('Cracked_Stone_01_A');
    });

    it('returns the last segment of a folder-relative id', () => {
      expect(tileIdBasename('terrain/Natural/Cracked_Stone_01_A')).toBe('Cracked_Stone_01_A');
    });
  });

  describe('resolveTileEntry', () => {
    const entry = (id: string): TileEntry => ({
      id,
      filename: tileIdBasename(id) + '.webp',
      vaultPath: 'Pack/' + id + '.webp',
    });
    const tileset = (ids: string[]): { tiles: TileEntry[] } => ({ tiles: ids.map(entry) });

    it('resolves a unique exact id', () => {
      const ts = tileset(['grass', 'forest', 'water']);
      expect(resolveTileEntry(ts, 'forest')?.id).toBe('forest');
    });

    it('returns undefined for unknown ids, undefined tilesets, and empty ids', () => {
      const ts = tileset(['grass']);
      expect(resolveTileEntry(ts, 'lava')).toBeUndefined();
      expect(resolveTileEntry(undefined, 'grass')).toBeUndefined();
      expect(resolveTileEntry(ts, '')).toBeUndefined();
      expect(resolveTileEntry(ts, undefined)).toBeUndefined();
    });

    it('resolves the FIRST occurrence when ids are duplicated (DD pack twins)', () => {
      // Same basename in two subfolders — the invisible-tile bug scenario.
      const ts = {
        tiles: [
          { id: 'Cracked_Stone_01_A', filename: 'Cracked_Stone_01_A.webp', vaultPath: 'Pack/terrain/Natural/Cracked_Stone_01_A.webp' },
          { id: 'Cracked_Stone_01_A', filename: 'Cracked_Stone_01_A.webp', vaultPath: 'Pack/patterns/normal/Natural/Cracked_Stone_01_A.webp' },
        ],
      };
      expect(resolveTileEntry(ts, 'Cracked_Stone_01_A')?.vaultPath)
        .toBe('Pack/terrain/Natural/Cracked_Stone_01_A.webp');
    });

    it('resolves legacy basename references against folder-relative ids', () => {
      const ts = tileset(['terrain/Natural/Cracked_Stone_01_A', 'props/Barrel_01']);
      expect(resolveTileEntry(ts, 'Cracked_Stone_01_A')?.id).toBe('terrain/Natural/Cracked_Stone_01_A');
      expect(resolveTileEntry(ts, 'Barrel_01')?.id).toBe('props/Barrel_01');
    });

    it('prefers an exact match over an earlier legacy basename match', () => {
      const ts = tileset(['terrain/Natural/X', 'X']);
      expect(resolveTileEntry(ts, 'X')?.id).toBe('X');
    });

    it('takes the first legacy candidate when several basenames collide', () => {
      const ts = tileset(['terrain/Natural/X', 'patterns/normal/Natural/X']);
      expect(resolveTileEntry(ts, 'X')?.id).toBe('terrain/Natural/X');
    });

    it('resolves folder-relative ids exactly', () => {
      const ts = tileset(['terrain/Natural/X', 'patterns/normal/Natural/X']);
      expect(resolveTileEntry(ts, 'patterns/normal/Natural/X')?.vaultPath)
        .toBe('Pack/patterns/normal/Natural/X.webp');
    });
  });

  // probeFirstTileImage and measureAlphaCoverage require DOM Image/Canvas APIs
  // and app.vault access. They are intentionally not unit-tested here.
  // Integration coverage would require a browser environment or extensive DOM mocking.
});
