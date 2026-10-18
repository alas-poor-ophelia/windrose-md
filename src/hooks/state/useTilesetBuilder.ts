import type { MapData } from '#types/core/map.types';
import type { App } from 'obsidian';

import { useEffect, useRef } from 'preact/hooks';
import { getTilesetFolders, getEffectiveSettings, getSettings } from '../../core/settingsAccessor';
import { buildTilesetsFromSettings, applyBuiltTilesets } from '../../assets/tilesetOperations';
import { clearUnusedTileImages } from '../../assets/imageOperations';
import { getResolvedObjectTypes } from '../../objects/objectTypeResolver';

type MapDataSetter = (value: MapData | null | ((prev: MapData | null) => MapData | null)) => void;

/** Cached image paths that must survive a sweep regardless of which tilesets
 *  are registered: the background, the fog texture, and every object-type icon.
 *  Shared by both sweep sites so clearing the registry (every folder removed)
 *  cannot evict them. */
function collectAncillaryPaths(current: MapData | null): Set<string> {
  const paths = new Set<string>();
  if (current?.backgroundImage?.path != null && current.backgroundImage.path !== '') {
    paths.add(current.backgroundImage.path);
  }
  const effectiveSettings = getEffectiveSettings(current?.settings);
  if (effectiveSettings?.fogOfWarImage != null && effectiveSettings.fogOfWarImage !== '') {
    paths.add(effectiveSettings.fogOfWarImage);
  }
  const objectTypes = getResolvedObjectTypes(current?.mapType ?? 'hex', current?.objectSetId);
  for (const objType of objectTypes) {
    if (objType.imagePath != null && objType.imagePath !== '') paths.add(objType.imagePath);
  }
  return paths;
}

function useTilesetBuilder(
  app: App,
  mapData: MapData | null,
  setMapData: MapDataSetter,
  isLoading: boolean,
  settingsVersion: number,
  /** Bumped to force a rescan (an installed store/journal tree the live registry could not fill). */
  rebuildRequest = 0
): void {
  const mapTypeRef = useRef<string | undefined>(undefined);
  const mapDataRef = useRef<MapData | null>(null);

  useEffect(() => {
    mapDataRef.current = mapData;
    if (mapData) mapTypeRef.current = mapData.mapType;
  }, [mapData]);

  useEffect(() => {
    const currentMapType = mapData?.mapType ?? mapTypeRef.current;
    if (currentMapType == null) return;

    const folders = getTilesetFolders().filter((f: string) => f.trim() !== '');

    // Every tileset folder removed → clear the registry. This MUST write rather
    // than return early: tilesets live on MAP DATA, not settings, so returning
    // left a removed pack registered on the map forever — still in the drawer,
    // still persisted through reloads. Placed tiles are deliberately untouched;
    // unregistering a set must never delete someone's work.
    if (folders.length === 0) {
      clearUnusedTileImages(collectAncillaryPaths(mapDataRef.current));
      setMapData((current: MapData | null) => {
        if (current == null || (current.tilesets?.length ?? 0) === 0) return current;
        return { ...current, tilesets: [] };
      });
      return;
    }

    void (async () => {
      const { tilesets: newTilesets, scanFailed } = await buildTilesetsFromSettings(app, getSettings());

      // An empty result is a legitimate outcome — it is how the last remaining
      // pack gets unregistered — so this writes rather than bailing on `length
      // > 0`. The one refusal is no positive evidence AND something threw:
      // treating a failed scan as "no tiles" would wipe the registry on a blip.
      // A partial result still writes (the folders that did scan are
      // authoritative), so a persistently broken folder can never wedge the
      // registry into permanent staleness.
      if (newTilesets.length === 0 && scanFailed) return;

      // Read latest mapData via ref instead of stale closure
      const activePaths = collectAncillaryPaths(mapDataRef.current);
      for (const ts of newTilesets) {
        for (const t of ts.tiles) activePaths.add(t.vaultPath);
      }

      clearUnusedTileImages(activePaths);

      setMapData((current: MapData | null) => {
        if (!current) return current;
        return applyBuiltTilesets(current, newTilesets, getSettings());
      });
    })();
  }, [isLoading, settingsVersion, rebuildRequest, app, setMapData, mapData?.mapType]);
}

export { useTilesetBuilder };
