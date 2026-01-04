/**
 * MapSettingsContext.tsx
 *
 * React context provider for MapSettingsModal.
 * Manages state via useReducer (logic in settingsReducer.ts),
 * handles effects, and provides handler API to consumers.
 */

import type {
  MapData,
  MapType,
  HexBounds,
  GridDensity,
  SizingMode,
  MeasurementMethod,
} from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { MapObject } from '#types/objects/object.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { HexColor } from '#types/core/common.types';
import type {
  PluginSettings,
  DiagonalRule,
  DistanceDisplayFormat,
  HexOrientation,
  SettingsTabId,
  ImageDimensions,
} from '#types/settings/settings.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

// Reducer and pure logic
const {
  Actions,
  GRID_DENSITY_PRESETS,
  settingsReducer,
  buildInitialState,
  calculateBoundsFromSettings,
  getOrphanedContentInfo
} = await requireModuleByName("settingsReducer.ts");

// Dependencies for async operations and constants
const { getSettings } = await requireModuleByName("settingsAccessor.ts");
const { THEME } = await requireModuleByName("dmtConstants.ts");
const {
  getImageDisplayNames,
  getFullPathFromDisplayName,
  getDisplayNameFromPath,
  getImageDimensions
} = await requireModuleByName("imageOperations.ts");
const {
  calculateGridFromColumns,
  calculateGridFromMeasurement,
  measurementToHexSize,
  hexSizeToMeasurement,
  MEASUREMENT_EDGE,
  MEASUREMENT_CORNER,
  getFineTuneRange
} = await requireModuleByName("hexMeasurements.ts");

// ===========================================
// Types
// ===========================================

/** Map type identifier */
export type MapType = 'grid' | 'hex';

/** Settings tab identifiers */
export type SettingsTabId = 'appearance' | 'hexgrid' | 'measurement' | 'preferences';

/** Tab definition */
export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

/** Grid density preset identifiers */
export type GridDensity = 'sparse' | 'medium' | 'dense' | 'custom';

/** Sizing mode for hex background images */
export type SizingMode = 'density' | 'measurement';

/** Measurement method for hex sizing */
export type MeasurementMethod = 'edge' | 'corner';

/** Coordinate display mode */
export type CoordinateDisplayMode = 'none' | 'offset' | 'axial';

/** Hex bounds configuration */
export interface HexBounds {
  maxCol: number;
  maxRow: number;
}

/** Image dimensions */
export interface ImageDimensions {
  width: number;
  height: number;
}

/** Background image configuration */
export interface BackgroundImageConfig {
  path: string | null;
  lockBounds?: boolean;
  gridDensity?: GridDensity;
  customColumns?: number;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  sizingMode?: SizingMode;
  measurementMethod?: MeasurementMethod;
  measurementSize?: number;
  fineTuneOffset?: number;
}

/** Distance settings for measurement */
export interface DistanceSettings {
  useGlobalDistance: boolean;
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** User preferences from settings modal */
export interface ModalPreferences {
  showCompass: boolean;
  expandedByDefault: boolean;
  alwaysShowControls: boolean;
  coordinateKeyMode: 'hold' | 'toggle';
}

/** Orphan info for resize confirmation */
export interface OrphanInfo {
  cells: number;
  objects: number;
}

/** Pending bounds change for resize confirmation */
export interface PendingBoundsChange {
  newBounds: HexBounds;
  previousBounds: HexBounds;
}

/** Settings reducer state shape */
export interface SettingsReducerState {
  // Tab state
  activeTab: SettingsTabId;

  // Global settings toggle
  useGlobalSettings: boolean;
  overrides: Partial<PluginSettings>;

  // Coordinate display
  coordinateDisplayMode: CoordinateDisplayMode;

  // Distance settings
  distanceSettings: DistanceSettings;

  // Hex grid settings
  hexBounds: HexBounds;
  boundsLocked: boolean;

  // Background image settings
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  imageDimensions: ImageDimensions | null;
  imageSearchResults: string[];
  sizingMode: SizingMode;
  gridDensity: GridDensity;
  customColumns: number;
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  fineTuneOffset: number;
  imageOpacity: number;
  imageOffsetX: number;
  imageOffsetY: number;

  // Fog of War image
  fogImagePath: string | null;
  fogImageDisplayName: string;
  fogImageSearchResults: string[];

  // Color picker state
  activeColorPicker: string | null;

  // Preferences
  preferences: ModalPreferences;

  // UI state
  isLoading: boolean;

  // Resize confirmation dialog
  showResizeConfirm: boolean;
  pendingBoundsChange: PendingBoundsChange | null;
  orphanInfo: OrphanInfo | null;
  pendingDeleteOutOfBounds: boolean;
}

/** Distance settings for save (without useGlobalDistance flag) */
export interface DistanceSettingsSave {
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** Settings data passed to onSave */
export interface SettingsSaveData {
  useGlobalSettings: boolean;
  overrides: Partial<PluginSettings>;
  coordinateDisplayMode: CoordinateDisplayMode;
  distanceSettings: DistanceSettingsSave | null;
}

/** Handler functions exposed by context */
export interface MapSettingsHandlers {
  // Tab navigation
  setActiveTab: (tab: SettingsTabId) => void;

  // Global settings
  handleToggleUseGlobal: () => void;
  handleColorChange: (key: string, value: HexColor) => void;
  handleLineWidthChange: (value: number) => void;

  // Preferences
  handlePreferenceToggle: (key: keyof ModalPreferences) => void;

  // Distance settings
  setDistanceSettings: (updates: Partial<DistanceSettings>) => void;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;

  // Color picker
  setActiveColorPicker: (picker: string | null) => void;

  // Background image
  setBackgroundImageDisplayName: (name: string) => void;
  handleImageSearch: (searchTerm: string) => Promise<void>;
  handleImageSelect: (displayName: string) => Promise<void>;
  handleImageClear: () => void;
  handleSizingModeChange: (mode: SizingMode) => void;
  handleBoundsLockToggle: () => void;
  setImageOpacity: (opacity: number) => void;
  setImageOffsetX: (x: number) => void;
  setImageOffsetY: (y: number) => void;

  // Hex grid settings
  handleHexBoundsChange: (axis: 'maxCol' | 'maxRow', value: string) => void;
  handleDensityChange: (density: GridDensity) => void;
  handleCustomColumnsChange: (columns: number) => void;
  handleMeasurementMethodChange: (method: MeasurementMethod) => void;
  handleMeasurementSizeChange: (size: number) => void;
  handleFineTuneChange: (adjustedHexSize: number) => void;
  handleFineTuneReset: () => void;

  // Fog of War image
  setFogImageDisplayName: (name: string) => void;
  handleFogImageSearch: (searchTerm: string) => Promise<void>;
  handleFogImageSelect: (displayName: string) => Promise<void>;
  handleFogImageClear: () => void;

  // Save/cancel
  handleSave: () => void;
  handleCancel: () => void;
  handleResizeConfirmDelete: () => void;
  handleResizeConfirmCancel: () => void;
}

/** Grid calculation result */
export interface GridCalculation {
  hexSize: number;
  maxCol: number;
  maxRow: number;
}

/** Fine tune range result */
export interface FineTuneRange {
  min: number;
  max: number;
  step: number;
}

/** Utility functions exposed by context */
export interface MapSettingsUtilities {
  calculateGridFromColumns: (width: number, height: number, columns: number, orientation: HexOrientation) => GridCalculation;
  calculateGridFromMeasurement: (width: number, height: number, hexSize: number, orientation: HexOrientation) => GridCalculation;
  measurementToHexSize: (measurement: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  hexSizeToMeasurement: (hexSize: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  getFineTuneRange: (baseHexSize: number) => FineTuneRange;
}

/** Constants exposed by context */
export interface MapSettingsConstants {
  GRID_DENSITY_PRESETS: Record<GridDensity, number>;
  MEASUREMENT_EDGE: MeasurementMethod;
  MEASUREMENT_CORNER: MeasurementMethod;
  THEME: Record<string, unknown>;
}

/** Complete MapSettingsContext value shape */
export interface MapSettingsContextValue extends
  SettingsReducerState,
  MapSettingsHandlers,
  MapSettingsUtilities,
  MapSettingsConstants {
  // Props passed through
  isOpen: boolean;
  onClose: () => void;
  onOpenAlignmentMode?: () => void;
  mapType: MapType;
  orientation: HexOrientation;

  // Map data for export
  mapData: MapData | null;
  geometry: IGeometry | null;

  // External data
  globalSettings: PluginSettings;
  tabs: SettingsTab[];
  isHexMap: boolean;

  // Refs
  pendingCustomColorRef: React.MutableRefObject<HexColor | null>;
  mouseDownTargetRef: React.MutableRefObject<EventTarget | null>;
}

/** Provider props */
export interface MapSettingsProviderProps {
  children: React.ReactNode;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    settingsData: SettingsSaveData,
    preferences: ModalPreferences,
    hexBounds: HexBounds | null,
    backgroundImageData: BackgroundImageConfig | undefined,
    calculatedHexSize: number | null,
    forceDelete: boolean
  ) => void;
  onOpenAlignmentMode?: () => void;
  initialTab?: SettingsTabId | null;
  mapType?: MapType;
  orientation?: HexOrientation;
  currentSettings?: Partial<PluginSettings> | null;
  currentPreferences?: Partial<ModalPreferences> | null;
  currentHexBounds?: HexBounds | null;
  currentBackgroundImage?: BackgroundImageConfig | null;
  currentDistanceSettings?: Partial<DistanceSettings> | null;
  currentCells?: Cell[];
  currentObjects?: MapObject[];
  mapData?: MapData | null;
  geometry?: IGeometry | null;
}

// ===========================================
// Context
// ===========================================

const MapSettingsContext = dc.createContext<MapSettingsContextValue | null>(null);

/**
 * Hook to access map settings context
 * @returns Map settings state, handlers, and utilities
 * @throws If used outside MapSettingsProvider
 */
function useMapSettings(): MapSettingsContextValue {
  const context = dc.useContext(MapSettingsContext);
  if (!context) {
    throw new Error('useMapSettings must be used within a MapSettingsProvider');
  }
  return context;
}

// ===========================================
// Provider
// ===========================================

const MapSettingsProvider: React.FC<MapSettingsProviderProps> = ({
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
}) => {
  const globalSettings = getSettings() as PluginSettings;
  const isHexMap = mapType === 'hex';

  // State via reducer
  const [state, dispatch] = dc.useReducer(
    settingsReducer,
    { props: { initialTab, mapType, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings }, globalSettings },
    (init: { props: Record<string, unknown>; globalSettings: PluginSettings }) => buildInitialState(init.props, init.globalSettings) as SettingsReducerState
  );

  // Refs
  const pendingCustomColorRef = dc.useRef<HexColor | null>(null);
  const mouseDownTargetRef = dc.useRef<EventTarget | null>(null);

  // Derived: available tabs
  const tabs = dc.useMemo<SettingsTab[]>(() => {
    const baseTabs: SettingsTab[] = [{ id: 'appearance', label: 'Appearance' }];
    if (mapType === 'hex') baseTabs.push({ id: 'hexgrid', label: 'Hex Grid' });
    baseTabs.push({ id: 'measurement', label: 'Measurement' });
    baseTabs.push({ id: 'preferences', label: 'Preferences' });
    return baseTabs;
  }, [mapType]);

  // ===========================================================================
  // Effects
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
      getImageDimensions(currentBackgroundImage.path).then((dims: ImageDimensions | null) => {
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

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      const target = e.target as Element;
      const pickerEl = target.closest('.dmt-color-picker');
      const buttonEl = target.closest('.dmt-color-button');
      const modalEl = target.closest('.dmt-settings-modal');

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
  // Async Handlers
  // ===========================================================================

  const handleImageSearch = async (searchTerm: string): Promise<void> => {
    if (!searchTerm?.trim()) {
      dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const allImages = await getImageDisplayNames() as string[];
    const filtered = allImages.filter((name: string) => name.toLowerCase().includes(searchTerm.toLowerCase()));
    dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: filtered.slice(0, 10) });
  };

  const handleImageSelect = async (displayName: string): Promise<void> => {
    const fullPath = await getFullPathFromDisplayName(displayName) as string | null;
    if (!fullPath) return;

    const dims = await getImageDimensions(fullPath) as ImageDimensions | null;
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
  const handleFogImageSearch = async (searchTerm: string): Promise<void> => {
    if (!searchTerm?.trim()) {
      dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const allImages = await getImageDisplayNames() as string[];
    const filtered = allImages.filter((name: string) => name.toLowerCase().includes(searchTerm.toLowerCase()));
    dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: filtered.slice(0, 10) });
  };

  const handleFogImageSelect = async (displayName: string): Promise<void> => {
    const fullPath = await getFullPathFromDisplayName(displayName) as string | null;
    if (!fullPath) return;

    dispatch({
      type: Actions.FOG_IMAGE_SELECTED,
      payload: { path: fullPath, displayName }
    });
  };

  // Core save logic - forceDelete bypasses orphan check
  const doSave = (forceDelete: boolean = false): void => {
    dispatch({ type: Actions.SET_LOADING, payload: true });

    const settingsData: SettingsSaveData = {
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

    const backgroundImageData: BackgroundImageConfig | undefined = mapType === 'hex' ? {
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

    let calculatedHexSize: number | null = null;
    if (mapType === 'hex' && state.backgroundImagePath && state.boundsLocked && state.imageDimensions) {
      if (state.sizingMode === 'density') {
        const calc = calculateGridFromColumns(state.imageDimensions.width, state.imageDimensions.height, state.hexBounds.maxCol, orientation) as GridCalculation;
        calculatedHexSize = calc.hexSize;
      } else {
        const baseHexSize = measurementToHexSize(state.measurementSize, state.measurementMethod, orientation) as number;
        calculatedHexSize = state.fineTuneOffset !== 0 ? baseHexSize + state.fineTuneOffset : baseHexSize;
      }
    }

    onSave(settingsData, state.preferences, mapType === 'hex' ? state.hexBounds : null, backgroundImageData, calculatedHexSize, forceDelete);

    dispatch({ type: Actions.CLEAR_DELETE_FLAG });
    dispatch({ type: Actions.SET_LOADING, payload: false });
    onClose();
  };

  const handleSave = (): void => {
    // Check for orphaned content if bounds were reduced (hex maps only)
    if (mapType === 'hex' && currentHexBounds) {
      const isReduction = state.hexBounds.maxCol < currentHexBounds.maxCol ||
                          state.hexBounds.maxRow < currentHexBounds.maxRow;

      if (isReduction) {
        const orphans = getOrphanedContentInfo(state.hexBounds, mapType, currentCells, currentObjects, orientation) as OrphanInfo;
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

  const handleResizeConfirmDelete = (): void => {
    dispatch({ type: Actions.CANCEL_RESIZE }); // Close dialog
    doSave(true); // Save with delete flag
  };

  // ===========================================================================
  // Dispatch Wrappers
  // ===========================================================================

  const handlers: MapSettingsHandlers = {
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
  // Context Value
  // ===========================================================================

  const contextValue: MapSettingsContextValue = {
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
};

return { MapSettingsContext, MapSettingsProvider, useMapSettings, GRID_DENSITY_PRESETS };
