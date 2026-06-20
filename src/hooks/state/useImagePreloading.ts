import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';

import { useEffect, useState } from 'preact/hooks';
import { preloadImage, pinImage, getCachedImage } from '../../assets/imageOperations';
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
    const bgPath = mapData?.backgroundImage?.path;
    if (bgPath != null && bgPath !== '') {
      setBackgroundImageReady(false);
      void preloadImage(app, bgPath).then((img) => {
        if (img) {
          pinImage(bgPath);
          setBackgroundImageReady(true);
        }
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
        if (img) {
          pinImage(fowImagePath);
          setFowImageReady(true);
        }
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

    // Only preload tiles actually placed on the map, not the entire catalog.
    // The tile browser loads thumbnails on-demand via CSS background-image.
    const placedPaths = new Set<string>();
    for (const layer of mapData.layers) {
      if (!layer.tiles) continue;
      for (const tile of layer.tiles) {
        const tsId = tile.tilesetId;
        const tId = tile.tileId;
        const ts = mapData.tilesets.find(t => t.id === tsId);
        const entry = ts?.tiles.find(t => t.id === tId);
        if (entry?.vaultPath != null && entry.vaultPath !== '') placedPaths.add(entry.vaultPath);
      }
    }

    if (placedPaths.size === 0) {
      setTileImagesReady(true);
      return;
    }

    // Skip work if all placed tiles are already cached
    let allCached = true;
    for (const path of placedPaths) {
      if (!getCachedImage(path)) {
        allCached = false;
        break;
      }
    }
    if (allCached) {
      setTileImagesReady(true);
      return;
    }

    setTileImagesReady(false);
    const promises: Promise<unknown>[] = [];
    for (const path of placedPaths) {
      promises.push(preloadImage(app, path));
    }
    void Promise.all(promises).then(() => setTileImagesReady(true));
  }, [app, mapData?.tilesets, mapData?.layers]);

  return { backgroundImageReady, fowImageReady, tileImagesReady };
}

export { useImagePreloading };
