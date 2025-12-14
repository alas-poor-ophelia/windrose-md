/**
 * settingsReducer.js
 * 
 * Pure state management for MapSettingsModal.
 * Contains action types, reducer function, and state initialization logic.
 * No React dependencies - can be unit tested independently.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { axialToOffset, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js");
const {
  calculateGridFromColumns,
  calculateGridFromMeasurement,
  measurementToHexSize,
  validateMeasurementSize,
  MEASUREMENT_CORNER
} = await requireModuleByName("hexMeasurements.js");
const { getDisplayNameFromPath } = await requireModuleByName("imageOperations.js");

// ============================================================================
// CONSTANTS
// ============================================================================

const GRID_DENSITY_PRESETS = {
  sparse: { columns: 12, label: 'Sparse (~12 columns)', description: 'Regional scale' },
  medium: { columns: 24, label: 'Medium (~24 columns)', description: 'Dungeon scale' },
  dense:  { columns: 48, label: 'Dense (~48 columns)', description: 'Tactical scale' }
};

const Actions = {
  INITIALIZE: 'INITIALIZE',
  SET_TAB: 'SET_TAB',
  TOGGLE_USE_GLOBAL: 'TOGGLE_USE_GLOBAL',
  SET_OVERRIDE: 'SET_OVERRIDE',
  SET_LINE_WIDTH: 'SET_LINE_WIDTH',
  TOGGLE_PREFERENCE: 'TOGGLE_PREFERENCE',
  SET_DISTANCE_SETTING: 'SET_DISTANCE_SETTING',
  SET_HEX_BOUNDS: 'SET_HEX_BOUNDS',
  SET_COORDINATE_MODE: 'SET_COORDINATE_MODE',
  SET_IMAGE_SEARCH_RESULTS: 'SET_IMAGE_SEARCH_RESULTS',
  SET_IMAGE_DISPLAY_NAME: 'SET_IMAGE_DISPLAY_NAME',
  IMAGE_SELECTED: 'IMAGE_SELECTED',
  CLEAR_IMAGE: 'CLEAR_IMAGE',
  SET_DENSITY: 'SET_DENSITY',
  SET_CUSTOM_COLUMNS: 'SET_CUSTOM_COLUMNS',
  SET_SIZING_MODE: 'SET_SIZING_MODE',
  SET_MEASUREMENT_METHOD: 'SET_MEASUREMENT_METHOD',
  SET_MEASUREMENT_SIZE: 'SET_MEASUREMENT_SIZE',
  SET_FINE_TUNE: 'SET_FINE_TUNE',
  RESET_FINE_TUNE: 'RESET_FINE_TUNE',
  TOGGLE_BOUNDS_LOCK: 'TOGGLE_BOUNDS_LOCK',
  SET_IMAGE_OPACITY: 'SET_IMAGE_OPACITY',
  SET_IMAGE_OFFSET_X: 'SET_IMAGE_OFFSET_X',
  SET_IMAGE_OFFSET_Y: 'SET_IMAGE_OFFSET_Y',
  SET_ACTIVE_COLOR_PICKER: 'SET_ACTIVE_COLOR_PICKER',
  SET_LOADING: 'SET_LOADING',
  SHOW_RESIZE_CONFIRM: 'SHOW_RESIZE_CONFIRM',
  CONFIRM_RESIZE_DELETE: 'CONFIRM_RESIZE_DELETE',
  CANCEL_RESIZE: 'CANCEL_RESIZE',
  CLEAR_DELETE_FLAG: 'CLEAR_DELETE_FLAG',
  // Fog of War image actions
  SET_FOG_IMAGE_DISPLAY_NAME: 'SET_FOG_IMAGE_DISPLAY_NAME',
  SET_FOG_IMAGE_SEARCH_RESULTS: 'SET_FOG_IMAGE_SEARCH_RESULTS',
  FOG_IMAGE_SELECTED: 'FOG_IMAGE_SELECTED',
  CLEAR_FOG_IMAGE: 'CLEAR_FOG_IMAGE'
};

// ============================================================================
// PURE HELPER FUNCTIONS
// ============================================================================

/**
 * Check if content would be orphaned by new bounds
 */
function getOrphanedContentInfo(newBounds, mapType, currentCells, currentObjects, orientation) {
  if (mapType !== 'hex') return { cells: 0, objects: 0 };
  
  let orphanedCells = 0;
  let orphanedObjects = 0;
  
  if (currentCells?.length > 0) {
    currentCells.forEach(cell => {
      const { col, row } = axialToOffset(cell.q, cell.r, orientation);
      if (!isWithinOffsetBounds(col, row, newBounds)) {
        orphanedCells++;
      }
    });
  }
  
  if (currentObjects?.length > 0) {
    currentObjects.forEach(obj => {
      const { col, row } = axialToOffset(obj.position.x, obj.position.y, orientation);
      if (!isWithinOffsetBounds(col, row, newBounds)) {
        orphanedObjects++;
      }
    });
  }
  
  return { cells: orphanedCells, objects: orphanedObjects };
}

/**
 * Calculate new bounds based on sizing mode and settings
 */
function calculateBoundsFromSettings(imageDimensions, sizingMode, gridDensity, customColumns, measurementSize, measurementMethod, orientation) {
  if (!imageDimensions) return null;
  
  if (sizingMode === 'density') {
    const columns = gridDensity === 'custom' ? customColumns : GRID_DENSITY_PRESETS[gridDensity]?.columns ?? 24;
    const calc = calculateGridFromColumns(imageDimensions.width, imageDimensions.height, columns, orientation);
    return { maxCol: calc.columns, maxRow: calc.rows };
  } else {
    const calc = calculateGridFromMeasurement(imageDimensions.width, imageDimensions.height, measurementSize, measurementMethod, orientation);
    return { maxCol: calc.columns, maxRow: calc.rows };
  }
}

/**
 * Build initial state from props and global settings
 */
function buildInitialState(props, globalSettings) {
  const {
    initialTab,
    mapType,
    currentSettings,
    currentPreferences,
    currentHexBounds,
    currentBackgroundImage,
    currentDistanceSettings
  } = props;
  
  const isHexMap = mapType === 'hex';
  const defaultDistancePerCell = isHexMap 
    ? (globalSettings.distancePerCellHex ?? 6) 
    : (globalSettings.distancePerCellGrid ?? 5);
  const defaultDistanceUnit = isHexMap 
    ? (globalSettings.distanceUnitHex ?? 'mi') 
    : (globalSettings.distanceUnitGrid ?? 'ft');
  
  return {
    activeTab: initialTab || 'appearance',
    
    useGlobalSettings: currentSettings?.useGlobalSettings ?? true,
    overrides: {
      gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor,
      gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
      backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor,
      borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor,
      coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor,
      coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor,
      coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow,
      canvasHeight: currentSettings?.overrides?.canvasHeight ?? globalSettings.canvasHeight ?? 600,
      canvasHeightMobile: currentSettings?.overrides?.canvasHeightMobile ?? globalSettings.canvasHeightMobile ?? 400,
      // Fog of War appearance
      fogOfWarColor: currentSettings?.overrides?.fogOfWarColor ?? globalSettings.fogOfWarColor,
      fogOfWarOpacity: currentSettings?.overrides?.fogOfWarOpacity ?? globalSettings.fogOfWarOpacity,
      fogOfWarImage: currentSettings?.overrides?.fogOfWarImage ?? globalSettings.fogOfWarImage,
      fogOfWarBlurEnabled: currentSettings?.overrides?.fogOfWarBlurEnabled ?? globalSettings.fogOfWarBlurEnabled,
      fogOfWarBlurFactor: currentSettings?.overrides?.fogOfWarBlurFactor ?? globalSettings.fogOfWarBlurFactor,
      // Controls visibility
      alwaysShowControls: currentSettings?.overrides?.alwaysShowControls ?? globalSettings.alwaysShowControls ?? false
    },
    
    preferences: {
      rememberPanZoom: currentPreferences?.rememberPanZoom ?? true,
      rememberSidebarState: currentPreferences?.rememberSidebarState ?? true,
      rememberExpandedState: currentPreferences?.rememberExpandedState ?? false
    },
    
    distanceSettings: {
      useGlobalDistance: currentDistanceSettings?.useGlobalDistance ?? true,
      distancePerCell: currentDistanceSettings?.distancePerCell ?? defaultDistancePerCell,
      distanceUnit: currentDistanceSettings?.distanceUnit ?? defaultDistanceUnit,
      gridDiagonalRule: currentDistanceSettings?.gridDiagonalRule ?? (globalSettings.gridDiagonalRule ?? 'alternating'),
      displayFormat: currentDistanceSettings?.displayFormat ?? (globalSettings.distanceDisplayFormat ?? 'both')
    },
    
    hexBounds: {
      maxCol: currentHexBounds?.maxCol ?? 26,
      maxRow: currentHexBounds?.maxRow ?? 20
    },
    
    coordinateDisplayMode: currentSettings?.coordinateDisplayMode ?? 'rectangular',
    
    backgroundImagePath: currentBackgroundImage?.path ?? null,
    backgroundImageDisplayName: currentBackgroundImage?.path 
      ? getDisplayNameFromPath(currentBackgroundImage.path) 
      : '',
    imageDimensions: null,
    imageSearchResults: [],
    
    // Fog of War image picker state
    fogImageDisplayName: currentSettings?.overrides?.fogOfWarImage 
      ? getDisplayNameFromPath(currentSettings.overrides.fogOfWarImage) 
      : '',
    fogImageSearchResults: [],
    
    gridDensity: currentBackgroundImage?.gridDensity ?? 'medium',
    customColumns: currentBackgroundImage?.customColumns ?? 24,
    boundsLocked: currentBackgroundImage?.path ? (currentBackgroundImage.lockBounds ?? true) : false,
    
    imageOpacity: currentBackgroundImage?.opacity ?? 1,
    imageOffsetX: currentBackgroundImage?.offsetX ?? 0,
    imageOffsetY: currentBackgroundImage?.offsetY ?? 0,
    
    sizingMode: currentBackgroundImage?.sizingMode ?? 'density',
    measurementMethod: currentBackgroundImage?.measurementMethod ?? MEASUREMENT_CORNER,
    measurementSize: currentBackgroundImage?.measurementSize ?? 86,
    fineTuneEnabled: (currentBackgroundImage?.fineTuneOffset ?? 0) !== 0,
    fineTuneOffset: currentBackgroundImage?.fineTuneOffset ?? 0,
    
    activeColorPicker: null,
    isLoading: false,
    
    showResizeConfirm: false,
    pendingBoundsChange: null,
    orphanInfo: { cells: 0, objects: 0 },
    deleteOrphanedContent: false
  };
}

// ============================================================================
// REDUCER
// ============================================================================

function settingsReducer(state, action) {
  switch (action.type) {
    
    case Actions.INITIALIZE:
      return buildInitialState(action.payload.props, action.payload.globalSettings);
    
    case Actions.SET_TAB:
      return { ...state, activeTab: action.payload };
    
    case Actions.TOGGLE_USE_GLOBAL:
      return { ...state, useGlobalSettings: !state.useGlobalSettings };
    
    case Actions.SET_OVERRIDE:
      return {
        ...state,
        overrides: { ...state.overrides, [action.payload.key]: action.payload.value }
      };
    
    case Actions.SET_LINE_WIDTH: {
      const numValue = parseInt(action.payload, 10);
      if (isNaN(numValue) || numValue < 1 || numValue > 5) return state;
      return {
        ...state,
        overrides: { ...state.overrides, gridLineWidth: numValue }
      };
    }
    
    case Actions.TOGGLE_PREFERENCE:
      return {
        ...state,
        preferences: {
          ...state.preferences,
          [action.payload]: !state.preferences[action.payload]
        }
      };
    
    case Actions.SET_DISTANCE_SETTING:
      return {
        ...state,
        distanceSettings: { ...state.distanceSettings, ...action.payload }
      };
    
    case Actions.SET_HEX_BOUNDS:
      return { ...state, hexBounds: action.payload };
    
    case Actions.SET_COORDINATE_MODE:
      return { ...state, coordinateDisplayMode: action.payload };
    
    case Actions.SET_IMAGE_SEARCH_RESULTS:
      return { ...state, imageSearchResults: action.payload };
    
    case Actions.SET_IMAGE_DISPLAY_NAME:
      return { ...state, backgroundImageDisplayName: action.payload };
    
    case Actions.IMAGE_SELECTED: {
      const { path, displayName, dimensions, bounds } = action.payload;
      return {
        ...state,
        backgroundImagePath: path,
        backgroundImageDisplayName: displayName,
        imageDimensions: dimensions,
        imageSearchResults: [],
        hexBounds: bounds,
        boundsLocked: true
      };
    }
    
    case Actions.CLEAR_IMAGE:
      return {
        ...state,
        backgroundImagePath: null,
        backgroundImageDisplayName: '',
        imageDimensions: null,
        boundsLocked: false,
        imageSearchResults: []
      };
    
    case Actions.SET_DENSITY: {
      const { density, orientation } = action.payload;
      const newState = { ...state, gridDensity: density };
      
      if (state.imageDimensions && state.boundsLocked) {
        const columns = density === 'custom' ? state.customColumns : GRID_DENSITY_PRESETS[density]?.columns ?? 24;
        const calc = calculateGridFromColumns(state.imageDimensions.width, state.imageDimensions.height, columns, orientation);
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_CUSTOM_COLUMNS: {
      const { columns, orientation } = action.payload;
      const numValue = parseInt(columns, 10);
      if (isNaN(numValue) || numValue <= 0) return state;
      
      const newState = { ...state, customColumns: numValue };
      
      if (state.imageDimensions && state.boundsLocked && state.gridDensity === 'custom') {
        const calc = calculateGridFromColumns(state.imageDimensions.width, state.imageDimensions.height, numValue, orientation);
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_SIZING_MODE:
      return { ...state, sizingMode: action.payload };
    
    case Actions.SET_MEASUREMENT_METHOD: {
      const { method, orientation } = action.payload;
      const newState = { ...state, measurementMethod: method };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(state.imageDimensions.width, state.imageDimensions.height, state.measurementSize, method, orientation);
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_MEASUREMENT_SIZE: {
      const { size, orientation } = action.payload;
      const numValue = parseFloat(size);
      if (isNaN(numValue) || !validateMeasurementSize(numValue).valid) return state;
      
      const newState = { ...state, measurementSize: numValue };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(state.imageDimensions.width, state.imageDimensions.height, numValue, state.measurementMethod, orientation);
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_FINE_TUNE: {
      const { adjustedHexSize, orientation } = action.payload;
      if (!state.imageDimensions || !state.boundsLocked || state.sizingMode !== 'measurement') {
        return state;
      }
      
      const baseHexSize = measurementToHexSize(state.measurementSize, state.measurementMethod, orientation);
      const offset = adjustedHexSize - baseHexSize;
      
      const columns = Math.ceil(state.imageDimensions.width / (adjustedHexSize * (orientation === 'pointy' ? Math.sqrt(3) : 1.5)));
      const rows = Math.ceil(state.imageDimensions.height / (adjustedHexSize * (orientation === 'flat' ? Math.sqrt(3) : 1.5)));
      
      return {
        ...state,
        fineTuneOffset: offset,
        fineTuneEnabled: offset !== 0,
        hexBounds: { maxCol: columns, maxRow: rows }
      };
    }
    
    case Actions.RESET_FINE_TUNE: {
      const { orientation } = action.payload;
      const newState = { ...state, fineTuneOffset: 0, fineTuneEnabled: false };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(state.imageDimensions.width, state.imageDimensions.height, state.measurementSize, state.measurementMethod, orientation);
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.TOGGLE_BOUNDS_LOCK:
      return { ...state, boundsLocked: !state.boundsLocked };
    
    case Actions.SET_IMAGE_OPACITY:
      return { ...state, imageOpacity: action.payload };
    
    case Actions.SET_IMAGE_OFFSET_X:
      return { ...state, imageOffsetX: action.payload };
    
    case Actions.SET_IMAGE_OFFSET_Y:
      return { ...state, imageOffsetY: action.payload };
    
    case Actions.SET_ACTIVE_COLOR_PICKER:
      return { ...state, activeColorPicker: action.payload };
    
    case Actions.SET_LOADING:
      return { ...state, isLoading: action.payload };
    
    case Actions.SHOW_RESIZE_CONFIRM:
      return {
        ...state,
        showResizeConfirm: true,
        pendingBoundsChange: action.payload.pendingBoundsChange,
        orphanInfo: action.payload.orphanInfo
      };
    
    case Actions.CONFIRM_RESIZE_DELETE:
      if (!state.pendingBoundsChange) return state;
      return {
        ...state,
        hexBounds: state.pendingBoundsChange.newBounds,
        deleteOrphanedContent: true,
        showResizeConfirm: false,
        pendingBoundsChange: null
      };
    
    case Actions.CANCEL_RESIZE:
      return {
        ...state,
        showResizeConfirm: false,
        pendingBoundsChange: null
      };
    
    case Actions.CLEAR_DELETE_FLAG:
      return { ...state, deleteOrphanedContent: false };
    
    // Fog of War image picker actions
    case Actions.SET_FOG_IMAGE_DISPLAY_NAME:
      return { ...state, fogImageDisplayName: action.payload };
    
    case Actions.SET_FOG_IMAGE_SEARCH_RESULTS:
      return { ...state, fogImageSearchResults: action.payload };
    
    case Actions.FOG_IMAGE_SELECTED:
      return {
        ...state,
        fogImageDisplayName: action.payload.displayName,
        fogImageSearchResults: [],
        overrides: {
          ...state.overrides,
          fogOfWarImage: action.payload.path
        }
      };
    
    case Actions.CLEAR_FOG_IMAGE:
      return {
        ...state,
        fogImageDisplayName: '',
        fogImageSearchResults: [],
        overrides: {
          ...state.overrides,
          fogOfWarImage: null
        }
      };
    
    default:
      return state;
  }
}

return {
  Actions,
  GRID_DENSITY_PRESETS,
  settingsReducer,
  buildInitialState,
  calculateBoundsFromSettings,
  getOrphanedContentInfo
};