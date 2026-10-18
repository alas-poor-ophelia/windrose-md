// @vitest-environment happy-dom
/**
 * Installing a tree read from the store (adopt) or a crash journal (restore)
 * must not blank the tile registry: folder tilesets in those trees carry
 * `tiles: []` (derived lists are stripped on save). The live lists are carried
 * across; a tileset the live map cannot fill asks the builder to rescan.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';

import type { MapData } from '../../../../types/core/map.types';
import type { TilesetDef } from '../../../../types/tiles/tile.types';
import type { SaveMapResult } from '../../../../src/persistence/fileOperations';

const saveMock = vi.fn<(app: App, mapId: string, data: MapData) => Promise<SaveMapResult>>();

vi.mock('../../../../src/persistence/fileOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/persistence/fileOperations')>();
  return {
    ...actual,
    saveMapData: (app: App, mapId: string, data: MapData) => saveMock(app, mapId, data),
  };
});

import { useDebouncedSave } from '../../../../src/hooks/state/useDebouncedSave';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { notifyRestoreLanded } from '../../../../src/persistence/saveCoordinator';
import { carryLiveTileLists } from '../../../../src/assets/tilesetOperations';

type Hook = ReturnType<typeof useDebouncedSave>;

const TILES = [{ id: 'a/A', filename: 'A.webp', vaultPath: 'P/a/A.webp' }];

function folderSet(id: string, folderPath: string, tiles: unknown[]): TilesetDef {
  return { id, name: id, source: 'folder', folderPath, tiles, tileWidth: 256, tileHeight: 256 } as unknown as TilesetDef;
}

function mapWith(name: string, tilesets: TilesetDef[]): MapData {
  return { ...createNewMap(name, 'hex'), tilesets };
}

const app = {
  saveLocalStorage: () => undefined,
  loadLocalStorage: () => null,
  vault: { getAbstractFileByPath: () => null, read: async () => '' },
} as unknown as App;

let container: HTMLElement | null = null;

function mount(initial: MapData, readStore?: () => Promise<{ data: MapData; generation: number } | null>) {
  let current: Hook | null = null;
  let data: MapData | null = null;
  const rebuild = vi.fn();
  function Probe(): null {
    const [d, setD] = useState<MapData | null>(initial);
    data = d;
    current = useDebouncedSave(app, 'carry-1', setD, { current: 0 }, readStore, rebuild);
    return null;
  }
  container = document.createElement('div');
  act(() => { render(h(Probe, null), container as HTMLElement); });
  return { hook: () => current as Hook, data: () => data, rebuild };
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset();
  saveMock.mockResolvedValue({ status: 'saved', generation: 1 });
});

afterEach(() => {
  if (container) act(() => { render(null, container as HTMLElement); });
  container = null;
  vi.useRealTimers();
});

describe('carryLiveTileLists', () => {
  it('fills an empty folder tileset from the live one with the same id', () => {
    const incoming = mapWith('Disk', [folderSet('ts1', 'P/a', [])]);
    const live = mapWith('Live', [folderSet('ts1', 'P/a', TILES)]);
    const { data, needsRebuild } = carryLiveTileLists(incoming, live);
    expect(data.tilesets?.[0].tiles).toBe(live.tilesets?.[0].tiles);
    expect(data.name).toBe('Disk');
    expect(needsRebuild).toBe(false);
  });

  it('matches on folder path when the id differs', () => {
    const incoming = mapWith('Disk', [folderSet('old-id', 'P/a', [])]);
    const live = mapWith('Live', [folderSet('new-id', 'P/a', TILES)]);
    expect(carryLiveTileLists(incoming, live).data.tilesets?.[0].tiles).toHaveLength(1);
  });

  it('an unknown folder tileset requests a rebuild; nothing to carry returns the input', () => {
    const incoming = mapWith('Disk', [folderSet('ts9', 'P/z', [])]);
    const res = carryLiveTileLists(incoming, mapWith('Live', [folderSet('ts1', 'P/a', TILES)]));
    expect(res.needsRebuild).toBe(true);
    expect(res.data).toBe(incoming);
    expect(carryLiveTileLists(mapWith('Disk', []), null)).toEqual({ data: expect.anything(), needsRebuild: false });
  });

  it('leaves sheet tilesets and populated lists alone', () => {
    const sheet = { ...folderSet('s', 'x', TILES), source: 'sheet' } as unknown as TilesetDef;
    const incoming = mapWith('Disk', [sheet, folderSet('ts1', 'P/a', TILES)]);
    const res = carryLiveTileLists(incoming, mapWith('Live', []));
    expect(res.data).toBe(incoming);
    expect(res.needsRebuild).toBe(false);
  });
});

describe('useDebouncedSave installs stripped trees without blanking the registry', () => {
  it('applyRestored keeps the live tile list', () => {
    const m = mount(mapWith('Live', [folderSet('ts1', 'P/a', TILES)]));
    act(() => { m.hook().applyRestored(mapWith('Restored', [folderSet('ts1', 'P/a', [])])); });
    expect(m.data()?.name).toBe('Restored');
    expect(m.data()?.tilesets?.[0].tiles).toHaveLength(1);
    expect(m.rebuild).not.toHaveBeenCalled();
  });

  it('applyRestored with a tileset the live map lacks requests a rebuild', () => {
    const m = mount(mapWith('Live', []));
    act(() => { m.hook().applyRestored(mapWith('Restored', [folderSet('ts9', 'P/z', [])])); });
    expect(m.rebuild).toHaveBeenCalled();
  });

  it('adopting a sibling save keeps the live tile list', async () => {
    const stored = mapWith('Sibling', [folderSet('ts1', 'P/a', [])]);
    const m = mount(mapWith('Live', [folderSet('ts1', 'P/a', TILES)]), async () => ({ data: stored, generation: 5 }));
    await act(async () => { notifyRestoreLanded('carry-1', 'someone-else'); await vi.advanceTimersByTimeAsync(0); });
    expect(m.data()?.name).toBe('Sibling');
    expect(m.data()?.tilesets?.[0].tiles).toHaveLength(1);
    expect(m.rebuild).not.toHaveBeenCalled();
  });

  it('adopting a tree with an unknown tileset requests a rebuild', async () => {
    const stored = mapWith('Sibling', [folderSet('ts9', 'P/z', [])]);
    const m = mount(mapWith('Live', [folderSet('ts1', 'P/a', TILES)]), async () => ({ data: stored, generation: 5 }));
    await act(async () => { notifyRestoreLanded('carry-1', 'someone-else'); await vi.advanceTimersByTimeAsync(0); });
    expect(m.data()?.name).toBe('Sibling');
    expect(m.rebuild).toHaveBeenCalled();
  });
});
