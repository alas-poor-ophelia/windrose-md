/** Pending new-map preset lifetime: capped, expiring, served while fresh (windrose-kgc.27). */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';

const getSettings = vi.fn(() => ({ lodLadder: true } as Record<string, unknown>));
vi.mock('../../../src/core/settingsAccessor', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getSettings,
}));

const { loadMapDataWithGeneration, setPendingNewMapOptions, clearPendingNewMapOptions, PENDING_NEW_MAP_CAP, PENDING_NEW_MAP_TTL_MS } =
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

  it('expires entries after the TTL', async () => {
    setPendingNewMapOptions('a', { ladderM: 2 });
    vi.advanceTimersByTime(PENDING_NEW_MAP_TTL_MS + 1);
    expect(await lodM('a')).toBeUndefined();
  });

  it('read refreshes the TTL', async () => {
    setPendingNewMapOptions('a', { ladderM: 2 });
    vi.advanceTimersByTime(PENDING_NEW_MAP_TTL_MS - 1000);
    expect(await lodM('a')).toBe(2); // a re-mount reads it before the first save
    vi.advanceTimersByTime(PENDING_NEW_MAP_TTL_MS - 1000);
    expect(await lodM('a')).toBe(2); // well past the original TTL, still served
    vi.advanceTimersByTime(PENDING_NEW_MAP_TTL_MS + 1);
    expect(await lodM('a')).toBeUndefined(); // unread for a whole TTL: reaped
  });

  it('evicts the oldest entry beyond the cap', async () => {
    for (let i = 0; i <= PENDING_NEW_MAP_CAP; i++) {
      setPendingNewMapOptions(`m${i}`, { ladderM: 15 });
      vi.advanceTimersByTime(1);
    }
    expect(await lodM('m0')).toBeUndefined();
    expect(await lodM('m1')).toBe(15);
    expect(await lodM(`m${PENDING_NEW_MAP_CAP}`)).toBe(15);
  });
});
