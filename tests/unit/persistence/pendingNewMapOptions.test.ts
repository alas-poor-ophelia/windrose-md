/** Pending new-map preset lifetime: capped, expiring, served while fresh (windrose-kgc.27). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';

const getSettings = vi.fn(() => ({ lodLadder: true } as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSettings,
}));

const { loadMapDataWithGeneration, setPendingNewMapOptions, clearPendingNewMapOptions } =
  await import('../../../src/persistence/fileOperations');

const app = { vault: { getAbstractFileByPath: () => null } } as unknown as App;
const lodM = async (id: string) => (await loadMapDataWithGeneration(app, id, 'n', 'hex')).data.lod?.m;

describe('pending new-map options', () => {
  beforeEach(() => { vi.useFakeTimers(); clearPendingNewMapOptions(); });
  afterEach(() => { vi.useRealTimers(); clearPendingNewMapOptions(); });

  it('serves a fresh entry', async () => {
    setPendingNewMapOptions('a', { ladderM: 2 });
    expect(await lodM('a')).toBe(2);
    expect(await lodM('a')).toBe(2); // not consumed until the map exists in the file
  });

  it('expires entries after ten minutes', async () => {
    setPendingNewMapOptions('a', { ladderM: 2 });
    vi.advanceTimersByTime(10 * 60 * 1000 + 1);
    expect(await lodM('a')).toBeUndefined();
  });

  it('evicts the oldest entry beyond 32', async () => {
    for (let i = 0; i < 33; i++) {
      setPendingNewMapOptions(`m${i}`, { ladderM: 15 });
      vi.advanceTimersByTime(1);
    }
    expect(await lodM('m0')).toBeUndefined();
    expect(await lodM('m1')).toBe(15);
    expect(await lodM('m32')).toBe(15);
  });
});
