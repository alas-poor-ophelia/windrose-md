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

import { journalPending, setJournalWriterLive } from './saveJournal';

interface SaveInstance {
  /** The un-saved map data for this instance, or null when everything is saved. */
  getPending: () => { mapId: string; data: MapData; writerId?: string; version?: number } | null;
  /** Cancel the debounce and run the pending save now. Resolves when it lands. */
  flush: () => Promise<void>;
}

const instances = new Map<string, SaveInstance>();

/**
 * `id` is also the instance's journal writer id: while registered, its live
 * journal slot is never offered to another pane for restore, nor pruned.
 */
function registerSaveInstance(id: string, instance: SaveInstance): void {
  instances.set(id, instance);
  setJournalWriterLive(id, true);
}

function unregisterSaveInstance(id: string): void {
  instances.delete(id);
  setJournalWriterLive(id, false);
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
      if (pending != null) {
        journalPending(app, pending.mapId, pending.data, { writerId: pending.writerId, version: pending.version });
      }
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
  // Listeners are attached once per WINDOW: the main window now, plus every
  // popout window as it opens (a map in a popout must journal on THAT
  // window's pagehide, which never fires on the main window).
  const detachers = new Map<Window, () => void>();

  const attach = (win: Window): void => {
    if (detachers.has(win)) return;
    const doc = win.document;
    const onHide = (): void => {
      if (doc.visibilityState === 'hidden') journalAll(app);
    };
    const onPageHide = (): void => { journalAll(app); };
    doc.addEventListener('visibilitychange', onHide);
    win.addEventListener('pagehide', onPageHide);
    detachers.set(win, () => {
      doc.removeEventListener('visibilitychange', onHide);
      win.removeEventListener('pagehide', onPageHide);
    });
  };
  const detach = (win: Window): void => {
    detachers.get(win)?.();
    detachers.delete(win);
  };

  attach(window);
  app.workspace.iterateAllLeaves((leaf) => { attach(leaf.view.containerEl.win); });
  const openRef = app.workspace.on('window-open', (_ws, win) => { attach(win); });
  const closeRef = app.workspace.on('window-close', (_ws, win) => {
    journalAll(app);
    detach(win);
  });

  return () => {
    app.workspace.offref(openRef);
    app.workspace.offref(closeRef);
    for (const off of detachers.values()) off();
    detachers.clear();
  };
}

/**
 * A pane's save of a journal-restored tree landed. Other panes of the same map
 * loaded the store BEFORE that write, so their base is now stale; a pane with
 * no real edit of its own re-reads the store instead of being refused later
 * (multi-pane restore). Module-level so popout windows share it.
 */
type RestoreLandedListener = (mapId: string, writerId: string) => void;
const restoreLandedListeners = new Set<RestoreLandedListener>();

function onRestoreLanded(listener: RestoreLandedListener): () => void {
  restoreLandedListeners.add(listener);
  return () => { restoreLandedListeners.delete(listener); };
}

function notifyRestoreLanded(mapId: string, writerId: string): void {
  for (const listener of [...restoreLandedListeners]) {
    try {
      listener(mapId, writerId);
    } catch (e) {
      console.error('[Windrose] Restore-landed listener failed:', e);
    }
  }
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
  onRestoreLanded,
  notifyRestoreLanded,
};

