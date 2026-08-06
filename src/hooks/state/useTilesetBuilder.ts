import type { MapData } from '#types/core/map.types';
import type { TilesetDef } from '#types/tiles/tile.types';
import type { App } from 'obsidian';

import { useEffect, useRef } from 'preact/hooks';
import { getTilesetFolders, getEffectiveSettings, getSettings } from '../../core/settingsAccessor';
import { createTilesetFromTiles, probeFirstTileImage, scanTilesetFolder } from '../../assets/tilesetOperations';
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
  settingsVersion: number
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

    // Installed content packs store the human-readable pack name; the folder
    // itself is named by pack id (a hash for Dungeondraft packs).
    const installedPacks = getSettings().installedContentPacks ?? [];

    void (async () => {
      const newTilesets: TilesetDef[] = [];
      let scanFailed = false;
      for (const folder of folders) {
        try {
          const parts = folder.split('/');
          const packName = installedPacks.find(p => p.vaultPath === folder)?.name;
          const name = packName ?? (parts[parts.length - 1] || folder);

          const tiles = await scanTilesetFolder(app, folder);
          const dims = await probeFirstTileImage(app, tiles);
          const options = dims
            ? {
                tileWidth: dims.width,
                tileHeight: dims.height,
                artOrientation: dims.artOrientation,
                hexWidth: dims.hexWidth,
                hexHeight: dims.hexHeight,
                overflowTop: dims.overflowTop,
              }
            : undefined;

          const tileset = createTilesetFromTiles(folder, name, tiles, options);
          if (tileset.tiles.length > 0) {
            newTilesets.push(tileset);
          }
        } catch (e) {
          scanFailed = true;
          console.warn('[Windrose] Failed to scan tileset folder:', folder, e);
        }
      }

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
        // Nothing registered and nothing to register: return the same object so
        // a repeat rebuild does not hand every consumer a fresh mapData.
        if (newTilesets.length === 0 && (current.tilesets?.length ?? 0) === 0) return current;
        const overrides = current.tilesetOverrides;
        // Art nudges/scales are GLOBAL (plugin settings), not per-map
        // overrides — one adjustment seats the set identically on every map.
        const artOffsets = getSettings().tilesetArtOffsets ?? {};
        const artScales = getSettings().tilesetArtScales ?? {};
        const mergedTilesets = newTilesets.map(ts => {
          const ov = overrides?.[ts.id];
          let merged = ov != null ? { ...ts, ...ov } : ts;
          const nudge = artOffsets[ts.id];
          if (nudge != null) merged = { ...merged, artOffsetY: nudge };
          const scale = artScales[ts.id];
          if (scale != null) merged = { ...merged, artScale: scale };
          return merged;
        });
        return { ...current, tilesets: mergedTilesets };
      });
    })();
  }, [isLoading, settingsVersion, app, setMapData, mapData?.mapType]);
}

export { useTilesetBuilder };
