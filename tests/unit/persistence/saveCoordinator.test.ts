import { describe, it, expect, beforeEach } from 'vitest';
import type { App } from 'obsidian';

import {
  registerSaveInstance,
  unregisterSaveInstance,
  flushAll,
  journalAll,
  registeredInstanceCount,
} from '../../../src/persistence/saveCoordinator';
import { readJournal } from '../../../src/persistence/saveJournal';
import { createNewMap } from '../../../src/persistence/fileOperations';
import type { MapData } from '../../../types/core/map.types';

function makeApp(): { app: App; store: Map<string, string> } {
  const store = new Map<string, string>();
  const app = {
    saveLocalStorage: (key: string, data: unknown) => {
      if (data == null) store.delete(key);
      else store.set(key, String(data));
    },
    loadLocalStorage: (key: string) => store.get(key) ?? null,
  } as unknown as App;
  return { app, store };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('saveCoordinator registry', () => {
  beforeEach(() => {
    for (const id of ['i1', 'i2', 'i3']) unregisterSaveInstance(id);
  });

  it('registers and unregisters instances', () => {
    const before = registeredInstanceCount();
    registerSaveInstance('i1', { getPending: () => null, flush: async () => undefined });
    expect(registeredInstanceCount()).toBe(before + 1);

    unregisterSaveInstance('i1');
    expect(registeredInstanceCount()).toBe(before);
  });

  it('flushAll awaits every registered instance', async () => {
    const done: string[] = [];
    registerSaveInstance('i1', {
      getPending: () => null,
      flush: async () => { await delay(15); done.push('i1'); },
    });
    registerSaveInstance('i2', {
      getPending: () => null,
      flush: async () => { done.push('i2'); },
    });

    await flushAll();

    expect(done.sort()).toEqual(['i1', 'i2']);
    unregisterSaveInstance('i1');
    unregisterSaveInstance('i2');
  });

  it('flushAll does not reject when one instance fails', async () => {
    const done: string[] = [];
    registerSaveInstance('i1', {
      getPending: () => null,
      flush: async () => { throw new Error('save exploded'); },
    });
    registerSaveInstance('i2', {
      getPending: () => null,
      flush: async () => { done.push('i2'); },
    });

    await expect(flushAll()).resolves.toBeUndefined();
    expect(done).toEqual(['i2']);
    unregisterSaveInstance('i1');
    unregisterSaveInstance('i2');
  });

  it('an unregistered instance is not flushed', async () => {
    const done: string[] = [];
    registerSaveInstance('i1', {
      getPending: () => null,
      flush: async () => { done.push('i1'); },
    });
    unregisterSaveInstance('i1');

    await flushAll();

    expect(done).toEqual([]);
  });

  it('journalAll writes every instance with pending data, synchronously', () => {
    const { app } = makeApp();
    const pendingA: MapData = createNewMap('Pending A', 'grid');
    registerSaveInstance('i1', {
      getPending: () => ({ mapId: 'coord-a', data: pendingA }),
      flush: async () => undefined,
    });
    registerSaveInstance('i2', {
      getPending: () => null,
      flush: async () => undefined,
    });

    journalAll(app);

    expect(readJournal(app, 'coord-a')?.payload).toBe(JSON.stringify(pendingA));
    expect(readJournal(app, 'coord-b')).toBeNull();

    unregisterSaveInstance('i1');
    unregisterSaveInstance('i2');
  });

  it('journalAll survives an instance that throws', () => {
    const { app } = makeApp();
    registerSaveInstance('i1', {
      getPending: () => { throw new Error('broken instance'); },
      flush: async () => undefined,
    });
    const pending = createNewMap('Survivor', 'grid');
    registerSaveInstance('i2', {
      getPending: () => ({ mapId: 'coord-c', data: pending }),
      flush: async () => undefined,
    });

    expect(() => journalAll(app)).not.toThrow();
    expect(readJournal(app, 'coord-c')).not.toBeNull();

    unregisterSaveInstance('i1');
    unregisterSaveInstance('i2');
  });
});
