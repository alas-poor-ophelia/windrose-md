// useTileDrawerState.ts - Tile drawer UI state owned by the root map component:
// Tiles vs Objects pane (coupled to the active tool and feature flags), the
// Recent/Starred rail selection, per-map grid/list view modes, the wall-tool
// surface and drag id threaded between WallLayer and the drawer, and the
// bare-threshold placement mode.

import { useCallback, useEffect, useState } from 'preact/hooks';
import type { MapData } from '#types/index';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { ToolId } from '#types/tools/tool.types';
import type { WallToolSurface } from '#types/core/wallpath.types';
import type { WindroseFeature } from '#types/settings/settings.types';
import type { RailSelection } from '../../components/panels/TileAssetBrowser';
import { isToolIdEnabled } from '../../components/toolbars/ToolPalette';
import { isFeatureEnabled } from '../../core/featureFlags';
import { getTilesetFolders } from '../../core/settingsAccessor';

type DrawerPane = 'tiles' | 'objects';
type DrawerViewMode = 'grid' | 'list';

interface UseTileDrawerStateOptions {
  mapData: MapData | null;
  updateMapData: MapDataUpdater;
  currentTool: ToolId;
  setCurrentTool: (tool: ToolId) => void;
  featureFlags: Record<WindroseFeature, boolean>;
}

interface TileDrawerState {
  tilePane: DrawerPane;
  selectPane: (pane: DrawerPane) => void;
  tileRailSel: RailSelection;
  setTileRailSel: (sel: RailSelection) => void;
  tileViewMode: DrawerViewMode;
  setTileViewMode: (mode: DrawerViewMode) => void;
  objectViewMode: DrawerViewMode;
  setObjectViewMode: (mode: DrawerViewMode) => void;
  draggingWallId: string | null;
  setDraggingWallId: (id: string | null) => void;
  wallSurface: WallToolSurface | null;
  setWallSurface: (surface: WallToolSurface | null) => void;
  bareThresholdArmed: boolean;
  setBareThresholdArmed: (armed: boolean) => void;
  handleThreshold: () => void;
  blockTilesetConfigOpen: boolean;
  setBlockTilesetConfigOpen: (open: boolean) => void;
}

function useTileDrawerState({ mapData, updateMapData, currentTool, setCurrentTool, featureFlags }: UseTileDrawerStateOptions): TileDrawerState {
  // Tile drawer pane: Tiles vs Objects (Objects sidebar folded into the drawer).
  // Open on Objects when this vault has no tile packs configured — the Tiles
  // pane's empty state is a dead end for anyone who has not imported anything.
  // Read the FOLDER SETTINGS, not mapData.tilesets: settings are available
  // synchronously at mount, whereas tilesets are attached later by the async
  // tileset builder, so keying off the map data opened every tiled vault on
  // Objects (the builder had not run yet).
  const [tilePane, setTilePane] = useState<DrawerPane>(
    () => (isFeatureEnabled('tiles') && getTilesetFolders().some(f => f.trim() !== '')
      ? 'tiles'
      : 'objects')
  );
  // Selecting a pane couples to the active tool: Objects → addObject, Tiles → tilePaint.
  // Forcing tilePaint on the Tiles tab avoids ping-pong with the coupling effect below.
  const selectPane = useCallback((p: DrawerPane): void => {
    setTilePane(p);
    setCurrentTool(p === 'objects' ? 'addObject' : 'tilePaint');
  }, [setCurrentTool]);
  // Coupling: picking the Object tool elsewhere (e.g. an object grid) flips the drawer to Objects.
  useEffect(() => {
    if (currentTool === 'addObject') setTilePane('objects');
  }, [currentTool]);
  // Feature gating: disabling tiles forces the drawer onto the Objects pane.
  useEffect(() => {
    if (!featureFlags.tiles) setTilePane('objects');
  }, [featureFlags.tiles]);
  // Feature gating: if the active tool's feature gets disabled, fall back to
  // select so a hidden tool can't stay armed (depends on stable flags record;
  // setCurrentTool('select') settles in one pass).
  useEffect(() => {
    if (!isToolIdEnabled(currentTool, featureFlags)) setCurrentTool('select');
  }, [currentTool, featureFlags, setCurrentTool]);
  // Category-rail / view selection, owned here so the Recent/Starred view-filters
  // can live on the drawer ribbon while the rail (categories) lives in the browser.
  const [tileRailSel, setTileRailSel] = useState<RailSelection>('all');
  // Grid/list tile view, owned here so it survives the Objects-pane swap (which
  // unmounts the browser) and persists per map via mapData.
  const tileViewMode = mapData?.tileViewMode ?? 'grid';
  const setTileViewMode = useCallback((mode: DrawerViewMode): void => {
    updateMapData((prev: MapData) => ({ ...prev, tileViewMode: mode }));
  }, [updateMapData]);
  // Objects pane grid/list view — its own per-map field, independent of tiles.
  const objectViewMode = mapData?.objectViewMode ?? 'grid';
  const setObjectViewMode = useCallback((mode: DrawerViewMode): void => {
    updateMapData((prev: MapData) => ({ ...prev, objectViewMode: mode }));
  }, [updateMapData]);
  // Id of the wall being edit-dragged: threaded to the renderer so the static
  // raster drops it (the WallLayer overlay draws it live during the drag).
  const [draggingWallId, setDraggingWallId] = useState<string | null>(null);
  // Wall-tool control surface published by WallLayer and consumed by the tile
  // drawer footer, which renders the tool's draw/edit controls.
  const [wallSurface, setWallSurface] = useState<WallToolSurface | null>(null);
  // Bare-threshold placement mode (§5.3 primary trigger): the built-in Threshold
  // ribbon entry arms NO asset, so WallLayer cuts empty 1-cell gaps. It is a
  // sub-mode of portal arming (the entry only surfaces on an opening-form tile,
  // so the wall tool is already active). Toggled by the ribbon; disarmed on tool
  // switch, on Escape (via WallLayer), and when the opening asset is un-armed.
  const [bareThresholdArmed, setBareThresholdArmed] = useState(false);
  const handleThreshold = useCallback((): void => {
    setBareThresholdArmed(prev => !prev);
    setCurrentTool('wall');
  }, [setCurrentTool]);
  // Block mode hides the tile browser's internal header, so the tileset-config
  // toggle is hoisted into the compact drawer head (windrose-48j).
  const [blockTilesetConfigOpen, setBlockTilesetConfigOpen] = useState(false);

  return {
    tilePane, selectPane,
    tileRailSel, setTileRailSel,
    tileViewMode, setTileViewMode,
    objectViewMode, setObjectViewMode,
    draggingWallId, setDraggingWallId,
    wallSurface, setWallSurface,
    bareThresholdArmed, setBareThresholdArmed, handleThreshold,
    blockTilesetConfigOpen, setBlockTilesetConfigOpen,
  };
}

export { useTileDrawerState };
export type { TileDrawerState, DrawerPane, DrawerViewMode };
