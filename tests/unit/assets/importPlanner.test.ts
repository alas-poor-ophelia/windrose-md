import { describe, it, expect } from 'vitest';
import type { TileEntry } from '#types/tiles/tile.types';
import {
  aggregateFolderTiers,
  mineFilenameTags,
  TAG_MAX_SUGGESTIONS,
} from '../../../src/assets/importPlanner';

function tile(vaultPath: string, category?: string): TileEntry {
  const filename = vaultPath.split('/').pop() ?? '';
  return { id: filename.replace(/\.\w+$/, ''), filename, vaultPath, category, tags: category?.split('/') };
}

describe('aggregateFolderTiers', () => {
  it('votes a confident tier per folder from filenames', () => {
    const rows = aggregateFolderTiers([
      tile('T/Floors/floor_stone_01.png', 'Floors'),
      tile('T/Floors/floor_wood_02.png', 'Floors'),
      tile('T/Walls/wall_brick_01.png', 'Walls'),
      tile('T/Walls/wall_stone_02.png', 'Walls'),
    ]);
    expect(rows).toHaveLength(2);
    const floors = rows.find(r => r.category === 'Floors');
    const walls = rows.find(r => r.category === 'Walls');
    expect(floors?.tier).toBe('ground');
    expect(floors?.auto).toBe(true);
    expect(floors?.tileCount).toBe(2);
    expect(walls?.tier).toBe('structure');
    expect(walls?.auto).toBe(true);
  });

  it('marks zero-signal folders as check (not auto)', () => {
    const rows = aggregateFolderTiers([
      tile('T/Misc/zzqx_01.png', 'Misc'),
      tile('T/Misc/qqxx_02.png', 'Misc'),
    ]);
    expect(rows[0].auto).toBe(false);
  });

  it('formats nested categories and groups root files under (root)', () => {
    const rows = aggregateFolderTiers([
      tile('T/Floors/Stone/a.png', 'Floors/Stone'),
      tile('T/loose.png', undefined),
    ]);
    expect(rows.find(r => r.category === 'Floors/Stone')?.displayPath).toBe('Floors / Stone');
    expect(rows.find(r => r.category === '')?.displayPath).toBe('(root)');
  });

  it('carries the folder paths for the finish step', () => {
    const rows = aggregateFolderTiers([
      tile('T/Walls/a.png', 'Walls'),
      tile('T/Walls/b.png', 'Walls'),
    ]);
    expect(rows[0].paths).toEqual(['T/Walls/a.png', 'T/Walls/b.png']);
  });
});

describe('mineFilenameTags', () => {
  it('counts distinct tiles per token with a highlight sample', () => {
    const tags = mineFilenameTags([
      tile('T/Walls/wall_stone_ruined_01.png', 'Walls'),
      tile('T/Walls/wall_brick_ruined_03.png', 'Walls'),
      tile('T/Floors/floor_mossy.png', 'Floors'),
    ]);
    const ruined = tags.find(t => t.tag === 'ruined');
    expect(ruined?.count).toBe(2);
    expect(ruined?.paths).toEqual([
      'T/Walls/wall_stone_ruined_01.png',
      'T/Walls/wall_brick_ruined_03.png',
    ]);
    expect(ruined?.sample.filename).toBe('wall_stone_ruined_01.png');
    expect(ruined?.sample.start).toBe('wall_stone_'.length);
    expect(ruined?.sample.length).toBe('ruined'.length);
  });

  it('drops singletons, noise words, short tokens, and variant suffixes', () => {
    const tags = mineFilenameTags([
      tile('T/X/the_old_bed_01a_a.png', 'X'),
      tile('T/X/the_old_chair_02b_b.png', 'X'),
    ]);
    const names = tags.map(t => t.tag);
    expect(names).toContain('old');       // 2 matches, meaningful
    expect(names).not.toContain('the');   // NOISE
    expect(names).not.toContain('bed');   // singleton
    expect(names).not.toContain('a');     // variant letter
  });

  it('excludes tokens already supplied by the tile own subfolder', () => {
    const tags = mineFilenameTags([
      tile('T/Stone/stone_floor_a1.png', 'Stone'),
      tile('T/Stone/stone_wall_b2.png', 'Stone'),
      tile('T/Walls/wall_stone_01.png', 'Walls'),
      tile('T/Walls/wall_stone_02.png', 'Walls'),
    ]);
    const stone = tags.find(t => t.tag === 'stone');
    // 'stone' is redundant inside Stone/ but a real tag in Walls/.
    expect(stone?.count).toBe(2);
    expect(stone?.paths.every(p => p.startsWith('T/Walls/'))).toBe(true);
  });

  it('counts a repeated token once per tile', () => {
    const tags = mineFilenameTags([
      tile('T/X/dark_dark_wood.png', 'X'),
      tile('T/X/dark_iron.png', 'X'),
    ]);
    expect(tags.find(t => t.tag === 'dark')?.count).toBe(2);
  });

  it('sorts by count descending and caps the list', () => {
    const tiles: TileEntry[] = [];
    // 40 distinct tokens, each on 2 tiles; 'common' on 10 tiles.
    for (let i = 0; i < 40; i++) {
      tiles.push(tile(`T/X/thing_token${'abcdefghij'[i % 10]}${Math.floor(i / 10)}x_1.png`, 'X'));
    }
    for (let i = 0; i < 10; i++) tiles.push(tile(`T/X/common_item_${i}v.png`, 'X'));
    for (let i = 0; i < 10; i++) tiles.push(tile(`T/X/common_stuff_${i}w.png`, 'X'));

    const tags = mineFilenameTags(tiles);
    expect(tags.length).toBeLessThanOrEqual(TAG_MAX_SUGGESTIONS);
    // 'thing' is on all 40 generated files, 'common' on the 20 extras.
    expect(tags[0].tag).toBe('thing');
    expect(tags[0].count).toBe(40);
    expect(tags[1].tag).toBe('common');
    expect(tags[1].count).toBe(20);
  });
});
