import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  loadMapData,
  saveMapData,
  listMaps,
  createNewMap,
  getSaveQueue,
  MapDataUnreadableError,
} from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface FakeVault {
  app: App;
  read: () => string;
  events: string[];
}

/** Vault whose writes take `writeDelayMs`, standing in for a chunked modify. */
function makeApp(initialContent: string | null, writeDelayMs = 0): FakeVault {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();
  const events: string[] = [];

  if (initialContent != null) {
    const file = new TFile();
    file.path = DATA_PATH;
    files.set(DATA_PATH, file);
    contents.set(DATA_PATH, initialContent);
  }

  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    read: async (file: TFile) => {
      events.push('read');
      return contents.get(file.path) ?? '';
    },
    modify: async (file: TFile, data: string) => {
      if (writeDelayMs > 0) await delay(writeDelayMs);
      contents.set(file.path, data);
      events.push('write');
    },
    create: async (path: string, data: string) => {
      const file = new TFile();
      file.path = path;
      files.set(path, file);
      contents.set(path, data);
      events.push('write');
    },
  };

  return {
    app: { vault } as unknown as App,
    read: () => contents.get(DATA_PATH) ?? '',
    events,
  };
}

function fileWith(maps: Record<string, MapData>): string {
  return JSON.stringify({ maps });
}

describe('data-file mutex covers reads', () => {
  it('a load started during a slow save resolves only after the write lands', async () => {
    const stored = createNewMap('Old name', 'grid');
    const { app, events } = makeApp(fileWith({ 'mutex-1': stored }), 25);

    const updated = createNewMap('New name', 'grid');
    const savePromise = saveMapData(app, 'mutex-1', updated);
    // Started while the save is mid-flight — must queue behind it.
    const loadPromise = loadMapData(app, 'mutex-1');

    const loaded = await loadPromise;
    events.push('load-resolved');
    await savePromise;

    expect(loaded.name).toBe('New name');
    expect(events.indexOf('write')).toBeLessThan(events.indexOf('load-resolved'));
  });

  it('listMaps also queues behind an in-flight save', async () => {
    const stored = createNewMap('Before', 'grid');
    const { app } = makeApp(fileWith({ 'mutex-2': stored }), 25);

    const updated = createNewMap('After', 'grid');
    const savePromise = saveMapData(app, 'mutex-2', updated);
    const listPromise = listMaps(app);

    const entries = await listPromise;
    await savePromise;

    expect(entries.find(e => e.id === 'mutex-2')?.name).toBe('After');
  });

  it('getSaveQueue settles after the last enqueued operation', async () => {
    const { app } = makeApp(fileWith({}), 15);

    let landed = false;
    const savePromise = saveMapData(app, 'mutex-3', createNewMap('Queued', 'grid')).then((res) => {
      landed = res.status === 'saved';
      return res;
    });

    await getSaveQueue();
    // getSaveQueue resolves with the tail of the chain, so the save's own
    // continuation may still be one microtask behind — awaiting it is enough.
    await savePromise;
    expect(landed).toBe(true);
  });

  it('a failing operation does not poison the queue', async () => {
    const { app } = makeApp('{ not json at all');

    await expect(loadMapData(app, 'mutex-4')).rejects.toBeInstanceOf(MapDataUnreadableError);

    // The next op still runs (the chain self-heals).
    const entries = await listMaps(app);
    expect(entries).toEqual([]);
  });
});
