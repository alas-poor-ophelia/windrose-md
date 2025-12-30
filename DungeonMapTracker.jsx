// DungeonMapTracker.jsx - Main component with undo/redo, objects, text labels, and color support

// ============================================================================
// IMPORTS
// ============================================================================

const { requireModuleByName, getBasePath } = await dc.require(`${window.__dmtBasePath}/utils/pathResolver.js`);


const css = await app.vault.cachedRead(
  await app.vault.getFileByPath(`${getBasePath()}/css/WindroseMD-CSS.css`)
);

const combinedCss = [
  css,
].join('\n');


const { useMapData } = await requireModuleByName("useMapData.js");
const { useLayerHistory } = await requireModuleByName("useLayerHistory.js");
const { useToolState } = await requireModuleByName("useToolState.js");
const { useFogOfWar } = await requireModuleByName("useFogOfWar.js");
const { useDataHandlers } = await requireModuleByName("useDataHandlers.js");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { HexGeometry } = await requireModuleByName("HexGeometry.js");
const { MapHeader } = await requireModuleByName("MapHeader.jsx");
const { MapCanvas } = await requireModuleByName("MapCanvas.jsx");
const { MapControls } = await requireModuleByName("MapControls.jsx");
const { ToolPalette } = await requireModuleByName("ToolPalette.jsx");
const { ObjectSidebar } = await requireModuleByName("ObjectSidebar.jsx");
const { VisibilityToolbar } = await requireModuleByName("VisibilityToolbar.jsx");
const { SettingsPluginInstaller, shouldOfferUpgrade } = await requireModuleByName("SettingsPluginInstaller.jsx");
const { MapSettingsModal } = await requireModuleByName("MapSettingsModal.jsx");
const { getSetting, getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.js");
const { DEFAULTS } = await requireModuleByName("dmtConstants.ts");
const { getColorByHex, isDefaultColor } = await requireModuleByName("colorOperations.js");
const { axialToOffset, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js");
const { ImageAlignmentMode } = await requireModuleByName("ImageAlignmentMode.jsx");
const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");

const { getActiveLayer } = await requireModuleByName("layerAccessor.js");
const { LayerControls } = await requireModuleByName("LayerControls.jsx");

// RPGAwesome icon font support
const { RA_ICONS } = await requireModuleByName("rpgAwesomeIcons.js");
const { injectIconCSS } = await requireModuleByName("rpgAwesomeLoader.js");



// Inject RPGAwesome icon CSS classes on module load
injectIconCSS(RA_ICONS);


// ============================================================================
// MAIN COMPONENT
// ============================================================================

// Corner Bracket SVG Component
const CornerBracket = ({ position }) => {
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

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid' }) => {
  const { mapData, isLoading, saveStatus, updateMapData, forceSave, fowImageReady } = useMapData(mapId, mapName, mapType);
  
  // Tool and color state (extracted to useToolState hook)
  const {
    currentTool, setCurrentTool,
    selectedObjectType, setSelectedObjectType,
    selectedColor, setSelectedColor,
    selectedOpacity, setSelectedOpacity,
    isColorPickerOpen, setIsColorPickerOpen
  } = useToolState();
  
  const [showFooter, setShowFooter] = dc.useState(false);
  const [isFocused, setIsFocused] = dc.useState(false);
  const [isExpanded, setIsExpanded] = dc.useState(false);
  const [isAnimating, setIsAnimating] = dc.useState(false);
  const [pluginInstalled, setPluginInstalled] = dc.useState(null); // null = checking, true/false = result
  const [showPluginInstaller, setShowPluginInstaller] = dc.useState(false);
  const [settingsVersion, setSettingsVersion] = dc.useState(0); // Incremented to force re-render on settings change
  const [showSettingsModal, setShowSettingsModal] = dc.useState(false);
  const [showVisibilityToolbar, setShowVisibilityToolbar] = dc.useState(false);
  const [showLayerPanel, setShowLayerPanel] = dc.useState(false);
  
  // Image alignment mode state
  const [isAlignmentMode, setIsAlignmentMode] = dc.useState(false);
  const [alignmentOffsetX, setAlignmentOffsetX] = dc.useState(0);
  const [alignmentOffsetY, setAlignmentOffsetY] = dc.useState(0);
  const [returningFromAlignment, setReturningFromAlignment] = dc.useState(false);
  
  // Layer visibility state (session-only, resets on reload)
  const [layerVisibility, setLayerVisibility] = dc.useState({
    objects: true,
    textLabels: true,
    hexCoordinates: false
  });
  
  // Toggle a specific layer's visibility
  const handleToggleLayerVisibility = dc.useCallback((layerId) => {
    setLayerVisibility(prev => ({
      ...prev,
      [layerId]: !prev[layerId]
    }));
  }, []);
  
  // Create geometry instance for coordinate conversions
  // Same logic as MapCanvas for consistency
  const geometry = dc.useMemo(() => {
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
  const theme = effectiveSettings ? {
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

  // Check if settings plugin is installed
  dc.useEffect(() => {
    async function checkPlugin() {
      try {
        const pluginDir = '.obsidian/plugins/dungeon-map-tracker-settings';
        const exists = await dc.app.vault.adapter.exists(pluginDir);
        setPluginInstalled(exists);
      } catch (error) {
        console.error('[DungeonMapTracker] Error checking plugin:', error);
        setPluginInstalled(false);
      }
    }
    checkPlugin();
  }, []);

  // Determine if we should show the plugin installer (install or upgrade mode)
  dc.useEffect(() => {
    if (pluginInstalled === null || !mapData) return; // Still checking or data not loaded
    
    // Check if we should show installer for new install
    if (!pluginInstalled && !mapData.settingsPluginDeclined) {
      setShowPluginInstaller(true);
      return;
    }
    
    // Check if we should show installer for upgrade
    if (pluginInstalled && shouldOfferUpgrade()) {
      setShowPluginInstaller(true);
      return;
    }
    
    // Otherwise, hide installer
    setShowPluginInstaller(false);
  }, [pluginInstalled, mapData]);

  // Initialize expanded state from settings or saved state (only if not showing installer)
  dc.useEffect(() => {
    if (showPluginInstaller || !mapData) return; // Don't apply if showing installer or no data
    
    // Small delay to ensure plugins are loaded
    const timer = setTimeout(() => {
      try {
        // Check if we should remember expanded state for this map
        if (mapData.uiPreferences?.rememberExpandedState && mapData.expandedState !== undefined) {
          // Use saved expanded state
          if (mapData.expandedState && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        } else {
          // Fall back to global expandedByDefault setting
          const expandedByDefault = getSetting('expandedByDefault');
          if (expandedByDefault && !isExpanded) {
            setIsExpanded(true);
            setIsAnimating(false);
          }
        }
      } catch (error) {
        console.warn('[DungeonMapTracker] Error reading expanded state:', error);
        // Continue with default (not expanded)
      }
    }, 100);
    
    return () => clearTimeout(timer);
  }, [showPluginInstaller, mapData]); // Run when installer status or map data changes

  // Initialize opacity from mapData when loaded
  dc.useEffect(() => {
    if (!mapData) return;
    
    if (mapData.lastSelectedOpacity !== undefined) {
      setSelectedOpacity(mapData.lastSelectedOpacity);
    }
  }, [mapData?.lastSelectedOpacity]);

  // Handler to update opacity and persist to mapData
  const handleOpacityChange = dc.useCallback((newOpacity) => {
    setSelectedOpacity(newOpacity);
    updateMapData(currentMapData => ({
      ...currentMapData,
      lastSelectedOpacity: newOpacity
    }));
  }, [updateMapData]);

  // Listen for settings changes and force re-render
  dc.useEffect(() => {
    const handleSettingsChange = () => {
      // Increment settingsVersion to force component re-render
      // This causes getTheme() to be called again with fresh settings
      setSettingsVersion(prev => prev + 1);
    };
    
    window.addEventListener('dmt-settings-changed', handleSettingsChange);
    
    return () => {
      window.removeEventListener('dmt-settings-changed', handleSettingsChange);
    };
  }, []);

  // Handle plugin installation
  const handlePluginInstall = () => {
    setPluginInstalled(true);
    setShowPluginInstaller(false);
  };

  // Handle plugin decline
  const handlePluginDecline = () => {
    if (mapData) {
      updateMapData({
        ...mapData,
        settingsPluginDeclined: true
      });
    }
    setShowPluginInstaller(false);
  };

  // Layer and history management (extracted to useLayerHistory hook)
  const {
    // Layer management
    handleLayerSelect,
    handleLayerAdd,
    handleLayerDelete,
    handleLayerReorder,
    // History state
    canUndo,
    canRedo,
    // History actions
    handleUndo,
    handleRedo,
    // For data change handlers
    addToHistory,
    isApplyingHistory
  } = useLayerHistory({ mapData, updateMapData, isLoading });

  // Data change handlers (extracted to useDataHandlers hook)
  const {
    handleNameChange,
    handleCellsChange,
    handleObjectsChange,
    handleTextLabelsChange,
    handleEdgesChange,
    handleAddCustomColor,
    handleDeleteCustomColor,
    handleUpdateColorOpacity,
    handleViewStateChange,
    handleSidebarCollapseChange,
    handleTextLabelSettingsChange
  } = useDataHandlers({ mapData, updateMapData, addToHistory, isApplyingHistory });

  const containerRef = dc.useRef(null);

  // Effect to manage parent element classes
  dc.useEffect(() => {
    if (!containerRef.current) return;
    
    const container = containerRef.current;
    
    // Walk up to find cm-embed-block
    let cmEmbedBlock = container.parentElement;
    while (cmEmbedBlock && !cmEmbedBlock.classList.contains('cm-embed-block')) {
      cmEmbedBlock = cmEmbedBlock.parentElement;
      if (cmEmbedBlock?.classList.contains('cm-editor')) {
        cmEmbedBlock = null;
        break;
      }
    }
    
    // Manage classes on container
    container.classList.toggle('dmt-expanded', isExpanded);
    container.classList.toggle('dmt-animating', isAnimating);
    
    // Manage classes on parent if found
    if (cmEmbedBlock) {
      cmEmbedBlock.classList.add('dmt-cm-parent');
      cmEmbedBlock.classList.toggle('dmt-cm-expanded', isExpanded);
      cmEmbedBlock.classList.toggle('dmt-cm-animating', isAnimating);
    }
    
    // Cleanup
    return () => {
      container.classList.remove('dmt-expanded', 'dmt-animating');
      cmEmbedBlock?.classList.remove('dmt-cm-parent', 'dmt-cm-expanded', 'dmt-cm-animating');
    };
  }, [isExpanded, isAnimating]);

  // Zoom in (increase zoom by step)
  const handleZoomIn = () => {
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
  const handleZoomOut = () => {
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
  const handleCompassClick = () => {
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

  const animationTimeoutRef = dc.useRef(null);

  const handleToggleExpand = () => {
    
    // Clear any pending animation timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
      animationTimeoutRef.current = null;
    }
    
    const newExpandedState = !isExpanded;
    
    if (newExpandedState) {
      setIsExpanded(true);
      setIsAnimating(false);
    } else {
      setIsAnimating(true);
      setIsExpanded(false);
      
      animationTimeoutRef.current = setTimeout(() => {
        setIsAnimating(false);
        animationTimeoutRef.current = null;
      }, 300);
    }
    
    // Save expanded state if preference is enabled
    if (mapData && mapData.uiPreferences?.rememberExpandedState) {
      const newMapData = {
        ...mapData,
        expandedState: newExpandedState
      };
      updateMapData(newMapData);
    }
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleSettingsSave = (settingsData, preferencesData, hexBounds = null, backgroundImage = undefined, hexSize = null, deleteOrphanedContent = false) => {
    if (!mapData) return;
    
    const newMapData = {
      ...mapData,
      settings: settingsData,
      uiPreferences: preferencesData
    };
    
    // Only update hexBounds for hex maps
    if (hexBounds !== null && mapData.mapType === 'hex') {
      newMapData.hexBounds = hexBounds;
      
      // If requested, delete content that would be outside the new bounds
      if (deleteOrphanedContent) {
        const orientation = mapData.orientation || 'flat';
        
        // Filter cells to keep only those within new bounds
        if (newMapData.cells && newMapData.cells.length > 0) {
          newMapData.cells = newMapData.cells.filter(cell => {
            const { col, row } = axialToOffset(cell.q, cell.r, orientation);
            return isWithinOffsetBounds(col, row, hexBounds);
          });
        }
        
        // Filter objects to keep only those within new bounds
        if (newMapData.objects && newMapData.objects.length > 0) {
          newMapData.objects = newMapData.objects.filter(obj => {
            const { col, row } = axialToOffset(obj.position.x, obj.position.y, orientation);
            return isWithinOffsetBounds(col, row, hexBounds);
          });
        }
      }
    }
    
    // Only update backgroundImage for hex maps
    if (backgroundImage !== undefined && mapData.mapType === 'hex') {
      newMapData.backgroundImage = backgroundImage;
    }
    
    // Update hexSize if calculated from background image
    if (hexSize !== null && mapData.mapType === 'hex') {
      newMapData.hexSize = hexSize;
    } else {
      }
    
    updateMapData(newMapData);
    
    // Force re-render to apply new settings
    setSettingsVersion(prev => prev + 1);
  };


  const handleSettingsClose = () => {
    setShowSettingsModal(false);
    setReturningFromAlignment(false); // Reset flag when modal closes
  };

  // Image alignment mode handlers
  const handleOpenAlignmentMode = dc.useCallback((currentX, currentY) => {
    setAlignmentOffsetX(currentX);
    setAlignmentOffsetY(currentY);
    setIsAlignmentMode(true);
    setShowSettingsModal(false); // Hide settings modal
  }, []);

  const handleAlignmentOffsetChange = dc.useCallback((newX, newY) => {
    setAlignmentOffsetX(newX);
    setAlignmentOffsetY(newY);
    
    // Update the map data immediately for visual feedback
    if (mapData && mapData.backgroundImage) {
      updateMapData({
        ...mapData,
        backgroundImage: {
          ...mapData.backgroundImage,
          offsetX: newX,
          offsetY: newY
        }
      });
    }
  }, [mapData, updateMapData]);

  const handleAlignmentApply = dc.useCallback((finalX, finalY) => {
    // Offset values are already in mapData from handleAlignmentOffsetChange
    setIsAlignmentMode(false);
    setReturningFromAlignment(true); // Flag that we're returning from alignment
    setShowSettingsModal(true); // Reopen settings modal
  }, []);

  const handleAlignmentCancel = dc.useCallback((originalX, originalY) => {
    // Revert to original offset
    setAlignmentOffsetX(originalX);
    setAlignmentOffsetY(originalY);
    
    if (mapData && mapData.backgroundImage) {
      updateMapData({
        ...mapData,
        backgroundImage: {
          ...mapData.backgroundImage,
          offsetX: originalX,
          offsetY: originalY
        }
      });
    }
    
    setIsAlignmentMode(false);
    setReturningFromAlignment(true); // Flag that we're returning from alignment
    setShowSettingsModal(true); // Reopen settings modal
  }, [mapData, updateMapData]);

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
  const getColorDisplayName = () => {
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

        <ToolPalette
          currentTool={currentTool}
          onToolChange={setCurrentTool}
          onUndo={handleUndo}
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
          />

          {/* Layer Controls Panel (Z-Layer System) */}
          <LayerControls
            mapData={mapData}
            onLayerSelect={handleLayerSelect}
            onLayerAdd={handleLayerAdd}
            onLayerDelete={handleLayerDelete}
            onLayerReorder={handleLayerReorder}
            sidebarCollapsed={mapData.sidebarCollapsed || false}
            isOpen={showLayerPanel}
          />

          {/* For hex maps, override northDirection to 0 for rendering while keeping real value for compass display */}
          {/* This allows the compass to show and persist the north direction without actually rotating hex maps */}
          <div className="dmt-canvas-and-controls">
            <MapCanvas
              mapData={mapData.mapType === 'hex' ? { ...mapData, northDirection: 0 } : mapData}
              onCellsChange={handleCellsChange}
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
              
              {/* ObjectLayer - handles object placement and interactions */}
              <MapCanvas.ObjectLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
                onObjectsChange={handleObjectsChange}
                customColors={mapData.customColors || []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
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
                  onInitializeFog={(updatedMapData) => updateMapData(updatedMapData)}
                />
              )}
              
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
          initialTab={returningFromAlignment ? 'hexgrid' : null}
          mapType={mapData?.mapType || 'grid'}
          orientation={mapData?.orientation || 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentBackgroundImage={mapData.mapType === 'hex' ? mapData.backgroundImage : null}
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
          />
        )}
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

return { DungeonMapTracker };