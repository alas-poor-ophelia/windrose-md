/**
 * DATA-11: daily backup slot + size-drop guard on backup rotation.
 * Each test imports a fresh fileOperations module so the session-level
 * rotation state (first save always rotates, slot 1 first) starts clean.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';
const BAK1 = 'windrose-md-data.bak1.json';
const BAK2 = 'windrose-md-data.bak2.json';
const DAILY = 'windrose-md-data.bak-daily.json';

type FileOps = typeof import('../../../src/persistence/fileOperations');

interface Fake {
  app: App;
  contents: Map<string, string>;
  put: (path: string, data: string, mtime: number) => void;
}

function makeVault(): Fake {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();
  const put = (path: string, data: string, mtime: number): void => {
    const f = files.get(path) ?? new currentTFile();
    f.path = path;
    f.stat = { ctime: mtime, mtime, size: data.length };
    files.set(path, f);
    contents.set(path, data);
  };
  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    read: async (f: TFile) => contents.get(f.path) ?? '',
    modify: async (f: TFile, data: string) => { put(f.path, data, Date.now()); },
    create: async (path: string, data: string) => { put(path, data, Date.now()); },
  };
  return { app: { vault } as unknown as App, contents, put };
}

let currentTFile: typeof TFile = TFile;

async function freshOps(): Promise<FileOps> {
  vi.resetModules();
  currentTFile = (await import('obsidian')).TFile;
  return import('../../../src/persistence/fileOperations');
}

function store(ops: FileOps, maps: Record<string, string>, padding = 0): string {
  const out: Record<string, MapData> = {};
  for (const [id, name] of Object.entries(maps)) {
    const m = ops.createNewMap(name, 'grid');
    if (padding > 0) m.description = 'p'.repeat(padding);
    out[id] = m;
  }
  return JSON.stringify({ maps: out });
}

const NOW = new Date(2026, 9, 13, 12, 0, 0).getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('isSuspiciousShrink', () => {
  it('flags a sharp shrink with the same map count, not one explained by fewer maps', async () => {
    const ops = await freshOps();
    expect(ops.isSuspiciousShrink(400, 3, 1000, 3)).toBe(true);
    expect(ops.isSuspiciousShrink(600, 3, 1000, 3)).toBe(false);
    expect(ops.isSuspiciousShrink(400, 2, 1000, 3)).toBe(false);
  });
});

describe('daily backup slot', () => {
  it('captures the first rotation of the day and is not overwritten later that day', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const first = store(ops, { a: 'First' });
    fake.put(DATA_PATH, first, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Second', 'grid'));
    expect(fake.contents.get(DAILY)).toBe(first);

    // Past the rolling throttle, same day: rolling slot 2 rolls, daily stays.
    vi.setSystemTime(NOW + ops.BAK_THROTTLE_MS + 1);
    const before = fake.contents.get(DATA_PATH);
    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Third', 'grid'));
    expect(fake.contents.get(BAK2)).toBe(before);
    expect(fake.contents.get(DAILY)).toBe(first);

    // Next day: the daily slot rolls.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000);
    const dayTwo = fake.contents.get(DATA_PATH);
    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Fourth', 'grid'));
    expect(fake.contents.get(DAILY)).toBe(dayTwo);
  });
});

describe('backup size-drop guard', () => {
  it('a much smaller file with the same map count rolls into the other slot, preserving the large backup', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A', b: 'B' }, 50_000);
    const wiped = store(ops, { a: 'A', b: 'B' });
    fake.put(BAK1, large, NOW - 60_000);
    fake.put(DAILY, large, NOW - 60_000);
    fake.put(DATA_PATH, wiped, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(fake.contents.get(BAK1)).toBe(large);
    expect(fake.contents.get(BAK2)).toBe(wiped);
    expect(fake.contents.get(DAILY)).toBe(large);
  });

  it('both slots hold the large copy and the file legitimately halves: one slot is preserved, the other rolls fresh', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A' }, 50_000);
    const halved = store(ops, { a: 'A' });
    fake.put(BAK1, large, NOW - 60_000);
    fake.put(BAK2, large, NOW - 120_000);
    fake.put(DATA_PATH, halved, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    // Same size: the older (BAK2) is preserved, the newer (BAK1) rolls.
    expect(fake.contents.get(BAK2)).toBe(large);
    expect(fake.contents.get(BAK1)).toBe(halved);

    // The next rotation (past the throttle) still writes a fresh backup.
    vi.setSystemTime(NOW + 20 * 60 * 1000);
    const before = fake.contents.get(DATA_PATH);
    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit 2', 'grid'));
    expect(fake.contents.get(BAK2)).toBe(large);
    expect(fake.contents.get(BAK1)).toBe(before);
  });

  it('a shrink explained by fewer maps rotates normally', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A', b: 'B' }, 50_000);
    const oneMap = store(ops, { a: 'A' });
    fake.put(BAK1, large, NOW - 60_000);
    fake.put(DATA_PATH, oneMap, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(fake.contents.get(BAK1)).toBe(oneMap);
  });

  it('a guarded backup older than a week is released', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A' }, 50_000);
    const small = store(ops, { a: 'A' });
    fake.put(BAK1, large, NOW - 8 * 24 * 60 * 60 * 1000);
    fake.put(DATA_PATH, small, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(fake.contents.get(BAK1)).toBe(small);
  });
});

describe('P9: autosave on a multi-MB store', () => {
  it('reads the store once, never re-stringifies the big map, and rotates once per 15 min', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const parsed = JSON.parse(store(ops, { big: 'Big', a: 'Small' })) as { maps: Record<string, MapData> };
    parsed.maps.big.description = 'x'.repeat(2_500_000);
    fake.put(DATA_PATH, JSON.stringify(parsed), NOW - 1000);

    type VaultLike = {
      read: (f: TFile) => Promise<string>;
      getAbstractFileByPath: (p: string) => TFile | null;
      adapter?: Record<string, unknown>;
    };
    const vault = fake.app.vault as unknown as VaultLike;
    let reads = 0;
    const origRead = vault.read;
    vault.read = (f: TFile) => { reads++; return origRead(f); };
    vault.adapter = {
      exists: async (p: string) => fake.contents.has(p),
      stat: async (p: string) => {
        const f = vault.getAbstractFileByPath(p);
        return f ? { type: 'file', ctime: f.stat.ctime, mtime: f.stat.mtime, size: f.stat.size } : null;
      },
      read: async (p: string) => fake.contents.get(p) ?? '',
    };

    const bakState = (): string => `${fake.contents.get(BAK1) ?? ''}|${fake.contents.get(BAK2) ?? ''}`;
    const realStringify = JSON.stringify;
    const sizes: number[] = [];
    const spy = vi.spyOn(JSON, 'stringify').mockImplementation((...args: Parameters<typeof JSON.stringify>) => {
      const out = realStringify(...args);
      sizes.push(out.length);
      return out;
    });

    const rotations: string[] = [];
    let last = bakState();
    const saveAt = async (offsetMs: number, name: string): Promise<void> => {
      vi.setSystemTime(NOW + offsetMs);
      await ops.saveMapData(fake.app, 'a', ops.createNewMap(name, 'grid'));
      const now = bakState();
      if (now !== last) { rotations.push(name); last = now; }
    };

    await saveAt(0, 'e0');
    const readsAfterFirst = reads;
    sizes.length = 0;
    for (let i = 1; i <= 8; i++) await saveAt(i * 60_000, `e${i}`);
    const maxStringify = Math.max(0, ...sizes);
    const readsDuring = reads - readsAfterFirst;
    await saveAt(ops.BAK_THROTTLE_MS + 60_000, 'late');
    spy.mockRestore();

    expect(readsDuring).toBe(0);
    expect(maxStringify).toBeLessThan(500_000);
    expect(rotations).toEqual(['e0', 'late']);
  });
});
