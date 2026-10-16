/**
 * "Keep for later" survives routine saves (MEM-06) and the conflict key used
 * by a stale refusal at unmount (DATA-13). A kept entry never disables live
 * journaling and is never aged out (Parallax #3); the conflict copy is offered
 * on the next load and a quota failure never leaves it in the live slot
 * (Parallax #4).
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  journalPending,
  clearJournal,
  readJournal,
  resolveJournalOnLoad,
  resetJournalLoadState,
  isJournalKept,
  readKeptEntries,
  moveJournalToConflict,
  readConflictJournal,
  pruneJournal,
  CONFLICT_KEY_PREFIX,
  JOURNAL_KEY_PREFIX,
  JOURNAL_MAX_AGE_MS,
  KEPT_KEY_PREFIX,
} from '../../../src/persistence/saveJournal';
import { registerSaveInstance, unregisterSaveInstance, journalAll } from '../../../src/persistence/saveCoordinator';
import { createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(maps: Record<string, MapData>): { app: App; store: Map<string, string> } {
  const store = new Map<string, string>();
  const file = new TFile();
  file.path = DATA_PATH;
  const content = JSON.stringify({ maps });
  const app = {
    saveLocalStorage: (k: string, v: unknown) => { if (v == null) store.delete(k); else store.set(k, String(v)); },
    loadLocalStorage: (k: string) => store.get(k) ?? null,
    vault: {
      getAbstractFileByPath: (p: string) => (p === DATA_PATH ? file : null),
      read: async () => content,
      modify: async () => undefined,
      create: async () => undefined,
    },
  } as unknown as App;
  return { app, store };
}

/** Disk holds `onDisk`; the journal holds a divergent edit. */
function divergent(mapId: string): { app: App; store: Map<string, string> } {
  const onDisk = createNewMap('Disk', 'grid');
  const h = makeApp({ [mapId]: onDisk });
  journalPending(h.app, mapId, { ...onDisk, description: 'unsaved edit' });
  return h;
}

function description(payload: string | undefined): string | undefined {
  return payload == null ? undefined : (JSON.parse(payload) as MapData).description;
}

describe('Keep for later (MEM-06)', () => {
  it('a kept entry survives a routine save (clearJournal)', async () => {
    const { app } = divergent('keep-1');
    await expect(resolveJournalOnLoad(app, 'keep-1', '', async () => 'keep')).resolves.toBeNull();
    expect(isJournalKept(app, 'keep-1')).toBe(true);

    clearJournal(app, 'keep-1'); // what every successful autosave does

    expect(readKeptEntries(app, 'keep-1')).toHaveLength(1);
  });

  it('a kept entry is not overwritten, and live journaling still works (Parallax #3)', async () => {
    const { app } = divergent('keep-2');
    await resolveJournalOnLoad(app, 'keep-2', '', async () => 'keep');

    expect(journalPending(app, 'keep-2', { ...createNewMap('x', 'grid'), description: 'newer session edit' })).toBe(true);

    expect(description(readKeptEntries(app, 'keep-2')[0]?.payload)).toBe('unsaved edit');
    expect(description(readJournal(app, 'keep-2')?.payload)).toBe('newer session edit');
  });

  it('keep, edit, failed save, journalAll on quit: a second recoverable payload exists (Parallax #3)', async () => {
    const { app } = divergent('keep-q');
    await resolveJournalOnLoad(app, 'keep-q', '', async () => 'keep');
    expect(readJournal(app, 'keep-q')).toBeNull();

    // An instance whose save failed still reports its edits as pending.
    registerSaveInstance('keep-q-instance', {
      getPending: () => ({ mapId: 'keep-q', data: { ...createNewMap('x', 'grid'), description: 'edit after keep' } }),
      flush: async () => undefined,
    });
    journalAll(app);
    unregisterSaveInstance('keep-q-instance');

    expect(readKeptEntries(app, 'keep-q')).toHaveLength(1);
    expect(description(readJournal(app, 'keep-q')?.payload)).toBe('edit after keep');

    // The next load offers both: the live edit first, then the kept one.
    resetJournalLoadState(); // a new plugin load (a keep defers the entry for the rest of this one)
    const sources: string[] = [];
    await resolveJournalOnLoad(app, 'keep-q', '', async (_t, _l, source) => { sources.push(source); return 'discard'; });
    expect(sources).toEqual(['live', 'kept']);
  });

  it('kept entries are never aged out by pruneJournal', async () => {
    const { app, store } = divergent('keep-age');
    await resolveJournalOnLoad(app, 'keep-age', '', async () => 'keep');
    const raw = JSON.parse(store.get(KEPT_KEY_PREFIX + 'keep-age') as string) as Array<{ savedAt: number }>;
    raw[0].savedAt = Date.now() - JOURNAL_MAX_AGE_MS * 3;
    store.set(KEPT_KEY_PREFIX + 'keep-age', JSON.stringify(raw));

    pruneJournal(app);

    expect(readKeptEntries(app, 'keep-age')).toHaveLength(1);
  });

  it('only an explicit decision releases it', async () => {
    const { app } = divergent('keep-3');
    await resolveJournalOnLoad(app, 'keep-3', '', async () => 'keep');

    clearJournal(app, 'keep-3', { includeKept: true });

    expect(readKeptEntries(app, 'keep-3')).toHaveLength(0);
    expect(isJournalKept(app, 'keep-3')).toBe(false);
  });

  it('restore releases the keep so the landing save clears it', async () => {
    const { app } = divergent('keep-4');
    await resolveJournalOnLoad(app, 'keep-4', '', async () => 'keep');
    resetJournalLoadState(); // a new plugin load (a keep defers the entry for the rest of this one)
    const restored = await resolveJournalOnLoad(app, 'keep-4', '', async () => 'restore');

    expect(restored?.description).toBe('unsaved edit');
    expect(isJournalKept(app, 'keep-4')).toBe(false);
    // Moved to the live slot until the landing save clears it.
    expect(readJournal(app, 'keep-4')).not.toBeNull();
    clearJournal(app, 'keep-4');
    expect(readJournal(app, 'keep-4')).toBeNull();
  });
});

describe('conflict key (DATA-13 / Parallax #4)', () => {
  it('moves the entry aside instead of deleting it', () => {
    const { app, store } = divergent('conf-1');

    expect(moveJournalToConflict(app, 'conf-1')).toBe('moved');

    expect(readJournal(app, 'conf-1')).toBeNull();
    expect(store.has(CONFLICT_KEY_PREFIX + 'conf-1')).toBe(true);
    expect(description(readConflictJournal(app, 'conf-1')?.payload)).toBe('unsaved edit');
  });

  it('conflict entries are dropped only when the map is gone, never by age', () => {
    const { app, store } = divergent('conf-2');
    moveJournalToConflict(app, 'conf-2');
    pruneJournal(app);
    expect(store.has(CONFLICT_KEY_PREFIX + 'conf-2')).toBe(true);
    pruneJournal(app, { liveMapIds: [] });
    expect(store.has(CONFLICT_KEY_PREFIX + 'conf-2')).toBe(false);
  });

  it('a quota failure while moving does not leave the clobber entry in the live slot', () => {
    const { app, store } = divergent('conf-q');
    const writable = app as unknown as { saveLocalStorage: (k: string, v: unknown) => void };
    const realSave = writable.saveLocalStorage;
    writable.saveLocalStorage = (k: string, v: unknown) => {
      if (k.startsWith(CONFLICT_KEY_PREFIX) && v != null) throw new Error('QuotaExceededError');
      realSave(k, v);
    };

    expect(moveJournalToConflict(app, 'conf-q')).toBe('failed');
    expect(store.has(JOURNAL_KEY_PREFIX + 'conf-q')).toBe(false);
  });

  it('the conflict copy is offered on the next load and can be restored', async () => {
    const { app } = divergent('conf-3');
    moveJournalToConflict(app, 'conf-3');

    const sources: string[] = [];
    const restored = await resolveJournalOnLoad(app, 'conf-3', '', async (_t, _l, source) => { sources.push(source); return 'restore'; });

    expect(sources).toEqual(['conflict']);
    expect(restored?.description).toBe('unsaved edit');
    expect(readConflictJournal(app, 'conf-3')).toBeNull();
    expect(readJournal(app, 'conf-3')).not.toBeNull();
  });
});
