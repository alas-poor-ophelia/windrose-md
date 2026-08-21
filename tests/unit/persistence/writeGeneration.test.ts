/**
 * writeGeneration.test.ts
 *
 * The in-process per-mapId write-generation guard in saveMapData: a save
 * whose caller's base generation is older than the entry's current
 * generation is refused ('stale') instead of clobbering the whole entry with
 * a stale tree — the corruption engine behind windrose-2x9 (same map open in
 * two panes, last writer silently destroyed the other pane's session).
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  saveMapData,
  loadMapDataWithGeneration,
  createNewMap,
} from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(initialContent: string | null): { app: App; read: () => string } {
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
    modify: async (file: TFile, data: string) => {
      contents.set(file.path, data);
    },
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
  };
}

function fileWith(maps: Record<string, MapData>): string {
  return JSON.stringify({ maps });
}

// Map ids are unique per test: entryGenerations is module-level state shared
// across this file's tests (exactly like production, one realm per session).

describe('saveMapData write-generation guard', () => {
  it('a fresh save reports the new generation', async () => {
    const { app } = makeApp(fileWith({}));
    const result = await saveMapData(app, 'gen-fresh', createNewMap('A', 'grid'), 0);
    expect(result).toEqual({ status: 'saved', generation: 1 });
  });

  it('a save based on an older generation is refused as stale, preserving the newer write', async () => {
    const { app, read } = makeApp(fileWith({}));

    // Both "instances" load at generation 0.
    const a = await loadMapDataWithGeneration(app, 'gen-race', 'Race', 'grid');
    const b = await loadMapDataWithGeneration(app, 'gen-race', 'Race', 'grid');
    expect(a.generation).toBe(0);
    expect(b.generation).toBe(0);

    // Instance A commits first.
    const aTree = { ...a.data, name: 'From A' };
    const aResult = await saveMapData(app, 'gen-race', aTree, a.generation);
    expect(aResult.status).toBe('saved');

    // Instance B's tree never saw A's write — refused, file untouched.
    const bTree = { ...b.data, name: 'From B (stale)' };
    const bResult = await saveMapData(app, 'gen-race', bTree, b.generation);
    expect(bResult.status).toBe('stale');

    const onDisk = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(onDisk.maps['gen-race'].name).toBe('From A');
  });

  it('reloading re-bases the loser and its next save lands', async () => {
    const { app, read } = makeApp(fileWith({}));

    const a = await loadMapDataWithGeneration(app, 'gen-rebase', 'Rebase', 'grid');
    const b = await loadMapDataWithGeneration(app, 'gen-rebase', 'Rebase', 'grid');

    const aSave = await saveMapData(app, 'gen-rebase', { ...a.data, name: 'A1' }, a.generation);
    expect(aSave.status).toBe('saved');
    expect((await saveMapData(app, 'gen-rebase', { ...b.data, name: 'B stale' }, b.generation)).status).toBe('stale');

    // B reloads: picks up A's tree AND the current generation.
    const b2 = await loadMapDataWithGeneration(app, 'gen-rebase', 'Rebase', 'grid');
    expect(b2.data.name).toBe('A1');
    const b2Save = await saveMapData(app, 'gen-rebase', { ...b2.data, name: 'B2' }, b2.generation);
    expect(b2Save.status).toBe('saved');

    const onDisk = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(onDisk.maps['gen-rebase'].name).toBe('B2');
  });

  it('sequential saves from one instance keep landing when each re-bases on the returned generation', async () => {
    const { app } = makeApp(fileWith({}));

    let base = (await loadMapDataWithGeneration(app, 'gen-seq', 'Seq', 'grid')).generation;
    for (let i = 1; i <= 3; i++) {
      const result = await saveMapData(app, 'gen-seq', createNewMap(`Seq ${String(i)}`, 'grid'), base);
      expect(result.status).toBe('saved');
      if (result.status === 'saved') base = result.generation;
    }
    expect(base).toBe(3);
  });

  it('a save without a base generation is never refused (legacy/untracked callers)', async () => {
    const { app } = makeApp(fileWith({}));

    await saveMapData(app, 'gen-untracked', createNewMap('First', 'grid'), 0);
    const result = await saveMapData(app, 'gen-untracked', createNewMap('Untracked', 'grid'));
    expect(result.status).toBe('saved');
  });

  it('an instance is never stale against its own writes (writer-id exemption)', async () => {
    // Self-race shape: save2 dispatched with the base read BEFORE save1's
    // completion advanced it (vault write outlasting the debounce window).
    // Same writer → allowed; the later payload derives from newer state.
    const { app, read } = makeApp(fileWith({}));

    const s1 = await saveMapData(app, 'gen-self', createNewMap('S1', 'grid'), 0, 'writer-A');
    expect(s1.status).toBe('saved');

    const s2 = await saveMapData(app, 'gen-self', createNewMap('S2', 'grid'), 0, 'writer-A');
    expect(s2.status).toBe('saved');

    // A DIFFERENT writer with the same stale base is still refused.
    const s3 = await saveMapData(app, 'gen-self', createNewMap('S3', 'grid'), 0, 'writer-B');
    expect(s3.status).toBe('stale');

    const onDisk = JSON.parse(read()) as { maps: Record<string, MapData> };
    expect(onDisk.maps['gen-self'].name).toBe('S2');
  });

  it('a failed save does not advance the generation', async () => {
    // Unparseable existing file → save refuses (failed), generation untouched.
    const { app } = makeApp('{ not json at all');
    const result = await saveMapData(app, 'gen-fail', createNewMap('F', 'grid'), 0);
    expect(result.status).toBe('failed');

    // A base-0 save against a fresh valid file still lands: generation for
    // this id never moved.
    const { app: app2 } = makeApp(fileWith({}));
    const retry = await saveMapData(app2, 'gen-fail', createNewMap('F2', 'grid'), 0);
    expect(retry.status).toBe('saved');
  });
});
