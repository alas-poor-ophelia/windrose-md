import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  loadMapData,
  loadMapDataWithGeneration,
  saveMapData,
  createNewMap,
  ensureDataFileForNewMap,
  MapDataFileMissingError,
} from '../../../src/persistence/fileOperations';

const DATA_PATH = 'windrose-md-data.json';

interface FakeVault {
  app: App;
  files: Map<string, TFile>;
  contents: Map<string, string>;
  creates: string[];
  remove: (path: string) => void;
}

function makeVault(initial: Record<string, string> = {}): FakeVault {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();
  const creates: string[] = [];
  const add = (path: string, data: string): void => {
    const f = new TFile();
    f.path = path;
    files.set(path, f);
    contents.set(path, data);
  };
  for (const [p, c] of Object.entries(initial)) add(p, c);
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    getFiles: () => [...files.values()],
    read: async (file: TFile) => contents.get(file.path) ?? '',
    modify: async (file: TFile, data: string) => { contents.set(file.path, data); },
    create: async (path: string, data: string) => { creates.push(path); add(path, data); },
    createFolder: async () => { /* unused */ },
  };
  return {
    app: { vault } as unknown as App,
    files, contents, creates,
    remove: (path: string) => { files.delete(path); contents.delete(path); },
  };
}

describe('first use: a fresh vault never lands on the missing-store panel', () => {
  it('a missing store with a quarantined corrupt copy beside it is treated as missing', async () => {
    const v = makeVault({ [`${DATA_PATH}.corrupt-20261013-120000`]: 'garbage' });
    await expect(loadMapData(v.app, 'a')).rejects.toBeInstanceOf(MapDataFileMissingError);
    expect(await ensureDataFileForNewMap(v.app)).toBe(false);
    expect(v.creates).toEqual([]);
  });

  it('a missing store with a daily backup beside it refuses first-use creation', async () => {
    const v = makeVault({ 'windrose-md-data.bak-daily.json': '{"maps":{}}' });
    expect(await ensureDataFileForNewMap(v.app)).toBe(false);
    await expect(loadMapData(v.app, 'a')).rejects.toBeInstanceOf(MapDataFileMissingError);
    expect(v.creates).toEqual([]);
  });

  it('an empty vault with no evidence loads a blank map without writing', async () => {
    const v = makeVault();
    const data = await loadMapData(v.app, 'first', 'First map', 'hex');
    expect(data.name).toBe('First map');
    expect(v.creates).toEqual([]);
  });

  // From here on the session has seen the store (ordering matters).
  it('empty vault + insert new map: the store is created, then the map loads', async () => {
    const v = makeVault();
    expect(await ensureDataFileForNewMap(v.app)).toBe(true);
    expect(v.creates).toEqual([DATA_PATH]);
    expect(JSON.parse(v.contents.get(DATA_PATH) ?? '')).toEqual({ maps: {} });

    const data = await loadMapData(v.app, 'new-map', 'New map', 'grid');
    expect(data.name).toBe('New map');

    // A second insert never overwrites the existing store.
    expect(await ensureDataFileForNewMap(v.app)).toBe(true);
    expect(v.creates).toEqual([DATA_PATH]);
  });

  it('mid-session disappearance: an autosave after the store vanished fails and writes nothing', async () => {
    const v = makeVault({ [DATA_PATH]: JSON.stringify({ maps: { m: createNewMap('Stored', 'grid') } }) });
    const { data, generation } = await loadMapDataWithGeneration(v.app, 'm');
    v.remove(DATA_PATH);

    const result = await saveMapData(v.app, 'm', data, generation, 'writer-1');

    expect(result.status).toBe('failed');
    expect(v.creates).toEqual([]);
    expect(v.files.has(DATA_PATH)).toBe(false);
  });

  it('after the store was seen, a missing store shows the panel even with no backups', async () => {
    const v = makeVault();
    await expect(loadMapData(v.app, 'm')).rejects.toBeInstanceOf(MapDataFileMissingError);
    expect(await ensureDataFileForNewMap(v.app)).toBe(false);
    expect(v.creates).toEqual([]);
  });
});
