// @vitest-environment happy-dom
/**
 * useTileFilterPipeline (STRUCT-A-14): the tile browser's search / facet /
 * role / grouping pipeline, extracted from TileAssetBrowser. Covers text
 * search (filename, category, metadata tags), category scoping through the
 * rail selection, group + pack ordering, tag AND-filter, the grid role filter,
 * the walls feature gate, and hidden wall end caps.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import type { TileEntry, TileMetadataStore, TilesetDef } from '#types/tiles/tile.types';
import { useTileFilterPipeline } from '../../../../src/hooks/tiles/useTileFilterPipeline';
import type { TileFilterPipeline, TileFilterPipelineInput } from '../../../../src/hooks/tiles/useTileFilterPipeline';

let root: HTMLElement | null = null;

afterEach(() => {
  if (root) { render(null, root); root.remove(); root = null; }
});

function run(input: TileFilterPipelineInput): TileFilterPipeline {
  let latest: TileFilterPipeline | null = null;
  const Probe = (props: { input: TileFilterPipelineInput }): null => {
    latest = useTileFilterPipeline(props.input);
    return null;
  };
  root = document.createElement('div');
  document.body.appendChild(root);
  const r = root;
  act(() => { render(h(Probe, { input }), r); });
  if (latest == null) throw new Error('not mounted');
  return latest;
}

const tile = (vaultPath: string, category: string, tags?: string[]): TileEntry => ({
  id: vaultPath.split('/').slice(1).join('/'),
  filename: vaultPath.split('/').pop() ?? vaultPath,
  vaultPath,
  category,
  tags,
});

const tileset = (id: string, name: string, tiles: TileEntry[]): TilesetDef =>
  ({ id, name, tiles, kind: 'folder', folderPath: id }) as unknown as TilesetDef;

const stone = tile('dungeon/stone_floor.png', 'Floors');
const wood = tile('dungeon/wood_floor.png', 'Floors', ['wooden']);
const oak = tile('nature/oak_tree.png', 'Trees');
const pine = tile('nature/pine_tree.png', 'Trees');
const wall = tile('dungeon/brick_wall.png', 'Walls');
const wallCap = tile('dungeon/brick_wall_end.png', 'Walls');

const tilesets: TilesetDef[] = [
  tileset('dungeon', 'Dungeon Pack', [stone, wood, wall, wallCap]),
  tileset('nature', 'Nature Pack', [oak, pine]),
];

const metadata: TileMetadataStore = {
  [oak.vaultPath]: { userTags: ['forest'], depthAffinity: 'props' },
  [pine.vaultPath]: { userTags: ['forest'], depthAffinity: 'props' },
  [wall.vaultPath]: { ddSourceType: 'Walls' },
  [wallCap.vaultPath]: { isWallEndCap: true, ddSourceType: 'Walls' },
} as unknown as TileMetadataStore;

const base: TileFilterPipelineInput = {
  tilesets,
  tileMetadata: metadata,
  searchFilter: '',
  activeTags: new Set(),
  packFilter: new Set(),
  tileDepth: 'ground',
  mapType: 'hex',
  railSel: 'all',
  wallsEnabled: true,
};

const paths = (tiles: TileEntry[]): string[] => tiles.map(t => t.vaultPath);

describe('useTileFilterPipeline', () => {
  it('pools every tile except wall end caps and maps each to its tileset', () => {
    const p = run(base);
    expect(paths(p.allTiles)).toEqual([stone, wood, wall, oak, pine].map(t => t.vaultPath));
    expect(p.tileToTilesetId.get(oak.vaultPath)).toBe('nature');
    expect(p.tileToTilesetId.get(wallCap.vaultPath)).toBe('dungeon');
  });

  it('search matches filename, category and metadata tags, case-insensitively', () => {
    expect(paths(run({ ...base, searchFilter: 'STONE' }).filteredTiles)).toEqual([stone.vaultPath]);
    expect(paths(run({ ...base, searchFilter: 'trees' }).filteredTiles)).toEqual([oak.vaultPath, pine.vaultPath]);
    // 'forest' lives only in metadata userTags
    expect(paths(run({ ...base, searchFilter: 'fores' }).filteredTiles)).toEqual([oak.vaultPath, pine.vaultPath]);
    // folder tag on the TileEntry itself
    expect(paths(run({ ...base, searchFilter: 'wooden' }).filteredTiles)).toEqual([wood.vaultPath]);
  });

  it('groups by category in pool order and scopes shown groups to the rail category', () => {
    const all = run(base);
    const cats = Array.from(all.groupedTiles.keys());
    expect(cats).toHaveLength(3);
    expect(all.shownGroups.map(([c]) => c)).toEqual(cats);
    const treesCat = cats.find(c => (all.groupedTiles.get(c) ?? []).some(t => t.vaultPath === oak.vaultPath));
    expect(treesCat).toBeDefined();

    const scoped = run({ ...base, railSel: treesCat ?? '' });
    expect(scoped.shownGroups).toHaveLength(1);
    expect(paths(scoped.shownGroups[0][1])).toEqual([oak.vaultPath, pine.vaultPath]);
    // View filters keep every group.
    expect(run({ ...base, railSel: 'starred' }).shownGroups).toHaveLength(3);
    expect(run({ ...base, railSel: 'recent' }).openCategoryMerge).toBeNull();
  });

  it('lists packs in tileset order with humanized labels and per-pack counts', () => {
    const p = run(base);
    expect(p.availablePacks.map(pk => [pk.id, pk.count, pk.origin])).toEqual([
      ['dungeon', 3, 'native'],
      ['nature', 2, 'native'],
    ]);
    expect(paths(run({ ...base, packFilter: new Set(['nature']) }).filteredTiles)).toEqual([oak.vaultPath, pine.vaultPath]);
  });

  it('tag filter is AND across active tags and offers clean tags as chips', () => {
    const p = run(base);
    expect(p.availableTags).toEqual(expect.arrayContaining(['forest', 'wooden']));
    expect(paths(run({ ...base, activeTags: new Set(['Forest']) }).filteredTiles)).toEqual([oak.vaultPath, pine.vaultPath]);
    expect(run({ ...base, activeTags: new Set(['forest', 'wooden']) }).filteredTiles).toEqual([]);
  });

  it('grid maps scope to the active role: unclassified → ground, walls → structure', () => {
    const grid = { ...base, mapType: 'grid' };
    expect(paths(run({ ...grid, tileDepth: 'ground' }).filteredTiles)).toEqual([stone.vaultPath, wood.vaultPath]);
    expect(paths(run({ ...grid, tileDepth: 'props' }).filteredTiles)).toEqual([oak.vaultPath, pine.vaultPath]);
    expect(paths(run({ ...grid, tileDepth: 'structure' }).filteredTiles)).toEqual([wall.vaultPath]);
  });

  it('hides wall/path strips when the walls feature is off', () => {
    expect(paths(run({ ...base, wallsEnabled: false }).filteredTiles)).toEqual(
      [stone, wood, oak, pine].map(t => t.vaultPath),
    );
  });

  it('hides tiles whose folder declares the other geometry', () => {
    const hexOnly = tile('hexes/hex_forest.png', 'Hex Forest');
    const p = run({ ...base, tilesets: [tileset('hexes', 'Hexes', [hexOnly])], mapType: 'grid', tileDepth: 'ground' });
    expect(p.filteredTiles).toEqual([]);
    const q = run({ ...base, tilesets: [tileset('hexes', 'Hexes', [hexOnly])], mapType: 'hex' });
    expect(paths(q.filteredTiles)).toEqual([hexOnly.vaultPath]);
  });
});
