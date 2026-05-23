import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';

import { useEffect, useState } from 'preact/hooks';
import { preloadImage } from '../../assets/imageOperations';
import { getEffectiveSettings } from '../../core/settingsAccessor';
import { getResolvedObjectTypes, hasImagePath } from '../../objects/objectTypeResolver';

interface UseImagePreloadingResult {
  backgroundImageReady: boolean;
  fowImageReady: boolean;
  tileImagesReady: boolean;
}

function useImagePreloading(
  app: App,
  mapData: MapData | null,
  settingsVersion: number
): UseImagePreloadingResult {
  const [backgroundImageReady, setBackgroundImageReady] = useState(false);
  const [fowImageReady, setFowImageReady] = useState(false);
  const [tileImagesReady, setTileImagesReady] = useState(false);

  useEffect(() => {
    if (mapData?.backgroundImage?.path != null && mapData.backgroundImage.path !== '') {
      setBackgroundImageReady(false);
      void preloadImage(app, mapData.backgroundImage.path).then((img) => {
        if (img) setBackgroundImageReady(true);
      });
    } else {
      setBackgroundImageReady(false);
    }
  }, [app, mapData?.backgroundImage?.path]);

  useEffect(() => {
    if (!mapData) return;

    const effectiveSettings = getEffectiveSettings(mapData.settings);
    const fowImagePath = effectiveSettings.fogOfWarImage;

    if (fowImagePath != null && fowImagePath !== '') {
      setFowImageReady(false);
      void preloadImage(app, fowImagePath).then((img) => {
        if (img) setFowImageReady(true);
      });
    } else {
      setFowImageReady(false);
    }
  }, [app, mapData?.settings]);

  useEffect(() => {
    if (!mapData) return;

    const objectTypes = getResolvedObjectTypes(mapData.mapType, mapData.objectSetId);
    const imageObjects = objectTypes.filter(hasImagePath);

    for (const objType of imageObjects) {
      if (objType.imagePath != null && objType.imagePath !== '') {
        void preloadImage(app, objType.imagePath);
      }
    }
  }, [app, mapData?.mapType, mapData?.objectSetId, settingsVersion]);

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
  }, [app, mapData?.tilesets]);

  return { backgroundImageReady, fowImageReady, tileImagesReady };
}

export { useImagePreloading };
