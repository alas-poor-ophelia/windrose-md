/**
 * useEventCoordinator.ts
 *
 * Coordinator hook that manages pointer event coordination across all interaction layers.
 * Attaches event listeners to canvas and routes events to registered handlers
 * based on current tool, modifier keys, touch state, and selection state.
 *
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { ToolId } from '#types/tools/tool.types';
import type {
  UseEventCoordinatorOptions,
  SyntheticPointerEvent,
  PendingToolAction,
  PanStartPosition,
  AreaSelectPending,
  DrawingHandlers,
  ObjectHandlers,
  TextHandlers,
  NotePinHandlers,
  PanZoomHandlers,
  MeasureHandlers,
  AlignmentHandlers,
  FogHandlers,
  AreaSelectHandlers,
  DiagonalFillHandlers,
  HandlerLayerName,
} from '#types/hooks/eventCoordinator.types';
import type { SelectedItem } from '#types/hooks/groupDrag.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types
interface LayerVisibility {
  objects: boolean;
  textLabels: boolean;
  [key: string]: boolean;
}

interface DragStart {
  x: number;
  y: number;
  gridX: number;
  gridY: number;
  worldX: number;
  worldY: number;
  isGroupDrag?: boolean;
}

interface MapStateValue {
  canvasRef: { current: HTMLCanvasElement | null };
  currentTool: ToolId;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
  geometry: (IGeometry & { cellSize: number }) | null;
}

interface MapSelectionValue {
  selectedItem: SelectedItem | null;
  setSelectedItem: (item: SelectedItem | null) => void;
  isDraggingSelection: boolean;
  setIsDraggingSelection: (value: boolean) => void;
  dragStart: DragStart | null;
  setDragStart: (value: DragStart | null) => void;
  layerVisibility: LayerVisibility;
  hasMultiSelection: boolean;
  isSelected: (type: string, id: string) => boolean;
  isGroupDragging: boolean;
  clearSelection: () => void;
}

interface RegisteredHandlersValue {
  getHandlers: (layer: HandlerLayerName) => unknown;
}

interface UseGroupDragResult {
  getClickedSelectedItem: (gridX: number, gridY: number, worldX: number, worldY: number) => SelectedItem | null;
  startGroupDrag: (clientX: number, clientY: number, gridX: number, gridY: number) => boolean;
  handleGroupDrag: (e: PointerEvent | MouseEvent | TouchEvent) => boolean;
  stopGroupDrag: () => boolean;
}

const { useMapState } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
};

const { useMapSelection } = await requireModuleByName("MapSelectionContext.tsx") as {
  useMapSelection: () => MapSelectionValue;
};

const { useRegisteredHandlers } = await requireModuleByName("EventHandlerContext.tsx") as {
  useRegisteredHandlers: () => RegisteredHandlersValue;
};

const { useGroupDrag } = await requireModuleByName("useGroupDrag.ts") as {
  useGroupDrag: () => UseGroupDragResult;
};

const useEventCoordinator = ({
  isColorPickerOpen,
  showObjectColorPicker = false,
  isAlignmentMode = false
}: UseEventCoordinatorOptions): void => {
  const { canvasRef, currentTool, screenToGrid, screenToWorld, getClientCoords, geometry } = useMapState();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, layerVisibility, hasMultiSelection, isSelected, isGroupDragging, clearSelection } = useMapSelection();
  const { getHandlers } = useRegisteredHandlers();

  const { getClickedSelectedItem, startGroupDrag, handleGroupDrag, stopGroupDrag } = useGroupDrag();

  const [recentMultiTouch, setRecentMultiTouch] = dc.useState<boolean>(false);
  const [pendingToolAction, setPendingToolAction] = dc.useState<PendingToolAction | null>(null);
  const pendingToolTimeoutRef = dc.useRef<ReturnType<typeof setTimeout> | null>(null);

  const panStartPositionRef = dc.useRef<PanStartPosition | null>(null);
  const panMoveThreshold = 5;

  const areaSelectPendingRef = dc.useRef<AreaSelectPending | null>(null);

  const handlePointerDown = dc.useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
    const objectHandlers = getHandlers('object') as ObjectHandlers | null;
    const textHandlers = getHandlers('text') as TextHandlers | null;
    const notePinHandlers = getHandlers('notePin') as NotePinHandlers | null;
    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    const measureHandlers = getHandlers('measure') as MeasureHandlers | null;
    const alignmentHandlers = getHandlers('imageAlignment') as AlignmentHandlers | null;
    const fogHandlers = getHandlers('fogOfWar') as FogHandlers | null;
    const diagonalFillHandlers = getHandlers('diagonalFill') as DiagonalFillHandlers | null;

    if (!panZoomHandlers) return;

    const touchEvent = e as TouchEvent;
    if (isAlignmentMode && (!touchEvent.touches || touchEvent.touches.length === 1)) {
      return;
    }

    const {
      getClientCoords: getCoords,
      screenToGrid: toGrid,
      lastTouchTimeRef,
      getTouchCenter,
      getTouchDistance,
      startPan,
      startTouchPan,
      setInitialPinchDistance,
      spaceKeyPressed
    } = panZoomHandlers;

    if (e.type === 'mousedown') {
      const timeSinceTouch = Date.now() - lastTouchTimeRef.current;
      if (timeSinceTouch < 500) {
        return;
      }
    }

    if (e.type === 'touchstart') {
      lastTouchTimeRef.current = Date.now();
    }

    if (isColorPickerOpen || showObjectColorPicker) {
      const target = e.target as HTMLElement;
      const pickerElement = target.closest('.dmt-color-picker');
      const toolBtnElement = target.closest('.dmt-color-tool-btn');
      const objectBtnElement = target.closest('.dmt-object-color-button');

      if (!pickerElement && !toolBtnElement && !objectBtnElement) {
        return;
      }
    }

    if (touchEvent.touches && touchEvent.touches.length === 2) {
      if (isColorPickerOpen || showObjectColorPicker) {
        const touch1Target = document.elementFromPoint(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
        const touch2Target = document.elementFromPoint(touchEvent.touches[1].clientX, touchEvent.touches[1].clientY);

        const pickerOrButton1 = touch1Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');
        const pickerOrButton2 = touch2Target?.closest('.dmt-color-picker, .dmt-color-tool-btn, .dmt-object-color-button');

        if (pickerOrButton1 || pickerOrButton2) {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }

      setRecentMultiTouch(true);
      const center = getTouchCenter(touchEvent.touches);
      const distance = getTouchDistance(touchEvent.touches);
      if (center && distance) {
        startTouchPan(center);
        setInitialPinchDistance(distance);
      }
      return;
    }

    if (recentMultiTouch || panZoomHandlers.isTouchPanning) {
      return;
    }

    // Only left-click (button 0) triggers tool actions; right-click is handled by contextmenu
    if (e.type === 'mousedown' && (e as MouseEvent).button !== 0) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const { clientX, clientY } = getCoords(e);
    const coords = toGrid(clientX, clientY);
    if (!coords) return;

    const gridX = coords.x;
    const gridY = coords.y;

    const eventType = e.type;
    const isTouchEvent = !!touchEvent.touches;
    const targetElement = e.target;

    const syntheticEvent: SyntheticPointerEvent = {
      type: eventType,
      clientX: clientX,
      clientY: clientY,
      button: (e as MouseEvent).button ?? 0,
      preventDefault: () => {},
      stopPropagation: () => {},
      target: targetElement
    };

    const executeToolAction = (): void => {
      if (spaceKeyPressed && !isTouchEvent) {
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        return;
      }

      if (fogHandlers?.handlePointerDown) {
        fogHandlers.handlePointerDown(syntheticEvent);
        return;
      }

      if (currentTool === 'select') {
        if (hasMultiSelection) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY);
            if (clickedItem) {
              startGroupDrag(clientX, clientY, gridX, gridY);
              return;
            }
          }
        }

        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY);
          if (objectHandled) return;
        }

        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }

        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);

      } else if (currentTool === 'areaSelect') {
        if (hasMultiSelection) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY);
            if (clickedItem) {
              startGroupDrag(clientX, clientY, gridX, gridY);
              return;
            }
          }
          clearSelection();
          return;
        }

        const areaSelectHandlers = getHandlers('areaSelect') as AreaSelectHandlers | null;
        if (areaSelectHandlers?.areaSelectStart) {
          if (areaSelectHandlers.handleAreaSelectClick) {
            areaSelectHandlers.handleAreaSelectClick(syntheticEvent);
          }
          return;
        }

        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY);
          if (objectHandled) return;
        }

        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }

        panStartPositionRef.current = { x: clientX, y: clientY };
        areaSelectPendingRef.current = { clientX, clientY, syntheticEvent };
        startPan(clientX, clientY);

      } else if (currentTool === 'draw' || currentTool === 'erase' ||
                 currentTool === 'rectangle' || currentTool === 'circle' ||
                 currentTool === 'clearArea' ||
                 currentTool === 'edgeDraw' || currentTool === 'edgeErase' ||
                 currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
        if (hasMultiSelection) clearSelection();

        if (drawingHandlers?.handleDrawingPointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          drawingHandlers.handleDrawingPointerDown(eventToUse, gridX, gridY, isTouchEvent);
        }

      } else if (currentTool === 'addObject') {
        if (hasMultiSelection) clearSelection();

        if (!layerVisibility.objects) return;

        if (notePinHandlers?.handleNotePinPlacement) {
          const notePinHandled = notePinHandlers.handleNotePinPlacement(gridX, gridY);
          if (notePinHandled) return;
        }

        if (objectHandlers?.handleObjectPlacement) {
          objectHandlers.handleObjectPlacement(gridX, gridY, clientX, clientY);
        }

      } else if (currentTool === 'addText') {
        if (hasMultiSelection) clearSelection();

        if (!layerVisibility.textLabels) return;

        if (textHandlers?.handleTextPlacement) {
          textHandlers.handleTextPlacement(clientX, clientY);
        }

      } else if (currentTool === 'measure') {
        if (hasMultiSelection) clearSelection();

        if (measureHandlers?.handleMeasureClick) {
          measureHandlers.handleMeasureClick(gridX, gridY, isTouchEvent);
        }

      } else if (currentTool === 'diagonalFill') {
        if (hasMultiSelection) clearSelection();

        if (diagonalFillHandlers?.handleDiagonalFillClick) {
          diagonalFillHandlers.handleDiagonalFillClick(e, isTouchEvent);
        }
      }
    };

    if (isTouchEvent) {
      setPendingToolAction({ execute: executeToolAction });
      pendingToolTimeoutRef.current = setTimeout(() => {
        executeToolAction();
        setPendingToolAction(null);
        pendingToolTimeoutRef.current = null;
      }, 50);
    } else {
      executeToolAction();
    }
  }, [currentTool, isColorPickerOpen, showObjectColorPicker, recentMultiTouch, selectedItem, hasMultiSelection, clearSelection, screenToWorld, getClickedSelectedItem, startGroupDrag, getHandlers, layerVisibility, isAlignmentMode]);

  const handlePointerMove = dc.useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
    const objectHandlers = getHandlers('object') as ObjectHandlers | null;
    const textHandlers = getHandlers('text') as TextHandlers | null;
    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    const measureHandlers = getHandlers('measure') as MeasureHandlers | null;
    const alignmentHandlers = getHandlers('imageAlignment') as AlignmentHandlers | null;
    const fogHandlers = getHandlers('fogOfWar') as FogHandlers | null;
    const diagonalFillHandlers = getHandlers('diagonalFill') as DiagonalFillHandlers | null;

    if (!panZoomHandlers) return;

    const touchEvent = e as TouchEvent;
    if (isAlignmentMode && (!touchEvent.touches || touchEvent.touches.length !== 2)) {
      return;
    }

    const {
      getClientCoords: getCoords,
      isTouchPanning,
      updateTouchPan,
      isPanning,
      updatePan,
      panStart,
      touchPanStart,
      screenToGrid: toGrid
    } = panZoomHandlers;

    const { clientX, clientY } = getCoords(e);

    if (touchEvent.touches && touchEvent.touches.length === 2 && isTouchPanning && touchPanStart) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
      e.preventDefault();
      e.stopPropagation();
      updateTouchPan(touchEvent.touches);
      return;
    }

    if (isPanning && panStart) {
      e.preventDefault();
      updatePan(clientX, clientY);
      return;
    }

    if (touchEvent.touches && touchEvent.touches.length > 1) {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
    }

    if (layerVisibility.objects && objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.handleObjectResizing) {
        objectHandlers.handleObjectResizing(e);
      }
      return;
    }

    if (isDraggingSelection && dragStart?.isGroupDrag) {
      handleGroupDrag(e as PointerEvent);
      return;
    }

    if (isDraggingSelection && selectedItem) {
      if (selectedItem.type === 'object' && layerVisibility.objects && objectHandlers?.handleObjectDragging) {
        objectHandlers.handleObjectDragging(e);
      } else if (selectedItem.type === 'text' && layerVisibility.textLabels && textHandlers?.handleTextDragging) {
        textHandlers.handleTextDragging(e);
      }
      return;
    }

    if (fogHandlers?.handlePointerMove) {
      fogHandlers.handlePointerMove(e);
    }

    if (currentTool === 'draw' || currentTool === 'erase' ||
        currentTool === 'rectangle' || currentTool === 'circle' ||
        currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' ||
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {

      if (drawingHandlers?.handleDrawingPointerMove) {
        drawingHandlers.handleDrawingPointerMove(e);
      }

      const isTouch = touchEvent.touches !== undefined || (e as PointerEvent).pointerType === 'touch';
      if (!isTouch && drawingHandlers?.previewEnabled && drawingHandlers?.updateShapeHover) {

        if (currentTool === 'edgeLine' && drawingHandlers.edgeLineStart && panZoomHandlers.screenToWorld) {
          const worldCoords = panZoomHandlers.screenToWorld(clientX, clientY);
          if (worldCoords && geometry) {
            const cellSize = geometry.cellSize;
            const nearestX = Math.round(worldCoords.worldX / cellSize);
            const nearestY = Math.round(worldCoords.worldY / cellSize);
            if (drawingHandlers.updateEdgeLineHover) {
              drawingHandlers.updateEdgeLineHover(nearestX, nearestY);
            }
          }
        }
        else if ((currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') && toGrid) {
          const hasStart = (currentTool === 'circle' && drawingHandlers.circleStart) ||
                           ((currentTool === 'rectangle' || currentTool === 'clearArea') && drawingHandlers.rectangleStart);
          if (hasStart) {
            const coords = toGrid(clientX, clientY);
            if (coords) {
              const gridX = coords.x;
              const gridY = coords.y;
              drawingHandlers.updateShapeHover(gridX, gridY);
            }
          }
        }
      }

      if (!isTouch && currentTool === 'segmentDraw' && drawingHandlers?.updateSegmentHover) {
        if (screenToWorld && geometry) {
          const worldCoords = screenToWorld(clientX, clientY);
          if (worldCoords) {
            const cellSize = geometry.cellSize;
            const cellX = Math.floor(worldCoords.worldX / cellSize);
            const cellY = Math.floor(worldCoords.worldY / cellSize);
            const localX = (worldCoords.worldX / cellSize) - cellX;
            const localY = (worldCoords.worldY / cellSize) - cellY;
            drawingHandlers.updateSegmentHover(cellX, cellY, localX, localY);
          }
        }
      }

      if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
        objectHandlers.handleHoverUpdate(e);
      }
      return;
    }

    if (currentTool === 'measure' && measureHandlers?.handleMeasureMove) {
      if (toGrid) {
        const coords = toGrid(clientX, clientY);
        if (coords) {
          const gridX = coords.x;
          const gridY = coords.y;
          measureHandlers.handleMeasureMove(gridX, gridY);
        }
      }
      return;
    }

    if (currentTool === 'diagonalFill' && diagonalFillHandlers?.handleDiagonalFillMove) {
      diagonalFillHandlers.handleDiagonalFillMove(e as MouseEvent);
      return;
    }

    if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
      objectHandlers.handleHoverUpdate(e);
    }
  }, [currentTool, isDraggingSelection, dragStart, selectedItem, isGroupDragging, handleGroupDrag, getHandlers, layerVisibility, isAlignmentMode, geometry, screenToWorld]);

  const handlePointerUp = dc.useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
    const objectHandlers = getHandlers('object') as ObjectHandlers | null;
    const textHandlers = getHandlers('text') as TextHandlers | null;
    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    const alignmentHandlers = getHandlers('imageAlignment') as AlignmentHandlers | null;
    const fogHandlers = getHandlers('fogOfWar') as FogHandlers | null;

    if (!panZoomHandlers) return;

    if (isAlignmentMode) {
      return;
    }

    const {
      getClientCoords: getCoords,
      stopPan,
      isPanning
    } = panZoomHandlers;

    if (recentMultiTouch) {
      setTimeout(() => setRecentMultiTouch(false), 300);
    }

    if (isPanning) {
      stopPan();

      if (currentTool === 'select' && panStartPositionRef.current) {
        const { clientX, clientY } = getCoords(e);
        const deltaX = Math.abs(clientX - panStartPositionRef.current.x);
        const deltaY = Math.abs(clientY - panStartPositionRef.current.y);

        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold && selectedItem) {
          if (selectedItem.type === 'object' && objectHandlers?.edgeSnapMode) {
            objectHandlers.setEdgeSnapMode?.(false);
          } else {
            setSelectedItem(null);
          }
        }

        panStartPositionRef.current = null;
      }

      if (currentTool === 'areaSelect' && areaSelectPendingRef.current) {
        const { clientX, clientY } = getCoords(e);
        const deltaX = Math.abs(clientX - areaSelectPendingRef.current.clientX);
        const deltaY = Math.abs(clientY - areaSelectPendingRef.current.clientY);

        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold) {
          const areaSelectHandlers = getHandlers('areaSelect') as AreaSelectHandlers | null;
          if (areaSelectHandlers?.handleAreaSelectClick) {
            areaSelectHandlers.handleAreaSelectClick(areaSelectPendingRef.current.syntheticEvent);
          }
        }

        areaSelectPendingRef.current = null;
        panStartPositionRef.current = null;
      }

      return;
    }

    if (objectHandlers?.isResizing && selectedItem?.type === 'object') {
      if (objectHandlers.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      return;
    }

    if (isDraggingSelection && dragStart?.isGroupDrag) {
      stopGroupDrag();
      return;
    }

    if (isDraggingSelection) {
      if (selectedItem?.type === 'object' && objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      } else if (selectedItem?.type === 'text' && textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }
      return;
    }

    if (currentTool === 'draw' || currentTool === 'erase' ||
        currentTool === 'rectangle' || currentTool === 'circle' ||
        currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' ||
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
      if (drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing(e);
      }
    }

    if (fogHandlers?.handlePointerUp) {
      fogHandlers.handlePointerUp(e);
    }
  }, [currentTool, recentMultiTouch, isDraggingSelection, dragStart, selectedItem, setSelectedItem, isGroupDragging, stopGroupDrag, getHandlers, isAlignmentMode]);

  const handlePointerLeave = dc.useCallback((e: MouseEvent): void => {
    const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
    const diagonalFillHandlers = getHandlers('diagonalFill') as DiagonalFillHandlers | null;

    if (pendingToolTimeoutRef.current) {
      clearTimeout(pendingToolTimeoutRef.current);
      pendingToolTimeoutRef.current = null;
      setPendingToolAction(null);
    }

    if (currentTool === 'draw' || currentTool === 'erase' ||
        currentTool === 'rectangle' || currentTool === 'circle' ||
        currentTool === 'clearArea' ||
        currentTool === 'edgeDraw' || currentTool === 'edgeErase' ||
        currentTool === 'edgeLine' || currentTool === 'segmentDraw') {
      if (drawingHandlers?.cancelDrawing) {
        drawingHandlers.cancelDrawing();
      }
    }

    if (currentTool === 'diagonalFill' && diagonalFillHandlers?.cancelFill) {
      diagonalFillHandlers.cancelFill();
    }
  }, [currentTool, getHandlers]);

  const handlePanStart = dc.useCallback((e: MouseEvent): void => {
    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    if (!panZoomHandlers) return;

    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      panZoomHandlers.startPan(e.clientX, e.clientY);
    }
  }, [getHandlers]);

  const handlePanEnd = dc.useCallback((e: MouseEvent): void => {
    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    if (!panZoomHandlers) return;

    if (panZoomHandlers.isPanning && (e.button === 1 || e.button === 2)) {
      e.preventDefault();
      panZoomHandlers.stopPan();
    }
  }, [getHandlers]);

  const handleWheel = dc.useCallback((e: WheelEvent): void => {
    const objectHandlers = getHandlers('object') as ObjectHandlers | null;
    if (objectHandlers?.handleObjectWheel) {
      const handled = objectHandlers.handleObjectWheel(e);
      if (handled) return;
    }

    const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
    if (!panZoomHandlers?.handleWheel) return;

    if (panZoomHandlers.isPanning) {
      return;
    }

    panZoomHandlers.handleWheel(e);
  }, [getHandlers]);

  const handleCanvasDoubleClick = dc.useCallback((e: MouseEvent): void => {
    const textHandlers = getHandlers('text') as TextHandlers | null;
    if (!textHandlers?.handleCanvasDoubleClick) return;

    textHandlers.handleCanvasDoubleClick(e);
  }, [getHandlers]);

  const handleContextMenu = dc.useCallback((e: MouseEvent): void => {
    e.preventDefault();
    const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
    if (drawingHandlers?.cancelShapePreview) {
      drawingHandlers.cancelShapePreview();
    }
  }, [getHandlers]);

  dc.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button === 1 || e.button === 2) {
        handlePanStart(e);
      } else {
        handlePointerDown(e);
      }
    };

    const handleMouseUp = (e: MouseEvent): void => {
      handlePanEnd(e);
      handlePointerUp(e);
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handlePointerDown as EventListener);
    canvas.addEventListener('mousemove', handlePointerMove as EventListener);
    canvas.addEventListener('touchmove', handlePointerMove as EventListener);
    canvas.addEventListener('touchend', handlePointerUp as EventListener);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handlePointerDown as EventListener);
      canvas.removeEventListener('mousemove', handlePointerMove as EventListener);
      canvas.removeEventListener('touchmove', handlePointerMove as EventListener);
      canvas.removeEventListener('touchend', handlePointerUp as EventListener);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('dblclick', handleCanvasDoubleClick);
      canvas.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [
    canvasRef,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handlePointerLeave,
    handlePanStart,
    handlePanEnd,
    handleWheel,
    handleCanvasDoubleClick,
    handleContextMenu
  ]);

  dc.useEffect(() => {
    const handleGlobalPointerUp = (e: MouseEvent | TouchEvent): void => {
      const drawingHandlers = getHandlers('drawing') as DrawingHandlers | null;
      const objectHandlers = getHandlers('object') as ObjectHandlers | null;
      const textHandlers = getHandlers('text') as TextHandlers | null;
      const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;

      if (drawingHandlers?.isDrawing && drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing();
      }

      if (panZoomHandlers?.isPanning && (e as MouseEvent).button === 1) {
        panZoomHandlers.stopPan();
      }

      if (panZoomHandlers?.isTouchPanning) {
        panZoomHandlers.stopTouchPan();
        setTimeout(() => setRecentMultiTouch(false), 100);
      }

      if (objectHandlers?.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }

      if (isDraggingSelection && dragStart?.isGroupDrag) {
        stopGroupDrag();
      }

      if (objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      }

      if (textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      }

      if (isDraggingSelection) {
        setIsDraggingSelection(false);
        setDragStart(null);
      }
    };

    const handleGlobalMouseMove = (e: MouseEvent): void => {
      const panZoomHandlers = getHandlers('panZoom') as PanZoomHandlers | null;
      if (panZoomHandlers?.isPanning && panZoomHandlers?.updatePan) {
        panZoomHandlers.updatePan(e.clientX, e.clientY);
      }
    };

    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp as EventListener);
    window.addEventListener('mousemove', handleGlobalMouseMove);

    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp as EventListener);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
    };
  }, [isDraggingSelection, dragStart, setIsDraggingSelection, setDragStart, isGroupDragging, stopGroupDrag, getHandlers]);

  dc.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const objectHandlers = getHandlers('object') as ObjectHandlers | null;
      const textHandlers = getHandlers('text') as TextHandlers | null;

      if (objectHandlers?.handleObjectKeyDown) {
        const handled = objectHandlers.handleObjectKeyDown(e);
        if (handled) return;
      }

      if (textHandlers?.handleTextKeyDown) {
        const handled = textHandlers.handleTextKeyDown(e);
        if (handled) return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [getHandlers]);

  dc.useEffect(() => {
    return () => {
      if (pendingToolTimeoutRef.current) {
        clearTimeout(pendingToolTimeoutRef.current);
      }
    };
  }, []);
};

return { useEventCoordinator };
