import type { MapData } from '#types/core/map.types';
import type { TilesetDef } from '#types/tiles/tile.types';
import type { App } from 'obsidian';

import { useEffect, useRef } from 'preact/hooks';
import { getTilesetFolders, getEffectiveSettings } from '../../core/settingsAccessor';
import { createTilesetFromTiles, probeFirstTileImage, scanTilesetFolder } from '../../assets/tilesetOperations';
import { clearUnusedTileImages } from '../../assets/imageOperations';
import { getResolvedObjectTypes } from '../../objects/objectTypeResolver';

type MapDataSetter = (value: MapData | null | ((prev: MapData | null) => MapData | null)) => void;

function useTilesetBuilder(
  app: App,
  mapData: MapData | null,
  setMapData: MapDataSetter,
  isLoading: boolean,
  settingsVersion: number
): void {
  const mapTypeRef = useRef<string | undefined>(undefined);
  const mapDataRef = useRef<MapData | null>(null);

  useEffect(() => {
    mapDataRef.current = mapData;
    if (mapData) mapTypeRef.current = mapData.mapType;
  }, [mapData]);

  useEffect(() => {
    const currentMapType = mapTypeRef.current;
    if (currentMapType == null || currentMapType !== 'hex') return;

    const folders = getTilesetFolders().filter((f: string) => f.trim() !== '');
    if (folders.length === 0) return;

    void (async () => {
      const newTilesets: TilesetDef[] = [];
      for (const folder of folders) {
        try {
          const parts = folder.split('/');
          const name = parts[parts.length - 1] || folder;

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
        const activePaths = new Set<string>();
        for (const ts of newTilesets) {
          for (const t of ts.tiles) activePaths.add(t.vaultPath);
        }

        // Read latest mapData via ref instead of stale closure
        const currentData = mapDataRef.current;
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
          const overrides = current.tilesetOverrides;
          const mergedTilesets = newTilesets.map(ts => {
            const ov = overrides?.[ts.id];
            return ov != null ? { ...ts, ...ov } : ts;
          });
          return { ...current, tilesets: mergedTilesets };
        });
      }
    })();
  }, [isLoading, settingsVersion, app, setMapData]);
}

export { useTilesetBuilder };
