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
  computeRegionPatternTransform,
  regionFeatherPx,
  shadowBlurImage,
  pyramidLevels,
  pyramidBlurImage,
  tileOrientationAdaptation,
} from "../../../../src/geometry/renderers/tileRenderer";

import type { TileAssignment, TilesetDef } from '#types/tiles/tile.types';

const SQRT3 = Math.sqrt(3);

describe('tileRenderer', () => {
  describe('sortTilesForRendering', () => {
    const makeTile = (col: number, row: number): TileAssignment => ({
      col, row, tilesetId: 'ts1', tileId: 'tile1',
    });

    it('sorts by offset row ascending (flat-top)', () => {
      const tiles = [makeTile(0, 2), makeTile(0, 0), makeTile(0, 1)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted.map(t => t.row)).toEqual([0, 1, 2]);
    });

    it('sorts by offset row ascending (pointy-top)', () => {
      const tiles = [makeTile(0, 3), makeTile(0, 1), makeTile(0, 2)];
      const sorted = sortTilesForRendering(tiles, 'pointy');
      expect(sorted.map(t => t.row)).toEqual([1, 2, 3]);
    });

    it('breaks ties by column', () => {
      const tiles = [makeTile(2, 0), makeTile(0, 0), makeTile(1, 0)];
      const sorted = sortTilesForRendering(tiles, 'flat');
      expect(sorted.map(t => t.col)).toEqual([0, 1, 2]);
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
      expect(sorted[0].col).toBe(1);
      expect(sorted[0].row).toBe(0);
    });

    it('treats tiles without layer field as base when sorting', () => {
      // Tiles with no layer and tiles with layer='base' should sort identically
      const tilesNoLayer: TileAssignment[] = [
        { col: 0, row: 2, tilesetId: 'ts1', tileId: 'tile1' },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'tile1' },
        { col: 0, row: 1, tilesetId: 'ts1', tileId: 'tile1' },
      ];
      const tilesExplicitBase: TileAssignment[] = [
        { col: 0, row: 2, tilesetId: 'ts1', tileId: 'tile1', placement: 'fill' },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'tile1', placement: 'fill' },
        { col: 0, row: 1, tilesetId: 'ts1', tileId: 'tile1', placement: 'fill' },
      ];
      const sortedNoLayer = sortTilesForRendering(tilesNoLayer, 'flat');
      const sortedExplicit = sortTilesForRendering(tilesExplicitBase, 'flat');
      expect(sortedNoLayer.map(t => t.row)).toEqual(sortedExplicit.map(t => t.row));
    });
  });

  describe('calculateTileDrawRect', () => {
    const makeTileset = (overrides: Partial<TilesetDef> = {}): TilesetDef => ({
      source: 'folder', id: 'ts1', name: 'Test', folderPath: '/test',
      tileWidth: 256, tileHeight: 256, hexHeight: 256,
      overflowTop: 0, overflowBottom: 0, tiles: [],
      ...overrides,
    } as TilesetDef);

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

    it('scales the draw rect by footprint span on grid (fill)', () => {
      const tileset = makeTileset();
      const base = calculateTileDrawRect(400, 300, tileset, 80, 1, 'grid', 'fill', 1, 1);
      const wide = calculateTileDrawRect(400, 300, tileset, 80, 1, 'grid', 'fill', 2, 1);
      const tall = calculateTileDrawRect(400, 300, tileset, 80, 1, 'grid', 'fill', 1, 3);
      expect(wide.drawWidth).toBeCloseTo(base.drawWidth * 2, 2);
      expect(wide.drawHeight).toBeCloseTo(base.drawHeight, 2);
      expect(tall.drawHeight).toBeCloseTo(base.drawHeight * 3, 2);
      expect(tall.drawWidth).toBeCloseTo(base.drawWidth, 2);
    });

    it('span defaults to 1x1 (omitted args leave the rect unchanged)', () => {
      const tileset = makeTileset();
      const omitted = calculateTileDrawRect(400, 300, tileset, 80, 1, 'grid', 'fill');
      const explicit = calculateTileDrawRect(400, 300, tileset, 80, 1, 'grid', 'fill', 1, 1);
      expect(omitted).toEqual(explicit);
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

  describe('tileOrientationAdaptation', () => {
    it('rotates pointy art +30° and sizes in the pointy frame on flat maps', () => {
      expect(tileOrientationAdaptation('flat', 'pointy'))
        .toEqual({ sizeOrientation: 'pointy', rotationDeg: 30 });
    });

    it('rotates flat art -30° and sizes in the flat frame on pointy maps', () => {
      expect(tileOrientationAdaptation('pointy', 'flat'))
        .toEqual({ sizeOrientation: 'flat', rotationDeg: -30 });
    });

    it('adapts nothing when art matches the map orientation', () => {
      expect(tileOrientationAdaptation('flat', 'flat'))
        .toEqual({ sizeOrientation: 'flat', rotationDeg: 0 });
      expect(tileOrientationAdaptation('pointy', 'pointy'))
        .toEqual({ sizeOrientation: 'pointy', rotationDeg: 0 });
    });

    it('adapts nothing when art orientation is unknown', () => {
      expect(tileOrientationAdaptation('flat', undefined))
        .toEqual({ sizeOrientation: 'flat', rotationDeg: 0 });
    });

    it('adapts nothing on grid maps regardless of art orientation', () => {
      expect(tileOrientationAdaptation('grid', 'pointy'))
        .toEqual({ sizeOrientation: 'grid', rotationDeg: 0 });
    });
  });

  describe('renderTiles', () => {
    const makeTileset = (overrides: Partial<TilesetDef> = {}): TilesetDef => ({
      source: 'folder', id: 'ts1', name: 'Test', folderPath: '/test',
      tileWidth: 64, tileHeight: 64, hexHeight: 64,
      overflowTop: 0, overflowBottom: 0,
      tiles: [
        { id: 'base1', filename: 'base1.png', vaultPath: '/test/base1.png' },
        { id: 'overlay1', filename: 'overlay1.png', vaultPath: '/test/overlay1.png' },
      ],
      ...overrides,
    } as TilesetDef);

    const makeGeometry = () => ({
      hexToWorld: (q: number, r: number) => ({ worldX: q * 100, worldY: r * 100 }),
      worldToScreen: (wx: number, wy: number, ox: number, oy: number, zoom: number) => ({
        screenX: (wx + ox) * zoom, screenY: (wy + oy) * zoom,
      }),
      hexSize: 32,
      orientation: 'flat' as const,
    });

    function makeCtx() {
      return {
        drawImage: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        translate: vi.fn(),
        rotate: vi.fn(),
        scale: vi.fn(),
        globalAlpha: 1,
      };
    }

    it('renders base tiles before overlay tiles', () => {
      const baseImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'base' } as unknown as HTMLImageElement;
      const overlayImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'overlay' } as unknown as HTMLImageElement;
      const drawOrder: string[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((img: HTMLImageElement) => {
        drawOrder.push((img as any)._tag);
      });

      const ts = makeTileset();
      ts.tiles.push({ id: 'overlay1', filename: 'overlay.png', vaultPath: 'Tiles/overlay.png' });

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'overlay1', placement: 'overlay' },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },  // no layer = base
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: (path: string) => path.includes('overlay') ? overlayImg : baseImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(2);
      expect(drawOrder).toEqual(['base', 'overlay']);
    });

    it('does not crash with overlay-only tiles', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'overlay1', placement: 'overlay' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('treats tiles without layer field as base (rendered before overlays)', () => {
      const baseImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'noLayer' } as unknown as HTMLImageElement;
      const overlayImg = { naturalWidth: 64, naturalHeight: 64, _tag: 'overlay' } as unknown as HTMLImageElement;
      const drawOrder: string[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((img: HTMLImageElement) => {
        drawOrder.push((img as any)._tag);
      });

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'overlay1', placement: 'overlay' },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' }, // no layer field
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: (path: string) => path.includes('overlay') ? overlayImg : baseImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      // Tile without layer should render in the base group (before overlay)
      expect(drawOrder).toEqual(['noLayer', 'overlay']);
    });

    it('renders freeform stamps using worldX/worldY coordinates', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const drawCalls: { x: number; y: number }[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((_img: HTMLImageElement, x: number, y: number) => {
        drawCalls.push({ x, y });
      });

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1', freeform: true, worldX: 50, worldY: 75 },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
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
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((img: HTMLImageElement) => {
        drawOrder.push((img as any)._tag);
      });

      const ts = makeTileset();
      ts.tiles.push(
        { id: 'overlay1', filename: 'overlay.png', vaultPath: 'Tiles/overlay.png' },
        { id: 'freeform1', filename: 'freeform.png', vaultPath: 'Tiles/freeform.png' },
      );

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'freeform1', freeform: true, worldX: 50, worldY: 75 },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'overlay1', placement: 'overlay' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
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
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1', rotation: 60 },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
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
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1', flipH: true },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.save).toHaveBeenCalled();
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.restore).toHaveBeenCalled();
    });

    it('applies both rotation and flipH when both are set', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1', rotation: 120, flipH: true },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.save).toHaveBeenCalledTimes(1);
      expect(ctx.rotate).toHaveBeenCalledWith((120 * Math.PI) / 180);
      expect(ctx.scale).toHaveBeenCalledWith(-1, 1);
      expect(ctx.restore).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    it('auto-detects small stamps and applies contain-style scaling', () => {
      // Small image (55px) in a large tileset (256px) should auto-detect as stamp
      const smallImg = { naturalWidth: 55, naturalHeight: 55 } as HTMLImageElement;
      const drawCalls: { x: number; y: number; w: number; h: number }[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((_img: HTMLImageElement, x: number, y: number, w: number, h: number) => {
        drawCalls.push({ x, y, w, h });
      });

      const ts: TilesetDef = { source: 'folder',
        id: 'ts-autodetect', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'stamp1', filename: 'stamp.png', vaultPath: 'Tiles/stamp.png' }],
      };

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts-autodetect', tileId: 'stamp1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => smallImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // The draw width should be much smaller than the hex bounding box (64px for flat-top at hexSize 32)
      expect(drawCalls[0].w).toBeLessThan(32);
    });

    it('enforces minimum stamp size as 20% of hex screen dimension', () => {
      // Extremely small stamp (10x10) in a large tileset (256px)
      // Without clamp: baseScale = min(64/256, 55.4/256) ≈ 0.216, drawWidth = 10*0.216 ≈ 2.16px
      // With clamp: minHexDim ≈ 55.4, minStampDim = 55.4*0.2 ≈ 11.08, so clamp should activate
      const tinyImg = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
      const drawCalls: { w: number; h: number }[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number, h: number) => {
        drawCalls.push({ w, h });
      });

      const ts: TilesetDef = { source: 'folder',
        id: 'ts-min', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'stamp1', filename: 'stamp.png', vaultPath: 'Tiles/stamp.png' }],
      };

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts-min', tileId: 'stamp1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => tinyImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // hexScreenHeight (flat, hexSize=32) = sqrt(3)*32 ≈ 55.4, minStampDim = 55.4*0.2 ≈ 11.08
      // Both dimensions should be at least ~11px (20% of smaller hex dim)
      expect(drawCalls[0].w).toBeGreaterThanOrEqual(11);
      expect(drawCalls[0].h).toBeGreaterThanOrEqual(11);
    });

    it('preserves aspect ratio for non-square stamps with minimum clamp', () => {
      // Non-square stamp: 20x80 in a 256px tileset
      const rectImg = { naturalWidth: 20, naturalHeight: 80 } as HTMLImageElement;
      const drawCalls: { w: number; h: number }[] = [];
      const ctx = makeCtx();
      ctx.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number, h: number) => {
        drawCalls.push({ w, h });
      });

      const ts: TilesetDef = { source: 'folder',
        id: 'ts-ar', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'stamp1', filename: 'stamp.png', vaultPath: 'Tiles/stamp.png' }],
      };

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts-ar', tileId: 'stamp1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => rectImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // Aspect ratio must be preserved: w/h should equal 20/80 = 0.25
      const ratio = drawCalls[0].w / drawCalls[0].h;
      expect(ratio).toBeCloseTo(0.25, 2);
    });

    it('stamp minimum size scales with zoom level', () => {
      const tinyImg = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;
      const ts: TilesetDef = { source: 'folder',
        id: 'ts-zoom', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'stamp1', filename: 'stamp.png', vaultPath: 'Tiles/stamp.png' }],
      };
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts-zoom', tileId: 'stamp1' },
      ];

      // Render at zoom=1
      const drawCalls1: { w: number }[] = [];
      const ctx1 = makeCtx();
      ctx1.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawCalls1.push({ w });
      });
      renderTiles(ctx1 as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => tinyImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      // Render at zoom=0.5
      const drawCalls05: { w: number }[] = [];
      const ctx05 = makeCtx();
      ctx05.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawCalls05.push({ w });
      });
      renderTiles(ctx05 as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 0.5 }, {
        getCachedImage: () => tinyImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      // At zoom=0.5, draw width should be half of zoom=1 (hex-proportional, not fixed pixel)
      expect(drawCalls05[0].w).toBeCloseTo(drawCalls1[0].w * 0.5, 1);
    });

    it('preserves relative scale between different stamp sizes', () => {
      const smallImg = { naturalWidth: 30, naturalHeight: 30 } as HTMLImageElement;
      const largeImg = { naturalWidth: 100, naturalHeight: 100 } as HTMLImageElement;
      // Use unique tileset ID to avoid entry map cache collision
      const tsSmall: TilesetDef = {
        source: 'folder', id: 'ts-scale-s', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'small', filename: 'small.png', vaultPath: 'Tiles/small.png' }],
      };
      const tsLarge: TilesetDef = {
        source: 'folder', id: 'ts-scale-l', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 'large', filename: 'large.png', vaultPath: 'Tiles/large.png' }],
      };

      // Render small stamp
      const drawSmall: { w: number }[] = [];
      const ctx1 = makeCtx();
      ctx1.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawSmall.push({ w });
      });
      renderTiles(ctx1 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-scale-s', tileId: 'small' }],
        [tsSmall], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => smallImg,
          canvasWidth: 800, canvasHeight: 600,
        });

      // Render large stamp
      const drawLarge: { w: number }[] = [];
      const ctx2 = makeCtx();
      ctx2.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawLarge.push({ w });
      });
      renderTiles(ctx2 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-scale-l', tileId: 'large' }],
        [tsLarge], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => largeImg,
          canvasWidth: 800, canvasHeight: 600,
        });

      // 80px stamp should render larger than 30px stamp
      expect(drawLarge[0].w).toBeGreaterThan(drawSmall[0].w);
    });

    it('respects custom stampThreshold on tileset', () => {
      // 150px image in 256px tileset: ratio = 0.586
      // Default threshold (0.5): NOT a stamp (0.586 >= 0.5)
      // Custom threshold (0.7): IS a stamp (0.586 < 0.7)
      const img = { naturalWidth: 150, naturalHeight: 150 } as HTMLImageElement;

      // With default threshold — should use hex-filling (calculateTileDrawRect)
      const drawDefault: { w: number }[] = [];
      const ctx1 = makeCtx();
      ctx1.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawDefault.push({ w });
      });
      const tsDefault: TilesetDef = {
        source: 'folder', id: 'ts-thresh-def', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 't1', filename: 't1.png', vaultPath: 'Tiles/t1.png' }],
      };
      renderTiles(ctx1 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-thresh-def', tileId: 't1' }],
        [tsDefault], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => img,
          canvasWidth: 800, canvasHeight: 600,
        });

      // With stampThreshold=0.7 — same image becomes a stamp (smaller draw size)
      const drawCustom: { w: number }[] = [];
      const ctx2 = makeCtx();
      ctx2.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawCustom.push({ w });
      });
      const tsCustom: TilesetDef = {
        source: 'folder', id: 'ts-thresh-cust', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0, stampThreshold: 0.7,
        tiles: [{ id: 't1', filename: 't1.png', vaultPath: 'Tiles/t1.png' }],
      };
      renderTiles(ctx2 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-thresh-cust', tileId: 't1' }],
        [tsCustom], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => img,
          canvasWidth: 800, canvasHeight: 600,
        });

      // Default should render at hex-fill size, custom at stamp size (smaller)
      expect(drawDefault[0].w).toBeGreaterThan(drawCustom[0].w);
    });

    it('respects custom minStampScale on tileset', () => {
      // Tiny stamp (10x10) in 256px tileset
      const tinyImg = { naturalWidth: 10, naturalHeight: 10 } as HTMLImageElement;

      // With default minStampScale (0.2) — 20% of hex dim
      const drawDefault: { w: number }[] = [];
      const ctx1 = makeCtx();
      ctx1.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawDefault.push({ w });
      });
      const tsDefault: TilesetDef = {
        source: 'folder', id: 'ts-minsc-def', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0,
        tiles: [{ id: 't1', filename: 't1.png', vaultPath: 'Tiles/t1.png' }],
      };
      renderTiles(ctx1 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-minsc-def', tileId: 't1' }],
        [tsDefault], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => tinyImg,
          canvasWidth: 800, canvasHeight: 600,
        });

      // With minStampScale=0.4 — 40% of hex dim (should render larger)
      const drawLarger: { w: number }[] = [];
      const ctx2 = makeCtx();
      ctx2.drawImage.mockImplementation((_img: HTMLImageElement, _x: number, _y: number, w: number) => {
        drawLarger.push({ w });
      });
      const tsLarger: TilesetDef = {
        source: 'folder', id: 'ts-minsc-lg', name: 'Test', folderPath: 'Tiles',
        tileWidth: 256, tileHeight: 256, hexHeight: 256,
        overflowTop: 0, overflowBottom: 0, minStampScale: 0.4,
        tiles: [{ id: 't1', filename: 't1.png', vaultPath: 'Tiles/t1.png' }],
      };
      renderTiles(ctx2 as unknown as CanvasRenderingContext2D,
        [{ col: 0, row: 0, tilesetId: 'ts-minsc-lg', tileId: 't1' }],
        [tsLarger], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
          getCachedImage: () => tinyImg,
          canvasWidth: 800, canvasHeight: 600,
        });

      // 40% min scale should produce larger stamps than 20%
      expect(drawLarger[0].w).toBeGreaterThan(drawDefault[0].w);
    });

    it('skips tiles outside viewport (culling)', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 100, row: 100, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 100,
        canvasHeight: 100,
      });

      // Tile at q=100, r=100 is far off-screen for a 100x100 canvas
      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('renders tile within viewport margin', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
    });

    // ---- Art-orientation adaptation ----

    it('sizes mismatched pointy art in the pointy frame and rotates 30° on flat maps', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();
      const rects: Array<{ w: number; h: number }> = [];
      ctx.drawImage.mockImplementation((_img: unknown, _x: number, _y: number, w: number, h: number) => {
        rects.push({ w, h });
      });

      const ts = makeTileset({ artOrientation: 'pointy' });
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      // Map is flat (hexSize 32): pointy frame = sqrt(3)*32 wide, 2*32 tall
      expect(rects[0].w).toBeCloseTo(SQRT3 * 32, 2);
      expect(rects[0].h).toBeCloseTo(2 * 32, 2);
      expect(ctx.rotate).toHaveBeenCalledWith((30 * Math.PI) / 180);
    });

    it('does not rotate or reframe when art orientation matches the map', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();
      const rects: Array<{ w: number; h: number }> = [];
      ctx.drawImage.mockImplementation((_img: unknown, _x: number, _y: number, w: number, h: number) => {
        rects.push({ w, h });
      });

      const ts = makeTileset({ artOrientation: 'flat' });
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      // Flat frame on a flat map: 2*32 wide, sqrt(3)*32 tall, no rotation
      expect(rects[0].w).toBeCloseTo(2 * 32, 2);
      expect(rects[0].h).toBeCloseTo(SQRT3 * 32, 2);
      expect(ctx.rotate).not.toHaveBeenCalled();
    });

    it('composes user rotation with the orientation adaptation', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const ts = makeTileset({ artOrientation: 'pointy' });
      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1', rotation: 60 },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [ts], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.rotate).toHaveBeenCalledWith((90 * Math.PI) / 180);
    });

    // ---- Error guard tests ----

    it('skips tile when getCachedImage returns null (image not loaded)', () => {
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => null,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('skips tile referencing a tilesetId not in tilesets array', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'nonexistent', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('skips tile referencing a tileId not in its tileset', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'nonexistent_tile' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('sets globalAlpha when opacity < 1 and restores it after', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();
      const alphaValues: number[] = [];
      ctx.drawImage.mockImplementation(() => {
        alphaValues.push(ctx.globalAlpha);
      });

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        opacity: 0.5,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // During drawImage, globalAlpha should have been set to 0.5
      expect(alphaValues[0]).toBeCloseTo(0.5);
      // After rendering, globalAlpha should be restored to 1
      expect(ctx.globalAlpha).toBe(1);
    });

    it('does not modify globalAlpha when opacity is 1', () => {
      const fakeImg = { naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement;
      const ctx = makeCtx();
      const alphaValues: number[] = [];
      ctx.drawImage.mockImplementation(() => {
        alphaValues.push(ctx.globalAlpha);
      });

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => fakeImg,
        canvasWidth: 800,
        canvasHeight: 600,
      });

      expect(alphaValues[0]).toBe(1);
    });

    it('returns early without drawing when tiles array is empty', () => {
      const ctx = makeCtx();

      renderTiles(ctx as unknown as CanvasRenderingContext2D, [], [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => null,
      });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('returns early without drawing when tilesets array is empty', () => {
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [], makeGeometry(), { x: 0, y: 0, zoom: 1 }, {
        getCachedImage: () => ({ naturalWidth: 64, naturalHeight: 64 } as HTMLImageElement),
      });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });

    it('returns early without drawing when getCachedImage is not provided', () => {
      const ctx = makeCtx();

      const tiles: TileAssignment[] = [
        { col: 0, row: 0, tilesetId: 'ts1', tileId: 'base1' },
      ];

      renderTiles(ctx as unknown as CanvasRenderingContext2D, tiles, [makeTileset()], makeGeometry(), { x: 0, y: 0, zoom: 1 });

      expect(ctx.drawImage).not.toHaveBeenCalled();
    });
  });

  describe('computeRegionPatternTransform', () => {
    // screenPerWorld = zoom (screen px per world unit); cellSize in world units.
    it('makes one full texture span cover worldRepeat cells on screen', () => {
      const cellSize = 100;
      const screenPerWorld = 1; // zoom 1
      const naturalWidth = 3000;
      const R = 4;
      const { scale } = computeRegionPatternTransform(naturalWidth, R, cellSize, screenPerWorld, 0, 0);
      // texture width on screen = scale * naturalWidth, should equal R cells of screen px
      expect(scale * naturalWidth).toBeCloseTo(R * cellSize * screenPerWorld);
    });

    it('anchors the pattern at the supplied world-origin screen point', () => {
      const { translateX, translateY } = computeRegionPatternTransform(2000, 4, 100, 2, 37.5, -12.25);
      expect(translateX).toBe(37.5);
      expect(translateY).toBe(-12.25);
    });

    it('scales linearly with screenPerWorld (zoom)', () => {
      const base = computeRegionPatternTransform(3000, 4, 100, 1, 0, 0);
      const zoomed = computeRegionPatternTransform(3000, 4, 100, 2, 0, 0);
      expect(zoomed.scale).toBeCloseTo(base.scale * 2);
    });

    it('produces smaller features (smaller scale) for larger textures', () => {
      const small = computeRegionPatternTransform(1500, 4, 100, 1, 0, 0);
      const large = computeRegionPatternTransform(3000, 4, 100, 1, 0, 0);
      // A 3000px texture spanning the same world area => each pixel maps to less screen
      expect(large.scale).toBeCloseTo(small.scale / 2);
    });

    it('bigger worldRepeat makes texture features bigger (larger scale)', () => {
      const tight = computeRegionPatternTransform(3000, 2, 100, 1, 0, 0);
      const wide = computeRegionPatternTransform(3000, 6, 100, 1, 0, 0);
      expect(wide.scale).toBeGreaterThan(tight.scale);
    });

    it('falls back to the default repeat when worldRepeat is non-positive', () => {
      const zero = computeRegionPatternTransform(3000, 0, 100, 1, 0, 0);
      const four = computeRegionPatternTransform(3000, 4, 100, 1, 0, 0);
      expect(zero.scale).toBeCloseTo(four.scale);
    });

    it('does not divide by zero for a zero-width image', () => {
      const { scale } = computeRegionPatternTransform(0, 4, 100, 1, 0, 0);
      expect(Number.isFinite(scale)).toBe(true);
    });
  });

  describe('shadowBlurImage', () => {
    function makeShadowCtx() {
      return {
        save: vi.fn(),
        restore: vi.fn(),
        drawImage: vi.fn(),
        shadowColor: '',
        shadowBlur: 0,
        shadowOffsetX: 0,
      };
    }

    it('draws the source fully off-canvas with the shadow offset back into view', () => {
      const ctx = makeShadowCtx();
      const src = { width: 200, height: 100 } as HTMLCanvasElement;
      let atDraw: { blur: number; offX: number; x: number } | null = null;
      ctx.drawImage.mockImplementation((_s: HTMLCanvasElement, x: number) => {
        atDraw = { blur: ctx.shadowBlur, offX: ctx.shadowOffsetX, x };
      });

      shadowBlurImage(ctx as unknown as CanvasRenderingContext2D, src, 10);

      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      // Source must sit entirely left of the canvas (x + width <= 0)…
      expect(atDraw!.x + src.width).toBeLessThanOrEqual(0);
      // …with the shadow offset landing it exactly back at the origin.
      expect(atDraw!.offX).toBe(-atDraw!.x);
      // Shadow sigma is shadowBlur/2; filter blur(N) uses sigma N → 2× factor.
      expect(atDraw!.blur).toBe(20);
    });

    it('wraps shadow state changes in save/restore', () => {
      const ctx = makeShadowCtx();
      const src = { width: 50, height: 50 } as HTMLCanvasElement;
      shadowBlurImage(ctx as unknown as CanvasRenderingContext2D, src, 4);
      expect(ctx.save).toHaveBeenCalledTimes(1);
      expect(ctx.restore).toHaveBeenCalledTimes(1);
    });
  });

  describe('pyramidLevels', () => {
    it('scales with the blur radius (log2)', () => {
      expect(pyramidLevels(2)).toBe(1);
      expect(pyramidLevels(8)).toBe(3);
      expect(pyramidLevels(16)).toBe(4);
    });

    it('clamps to [1, 5]', () => {
      expect(pyramidLevels(0)).toBe(1);
      expect(pyramidLevels(1)).toBe(1);
      expect(pyramidLevels(10000)).toBe(5);
    });
  });

  describe('pyramidBlurImage', () => {
    it('degrades to a plain blit when no scratch canvases exist (non-DOM env)', () => {
      const ctx = {
        save: vi.fn(), restore: vi.fn(), drawImage: vi.fn(),
        clearRect: vi.fn(), imageSmoothingEnabled: true,
      };
      const src = { width: 100, height: 80 } as HTMLCanvasElement;
      pyramidBlurImage(ctx as unknown as CanvasRenderingContext2D, src, 100, 80, 8);
      // typeof document === 'undefined' in the unit env → hard blit fallback
      expect(ctx.drawImage).toHaveBeenCalledTimes(1);
      expect(ctx.drawImage).toHaveBeenCalledWith(src, 0, 0);
    });
  });

  describe('regionFeatherPx', () => {
    it('scales feather with cell size and ratio', () => {
      expect(regionFeatherPx(80, 0.25)).toBeCloseTo(20);
      expect(regionFeatherPx(40, 0.5)).toBeCloseTo(20);
    });

    it('returns 0 for a zero/negative ratio (hard edges)', () => {
      expect(regionFeatherPx(80, 0)).toBe(0);
      expect(regionFeatherPx(80, -0.3)).toBe(0);
    });

    it('returns 0 for a non-positive cell size', () => {
      expect(regionFeatherPx(0, 0.25)).toBe(0);
    });
  });
});
