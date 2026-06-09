import { describe, it, expect } from 'vitest';

import {
  getEntryMetadata,
  setEntryMetadata,
  toggleStar,
  addUserTag,
  removeUserTag,
  bulkAddTag,
  bulkToggleStar,
  isStarred,
  getUserTags,
  getAllTags,
  collectUniqueTags,
  collectDepthAwareTags,
  setImportTags,
  bulkSetImportTags,
  setDepthAffinity,
  bulkSetDepthAffinity,
  bulkSetDdSourceType,
  getTileMetadataForRender,
  setTileMetadataForRender,
} from '../../../src/persistence/tileMetadata';

import type { TileMetadataStore, TileEntry } from '#types/tiles/tile.types';

function makeTile(vaultPath: string, opts?: Partial<TileEntry>): TileEntry {
  const filename = vaultPath.split('/').pop() ?? vaultPath;
  return {
    id: filename.replace(/\.[^.]+$/, ''),
    filename,
    vaultPath,
    ...opts,
  };
}

describe('tileMetadata', () => {
  // ---- getEntryMetadata ----
  describe('getEntryMetadata', () => {
    it('returns stored entry', () => {
      const store: TileMetadataStore = { 'a.png': { starred: true } };
      expect(getEntryMetadata(store, 'a.png')).toEqual({ starred: true });
    });

    it('returns empty object for missing path', () => {
      expect(getEntryMetadata({}, 'missing.png')).toEqual({});
    });
  });

  // ---- setEntryMetadata ----
  describe('setEntryMetadata', () => {
    it('creates entry for new path', () => {
      const result = setEntryMetadata({}, 'a.png', { starred: true });
      expect(result['a.png']).toEqual({ starred: true });
    });

    it('merges with existing entry', () => {
      const store: TileMetadataStore = { 'a.png': { starred: true, userTags: ['foo'] } };
      const result = setEntryMetadata(store, 'a.png', { userTags: ['bar'] });
      expect(result['a.png']).toEqual({ starred: true, userTags: ['bar'] });
    });

    it('does not mutate original store', () => {
      const store: TileMetadataStore = { 'a.png': { starred: false } };
      setEntryMetadata(store, 'a.png', { starred: true });
      expect(store['a.png']?.starred).toBe(false);
    });
  });

  // ---- toggleStar ----
  describe('toggleStar', () => {
    it('stars unstarred tile', () => {
      const result = toggleStar({}, 'a.png');
      expect(result['a.png']?.starred).toBe(true);
    });

    it('unstars starred tile', () => {
      const store: TileMetadataStore = { 'a.png': { starred: true } };
      const result = toggleStar(store, 'a.png');
      expect(result['a.png']?.starred).toBe(false);
    });

    it('preserves other fields', () => {
      const store: TileMetadataStore = { 'a.png': { starred: true, userTags: ['x'] } };
      const result = toggleStar(store, 'a.png');
      expect(result['a.png']?.userTags).toEqual(['x']);
    });
  });

  // ---- isStarred ----
  describe('isStarred', () => {
    it('returns true for starred tile', () => {
      expect(isStarred({ 'a.png': { starred: true } }, 'a.png')).toBe(true);
    });

    it('returns false for missing tile', () => {
      expect(isStarred({}, 'a.png')).toBe(false);
    });

    it('returns false for undefined starred', () => {
      expect(isStarred({ 'a.png': {} }, 'a.png')).toBe(false);
    });
  });

  // ---- addUserTag ----
  describe('addUserTag', () => {
    it('adds tag to empty tags', () => {
      const result = addUserTag({}, 'a.png', 'Stone');
      expect(getUserTags(result, 'a.png')).toEqual(['Stone']);
    });

    it('appends tag to existing tags', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone'] } };
      const result = addUserTag(store, 'a.png', 'Floor');
      expect(getUserTags(result, 'a.png')).toEqual(['Stone', 'Floor']);
    });

    it('rejects case-insensitive duplicate', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone'] } };
      const result = addUserTag(store, 'a.png', 'stone');
      expect(result).toBe(store); // same reference — no change
    });

    it('rejects exact duplicate', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone'] } };
      const result = addUserTag(store, 'a.png', 'Stone');
      expect(result).toBe(store);
    });
  });

  // ---- removeUserTag ----
  describe('removeUserTag', () => {
    it('removes matching tag', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone', 'Floor'] } };
      const result = removeUserTag(store, 'a.png', 'Stone');
      expect(getUserTags(result, 'a.png')).toEqual(['Floor']);
    });

    it('removes case-insensitively', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone'] } };
      const result = removeUserTag(store, 'a.png', 'stone');
      expect(getUserTags(result, 'a.png')).toEqual([]);
    });

    it('no-ops for missing tag', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Stone'] } };
      const result = removeUserTag(store, 'a.png', 'Wood');
      expect(getUserTags(result, 'a.png')).toEqual(['Stone']);
    });
  });

  // ---- getUserTags ----
  describe('getUserTags', () => {
    it('returns empty array for missing entry', () => {
      expect(getUserTags({}, 'a.png')).toEqual([]);
    });

    it('returns empty array for entry without tags', () => {
      expect(getUserTags({ 'a.png': { starred: true } }, 'a.png')).toEqual([]);
    });
  });

  // ---- bulkAddTag ----
  describe('bulkAddTag', () => {
    it('adds tag to multiple paths', () => {
      const result = bulkAddTag({}, ['a.png', 'b.png', 'c.png'], 'Terrain');
      expect(getUserTags(result, 'a.png')).toEqual(['Terrain']);
      expect(getUserTags(result, 'b.png')).toEqual(['Terrain']);
      expect(getUserTags(result, 'c.png')).toEqual(['Terrain']);
    });

    it('skips paths that already have the tag', () => {
      const store: TileMetadataStore = { 'a.png': { userTags: ['Terrain'] } };
      const result = bulkAddTag(store, ['a.png', 'b.png'], 'Terrain');
      expect(getUserTags(result, 'a.png')).toEqual(['Terrain']);
      expect(getUserTags(result, 'b.png')).toEqual(['Terrain']);
    });
  });

  // ---- bulkToggleStar ----
  describe('bulkToggleStar', () => {
    it('stars multiple paths', () => {
      const result = bulkToggleStar({}, ['a.png', 'b.png'], true);
      expect(isStarred(result, 'a.png')).toBe(true);
      expect(isStarred(result, 'b.png')).toBe(true);
    });

    it('unstars multiple paths', () => {
      const store: TileMetadataStore = {
        'a.png': { starred: true },
        'b.png': { starred: true },
      };
      const result = bulkToggleStar(store, ['a.png', 'b.png'], false);
      expect(isStarred(result, 'a.png')).toBe(false);
      expect(isStarred(result, 'b.png')).toBe(false);
    });
  });

  // ---- setImportTags / bulkSetImportTags ----
  describe('setImportTags', () => {
    it('sets import tags on new entry', () => {
      const result = setImportTags({}, 'a.png', ['Furniture', 'Lighting']);
      expect(result['a.png']?.importTags).toEqual(['Furniture', 'Lighting']);
    });

    it('replaces existing import tags', () => {
      const store: TileMetadataStore = { 'a.png': { importTags: ['Old'] } };
      const result = setImportTags(store, 'a.png', ['New']);
      expect(result['a.png']?.importTags).toEqual(['New']);
    });
  });

  describe('bulkSetImportTags', () => {
    it('sets import tags on multiple entries', () => {
      const result = bulkSetImportTags({}, [
        { vaultPath: 'a.png', tags: ['Floor'] },
        { vaultPath: 'b.png', tags: ['Wall', 'Door'] },
      ]);
      expect(result['a.png']?.importTags).toEqual(['Floor']);
      expect(result['b.png']?.importTags).toEqual(['Wall', 'Door']);
    });
  });

  // ---- setDepthAffinity / bulkSetDepthAffinity ----
  describe('setDepthAffinity', () => {
    it('sets depth affinity', () => {
      const result = setDepthAffinity({}, 'a.png', 'ground');
      expect(result['a.png']?.depthAffinity).toBe('ground');
    });
  });

  describe('bulkSetDepthAffinity', () => {
    it('sets depth on multiple entries', () => {
      const result = bulkSetDepthAffinity({}, [
        { vaultPath: 'a.png', depth: 'ground' },
        { vaultPath: 'b.png', depth: 'structure' },
      ]);
      expect(result['a.png']?.depthAffinity).toBe('ground');
      expect(result['b.png']?.depthAffinity).toBe('structure');
    });
  });

  // ---- bulkSetDdSourceType ----
  describe('bulkSetDdSourceType', () => {
    it('sets DD source type on multiple entries', () => {
      const result = bulkSetDdSourceType({}, [
        { vaultPath: 'a.png', sourceType: 'walls' },
        { vaultPath: 'b.png', sourceType: 'objects' },
      ]);
      expect(result['a.png']?.ddSourceType).toBe('walls');
      expect(result['b.png']?.ddSourceType).toBe('objects');
    });

    it('preserves existing fields', () => {
      const store: TileMetadataStore = { 'a.png': { starred: true } };
      const result = bulkSetDdSourceType(store, [
        { vaultPath: 'a.png', sourceType: 'patterns' },
      ]);
      expect(result['a.png']?.starred).toBe(true);
      expect(result['a.png']?.ddSourceType).toBe('patterns');
    });
  });

  // ---- getAllTags (multi-source merge) ----
  describe('getAllTags', () => {
    it('returns folder tags when no metadata', () => {
      const tile = makeTile('a.png', { tags: ['Stone', 'Floor'] });
      expect(getAllTags(tile, {})).toEqual(['Stone', 'Floor']);
    });

    it('merges folder + import + user tags', () => {
      const tile = makeTile('a.png', { tags: ['Stone'] });
      const store: TileMetadataStore = {
        'a.png': { importTags: ['Terrain'], userTags: ['Custom'] },
      };
      expect(getAllTags(tile, store)).toEqual(['Stone', 'Terrain', 'Custom']);
    });

    it('deduplicates case-insensitively', () => {
      const tile = makeTile('a.png', { tags: ['Stone'] });
      const store: TileMetadataStore = {
        'a.png': { importTags: ['stone'], userTags: ['STONE'] },
      };
      expect(getAllTags(tile, store)).toEqual(['Stone']);
    });

    it('preserves original casing of first occurrence', () => {
      const tile = makeTile('a.png', { tags: ['Terrain'] });
      const store: TileMetadataStore = {
        'a.png': { importTags: ['terrain'], userTags: ['TERRAIN'] },
      };
      const result = getAllTags(tile, store);
      expect(result).toEqual(['Terrain']);
    });

    it('returns empty array for tile with no tags and no metadata', () => {
      const tile = makeTile('a.png');
      expect(getAllTags(tile, {})).toEqual([]);
    });

    it('handles tile with undefined tags field', () => {
      const tile = makeTile('a.png');
      const store: TileMetadataStore = { 'a.png': { userTags: ['Custom'] } };
      expect(getAllTags(tile, store)).toEqual(['Custom']);
    });
  });

  // ---- collectUniqueTags ----
  describe('collectUniqueTags', () => {
    it('aggregates tags across multiple tiles', () => {
      const tiles = [
        makeTile('a.png', { tags: ['Stone'] }),
        makeTile('b.png', { tags: ['Wood'] }),
      ];
      const result = collectUniqueTags(tiles, {});
      expect(result).toEqual(['Stone', 'Wood']);
    });

    it('deduplicates case-insensitively across tiles', () => {
      const tiles = [
        makeTile('a.png', { tags: ['Stone'] }),
        makeTile('b.png', { tags: ['stone'] }),
      ];
      const result = collectUniqueTags(tiles, {});
      expect(result).toEqual(['Stone']);
    });

    it('sorts alphabetically', () => {
      const tiles = [
        makeTile('a.png', { tags: ['Zebra'] }),
        makeTile('b.png', { tags: ['Apple'] }),
        makeTile('c.png', { tags: ['Mango'] }),
      ];
      const result = collectUniqueTags(tiles, {});
      expect(result).toEqual(['Apple', 'Mango', 'Zebra']);
    });

    it('includes metadata tags in aggregation', () => {
      const tiles = [makeTile('a.png', { tags: ['Stone'] })];
      const store: TileMetadataStore = { 'a.png': { userTags: ['Custom'] } };
      const result = collectUniqueTags(tiles, store);
      expect(result).toEqual(['Custom', 'Stone']);
    });

    it('returns empty for no tiles', () => {
      expect(collectUniqueTags([], {})).toEqual([]);
    });
  });

  // ---- collectDepthAwareTags ----
  describe('collectDepthAwareTags', () => {
    it('promotes tags from tiles matching active depth', () => {
      const tiles = [
        makeTile('floor.png', { tags: ['Terrain'] }),
        makeTile('wall.png', { tags: ['Architecture'] }),
      ];
      const store: TileMetadataStore = {
        'floor.png': { depthAffinity: 'ground' },
        'wall.png': { depthAffinity: 'structure' },
      };
      const result = collectDepthAwareTags(tiles, store, 'ground');
      expect(result[0]).toBe('terrain');
    });

    it('puts non-matching tags after matching tags', () => {
      const tiles = [
        makeTile('floor.png', { tags: ['Terrain'] }),
        makeTile('wall.png', { tags: ['Stone'] }),
      ];
      const store: TileMetadataStore = {
        'floor.png': { depthAffinity: 'ground' },
        'wall.png': { depthAffinity: 'structure' },
      };
      const result = collectDepthAwareTags(tiles, store, 'ground');
      expect(result.indexOf('terrain')).toBeLessThan(result.indexOf('stone'));
    });

    it('deduplicates: shared tag in both buckets stays in boosted only', () => {
      const tiles = [
        makeTile('a.png', { tags: ['Stone'] }),
        makeTile('b.png', { tags: ['Stone'] }),
      ];
      const store: TileMetadataStore = {
        'a.png': { depthAffinity: 'ground' },
        'b.png': { depthAffinity: 'structure' },
      };
      const result = collectDepthAwareTags(tiles, store, 'ground');
      const stoneOccurrences = result.filter(t => t === 'stone');
      expect(stoneOccurrences.length).toBe(1);
    });

    it('returns empty for no tiles', () => {
      expect(collectDepthAwareTags([], {}, 'ground')).toEqual([]);
    });

    it('sorts by frequency within each bucket', () => {
      const tiles = [
        makeTile('a.png', { tags: ['Rare'] }),
        makeTile('b.png', { tags: ['Common'] }),
        makeTile('c.png', { tags: ['Common'] }),
      ];
      const store: TileMetadataStore = {
        'a.png': { depthAffinity: 'ground' },
        'b.png': { depthAffinity: 'ground' },
        'c.png': { depthAffinity: 'ground' },
      };
      const result = collectDepthAwareTags(tiles, store, 'ground');
      expect(result.indexOf('common')).toBeLessThan(result.indexOf('rare'));
    });
  });

  // ---- render accessor ----
  describe('render accessor', () => {
    it('round-trips the store the renderer reads each frame', () => {
      const store: TileMetadataStore = { 'terrain/grass.png': { renderMode: 'region' } };
      setTileMetadataForRender(store);
      expect(getTileMetadataForRender()).toBe(store);
    });

    it('replaces the prior store on a subsequent set (last write wins)', () => {
      setTileMetadataForRender({ 'a.png': { renderMode: 'region' } });
      const next: TileMetadataStore = { 'b.png': { renderMode: 'cell' } };
      setTileMetadataForRender(next);
      const current = getTileMetadataForRender();
      expect(current).toBe(next);
      expect(current['a.png']).toBeUndefined();
    });
  });
});
