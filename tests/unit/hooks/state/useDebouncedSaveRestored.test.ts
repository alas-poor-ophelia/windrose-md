// @vitest-environment happy-dom
/**
 * Parallax wave-7 follow-ups on useDebouncedSave:
 * - finding 3: updateMapData's functional updater runs exactly once per call,
 *   at dispatch (fog history recording and undo's applied flag rely on it);
 * - finding 4: a landed save of a journal-restored tree drops the restored
 *   slot even when journaling that tree was skipped (quota), so the
 *   MAX_SAFE_INTEGER sentinel cannot outlive it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { useState } from 'preact/hooks';

import type { MapData } from '../../../../types/core/map.types';
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
import { journalPending, readJournal, resolveJournalOnLoad } from '../../../../src/persistence/saveJournal';

type Hook = ReturnType<typeof useDebouncedSave>;
const DATA_PATH = 'windrose-md-data.json';

interface Harness { app: App; failWrites: { on: boolean } }

function makeApp(maps: Record<string, MapData>): Harness {
  const store = new Map<string, string>();
  const failWrites = { on: false };
  const file = new TFile();
  file.path = DATA_PATH;
  const content = JSON.stringify({ maps });
  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) { store.delete(key); return; }
      if (failWrites.on) throw new Error('QuotaExceededError');
      store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {
      getAbstractFileByPath: (path: string) => (path === DATA_PATH ? file : null),
      read: async () => content,
    },
  } as unknown as App;
  return { app, failWrites };
}

let container: HTMLElement | null = null;

/** Mounts the hook over a REAL Preact useState setter (unlike the plain-function harness elsewhere). */
function mount(app: App, mapId: string): { hook: () => Hook; data: () => MapData | null } {
  let current: Hook | null = null;
  let data: MapData | null = null;
  const baseGenRef = { current: 0 };
  function Probe(): null {
    const [d, setD] = useState<MapData | null>(createNewMap('Test', 'grid'));
    data = d;
    current = useDebouncedSave(app, mapId, setD, baseGenRef);
    return null;
  }
  container = document.createElement('div');
  act(() => { render(h(Probe, null), container as HTMLElement); });
  return { hook: () => current as Hook, data: () => data };
}

async function advance(ms: number): Promise<void> {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
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

describe('finding 3: updateMapData runs a functional updater exactly once per call', () => {
  it('runs it at dispatch, once, and never again on render', () => {
    const { app } = makeApp({});
    const m = mount(app, 'once-1');
    let runs = 0;
    act(() => {
      m.hook().updateMapData((prev: MapData) => { runs++; return { ...prev, description: 'a' }; });
      // Eager: already ran before the render this act flushes.
      expect(runs).toBe(1);
    });
    expect(runs).toBe(1);
    expect(m.data()?.description).toBe('a');

    act(() => {
      m.hook().updateMapData((prev: MapData) => { runs++; return { ...prev, description: `${prev.description ?? ''}b` }; });
      m.hook().updateMapData((prev: MapData) => { runs++; return { ...prev, description: `${prev.description ?? ''}c` }; });
    });
    expect(runs).toBe(3);
    expect(m.data()?.description).toBe('abc');
  });
});

describe('finding 4: a landed save of the restored tree drops the restored slot', () => {
  async function restoreInto(h: Harness, mapId: string, writerId: string): Promise<MapData> {
    journalPending(h.app, mapId, createNewMap('Crashed', 'grid'), { writerId: 'dead', version: 9 });
    const restored = await resolveJournalOnLoad(h.app, mapId, '', async () => 'restore', writerId);
    expect(restored?.name).toBe('Crashed');
    expect(readJournal(h.app, mapId)?.version).toBe(Number.MAX_SAFE_INTEGER);
    return restored as MapData;
  }

  it('journalNow skipped (quota), save lands: slot gone', async () => {
    const h = makeApp({ 'r-1': createNewMap('Disk', 'grid') });
    const m = mount(h.app, 'r-1');
    const restored = await restoreInto(h, 'r-1', m.hook().writerId);

    h.failWrites.on = true;
    act(() => { m.hook().applyRestored(restored); });
    await advance(2000);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(saveMock.mock.calls[0][2]).toBe(restored);
    expect(readJournal(h.app, 'r-1')).toBeNull();
  });

  it('a landed save of an unrelated tree (no restore applied) leaves the restored slot', async () => {
    const h = makeApp({ 'r-2': createNewMap('Disk', 'grid') });
    const m = mount(h.app, 'r-2');
    await restoreInto(h, 'r-2', m.hook().writerId);

    h.failWrites.on = true;
    act(() => { m.hook().updateMapData((prev: MapData) => ({ ...prev, description: 'other' })); });
    await advance(2000);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readJournal(h.app, 'r-2')?.payload as string).name).toBe('Crashed');
  });
});
