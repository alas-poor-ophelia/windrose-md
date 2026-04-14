// DungeonMapTracker.tsx - Main component with undo/redo, objects, text labels, and color support

import type {
  MapData,
  MapType,
  IGeometry,
} from '#types/index';
import type { ResolvedTheme } from '#types/settings/settings.types';

// ============================================================================
// IMPORTS
// ============================================================================

const { requireModuleByName, getBasePath } = await dc.require(`${window.__dmtBasePath}/core/pathResolver.ts`);


const css = await app.vault.cachedRead(
  await app.vault.getFileByPath(`${getBasePath()}/css/WindroseMD-CSS.css`)
);

const combinedCss = [
  css,
].join('\n');


const { useMapData } = await requireModuleByName("useMapData.ts");
const { useLayerHistory } = await requireModuleByName("useLayerHistory.ts");
const { useToolState } = await requireModuleByName("useToolState.ts");
const { useFogOfWar } = await requireModuleByName("useFogOfWar.ts");
const { useDataHandlers } = await requireModuleByName("useDataHandlers.ts");
const { GridGeometry } = await requireModuleByName("GridGeometry.ts");
const { HexGeometry } = await requireModuleByName("HexGeometry.ts");
const { MapHeader } = await requireModuleByName("MapHeader.tsx");
const { MapCanvas } = await requireModuleByName("MapCanvas.tsx");
const { MapControls } = await requireModuleByName("MapControls.tsx");
const { ToolPalette } = await requireModuleByName("ToolPalette.tsx");
const { ObjectSidebar } = await requireModuleByName("ObjectSidebar.tsx");
const { VisibilityToolbar } = await requireModuleByName("VisibilityToolbar.tsx");
const { SettingsPluginInstaller } = await requireModuleByName("SettingsPluginInstaller.tsx");
const { MapSettingsModal } = await requireModuleByName("MapSettingsModal.tsx");
const { getTheme, getEffectiveSettings, getSettings } = await requireModuleByName("settingsAccessor.ts");
const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");
const { getColorByHex, isDefaultColor } = await requireModuleByName("colorOperations.ts");
const { ImageAlignmentMode } = await requireModuleByName("ImageAlignmentMode.tsx");
const { useAlignmentMode } = await requireModuleByName("useAlignmentMode.ts");
const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { setCell: accessorSetCell, removeCell: accessorRemoveCell, cellToPoint } = await requireModuleByName("cellAccessor.ts");
const { LayerControls } = await requireModuleByName("LayerControls.tsx");
const { RegionPanel } = await requireModuleByName("RegionPanel.tsx");
const { LayerEditModal } = await requireModuleByName("LayerEditModal.tsx");
const { useSubHexNavigation } = await requireModuleByName("useSubHexNavigation.ts");
const { useCustomEventHandlers } = await requireModuleByName("useCustomEventHandlers.ts");
const { useUILayout } = await requireModuleByName("useUILayout.ts");
const { usePanelState } = await requireModuleByName("usePanelState.ts");
const { useViewControls } = await requireModuleByName("useViewControls.ts");
const { useTileBrush } = await requireModuleByName("useTileBrush.ts");
const { SubHexBreadcrumb } = await requireModuleByName("SubHexBreadcrumb.tsx");
const { TileAssetBrowser } = await requireModuleByName("TileAssetBrowser.tsx");

// RPGAwesome icon font support
const { RA_ICONS } = await requireModuleByName("rpgAwesomeIcons.ts");
const { injectIconCSS } = await requireModuleByName("rpgAwesomeLoader.ts");



// Inject RPGAwesome icon CSS classes on module load
injectIconCSS(RA_ICONS);

// ============================================================================
// LOCAL TYPE DEFINITIONS
// ============================================================================

interface DungeonMapTrackerProps {
  mapId?: string;
  mapName?: string;
  mapType?: MapType;
}

type CornerPosition = 'tl' | 'tr' | 'bl' | 'br';

interface CornerBracketProps {
  position: CornerPosition;
}

interface HexBounds {
  maxCol: number;
  maxRow: number;
  maxRing?: number;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Corner Bracket SVG Component
const CornerBracket = ({ position }: CornerBracketProps): React.ReactElement => {
  return (
    <svg
      className={`dmt-corner-bracket dmt-corner-bracket-${position}`}
      viewBox="0 0 50 50"
    >
      <defs>
        <filter id={`bracket-glow-${position}`}>
          <feGaussianBlur stdDeviation="2" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* Main L-bracket with ornamental details */}
      <path
        d="M 0 18 L 0 0 L 18 0"
        stroke="#c4a57b"
        strokeWidth="3"
        fill="none"
        filter={`url(#bracket-glow-${position})`}
      />
      {/* Inner detail line */}
      <path
        d="M 3 15 L 3 3 L 15 3"
        stroke="rgba(255, 255, 255, 0.4)"
        strokeWidth="1"
        fill="none"
      />
      {/* Small notches for detail */}
      <line
        x1="0" y1="9" x2="5" y2="9"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      <line
        x1="9" y1="0" x2="9" y2="5"
        stroke="#c4a57b"
        strokeWidth="2"
      />
      {/* Corner ornament */}
      <circle
        cx="18" cy="18" r="3"
        fill="none"
        stroke="#c4a57b"
        strokeWidth="1.5"
        filter={`url(#bracket-glow-${position})`}
      />
    </svg>
  );
};

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid' }: DungeonMapTrackerProps): React.ReactElement => {
  const { mapData: rootMapData, isLoading, saveStatus, updateMapData: rootUpdateMapData, forceSave, fowImageReady, tileImagesReady, getCachedImage } = useMapData(mapId, mapName, mapType);

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
    currentHexKey,
    adjacentSubHexes
  } = useSubHexNavigation({ mapData: rootMapData, updateMapData: rootUpdateMapData });

  // Get current file path for deep linking
  const currentFile = dc.useCurrentFile();
  const notePath = currentFile?.$path || '';

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

  // Panel/modal state (plugin installer, settings modal, layer edit)
  const {
    showSettingsModal, setShowSettingsModal,
    showPluginInstaller, setShowPluginInstaller,
    editingLayerId, setEditingLayerId,
    editingLayer, pluginInstalled,
    handleSettingsClick, handleSettingsSave, handleSettingsClose: panelSettingsClose,
    handlePluginInstall, handlePluginDecline
  } = usePanelState({ mapData, updateMapData });

  // UI layout state (expand/collapse, panels, focus, footer, layer visibility)
  const {
    containerRef, isFocused, setIsFocused,
    isExpanded, isAnimating, handleToggleExpand,
    showFooter, setShowFooter,
    showVisibilityToolbar, setShowVisibilityToolbar,
    showLayerPanel, setShowLayerPanel,
    showRegionPanel, setShowRegionPanel,
    layerVisibility, handleToggleLayerVisibility
  } = useUILayout({ mapData, updateMapData, showPluginInstaller });

  // Adjacent sub-map visibility: persisted in global plugin settings
  const [showAdjacentSubMaps, setShowAdjacentSubMapsState] = dc.useState(() =>
    getSettings().showAdjacentSubMaps ?? false
  );
  const setShowAdjacentSubMaps = dc.useCallback((v: boolean) => {
    try {
      const plugin = dc.app.plugins.plugins['dungeon-map-tracker-settings'];
      if (plugin) {
        plugin.settings.showAdjacentSubMaps = v;
        plugin.saveSettings();
        window.dispatchEvent(new Event('dmt-settings-changed'));
      }
    } catch { /* settings plugin unavailable */ }
    setShowAdjacentSubMapsState(v);
  }, []);
  dc.useEffect(() => {
    const handler = () => setShowAdjacentSubMapsState(getSettings().showAdjacentSubMaps ?? false);
    window.addEventListener('dmt-settings-changed', handler);
    return () => window.removeEventListener('dmt-settings-changed', handler);
  }, []);

  // Tile browser state (hex maps only)
  const {
    tileBrowserCollapsed, setTileBrowserCollapsed,
    selectedTilesetId, setSelectedTilesetId,
    selectedTileId, setSelectedTileId,
    tileRotation, setTileRotation,
    tileFlipH, setTileFlipH,
    tileLayer, setTileLayer,
    tileFitMode, setTileFitMode,
    stampMode, setStampMode,
    handleTileSelect, handleTileDeselect,
  } = useTileBrush();
  // Use rootMapData for tileset check — tilesets are built from global settings and stored on root,
  // but sub-maps should also have access to tiles
  const availableTilesets = rootMapData?.tilesets || mapData?.tilesets || [];
  const showTilePanel = mapData?.mapType === 'hex' && availableTilesets.length > 0;

  // Image alignment mode (extracted to useAlignmentMode hook)
  const {
    isAlignmentMode, alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode, handleAlignmentOffsetChange,
    handleAlignmentGridSizeChange, handleAlignmentApply, handleAlignmentCancel
  } = useAlignmentMode({ mapData, updateMapData, setShowSettingsModal });

  // Create geometry instance for coordinate conversions
  // Same logic as MapCanvas for consistency
  const geometry = dc.useMemo((): IGeometry | null => {
    if (!mapData) return null;

    const currentMapType = mapData.mapType || DEFAULTS.mapType;

    if (currentMapType === 'hex') {
      const hexSize = mapData.hexSize || DEFAULTS.hexSize;
      const orientation = mapData.orientation || DEFAULTS.hexOrientation;
      const hexBounds = mapData.hexBounds || null;
      return new HexGeometry(hexSize, orientation, hexBounds);
    } else {
      const gridSize = mapData.gridSize || DEFAULTS.gridSize;
      return new GridGeometry(gridSize);
    }
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
  } : getTheme();

  // Determine canvas height based on device type and settings
  // Detect touch devices using media query match
  const isTouchDevice = dc.useMemo(() => {
    return window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  }, []);

  const canvasHeight = effectiveSettings
    ? (isTouchDevice
        ? (effectiveSettings.canvasHeightMobile ?? 400)
        : (effectiveSettings.canvasHeight ?? 600))
    : (isTouchDevice ? 400 : 600);



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

  // Wrap undo to let in-progress operations (e.g. region creation) cancel first
  const wrappedHandleUndo = dc.useCallback(() => {
    const event = new CustomEvent('windrose:before-undo', { cancelable: true });
    document.dispatchEvent(event);
    if (!event.defaultPrevented) {
      handleUndo();
    }
  }, [handleUndo]);

  // Data change handlers (extracted to useDataHandlers hook)
  const {
    handleNameChange,
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleTilesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleObjectSetChange,
    handleTextLabelSettingsChange,
    handleRegionsChange,
    handleOutlinesChange
  } = useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory });

  // Custom event listeners (sub-hex, deep links, regions, object links, hex context menu)
  useCustomEventHandlers({
    mapData, mapId, geometry, updateMapData,
    handleLayerSelect, enterSubHex, exitSubHex, isInSubHex,
    navigateToSibling,
    handleRegionsChange
  });

  // Adjacent sub-map click-to-navigate
  dc.useEffect(() => {
    if (!showAdjacentSubMaps || !isInSubHex || adjacentSubHexes.length === 0 || !geometry || geometry.type !== 'hex' || !mapData) return;

    const hexGeom = geometry as any;
    const maxRing = mapData.hexBounds?.maxRing || 7;
    const tileStep = 2 * maxRing + 1;

    const handleAdjacentClick = (e: MouseEvent) => {
      const canvas = (e.target as HTMLElement).closest('canvas');
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
      const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

      const viewState = mapData.viewState;
      if (!viewState) return;
      const oX = canvas.width / 2 - viewState.center.x * viewState.zoom;
      const oY = canvas.height / 2 - viewState.center.y * viewState.zoom;

      // Convert click to world coords
      const clickWorldX = (canvasX - oX) / viewState.zoom;
      const clickWorldY = (canvasY - oY) / viewState.zoom;

      // Check each adjacent sub-hex: is the click within its grid bounds?
      for (const adj of adjacentSubHexes) {
        const scaledQ = adj.dq * tileStep;
        const scaledR = adj.dr * tileStep;
        const offset = hexGeom.hexToWorld(scaledQ, scaledR);

        // Click relative to adjacent grid center
        const relX = clickWorldX - offset.worldX;
        const relY = clickWorldY - offset.worldY;

        // Check if within maxRing hex radius (approximate with world-space distance)
        const gridRadius = hexGeom.hexSize * Math.sqrt(3) * maxRing;
        if (relX * relX + relY * relY < gridRadius * gridRadius) {
          // Parse the hex key to get absolute q, r
          const [aq, ar] = adj.hexKey.split(',').map(Number);
          document.dispatchEvent(new CustomEvent('windrose:navigate-sibling-sub-hex', { detail: { q: aq, r: ar } }));
          e.stopPropagation();
          e.preventDefault();
          return;
        }
      }
    };

    document.addEventListener('click', handleAdjacentClick, true);
    return () => document.removeEventListener('click', handleAdjacentClick, true);
  }, [showAdjacentSubMaps, isInSubHex, adjacentSubHexes, geometry, mapData]);

  // View controls (zoom, compass)
  const { handleZoomIn, handleZoomOut, handleCompassClick } = useViewControls({
    mapData, updateMapData, handleViewStateChange
  });

  // MCP bridge: each map instance registers its own state + operations keyed by notePath.
  // No race conditions — the query side picks the active file's state.
  dc.useEffect(() => {
    if (!window.__windrose || !mapData || !notePath || !geometry) return;
    if (!window.__windrose.mcpInstances) window.__windrose.mcpInstances = {};

    const activeLayer = getActiveLayer(mapData);
    const layers = mapData.layers || [];
    window.__windrose.mcpInstances[notePath] = {
      mapId,
      mapName: mapData.name || mapName,
      mapType: mapData.mapType || 'grid',
      viewState: {
        x: mapData.viewState?.offsetX ?? 0,
        y: mapData.viewState?.offsetY ?? 0,
        zoom: mapData.viewState?.zoom ?? 1,
      },
      activeLayerId: activeLayer?.id || '',
      layerCount: layers.length,
      layerIds: layers.map((l: { id: string }) => l.id),
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
        setTool: (toolId: string) => setCurrentTool(toolId),
        setColor: (color: string) => setSelectedColor(color),
        setOpacity: (opacity: number) => handleOpacityChange(opacity),
        paintCell: (x: number, y: number, color?: string, opacity?: number): boolean => {
          if (!activeLayer) return false;
          const c = color || selectedColor;
          const o = opacity ?? selectedOpacity;
          const newCells = accessorSetCell(activeLayer.cells || [], { x, y }, c, o, geometry);
          handleCellsChange(newCells);
          return true;
        },
        paintCells: (cells: Array<{ x: number; y: number; color?: string; opacity?: number }>): number => {
          if (!activeLayer) return 0;
          let currentCells = activeLayer.cells || [];
          for (const cell of cells) {
            const c = cell.color || selectedColor;
            const o = cell.opacity ?? selectedOpacity;
            currentCells = accessorSetCell(currentCells, { x: cell.x, y: cell.y }, c, o, geometry);
          }
          handleCellsChange(currentCells);
          return cells.length;
        },
        eraseCell: (x: number, y: number): boolean => {
          if (!activeLayer) return false;
          const newCells = accessorRemoveCell(activeLayer.cells || [], { x, y }, geometry);
          handleCellsChange(newCells);
          return true;
        },
        getCells: (): Array<{ x: number; y: number; color: string; opacity: number }> => {
          if (!activeLayer) return [];
          return (activeLayer.cells || []).map((cell: { color: string; opacity: number }) => ({
            ...cellToPoint(cell),
            color: cell.color,
            opacity: cell.opacity ?? 1,
          }));
        },
        undo: (): boolean => { wrappedHandleUndo(); return true; },
        redo: (): boolean => { handleRedo(); return true; },
        selectLayer: (layerId: string) => handleLayerSelect(layerId),
        forceSave: () => forceSave(),
      },
    };
  });
  dc.useEffect(() => {
    return () => {
      if (window.__windrose?.mcpInstances) delete window.__windrose.mcpInstances[notePath];
    };
  }, []);

  // Loading state
  if (isLoading) {
    return (
      <div className="dmt-loading">
        Loading map...
      </div>
    );
  }

  // Show plugin installer if needed (before map renders)
  if (showPluginInstaller) {
    return (
      <>
        <style>{combinedCss}</style>
        <div ref={containerRef} className={`dmt-container interactive-child`}>
          <SettingsPluginInstaller
            onInstall={handlePluginInstall}
            onDecline={handlePluginDecline}
          />
        </div>
      </>
    );
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
      <style>{combinedCss}</style>
      <div
        ref={containerRef}
        className={`dmt-container interactive-child`}
      >
        {/* Decorative corner brackets */}
        <CornerBracket position="tl" />
        <CornerBracket position="tr" />
        <CornerBracket position="bl" />
        <CornerBracket position="br" />

        <MapHeader
          mapData={mapData}
          onNameChange={handleNameChange}
          saveStatus={saveStatus}
          onToggleFooter={() => setShowFooter(!showFooter)}
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
                <dc.Icon icon="lucide-layers" />
              </button>
            )}
          </div>
        )}

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
          isColorPickerOpen={isColorPickerOpen}
          onColorPickerOpenChange={setIsColorPickerOpen}
          customColors={mapData.customColors || []}
          paletteColorOpacityOverrides={mapData.paletteColorOpacityOverrides || {}}
          onAddCustomColor={handleAddCustomColor}
          onDeleteCustomColor={handleDeleteCustomColor}
          onUpdateColorOpacity={handleUpdateColorOpacity}
          mapType={mapData.mapType}
          isFocused={isFocused}
        />

        <VisibilityToolbar
          isOpen={showVisibilityToolbar}
          layerVisibility={layerVisibility}
          onToggleLayer={handleToggleLayerVisibility}
          mapType={mapData.mapType}
          // Fog of War props
          fogOfWarState={currentFogState}
          showFogTools={showFogTools}
          onFogToolsToggle={handleFogToolsToggle}
          onFogToolSelect={handleFogToolSelect}
          onFogVisibilityToggle={handleFogVisibilityToggle}
          onFogFillAll={handleFogFillAll}
          onFogClearAll={handleFogClearAll}
        />

        <div
          className="dmt-canvas-wrapper"
          style={{ height: `${canvasHeight}px` }}
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          <ObjectSidebar
            selectedObjectType={selectedObjectType}
            onObjectTypeSelect={setSelectedObjectType}
            onToolChange={setCurrentTool}
            isCollapsed={mapData.sidebarCollapsed || false}
            onCollapseChange={handleSidebarCollapseChange}
            mapType={mapData.mapType || 'grid'}
            objectSetId={mapData.objectSetId}
            onObjectSetChange={handleObjectSetChange}
            isFreeformMode={freeformPlacementMode}
            onFreeformToggle={() => setFreeformPlacementMode(prev => !prev)}
          />

          {/* Left side panels container — layers + regions stacked */}
          <div className={`dmt-left-panels ${mapData.sidebarCollapsed ? 'sidebar-closed' : 'sidebar-open'}`}>
            {/* Layer Controls Panel (Z-Layer System) */}
            <LayerControls
              mapData={mapData}
              onLayerSelect={handleLayerSelect}
              onLayerAdd={handleLayerAdd}
              onLayerDelete={handleLayerDelete}
              onLayerReorder={handleLayerReorder}
              onToggleShowLayerBelow={handleToggleShowLayerBelow}
              onSetLayerBelowOpacity={handleSetLayerBelowOpacity}
              onEditLayer={setEditingLayerId}
              sidebarCollapsed={mapData.sidebarCollapsed || false}
              isOpen={showLayerPanel}
            />

            {/* Region Panel (hex maps only) */}
            {mapData.mapType === 'hex' && (
              <RegionPanel
                regions={mapData.regions || []}
                onRegionsChange={handleRegionsChange}
                sidebarCollapsed={mapData.sidebarCollapsed || false}
                isOpen={showRegionPanel}
              />
            )}
          </div>

          {/* For hex maps, override northDirection to 0 for rendering while keeping real value for compass display */}
          {/* This allows the compass to show and persist the north direction without actually rotating hex maps */}
          <div className="dmt-canvas-and-controls">
            <MapCanvas
              mapId={mapId}
              notePath={notePath}
              mapData={mapData.mapType === 'hex' ? { ...mapData, northDirection: 0, tilesets: availableTilesets.length > 0 ? availableTilesets : mapData.tilesets } : mapData}
              onCellsChange={handleCellsChange}
              onCurvesChange={handleCurvesChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
              onTilesChange={handleTilesChange}
              tileImagesReady={tileImagesReady}
              onViewStateChange={handleViewStateChange}
              onTextLabelSettingsChange={handleTextLabelSettingsChange}
              currentTool={currentTool}
              isAlignmentMode={isAlignmentMode}
              selectedObjectType={selectedObjectType}
              selectedColor={selectedColor}
              isColorPickerOpen={isColorPickerOpen}
              customColors={mapData.customColors || []}
              onAddCustomColor={handleAddCustomColor}
              onDeleteCustomColor={handleDeleteCustomColor}
              isFocused={isFocused}
              isAnimating={isAnimating}
              theme={theme}
              layerVisibility={layerVisibility}
              adjacentSubHexes={showAdjacentSubMaps && isInSubHex ? adjacentSubHexes : null}
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
                customColors={mapData.customColors || []}
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
                customColors={mapData.customColors || []}
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
                  onInitializeFog={(updatedMapData: MapData) => updateMapData(updatedMapData)}
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
                stampMode={stampMode}
                onTilesChange={handleTilesChange}
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

              {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
              <MapCanvas.HexCoordinateLayer />

              {/* MeasurementLayer - distance measurement tool overlay */}
              <MapCanvas.MeasurementLayer
                currentTool={currentTool}
                globalSettings={effectiveSettings}
                mapDistanceOverrides={mapData?.settings?.distanceSettings}
              />

              {/* DiagonalFillOverlay - diagonal fill tool preview */}
              <MapCanvas.DiagonalFillOverlay
                currentTool={currentTool}
              />

              {/* Re-roll button for generated dungeons */}
              <MapCanvas.RerollDungeonButton />
            </MapCanvas>

            <MapControls
              onZoomIn={handleZoomIn}
              onZoomOut={handleZoomOut}
              onCompassClick={handleCompassClick}
              onSettingsClick={handleSettingsClick}
              northDirection={mapData.northDirection}
              currentZoom={mapData.viewState.zoom}
              isExpanded={isExpanded}
              onToggleExpand={handleToggleExpand}
              mapType={mapData.mapType}
              showLayerPanel={showLayerPanel}
              onToggleLayerPanel={() => setShowLayerPanel(!showLayerPanel)}
              showRegionPanel={showRegionPanel}
              onToggleRegionPanel={mapData.mapType === 'hex' ? () => setShowRegionPanel(!showRegionPanel) : undefined}
              showVisibilityToolbar={showVisibilityToolbar}
              onToggleVisibilityToolbar={() => setShowVisibilityToolbar(!showVisibilityToolbar)}
              alwaysShowControls={effectiveSettings?.alwaysShowControls ?? false}
            />
          </div>

          {/* Tile Asset Browser (right sidebar, hex maps with tilesets only) */}
          {showTilePanel && (
            <TileAssetBrowser
              tilesets={availableTilesets}
              selectedTilesetId={selectedTilesetId}
              selectedTileId={selectedTileId}
              onTileSelect={handleTileSelect}
              onTileDeselect={handleTileDeselect}
              onToolChange={setCurrentTool}
              isCollapsed={tileBrowserCollapsed}
              onCollapseChange={setTileBrowserCollapsed}
              rotation={tileRotation}
              flipH={tileFlipH}
              onRotationChange={setTileRotation}
              onFlipChange={setTileFlipH}
              tileLayer={tileLayer}
              onTileLayerChange={setTileLayer}
              tileFitMode={tileFitMode}
              onTileFitModeChange={setTileFitMode}
              stampMode={stampMode}
              onStampModeChange={setStampMode}
              getCachedImage={getCachedImage}
            />
          )}
        </div>

        {showFooter && (
          <div className="dmt-footer">
            Map ID: {mapId} | Color: {getColorDisplayName()} | {
              currentTool === 'select' ? 'Click to select text/objects | Drag to move | Press R to rotate | Press Delete to remove' :
                currentTool === 'draw' ? 'Click/drag to draw' :
                  currentTool === 'erase' ? 'Click/drag to erase (text first, then objects, then cells)' :
                    currentTool === 'rectangle' ? 'Click two corners to fill rectangle' :
                      currentTool === 'circle' ? 'Click edge point, then center to fill circle' :
                        currentTool === 'clearArea' ? 'Click two corners to clear area' :
                          currentTool === 'addObject' ? (selectedObjectType ? 'Click to place object' : 'Select an object from the sidebar') :
                            currentTool === 'addNote' ? 'Click to place note pin' :
                            currentTool === 'addText' ? 'Click to add text label' :
                              'Select a tool'
            } | Undo/redo available | Middle-click or two-finger drag to pan | Scroll to zoom | Click compass to rotate | {getActiveLayer(mapData).cells.length} cells filled | {(getActiveLayer(mapData).objects || []).length} objects placed | {(getActiveLayer(mapData).textLabels || []).length} text labels
          </div>
        )}

        {/* Map Settings Modal */}
        <MapSettingsModal
          isOpen={showSettingsModal}
          onClose={handleSettingsClose}
          onSave={handleSettingsSave}
          onOpenAlignmentMode={handleOpenAlignmentMode}
          initialTab={returningFromAlignment ? (mapData?.mapType === 'hex' ? 'hexgrid' : 'gridbackground') : null}
          mapType={mapData?.mapType || 'grid'}
          orientation={mapData?.orientation || 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentObjectSetId={mapData.objectSetId}
          currentBackgroundImage={mapData.backgroundImage ?? null}
          currentCells={mapData.mapType === 'hex' ? (getActiveLayer(mapData).cells || []) : []}
          currentObjects={mapData.mapType === 'hex' ? (getActiveLayer(mapData).objects || []) : []}
          mapData={mapData}
          geometry={geometry}
          isInSubHex={isInSubHex}
          subMapName={isInSubHex ? (mapData?.name || null) : null}
        />

        {/* Image Alignment Mode */}
        {isAlignmentMode && mapData.backgroundImage?.path && (
          <ImageAlignmentMode
            dc={dc}
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
                handleUpdateLayerDisplay(editingLayerId!, name, icon);
                setEditingLayerId(null);
              }}
              onCancel={() => setEditingLayerId(null)}
            />
          </ModalPortal>
        )}
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

return { DungeonMapTracker };
