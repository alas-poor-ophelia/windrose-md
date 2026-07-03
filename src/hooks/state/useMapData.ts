import type { MapData, MapType } from '#types/core/map.types';
import type {
  UseMapDataResult,
  MapId,
  MapName,
} from '#types/hooks/mapData.types';

import { useEffect, useState } from 'preact/hooks';
import { useApp } from '../../context/AppContext';
import { loadMapData } from '../../persistence/fileOperations';
import { getCachedImage } from '../../assets/imageOperations';
import { useDebouncedSave } from './useDebouncedSave';
import { useImagePreloading } from './useImagePreloading';
import { useTilesetBuilder } from './useTilesetBuilder';

function useMapData(
  mapId: MapId,
  mapName: MapName = '',
  mapType: MapType = 'grid'
): UseMapDataResult {
  const [mapData, setMapData] = useState<MapData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsVersion, setSettingsVersion] = useState(0);
  const app = useApp();

  // Load map data on mount
  useEffect(() => {
    async function load(): Promise<void> {
      const data = await loadMapData(app, mapId, mapName, mapType);
      setMapData(data);
      setIsLoading(false);
    }
    void load();
  }, [app, mapId, mapName, mapType]);

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

  // Compose sub-hooks
  useTilesetBuilder(app, mapData, setMapData, isLoading, settingsVersion);

  const { backgroundImageReady, fowImageReady, tileImagesReady } =
    useImagePreloading(app, mapData, settingsVersion);

  const { saveStatus, updateMapData, forceSave, markDeleted } =
    useDebouncedSave(app, mapId, setMapData);

  return {
    mapData,
    isLoading,
    saveStatus,
    updateMapData,
    forceSave,
    markDeleted,
    backgroundImageReady,
    fowImageReady,
    tileImagesReady,
    getCachedImage,
  };
}

export { useMapData };
