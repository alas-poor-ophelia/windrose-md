import type { MapData } from '#types/core/map.types';
import type { SaveStatus, MapDataUpdater, MapId } from '#types/hooks/mapData.types';
import type { App } from 'obsidian';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { saveMapData } from '../../persistence/fileOperations';

type MapDataSetter = (value: MapData | null | ((prev: MapData | null) => MapData | null)) => void;

interface UseDebouncedSaveResult {
  saveStatus: SaveStatus;
  updateMapData: MapDataUpdater;
  forceSave: () => Promise<void>;
}

function useDebouncedSave(
  app: App,
  mapId: MapId,
  setMapData: MapDataSetter
): UseDebouncedSaveResult {
  const [pendingData, setPendingData] = useState<MapData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('Saved');
  const saveTimerRef = useRef<number | null>(null);
  const saveVersionRef = useRef<number>(0);

  useEffect(() => {
    if (!pendingData) return undefined;

    if (saveTimerRef.current != null) {
      window.clearTimeout(saveTimerRef.current);
    }

    const currentVersion = ++saveVersionRef.current;

    saveTimerRef.current = window.setTimeout(() => { void (async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(app, mapId, pendingData);

      if (saveVersionRef.current === currentVersion) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
        saveTimerRef.current = null;
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
  }, [pendingData, mapId, app]);

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
      if (pd && saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        void saveMapData(a, m, pd);
      }
    };
  }, []);

  const updateMapData: MapDataUpdater = useCallback((updaterOrData) => {
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

  const forceSave = useCallback(async (): Promise<void> => {
    if (pendingData) {
      if (saveTimerRef.current != null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const versionAtSaveStart = saveVersionRef.current;

      setSaveStatus('Saving...');
      const success = await saveMapData(app, mapId, pendingData);

      if (saveVersionRef.current === versionAtSaveStart) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
      } else {
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    }
  }, [pendingData, mapId, app]);

  return { saveStatus, updateMapData, forceSave };
}

export { useDebouncedSave };
