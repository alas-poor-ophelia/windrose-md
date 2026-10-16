/**
 * Parallax wave-7 finding 1: a store (or its backup) living at another vault
 * path is prior-store evidence. The loader shows the missing-store panel
 * naming that path instead of a blank map whose first edit would create a
 * rival store at the configured path; first-use creation is refused with a
 * notice (finding 5).
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  loadMapData,
  saveMapData,
  createNewMap,
  ensureDataFileForNewMap,
  storeFoundElsewhere,
  MapDataFileMissingError,
} from '../../../src/persistence/fileOperations';

const DATA_PATH = 'windrose-md-data.json';

function makeVault(paths: string[]): { app: App; creates: string[]; writes: string[] } {
  const files = paths.map(p => { const f = new TFile(); f.path = p; return f; });
  const creates: string[] = [];
  const writes: string[] = [];
  const vault = {
    getAbstractFileByPath: (p: string) => files.find(f => f.path === p) ?? null,
    getFiles: () => files,
    read: async () => '{"maps":{}}',
    modify: async (f: TFile) => { writes.push(f.path); },
    create: async (p: string) => { creates.push(p); },
    createFolder: async () => { /* unused */ },
  };
  return { app: { vault } as unknown as App, creates, writes };
}

describe('store found at another path', () => {
  it('a same-named store in a subfolder: missing panel naming it, no blank map, no rival store', async () => {
    const v = makeVault(['Campaign/Data/windrose-md-data.json']);
    expect(storeFoundElsewhere(v.app, DATA_PATH)).toBe('Campaign/Data/windrose-md-data.json');
    const error: unknown = await loadMapData(v.app, 'm1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MapDataFileMissingError);
    expect((error as MapDataFileMissingError).foundAt).toBe('Campaign/Data/windrose-md-data.json');
    expect((await saveMapData(v.app, 'm1', createNewMap('x'))).status).toBe('failed');
  });

  it('elsewhere-only evidence does not block first-use creation (a Notice names the found path)', async () => {
    const v = makeVault(['Campaign/Data/windrose-md-data.json']);
    expect(await ensureDataFileForNewMap(v.app)).toBe(true);
    expect(v.creates).toEqual([DATA_PATH]);
  });

  it('a backup sibling at the configured path still refuses creation', async () => {
    const v = makeVault(['windrose-md-data.bak1.json']);
    expect(await ensureDataFileForNewMap(v.app)).toBe(false);
    expect(v.creates).toEqual([]);
  });

  it('only a backup name elsewhere still counts as evidence', () => {
    const v = makeVault(['old/windrose-md-data.bak2.json']);
    expect(storeFoundElsewhere(v.app, DATA_PATH)).toBe('old/windrose-md-data.bak2.json');
  });

  it('a store name preferred over a backup name; unrelated files are not evidence', () => {
    expect(storeFoundElsewhere(makeVault(['a/windrose-md-data.bak1.json', 'b/windrose-md-data.json']).app, DATA_PATH)).toBe('b/windrose-md-data.json');
    expect(storeFoundElsewhere(makeVault(['notes/windrose-md-data.md', 'other.json']).app, DATA_PATH)).toBeNull();
  });

  it('the configured store itself is not "elsewhere"', () => {
    expect(storeFoundElsewhere(makeVault([DATA_PATH]).app, DATA_PATH)).toBeNull();
  });
});
