// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  updateTileMetadata,
  ensureTileMetadataLoaded,
  getTileMetadataForRender,
  getTileMetadataRenderVersion,
  setTileMetadataForRender,
  subscribeTileMetadata,
  loadTileMetadata,
  resetTileMetadataStore,
  toggleStar,
  addUserTag,
} from '../../../src/persistence/tileMetadata';

const FILE = 'windrose-tile-metadata.json';

/** Minimal in-memory vault holding the metadata file. */
function makeApp(initial: string | null): { app: App; files: Map<string, string>; reads: () => number } {
  const files = new Map<string, string>();
  if (initial != null) files.set(FILE, initial);
  let readCount = 0;
  const fileFor = (path: string): TFile | null => {
    if (!files.has(path)) return null;
    const f = new TFile();
    (f as unknown as { path: string }).path = path;
    return f;
  };
  const pathOf = (f: TFile): string => (f as unknown as { path: string }).path;
  const vault = {
    getAbstractFileByPath: (path: string) => fileFor(path),
    read: (f: TFile) => { readCount++; return Promise.resolve(files.get(pathOf(f)) ?? ''); },
    modify: (f: TFile, data: string) => { files.set(pathOf(f), data); return Promise.resolve(); },
    create: (path: string, data: string) => { files.set(path, data); return Promise.resolve(fileFor(path)); },
  };
  return { app: { vault } as unknown as App, files, reads: () => readCount };
}

type Saved = Record<string, { starred?: boolean; userTags?: string[] }>;

describe('shared tile-metadata store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetTileMetadataStore();
  });
  afterEach(() => {
    resetTileMetadataStore();
    vi.useRealTimers();
  });

  it('two writers (two mounts) mutating the store both survive the save', async () => {
    const { app, files } = makeApp(JSON.stringify({ 'old.png': { starred: true } }));
    await ensureTileMetadataLoaded(app);

    // Mount A stars, mount B tags: each mutates the SHARED store, not a copy.
    updateTileMetadata(app, s => toggleStar(s, 'a.png'));
    updateTileMetadata(app, s => addUserTag(s, 'b.png', 'forest'));

    await vi.runAllTimersAsync();
    const saved = JSON.parse(files.get(FILE) ?? '{}') as Saved;
    expect(saved['old.png']?.starred).toBe(true);
    expect(saved['a.png']?.starred).toBe(true);
    expect(saved['b.png']?.userTags).toEqual(['forest']);
  });

  it('dedupes concurrent loads into one vault read', async () => {
    const { app, reads } = makeApp('{}');
    await Promise.all([ensureTileMetadataLoaded(app), ensureTileMetadataLoaded(app), ensureTileMetadataLoaded(app)]);
    await ensureTileMetadataLoaded(app);
    expect(reads()).toBe(1);
  });

  it('applies a mutation issued before the load AFTER it lands (never over an empty store)', async () => {
    const { app, files } = makeApp(JSON.stringify({ 'keep.png': { starred: true } }));
    updateTileMetadata(app, s => toggleStar(s, 'new.png'));
    await vi.runAllTimersAsync();
    expect(getTileMetadataForRender()['keep.png']?.starred).toBe(true);
    expect(getTileMetadataForRender()['new.png']?.starred).toBe(true);
    const saved = JSON.parse(files.get(FILE) ?? '{}') as Saved;
    expect(Object.keys(saved).sort()).toEqual(['keep.png', 'new.png']);
  });

  it('notifies subscribers and bumps the render version on every change', async () => {
    const { app } = makeApp('{}');
    await ensureTileMetadataLoaded(app);
    const listener = vi.fn();
    const unsubscribe = subscribeTileMetadata(listener);
    const v0 = getTileMetadataRenderVersion();
    updateTileMetadata(app, s => toggleStar(s, 'a.png'));
    setTileMetadataForRender({ 'x.png': { starred: true } });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getTileMetadataRenderVersion()).toBe(v0 + 2);
    unsubscribe();
    updateTileMetadata(app, s => toggleStar(s, 'b.png'));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('a raw load flushes pending in-memory edits first (external load-mutate-save writers)', async () => {
    const { app } = makeApp('{}');
    await ensureTileMetadataLoaded(app);
    updateTileMetadata(app, s => toggleStar(s, 'pending.png'));
    const fresh = await loadTileMetadata(app);
    expect(fresh['pending.png']?.starred).toBe(true);
  });

  it('a no-op mutator does not notify or save', async () => {
    const { app, files } = makeApp('{}');
    await ensureTileMetadataLoaded(app);
    const listener = vi.fn();
    subscribeTileMetadata(listener);
    updateTileMetadata(app, s => s);
    await vi.runAllTimersAsync();
    expect(listener).not.toHaveBeenCalled();
    expect(files.get(FILE)).toBe('{}');
  });
});

describe('S3/T1: two embeds, star then tag inside the save window', () => {
  beforeEach(() => { vi.useFakeTimers(); resetTileMetadataStore(); });
  afterEach(() => { resetTileMetadataStore(); vi.useRealTimers(); });

  it('a star, then a tag 1.5 s later, both land in the final file after the last debounce', async () => {
    const { app, files } = makeApp(JSON.stringify({}));
    await ensureTileMetadataLoaded(app);
    updateTileMetadata(app, s => toggleStar(s, 'a.png'));
    await vi.advanceTimersByTimeAsync(1500);
    updateTileMetadata(app, s => addUserTag(s, 'b.png', 'forest'));
    await vi.advanceTimersByTimeAsync(5000);
    const saved = JSON.parse(files.get(FILE) ?? '{}') as Saved;
    expect(saved['a.png']?.starred).toBe(true);
    expect(saved['b.png']?.userTags).toEqual(['forest']);
  });
});
