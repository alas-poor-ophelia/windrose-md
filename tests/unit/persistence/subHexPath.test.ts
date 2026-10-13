/**
 * subHexPath: the single writer for nested sub-hex maps (windrose-mn1.4,
 * STRUCT-B-22 / DATA-04). Every sub-hex edit must land on the LIVE root, so
 * root changes made after a dive (tileset rescans, journal restores, MCP
 * writes) survive the next sub-hex edit.
 */

import { describe, it, expect } from 'vitest';

import type { MapData, SubHexMapData } from '#types/core/map.types';
import {
  parseSubHexPath,
  formatSubHexPath,
  getMapAtSubHexPath,
  getSubHexEntryAtPath,
  resolvableSubHexDepth,
  setAtSubHexPath,
  addSubHexEntryAtPath,
  toRootUpdater
} from '../../../src/persistence/subHexPath';

function map(name: string, subHexMaps?: Record<string, SubHexMapData>): MapData {
  return { name, mapType: 'hex', subHexMaps } as unknown as MapData;
}

function entry(mapData: MapData, rings = 7): SubHexMapData {
  return { subdivisionRings: rings, mapData, lastModified: '2020-01-01T00:00:00.000Z' };
}

/** root -> "0,0" (A) -> "2,-1" (B), plus an untouched sibling "1,0". */
function tree(): MapData {
  const b = map('B');
  const a = map('A', { '2,-1': entry(b, 5) });
  return map('Root', { '0,0': entry(a), '1,0': entry(map('Sibling')) });
}

/**
 * Minimal stand-in for the root store (useDebouncedSave.updateMapData):
 * functional updates apply to whatever the root is when they run.
 */
function rootStore(initial: MapData): {
  get: () => MapData;
  update: (u: MapData | ((prev: MapData) => MapData)) => void;
} {
  let current = initial;
  return {
    get: () => current,
    update: (u) => { current = typeof u === 'function' ? u(current) : u; }
  };
}

describe('path parsing', () => {
  it('splits, trims and drops blank segments', () => {
    expect(parseSubHexPath(' 0,0 / 2,-1 /')).toEqual(['0,0', '2,-1']);
    expect(parseSubHexPath(null)).toEqual([]);
    expect(formatSubHexPath(['0,0', '2,-1'])).toBe('0,0/2,-1');
    expect(formatSubHexPath([])).toBeNull();
  });
});

describe('reading by path', () => {
  it('resolves each level from the root', () => {
    const root = tree();
    expect(getMapAtSubHexPath(root, [])).toBe(root);
    expect(getMapAtSubHexPath(root, ['0,0'])?.name).toBe('A');
    expect(getMapAtSubHexPath(root, ['0,0', '2,-1'])?.name).toBe('B');
    expect(getMapAtSubHexPath(root, ['0,0', '9,9'])).toBeNull();
    expect(getSubHexEntryAtPath(root, ['0,0', '2,-1'])?.subdivisionRings).toBe(5);
    expect(getSubHexEntryAtPath(root, [])).toBeNull();
  });

  it('reports the resolvable prefix depth', () => {
    const root = tree();
    expect(resolvableSubHexDepth(root, ['0,0', '2,-1'])).toBe(2);
    expect(resolvableSubHexDepth(root, ['0,0', '9,9', '1,1'])).toBe(1);
    expect(resolvableSubHexDepth(null, ['0,0'])).toBe(0);
  });
});

describe('setAtSubHexPath', () => {
  it('replaces only the addressed map and copies only its ancestors', () => {
    const root = tree();
    const next = setAtSubHexPath(root, ['0,0', '2,-1'], m => ({ ...m, name: 'B2' }));
    expect(getMapAtSubHexPath(next, ['0,0', '2,-1'])?.name).toBe('B2');
    expect(next).not.toBe(root);
    expect(next.subHexMaps?.['1,0']).toBe(root.subHexMaps?.['1,0']);
    expect(getSubHexEntryAtPath(next, ['0,0', '2,-1'])?.subdivisionRings).toBe(5);
    expect(getSubHexEntryAtPath(next, ['0,0'])?.lastModified).not.toBe('2020-01-01T00:00:00.000Z');
    // input untouched
    expect(getMapAtSubHexPath(root, ['0,0', '2,-1'])?.name).toBe('B');
  });

  it('applies to the root itself for an empty path', () => {
    const root = tree();
    expect(setAtSubHexPath(root, [], m => ({ ...m, name: 'R2' })).name).toBe('R2');
  });

  it('is a no-op (same reference) on a missing segment, a null result or an unchanged map', () => {
    const root = tree();
    expect(setAtSubHexPath(root, ['0,0', '9,9'], m => ({ ...m, name: 'X' }))).toBe(root);
    expect(setAtSubHexPath(root, ['0,0'], () => null)).toBe(root);
    expect(setAtSubHexPath(root, ['0,0'], m => m)).toBe(root);
  });

  it('addSubHexEntryAtPath never clobbers an existing entry', () => {
    const root = tree();
    const fresh = entry(map('Fresh'));
    expect(addSubHexEntryAtPath(root, ['0,0'], '2,-1', fresh)).toBe(root);
    const added = addSubHexEntryAtPath(root, ['0,0'], '3,-1', fresh);
    expect(getMapAtSubHexPath(added, ['0,0', '3,-1'])?.name).toBe('Fresh');
  });
});

describe('root changes made after a dive survive sub-hex edits (DATA-04)', () => {
  it('a depth-2 edit keeps a root change made after the dive', () => {
    const store = rootStore(tree());
    const path = ['0,0', '2,-1'];
    // Dive happened; now the root changes underneath (tileset rescan, journal restore).
    store.update(prev => ({ ...prev, name: 'Root (rescanned)', tilesets: [] }));
    // Edit at depth 2, written the way the active updater writes it.
    store.update(toRootUpdater(path, m => ({ ...m, name: 'B edited' })));
    const root = store.get();
    expect(root.name).toBe('Root (rescanned)');
    expect(root.tilesets).toEqual([]);
    expect(getMapAtSubHexPath(root, path)?.name).toBe('B edited');
  });

  it('a root write made while a sub-hex is open (MCP) survives a later sub-hex edit', () => {
    const store = rootStore(tree());
    const path = ['0,0'];
    store.update(prev => ({ ...prev, subHexMaps: { ...prev.subHexMaps, '5,5': entry(map('MCP-made')) } }));
    store.update(prev => ({ ...prev, name: 'Root via MCP' }));
    // A whole-map replacement at the active level (non-functional form).
    const active = getMapAtSubHexPath(store.get(), path);
    if (active == null) throw new Error('active level missing');
    store.update(toRootUpdater(path, { ...active, name: 'A edited' }));
    const root = store.get();
    expect(root.name).toBe('Root via MCP');
    expect(getMapAtSubHexPath(root, ['5,5'])?.name).toBe('MCP-made');
    expect(getMapAtSubHexPath(root, path)?.name).toBe('A edited');
    expect(getMapAtSubHexPath(root, ['0,0', '2,-1'])?.name).toBe('B');
  });

  it('an edit at depth 1 keeps a concurrent edit made at depth 2', () => {
    const store = rootStore(tree());
    store.update(toRootUpdater(['0,0', '2,-1'], m => ({ ...m, name: 'B deep edit' })));
    store.update(toRootUpdater(['0,0'], m => ({ ...m, name: 'A edited' })));
    const root = store.get();
    expect(getMapAtSubHexPath(root, ['0,0'])?.name).toBe('A edited');
    expect(getMapAtSubHexPath(root, ['0,0', '2,-1'])?.name).toBe('B deep edit');
  });

  it('an edit aimed at a level removed by a restore is dropped, not resurrected', () => {
    const store = rootStore(tree());
    store.update(() => map('Restored root', {}));
    store.update(toRootUpdater(['0,0'], m => ({ ...m, name: 'A edited' })));
    expect(store.get().subHexMaps).toEqual({});
  });
});
