// @vitest-environment happy-dom
// Parallax wave-7 finding 10: the unload flush must also wait for a save that
// is already in flight (no pending timer), so resetTileMetadataStore never
// runs while a write is still landing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  ensureTileMetadataLoaded,
  commitTileMetadataDelta,
  flushTileMetadataSave,
  resetTileMetadataStore,
  toggleStar,
} from '../../../src/persistence/tileMetadata';

const FILE = 'windrose-tile-metadata.json';

describe('flushTileMetadataSave', () => {
  beforeEach(() => { resetTileMetadataStore(); });
  afterEach(() => { resetTileMetadataStore(); });

  it('awaits an in-flight save even when no debounced save is pending', async () => {
    let content = '{}';
    const pending: { release: (() => void) | null } = { release: null };
    const file = new TFile();
    file.path = FILE;
    const vault = {
      getAbstractFileByPath: (p: string) => (p === FILE ? file : null),
      read: () => Promise.resolve(content),
      modify: (_f: TFile, data: string) => new Promise<void>(r => { pending.release = () => { content = data; r(); }; }),
      create: () => Promise.reject(new Error('unexpected create')),
    };
    const app = { vault } as unknown as App;

    const base = await ensureTileMetadataLoaded(app);
    const saving = commitTileMetadataDelta(app, base, toggleStar(base, 'a.png'));
    for (let i = 0; i < 50 && pending.release == null; i++) await Promise.resolve();
    expect(pending.release).not.toBeNull(); // the write is in flight, no timer pending

    let flushed = false;
    const flush = flushTileMetadataSave().then(() => { flushed = true; });
    for (let i = 0; i < 10; i++) await Promise.resolve();
    expect(flushed).toBe(false);

    pending.release?.();
    await saving;
    await flush;
    expect(flushed).toBe(true);
    expect(JSON.parse(content)).toHaveProperty(['a.png']);
  });
});
