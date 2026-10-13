import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  loadMapData,
  createNewMap,
  MapDataUnreadableError,
  MapDataFileMissingError,
  createEmptyDataFile,
} from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

const creates: string[] = [];

function makeApp(initialContent: string | null): App {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();

  if (initialContent != null) {
    const file = new TFile();
    file.path = DATA_PATH;
    files.set(DATA_PATH, file);
    contents.set(DATA_PATH, initialContent);
  }

  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    read: async (file: TFile) => contents.get(file.path) ?? '',
    modify: async (file: TFile, data: string) => { contents.set(file.path, data); },
    create: async (path: string, data: string) => { creates.push(path); contents.set(path, data); },
    createFolder: async () => { /* unused */ },
  };
  return { vault } as unknown as App;
}

function fileWith(maps: Record<string, MapData>): string {
  return JSON.stringify({ maps });
}

describe('loadMapData refuses unreadable data files', () => {
  it('throws MapDataUnreadableError instead of returning a fresh map', async () => {
    const app = makeApp('{"maps": {"a": {"name": "Half writ');

    await expect(loadMapData(app, 'a', 'Fallback name', 'grid'))
      .rejects.toBeInstanceOf(MapDataUnreadableError);
  });

  it('reports the data file path on the error', async () => {
    const app = makeApp('not json');

    await expect(loadMapData(app, 'a')).rejects.toMatchObject({ dataPath: DATA_PATH });
  });

  it('throws when the file parses but has no maps object', async () => {
    const app = makeApp('{"somethingElse": 1}');

    await expect(loadMapData(app, 'a')).rejects.toBeInstanceOf(MapDataUnreadableError);
  });

  it('throws when a truncated read yields an empty document', async () => {
    const app = makeApp('');

    await expect(loadMapData(app, 'a')).rejects.toBeInstanceOf(MapDataUnreadableError);
  });

  it('throws MapDataFileMissingError when the data file is absent, and writes nothing', async () => {
    creates.length = 0;
    const app = makeApp(null);
    const modify = vi.spyOn(app.vault, 'modify');

    const error = await loadMapData(app, 'a', 'Brand new', 'grid').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MapDataFileMissingError);
    expect((error as MapDataFileMissingError).dataPath).toBe(DATA_PATH);
    expect(creates).toEqual([]);
    expect(modify).not.toHaveBeenCalled();
  });

  it('createEmptyDataFile creates an empty store only on request, and never over an existing file', async () => {
    creates.length = 0;
    const app = makeApp(null);
    expect(await createEmptyDataFile(app)).toBe(true);
    expect(creates).toEqual([DATA_PATH]);

    creates.length = 0;
    const existing = makeApp(fileWith({}));
    expect(await createEmptyDataFile(existing)).toBe(false);
    expect(creates).toEqual([]);
  });

  it('still returns a fresh map when the file parses but the map id is absent', async () => {
    const app = makeApp(fileWith({ other: createNewMap('Other', 'grid') }));

    const data = await loadMapData(app, 'missing-id', 'Brand new', 'hex');

    expect(data.name).toBe('Brand new');
    expect(data.mapType).toBe('hex');
  });

  it('returns the stored map when everything is well-formed', async () => {
    const app = makeApp(fileWith({ good: createNewMap('Stored', 'grid') }));

    const data = await loadMapData(app, 'good', 'Ignored', 'grid');

    expect(data.name).toBe('Stored');
  });
});
