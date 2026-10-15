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

describe('backup guard reads the old backup only when the stat size says it might shrink', () => {
  function countBackupReads(fake: Fake): { reads: string[] } {
    const vault = fake.app.vault as unknown as { read: (f: TFile) => Promise<string> };
    const log = { reads: [] as string[] };
    const orig = vault.read;
    vault.read = (f: TFile) => { log.reads.push(f.path); return orig(f); };
    return log;
  }

  it('does not read a young backup whose size equals the new backup content', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const current = store(ops, { a: 'A' }, 1000);
    const sameSize = current.replace(/p/g, 'q'); // same byte length, different text
    fake.put(BAK1, sameSize, NOW - 60_000);
    fake.put(DATA_PATH, current, NOW - 1000);
    const log = countBackupReads(fake);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(log.reads).not.toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(current);
  });

  it('does not read a young backup when the size drop clears the ratio', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    fake.put(BAK1, store(ops, { a: 'A' }, 1200), NOW - 60_000);
    const current = store(ops, { a: 'A' }, 1000);
    fake.put(DATA_PATH, current, NOW - 1000);
    const log = countBackupReads(fake);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(log.reads).not.toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(current);
  });

  it('reads (and guards) the backup when the sizes say it may be a sharp shrink', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A' }, 50_000);
    fake.put(BAK1, large, NOW - 60_000);
    fake.put(DATA_PATH, store(ops, { a: 'A' }), NOW - 1000);
    const log = countBackupReads(fake);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(log.reads).toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(large);
  });
});

describe('derived folder tile lists in an old store', () => {
  function oldStore(ops: FileOps): string {
    const tileList = [{ id: 't/A', filename: 'A.webp', vaultPath: 'P/t/A.webp' }, { id: 't/B', filename: 'B.webp', vaultPath: 'P/t/B.webp' }];
    const other = ops.createNewMap('Other', 'hex') as unknown as Record<string, unknown>;
    other.tilesets = [
      { id: 'stale', name: 'stale', tiles: tileList, tileWidth: 256, tileHeight: 256 }, // legacy: no source
      { id: 'sheet', name: 'sheet', source: 'sheet', tiles: tileList, tileWidth: 64, tileHeight: 64 },
    ];
    const nested = ops.createNewMap('Nested', 'hex') as unknown as Record<string, unknown>;
    nested.tilesets = [{ id: 'n', name: 'n', source: 'folder', tiles: tileList }];
    other.subHexMaps = { '0,0': { subdivisionRings: 7, mapData: nested, lastModified: '' } };
    return JSON.stringify({ settings: { keep: true }, maps: { a: ops.createNewMap('A', 'grid'), other } });
  }

  it('loading an old map yields empty folder tiles and keeps sheet tiles', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    fake.put(DATA_PATH, oldStore(ops), NOW - 1000);

    const map = await ops.loadMapData(fake.app, 'other');
    expect(map.tilesets?.find(t => t.id === 'stale')?.tiles).toEqual([]);
    expect(map.tilesets?.find(t => t.id === 'stale')?.source).toBe('folder');
    expect(map.tilesets?.find(t => t.id === 'sheet')?.tiles).toHaveLength(2);
    expect(map.subHexMaps?.['0,0']?.mapData.tilesets?.[0].tiles).toEqual([]);
  });

  it('one full save rewrites an UNMOUNTED map without its tile lists', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    fake.put(DATA_PATH, oldStore(ops), NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('A edited', 'grid'));

    const written = JSON.parse(fake.contents.get(DATA_PATH) as string) as { settings: unknown; maps: Record<string, MapData> };
    const other = written.maps.other;
    expect(written.settings).toEqual({ keep: true });
    expect(other.tilesets?.find(t => t.id === 'stale')?.tiles).toEqual([]);
    expect(other.tilesets?.find(t => t.id === 'stale')?.tileWidth).toBe(256);
    expect(other.tilesets?.find(t => t.id === 'sheet')?.tiles).toHaveLength(2);
    expect(other.subHexMaps?.['0,0']?.mapData.tilesets?.[0].tiles).toEqual([]);
    expect(written.maps.a.name).toBe('A edited');
  });
});

describe('backup guard sizes: adapter stat, fallback, bytes not chars', () => {
  type VaultLike = {
    read: (f: TFile) => Promise<string>;
    getAbstractFileByPath: (p: string) => TFile | null;
    adapter?: Record<string, unknown>;
  };
  const bytes = (s: string): number => new TextEncoder().encode(s).length;
  function withAdapter(fake: Fake, stat: (p: string) => Promise<unknown>): string[] {
    const vault = fake.app.vault as unknown as VaultLike;
    const reads: string[] = [];
    const orig = vault.read;
    vault.read = (f: TFile) => { reads.push(f.path); return orig(f); };
    vault.adapter = {
      exists: async (p: string) => fake.contents.has(p),
      stat,
      read: async (p: string) => fake.contents.get(p) ?? '',
    };
    return reads;
  }
  function fileOf(fake: Fake, path: string): TFile {
    return (fake.app.vault as unknown as VaultLike).getAbstractFileByPath(path) as TFile;
  }

  it('uses the adapter stat (bytes) over a wrong TFile size', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const current = store(ops, { a: 'A' }, 1000);
    fake.put(BAK1, current.replace(/p/g, 'q'), NOW - 60_000);
    fake.put(DATA_PATH, current, NOW - 1000);
    fileOf(fake, BAK1).stat.size = 1e9; // the TFile size alone would trip a read
    const reads = withAdapter(fake, async (p: string) => ({ type: 'file', size: bytes(fake.contents.get(p) ?? '') }));

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(reads).not.toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(current);
  });

  it('a throwing adapter stat falls back to the TFile size', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const large = store(ops, { a: 'A' }, 50_000);
    fake.put(BAK1, large, NOW - 60_000);
    fake.put(DATA_PATH, store(ops, { a: 'A' }), NOW - 1000);
    const reads = withAdapter(fake, async () => { throw new Error('stat failed'); });

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    // The TFile size said "may shrink": the backup was read and guarded.
    expect(reads).toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(large);
  });

  it('compares bytes, not chars: a multibyte store that clears the ratio in bytes rolls without a read', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const old = store(ops, { a: 'A' }, 30_000); // ASCII: ~30k bytes
    const parsed = JSON.parse(store(ops, { a: 'A' })) as { maps: Record<string, MapData> };
    parsed.maps.a.description = '€'.repeat(10_000); // 10k chars, 30k bytes
    const unicode = JSON.stringify(parsed);
    expect(unicode.length).toBeLessThan(old.length * 0.5); // in chars it would look like a sharp shrink
    expect(bytes(unicode)).toBeGreaterThan(bytes(old) * 0.5);
    fake.put(BAK1, old, NOW - 60_000);
    fake.put(DATA_PATH, unicode, NOW - 1000);
    const reads = withAdapter(fake, async (p: string) => ({ type: 'file', size: bytes(fake.contents.get(p) ?? '') }));

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'grid'));

    expect(reads).not.toContain(BAK1);
    expect(fake.contents.get(BAK1)).toBe(unicode);
  });
});

describe('the one-time tile-list strip is not a suspicious shrink', () => {
  it('a pre-strip backup is replaced by the stripped store with the same maps', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const tiles = Array.from({ length: 2000 }, (_, i) => ({ id: `t/${i}`, filename: `${i}.webp`, vaultPath: `Pack/some/long/folder/path/${i}.webp` }));
    const withTiles = ops.createNewMap('A', 'hex') as unknown as Record<string, unknown>;
    withTiles.tilesets = [{ id: 'ts', name: 'ts', source: 'folder', folderPath: 'Pack', tiles }];
    const preStrip = JSON.stringify({ maps: { a: withTiles } });
    const stripped = JSON.stringify({ maps: { a: { ...withTiles, tilesets: [{ id: 'ts', name: 'ts', source: 'folder', folderPath: 'Pack', tiles: [] }] } } });
    expect(stripped.length).toBeLessThan(preStrip.length * 0.5);
    fake.put(BAK1, preStrip, NOW - 60_000);
    fake.put(DATA_PATH, stripped, NOW - 1000);

    await ops.saveMapData(fake.app, 'a', ops.createNewMap('Edit', 'hex'));

    expect(fake.contents.get(BAK1)).toBe(stripped);
  });
});

describe('odd entry shapes never fail a full save', () => {
  it('array subHexMaps and string tilesets are kept verbatim and the save lands', async () => {
    const ops = await freshOps();
    const fake = makeVault();
    const arraySub = { ...ops.createNewMap('Arr', 'hex'), subHexMaps: [] } as unknown as MapData;
    const arraySubFull = { ...ops.createNewMap('Arr2', 'hex'), subHexMaps: [{ mapData: { tilesets: [{ id: 'x', tiles: [1] }] } }] } as unknown as MapData;
    const garbage = { ...ops.createNewMap('Garbage', 'hex'), tilesets: 'garbage' } as unknown as MapData;
    fake.put(DATA_PATH, JSON.stringify({ maps: { a: ops.createNewMap('A', 'grid'), arraySub, arraySubFull, garbage } }), NOW - 1000);
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await ops.saveMapData(fake.app, 'a', ops.createNewMap('A edited', 'grid'));
    errors.mockRestore();

    expect(res.status).toBe('saved');
    const written = JSON.parse(fake.contents.get(DATA_PATH) as string) as { maps: Record<string, unknown> };
    expect(written.maps.arraySub).toEqual(JSON.parse(JSON.stringify(arraySub)));
    expect(written.maps.arraySubFull).toEqual(JSON.parse(JSON.stringify(arraySubFull)));
    expect(written.maps.garbage).toEqual(JSON.parse(JSON.stringify(garbage)));
  });

  it('snapshotFromParsed keeps the raw entry when the transform throws', async () => {
    const { snapshotFromParsed } = await import('../../../src/persistence/storeCache');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const snap = snapshotFromParsed({ maps: { a: { n: 1 }, b: { n: 2 } } }, (e) => {
      if ((e as { n: number }).n === 2) throw new Error('boom');
      return { n: 10 };
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
    expect(snap?.entries.get('a')?.json).toBe('{"n":10}');
    expect(snap?.entries.get('b')?.json).toBe('{"n":2}');
  });
});
