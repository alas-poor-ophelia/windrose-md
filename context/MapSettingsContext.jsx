/**
 * MapSettingsContext.jsx
 * 
 * React context provider for MapSettingsModal.
 * Manages state via useReducer (logic in settingsReducer.js),
 * handles effects, and provides handler API to consumers.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Reducer and pure logic
const {
  Actions,
  GRID_DENSITY_PRESETS,
  settingsReducer,
  buildInitialState,
  calculateBoundsFromSettings,
  getOrphanedContentInfo
} = await requireModuleByName("settingsReducer.js");

// Dependencies for async operations and constants
const { getSettings } = await requireModuleByName("settingsAccessor.js");
const { THEME } = await requireModuleByName("dmtConstants.ts");
const { 
  getImageDisplayNames, 
  getFullPathFromDisplayName, 
  getDisplayNameFromPath,
  getImageDimensions
} = await requireModuleByName("imageOperations.js");
const {
  calculateGridFromColumns,
  calculateGridFromMeasurement,
  measurementToHexSize,
  hexSizeToMeasurement,
  MEASUREMENT_EDGE,
  MEASUREMENT_CORNER,
  getFineTuneRange
} = await requireModuleByName("hexMeasurements.js");

// ============================================================================
// CONTEXT
// ============================================================================

const MapSettingsContext = dc.createContext(null);

function useMapSettings() {
  const context = dc.useContext(MapSettingsContext);
  if (!context) {
    throw new Error('useMapSettings must be used within a MapSettingsProvider');
  }
  return context;
}

// ============================================================================
// PROVIDER
// ============================================================================

function MapSettingsProvider({
  children,
  isOpen,
  onClose,
  onSave,
  onOpenAlignmentMode,
  initialTab = null,
  mapType = 'grid',
  orientation = 'flat',
  currentSettings = null,
  currentPreferences = null,
  currentHexBounds = null,
  currentBackgroundImage = null,
  currentDistanceSettings = null,
  currentCells = [],
  currentObjects = [],
  mapData = null,
  geometry = null
}) {
  const globalSettings = getSettings();
  const isHexMap = mapType === 'hex';
  
  // State via reducer
  const [state, dispatch] = dc.useReducer(
    settingsReducer,
    { props: { initialTab, mapType, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings }, globalSettings },
    (init) => buildInitialState(init.props, init.globalSettings)
  );
  
  // Refs
  const pendingCustomColorRef = dc.useRef(null);
  const mouseDownTargetRef = dc.useRef(null);
  
  // Derived: available tabs
  const tabs = dc.useMemo(() => {
    const baseTabs = [{ id: 'appearance', label: 'Appearance' }];
    if (mapType === 'hex') baseTabs.push({ id: 'hexgrid', label: 'Hex Grid' });
    baseTabs.push({ id: 'measurement', label: 'Measurement' });
    baseTabs.push({ id: 'preferences', label: 'Preferences' });
    return baseTabs;
  }, [mapType]);
  
  // ===========================================================================
  // EFFECTS
  // ===========================================================================
  
  // Initialize state when modal opens
  dc.useEffect(() => {
    if (!isOpen) return;
    
    dispatch({
      type: Actions.INITIALIZE,
      payload: {
        props: { initialTab, mapType, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings },
        globalSettings
      }
    });
    
    // Load image dimensions async if path exists
    if (currentBackgroundImage?.path) {
      getImageDimensions(currentBackgroundImage.path).then((dims) => {
        if (!dims) return;
        
        const bounds = calculateBoundsFromSettings(
          dims,
          currentBackgroundImage.sizingMode ?? 'density',
          currentBackgroundImage.gridDensity ?? 'medium',
          currentBackgroundImage.customColumns ?? 24,
          currentBackgroundImage.measurementSize ?? 86,
          currentBackgroundImage.measurementMethod ?? MEASUREMENT_CORNER,
          orientation
        );
        
        dispatch({
          type: Actions.IMAGE_SELECTED,
          payload: {
            path: currentBackgroundImage.path,
            displayName: getDisplayNameFromPath(currentBackgroundImage.path),
            dimensions: dims,
            bounds: (currentBackgroundImage.lockBounds ?? true) ? bounds : (currentHexBounds ?? { maxCol: 26, maxRow: 20 })
          }
        });
      });
    }
  }, [isOpen]);
  
  // Close color picker on outside click
  dc.useEffect(() => {
    if (!state.activeColorPicker) return;
    
    const handleClickOutside = (e) => {
      const pickerEl = e.target.closest('.dmt-color-picker');
      const buttonEl = e.target.closest('.dmt-color-button');
      const modalEl = e.target.closest('.dmt-settings-modal');
      
      if (!pickerEl && !buttonEl && modalEl) {
        if (pendingCustomColorRef.current) {
          dispatch({ type: Actions.SET_OVERRIDE, payload: { key: state.activeColorPicker, value: pendingCustomColorRef.current } });
          pendingCustomColorRef.current = null;
        }
        dispatch({ type: Actions.SET_ACTIVE_COLOR_PICKER, payload: null });
      }
    };
    
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [state.activeColorPicker]);
  
  // ===========================================================================
  // ASYNC HANDLERS
  // ===========================================================================
  
  const handleImageSearch = async (searchTerm) => {
    if (!searchTerm?.trim()) {
      dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const allImages = await getImageDisplayNames();
    const filtered = allImages.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
    dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: filtered.slice(0, 10) });
  };
  
  const handleImageSelect = async (displayName) => {
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (!fullPath) return;
    
    const dims = await getImageDimensions(fullPath);
    if (!dims) return;
    
    const bounds = calculateBoundsFromSettings(
      dims, state.sizingMode, state.gridDensity, state.customColumns,
      state.measurementSize, state.measurementMethod, orientation
    );
    
    dispatch({
      type: Actions.IMAGE_SELECTED,
      payload: { path: fullPath, displayName, dimensions: dims, bounds }
    });
  };
  
  // Fog of War image handlers
  const handleFogImageSearch = async (searchTerm) => {
    if (!searchTerm?.trim()) {
      dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const allImages = await getImageDisplayNames();
    const filtered = allImages.filter(name => name.toLowerCase().includes(searchTerm.toLowerCase()));
    dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: filtered.slice(0, 10) });
  };
  
  const handleFogImageSelect = async (displayName) => {
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (!fullPath) return;
    
    dispatch({
      type: Actions.FOG_IMAGE_SELECTED,
      payload: { path: fullPath, displayName }
    });
  };
  
  // Core save logic - forceDelete bypasses orphan check
  const doSave = (forceDelete = false) => {
    dispatch({ type: Actions.SET_LOADING, payload: true });
    
    const settingsData = {
      useGlobalSettings: state.useGlobalSettings,
      overrides: state.useGlobalSettings ? {} : state.overrides,
      coordinateDisplayMode: state.coordinateDisplayMode,
      distanceSettings: state.distanceSettings.useGlobalDistance ? null : {
        distancePerCell: state.distanceSettings.distancePerCell,
        distanceUnit: state.distanceSettings.distanceUnit,
        gridDiagonalRule: state.distanceSettings.gridDiagonalRule,
        displayFormat: state.distanceSettings.displayFormat
      }
    };
    
    const backgroundImageData = mapType === 'hex' ? {
      path: state.backgroundImagePath,
      lockBounds: state.boundsLocked,
      gridDensity: state.gridDensity,
      customColumns: state.customColumns,
      opacity: state.imageOpacity,
      offsetX: state.imageOffsetX,
      offsetY: state.imageOffsetY,
      sizingMode: state.sizingMode,
      measurementMethod: state.measurementMethod,
      measurementSize: state.measurementSize,
      fineTuneOffset: state.fineTuneOffset
    } : undefined;
    
    let calculatedHexSize = null;
    if (mapType === 'hex' && state.backgroundImagePath && state.boundsLocked && state.imageDimensions) {
      if (state.sizingMode === 'density') {
        const calc = calculateGridFromColumns(state.imageDimensions.width, state.imageDimensions.height, state.hexBounds.maxCol, orientation);
        calculatedHexSize = calc.hexSize;
      } else {
        const baseHexSize = measurementToHexSize(state.measurementSize, state.measurementMethod, orientation);
        calculatedHexSize = state.fineTuneOffset !== 0 ? baseHexSize + state.fineTuneOffset : baseHexSize;
      }
    }
    
    onSave(settingsData, state.preferences, mapType === 'hex' ? state.hexBounds : null, backgroundImageData, calculatedHexSize, forceDelete);
    
    dispatch({ type: Actions.CLEAR_DELETE_FLAG });
    dispatch({ type: Actions.SET_LOADING, payload: false });
    onClose();
  };
  
  const handleSave = () => {
    // Check for orphaned content if bounds were reduced (hex maps only)
    if (mapType === 'hex' && currentHexBounds) {
      const isReduction = state.hexBounds.maxCol < currentHexBounds.maxCol || 
                          state.hexBounds.maxRow < currentHexBounds.maxRow;
      
      if (isReduction) {
        const orphans = getOrphanedContentInfo(state.hexBounds, mapType, currentCells, currentObjects, orientation);
        if (orphans.cells > 0 || orphans.objects > 0) {
          dispatch({
            type: Actions.SHOW_RESIZE_CONFIRM,
            payload: { 
              pendingBoundsChange: { newBounds: state.hexBounds, previousBounds: currentHexBounds },
              orphanInfo: orphans
            }
          });
          return;
        }
      }
    }
    
    doSave(false);
  };
  
  const handleResizeConfirmDelete = () => {
    dispatch({ type: Actions.CANCEL_RESIZE }); // Close dialog
    doSave(true); // Save with delete flag
  };
  
  // ===========================================================================
  // DISPATCH WRAPPERS
  // ===========================================================================
  
  const handlers = {
    // Simple dispatches
    setActiveTab: (tab) => dispatch({ type: Actions.SET_TAB, payload: tab }),
    handleToggleUseGlobal: () => dispatch({ type: Actions.TOGGLE_USE_GLOBAL }),
    handleColorChange: (key, value) => dispatch({ type: Actions.SET_OVERRIDE, payload: { key, value } }),
    handleLineWidthChange: (value) => dispatch({ type: Actions.SET_LINE_WIDTH, payload: value }),
    handlePreferenceToggle: (key) => dispatch({ type: Actions.TOGGLE_PREFERENCE, payload: key }),
    setDistanceSettings: (updates) => dispatch({ type: Actions.SET_DISTANCE_SETTING, payload: updates }),
    setCoordinateDisplayMode: (mode) => dispatch({ type: Actions.SET_COORDINATE_MODE, payload: mode }),
    setActiveColorPicker: (picker) => dispatch({ type: Actions.SET_ACTIVE_COLOR_PICKER, payload: picker }),
    setBackgroundImageDisplayName: (name) => dispatch({ type: Actions.SET_IMAGE_DISPLAY_NAME, payload: name }),
    handleImageClear: () => dispatch({ type: Actions.CLEAR_IMAGE }),
    handleSizingModeChange: (mode) => dispatch({ type: Actions.SET_SIZING_MODE, payload: mode }),
    handleBoundsLockToggle: () => dispatch({ type: Actions.TOGGLE_BOUNDS_LOCK }),
    setImageOpacity: (opacity) => dispatch({ type: Actions.SET_IMAGE_OPACITY, payload: opacity }),
    setImageOffsetX: (x) => dispatch({ type: Actions.SET_IMAGE_OFFSET_X, payload: x }),
    setImageOffsetY: (y) => dispatch({ type: Actions.SET_IMAGE_OFFSET_Y, payload: y }),
    handleResizeConfirmDelete,
    handleResizeConfirmCancel: () => dispatch({ type: Actions.CANCEL_RESIZE }),
    handleCancel: () => onClose(),
    
    // Dispatches needing context for orphan checks
    handleHexBoundsChange: (axis, value) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue <= 0 || numValue > 1000) return;
      
      const newBounds = { ...state.hexBounds, [axis]: numValue };
      dispatch({ type: Actions.SET_HEX_BOUNDS, payload: newBounds });
    },
    
    handleDensityChange: (density) => {
      dispatch({
        type: Actions.SET_DENSITY,
        payload: { density, orientation }
      });
    },
    
    handleCustomColumnsChange: (columns) => {
      dispatch({
        type: Actions.SET_CUSTOM_COLUMNS,
        payload: { columns, orientation }
      });
    },
    
    handleMeasurementMethodChange: (method) => {
      dispatch({ type: Actions.SET_MEASUREMENT_METHOD, payload: { method, orientation } });
    },
    
    handleMeasurementSizeChange: (size) => {
      dispatch({ type: Actions.SET_MEASUREMENT_SIZE, payload: { size, orientation } });
    },
    
    handleFineTuneChange: (adjustedHexSize) => {
      dispatch({ type: Actions.SET_FINE_TUNE, payload: { adjustedHexSize, orientation } });
    },
    
    handleFineTuneReset: () => {
      dispatch({ type: Actions.RESET_FINE_TUNE, payload: { orientation } });
    },
    
    // Async
    handleImageSearch,
    handleImageSelect,
    handleSave,
    
    // Fog of War handlers
    setFogImageDisplayName: (name) => dispatch({ type: Actions.SET_FOG_IMAGE_DISPLAY_NAME, payload: name }),
    handleFogImageSearch,
    handleFogImageSelect,
    handleFogImageClear: () => dispatch({ type: Actions.CLEAR_FOG_IMAGE })
  };
  
  // ===========================================================================
  // CONTEXT VALUE
  // ===========================================================================
  
  const contextValue = {
    // Props
    isOpen, onClose, onOpenAlignmentMode, mapType, orientation,
    
    // Map data for export
    mapData, geometry,
    
    // External
    globalSettings, tabs, isHexMap,
    
    // State
    ...state,
    
    // Refs
    pendingCustomColorRef, mouseDownTargetRef,
    
    // Handlers
    ...handlers,
    
    // Constants for consumers
    GRID_DENSITY_PRESETS, MEASUREMENT_EDGE, MEASUREMENT_CORNER, THEME,
    
    // Utilities for consumers
    calculateGridFromColumns, calculateGridFromMeasurement,
    measurementToHexSize, hexSizeToMeasurement, getFineTuneRange
  };
  
  return (
    <MapSettingsContext.Provider value={contextValue}>
      {children}
    </MapSettingsContext.Provider>
  );
}

return { MapSettingsContext, MapSettingsProvider, useMapSettings, GRID_DENSITY_PRESETS };