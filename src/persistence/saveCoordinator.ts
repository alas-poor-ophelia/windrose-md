/**
 * saveCoordinator.ts
 *
 * Module-level registry of every mounted map instance that owns pending edits.
 *
 * Individual map components are Preact trees the plugin can't reach directly,
 * but shutdown paths (app quit, view close, plugin unload, tab hide) all need
 * to act on ALL of them at once: flush what can still be written, journal what
 * can't. Each `useDebouncedSave` registers itself here on mount and drops out
 * on unmount.
 */

import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';

import { journalPending } from './saveJournal';

interface SaveInstance {
  /** The un-saved map data for this instance, or null when everything is saved. */
  getPending: () => { mapId: string; data: MapData } | null;
  /** Cancel the debounce and run the pending save now. Resolves when it lands. */
  flush: () => Promise<void>;
}

const instances = new Map<string, SaveInstance>();

function registerSaveInstance(id: string, instance: SaveInstance): void {
  instances.set(id, instance);
}

function unregisterSaveInstance(id: string): void {
  instances.delete(id);
}

/**
 * Flush every registered instance. Failures are logged, never rethrown — one
 * broken map must not block the others (or the quit handler).
 */
async function flushAll(): Promise<void> {
  const pending = Array.from(instances.values());
  await Promise.all(pending.map(async (instance) => {
    try {
      await instance.flush();
    } catch (e) {
      console.error('[Windrose] Save flush failed during shutdown:', e);
    }
  }));
}

/**
 * Synchronously journal every registered instance's pending data. Safe to call
 * from teardown paths where nothing async is guaranteed to run again.
 */
function journalAll(app: App): void {
  for (const instance of instances.values()) {
    try {
      const pending = instance.getPending();
      if (pending != null) journalPending(app, pending.mapId, pending.data);
    } catch (e) {
      console.debug('[Windrose] Journaling an instance failed:', e);
    }
  }
}

/**
 * Journal on the two events that precede an OS-level process kill without any
 * further async turn: the tab/window going hidden (iOS suspend) and pagehide.
 * Returns a disposer — register it with `Plugin.register`.
 */
function installLifecycleJournaling(app: App): () => void {
  const onHide = (): void => {
    if (document.visibilityState === 'hidden') journalAll(app);
  };
  const onPageHide = (): void => { journalAll(app); };

  document.addEventListener('visibilitychange', onHide);
  window.addEventListener('pagehide', onPageHide);

  return () => {
    document.removeEventListener('visibilitychange', onHide);
    window.removeEventListener('pagehide', onPageHide);
  };
}

/** Test/diagnostic helper: how many instances are currently registered. */
function registeredInstanceCount(): number {
  return instances.size;
}

export {
  registerSaveInstance,
  unregisterSaveInstance,
  flushAll,
  journalAll,
  installLifecycleJournaling,
  registeredInstanceCount,
};
export type { SaveInstance };
