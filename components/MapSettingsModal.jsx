const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { ColorPicker } = await requireModuleByName("ColorPicker.jsx");
const { ModalPortal } = await requireModuleByName("ModalPortal.jsx");
const { getSettings, FALLBACK_SETTINGS } = await requireModuleByName("settingsAccessor.js");
const { THEME } = await requireModuleByName("dmtConstants.js");
const { axialToOffset, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js");
const { 
  getImageDisplayNames, 
  getFullPathFromDisplayName, 
  getDisplayNameFromPath,
  getImageDimensions,
  calculateGridFromImage,
  GRID_DENSITY_PRESETS 
} = await requireModuleByName("imageOperations.js");

/**
 * Modal for configuring per-map settings and UI preferences
 * Organized into tabs:
 * 1. Appearance - Color customization
 * 2. Hex Grid (hex maps only) - Bounds, coordinate display, and background image
 * 3. Preferences - UI state persistence options
 */
function MapSettingsModal({ 
  isOpen, 
  onClose, 
  onSave,
  mapType = 'grid',  // 'grid' or 'hex'
  orientation = 'flat',  // 'flat' or 'pointy' - for hex maps
  currentSettings = null,  // { useGlobalSettings: bool, overrides: {...} }
  currentPreferences = null,  // { rememberPanZoom: bool, rememberSidebarState: bool, rememberExpandedState: bool }
  currentHexBounds = null,  // { maxCol: number, maxRow: number } - for hex maps only
  currentBackgroundImage = null,  // { path: string|null, lockBounds: bool, opacity: number } - for hex maps only
  currentDistanceSettings = null,  // { distancePerCell: number, distanceUnit: string, gridDiagonalRule: string, displayFormat: string }
  currentCells = [],  // Array of {q, r, color} - painted cells for hex maps
  currentObjects = []  // Array of objects with {x, y} positions - for checking orphaned content
}) {
  // Get global settings for comparison/defaults
  const globalSettings = getSettings();
  
  // Tab state - default to first tab
  const [activeTab, setActiveTab] = dc.useState('appearance');
  
  // Initialize state with current values or defaults
  const [useGlobalSettings, setUseGlobalSettings] = dc.useState(
    currentSettings?.useGlobalSettings ?? true
  );
  
  const [overrides, setOverrides] = dc.useState({
    gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor,
    gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
    backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor,
    borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor,
    coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor,
    coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor,
    coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow
  });
  
  const [preferences, setPreferences] = dc.useState({
    rememberPanZoom: currentPreferences?.rememberPanZoom ?? true,
    rememberSidebarState: currentPreferences?.rememberSidebarState ?? true,
    rememberExpandedState: currentPreferences?.rememberExpandedState ?? false
  });
  
  // Distance measurement settings (per-map overrides)
  const isHexMap = mapType === 'hex';
  const defaultDistancePerCell = isHexMap 
    ? (globalSettings.distancePerCellHex ?? 6) 
    : (globalSettings.distancePerCellGrid ?? 5);
  const defaultDistanceUnit = isHexMap 
    ? (globalSettings.distanceUnitHex ?? 'mi') 
    : (globalSettings.distanceUnitGrid ?? 'ft');
  
  const [distanceSettings, setDistanceSettings] = dc.useState({
    useGlobalDistance: currentDistanceSettings?.useGlobalDistance ?? true,
    distancePerCell: currentDistanceSettings?.distancePerCell ?? defaultDistancePerCell,
    distanceUnit: currentDistanceSettings?.distanceUnit ?? defaultDistanceUnit,
    gridDiagonalRule: currentDistanceSettings?.gridDiagonalRule ?? (globalSettings.gridDiagonalRule ?? 'alternating'),
    displayFormat: currentDistanceSettings?.displayFormat ?? (globalSettings.distanceDisplayFormat ?? 'both')
  });
  
  const [hexBounds, setHexBounds] = dc.useState({
    maxCol: currentHexBounds?.maxCol ?? 26,
    maxRow: currentHexBounds?.maxRow ?? 20
  });
  
  // Coordinate display settings (for hex maps)
  const [coordinateDisplayMode, setCoordinateDisplayMode] = dc.useState(
    currentSettings?.coordinateDisplayMode ?? 'rectangular'
  );
  
  // Background image state (hex maps only)
  const [backgroundImagePath, setBackgroundImagePath] = dc.useState(
    currentBackgroundImage?.path ?? null
  );
  const [backgroundImageDisplayName, setBackgroundImageDisplayName] = dc.useState(
    currentBackgroundImage?.path ? getDisplayNameFromPath(currentBackgroundImage.path) : ''
  );
  const [imageDimensions, setImageDimensions] = dc.useState(null);
  const [gridDensity, setGridDensity] = dc.useState('medium');
  const [customColumns, setCustomColumns] = dc.useState(24);
  const [savedDensity, setSavedDensity] = dc.useState(null);  // Track saved density preference
  const [boundsLocked, setBoundsLocked] = dc.useState(
    currentBackgroundImage?.lockBounds ?? true  // Lock by default when image exists
  );
  const [imageOpacity, setImageOpacity] = dc.useState(
    currentBackgroundImage?.opacity ?? 1  // Default to fully opaque
  );
  const [imageOffsetX, setImageOffsetX] = dc.useState(
    currentBackgroundImage?.offsetX ?? 0  // Horizontal offset in pixels
  );
  const [imageOffsetY, setImageOffsetY] = dc.useState(
    currentBackgroundImage?.offsetY ?? 0  // Vertical offset in pixels
  );
  const [imageSearchResults, setImageSearchResults] = dc.useState([]);
  
  const [activeColorPicker, setActiveColorPicker] = dc.useState(null);
  const [isLoading, setIsLoading] = dc.useState(false);
  
  // Resize confirmation dialog state
  const [showResizeConfirm, setShowResizeConfirm] = dc.useState(false);
  const [pendingBoundsChange, setPendingBoundsChange] = dc.useState(null); // { newBounds, previousBounds }
  const [orphanInfo, setOrphanInfo] = dc.useState({ cells: 0, objects: 0 });
  const [deleteOrphanedContent, setDeleteOrphanedContent] = dc.useState(false);
  
  // Helper function to check if content would be orphaned by new bounds
  const getOrphanedContentInfo = dc.useCallback((newBounds) => {
    if (mapType !== 'hex') return { cells: 0, objects: 0 };
    
    let orphanedCells = 0;
    let orphanedObjects = 0;
    
    // Check cells (stored as {q, r, color})
    if (currentCells && currentCells.length > 0) {
      currentCells.forEach(cell => {
        const { col, row } = axialToOffset(cell.q, cell.r, orientation);
        if (!isWithinOffsetBounds(col, row, newBounds)) {
          orphanedCells++;
        }
      });
    }
    
    // Check objects (position.x=q, position.y=r for hex maps)
    if (currentObjects && currentObjects.length > 0) {
      currentObjects.forEach(obj => {
        const { col, row } = axialToOffset(obj.position.x, obj.position.y, orientation);
        if (!isWithinOffsetBounds(col, row, newBounds)) {
          orphanedObjects++;
        }
      });
    }
    
    return { cells: orphanedCells, objects: orphanedObjects };
  }, [mapType, currentCells, currentObjects, orientation]);
  
  // Refs for color buttons to detect clicks outside
  const gridLineColorBtnRef = dc.useRef(null);
  const backgroundColorBtnRef = dc.useRef(null);
  const borderColorBtnRef = dc.useRef(null);
  const coordinateKeyColorBtnRef = dc.useRef(null);
  const coordinateTextColorBtnRef = dc.useRef(null);
  const coordinateTextShadowBtnRef = dc.useRef(null);
  const pendingCustomColorRef = dc.useRef(null);
  const mouseDownTargetRef = dc.useRef(null);
  
  // Reset state when modal opens
  dc.useEffect(() => {
    if (isOpen) {
      setUseGlobalSettings(currentSettings?.useGlobalSettings ?? true);
      setOverrides({
        gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor,
        gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
        backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor,
        borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor,
        coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor,
        coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor,
        coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow
      });
      setPreferences({
        rememberPanZoom: currentPreferences?.rememberPanZoom ?? true,
        rememberSidebarState: currentPreferences?.rememberSidebarState ?? true,
        rememberExpandedState: currentPreferences?.rememberExpandedState ?? false
      });
      setHexBounds({
        maxCol: currentHexBounds?.maxCol ?? 26,
        maxRow: currentHexBounds?.maxRow ?? 20
      });
      setCoordinateDisplayMode(currentSettings?.coordinateDisplayMode ?? 'rectangular');
      
      // Reset distance settings
      const savedDistanceSettings = currentSettings?.distanceSettings;
      const currentGlobalSettings = getSettings();
      const isHex = mapType === 'hex';
      const defaultPerCell = isHex 
        ? (currentGlobalSettings.distancePerCellHex ?? 6) 
        : (currentGlobalSettings.distancePerCellGrid ?? 5);
      const defaultUnit = isHex 
        ? (currentGlobalSettings.distanceUnitHex ?? 'mi') 
        : (currentGlobalSettings.distanceUnitGrid ?? 'ft');
      setDistanceSettings({
        useGlobalDistance: !savedDistanceSettings,
        distancePerCell: savedDistanceSettings?.distancePerCell ?? defaultPerCell,
        distanceUnit: savedDistanceSettings?.distanceUnit ?? defaultUnit,
        gridDiagonalRule: savedDistanceSettings?.gridDiagonalRule ?? (currentGlobalSettings.gridDiagonalRule ?? 'alternating'),
        displayFormat: savedDistanceSettings?.displayFormat ?? (currentGlobalSettings.distanceDisplayFormat ?? 'both')
      });
      
      // Reset background image state
      const bgImage = currentBackgroundImage || {};
      setBackgroundImagePath(bgImage.path ?? null);
      setBackgroundImageDisplayName(
        bgImage.path ? getDisplayNameFromPath(bgImage.path) : ''
      );
      setImageDimensions(null);
      setGridDensity(bgImage.gridDensity ?? 'medium');
      setCustomColumns(bgImage.customColumns ?? 24);
      setBoundsLocked(bgImage.path ? (bgImage.lockBounds ?? true) : false);
      setImageOpacity(bgImage.opacity ?? 1);
      setImageOffsetX(bgImage.offsetX ?? 0);
      setImageOffsetY(bgImage.offsetY ?? 0);
      setImageSearchResults([]);
      
      // Load image dimensions if path exists
      if (bgImage.path) {
        getImageDimensions(bgImage.path).then((dims) => {
          if (dims) {
            setImageDimensions(dims);
            
            // Recalculate bounds if locked (ensures consistency)
            const shouldLock = bgImage.lockBounds ?? true;
            if (shouldLock) {
              const density = bgImage.gridDensity ?? 'medium';
              const customCols = bgImage.customColumns ?? 24;
              const columns = density === 'custom' ? customCols : GRID_DENSITY_PRESETS[density]?.columns ?? 24;
              const calculated = calculateGridFromImage(dims.width, dims.height, columns, orientation);
              setHexBounds({
                maxCol: calculated.columns,
                maxRow: calculated.rows
              });
            }
          }
        });
      }
      
      setActiveColorPicker(null);
      setActiveTab('appearance');
      
      // Reset resize confirmation state
      setShowResizeConfirm(false);
      setPendingBoundsChange(null);
      setOrphanInfo({ cells: 0, objects: 0 });
      setDeleteOrphanedContent(false);
    }
  }, [isOpen, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings, mapType]);
  
  const handleToggleUseGlobal = dc.useCallback(() => {
    setUseGlobalSettings(prev => !prev);
  }, []);
  
  const handleColorChange = dc.useCallback((colorKey, newColor) => {
    setOverrides(prev => ({
      ...prev,
      [colorKey]: newColor
    }));
  }, []);
  
  const handleLineWidthChange = dc.useCallback((value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue >= 1 && numValue <= 5) {
      setOverrides(prev => ({
        ...prev,
        gridLineWidth: numValue
      }));
    }
  }, []);
  
  const handlePreferenceToggle = dc.useCallback((prefKey) => {
    setPreferences(prev => ({
      ...prev,
      [prefKey]: !prev[prefKey]
    }));
  }, []);
  
  const handleHexBoundsChange = dc.useCallback((axis, value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0 && numValue <= 1000) {
      const newBounds = {
        ...hexBounds,
        [axis]: numValue
      };
      
      // Check if this is a reduction that would orphan content
      const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
      
      if (isReduction) {
        const orphans = getOrphanedContentInfo(newBounds);
        
        if (orphans.cells > 0 || orphans.objects > 0) {
          // Show confirmation dialog
          setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
          setOrphanInfo(orphans);
          setShowResizeConfirm(true);
          return; // Don't apply change yet
        }
      }
      
      // No orphaned content or expanding bounds - apply directly
      setHexBounds(newBounds);
    }
  }, [hexBounds, getOrphanedContentInfo]);
  
  // Background image handlers
  const handleImageSearch = dc.useCallback(async (searchTerm) => {
    if (!searchTerm || searchTerm.trim() === '') {
      setImageSearchResults([]);
      return;
    }
    
    const allImages = await getImageDisplayNames();
    const filtered = allImages.filter(name => 
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    setImageSearchResults(filtered.slice(0, 10)); // Limit to 10 results
  }, []);
  
  const handleImageSelect = dc.useCallback(async (displayName) => {
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (!fullPath) return;
    
    setBackgroundImagePath(fullPath);
    setBackgroundImageDisplayName(displayName);
    setImageSearchResults([]);
    
    // Load dimensions and calculate default grid
    const dims = await getImageDimensions(fullPath);
    if (dims) {
      setImageDimensions(dims);
      
      // Auto-calculate bounds based on current density and enable lock
      const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity].columns;
      const calculated = calculateGridFromImage(dims.width, dims.height, columns, orientation);
      
      // Always set bounds when selecting new image, and enable lock
      setHexBounds({
        maxCol: calculated.columns,
        maxRow: calculated.rows
      });
      setBoundsLocked(true);
    }
  }, [gridDensity, customColumns, boundsLocked, orientation]);
  
  const handleImageClear = dc.useCallback(() => {
    setBackgroundImagePath(null);
    setBackgroundImageDisplayName('');
    setImageDimensions(null);
    setBoundsLocked(false);
    setImageSearchResults([]);
  }, []);
  
  const handleDensityChange = dc.useCallback((density) => {
    setGridDensity(density);
    
    // Recalculate bounds if we have dimensions and bounds are locked
    if (imageDimensions && boundsLocked) {
      const columns = density === 'custom' ? customColumns : GRID_DENSITY_PRESETS[density].columns;
      const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, columns, orientation);
      const newBounds = {
        maxCol: calculated.columns,
        maxRow: calculated.rows
      };
      
      // Check if this is a reduction that would orphan content
      const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
      
      if (isReduction) {
        const orphans = getOrphanedContentInfo(newBounds);
        
        if (orphans.cells > 0 || orphans.objects > 0) {
          // Show confirmation dialog
          setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
          setOrphanInfo(orphans);
          setShowResizeConfirm(true);
          return; // Don't apply change yet
        }
      }
      
      setHexBounds(newBounds);
    }
  }, [imageDimensions, boundsLocked, customColumns, orientation, hexBounds, getOrphanedContentInfo]);
  
  const handleCustomColumnsChange = dc.useCallback((value) => {
    const numValue = parseInt(value, 10);
    if (!isNaN(numValue) && numValue > 0) {
      setCustomColumns(numValue);
      
      // Recalculate bounds if we have dimensions and bounds are locked
      if (imageDimensions && boundsLocked && gridDensity === 'custom') {
        const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, numValue, orientation);
        const newBounds = {
          maxCol: calculated.columns,
          maxRow: calculated.rows
        };
        
        // Check if this is a reduction that would orphan content
        const isReduction = newBounds.maxCol < hexBounds.maxCol || newBounds.maxRow < hexBounds.maxRow;
        
        if (isReduction) {
          const orphans = getOrphanedContentInfo(newBounds);
          
          if (orphans.cells > 0 || orphans.objects > 0) {
            // Show confirmation dialog
            setPendingBoundsChange({ newBounds, previousBounds: { ...hexBounds } });
            setOrphanInfo(orphans);
            setShowResizeConfirm(true);
            return; // Don't apply change yet
          }
        }
        
        setHexBounds(newBounds);
      }
    }
  }, [imageDimensions, boundsLocked, gridDensity, orientation, hexBounds, getOrphanedContentInfo]);
  
  const handleBoundsLockToggle = dc.useCallback(() => {
    setBoundsLocked(prev => !prev);
  }, []);
  
  // Resize confirmation dialog handlers
  const handleResizeConfirmDelete = dc.useCallback(() => {
    if (pendingBoundsChange) {
      setHexBounds(pendingBoundsChange.newBounds);
      setDeleteOrphanedContent(true);
    }
    setShowResizeConfirm(false);
    setPendingBoundsChange(null);
  }, [pendingBoundsChange]);
  
  const handleResizeConfirmCancel = dc.useCallback(() => {
    // Revert to previous bounds - don't apply the change
    setShowResizeConfirm(false);
    setPendingBoundsChange(null);
  }, []);
  
  const handleSave = dc.useCallback(() => {
    setIsLoading(true);
    
    const settingsData = {
      useGlobalSettings,
      overrides: useGlobalSettings ? {} : overrides,  // Only save overrides if not using global
      // Always save coordinate display settings for hex maps (independent of color overrides)
      coordinateDisplayMode,
      // Distance measurement settings (per-map overrides)
      distanceSettings: distanceSettings.useGlobalDistance ? null : {
        distancePerCell: distanceSettings.distancePerCell,
        distanceUnit: distanceSettings.distanceUnit,
        gridDiagonalRule: distanceSettings.gridDiagonalRule,
        displayFormat: distanceSettings.displayFormat
      }
    };
    
    // Prepare background image data for hex maps
    const backgroundImageData = mapType === 'hex' ? {
      path: backgroundImagePath,
      lockBounds: boundsLocked,
      gridDensity: gridDensity,
      customColumns: customColumns,
      opacity: imageOpacity,
      offsetX: imageOffsetX,
      offsetY: imageOffsetY
    } : undefined;
    
    // Calculate hexSize if we have an image with locked bounds
    let calculatedHexSize = null;
    if (mapType === 'hex' && backgroundImagePath && boundsLocked && imageDimensions && hexBounds) {
      // Use the actual hexBounds.maxCol value, not the density preset
      // This ensures we use the exact bounds that will be saved
      const calculated = calculateGridFromImage(imageDimensions.width, imageDimensions.height, hexBounds.maxCol, orientation);
      calculatedHexSize = calculated.hexSize;
    }
    
    onSave(settingsData, preferences, mapType === 'hex' ? hexBounds : null, backgroundImageData, calculatedHexSize, deleteOrphanedContent);
    
    // Reset the delete flag after saving
    setDeleteOrphanedContent(false);
    setIsLoading(false);
    onClose();
  }, [useGlobalSettings, overrides, preferences, hexBounds, mapType, coordinateDisplayMode, distanceSettings, onSave, onClose, backgroundImagePath, boundsLocked, imageDimensions, gridDensity, customColumns, imageOpacity, imageOffsetX, imageOffsetY, orientation, deleteOrphanedContent]);
  
  const handleCancel = dc.useCallback(() => {
    onClose();
  }, [onClose]);
  
  // Close color picker when clicking outside
  dc.useEffect(() => {
    if (activeColorPicker) {
      const handleClickOutside = (e) => {
        const pickerElement = e.target.closest('.dmt-color-picker');
        const buttonElement = e.target.closest('.dmt-color-button');
        const modalContent = e.target.closest('.dmt-settings-modal');
        
        // Only close if clicking outside both picker and button, but still inside modal
        if (!pickerElement && !buttonElement && modalContent) {
          // If there's a pending custom color, apply it before closing
          if (pendingCustomColorRef.current) {
            handleColorChange(activeColorPicker, pendingCustomColorRef.current);
            pendingCustomColorRef.current = null;
          }
          
          setActiveColorPicker(null);
        }
      };
      
      // Use setTimeout to avoid immediate closure on button click
      const timeoutId = setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('touchstart', handleClickOutside);
      }, 0);
      
      return () => {
        clearTimeout(timeoutId);
        document.removeEventListener('mousedown', handleClickOutside);
        document.removeEventListener('touchstart', handleClickOutside);
      };
    }
  }, [activeColorPicker]);
  
  // Define available tabs based on map type
  const tabs = dc.useMemo(() => {
    const baseTabs = [
      { id: 'appearance', label: 'Appearance' },
    ];
    if (mapType === 'hex') {
      baseTabs.push({ id: 'hexgrid', label: 'Hex Grid' });
    }
    baseTabs.push({ id: 'measurement', label: 'Measurement' });
    baseTabs.push({ id: 'preferences', label: 'Preferences' });
    return baseTabs;
  }, [mapType]);
  
  // Color picker item component for the 2x2 grid
  const ColorPickerItem = ({ colorKey, label, buttonRef, defaultColor }) => (
    <div class="dmt-color-grid-item">
      <label class="dmt-form-label" style={{ marginBottom: '4px', fontSize: '12px' }}>{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', position: 'relative' }}>
        <button
          ref={buttonRef}
          class="dmt-color-button"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && setActiveColorPicker(colorKey)}
          style={{ 
            backgroundColor: overrides[colorKey],
            cursor: useGlobalSettings ? 'not-allowed' : 'pointer',
            minWidth: '80px'
          }}
        >
          <span class="dmt-color-button-label">{overrides[colorKey]}</span>
        </button>
        
        <button
          class="dmt-color-reset-btn"
          disabled={useGlobalSettings}
          onClick={() => !useGlobalSettings && handleColorChange(colorKey, defaultColor)}
          title="Reset to default"
          style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
        >
          <dc.Icon icon="lucide-rotate-ccw" />
        </button>
        
        <ColorPicker
          isOpen={activeColorPicker === colorKey && !useGlobalSettings}
          selectedColor={overrides[colorKey]}
          onColorSelect={(color) => handleColorChange(colorKey, color)}
          onClose={() => setActiveColorPicker(null)}
          onReset={() => handleColorChange(colorKey, globalSettings[colorKey])}
          customColors={[]}
          pendingCustomColorRef={pendingCustomColorRef}
          title={label}
          position="below"
        />
      </div>
    </div>
  );
  
  if (!isOpen) return null;
  
  return (
    <ModalPortal>
      <div 
        class="dmt-modal-overlay" 
        onMouseDown={(e) => mouseDownTargetRef.current = e.target}
        onClick={(e) => {
          if (mouseDownTargetRef.current === e.target) {
            handleCancel();
          }
          mouseDownTargetRef.current = null;
        }}
      >
        <div 
          class="dmt-modal-content dmt-settings-modal" 
          onClick={(e) => e.stopPropagation()}
          style={{ width: '480px', maxWidth: '90vw' }}
        >
          <div class="dmt-modal-header">
            <h3>Map Settings</h3>
          </div>
          
          {/* Tab Bar */}
          <div class="dmt-settings-tab-bar">
            {tabs.map(tab => (
              <button
                key={tab.id}
                class={`dmt-settings-tab ${activeTab === tab.id ? 'dmt-settings-tab-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          
          <div class="dmt-modal-body" style={{ paddingTop: '16px' }}>
            {/* Tab: Appearance */}
            {activeTab === 'appearance' && (
              <div class="dmt-settings-tab-content">
                <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!useGlobalSettings}
                      onChange={handleToggleUseGlobal}
                      class="dmt-checkbox"
                    />
                    <span>Use custom colors for this map</span>
                  </label>
                </div>
                
                {/* 2x2 Color picker grid */}
                <div 
                  class="dmt-color-grid" 
                  style={{ 
                    opacity: useGlobalSettings ? 0.5 : 1,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '16px'
                  }}
                >
                  <ColorPickerItem
                    colorKey="gridLineColor"
                    label="Grid Lines"
                    buttonRef={gridLineColorBtnRef}
                    defaultColor={THEME.grid.lines}
                  />
                  <ColorPickerItem
                    colorKey="backgroundColor"
                    label="Background"
                    buttonRef={backgroundColorBtnRef}
                    defaultColor={THEME.grid.background}
                  />
                  <ColorPickerItem
                    colorKey="borderColor"
                    label="Cell Border"
                    buttonRef={borderColorBtnRef}
                    defaultColor={THEME.cells.border}
                  />
                  <ColorPickerItem
                    colorKey="coordinateKeyColor"
                    label="Coord Key"
                    buttonRef={coordinateKeyColorBtnRef}
                    defaultColor={THEME.coordinateKey.color}
                  />
                </div>
                
                {/* Grid Line Width slider (grid maps only) */}
                {mapType === 'grid' && (
                  <div 
                    class="dmt-form-group" 
                    style={{ 
                      marginTop: '20px',
                      opacity: useGlobalSettings ? 0.5 : 1
                    }}
                  >
                    <label class="dmt-form-label" style={{ marginBottom: '8px' }}>
                      Grid Line Width: {overrides.gridLineWidth ?? 1}px
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <input
                        type="range"
                        min="1"
                        max="5"
                        value={overrides.gridLineWidth ?? 1}
                        onInput={(e) => handleLineWidthChange(e.target.value)}
                        disabled={useGlobalSettings}
                        style={{
                          flex: 1,
                          cursor: useGlobalSettings ? 'not-allowed' : 'pointer'
                        }}
                      />
                      <button
                        class="dmt-color-reset-btn"
                        disabled={useGlobalSettings}
                        onClick={() => !useGlobalSettings && handleLineWidthChange(1)}
                        title="Reset to default (1px)"
                        style={{ cursor: useGlobalSettings ? 'not-allowed' : 'pointer' }}
                      >
                        <dc.Icon icon="lucide-rotate-ccw" />
                      </button>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Thickness of the grid lines (1-5 pixels)
                    </p>
                  </div>
                )}
              </div>
            )}
            
            {/* Tab: Hex Grid (hex maps only) */}
            {activeTab === 'hexgrid' && mapType === 'hex' && (
              <div class="dmt-settings-tab-content">
                {/* Background Image Section */}
                <div class="dmt-form-group" style={{ 
                  borderBottom: '1px solid var(--background-modifier-border)', 
                  paddingBottom: '16px',
                  marginBottom: '20px'
                }}>
                  <label class="dmt-form-label">Background Image</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Add an image to automatically size the hex grid
                  </p>
                  
                  {/* Image picker */}
                  <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <input
                      type="text"
                      placeholder="Search for image..."
                      value={backgroundImageDisplayName}
                      onChange={(e) => {
                        setBackgroundImageDisplayName(e.target.value);
                        handleImageSearch(e.target.value);
                      }}
                      style={{
                        width: '100%',
                        padding: '8px 32px 8px 10px',
                        borderRadius: '4px',
                        border: '1px solid var(--background-modifier-border)',
                        background: 'var(--background-primary)',
                        color: 'var(--text-normal)',
                        fontSize: '14px'
                      }}
                    />
                    
                    {backgroundImagePath && (
                      <button
                        onClick={handleImageClear}
                        style={{
                          position: 'absolute',
                          right: '6px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          fontSize: '16px',
                          lineHeight: '1'
                        }}
                        title="Clear image"
                      >
                        ×
                      </button>
                    )}
                    
                    {/* Autocomplete dropdown */}
                    {imageSearchResults.length > 0 && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        maxHeight: '200px',
                        overflowY: 'auto',
                        background: 'var(--background-primary)',
                        border: '1px solid var(--background-modifier-border)',
                        borderRadius: '4px',
                        marginTop: '2px',
                        zIndex: 1000,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }}>
                        {imageSearchResults.map((name, idx) => (
                          <div
                            key={idx}
                            onClick={() => handleImageSelect(name)}
                            style={{
                              padding: '8px 10px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              borderBottom: idx < imageSearchResults.length - 1 ? '1px solid var(--background-modifier-border)' : 'none'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--background-modifier-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  
                  {/* Show dimensions when image is selected */}
                  {imageDimensions && (
                    <div style={{ marginBottom: '16px' }}>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        Detected: {imageDimensions.width} × {imageDimensions.height} px
                      </p>
                    </div>
                  )}
                  
                  {/* Grid density options - only show when image is selected */}
                  {backgroundImagePath && imageDimensions && (
                    <div style={{ marginBottom: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px' }}>Grid Density</label>
                      
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="sparse"
                            checked={gridDensity === 'sparse'}
                            onChange={() => handleDensityChange('sparse')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.sparse.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.sparse.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="medium"
                            checked={gridDensity === 'medium'}
                            onChange={() => handleDensityChange('medium')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.medium.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.medium.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="dense"
                            checked={gridDensity === 'dense'}
                            onChange={() => handleDensityChange('dense')}
                            style={{ marginTop: '2px' }}
                          />
                          <div>
                            <span style={{ fontWeight: 500 }}>{GRID_DENSITY_PRESETS.dense.label}</span>
                            <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              {GRID_DENSITY_PRESETS.dense.description}
                            </p>
                          </div>
                        </label>
                        
                        <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                          <input
                            type="radio"
                            name="gridDensity"
                            value="custom"
                            checked={gridDensity === 'custom'}
                            onChange={() => handleDensityChange('custom')}
                          />
                          <span style={{ fontWeight: 500 }}>Custom</span>
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={customColumns}
                            onChange={(e) => handleCustomColumnsChange(e.target.value)}
                            disabled={gridDensity !== 'custom'}
                            style={{
                              width: '60px',
                              padding: '4px 8px',
                              borderRadius: '4px',
                              border: '1px solid var(--background-modifier-border)',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)',
                              fontSize: '13px',
                              opacity: gridDensity !== 'custom' ? 0.5 : 1
                            }}
                          />
                          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>columns</span>
                        </label>
                      </div>
                      
                      {/* Show calculated result */}
                      <div style={{ marginTop: '12px', padding: '8px', background: 'var(--background-secondary)', borderRadius: '4px' }}>
                        <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          Result: {hexBounds.maxCol} columns × {hexBounds.maxRow} rows
                          {imageDimensions && (() => {
                            const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity]?.columns || 24;
                            const calc = calculateGridFromImage(imageDimensions.width, imageDimensions.height, columns, orientation);
                            return ` (~${calc.hexWidth}px hex width)`;
                          })()}
                        </p>
                      </div>
                    </div>
                  )}
                  
                  {/* Lock bounds checkbox - only show when image is selected */}
                  {backgroundImagePath && (
                    <label class="dmt-checkbox-label" style={{ marginTop: '12px' }}>
                      <input
                        type="checkbox"
                        checked={boundsLocked}
                        onChange={handleBoundsLockToggle}
                        class="dmt-checkbox"
                      />
                      <span>Lock bounds to image dimensions</span>
                    </label>
                  )}
                  
                  {/* Opacity slider - only show when image is selected */}
                  {backgroundImagePath && (
                    <div style={{ marginTop: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        Image Opacity: {Math.round(imageOpacity * 100)}%
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <input
                          type="range"
                          min="0"
                          max="100"
                          value={Math.round(imageOpacity * 100)}
                          onChange={(e) => setImageOpacity(parseInt(e.target.value, 10) / 100)}
                          style={{
                            flex: 1,
                            height: '6px',
                            cursor: 'pointer',
                            accentColor: 'var(--interactive-accent)'
                          }}
                        />
                        <span style={{ 
                          fontSize: '12px', 
                          color: 'var(--text-muted)',
                          minWidth: '35px',
                          textAlign: 'right'
                        }}>
                          {Math.round(imageOpacity * 100)}%
                        </span>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Lower opacity makes the grid more visible over the image
                      </p>
                    </div>
                  )}
                  
                  {/* Image offset controls - only show when image is selected */}
                  {backgroundImagePath && (
                    <div style={{ marginTop: '16px' }}>
                      <label class="dmt-form-label" style={{ marginBottom: '8px', display: 'block' }}>
                        Image Offset (pixels)
                      </label>
                      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>X:</span>
                          <input
                            type="number"
                            value={imageOffsetX}
                            onChange={(e) => setImageOffsetX(parseInt(e.target.value, 10) || 0)}
                            class="dmt-number-input"
                            style={{
                              width: '80px',
                              padding: '6px 8px',
                              border: '1px solid var(--background-modifier-border)',
                              borderRadius: '4px',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)'
                            }}
                          />
                        </div>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Y:</span>
                          <input
                            type="number"
                            value={imageOffsetY}
                            onChange={(e) => setImageOffsetY(parseInt(e.target.value, 10) || 0)}
                            class="dmt-number-input"
                            style={{
                              width: '80px',
                              padding: '6px 8px',
                              border: '1px solid var(--background-modifier-border)',
                              borderRadius: '4px',
                              background: 'var(--background-primary)',
                              color: 'var(--text-normal)'
                            }}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => { setImageOffsetX(0); setImageOffsetY(0); }}
                          style={{
                            padding: '4px 8px',
                            fontSize: '12px',
                            background: 'var(--background-secondary)',
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '4px',
                            color: 'var(--text-muted)',
                            cursor: 'pointer'
                          }}
                        >
                          Reset
                        </button>
                      </div>
                      <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                        Fine-tune image alignment with the hex grid
                      </p>
                    </div>
                  )}
                </div>
                
                {/* Bounds - Columns and Rows on same row */}
                <div class="dmt-form-group">
                  <label class="dmt-form-label">
                    Map Bounds
                    {boundsLocked && backgroundImagePath && (
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 'normal', marginLeft: '8px' }}>
                        (controlled by background image)
                      </span>
                    )}
                  </label>
                  <div style={{ 
                    display: 'flex', 
                    gap: '16px', 
                    alignItems: 'center', 
                    flexWrap: 'wrap',
                    opacity: boundsLocked && backgroundImagePath ? 0.6 : 1
                  }}>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Columns:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={hexBounds.maxCol}
                        onChange={(e) => handleHexBoundsChange('maxCol', e.target.value)}
                        disabled={boundsLocked && backgroundImagePath}
                        class="dmt-number-input"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--background-modifier-border)',
                          background: boundsLocked && backgroundImagePath ? 'var(--background-secondary)' : 'var(--background-primary)',
                          color: boundsLocked && backgroundImagePath ? 'var(--text-muted)' : 'var(--text-normal)',
                          fontSize: '14px',
                          width: '70px'
                        }}
                      />
                    </div>
                    <span style={{ color: 'var(--text-muted)' }}>×</span>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Rows:</span>
                      <input
                        type="number"
                        min="1"
                        max="1000"
                        value={hexBounds.maxRow}
                        onChange={(e) => handleHexBoundsChange('maxRow', e.target.value)}
                        disabled={boundsLocked && backgroundImagePath}
                        class="dmt-number-input"
                        style={{
                          padding: '6px 10px',
                          borderRadius: '4px',
                          border: '1px solid var(--background-modifier-border)',
                          background: boundsLocked && backgroundImagePath ? 'var(--background-secondary)' : 'var(--background-primary)',
                          color: boundsLocked && backgroundImagePath ? 'var(--text-muted)' : 'var(--text-normal)',
                          fontSize: '14px',
                          width: '70px'
                        }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '8px' }}>
                    Playable area: A1 to {String.fromCharCode(65 + Math.min(hexBounds.maxCol - 1, 25))}{hexBounds.maxCol > 26 ? '+' : ''}{hexBounds.maxRow}
                  </p>
                </div>
                
                {/* Coordinate Display Mode */}
                <div class="dmt-form-group" style={{ marginTop: '20px' }}>
                  <label class="dmt-form-label">Coordinate Display Mode</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    How coordinates appear when pressing C
                  </p>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="coordMode"
                        value="rectangular"
                        checked={coordinateDisplayMode === 'rectangular'}
                        onChange={() => setCoordinateDisplayMode('rectangular')}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>Rectangular (A1, B2, ...)</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Column-row labels for standard grid layouts
                        </p>
                      </div>
                    </label>
                    
                    <label class="dmt-radio-label" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', cursor: 'pointer' }}>
                      <input
                        type="radio"
                        name="coordMode"
                        value="radial"
                        checked={coordinateDisplayMode === 'radial'}
                        onChange={() => setCoordinateDisplayMode('radial')}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <span style={{ fontWeight: 500 }}>Radial (⬡, 1-1, 2-5, ...)</span>
                        <p style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          Ring-position labels centered in grid
                        </p>
                      </div>
                    </label>
                  </div>
                </div>
                
                {/* Coordinate Text Colors */}
                <div class="dmt-form-group" style={{ marginTop: '20px' }}>
                  <label class="dmt-form-label">Coordinate Text Colors</label>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    {useGlobalSettings ? 'Using global settings (enable custom colors in Appearance tab to override)' : 'Custom colors for coordinate overlay text'}
                  </p>
                  
                  <div 
                    style={{ 
                      opacity: useGlobalSettings ? 0.5 : 1,
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '16px'
                    }}
                  >
                    <ColorPickerItem
                      colorKey="coordinateTextColor"
                      label="Text Color"
                      buttonRef={coordinateTextColorBtnRef}
                      defaultColor={THEME.coordinateText.color}
                    />
                    <ColorPickerItem
                      colorKey="coordinateTextShadow"
                      label="Text Shadow"
                      buttonRef={coordinateTextShadowBtnRef}
                      defaultColor={THEME.coordinateText.shadow}
                    />
                  </div>
                </div>
              </div>
            )}
            
            {/* Tab: Measurement */}
            {activeTab === 'measurement' && (
              <div class="dmt-settings-tab-content">
                <div class="dmt-form-group" style={{ marginBottom: '16px' }}>
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={!distanceSettings.useGlobalDistance}
                      onChange={() => setDistanceSettings(prev => ({
                        ...prev,
                        useGlobalDistance: !prev.useGlobalDistance
                      }))}
                      class="dmt-checkbox"
                    />
                    <span>Use custom measurement settings for this map</span>
                  </label>
                </div>
                
                <div style={{ opacity: distanceSettings.useGlobalDistance ? 0.5 : 1 }}>
                  <div class="dmt-form-group">
                    <label class="dmt-form-label">Distance per {isHexMap ? 'Hex' : 'Cell'}</label>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <input
                        type="number"
                        min="0.1"
                        step="0.1"
                        value={distanceSettings.distancePerCell}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            setDistanceSettings(prev => ({ ...prev, distancePerCell: val }));
                          }
                        }}
                        class="dmt-form-input"
                        style={{ width: '80px' }}
                      />
                      <select
                        value={distanceSettings.distanceUnit}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => setDistanceSettings(prev => ({ ...prev, distanceUnit: e.target.value }))}
                        class="dmt-form-select"
                        style={{ width: '120px' }}
                      >
                        <option value="ft">feet</option>
                        <option value="m">meters</option>
                        <option value="mi">miles</option>
                        <option value="km">kilometers</option>
                        <option value="yd">yards</option>
                      </select>
                    </div>
                  </div>
                  
                  {!isHexMap && (
                    <div class="dmt-form-group">
                      <label class="dmt-form-label">Diagonal Movement</label>
                      <select
                        value={distanceSettings.gridDiagonalRule}
                        disabled={distanceSettings.useGlobalDistance}
                        onChange={(e) => setDistanceSettings(prev => ({ ...prev, gridDiagonalRule: e.target.value }))}
                        class="dmt-form-select"
                      >
                        <option value="alternating">Alternating (5-10-5-10, D&D 5e)</option>
                        <option value="equal">Equal (Chebyshev, all moves = 1)</option>
                        <option value="euclidean">True Distance (Euclidean)</option>
                      </select>
                    </div>
                  )}
                  
                  <div class="dmt-form-group">
                    <label class="dmt-form-label">Display Format</label>
                    <select
                      value={distanceSettings.displayFormat}
                      disabled={distanceSettings.useGlobalDistance}
                      onChange={(e) => setDistanceSettings(prev => ({ ...prev, displayFormat: e.target.value }))}
                      class="dmt-form-select"
                    >
                      <option value="both">Cells and Units (e.g., "3 cells (15 ft)")</option>
                      <option value="cells">Cells Only (e.g., "3 cells")</option>
                      <option value="units">Units Only (e.g., "15 ft")</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
            
            {/* Tab: Preferences */}
            {activeTab === 'preferences' && (
              <div class="dmt-settings-tab-content">
                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Control what state is remembered for this map
                </p>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberPanZoom}
                      onChange={() => handlePreferenceToggle('rememberPanZoom')}
                      class="dmt-checkbox"
                    />
                    <span>Remember pan and zoom position</span>
                  </label>
                </div>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberSidebarState}
                      onChange={() => handlePreferenceToggle('rememberSidebarState')}
                      class="dmt-checkbox"
                    />
                    <span>Remember sidebar collapsed state</span>
                  </label>
                </div>
                
                <div class="dmt-form-group">
                  <label class="dmt-checkbox-label">
                    <input
                      type="checkbox"
                      checked={preferences.rememberExpandedState}
                      onChange={() => handlePreferenceToggle('rememberExpandedState')}
                      class="dmt-checkbox"
                    />
                    <span>Remember expanded state</span>
                  </label>
                </div>
              </div>
            )}
          </div>
          
          <div class="dmt-modal-footer">
            <button 
              class="dmt-modal-btn dmt-modal-btn-cancel"
              onClick={handleCancel}
              disabled={isLoading}
            >
              Cancel
            </button>
            
            <button 
              class="dmt-modal-btn dmt-modal-btn-submit"
              onClick={handleSave}
              disabled={isLoading}
            >
              {isLoading ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
      
      {/* Resize Confirmation Dialog - in separate portal to render above settings */}
      {showResizeConfirm && (
        <ModalPortal>
          <div 
            class="dmt-modal-backdrop" 
            style={{ 
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10001
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div 
              class="dmt-confirm-dialog"
              style={{
                background: 'var(--background-primary)',
                borderRadius: '8px',
                padding: '20px',
                maxWidth: '400px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
                border: '1px solid var(--background-modifier-border)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <span style={{ color: 'var(--text-warning)', display: 'flex' }}>
                  <dc.Icon icon="lucide-alert-triangle" />
                </span>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: 'var(--text-normal)' }}>
                  Content Outside New Grid
                </h3>
              </div>
              
              <p style={{ fontSize: '14px', color: 'var(--text-normal)', marginBottom: '12px', lineHeight: '1.5' }}>
                Resizing the grid will remove content outside the new boundaries:
              </p>
              
              <ul style={{ 
                fontSize: '13px', 
                color: 'var(--text-muted)', 
                marginBottom: '16px', 
                paddingLeft: '20px',
                lineHeight: '1.6'
              }}>
                {orphanInfo.cells > 0 && (
                  <li>{orphanInfo.cells} painted cell{orphanInfo.cells !== 1 ? 's' : ''}</li>
                )}
                {orphanInfo.objects > 0 && (
                  <li>{orphanInfo.objects} object{orphanInfo.objects !== 1 ? 's' : ''}/pin{orphanInfo.objects !== 1 ? 's' : ''}</li>
                )}
              </ul>
              
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px', lineHeight: '1.5' }}>
                This content will be permanently deleted when you save. To recover it, cancel and expand the grid bounds instead.
              </p>
              
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  class="dmt-modal-btn"
                  onClick={handleResizeConfirmCancel}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: '1px solid var(--background-modifier-border)',
                    background: 'var(--background-secondary)',
                    color: 'var(--text-normal)',
                    cursor: 'pointer',
                    fontSize: '13px'
                  }}
                >
                  Cancel
                </button>
                <button
                  class="dmt-modal-btn"
                  onClick={handleResizeConfirmDelete}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'var(--text-error)',
                    color: 'white',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 500
                  }}
                >
                  Delete & Resize
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </ModalPortal>
  );
}

return { MapSettingsModal };