import { describe, it, expect } from 'vitest';
import { extractTokens, predictDepthTier, predictDepthTiers, HEAD_NOUN_KEYWORDS, DD_PATH_TO_DEPTH, DD_TAG_TO_DEPTH } from '../../../src/assets/depthPredictor';
import type { TileEntry, TileMetadataEntry } from '../../../types/tiles/tile.types';

function makeTile(filename: string, opts?: Partial<TileEntry>): TileEntry {
  return {
    id: filename.replace(/\.[^.]+$/, ''),
    filename,
    vaultPath: `tilesets/test/${filename}`,
    ...opts,
  };
}

describe('extractTokens', () => {
  it('splits snake_case filenames', () => {
    expect(extractTokens('stone_floor.png')).toEqual(['stone', 'floor']);
  });

  it('splits PascalCase filenames', () => {
    expect(extractTokens('TableRound.png')).toEqual(['table', 'round']);
  });

  it('splits camelCase filenames', () => {
    expect(extractTokens('weaponRack.webp')).toEqual(['weapon', 'rack']);
  });

  it('strips numeric suffixes', () => {
    expect(extractTokens('Pillar1.png')).toEqual(['pillar']);
    expect(extractTokens('Pillar2b.png')).toEqual(['pillar']);
  });

  it('handles kebab-case', () => {
    expect(extractTokens('stone-wall.png')).toEqual(['stone', 'wall']);
  });

  it('handles single word filenames', () => {
    expect(extractTokens('grass.png')).toEqual(['grass']);
  });

  it('handles mixed delimiters', () => {
    expect(extractTokens('old_stone-Wall.png')).toEqual(['old', 'stone', 'wall']);
  });

  it('strips extension correctly', () => {
    expect(extractTokens('tile.webp')).toEqual(['tile']);
    expect(extractTokens('a.b.png')).toEqual(['a']);
  });
});

describe('predictDepthTier', () => {
  describe('head noun disambiguation', () => {
    it('classifies stone_floor as ground', () => {
      const result = predictDepthTier(makeTile('stone_floor.png'), undefined);
      expect(result.tier).toBe('ground');
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('classifies stone_wall as structure', () => {
      const result = predictDepthTier(makeTile('stone_wall.png'), undefined);
      expect(result.tier).toBe('structure');
    });

    it('classifies stone_table as props', () => {
      const result = predictDepthTier(makeTile('stone_table.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('classifies wooden_door as structure', () => {
      const result = predictDepthTier(makeTile('wooden_door.png'), undefined);
      expect(result.tier).toBe('structure');
    });

    it('classifies iron_torch as decoration', () => {
      const result = predictDepthTier(makeTile('iron_torch.png'), undefined);
      expect(result.tier).toBe('decoration');
    });
  });

  describe('single-word filenames', () => {
    it('classifies grass as ground', () => {
      const result = predictDepthTier(makeTile('grass.png'), undefined);
      expect(result.tier).toBe('ground');
    });

    it('classifies barrel as props', () => {
      const result = predictDepthTier(makeTile('barrel.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('classifies torch as decoration', () => {
      const result = predictDepthTier(makeTile('torch.webp'), undefined);
      expect(result.tier).toBe('decoration');
    });

    it('classifies pillar as structure', () => {
      const result = predictDepthTier(makeTile('pillar.png'), undefined);
      expect(result.tier).toBe('structure');
    });
  });

  describe('PascalCase filenames from real data', () => {
    it('classifies Trapdoor as structure', () => {
      const result = predictDepthTier(makeTile('Trapdoor.png'), undefined);
      expect(result.tier).toBe('structure');
    });

    it('classifies Bookshelf as props', () => {
      const result = predictDepthTier(makeTile('Bookshelf.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('classifies Barrel as props', () => {
      const result = predictDepthTier(makeTile('Barrel.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('classifies Throne as props', () => {
      const result = predictDepthTier(makeTile('Throne.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('classifies Fireplace as props', () => {
      const result = predictDepthTier(makeTile('Fireplace.png'), undefined);
      expect(result.tier).toBe('props');
    });
  });

  describe('DD source type signal', () => {
    it('boosts ground confidence for patterns source', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'patterns' };
      const result = predictDepthTier(makeTile('unknown.png'), entry);
      expect(result.tier).toBe('ground');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('boosts structure confidence for walls source', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'walls' };
      const result = predictDepthTier(makeTile('unknown.png'), entry);
      expect(result.tier).toBe('structure');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('boosts props confidence for objects source', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'objects' };
      const result = predictDepthTier(makeTile('unknown.png'), entry);
      expect(result.tier).toBe('props');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });

    it('boosts decoration confidence for lights source', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'lights' };
      const result = predictDepthTier(makeTile('unknown.png'), entry);
      expect(result.tier).toBe('decoration');
      expect(result.confidence).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('combined signals', () => {
    it('DD source + matching head noun = high confidence', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'walls' };
      const result = predictDepthTier(makeTile('stone_wall.png'), entry);
      expect(result.tier).toBe('structure');
      expect(result.confidence).toBeGreaterThanOrEqual(0.7);
    });

    it('DD source overrides contradicting head noun', () => {
      const entry: TileMetadataEntry = { ddSourceType: 'walls' };
      const result = predictDepthTier(makeTile('stone_floor.png'), entry);
      // walls source (0.50) vs floor head noun (0.30) → structure wins
      expect(result.tier).toBe('structure');
    });

    it('import tags contribute to scoring', () => {
      const entry: TileMetadataEntry = { importTags: ['Furniture'] };
      const result = predictDepthTier(makeTile('thing.png'), entry);
      expect(result.tier).toBe('props');
    });

    it('folder tags contribute via head noun keywords', () => {
      const tile = makeTile('item.png', { tags: ['Lighting'] });
      const result = predictDepthTier(tile, undefined);
      expect(result.tier).toBe('decoration');
    });
  });

  describe('confidence thresholds', () => {
    it('unknown filename has low confidence', () => {
      const result = predictDepthTier(makeTile('xyz123.png'), undefined);
      expect(result.confidence).toBeLessThan(0.4);
    });

    it('known filename has at least medium confidence', () => {
      const result = predictDepthTier(makeTile('wall.png'), undefined);
      expect(result.confidence).toBeGreaterThanOrEqual(0.3);
    });
  });

  describe('numeric suffix handling', () => {
    it('Pillar1 → pillar → structure', () => {
      const result = predictDepthTier(makeTile('Pillar1.png'), undefined);
      expect(result.tier).toBe('structure');
    });

    it('Sarcophagus7 → sarcophagus → props', () => {
      const result = predictDepthTier(makeTile('Sarcophagus7.png'), undefined);
      expect(result.tier).toBe('props');
    });

    it('Crate3 → crate → props', () => {
      const result = predictDepthTier(makeTile('Crate3.png'), undefined);
      expect(result.tier).toBe('props');
    });
  });
});

describe('HEAD_NOUN_KEYWORDS coverage', () => {
  it('has entries for all four tiers', () => {
    const tiers = new Set(Object.values(HEAD_NOUN_KEYWORDS));
    expect(tiers.has('ground')).toBe(true);
    expect(tiers.has('structure')).toBe(true);
    expect(tiers.has('props')).toBe(true);
    expect(tiers.has('decoration')).toBe(true);
  });

  it('has at least 20 entries per tier', () => {
    const counts = { ground: 0, structure: 0, props: 0, decoration: 0 };
    for (const tier of Object.values(HEAD_NOUN_KEYWORDS)) {
      counts[tier]++;
    }
    expect(counts.ground).toBeGreaterThanOrEqual(20);
    expect(counts.structure).toBeGreaterThanOrEqual(20);
    expect(counts.props).toBeGreaterThanOrEqual(20);
    expect(counts.decoration).toBeGreaterThanOrEqual(20);
  });
});

describe('adversarial & edge cases', () => {
  it('empty filename produces low confidence and defaults to props', () => {
    const result = predictDepthTier(makeTile('.png'), undefined);
    expect(result.confidence).toBeLessThan(0.1);
    expect(result.tier).toBe('props');
  });

  it('filename with only numbers defaults to props with low confidence', () => {
    const result = predictDepthTier(makeTile('12345.png'), undefined);
    expect(result.confidence).toBeLessThan(0.1);
  });

  it('contradictory tags do not exceed confidence 1.0', () => {
    const entry: TileMetadataEntry = {
      ddSourceType: 'walls',
      importTags: ['Furniture', 'Lighting', 'Obstacle', 'Structural'],
      userTags: ['Floor', 'Wall', 'Table', 'Torch'],
    };
    const tile = makeTile('stone_floor_wall_table.png', {
      tags: ['Terrain', 'Structure'],
    });
    const result = predictDepthTier(tile, entry);
    expect(result.confidence).toBeLessThanOrEqual(1.0);
  });

  it('tile with no signals at all defaults to props', () => {
    const result = predictDepthTier(makeTile('qwxyz.png'), undefined);
    expect(result.tier).toBe('props');
  });

  it('first token fallback when last token is unrecognized', () => {
    // "wall" is first token (recognized), "xyz" is last (unrecognized)
    const result = predictDepthTier(makeTile('wall_xyz.png'), undefined);
    expect(result.tier).toBe('structure');
    expect(result.confidence).toBeGreaterThanOrEqual(0.2);
  });

  it('first token fallback has lower weight than last token match', () => {
    // Last token match gets 0.30, first token fallback gets 0.25
    const lastMatch = predictDepthTier(makeTile('xyz_wall.png'), undefined);
    const firstMatch = predictDepthTier(makeTile('wall_xyz.png'), undefined);
    expect(lastMatch.confidence).toBeGreaterThan(firstMatch.confidence);
  });
});

describe('predictDepthTiers batch', () => {
  it('produces a result for each tile', () => {
    const tiles = [
      makeTile('floor.png'),
      makeTile('wall.png'),
      makeTile('barrel.png'),
    ];
    const results = predictDepthTiers(tiles, {});
    expect(results.size).toBe(3);
    expect(results.get('tilesets/test/floor.png')?.tier).toBe('ground');
    expect(results.get('tilesets/test/wall.png')?.tier).toBe('structure');
    expect(results.get('tilesets/test/barrel.png')?.tier).toBe('props');
  });

  it('uses metadata entries when available', () => {
    const tiles = [makeTile('unknown.png')];
    const metadata = { 'tilesets/test/unknown.png': { ddSourceType: 'lights' } };
    const results = predictDepthTiers(tiles, metadata);
    expect(results.get('tilesets/test/unknown.png')?.tier).toBe('decoration');
  });

  it('returns empty map for empty tile array', () => {
    expect(predictDepthTiers([], {}).size).toBe(0);
  });
});

describe('DD_PATH_TO_DEPTH mapping', () => {
  it('maps all 9 DD path prefixes', () => {
    expect(Object.keys(DD_PATH_TO_DEPTH).length).toBe(9);
  });

  it('covers all four tiers', () => {
    const tiers = new Set(Object.values(DD_PATH_TO_DEPTH));
    expect(tiers.has('ground')).toBe(true);
    expect(tiers.has('structure')).toBe(true);
    expect(tiers.has('props')).toBe(true);
    expect(tiers.has('decoration')).toBe(true);
  });
});

describe('DD_TAG_TO_DEPTH mapping', () => {
  it('maps furniture to props', () => {
    expect(DD_TAG_TO_DEPTH['furniture']).toBe('props');
  });

  it('maps lighting to decoration', () => {
    expect(DD_TAG_TO_DEPTH['lighting']).toBe('decoration');
  });

  it('maps structural to structure', () => {
    expect(DD_TAG_TO_DEPTH['structural']).toBe('structure');
  });

  it('maps ocean to ground', () => {
    expect(DD_TAG_TO_DEPTH['ocean']).toBe('ground');
  });
});
