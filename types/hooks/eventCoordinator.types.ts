/**
 * Event Coordinator Hook Type Definitions
 * Path: types/hooks/eventCoordinator.types.ts
 *
 * Types for useEventCoordinator hook - coordinates pointer events
 * across all canvas interaction layers.
 */

import type { Point } from '../core/geometry.types';

// ===========================================
// Hook Options
// ===========================================

/** Options for useEventCoordinator hook */
export interface UseEventCoordinatorOptions {
  canvasRef?: { current: HTMLCanvasElement | null };
  isColorPickerOpen: boolean;
  showObjectColorPicker?: boolean;
  isAlignmentMode?: boolean;
  /** Picture frame mode: suppress all tool actions; every pointer-down pans instead. */
  interactionLocked?: boolean;
}

// ===========================================
// Synthetic Event Type
// ===========================================

/** Synthetic event for delayed touch handling */
export interface SyntheticPointerEvent {
  type: string;
  clientX: number;
  clientY: number;
  button: number;
  preventDefault: () => void;
  stopPropagation: () => void;
  target: EventTarget | null;
}

// ===========================================
// Pan Start Position
// ===========================================

/** Position for click vs drag detection */
export interface PanStartPosition {
  x: number;
  y: number;
}

// ===========================================
// Area Select Pending
// ===========================================

/** Pending area select start for click detection */
export interface AreaSelectPending {
  clientX: number;
  clientY: number;
  syntheticEvent: SyntheticPointerEvent;
}

// ===========================================
// Base Handler Types
// ===========================================

// Handler members use METHOD syntax on purpose: their parameters are checked
// bivariantly, so a layer may declare the narrower event it actually
// receives (PointerEvent, MouseEvent | TouchEvent) while the coordinator
// passes the raw canvas event or a SyntheticPointerEvent. Unknown keys and
// unrelated signatures are still rejected at registration. `this: void`
// marks them safe to destructure (they are plain closures).

/**
 * Pointer handler set for the polyline/brush layers the coordinator forwards
 * raw events to (wall, outline, region, tile placement, terrain brush,
 * shape overlay, fog). Each phase is called only for the tool that owns it.
 */
export interface PointerPhaseHandlers {
  handlePointerDown?(this: void, e: Event | SyntheticPointerEvent): void;
  handlePointerMove?(this: void, e: Event): void;
  handlePointerUp?(this: void, e: Event): void;
}

// ===========================================
// Handler Collections
// ===========================================

/** Drawing layer handlers (registered with event coordinator) */
export interface RegisteredDrawingHandlers {
  handleDrawingPointerDown?(this: void, e: Event | SyntheticPointerEvent, gridX: number, gridY: number, isTouchEvent: boolean): boolean;
  handleDrawingPointerMove?(this: void, e: Event): boolean;
  stopDrawing?(this: void, e?: Event): void;
  cancelDrawing?(this: void): void;
  isDrawing?: boolean;
  previewEnabled?: boolean;
  updateShapeHover?(this: void, gridX: number, gridY: number): void;
  updateEdgeLineHover?(this: void, intX: number, intY: number): void;
  updateSegmentHover?(this: void, cellX: number, cellY: number, localX: number, localY: number): void;
  /** Called on pointer leave so the segment highlight does not stick at the edge. */
  clearSegmentHover?(this: void): void;
  circleStart?: Point | null;
  rectangleStart?: Point | null;
  edgeLineStart?: Point | null;
  cancelShapePreview?(this: void): void;
}

/** Object layer handlers */
export interface ObjectHandlers {
  handleObjectSelection?(this: void, clientX: number, clientY: number, gridX: number, gridY: number, isTouchActive?: boolean): boolean;
  handleObjectPlacement?(this: void, gridX: number, gridY: number, clientX: number, clientY: number): void;
  handleObjectDragging?(this: void, e: Event): void;
  stopObjectDragging?(this: void): void;
  handleObjectResizing?(this: void, e: Event): void;
  stopObjectResizing?(this: void): void;
  handleHoverUpdate?(this: void, e: Event): void;
  handleObjectWheel?(this: void, e: WheelEvent): boolean;
  handleObjectKeyDown?(this: void, e: KeyboardEvent): boolean;
  isResizing?: boolean;
  edgeSnapMode?: boolean;
  setEdgeSnapMode?(this: void, value: boolean): void;
}

/** Text layer handlers */
export interface TextHandlers {
  handleTextSelection?(this: void, clientX: number, clientY: number): boolean;
  handleTextPlacement?(this: void, clientX: number, clientY: number): void;
  handleTextDragging?(this: void, e: Event): void;
  stopTextDragging?(this: void): void;
  handleCanvasDoubleClick?(this: void, e: MouseEvent): void;
  handleTextKeyDown?(this: void, e: KeyboardEvent): boolean;
}

/** Note pin handlers */
export interface NotePinHandlers {
  handleNotePinPlacement?(this: void, gridX: number, gridY: number): boolean;
}

/** Party pin handlers */
export interface PartyPinHandlers {
  handlePartyPinPointerDown?(this: void, gridX: number, gridY: number, clientX?: number, clientY?: number): void;
  /** Select-tool grab: true when the press hit the pin's cell (handled) */
  handlePartyPinSelectPointerDown?(this: void, gridX: number, gridY: number, clientX?: number, clientY?: number): boolean;
  handlePartyPinMove?(this: void, gridX: number, gridY: number): void;
  stopPartyPinDrag?(this: void): void;
  isPartyPinDragging?(this: void): boolean;
}

/** Pan/zoom handlers */
export interface PanZoomHandlers {
  getClientCoords(this: void, e: Event): { clientX: number; clientY: number };
  screenToGrid(this: void, clientX: number, clientY: number): Point | null;
  lastTouchTimeRef: { current: number };
  getTouchCenter(this: void, touches: TouchList): { x: number; y: number } | null;
  getTouchDistance(this: void, touches: TouchList): number | null;
  startPan(this: void, clientX: number, clientY: number): void;
  updatePan(this: void, clientX: number, clientY: number): void;
  stopPan(this: void): void;
  /** Ref-only: a multi-touch was seen while a single-pointer pan may be armed. */
  markPanAnchorStale(this: void): void;
  startTouchPan(this: void, center: { x: number; y: number }): void;
  updateTouchPan(this: void, touches: TouchList): void;
  stopTouchPan(this: void): void;
  setInitialPinchDistance(this: void, distance: number): void;
  spaceKeyPressed: boolean;
  isPanning: boolean;
  isTouchPanningRef: { current: boolean };
  panStart: PanStartPosition | null;
  handleWheel(this: void, e: WheelEvent): void;
  /** WebKit-proprietary trackpad pinch (iPadOS / macOS Safari GestureEvents). */
  handleGestureStart(this: void, e: Event): void;
  handleGestureChange(this: void, e: Event): void;
  handleGestureEnd(this: void, e: Event): void;
}

/** Measure tool handlers */
export interface MeasureHandlers {
  handleMeasureClick?(this: void, gridX: number, gridY: number, isTouch: boolean): void;
  handleMeasureMove?(this: void, gridX: number, gridY: number): void;
}

/** Fog of war handlers (registered only while a fog tool is active; fog runs before every tool) */
export interface FogHandlers extends PointerPhaseHandlers {
  /** Escape cancels an in-progress fog rectangle. */
  handleKeyDown?(this: void, e: KeyboardEvent): void;
  rectangleStart?: { col: number; row: number } | null;
}

/** Area select handlers */
export interface AreaSelectHandlers {
  areaSelectStart?: Point | null;
  handleAreaSelectClick?(this: void, e: Event | SyntheticPointerEvent): void;
  updateAreaSelectHover?(this: void, gridX: number, gridY: number): void;
}

/** Diagonal fill handlers */
export interface DiagonalFillHandlers {
  handleDiagonalFillClick?(this: void, e: PointerEvent | MouseEvent | TouchEvent, isTouch?: boolean): boolean;
  handleDiagonalFillMove?(this: void, e: PointerEvent | MouseEvent): void;
  cancelFill?(this: void): void;
}

/** Shape overlay handlers (pointer-up of a shape drag goes through isDraggingSelection) */
export interface ShapeOverlayHandlers {
  handleShapeSelection?(this: void, clientX: number, clientY: number): boolean;
  handleShapeDragging?(this: void, e: MouseEvent | TouchEvent): void;
  stopShapeDragging?(this: void): void;
  handlePointerDown?(this: void, e: Event | SyntheticPointerEvent): void;
  handlePointerMove?(this: void, e: Event): void;
}

/** Freehand drawing handlers */
export interface FreehandHandlers {
  handlePointerDown?(this: void, e: Event | SyntheticPointerEvent, gridX?: number, gridY?: number, isTouch?: boolean): void;
  handlePointerMove?(this: void, e: Event): void;
  stopDrawing?(this: void): void;
}

/**
 * Region tool handlers. No pointer-up: a region label drag ends through
 * useRegionTools' own document pointerup listener.
 */
export interface RegionHandlers {
  handlePointerDown?(this: void, e: Event | SyntheticPointerEvent): void;
  handlePointerMove?(this: void, e: Event): void;
  handleDoubleClick?(this: void, e: MouseEvent): void;
  handleContextMenu?(this: void, e: MouseEvent): void;
}

/** Outline tool handlers (double-click closes the polygon) */
export interface OutlineHandlers extends PointerPhaseHandlers {
  handleDoubleClick?(this: void, e: MouseEvent): void;
}

/** Wall/path tool handlers (double-click finishes the wall) */
export interface WallHandlers extends PointerPhaseHandlers {
  handleDoubleClick?(this: void, e: MouseEvent): void;
}

/** Tile placement and terrain brush handlers (both listen on tilePaint and self-gate on the subtool) */
export type TileToolHandlers = PointerPhaseHandlers;

// ===========================================
// Handler Registry
// ===========================================

/** Handler type mapping for each layer */
export interface HandlerTypeMap {
  drawing: RegisteredDrawingHandlers;
  object: ObjectHandlers;
  text: TextHandlers;
  notePin: NotePinHandlers;
  partyPin: PartyPinHandlers;
  panZoom: PanZoomHandlers;
  measure: MeasureHandlers;
  fogOfWar: FogHandlers;
  areaSelect: AreaSelectHandlers;
  diagonalFill: DiagonalFillHandlers;
  freehand: FreehandHandlers;
  tilePlacement: TileToolHandlers;
  terrainBrush: TileToolHandlers;
  outline: OutlineHandlers;
  region: RegionHandlers;
  shapeOverlay: ShapeOverlayHandlers;
  wall: WallHandlers;
}

/** All registered layer names (derived from HandlerTypeMap) */
export type HandlerLayerName = keyof HandlerTypeMap;

/** Every layer's handler set, by name (absent = not registered) */
export type HandlersRegistry = { [K in HandlerLayerName]?: HandlerTypeMap[K] };

/** Type-safe handler getter function */
export type GetHandlers = <T extends HandlerLayerName>(layer: T) => HandlerTypeMap[T] | null;
