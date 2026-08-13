import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  loadMapData,
  createNewMap,
  MapDataUnreadableError,
} from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

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
    create: async () => { /* unused */ },
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

  it('still returns a fresh map when the data file is absent', async () => {
    const app = makeApp(null);

    const data = await loadMapData(app, 'a', 'Brand new', 'grid');

    expect(data.name).toBe('Brand new');
    expect(data.layers).toHaveLength(1);
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
