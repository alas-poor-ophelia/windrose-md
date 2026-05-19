/**
 * React Context Type Definitions
 *
 * Canonical type definitions for all context values.
 * Hooks and components should import from here — not define inline.
 */

import type { MapObject, ObjectUpdate } from '../objects/object.types';
import type { TextLabel, NotePin } from '../objects/note.types';
import type { IGeometry, Point } from '../core/geometry.types';
import type { Curve } from '../core/curve.types';
import type { MapData } from '../core/map.types';
import type { Cell } from '../core/cell.types';
import type { BorderSide } from '../core/rendering.types';
import type { HexTileAssignment } from '../tiles/tile.types';
import type { ToolId } from '../tools/tool.types';

// ===========================================
// Shared Helper Types
// ===========================================

/** Edge info from geometry */
export interface EdgeInfo {
  x: number;
  y: number;
  side: BorderSide;
}

/** Edge type for edge drawing */
export interface Edge {
  x: number;
  y: number;
  side: BorderSide;
  color: string;
  opacity?: number;
}

/** Extended geometry with implementation-specific properties beyond IGeometry */
export interface ExtendedGeometry extends IGeometry {
  /** Grid cell size (GridGeometry) or hex size (HexGeometry) */
  cellSize: number;
  /** Hex-specific: hex radius from center to vertex */
  hexSize?: number;
  /** Hex-specific: hex width in pixels */
  width?: number;
  /** Hex-specific: sqrt(3) cached for hex math */
  sqrt3?: number;
  /** Grid-specific: detect which edge a point is near */
  screenToEdge?: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null;
  /** Hex-specific: convert axial (q,r) to world pixels */
  hexToWorld?: (x: number, y: number) => { worldX: number; worldY: number };
}

/** Drawing layer state change callback shape */
export interface DrawingLayerState {
  isDrawing: boolean;
  rectangleStart: Point | null;
  circleStart: Point | null;
}

/** Pan/zoom layer state change callback shape */
export interface PanZoomLayerState {
  isPanning: boolean;
  isTouchPanning: boolean;
  spaceKeyPressed: boolean;
}

// ===========================================
// MapStateContext
// ===========================================

/** MapStateContext value — provided by MapCanvas, consumed by all layers and hooks */
export interface MapStateContextValue {
  geometry: ExtendedGeometry | null;
  canvasRef: { current: HTMLCanvasElement | null };
  containerRef: { current: HTMLElement | null };
  mapData: MapData | null;
  mapId?: string;
  notePath?: string;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
  currentTool?: ToolId;
  selectedColor?: string;
  selectedObjectType?: string;
  GridGeometry?: new (...args: unknown[]) => ExtendedGeometry;
  HexGeometry?: new (...args: unknown[]) => IGeometry;
  onDrawingStateChange?: (state: DrawingLayerState) => void;
  onPanZoomStateChange?: (state: PanZoomLayerState) => void;
}

// ===========================================
// MapOperationsContext
// ===========================================

/** MapOperationsContext value — provided by MapCanvas, consumed by all layers and hooks */
export interface MapOperationsContextValue {
  // Cell operations
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;

  // Object operations
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
  addObject: (objects: MapObject[], typeId: string, x: number, y: number) => MapObject[];
  updateObject: (objects: MapObject[] | null | undefined, objectId: string, updates: ObjectUpdate) => MapObject[];
  removeObject: (objects: MapObject[] | null | undefined, objectId: string) => MapObject[];
  removeObjectAtPosition: (objects: MapObject[] | null | undefined, x: number, y: number) => MapObject[];
  removeObjectsInRectangle: (objects: MapObject[] | null | undefined, x1: number, y1: number, x2: number, y2: number) => MapObject[];
  isAreaFree: (objects: MapObject[] | null | undefined, x: number, y: number, width: number, height: number, excludeId?: string | null) => boolean;
  canResizeObject: (objects: MapObject[], objectId: string, newWidth: number, newHeight: number, maxSize?: number) => boolean;
  onObjectsChange: (objects: MapObject[]) => void;

  // Text label operations
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  addTextLabel: (labels: TextLabel[] | null | undefined, content: string, x: number, y: number, options?: Record<string, unknown>) => TextLabel[];
  updateTextLabel: (labels: TextLabel[] | null | undefined, id: string, updates: Partial<TextLabel>) => TextLabel[];
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
  onTextLabelsChange: (labels: TextLabel[]) => void;

  // Tile operations
  onTilesChange?: (tiles: HexTileAssignment[], suppressHistory?: boolean) => void;

  // Note pin operations (optional — not all providers include these)
  onNotePinsChange?: (pins: NotePin[]) => void;
  getNotePinAtPosition?: (pins: NotePin[], worldX: number, worldY: number, cellSize: number) => NotePin | null;

  // Map-level operations
  onMapDataUpdate?: (updater: (data: MapData | null) => MapData | null) => void;
}

// ===========================================
// MapSelectionContext
// ===========================================
// Moved from MapSelectionContext.tsx to be importable by hooks via #types/

/** Selected item types */
export type SelectableItemType = 'object' | 'text' | 'notePin' | 'shapeOverlay';

/** A selected item */
export interface SelectedItem {
  type: SelectableItemType;
  id: string;
  data?: Record<string, unknown>;
}

/** World position for area select start */
export interface AreaSelectPosition {
  worldX: number;
  worldY: number;
}

/** Drag start position */
export interface DragStartPosition {
  x: number;
  y: number;
  gridX?: number;
  gridY?: number;
  worldX?: number;
  worldY?: number;
  isGroupDrag?: boolean;
}

/** Group drag offset for a single item */
export interface GroupDragOffset {
  type: SelectableItemType;
  gridOffsetX: number;
  gridOffsetY: number;
  worldOffsetX: number;
  worldOffsetY: number;
}

/** Layer visibility settings */
export interface LayerVisibility {
  objects: boolean;
  textLabels: boolean;
  hexCoordinates: boolean;
  [key: string]: boolean;
}

/** Mouse position */
export interface MousePosition {
  x: number;
  y: number;
}

/** Hovered object info */
export interface HoveredObject {
  id: string;
  type: string;
  [key: string]: unknown;
}

/** Item update for updateSelectedItemsData */
export interface ItemUpdate {
  id: string;
  [key: string]: unknown;
}

/** Initial state for batch history during group drag */
export interface GroupDragInitialState {
  objects: unknown[];
  textLabels: unknown[];
}

/** MapSelectionContext value — provided by MapSelectionProvider, consumed by layers and hooks */
export interface MapSelectionContextValue {
  // Multi-select state
  selectedItems: SelectedItem[];
  setSelectedItems: (items: SelectedItem[] | ((prev: SelectedItem[]) => SelectedItem[])) => void;
  hasMultiSelection: boolean;
  selectionCount: number;

  // Selection helpers
  selectItem: (item: SelectedItem | null) => void;
  selectMultiple: (items: SelectedItem[] | null) => void;
  addToSelection: (item: SelectedItem | null) => void;
  removeFromSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  updateSelectedItemsData: (updates: ItemUpdate[]) => void;

  // Area select state
  areaSelectStart: AreaSelectPosition | null;
  setAreaSelectStart: (pos: AreaSelectPosition | null | ((prev: AreaSelectPosition | null) => AreaSelectPosition | null)) => void;

  // Backward compatibility — single selection
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;

  // Drag state
  isDraggingSelection: boolean;
  setIsDraggingSelection: (value: boolean | ((prev: boolean) => boolean)) => void;
  dragStart: DragStartPosition | null;
  setDragStart: (value: DragStartPosition | null | ((prev: DragStartPosition | null) => DragStartPosition | null)) => void;
  isResizeMode: boolean;
  setIsResizeMode: (value: boolean | ((prev: boolean) => boolean)) => void;

  // Group drag state
  groupDragOffsetsRef: { current: Map<string, GroupDragOffset> };
  groupDragInitialStateRef: { current: GroupDragInitialState | null };
  isGroupDragging: boolean;

  // Hover state
  hoveredObject: HoveredObject | null;
  setHoveredObject: (obj: HoveredObject | null | ((prev: HoveredObject | null) => HoveredObject | null)) => void;
  mousePosition: MousePosition | null;
  setMousePosition: (pos: MousePosition | null | ((prev: MousePosition | null) => MousePosition | null)) => void;

  // Note pin modal state
  showNoteLinkModal: boolean;
  setShowNoteLinkModal: (value: boolean | ((prev: boolean) => boolean)) => void;
  pendingNotePinId: string | null;
  setPendingNotePinId: (value: string | null | ((prev: string | null) => string | null)) => void;
  editingNoteObjectId: string | null;
  setEditingNoteObjectId: (value: string | null | ((prev: string | null) => string | null)) => void;

  // Coordinate overlay state
  showCoordinates: boolean;
  setShowCoordinates: (value: boolean | ((prev: boolean) => boolean)) => void;

  // Layer visibility
  layerVisibility: LayerVisibility;
}
