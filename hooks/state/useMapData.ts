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
import type { PluginSettings } from '#types/settings/settings.types';
import type {
  SaveStatus,
  MapDataUpdater,
  UseMapDataResult,
  MapId,
  MapName,
} from '#types/hooks/mapData.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { loadMapData, saveMapData } = await requireModuleByName("fileOperations.ts") as {
  loadMapData: (mapId: string, mapName: string, mapType: MapType) => Promise<MapData>;
  saveMapData: (mapId: string, mapData: MapData) => Promise<boolean>;
};

const { preloadImage, getCachedImage } = await requireModuleByName("imageOperations.ts") as {
  preloadImage: (path: string) => Promise<HTMLImageElement | null>;
  getCachedImage: (path: string) => HTMLImageElement | null;
};

const { getEffectiveSettings, getTilesetFolders } = await requireModuleByName("settingsAccessor.ts") as {
  getEffectiveSettings: (mapSettings: MapData['settings']) => PluginSettings;
  getTilesetFolders: () => string[];
};

const { createTileset, probeFirstTileImage, scanTilesetFolder } = await requireModuleByName("tilesetOperations.ts") as {
  createTileset: (folderPath: string, name: string, options?: Record<string, number>) => import('#types/tiles/tile.types').TilesetDef;
  probeFirstTileImage: (tiles: import('#types/tiles/tile.types').TileEntry[]) => Promise<{ width: number; height: number } | null>;
  scanTilesetFolder: (folderPath: string) => import('#types/tiles/tile.types').TileEntry[];
};

const { getResolvedObjectTypes, hasImagePath } = await requireModuleByName("objectTypeResolver.ts") as {
  getResolvedObjectTypes: (mapType: MapType) => Array<{ id: string; imagePath?: string }>;
  hasImagePath: (obj: { imagePath?: string }) => boolean;
};

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
  const [mapData, setMapData] = dc.useState<MapData | null>(null);
  const [isLoading, setIsLoading] = dc.useState<boolean>(true);
  const [saveStatus, setSaveStatus] = dc.useState<SaveStatus>('Saved');
  const [pendingData, setPendingData] = dc.useState<MapData | null>(null);
  const [backgroundImageReady, setBackgroundImageReady] = dc.useState<boolean>(false);
  const [fowImageReady, setFowImageReady] = dc.useState<boolean>(false);
  const [settingsVersion, setSettingsVersion] = dc.useState<number>(0);
  const saveTimerRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveVersionRef = dc.useRef<number>(0);

  // Load map data on mount
  dc.useEffect(() => {
    async function load(): Promise<void> {
      const data = await loadMapData(mapId, mapName, mapType);
      setMapData(data);
      setIsLoading(false);
    }
    load();
  }, [mapId, mapName, mapType]);

  // Build tilesets from settings folders for hex maps
  const mapTypeRef = dc.useRef<string | undefined>(undefined);
  dc.useEffect(() => {
    // Track mapType to know when map is loaded, but don't re-run on every mapData change
    if (mapData) mapTypeRef.current = mapData.mapType;
  }, [mapData?.mapType]);

  dc.useEffect(() => {
    const currentMapType = mapTypeRef.current;
    if (!currentMapType || currentMapType !== 'hex') return;

    const folders = getTilesetFolders().filter((f: string) => f.trim());
    if (folders.length === 0) return;

    // Build tilesets from configured folders (async to probe image dimensions)
    (async () => {
      const newTilesets: import('#types/tiles/tile.types').TilesetDef[] = [];
      for (const folder of folders) {
        try {
          const parts = folder.split('/');
          const name = parts[parts.length - 1] || folder;

          // Probe actual image dimensions from the first tile
          const tiles = scanTilesetFolder(folder);
          const dims = await probeFirstTileImage(tiles);
          const options = dims ? { tileWidth: dims.width, tileHeight: dims.height } : undefined;

          const tileset = createTileset(folder, name, options);
          if (tileset.tiles.length > 0) {
            newTilesets.push(tileset);
          }
        } catch (e) {
          console.warn('[Windrose] Failed to scan tileset folder:', folder, e);
        }
      }

      if (newTilesets.length > 0) {
        setMapData((current: MapData | null) => {
          if (!current) return current;
          return { ...current, tilesets: newTilesets };
        });
      }
    })();
  }, [isLoading, settingsVersion]);

  // Preload background image when map data loads
  dc.useEffect(() => {
    if (mapData?.backgroundImage?.path) {
      setBackgroundImageReady(false);
      preloadImage(mapData.backgroundImage.path).then((img) => {
        if (img) {
          setBackgroundImageReady(true);
        }
      });
    } else {
      setBackgroundImageReady(false);
    }
  }, [mapData?.backgroundImage?.path]);

  // Preload fog of war image when map loads or settings change
  dc.useEffect(() => {
    if (!mapData) return;

    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowImagePath = effectiveSettings.fogOfWarImage;

    if (fowImagePath) {
      setFowImageReady(false);
      preloadImage(fowImagePath).then((img) => {
        if (img) {
          setFowImageReady(true);
        }
      });
    } else {
      setFowImageReady(false);
    }
  }, [mapData?.settings]);

  // Preload custom object images when map loads or settings change
  dc.useEffect(() => {
    if (!mapData) return;

    const objectTypes = getResolvedObjectTypes(mapData.mapType, mapData.objectSetId);
    const imageObjects = objectTypes.filter(hasImagePath);

    for (const objType of imageObjects) {
      if (objType.imagePath) {
        preloadImage(objType.imagePath);
      }
    }
  }, [mapData?.mapType, mapData?.objectSetId, settingsVersion]);

  // Preload tile images when tilesets are defined
  const [tileImagesReady, setTileImagesReady] = dc.useState<boolean>(false);
  dc.useEffect(() => {
    if (!mapData?.tilesets?.length) {
      setTileImagesReady(false);
      return;
    }

    setTileImagesReady(false);
    const promises: Promise<unknown>[] = [];
    for (const tileset of mapData.tilesets) {
      for (const tile of tileset.tiles) {
        if (tile.vaultPath) {
          promises.push(preloadImage(tile.vaultPath));
        }
      }
    }
    Promise.all(promises).then(() => setTileImagesReady(true));
  }, [mapData?.tilesets]);

  // Listen for settings changes to trigger image preload
  dc.useEffect(() => {
    const handleSettingsChange = (): void => {
      setSettingsVersion((prev: number) => prev + 1);
    };

    window.addEventListener('dmt-settings-changed', handleSettingsChange);

    return () => {
      window.removeEventListener('dmt-settings-changed', handleSettingsChange);
    };
  }, []);

  // Debounced save effect
  dc.useEffect(() => {
    if (!pendingData) return;

    // Clear existing timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    // Increment version for this pending data
    const currentVersion = ++saveVersionRef.current;

    // Set new timer for 2 seconds
    saveTimerRef.current = setTimeout(async () => {
      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);

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
  const updateMapData: MapDataUpdater = dc.useCallback((updaterOrData) => {
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
  const forceSave = dc.useCallback(async (): Promise<void> => {
    if (pendingData) {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      const versionAtSaveStart = saveVersionRef.current;

      setSaveStatus('Saving...');
      const success = await saveMapData(mapId, pendingData);

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
  dc.useEffect(() => {
    return () => {
      if (pendingData && saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        // Fire and forget save on unmount
        saveMapData(mapId, pendingData);
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

return { useMapData };
