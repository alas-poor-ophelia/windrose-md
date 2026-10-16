// useTileFlyouts.ts - Drawer spine flyout data: recent tiles (resolved against
// the available tilesets), starred tiles (published by the tile browser), and
// the flyout pick handler (select tile + arm tile placement).

import { useCallback, useMemo, useState } from 'preact/hooks';
import type { ToolId } from '#types/tools/tool.types';
import type { TilesetDef } from '#types/tiles/tile.types';
import type { FlyoutTile } from '../../components/panels/DrawerDock';
import { resolveTileEntry } from '../../assets/tilesetOperations';

interface UseTileFlyoutsOptions {
  availableTilesets: TilesetDef[];
  recentTiles: Array<{ tilesetId: string; tileId: string }>;
  handleTileSelect: (tilesetId: string, tileId: string) => void;
  setCurrentTool: (tool: ToolId) => void;
}

interface TileFlyouts {
  flyoutRecent: FlyoutTile[];
  starredFlyoutTiles: FlyoutTile[];
  setStarredFlyoutTiles: (tiles: FlyoutTile[]) => void;
  handleFlyoutSelect: (tilesetId: string, tileId: string) => void;
}

function useTileFlyouts({ availableTilesets, recentTiles, handleTileSelect, setCurrentTool }: UseTileFlyoutsOptions): TileFlyouts {
  const [starredFlyoutTiles, setStarredFlyoutTiles] = useState<FlyoutTile[]>([]);

  const flyoutRecent = useMemo((): FlyoutTile[] => {
    if (availableTilesets.length === 0) return [];
    return recentTiles
      .map(r => {
        const ts = availableTilesets.find(t => t.id === r.tilesetId);
        const tile = resolveTileEntry(ts, r.tileId);
        if (!tile || !ts) return null;
        return { tilesetId: ts.id, tileId: tile.id, filename: tile.filename, vaultPath: tile.vaultPath };
      })
      .filter((t): t is FlyoutTile => t != null)
      .slice(0, 10);
  }, [recentTiles, availableTilesets]);

  const handleFlyoutSelect = useCallback((tilesetId: string, tileId: string) => {
    handleTileSelect(tilesetId, tileId);
    setCurrentTool('tilePaint');
  }, [handleTileSelect, setCurrentTool]);

  return { flyoutRecent, starredFlyoutTiles, setStarredFlyoutTiles, handleFlyoutSelect };
}

export { useTileFlyouts };
export type { TileFlyouts };
