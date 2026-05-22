/**
 * useMapData.ts
 *
 * Hook for loading, saving, and managing map data.
 * Handles debounced autosave, background image preloading, and save status tracking.
 *
 * Features:
 * - Loads map data on mount (creates new map if not found)
 * - Debounced autosave (2 second delay)
 * - Force save for critical operations
 * - Background image preloading for hex maps
 * - Fog of war texture preloading
 * - Race condition prevention via version tracking
 */

// Type-only imports
import type { MapData, MapType } from '#types/core/map.types';
import type {
  SaveStatus,
  MapDataUpdater,
  UseMapDataResult,
  MapId,
  MapName,
} from '#types/hooks/mapData.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { loadMapData, saveMapData } from '../../persistence/fileOperations';
import { preloadImage, getCachedImage, clearUnusedTileImages } from '../../assets/imageOperations';
import { getEffectiveSettings, getTilesetFolders } from '../../core/settingsAccessor';
import { createTilesetFromTiles, probeFirstTileImage, scanTilesetFolder } from '../../assets/tilesetOperations';
import { getResolvedObjectTypes, hasImagePath } from '../../objects/objectTypeResolver';


/**
 * Hook for managing map data loading, saving, and state.
 *
 * @param mapId - Unique identifier for the map
 * @param mapName - Display name for the map (used when creating new maps)
 * @param mapType - Type of map ('grid' or 'hex')
 * @returns Map data management interface
 */
function useMapData(
  mapId: MapId,
  mapName: MapName = '',
  mapType: MapType = 'grid'
): UseMapDataResult {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('Saved');
  const app = useApp();
  const [pendingData, setPendingData] = useState<MapData | null>(null);
  const [backgroundImageReady, setBackgroundImageReady] = useState<boolean>(false);
  const [fowImageReady, setFowImageReady] = useState<boolean>(false);
  const [settingsVersion, setSettingsVersion] = useState<number>(0);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = useRef<number>(0);

  // Load map data on mount
  useEffect(() => {
    async function load(): Promise<void> {
      const data = await loadMapData(app, mapId, mapName, mapType);
      setMapData(data);
      setIsLoading(false);
    }
    void load();
  }, [mapId, mapName, mapType]);

  // Build tilesets from settings folders for hex maps
  const mapTypeRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Track mapType to know when map is loaded, but don't re-run on every mapData change
    if (mapData) mapTypeRef.current = mapData.mapType;
  }, [mapData?.mapType]);

  useEffect(() => {
    const currentMapType = mapTypeRef.current;
    if (currentMapType == null || currentMapType !== 'hex') return;

    const folders = getTilesetFolders().filter((f: string) => f.trim() !== '');
    if (folders.length === 0) return;

    // Build tilesets from configured folders (async to probe image dimensions)
    void (async () => {
      const newTilesets: import('#types/tiles/tile.types').TilesetDef[] = [];
      for (const folder of folders) {
        try {
          const parts = folder.split('/');
          const name = parts[parts.length - 1] || folder;

          // Scan once, then pass pre-scanned tiles to avoid double-scan
          const tiles = await scanTilesetFolder(app, folder);
          const dims = await probeFirstTileImage(app, tiles);
          const options = dims
            ? { tileWidth: dims.width, tileHeight: dims.height }
            : undefined;

          const tileset = createTilesetFromTiles(folder, name, tiles, options);
          if (tileset.tiles.length > 0) {
            newTilesets.push(tileset);
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[Windrose] Failed to scan tileset folder:', folder, e);
        }
      }

      if (newTilesets.length > 0) {
        // Evict cached images no longer referenced by any tileset,
        // but preserve background, fog-of-war, and object type images
        const activePaths = new Set<string>();
        for (const ts of newTilesets) {
          for (const t of ts.tiles) activePaths.add(t.vaultPath);
        }

        // Add non-tile image paths so they aren't evicted
        const currentData = mapData;
        if (currentData?.backgroundImage?.path != null && currentData.backgroundImage.path !== '') {
          activePaths.add(currentData.backgroundImage.path);
        }
        const effectiveSettings = getEffectiveSettings(currentData?.settings);
        if (effectiveSettings?.fogOfWarImage != null && effectiveSettings.fogOfWarImage !== '') {
          activePaths.add(effectiveSettings.fogOfWarImage);
        }
        const objectTypes = getResolvedObjectTypes(currentData?.mapType ?? 'hex', currentData?.objectSetId);
        for (const objType of objectTypes) {
          if (objType.imagePath != null && objType.imagePath !== '') activePaths.add(objType.imagePath);
        }

        clearUnusedTileImages(activePaths);

        setMapData((current: MapData | null) => {
          if (!current) return current;
          // Merge per-tileset user overrides into auto-built tilesets
          const overrides = current.tilesetOverrides;
          const mergedTilesets = newTilesets.map(ts => {
            const ov = overrides?.[ts.id];
            return ov != null ? { ...ts, ...ov } : ts;
          });
          return { ...current, tilesets: mergedTilesets };
        });
      }
    })();
  }, [isLoading, settingsVersion]);

  // Preload background image when map data loads
  useEffect(() => {
    if (mapData?.backgroundImage?.path != null && mapData.backgroundImage.path !== '') {
      setBackgroundImageReady(false);
      void preloadImage(app, mapData.backgroundImage.path).then((img) => {
        if (img) {
          setBackgroundImageReady(true);
        }
      });
    } else {
      setBackgroundImageReady(false);
    }
  }, [mapData?.backgroundImage?.path]);

  // Preload fog of war image when map loads or settings change
  useEffect(() => {
    if (!mapData) return;

    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowImagePath = effectiveSettings.fogOfWarImage;

    if (fowImagePath != null && fowImagePath !== '') {
      setFowImageReady(false);
      void preloadImage(app, fowImagePath).then((img) => {
        if (img) {
          setFowImageReady(true);
        }
      });
    } else {
      setFowImageReady(false);
    }
  }, [mapData?.settings]);

  // Preload custom object images when map loads or settings change
  useEffect(() => {
    if (!mapData) return;

    const objectTypes = getResolvedObjectTypes(mapData.mapType, mapData.objectSetId);
    const imageObjects = objectTypes.filter(hasImagePath);

    for (const objType of imageObjects) {
      if (objType.imagePath != null && objType.imagePath !== '') {
        void preloadImage(app, objType.imagePath);
      }
    }
  }, [mapData?.mapType, mapData?.objectSetId, settingsVersion]);

  // Preload tile images when tilesets are defined
  const [tileImagesReady, setTileImagesReady] = useState<boolean>(false);
  useEffect(() => {
    if (mapData?.tilesets == null || mapData.tilesets.length === 0) {
      setTileImagesReady(false);
      return;
    }

    setTileImagesReady(false);
    const promises: Promise<unknown>[] = [];
    for (const tileset of mapData.tilesets) {
      for (const tile of tileset.tiles) {
        if (tile.vaultPath) {
          promises.push(preloadImage(app, tile.vaultPath));
        }
      }
    }
    void Promise.all(promises).then(() => setTileImagesReady(true));
  }, [mapData?.tilesets]);

  // Listen for settings changes to trigger image preload
  useEffect(() => {
    const handleSettingsChange = (): void => {
      setSettingsVersion((prev: number) => prev + 1);
    };

    window.addEventListener('dmt-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('dmt-settings-changed', handleSettingsChange);
    };
  }, []);

  // Debounced save effect
  useEffect(() => {
    if (!pendingData) return undefined;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Increment version for this pending data
    const currentVersion = ++saveVersionRef.current;

    // Set new timer for 2 seconds
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(app, mapId, pendingData);

      // Only clear pendingData if no new changes came in during the async save
      if (saveVersionRef.current === currentVersion) {
        setSaveStatus(success ? 'Saved' : 'Save failed');
        setPendingData(null);
        saveTimerRef.current = null;
      } else {
        // New changes came in during save - they'll be saved by their own timer
        if (success) {
          setSaveStatus('Unsaved changes');
        }
      }
    }, 2000);

    // Cleanup function
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [pendingData, mapId]);

  // Update map data and trigger debounced save
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
  }, []);

  // Force immediate save
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
  }, [pendingData, mapId]);

  // Save on unmount if there's pending data
  useEffect(() => {
    return () => {
      if (pendingData && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Fire and forget save on unmount
        void saveMapData(app, mapId, pendingData);
      }
    };
  }, [pendingData, mapId]);

  return {
    mapData,
    isLoading,
    saveStatus,
    updateMapData,
    forceSave,
    backgroundImageReady,
    fowImageReady,
    tileImagesReady,
    getCachedImage,
  };
}

export { useMapData };