/**
 * React Context Type Definitions
 *
 * Canonical type definitions for all context values.
 * Hooks and components should import from here — not define inline.
 */

import type { MapObject, ObjectUpdate } from '../objects/object.types';
import type { TextLabel } from '../objects/note.types';
import type { IGeometry, Point } from '../core/geometry.types';
import type { Curve } from '../core/curve.types';
import type { LayerId, MapData, MapType, ShapeOverlay, StoredViewState, TextLabelSettings } from '../core/map.types';
import type { GroupDragInitialState } from '../hooks/groupDrag.types';
import type { Cell } from '../core/cell.types';
import type { BorderSide, Edge } from '../core/rendering.types';
import type { TileAssignment } from '../tiles/tile.types';
import type { WallPath } from '../core/wallpath.types';
import type { TerrainStroke } from '../core/terrainstroke.types';
import type { ToolId } from '../tools/tool.types';
import type { ViewController } from '../hooks/viewController.types';
import type { CanvasCursorStore } from '../hooks/canvasCursor.types';
import type { MapDistanceOverrides } from '../hooks/distanceMeasurement.types';
import type { HandleLevelCellsChange } from '../hooks/dataHandlers.types';
import type { GeometryLadder } from '../../src/geometry/core/createGeometryLadder';

// ===========================================
// Shared Helper Types
// ===========================================

/** Partial update payload for map-level operations (viewState, text label defaults) */
export interface MapDataUpdate {
  viewState?: StoredViewState;
  lastTextLabelSettings?: TextLabelSettings;
}

/** Edge info from geometry */
export interface EdgeInfo {
  x: number;
  y: number;
  side: BorderSide;
}

/** Edge input type for drawing tools (pre-normalization, all 4 sides) */
export interface EdgeInput {
  x: number;
  y: number;
  side: BorderSide;
  color: string;
  opacity?: number;
}

/** Shared geometry extensions beyond IGeometry (present on both grid and hex) */
interface BaseExtendedGeometry extends IGeometry {
  cellSize: number;
  offsetToWorld: (col: number, row: number) => { worldX: number; worldY: number };
  getCellCenter: (x: number, y: number) => { worldX: number; worldY: number };
  getScaledCellSize: (zoom: number) => number;
}

/** Grid-specific geometry extensions */
export interface ExtendedGridGeometry extends BaseExtendedGeometry {
  readonly type: 'grid';
  screenToEdge: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null;
}

/** Hex-specific geometry extensions */
export interface ExtendedHexGeometry extends BaseExtendedGeometry {
  readonly type: 'hex';
  hexSize: number;
  width: number;
  sqrt3: number;
  orientation: 'flat' | 'pointy';
  renderingMode: 'rectangular' | 'radial';
  hexToWorld: (x: number, y: number) => { worldX: number; worldY: number };
  worldToHex: (worldX: number, worldY: number) => { q: number; r: number };
  getHexVertices: (q: number, r: number) => { worldX: number; worldY: number }[];
  getScaledHexSize: (zoom: number) => number;
  getHexRing: (q: number, r: number) => number;
  getAllRadialCells: (maxRing: number) => Array<{ q: number; r: number }>;
  getVisibleHexRange: (offsetX: number, offsetY: number, width: number, height: number, zoom: number) => { minQ: number; maxQ: number; minR: number; maxR: number };
}

/** Extended geometry — discriminated union on `type` field for auto-narrowing */
export type ExtendedGeometry = ExtendedGridGeometry | ExtendedHexGeometry;

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
  /** Shared live pan/zoom controller — overlays subscribe to track gestures. */
  viewController?: ViewController;
  /** Lattice ladder for this map; null on every classic (non-ladder) path. */
  ladder: GeometryLadder | null;
  /**
   * The camera's ladder rung, read from the LIVE zoom at call time (a function,
   * not a value: design section 4.1). 0 when there is no ladder. Tools latch it
   * at pointerdown; nothing should read it per render.
   */
  getActiveLevel: () => number;
  /**
   * Edit-level lock (design 06 s10): the rung authoring tools are pinned to,
   * or null when unlocked (edit follows the camera). Session-only, never
   * persisted; cleared on map change and when the map stops being a ladder view.
   */
  editLevelLock: number | null;
  /** Set (a rung) or clear (null) the edit-level lock. */
  setEditLevelLock: (level: number | null) => void;
  /**
   * The rung authoring tools write to, read LIVE at call time (a function, like
   * getActiveLevel): the camera rung, or the locked rung when it is shallower
   * (`resolveEditLevel`). 0 on classic maps. Read at pointerdown, never per render.
   */
  getEditLevel: () => number;
  /** Cell under the pointer on ladder rung `level`; level 0 equals screenToGrid. */
  screenToLevelCell: (clientX: number, clientY: number, level: number) => Point | null;
  /**
   * Resolved distance overrides for the active map. Sub-hex-aware: inside a
   * sub-hex these are live-derived from the parent chain. Null/undefined means
   * fall through to global settings (root map with no per-map override).
   */
  distanceOverrides?: MapDistanceOverrides | null;
  /** True when the active map is a drilled-into sub-hex (not the root map). */
  isInSubHex?: boolean;
  /**
   * Current sub-hex drill path ('/'-joined "q,r" hexKeys), null at root. Layers
   * encode this into copied deep links so they open at the correct sub-hex.
   */
  subHexPath?: string | null;
  /**
   * Per-mount instance id, stamped into map-scoped custom events so other
   * co-mounted map blocks ignore them (see core/windroseEvents.ts).
   */
  instanceId?: string | null;
  /**
   * Direct sub-hex entry/exit requests from the canvas interaction layer.
   * These replaced the windrose:enter/exit-sub-hex DOM events (2.3.2): the
   * handler always belonged to the same mount as the dispatcher, and the
   * document-wide broadcast made every co-mounted hex map dive in sympathy.
   * Shapes mirror SubHexCoordDetail / SubHexExitDetail in core/windroseEvents.
   */
  requestEnterSubHex?: (detail: {
    q: number;
    r: number;
    viewOverride?: { zoom: number; center: { x: number; y: number } };
    anchor?: { worldX: number; worldY: number };
    canvasSize?: { width: number; height: number };
  }) => void;
  requestExitSubHex?: (detail: {
    childZoom: number;
    childAnchor: { x: number; y: number };
    anchorOffset: { dx: number; dy: number };
  } | null) => void;
  GridGeometry?: new (...args: unknown[]) => ExtendedGeometry;
  HexGeometry?: new (...args: unknown[]) => IGeometry;
  /** Per-map canvas cursor store (hooks/canvas/canvasCursor.ts) */
  cursorStore?: CanvasCursorStore;
  [key: string]: unknown;
}

// ===========================================
// MapOperationsContext
// ===========================================

/** MapOperationsContext value — provided by MapCanvas, consumed by all layers and hooks */
export interface MapOperationsContextValue {
  // Cell operations
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  /** Deep (ladder rung >= 1) cell write on the active layer; absent on hosts without depth authoring. */
  onLevelCellsChange?: HandleLevelCellsChange;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;

  // Object operations
  /** `homeLevel` scopes index matches to one ladder rung; omitted, any rung (classic) matches. */
  getObjectAtPosition: (objects: MapObject[], x: number, y: number, homeLevel?: number) => MapObject | null;
  addObject: (objects: MapObject[], typeId: string, x: number, y: number, mapType?: MapType, objectSetId?: string | null) => MapObject[];
  updateObject: (objects: MapObject[] | null | undefined, objectId: string, updates: ObjectUpdate) => MapObject[];
  removeObject: (objects: MapObject[] | null | undefined, objectId: string) => MapObject[];
  removeObjectsInRectangle: (objects: MapObject[] | null | undefined, x1: number, y1: number, x2: number, y2: number) => MapObject[];
  isAreaFree: (objects: MapObject[] | null | undefined, x: number, y: number, width: number, height: number, excludeId?: string | null, homeLevel?: number) => boolean;
  onObjectsChange: (objects: MapObject[], skipHistory?: boolean) => void;

  // Text label operations
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  addTextLabel: (labels: TextLabel[] | null | undefined, content: string, x: number, y: number, options?: Record<string, unknown>) => TextLabel[];
  updateTextLabel: (labels: TextLabel[] | null | undefined, id: string, updates: Partial<TextLabel>) => TextLabel[];
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
  onTextLabelsChange: (labels: TextLabel[], skipHistory?: boolean) => void;

  // Tile operations
  onTilesChange?: (tiles: TileAssignment[], suppressHistory?: boolean) => void;
  /**
   * Arm a layer (real layer-select: saves the outgoing layer's history stack,
   * sets the active layer, restores the incoming one's). Tools need this when
   * an edit targets a layer other than the active one — history is per layer
   * and undo always restores into whichever layer is active.
   */
  onLayerSelect?: (layerId: LayerId) => void;
  /**
   * Drop every held transient-history baseline (useLayerHistory.clearTransient).
   * Called at gesture boundaries: a new pointer-down, pointercancel, and the
   * cancel/no-move branches of drag hooks, so an abandoned drag's pin is not
   * absorbed by the next unrelated commit.
   */
  clearTransient?: () => void;

  // Wall/path strip and terrain stroke operations (whole-entry erase)
  onWallPathsChange?: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  onTerrainStrokesChange?: (strokes: TerrainStroke[], suppressHistory?: boolean) => void;

  // Map-level operations
  onMapDataUpdate?: (updates: MapDataUpdate) => void;
  [key: string]: unknown;
}

// ===========================================
// MapSelectionContext
// ===========================================
// Moved from MapSelectionContext.tsx to be importable by hooks via #types/

/** Selected item types */
export type SelectableItemType = 'object' | 'text' | 'shapeOverlay';

/** A selected item — discriminated union enables type-safe data narrowing */
export type SelectedItem =
  | { type: 'object'; id: string; data?: MapObject }
  | { type: 'text'; id: string; data?: TextLabel }
  | { type: 'shapeOverlay'; id: string; data?: ShapeOverlay };

/** World position for area select start */
export interface AreaSelectPosition {
  worldX: number;
  worldY: number;
  x: number;
  y: number;
}

/** Drag start position */
export interface DragStartPosition {
  x: number;
  y: number;
  gridX?: number;
  gridY?: number;
  worldX?: number;
  worldY?: number;
  offsetX?: number;
  offsetY?: number;
  clientX?: number;
  clientY?: number;
  isGroupDrag?: boolean;
  objectId?: string;
  object?: MapObject;
  wasInverted?: boolean;
  freeform?: boolean;
  originalFreeform?: boolean;
}

/** Group drag offset for a single item */
export interface GroupDragOffset {
  type: SelectableItemType;
  gridOffsetX: number;
  gridOffsetY: number;
  worldOffsetX: number;
  worldOffsetY: number;
  freeform?: boolean;
  /** Ladder rung the object lives on (absent = 0); the grid offset is measured on this rung. */
  homeLevel?: number;
}

/** Layer visibility settings */
export interface LayerVisibility {
  grid: boolean;
  objects: boolean;
  textLabels: boolean;
  hexCoordinates?: boolean;
  regions?: boolean;
  outlines?: boolean;
  savedRoutes?: boolean;
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
  label?: string;
  customTooltip?: string;
}

/** Hover context value — provided by MapSelectionProvider, read via useHoverState() */
export interface MapHoverContextValue {
  hoveredObject: HoveredObject | null;
  mousePosition: MousePosition | null;
}

/** Item update for updateSelectedItemsData */
export interface ItemUpdate {
  id: string;
  [key: string]: unknown;
}

/** MapSelectionContext value — provided by MapSelectionProvider, consumed by layers and hooks */
export interface MapSelectionContextValue {
  // Multi-select state
  selectedItems: SelectedItem[];
  hasMultiSelection: boolean;
  selectionCount: number;

  // Selection helpers
  selectItem: (item: SelectedItem | null) => void;
  selectMultiple: (items: SelectedItem[] | null) => void;
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

  // Hover setters (stable). The hover VALUES live in MapHoverContextValue
  // (useHoverState) so per-mousemove updates do not re-render selection consumers.
  setHoveredObject: (obj: HoveredObject | null | ((prev: HoveredObject | null) => HoveredObject | null)) => void;
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
