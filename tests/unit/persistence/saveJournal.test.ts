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
  JOURNAL_INDEX_KEY,
  JOURNAL_KEY_PREFIX,
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
    map.description = 'x'.repeat(MAX_JOURNAL_PAYLOAD + 1);

    journalPending(h.app, 'j-big', map);

    expect(readJournal(h.app, 'j-big')).toBeNull();
    expect(indexOf(h)).toEqual([]);
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
