// @vitest-environment happy-dom
/**
 * useDebouncedSave: failed-save retention + retry (DATA-03/MEM-07), stale
 * refusal at unmount sets the journal entry aside (DATA-13), and no duplicate
 * write of an in-flight version (MEM-15).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

import type { MapData } from '../../../../types/core/map.types';
import type { SaveMapResult } from '../../../../src/persistence/fileOperations';

const saveMock = vi.fn<(app: App, mapId: string, data: MapData, base?: number, writer?: string) => Promise<SaveMapResult>>();

const noticeMessages: string[] = [];
vi.mock('obsidian', async (importOriginal) => {
  const actual = await importOriginal<typeof import('obsidian')>();
  class Notice {
    constructor(message: string) { noticeMessages.push(message); }
  }
  return { ...actual, Notice };
});

vi.mock('../../../../src/persistence/fileOperations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/persistence/fileOperations')>();
  return {
    ...actual,
    saveMapData: (app: App, mapId: string, data: MapData, base?: number, writer?: string) =>
      saveMock(app, mapId, data, base, writer),
  };
});

import { useDebouncedSave, retryDelayMs, MAX_SAVE_RETRIES } from '../../../../src/hooks/state/useDebouncedSave';
import { createNewMap } from '../../../../src/persistence/fileOperations';
import { JOURNAL_KEY_PREFIX, CONFLICT_KEY_PREFIX, KEPT_KEY_PREFIX, MAX_JOURNAL_PAYLOAD, readJournal } from '../../../../src/persistence/saveJournal';

type Hook = ReturnType<typeof useDebouncedSave>;

function makeApp(): { app: App; store: Map<string, string> } {
  const store = new Map<string, string>();
  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) store.delete(key);
      else store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
    vault: {},
  } as unknown as App;
  return { app, store };
}

interface Mounted {
  hook: () => Hook;
  unmount: () => void;
}

function mount(app: App, mapId: string): Mounted {
  let current: Hook | null = null;
  let mapData: MapData | null = createNewMap('Test', 'grid');
  const baseGenRef = { current: 0 };
  const setMapData = (v: MapData | null | ((prev: MapData | null) => MapData | null)): void => {
    mapData = typeof v === 'function' ? v(mapData) : v;
  };
  function Probe(): null {
    current = useDebouncedSave(app, mapId, setMapData, baseGenRef);
    return null;
  }
  const container = document.createElement('div');
  act(() => { render(h(Probe, null), container); });
  return {
    hook: () => current as Hook,
    unmount: () => { act(() => { render(null, container); }); },
  };
}

function edit(m: Mounted, description: string): void {
  act(() => {
    m.hook().updateMapData((prev) => ({ ...prev, description }));
  });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  saveMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('retryDelayMs', () => {
  it('backs off 2s, 4s, then caps at 8s', () => {
    expect([0, 1, 2, 3, 10].map(retryDelayMs)).toEqual([2000, 4000, 8000, 8000, 8000]);
  });
});

describe('useDebouncedSave: failed save (DATA-03)', () => {
  it('keeps the edits, journals them at once, and retries until the save lands', async () => {
    const { app, store } = makeApp();
    saveMock
      .mockResolvedValueOnce({ status: 'failed' })
      .mockResolvedValueOnce({ status: 'saved', generation: 1 });
    const m = mount(app, 'ds-fail');

    edit(m, 'first edit');
    await advance(2000);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(m.hook().saveStatus).toBe('Save failed');
    // Journaled immediately on failure.
    const journal = readJournal(app, 'ds-fail');
    expect(journal).not.toBeNull();
    expect(JSON.parse(journal?.payload as string).description).toBe('first edit');

    // Retry after 2 s with the same (kept) data.
    await advance(2000);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][2].description).toBe('first edit');
    expect(m.hook().saveStatus).toBe('Saved');
    expect(readJournal(app, 'ds-fail')).toBeNull();
    expect(store.size).toBeGreaterThanOrEqual(0);
    m.unmount();
  });

  it('the unmount flush still writes edits whose save failed', async () => {
    const { app } = makeApp();
    saveMock.mockResolvedValue({ status: 'failed' });
    const m = mount(app, 'ds-fail-unmount');

    edit(m, 'unsaved');
    await advance(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);

    saveMock.mockResolvedValue({ status: 'saved', generation: 1 });
    m.unmount();
    await advance(0);
    expect(saveMock).toHaveBeenCalledTimes(2);
    expect(saveMock.mock.calls[1][2].description).toBe('unsaved');
  });
});

describe('useDebouncedSave: stale refusal at unmount (DATA-13)', () => {
  it('moves the journal entry to the conflict key instead of clearing it', async () => {
    const { app, store } = makeApp();
    saveMock.mockResolvedValue({ status: 'stale' });
    const m = mount(app, 'ds-stale');

    edit(m, 'edit in pane A');
    m.unmount();
    await advance(0);

    expect(store.has(JOURNAL_KEY_PREFIX + 'ds-stale')).toBe(false);
    const conflict = store.get(CONFLICT_KEY_PREFIX + 'ds-stale');
    expect(conflict).toBeDefined();
    expect(JSON.parse(JSON.parse(conflict as string).payload as string).description).toBe('edit in pane A');
  });
});

describe('useDebouncedSave: stale refusal at unmount is reported truthfully (Parallax #4)', () => {
  beforeEach(() => { noticeMessages.length = 0; });

  it('oversized edits: no older entry is set aside and the notice says nothing was kept', async () => {
    const { app, store } = makeApp();
    saveMock.mockResolvedValue({ status: 'stale' });
    // An older journal entry for the same map is sitting in the live slot.
    store.set(JOURNAL_KEY_PREFIX + 'ds-big', JSON.stringify({ v: 1, mapId: 'ds-big', savedAt: 1, payload: '{"description":"older"}' }));
    const m = mount(app, 'ds-big');

    edit(m, noise(MAX_JOURNAL_PAYLOAD * 2));
    m.unmount();
    await advance(0);

    expect(store.has(CONFLICT_KEY_PREFIX + 'ds-big')).toBe(false);
    expect(store.has(JOURNAL_KEY_PREFIX + 'ds-big')).toBe(false);
    // One stale-conflict notice (plus the once-per-map "too large" notice).
    expect(noticeMessages.filter(n => /No recovery copy/.test(n))).toHaveLength(1);
    expect(noticeMessages.some(n => /too large for its crash-recovery copy/.test(n))).toBe(true);
  });

  it('with a kept entry present, the edits still reach the conflict slot and the kept entry survives', async () => {
    const { app, store } = makeApp();
    saveMock.mockResolvedValue({ status: 'stale' });
    const keptRaw = JSON.stringify([{ v: 1, mapId: 'ds-kept', savedAt: 1, payload: '{"description":"deferred"}' }]);
    store.set(KEPT_KEY_PREFIX + 'ds-kept', keptRaw);
    const m = mount(app, 'ds-kept');

    edit(m, 'closing pane edit');
    m.unmount();
    await advance(0);

    expect(store.get(KEPT_KEY_PREFIX + 'ds-kept')).toBe(keptRaw);
    const conflict = store.get(CONFLICT_KEY_PREFIX + 'ds-kept');
    expect(JSON.parse(JSON.parse(conflict as string).payload as string).description).toBe('closing pane edit');
    expect(noticeMessages[0]).toMatch(/A copy was kept/);
  });

  it('quota failure on the conflict move: no live clobber entry, notice says nothing was kept', async () => {
    const { app, store } = makeApp();
    const writable = app as unknown as { saveLocalStorage: (k: string, v: unknown) => void };
    const realSave = writable.saveLocalStorage;
    writable.saveLocalStorage = (k: string, v: unknown) => {
      if (k.startsWith(CONFLICT_KEY_PREFIX) && v != null) throw new Error('QuotaExceededError');
      realSave(k, v);
    };
    saveMock.mockResolvedValue({ status: 'stale' });
    const m = mount(app, 'ds-quota');

    edit(m, 'closing pane edit');
    m.unmount();
    await advance(0);

    expect(store.has(JOURNAL_KEY_PREFIX + 'ds-quota')).toBe(false);
    expect(store.has(CONFLICT_KEY_PREFIX + 'ds-quota')).toBe(false);
    expect(noticeMessages[0]).toMatch(/No recovery copy/);
  });
});

describe('useDebouncedSave: save refused because the map was deleted (DATA-02)', () => {
  it('is terminal: flags mapDeleted, never shows Saved, never retries', async () => {
    const { app, store } = makeApp();
    saveMock.mockResolvedValue({ status: 'deleted' });
    const m = mount(app, 'ds-deleted');

    expect(m.hook().mapDeleted).toBe(false);
    edit(m, 'edit after another pane deleted the map');
    await advance(2000);

    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(m.hook().mapDeleted).toBe(true);
    expect(m.hook().saveStatus).not.toBe('Saved');
    // A journal entry would resurrect the deleted map after a restart.
    expect(store.has(JOURNAL_KEY_PREFIX + 'ds-deleted')).toBe(false);

    // No retry, and later edits / forceSave / unmount never write again.
    await advance(60_000);
    edit(m, 'another edit');
    await advance(2000);
    await act(async () => { await m.hook().forceSave(); });
    m.unmount();
    await advance(0);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(store.has(JOURNAL_KEY_PREFIX + 'ds-deleted')).toBe(false);
  });

  it('markDeleted (the deleting mount) does not raise mapDeleted', async () => {
    const { app } = makeApp();
    const m = mount(app, 'ds-marked');
    act(() => { m.hook().markDeleted(); });
    expect(m.hook().mapDeleted).toBe(false);
    expect(m.hook().saveStatus).toBe('Saved');
    m.unmount();
  });
});

describe('useDebouncedSave: in-flight dedupe (MEM-15)', () => {
  it('forceSave and unmount do not rewrite a version already being written', async () => {
    const { app } = makeApp();
    let resolveSave: (r: SaveMapResult) => void = () => undefined;
    saveMock.mockImplementation(() => new Promise<SaveMapResult>((resolve) => { resolveSave = resolve; }));
    const m = mount(app, 'ds-inflight');

    edit(m, 'once');
    await advance(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);

    // forceSave while the debounced save is in flight: waits, no second write.
    let forced = false;
    void m.hook().forceSave().then(() => { forced = true; });
    await advance(0);
    expect(saveMock).toHaveBeenCalledTimes(1);

    // Unmount while the same tree is in flight: journal only, no second write.
    m.unmount();
    await advance(0);
    expect(saveMock).toHaveBeenCalledTimes(1);

    resolveSave({ status: 'saved', generation: 1 });
    await advance(0);
    expect(forced).toBe(true);
    expect(saveMock).toHaveBeenCalledTimes(1);
  });
});

/** Random incompressible text (deflate cannot shrink it below the cap). */
function noise(length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += alphabet[Math.floor(Math.random() * 64)];
  }
  return out;
}

describe('useDebouncedSave: journal before every save (DATA-05) and per-writer slots', () => {
  beforeEach(() => { noticeMessages.length = 0; });

  it('journals a routine debounced save before the write lands', async () => {
    const { app } = makeApp();
    let resolveSave: (r: { status: 'saved'; generation: number }) => void = () => undefined;
    saveMock.mockImplementationOnce(() => new Promise((r) => { resolveSave = r; }));
    const m = mount(app, 'ds-pre');

    edit(m, 'routine edit');
    await advance(2000);
    expect(saveMock).toHaveBeenCalledTimes(1);
    // The write is still in flight: the journal already holds the edit.
    expect(JSON.parse(readJournal(app, 'ds-pre')?.payload as string).description).toBe('routine edit');

    await act(async () => { resolveSave({ status: 'saved', generation: 1 }); await Promise.resolve(); });
    expect(readJournal(app, 'ds-pre')).toBeNull();
    m.unmount();
  });

  it("two panes: pane A's landed save does not erase pane B's failed-save copy", async () => {
    const { app } = makeApp();
    saveMock.mockImplementation((_app: unknown, _id: unknown, data: MapData) =>
      Promise.resolve(data.description === 'pane B' ? { status: 'failed' } : { status: 'saved', generation: 1 }));
    const a = mount(app, 'ds-two');
    const b = mount(app, 'ds-two');

    edit(b, 'pane B');
    await advance(2000);
    edit(a, 'pane A');
    await advance(2000);

    expect(b.hook().saveStatus).toBe('Save failed');
    expect(a.hook().saveStatus).toBe('Saved');
    expect(JSON.parse(readJournal(app, 'ds-two')?.payload as string).description).toBe('pane B');
    a.unmount();
    b.unmount();
  });

  it('an older save settling keeps the newer unmount journal', async () => {
    const { app } = makeApp();
    let resolveFirst: (r: { status: 'saved'; generation: number }) => void = () => undefined;
    saveMock
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockImplementation(() => new Promise(() => undefined)); // unmount write never lands
    const m = mount(app, 'ds-order');

    edit(m, 'v1');
    await advance(2000);
    edit(m, 'v2');
    m.unmount();
    await act(async () => { resolveFirst({ status: 'saved', generation: 1 }); await Promise.resolve(); });

    expect(JSON.parse(readJournal(app, 'ds-order')?.payload as string).description).toBe('v2');
  });

  it('stops retrying after MAX_SAVE_RETRIES and says so once; edits stay journaled', async () => {
    const { app } = makeApp();
    saveMock.mockResolvedValue({ status: 'failed' });
    const m = mount(app, 'ds-cap');

    edit(m, 'stuck');
    await advance(2000);
    await advance(120_000);

    expect(saveMock).toHaveBeenCalledTimes(1 + MAX_SAVE_RETRIES);
    expect(noticeMessages.filter(n => /retries have stopped/.test(n))).toHaveLength(1);
    expect(JSON.parse(readJournal(app, 'ds-cap')?.payload as string).description).toBe('stuck');

    // The next edit tries again.
    saveMock.mockResolvedValue({ status: 'saved', generation: 1 });
    edit(m, 'unstuck');
    await advance(2000);
    expect(m.hook().saveStatus).toBe('Saved');
    expect(readJournal(app, 'ds-cap')).toBeNull();
    m.unmount();
  });

  it('a later edit after the cap gets a fresh retry budget while saves still fail (wave-5 finding 7)', async () => {
    const { app } = makeApp();
    saveMock.mockResolvedValue({ status: 'failed' });
    const m = mount(app, 'ds-cap2');

    edit(m, 'stuck');
    await advance(2000);
    await advance(120_000);
    expect(saveMock).toHaveBeenCalledTimes(1 + MAX_SAVE_RETRIES);

    edit(m, 'still failing');
    await advance(2000);
    await advance(120_000);
    expect(saveMock).toHaveBeenCalledTimes(2 * (1 + MAX_SAVE_RETRIES));
    expect(noticeMessages.filter(n => /retries have stopped/.test(n)).length).toBeGreaterThanOrEqual(1);
    m.unmount();
  });

  it('a rejected save is treated as failed and retried', async () => {
    const { app } = makeApp();
    saveMock
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ status: 'saved', generation: 1 });
    const m = mount(app, 'ds-reject');

    edit(m, 'edit');
    await advance(2000);
    expect(m.hook().saveStatus).toBe('Save failed');
    await advance(2000);
    expect(m.hook().saveStatus).toBe('Saved');
    m.unmount();
  });
});

describe('useDebouncedSave: a no-op updater is not an edit (parallax wave-6 finding 6)', () => {
  it('schedules no save, marks nothing unsaved and journals nothing', async () => {
    const { app } = makeApp();
    saveMock.mockResolvedValue({ status: 'saved', generation: 1 });
    const m = mount(app, 'ds-noop');

    act(() => { m.hook().updateMapData((prev) => prev); });
    await advance(5000);

    expect(saveMock).not.toHaveBeenCalled();
    expect(m.hook().saveStatus).not.toBe('Unsaved changes');
    expect(readJournal(app, 'ds-noop')).toBeNull();
    m.unmount();
    expect(saveMock).not.toHaveBeenCalled();
  });
});
