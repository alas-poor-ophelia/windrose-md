/**
 * Multi-pane journal restore (live check, chunk 3 "Other findings"): two panes
 * of one map with one pending crash slot must produce ONE restore decision per
 * map per load, and dismissing a prompt must never set aside a copy that is
 * already on disk.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  journalPending,
  readJournal,
  readKeptEntries,
  resolveJournalOnLoad,
  resetJournalLoadState,
} from '../../../src/persistence/saveJournal';
import { createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

interface Harness { app: App; setDisk: (data: MapData) => void }

function makeApp(mapId: string, onDisk: MapData): Harness {
  const store = new Map<string, string>();
  const file = new TFile();
  file.path = DATA_PATH;
  let content = JSON.stringify({ maps: { [mapId]: onDisk } });
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
  return { app, setDisk: (data) => { content = JSON.stringify({ maps: { [mapId]: data } }); } };
}

type Choice = 'restore' | 'discard' | 'keep';

beforeEach(() => { resetJournalLoadState(); });

describe('one restore decision per map per load', () => {
  it('two panes mounting one map with one pending slot: exactly one prompt, one pane restores', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const { app } = makeApp('mp-1', onDisk);
    journalPending(app, 'mp-1', { ...onDisk, description: 'crash edit' }, { writerId: 'w-dead-1', version: 4 });

    let prompts = 0;
    let release: (c: Choice) => void = () => undefined;
    const prompt = (): Promise<Choice> => {
      prompts++;
      return new Promise<Choice>((resolve) => { release = resolve; });
    };

    const paneA = resolveJournalOnLoad(app, 'mp-1', '', prompt, 'w-pane-a');
    const paneB = resolveJournalOnLoad(app, 'mp-1', '', prompt, 'w-pane-b');
    // Let both reach their decision point.
    for (let i = 0; i < 10; i++) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(prompts).toBe(1);

    release('restore');
    const [a, b] = await Promise.all([paneA, paneB]);
    expect(a?.description).toBe('crash edit');
    expect(b).toBeNull();
    expect(prompts).toBe(1);
  });

  it('a re-mount in the same load is not prompted again for a deferred slot', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const { app } = makeApp('mp-2', onDisk);
    journalPending(app, 'mp-2', { ...onDisk, description: 'crash edit' }, { writerId: 'w-dead-2', version: 2 });

    let prompts = 0;
    const keep = async (): Promise<Choice> => { prompts++; return 'keep'; };
    await expect(resolveJournalOnLoad(app, 'mp-2', '', keep, 'w-a')).resolves.toBeNull();
    await expect(resolveJournalOnLoad(app, 'mp-2', '', keep, 'w-a2')).resolves.toBeNull();
    expect(prompts).toBe(1);
    expect(readKeptEntries(app, 'mp-2')).toHaveLength(1);

    // The next plugin load offers it again.
    resetJournalLoadState();
    await resolveJournalOnLoad(app, 'mp-2', '', keep, 'w-b');
    expect(prompts).toBe(2);
  });
});

describe('Escape / keep never sets aside a tree already on disk', () => {
  it('a candidate identical to the store when the prompt closes keeps nothing', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const { app, setDisk } = makeApp('mp-3', onDisk);
    const edited: MapData = { ...onDisk, description: 'crash edit' };
    journalPending(app, 'mp-3', edited, { writerId: 'w-dead-3', version: 1 });

    // While the prompt is open, the same tree lands on disk (another pane restored and saved it).
    const escape = async (): Promise<Choice> => { setDisk(edited); return 'keep'; };
    await expect(resolveJournalOnLoad(app, 'mp-3', '', escape, 'w-c')).resolves.toBeNull();

    expect(readKeptEntries(app, 'mp-3')).toHaveLength(0);
    expect(readJournal(app, 'mp-3')).toBeNull();
  });

  it('a live slot resolved elsewhere while the prompt was open is not copied to kept', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const { app } = makeApp('mp-4', onDisk);
    journalPending(app, 'mp-4', { ...onDisk, description: 'crash edit' }, { writerId: 'w-dead-4', version: 1 });

    const escape = async (): Promise<Choice> => {
      app.saveLocalStorage('windrose-journal:mp-4@@w-dead-4', null);
      return 'keep';
    };
    await resolveJournalOnLoad(app, 'mp-4', '', escape, 'w-d');
    expect(readKeptEntries(app, 'mp-4')).toHaveLength(0);
  });

  it('control: a genuinely divergent candidate is still kept on Escape', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const { app } = makeApp('mp-5', onDisk);
    journalPending(app, 'mp-5', { ...onDisk, description: 'crash edit' }, { writerId: 'w-dead-5', version: 1 });
    await resolveJournalOnLoad(app, 'mp-5', '', async () => 'keep', 'w-e');
    expect(readKeptEntries(app, 'mp-5')).toHaveLength(1);
  });
});
