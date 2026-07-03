import { describe, it, expect, beforeEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { deleteMapData, saveMapData, createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

interface FakeVaultState {
  app: App;
  read: () => string;
  exists: () => boolean;
}

function makeApp(initialContent: string | null): FakeVaultState {
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
    create: async (path: string, data: string) => {
      const file = new TFile();
      file.path = path;
      files.set(path, file);
      contents.set(path, data);
    },
  };

  return {
    app: { vault } as unknown as App,
    read: () => contents.get(DATA_PATH) ?? '',
    exists: () => files.has(DATA_PATH),
  };
}

function fileWith(maps: Record<string, MapData>): string {
  return JSON.stringify({ maps });
}

describe('deleteMapData', () => {
  let mapA: MapData;
  let mapB: MapData;

  beforeEach(() => {
    mapA = createNewMap('Alpha', 'grid');
    mapB = createNewMap('Beta', 'hex');
  });

  it('deletes an existing map and returns true', async () => {
    const { app, read } = makeApp(fileWith({ a: mapA, b: mapB }));

    const result = await deleteMapData(app, 'a');

    expect(result).toBe(true);
    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps.a).toBeUndefined();
  });

  it('returns false and does not write when the map is absent', async () => {
    const { app, read } = makeApp(fileWith({ a: mapA }));
    const before = read();

    const result = await deleteMapData(app, 'missing');

    expect(result).toBe(false);
    expect(read()).toBe(before);
  });

  it('leaves other maps untouched', async () => {
    const { app, read } = makeApp(fileWith({ a: mapA, b: mapB }));

    await deleteMapData(app, 'a');

    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps.b).toBeDefined();
    expect(after.maps.b.name).toBe('Beta');
  });

  it('returns false when the data file does not exist', async () => {
    const { app, exists } = makeApp(null);

    const result = await deleteMapData(app, 'a');

    expect(result).toBe(false);
    expect(exists()).toBe(false);
  });

  it('does not delete the data file even when it becomes empty', async () => {
    const { app, exists, read } = makeApp(fileWith({ a: mapA }));

    const result = await deleteMapData(app, 'a');

    expect(result).toBe(true);
    expect(exists()).toBe(true);
    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps).toEqual({});
  });

  it('refuses to modify an unparseable data file', async () => {
    const { app, read } = makeApp('{ this is not json');
    const before = read();

    const result = await deleteMapData(app, 'a');

    expect(result).toBe(false);
    expect(read()).toBe(before);
  });
});

describe('deleted-map tombstones (saveMapData guard)', () => {
  it('saveMapData refuses to write a tombstoned ID', async () => {
    const map = createNewMap('Tomb', 'grid');
    const { app, read } = makeApp(fileWith({ 'tomb-1': map }));

    await deleteMapData(app, 'tomb-1');
    const saveResult = await saveMapData(app, 'tomb-1', map);

    expect(saveResult).toBe(true);
    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps['tomb-1']).toBeUndefined();
  });

  it('deleteMapData then saveMapData (unawaited ordering) leaves the map absent', async () => {
    const map = createNewMap('Tomb', 'grid');
    const { app, read } = makeApp(fileWith({ 'tomb-2': map }));

    const deletePromise = deleteMapData(app, 'tomb-2');
    const savePromise = saveMapData(app, 'tomb-2', map);
    await Promise.all([deletePromise, savePromise]);

    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps['tomb-2']).toBeUndefined();
  });

  it('saveMapData still writes non-tombstoned IDs normally', async () => {
    const map = createNewMap('Alive', 'grid');
    const { app, read } = makeApp(fileWith({}));

    const result = await saveMapData(app, 'alive-1', map);

    expect(result).toBe(true);
    const after = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(after.maps['alive-1']).toBeDefined();
    expect(after.maps['alive-1'].name).toBe('Alive');
  });
});
