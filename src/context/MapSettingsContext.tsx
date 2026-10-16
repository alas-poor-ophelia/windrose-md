/**
 * MapSettingsContext.tsx
 *
 * React context provider for MapSettingsModal.
 * Manages state via useReducer (logic in settingsReducer.ts),
 * handles effects, and provides handler API to consumers.
 */

import type {
  MapData,
  MapSettings,
  MapType,
  UIPreferences,
  HexBounds,
  BackgroundImage,
  MeasurementMethod,
  LadderConfig,
} from '#types/core/map.types';
import type { Cell } from '#types/core/cell.types';
import type { MapObject } from '#types/objects/object.types';
import type { ExtendedGeometry, LayerVisibility } from '#types/contexts/context.types';
import type { HexColor } from '#types/core/common.types';
import type {
  PluginSettings,
  DiagonalRule,
  DistanceDisplayFormat,
  HexOrientation,
  SettingsTabId,
  ImageDimensions,
} from '#types/settings/settings.types';
import type {
  SettingsModalState,
  BuildInitialStateProps,
  SettingsOverrides,
  SettingsPreferences,
  CoordinateDisplayMode,
  ColorPickerId,
  PreferenceKey,
  ImageSearchResult,
  PendingBoundsChange as ReducerPendingBoundsChange,
  OrphanInfo as ReducerOrphanInfo,
  GridDensityKey,
  SizingMode,
  BoundsShape,
} from '../components/settings/settingsReducer';

import type { ComponentChildren, FunctionComponent } from 'preact';
import { createContext } from 'preact';
import type { MutableRef } from 'preact/hooks';
import { useCallback, useContext, useEffect, useMemo, useReducer, useRef } from 'preact/hooks';
import { Actions, GRID_DENSITY_PRESETS, settingsReducer, buildInitialState, calculateBoundsFromSettings, getOrphanedContentInfo } from '../components/settings/settingsReducer';
import { getActiveLayer } from '../persistence/layerAccessor';
import { countLevelOrphansForBounds } from '../persistence/resizeOperations';
import type { CurrentSettings, CurrentBackgroundImage, CurrentDistanceSettings } from '../components/settings/settingsReducer';
import { getSettings } from '../core/settingsAccessor';
import { isLodLadderEnabled, hasSubHexChildren, hasDepthContent, ladderSettingsPatch, type LadderPatch } from '../core/lodFlags';
import { THEME } from '../core/dmtConstants';
import { getImageDisplayNames, getFullPathFromDisplayName, getDisplayNameFromPath, getImageDimensions } from '../assets/imageOperations';
import { calculateGridFromColumns, measurementToHexSize, MEASUREMENT_CORNER } from '../geometry/core/hexMeasurements';




function filterImagesByTerm(allImages: string[], searchTerm: string): string[] {
  return allImages
    .filter((name: string) => name.toLowerCase().includes(searchTerm.toLowerCase()))
    .slice(0, 10);
}

// ===========================================
// Local Types (context-specific, not in #types/)
// ===========================================

// Re-export imported reducer types for consumers
export type { CoordinateDisplayMode, SettingsModalState, SettingsOverrides, SettingsPreferences, PreferenceKey, ColorPickerId, ImageSearchResult, GridDensityKey, SizingMode, BoundsShape };

/** Tab definition for settings modal */
export interface SettingsTab {
  id: SettingsTabId;
  label: string;
}

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
  gridDensity?: GridDensityKey;
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


/** Orphan info for resize confirmation */
export type OrphanInfo = ReducerOrphanInfo;

/** Pending bounds change for resize confirmation */
export type PendingBoundsChange = ReducerPendingBoundsChange;

/** Distance settings for save (without useGlobalDistance flag) */
interface DistanceSettingsSave {
  distancePerCell: number;
  distanceUnit: string;
  gridDiagonalRule: DiagonalRule;
  displayFormat: DistanceDisplayFormat;
}

/** Settings data passed to onSave */
interface SettingsSaveData {
  useGlobalSettings: boolean;
  overrides: SettingsOverrides | Record<string, never>;
  coordinateDisplayMode: CoordinateDisplayMode;
  distanceSettings: DistanceSettingsSave | null;
  objectSetId?: string | null;
  showParentBackdrop?: boolean;
}

/** Handler functions exposed by context */
interface MapSettingsHandlers {
  // Object set
  handleObjectSetChange: (setId: string | null) => void;

  // Tab navigation
  setActiveTab: (tab: SettingsTabId) => void;

  // Global settings
  handleToggleUseGlobal: () => void;
  handleColorChange: (key: string, value: SettingsOverrides[keyof SettingsOverrides]) => void;
  handleLineWidthChange: (value: number) => void;

  // Preferences
  handlePreferenceToggle: (key: PreferenceKey) => void;

  // Distance settings
  setDistanceSettings: (updates: Partial<DistanceSettings>) => void;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;

  // Sub-hex parent map backdrop override
  setShowParentBackdrop: (value: boolean | undefined) => void;

  // Lattice ladder parameters (hex, capability flag on)
  setLadderConfig: (updates: Partial<Pick<LadderConfig, 'm' | 'minCellPx' | 'maxLevel'>>) => void;
  setLadderEnabled: (enabled: boolean) => void;

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
  handleBoundsShapeChange: (shape: BoundsShape) => void;
  handleRadiusChange: (value: string) => void;
  handleHexBoundsChange: (axis: 'maxCol' | 'maxRow', value: string) => void;
  handleDensityChange: (density: GridDensityKey) => void;
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

// ===========================================
// Context Value Types
// ===========================================

/** Modal shell context - UI chrome + tab-specific data for the settings modal */
interface ModalShellContextValue {
  isOpen: boolean;
  activeTab: SettingsTabId;
  tabs: SettingsTab[];
  mapType: MapType;
  isHexMap: boolean;
  setActiveTab: (tab: SettingsTabId) => void;
  handleSave: () => void;
  handleCancel: () => void;
  mouseDownTargetRef: MutableRef<EventTarget | null>;
  // Measurement tab fields
  distanceSettings: DistanceSettings;
  setDistanceSettings: (updates: Partial<DistanceSettings>) => void;
  // Preferences tab fields
  preferences: SettingsPreferences;
  handlePreferenceToggle: (key: PreferenceKey) => void;
  // Export (PreferencesTab)
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
  /** Live content visibility; seeds the image export dialog */
  layerVisibility: LayerVisibility;
  // Sub-hex context
  isInSubHex: boolean;
  subMapName: string | null;
  // Delete map (hidden when unavailable)
  mapId: string | undefined;
  onDeleteMap: (() => void) | undefined;
}

/** Appearance context - colors, overrides, fog image */
export interface AppearanceContextValue {
  useGlobalSettings: boolean;
  overrides: SettingsOverrides;
  activeColorPicker: ColorPickerId;
  globalSettings: PluginSettings;
  objectSetId: string | null;
  THEME: typeof THEME;
  fogImageDisplayName: string;
  fogImageSearchResults: ImageSearchResult[];
  pendingCustomColorRef: MutableRef<HexColor | null>;
  handleToggleUseGlobal: () => void;
  handleColorChange: (key: string, value: SettingsOverrides[keyof SettingsOverrides]) => void;
  handleLineWidthChange: (value: number) => void;
  setActiveColorPicker: (picker: string | null) => void;
  handleObjectSetChange: (setId: string | null) => void;
  setFogImageDisplayName: (name: string) => void;
  handleFogImageSearch: (searchTerm: string) => Promise<void>;
  handleFogImageSelect: (displayName: string) => Promise<void>;
  handleFogImageClear: () => void;
}

/** Background image context - image, sizing, density, measurement */
interface BackgroundImageContextValue {
  backgroundImagePath: string | null;
  backgroundImageDisplayName: string;
  imageDimensions: ImageDimensions | null;
  imageSearchResults: ImageSearchResult[];
  imageOpacity: number;
  imageOffsetX: number;
  imageOffsetY: number;
  imageGridSize: number;
  sizingMode: SizingMode;
  gridDensity: GridDensityKey;
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
  handleDensityChange: (density: GridDensityKey) => void;
  handleCustomColumnsChange: (columns: number) => void;
  handleMeasurementMethodChange: (method: MeasurementMethod) => void;
  handleMeasurementSizeChange: (size: number) => void;
  handleFineTuneChange: (adjustedHexSize: number) => void;
  handleFineTuneReset: () => void;
}

/** Hex grid context - bounds, coordinates, resize confirmation */
export interface HexGridContextValue {
  hexBounds: HexBounds;
  boundsShape: BoundsShape;
  boundsLocked: boolean;
  coordinateDisplayMode: CoordinateDisplayMode;
  showResizeConfirm: boolean;
  pendingBoundsChange: PendingBoundsChange | null;
  orphanInfo: OrphanInfo | null;
  handleHexBoundsChange: (axis: 'maxCol' | 'maxRow', value: string) => void;
  handleBoundsShapeChange: (shape: BoundsShape) => void;
  handleRadiusChange: (value: string) => void;
  handleBoundsLockToggle: () => void;
  setCoordinateDisplayMode: (mode: CoordinateDisplayMode) => void;
  handleResizeConfirmDelete: () => void;
  handleResizeConfirmCancel: () => void;
  showParentBackdrop: boolean | undefined;
  setShowParentBackdrop: (value: boolean | undefined) => void;
  /** Explicit ladder opt-in (initially: the map stores a lod). */
  ladderEnabled: boolean;
  setLadderEnabled: (enabled: boolean) => void;
  /** Pending ladder settings: stored `lod` merged with edits; null = none stored and none edited. */
  lod: LadderConfig | null;
  setLadderConfig: (updates: Partial<Pick<LadderConfig, 'm' | 'minCellPx' | 'maxLevel'>>) => void;
}

/** Provider props */
export interface MapSettingsProviderProps {
  children: ComponentChildren;
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    settingsData: MapSettings,
    preferencesData: UIPreferences,
    hexBounds: HexBounds | null,
    backgroundImage: BackgroundImage | null,
    hexSize: number | null,
    deleteOrphanedContent: boolean,
    /** What to do with the stored `mapData.lod`; absent = keep. */
    ladderPatch?: LadderPatch
  ) => void;
  onOpenAlignmentMode?: (currentX: number, currentY: number) => void;
  initialTab?: SettingsTabId | null;
  mapType?: MapType;
  orientation?: HexOrientation;
  currentSettings?: CurrentSettings | null;
  currentPreferences?: SettingsPreferences | null;
  currentHexBounds?: HexBounds | null;
  currentBackgroundImage?: CurrentBackgroundImage | null;
  currentDistanceSettings?: CurrentDistanceSettings | null;
  currentCells?: Cell[];
  currentObjects?: MapObject[];
  currentObjectSetId?: string | null;
  mapData?: MapData | null;
  geometry?: ExtendedGeometry | null;
  layerVisibility?: LayerVisibility;
  isInSubHex?: boolean;
  subMapName?: string | null;
  mapId?: string;
  onDeleteMap?: () => void;
}

// ===========================================
// Contexts
// ===========================================

/**
 * Fallback content visibility for hosts that do not pass the live state.
 * Module scope so the provider's default prop keeps a stable identity.
 */
const DEFAULT_EXPORT_VISIBILITY: LayerVisibility = {
  grid: true,
  objects: true,
  textLabels: true,
  hexCoordinates: false,
  regions: true,
  outlines: true
};

const ModalShellContext = createContext<ModalShellContextValue | null>(null);
const AppearanceContext = createContext<AppearanceContextValue | null>(null);
const BackgroundImageContext = createContext<BackgroundImageContextValue | null>(null);
const HexGridContext = createContext<HexGridContextValue | null>(null);

function useModalShell(): ModalShellContextValue {
  const ctx = useContext(ModalShellContext);
  if (!ctx) throw new Error('useModalShell must be used within MapSettingsProvider');
  return ctx;
}

function useAppearance(): AppearanceContextValue {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error('useAppearance must be used within MapSettingsProvider');
  return ctx;
}

function useBackgroundImage(): BackgroundImageContextValue {
  const ctx = useContext(BackgroundImageContext);
  if (!ctx) throw new Error('useBackgroundImage must be used within MapSettingsProvider');
  return ctx;
}

function useHexGrid(): HexGridContextValue {
  const ctx = useContext(HexGridContext);
  if (!ctx) throw new Error('useHexGrid must be used within MapSettingsProvider');
  return ctx;
}

// ===========================================
// Provider
// ===========================================

const MapSettingsProvider: FunctionComponent<MapSettingsProviderProps> = ({
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
  geometry = null,
  layerVisibility = DEFAULT_EXPORT_VISIBILITY,
  isInSubHex = false,
  subMapName = null,
  mapId,
  onDeleteMap
}) => {
  // Read once per open: getSettings() returns a fresh object every call, which
  // would invalidate AppearanceContext on every provider render (REACT-06).
  const globalSettings = useMemo(() => getSettings(), [isOpen]);
  const isHexMap = mapType === 'hex';

  // State via reducer
  const [state, dispatch] = useReducer(
    settingsReducer,
    { props: { initialTab: initialTab ?? undefined, mapType, currentSettings: currentSettings ?? undefined, currentPreferences: currentPreferences ?? undefined, currentHexBounds: currentHexBounds ?? undefined, currentBackgroundImage: currentBackgroundImage ?? undefined, currentDistanceSettings: currentDistanceSettings ?? undefined, currentObjectSetId, currentLod: mapData?.lod ?? null }, globalSettings },
    (init: { props: BuildInitialStateProps; globalSettings: PluginSettings }) => buildInitialState(init.props, init.globalSettings)
  );

  // Refs
  const pendingCustomColorRef = useRef<HexColor | null>(null);
  const mouseDownTargetRef = useRef<EventTarget | null>(null);
  const imageSearchSeqRef = useRef(0);
  const fogImageSearchSeqRef = useRef(0);
  // Sequence for background-image selection: the open effect's dimension fetch and
  // handleImageSelect both dispatch IMAGE_SELECTED after awaiting; only the latest wins.
  const imageSelectSeqRef = useRef(0);

  // Derived: available tabs
  const tabs = useMemo<SettingsTab[]>(() => {
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
  useEffect(() => {
    if (!isOpen) return;

    dispatch({
      type: Actions.INITIALIZE,
      payload: {
        props: { initialTab: initialTab ?? undefined, mapType, currentSettings: currentSettings ?? undefined, currentPreferences: currentPreferences ?? undefined, currentHexBounds: currentHexBounds ?? undefined, currentBackgroundImage: currentBackgroundImage ?? undefined, currentDistanceSettings: currentDistanceSettings ?? undefined, currentObjectSetId, currentLod: mapData?.lod ?? null },
        globalSettings
      }
    });

    // Load image dimensions async if path exists
    // Invalidate any selection still in flight from a previous open
    const openSeq = ++imageSelectSeqRef.current;

    if (currentBackgroundImage?.path != null && currentBackgroundImage.path !== '') {
      const bgPath = currentBackgroundImage.path;
      void getImageDimensions(bgPath).then((dims: ImageDimensions | null) => {
        // A newer selection (or a close/reopen) superseded this fetch
        if (openSeq !== imageSelectSeqRef.current) return;
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
              path: bgPath,
              displayName: getDisplayNameFromPath(bgPath),
              dimensions: dims,
              bounds: (currentBackgroundImage.lockBounds ?? true) ? bounds : (currentHexBounds ?? { maxCol: 26, maxRow: 20 })
            }
          });
        } else {
          // Grid maps: just set the image path and dimensions
          dispatch({
            type: Actions.IMAGE_SELECTED,
            payload: {
              path: bgPath,
              displayName: getDisplayNameFromPath(bgPath),
              dimensions: dims,
              bounds: null  // Grid maps don't use hex bounds
            }
          });
        }
      });
    }

    return () => {
      // Closing (or re-running on reopen) cancels the pending dimension fetch
      imageSelectSeqRef.current++;
    };
  }, [isOpen]);

  // Close color picker on outside click
  useEffect(() => {
    if (!state.activeColorPicker) return undefined;

    const handleClickOutside = (e: MouseEvent | TouchEvent): void => {
      if (!(e.target instanceof Element)) return;
      const target = e.target;
      const pickerEl = target.closest('.windrose-color-picker');
      const buttonEl = target.closest('.windrose-color-button');
      const modalEl = target.closest('.windrose-settings-modal');

      if (!pickerEl && !buttonEl && modalEl) {
        const picker = state.activeColorPicker;
        if (pendingCustomColorRef.current != null && pendingCustomColorRef.current !== '' && picker != null) {
          dispatch({ type: Actions.SET_OVERRIDE, payload: { key: picker, value: pendingCustomColorRef.current } });
          pendingCustomColorRef.current = null;
        }
        dispatch({ type: Actions.SET_ACTIVE_COLOR_PICKER, payload: null });
      }
    };

    // The provider renders inside an Obsidian Modal (NativeModalPortal) and
    // holds no element of its own; the modal opens in the focused window, and
    // the picker is opened by a click inside it, so activeDocument here IS the
    // modal's document. Captured once so add and remove hit the same document
    // even if focus moves to another window before cleanup.
    const doc = activeDocument;
    const timeoutId = window.setTimeout(() => {
      doc.addEventListener('mousedown', handleClickOutside);
      doc.addEventListener('touchstart', handleClickOutside, { passive: true });
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
      doc.removeEventListener('mousedown', handleClickOutside);
      doc.removeEventListener('touchstart', handleClickOutside);
    };
  }, [state.activeColorPicker]);

  // ===========================================================================
  // Async Handlers
  // ===========================================================================

  const handleImageSearch = useCallback(async (searchTerm: string): Promise<void> => {
    if (searchTerm == null || searchTerm.trim() === '') {
      dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const seq = ++imageSearchSeqRef.current;
    const allImages = await getImageDisplayNames();
    if (seq !== imageSearchSeqRef.current) return;
    dispatch({ type: Actions.SET_IMAGE_SEARCH_RESULTS, payload: filterImagesByTerm(allImages, searchTerm) });
  }, [dispatch]);

  // Latest reducer state for async handlers, so they keep a stable identity
  // instead of listing (and rebuilding on) the state fields they read.
  const stateRef = useRef(state);
  stateRef.current = state;

  const handleImageSelect = useCallback(async (displayName: string): Promise<void> => {
    const seq = ++imageSelectSeqRef.current;
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (seq !== imageSelectSeqRef.current) return;
    if (fullPath == null || fullPath === '') return;

    const dims = await getImageDimensions(fullPath);
    if (seq !== imageSelectSeqRef.current) return;
    if (!dims) return;

    const cur = stateRef.current;
    const bounds = calculateBoundsFromSettings(
      dims, cur.sizingMode, cur.gridDensity, cur.customColumns,
      cur.measurementSize, cur.measurementMethod, orientation
    );

    dispatch({
      type: Actions.IMAGE_SELECTED,
      payload: { path: fullPath, displayName, dimensions: dims, bounds }
    });
  }, [orientation, dispatch]);

  const handleFogImageSearch = useCallback(async (searchTerm: string): Promise<void> => {
    if (searchTerm == null || searchTerm.trim() === '') {
      dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: [] });
      return;
    }
    const seq = ++fogImageSearchSeqRef.current;
    const allImages = await getImageDisplayNames();
    if (seq !== fogImageSearchSeqRef.current) return;
    dispatch({ type: Actions.SET_FOG_IMAGE_SEARCH_RESULTS, payload: filterImagesByTerm(allImages, searchTerm) });
  }, [dispatch]);

  const handleFogImageSelect = useCallback(async (displayName: string): Promise<void> => {
    const fullPath = await getFullPathFromDisplayName(displayName);
    if (fullPath == null || fullPath === '') return;

    dispatch({
      type: Actions.FOG_IMAGE_SELECTED,
      payload: { path: fullPath, displayName }
    });
  }, [dispatch]);

  // Memoized save data — recomputed only when underlying state changes
  const settingsData = useMemo((): SettingsSaveData => ({
    useGlobalSettings: state.useGlobalSettings,
    overrides: state.useGlobalSettings ? {} : state.overrides,
    coordinateDisplayMode: state.coordinateDisplayMode,
    objectSetId: state.objectSetId,
    showParentBackdrop: state.showParentBackdrop,
    distanceSettings: state.distanceSettings.useGlobalDistance ? null : {
      distancePerCell: state.distanceSettings.distancePerCell,
      distanceUnit: state.distanceSettings.distanceUnit,
      gridDiagonalRule: state.distanceSettings.gridDiagonalRule,
      displayFormat: state.distanceSettings.displayFormat
    }
  }), [state.useGlobalSettings, state.overrides, state.coordinateDisplayMode, state.objectSetId, state.showParentBackdrop, state.distanceSettings]);

  const backgroundImageData = useMemo((): BackgroundImageConfig | null => {
    if (state.backgroundImagePath == null || state.backgroundImagePath === '') return null;
    return {
      path: state.backgroundImagePath,
      opacity: state.imageOpacity,
      offsetX: state.imageOffsetX,
      offsetY: state.imageOffsetY,
      ...(mapType === 'grid' ? { imageGridSize: state.imageGridSize } : {}),
      ...(mapType === 'hex' ? {
        lockBounds: state.boundsLocked,
        gridDensity: state.gridDensity,
        customColumns: state.customColumns,
        sizingMode: state.sizingMode,
        measurementMethod: state.measurementMethod,
        measurementSize: state.measurementSize,
        fineTuneOffset: state.fineTuneOffset
      } : {})
    };
  }, [
    state.backgroundImagePath, state.imageOpacity, state.imageOffsetX, state.imageOffsetY,
    state.imageGridSize, state.boundsLocked, state.gridDensity, state.customColumns,
    state.sizingMode, state.measurementMethod, state.measurementSize, state.fineTuneOffset, mapType
  ]);

  const calculatedHexSize = useMemo((): number | null => {
    if (mapType !== 'hex' || state.backgroundImagePath == null || state.backgroundImagePath === '' || !state.boundsLocked || !state.imageDimensions) return null;
    if (state.sizingMode === 'density') {
      const calc = calculateGridFromColumns(state.imageDimensions.width, state.imageDimensions.height, state.hexBounds.maxCol, orientation);
      return calc.hexSize;
    }
    const baseHexSize = measurementToHexSize(state.measurementSize, state.measurementMethod, orientation);
    return state.fineTuneOffset !== 0 ? baseHexSize + state.fineTuneOffset : baseHexSize;
  }, [
    mapType, state.backgroundImagePath, state.boundsLocked, state.imageDimensions,
    state.sizingMode, state.hexBounds.maxCol, orientation,
    state.measurementSize, state.measurementMethod, state.fineTuneOffset
  ]);

  // Core save logic - forceDelete bypasses orphan check
  // onSave is synchronous (it hands new map data to the debounced saver), so there
  // is no in-flight state to show: the modal closes in the same tick.
  const doSave = (forceDelete: boolean = false): void => {
    const mapSettings: MapSettings = {
      useGlobalSettings: settingsData.useGlobalSettings,
      overrides: settingsData.overrides as Record<string, unknown>,
      coordinateDisplayMode: settingsData.coordinateDisplayMode,
      distanceSettings: settingsData.distanceSettings != null ? settingsData.distanceSettings as unknown as Record<string, unknown> : undefined,
      objectSetId: settingsData.objectSetId,
      showParentBackdrop: settingsData.showParentBackdrop,
    };
    // Ladder settings: only from the shown section (hex, flag on, no classic
    // sub-maps). The opt-in toggle decides set / remove; see ladderSettingsPatch.
    const ladderShown = mapType === 'hex' && isLodLadderEnabled() && !(mapData !== null && hasSubHexChildren(mapData));
    const ladderPatch: LadderPatch = ladderShown
      ? ladderSettingsPatch(mapData?.lod, state.ladderEnabled, state.lod, mapData !== null && hasDepthContent(mapData))
      : { kind: 'keep' };
    onSave(mapSettings, state.preferences, mapType === 'hex' ? state.hexBounds : null, backgroundImageData, calculatedHexSize, forceDelete, ladderPatch);
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
        // Scope is the ACTIVE layer only (currentCells/currentObjects are the active
        // layer's level 0); rung cells are counted for that same layer.
        const levelOrphans = mapData !== null ? countLevelOrphansForBounds(mapData, getActiveLayer(mapData), state.hexBounds) : 0;
        const orphans = getOrphanedContentInfo(state.hexBounds, mapType, currentCells, currentObjects, orientation, levelOrphans);
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

  // Stable ref wrappers (handlers closing over changing state keep a stable identity,
  // so the handlers object below can be memoized and listed honestly in downstream memos)
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const stableHandleSave = useCallback(() => handleSaveRef.current(), []);

  const handleResizeConfirmDeleteRef = useRef(handleResizeConfirmDelete);
  handleResizeConfirmDeleteRef.current = handleResizeConfirmDelete;
  const stableHandleResizeConfirmDelete = useCallback(() => handleResizeConfirmDeleteRef.current(), []);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handlers: MapSettingsHandlers = useMemo(() => ({
    // Simple dispatches
    setActiveTab: (tab) => dispatch({ type: Actions.SET_TAB, payload: tab }),
    handleToggleUseGlobal: () => dispatch({ type: Actions.TOGGLE_USE_GLOBAL }),
    handleColorChange: (key, value) => dispatch({ type: Actions.SET_OVERRIDE, payload: { key: key as keyof SettingsOverrides, value } }),
    handleLineWidthChange: (value) => dispatch({ type: Actions.SET_LINE_WIDTH, payload: value }),
    handlePreferenceToggle: (key) => dispatch({ type: Actions.TOGGLE_PREFERENCE, payload: key }),
    setDistanceSettings: (updates) => dispatch({ type: Actions.SET_DISTANCE_SETTING, payload: updates }),
    setCoordinateDisplayMode: (mode) => dispatch({ type: Actions.SET_COORDINATE_MODE, payload: mode }),
    setShowParentBackdrop: (value) => dispatch({ type: Actions.SET_PARENT_BACKDROP, payload: value }),
    setLadderConfig: (updates) => dispatch({ type: Actions.SET_LADDER_CONFIG, payload: updates }),
    setLadderEnabled: (enabled) => dispatch({ type: Actions.SET_LADDER_ENABLED, payload: enabled }),
    setActiveColorPicker: (picker) => dispatch({ type: Actions.SET_ACTIVE_COLOR_PICKER, payload: picker as ColorPickerId }),
    setBackgroundImageDisplayName: (name) => dispatch({ type: Actions.SET_IMAGE_DISPLAY_NAME, payload: name }),
    handleImageClear: () => {
      imageSelectSeqRef.current++; // a pending selection must not resurrect the cleared image
      dispatch({ type: Actions.CLEAR_IMAGE });
    },
    handleSizingModeChange: (mode) => dispatch({ type: Actions.SET_SIZING_MODE, payload: mode }),
    handleBoundsLockToggle: () => dispatch({ type: Actions.TOGGLE_BOUNDS_LOCK }),
    setImageOpacity: (opacity) => dispatch({ type: Actions.SET_IMAGE_OPACITY, payload: opacity }),
    setImageOffsetX: (x) => dispatch({ type: Actions.SET_IMAGE_OFFSET_X, payload: x }),
    setImageOffsetY: (y) => dispatch({ type: Actions.SET_IMAGE_OFFSET_Y, payload: y }),
    setImageGridSize: (size) => dispatch({ type: Actions.SET_IMAGE_GRID_SIZE, payload: size }),
    handleResizeConfirmDelete: stableHandleResizeConfirmDelete,
    handleResizeConfirmCancel: () => dispatch({ type: Actions.CANCEL_RESIZE }),
    handleObjectSetChange: (setId) => dispatch({ type: Actions.SET_OBJECT_SET_ID, payload: setId }),
    handleCancel: () => onCloseRef.current(),

    // Bounds shape (the boundsShape VALUE lives in HexGridContext)
    handleBoundsShapeChange: (shape) => {
      dispatch({ type: Actions.SET_BOUNDS_SHAPE, payload: shape });
    },
    handleRadiusChange: (value) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue <= 0 || numValue > 100) return;
      const derived = 2 * numValue + 1;
      dispatch({ type: Actions.SET_HEX_BOUNDS, payload: { maxCol: derived, maxRow: derived, maxRing: numValue } });
    },

    // The reducer merges the axis into the CURRENT bounds, so this handler does
    // not close over state.hexBounds and stays identity-stable while typing.
    handleHexBoundsChange: (axis, value) => {
      const numValue = parseInt(value, 10);
      if (isNaN(numValue) || numValue <= 0 || numValue > 1000) return;
      dispatch({ type: Actions.SET_HEX_BOUND_AXIS, payload: { axis, value: numValue } });
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
    handleSave: stableHandleSave,

    // Fog of War handlers
    setFogImageDisplayName: (name) => dispatch({ type: Actions.SET_FOG_IMAGE_DISPLAY_NAME, payload: name }),
    handleFogImageSearch,
    handleFogImageSelect,
    handleFogImageClear: () => dispatch({ type: Actions.CLEAR_FOG_IMAGE })
  }), [dispatch, orientation, stableHandleSave, stableHandleResizeConfirmDelete, handleImageSearch, handleImageSelect, handleFogImageSearch, handleFogImageSelect]);

  // ===========================================================================
  // Memoized Sub-Context Values
  // ===========================================================================

  const modalShellValue = useMemo((): ModalShellContextValue => ({
    isOpen, activeTab: state.activeTab, tabs, mapType, isHexMap,
    setActiveTab: handlers.setActiveTab,
    handleSave: stableHandleSave,
    handleCancel: handlers.handleCancel,
    mouseDownTargetRef,
    distanceSettings: state.distanceSettings,
    setDistanceSettings: handlers.setDistanceSettings,
    preferences: state.preferences,
    handlePreferenceToggle: handlers.handlePreferenceToggle,
    mapData, geometry, layerVisibility,
    isInSubHex, subMapName,
    mapId, onDeleteMap
  }), [isOpen, state.activeTab, state.distanceSettings, state.preferences, isInSubHex, subMapName,
    geometry, isHexMap, mapData, layerVisibility, mapType, tabs, stableHandleSave, mapId, onDeleteMap,
    handlers.handleCancel, handlers.handlePreferenceToggle, handlers.setActiveTab, handlers.setDistanceSettings]);

  const appearanceValue = useMemo((): AppearanceContextValue => ({
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
    state.objectSetId, state.fogImageDisplayName, state.fogImageSearchResults,
    globalSettings,
    handlers.handleColorChange, handlers.handleFogImageClear, handlers.handleFogImageSearch,
    handlers.handleFogImageSelect, handlers.handleLineWidthChange, handlers.handleObjectSetChange,
    handlers.handleToggleUseGlobal, handlers.setActiveColorPicker, handlers.setFogImageDisplayName
  ]);

  const backgroundImageValue = useMemo((): BackgroundImageContextValue => ({
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
  }), [
    state.backgroundImagePath, state.backgroundImageDisplayName,
    state.imageDimensions, state.imageSearchResults,
    state.imageOpacity, state.imageOffsetX, state.imageOffsetY, state.imageGridSize,
    state.sizingMode, state.gridDensity, state.customColumns,
    state.measurementMethod, state.measurementSize, state.fineTuneOffset,
    orientation, onOpenAlignmentMode,
    handlers.handleCustomColumnsChange, handlers.handleDensityChange, handlers.handleFineTuneChange,
    handlers.handleFineTuneReset, handlers.handleImageClear, handlers.handleImageSearch,
    handlers.handleImageSelect, handlers.handleMeasurementMethodChange, handlers.handleMeasurementSizeChange,
    handlers.handleSizingModeChange, handlers.setBackgroundImageDisplayName, handlers.setImageGridSize,
    handlers.setImageOffsetX, handlers.setImageOffsetY, handlers.setImageOpacity
  ]);

  const hexGridValue = useMemo((): HexGridContextValue => ({
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
    showParentBackdrop: state.showParentBackdrop,
    setShowParentBackdrop: handlers.setShowParentBackdrop,
    ladderEnabled: state.ladderEnabled,
    setLadderEnabled: handlers.setLadderEnabled,
    lod: state.lod,
    setLadderConfig: handlers.setLadderConfig,
  }), [
    state.hexBounds, state.boundsShape, state.boundsLocked,
    state.coordinateDisplayMode, state.showResizeConfirm,
    state.pendingBoundsChange, state.orphanInfo, state.showParentBackdrop, state.lod, state.ladderEnabled,
    stableHandleResizeConfirmDelete,
    handlers.handleBoundsLockToggle, handlers.handleBoundsShapeChange, handlers.handleHexBoundsChange,
    handlers.handleRadiusChange, handlers.handleResizeConfirmCancel, handlers.setCoordinateDisplayMode,
    handlers.setShowParentBackdrop, handlers.setLadderConfig, handlers.setLadderEnabled
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

export { MapSettingsProvider, GRID_DENSITY_PRESETS, ModalShellContext, AppearanceContext, BackgroundImageContext, HexGridContext, useModalShell, useAppearance, useBackgroundImage, useHexGrid };