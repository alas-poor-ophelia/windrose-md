/**
 * Live check N6: journal writer ids came from a per-load counter
 * (`windrose-save-<n>`), so after a crash or restart a pane of the new load
 * with the same number made the crashed slot look LIVE and the restore prompt
 * never appeared. Writer ids are now `<bootNonce>-<n>`, unique across loads.
 */
import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { journalPending, pruneJournal, readJournal, resolveJournalOnLoad, JOURNAL_INDEX_KEY } from '../../../src/persistence/saveJournal';
import { registerSaveInstance, unregisterSaveInstance } from '../../../src/persistence/saveCoordinator';
import { createNewMap } from '../../../src/persistence/fileOperations';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(content: string): { app: App; store: Map<string, string> } {
  const store = new Map<string, string>();
  const file = new TFile();
  file.path = DATA_PATH;
  let data = content;
  const app = {
    saveLocalStorage: (key: string, value: unknown) => {
      if (value == null) store.delete(key);
      else store.set(key, String(value));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {
      getAbstractFileByPath: (path: string) => (path === DATA_PATH ? file : null),
      read: async () => data,
      modify: async (_f: TFile, next: string) => { data = next; },
      create: async (_p: string, next: string) => { data = next; },
    },
  } as unknown as App;
  return { app, store };
}

/** Evaluate useDebouncedSave afresh, as a plugin load does, and return its id minter. */
async function freshLoad(): Promise<() => string> {
  vi.resetModules();
  const mod = await import('../../../src/hooks/state/useDebouncedSave');
  return mod.nextWriterId;
}

const noopInstance = { getPending: () => null, flush: async () => {} };

describe('journal writer ids are unique across plugin loads (live check N6)', () => {
  it('two loads mint different ids for the same mount number, without the @@ separator', async () => {
    const loadA = await freshLoad();
    const loadB = await freshLoad();
    const a1 = loadA();
    const b1 = loadB();
    expect(a1.endsWith('-1')).toBe(true);
    expect(b1.endsWith('-1')).toBe(true);
    expect(a1).not.toBe(b1);
    expect(a1).not.toContain('@@');
    expect(loadA()).toBe(a1.replace(/-1$/, '-2'));
  });

  it('a crash slot from a previous load is offered even when a pane of this load has the same counter number', async () => {
    const h = makeApp(JSON.stringify({ maps: { n6: createNewMap('Disk', 'grid') } }));
    const previous = (await freshLoad())();
    journalPending(h.app, 'n6', createNewMap('Crashed', 'grid'), { writerId: previous, version: 5 });

    const current = (await freshLoad())();
    expect(current.slice(current.lastIndexOf('-'))).toBe(previous.slice(previous.lastIndexOf('-')));
    registerSaveInstance(current, noopInstance);
    try {
      pruneJournal(h.app, { liveMapIds: ['n6'] });
      expect(readJournal(h.app, 'n6')).not.toBeNull();
      const prompt = vi.fn(async () => 'restore' as const);
      // The restoring pane is the same-numbered pane of the new load.
      const restored = await resolveJournalOnLoad(h.app, 'n6', '', prompt, current);
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(restored?.name).toBe('Crashed');
    } finally {
      unregisterSaveInstance(current);
    }
  });

  it('a slot of a currently mounted pane stays hidden from the prompt and from pruneJournal', async () => {
    const h = makeApp(JSON.stringify({ maps: { 'n6-live': createNewMap('Disk', 'grid') } }));
    const mint = await freshLoad();
    const paneA = mint();
    const paneB = mint();
    registerSaveInstance(paneA, noopInstance);
    try {
      journalPending(h.app, 'n6-live', createNewMap('A pending', 'grid'), { writerId: paneA, version: 2 });
      // Prune with the map gone would drop an orphan; a live writer's slot survives.
      pruneJournal(h.app, { liveMapIds: [] });
      expect(JSON.parse(h.store.get(JOURNAL_INDEX_KEY) ?? '[]')).toEqual([`n6-live@@${paneA}`]);
      const prompt = vi.fn(async () => 'discard' as const);
      await expect(resolveJournalOnLoad(h.app, 'n6-live', '', prompt, paneB)).resolves.toBeNull();
      expect(prompt).not.toHaveBeenCalled();
      expect(JSON.parse(readJournal(h.app, 'n6-live')?.payload as string).name).toBe('A pending');
    } finally {
      unregisterSaveInstance(paneA);
    }
  });

  it('an old-format windrose-save-<n> slot is offered, even if that literal id were registered', async () => {
    const h = makeApp(JSON.stringify({ maps: { 'n6-old': createNewMap('Disk', 'grid') } }));
    journalPending(h.app, 'n6-old', createNewMap('Legacy crash', 'grid'), { writerId: 'windrose-save-15', version: 3 });
    registerSaveInstance('windrose-save-15', noopInstance);
    try {
      pruneJournal(h.app, { liveMapIds: ['n6-old'] });
      const prompt = vi.fn(async () => 'restore' as const);
      const restored = await resolveJournalOnLoad(h.app, 'n6-old', '', prompt, (await freshLoad())());
      expect(prompt).toHaveBeenCalledTimes(1);
      expect(restored?.name).toBe('Legacy crash');
    } finally {
      unregisterSaveInstance('windrose-save-15');
    }
  });
});
