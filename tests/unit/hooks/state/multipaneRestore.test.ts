// @vitest-environment happy-dom
/**
 * Multi-pane journal restore (live check, chunk 3 "Other findings"): two panes
 * of one map, one crash slot. One prompt; after pane A restores and its save
 * lands, pane B follows the store, its next save is NOT refused, and it never
 * raises the stale-conflict panel (it had no conflicting edits).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';

import type { MapData } from '../../../../types/core/map.types';
import type { SaveMapResult } from '../../../../src/persistence/fileOperations';

// A store with the real write-generation rule: a write based on an older
// generation by a different writer is refused as stale.
const disk = { generation: 1, writer: '', data: null as MapData | null };

vi.mock('../../../../src/persistence/fileOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/persistence/fileOperations')>();
  return {
    ...actual,
    saveMapData: async (_app: App, _mapId: string, data: MapData, baseGen: number, writerId: string): Promise<SaveMapResult> => {
      if (baseGen !== disk.generation && disk.writer !== writerId) return { status: 'stale' } as SaveMapResult;
      disk.generation++;
      disk.writer = writerId;
      disk.data = data;
      return { status: 'saved', generation: disk.generation } as SaveMapResult;
    },
  };
});

import { useDebouncedSave } from '../../../../src/hooks/state/useDebouncedSave';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { journalPending, readKeptEntries, resolveJournalOnLoad, resetJournalLoadState } from '../../../../src/persistence/saveJournal';

type Hook = ReturnType<typeof useDebouncedSave>;
const DATA_PATH = 'windrose-md-data.json';
const MAP = 'mp-hook';

function makeApp(onDisk: MapData): App {
  const store = new Map<string, string>();
  const file = new TFile();
  file.path = DATA_PATH;
  return {
    saveLocalStorage: (k: string, v: unknown) => { if (v == null) store.delete(k); else store.set(k, String(v)); },
    loadLocalStorage: (k: string) => store.get(k) ?? null,
    vault: {
      getAbstractFileByPath: (p: string) => (p === DATA_PATH ? file : null),
      read: async () => JSON.stringify({ maps: { [MAP]: disk.data ?? onDisk } }),
    },
  } as unknown as App;
}

const containers: HTMLElement[] = [];

function mountPane(app: App, initial: MapData): { hook: () => Hook; data: () => MapData | null } {
  let current: Hook | null = null;
  let data: MapData | null = null;
  const baseGenRef = { current: disk.generation };
  const readStore = async (): Promise<{ data: MapData; generation: number } | null> =>
    ({ data: disk.data ?? initial, generation: disk.generation });
  function Probe(): null {
    const [d, setD] = useState<MapData | null>(initial);
    data = d;
    current = useDebouncedSave(app, MAP, setD, baseGenRef, readStore);
    return null;
  }
  const c = document.createElement('div');
  containers.push(c);
  act(() => { render(h(Probe, null), c); });
  return { hook: () => current as Hook, data: () => data };
}

async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

beforeEach(() => {
  vi.useFakeTimers();
  resetJournalLoadState();
  disk.generation = 1;
  disk.writer = '';
  disk.data = null;
});

afterEach(() => {
  for (const c of containers.splice(0)) act(() => { render(null, c); });
  vi.useRealTimers();
});

describe('two panes, one map, one crash slot', () => {
  it('one prompt; A restores; B follows the store, saves without refusal, no conflict panel', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const app = makeApp(onDisk);
    const a = mountPane(app, onDisk);
    const b = mountPane(app, onDisk);
    journalPending(app, MAP, { ...onDisk, description: 'crash edit' }, { writerId: 'w-dead', version: 3 });

    let prompts = 0;
    const prompt = async (): Promise<'restore'> => { prompts++; return 'restore'; };
    const [ra, rb] = await Promise.all([
      resolveJournalOnLoad(app, MAP, '', prompt, a.hook().writerId),
      resolveJournalOnLoad(app, MAP, '', prompt, b.hook().writerId),
    ]);
    expect(prompts).toBe(1);
    expect(rb).toBeNull();

    act(() => { a.hook().applyRestored(ra as MapData); });
    await advance(2000);
    expect(disk.data?.description).toBe('crash edit');

    // B adopted the restored store tree without any edit of its own.
    expect(b.data()?.description).toBe('crash edit');
    expect(b.hook().staleConflict).toBe(false);

    // B's next real edit is based on the new generation: it lands.
    act(() => { b.hook().updateMapData((prev: MapData) => ({ ...prev, name: 'Edited in B' })); });
    await advance(2000);
    expect(disk.writer).toBe(b.hook().writerId);
    expect(disk.data?.name).toBe('Edited in B');
    expect(disk.data?.description).toBe('crash edit');
    expect(b.hook().staleConflict).toBe(false);
    expect(b.hook().saveStatus).toBe('Saved');
    expect(readKeptEntries(app, MAP)).toHaveLength(0);
  });

  it('a pane refused as stale with no real edit adopts silently (no conflict panel)', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const app = makeApp(onDisk);
    const a = mountPane(app, onDisk);
    const b = mountPane(app, onDisk);

    act(() => { a.hook().updateMapData((prev: MapData) => ({ ...prev, description: 'from A' })); });
    await advance(2000);

    act(() => { b.hook().updateMapData((prev: MapData) => ({ ...prev }), { cosmetic: true }); });
    await advance(2000);
    expect(b.hook().staleConflict).toBe(false);
    expect(b.data()?.description).toBe('from A');

    act(() => { b.hook().updateMapData((prev: MapData) => ({ ...prev, name: 'B' })); });
    await advance(2000);
    expect(b.hook().staleConflict).toBe(false);
    expect(disk.data?.name).toBe('B');
  });

  it('control: a pane with a real edit refused as stale still raises the conflict panel', async () => {
    const onDisk = createNewMap('Disk', 'grid');
    const app = makeApp(onDisk);
    const a = mountPane(app, onDisk);
    const b = mountPane(app, onDisk);

    act(() => { a.hook().updateMapData((prev: MapData) => ({ ...prev, description: 'from A' })); });
    await advance(2000);
    act(() => { b.hook().updateMapData((prev: MapData) => ({ ...prev, name: 'B real edit' })); });
    await advance(2000);
    expect(b.hook().staleConflict).toBe(true);
  });
});
