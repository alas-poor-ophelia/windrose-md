import { describe, it, expect } from 'vitest';
import { predictRenderMode, predictRenderModes, DD_SOURCE_TO_RENDERMODE } from '../../../src/assets/renderModePredictor';
import type { TileEntry, TileMetadataEntry } from '../../../types/tiles/tile.types';

function makeTile(filename: string, opts?: Partial<TileEntry>): TileEntry {
  return {
    id: filename.replace(/\.[^.]+$/, ''),
    filename,
    vaultPath: `tilesets/test/${filename}`,
    ...opts,
  };
}

// A filename with no head-noun keyword, to isolate other signals.
const NEUTRAL = 'asset123.png';

describe('predictRenderMode', () => {
  describe('DD source signal', () => {
    it('classifies terrain/patterns sources as region', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), { ddSourceType: 'terrain' });
      expect(r.mode).toBe('region');
      expect(r.confidence).toBeCloseTo(0.5, 6);
      expect(predictRenderMode(makeTile(NEUTRAL), { ddSourceType: 'patterns' }).mode).toBe('region');
    });

    it('classifies objects/walls sources as cell', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), { ddSourceType: 'objects' });
      expect(r.mode).toBe('cell');
      expect(r.confidence).toBeCloseTo(0.5, 6);
      expect(predictRenderMode(makeTile(NEUTRAL), { ddSourceType: 'walls' }).mode).toBe('cell');
    });
  });

  describe('alpha coverage signal', () => {
    it('treats near-opaque images as region', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), { alphaCoverage: 0.98 });
      expect(r.mode).toBe('region');
    });

    it('treats sparse images as cell', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), { alphaCoverage: 0.2 });
      expect(r.mode).toBe('cell');
    });

    it('contributes nothing in the ambiguous mid-band', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), { alphaCoverage: 0.7 });
      expect(r.confidence).toBe(0);
      expect(r.mode).toBe('cell');
    });
  });

  describe('filename head-noun signal', () => {
    it('maps ground-tier nouns to region', () => {
      expect(predictRenderMode(makeTile('stone_floor.png'), undefined).mode).toBe('region');
      expect(predictRenderMode(makeTile('grass.png'), undefined).mode).toBe('region');
    });

    it('maps prop/structure nouns to cell', () => {
      expect(predictRenderMode(makeTile('wooden_table.png'), undefined).mode).toBe('cell');
      expect(predictRenderMode(makeTile('stone_wall.png'), undefined).mode).toBe('cell');
    });
  });

  describe('combined signals', () => {
    it('stacks region signals toward full confidence', () => {
      const r = predictRenderMode(makeTile('grass_floor.png'), { ddSourceType: 'terrain', alphaCoverage: 0.96 });
      expect(r.mode).toBe('region');
      expect(r.confidence).toBe(1);
    });

    it('stacks cell signals for a transparent object', () => {
      const r = predictRenderMode(makeTile('wooden_table.png'), { ddSourceType: 'objects', alphaCoverage: 0.25 });
      expect(r.mode).toBe('cell');
      expect(r.confidence).toBe(1);
    });

    it('returns zero-confidence cell when no signal fires', () => {
      const r = predictRenderMode(makeTile(NEUTRAL), undefined);
      expect(r.mode).toBe('cell');
      expect(r.confidence).toBe(0);
    });
  });

  it('predictRenderModes maps every tile by vaultPath', () => {
    const tiles = [makeTile('grass.png'), makeTile('table.png')];
    const map = predictRenderModes(tiles, {
      [tiles[0].vaultPath]: { ddSourceType: 'terrain' } as TileMetadataEntry,
      [tiles[1].vaultPath]: { ddSourceType: 'objects' } as TileMetadataEntry,
    });
    expect(map.get(tiles[0].vaultPath)?.mode).toBe('region');
    expect(map.get(tiles[1].vaultPath)?.mode).toBe('cell');
  });

  it('exposes a sane DD source map', () => {
    expect(DD_SOURCE_TO_RENDERMODE.terrain).toBe('region');
    expect(DD_SOURCE_TO_RENDERMODE.objects).toBe('cell');
  });
});
