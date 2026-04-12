/**
 * Unit tests for tileRenderer.ts
 * Tests z-sort ordering and draw rect calculation using actual source functions.
 */

import { describe, it, expect } from 'vitest';

import { vi } from 'vitest';

import {
  sortTilesForRendering,
  calculateTileDrawRect,
  renderTiles,
} from "../../../../src/geometry/renderers/tileRenderer.ts";

import type { HexTileAssignment, TilesetDef } from '#types/tiles/tile.types';

const SQRT3 = Math.sqrt(3);

describe('tileRenderer', () => {
  describe('sortTilesForRendering', () => {
    const makeTile = (q: number, r: number): HexTileAssignment => ({
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
    const makeTileset = (overrides: Partial<TilesetDef> = {}): TilesetDef => ({
      id: 'ts1', name: 'Test', folderPath: '/test',
      tileWidth: 256, tileHeight: 256, hexHeight: 256,
      overflowTop: 0, overflowBottom: 0, tiles: [],
      ...overrides,
    });

    it('tile drawWidth matches hex width for flat-top', () => {
      const tileset = makeTileset();
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');
      // Flat-top hex width = 2 * hexSize = 160
      expect(rect.drawWidth).toBeCloseTo(2 * 80, 2);
    });

    it('tile drawHeight matches hex height for flat-top (no overflow)', () => {
      const tileset = makeTileset();
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat');
      // Flat-top hex height = sqrt(3) * hexSize
      expect(rect.drawHeight).toBeCloseTo(SQRT3 * 80, 2);
    });

    it('tile drawWidth matches hex width for pointy-top', () => {
      const tileset = makeTileset();
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');
      // Pointy-top hex width = sqrt(3) * hexSize
      expect(rect.drawWidth).toBeCloseTo(SQRT3 * 80, 2);
    });

    it('tile drawHeight matches hex height for pointy-top (no overflow)', () => {
      const tileset = makeTileset();
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');
      // Pointy-top hex height = 2 * hexSize = 160
      expect(rect.drawHeight).toBeCloseTo(2 * 80, 2);
    });

    it('extends above the hex for tall tiles with overflow', () => {
      const tileset = makeTileset({
        tileHeight: 384, overflowTop: 128,
      });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');

      const hexScreenH = 2 * 80;
      const scaleY = hexScreenH / 256;

      expect(rect.drawY).toBeCloseTo(300 - 256 * scaleY, 2);
      expect(rect.drawHeight).toBeCloseTo(384 * scaleY, 2);
    });

    it('scales with zoom', () => {
      const tileset = makeTileset();
      const rect1 = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');
      const rect2 = calculateTileDrawRect(400, 300, tileset, 80, 2, 'pointy');

      expect(rect2.drawWidth).toBeCloseTo(rect1.drawWidth * 2, 2);
      expect(rect2.drawHeight).toBeCloseTo(rect1.drawHeight * 2, 2);
    });

    it('handles equal overflow top and bottom', () => {
      const tileset = makeTileset({
        tileHeight: 384, overflowTop: 64, overflowBottom: 64,
      });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');

      const scaleY = (2 * 80) / 256;
      expect(rect.drawY).toBeCloseTo(300 - 192 * scaleY, 2);
    });

    it('Baumgart tiles (256x384) on pointy-top grid', () => {
      const tileset = makeTileset({
        tileWidth: 256, tileHeight: 384, hexHeight: 256, overflowTop: 128,
      });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');

      // drawWidth = hex width = sqrt(3) * 80
      expect(rect.drawWidth).toBeCloseTo(SQRT3 * 80, 2);
      // drawHeight = 384 * scaleY where scaleY = (2*80)/256
      const scaleY = (2 * 80) / 256;
      expect(rect.drawHeight).toBeCloseTo(384 * scaleY, 2);
    });

    // ---- fitMode: contain ----

    it('contain mode uses uniform scale (min of scaleX, scaleY) for pointy-top', () => {
      const tileset = makeTileset(); // 256x256, hexHeight=256
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy', 'contain');

      // Pointy-top: hexW = sqrt(3)*80 ≈ 138.56, hexH = 2*80 = 160
      // scaleX = 138.56/256, scaleY = 160/256
      // min = scaleX ≈ 0.5412
      const uniformScale = (SQRT3 * 80) / 256;
      expect(rect.drawWidth).toBeCloseTo(256 * uniformScale, 2);
      expect(rect.drawHeight).toBeCloseTo(256 * uniformScale, 2);
      // Aspect ratio preserved: drawWidth === drawHeight for square tile
      expect(rect.drawWidth).toBeCloseTo(rect.drawHeight, 2);
    });

    it('contain mode uses uniform scale for flat-top', () => {
      const tileset = makeTileset(); // 256x256, hexHeight=256
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'flat', 'contain');

      // Flat-top: hexW = 2*80 = 160, hexH = sqrt(3)*80 ≈ 138.56
      // scaleX = 160/256, scaleY = 138.56/256
      // min = scaleY ≈ 0.5412
      const uniformScale = (SQRT3 * 80) / 256;
      expect(rect.drawWidth).toBeCloseTo(256 * uniformScale, 2);
      expect(rect.drawHeight).toBeCloseTo(256 * uniformScale, 2);
    });

    it('contain mode centers tile horizontally in hex', () => {
      const tileset = makeTileset(); // 256x256, hexHeight=256
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy', 'contain');

      // Center position: drawX = screenX - drawWidth/2
      expect(rect.drawX).toBeCloseTo(400 - rect.drawWidth / 2, 2);
    });

    it('contain mode with overflow preserves aspect ratio', () => {
      const tileset = makeTileset({
        tileWidth: 256, tileHeight: 384, hexHeight: 256, overflowTop: 128,
      });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy', 'contain');

      // scaleX = (sqrt(3)*80)/256, scaleY = (2*80)/256
      // min = scaleX
      const uniformScale = (SQRT3 * 80) / 256;
      expect(rect.drawWidth).toBeCloseTo(256 * uniformScale, 2);
      expect(rect.drawHeight).toBeCloseTo(384 * uniformScale, 2);
      // Ratio preserved: 384/256 = 1.5
      expect(rect.drawHeight / rect.drawWidth).toBeCloseTo(384 / 256, 2);
    });

    it('fill mode is the default (backward compat)', () => {
      const tileset = makeTileset();
      const rectDefault = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');
      const rectFill = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy', 'fill');

      expect(rectDefault.drawWidth).toBeCloseTo(rectFill.drawWidth, 5);
      expect(rectDefault.drawHeight).toBeCloseTo(rectFill.drawHeight, 5);
      expect(rectDefault.drawX).toBeCloseTo(rectFill.drawX, 5);
      expect(rectDefault.drawY).toBeCloseTo(rectFill.drawY, 5);
    });

    it('tileset fitMode is used when no override provided', () => {
      const tileset = makeTileset({ fitMode: 'contain' });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy');

      // Should use contain mode via tileset.fitMode
      const uniformScale = (SQRT3 * 80) / 256;
      expect(rect.drawWidth).toBeCloseTo(256 * uniformScale, 2);
      expect(rect.drawHeight).toBeCloseTo(256 * uniformScale, 2);
    });

    it('override fitMode takes precedence over tileset fitMode', () => {
      const tileset = makeTileset({ fitMode: 'contain' });
      const rect = calculateTileDrawRect(400, 300, tileset, 80, 1, 'pointy', 'fill');

      // Override 'fill' should stretch to hex bounding box (independent scaling)
      expect(rect.drawWidth).toBeCloseTo(SQRT3 * 80, 2);
      expect(rect.drawHeight).toBeCloseTo(2 * 80, 2);
    });
  });

  describe('renderTiles overlay ordering', () => {
    const makeTileset = (): TilesetDef => ({
      id: 'ts1', name: 'Test', folderPath: '/test',
      tileWidth: 64, tileHeight: 64, hexHeight: 64,
      overflowTop: 0, overflowBottom: 0,
      tiles: [
        { id: 'base1', filename: 'base1.png', vaultPath: '/test/base1.png' },
        { id: 'overlay1', filename: 'overlay1.png', vaultPath: '/test/overlay1.png' },
      ],
    });

    const makeGeometry = () => ({
      hexToWorld: (q: number, r: number) => ({ worldX: q * 100, worldY: r * 100 }),
      worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => ({
        screenX: (wx + ox) * zoom, screenY: (wy + oy) * zoom,
      }),
      hexSize: 32,
      orientation: 'flat' as const,
    });

    it('renders base tiles before overlay tiles', () => {
      const baseImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'base' } as unknown as HTMLImageElement;
      const overlayImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'overlay' } as unknown as HTMLImageElement;
      const drawOrder: string[] = [];
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn((img: HTMLImageElement) => {
          drawOrder.push((img as any)._tag);
        }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const ts = makeTileset();
      ts.tiles.push({ id: 'overlay1', filename: 'overlay.png', vaultPath: 'Tiles/overlay.png' });

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'overlay1', layer: 'overlay' },
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1' },  // no layer = base
      ];

      renderTiles(ctx, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: (path: string) => path.includes('overlay') ? overlayImg : baseImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect(drawOrder).toEqual(['base', 'overlay']);
    });

    it('does not crash with overlay-only tiles', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'overlay1', layer: 'overlay' },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('treats tiles without layer field as base', () => {
      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1' },
        { q: 1, r: 0, tilesetId: 'ts1', tileId: 'base1', layer: 'base' },
      ];
      // Both should be treated as base — verify by sorting
      const baseTiles = tiles.filter(t => (t.layer || 'base') === 'base');
      const overlayTiles = tiles.filter(t => t.layer === 'overlay');
      expect(baseTiles).toHaveLength(2);
      expect(overlayTiles).toHaveLength(0);
    });

    it('renders freeform stamps using worldX/worldY coordinates', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const drawCalls: { x: number; y: number }[] = [];
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn((_img: HTMLImageElement, x: number, y: number) => {
          drawCalls.push({ x, y });
        }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1', freeform: true, worldX: 50, worldY: 75 },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // worldToScreen(50, 75, 0, 0, 1) = { screenX: 50, screenY: 75 }
      // Flat-top hex: hexScreenWidth = 2*32 = 64, so drawWidth = 64
      // drawX = 50 - 64/2 = 18
      expect(drawCalls[0].x).toBeCloseTo(18, 0);
    });

    it('renders freeform stamps after base and overlay tiles', () => {
      const baseImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'base' } as unknown as HTMLImageElement;
      const overlayImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'overlay' } as unknown as HTMLImageElement;
      const freeformImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'freeform' } as unknown as HTMLImageElement;
      const drawOrder: string[] = [];
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn((img: HTMLImageElement) => {
          drawOrder.push((img as any)._tag);
        }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const ts = makeTileset();
      ts.tiles.push(
        { id: 'overlay1', filename: 'overlay.png', vaultPath: 'Tiles/overlay.png' },
        { id: 'freeform1', filename: 'freeform.png', vaultPath: 'Tiles/freeform.png' },
      );

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'freeform1', freeform: true, worldX: 50, worldY: 75 },
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1' },
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'overlay1', layer: 'overlay' },
      ];

      renderTiles(ctx, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: (path: string) => {
          if (path.includes('freeform')) return freeformImg;
          if (path.includes('overlay')) return overlayImg;
          return baseImg;
        },
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(3);
      expect(drawOrder).toEqual(['base', 'overlay', 'freeform']);
    });

    it('applies rotation transform when tile has rotation', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1', rotation: 60 },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.rotate).toHaveBeenCalledWith((60 * Math.PI) / 180);
      expect(ctx.restore).toHaveBeenCalled();
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('applies horizontal flip when tile has flipH', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1', flipH: true },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('auto-detects small stamps and applies contain-style scaling', () => {
      // Small image (55px) in a large tileset (256px) should auto-detect as stamp
      const smallImg = { naturalWidth: 55, naturalHeight: 55 } as HTMLImageElement;
      const drawCalls: { x: number; y: number; w: number; h: number }[] = [];
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn((_img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
          drawCalls.push({ x, y, w, h });
        }),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const ts: TilesetDef = {
        id: 'ts1', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'stamp1', filename: 'stamp.png', vaultPath: 'Tiles/stamp.png' }],
      };

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'stamp1' },
      ];

      renderTiles(ctx, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => smallImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // The draw width should be much smaller than the hex bounding box (64px for flat-top at hexSize 32)
      expect(drawCalls[0].w).toBeLessThan(32);
    });

    it('skips tiles outside viewport (culling)', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 100, r: 100, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 100,
        canvasHeight: 100,
      });

      // Tile at q=100, r=100 is far off-screen for a 100x100 canvas
      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('renders tile within viewport margin', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = {
        globalAlpha: 1,
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
      } as unknown as CanvasRenderingContext2D;

      const tiles: HexTileAssignment[] = [
        { q: 0, r: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });
  });
});
