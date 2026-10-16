import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  journalPending,
  clearJournal,
  dropRestoredSlot,
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
import { registerSaveInstance, unregisterSaveInstance } from '../../../src/persistence/saveCoordinator';
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
    // v3: one header line, then the payload unwrapped (no second escaping level).
    const stored = h.store.get(JOURNAL_KEY_PREFIX + 'j-plain') as string;
    expect(stored.slice(stored.indexOf('\n') + 1)).toBe(JSON.stringify(map));
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
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(Date.now() - 8 * 24 * 60 * 60 * 1000);
      journalPending(h.app, 'j-old', createNewMap('Old', 'grid'));
    } finally {
      vi.useRealTimers();
    }
    journalPending(h.app, 'j-fresh', createNewMap('Fresh', 'grid'));

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

describe('wave-5 journal fixes', () => {
  it('finding 4: pane A has a pending slot, pane B mounts: no restore prompt, A slot intact', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const h = makeApp(JSON.stringify({ maps: { 'w5-live': onDisk } }));
    registerSaveInstance('pane-a', { getPending: () => null, flush: async () => {} });
    try {
      journalPending(h.app, 'w5-live', createNewMap('A pending', 'grid'), { writerId: 'pane-a', version: 2 });
      pruneJournal(h.app, { liveMapIds: ['w5-live'] });

      const prompt = vi.fn(async () => 'discard' as const);
      await expect(resolveJournalOnLoad(h.app, 'w5-live', '', prompt)).resolves.toBeNull();
      expect(prompt).not.toHaveBeenCalled();
      expect(JSON.parse(readJournal(h.app, 'w5-live')?.payload as string).name).toBe('A pending');
    } finally {
      unregisterSaveInstance('pane-a');
    }
    // Once pane A is gone, its slot is an orphan and is offered again.
    const prompt2 = vi.fn(async () => 'discard' as const);
    await resolveJournalOnLoad(h.app, 'w5-live', '', prompt2);
    expect(prompt2).toHaveBeenCalledTimes(1);
  });

  it('finding 5: a sibling landing an older tree does not clear the restored writerless slot', async () => {
    const h = makeApp(JSON.stringify({ maps: { 'w5-r': createNewMap('Disk', 'grid') } }));
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const t0 = Date.now();
      // Pane A journals its older tree, then (later) a dead writer's slot is restored by pane B.
      journalPending(h.app, 'w5-r', createNewMap('A tree', 'grid'), { writerId: 'pane-a', version: 1 });
      journalPending(h.app, 'w5-r', createNewMap('Crashed', 'grid'), { writerId: 'dead', version: 7 });
      registerSaveInstance('pane-a', { getPending: () => null, flush: async () => {} });
      vi.setSystemTime(t0 + 1000);
      const restored = await resolveJournalOnLoad(h.app, 'w5-r', '', async () => 'restore');
      unregisterSaveInstance('pane-a');
      expect(restored?.name).toBe('Crashed');

      // Pane A's older save lands: the restored copy must survive.
      clearJournal(h.app, 'w5-r', { writerId: 'pane-a', upToVersion: 1 });
      expect(JSON.parse(readJournal(h.app, 'w5-r')?.payload as string).name).toBe('Crashed');

      // Pane B journals the restored tree after the restore and lands it: now it clears.
      vi.setSystemTime(t0 + 2000);
      journalPending(h.app, 'w5-r', createNewMap('Crashed', 'grid'), { writerId: 'pane-b', version: 1 });
      clearJournal(h.app, 'w5-r', { writerId: 'pane-b', upToVersion: 1 });
      expect(readJournal(h.app, 'w5-r')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('finding 6: a quota failure on the meta write leaves the new pair readable (single framed write)', () => {
    const h = makeApp();
    journalPending(h.app, 'w5-q', createNewMap('Older', 'grid'), { writerId: 'w', version: 1 });
    const writable = h.app as unknown as { saveLocalStorage: (k: string, v: unknown) => void };
    const real = writable.saveLocalStorage;
    writable.saveLocalStorage = (k: string, v: unknown) => {
      if (k.startsWith(JOURNAL_META_PREFIX) && v != null) throw new Error('QuotaExceededError');
      real(k, v);
    };
    expect(journalPending(h.app, 'w5-q', createNewMap('Newer', 'grid'), { writerId: 'w', version: 2 })).toBe(true);
    writable.saveLocalStorage = real;
    const entry = readJournal(h.app, 'w5-q');
    expect(JSON.parse(entry?.payload as string).name).toBe('Newer');
    expect(entry?.version).toBe(2);
    // The version guard still reads the header metadata.
    clearJournal(h.app, 'w5-q', { writerId: 'w', upToVersion: 1 });
    expect(readJournal(h.app, 'w5-q')).not.toBeNull();
  });
});

describe('wave-6 parallax finding 3: a restore into the pane own slot survives older saves', () => {
  it('an in-flight save landing after the restore, or a stale refusal, leaves the restored slot until the next journal', async () => {
    const h = makeApp(JSON.stringify({ maps: { 'w6-r': createNewMap('Disk', 'grid') } }));
    journalPending(h.app, 'w6-r', createNewMap('Crashed', 'grid'), { writerId: 'dead', version: 9 });

    const restored = await resolveJournalOnLoad(h.app, 'w6-r', '', async () => 'restore', 'pane-b');
    expect(restored?.name).toBe('Crashed');
    const slot = readJournal(h.app, 'w6-r');
    expect(slot?.writerId).toBe('pane-b');
    expect(slot?.version).toBe(Number.MAX_SAFE_INTEGER);

    // A save dispatched before the restore (version 3) lands: the slot stays.
    clearJournal(h.app, 'w6-r', { writerId: 'pane-b', upToVersion: 3 });
    expect(JSON.parse(readJournal(h.app, 'w6-r')?.payload as string).name).toBe('Crashed');

    // The same in-flight save comes back stale: the stale branch keeps it too.
    clearJournal(h.app, 'w6-r', { writerId: 'pane-b', keepRestored: true });
    expect(JSON.parse(readJournal(h.app, 'w6-r')?.payload as string).name).toBe('Crashed');

    // The pane's next journalNow overwrites it with the real version; that save landing clears it.
    journalPending(h.app, 'w6-r', createNewMap('Crashed', 'grid'), { writerId: 'pane-b', version: 4 });
    expect(readJournal(h.app, 'w6-r')?.version).toBe(4);
    clearJournal(h.app, 'w6-r', { writerId: 'pane-b', keepRestored: true });
    expect(readJournal(h.app, 'w6-r')).toBeNull();
  });
});

describe('parallax wave-7 finding 4: dropRestoredSlot', () => {
  it('drops the own slot only while it still holds a restored copy', async () => {
    const h = makeApp(JSON.stringify({ maps: { 'w7-r': createNewMap('Disk', 'grid') } }));
    journalPending(h.app, 'w7-r', createNewMap('Crashed', 'grid'), { writerId: 'dead', version: 9 });
    await resolveJournalOnLoad(h.app, 'w7-r', '', async () => 'restore', 'pane-c');
    expect(readJournal(h.app, 'w7-r')?.version).toBe(Number.MAX_SAFE_INTEGER);

    dropRestoredSlot(h.app, 'w7-r', 'pane-c');
    expect(readJournal(h.app, 'w7-r')).toBeNull();

    // A slot the pane journaled itself (restoredAt null) is not touched.
    journalPending(h.app, 'w7-r', createNewMap('Own', 'grid'), { writerId: 'pane-c', version: 2 });
    dropRestoredSlot(h.app, 'w7-r', 'pane-c');
    expect(readJournal(h.app, 'w7-r')?.version).toBe(2);
  });
});
