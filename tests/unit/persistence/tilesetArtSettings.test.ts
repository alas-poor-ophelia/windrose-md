// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { App } from 'obsidian';

import { scheduleTilesetArtSave, flushTilesetArtSaves } from '../../../src/persistence/tilesetArtSettings';

interface ArtSettings { tilesetArtOffsets?: Record<string, number>; tilesetArtScales?: Record<string, number> }

function makeApp(): { app: App; settings: ArtSettings; saves: () => number } {
  const settings: ArtSettings = {};
  let saveCount = 0;
  const plugin = { settings, saveSettings: () => { saveCount++; return Promise.resolve(); } };
  const app = { plugins: { plugins: { 'windrose-md': plugin } } } as unknown as App;
  return { app, settings, saves: () => saveCount };
}

describe('tileset art settings writer (per-id debounce)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { flushTilesetArtSaves(); vi.useRealTimers(); });

  it('changing tileset A then B inside the window saves BOTH', () => {
    const { app, settings } = makeApp();
    scheduleTilesetArtSave(app, 'tilesetArtOffsets', 'A', 4);
    vi.advanceTimersByTime(200);
    scheduleTilesetArtSave(app, 'tilesetArtOffsets', 'B', -2);
    vi.advanceTimersByTime(1000);
    expect(settings.tilesetArtOffsets).toEqual({ A: 4, B: -2 });
  });

  it('debounces repeated changes to the SAME tileset into one save of the last value', () => {
    const { app, settings, saves } = makeApp();
    scheduleTilesetArtSave(app, 'tilesetArtScales', 'A', 1.1);
    scheduleTilesetArtSave(app, 'tilesetArtScales', 'A', 1.2);
    scheduleTilesetArtSave(app, 'tilesetArtScales', 'A', 1.3);
    vi.advanceTimersByTime(1000);
    expect(saves()).toBe(1);
    expect(settings.tilesetArtScales).toEqual({ A: 1.3 });
  });

  it('the identity value (0 offset / 1 scale) deletes the override', () => {
    const { app, settings } = makeApp();
    settings.tilesetArtOffsets = { A: 3 };
    settings.tilesetArtScales = { A: 2 };
    scheduleTilesetArtSave(app, 'tilesetArtOffsets', 'A', 0);
    scheduleTilesetArtSave(app, 'tilesetArtScales', 'A', 1);
    vi.advanceTimersByTime(1000);
    expect(settings.tilesetArtOffsets).toEqual({});
    expect(settings.tilesetArtScales).toEqual({});
  });

  it('flush writes pending saves immediately', () => {
    const { app, settings } = makeApp();
    scheduleTilesetArtSave(app, 'tilesetArtOffsets', 'A', 5);
    flushTilesetArtSaves();
    expect(settings.tilesetArtOffsets).toEqual({ A: 5 });
  });
});
