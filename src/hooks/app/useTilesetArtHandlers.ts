// useTilesetArtHandlers.ts - Tile drawer handlers that edit tileset rendering:
// per-map render overrides and the GLOBAL per-tileset art nudge / art scale
// (plugin settings, debounced per tileset), plus the unmount flush of pending
// art and tile-metadata saves.

import { useCallback, useEffect } from 'preact/hooks';
import type { App } from 'obsidian';
import type { MapData } from '#types/index';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { TilesetOverrides } from '#types/tiles/tile.types';
import { scheduleTilesetArtSave, flushTilesetArtSaves } from '../../persistence/tilesetArtSettings';
import { flushTileMetadataSave } from '../../persistence/tileMetadata';

interface TilesetArtHandlers {
  handleTilesetOverrideChange: (tilesetId: string, overrides: TilesetOverrides) => void;
  handleTilesetArtOffsetChange: (tilesetId: string, value: number | undefined) => void;
  handleTilesetArtScaleChange: (tilesetId: string, value: number | undefined) => void;
}

function useTilesetArtHandlers(app: App, updateMapData: MapDataUpdater): TilesetArtHandlers {
  // Persist a tileset's render overrides AND apply them to the live merged
  // tileset so changes (fitMode, stamp thresholds, terrain render mode) take
  // effect immediately without waiting for a tileset rebuild/reload.
  const handleTilesetOverrideChange = useCallback((tilesetId: string, overrides: TilesetOverrides) => {
    updateMapData((prev: MapData) => ({
      ...prev,
      tilesetOverrides: { ...prev.tilesetOverrides, [tilesetId]: overrides },
      tilesets: (prev.tilesets ?? []).map(ts => ts.id === tilesetId ? { ...ts, ...overrides } : ts),
    }));
  }, [updateMapData]);

  // Art nudge is GLOBAL per tileset (plugin settings), not a per-map override:
  // apply to the live merged tileset immediately, persist debounced — the
  // eventual saveSettings() fires windrose-settings-changed and a full tileset
  // rebuild, which a dragged slider must not storm per tick.
  const handleTilesetArtOffsetChange = useCallback((tilesetId: string, value: number | undefined) => {
    updateMapData((prev: MapData) => ({
      ...prev,
      tilesets: (prev.tilesets ?? []).map(ts => ts.id === tilesetId ? { ...ts, artOffsetY: value } : ts),
    }));
    // One debounce timer per tileset (STRUCT-A-03): nudging A then B inside
    // the window must persist both.
    scheduleTilesetArtSave(app, 'tilesetArtOffsets', tilesetId, value);
  }, [updateMapData, app]);

  // Art scale mirrors the art nudge exactly: GLOBAL per tileset, applied to
  // the live merged tileset immediately, persisted debounced.
  const handleTilesetArtScaleChange = useCallback((tilesetId: string, value: number | undefined) => {
    updateMapData((prev: MapData) => ({
      ...prev,
      tilesets: (prev.tilesets ?? []).map(ts => ts.id === tilesetId ? { ...ts, artScale: value } : ts),
    }));
    scheduleTilesetArtSave(app, 'tilesetArtScales', tilesetId, value);
  }, [updateMapData, app]);

  // Pending debounced writes (art nudge/scale, tile metadata) must not be lost
  // when this view closes inside the debounce window.
  useEffect(() => () => {
    flushTilesetArtSaves();
    void flushTileMetadataSave();
  }, []);

  return { handleTilesetOverrideChange, handleTilesetArtOffsetChange, handleTilesetArtScaleChange };
}

export { useTilesetArtHandlers };
export type { TilesetArtHandlers };
