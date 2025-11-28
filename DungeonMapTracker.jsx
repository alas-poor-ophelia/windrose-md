// DungeonMapTracker.jsx - Main component with undo/redo, objects, text labels, and color support

// ============================================================================
// IMPORTS
// ============================================================================

const { requireModuleByName, getBasePath } = await dc.require(`${window.__dmtBasePath}/utils/pathResolver.js`);


const css = await app.vault.cachedRead(
  await app.vault.getFileByPath(`${getBasePath()}/css/DungeonMapTracker.css`)
);
const fontCss = await app.vault.cachedRead(
  await app.vault.getFileByPath(`${getBasePath()}/css/DungeonMapTracker - FONTS.css`)
);

const combinedCss = [
  css,
  fontCss
].join('\n');


const { useMapData } = await requireModuleByName("useMapData.js");
const { useHistory } = await requireModuleByName("useHistory.js");
const { MapHeader } = await requireModuleByName("MapHeader.jsx");
const { MapCanvas } = await requireModuleByName("MapCanvas.jsx");
const { MapControls } = await requireModuleByName("MapControls.jsx");
const { ToolPalette } = await requireModuleByName("ToolPalette.jsx");
const { ObjectSidebar } = await requireModuleByName("ObjectSidebar.jsx");
const { VisibilityToolbar } = await requireModuleByName("VisibilityToolbar.jsx");
const { SettingsPluginInstaller, shouldOfferUpgrade } = await requireModuleByName("SettingsPluginInstaller.jsx");
const { MapSettingsModal } = await requireModuleByName("MapSettingsModal.jsx");
const { getSetting, getTheme, getEffectiveSettings } = await requireModuleByName("settingsAccessor.js");
const { DEFAULTS } = await requireModuleByName("dmtConstants.js");
const { DEFAULT_COLOR, getColorByHex, isDefaultColor } = await requireModuleByName("colorOperations.js");


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
        strokeWidth="2"
      />
      <line
        x1="9" y1="0" x2="9" y2="5"
        strokeWidth="2"
      />
      {/* Corner ornament */}
      <circle
        cx="18" cy="18" r="3"
        fill="none"
        strokeWidth="1.5"
        filter={`url(#bracket-glow-${position})`}
      />
    </svg>
  );
};

const DungeonMapTracker = ({ mapId = 'default-map', mapName = '', mapType = 'grid' }) => {
  const { mapData, isLoading, saveStatus, updateMapData, forceSave } = useMapData(mapId, mapName, mapType);
  const [currentTool, setCurrentTool] = dc.useState('draw');
  const [selectedObjectType, setSelectedObjectType] = dc.useState(null);
  const [selectedColor, setSelectedColor] = dc.useState(DEFAULT_COLOR);
  const [isColorPickerOpen, setIsColorPickerOpen] = dc.useState(false);
  const [showFooter, setShowFooter] = dc.useState(false);
  const [isFocused, setIsFocused] = dc.useState(false);
  const [isExpanded, setIsExpanded] = dc.useState(false);
  const [isAnimating, setIsAnimating] = dc.useState(false);
  const [pluginInstalled, setPluginInstalled] = dc.useState(null); // null = checking, true/false = result
  const [showPluginInstaller, setShowPluginInstaller] = dc.useState(false);
  const [settingsVersion, setSettingsVersion] = dc.useState(0); // Incremented to force re-render on settings change
  const [showSettingsModal, setShowSettingsModal] = dc.useState(false);
  const [showVisibilityToolbar, setShowVisibilityToolbar] = dc.useState(false);
  
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
  
  // Get current theme with effective settings (global + map overrides)
  // This will be called on every render, fetching fresh settings each time
  const effectiveSettings = mapData ? getEffectiveSettings(mapData.settings) : null;
  const theme = effectiveSettings ? {
    grid: {
      lines: effectiveSettings.gridLineColor,
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

  // Initialize history with empty state (including objects and text labels)
  const {
    currentState: historyState,
    addToHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory
  } = useHistory({ cells: [], name: "", objects: [], textLabels: [] });

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

  // Track if we're applying history (to avoid adding to history during undo/redo)
  const isApplyingHistoryRef = dc.useRef(false);
  const historyInitialized = dc.useRef(false);

  // Initialize history when map data loads (only once)
  dc.useEffect(() => {
    if (mapData && !isLoading && !historyInitialized.current) {
      resetHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: mapData.textLabels || []
      });
      historyInitialized.current = true;
    }
  }, [mapData, isLoading]);

  // Handle map name change
  const handleNameChange = (newName) => {
    if (isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, name: newName };
    updateMapData(newMapData);
    addToHistory({
      cells: mapData.cells,
      name: newName,
      objects: mapData.objects || [],
      textLabels: mapData.textLabels || []
    });
  };

  // Handle cells change (unified handler for all tools)
  const handleCellsChange = (newCells, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, cells: newCells };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched stroke updates)
    if (!suppressHistory) {
      addToHistory({
        cells: newCells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: mapData.textLabels || []
      });
    }
  };

  // Handle objects change
  const handleObjectsChange = (newObjects, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, objects: newObjects };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched operations like resizing)
    if (!suppressHistory) {
      addToHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: newObjects,
        textLabels: mapData.textLabels || []
      });
    }
  };

  // Handle text labels change
  const handleTextLabelsChange = (newTextLabels, suppressHistory = false) => {
    if (!mapData || isApplyingHistoryRef.current) return;

    const newMapData = { ...mapData, textLabels: newTextLabels };
    updateMapData(newMapData);

    // Only add to history if not suppressed (used for batched operations like dragging)
    if (!suppressHistory) {
      addToHistory({
        cells: mapData.cells,
        name: mapData.name,
        objects: mapData.objects || [],
        textLabels: newTextLabels
      });
    }
  };

  // Handle color change
  const handleColorChange = (newColor) => {
    setSelectedColor(newColor);
  };

  const handleAddCustomColor = (newColor) => {
    if (!mapData) {
      return;
    }

    // Generate a unique ID and label for the custom color
    const customColorId = `custom-${Date.now()}`;
    const customColorNumber = (mapData.customColors?.length || 0) + 1;
    const customColorLabel = `Custom ${customColorNumber}`;

    const newCustomColor = {
      id: customColorId,
      color: newColor,
      label: customColorLabel
    };

    const newCustomColors = [...(mapData.customColors || []), newCustomColor];
    const newMapData = {
      ...mapData,
      customColors: newCustomColors
    };

    updateMapData(newMapData);
  };

  const handleDeleteCustomColor = (colorId) => {
    if (!mapData) {
      return;
    }

    const newCustomColors = (mapData.customColors || []).filter(c => c.id !== colorId);
    const newMapData = {
      ...mapData,
      customColors: newCustomColors
    };

    updateMapData(newMapData);
  };

  // Handle view state change (zoom/pan) - NOT tracked in history
  const handleViewStateChange = (newViewState) => {
    if (!mapData) return;
    const newMapData = {
      ...mapData,
      viewState: newViewState
    };
    updateMapData(newMapData);
  };

  // Handle undo
  const handleUndo = () => {
    const previousState = undo();
    if (previousState && mapData) {
      isApplyingHistoryRef.current = true;
      const newMapData = {
        ...mapData,
        cells: previousState.cells,
        name: previousState.name,
        objects: previousState.objects || [],
        textLabels: previousState.textLabels || []
      };
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  };

  // Handle redo
  const handleRedo = () => {
    const nextState = redo();
    if (nextState && mapData) {
      isApplyingHistoryRef.current = true;
      const newMapData = {
        ...mapData,
        cells: nextState.cells,
        name: nextState.name,
        objects: nextState.objects || [],
        textLabels: nextState.textLabels || []
      };
      updateMapData(newMapData);
      // Use setTimeout to ensure state update completes before re-enabling history
      setTimeout(() => {
        isApplyingHistoryRef.current = false;
      }, 0);
    }
  };

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

    // Cycle through: 0ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° -> 90ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° -> 180ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° -> 270ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â° -> 0ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°
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

  const handleSidebarCollapseChange = (isCollapsed) => {
    if (!mapData) return;
    const newMapData = {
      ...mapData,
      sidebarCollapsed: isCollapsed
    };
    updateMapData(newMapData);
  };

  const handleSettingsClick = () => {
    setShowSettingsModal(true);
  };

  const handleSettingsSave = (settingsData, preferencesData, hexBounds = null, backgroundImage = undefined, hexSize = null) => {
    if (!mapData) return;
    
    const newMapData = {
      ...mapData,
      settings: settingsData,
      uiPreferences: preferencesData
    };
    
    // Only update hexBounds for hex maps
    if (hexBounds !== null && mapData.mapType === 'hex') {
      newMapData.hexBounds = hexBounds;
    }
    
    // Only update backgroundImage for hex maps
    if (backgroundImage !== undefined && mapData.mapType === 'hex') {
      newMapData.backgroundImage = backgroundImage;
    }
    
    // Update hexSize if calculated from background image
    if (hexSize !== null && mapData.mapType === 'hex') {
      newMapData.hexSize = hexSize;
    }
    
    updateMapData(newMapData);
    
    // Force re-render to apply new settings
    setSettingsVersion(prev => prev + 1);
  };

  const handleSettingsClose = () => {
    setShowSettingsModal(false);
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
          onColorChange={handleColorChange}
          isColorPickerOpen={isColorPickerOpen}
          onColorPickerOpenChange={setIsColorPickerOpen}
          customColors={mapData.customColors || []}
          onAddCustomColor={handleAddCustomColor}
          onDeleteCustomColor={handleDeleteCustomColor}
          mapType={mapData.mapType}
        />

        <VisibilityToolbar
          isOpen={showVisibilityToolbar}
          layerVisibility={layerVisibility}
          onToggleLayer={handleToggleLayerVisibility}
          mapType={mapData.mapType}
        />

        <div
          className="dmt-canvas-wrapper"
          onMouseEnter={() => setIsFocused(true)}
          onMouseLeave={() => setIsFocused(false)}
        >
          <ObjectSidebar
            selectedObjectType={selectedObjectType}
            onObjectTypeSelect={setSelectedObjectType}
            onToolChange={setCurrentTool}
            isCollapsed={mapData.sidebarCollapsed || false}
            onCollapseChange={handleSidebarCollapseChange}
          />

          <div className="dmt-canvas-and-controls">
            <MapCanvas
              mapData={mapData}
              onCellsChange={handleCellsChange}
              onObjectsChange={handleObjectsChange}
              onTextLabelsChange={handleTextLabelsChange}
              onViewStateChange={handleViewStateChange}
              currentTool={currentTool}
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
              />
              
              {/* ObjectLayer - handles object placement and interactions */}
              <MapCanvas.ObjectLayer
                currentTool={currentTool}
                selectedObjectType={selectedObjectType}
                customColors={mapData.customColors || []}
                onAddCustomColor={handleAddCustomColor}
                onDeleteCustomColor={handleDeleteCustomColor}
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
              
              {/* HexCoordinateLayer - displays coordinate labels when 'C' key is held */}
              <MapCanvas.HexCoordinateLayer />
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
            showVisibilityToolbar={showVisibilityToolbar}
            onToggleVisibilityToolbar={() => setShowVisibilityToolbar(!showVisibilityToolbar)}
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
            } | Undo/redo available | Middle-click or two-finger drag to pan | Scroll to zoom | Click compass to rotate | {mapData.cells.length} cells filled | {(mapData.objects || []).length} objects placed | {(mapData.textLabels || []).length} text labels
          </div>
        )}

        {/* Map Settings Modal */}
        <MapSettingsModal
          isOpen={showSettingsModal}
          onClose={handleSettingsClose}
          onSave={handleSettingsSave}
          mapType={mapData?.mapType || 'grid'}
          orientation={mapData?.orientation || 'flat'}
          currentSettings={mapData.settings}
          currentPreferences={mapData.uiPreferences}
          currentHexBounds={mapData.mapType === 'hex' ? mapData.hexBounds : null}
          currentBackgroundImage={mapData.mapType === 'hex' ? mapData.backgroundImage : null}
        />
      </div>
    </>
  );
};

// ============================================================================
// EXPORTS
// ============================================================================

return { DungeonMapTracker };