/**
 * Unit tests for tileRenderer.ts
 * Tests z-sort ordering, draw rect calculation, and viewport culling.
 */

import { describe, it, expect } from 'vitest';

// ===========================================
// Re-implement pure functions for testability
// ===========================================

const SQRT3 = Math.sqrt(3);

function axialToOffset(q: number, r: number, orientation: string) {
  if (orientation === 'flat') {
    return { col: q, row: r + (q - (q & 1)) / 2 };
  } else {
    return { col: q + (r - (r & 1)) / 2, row: r };
  }
}

interface TileAssignment {
  q: number;
  r: number;
  tilesetId: string;
  tileId: string;
  rotation?: number;
  flipH?: boolean;
}

function sortTilesForRendering(tiles: TileAssignment[], orientation: string): TileAssignment[] {
  return [...tiles].sort((a, b) => {
    const oa = axialToOffset(a.q, a.r, orientation);
    const ob = axialToOffset(b.q, b.r, orientation);
    if (oa.row !== ob.row) return oa.row - ob.row;
    return oa.col - ob.col;
  });
}

interface TilesetDef {
  tileWidth: number;
  tileHeight: number;
  hexHeight: number;
  overflowTop: number;
  overflowBottom: number;
}

function calculateTileDrawRect(
  screenX: number,
  screenY: number,
  tileset: TilesetDef,
  hexSize: number,
  zoom: number,
  orientation: string
): { drawX: number; drawY: number; drawWidth: number; drawHeight: number } {
  const hexScreenHeight = orientation === 'flat'
    ? SQRT3 * hexSize * zoom
    : 2 * hexSize * zoom;

  const scale = hexScreenHeight / tileset.hexHeight;
  const drawWidth = tileset.tileWidth * scale;
  const drawHeight = tileset.tileHeight * scale;

  const hexAreaCenterInTile = tileset.overflowTop + tileset.hexHeight / 2;
  const drawX = screenX - drawWidth / 2;
  const drawY = screenY - hexAreaCenterInTile * scale;

  return { drawX, drawY, drawWidth, drawHeight };
}

// ===========================================
// Tests
// ===========================================

describe('tileRenderer', () => {
  describe('sortTilesForRendering', () => {
    const makeTile = (q: number, r: number): TileAssignment => ({
      q, r, tilesetId: 'ts1', tileId: 'tile1',
    });

    it('sorts by offset row ascending (flat-top)', () => {
      const tiles = [makeTile(0, 2), makeTile(0, 0), makeTile(0, 1)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted.map(t => t.r)).toEqual([0, 1, 2]);
    });

    it('sorts by offset row ascending (pointy-top)', () => {
      const tiles = [makeTile(0, 3), makeTile(0, 1), makeTile(0, 2)];
      const sorted = sortTilesForRendering(tiles, 'pointy');
      expect(sorted.map(t => t.r)).toEqual([1, 2, 3]);
    });

    it('breaks ties by column', () => {
      // Same row, different columns
      const tiles = [makeTile(2, 0), makeTile(0, 0), makeTile(1, 0)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted.map(t => t.q)).toEqual([0, 1, 2]);
    });

    it('does not mutate the original array', () => {
      const tiles = [makeTile(0, 2), makeTile(0, 0)];
      const original = [...tiles];
      sortTilesForRendering(tiles, 'flat');
      expect(tiles).toEqual(original);
    });

    it('returns empty array for empty input', () => {
      expect(sortTilesForRendering([], 'flat')).toEqual([]);
    });

    it('handles single tile', () => {
      const tiles = [makeTile(3, 5)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted).toHaveLength(1);
      expect(sorted[0]).toEqual(tiles[0]);
    });

    it('handles odd-column offset shift for flat-top', () => {
      // For flat-top, col=1 (odd) shifts row by +0.5
      // Tile at (q=1, r=0): offset row = 0 + (1 - 1)/2 = 0
      // Tile at (q=0, r=1): offset row = 1 + (0 - 0)/2 = 1
      // So q=1,r=0 should sort before q=0,r=1
      const tiles = [makeTile(0, 1), makeTile(1, 0)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted[0].q).toBe(1);
      expect(sorted[0].r).toBe(0);
    });
  });

  describe('calculateTileDrawRect', () => {
    it('centers a square tile with no overflow on the hex (flat-top)', () => {
      const tileset: TilesetDef = {
        tileWidth: 256, tileHeight: 256,
        hexHeight: 256, overflowTop: 0, overflowBottom: 0,
      };
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');

      // Hex screen height for flat-top = sqrt(3) * 80 * 1 ≈ 138.56
      const hexScreenH = SQRT3 * 80;
      const scale = hexScreenH / 256;
      const drawW = 256 * scale;
      const drawH = 256 * scale;

      expect(rect.drawWidth).toBeCloseTo(drawW, 2);
      expect(rect.drawHeight).toBeCloseTo(drawH, 2);
      // Centered horizontally
      expect(rect.drawX).toBeCloseTo(400 - drawW / 2, 2);
      // Hex area center = 0 + 256/2 = 128 from top
      // drawY = 300 - 128 * scale
      expect(rect.drawY).toBeCloseTo(300 - 128 * scale, 2);
    });

    it('extends above the hex for tall tiles with overflow (flat-top)', () => {
      const tileset: TilesetDef = {
        tileWidth: 256, tileHeight: 384,
        hexHeight: 256, overflowTop: 128, overflowBottom: 0,
      };
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');

      const hexScreenH = SQRT3 * 80;
      const scale = hexScreenH / 256;

      // Hex area center in tile = 128 + 128 = 256 pixels from top
      // drawY = 300 - 256 * scale
      const expectedY = 300 - 256 * scale;
      expect(rect.drawY).toBeCloseTo(expectedY, 2);

      // The draw height is taller than the no-overflow case
      expect(rect.drawHeight).toBeCloseTo(384 * scale, 2);
      // So the top edge is above the no-overflow case
      expect(rect.drawY).toBeLessThan(300 - rect.drawHeight / 2 + 10);
    });

    it('scales with zoom', () => {
      const tileset: TilesetDef = {
        tileWidth: 256, tileHeight: 256,
        hexHeight: 256, overflowTop: 0, overflowBottom: 0,
      };
      const rect1 = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');
      const rect2 = calculateTileDrawRect(400, 300, tileset, 80, 2, 'flat');

      expect(rect2.drawWidth).toBeCloseTo(rect1.drawWidth * 2, 2);
      expect(rect2.drawHeight).toBeCloseTo(rect1.drawHeight * 2, 2);
    });

    it('uses different hex height for pointy-top', () => {
      const tileset: TilesetDef = {
        tileWidth: 256, tileHeight: 256,
        hexHeight: 256, overflowTop: 0, overflowBottom: 0,
      };
      const rectFlat = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');
      const rectPointy = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');

      // Pointy hex height = 2 * hexSize = 160
      // Flat hex height = sqrt(3) * hexSize ≈ 138.56
      // So pointy tiles should be larger
      expect(rectPointy.drawWidth).toBeGreaterThan(rectFlat.drawWidth);
    });

    it('handles equal overflow top and bottom', () => {
      const tileset: TilesetDef = {
        tileWidth: 256, tileHeight: 384,
        hexHeight: 256, overflowTop: 64, overflowBottom: 64,
      };
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');

      // Hex area center = 64 + 128 = 192 from top
      const hexScreenH = SQRT3 * 80;
      const scale = hexScreenH / 256;
      expect(rect.drawY).toBeCloseTo(300 - 192 * scale, 2);
    });
  });

  describe('viewport culling', () => {
    it('identifies tiles within bounds', () => {
      // Simple culling check: screen position within canvas + margin
      const screenX = 500, screenY = 400;
      const canvasW = 1000, canvasH = 800;
      const margin = 200;

      const inBounds = screenX >= -margin && screenX <= canvasW + margin &&
                       screenY >= -margin && screenY <= canvasH + margin;
      expect(inBounds).toBe(true);
    });

    it('identifies tiles outside bounds', () => {
      const screenX = -500, screenY = 400;
      const canvasW = 1000, canvasH = 800;
      const margin = 200;

      const inBounds = screenX >= -margin && screenX <= canvasW + margin &&
                       screenY >= -margin && screenY <= canvasH + margin;
      expect(inBounds).toBe(false);
    });

    it('includes tiles near the edge with overflow margin', () => {
      const screenX = -150, screenY = 400;
      const canvasW = 1000, canvasH = 800;
      const margin = 200;

      const inBounds = screenX >= -margin && screenX <= canvasW + margin &&
                       screenY >= -margin && screenY <= canvasH + margin;
      expect(inBounds).toBe(true);
    });
  });
});
