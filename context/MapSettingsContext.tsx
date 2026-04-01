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
// Local Types (context-specific, not in #types/)
// ===========================================

/** Tab definition for settings modal */
export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

/** Coordinate display mode for hex maps */
export type CoordinateDisplayMode = 'none' | 'offset' | 'axial';

/** Background image configuration */
export interface BackgroundImageConfig {
  path: string | null;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;

  // Grid-specific settings (ignored by hex maps)
  imageGridSize?: number;  // Pixel size of grid cells on background image

  // Hex-specific settings (ignored by grid maps)
  lockBounds?: boolean;
  gridDensity?: GridDensity;
  customColumns?: number;
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

  // Background image settings (shared between grid and hex)
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  imageDimensions: ImageDimensions | null;
  imageSearchResults: string[];
  imageOpacity: number;
  imageOffsetX: number;
  imageOffsetY: number;

  // Grid-specific background image settings
  imageGridSize: number;

  // Hex-specific background image settings
  sizingMode: SizingMode;
  gridDensity: GridDensity;
  customColumns: number;
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  fineTuneOffset: number;

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

  // Per-map object set
  objectSetId: string | null;

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
  objectSetId?: string | null;
}

/** Handler functions exposed by context */
export interface MapSettingsHandlers {
  // Object set
  handleObjectSetChange: (setId: string | null) => void;

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

  // Background image (shared)
  setBackgroundImageDisplayName: (name: string) => void;
  handleImageSearch: (searchTerm: string) => Promise<void>;
  handleImageSelect: (displayName: string) => Promise<void>;
  handleImageClear: () => void;
  setImageOpacity: (opacity: number) => void;
  setImageOffsetX: (x: number) => void;
  setImageOffsetY: (y: number) => void;

  // Background image (grid-specific)
  setImageGridSize: (size: number) => void;

  // Background image (hex-specific)
  handleSizingModeChange: (mode: SizingMode) => void;
  handleBoundsLockToggle: () => void;

  // Hex grid settings
  boundsShape: 'rectangular' | 'radial';
  handleBoundsShapeChange: (shape: 'rectangular' | 'radial') => void;
  handleRadiusChange: (value: string) => void;
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

// ===========================================
// Context Value Types
// ===========================================

/** Modal shell context - UI chrome + tab-specific data for the settings modal */
export interface ModalShellContextValue {
  isOpen: boolean;
  activeTab: SettingsTabId;
  tabs: SettingsTab[];
  mapType: MapType;
  isHexMap: boolean;
  isLoading: boolean;
  setActiveTab: (tab: SettingsTabId) => void;
  handleSave: () => void;
  handleCancel: () => void;
  mouseDownTargetRef: React.MutableRefObject<EventTarget | null>;
  // Measurement tab fields
  distanceSettings: DistanceSettings;
  setDistanceSettings: (updates: Partial<DistanceSettings>) => void;
  // Preferences tab fields
  preferences: ModalPreferences;
  handlePreferenceToggle: (key: keyof ModalPreferences) => void;
  // Export (PreferencesTab)
  mapData: MapData | null;
  geometry: IGeometry | null;
}

/** Appearance context - colors, overrides, fog image */
export interface AppearanceContextValue {
  useGlobalSettings: boolean;
  overrides: Partial<PluginSettings>;
  activeColorPicker: string | null;
  globalSettings: PluginSettings;
  objectSetId: string | null;
  THEME: Record<string, unknown>;
  fogImageDisplayName: string;
  fogImageSearchResults: string[];
  pendingCustomColorRef: React.MutableRefObject<HexColor | null>;
  handleToggleUseGlobal: () => void;
  handleColorChange: (key: string, value: HexColor) => void;
  handleLineWidthChange: (value: number) => void;
  setActiveColorPicker: (picker: string | null) => void;
  handleObjectSetChange: (setId: string | null) => void;
  setFogImageDisplayName: (name: string) => void;
  handleFogImageSearch: (searchTerm: string) => Promise<void>;
  handleFogImageSelect: (displayName: string) => Promise<void>;
  handleFogImageClear: () => void;
}

/** Background image context - image, sizing, density, measurement */
export interface BackgroundImageContextValue {
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  imageDimensions: ImageDimensions | null;
  imageSearchResults: string[];
  imageOpacity: number;
  imageOffsetX: number;
  imageOffsetY: number;
  imageGridSize: number;
  sizingMode: SizingMode;
  gridDensity: GridDensity;
  customColumns: number;
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  fineTuneOffset: number;
  orientation: HexOrientation;
  onOpenAlignmentMode?: (currentX: number, currentY: number) => void;
  setBackgroundImageDisplayName: (name: string) => void;
  handleImageSearch: (searchTerm: string) => Promise<void>;
  handleImageSelect: (displayName: string) => Promise<void>;
  handleImageClear: () => void;
  setImageOpacity: (opacity: number) => void;
  setImageOffsetX: (x: number) => void;
  setImageOffsetY: (y: number) => void;
  setImageGridSize: (size: number) => void;
  handleSizingModeChange: (mode: SizingMode) => void;
  handleDensityChange: (density: GridDensity) => void;
  handleCustomColumnsChange: (columns: number) => void;
  handleMeasurementMethodChange: (method: MeasurementMethod) => void;
  handleMeasurementSizeChange: (size: number) => void;
  handleFineTuneChange: (adjustedHexSize: number) => void;
  handleFineTuneReset: () => void;
  GRID_DENSITY_PRESETS: Record<GridDensity, number>;
  MEASUREMENT_EDGE: MeasurementMethod;
  MEASUREMENT_CORNER: MeasurementMethod;
  calculateGridFromColumns: (width: number, height: number, columns: number, orientation: HexOrientation) => GridCalculation;
  calculateGridFromMeasurement: (width: number, height: number, hexSize: number, orientation: HexOrientation) => GridCalculation;
  measurementToHexSize: (measurement: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  hexSizeToMeasurement: (hexSize: number, method: MeasurementMethod, orientation: HexOrientation) => number;
  getFineTuneRange: (baseHexSize: number) => FineTuneRange;
}

/** Hex grid context - bounds, coordinates, resize confirmation */
export interface HexGridContextValue {
  hexBounds: HexBounds;
  boundsShape: 'rectangular' | 'radial';
  boundsLocked: boolean;
  coordinateDisplayMode: CoordinateDisplayMode;
  showResizeConfirm: boolean;
  pendingBoundsChange: PendingBoundsChange | null;
  orphanInfo: OrphanInfo | null;
  handleHexBoundsChange: (axis: 'maxCol' | 'maxRow', value: string) => void;
  handleBoundsShapeChange: (shape: 'rectangular' | 'radial') => void;
  handleRadiusChange: (value: string) => void;
  handleBoundsLockToggle: () => void;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;
  handleResizeConfirmDelete: () => void;
  handleResizeConfirmCancel: () => void;
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
  onOpenAlignmentMode?: (currentX: number, currentY: number) => void;
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
    backgroundImageData: BackgroundImageConfig | null,
    calculatedHexSize: number | null,
    forceDelete: boolean
  ) => void;
  onOpenAlignmentMode?: (currentX: number, currentY: number) => void;
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
  currentObjectSetId?: string | null;
  mapData?: MapData | null;
  geometry?: IGeometry | null;
}

// ===========================================
// Contexts
// ===========================================

const ModalShellContext = dc.createContext<ModalShellContextValue | null>(null);
const AppearanceContext = dc.createContext<AppearanceContextValue | null>(null);
const BackgroundImageContext = dc.createContext<BackgroundImageContextValue | null>(null);
const HexGridContext = dc.createContext<HexGridContextValue | null>(null);

function useModalShell(): ModalShellContextValue {
  const ctx = dc.useContext(ModalShellContext);
  if (!ctx) throw new Error('useModalShell must be used within MapSettingsProvider');
  return ctx;
}

function useAppearance(): AppearanceContextValue {
  const ctx = dc.useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within MapSettingsProvider');
  return ctx;
}

function useBackgroundImage(): BackgroundImageContextValue {
  const ctx = dc.useContext(BackgroundImageContext);
  if (!ctx) throw new Error('useBackgroundImage must be used within MapSettingsProvider');
  return ctx;
}

function useHexGrid(): HexGridContextValue {
  const ctx = dc.useContext(HexGridContext);
  if (!ctx) throw new Error('useHexGrid must be used within MapSettingsProvider');
  return ctx;
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
  currentObjectSetId = null,
  mapData = null,
  geometry = null
}) => {
  const globalSettings = getSettings() as PluginSettings;
  const isHexMap = mapType === 'hex';

  // State via reducer
  const [state, dispatch] = dc.useReducer(
    settingsReducer,
    { props: { initialTab, mapType, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings, currentObjectSetId }, globalSettings },
    (init: { props: Record<string, unknown>; globalSettings: PluginSettings }) => buildInitialState(init.props, init.globalSettings) as SettingsReducerState
  );

  // Refs
  const pendingCustomColorRef = dc.useRef<HexColor | null>(null);
  const mouseDownTargetRef = dc.useRef<EventTarget | null>(null);

  // Derived: available tabs
  const tabs = dc.useMemo<SettingsTab[]>(() => {
    const baseTabs: SettingsTab[] = [{ id: 'appearance', label: 'Appearance' }];
    if (mapType === 'hex') baseTabs.push({ id: 'hexgrid', label: 'Hex Grid' });
    if (mapType === 'grid') baseTabs.push({ id: 'gridbackground', label: 'Background' });
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
        props: { initialTab, mapType, currentSettings, currentPreferences, currentHexBounds, currentBackgroundImage, currentDistanceSettings, currentObjectSetId },
        globalSettings
      }
    });

    // Load image dimensions async if path exists
    if (currentBackgroundImage?.path) {
      getImageDimensions(currentBackgroundImage.path).then((dims: ImageDimensions | null) => {
        if (!dims) return;

        // For hex maps, calculate bounds from image dimensions
        // For grid maps, we just need the image dimensions and display name
        if (mapType === 'hex') {
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
        } else {
          // Grid maps: just set the image path and dimensions
          dispatch({
            type: Actions.IMAGE_SELECTED,
            payload: {
              path: currentBackgroundImage.path,
              displayName: getDisplayNameFromPath(currentBackgroundImage.path),
              dimensions: dims,
              bounds: null  // Grid maps don't use hex bounds
            }
          });
        }
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
      objectSetId: state.objectSetId,
      distanceSettings: state.distanceSettings.useGlobalDistance ? null : {
        distancePerCell: state.distanceSettings.distancePerCell,
        distanceUnit: state.distanceSettings.distanceUnit,
        gridDiagonalRule: state.distanceSettings.gridDiagonalRule,
        displayFormat: state.distanceSettings.displayFormat
      }
    };

    // Build background image data for both grid and hex maps
    const backgroundImageData: BackgroundImageConfig | null = state.backgroundImagePath ? {
      path: state.backgroundImagePath,
      opacity: state.imageOpacity,
      offsetX: state.imageOffsetX,
      offsetY: state.imageOffsetY,
      // Grid-specific fields
      ...(mapType === 'grid' ? {
        imageGridSize: state.imageGridSize
      } : {}),
      // Hex-specific fields
      ...(mapType === 'hex' ? {
        lockBounds: state.boundsLocked,
        gridDensity: state.gridDensity,
        customColumns: state.customColumns,
        sizingMode: state.sizingMode,
        measurementMethod: state.measurementMethod,
        measurementSize: state.measurementSize,
        fineTuneOffset: state.fineTuneOffset
      } : {})
    } : null;

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
      const isRectReduction = state.hexBounds.maxCol < currentHexBounds.maxCol ||
                              state.hexBounds.maxRow < currentHexBounds.maxRow;
      const isRadialReduction = state.hexBounds.maxRing !== undefined && (
        currentHexBounds.maxRing === undefined ||
        state.hexBounds.maxRing < currentHexBounds.maxRing
      );

      if (isRectReduction || isRadialReduction) {
        const orphans = getOrphanedContentInfo(state.hexBounds, mapType, currentCells, currentObjects, orientation) as OrphanInfo;
        if (orphans.cells > 0 || orphans.objects > 0) {
          dispatch({
            type: Actions.SHOW_RESIZE_CONFIRM,
            payload: {
              pendingBoundsChange: { newBounds: state.hexBounds, oldBounds: currentHexBounds },
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
    setImageGridSize: (size) => dispatch({ type: Actions.SET_IMAGE_GRID_SIZE, payload: size }),
    handleResizeConfirmDelete,
    handleResizeConfirmCancel: () => dispatch({ type: Actions.CANCEL_RESIZE }),
    handleObjectSetChange: (setId) => dispatch({ type: Actions.SET_OBJECT_SET_ID, payload: setId }),
    handleCancel: () => onClose(),

    // Bounds shape
    boundsShape: state.boundsShape,
    handleBoundsShapeChange: (shape) => {
      dispatch({ type: Actions.SET_BOUNDS_SHAPE, payload: shape });
    },
    handleRadiusChange: (value) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue <= 0 || numValue > 100) return;
      const derived = 2 * numValue + 1;
      dispatch({ type: Actions.SET_HEX_BOUNDS, payload: { maxCol: derived, maxRow: derived, maxRing: numValue } });
    },

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
  // Stable Ref Wrappers (for handlers that close over changing state)
  // ===========================================================================

  const handleSaveRef = dc.useRef(handleSave);
  handleSaveRef.current = handleSave;
  const stableHandleSave = dc.useCallback(() => handleSaveRef.current(), []);

  const handleResizeConfirmDeleteRef = dc.useRef(handlers.handleResizeConfirmDelete);
  handleResizeConfirmDeleteRef.current = handlers.handleResizeConfirmDelete;
  const stableHandleResizeConfirmDelete = dc.useCallback(() => handleResizeConfirmDeleteRef.current(), []);

  // ===========================================================================
  // Memoized Sub-Context Values
  // ===========================================================================

  const modalShellValue = dc.useMemo((): ModalShellContextValue => ({
    isOpen, activeTab: state.activeTab, tabs, mapType, isHexMap,
    isLoading: state.isLoading,
    setActiveTab: handlers.setActiveTab,
    handleSave: stableHandleSave,
    handleCancel: handlers.handleCancel,
    mouseDownTargetRef,
    distanceSettings: state.distanceSettings,
    setDistanceSettings: handlers.setDistanceSettings,
    preferences: state.preferences,
    handlePreferenceToggle: handlers.handlePreferenceToggle,
    mapData, geometry
  }), [isOpen, state.activeTab, state.isLoading, state.distanceSettings, state.preferences]);

  const appearanceValue = dc.useMemo((): AppearanceContextValue => ({
    useGlobalSettings: state.useGlobalSettings,
    overrides: state.overrides,
    activeColorPicker: state.activeColorPicker,
    globalSettings,
    objectSetId: state.objectSetId,
    THEME,
    fogImageDisplayName: state.fogImageDisplayName,
    fogImageSearchResults: state.fogImageSearchResults,
    pendingCustomColorRef,
    handleToggleUseGlobal: handlers.handleToggleUseGlobal,
    handleColorChange: handlers.handleColorChange,
    handleLineWidthChange: handlers.handleLineWidthChange,
    setActiveColorPicker: handlers.setActiveColorPicker,
    handleObjectSetChange: handlers.handleObjectSetChange,
    setFogImageDisplayName: handlers.setFogImageDisplayName,
    handleFogImageSearch: handlers.handleFogImageSearch,
    handleFogImageSelect: handlers.handleFogImageSelect,
    handleFogImageClear: handlers.handleFogImageClear,
  }), [
    state.useGlobalSettings, state.overrides, state.activeColorPicker,
    state.objectSetId, state.fogImageDisplayName, state.fogImageSearchResults
  ]);

  const backgroundImageValue = dc.useMemo((): BackgroundImageContextValue => ({
    backgroundImagePath: state.backgroundImagePath,
    backgroundImageDisplayName: state.backgroundImageDisplayName,
    imageDimensions: state.imageDimensions,
    imageSearchResults: state.imageSearchResults,
    imageOpacity: state.imageOpacity,
    imageOffsetX: state.imageOffsetX,
    imageOffsetY: state.imageOffsetY,
    imageGridSize: state.imageGridSize,
    sizingMode: state.sizingMode,
    gridDensity: state.gridDensity,
    customColumns: state.customColumns,
    measurementMethod: state.measurementMethod,
    measurementSize: state.measurementSize,
    fineTuneOffset: state.fineTuneOffset,
    orientation,
    onOpenAlignmentMode,
    setBackgroundImageDisplayName: handlers.setBackgroundImageDisplayName,
    handleImageSearch: handlers.handleImageSearch,
    handleImageSelect: handlers.handleImageSelect,
    handleImageClear: handlers.handleImageClear,
    setImageOpacity: handlers.setImageOpacity,
    setImageOffsetX: handlers.setImageOffsetX,
    setImageOffsetY: handlers.setImageOffsetY,
    setImageGridSize: handlers.setImageGridSize,
    handleSizingModeChange: handlers.handleSizingModeChange,
    handleDensityChange: handlers.handleDensityChange,
    handleCustomColumnsChange: handlers.handleCustomColumnsChange,
    handleMeasurementMethodChange: handlers.handleMeasurementMethodChange,
    handleMeasurementSizeChange: handlers.handleMeasurementSizeChange,
    handleFineTuneChange: handlers.handleFineTuneChange,
    handleFineTuneReset: handlers.handleFineTuneReset,
    GRID_DENSITY_PRESETS,
    MEASUREMENT_EDGE, MEASUREMENT_CORNER,
    calculateGridFromColumns, calculateGridFromMeasurement,
    measurementToHexSize, hexSizeToMeasurement, getFineTuneRange,
  }), [
    state.backgroundImagePath, state.backgroundImageDisplayName,
    state.imageDimensions, state.imageSearchResults,
    state.imageOpacity, state.imageOffsetX, state.imageOffsetY, state.imageGridSize,
    state.sizingMode, state.gridDensity, state.customColumns,
    state.measurementMethod, state.measurementSize, state.fineTuneOffset,
    handleImageSearch, handleImageSelect
  ]);

  const hexGridValue = dc.useMemo((): HexGridContextValue => ({
    hexBounds: state.hexBounds,
    boundsShape: state.boundsShape,
    boundsLocked: state.boundsLocked,
    coordinateDisplayMode: state.coordinateDisplayMode,
    showResizeConfirm: state.showResizeConfirm,
    pendingBoundsChange: state.pendingBoundsChange,
    orphanInfo: state.orphanInfo,
    handleHexBoundsChange: handlers.handleHexBoundsChange,
    handleBoundsShapeChange: handlers.handleBoundsShapeChange,
    handleRadiusChange: handlers.handleRadiusChange,
    handleBoundsLockToggle: handlers.handleBoundsLockToggle,
    setCoordinateDisplayMode: handlers.setCoordinateDisplayMode,
    handleResizeConfirmDelete: stableHandleResizeConfirmDelete,
    handleResizeConfirmCancel: handlers.handleResizeConfirmCancel,
  }), [
    state.hexBounds, state.boundsShape, state.boundsLocked,
    state.coordinateDisplayMode, state.showResizeConfirm,
    state.pendingBoundsChange, state.orphanInfo
  ]);

  return (
    <ModalShellContext.Provider value={modalShellValue}>
      <AppearanceContext.Provider value={appearanceValue}>
        <BackgroundImageContext.Provider value={backgroundImageValue}>
          <HexGridContext.Provider value={hexGridValue}>
            {children}
          </HexGridContext.Provider>
        </BackgroundImageContext.Provider>
      </AppearanceContext.Provider>
    </ModalShellContext.Provider>
  );
};

return {
  MapSettingsProvider, GRID_DENSITY_PRESETS,
  ModalShellContext, AppearanceContext, BackgroundImageContext, HexGridContext,
  useModalShell, useAppearance, useBackgroundImage, useHexGrid,
};
