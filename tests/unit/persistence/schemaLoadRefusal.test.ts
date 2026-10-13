/**
 * Parallax #1 / #5: a map from a NEWER plugin is never migrated, sanitized or
 * opened for editing by this build, and a schema refusal is reported as
 * MapSchemaError (a plugin-version problem), never as a corrupt data file.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { App } from 'obsidian';

const noticeMessages: string[] = [];
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  class Notice {
    constructor(message: string) { noticeMessages.push(message); }
  }
  return { ...actual, Notice };
});

import { TFile } from 'obsidian';
import {
  loadMapData, saveMapData, migrateMapData, MapDataUnreadableError, MapSchemaError,
} from '../../../src/persistence/fileOperations';
import { SCHEMA_VERSION } from '../../../src/core/dmtConstants';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(content: string): { app: App; read: () => string } {
  const file = new TFile();
  file.path = DATA_PATH;
  let current = content;
  const app = {
    vault: {
      getAbstractFileByPath: (path: string) => (path === DATA_PATH ? file : null),
      read: async () => current,
      modify: async (_f: TFile, data: string) => { current = data; },
      create: async (_p: string, data: string) => { current = data; },
      adapter: { exists: async () => false, write: async () => undefined },
    },
  } as unknown as App;
  return { app, read: () => current };
}

/** A map from a future schema: unknown curve shape + unknown layer property. */
function futureMap(): MapData {
  return {
    name: 'Future',
    mapType: 'grid',
    schemaVersion: SCHEMA_VERSION + 1,
    layers: [{
      id: 'L1',
      name: '1',
      order: 0,
      cells: [],
      curves: [{ id: 'c1', kind: 'spline-v3', controlNet: [[0, 0], [1, 1]] }],
      futureLayerProp: { lod: [1, 2, 3] },
    }],
    activeLayerId: 'L1',
  } as unknown as MapData;
}

beforeEach(() => {
  noticeMessages.length = 0;
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('newer-schema maps (Parallax #1)', () => {
  it('survive migrateMapData + saveMapData with unknown fields intact', async () => {
    const original = futureMap();
    const originalJson = JSON.stringify(original);
    const { app, read } = makeApp(JSON.stringify({ maps: {} }));

    const migrated = migrateMapData(JSON.parse(originalJson) as MapData);
    expect(JSON.stringify(migrated)).toBe(originalJson);

    const result = await saveMapData(app, 'future-1', migrated);
    expect(result.status).toBe('saved');
    const stored = (JSON.parse(read()) as { maps: Record<string, unknown> }).maps['future-1'];
    expect(JSON.stringify(stored)).toBe(originalJson);
  });

  it('are refused at load as MapSchemaError (not unreadable, no corrupt-file notice)', async () => {
    const { app } = makeApp(JSON.stringify({ maps: { 'future-2': futureMap() } }));

    const error = await loadMapData(app, 'future-2').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(MapSchemaError);
    expect(error).not.toBeInstanceOf(MapDataUnreadableError);
    expect((error as MapSchemaError).reason).toBe('newer-version');
    expect((error as Error).message).toMatch(/newer or fixed version/);
    expect(noticeMessages).toEqual([]);
  });

  it('a genuinely unparseable file is still MapDataUnreadableError with a notice', async () => {
    const { app } = makeApp('{ not json');
    await expect(loadMapData(app, 'x')).rejects.toBeInstanceOf(MapDataUnreadableError);
    expect(noticeMessages.length).toBe(1);
  });
});
