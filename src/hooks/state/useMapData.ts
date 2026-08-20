import type { MapData, MapType } from '#types/core/map.types';
import type {
  UseMapDataResult,
  MapDataLoadFailure,
  MapDataUpdater,
  MapId,
  MapName,
} from '#types/hooks/mapData.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { loadMapData, MapDataUnreadableError } from '../../persistence/fileOperations';
import { getDataFilePath } from '../../core/settingsAccessor';
import { resolveJournalOnLoad } from '../../persistence/saveJournal';
import { getCachedImage } from '../../assets/imageOperations';
import { useDebouncedSave } from './useDebouncedSave';
import { useTilesetBuilder } from './useTilesetBuilder';

function useMapData(
  mapId: MapId,
  mapName: MapName = '',
  mapType: MapType = 'grid'
): UseMapDataResult {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailure, setLoadFailure] = useState<MapDataLoadFailure | null>(null);
  const [settingsVersion, setSettingsVersion] = useState(0);
  // Bumped by reload() to re-run the load effect after the data file has been
  // repaired underneath us (backup restore). Nothing else touches it.
  const [reloadNonce, setReloadNonce] = useState(0);
  const app = useApp();

  // Assigned below, after useDebouncedSave — the load effect needs the updater
  // to apply a restored journal entry through the normal save path.
  const updateMapDataRef = useRef<MapDataUpdater | null>(null);

  // Load map data on mount
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      let data: MapData;
      try {
        data = await loadMapData(app, mapId, mapName, mapType);
      } catch (error) {
        if (cancelled) return;
        // Unreadable data file: do NOT fall back to a blank map. Surface the
        // failure so the UI can block editing before anything overwrites it.
        console.error('[Windrose] Map load failed:', error);
        setLoadFailure({
          dataPath: error instanceof MapDataUnreadableError ? error.dataPath : getDataFilePath(),
          message: error instanceof Error ? error.message : String(error),
        });
        setIsLoading(false);
        return;
      }

      if (cancelled) return;
      setMapData(data);
      setIsLoading(false);

      // Crash journal: offer to restore edits a previous session couldn't write.
      const restored = await resolveJournalOnLoad(app, mapId, data.name ?? mapName);
      if (cancelled || restored == null) return;
      updateMapDataRef.current?.(restored);
    }
    void load();
    return () => { cancelled = true; };
  }, [app, mapId, mapName, mapType, reloadNonce]);

  /**
   * Re-read the data file from scratch. Clears any previous load failure first
   * so the blocking recovery panel gives way to the loading state immediately.
   */
  const reload = useCallback((): void => {
    setLoadFailure(null);
    setIsLoading(true);
    setReloadNonce((prev: number) => prev + 1);
  }, []);

  // Listen for settings changes (feeds tileset builder + image preloader)
  useEffect(() => {
    const handleSettingsChange = (): void => {
      setSettingsVersion((prev: number) => prev + 1);
    };
    window.addEventListener('windrose-settings-changed', handleSettingsChange);
    return () => {
      window.removeEventListener('windrose-settings-changed', handleSettingsChange);
    };
  }, []);

  // Compose sub-hooks. Image preloading deliberately does NOT live here:
  // this hook only ever holds the ROOT map, and preloading must follow the
  // ACTIVE map (root or sub-hex) — the caller invokes useImagePreloading
  // with the active map and this hook's settingsVersion (windrose-1mc).
  useTilesetBuilder(app, mapData, setMapData, isLoading, settingsVersion);

  const { saveStatus, updateMapData, forceSave, markDeleted } =
    useDebouncedSave(app, mapId, setMapData);
  updateMapDataRef.current = updateMapData;

  return {
    mapData,
    isLoading,
    loadFailure,
    reload,
    saveStatus,
    updateMapData,
    forceSave,
    markDeleted,
    settingsVersion,
    getCachedImage,
  };
}

export { useMapData };
