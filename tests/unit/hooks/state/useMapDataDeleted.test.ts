// @vitest-environment happy-dom
/**
 * DATA-02: a map deleted this session (by any mount) must not remount as a
 * blank editable map. A fresh mount of the deleted id reports mapDeleted and
 * holds no map data; nothing is written.
 */

import { describe, it, expect, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import type { UseMapDataResult } from '../../../../types/hooks/mapData.types';
import type { MapData } from '../../../../types/core/map.types';

vi.mock('../../../../src/hooks/state/useTilesetBuilder', () => ({
  useTilesetBuilder: () => undefined,
}));

import { useMapData } from '../../../../src/hooks/state/useMapData';
import { AppContext } from '../../../../src/context/AppContext';
import { createNewMap, deleteMapData } from '../../../../src/persistence/fileOperations';

const DATA_PATH = 'windrose-md-data.json';

function makeApp(maps: Record<string, MapData>): { app: App; read: () => string; writes: () => number } {
  const file = new TFile();
  file.path = DATA_PATH;
  let content = JSON.stringify({ maps });
  let writeCount = 0;
  const store = new Map<string, string>();
  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) store.delete(key);
      else store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {
      getAbstractFileByPath: (path: string) => (path === DATA_PATH ? file : null),
      read: async () => content,
      modify: async (_f: TFile, data: string) => { content = data; writeCount++; },
      create: async (_p: string, data: string) => { content = data; writeCount++; },
    },
  } as unknown as App;
  return { app, read: () => content, writes: () => writeCount };
}

function mount(app: App, mapId: string): { result: () => UseMapDataResult; unmount: () => void } {
  let current: UseMapDataResult | null = null;
  function Probe(): null {
    current = useMapData(mapId, 'Doomed', 'grid');
    return null;
  }
  const container = document.createElement('div');
  act(() => {
    render(h(AppContext.Provider, { value: app }, h(Probe, null)), container);
  });
  return {
    result: () => current as UseMapDataResult,
    unmount: () => { act(() => { render(null, container); }); },
  };
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

describe('useMapData: deleted map (DATA-02)', () => {
  it('a live map loads normally and is not flagged deleted', async () => {
    const { app } = makeApp({ 'live-1': createNewMap('Live', 'grid') });
    const m = mount(app, 'live-1');
    await settle();
    expect(m.result().isLoading).toBe(false);
    expect(m.result().mapDeleted).toBe(false);
    expect(m.result().mapData?.name).toBe('Live');
    m.unmount();
  });

  it('a second mount of a map deleted elsewhere shows deleted, not a blank map', async () => {
    const { app, read, writes } = makeApp({ 'gone-1': createNewMap('Doomed', 'grid') });

    // Pane A (e.g. the full-pane view) deletes the map.
    await deleteMapData(app, 'gone-1');
    const writesAfterDelete = writes();
    expect((JSON.parse(read()) as { maps: Record<string, unknown> }).maps['gone-1']).toBeUndefined();

    // Pane B (the note block) mounts afterwards.
    const m = mount(app, 'gone-1');
    await settle();

    expect(m.result().isLoading).toBe(false);
    expect(m.result().mapDeleted).toBe(true);
    expect(m.result().mapData).toBeNull();
    expect(m.result().loadFailure).toBeNull();

    // And every later mount of that id, too.
    m.unmount();
    const again = mount(app, 'gone-1');
    await settle();
    expect(again.result().mapDeleted).toBe(true);
    again.unmount();

    // Nothing was written by either mount.
    expect(writes()).toBe(writesAfterDelete);
    expect((JSON.parse(read()) as { maps: Record<string, unknown> }).maps['gone-1']).toBeUndefined();
  });
});
