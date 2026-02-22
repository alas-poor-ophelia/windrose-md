/**
 * Windrose Type Definitions - Main Export
 * Path: types/index.ts
 * 
 * Re-exports all types for convenient importing:
 *   import type { Point, Cell, MapObject } from '@types';
 */

// ===========================================
// Core Types
// ===========================================
export type {
  // Geometry
  Point,
  OffsetCoords,
  ScreenCoords,
  WorldCoords,
  GridBounds,
  BoundingBox,
  StrokeStyle,
  GridStyle,
  DistanceOptions,
  IGeometry,
} from './core/geometry.types';

export type {
  // Cells
  SegmentName,
  SegmentMap,
  SimpleGridCell,
  SegmentGridCell,
  GridCell,
  HexCell,
  Cell,
  CellKey,
  CellMap,
  AnyCoords,
  CellUpdate,
  LocalCellPosition,
} from './core/cell.types';

export type {
  // Curves
  CurveId,
  BezierSegment,
  Curve,
} from './core/curve.types';

export type {
  // Map
  MapType,
  LayerId,
  MapLayer,
  MapData,
  MapDimensions,
  ViewState,
  UIPreferences,
  MapSettings,
  BackgroundImage,
  TextLabelSettings,
  GridDensity,
  SizingMode,
  MeasurementMethod,
} from './core/map.types';

export type {
  // Common
  HexColor,
  RGBAColor,
  Opacity,
  Percentage,
  Degrees,
  DeepPartial,
  KeysOfType,
  RequireAtLeastOne,
  EventHandler,
  MouseEventWithCoords,
} from './core/common.types';

// ===========================================
// Object Types
// ===========================================
export type {
  ObjectCategory,
  ObjectAlignment,
  ObjectTypeId,
  ObjectSize,
  ObjectId,
  MapObject,
  ObjectUpdate,
  PlacementResult,
  RemovalResult,
  PlacementOptions,
  AlignmentOffset,
  HexSlot,
  // Object type definitions
  ObjectType,
  ObjectTypeDefinition,
  // Category definitions
  Category,
  CategoryDefinition,
  // Helpers
  RenderChar,
  ValidationResult,
} from './objects/object.types';

export type {
  NotePinId,
  NotePin,
  TextLabelId,
  TextAlign,
  FontWeight,
  TextLabel,
} from './objects/note.types';

export type {
  IconCategory,
  IconData,
  IconMap,
  IconWithClass,
} from './objects/icon.types';

// ===========================================
// Tool Types
// ===========================================
export type {
  ToolId,
  ToolState,
  ToolOptions,
  ToolSwitchAction,
} from './tools/tool.types';

export type {
  ShapeMode,
  DrawingState,
  BrushConfig,
  ShapePreview,
} from './tools/drawing.types';

// ===========================================
// Settings Types
// ===========================================
export type {
  SettingsTabId,
  CoordinateFormat,
  GridLineStyle,
  SettingsState,
  UserPreferences,
  ImageDimensions,
  GridCalculation,
  GridDensityPreset,
  // Object customization (re-exported from objects for convenience)
  ObjectOverride,
  CustomObject,
  CustomCategory,
  ObjectSettings,
} from './settings/settings.types';

export type {
  SettingsActionType,
  SetActiveTabAction,
  SetCellSizeAction,
  SetMapTypeAction,
  SetMapDimensionsAction,
  SetBackgroundColorAction,
  SetGridColorAction,
  ToggleGridAction,
  ToggleCoordinatesAction,
  ResetSettingsAction,
  SettingsAction,
  SettingsReducer,
} from './settings/actions.types';

// ===========================================
// Context Types
// ===========================================
// Note: Context value types (MapSettingsContextValue, MapSelectionContextValue,
// EventHandlerContextValue) are defined inline in their component files.
// Import directly from component if needed - hooks provide type inference.
export type {
  EdgeInfo,
  Edge,
  ExtendedGeometry,
  MapStateContextValue,
  MapOperationsContextValue,
} from './contexts/context.types';

// ===========================================
// Hook Types
// ===========================================
export type {
  HistoryState,
  UseHistoryResult,
} from './hooks/history.types';

export type {
  SaveStatus,
  MapDataUpdater,
  UseMapDataResult,
  MapId,
  MapName,
} from './hooks/mapData.types';

export type {
  LayerHistorySnapshot,
  LayerHistoryCache,
  UseLayerHistoryOptions,
  LayerActions,
  HistoryActions,
  UseLayerHistoryResult,
} from './hooks/layerHistory.types';

export type {
  AreaSelectStart,
  SelectableItem,
  UseAreaSelectResult,
} from './hooks/areaSelect.types';

export type {
  FogToolId,
  FogRectangleStart,
  FogCellPosition,
  CurrentFogState,
  UseFogOfWarOptions,
  FogStateValues,
  FogActions,
  UseFogOfWarResult,
  UseFogToolsResult,
  OnFogChangeCallback,
  OnInitializeFogCallback,
} from './hooks/fog.types';

export type {
  CornerName,
  DiagonalFillStart,
  DiagonalFillEnd,
  DiagonalFillPreview,
  ScreenPosition,
  DiagonalFillViewState,
  UseDiagonalFillResult,
} from './hooks/diagonalFill.types';

export type {
  MeasurementPoint,
  EffectiveDistanceSettings,
  MapDistanceOverrides,
  UseDistanceMeasurementResult,
} from './hooks/distanceMeasurement.types';

export type {
  PreviewSettings,
  ShapeStart,
  RectangleStart,
  CircleStart,
  EdgeLineStart,
  PendingEndPoint,
  ShapeHoverPosition,
  SegmentPickerCell,
  SegmentHoverInfo,
  DragStartContext,
  DrawingStateValues,
  ShapePreviewValues,
  SegmentPickerValues,
  SegmentHoverValues,
  CellOperations,
  EdgeOperations,
  SegmentDrawOperations,
  SegmentPickerOperations,
  DrawingHandlers,
  ShapePreviewOperations,
  SegmentHoverOperations,
  DrawingStateSetters,
  UseDrawingToolsResult,
} from './hooks/drawingTools.types';

export type {
  PanStart,
  TouchCenter,
  ClientCoords,
  CanvasInteractionStateValues,
  CoordinateHelpers,
  ZoomHandlers,
  PanHandlers,
  CanvasInteractionSetters,
  LastTouchTimeRef,
  OnViewStateChangeCallback,
  UseCanvasInteractionResult,
} from './hooks/canvasInteraction.types';

export type {
  SelectedItem,
  DragOffset,
  DragOffsetsMap,
  GroupDragInitialState,
  ObjectDragUpdate,
  TextDragUpdate,
  PositionUpdate,
  UseGroupDragResult,
} from './hooks/groupDrag.types';

export type {
  UseEventCoordinatorOptions,
  SyntheticPointerEvent,
  PendingToolAction,
  AreaSelectPending,
  RegisteredDrawingHandlers,
  ObjectHandlers,
  TextHandlers,
  NotePinHandlers,
  PanZoomHandlers,
  MeasureHandlers,
  AlignmentHandlers,
  FogHandlers,
  AreaSelectHandlers,
  HandlerLayerName,
  HandlerTypeMap,
  GetHandlers,
} from './hooks/eventCoordinator.types';

export type {
  ResizeCorner,
  ResizeInitialState,
  ObjectDragStart,
  ButtonPosition,
  MousePosition,
  ObjectInteractionStateValues,
  ObjectColorBtnRef,
  PendingObjectCustomColorRef,
  LongPressTimerRef,
  HandleObjectPlacement,
  HandleObjectSelection,
  HandleObjectDragging,
  HandleObjectResizing,
  HandleObjectWheel,
  HandleHoverUpdate,
  StopObjectDragging,
  StopObjectResizing,
  HandleObjectKeyDown,
  CalculateButtonPosition,
  HandleNoteSubmit,
  HandleObjectColorSelect,
  HandleObjectColorReset,
  GetClickedCorner,
  UseObjectInteractionsResult,
} from './hooks/objectInteractions.types';

export type {
  HandleNotePinPlacement,
  HandleNoteLinkSave,
  HandleNoteLinkCancel,
  HandleEditNoteLink,
  JustSavedRef,
  UseNotePinInteractionResult,
} from './hooks/notePinInteraction.types';

export type {
  PendingTextPosition,
  TextButtonPosition,
  TextDragStart,
  TextLabelModalData,
  HandleTextPlacement,
  HandleTextSelection,
  HandleTextDragging,
  StopTextDragging,
  HandleTextRotation,
  HandleTextDeletion,
  HandleTextKeyDown,
  HandleTextSubmit,
  HandleTextCancel,
  HandleRotateClick,
  HandleEditClick,
  HandleCanvasDoubleClick,
  CalculateTextButtonPosition,
  UseTextLabelInteractionResult,
} from './hooks/textLabelInteraction.types';

export type {
  RendererSelectedItem,
  LayerVisibility,
  RendererTheme,
  RendererViewState,
  RenderCanvas,
  UseCanvasRenderer,
} from './hooks/canvasRenderer.types';

export type {
  UsePanZoomCoordinatorOptions,
} from './hooks/panZoomCoordinator.types';

export type {
  UseDataHandlersOptions,
  MapHistorySnapshot,
  CustomColor,
  LayerDataChangeHandler,
  HandleCellsChange,
  HandleObjectsChange,
  HandleTextLabelsChange,
  HandleEdgesChange,
  HandleNameChange,
  HandleAddCustomColor,
  HandleDeleteCustomColor,
  HandleUpdateColorOpacity,
  HandleViewStateChange,
  HandleSidebarCollapseChange,
  HandleTextLabelSettingsChange,
  LayerDataHandlers,
  MapDataHandlers,
  UseDataHandlersResult,
} from './hooks/dataHandlers.types';

export type {
  UseImageAlignmentOptions,
  ImageDragOffset,
  DragClientPosition,
  ImageDragHandlerResult,
  UseImageAlignmentResult,
} from './hooks/imageAlignment.types';

// ===========================================
// Datacore Globals
// ===========================================
export type { DatacoreLocalApi } from './datacore-globals';