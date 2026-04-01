// DungeonMapTracker.tsx - Main component with undo/redo, objects, text labels, and color support

import type {
  MapData,
  MapType,
  ViewState,
  IGeometry,
  ToolId,
  ObjectTypeId,
  Cell,
  MapObject,
  TextLabel,
  Edge,
  TextLabelSettings,
  FogToolId,
  LayerVisibility,
  BackgroundImage,
  UIPreferences,
  MapSettings,
  MapLayer,
} from '#types/index';
import type { ResolvedTheme } from '#types/settings/settings.types';

// ============================================================================
// IMPORTS
// ============================================================================

const { requireModuleByName, getBasePath } = await dc.require(`${window.__dmtBasePath}/utils/pathResolver.ts`);


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
const { getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.ts");
const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");
const { getColorByHex, isDefaultColor } = await requireModuleByName("colorOperations.ts");
const { ImageAlignmentMode } = await requireModuleByName("ImageAlignmentMode.tsx");
const { useAlignmentMode } = await requireModuleByName("useAlignmentMode.ts");
const { ModalPortal } = await requireModuleByName("ModalPortal.tsx");

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts");
const { LayerControls } = await requireModuleByName("LayerControls.tsx");
const { RegionPanel } = await requireModuleByName("RegionPanel.tsx");
const { LayerEditModal } = await requireModuleByName("LayerEditModal.tsx");
const { useSubHexNavigation } = await requireModuleByName("useSubHexNavigation.ts");
const { useCustomEventHandlers } = await requireModuleByName("useCustomEventHandlers.ts");
const { useUILayout } = await requireModuleByName("useUILayout.ts");
const { usePanelState } = await requireModuleByName("usePanelState.ts");
const { getObsidianModule, isBridgeAvailable } = await requireModuleByName("obsidianBridge.ts");
const { openNativeNoteLinkModal } = await requireModuleByName("NoteLinkModal.tsx") as {
  openNativeNoteLinkModal: (options: { onSave: (path: string) => void; onClose: () => void; currentNotePath: string | null; objectType: string | null }) => boolean;
};
const { SubHexBreadcrumb } = await requireModuleByName("SubHexBreadcrumb.tsx");

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

interface LayerVisibilityState {
  grid: boolean;
  objects: boolean;
  textLabels: boolean;
  hexCoordinates: boolean;
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
  const { mapData: rootMapData, isLoading, saveStatus, updateMapData: rootUpdateMapData, forceSave, fowImageReady } = useMapData(mapId, mapName, mapType);

  const {
    activeMapData: mapData,
    activeUpdateMapData: updateMapData,
    isInSubHex,
    breadcrumbs,
    enterSubHex,
    exitSubHex,
    navigateToLevel,
    navigationVersion
  } = useSubHexNavigation({ mapData: rootMapData, updateMapData: rootUpdateMapData });

  // Get current file path for deep linking
  const currentFile = dc.useCurrentFile();
  const notePath = currentFile?.$path || '';

  // Tool and color state (extracted to useToolState hook)
  const {
    currentTool, setCurrentTool,
    selectedObjectType, setSelectedObjectType,
    selectedColor, setSelectedColor,
    selectedOpacity, setSelectedOpacity,
    isColorPickerOpen, setIsColorPickerOpen
  } = useToolState();

  const [freeformPlacementMode, setFreeformPlacementMode] = dc.useState(false);

  // Panel/modal state (plugin installer, settings modal, layer edit)
  const {
    showSettingsModal, setShowSettingsModal,
    showPluginInstaller, setShowPluginInstaller,
    editingLayerId, setEditingLayerId,
    editingLayer, pluginInstalled,
    handleSettingsClick, handleSettingsSave, handleSettingsClose: panelSettingsClose,
    handlePluginInstall, handlePluginDecline
  } = usePanelState({ mapData, updateMapData });

  // UI layout state (expand/collapse, panels, focus, footer)
  const {
    containerRef, isFocused, setIsFocused,
    isExpanded, isAnimating, handleToggleExpand,
    showFooter, setShowFooter,
    showVisibilityToolbar, setShowVisibilityToolbar,
    showLayerPanel, setShowLayerPanel,
    showRegionPanel, setShowRegionPanel
  } = useUILayout({ mapData, updateMapData, showPluginInstaller });

  // Image alignment mode (extracted to useAlignmentMode hook)
  const {
    isAlignmentMode, alignmentOffsetX, alignmentOffsetY,
    returningFromAlignment, setReturningFromAlignment,
    handleOpenAlignmentMode, handleAlignmentOffsetChange,
    handleAlignmentGridSizeChange, handleAlignmentApply, handleAlignmentCancel
  } = useAlignmentMode({ mapData, updateMapData, setShowSettingsModal });

  // Layer visibility state (session-only, resets on reload)
  const [layerVisibility, setLayerVisibility] = dc.useState<LayerVisibilityState>({
    grid: true,
    objects: true,
    textLabels: true,
    hexCoordinates: false
  });

  // Toggle a specific layer's visibility
  const handleToggleLayerVisibility = dc.useCallback((layerId: keyof LayerVisibilityState) => {
    setLayerVisibility((prev: LayerVisibilityState) => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  }, []);

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



  // Initialize opacity from mapData when loaded
  dc.useEffect(() => {
    if (!mapData) return;

    if (mapData.lastSelectedOpacity !== undefined) {
      setSelectedOpacity(mapData.lastSelectedOpacity);
    }
  }, [mapData?.lastSelectedOpacity]);

  // Handler to update opacity and persist to mapData
  const handleOpacityChange = dc.useCallback((newOpacity: number) => {
    setSelectedOpacity(newOpacity);
    updateMapData((currentMapData: MapData) => ({
      ...currentMapData,
      lastSelectedOpacity: newOpacity
    }));
  }, [updateMapData]);


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

  // Custom event listeners (sub-hex, deep links, regions, object links)
  useCustomEventHandlers({
    mapData, mapId, geometry, updateMapData,
    handleLayerSelect, enterSubHex, exitSubHex, isInSubHex
  });

  // Data change handlers (extracted to useDataHandlers hook)
  const {
    handleNameChange,
    handleCellsChange,
    handleCurvesChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleTextLabelSettingsChange,
    handleRegionsChange
  } = useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory });

  // Listen for general hex context menu events (after handleRegionsChange is available)
  dc.useEffect(() => {
    const handleHexContextMenu = (event: CustomEvent): void => {
      if (!mapData || mapData.mapType !== 'hex' || !isBridgeAvailable()) return;

      const { q, r, screenX, screenY } = event.detail;
      const hexKey = `${q},${r}`;
      const hasSubHex = !!(mapData.subHexMaps && mapData.subHexMaps[hexKey]);

      const obs = getObsidianModule();
      const MenuClass = obs.Menu as new () => {
        addItem: (cb: (item: any) => void) => any;
        addSeparator: () => any;
        showAtPosition: (pos: { x: number; y: number }) => void;
      };

      const menu = new MenuClass();

      menu.addItem((item: any) => {
        item.setTitle(hasSubHex ? `Enter Sub-Hex (${q}, ${r})` : `Create Sub-Hex (${q}, ${r})`);
        item.setIcon(hasSubHex ? 'lucide-arrow-down-right' : 'lucide-plus-circle');
        item.onClick(() => enterSubHex(q, r));
      });

      // Region actions if this hex belongs to a region
      const region = (mapData.regions || []).find((reg: any) =>
        reg.hexes.some((h: any) => h.x === q && h.y === r)
      );
      if (region) {
        menu.addSeparator();

        menu.addItem((item: any) => {
          item.setTitle(`Edit Region: ${region.name}`);
          item.setIcon('lucide-pencil');
          item.onClick(() => {
            document.dispatchEvent(new CustomEvent('windrose:edit-region', { detail: { regionId: region.id } }));
          });
        });

        menu.addItem((item: any) => {
          item.setTitle(region.visible ? 'Hide Region' : 'Show Region');
          item.setIcon(region.visible ? 'lucide-eye-off' : 'lucide-eye');
          item.onClick(() => {
            const updated = (mapData.regions || []).map((r: any) =>
              r.id === region.id ? { ...r, visible: !r.visible } : r
            );
            handleRegionsChange(updated);
          });
        });

        if (region.linkedNote) {
          menu.addItem((item: any) => {
            item.setTitle('Open Linked Note');
            item.setIcon('lucide-external-link');
            item.onClick(() => {
              const linkPath = region.linkedNote.replace(/\.md$/, '');
              dc.app.workspace.openLinkText(linkPath, '', false);
            });
          });
        }

        menu.addItem((item: any) => {
          item.setTitle(region.linkedNote ? 'Change Linked Note' : 'Link Note');
          item.setIcon('lucide-link');
          item.onClick(() => {
            openNativeNoteLinkModal({
              onSave: (notePath: string) => {
                const updated = (mapData.regions || []).map((r: any) =>
                  r.id === region.id ? { ...r, linkedNote: notePath || undefined } : r
                );
                handleRegionsChange(updated);
              },
              onClose: () => {},
              currentNotePath: region.linkedNote || null,
              objectType: null
            });
          });
        });

        menu.addSeparator();

        menu.addItem((item: any) => {
          item.setTitle('Delete Region');
          item.setIcon('lucide-trash-2');
          item.setWarning(true);
          item.onClick(() => {
            handleRegionsChange((mapData.regions || []).filter((r: any) => r.id !== region.id));
          });
        });
      }

      menu.showAtPosition({ x: screenX, y: screenY });
    };

    document.addEventListener('windrose:hex-context-menu', handleHexContextMenu as EventListener);
    return () => document.removeEventListener('windrose:hex-context-menu', handleHexContextMenu as EventListener);
  }, [mapData, enterSubHex, handleRegionsChange]);

  // Zoom in (increase zoom by step)
  const handleZoomIn = (): void => {
    if (!mapData) return;
    const newZoom = Math.min(
      DEFAULTS.maxZoom,
      mapData.viewState.zoom + DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  // Zoom out (decrease zoom by step)
  const handleZoomOut = (): void => {
    if (!mapData) return;
    const newZoom = Math.max(
      DEFAULTS.minZoom,
      mapData.viewState.zoom - DEFAULTS.zoomButtonStep
    );
    handleViewStateChange({
      ...mapData.viewState,
      zoom: newZoom
    });
  };

  // Compass click - cycle through rotations
  const handleCompassClick = (): void => {
    if (!mapData) return;

    // Cycle through: 0 -> 90 -> 180 -> 270 -> 0 degrees
    const rotations = [0, 90, 180, 270];
    const currentIndex = rotations.indexOf(mapData.northDirection);
    const nextIndex = (currentIndex + 1) % rotations.length;
    const newRotation = rotations[nextIndex];

    const newMapData = {
      ...mapData,
      northDirection: newRotation
    };
    updateMapData(newMapData);
  };




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
          <SubHexBreadcrumb
            breadcrumbs={breadcrumbs}
            onNavigate={navigateToLevel}
          />
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
              mapData={mapData.mapType === 'hex' ? { ...mapData, northDirection: 0 } : mapData}
              onCellsChange={handleCellsChange}
              onCurvesChange={handleCurvesChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onEdgesChange={handleEdgesChange}
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

              {/* RegionLayer - hex region creation and editing */}
              <MapCanvas.RegionLayer
                currentTool={currentTool}
                selectedColor={selectedColor}
                selectedOpacity={selectedOpacity}
                onRegionsChange={handleRegionsChange}
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
          </div>

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
