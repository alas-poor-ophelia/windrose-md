// DungeonMapTracker.tsx - Main component with undo/redo, objects, text labels, and color support

import type { VNode } from 'preact';
import type {
  MapData,
  MapType,
} from '#types/index';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { ResolvedTheme } from '#types/settings/settings.types';
import type { ToolId } from '#types/tools/tool.types';
import type { Cell } from '#types/core/cell.types';
import type { TilesetOverrides } from '#types/tiles/tile.types';
import type { CustomColor } from '#types/core/common.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useMapData } from './hooks/state/useMapData';
import { useLayerHistory } from './hooks/state/useLayerHistory';
import { useToolState } from './hooks/state/useToolState';
import { useFogOfWar } from './hooks/interactions/useFogOfWar';
import { useDataHandlers } from './hooks/state/useDataHandlers';
import { GridGeometry } from './geometry/core/GridGeometry';
import { HexGeometry } from './geometry/core/HexGeometry';
import { MapHeader } from './components/controls/MapHeader';
import { MapCanvas } from './components/mapcanvas/MapCanvas';
import { MapControls } from './components/controls/MapControls';
import { ToolPalette } from './components/toolbars/ToolPalette';
import { ObjectSidebar } from './components/panels/ObjectSidebar';
import { VisibilityToolbar } from './components/toolbars/VisibilityToolbar';
import { FogOfWarToolbar } from './components/toolbars/FogOfWarToolbar';
import { WindroseCompass } from './components/shared/WindroseCompass';

import { MapSettingsModal } from './components/settings/MapSettingsModal';
import { getTheme, getEffectiveSettings, getSettings } from './core/settingsAccessor';
import { DEFAULTS } from './core/dmtConstants';
import { getColorByHex, isDefaultColor, DEFAULT_COLOR } from './drawing/colorOperations';
import { ImageAlignmentMode } from './components/overlays/ImageAlignmentMode';
import { useAlignmentMode } from './hooks/interactions/useAlignmentMode';
import { ModalPortal } from './components/modals/ModalPortal';
import { getActiveLayer, getLayerById, addBoard, setActiveBoard, removeBoard, setLayerMode, addLayer, updateActiveLayer } from './persistence/layerAccessor';
import type { TileLayerRole } from '#types/tiles/tile.types';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, cellToPoint } from './geometry/core/cellAccessor';
import { FloatingPanel } from './components/panels/FloatingPanel';
import { DockPanel } from './components/panels/DockPanel';
import { DockRibbon } from './components/panels/DockRibbon';
import { DockLayerList } from './components/panels/DockLayerList';
import { DockViewPanel } from './components/panels/DockViewPanel';
import { ColorPicker } from './components/shared/ColorPicker';
import { RegionPanel } from './components/panels/RegionPanel';
import { EdgeRail } from './components/panels/EdgeRail';
import { TileSubtoolRibbon } from './components/panels/TileSubtoolRibbon';
import { LayerEditModal } from './components/modals/LayerEditModal';
import { openNativeCloneLayerModal, CloneLayerModal } from './components/modals/CloneLayerModal';
import { useSubHexNavigation } from './hooks/interactions/useSubHexNavigation';
import { useCustomEventHandlers } from './hooks/interactions/useCustomEventHandlers';
import { useKeyboardShortcuts } from './hooks/interactions/useKeyboardShortcuts';
import { usePlayerFogClear } from './hooks/interactions/usePlayerFogClear';
import { useUILayout } from './hooks/state/useUILayout';
import { useFloatingPanels } from './hooks/state/useFloatingPanels';
import type { PanelId, PanelState } from './hooks/state/useFloatingPanels';
import { usePanelState } from './hooks/state/usePanelState';
import { useViewControls } from './hooks/state/useViewControls';
import { useTileBrush } from './hooks/state/useTileBrush';
import { useThemeMode } from './hooks/state/useThemeMode';
import { SubHexBreadcrumb } from './components/controls/SubHexBreadcrumb';
import { TileAssetBrowser } from './components/panels/TileAssetBrowser';
import type { RailSelection } from './components/panels/TileAssetBrowser';
import { DrawerDock } from './components/panels/DrawerDock';
import type { FlyoutTile } from './components/panels/DrawerDock';
import { RA_ICONS } from './assets/rpgAwesomeIcons';
import { injectIconCSS } from './assets/rpgAwesomeLoader';
import { useApp } from './context/AppContext';
import { Icon } from './components/shared/Icon';
import { CornerBrackets } from './components/shared/CornerBrackets';
import { listMaps } from './persistence/fileOperations';
import type { MapListEntry } from './persistence/fileOperations';
import { loadTileMetadata, setTileMetadataForRender } from './persistence/tileMetadata';
import { NewMapModal } from './components/modals/NewMapModal';

// Inject RPGAwesome icon CSS classes on module load
injectIconCSS(RA_ICONS);

// ============================================================================
// LOCAL TYPE DEFINITIONS
// ============================================================================

interface DungeonMapTrackerProps {
  mapId?: string;
  mapName?: string;
  mapType?: MapType;
  notePath?: string;
  fullPane?: boolean;
  onMapChange?: (mapId: string, mapName: string, mapType: MapType) => void;
  onNameChange?: (name: string) => void;
  savedPanelState?: Partial<Record<PanelId, PanelState>>;
  onPanelStateChange?: (state: Partial<Record<PanelId, PanelState>>) => void;
  savedDockCollapsed?: boolean;
  onDockCollapsedChange?: (collapsed: boolean) => void;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid', notePath = '', fullPane = false, onMapChange, onNameChange, savedPanelState, onPanelStateChange, savedDockCollapsed, onDockCollapsedChange }: DungeonMapTrackerProps): VNode => {
  const app = useApp();
  useThemeMode();
  const { mapData: rootMapData, isLoading, saveStatus, updateMapData: rootUpdateMapData, forceSave, tileImagesReady, getCachedImage } = useMapData(mapId, mapName, mapType);

  const {
    activeMapData: mapData,
    activeUpdateMapData: updateMapData,
    isInSubHex,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    navigateToLevel,
    navigateToSibling,
    navigationVersion,
    adjacentSubHexes
  } = useSubHexNavigation({ mapData: rootMapData, updateMapData: rootUpdateMapData });

  // Populate the renderer's tile-metadata accessor on mount so terrain tiles
  // resolve to seamless region fills out-of-the-box, even if the tile browser
  // panel is never opened. Also refresh on import (windrose-settings-changed)
  // so a pack imported while a map is open picks up the new classifications.
  useEffect(() => {
    const refresh = (): void => { void loadTileMetadata(app).then(setTileMetadataForRender); };
    refresh();
    window.addEventListener('windrose-settings-changed', refresh);
    return () => window.removeEventListener('windrose-settings-changed', refresh);
  }, [app]);

  // notePath is passed from the code block processor (ctx.sourcePath)

  // Tool and color state (extracted to useToolState hook)
  const {
    currentTool, setCurrentTool,
    selectedObjectType, setSelectedObjectType,
    selectedColor, setSelectedColor,
    selectedOpacity,
    isColorPickerOpen, setIsColorPickerOpen,
    freeformPlacementMode, setFreeformPlacementMode,
    handleOpacityChange
  } = useToolState({ mapData, updateMapData });

  // Tile drawer pane: Tiles vs Objects (Objects sidebar folded into the drawer).
  const [tilePane, setTilePane] = useState<'tiles' | 'objects'>('tiles');
  // Selecting a pane couples to the active tool: Objects → addObject, Tiles → tilePaint.
  // Forcing tilePaint on the Tiles tab avoids ping-pong with the coupling effect below.
  const selectPane = useCallback((p: 'tiles' | 'objects'): void => {
    setTilePane(p);
    setCurrentTool(p === 'objects' ? 'addObject' : 'tilePaint');
  }, [setCurrentTool]);
  // Coupling: picking the Object tool elsewhere (e.g. an object grid) flips the drawer to Objects.
  useEffect(() => {
    if (currentTool === 'addObject') setTilePane('objects');
  }, [currentTool]);
  // Category-rail / view selection, owned here so the Recent/Starred view-filters
  // can live on the drawer ribbon while the rail (categories) lives in the browser.
  const [tileRailSel, setTileRailSel] = useState<RailSelection>('all');
  // Grid/list tile view, owned here so it survives the Objects-pane swap (which
  // unmounts the browser) and persists per map via mapData.
  const tileViewMode = mapData?.tileViewMode ?? 'grid';
  const setTileViewMode = useCallback((mode: 'grid' | 'list'): void => {
    updateMapData((prev: MapData) => ({ ...prev, tileViewMode: mode }));
  }, [updateMapData]);
  // Objects pane grid/list view — its own per-map field, independent of tiles.
  const objectViewMode = mapData?.objectViewMode ?? 'grid';
  const setObjectViewMode = useCallback((mode: 'grid' | 'list'): void => {
    updateMapData((prev: MapData) => ({ ...prev, objectViewMode: mode }));
  }, [updateMapData]);
  // Id of the wall being edit-dragged: threaded to the renderer so the static
  // raster drops it (the WallLayer overlay draws it live during the drag).
  const [draggingWallId, setDraggingWallId] = useState<string | null>(null);
  // Vertical left ribbon: Tiles/Objects tabs + (on Tiles with a tile selected) placement subtools.
  const renderDrawerRibbon = (): VNode => (
    <div className="windrose-fd-subrib">
      <button className={`windrose-fd-ribtab interactive-child ${tilePane === 'tiles' ? 'on' : ''}`} title="Tiles" onClick={() => selectPane('tiles')}><Icon icon="lucide-layout-dashboard" size={16} /></button>
      <button className={`windrose-fd-ribtab interactive-child ${tilePane === 'objects' ? 'on' : ''}`} title="Objects" onClick={() => selectPane('objects')}><Icon icon="lucide-sofa" size={16} /></button>
      {tilePane === 'tiles' && (
        <>
          <div className="windrose-fd-subrib-div" />
          <button className={`windrose-fd-ribtab interactive-child ${tileRailSel === 'recent' ? 'on' : ''}`} title="Recent" onClick={() => setTileRailSel(tileRailSel === 'recent' ? 'all' : 'recent')}><Icon icon="lucide-clock" size={16} /></button>
          <button className={`windrose-fd-ribtab interactive-child ${tileRailSel === 'starred' ? 'on' : ''}`} title="Starred" onClick={() => setTileRailSel(tileRailSel === 'starred' ? 'all' : 'starred')}><Icon icon="lucide-star" size={16} /></button>
        </>
      )}
      {tilePane === 'tiles' && selectedTileForm != null && (
        <>
          <div className="windrose-fd-subrib-div" />
          <div className="windrose-fd-subrib-cap">Mode</div>
          <TileSubtoolRibbon form={selectedTileForm} activeSubtool={tileSubtool} onSubtoolChange={setTileSubtool} />
        </>
      )}
    </div>
  );
  // `hideHeader` in block mode (the compact head above both panes serves); the
  // full-pane pane renders its own DrawerPaneHead to match the tile pane, and
  // takes the vertical ribbon so it seats below the header like the tile ribbon.
  const renderObjectsPane = (hideHeader: boolean, ribbon?: VNode): VNode => (
    <ObjectSidebar
      selectedObjectType={selectedObjectType}
      onObjectTypeSelect={setSelectedObjectType}
      onToolChange={setCurrentTool}
      isCollapsed={false}
      onCollapseChange={() => {}}
      mapType={mapData?.mapType ?? 'grid'}
      objectSetId={mapData?.objectSetId}
      onObjectSetChange={handleObjectSetChange}
      isFreeformMode={freeformPlacementMode}
      onFreeformToggle={() => setFreeformPlacementMode(prev => !prev)}
      hideHeader={hideHeader}
      viewMode={objectViewMode}
      onViewModeChange={setObjectViewMode}
      onCollapse={collapseTileBrowser}
      ribbon={ribbon}
    />
  );
  // Block-mode shared drawer header: a segmented Tiles|Objects control (the
  // block spec's pane switch, replacing the .fd-subrib), the grid/list view
  // toggle (tiles only) and a collapse button — sits above both panes.
  const renderCompactDrawerHead = (): VNode => {
    // The grid/list toggle serves whichever pane is active.
    const paneViewMode = tilePane === 'tiles' ? tileViewMode : objectViewMode;
    const setPaneViewMode = tilePane === 'tiles' ? setTileViewMode : setObjectViewMode;
    return (
      <div className="windrose-cd-head">
        <div className="windrose-cd-paneseg interactive-child" role="group" aria-label="Tiles or Objects">
          <button
            className={`windrose-cd-segbtn ${tilePane === 'tiles' ? 'active' : ''}`}
            onClick={() => selectPane('tiles')}
          >Tiles</button>
          <button
            className={`windrose-cd-segbtn ${tilePane === 'objects' ? 'active' : ''}`}
            onClick={() => selectPane('objects')}
          >Objects</button>
        </div>
        <div className="windrose-cd-vtog interactive-child" role="group" aria-label="View mode">
          <button
            className={`windrose-tb-iconbtn ${paneViewMode === 'grid' ? 'active' : 'ghost'}`}
            title="Grid view"
            aria-pressed={paneViewMode === 'grid'}
            onClick={() => setPaneViewMode('grid')}
          ><Icon icon="lucide-layout-grid" size={14} /></button>
          <button
            className={`windrose-tb-iconbtn ${paneViewMode === 'list' ? 'active' : 'ghost'}`}
            title="List view"
            aria-pressed={paneViewMode === 'list'}
            onClick={() => setPaneViewMode('list')}
          ><Icon icon="lucide-list" size={14} /></button>
        </div>
        <button
          className="windrose-tb-iconbtn ghost interactive-child windrose-cd-collapse"
          title="Collapse to edge"
          onClick={collapseTileBrowser}
        ><Icon icon="lucide-panel-left-open" size={15} /></button>
      </div>
    );
  };

  // Panel/modal state (plugin installer, settings modal, layer edit)
  const {
    showSettingsModal, setShowSettingsModal,
    editingLayerId, setEditingLayerId,
    editingLayer,
    handleSettingsClick, handleSettingsSave, handleSettingsClose: panelSettingsClose
  } = usePanelState({ mapData, updateMapData });

  // UI layout state (expand/collapse, panels, focus, footer, layer visibility)
  const {
    containerRef, isFocused, setIsFocused,
    isExpanded, isAnimating, handleToggleExpand,
    showFooter, setShowFooter,
    showVisibilityToolbar, setShowVisibilityToolbar,
    layerVisibility, handleToggleLayerVisibility
  } = useUILayout({ mapData, updateMapData, fullPane });

  // Block-mode left icon rail: which flyout (if any) is open. Canvas controls
  // (MapControls Layers/Regions buttons) drive this too, so it's lifted here.
  const [railOpenId, setRailOpenId] = useState<string | null>(null);

  const { isFloating, getZIndex, getInitialPosition, toggleFloat, bringToFront, updatePosition } = useFloatingPanels({ fullPane, savedState: savedPanelState, onStateChange: onPanelStateChange });

  // Full-pane right dock: collapse the whole stacked panel column to an icon
  // ribbon (persisted in the view's workspace state). Unlike the block-mode
  // rail, the ribbon replaces the panels — it never shows alongside them.
  const [dockCollapsed, setDockCollapsedState] = useState<boolean>(savedDockCollapsed ?? false);
  const setDockCollapsed = useCallback((collapsed: boolean) => {
    setDockCollapsedState(collapsed);
    onDockCollapsedChange?.(collapsed);
  }, [onDockCollapsedChange]);
  // Per-section collapse (controlled, so a ribbon click can expand a section).
  // View starts collapsed, matching its former defaultCollapsed.
  const [dockSectionCollapsed, setDockSectionCollapsed] = useState<Record<string, boolean>>({ layers: false, colorPicker: false, view: true });
  const toggleDockSection = useCallback((id: string) => {
    setDockSectionCollapsed(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);
  const handleDockRibbonExpand = useCallback((id: string) => {
    setDockCollapsed(false);
    setDockSectionCollapsed(prev => ({ ...prev, [id]: false }));
  }, [setDockCollapsed]);

  const [mapListEntries, setMapListEntries] = useState<MapListEntry[]>([]);
  useEffect(() => {
    if (!fullPane) return;
    void listMaps(app).then(entries => {
      if (mapId && !entries.some(e => e.id === mapId)) {
        entries.push({ id: mapId, name: mapName || '', type: mapType || 'grid' });
      }
      setMapListEntries(entries);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-once list seed; mapId/mapName/mapType are fallbacks not triggers; re-running thrashes vault I/O
  }, [fullPane, app]);

  const handleMapSelect = useCallback((entry: MapListEntry) => {
    onMapChange?.(entry.id, entry.name, entry.type);
  }, [onMapChange]);

  const handleNewMap = useCallback(() => {
    new NewMapModal(app, (newId, newName, newType) => {
      onMapChange?.(newId, newName, newType);
    }).open();
  }, [app, onMapChange]);

  const floatingPickerPendingRef = useRef<string | null>(null);

  // Adjacent sub-map visibility: persisted in global plugin settings
  const [showAdjacentSubMaps, setShowAdjacentSubMapsState] = useState(() =>
    getSettings().showAdjacentSubMaps ?? false
  );
  const setShowAdjacentSubMaps = useCallback((v: boolean) => {
    try {
      const plugin = app.plugins.plugins['windrose-md'] as unknown as
        { settings: { showAdjacentSubMaps?: boolean }; saveSettings(): Promise<void> } | undefined;
      if (plugin != null) {
        plugin.settings.showAdjacentSubMaps = v;
        void plugin.saveSettings();
        window.dispatchEvent(new Event('windrose-settings-changed'));
      }
    } catch { /* settings plugin unavailable */ }
    setShowAdjacentSubMapsState(v);
  }, [app]);
  useEffect(() => {
    const handler = (): void => { setShowAdjacentSubMapsState(getSettings().showAdjacentSubMaps ?? false); };
    window.addEventListener('windrose-settings-changed', handler);
    return () => window.removeEventListener('windrose-settings-changed', handler);
  }, []);

  // Tile browser state (hex maps only)
  const {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    tileBrowserWidth, setTileBrowserWidth,
    selectedTilesetId,
    selectedTileId,
    tileRotation, setTileRotation,
    tileFlipH, setTileFlipH,
    tileLayer, setTileLayer,
    tileFitMode, setTileFitMode,
    selectedTileForm, setSelectedTileForm,
    tileSubtool, setTileSubtool,
    tileScale, setTileScale,
    brushSize,
    tileDepth, setTileDepth,
    hiddenLayers, toggleHiddenLayer,
    recentTiles,
    handleTileSelect, handleTileDeselect,
  } = useTileBrush();
  // Use rootMapData for tileset check — tilesets are built from global settings and stored on root,
  // but sub-maps should also have access to tiles
  const availableTilesets = useMemo(
    () => rootMapData?.tilesets ?? mapData?.tilesets ?? [],
    [rootMapData?.tilesets, mapData?.tilesets]
  );
  const showTilePanel = mapData != null;

  // Stable handlers: TileAssetBrowser is memo()'d, so its props must keep
  // identity across the per-pointermove re-renders of this component.
  const collapseTileBrowser = useCallback(() => setTileBrowserCollapsed(true), [setTileBrowserCollapsed]);
  const expandTileBrowser = useCallback(() => setTileBrowserCollapsed(false), [setTileBrowserCollapsed]);

  // Flyout data for spine (recent + starred tiles)
  const [starredFlyoutTiles, setStarredFlyoutTiles] = useState<FlyoutTile[]>([]);

  const flyoutRecent = useMemo((): FlyoutTile[] => {
    if (availableTilesets.length === 0) return [];
    return recentTiles
      .map(r => {
        const ts = availableTilesets.find(t => t.id === r.tilesetId);
        const tile = ts?.tiles.find(t => t.id === r.tileId);
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

  // Image alignment mode (extracted to useAlignmentMode hook)
  const {
    isAlignmentMode, alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode, handleAlignmentOffsetChange,
    handleAlignmentGridSizeChange, handleAlignmentApply, handleAlignmentCancel
  } = useAlignmentMode({ mapData, updateMapData, setShowSettingsModal });

  // Create geometry instance for coordinate conversions
  // Same logic as MapCanvas for consistency
  const geometry = useMemo((): ExtendedGeometry | null => {
    if (!mapData) return null;

    const currentMapType = mapData.mapType ?? DEFAULTS.mapType;

    if (currentMapType === 'hex') {
      const hexSize = mapData.hexSize ?? DEFAULTS.hexSize;
      const orientation = mapData.orientation ?? DEFAULTS.hexOrientation;
      const hexBounds = mapData.hexBounds ?? null;
      return new HexGeometry(hexSize, orientation, hexBounds);
    } else {
      const gridSize = mapData.gridSize ?? DEFAULTS.gridSize;
      return new GridGeometry(gridSize);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional fine-grained deps: geometry rebuilds only on shape-param change, not every cell paint
  }, [mapData?.mapType, mapData?.gridSize, mapData?.hexSize, mapData?.orientation, mapData?.hexBounds]);

  // Fog of War state and handlers (extracted to useFogOfWar hook)
  const {
    showFogTools,
    fogActiveTool,
    currentFogState,
    handleFogToolsToggle,
    handleFogToolSelect,
    handleFogVisibilityToggle,
    handleFogFillAll,
    handleFogClearAll,
    handleFogChange
  } = useFogOfWar({ mapData, geometry, updateMapData });

  // Get current theme with effective settings (global + map overrides)
  // This will be called on every render, fetching fresh settings each time
  const effectiveSettings = mapData ? getEffectiveSettings(mapData.settings) : null;
  const theme: ResolvedTheme = effectiveSettings ? {
    grid: {
      lines: effectiveSettings.gridLineColor,
      lineWidth: effectiveSettings.gridLineWidth,
      background: effectiveSettings.backgroundColor
    },
    cells: {
      fill: getTheme().cells.fill,
      border: effectiveSettings.borderColor,
      borderWidth: getTheme().cells.borderWidth
    },
    compass: getTheme().compass,
    decorativeBorder: getTheme().decorativeBorder,
    coordinateKey: effectiveSettings.coordinateKeyColor
  } as ResolvedTheme : getTheme();

  // Determine canvas height based on device type and settings
  // Detect touch devices using media query match
  const isTouchDevice = useMemo(() => {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);

  const canvasHeight = fullPane ? null : (effectiveSettings
    ? (isTouchDevice
        ? (effectiveSettings.canvasHeightMobile ?? 400)
        : (effectiveSettings.canvasHeight ?? 600))
    : (isTouchDevice ? 400 : 600));



  // Compose settings close with alignment reset
  const handleSettingsClose = (): void => {
    panelSettingsClose();
    setReturningFromAlignment(false);
  };

  // Layer and history management (extracted to useLayerHistory hook)
  const {
    // Layer management
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    handleToggleShowLayerBelow,
    handleSetLayerBelowOpacity,
    handleUpdateLayerDisplay,
    handleLayerClone,
    // History state
    canUndo,
    canRedo,
    // History actions
    handleUndo,
    handleRedo,
    // For data change handlers
    addToHistory,
    isApplyingHistory
  } = useLayerHistory({ mapData, updateMapData, isLoading, navigationVersion });

  // Board (floor) + strata-mode handlers (Phase 7). Structural board ops update map
  // data directly; layer-content undo is unaffected (history is per-layerId).
  const handleToggleStrataMode = useCallback((): void => {
    updateMapData((prev: MapData) => setLayerMode(prev, prev.layerMode === 'strata' ? 'simple' : 'strata'));
  }, [updateMapData]);
  const handleBoardAdd = useCallback((): void => {
    updateMapData((prev: MapData) => addBoard(prev));
  }, [updateMapData]);
  const handleBoardSelect = useCallback((boardId: string): void => {
    updateMapData((prev: MapData) => setActiveBoard(prev, boardId));
  }, [updateMapData]);
  const handleBoardDelete = useCallback((boardId: string): void => {
    updateMapData((prev: MapData) => removeBoard(prev, boardId));
  }, [updateMapData]);
  const handleAddLayerToStratum = useCallback((role: TileLayerRole): void => {
    updateMapData((prev: MapData) => updateActiveLayer(addLayer(prev), { tileRole: role }));
  }, [updateMapData]);
  const handleToggleLayerVisible = useCallback((layerId: string): void => {
    updateMapData((prev: MapData) => ({
      ...prev,
      layers: prev.layers.map(l => l.id === layerId ? { ...l, visible: l.visible === false } : l),
    }));
  }, [updateMapData]);

  // Wrap undo to let in-progress operations (e.g. region creation) cancel first
  const wrappedHandleUndo = useCallback(() => {
    const event = new CustomEvent('windrose:before-undo', { cancelable: true });
    activeDocument.dispatchEvent(event);
    if (!event.defaultPrevented) {
      handleUndo();
    }
  }, [handleUndo]);

  // Clone layer modal state (Preact fallback only)
  const [cloningLayerId, setCloningLayerId] = useState<string | null>(null);

  const handleCloneLayerRequest = useCallback((layerId: string): void => {
    if (!mapData) return;
    const layer = getLayerById(mapData, layerId);
    if (!layer) return;

    const layerName = layer.name || String(layer.order + 1);
    const opened = openNativeCloneLayerModal({
      app,
      layerName,
      onClone: (mode) => handleLayerClone(layerId, mode),
    });
    if (!opened) {
      setCloningLayerId(layerId);
    }
  }, [mapData, handleLayerClone, app]);

  // Data change handlers (extracted to useDataHandlers hook)
  const {
    handleNameChange,
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange,
    handleWallPathsChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange,
    handleShapeOverlaysChange
  } = useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory });

  const wrappedHandleNameChange = useCallback((newName: string) => {
    handleNameChange(newName);
    onNameChange?.(newName);
    if (fullPane) {
      setMapListEntries(prev => prev.map(entry =>
        entry.id === mapId ? { ...entry, name: newName } : entry
      ));
    }
  }, [handleNameChange, onNameChange, fullPane, mapId]);

  const handleColorPickerPopout = useCallback((pos: { x: number; y: number }) => {
    toggleFloat('colorPicker', pos);
    setIsColorPickerOpen(!isFloating('colorPicker'));
  }, [toggleFloat, isFloating, setIsColorPickerOpen]);

  const handleFloatingPickerClose = useCallback(() => {
    if (floatingPickerPendingRef.current != null && floatingPickerPendingRef.current !== '') {
      const colorValue = floatingPickerPendingRef.current;
      handleAddCustomColor(colorValue);
      setSelectedColor(colorValue);
      floatingPickerPendingRef.current = null;
    }
    toggleFloat('colorPicker');
    setIsColorPickerOpen(false);
  }, [toggleFloat, setIsColorPickerOpen, handleAddCustomColor, setSelectedColor]);

  // Custom event listeners (sub-hex, deep links, regions, object links, hex context menu)
  useCustomEventHandlers({
    mapData, mapId, geometry, updateMapData,
    handleLayerSelect, enterSubHex, exitSubHex, isInSubHex,
    navigateToSibling,
    handleRegionsChange
  });

  // Player fog clearing on drop (reads latest state via functional updater, supports undo)
  usePlayerFogClear({ geometry, updateMapData, addToHistory, isApplyingHistory });

  // Adjacent sub-map click-to-navigate
  useEffect((): (() => void) | undefined => {
    if (!showAdjacentSubMaps || !isInSubHex || adjacentSubHexes.length === 0 || geometry?.type !== 'hex' || !mapData) return undefined;
    const maxRing = mapData.hexBounds?.maxRing ?? 7;
    const tileStep = 2 * maxRing + 1;

    const handleAdjacentClick = (e: MouseEvent): void => {
      const canvas = (e.target as HTMLElement).closest('canvas');
      if (canvas == null) return;

      const rect = canvas.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

      const viewState = mapData.viewState;
      if (viewState == null) return;
      const oX = canvas.width / 2 - viewState.center.x * viewState.zoom;
      const oY = canvas.height / 2 - viewState.center.y * viewState.zoom;

      // Convert click to world coords
      const clickWorldX = (canvasX - oX) / viewState.zoom;
      const clickWorldY = (canvasY - oY) / viewState.zoom;

      // Check each adjacent sub-hex: is the click within its grid bounds?
      for (const adj of adjacentSubHexes) {
        const scaledQ = adj.dq * tileStep;
        const scaledR = adj.dr * tileStep;
        if (geometry.hexToWorld == null) continue;
        const offset = geometry.hexToWorld(scaledQ, scaledR);

        // Click relative to adjacent grid center
        const relX = clickWorldX - offset.worldX;
        const relY = clickWorldY - offset.worldY;

        // Check if within maxRing hex radius (approximate with world-space distance)
        const hexSize = geometry.hexSize ?? 1;
        const gridRadius = hexSize * Math.sqrt(3) * maxRing;
        if (relX * relX + relY * relY < gridRadius * gridRadius) {
          // Parse the hex key to get absolute q, r
          const [aq, ar] = adj.hexKey.split(',').map(Number);
          activeDocument.dispatchEvent(new CustomEvent('windrose:navigate-sibling-sub-hex', { detail: { q: aq, r: ar } }));
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
    };

    activeDocument.addEventListener('click', handleAdjacentClick, true);
    return () => activeDocument.removeEventListener('click', handleAdjacentClick, true);
  }, [showAdjacentSubMaps, isInSubHex, adjacentSubHexes, geometry, mapData]);

  // View controls (zoom, compass)
  const { handleZoomIn, handleZoomOut, handleCompassClick } = useViewControls({
    mapData, updateMapData, handleViewStateChange
  });

  // Global keyboard shortcuts: layer nav, undo/redo
  useKeyboardShortcuts({
    isFocused, mapData,
    handleUndo: wrappedHandleUndo, handleRedo, handleLayerSelect
  });

  // MCP bridge: each map instance registers its own state + operations keyed by notePath.
  useEffect(() => {
    if (window.__windrose == null || mapData == null || notePath === '' || geometry == null) return;
    window.__windrose.mcpInstances ??= {};

    const activeLayer = getActiveLayer(mapData);
    window.__windrose.mcpInstances[notePath] = {
      mapId,
      mapName: mapData.name ?? mapName,
      mapType: mapData.mapType ?? 'grid',
      viewState: {
        x: mapData.viewState?.offsetX ?? 0,
        y: mapData.viewState?.offsetY ?? 0,
        zoom: mapData.viewState?.zoom ?? 1,
      },
      activeLayerId: activeLayer?.id ?? '',
      layerCount: mapData.layers.length,
      layerIds: mapData.layers.map((l) => l.id),
      currentTool,
      selectedColor,
      selectedOpacity,
      canUndo,
      canRedo,
      saveStatus,
      isExpanded,
      dataFilePath: 'windrose-md-data.json',
      notePath,
      timestamp: Date.now(),
      ops: {
        setTool: (toolId: string) => setCurrentTool(toolId as ToolId),
        setColor: (color: string) => setSelectedColor(color),
        setOpacity: (opacity: number) => handleOpacityChange(opacity),
        paintCell: (x: number, y: number, color?: string, opacity?: number): boolean => {
          if (activeLayer == null) return false;
          const c = color ?? selectedColor;
          const o = opacity ?? selectedOpacity;
          const newCells = accessorSetCell(activeLayer.cells, { x, y }, c, o, geometry);
          handleCellsChange(newCells);
          return true;
        },
        paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>): number => {
          if (activeLayer == null) return 0;
          let currentCells = activeLayer.cells;
          for (const cell of cells) {
            const c = cell.color ?? selectedColor;
            const o = cell.opacity ?? selectedOpacity;
            currentCells = accessorSetCell(currentCells, { x: cell.x, y: cell.y }, c, o, geometry);
          }
          handleCellsChange(currentCells);
          return cells.length;
        },
        eraseCell: (x: number, y: number): boolean => {
          if (activeLayer == null) return false;
          const newCells = accessorRemoveCell(activeLayer.cells, { x, y }, geometry);
          handleCellsChange(newCells);
          return true;
        },
        getCells: (): Array<{ x: number; y: number; color: string; opacity: number }> => {
          if (activeLayer == null) return [];
          return activeLayer.cells.map((cell: Cell) => ({
            ...cellToPoint(cell),
            color: cell.color,
            opacity: cell.opacity ?? 1,
          }));
        },
        undo: (): boolean => { wrappedHandleUndo(); return true; },
        redo: (): boolean => { handleRedo(); return true; },
        selectLayer: (layerId: string) => handleLayerSelect(layerId),
        forceSave: () => { void forceSave(); },
      },
    };

    return () => {
      if (window.__windrose?.mcpInstances != null) delete window.__windrose.mcpInstances[notePath];
    };
  }, [
    mapData, mapId, mapName, notePath, geometry,
    currentTool, selectedColor, selectedOpacity,
    canUndo, canRedo, saveStatus, isExpanded,
    setCurrentTool, setSelectedColor, handleOpacityChange,
    handleCellsChange, wrappedHandleUndo, handleRedo, handleLayerSelect, forceSave,
  ]);

  if (isLoading || !mapData) {
    return <div className="windrose-loading">Loading map...</div>;
  }

  // Get color display name
  const getColorDisplayName = (): string => {
    if (isDefaultColor(selectedColor)) return 'Default';
    const colorDef = getColorByHex(selectedColor);
    return colorDef ? colorDef.label : selectedColor;
  };

  // Main render
  return (
    <>
      <div
        ref={containerRef}
        className={`windrose-container interactive-child${fullPane ? '' : ' windrose-container-block'}`}
      >
        <CornerBrackets classPrefix="windrose-corner-bracket" variant="ornate" filterId="bracket" />

        {/* Map name + save status header — sits above the tool palette in both
            full-pane and block mode (the map-picker/new/copy controls inside are
            full-pane only). */}
        <MapHeader
          mapData={mapData}
          onNameChange={wrappedHandleNameChange}
          saveStatus={saveStatus}
          showFooter={showFooter}
          onToggleFooter={() => setShowFooter(!showFooter)}
          fullPane={fullPane}
          mapId={mapId}
          mapList={mapListEntries}
          onMapSelect={handleMapSelect}
          onNewMap={fullPane ? handleNewMap : undefined}
        />

        {isInSubHex && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <SubHexBreadcrumb
              breadcrumbs={breadcrumbs}
              onNavigate={navigateToLevel}
            />
            {adjacentSubHexes.length > 0 && (
              <button
                onClick={() => setShowAdjacentSubMaps(!showAdjacentSubMaps)}
                title={showAdjacentSubMaps ? 'Hide adjacent sub-maps' : 'Show adjacent sub-maps'}
                style={{
                  padding: '2px 8px',
                  fontSize: '11px',
                  background: showAdjacentSubMaps ? 'var(--interactive-accent)' : 'var(--background-secondary)',
                  color: showAdjacentSubMaps ? 'var(--text-on-accent)' : 'var(--text-muted)',
                  border: '1px solid var(--background-modifier-border)',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                <Icon icon="lucide-layers" />
              </button>
            )}
          </div>
        )}

        <div className="windrose-stage">
        <div className="windrose-toolbar-anchor">
          {!isFloating('toolPalette') && (
            <ToolPalette
              currentTool={currentTool}
              onToolChange={setCurrentTool}
              onUndo={wrappedHandleUndo}
              onRedo={handleRedo}
              canUndo={canUndo}
              canRedo={canRedo}
              selectedColor={selectedColor}
              onColorChange={setSelectedColor}
              selectedOpacity={selectedOpacity}
              onOpacityChange={handleOpacityChange}
              isColorPickerOpen={isColorPickerOpen || isFloating('colorPicker')}
              onColorPickerOpenChange={setIsColorPickerOpen}
              customColors={mapData.customColors ?? []}
              paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides ?? {}}
              onAddCustomColor={handleAddCustomColor}
              onDeleteCustomColor={handleDeleteCustomColor}
              onUpdateColorOpacity={handleUpdateColorOpacity}
              mapType={mapData.mapType}
              isFocused={isFocused}
              vertical={fullPane}
              onColorBtnPopout={fullPane ? handleColorPickerPopout : undefined}
              dockButton={fullPane ? (
                <button
                  className="windrose-tool-btn windrose-tool-palette-dock-btn interactive-child"
                  onClick={(e) => {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- button is rendered inside .windrose-tool-palette, so closest() always finds it
                    const rect = (e.currentTarget as HTMLElement).closest('.windrose-tool-palette')!.getBoundingClientRect();
                    toggleFloat('toolPalette', { x: rect.left, y: rect.top });
                  }}
                  title="Pop out tools"
                >
                  <Icon icon="lucide-maximize-2" />
                </button>
              ) : undefined}
            />
          )}

          {!fullPane && (
            <VisibilityToolbar
              isOpen={showVisibilityToolbar}
              layerVisibility={layerVisibility}
              onToggleLayer={handleToggleLayerVisibility}
              mapType={mapData.mapType}
              showFogTools={showFogTools}
              onFogToolsToggle={handleFogToolsToggle}
            />
          )}
        </div>

        {!fullPane && (
          <FogOfWarToolbar
            isOpen={showFogTools && showVisibilityToolbar}
            fogOfWarState={currentFogState}
            onFogToolSelect={handleFogToolSelect}
            onFogVisibilityToggle={handleFogVisibilityToggle}
            onFogFillAll={handleFogFillAll}
            onFogClearAll={handleFogClearAll}
          />
        )}

        <div
          className={`windrose-canvas-wrapper${fullPane ? ' windrose-full-pane-canvas' : ''}`}
          style={canvasHeight != null ? { height: `${canvasHeight}px` } : undefined}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          {/* Block-mode left icon rail — Layers / Colors / View (+ Regions on hex).
              42px rail, flyouts overlay the canvas. Replaces windrose-left-panels. */}
          {!fullPane && (
            <EdgeRail
              openId={railOpenId}
              onOpenChange={setRailOpenId}
              panels={[
                {
                  id: 'layers',
                  icon: 'lucide-layers',
                  title: 'Layers',
                  content: (
                    <DockLayerList
                      mapData={mapData}
                      onLayerSelect={handleLayerSelect}
                      onLayerAdd={handleLayerAdd}
                      onLayerDelete={handleLayerDelete}
                      onLayerReorder={handleLayerReorder}
                      onToggleShowLayerBelow={handleToggleShowLayerBelow}
                      onSetLayerBelowOpacity={handleSetLayerBelowOpacity}
                      onEditLayer={setEditingLayerId}
                      onLayerClone={handleCloneLayerRequest}
                      onToggleStrataMode={handleToggleStrataMode}
                      onBoardAdd={handleBoardAdd}
                      onBoardSelect={handleBoardSelect}
                      onBoardDelete={handleBoardDelete}
                      onAddLayerToStratum={handleAddLayerToStratum}
                      onToggleLayerVisible={handleToggleLayerVisible}
                    />
                  )
                },
                {
                  id: 'colors',
                  icon: 'lucide-palette',
                  title: 'Colors',
                  content: (
                    <ColorPicker
                      isOpen
                      floatingMode
                      selectedColor={selectedColor}
                      onColorSelect={setSelectedColor}
                      onClose={() => {}}
                      onReset={() => setSelectedColor(DEFAULT_COLOR)}
                      customColors={mapData.customColors ?? []}
                      paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides ?? {}}
                      onAddCustomColor={handleAddCustomColor}
                      onDeleteCustomColor={handleDeleteCustomColor}
                      onUpdateColorOpacity={handleUpdateColorOpacity}
                      opacity={selectedOpacity}
                      onOpacityChange={handleOpacityChange}
                    />
                  )
                },
                {
                  id: 'view',
                  icon: 'lucide-eye',
                  title: 'View',
                  content: (
                    <DockViewPanel
                      currentZoom={mapData.viewState?.zoom ?? 1}
                      onZoomIn={handleZoomIn}
                      onZoomOut={handleZoomOut}
                      layerVisibility={layerVisibility}
                      onToggleLayer={handleToggleLayerVisibility}
                      mapType={mapData.mapType}
                      onSettingsClick={handleSettingsClick}
                      fogOfWarState={currentFogState}
                      onFogToolSelect={handleFogToolSelect}
                      onFogVisibilityToggle={handleFogVisibilityToggle}
                      onFogFillAll={handleFogFillAll}
                      onFogClearAll={handleFogClearAll}
                    />
                  )
                },
                ...(mapData.mapType === 'hex' ? [{
                  id: 'regions',
                  icon: 'lucide-map',
                  title: 'Regions',
                  content: (
                    <RegionPanel
                      regions={mapData.regions ?? []}
                      onRegionsChange={handleRegionsChange}
                      sidebarCollapsed={false}
                      isOpen
                    />
                  )
                }] : [])
              ]}
            />
          )}

          {/* For hex maps, override northDirection to 0 for rendering while keeping real value for compass display */}
          {/* This allows the compass to show and persist the north direction without actually rotating hex maps */}
          <div className="windrose-canvas-and-controls">
            <MapCanvas
              mapId={mapId}
              notePath={notePath}
              mapData={availableTilesets.length > 0
                ? { ...mapData, ...(mapData.mapType === 'hex' ? { northDirection: 0 } : {}), tilesets: availableTilesets } as MapData
                : mapData}
              onCellsChange={handleCellsChange}
              onCurvesChange={handleCurvesChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
              onTilesChange={handleTilesChange}
              tileImagesReady={tileImagesReady}
              hiddenTileLayers={hiddenLayers}
              onViewStateChange={handleViewStateChange}
              onTextLabelSettingsChange={handleTextLabelSettingsChange}
              currentTool={currentTool}
              isAlignmentMode={isAlignmentMode}
              selectedObjectType={selectedObjectType ?? undefined}
              selectedColor={selectedColor}
              isColorPickerOpen={isColorPickerOpen}
              customColors={(mapData.customColors ?? []).map((c: CustomColor) => c.color)}
              onAddCustomColor={handleAddCustomColor}
              onDeleteCustomColor={handleDeleteCustomColor}
              isFocused={isFocused}
              isAnimating={isAnimating}
              theme={theme}
              layerVisibility={layerVisibility}
              adjacentSubHexes={showAdjacentSubMaps && isInSubHex ? adjacentSubHexes : null}
              draggingWallId={draggingWallId}
            >
              {/* DrawingLayer - handles all drawing tools */}
              <MapCanvas.DrawingLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
              />

              {/* FreehandLayer - handles freehand curve drawing */}
              <MapCanvas.FreehandLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
              />

              {/* ObjectLayer - handles object placement and interactions */}
              <MapCanvas.ObjectLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
                onObjectsChange={handleObjectsChange}
                customColors={mapData.customColors ?? []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                freeformPlacementMode={freeformPlacementMode}
              />

              {/* AreaSelectLayer - handles area selection tool for multi-select */}
              <MapCanvas.AreaSelectLayer
                currentTool={currentTool}
              />

              {/* TextLayer - handles text label interactions */}
              <MapCanvas.TextLayer
                currentTool={currentTool}
                customColors={mapData.customColors ?? []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
              />

              {/* NotePinLayer - handles note pin placement */}
              <MapCanvas.NotePinLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
              />

              {/* FogOfWarLayer - handles fog painting/erasing interactions */}
              {fogActiveTool && (
                <MapCanvas.FogOfWarLayer
                  activeTool={fogActiveTool}
                  onFogChange={handleFogChange}
                  onInitializeFog={(updatedMapData) => updateMapData(updatedMapData)}
                />
              )}

              {/* TilePlacementLayer - hex tile placement */}
              <MapCanvas.TilePlacementLayer
                currentTool={currentTool}
                selectedTilesetId={selectedTilesetId}
                selectedTileId={selectedTileId}
                tileRotation={tileRotation}
                tileFlipH={tileFlipH}
                tileLayer={tileLayer}
                tileFitMode={tileFitMode}
                activeSubtool={tileSubtool}
                tileScale={tileScale}
                brushSize={brushSize}
                tileDepth={tileDepth}
                onTilesChange={handleTilesChange}
              />

              {/* WallLayer - wall/path strip drawing along polylines */}
              <MapCanvas.WallLayer
                currentTool={currentTool}
                selectedTilesetId={selectedTilesetId}
                selectedTileId={selectedTileId}
                onWallPathsChange={handleWallPathsChange}
                onDragStateChange={setDraggingWallId}
              />

              {/* RegionLayer - hex region creation and editing */}
              <MapCanvas.RegionLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onRegionsChange={handleRegionsChange}
              />

              {/* OutlineLayer - polygon outline drawing and editing */}
              <MapCanvas.OutlineLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                onOutlinesChange={handleOutlinesChange}
              />

              {/* ShapeOverlayLayer - square/circle shape overlay placement */}
              <MapCanvas.ShapeOverlayLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onShapeOverlaysChange={handleShapeOverlaysChange}
              />

              {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
              <MapCanvas.HexCoordinateLayer />

              {/* MeasurementLayer - distance measurement tool overlay */}
              <MapCanvas.MeasurementLayer
                currentTool={currentTool}
                globalSettings={effectiveSettings ?? undefined}
                mapDistanceOverrides={mapData?.settings?.distanceSettings}
              />

              {/* DiagonalFillOverlay - diagonal fill tool preview */}
              <MapCanvas.DiagonalFillOverlay
                currentTool={currentTool}
              />

              {/* Re-roll button for generated dungeons */}
              <MapCanvas.RerollDungeonButton />
            </MapCanvas>

            {!fullPane && (
              <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onCompassClick={handleCompassClick}
                onSettingsClick={handleSettingsClick}
                northDirection={mapData.northDirection ?? 0}
                currentZoom={mapData.viewState?.zoom ?? 1}
                isExpanded={isExpanded}
                onToggleExpand={handleToggleExpand}
                hideExpand={fullPane}
                minimalControls
                mapType={mapData.mapType}
                showLayerPanel={railOpenId === 'layers'}
                onToggleLayerPanel={() => setRailOpenId(prev => prev === 'layers' ? null : 'layers')}
                showRegionPanel={railOpenId === 'regions'}
                onToggleRegionPanel={mapData.mapType === 'hex' ? () => setRailOpenId(prev => prev === 'regions' ? null : 'regions') : undefined}
                showVisibilityToolbar={showVisibilityToolbar}
                onToggleVisibilityToolbar={() => {
                  const closing = showVisibilityToolbar;
                  setShowVisibilityToolbar(!showVisibilityToolbar);
                  if (closing && showFogTools) handleFogToolsToggle();
                }}
                alwaysShowControls={effectiveSettings?.alwaysShowControls ?? false}
              />
            )}
            {fullPane && (
              <div
                className="windrose-compass-standalone"
                onClick={handleCompassClick}
                title={`North: ${mapData.northDirection ?? 0}° — Click to rotate`}
              >
                <WindroseCompass rotation={mapData.northDirection ?? 0} className="windrose-compass-svg" />
              </div>
            )}
          </div>

          {/* Tile Asset Browser (right sidebar, block mode) */}
          {showTilePanel && !fullPane && (
            <DrawerDock
              open={!tileBrowserCollapsed}
              onCollapse={collapseTileBrowser}
              onExpand={expandTileBrowser}
              drawerWidth={240}
              ribbonWidth={46}
              fold
              compact
              depth={tileDepth}
              onDepthChange={setTileDepth}
              hidden={hiddenLayers}
              onToggleHide={toggleHiddenLayer}
              flyoutRecent={flyoutRecent}
              flyoutStarred={starredFlyoutTiles}
              onFlyoutSelect={handleFlyoutSelect}
              pane={tilePane}
              onPane={selectPane}
            >
              <div className="windrose-cd">
              {renderCompactDrawerHead()}
              <div className="windrose-cd-main">
              {tilePane === 'objects' ? (
              renderObjectsPane(true)
              ) : (
              <TileAssetBrowser
                tilesets={availableTilesets}
                selectedTilesetId={selectedTilesetId}
                selectedTileId={selectedTileId}
                onTileSelect={handleTileSelect}
                onTileDeselect={handleTileDeselect}
                onToolChange={setCurrentTool}
                onCollapse={collapseTileBrowser}
                rotation={tileRotation}
                flipH={tileFlipH}
                onRotationChange={setTileRotation}
                onFlipChange={setTileFlipH}
                tileLayer={tileLayer}
                onTileLayerChange={setTileLayer}
                tileDepth={tileDepth}
                onTileDepthChange={setTileDepth}
                hidden={hiddenLayers}
                onToggleHide={toggleHiddenLayer}
                mapType={mapData?.mapType}
                tileFitMode={tileFitMode}
                onTileFitModeChange={setTileFitMode}
                activeSubtool={tileSubtool}
                onSubtoolChange={setTileSubtool}
                tileScale={tileScale}
                onTileScaleChange={setTileScale}
                getCachedImage={getCachedImage}
                tilesetOverrides={mapData?.tilesetOverrides}
                onTilesetOverrideChange={handleTilesetOverrideChange}
                compact
                hideHeader
                active={!tileBrowserCollapsed}
                recentTiles={recentTiles}
                onStarredChange={setStarredFlyoutTiles}
                onSelectedFormChange={setSelectedTileForm}
                railSel={tileRailSel}
                onRailSelChange={setTileRailSel}
                viewMode={tileViewMode}
                onViewModeChange={setTileViewMode}
              />
              )}
              </div>
              </div>
            </DrawerDock>
          )}

          {/* Floating panels (portalled, render anywhere) */}
          {isFloating('toolPalette') && (
            <FloatingPanel
              title="Tools"
              isFloating
              headerless
              onDock={() => toggleFloat('toolPalette')}
              onFocus={() => bringToFront('toolPalette')}
              zIndex={getZIndex('toolPalette')}
              initialPosition={getInitialPosition('toolPalette')}
              onPositionChange={(pos) => updatePosition('toolPalette', pos)}
            >
              <ToolPalette
                currentTool={currentTool}
                onToolChange={setCurrentTool}
                onUndo={wrappedHandleUndo}
                onRedo={handleRedo}
                canUndo={canUndo}
                canRedo={canRedo}
                selectedColor={selectedColor}
                onColorChange={setSelectedColor}
                selectedOpacity={selectedOpacity}
                onOpacityChange={handleOpacityChange}
                isColorPickerOpen={isColorPickerOpen || isFloating('colorPicker')}
                onColorPickerOpenChange={setIsColorPickerOpen}
                customColors={mapData.customColors ?? []}
                paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides ?? {}}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                onUpdateColorOpacity={handleUpdateColorOpacity}
                mapType={mapData.mapType}
                isFocused={isFocused}
                onColorBtnPopout={handleColorPickerPopout}
                dockButton={
                  <button
                    className="windrose-tool-btn windrose-tool-palette-dock-btn interactive-child"
                    onClick={() => toggleFloat('toolPalette')}
                    title="Dock tools"
                  >
                    <Icon icon="lucide-pin" />
                  </button>
                }
              />
            </FloatingPanel>
          )}
          {isFloating('layers') && (
            <FloatingPanel
              title="Layers"
              isFloating
              onDock={() => toggleFloat('layers')}
              onFocus={() => bringToFront('layers')}
              zIndex={getZIndex('layers')}
              initialPosition={getInitialPosition('layers')}
              resizable
              minSize={{ width: 200, height: 150 }}
              onPositionChange={(pos) => updatePosition('layers', pos)}
            >
              <DockLayerList
                mapData={mapData}
                onLayerSelect={handleLayerSelect}
                onLayerAdd={handleLayerAdd}
                onLayerDelete={handleLayerDelete}
                onLayerReorder={handleLayerReorder}
                onToggleShowLayerBelow={handleToggleShowLayerBelow}
                onSetLayerBelowOpacity={handleSetLayerBelowOpacity}
                onEditLayer={setEditingLayerId}
                onLayerClone={handleCloneLayerRequest}
                onToggleStrataMode={handleToggleStrataMode}
                onBoardAdd={handleBoardAdd}
                onBoardSelect={handleBoardSelect}
                onBoardDelete={handleBoardDelete}
                onAddLayerToStratum={handleAddLayerToStratum}
                onToggleLayerVisible={handleToggleLayerVisible}
              />
            </FloatingPanel>
          )}
          {isFloating('colorPicker') && (
            <FloatingPanel
              title="Colors"
              isFloating
              onDock={handleFloatingPickerClose}
              onFocus={() => bringToFront('colorPicker')}
              zIndex={getZIndex('colorPicker')}
              initialPosition={getInitialPosition('colorPicker')}
              resizable
              minSize={{ width: 200, height: 150 }}
              onPositionChange={(pos) => updatePosition('colorPicker', pos)}
            >
              <ColorPicker
                isOpen
                floatingMode
                selectedColor={selectedColor}
                onColorSelect={setSelectedColor}
                onClose={handleFloatingPickerClose}
                onReset={() => setSelectedColor(DEFAULT_COLOR)}
                customColors={mapData.customColors ?? []}
                paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides ?? {}}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
                onUpdateColorOpacity={handleUpdateColorOpacity}
                pendingCustomColorRef={floatingPickerPendingRef}
                opacity={selectedOpacity}
                onOpacityChange={handleOpacityChange}
              />
            </FloatingPanel>
          )}
          {isFloating('view') && (
            <FloatingPanel
              title="View"
              isFloating
              onDock={() => toggleFloat('view')}
              onFocus={() => bringToFront('view')}
              zIndex={getZIndex('view')}
              initialPosition={getInitialPosition('view')}
              onPositionChange={(pos) => updatePosition('view', pos)}
            >
              <DockViewPanel
                currentZoom={mapData.viewState?.zoom ?? 1}
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                layerVisibility={layerVisibility}
                onToggleLayer={handleToggleLayerVisibility}
                mapType={mapData.mapType}
                onSettingsClick={handleSettingsClick}
                fogOfWarState={currentFogState}
                onFogToolSelect={handleFogToolSelect}
                onFogVisibilityToggle={handleFogVisibilityToggle}
                onFogFillAll={handleFogFillAll}
                onFogClearAll={handleFogClearAll}
              />
            </FloatingPanel>
          )}
          {isFloating('tiles') && showTilePanel && (
            <FloatingPanel
              title="Tiles"
              isFloating
              onDock={() => toggleFloat('tiles')}
              onFocus={() => bringToFront('tiles')}
              zIndex={getZIndex('tiles')}
              initialPosition={getInitialPosition('tiles')}
              resizable
              minSize={{ width: 200, height: 200 }}
              onPositionChange={(pos) => updatePosition('tiles', pos)}
            >
              <TileAssetBrowser
                tilesets={availableTilesets}
                selectedTilesetId={selectedTilesetId}
                selectedTileId={selectedTileId}
                onTileSelect={handleTileSelect}
                onTileDeselect={handleTileDeselect}
                onToolChange={setCurrentTool}
                rotation={tileRotation}
                flipH={tileFlipH}
                onRotationChange={setTileRotation}
                onFlipChange={setTileFlipH}
                tileLayer={tileLayer}
                onTileLayerChange={setTileLayer}
                tileDepth={tileDepth}
                onTileDepthChange={setTileDepth}
                hidden={hiddenLayers}
                onToggleHide={toggleHiddenLayer}
                mapType={mapData?.mapType}
                tileFitMode={tileFitMode}
                onTileFitModeChange={setTileFitMode}
                activeSubtool={tileSubtool}
                onSubtoolChange={setTileSubtool}
                tileScale={tileScale}
                onTileScaleChange={setTileScale}
                getCachedImage={getCachedImage}
                tilesetOverrides={mapData?.tilesetOverrides}
                onTilesetOverrideChange={handleTilesetOverrideChange}
                recentTiles={recentTiles}
                onSelectedFormChange={setSelectedTileForm}
              />
            </FloatingPanel>
          )}

          {/* Right group: Tile Drawer + Dock Panel Column (full-pane mode only) */}
          {fullPane && (
            <div className="windrose-right-group">
              {showTilePanel && !isFloating('tiles') && (
                <DrawerDock
                  open={!tileBrowserCollapsed}
                  onCollapse={collapseTileBrowser}
                  onExpand={expandTileBrowser}
                  drawerWidth={tileBrowserWidth}
                  onWidthChange={setTileBrowserWidth}
                  minWidth={180}
                  maxWidth={392}
                  ribbonWidth={54}
                  fold
                  compact={false}
                  depth={tileDepth}
                  onDepthChange={setTileDepth}
                  hidden={hiddenLayers}
                  onToggleHide={toggleHiddenLayer}
                  flyoutRecent={flyoutRecent}
                  flyoutStarred={starredFlyoutTiles}
                  onFlyoutSelect={handleFlyoutSelect}
                  pane={tilePane}
                  onPane={selectPane}
                >
                  {tilePane === 'objects' ? (
                  renderObjectsPane(false, renderDrawerRibbon())
                  ) : (
                  <TileAssetBrowser
                    tilesets={availableTilesets}
                    selectedTilesetId={selectedTilesetId}
                    selectedTileId={selectedTileId}
                    onTileSelect={handleTileSelect}
                    onTileDeselect={handleTileDeselect}
                    onToolChange={setCurrentTool}
                    onCollapse={collapseTileBrowser}
                    rotation={tileRotation}
                    flipH={tileFlipH}
                    onRotationChange={setTileRotation}
                    onFlipChange={setTileFlipH}
                    tileLayer={tileLayer}
                    onTileLayerChange={setTileLayer}
                    tileDepth={tileDepth}
                    onTileDepthChange={setTileDepth}
                    hidden={hiddenLayers}
                    onToggleHide={toggleHiddenLayer}
                    mapType={mapData?.mapType}
                    tileFitMode={tileFitMode}
                    onTileFitModeChange={setTileFitMode}
                    activeSubtool={tileSubtool}
                    onSubtoolChange={setTileSubtool}
                    tileScale={tileScale}
                    onTileScaleChange={setTileScale}
                    getCachedImage={getCachedImage}
                    tilesetOverrides={mapData?.tilesetOverrides}
                    onTilesetOverrideChange={handleTilesetOverrideChange}
                    showRail
                    active={!tileBrowserCollapsed}
                    recentTiles={recentTiles}
                    onStarredChange={setStarredFlyoutTiles}
                    onSelectedFormChange={setSelectedTileForm}
                    railSel={tileRailSel}
                    onRailSelChange={setTileRailSel}
                    viewMode={tileViewMode}
                    onViewModeChange={setTileViewMode}
                    ribbon={renderDrawerRibbon()}
                  />
                  )}
                </DrawerDock>
              )}
              <div className={`windrose-dock-right${dockCollapsed ? ' is-collapsed' : ''}`}>
                {dockCollapsed ? (
                  <DockRibbon
                    items={[
                      { id: 'layers', icon: 'lucide-layers', title: 'Layers' },
                      { id: 'colorPicker', icon: 'lucide-palette', title: 'Colors' },
                      { id: 'view', icon: 'lucide-eye', title: 'View' },
                    ].filter(it => !isFloating(it.id as PanelId))}
                    onExpand={handleDockRibbonExpand}
                  />
                ) : (
                <>
                {!isFloating('layers') && (
                  <DockPanel
                    title="Layers"
                    collapsed={dockSectionCollapsed['layers'] ?? false}
                    onToggleCollapse={() => toggleDockSection('layers')}
                    onCollapseDock={() => setDockCollapsed(true)}
                    onUndock={(pos) => toggleFloat('layers', pos)}
                  >
                    <DockLayerList
                      mapData={mapData}
                      onLayerSelect={handleLayerSelect}
                      onLayerAdd={handleLayerAdd}
                      onLayerDelete={handleLayerDelete}
                      onLayerReorder={handleLayerReorder}
                      onToggleShowLayerBelow={handleToggleShowLayerBelow}
                      onSetLayerBelowOpacity={handleSetLayerBelowOpacity}
                      onEditLayer={setEditingLayerId}
                      onLayerClone={handleCloneLayerRequest}
                      onToggleStrataMode={handleToggleStrataMode}
                      onBoardAdd={handleBoardAdd}
                      onBoardSelect={handleBoardSelect}
                      onBoardDelete={handleBoardDelete}
                      onAddLayerToStratum={handleAddLayerToStratum}
                      onToggleLayerVisible={handleToggleLayerVisible}
                    />
                  </DockPanel>
                )}
                {!isFloating('colorPicker') && (
                  <DockPanel
                    title="Colors"
                    collapsed={dockSectionCollapsed['colorPicker'] ?? false}
                    onToggleCollapse={() => toggleDockSection('colorPicker')}
                    onUndock={(pos) => toggleFloat('colorPicker', pos)}
                  >
                    <ColorPicker
                      isOpen
                      floatingMode
                      selectedColor={selectedColor}
                      onColorSelect={setSelectedColor}
                      onClose={() => {}}
                      onReset={() => setSelectedColor(DEFAULT_COLOR)}
                      customColors={mapData.customColors ?? []}
                      paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides ?? {}}
                      onAddCustomColor={handleAddCustomColor}
                      onDeleteCustomColor={handleDeleteCustomColor}
                      onUpdateColorOpacity={handleUpdateColorOpacity}
                      opacity={selectedOpacity}
                      onOpacityChange={handleOpacityChange}
                    />
                  </DockPanel>
                )}
                {!isFloating('view') && (
                  <DockPanel
                    title="View"
                    collapsed={dockSectionCollapsed['view'] ?? true}
                    onToggleCollapse={() => toggleDockSection('view')}
                    onUndock={(pos) => toggleFloat('view', pos)}
                  >
                    <DockViewPanel
                      currentZoom={mapData.viewState?.zoom ?? 1}
                      onZoomIn={handleZoomIn}
                      onZoomOut={handleZoomOut}
                      layerVisibility={layerVisibility}
                      onToggleLayer={handleToggleLayerVisibility}
                      mapType={mapData.mapType}
                      onSettingsClick={handleSettingsClick}
                      fogOfWarState={currentFogState}
                      onFogToolSelect={handleFogToolSelect}
                      onFogVisibilityToggle={handleFogVisibilityToggle}
                      onFogFillAll={handleFogFillAll}
                      onFogClearAll={handleFogClearAll}
                    />
                  </DockPanel>
                )}
                </>
                )}
              </div>
            </div>
          )}
        </div>
        </div>

        {showFooter && (
          <div className="windrose-footer">
            Map ID: {mapId} | Color: {getColorDisplayName()} | {
              currentTool === 'select' ? 'Click to select text/objects | Drag to move | Press R to rotate | Press Delete to remove' :
                currentTool === 'draw' ? 'Click/drag to draw' :
                  currentTool === 'erase' ? 'Click/drag to erase (text first, then objects, then cells)' :
                    currentTool === 'rectangle' ? 'Click two corners to fill rectangle' :
                      currentTool === 'circle' ? 'Click edge point, then center to fill circle' :
                        currentTool === 'clearArea' ? 'Click two corners to clear area' :
                          currentTool === 'addObject' ? (selectedObjectType != null && selectedObjectType !== '' ? 'Click to place object' : 'Select an object from the sidebar') :
                            currentTool === 'addNote' ? 'Click to place note pin' :
                            currentTool === 'addText' ? 'Click to add text label' :
                              'Select a tool'
            } | Undo/redo available | Middle-click or two-finger drag to pan | Scroll to zoom | Click compass to rotate | {getActiveLayer(mapData).cells.length} cells filled | {getActiveLayer(mapData).objects.length} objects placed | {getActiveLayer(mapData).textLabels.length} text labels
          </div>
        )}

        {/* Map Settings Modal */}
        <MapSettingsModal
          isOpen={showSettingsModal}
          onCancel={handleSettingsClose}
          onSave={handleSettingsSave}
          onOpenAlignmentMode={handleOpenAlignmentMode}
          initialTab={returningFromAlignment ? (mapData?.mapType === 'hex' ? 'hexgrid' : 'gridbackground') : undefined}
          mapType={mapData?.mapType ?? 'grid'}
          orientation={mapData?.orientation ?? 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentObjectSetId={mapData.objectSetId}
          currentBackgroundImage={mapData.backgroundImage ?? null}
          currentCells={mapData.mapType === 'hex' ? getActiveLayer(mapData).cells : []}
          currentObjects={mapData.mapType === 'hex' ? getActiveLayer(mapData).objects : []}
          mapData={mapData}
          geometry={geometry}
          isInSubHex={isInSubHex}
          subMapName={isInSubHex ? (mapData?.name ?? undefined) : undefined}
        />

        {/* Image Alignment Mode */}
        {isAlignmentMode && mapData.backgroundImage?.path != null && mapData.backgroundImage.path !== '' && (
          <ImageAlignmentMode
            isActive={isAlignmentMode}
            offsetX={alignmentOffsetX}
            offsetY={alignmentOffsetY}
            onOffsetChange={handleAlignmentOffsetChange}
            onApply={handleAlignmentApply}
            onCancel={handleAlignmentCancel}
            gridSize={mapData.backgroundImage?.imageGridSize}
            onGridSizeChange={mapData.mapType === 'grid' ? handleAlignmentGridSizeChange : undefined}
          />
        )}

        
        {editingLayer && (
          <ModalPortal>
            <LayerEditModal
              layer={editingLayer}
              defaultName={String(editingLayer.order + 1)}
              onSave={(name, icon) => {
                if (editingLayerId != null) {
                  handleUpdateLayerDisplay(editingLayerId, name, icon);
                }
                setEditingLayerId(null);
              }}
              onCancel={() => setEditingLayerId(null)}
            />
          </ModalPortal>
        )}

        {cloningLayerId != null && cloningLayerId !== '' && (() => {
          const layer = getLayerById(mapData, cloningLayerId);
          if (layer == null) return null;
          const layerName = layer.name ?? String(layer.order + 1);
          return (
            <ModalPortal>
              <CloneLayerModal
                layerName={layerName}
                onClone={(mode) => {
                  handleLayerClone(cloningLayerId, mode);
                  setCloningLayerId(null);
                }}
                onCancel={() => setCloningLayerId(null)}
              />
            </ModalPortal>
          );
        })()}
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export { DungeonMapTracker };