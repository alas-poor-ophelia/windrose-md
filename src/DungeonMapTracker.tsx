// DungeonMapTracker.tsx - Root component of one mounted Windrose map (grid, hex, or world; code-block embed or full-pane view).
// Owns: map data load/save (useMapData, useDataHandlers), per-layer diff undo/redo incl. fog (useLayerHistory), sub-hex drill-down
// (useSubHexNavigation), tool/color state, panel and dock layout (usePanelState, useUILayout, useFloatingPanels),
// fog, alignment mode, keyboard shortcuts, the MCP bridge, and composes MapCanvas with its layers, toolbars, docks and modals.

import type { VNode } from 'preact';
import type {
  MapData,
  MapType,
} from '#types/index';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { ResolvedTheme } from '#types/settings/settings.types';
import type { MapDataUpdater } from '#types/hooks/mapData.types';
import type { RecordMapChangeOptions } from '#types/hooks/layerHistory.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useMapData } from './hooks/state/useMapData';
import { useImagePreloading } from './hooks/state/useImagePreloading';
import { useLayerHistory } from './hooks/state/useLayerHistory';
import { useToolState } from './hooks/state/useToolState';
import { useFeatureFlags } from './hooks/state/useFeatureFlags';
import { useFogOfWar } from './hooks/interactions/useFogOfWar';
import { useDataHandlers } from './hooks/state/useDataHandlers';
import { useMcpBridge } from './hooks/state/useMcpBridge';
import { createGeometry } from './geometry/core/createGeometry';
import { MapHeader } from './components/controls/MapHeader';
import { MapCanvas } from './components/mapcanvas/MapCanvas';

import { MapSettingsModal } from './components/settings/MapSettingsModal';
import { resolveTheme, getEffectiveSettings } from './core/settingsAccessor';
import { isFeatureEnabled } from './core/featureFlags';
import { ImageAlignmentMode } from './components/overlays/ImageAlignmentMode';
import { OnboardingSurvey } from './components/overlays/OnboardingSurvey';
import { WhatsNewNotice } from './components/overlays/WhatsNewNotice';
import { DataFileRecoveryPanel } from './components/overlays/DataFileRecoveryPanel';
import { StaleMapConflictPanel } from './components/overlays/StaleMapConflictPanel';
import { useAlignmentMode } from './hooks/interactions/useAlignmentMode';
import { getActiveLayer, getActiveBoardLayers } from './persistence/layerAccessor';
import type { TileLayerRole } from '#types/tiles/tile.types';
import { useSubHexNavigation } from './hooks/interactions/useSubHexNavigation';
import { useCustomEventHandlers } from './hooks/interactions/useCustomEventHandlers';
import { useKeyboardShortcuts } from './hooks/interactions/useKeyboardShortcuts';
import { usePlayerFogClear } from './hooks/interactions/usePlayerFogClear';
import { useUILayout } from './hooks/state/useUILayout';
import { useFloatingPanels } from './hooks/state/useFloatingPanels';
import { usePanelState } from './hooks/state/usePanelState';
import { useViewControls } from './hooks/state/useViewControls';
import { useTileBrush } from './hooks/state/useTileBrush';
import { useThemeMode } from './hooks/state/useThemeMode';
import { useApp } from './context/AppContext';
import type { PanelId, PanelState } from './hooks/state/useFloatingPanels';
import { useDockLayout } from './hooks/app/useDockLayout';
import { useTileDrawerState } from './hooks/app/useTileDrawerState';
import { useTileToolCoupling } from './hooks/app/useTileToolCoupling';
import { useFogAwareToolState, useReleaseFogOnSurfaceClose } from './hooks/app/useFogToolCoupling';
import { useDrawerRibbon } from './hooks/app/useDrawerRibbon';
import { useMapListActions } from './hooks/app/useMapListActions';
import { useBoardHandlers } from './hooks/app/useBoardHandlers';
import { useAdjacentSubMaps } from './hooks/app/useAdjacentSubMaps';
import { useTilesetArtHandlers } from './hooks/app/useTilesetArtHandlers';
import { useTileFlyouts } from './hooks/app/useTileFlyouts';
import { useOnboardingState, useSubHexRowReveal, useCanvasFrameSize } from './hooks/app/useMapChromeState';
import { BlockEdgeRail } from './components/hosts/BlockEdgeRail';
import { BlockTileDrawer } from './components/hosts/BlockTileDrawer';
import { FloatingPanelsHost } from './components/hosts/FloatingPanelsHost';
import { FullPaneRightGroup } from './components/hosts/FullPaneRightGroup';
import { buildPanelBags } from './components/hosts/buildPanelBags';
import { MapCanvasLayers } from './components/hosts/MapCanvasLayers';
import { SubHexRow } from './components/hosts/SubHexRow';
import { FooterHelp } from './components/hosts/FooterHelp';
import { StageToolbars } from './components/hosts/StageToolbars';
import { LayerModalsHost } from './components/hosts/LayerModalsHost';
import { CanvasCornerControls } from './components/hosts/CanvasCornerControls';
import { useSubHexLink, useCloneLayerRequest } from './hooks/app/useLayerLinkActions';
import { Icon } from './components/shared/Icon';
import { CornerBrackets } from './components/shared/CornerBrackets';
import { tooltipRef } from './components/shared/obsidianTooltip';
import { ensureTileMetadataLoaded } from './persistence/tileMetadata';

// ============================================================================
// LOCAL TYPE DEFINITIONS
// ============================================================================

interface DungeonMapTrackerProps {
  mapId?: string;
  mapName?: string;
  mapType?: MapType;
  notePath?: string;
  /** Sub-hex path ('/'-joined hexKeys, e.g. "0,0/2,-1") to auto-drill into on load. */
  initialSubHexPath?: string;
  /** `level:` code-block key: open the map at this ladder rung once loaded (ladder maps only). */
  initialLevel?: number;
  /** Optional explicit MCP registration key. When provided and non-empty, overrides
   *  notePath as the key in window.__windrose.mcpInstances. Used by full-pane ItemViews
   *  which have notePath === '' and would otherwise be invisible to MCP tools. */
  mcpKey?: string;
  fullPane?: boolean;
  onMapChange?: (mapId: string, mapName: string, mapType: MapType, ladderM?: number) => void;
  onNameChange?: (name: string) => void;
  savedPanelState?: Partial<Record<PanelId, PanelState>>;
  onPanelStateChange?: (state: Partial<Record<PanelId, PanelState>>) => void;
  savedDockCollapsed?: boolean;
  onDockCollapsedChange?: (collapsed: boolean) => void;
  onMapDeleted?: () => void;
}

/**
 * Per-mount instance counter (same pattern as useDebouncedSave's save
 * registry). Each mounted map block stamps its id into map-scoped custom
 * events so co-mounted blocks — including a second embed of the SAME map,
 * where mapId can't discriminate — ignore each other's events.
 */
let mapInstanceCounter = 0;

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid', notePath = '', initialSubHexPath, initialLevel, mcpKey, fullPane = false, onMapChange, onNameChange, savedPanelState, onPanelStateChange, savedDockCollapsed, onDockCollapsedChange, onMapDeleted }: DungeonMapTrackerProps): VNode => {
  const app = useApp();
  const isLightTheme = useThemeMode();
  const { mapData: rootMapData, isLoading, loadFailure, mapDeleted: dataMapDeleted, reload: reloadMapData, saveStatus, updateMapData: rootUpdateMapData, forceSave, markDeleted, staleConflict, acknowledgeStaleConflict, settingsVersion, getCachedImage } = useMapData(mapId, mapName, mapType);
  const [mapDeleted, setMapDeleted] = useState(false);

  // Per-mount instance id for event scoping (see mapInstanceCounter above).
  const instanceIdRef = useRef('');
  if (instanceIdRef.current === '') instanceIdRef.current = `windrose-map-${++mapInstanceCounter}`;
  const instanceId = instanceIdRef.current;

  // Stable accessor for this block's main map canvas. containerRef is
  // declared further down (useUILayout), so route through a ref the render
  // body reassigns — the getter identity stays stable for hook deps.
  const canvasGetterRef = useRef<() => HTMLCanvasElement | null>(() => null);
  const getCanvasEl = useCallback((): HTMLCanvasElement | null => canvasGetterRef.current(), []);

  const {
    activeMapData: mapData,
    activeUpdateMapData: updateMapData,
    isInSubHex,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    drillToSubHexPath,
    navigateToLevel,
    navigateToSibling,
    navigationVersion,
    adjacentSubHexes,
    adjacentEmptySlots,
    activeDistanceOverrides,
    subHexPath
  } = useSubHexNavigation({ mapData: rootMapData, updateMapData: rootUpdateMapData, initialSubHexPath, initialLevel, getCanvas: getCanvasEl });

  // Distance overrides for the active map: sub-hex levels get live-derived
  // scale from the parent chain; the root map uses its own stored settings.
  const distanceOverrides = activeDistanceOverrides ?? mapData?.settings?.distanceSettings;

  // Sub-hex breadcrumb row reveal: opens on a delay after the dive settles.
  const subHexRowOpen = useSubHexRowReveal(isInSubHex, subHexPath);

  // Picture frame mode (locked embed view) is a property of the ROOT map — it
  // must survive sub-hex dives and reloads. Block mode only.
  const pictureFrameActive = !fullPane && rootMapData?.pictureFrame === true;

  // Populate the renderer's tile-metadata accessor on mount so terrain tiles
  // resolve to seamless region fills out-of-the-box, even if the tile browser
  // panel is never opened. The store is shared and loads once per session;
  // importers write through it, so no settings-changed re-read is needed.
  useEffect(() => {
    void ensureTileMetadataLoaded(app);
  }, [app]);

  // notePath is passed from the code block processor (ctx.sourcePath)

  // Tool and color state (extracted to useToolState hook)
  // setCurrentTool is wrapped so any normal tool pick leaves fog mode first.
  const { toolState, releaseFogRef } = useFogAwareToolState(useToolState({ mapData, updateMapData }));
  const {
    currentTool, setCurrentTool,
    selectedObjectType,
    selectedColor, setSelectedColor,
    selectedOpacity,
    isColorPickerOpen, setIsColorPickerOpen,
    freeformPlacementMode,
    editLevelLock, setEditLevelLock,
    handleOpacityChange
  } = toolState;

  // Global feature gating (identity-stable; only flips when a flag changes).
  const featureFlags = useFeatureFlags();

  // First-run onboarding: 'pending' shows the survey, 'whatsnew' the upgrader notice.
  const onboarding = useOnboardingState();

  // Tile drawer UI state: pane (coupled to the tool), rail selection, view
  // modes, wall surface/drag id, bare-threshold mode, block tileset-config toggle.
  const drawerState = useTileDrawerState({ mapData, updateMapData, currentTool, setCurrentTool, featureFlags });
  const {
    tilePane, selectPane, tileRailSel, setTileRailSel,
    tileViewMode, setTileViewMode, objectViewMode, setObjectViewMode,
    draggingWallId, setDraggingWallId, setWallSurface,
    bareThresholdArmed, setBareThresholdArmed, handleThreshold,
    blockTilesetConfigOpen, setBlockTilesetConfigOpen,
  } = drawerState;

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

  // The MAIN map canvas is the first <canvas> under this container (fog
  // canvas renders after it) — same contract getCanvasSize relies on.
  canvasGetterRef.current = () => containerRef.current?.querySelector('canvas') ?? null;

  // Block-mode left icon rail: which flyout (if any) is open. Canvas controls
  // (MapControls Layers/Regions buttons) drive this too, so it's lifted here.
  const [railOpenId, setRailOpenId] = useState<string | null>(null);

  const floating = useFloatingPanels({ fullPane, savedState: savedPanelState, onStateChange: onPanelStateChange });
  const { isFloating, toggleFloat } = floating;

  // Full-pane right dock: column collapse (persisted via the view) + per-section collapse.
  const dock = useDockLayout(savedDockCollapsed, onDockCollapsedChange);

  // Map list + select/new/generate/delete (full-pane header; delete also from settings).
  const {
    mapListEntries, setMapListEntries,
    handleMapSelect, handleNewMap, handleGenerateDungeon, handleDeleteMap,
  } = useMapListActions({
    app, fullPane, mapId, mapName, mapType, rootMapName: rootMapData?.name,
    markDeleted, onMapChange, onMapDeleted, setMapDeleted,
  });

  const floatingPickerPendingRef = useRef<string | null>(null);


  // Tile browser state (hex maps only)
  const tileBrush = useTileBrush();
  const {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    tileBrowserWidth, setTileBrowserWidth,
    selectedTilesetId,
    selectedTileId,
    selectedTileForm, setSelectedTileForm,
    tileSubtool, setTileSubtool,
    tileDepth, setTileDepth,
    hiddenLayers,
    recentTiles,
    handleTileSelect,
  } = tileBrush;

  // Vertical left ribbon (full-pane drawer), memoized for TileAssetBrowser's memo().
  const drawerRibbon = useDrawerRibbon({
    tilesEnabled: featureFlags.tiles, tilePane, selectPane, tileRailSel, setTileRailSel,
    selectedTileForm, tileSubtool, setTileSubtool, handleThreshold, bareThresholdArmed,
  });

  // Coupling: a wall/path strip or opening asset arms the wall tool; leaving returns to tilePaint.
  useTileToolCoupling({
    rootTilesets: rootMapData?.tilesets, activeTilesets: mapData?.tilesets,
    selectedTilesetId, selectedTileId, tileSubtool, currentTool, setCurrentTool,
    bareThresholdArmed, setBareThresholdArmed,
  });

  // Use rootMapData for tileset check — tilesets are built from global settings and stored on root,
  // but sub-maps should also have access to tiles
  const availableTilesets = useMemo(
    () => rootMapData?.tilesets ?? mapData?.tilesets ?? [],
    [rootMapData?.tilesets, mapData?.tilesets]
  );
  const showTilePanel = mapData != null;

  // Preload image assets for the ACTIVE map (root or sub-hex), not just the
  // root: a dive re-scans the child's placed art, a surface re-warms anything
  // the LRU evicted while below (windrose-1mc — cold child art painted as
  // holes at the transition). Sub-map data doesn't carry the root-scoped
  // tileset catalog, so enrich with availableTilesets — the same shape
  // MapCanvas receives.
  //
  // renderMapData is THE mapData the canvas actually renders with: tilesets
  // enriched from root, and hex maps pinned to northDirection 0 (the compass
  // shows/persists north without rotating hex maps). Anything that hit-tests
  // against the rendered canvas MUST read this object, not raw state — the
  // adjacent-click handler once read raw northDirection and un-rotated
  // clicks the renderer never rotated.
  const renderMapData = useMemo(
    () => (mapData != null && availableTilesets.length > 0
      ? { ...mapData, ...(mapData.mapType === 'hex' ? { northDirection: 0 } : {}), tilesets: availableTilesets }
      : mapData),
    [mapData, availableTilesets]
  );
  const { tileImagesReady } = useImagePreloading(app, renderMapData, settingsVersion);


  // Stable handlers: TileAssetBrowser is memo()'d, so its props must keep
  // identity across the per-pointermove re-renders of this component.
  const collapseTileBrowser = useCallback(() => setTileBrowserCollapsed(true), [setTileBrowserCollapsed]);
  const expandTileBrowser = useCallback(() => setTileBrowserCollapsed(false), [setTileBrowserCollapsed]);

  // Flyout data for spine (recent + starred tiles)
  const flyouts = useTileFlyouts({ availableTilesets, recentTiles, handleTileSelect, setCurrentTool });

  // Tileset render overrides (per map) + global art nudge/scale (debounced); flushes on unmount.
  const artHandlers = useTilesetArtHandlers(app, updateMapData);

  // Image alignment mode (extracted to useAlignmentMode hook)
  const {
    isAlignmentMode, alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode, handleAlignmentOffsetChange,
    handleAlignmentGridSizeChange, handleAlignmentApply, handleAlignmentCancel
  } = useAlignmentMode({ mapData, updateMapData, setShowSettingsModal });

  // Create geometry instance for coordinate conversions
  // Keyed on the five fields createGeometry reads; the rest of mapData comes
  // from a latest-ref so unrelated edits don't rebuild the geometry.
  const geometryMapDataRef = useRef(mapData);
  geometryMapDataRef.current = mapData;
  const hasGeometryMapData = mapData != null;
  const geoMapType = mapData?.mapType;
  const geoGridSize = mapData?.gridSize;
  const geoHexSize = mapData?.hexSize;
  const geoOrientation = mapData?.orientation;
  const geoHexBounds = mapData?.hexBounds;
  const geometry = useMemo((): ExtendedGeometry | null => {
    const latest = geometryMapDataRef.current;
    if (!hasGeometryMapData || latest == null) return null;
    return createGeometry({
      ...latest,
      mapType: geoMapType ?? latest.mapType, gridSize: geoGridSize, hexSize: geoHexSize,
      orientation: geoOrientation, hexBounds: geoHexBounds
    });
  }, [hasGeometryMapData, geoMapType, geoGridSize, geoHexSize, geoOrientation, geoHexBounds]);

  // Copy a deep link to the current sub-hex view (block mode only).
  const handleCopySubHexLink = useSubHexLink({ notePath, mapId, subHexPath, mapData, geometry });

  // Fog operations enter undo history (DATA-06): wrap the writer so every fog
  // update records its exact prev -> next diff. useLayerHistory is called
  // further down, so its recorder is read through a ref. Brush strokes
  // (one update per cell) coalesce into a single entry.
  const recordMapChangeRef = useRef<((prev: MapData, next: MapData, options?: RecordMapChangeOptions) => void) | null>(null);
  const fogUpdateMapData = useCallback<MapDataUpdater>((updaterOrData, options) => {
    updateMapData((prev: MapData) => {
      const next = typeof updaterOrData === 'function' ? updaterOrData(prev) : updaterOrData;
      recordMapChangeRef.current?.(prev, next, { coalesceKey: 'fog' });
      return next;
    }, options);
  }, [updateMapData]);

  // Fog of War state and handlers (extracted to useFogOfWar hook)
  const fog = useFogOfWar({ mapData, geometry, updateMapData: fogUpdateMapData });
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
  } = fog;
  releaseFogRef.current = fog.releaseFog;
  // Closing the last surface that shows the fog tools leaves fog mode.
  useReleaseFogOnSurfaceClose({
    fullPane, showVisibilityToolbar, showFogTools, railOpenId,
    viewDockOpen: !dock.collapsed && !(dock.sectionCollapsed['view'] ?? true),
    viewFloating: isFloating('view'),
  }, fog.releaseFog);

  // Effective settings (global + map overrides), fetched fresh each render.
  const effectiveSettings = mapData ? getEffectiveSettings(mapData.settings) : null;
  // Theme is memoized so MapCanvas / the renderer see a stable object between
  // renders. Deps: the map's overrides, global settings (settingsVersion bumps
  // on windrose-settings-changed) and light/dark mode (grid line and background
  // defaults swap on the body theme class).
  const mapSettings = mapData?.settings;
  const theme: ResolvedTheme = useMemo(
    () => resolveTheme(mapSettings),
    [mapSettings, settingsVersion, isLightTheme]
  );

  // Canvas height (device type + settings) and picture-frame width.
  const { canvasHeight, frameWidth } = useCanvasFrameSize(fullPane, pictureFrameActive, effectiveSettings);



  // Compose settings close with alignment reset
  const handleSettingsClose = (): void => {
    panelSettingsClose();
    setReturningFromAlignment(false);
  };

  // Layer and history management (extracted to useLayerHistory hook)
  const layerHistory = useLayerHistory({ mapData, updateMapData, isLoading, navigationVersion, levelKey: subHexPath });
  const {
    // Layer management
    handleLayerSelect,
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
    isApplyingHistory,
    recordMapChange,
  } = layerHistory;
  recordMapChangeRef.current = recordMapChange;

  // Board (floor) + strata-mode handlers for the layers panel (Phase 7).
  const boardHandlers = useBoardHandlers(updateMapData);

  // Wrap undo to let in-progress operations (e.g. region creation) cancel first
  // Returns whether anything changed (a tool consuming the undo counts), so the
  // MCP bridge can report undo exactly.
  const wrappedHandleUndo = useCallback((): boolean => {
    const event = new CustomEvent('windrose:before-undo', { cancelable: true, detail: { instanceId } });
    // Dispatch on the document that owns this map (popout-safe); RegionLayer
    // listens on its canvas's ownerDocument.
    (containerRef.current?.ownerDocument ?? activeDocument).dispatchEvent(event);
    if (event.defaultPrevented) return true; // a tool consumed the undo
    return handleUndo();
  }, [handleUndo, instanceId, containerRef]);

  // Clone layer: native modal first, Preact fallback state otherwise.
  const { cloningLayerId, setCloningLayerId, handleCloneLayerRequest } = useCloneLayerRequest(app, mapData, handleLayerClone);

  // Data change handlers (extracted to useDataHandlers hook)
  const dataHandlers = useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory });
  const {
    handleNameChange,
    handleCellsChange,
    handleLevelCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange,
    handleWallPathsChange,
    handleTerrainStrokesChange,
    handleAddCustomColor,
    handleViewStateChange,
    handleTextLabelSettingsChange,
    handleRegionsChange
  } = dataHandlers;

  // Picture frame handlers write through rootUpdateMapData, not the
  // active-map funnel (see pictureFrameActive above).
  const handleTogglePictureFrame = useCallback((): void => {
    rootUpdateMapData((prev) => ({ ...prev, pictureFrame: prev.pictureFrame !== true }));
  }, [rootUpdateMapData]);

  // Lock/unlock the root viewport as the picture-frame default view.
  // viewState commits at gesture end, so at click time it IS the current viewport.
  const handleToggleViewLock = useCallback((): void => {
    rootUpdateMapData((prev) => {
      if (prev.lockedViewState != null) {
        const { lockedViewState: _cleared, ...rest } = prev;
        return rest;
      }
      if (prev.viewState == null) return prev;
      return { ...prev, lockedViewState: { ...prev.viewState } };
    });
  }, [rootUpdateMapData]);

  const wrappedHandleNameChange = useCallback((newName: string) => {
    handleNameChange(newName);
    onNameChange?.(newName);
    if (fullPane) {
      setMapListEntries(prev => prev.map(entry =>
        entry.id === mapId ? { ...entry, name: newName } : entry
      ));
    }
  }, [handleNameChange, onNameChange, fullPane, mapId, setMapListEntries]);

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

  // Strata coupling: the depth band doubles as the stratum selector. Tile
  // placements and terrain strokes write to the ACTIVE layer, so the band must
  // activate its matching stratum — otherwise terrain paints onto whatever
  // layer happens to be selected and renders in that stratum's slot.
  const handleTileDepthChange = useCallback((depth: TileLayerRole): void => {
    setTileDepth(depth);
    if (mapData?.layerMode === 'strata') {
      const target = getActiveBoardLayers(mapData).find(l => l.tileRole === depth);
      if (target != null && target.id !== mapData.activeLayerId) {
        handleLayerSelect(target.id);
      }
    }
  }, [mapData, setTileDepth, handleLayerSelect]);

  // Reverse sync: selecting a stratum layer (layers panel) follows with the band.
  useEffect(() => {
    if (mapData?.layerMode !== 'strata') return;
    const role = getActiveLayer(mapData).tileRole;
    if (role != null && role !== tileDepth) setTileDepth(role);
  }, [mapData, tileDepth, setTileDepth]);

  // Custom event listeners (deep links, regions, object links, hex context
  // menu) + the direct sub-hex dive/surface callbacks the canvas layer calls.
  const { requestEnterSubHex, requestExitSubHex } = useCustomEventHandlers({
    mapData, mapId, instanceId, isFocused, geometry, updateMapData,
    handleLayerSelect, enterSubHex, exitSubHex, drillToSubHexPath, isInSubHex,
    handleRegionsChange,
    subHexPath, containerRef
  });

  // Player fog clearing on drop (reads latest state via functional updater, supports undo)
  usePlayerFogClear({ geometry, updateMapData, addToHistory, isApplyingHistory, instanceId, containerRef });

  // Adjacent sub-map previews: global toggle + click-to-navigate on siblings and "+" slots.
  const { showAdjacentSubMaps, setShowAdjacentSubMaps } = useAdjacentSubMaps({
    app, isInSubHex, adjacentSubHexes, adjacentEmptySlots, navigateToSibling,
    geometry, renderMapData, containerRef,
  });

  // Canvas pixel size for view-fitting calculations (recenter-view).
  // querySelector depends on DOM order: the MAIN map canvas must stay the
  // first <canvas> under this container (the fog canvas renders after it).
  const getCanvasSize = useCallback((): { width: number; height: number } | null => {
    const canvas = containerRef.current?.querySelector('canvas');
    return canvas ? { width: canvas.width, height: canvas.height } : null;
  }, [containerRef]);

  // View controls (zoom, compass, recenter)
  const { handleZoomIn, handleZoomOut, handleCompassClick, handleRecenterView } = useViewControls({
    mapData, updateMapData, handleViewStateChange, geometry, getCanvasSize
  });

  // Global keyboard shortcuts: layer nav, undo/redo, picture frame toggle, recenter view
  useKeyboardShortcuts({
    isFocused, mapData,
    handleUndo: wrappedHandleUndo, handleRedo, handleLayerSelect,
    pictureFrameLocked: pictureFrameActive,
    onTogglePictureFrame: !fullPane ? handleTogglePictureFrame : undefined,
    onRecenterView: handleRecenterView,
    containerRef
  });

  // MCP bridge: each map instance registers its own state + operations.
  // MCP/E2E instance registration — key priority: mcpKey (full-pane ItemView)
  // > notePath (block mode); the hook bails on an empty effective key.
  useMcpBridge({
    mapData, mapId, mapName, notePath, mcpKey, fullPane, geometry,
    currentTool, selectedColor, selectedOpacity, editLevelLock,
    canUndo, canRedo, saveStatus, isExpanded,
    setCurrentTool, setSelectedColor, handleOpacityChange,
    handleCellsChange, handleLevelCellsChange, wrappedHandleUndo, handleRedo, handleLayerSelect, forceSave,
    handleViewStateChange, availableTilesets, handleTileSelect, setSelectedTileForm,
    handleTilesChange, handleObjectsChange, selectPane, setTileBrowserCollapsed,
    setRailOpenId, getCachedImage,
  });

  // Deleted by this mount (mapDeleted) or by another mount this session
  // (dataMapDeleted: tombstoned at load, or a save came back 'deleted').
  if (mapDeleted || dataMapDeleted) {
    return (
      <div className="windrose-loading">
        {fullPane ? 'Map deleted.' : 'Map deleted. You can remove this windrose-map code block.'}
      </div>
    );
  }

  // Unreadable data file: render a blocking panel INSTEAD of the canvas. No
  // canvas means no edits, which means nothing can overwrite the file while it
  // is in an unknown state. The panel also offers the backup restore.
  if (loadFailure) {
    return <DataFileRecoveryPanel dataPath={loadFailure.dataPath} kind={loadFailure.kind} foundAt={loadFailure.foundAt} onRestored={reloadMapData} />;
  }

  // A save carrying real edits was refused because another mount of this map
  // saved first. Block editing behind a reload — continuing would either keep
  // failing to save or clobber the other mount's committed work.
  if (staleConflict) {
    return (
      <StaleMapConflictPanel
        onReload={() => {
          acknowledgeStaleConflict();
          reloadMapData();
        }}
      />
    );
  }

  if (isLoading || !mapData) {
    return <div className="windrose-loading">Loading map...</div>;
  }

  // One prop set per panel (STRUCT-A-02): every layout spreads the same bag.
  const bags = buildPanelBags({
    mapData, tool: toolState, layerHistory, data: dataHandlers, fog, tileBrush,
    uiLayout: { layerVisibility, handleToggleLayerVisibility, isFocused },
    boards: boardHandlers, drawer: drawerState, flyouts, art: artHandlers, featureFlags,
    availableTilesets, getCachedImage, onEditLayer: setEditingLayerId, onLayerClone: handleCloneLayerRequest,
    onZoomIn: handleZoomIn, onZoomOut: handleZoomOut, onUndo: wrappedHandleUndo,
    onTileDepthChange: handleTileDepthChange, collapseTileBrowser, expandTileBrowser,
  });

  // Main render
  return (
    <>
      <div
        ref={containerRef}
        className={`windrose-container interactive-child${fullPane ? '' : ' windrose-container-block'}${pictureFrameActive ? ' windrose-picture-frame' : ''}`}
        style={frameWidth != null ? { width: `${frameWidth}px`, maxWidth: '100%', marginInline: 'auto' } : undefined}
      >
        <CornerBrackets classPrefix="windrose-corner-bracket" variant="ornate" filterId="bracket" />

        {/* Map name + save status header — sits above the tool palette in both
            full-pane and block mode (the map-picker/new/copy controls inside are
            full-pane only). Picture frame hides it with the rest of the chrome. */}
        {!pictureFrameActive && <MapHeader
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
          onGenerateDungeon={fullPane && isFeatureEnabled('dungeonGenerator') ? handleGenerateDungeon : undefined}
          onDeleteMap={fullPane ? () => { void handleDeleteMap(); } : undefined}
          subHexPath={subHexPath}
        />}

        {/* One-time upgrader notice pointing at the Features settings section. */}
        {onboarding === 'whatsnew' && !pictureFrameActive && <WhatsNewNotice />}

        <SubHexRow
          open={subHexRowOpen && isInSubHex && !pictureFrameActive}
          show={isInSubHex && !pictureFrameActive}
          breadcrumbs={breadcrumbs}
          onNavigate={navigateToLevel}
          hasAdjacent={adjacentSubHexes.length > 0 || adjacentEmptySlots.length > 0}
          showAdjacent={showAdjacentSubMaps}
          onToggleAdjacent={() => setShowAdjacentSubMaps(!showAdjacentSubMaps)}
          onCopyLink={notePath !== '' ? handleCopySubHexLink : null}
        />

        <div className="windrose-stage">
        {!pictureFrameActive && (
          <StageToolbars
            fullPane={fullPane}
            toolPalette={bags.toolPalette}
            paletteDocked={!isFloating('toolPalette')}
            onPopOutPalette={(pos) => toggleFloat('toolPalette', pos)}
            visibility={fullPane ? null : {
              isOpen: showVisibilityToolbar, layerVisibility, onToggleLayer: handleToggleLayerVisibility,
              mapType: mapData.mapType, showFogTools, onFogToolsToggle: handleFogToolsToggle,
              onTogglePictureFrame: handleTogglePictureFrame,
              viewLocked: rootMapData?.lockedViewState != null, onToggleViewLock: handleToggleViewLock,
            }}
            fogToolbar={fullPane || !featureFlags.fogOfWar ? null : {
              isOpen: showFogTools && showVisibilityToolbar, fogOfWarState: currentFogState,
              onFogToolSelect: handleFogToolSelect, onFogVisibilityToggle: handleFogVisibilityToggle,
              onFogFillAll: handleFogFillAll, onFogClearAll: handleFogClearAll,
            }}
          />
        )}

        <div
          className={`windrose-canvas-wrapper${fullPane ? ' windrose-full-pane-canvas' : ''}`}
          style={canvasHeight != null ? { height: `${canvasHeight}px` } : undefined}
          tabIndex={-1}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          {/* Picture frame: the one piece of chrome left — a subtle hover-reveal
              exit button (CSS keeps it invisible until the frame is hovered). */}
          {pictureFrameActive && (
            <button
              className="windrose-frame-exit-btn"
              onClick={handleTogglePictureFrame}
              ref={tooltipRef('Exit picture frame mode')}
            >
              <Icon icon="lucide-frame" />
            </button>
          )}

          {/* Block-mode left icon rail — Layers / Colors / View (+ Regions on hex).
              42px rail, flyouts overlay the canvas. Replaces windrose-left-panels. */}
          {!fullPane && !pictureFrameActive && (
            <BlockEdgeRail
              bags={bags}
              openId={railOpenId}
              onOpenChange={setRailOpenId}
              regions={mapData.mapType === 'hex' && featureFlags.regions
                ? { regions: mapData.regions ?? [], onRegionsChange: handleRegionsChange, instanceId }
                : null}
              onSettingsClick={handleSettingsClick}
            />
          )}

          {/* For hex maps, override northDirection to 0 for rendering while keeping real value for compass display */}
          {/* This allows the compass to show and persist the north direction without actually rotating hex maps */}
          <div
            className="windrose-canvas-and-controls"
            // Full-pane: the tile drawer floats over the canvas from the right edge
            // (position:absolute; right:100%). Expose how far it overhangs so canvas
            // overlays (the reroll button) can sit clear of it and track it as it
            // folds/resizes. 0 in block mode or when the drawer is hidden/floating.
            style={{
              '--windrose-reroll-inset': `${
                fullPane && showTilePanel && !isFloating('tiles')
                  ? (tileBrowserCollapsed ? 54 : tileBrowserWidth)
                  : 0
              }px`
            }}
          >
            <MapCanvas
              mapId={mapId}
              notePath={notePath}
              mapData={renderMapData ?? mapData}
              onCellsChange={handleCellsChange}
              onLevelCellsChange={handleLevelCellsChange}
              onCurvesChange={handleCurvesChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
              onTilesChange={handleTilesChange}
              onLayerSelect={handleLayerSelect}
              clearTransient={layerHistory.clearTransient}
              onWallPathsChange={handleWallPathsChange}
              onTerrainStrokesChange={handleTerrainStrokesChange}
              tileImagesReady={tileImagesReady}
              hiddenTileLayers={hiddenLayers}
              onViewStateChange={handleViewStateChange}
              onTextLabelSettingsChange={handleTextLabelSettingsChange}
              currentTool={currentTool}
              editLevelLock={editLevelLock}
              onEditLevelLockChange={setEditLevelLock}
              isAlignmentMode={isAlignmentMode}
              interactionLocked={pictureFrameActive}
              selectedObjectType={selectedObjectType ?? undefined}
              selectedColor={selectedColor}
              isColorPickerOpen={isColorPickerOpen}
              isFocused={isFocused}
              isAnimating={isAnimating}
              theme={theme}
              layerVisibility={layerVisibility}
              adjacentSubHexes={showAdjacentSubMaps && isInSubHex ? adjacentSubHexes : null}
              adjacentEmptySlots={showAdjacentSubMaps && isInSubHex ? adjacentEmptySlots : null}
              draggingWallId={draggingWallId}
              distanceOverrides={distanceOverrides}
              isInSubHex={isInSubHex}
              subHexPath={subHexPath}
              instanceId={instanceId}
              requestEnterSubHex={requestEnterSubHex}
              requestExitSubHex={requestExitSubHex}
            >
              <MapCanvasLayers
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onColorChange={setSelectedColor}
                selectedObjectType={selectedObjectType}
                freeformPlacementMode={freeformPlacementMode}
                customColors={mapData.customColors ?? []}
                distanceOverrides={distanceOverrides}
                globalSettings={effectiveSettings ?? undefined}
                data={dataHandlers}
                fogActiveTool={fogActiveTool}
                onFogChange={handleFogChange}
                updateMapData={updateMapData}
                tileBrush={tileBrush}
                onWallDragStateChange={setDraggingWallId}
                onWallSurfaceChange={setWallSurface}
                bareThresholdArmed={bareThresholdArmed}
                onDisarmOpening={() => setBareThresholdArmed(false)}
                showSavedRoutes={layerVisibility.savedRoutes}
                showRerollButton={featureFlags.dungeonGenerator}
              />
            </MapCanvas>

            <CanvasCornerControls
              mapData={mapData}
              onCompassClick={handleCompassClick}
              showStandaloneCompass={fullPane}
              block={fullPane || pictureFrameActive ? null : {
                onZoomIn: handleZoomIn, onZoomOut: handleZoomOut, onRecenterView: handleRecenterView,
                onSettingsClick: handleSettingsClick, isExpanded, onToggleExpand: handleToggleExpand,
                railOpenId, setRailOpenId, regionsEnabled: mapData.mapType === 'hex' && featureFlags.regions,
                showVisibilityToolbar, setShowVisibilityToolbar, showFogTools, onFogToolsToggle: handleFogToolsToggle,
                alwaysShowControls: effectiveSettings?.alwaysShowControls ?? false,
              }}
            />
          </div>

          {/* Tile Asset Browser (right sidebar, block mode) */}
          {showTilePanel && !fullPane && !pictureFrameActive && (
            <BlockTileDrawer
              drawer={bags.drawer}
              tileBrowser={bags.tileBrowser}
              objectsPane={bags.objectsPane}
              tileViewMode={tileViewMode}
              onTileViewModeChange={setTileViewMode}
              objectViewMode={objectViewMode}
              onObjectViewModeChange={setObjectViewMode}
              hasTilesets={availableTilesets.length > 0}
              tilesetConfigOpen={blockTilesetConfigOpen}
              onTilesetConfigOpenChange={setBlockTilesetConfigOpen}
            />
          )}

          {/* Floating panels (portalled, render anywhere) */}
          <FloatingPanelsHost
            bags={bags}
            floating={floating}
            onColorPickerClose={handleFloatingPickerClose}
            pendingCustomColorRef={floatingPickerPendingRef}
            showTiles={showTilePanel && featureFlags.tiles}
          />

          {/* Right group: Tile Drawer + Dock Panel Column (full-pane mode only) */}
          {fullPane && (
            <FullPaneRightGroup
              bags={bags}
              floating={floating}
              dock={dock}
              showTilePanel={showTilePanel}
              drawerWidth={tileBrowserWidth}
              onDrawerWidthChange={setTileBrowserWidth}
              drawerRibbon={drawerRibbon}
              onSettingsClick={handleSettingsClick}
            />
          )}
        </div>
        </div>

        {showFooter && !pictureFrameActive && (
          <FooterHelp mapId={mapId} mapData={mapData} selectedColor={selectedColor} currentTool={currentTool} selectedObjectType={selectedObjectType} />
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
          layerVisibility={layerVisibility}
          isInSubHex={isInSubHex}
          subMapName={isInSubHex ? (mapData?.name ?? undefined) : undefined}
          mapId={isInSubHex ? undefined : mapId}
          onDeleteMap={isInSubHex ? undefined : () => {
            handleSettingsClose();
            void handleDeleteMap();
          }}
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

        <LayerModalsHost
          mapData={mapData}
          editingLayer={editingLayer}
          editingLayerId={editingLayerId}
          setEditingLayerId={setEditingLayerId}
          onUpdateLayerDisplay={handleUpdateLayerDisplay}
          cloningLayerId={cloningLayerId}
          setCloningLayerId={setCloningLayerId}
          onLayerClone={handleLayerClone}
        />

        {/* First-run onboarding survey — overlays the whole block; covers
            both code-block and full-pane paths (same component). */}
        {onboarding === 'pending' && <OnboardingSurvey />}
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

export { DungeonMapTracker };