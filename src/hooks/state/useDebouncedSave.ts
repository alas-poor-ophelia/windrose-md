import type { MapData } from '#types/core/map.types';
import type { SaveStatus, MapDataUpdater, MapId } from '#types/hooks/mapData.types';
import type { App } from 'obsidian';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { saveMapData } from '../../persistence/fileOperations';
import { registerSaveInstance, unregisterSaveInstance } from '../../persistence/saveCoordinator';
import { clearJournal, journalPending } from '../../persistence/saveJournal';

type MapDataSetter = (value: MapData | null | ((prev: MapData | null) => MapData | null)) => void;

/** Unique per mounted hook instance — the coordinator registry is keyed by it. */
let instanceCounter = 0;

interface UseDebouncedSaveResult {
  saveStatus: SaveStatus;
  updateMapData: MapDataUpdater;
  forceSave: () => Promise<void>;
  markDeleted: () => void;
  /** True after a real-edit save was refused as stale (see UseMapDataResult). */
  staleConflict: boolean;
  /** Dismiss the stale-conflict state (pair with a reload). */
  acknowledgeStaleConflict: () => void;
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
  const [pendingData, setPendingData] = useState<MapData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('Saved');
  const [staleConflict, setStaleConflict] = useState(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveVersionRef = useRef<number>(0);
  // True while the pending data contains anything beyond cosmetic view-state
  // changes. Decides the UX of a stale refusal: real edits block behind the
  // conflict panel; a refused pan/zoom write is dropped silently.
  const hasRealEditRef = useRef(false);
  // Resurrection guard: once the map is deleted, no save may ever fire again for
  // this instance. loadMapData silently re-creates a missing map, so a trailing
  // autosave (debounce timer, unmount flush, or forceSave) would resurrect a
  // deleted map as a blank. Every save path checks this ref before writing.
  const deletedRef = useRef(false);

  // Per-instance id: keys the shutdown registry below AND identifies this
  // mount as the writer in saveMapData's generation registry, so an instance
  // is never refused as stale against its own previous write.
  const instanceIdRef = useRef<string>('');
  if (instanceIdRef.current === '') instanceIdRef.current = `windrose-save-${++instanceCounter}`;

  useEffect(() => {
    if (!pendingData || deletedRef.current) return undefined;

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const currentVersion = ++saveVersionRef.current;

    saveTimerRef.current = window.setTimeout(() => { void (async () => {
      if (deletedRef.current) return;
      setSaveStatus('Saving...');
      const result = await saveMapData(app, mapId, pendingData, baseGenRef.current, instanceIdRef.current);

      if (result.status === 'saved') {
        baseGenRef.current = result.generation;
        clearJournal(app, mapId);
      } else if (result.status === 'stale') {
        // NEVER leave a refused stale tree in the journal — restoring it on
        // next load would be a user-consented whole-entry clobber.
        clearJournal(app, mapId);
      }

      if (deletedRef.current) return;

      if (result.status === 'stale') {
        // Retrying is pointless (every retry is based on the same stale
        // tree); drop the pending write. Real edits escalate to the
        // conflict panel; a cosmetic-only refusal stays silent.
        setPendingData(null);
        saveTimerRef.current = null;
        if (hasRealEditRef.current) {
          setSaveStatus('Save failed');
          setStaleConflict(true);
        } else {
          setSaveStatus('Saved');
        }
        return;
      }

      const success = result.status === 'saved';
      if (saveVersionRef.current === currentVersion) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
        saveTimerRef.current = null;
        if (success) hasRealEditRef.current = false;
      } else {
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    })(); }, 2000);

    return () => {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData, mapId, app, baseGenRef]);

  // Flush any pending save when the component unmounts. This MUST be an
  // unmount-only effect (empty deps, latest values via refs): with pendingData
  // in the dependency array the cleanup ran on EVERY pendingData change,
  // firing an immediate un-debounced full-file save per pan/draw event —
  // measured at up to ~47 one-megabyte saves per second during a drag-pan,
  // each one also a sync upload every other device had to ingest.
  const flushRef = useRef({ app, mapId, pendingData });
  flushRef.current = { app, mapId, pendingData };
  useEffect(() => {
    return () => {
      const { app: a, mapId: m, pendingData: pd } = flushRef.current;
      if (pd && saveTimerRef.current != null && !deletedRef.current) {
        window.clearTimeout(saveTimerRef.current);
        // Journal FIRST and synchronously: the unmount flush is unawaited by
        // construction (cleanup functions can't be async), so if the event loop
        // dies before the vault write finishes, the journal is the only record.
        journalPending(a, m, pd);
        void saveMapData(a, m, pd, baseGenRef.current, instanceIdRef.current).then((res) => {
          // A stale refusal must clear the journal entry written above —
          // replaying a stale tree on next load would clobber the other
          // mount's committed work with the user's blessing.
          if (res.status === 'saved' || res.status === 'stale') clearJournal(a, m);
          if (res.status === 'saved') baseGenRef.current = res.generation;
        }, () => undefined);
      }
    };
    // baseGenRef is a stable ref from useMapData — listing it keeps the
    // unmount-only contract (it never changes identity).
  }, [baseGenRef]);

  const updateMapData: MapDataUpdater = useCallback((updaterOrData, options) => {
    if (options?.cosmetic !== true) hasRealEditRef.current = true;
    setMapData((prev) => {
      if (!prev) return prev;
      const newData = typeof updaterOrData === 'function'
        ? updaterOrData(prev)
        : updaterOrData;
      setPendingData(newData);
      setSaveStatus('Unsaved changes');
      return newData;
    });
  }, [setMapData]);

  const markDeleted = useCallback((): void => {
    deletedRef.current = true;
    // A journal entry for a deleted map would offer to resurrect it on the next
    // load, so it goes at the same moment the tombstone does.
    clearJournal(app, mapId);
    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    // Invalidate any in-flight save's completion bookkeeping and drop pending
    // data so nothing re-enqueues after the delete. Settle the status too — an
    // in-flight save that loses the version race would otherwise leave it
    // frozen at 'Saving...' (its completion handlers bail on deletedRef).
    saveVersionRef.current++;
    setPendingData(null);
    setSaveStatus('Saved');
    setStaleConflict(false);
  }, [app, mapId]);

  // Dismiss the stale-conflict block (the caller reloads alongside). Pending
  // stale data is dropped — it is exactly what must not be written.
  const acknowledgeStaleConflict = useCallback((): void => {
    setStaleConflict(false);
    hasRealEditRef.current = false;
    saveVersionRef.current++;
    setPendingData(null);
    setSaveStatus('Saved');
  }, []);

  const forceSave = useCallback(async (): Promise<void> => {
    if (deletedRef.current) return;
    if (pendingData) {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const versionAtSaveStart = saveVersionRef.current;

      setSaveStatus('Saving...');
      const result = await saveMapData(app, mapId, pendingData, baseGenRef.current, instanceIdRef.current);
      if (result.status === 'saved') {
        baseGenRef.current = result.generation;
        clearJournal(app, mapId);
      } else if (result.status === 'stale') {
        clearJournal(app, mapId);
      }

      if (deletedRef.current) return;

      if (result.status === 'stale') {
        setPendingData(null);
        if (hasRealEditRef.current) {
          setSaveStatus('Save failed');
          setStaleConflict(true);
        } else {
          setSaveStatus('Saved');
        }
        return;
      }

      const success = result.status === 'saved';
      if (saveVersionRef.current === versionAtSaveStart) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
        if (success) hasRealEditRef.current = false;
      } else {
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    }
  }, [pendingData, mapId, app, baseGenRef]);

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
        return { mapId: m, data: pd };
      },
      flush: async () => { await forceSaveRef.current(); },
    });
    return () => unregisterSaveInstance(id);
  }, []);

  return { saveStatus, updateMapData, forceSave, markDeleted, staleConflict, acknowledgeStaleConflict };
}

export { useDebouncedSave };
