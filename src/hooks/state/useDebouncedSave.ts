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
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef<number>(0);

  useEffect(() => {
    if (!pendingData) return undefined;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    const currentVersion = ++saveVersionRef.current;

    saveTimerRef.current = setTimeout(async () => {
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
    }, 2000);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData, mapId, app]);

  useEffect(() => {
    return () => {
      if (pendingData && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        void saveMapData(app, mapId, pendingData);
      }
    };
  }, [pendingData, mapId, app]);

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
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
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
