import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';

import { useEffect, useRef, useState } from 'preact/hooks';
import { preloadImage, pinImage, unpinImage, getCachedImage } from '../../assets/imageOperations';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { collectWallPathImagePaths } from '../../geometry/renderers/wallPathRenderer';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { getEffectiveSettings } from '../../core/settingsAccessor';
import { getResolvedObjectTypes, hasImagePath } from '../../objects/objectTypeResolver';

interface UseImagePreloadingResult {
  backgroundImageReady: boolean;
  fowImageReady: boolean;
  tileImagesReady: boolean;
}

/**
 * Every image path a map's render actually needs: tile art placed on layers,
 * wall-path strips (+ end caps), terrain-stroke textures. Pure collection —
 * shared by the preloading hook and the pre-dive prewarm.
 */
function collectPlacedImagePaths(mapData: MapData): Set<string> {
  const placedPaths = new Set<string>();
  if (mapData.tilesets == null || mapData.tilesets.length === 0) return placedPaths;
  for (const layer of mapData.layers) {
    if (layer.tiles) {
      for (const tile of layer.tiles) {
        const ts = mapData.tilesets.find(t => t.id === tile.tilesetId);
        const entry = resolveTileEntry(ts, tile.tileId);
        if (entry?.vaultPath != null && entry.vaultPath !== '') placedPaths.add(entry.vaultPath);
      }
    }
    // Wall path strips + their end caps are render-time images too.
    if (layer.wallPaths != null && layer.wallPaths.length > 0) {
      for (const p of collectWallPathImagePaths(layer.wallPaths, mapData.tilesets, getTileMetadataForRender())) {
        placedPaths.add(p);
      }
    }
    // Terrain brush strokes reference region textures like placed tiles.
    if (layer.terrainStrokes != null && layer.terrainStrokes.length > 0) {
      for (const s of layer.terrainStrokes) {
        const ts = mapData.tilesets.find(t => t.id === s.tilesetId);
        const entry = resolveTileEntry(ts, s.tileId);
        if (entry?.vaultPath != null && entry.vaultPath !== '') placedPaths.add(entry.vaultPath);
      }
    }
  }
  return placedPaths;
}

/**
 * Fire-and-forget asset warm-up for a map that is ABOUT to render (e.g. the
 * target child of a seamless dive, warmed while the zoom is still
 * approaching the ceiling — windrose-1mc: cold child art painted as holes).
 * preloadImage dedupes in-flight loads and no-ops on cached paths, so
 * calling this repeatedly is cheap.
 */
function prewarmMapAssets(app: App, mapData: MapData): void {
  const bgPath = mapData.backgroundImage?.path;
  if (bgPath != null && bgPath !== '') void preloadImage(app, bgPath);
  const fowImagePath = getEffectiveSettings(mapData.settings).fogOfWarImage;
  if (fowImagePath != null && fowImagePath !== '') void preloadImage(app, fowImagePath);
  for (const path of collectPlacedImagePaths(mapData)) {
    if (!getCachedImage(path)) void preloadImage(app, path);
  }
}

function useImagePreloading(
  app: App,
  mapData: MapData | null,
  settingsVersion: number
): UseImagePreloadingResult {
  const [backgroundImageReady, setBackgroundImageReady] = useState(false);
  const [fowImageReady, setFowImageReady] = useState(false);
  const [tileImagesReady, setTileImagesReady] = useState(false);

  // Background and fog images are pinned for as long as this map uses them and
  // unpinned in cleanup (path change or unmount) so they can be evicted (MEM-04).
  useEffect(() => {
    const bgPath = mapData?.backgroundImage?.path;
    if (bgPath != null && bgPath !== '') {
      let cancelled = false;
      setBackgroundImageReady(false);
      pinImage(bgPath);
      void preloadImage(app, bgPath).then((img) => {
        if (img && !cancelled) setBackgroundImageReady(true);
      });
      return () => {
        cancelled = true;
        unpinImage(bgPath);
      };
    }
    setBackgroundImageReady(false);
    return undefined;
  }, [app, mapData?.backgroundImage?.path]);

  // Narrow effect inputs (honest deps): the effects below key on these fields,
  // not on the whole mapData object, which changes on every edit.
  const hasMapData = mapData != null;
  const mapSettings = mapData?.settings;
  const mapType = mapData?.mapType;
  const objectSetId = mapData?.objectSetId;
  const tilesets = mapData?.tilesets;
  const layers = mapData?.layers;
  // Latest-ref: collectPlacedImagePaths needs the whole map, but only a
  // tilesets/layers change should re-run the tile preload.
  const mapDataRef = useRef(mapData);
  mapDataRef.current = mapData;

  useEffect(() => {
    if (!hasMapData) return;

    const effectiveSettings = getEffectiveSettings(mapSettings);
    const fowImagePath = effectiveSettings.fogOfWarImage;

    if (fowImagePath != null && fowImagePath !== '') {
      let cancelled = false;
      setFowImageReady(false);
      pinImage(fowImagePath);
      void preloadImage(app, fowImagePath).then((img) => {
        if (img && !cancelled) setFowImageReady(true);
      });
      return () => {
        cancelled = true;
        unpinImage(fowImagePath);
      };
    }
    setFowImageReady(false);
    return undefined;
  }, [app, hasMapData, mapSettings]);

  useEffect(() => {
    if (!hasMapData) return;

    const objectTypes = getResolvedObjectTypes(mapType, objectSetId);
    const iconPaths: string[] = [];
    for (const objType of objectTypes.filter(hasImagePath)) {
      if (objType.imagePath != null && objType.imagePath !== '') iconPaths.push(objType.imagePath);
    }

    // Pinned while this map uses them (MEM-11): another mount's tileset-rebuild
    // sweep only knows ITS OWN object set and would otherwise evict these.
    for (const path of iconPaths) {
      pinImage(path);
      void preloadImage(app, path);
    }
    return () => { for (const path of iconPaths) unpinImage(path); };
  }, [app, hasMapData, mapType, objectSetId, settingsVersion]);

  useEffect(() => {
    const currentMap = mapDataRef.current;
    if (currentMap == null || tilesets == null || tilesets.length === 0) {
      setTileImagesReady(false);
      return;
    }

    // Only preload tiles actually placed on the map, not the entire catalog.
    // The tile browser loads thumbnails on-demand via CSS background-image.
    const placedPaths = collectPlacedImagePaths(currentMap);

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
  }, [app, tilesets, layers]);

  return { backgroundImageReady, fowImageReady, tileImagesReady };
}

export { useImagePreloading, prewarmMapAssets };
