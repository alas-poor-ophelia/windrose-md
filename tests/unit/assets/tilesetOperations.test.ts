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
  analyzeTileArtMask,
  fitHexCellCenterY,
  probeCandidateOrder,
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

  describe('probeCandidateOrder', () => {
    const entry = (vaultPath: string): TileEntry => {
      const filename = vaultPath.split('/').pop() ?? '';
      return { id: filename.replace(/\.\w+$/, ''), filename, vaultPath, tags: [] };
    };

    it('puts root-level tiles ahead of subfolder decorations regardless of alphabet', () => {
      // Regression (2026-08-05): a plain path sort put "Extras/" banners ahead
      // of the root "Hex - *" tiles — the probe sampled five ribbons, no
      // hexagon verdict survived, and every hex tile rendered at half size.
      const tiles = [
        entry('2MT World Map Hex Tiles/Extras/Title Banner 5 (long).png'),
        entry('2MT World Map Hex Tiles/Hex - Base (lush).png'),
        entry('2MT World Map Hex Tiles/Extras/Banner 1 (blue).png'),
        entry('2MT World Map Hex Tiles/Hex - Base (blank).png'),
      ];
      const ordered = probeCandidateOrder(tiles).map(t => t.vaultPath);
      expect(ordered).toEqual([
        '2MT World Map Hex Tiles/Hex - Base (blank).png',
        '2MT World Map Hex Tiles/Hex - Base (lush).png',
        '2MT World Map Hex Tiles/Extras/Banner 1 (blue).png',
        '2MT World Map Hex Tiles/Extras/Title Banner 5 (long).png',
      ]);
    });

    it('is deterministic within a depth level (path order)', () => {
      const tiles = [entry('a/z.png'), entry('a/b.png'), entry('a/m.png')];
      expect(probeCandidateOrder(tiles).map(t => t.vaultPath)).toEqual(['a/b.png', 'a/m.png', 'a/z.png']);
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
      expect(classifyTileArtMask(pointyHexAlpha(W, h), W, h)?.orientation).toBe('pointy');
    });

    it('classifies a vertically squashed (isometric) pointy hexagon as pointy', () => {
      // Pseudo-3D hex tile art: pointy topology squashed to ~0.85 of its width
      const h = Math.round(W * 0.85);
      expect(classifyTileArtMask(pointyHexAlpha(W, h), W, h)?.orientation).toBe('pointy');
    });

    it('classifies a regular flat-top hexagon as flat', () => {
      const h = Math.round(W * Math.sqrt(3) / 2);
      expect(classifyTileArtMask(flatHexAlpha(W, h), W, h)?.orientation).toBe('flat');
    });

    it('measures hexWidth and opaqueBottom for a padded flat hexagon with a skirt (2MT-style)', () => {
      // Board-piece art: flat-top hexagon face floating centered in a larger
      // transparent frame, with a "3D thickness" skirt hanging below the face.
      const imgW = 200, imgH = 174;
      const faceW = 104;
      const faceH = Math.round(faceW * Math.sqrt(3) / 2); // 90
      const faceLeft = (imgW - faceW) / 2;                 // 48
      const faceTop = 30;
      const face = flatHexAlpha(faceW, faceH);
      const alpha = (x: number, y: number): number => {
        if (face(x - faceLeft, y - faceTop) > 0) return 255;
        // skirt: bottom half of the face outline extruded 8px down
        const yUp = y - faceTop - 8;
        return y > faceTop + faceH / 2 && yUp >= 0 && face(x - faceLeft, yUp) > 0 ? 255 : 0;
      };
      const result = analyzeTileArtMask(alpha, imgW, imgH);
      expect(result?.verdict).toBe('flat');
      // Widest row = the face's corner-to-corner width (±1px discretization),
      // not the image width
      expect(result?.hexWidth).toBeGreaterThanOrEqual(faceW - 2);
      expect(result?.hexWidth).toBeLessThanOrEqual(faceW + 1);
      // Opaque top = the FACE's top edge (skirt only extends bounds downward).
      expect(result?.opaqueTop).toBeGreaterThanOrEqual(faceTop - 1);
      expect(result?.opaqueTop).toBeLessThanOrEqual(faceTop + 1);
      // Corner line = the face's vertical mid-line (through its side corner
      // points) — the anchor that puts the corners in the cell's crooks. The
      // skirt below must not drag it down.
      expect(result?.cornerRowY).toBeGreaterThanOrEqual(faceTop + faceH / 2 - 2);
      expect(result?.cornerRowY).toBeLessThanOrEqual(faceTop + faceH / 2 + 2);
      // Opaque bottom = the SKIRT's bottom edge (face bottom + 8px extrusion).
      expect(result?.opaqueBottom).toBeGreaterThanOrEqual(faceTop + faceH + 8 - 2);
      expect(result?.opaqueBottom).toBeLessThanOrEqual(faceTop + faceH + 8 + 1);
    });

    it('reports opaqueBottom and a centered corner line for a regular pointy hexagon', () => {
      const h = Math.round(W * 2 / Math.sqrt(3));
      const result = analyzeTileArtMask(pointyHexAlpha(W, h), W, h);
      expect(result?.hexWidth).toBeGreaterThanOrEqual(W - 2);
      expect(result?.hexWidth).toBeLessThanOrEqual(W + 1);
      expect(result?.opaqueBottom).toBeGreaterThanOrEqual(h - 2);
      expect(result?.opaqueBottom).toBeLessThanOrEqual(h);
      expect(result?.cornerRowY).toBeGreaterThanOrEqual(h / 2 - 2);
      expect(result?.cornerRowY).toBeLessThanOrEqual(h / 2 + 2);
    });

    it('measures metrics without a verdict for canopy-decorated hex art, and flags corner pollution', () => {
      // 2MT forest hex: wide canopy blob overflowing above the face defeats
      // the edge gates (verdict undefined), but the face metrics still measure;
      // a decoration touching ONE corner column shows up as cornerSkew.
      const imgW = 200, imgH = 200;
      const faceW = 104;
      const faceH = Math.round(faceW * Math.sqrt(3) / 2);
      const faceLeft = (imgW - faceW) / 2, faceTop = 70;
      const face = flatHexAlpha(faceW, faceH);
      const alpha = (x: number, y: number): number => {
        if (face(x - faceLeft, y - faceTop) > 0) return 255;
        // canopy: wide ellipse above the face, reaching the RIGHT corner column
        const dx = (x - imgW / 2 - 10) / (faceW * 0.55), dy = (y - faceTop - 10) / 45;
        return dx * dx + dy * dy <= 1 ? 255 : 0;
      };
      const a = analyzeTileArtMask(alpha, imgW, imgH);
      expect(a).toBeDefined();
      expect(a?.hexWidth).toBeGreaterThanOrEqual(faceW - 2);
      // Left corner tip is clean face geometry (the mid-line)…
      expect(a?.tipTopL).toBeGreaterThanOrEqual(faceTop + faceH / 2 - 2);
      // …while the canopy touching the right corner column skews the pair.
      expect(a?.cornerSkew).toBeGreaterThan(10);
    });

    it('coverage-fits the cell polygon to a padded flat hexagon face (skirt below, canopy above)', () => {
      // 2MT-style board piece: face + skirt + a canopy blob over the top
      // middle. The fit must land on the face center: the skirt (ink below)
      // and canopy (ink above the middle only) never move it, because the
      // binding constraint is the upper diagonal edges near the corners.
      const imgW = 200, imgH = 200;
      const faceW = 104;
      const faceH = Math.round(faceW * Math.sqrt(3) / 2); // 90
      const faceLeft = (imgW - faceW) / 2, faceTop = 60;
      const face = flatHexAlpha(faceW, faceH);
      const alpha = (x: number, y: number): number => {
        if (face(x - faceLeft, y - faceTop) > 0) return 255;
        const yUp = y - faceTop - 8;
        if (y > faceTop + faceH / 2 && yUp >= 0 && face(x - faceLeft, yUp) > 0) return 255;
        const dx = (x - imgW / 2) / (faceW * 0.3), dy = (y - faceTop - 5) / 30;
        return dx * dx + dy * dy <= 1 ? 255 : 0;
      };
      const fit = fitHexCellCenterY(alpha, imgW, imgH, faceW, 'flat', imgW / 2, faceTop + faceH / 2 + 3);
      expect(fit).toBeDefined();
      expect(fit as number).toBeGreaterThanOrEqual(faceTop + faceH / 2 - 2);
      expect(fit as number).toBeLessThanOrEqual(faceTop + faceH / 2 + 2);
    });

    it('coverage fit returns undefined when the mask cannot cover the cell polygon', () => {
      // A hexagon reported wider than the ink that exists (nothing can cover).
      const imgW = 120, imgH = 120;
      const blob = (x: number, y: number): number => {
        const dx = (x - 60) / 20, dy = (y - 60) / 20;
        return dx * dx + dy * dy <= 1 ? 255 : 0;
      };
      expect(fitHexCellCenterY(blob, imgW, imgH, 100, 'flat', 60, 60)).toBeUndefined();
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
      expect(classifyTileArtMask(alpha, W, h)?.orientation).toBe('pointy');
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
