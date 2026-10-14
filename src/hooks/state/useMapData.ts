import type { MapData, MapType } from '#types/core/map.types';
import type {
  UseMapDataResult,
  MapDataLoadFailure,
  MapId,
  MapName,
} from '#types/hooks/mapData.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { loadMapDataWithGeneration, MapDataUnreadableError, MapDeletedError, MapDataFileMissingError, MapSchemaError } from '../../persistence/fileOperations';
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
  // The load found the id tombstoned (see MapDeletedError).
  const [loadDeleted, setLoadDeleted] = useState(false);
  const [settingsVersion, setSettingsVersion] = useState(0);
  // Bumped by reload() to re-run the load effect after the data file has been
  // repaired underneath us (backup restore). Nothing else touches it.
  const [reloadNonce, setReloadNonce] = useState(0);
  const app = useApp();

  // Assigned below, after useDebouncedSave — the load effect needs the updater
  // to apply a restored journal entry through the normal save path.
  const applyRestoredRef = useRef<((data: MapData) => void) | null>(null);
  // This pane's save-writer id, used to owner-stamp a restored journal copy.
  const writerIdRef = useRef('');

  // Write generation this instance's tree is based on (see saveMapData's
  // stale-base guard). Set at load, advanced by useDebouncedSave on save.
  const baseGenRef = useRef(0);

  // Load map data on mount
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      let data: MapData;
      try {
        const loaded = await loadMapDataWithGeneration(app, mapId, mapName, mapType);
        data = loaded.data;
        baseGenRef.current = loaded.generation;
      } catch (error) {
        if (cancelled) return;
        if (error instanceof MapDeletedError) {
          // Deleted this session (by any mount): never a blank editable map
          // (DATA-02). The UI shows its "Map deleted" panel.
          setLoadDeleted(true);
          setIsLoading(false);
          return;
        }
        if (error instanceof MapDataFileMissingError) {
          // Store file absent: never a blank editable map whose first edit
          // would create a one-map store (DATA-08).
          setLoadFailure({ dataPath: error.dataPath, message: error.message, kind: 'missing' });
          setIsLoading(false);
          return;
        }
        // Unreadable data file: do NOT fall back to a blank map. Surface the
        // failure so the UI can block editing before anything overwrites it.
        console.error('[Windrose] Map load failed:', error);
        setLoadFailure({
          dataPath: error instanceof MapDataUnreadableError ? error.dataPath : getDataFilePath(),
          message: error instanceof Error ? error.message : String(error),
          // A schema refusal is a plugin-version problem, not a broken file.
          kind: error instanceof MapSchemaError ? 'schema' : 'unreadable',
        });
        setIsLoading(false);
        return;
      }

      if (cancelled) return;
      setMapData(data);
      setIsLoading(false);

      // Crash journal: offer to restore edits a previous session couldn't write.
      const restored = await resolveJournalOnLoad(app, mapId, data.name ?? mapName, undefined, writerIdRef.current === '' ? undefined : writerIdRef.current);
      if (cancelled || restored == null) return;
      applyRestoredRef.current?.(restored);
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
    setLoadDeleted(false);
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

  // Silent re-read for useDebouncedSave's adopt path (a sibling pane restored
  // a crash copy, or a cosmetic write was refused): no loading state, no
  // journal round. A failure leaves the pane as it is.
  const readStore = useCallback(async (): Promise<{ data: MapData; generation: number } | null> => {
    try {
      return await loadMapDataWithGeneration(app, mapId, mapName, mapType);
    } catch (e) {
      console.warn('[Windrose] Re-reading the map after a sibling save failed:', e);
      return null;
    }
  }, [app, mapId, mapName, mapType]);

  const { saveStatus, updateMapData, forceSave, markDeleted, mapDeleted: saveDeleted, staleConflict, acknowledgeStaleConflict, writerId, applyRestored } =
    useDebouncedSave(app, mapId, setMapData, baseGenRef, readStore);
  applyRestoredRef.current = applyRestored;
  writerIdRef.current = writerId;

  return {
    mapData,
    isLoading,
    loadFailure,
    mapDeleted: loadDeleted || saveDeleted,
    reload,
    saveStatus,
    updateMapData,
    forceSave,
    markDeleted,
    staleConflict,
    acknowledgeStaleConflict,
    settingsVersion,
    getCachedImage,
  };
}

export { useMapData };
