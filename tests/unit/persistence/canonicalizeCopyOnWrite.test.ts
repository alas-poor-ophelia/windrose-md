/**
 * canonicalizeTileIds is copy-on-write (STRUCT-B-19 / DATA-10) and recursive
 * through nested sub-hex maps (DATA-07); save and journal serialize the
 * canonical copy without touching the live tree.
 */

import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import { canonicalizeTileIds, createNewMap, saveMapData } from '../../../src/persistence/fileOperations';
import { journalPending, readJournal } from '../../../src/persistence/saveJournal';
import type { MapData, MapLayer } from '../../../types/core/map.types';
import type { TilesetDef, TileAssignment } from '../../../types/tiles/tile.types';

function tileset(id: string, tileIds: string[]): TilesetDef {
  return {
    id,
    name: id,
    tiles: tileIds.map(tid => ({ id: tid, filename: tid.split('/').pop() + '.webp', vaultPath: 'Pack/' + tid + '.webp' })),
    tileWidth: 256,
    tileHeight: 256,
  } as unknown as TilesetDef;
}

function placement(tileId: string): TileAssignment {
  return { col: 0, row: 0, tilesetId: 'ts1', tileId } as TileAssignment;
}

/** Root with a legacy id on layer 0, an untouched layer 1, and a legacy id at sub-hex depth 2. */
function fixture(): MapData {
  const map = createNewMap('root', 'hex');
  map.tilesets = [tileset('ts1', ['terrain/Stone', 'props/Barrel'])];
  map.layers[0].tiles = [placement('Stone')];
  map.layers.push({ ...map.layers[0], id: 'L-untouched', tiles: [placement('props/Barrel')] } as MapLayer);
  const d1 = createNewMap('d1', 'hex');
  const d2 = createNewMap('d2', 'hex');
  d2.layers[0].tiles = [placement('Barrel')];
  d1.subHexMaps = { '1,0': { subdivisionRings: 7, mapData: d2, lastModified: '' } };
  map.subHexMaps = { '0,0': { subdivisionRings: 7, mapData: d1, lastModified: '' } };
  return map;
}

describe('canonicalizeTileIds copy-on-write', () => {
  it('does not mutate the input', () => {
    const map = fixture();
    const before = JSON.stringify(map);
    canonicalizeTileIds(map);
    expect(JSON.stringify(map)).toBe(before);
  });

  it('returns the canonical tree, including depth-2 sub-hex layers', () => {
    const out = canonicalizeTileIds(fixture());
    expect(out.layers[0].tiles?.[0].tileId).toBe('terrain/Stone');
    const d2 = out.subHexMaps?.['0,0']?.mapData.subHexMaps?.['1,0']?.mapData;
    expect(d2?.layers[0].tiles?.[0].tileId).toBe('props/Barrel');
  });

  it('copies only what changes: untouched layers keep identity; no-op returns the input', () => {
    const map = fixture();
    const out = canonicalizeTileIds(map);
    expect(out).not.toBe(map);
    expect(out.layers[1]).toBe(map.layers[1]);
    expect(canonicalizeTileIds(out)).toBe(out);
  });
});

describe('save and journal serialize the canonical copy', () => {
  it('saveMapData writes canonical ids without editing the live tree', async () => {
    const contents = new Map<string, string>();
    const file = new TFile();
    file.path = 'windrose-md-data.json';
    contents.set(file.path, JSON.stringify({ maps: {} }));
    const app = {
      vault: {
        getAbstractFileByPath: (p: string) => (p === file.path ? file : null),
        read: async () => contents.get(file.path) ?? '',
        modify: async (_f: TFile, data: string) => { contents.set(file.path, data); },
        create: async () => undefined,
      },
    } as unknown as App;

    const live = fixture();
    const before = JSON.stringify(live);
    const res = await saveMapData(app, 'cow-save', live);

    expect(res.status).toBe('saved');
    expect(JSON.stringify(live)).toBe(before);
    const stored = (JSON.parse(contents.get(file.path) as string) as { maps: Record<string, MapData> }).maps['cow-save'];
    expect(stored.layers[0].tiles?.[0].tileId).toBe('terrain/Stone');
  });

  it('journalPending journals canonical ids without editing the live tree', () => {
    const store = new Map<string, string>();
    const app = {
      saveLocalStorage: (k: string, v: unknown) => { if (v == null) store.delete(k); else store.set(k, String(v)); },
      loadLocalStorage: (k: string) => store.get(k) ?? null,
    } as unknown as App;

    const live = fixture();
    const before = JSON.stringify(live);
    journalPending(app, 'cow-journal', live);

    expect(JSON.stringify(live)).toBe(before);
    const payload = JSON.parse(readJournal(app, 'cow-journal')?.payload as string) as MapData;
    expect(payload.layers[0].tiles?.[0].tileId).toBe('terrain/Stone');
  });
});
