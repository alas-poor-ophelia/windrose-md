import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  journalPending,
  clearJournal,
  readJournal,
  pruneJournal,
  compareJournalToDisk,
  resolveJournalOnLoad,
  readKeptEntries,
  JOURNAL_INDEX_KEY,
  JOURNAL_KEY_PREFIX,
  JOURNAL_META_PREFIX,
  RAW_PAYLOAD_LIMIT,
  MAX_JOURNAL_PAYLOAD,
} from '../../../src/persistence/saveJournal';
import { createNewMap, deleteMapData } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

interface Harness {
  app: App;
  store: Map<string, string>;
  setFile: (content: string) => void;
}

function makeApp(initialContent: string | null = null): Harness {
  const store = new Map<string, string>();
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();

  const setFile = (content: string): void => {
    if (!files.has(DATA_PATH)) {
      const file = new TFile();
      file.path = DATA_PATH;
      files.set(DATA_PATH, file);
    }
    contents.set(DATA_PATH, content);
  };
  if (initialContent != null) setFile(initialContent);

  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) store.delete(key);
      else store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {
      getAbstractFileByPath: (path: string) => files.get(path) ?? null,
      read: async (file: TFile) => contents.get(file.path) ?? '',
      modify: async (file: TFile, data: string) => { contents.set(file.path, data); },
      create: async (path: string, data: string) => { setFile(data); void path; },
    },
  } as unknown as App;

  return { app, store, setFile };
}

function indexOf(harness: Harness): string[] {
  const raw = harness.store.get(JOURNAL_INDEX_KEY);
  return raw != null ? (JSON.parse(raw) as string[]) : [];
}

describe('saveJournal round-trip', () => {
  it('writes and reads back the pending payload', () => {
    const h = makeApp();
    const map = createNewMap('Journalled', 'grid');

    journalPending(h.app, 'j-1', map);

    const entry = readJournal(h.app, 'j-1');
    expect(entry).not.toBeNull();
    expect(entry?.mapId).toBe('j-1');
    expect(entry?.payload).toBe(JSON.stringify(map));
    expect(entry?.savedAt).toBeGreaterThan(0);
    expect(indexOf(h)).toEqual(['j-1']);
  });

  it('uses a per-map key so maps do not clobber each other', () => {
    const h = makeApp();
    journalPending(h.app, 'j-a', createNewMap('A', 'grid'));
    journalPending(h.app, 'j-b', createNewMap('B', 'hex'));

    expect(h.store.has(JOURNAL_KEY_PREFIX + 'j-a')).toBe(true);
    expect(h.store.has(JOURNAL_KEY_PREFIX + 'j-b')).toBe(true);
    expect(indexOf(h).sort()).toEqual(['j-a', 'j-b']);
  });

  it('clearJournal drops the entry and its index slot', () => {
    const h = makeApp();
    journalPending(h.app, 'j-2', createNewMap('Gone', 'grid'));

    clearJournal(h.app, 'j-2');

    expect(readJournal(h.app, 'j-2')).toBeNull();
    expect(indexOf(h)).toEqual([]);
  });

  it('readJournal returns null for absent or corrupt entries', () => {
    const h = makeApp();
    expect(readJournal(h.app, 'nope')).toBeNull();

    h.store.set(JOURNAL_KEY_PREFIX + 'bad', '{not json');
    expect(readJournal(h.app, 'bad')).toBeNull();

    h.store.set(JOURNAL_KEY_PREFIX + 'oldver', JSON.stringify({ v: 99, payload: '{}' }));
    expect(readJournal(h.app, 'oldver')).toBeNull();
  });

  it('never throws when the storage backend fails', () => {
    const app = {
      saveLocalStorage: () => { throw new Error('quota'); },
      loadLocalStorage: () => null,
    } as unknown as App;

    expect(() => journalPending(app, 'j-3', createNewMap('Boom', 'grid'))).not.toThrow();
    expect(() => clearJournal(app, 'j-3')).not.toThrow();
  });
});

describe('saveJournal size guard', () => {
  it('skips payloads over the size cap', () => {
    const h = makeApp();
    const map = createNewMap('Huge', 'grid');
    // Incompressible: still over the cap after deflate + base64.
    map.description = noise(MAX_JOURNAL_PAYLOAD * 2);

    expect(journalPending(h.app, 'j-big', map)).toBe(false);

    expect(readJournal(h.app, 'j-big')).toBeNull();
  });

  it('deflates a large compressible payload instead of skipping it (DATA-05)', () => {
    const h = makeApp();
    const map = createNewMap('Big', 'grid');
    map.description = 'room '.repeat(600_000); // ~3 MB of JSON, far over the raw limit

    expect(journalPending(h.app, 'j-deflate', map, { writerId: 'w1', version: 3 })).toBe(true);

    const stored = h.store.get(JOURNAL_KEY_PREFIX + 'j-deflate@@w1') as string;
    expect(stored.length).toBeLessThan(MAX_JOURNAL_PAYLOAD);
    expect(stored.length).toBeLessThan(RAW_PAYLOAD_LIMIT);
    const entry = readJournal(h.app, 'j-deflate');
    expect(entry?.version).toBe(3);
    expect(entry?.writerId).toBe('w1');
    expect(entry?.payload).toBe(JSON.stringify(map));
  });

  it('stores the payload unwrapped (one escaping level) with a small metadata key (MEM-22)', () => {
    const h = makeApp();
    const map = createNewMap('Plain', 'grid');
    journalPending(h.app, 'j-plain', map);
    expect(h.store.get(JOURNAL_KEY_PREFIX + 'j-plain')).toBe(JSON.stringify(map));
    const meta = JSON.parse(h.store.get(JOURNAL_META_PREFIX + 'j-plain') as string) as Record<string, unknown>;
    expect(meta.enc).toBe('json');
    expect(meta).not.toHaveProperty('payload');
  });

  it('a quota failure keeps the older entry instead of deleting it first', () => {
    const h = makeApp();
    const older = createNewMap('Older', 'grid');
    journalPending(h.app, 'j-q', older, { writerId: 'w', version: 1 });
    const writable = h.app as unknown as { saveLocalStorage: (k: string, v: unknown) => void };
    const real = writable.saveLocalStorage;
    writable.saveLocalStorage = (k: string, v: unknown) => {
      if (k.startsWith(JOURNAL_KEY_PREFIX) && v != null) throw new Error('QuotaExceededError');
      real(k, v);
    };
    expect(journalPending(h.app, 'j-q', createNewMap('Newer', 'grid'), { writerId: 'w', version: 2 })).toBe(false);
    writable.saveLocalStorage = real;
    expect(JSON.parse(readJournal(h.app, 'j-q')?.payload as string).name).toBe('Older');
  });

  it('each writer has its own slot; a writer clear never touches another writer (Parallax follow-up)', () => {
    const h = makeApp();
    const a = createNewMap('A', 'grid');
    const b = createNewMap('B', 'grid');
    journalPending(h.app, 'j-two', a, { writerId: 'pane-a', version: 1 });
    journalPending(h.app, 'j-two', b, { writerId: 'pane-b', version: 1 });

    clearJournal(h.app, 'j-two', { writerId: 'pane-a', upToVersion: 1 });

    expect(JSON.parse(readJournal(h.app, 'j-two')?.payload as string).name).toBe('B');
  });

  it('an older version settling does not clear a newer journaled version', () => {
    const h = makeApp();
    journalPending(h.app, 'j-ver', createNewMap('V5', 'grid'), { writerId: 'w', version: 5 });
    clearJournal(h.app, 'j-ver', { writerId: 'w', upToVersion: 4 });
    expect(readJournal(h.app, 'j-ver')).not.toBeNull();
    clearJournal(h.app, 'j-ver', { writerId: 'w', upToVersion: 5 });
    expect(readJournal(h.app, 'j-ver')).toBeNull();
  });

  it('still journals payloads under the cap', () => {
    const h = makeApp();
    const map = createNewMap('Small', 'grid');
    map.description = 'x'.repeat(1000);

    journalPending(h.app, 'j-small', map);

    expect(readJournal(h.app, 'j-small')).not.toBeNull();
  });
});

describe('pruneJournal', () => {
  it('drops entries older than a week', () => {
    const h = makeApp();
    journalPending(h.app, 'j-old', createNewMap('Old', 'grid'));
    journalPending(h.app, 'j-fresh', createNewMap('Fresh', 'grid'));

    const stale = JSON.parse(h.store.get(JOURNAL_KEY_PREFIX + 'j-old') as string) as Record<string, unknown>;
    stale.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    h.store.set(JOURNAL_KEY_PREFIX + 'j-old', JSON.stringify(stale));

    pruneJournal(h.app);

    expect(readJournal(h.app, 'j-old')).toBeNull();
    expect(readJournal(h.app, 'j-fresh')).not.toBeNull();
    expect(indexOf(h)).toEqual(['j-fresh']);
  });

  it('drops entries whose map no longer exists', () => {
    const h = makeApp();
    journalPending(h.app, 'j-live', createNewMap('Live', 'grid'));
    journalPending(h.app, 'j-dead', createNewMap('Dead', 'grid'));

    pruneJournal(h.app, { liveMapIds: ['j-live'] });

    expect(readJournal(h.app, 'j-live')).not.toBeNull();
    expect(readJournal(h.app, 'j-dead')).toBeNull();
  });

  it('is a no-op on an empty journal', () => {
    const h = makeApp();
    expect(() => pruneJournal(h.app)).not.toThrow();
    expect(indexOf(h)).toEqual([]);
  });
});

describe('compareJournalToDisk', () => {
  it('reports clean when the payload matches disk exactly', () => {
    const map = createNewMap('Same', 'grid');
    const payload = JSON.stringify(map);
    expect(compareJournalToDisk(payload, payload)).toBe('clean');
  });

  it('reports divergent when disk differs', () => {
    expect(compareJournalToDisk('{"a":1}', '{"a":2}')).toBe('divergent');
  });

  it('reports divergent when the map is absent from disk', () => {
    expect(compareJournalToDisk('{"a":1}', null)).toBe('divergent');
  });
});

describe('resolveJournalOnLoad (non-prompting paths)', () => {
  function fileWith(maps: Record<string, MapData>): string {
    return JSON.stringify({ maps });
  }

  it('returns null and clears when there is no journal entry', async () => {
    const h = makeApp(fileWith({ 'r-0': createNewMap('OnDisk', 'grid') }));

    await expect(resolveJournalOnLoad(h.app, 'r-0')).resolves.toBeNull();
  });

  it('clears silently when the protected save landed', async () => {
    const map = createNewMap('Landed', 'grid');
    const h = makeApp(fileWith({ 'r-1': map }));
    journalPending(h.app, 'r-1', map);

    const restored = await resolveJournalOnLoad(h.app, 'r-1');

    expect(restored).toBeNull();
    expect(readJournal(h.app, 'r-1')).toBeNull();
  });

  it('skips and clears the journal for a tombstoned map', async () => {
    const map = createNewMap('Deleted', 'grid');
    const h = makeApp(fileWith({ 'r-2': map }));
    journalPending(h.app, 'r-2', map);
    // Diverge from disk so only the tombstone can short-circuit the prompt.
    map.description = 'edited after the delete';
    journalPending(h.app, 'r-2', map);

    await deleteMapData(h.app, 'r-2');

    const restored = await resolveJournalOnLoad(h.app, 'r-2');

    expect(restored).toBeNull();
    expect(readJournal(h.app, 'r-2')).toBeNull();
  });
});

describe('resolveJournalOnLoad restore runs the load migration (DATA-20)', () => {
  function writeRawEntry(h: Harness, mapId: string, payload: unknown): void {
    h.store.set(JOURNAL_KEY_PREFIX + mapId, JSON.stringify({ v: 1, mapId, savedAt: Date.now(), payload: JSON.stringify(payload) }));
  }

  it('upgrades legacy shapes in the restored tree, sub-hex maps included', async () => {
    const h = makeApp(JSON.stringify({ maps: {} }));
    const legacy = createNewMap('Legacy', 'hex') as unknown as Record<string, unknown>;
    const layers = legacy.layers as Array<Record<string, unknown>>;
    layers[0].tiles = [{ q: 1, r: 2, tilesetId: 'ts', tileId: 'a.png' }];
    delete legacy.boards;
    const sub = createNewMap('Sub', 'hex') as unknown as Record<string, unknown>;
    (sub.layers as Array<Record<string, unknown>>)[0].tiles = [{ q: 3, r: 4, tilesetId: 'ts', tileId: 'b.png' }];
    legacy.subHexMaps = { '0,0': { mapData: sub } };
    writeRawEntry(h, 'mig-1', legacy);

    const restored = await resolveJournalOnLoad(h.app, 'mig-1', '', async () => 'restore');

    expect(restored).not.toBeNull();
    const tile = restored!.layers[0].tiles![0] as unknown as Record<string, unknown>;
    expect(tile.col).toBe(1);
    expect(tile.row).toBe(2);
    expect('q' in tile).toBe(false);
    expect(Array.isArray(restored!.boards)).toBe(true);
    const subTile = restored!.subHexMaps!['0,0'].mapData!.layers[0].tiles![0] as unknown as Record<string, unknown>;
    expect(subTile.col).toBe(3);
    // Still journalled until the landing save clears it.
    expect(readJournal(h.app, 'mig-1')).not.toBeNull();
  });

  it('keeps (does not discard) a payload that parses but cannot be migrated', async () => {
    const h = makeApp(JSON.stringify({ maps: {} }));
    // layers present but not an array of objects: the layer sanitizer throws.
    writeRawEntry(h, 'mig-2', { name: 'Broken', mapType: 'grid', layers: [null] });

    const restored = await resolveJournalOnLoad(h.app, 'mig-2', '', async () => 'restore');

    expect(restored).toBeNull();
    // Not discarded: set aside as a kept entry, offered again next load.
    expect(readKeptEntries(h.app, 'mig-2')).toHaveLength(1);
  });
});

/** Random incompressible text (deflate cannot shrink it below the cap). */
function noise(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * 64)];
  }
  return out;
}
