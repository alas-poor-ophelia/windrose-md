/**
 * DATA-01 regression: simulate the first SCHEMA_VERSION bump (2 -> 3). Every
 * stored v2 map must keep its layers; the old code rebuilt them as one empty
 * layer on load.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';

const noticeMessages: string[] = [];
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  class Notice {
    constructor(message: string) { noticeMessages.push(message); }
  }
  return { ...actual, Notice };
});

vi.mock('../../../src/core/dmtConstants', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/core/dmtConstants')>();
  return { ...actual, SCHEMA_VERSION: 3 };
});

import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { migrateMapData, createNewMap, loadMapData, MapDataUnreadableError } from '../../../src/persistence/fileOperations';
import { migrations, MapSchemaError } from '../../../src/persistence/schemaMigration';
import type { MapData, MapLayer } from '../../../types/core/map.types';

function storedV2Map(): MapData {
  const map = createNewMap('Stored', 'grid');
  map.schemaVersion = 2;
  map.layers[0].id = 'real-layer';
  map.layers[0].cells = [{ x: 9, y: 9, color: '#000' }] as MapLayer['cells'];
  map.activeLayerId = 'real-layer';
  return map;
}

afterEach(() => {
  delete migrations[3];
});

describe('a SCHEMA_VERSION bump with a registered step', () => {
  it('runs only the new step on a v2 map and keeps its layers', () => {
    const step = vi.fn((m: MapData) => ({ ...m, description: 'upgraded to 3' }));
    migrations[3] = step;

    const migrated = migrateMapData(storedV2Map());

    expect(step).toHaveBeenCalledTimes(1);
    expect(migrated.schemaVersion).toBe(3);
    expect(migrated.description).toBe('upgraded to 3');
    expect(migrated.layers.map(l => l.id)).toEqual(['real-layer']);
    expect(migrated.layers[0].cells).toEqual([{ x: 9, y: 9, color: '#000' }]);
  });
});

describe('a SCHEMA_VERSION bump with NO registered step', () => {
  it('refuses to load rather than rebuild or silently skip', () => {
    expect(() => migrateMapData(storedV2Map())).toThrow(MapSchemaError);
  });
});

describe('a missing step at LOAD time (Parallax #5)', () => {
  it('surfaces MapSchemaError, not MapDataUnreadableError, and no corrupt-file notice', async () => {
    noticeMessages.length = 0;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const file = new TFile();
    file.path = 'windrose-md-data.json';
    const content = JSON.stringify({ maps: { 'bump-1': storedV2Map() } });
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p === file.path ? file : null),
        read: async () => content,
      },
    } as unknown as App;

    const error = await loadMapData(app, 'bump-1').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MapSchemaError);
    expect(error).not.toBeInstanceOf(MapDataUnreadableError);
    expect((error as MapSchemaError).reason).toBe('missing-step');
    expect(noticeMessages).toEqual([]);
    errSpy.mockRestore();
  });
});
