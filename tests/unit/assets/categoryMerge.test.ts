import { describe, it, expect } from 'vitest';

import type { FolderInput } from '../../../src/assets/categoryMerge';
import {
  MERGE_THRESHOLD,
  normalizeTokens,
  cleanLabel,
  diceCoefficient,
  clusterCategories,
} from '../../../src/assets/categoryMerge';

describe('categoryMerge — normalizeTokens', () => {
  it('strips grid/packaging NOISE words', () => {
    expect([...normalizeTokens('Hex Forest Tiles')]).toEqual(['forest']);
    expect([...normalizeTokens('Stone Floor Tileset')]).toEqual(['stone', 'floors']);
  });

  it('applies the ALIAS table (material/synonym variants → canonical token)', () => {
    expect(normalizeTokens('Plank Flooring')).toEqual(new Set(['wood', 'floors']));
    expect(normalizeTokens('Cobblestone Walls')).toEqual(new Set(['stone', 'walls']));
    expect(normalizeTokens('Doors & Portals')).toEqual(new Set(['doors']));
    expect(normalizeTokens('Crates and Barrels')).toEqual(new Set(['containers']));
  });

  it('splits camelCase, parens, and mixed delimiters', () => {
    expect(normalizeTokens('Foliage/Forest (Hex)')).toEqual(new Set(['foliage', 'forest']));
    expect(normalizeTokens('stoneWall_set')).toEqual(new Set(['stone', 'walls']));
  });

  it('returns an empty set when every token is noise', () => {
    expect(normalizeTokens('Hex Tiles Set').size).toBe(0);
  });
});

describe('categoryMerge — cleanLabel', () => {
  it('removes noise words but keeps original casing/order', () => {
    expect(cleanLabel('Hex Stone Flooring')).toBe('Stone Flooring');
    expect(cleanLabel('Rivers, Coasts & Lakes')).toBe('Rivers, Coasts & Lakes');
  });

  it('falls back to the trimmed raw when all words are noise', () => {
    expect(cleanLabel('  Hex Tiles  ')).toBe('Hex Tiles');
  });
});

describe('categoryMerge — diceCoefficient', () => {
  it('is 1 for identical token sets', () => {
    expect(diceCoefficient(new Set(['stone', 'floors']), new Set(['stone', 'floors']))).toBe(1);
  });

  it('computes partial overlap as 2|∩| / (|a|+|b|)', () => {
    // {foliage,forest} vs {forest} → 2*1/(2+1) = 0.666...
    expect(diceCoefficient(new Set(['foliage', 'forest']), new Set(['forest']))).toBeCloseTo(0.667, 3);
  });

  it('is 0 when either set is empty or disjoint', () => {
    expect(diceCoefficient(new Set<string>(), new Set(['x']))).toBe(0);
    expect(diceCoefficient(new Set(['a']), new Set(['b']))).toBe(0);
  });

  it('the partial-overlap example clears the merge threshold', () => {
    expect(diceCoefficient(new Set(['foliage', 'forest']), new Set(['forest']))).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
  });
});

describe('categoryMerge — clusterCategories (the headline dedupe)', () => {
  it('collapses three cross-pack folder variants into one "Forest" category', () => {
    const folders: FolderInput[] = [
      { raw: 'Hex Forest', pack: 'core', curated: true },
      { raw: 'Forest Hex Tiles', pack: 'crypt' },
      { raw: 'Foliage/Forest (Hex)', pack: 'wilds' },
    ];
    const clusters = clusterCategories(folders);

    expect(clusters).toHaveLength(1);
    const forest = clusters[0];
    expect(forest.label).toBe('Forest');
    expect(forest.merged).toBe(true);
    expect(forest.members).toHaveLength(3);
    // Pack provenance is retained on each member.
    expect(forest.members.map(m => m.pack).sort()).toEqual(['core', 'crypt', 'wilds']);
  });

  it('lets the curated/Core pack seed the canonical label even when it arrives second', () => {
    const folders: FolderInput[] = [
      { raw: 'Plank Flooring', pack: 'crypt' },        // seeds first, non-core
      { raw: 'Wood Floors', pack: 'core', curated: true }, // core joins, takes the label
    ];
    const clusters = clusterCategories(folders);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].label).toBe('Wood Floors');
    expect(clusters[0].merged).toBe(true);
  });

  it('keeps dissimilar folders in separate clusters (below threshold)', () => {
    const folders: FolderInput[] = [
      { raw: 'Stone Walls', pack: 'core', curated: true },
      { raw: 'Wood Floors', pack: 'core', curated: true },
    ];
    const clusters = clusterCategories(folders);
    expect(clusters).toHaveLength(2);
    expect(clusters.every(c => c.merged === false)).toBe(true);
  });

  it('records provenance: seed scores 1, fuzzy members score their Dice value', () => {
    const folders: FolderInput[] = [
      { raw: 'Forest', pack: 'core', curated: true },
      { raw: 'Foliage/Forest', pack: 'wilds' },
    ];
    const clusters = clusterCategories(folders);
    const [seed, fuzzy] = clusters[0].members;
    expect(seed.score).toBe(1);
    expect(fuzzy.score).toBeGreaterThanOrEqual(MERGE_THRESHOLD);
    expect(fuzzy.score).toBeLessThan(1);
  });

  it('does not merge two all-noise folders together (empty token sets stay apart)', () => {
    const folders: FolderInput[] = [
      { raw: 'Hex Tiles', pack: 'a' },
      { raw: 'Square Set', pack: 'b' },
    ];
    const clusters = clusterCategories(folders);
    expect(clusters).toHaveLength(2);
  });
});
