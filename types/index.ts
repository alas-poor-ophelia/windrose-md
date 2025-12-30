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
  Bounds,
  GridCoords,
  AxialCoords,
  OffsetCoords,
  CubeCoords,
  ScreenCoords,
  WorldCoords,
  IGeometry,
} from './core/geometry.types';

export type {
  // Cells
  SegmentId,
  SegmentMap,
  SimpleCell,
  SegmentCell,
  Cell,
  CellKey,
  CellMap,
  CellRecord,
  CellLookupResult,
} from './core/cell.types';

export type {
  // Map
  MapType,
  LayerId,
  MapLayer,
  MapData,
  MapDimensions,
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
  ObjectTypeDef,
  ObjectId,
  MapObject,
  PlaceObjectResult,
} from './objects/object.types';

export type {
  NotePinId,
  NotePin,
  TextLabelId,
  TextAlign,
  FontWeight,
  TextLabel,
} from './objects/note.types';

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
export type {
  SelectionType,
  MapSettingsContextValue,
  MapSelectionContextValue,
  EventHandlerContextValue,
  MapContextValue,
} from './contexts/context.types';

// ===========================================
// Datacore Globals
// ===========================================
export type { DatacoreLocalApi } from './datacore-globals';