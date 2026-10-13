/**
 * storeCache.test.ts
 *
 * MEM-12 / OBS-06 (M option): a save reuses the store this session last wrote
 * while a fresh stat proves the file is unchanged, and re-reads whenever it
 * is not. The failure designed against is a stale cache writing an old map
 * over a newer file synced in from another device.
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  saveMapData,
  loadMapData,
  listMapsResult,
  readRawMapEntry,
  restoreFromBackup,
  createNewMap,
} from '../../../src/persistence/fileOperations';
import {
  hasStoreCache,
  invalidateStoreCache,
  noteStoreFileModified,
  noteStoreFilePathGone,
  serializeStore,
  snapshotFromParsed,
  utf8ByteLength,
} from '../../../src/persistence/storeCache';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

interface FakeStore {
  app: App;
  file: TFile;
  reads: () => number;
  content: () => string;
  /** Another device / sync tool writes the file (new mtime). */
  external: (data: string, mtimeBump?: number) => void;
}

function makeStore(initial: string, opts: { stat?: boolean } = {}): FakeStore {
  let data = initial;
  let mtime = 1_000;
  let reads = 0;
  const file = new TFile();
  file.path = DATA_PATH;
  const sync = (): void => { file.stat = { ctime: 0, mtime, size: utf8ByteLength(data) }; };
  sync();
  const adapter: Record<string, unknown> = {
    exists: async (p: string) => p === DATA_PATH,
    read: async () => data,
    write: async () => { /* corrupt copy */ },
  };
  if (opts.stat !== false) {
    adapter.stat = async (p: string) => (p === DATA_PATH ? { type: 'file', ctime: 0, mtime, size: utf8ByteLength(data) } : null);
  }
  const vault = {
    adapter,
    getAbstractFileByPath: (p: string) => (p === DATA_PATH ? file : null),
    getFiles: () => [file],
    read: async () => { reads++; return data; },
    modify: async (_f: TFile, next: string) => { data = next; mtime += 1; sync(); },
    create: async () => { throw new Error('unexpected create'); },
    createFolder: async () => { /* unused */ },
  };
  return {
    app: { vault } as unknown as App,
    file,
    reads: () => reads,
    content: () => data,
    external: (next: string, mtimeBump = 7) => { data = next; mtime += mtimeBump; sync(); },
  };
}

function mapNamed(name: string): MapData {
  return { ...createNewMap(name, 'grid'), name };
}

function storeWith(maps: Record<string, MapData>, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...extra, maps });
}

function storedNames(content: string): Record<string, string | undefined> {
  const parsed = JSON.parse(content) as { maps: Record<string, MapData> };
  return Object.fromEntries(Object.entries(parsed.maps).map(([id, m]) => [id, m.name]));
}

describe('store cache: saves without an external change', () => {
  it('two saves read and parse the file once; the result keeps every map and top-level key', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({ other: mapNamed('Other') }, { version: 3 }));
    expect((await saveMapData(s.app, 'c1', mapNamed('v1'))).status).toBe('saved');
    expect(s.reads()).toBe(1);
    expect(hasStoreCache()).toBe(true);
    expect((await saveMapData(s.app, 'c1', mapNamed('v2'))).status).toBe('saved');
    expect(s.reads()).toBe(1);
    const parsed = JSON.parse(s.content()) as { version: number };
    expect(parsed.version).toBe(3);
    expect(storedNames(s.content())).toEqual({ other: 'Other', c1: 'v2' });
  });

  it('load, list and the raw-entry read are served from the cache without a read', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({ other: mapNamed('Other') }));
    await saveMapData(s.app, 'c2', mapNamed('Mine'));
    const before = s.reads();
    expect((await loadMapData(s.app, 'c2')).name).toBe('Mine');
    const list = await listMapsResult(s.app);
    expect(list.status === 'ok' ? list.maps.map(m => m.name) : null).toEqual(['Other', 'Mine']);
    const raw = await readRawMapEntry(s.app, 'c2');
    const onDisk = (JSON.parse(s.content()) as { maps: Record<string, unknown> }).maps.c2;
    expect(raw).toBe(JSON.stringify(onDisk));
    expect(s.reads()).toBe(before);
  });

  it('a vault adapter without stat never caches (every save re-reads)', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({}), { stat: false });
    await saveMapData(s.app, 'c3', mapNamed('a'));
    await saveMapData(s.app, 'c3', mapNamed('b'));
    expect(s.reads()).toBe(2);
    expect(hasStoreCache()).toBe(false);
  });
});

describe('store cache: external changes', () => {
  it('a store synced in between saves is re-read and its newer maps are kept', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({ remote: mapNamed('remote-old') }));
    await saveMapData(s.app, 'c4', mapNamed('local-1'));
    await saveMapData(s.app, 'c4', mapNamed('local-2'));
    expect(s.reads()).toBe(1);

    // Another device edited "remote" and added "added"; sync writes the file.
    const synced = JSON.parse(s.content()) as { maps: Record<string, MapData> };
    synced.maps.remote = mapNamed('remote-NEW');
    synced.maps.added = mapNamed('added');
    s.external(JSON.stringify(synced));

    await saveMapData(s.app, 'c4', mapNamed('local-3'));
    expect(s.reads()).toBe(2);
    expect(storedNames(s.content())).toEqual({ remote: 'remote-NEW', c4: 'local-3', added: 'added' });
  });

  it('a same-size external write with a new mtime still forces a re-read', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({ r: mapNamed('aaaa') }));
    await saveMapData(s.app, 'c5', mapNamed('x'));
    const swapped = s.content().replace('"aaaa"', '"bbbb"');
    expect(swapped.length).toBe(s.content().length);
    s.external(swapped);
    await saveMapData(s.app, 'c5', mapNamed('y'));
    expect(storedNames(s.content()).r).toBe('bbbb');
  });

  it('the vault modify event drops the cache unless the stat is our own write', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({}));
    await saveMapData(s.app, 'c6', mapNamed('x'));
    noteStoreFileModified(s.file); // own write: stat matches
    expect(hasStoreCache()).toBe(true);
    s.file.stat = { ...s.file.stat, mtime: s.file.stat.mtime + 1 };
    noteStoreFileModified(s.file);
    expect(hasStoreCache()).toBe(false);
  });

  it('delete or rename of the store path drops the cache', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({}));
    await saveMapData(s.app, 'c7', mapNamed('x'));
    noteStoreFilePathGone('other.json');
    expect(hasStoreCache()).toBe(true);
    noteStoreFilePathGone(DATA_PATH);
    expect(hasStoreCache()).toBe(false);
  });
});

describe('store cache: corrupt and restore', () => {
  it('a corrupt file synced in is refused, never overwritten, and the cache is dropped', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({}));
    await saveMapData(s.app, 'c8', mapNamed('x'));
    expect(hasStoreCache()).toBe(true);
    s.external('{"maps": {"trunc');
    expect((await saveMapData(s.app, 'c8', mapNamed('y'))).status).toBe('failed');
    expect(s.content()).toBe('{"maps": {"trunc');
    expect(hasStoreCache()).toBe(false);
  });

  it('a root that is not a store object is refused', async () => {
    invalidateStoreCache();
    const s = makeStore('[1,2]');
    expect((await saveMapData(s.app, 'c9', mapNamed('y'))).status).toBe('failed');
    expect(s.content()).toBe('[1,2]');
  });

  it('a restore drops the cache', async () => {
    invalidateStoreCache();
    const s = makeStore(storeWith({}));
    await saveMapData(s.app, 'c10', mapNamed('x'));
    expect(hasStoreCache()).toBe(true);
    const result = await restoreFromBackup(s.app, { path: 'windrose-md-data.bak1.json', content: storeWith({ old: mapNamed('old') }), mapCount: 1, mtime: 0 } as Parameters<typeof restoreFromBackup>[1]);
    expect(result.ok).toBe(true);
    expect(hasStoreCache()).toBe(false);
    await saveMapData(s.app, 'c10', mapNamed('after'));
    expect(storedNames(s.content())).toEqual({ old: 'old', c10: 'after' });
  });
});

describe('store cache helpers', () => {
  it('serializeStore is JSON-equivalent to JSON.stringify of the store', () => {
    const doc = { a: 1, maps: { m1: { name: 'x', n: [1, 2] }, '__proto__': { q: 'é😀' } }, z: null };
    const parsed: unknown = JSON.parse(JSON.stringify(doc));
    const snap = snapshotFromParsed(parsed);
    expect(snap).not.toBeNull();
    if (snap == null) return;
    expect(JSON.parse(serializeStore(snap))).toEqual(parsed);
  });

  it('utf8ByteLength matches TextEncoder', () => {
    for (const text of ['', 'abc', 'é', '😀', 'a\uD800b', '日本語 map']) {
      expect(utf8ByteLength(text)).toBe(new TextEncoder().encode(text).length);
    }
  });

  it('snapshotFromParsed rejects non-store documents', () => {
    expect(snapshotFromParsed(null)).toBeNull();
    expect(snapshotFromParsed([1])).toBeNull();
    expect(snapshotFromParsed({ maps: 5 })).toBeNull();
    expect(snapshotFromParsed({})?.entries.size).toBe(0);
  });
});
