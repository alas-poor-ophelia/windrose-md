import { describe, it, expect } from 'vitest';
import type { App } from 'obsidian';
import { TFile } from 'obsidian';

import {
  saveMapData,
  createNewMap,
  shouldRotateBak,
  otherBakSlot,
  bakPathForSlot,
  backupTimestamp,
  BAK_THROTTLE_MS,
} from '../../../src/persistence/fileOperations';
import type { BakSlot } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

const DATA_PATH = 'windrose-md-data.json';

describe('backup rotation decision', () => {
  it('the first save of a session always rotates', () => {
    expect(shouldRotateBak(null, 0)).toBe(true);
    expect(shouldRotateBak(null, Date.now())).toBe(true);
  });

  it('a second save inside the throttle window does not rotate', () => {
    const t0 = 1_700_000_000_000;
    expect(shouldRotateBak(t0, t0)).toBe(false);
    expect(shouldRotateBak(t0, t0 + 1)).toBe(false);
    expect(shouldRotateBak(t0, t0 + 60_000)).toBe(false);
    // Exactly at the boundary is still inside the window (strict >).
    expect(shouldRotateBak(t0, t0 + BAK_THROTTLE_MS)).toBe(false);
  });

  it('a save after the throttle window rotates again', () => {
    const t0 = 1_700_000_000_000;
    expect(shouldRotateBak(t0, t0 + BAK_THROTTLE_MS + 1)).toBe(true);
    expect(shouldRotateBak(t0, t0 + 60 * 60 * 1000)).toBe(true);
  });

  it('the throttle is 15 minutes', () => {
    expect(BAK_THROTTLE_MS).toBe(15 * 60 * 1000);
  });
});

describe('backup slot alternation', () => {
  it('alternates 1 → 2 → 1 → 2', () => {
    expect(otherBakSlot(1)).toBe(2);
    expect(otherBakSlot(2)).toBe(1);

    let slot: BakSlot = 1;
    const written: BakSlot[] = [];
    for (let i = 0; i < 4; i++) {
      written.push(slot);
      slot = otherBakSlot(slot);
    }
    expect(written).toEqual([1, 2, 1, 2]);
  });

  it('names the slot files next to the data file', () => {
    expect(bakPathForSlot('windrose-md-data.json', 1)).toBe('windrose-md-data.bak1.json');
    expect(bakPathForSlot('windrose-md-data.json', 2)).toBe('windrose-md-data.bak2.json');
    expect(bakPathForSlot('Garden/90 - Data/dungeon-maps-data.json', 1))
      .toBe('Garden/90 - Data/dungeon-maps-data.bak1.json');
  });

  it('still produces a slot path when the data file has no .json extension', () => {
    expect(bakPathForSlot('mapdata', 2)).toBe('mapdata.bak2.json');
  });
});

describe('corrupt-file timestamp suffix', () => {
  it('formats as yyyymmdd-hhmmss with zero padding', () => {
    expect(backupTimestamp(new Date(2026, 7, 3, 4, 5, 6))).toBe('20260803-040506');
    expect(backupTimestamp(new Date(2026, 11, 31, 23, 59, 59))).toBe('20261231-235959');
  });
});

interface FakeVault {
  app: App;
  contents: Map<string, string>;
}

function makeApp(initialContent: string): FakeVault {
  const files = new Map<string, TFile>();
  const contents = new Map<string, string>();

  const file = new TFile();
  file.path = DATA_PATH;
  files.set(DATA_PATH, file);
  contents.set(DATA_PATH, initialContent);

  const vault = {
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    read: async (f: TFile) => contents.get(f.path) ?? '',
    modify: async (f: TFile, data: string) => { contents.set(f.path, data); },
    create: async (path: string, data: string) => {
      const created = new TFile();
      created.path = path;
      files.set(path, created);
      contents.set(path, data);
    },
  };

  return { app: { vault } as unknown as App, contents };
}

function fileWith(maps: Record<string, MapData>): string {
  return JSON.stringify({ maps });
}

describe('saveMapData backup rotation', () => {
  it('backs up the known-good on-disk content once, then throttles', async () => {
    const stored = createNewMap('Original', 'grid');
    const original = fileWith({ 'bak-1': stored });
    const { app, contents } = makeApp(original);

    // First save of the module's lifetime: rotates into slot 1 and captures the
    // content it just read and parsed — NOT the merged output.
    await saveMapData(app, 'bak-1', createNewMap('Second', 'grid'));
    expect(contents.get('windrose-md-data.bak1.json')).toBe(original);
    expect(contents.get(DATA_PATH)).not.toBe(original);

    // Immediately afterwards: inside the throttle window, so slot 2 stays unwritten.
    await saveMapData(app, 'bak-1', createNewMap('Third', 'grid'));
    expect(contents.has('windrose-md-data.bak2.json')).toBe(false);
    expect(contents.get('windrose-md-data.bak1.json')).toBe(original);
  });
});
