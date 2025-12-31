/**
 * settingsReducer.ts
 * 
 * Pure state management for MapSettingsModal.
 * Contains action types, reducer function, and state initialization logic.
 * No React dependencies - can be unit tested independently.
 */

// Type-only imports
import type { MapType, HexBounds } from '#types/core/map.types';
import type { 
  HexOrientation, 
  DiagonalRule, 
  DistanceDisplayFormat,
  HexColor,
  SettingsTabId
} from '#types/settings/settings.types';
import type { Cell } from '#types/core/cell.types';
import type { MapObject } from '#types/objects/object.types';
import type { MeasurementMethod, GridCalculation } from '../../geometry/hexMeasurements';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { axialToOffset, isWithinOffsetBounds } = await requireModuleByName("offsetCoordinates.js") as {
  axialToOffset: (q: number, r: number, orientation: HexOrientation) => { col: number; row: number };
  isWithinOffsetBounds: (col: number, row: number, bounds: HexBounds) => boolean;
};

const {
  calculateGridFromColumns,
  calculateGridFromMeasurement,
  measurementToHexSize,
  validateMeasurementSize,
  MEASUREMENT_CORNER
} = await requireModuleByName("hexMeasurements.ts") as {
  calculateGridFromColumns: (w: number, h: number, cols: number, o: HexOrientation) => GridCalculation;
  calculateGridFromMeasurement: (w: number, h: number, size: number, method: MeasurementMethod, o: HexOrientation) => GridCalculation;
  measurementToHexSize: (size: number, method: MeasurementMethod, o: HexOrientation) => number;
  validateMeasurementSize: (size: number) => { valid: boolean; error: string | null };
  MEASUREMENT_CORNER: MeasurementMethod;
};

const { getDisplayNameFromPath } = await requireModuleByName("imageOperations.js") as {
  getDisplayNameFromPath: (path: string) => string;
};

// ===========================================
// Type Definitions
// ===========================================

/** Image dimensions */
interface ImageDimensions {
  width: number;
  height: number;
}

/** Grid density preset key */
type GridDensityKey = 'sparse' | 'medium' | 'dense' | 'custom';

/** Grid density preset definition */
interface GridDensityPreset {
  columns: number;
  label: string;
  description: string;
}

/** Sizing mode for background image */
type SizingMode = 'density' | 'measurement';

/** Coordinate display mode */
type CoordinateDisplayMode = 'rectangular' | 'axial' | 'none';

/** Color picker identifier */
type ColorPickerId = 
  | 'gridLineColor'
  | 'backgroundColor'
  | 'borderColor'
  | 'coordinateKeyColor'
  | 'coordinateTextColor'
  | 'coordinateTextShadow'
  | 'fogOfWarColor'
  | null;

/** Preference keys */
type PreferenceKey = 'rememberPanZoom' | 'rememberSidebarState' | 'rememberExpandedState';

/** Override settings */
interface SettingsOverrides {
  gridLineColor: HexColor;
  gridLineWidth: number;
  backgroundColor: HexColor;
  borderColor: HexColor;
  coordinateKeyColor: HexColor;
  coordinateTextColor: HexColor;
  coordinateTextShadow: HexColor;
  canvasHeight: number;
  canvasHeightMobile: number;
  fogOfWarColor: HexColor;
  fogOfWarOpacity: number;
  fogOfWarImage: string | null;
  fogOfWarBlurEnabled: boolean;
  fogOfWarBlurFactor: number;
  alwaysShowControls: boolean;
}

/** User preferences */
interface SettingsPreferences {
  rememberPanZoom: boolean;
  rememberSidebarState: boolean;
  rememberExpandedState: boolean;
}

/** Distance settings */
interface DistanceSettings {
  useGlobalDistance: boolean;
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** Orphan info for resize confirmation */
interface OrphanInfo {
  cells: number;
  objects: number;
}

/** Pending bounds change */
interface PendingBoundsChange {
  newBounds: HexBounds;
  oldBounds: HexBounds;
}

/** Image search result */
interface ImageSearchResult {
  path: string;
  displayName: string;
}

// ===========================================
// Settings Modal State
// ===========================================

/** Complete settings modal state */
interface SettingsModalState {
  activeTab: SettingsTabId;
  
  // Global settings toggle
  useGlobalSettings: boolean;
  overrides: SettingsOverrides;
  
  // Preferences
  preferences: SettingsPreferences;
  
  // Distance settings
  distanceSettings: DistanceSettings;
  
  // Hex bounds
  hexBounds: HexBounds;
  
  // Coordinate display
  coordinateDisplayMode: CoordinateDisplayMode;
  
  // Background image
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  imageDimensions: ImageDimensions | null;
  imageSearchResults: ImageSearchResult[];
  
  // Fog image picker
  fogImageDisplayName: string;
  fogImageSearchResults: ImageSearchResult[];
  
  // Grid density
  gridDensity: GridDensityKey;
  customColumns: number;
  boundsLocked: boolean;
  
  // Image positioning
  imageOpacity: number;
  imageOffsetX: number;
  imageOffsetY: number;
  
  // Sizing mode
  sizingMode: SizingMode;
  measurementMethod: MeasurementMethod;
  measurementSize: number;
  fineTuneEnabled: boolean;
  fineTuneOffset: number;
  
  // UI state
  activeColorPicker: ColorPickerId;
  isLoading: boolean;
  
  // Resize confirmation
  showResizeConfirm: boolean;
  pendingBoundsChange: PendingBoundsChange | null;
  orphanInfo: OrphanInfo;
  deleteOrphanedContent: boolean;
}

// ===========================================
// Props Interface
// ===========================================

/** Current settings from map */
interface CurrentSettings {
  useGlobalSettings?: boolean;
  overrides?: Partial<SettingsOverrides>;
  coordinateDisplayMode?: CoordinateDisplayMode;
}

/** Current background image settings */
interface CurrentBackgroundImage {
  path?: string;
  gridDensity?: GridDensityKey;
  customColumns?: number;
  lockBounds?: boolean;
  opacity?: number;
  offsetX?: number;
  offsetY?: number;
  sizingMode?: SizingMode;
  measurementMethod?: MeasurementMethod;
  measurementSize?: number;
  fineTuneOffset?: number;
}

/** Current distance settings */
interface CurrentDistanceSettings {
  useGlobalDistance?: boolean;
  distancePerCell?: number;
  distanceUnit?: string;
  gridDiagonalRule?: DiagonalRule;
  displayFormat?: DistanceDisplayFormat;
}

/** Global settings from plugin */
interface GlobalSettings {
  gridLineColor?: HexColor;
  gridLineWidth?: number;
  backgroundColor?: HexColor;
  borderColor?: HexColor;
  coordinateKeyColor?: HexColor;
  coordinateTextColor?: HexColor;
  coordinateTextShadow?: HexColor;
  canvasHeight?: number;
  canvasHeightMobile?: number;
  fogOfWarColor?: HexColor;
  fogOfWarOpacity?: number;
  fogOfWarImage?: string | null;
  fogOfWarBlurEnabled?: boolean;
  fogOfWarBlurFactor?: number;
  alwaysShowControls?: boolean;
  distancePerCellHex?: number;
  distancePerCellGrid?: number;
  distanceUnitHex?: string;
  distanceUnitGrid?: string;
  gridDiagonalRule?: DiagonalRule;
  distanceDisplayFormat?: DistanceDisplayFormat;
}

/** Props for buildInitialState */
interface BuildInitialStateProps {
  initialTab?: SettingsTabId;
  mapType: MapType;
  currentSettings?: CurrentSettings;
  currentPreferences?: SettingsPreferences;
  currentHexBounds?: HexBounds;
  currentBackgroundImage?: CurrentBackgroundImage;
  currentDistanceSettings?: CurrentDistanceSettings;
}

// ===========================================
// Action Types
// ===========================================

/** Action type string literals */
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
  SET_FOG_IMAGE_DISPLAY_NAME: 'SET_FOG_IMAGE_DISPLAY_NAME',
  SET_FOG_IMAGE_SEARCH_RESULTS: 'SET_FOG_IMAGE_SEARCH_RESULTS',
  FOG_IMAGE_SELECTED: 'FOG_IMAGE_SELECTED',
  CLEAR_FOG_IMAGE: 'CLEAR_FOG_IMAGE'
} as const;

/** Action type union */
type ActionType = typeof Actions[keyof typeof Actions];

// ===========================================
// Action Interfaces
// ===========================================

interface InitializeAction {
  type: typeof Actions.INITIALIZE;
  payload: { props: BuildInitialStateProps; globalSettings: GlobalSettings };
}

interface SetTabAction {
  type: typeof Actions.SET_TAB;
  payload: SettingsTabId;
}

interface ToggleUseGlobalAction {
  type: typeof Actions.TOGGLE_USE_GLOBAL;
}

interface SetOverrideAction {
  type: typeof Actions.SET_OVERRIDE;
  payload: { key: keyof SettingsOverrides; value: SettingsOverrides[keyof SettingsOverrides] };
}

interface SetLineWidthAction {
  type: typeof Actions.SET_LINE_WIDTH;
  payload: string | number;
}

interface TogglePreferenceAction {
  type: typeof Actions.TOGGLE_PREFERENCE;
  payload: PreferenceKey;
}

interface SetDistanceSettingAction {
  type: typeof Actions.SET_DISTANCE_SETTING;
  payload: Partial<DistanceSettings>;
}

interface SetHexBoundsAction {
  type: typeof Actions.SET_HEX_BOUNDS;
  payload: HexBounds;
}

interface SetCoordinateModeAction {
  type: typeof Actions.SET_COORDINATE_MODE;
  payload: CoordinateDisplayMode;
}

interface SetImageSearchResultsAction {
  type: typeof Actions.SET_IMAGE_SEARCH_RESULTS;
  payload: ImageSearchResult[];
}

interface SetImageDisplayNameAction {
  type: typeof Actions.SET_IMAGE_DISPLAY_NAME;
  payload: string;
}

interface ImageSelectedAction {
  type: typeof Actions.IMAGE_SELECTED;
  payload: { path: string; displayName: string; dimensions: ImageDimensions; bounds: HexBounds };
}

interface ClearImageAction {
  type: typeof Actions.CLEAR_IMAGE;
}

interface SetDensityAction {
  type: typeof Actions.SET_DENSITY;
  payload: { density: GridDensityKey; orientation: HexOrientation };
}

interface SetCustomColumnsAction {
  type: typeof Actions.SET_CUSTOM_COLUMNS;
  payload: { columns: string | number; orientation: HexOrientation };
}

interface SetSizingModeAction {
  type: typeof Actions.SET_SIZING_MODE;
  payload: SizingMode;
}

interface SetMeasurementMethodAction {
  type: typeof Actions.SET_MEASUREMENT_METHOD;
  payload: { method: MeasurementMethod; orientation: HexOrientation };
}

interface SetMeasurementSizeAction {
  type: typeof Actions.SET_MEASUREMENT_SIZE;
  payload: { size: string | number; orientation: HexOrientation };
}

interface SetFineTuneAction {
  type: typeof Actions.SET_FINE_TUNE;
  payload: { adjustedHexSize: number; orientation: HexOrientation };
}

interface ResetFineTuneAction {
  type: typeof Actions.RESET_FINE_TUNE;
  payload: { orientation: HexOrientation };
}

interface ToggleBoundsLockAction {
  type: typeof Actions.TOGGLE_BOUNDS_LOCK;
}

interface SetImageOpacityAction {
  type: typeof Actions.SET_IMAGE_OPACITY;
  payload: number;
}

interface SetImageOffsetXAction {
  type: typeof Actions.SET_IMAGE_OFFSET_X;
  payload: number;
}

interface SetImageOffsetYAction {
  type: typeof Actions.SET_IMAGE_OFFSET_Y;
  payload: number;
}

interface SetActiveColorPickerAction {
  type: typeof Actions.SET_ACTIVE_COLOR_PICKER;
  payload: ColorPickerId;
}

interface SetLoadingAction {
  type: typeof Actions.SET_LOADING;
  payload: boolean;
}

interface ShowResizeConfirmAction {
  type: typeof Actions.SHOW_RESIZE_CONFIRM;
  payload: { pendingBoundsChange: PendingBoundsChange; orphanInfo: OrphanInfo };
}

interface ConfirmResizeDeleteAction {
  type: typeof Actions.CONFIRM_RESIZE_DELETE;
}

interface CancelResizeAction {
  type: typeof Actions.CANCEL_RESIZE;
}

interface ClearDeleteFlagAction {
  type: typeof Actions.CLEAR_DELETE_FLAG;
}

interface SetFogImageDisplayNameAction {
  type: typeof Actions.SET_FOG_IMAGE_DISPLAY_NAME;
  payload: string;
}

interface SetFogImageSearchResultsAction {
  type: typeof Actions.SET_FOG_IMAGE_SEARCH_RESULTS;
  payload: ImageSearchResult[];
}

interface FogImageSelectedAction {
  type: typeof Actions.FOG_IMAGE_SELECTED;
  payload: { path: string; displayName: string };
}

interface ClearFogImageAction {
  type: typeof Actions.CLEAR_FOG_IMAGE;
}

/** Discriminated union of all actions */
type SettingsAction =
  | InitializeAction
  | SetTabAction
  | ToggleUseGlobalAction
  | SetOverrideAction
  | SetLineWidthAction
  | TogglePreferenceAction
  | SetDistanceSettingAction
  | SetHexBoundsAction
  | SetCoordinateModeAction
  | SetImageSearchResultsAction
  | SetImageDisplayNameAction
  | ImageSelectedAction
  | ClearImageAction
  | SetDensityAction
  | SetCustomColumnsAction
  | SetSizingModeAction
  | SetMeasurementMethodAction
  | SetMeasurementSizeAction
  | SetFineTuneAction
  | ResetFineTuneAction
  | ToggleBoundsLockAction
  | SetImageOpacityAction
  | SetImageOffsetXAction
  | SetImageOffsetYAction
  | SetActiveColorPickerAction
  | SetLoadingAction
  | ShowResizeConfirmAction
  | ConfirmResizeDeleteAction
  | CancelResizeAction
  | ClearDeleteFlagAction
  | SetFogImageDisplayNameAction
  | SetFogImageSearchResultsAction
  | FogImageSelectedAction
  | ClearFogImageAction;

// ===========================================
// Constants
// ===========================================

const GRID_DENSITY_PRESETS: Record<Exclude<GridDensityKey, 'custom'>, GridDensityPreset> = {
  sparse: { columns: 12, label: 'Sparse (~12 columns)', description: 'Regional scale' },
  medium: { columns: 24, label: 'Medium (~24 columns)', description: 'Dungeon scale' },
  dense:  { columns: 48, label: 'Dense (~48 columns)', description: 'Tactical scale' }
};

// ===========================================
// Pure Helper Functions
// ===========================================

/**
 * Check if content would be orphaned by new bounds
 */
function getOrphanedContentInfo(
  newBounds: HexBounds,
  mapType: MapType,
  currentCells: Cell[] | null | undefined,
  currentObjects: MapObject[] | null | undefined,
  orientation: HexOrientation
): OrphanInfo {
  if (mapType !== 'hex') return { cells: 0, objects: 0 };
  
  let orphanedCells = 0;
  let orphanedObjects = 0;
  
  if (currentCells && currentCells.length > 0) {
    currentCells.forEach(cell => {
      // Hex cells use q/r (axial) coordinates
      const hexCell = cell as Cell & { q?: number; r?: number };
      if (hexCell.q !== undefined && hexCell.r !== undefined) {
        const { col, row } = axialToOffset(hexCell.q, hexCell.r, orientation);
        if (!isWithinOffsetBounds(col, row, newBounds)) {
          orphanedCells++;
        }
      }
    });
  }
  
  if (currentObjects && currentObjects.length > 0) {
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
function calculateBoundsFromSettings(
  imageDimensions: ImageDimensions | null,
  sizingMode: SizingMode,
  gridDensity: GridDensityKey,
  customColumns: number,
  measurementSize: number,
  measurementMethod: MeasurementMethod,
  orientation: HexOrientation
): HexBounds | null {
  if (!imageDimensions) return null;
  
  if (sizingMode === 'density') {
    const columns = gridDensity === 'custom' 
      ? customColumns 
      : GRID_DENSITY_PRESETS[gridDensity]?.columns ?? 24;
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
function buildInitialState(props: BuildInitialStateProps, globalSettings: GlobalSettings): SettingsModalState {
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
      gridLineColor: currentSettings?.overrides?.gridLineColor ?? globalSettings.gridLineColor ?? '#666666',
      gridLineWidth: currentSettings?.overrides?.gridLineWidth ?? globalSettings.gridLineWidth ?? 1,
      backgroundColor: currentSettings?.overrides?.backgroundColor ?? globalSettings.backgroundColor ?? '#1a1a1a',
      borderColor: currentSettings?.overrides?.borderColor ?? globalSettings.borderColor ?? '#8b6842',
      coordinateKeyColor: currentSettings?.overrides?.coordinateKeyColor ?? globalSettings.coordinateKeyColor ?? '#c4a57b',
      coordinateTextColor: currentSettings?.overrides?.coordinateTextColor ?? globalSettings.coordinateTextColor ?? '#ffffff',
      coordinateTextShadow: currentSettings?.overrides?.coordinateTextShadow ?? globalSettings.coordinateTextShadow ?? '#000000',
      canvasHeight: currentSettings?.overrides?.canvasHeight ?? globalSettings.canvasHeight ?? 600,
      canvasHeightMobile: currentSettings?.overrides?.canvasHeightMobile ?? globalSettings.canvasHeightMobile ?? 400,
      fogOfWarColor: currentSettings?.overrides?.fogOfWarColor ?? globalSettings.fogOfWarColor ?? '#000000',
      fogOfWarOpacity: currentSettings?.overrides?.fogOfWarOpacity ?? globalSettings.fogOfWarOpacity ?? 0.9,
      fogOfWarImage: currentSettings?.overrides?.fogOfWarImage ?? globalSettings.fogOfWarImage ?? null,
      fogOfWarBlurEnabled: currentSettings?.overrides?.fogOfWarBlurEnabled ?? globalSettings.fogOfWarBlurEnabled ?? false,
      fogOfWarBlurFactor: currentSettings?.overrides?.fogOfWarBlurFactor ?? globalSettings.fogOfWarBlurFactor ?? 0.99,
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

// ===========================================
// Reducer
// ===========================================

function settingsReducer(state: SettingsModalState, action: SettingsAction): SettingsModalState {
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
      const numValue = parseInt(String(action.payload), 10);
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
      const newState: SettingsModalState = { ...state, gridDensity: density };
      
      if (state.imageDimensions && state.boundsLocked) {
        const columns = density === 'custom' 
          ? state.customColumns 
          : GRID_DENSITY_PRESETS[density]?.columns ?? 24;
        const calc = calculateGridFromColumns(
          state.imageDimensions.width, 
          state.imageDimensions.height, 
          columns, 
          orientation
        );
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_CUSTOM_COLUMNS: {
      const { columns, orientation } = action.payload;
      const numValue = parseInt(String(columns), 10);
      if (isNaN(numValue) || numValue <= 0) return state;
      
      const newState: SettingsModalState = { ...state, customColumns: numValue };
      
      if (state.imageDimensions && state.boundsLocked && state.gridDensity === 'custom') {
        const calc = calculateGridFromColumns(
          state.imageDimensions.width, 
          state.imageDimensions.height, 
          numValue, 
          orientation
        );
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_SIZING_MODE:
      return { ...state, sizingMode: action.payload };
    
    case Actions.SET_MEASUREMENT_METHOD: {
      const { method, orientation } = action.payload;
      const newState: SettingsModalState = { ...state, measurementMethod: method };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(
          state.imageDimensions.width, 
          state.imageDimensions.height, 
          state.measurementSize, 
          method, 
          orientation
        );
        newState.hexBounds = { maxCol: calc.columns, maxRow: calc.rows };
      }
      
      return newState;
    }
    
    case Actions.SET_MEASUREMENT_SIZE: {
      const { size, orientation } = action.payload;
      const numValue = parseFloat(String(size));
      if (isNaN(numValue) || !validateMeasurementSize(numValue).valid) return state;
      
      const newState: SettingsModalState = { ...state, measurementSize: numValue };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(
          state.imageDimensions.width, 
          state.imageDimensions.height, 
          numValue, 
          state.measurementMethod, 
          orientation
        );
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
      const newState: SettingsModalState = { ...state, fineTuneOffset: 0, fineTuneEnabled: false };
      
      if (state.imageDimensions && state.boundsLocked && state.sizingMode === 'measurement') {
        const calc = calculateGridFromMeasurement(
          state.imageDimensions.width, 
          state.imageDimensions.height, 
          state.measurementSize, 
          state.measurementMethod, 
          orientation
        );
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

// ===========================================
// Exports
// ===========================================

return {
  Actions,
  GRID_DENSITY_PRESETS,
  settingsReducer,
  buildInitialState,
  calculateBoundsFromSettings,
  getOrphanedContentInfo
};