import type { MapData } from '#types/core/map.types';
import type { SaveStatus, MapDataUpdater, MapId } from '#types/hooks/mapData.types';
import type { App } from 'obsidian';
import type { SaveMapResult } from '../../persistence/fileOperations';

import { Notice } from 'obsidian';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { saveMapData } from '../../persistence/fileOperations';
import { registerSaveInstance, unregisterSaveInstance } from '../../persistence/saveCoordinator';
import { clearJournal, journalPending, moveJournalToConflict } from '../../persistence/saveJournal';

type MapDataSetter = (value: MapData | null | ((prev: MapData | null) => MapData | null)) => void;

/** Unique per mounted hook instance — the coordinator registry is keyed by it. */
let instanceCounter = 0;

/** Debounce between the last edit and its save. */
const SAVE_DEBOUNCE_MS = 2000;

/** Retry delay after a failed save: 2 s, 4 s, then 8 s per attempt (capped). */
function retryDelayMs(attempt: number): number {
  return Math.min(2000 * 2 ** attempt, 8000);
}

/**
 * Consecutive failed attempts after which the automatic retry stops (2 + 4 +
 * 8 x 4 s, about 40 s). Each attempt re-reads and re-parses the whole data
 * file, so a persistent failure must not loop forever. The edits stay pending
 * and journaled; the next edit or forceSave (quit, close) tries again.
 */
const MAX_SAVE_RETRIES = 6;

function notifySaveRetriesStopped(): void {
  new Notice(
    'Windrose: this map could not be saved after several attempts, so automatic retries have stopped. ' +
    'Your changes are kept in memory and in the crash-recovery copy; the next edit tries again.',
    10_000
  );
}

/** A save currently being written (MEM-15: never write the same version twice). */
interface InFlightSave {
  version: number;
  data: MapData;
  promise: Promise<SaveMapResult>;
}

interface UseDebouncedSaveResult {
  saveStatus: SaveStatus;
  updateMapData: MapDataUpdater;
  forceSave: () => Promise<void>;
  markDeleted: () => void;
  /** True once a save was refused because another mount deleted the map. */
  mapDeleted: boolean;
  /** True after a real-edit save was refused as stale (see UseMapDataResult). */
  staleConflict: boolean;
  /** Dismiss the stale-conflict state (pair with a reload). */
  acknowledgeStaleConflict: () => void;
  /** This mount's save-writer id (also its journal slot owner). */
  writerId: string;
}

/**
 * Tell the user what actually happened to edits refused as stale after their
 * pane closed (DATA-13). Only claims a recovery copy when one was stored.
 */
function notifyStaleUnmountConflict(kept: boolean): void {
  new Notice(
    'Windrose: your last changes to this map were not saved because the map was changed in another pane. ' +
    (kept
      ? 'A copy was kept; you will be offered it the next time you open this map.'
      : 'No recovery copy could be kept (too large or out of storage), so those changes are lost.'),
    10_000
  );
}

function useDebouncedSave(
  app: App,
  mapId: MapId,
  setMapData: MapDataSetter,
  /**
   * Write generation this instance's tree is based on — set by useMapData at
   * load, advanced here on every successful save. Passed to saveMapData so a
   * tree that another mount has since overwritten is refused, not written.
   */
  baseGenRef: { current: number }
): UseDebouncedSaveResult {
  // Unsaved data: set by every edit, cleared ONLY when a save of that exact
  // version lands (or is refused as stale). A failed save keeps it, so the
  // retry, forceSave, the unmount flush and the shutdown registry all still
  // see it as pending (DATA-03).
  const [pendingData, setPendingData] = useState<MapData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('Saved');
  const [staleConflict, setStaleConflict] = useState(false);
  // Raised when a save of this mount came back 'deleted': another mount
  // deleted the map this session (DATA-02).
  const [mapDeleted, setMapDeleted] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  // True once MAX_SAVE_RETRIES was hit and the user was told (reset by a landed save).
  const retriesStoppedRef = useRef(false);
  // The tree/version last written to this writer's journal slot, so a retry
  // (or a failure right after the pre-save journal) does not re-serialize an
  // unchanged payload (MEM-22). Reset whenever the slot is cleared.
  const lastJournalRef = useRef<{ data: MapData; version: number; ok: boolean } | null>(null);
  /** The tree of the last save that landed (identity), so it is never re-journaled. */
  const lastLandedRef = useRef<MapData | null>(null);
  // Bumped synchronously by every edit (and by delete/acknowledge to
  // invalidate in-flight bookkeeping). A save result only settles state when
  // its version is still the latest.
  const saveVersionRef = useRef<number>(0);
  const inFlightRef = useRef<InFlightSave | null>(null);
  const unmountedRef = useRef(false);
  // True while the pending data contains anything beyond cosmetic view-state
  // changes. Decides the UX of a stale refusal: real edits block behind the
  // conflict panel; a refused pan/zoom write is dropped silently.
  const hasRealEditRef = useRef(false);
  // Resurrection guard: once the map is deleted, no save may ever fire again for
  // this instance. A trailing autosave (debounce timer, unmount flush, or
  // forceSave) would otherwise rewrite the deleted entry. Every save path
  // checks this ref before writing; saveMapData also refuses tombstoned ids.
  const deletedRef = useRef(false);

  // Per-instance id: keys the shutdown registry below AND identifies this
  // mount as the writer in saveMapData's generation registry, so an instance
  // is never refused as stale against its own previous write.
  const instanceIdRef = useRef<string>('');
  if (instanceIdRef.current === '') instanceIdRef.current = `windrose-save-${++instanceCounter}`;

  // Latest values for callbacks that must stay stable (unmount flush,
  // shutdown registry, retry timer).
  const flushRef = useRef({ app, mapId, pendingData });
  flushRef.current = { app, mapId, pendingData };

  /** Journal `data` into this writer's live slot, skipping an unchanged re-write. */
  const journalNow = (data: MapData, version: number): boolean => {
    // The exact tree already landed on disk: nothing to protect, and the
    // stringify/deflate cost is skipped (wave-5 finding 11).
    if (data === lastLandedRef.current) return true;
    const last = lastJournalRef.current;
    if (last != null && last.ok && last.data === data && last.version === version) return true;
    const ok = journalPending(flushRef.current.app, flushRef.current.mapId, data, { writerId: instanceIdRef.current, version });
    lastJournalRef.current = { data, version, ok };
    return ok;
  };

  /** Drop this writer's live journal slot (conditioned on `upToVersion` when given). */
  const clearOwnJournal = (upToVersion?: number): void => {
    clearJournal(flushRef.current.app, flushRef.current.mapId, { writerId: instanceIdRef.current, upToVersion });
    lastJournalRef.current = null;
  };

  const clearTimers = (): void => {
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  };

  /**
   * The one save path shared by the debounce timer, the failure retry and
   * forceSave (DUP-16). Owns the result state machine: saved / stale / failed,
   * and the version-race check.
   */
  const commitSaveRef = useRef<(data: MapData, version: number) => Promise<void>>(async () => {});
  commitSaveRef.current = async (data: MapData, version: number): Promise<void> => {
    if (deletedRef.current) return;

    // MEM-15: this exact version is already being written — wait for that
    // write instead of queueing a second copy of the same tree.
    const inflight = inFlightRef.current;
    if (inflight != null && inflight.version === version) {
      try {
        await inflight.promise;
      } catch {
        /* the owner of that write settles it */
      }
      return;
    }

    // DATA-05: journal synchronously BEFORE every save, so a crash, kill or
    // power loss during the async write leaves a recoverable copy. Cleared
    // by settleResult once this version lands.
    journalNow(data, version);

    if (!unmountedRef.current) setSaveStatus('Saving...');
    const promise = saveMapData(app, mapId, data, baseGenRef.current, instanceIdRef.current);
    inFlightRef.current = { version, data, promise };
    let result: SaveMapResult;
    try {
      result = await promise;
    } catch (e) {
      // saveMapData resolves 'failed' rather than rejecting today; a future
      // rejection must still go through the retry/journal path.
      console.error('[Windrose] Save rejected unexpectedly:', e);
      result = { status: 'failed' };
    } finally {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    }
    settleResult(result, version, data);
  };

  /**
   * Shut every save path for this instance (map deleted). Shared by the
   * deleting instance (markDeleted) and by any other mount whose save comes
   * back 'deleted'. The journal goes too: an entry for a deleted map would
   * offer to resurrect it on the next load (after a restart the tombstone is
   * gone) — including a "keep for later" entry.
   */
  const shutForDeletion = (): void => {
    deletedRef.current = true;
    clearJournal(flushRef.current.app, flushRef.current.mapId, { includeKept: true });
    lastJournalRef.current = null;
    clearTimers();
    // Invalidate any in-flight save's completion bookkeeping and drop pending
    // data so nothing re-enqueues after the delete.
    saveVersionRef.current++;
    retryAttemptRef.current = 0;
    hasRealEditRef.current = false;
    if (unmountedRef.current) return;
    setPendingData(null);
    setStaleConflict(false);
  };
  const shutForDeletionRef = useRef(shutForDeletion);
  shutForDeletionRef.current = shutForDeletion;

  /** Apply one save result to refs, journal and UI state. */
  const settleResult = (result: SaveMapResult, version: number, data: MapData): void => {
    const a = flushRef.current.app;
    const m = flushRef.current.mapId;
    const writerId = instanceIdRef.current;

    if (result.status === 'deleted') {
      // DATA-02: terminal. Nothing was written and nothing ever will be: no
      // retry, no "Saved". Surface the deletion so the UI swaps the canvas for
      // its "Map deleted" panel (this mount did not run the delete).
      const wasDeleted = deletedRef.current;
      shutForDeletion();
      if (!wasDeleted && !unmountedRef.current) {
        setSaveStatus('Save failed');
        setMapDeleted(true);
      }
      return;
    }

    if (result.status === 'saved') {
      baseGenRef.current = result.generation;
      lastLandedRef.current = data;
      // Only this writer's slot, and only if no newer edit was journaled
      // since (an unmount flush may have journaled a newer tree).
      clearOwnJournal(version);
    } else if (result.status === 'stale') {
      if (unmountedRef.current && hasRealEditRef.current) {
        // DATA-13: nobody is left to show the conflict panel. Set the
        // journal entry aside instead of deleting real edits silently.
        // Only move what was just written: if journaling was skipped
        // (oversized, quota) the live slot may hold an OLDER tree, which
        // must not be set aside as if it were these edits.
        if (journalNow(data, version)) {
          notifyStaleUnmountConflict(moveJournalToConflict(a, m, writerId) === 'moved');
          lastJournalRef.current = null;
        } else {
          clearOwnJournal();
          notifyStaleUnmountConflict(false);
        }
      } else {
        // NEVER leave a refused stale tree in the journal — restoring it on
        // next load would be a user-consented whole-entry clobber.
        clearOwnJournal();
      }
    } else {
      // DATA-03: the edits now exist only in memory. Make sure the journal
      // holds the newest unsaved tree (a later edit may have superseded the
      // one journaled before this save; an unchanged tree is not rewritten).
      const newest = flushRef.current.pendingData;
      if (newest != null && newest !== data) journalNow(newest, saveVersionRef.current);
      else journalNow(data, version);
    }

    if (deletedRef.current || unmountedRef.current) return;
    const isLatest = saveVersionRef.current === version;

    if (result.status === 'stale') {
      // Retrying is pointless (every retry is based on the same stale
      // tree); drop the pending write. Real edits escalate to the
      // conflict panel; a cosmetic-only refusal stays silent.
      clearTimers();
      retryAttemptRef.current = 0;
      setPendingData(null);
      if (hasRealEditRef.current) {
        setSaveStatus('Save failed');
        setStaleConflict(true);
      } else {
        setSaveStatus('Saved');
      }
      return;
    }

    if (result.status === 'failed') {
      if (isLatest) {
        // Keep pendingData and retry with backoff, up to MAX_SAVE_RETRIES.
        setSaveStatus('Save failed');
        if (retryAttemptRef.current < MAX_SAVE_RETRIES) {
          scheduleRetry(version);
        } else if (!retriesStoppedRef.current) {
          retriesStoppedRef.current = true;
          notifySaveRetriesStopped();
        }
      }
      return;
    }

    retryAttemptRef.current = 0;
    retriesStoppedRef.current = false;
    if (isLatest) {
      setSaveStatus('Saved');
      setPendingData(null);
      hasRealEditRef.current = false;
    } else {
      setSaveStatus('Unsaved changes');
    }
  };

  const scheduleRetry = (version: number): void => {
    if (retryTimerRef.current != null) window.clearTimeout(retryTimerRef.current);
    const delay = retryDelayMs(retryAttemptRef.current);
    retryAttemptRef.current++;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      if (deletedRef.current || unmountedRef.current) return;
      if (saveVersionRef.current !== version) return; // a newer edit owns the next save
      const data = flushRef.current.pendingData;
      if (data == null) return;
      void commitSaveRef.current(data, version);
    }, delay);
  };

  useEffect(() => {
    if (!pendingData || deletedRef.current) return undefined;

    if (saveTimerRef.current != null) window.clearTimeout(saveTimerRef.current);
    // A new edit supersedes any pending failure retry; the debounced save
    // below carries it, with a fresh retry budget (wave-5 finding 7: after
    // the cap, a later edit's failed save otherwise got no retry at all).
    if (retryTimerRef.current != null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    retryAttemptRef.current = 0;
    retriesStoppedRef.current = false;

    const currentVersion = saveVersionRef.current;
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      void commitSaveRef.current(pendingData, currentVersion);
    }, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData]);

  // Flush any pending save when the component unmounts. This MUST be an
  // unmount-only effect (empty deps, latest values via refs): with pendingData
  // in the dependency array the cleanup ran on EVERY pendingData change,
  // firing an immediate un-debounced full-file save per pan/draw event —
  // measured at up to ~47 one-megabyte saves per second during a drag-pan,
  // each one also a sync upload every other device had to ingest.
  //
  // Unmount flush body, refreshed every render so the unmount-only effect
  // below always runs the latest closure.
  const flushOnUnmountRef = useRef<() => void>(() => undefined);
  flushOnUnmountRef.current = (): void => {
    const { app: a, mapId: m, pendingData: pd } = flushRef.current;
    clearTimers();
    // pendingData is non-null exactly while edits are unconfirmed: waiting
    // on the debounce, in flight, or after a failed save (DATA-03).
    if (pd == null || deletedRef.current) return;

    // Journal FIRST and synchronously: the unmount flush is unawaited by
    // construction (cleanup functions can't be async), so if the event loop
    // dies before the vault write finishes, the journal is the only record.
    journalNow(pd, saveVersionRef.current);

    // MEM-15: the same tree is already being written; its completion
    // (settleResult) clears or sets aside the journal entry above.
    const inflight = inFlightRef.current;
    if (inflight != null && inflight.data === pd) return;

    const version = saveVersionRef.current;
    void saveMapData(a, m, pd, baseGenRef.current, instanceIdRef.current).then(
      (res) => settleResult(res, version, pd),
      () => undefined
    );
  };

  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      flushOnUnmountRef.current();
    };
  }, []);

  const updateMapData: MapDataUpdater = useCallback((updaterOrData, options) => {
    if (options?.cosmetic !== true) hasRealEditRef.current = true;
    setMapData((prev) => {
      if (!prev) return prev;
      const newData = typeof updaterOrData === 'function'
        ? updaterOrData(prev)
        : updaterOrData;
      // Version bumps synchronously with the edit, so a save that completes
      // before the debounce effect re-runs can never mistake itself for the
      // latest and drop this edit.
      saveVersionRef.current++;
      setPendingData(newData);
      setSaveStatus('Unsaved changes');
      return newData;
    });
  }, [setMapData]);

  // The deleting instance: the caller shows its own deleted state (in-note
  // panel, or the full-pane picker), so mapDeleted is not raised here.
  const markDeleted = useCallback((): void => {
    shutForDeletionRef.current();
    // Settle the status too — an in-flight save would otherwise leave it
    // frozen at 'Saving...' (its completion is a no-op once deleted).
    setSaveStatus('Saved');
  }, []);

  // Dismiss the stale-conflict block (the caller reloads alongside). Pending
  // stale data is dropped — it is exactly what must not be written.
  const acknowledgeStaleConflict = useCallback((): void => {
    setStaleConflict(false);
    hasRealEditRef.current = false;
    saveVersionRef.current++;
    clearTimers();
    retryAttemptRef.current = 0;
    setPendingData(null);
    setSaveStatus('Saved');
  }, []);

  const forceSave = useCallback(async (): Promise<void> => {
    if (deletedRef.current) return;
    const pd = flushRef.current.pendingData;
    if (pd == null) {
      // Nothing unsaved, but a write may still be landing: let callers (quit
      // hold) wait for it rather than return early.
      const inflight = inFlightRef.current;
      if (inflight != null) await inflight.promise;
      return;
    }
    clearTimers();
    await commitSaveRef.current(pd, saveVersionRef.current);
  }, []);

  // Shutdown registry: quit, view close and plugin unload all need to reach
  // every mounted map's pending edits. The refs keep the registration stable
  // (register once on mount) while still exposing the latest closure.
  const forceSaveRef = useRef(forceSave);
  forceSaveRef.current = forceSave;

  useEffect(() => {
    const id = instanceIdRef.current;
    registerSaveInstance(id, {
      getPending: () => {
        const { mapId: m, pendingData: pd } = flushRef.current;
        if (!pd || deletedRef.current) return null;
        return { mapId: m, data: pd, writerId: id, version: saveVersionRef.current };
      },
      flush: async () => { await forceSaveRef.current(); },
    });
    return () => unregisterSaveInstance(id);
  }, []);

  return { saveStatus, updateMapData, forceSave, markDeleted, mapDeleted, staleConflict, acknowledgeStaleConflict, writerId: instanceIdRef.current };
}

export { useDebouncedSave, retryDelayMs, MAX_SAVE_RETRIES };
