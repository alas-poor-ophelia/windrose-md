/**
 * useEventCoordinator.ts
 *
 * Coordinator hook that manages pointer event coordination across all interaction layers.
 * Attaches event listeners to canvas and routes events to registered handlers
 * based on current tool, modifier keys, touch state, and selection state.
 *
 * This is a coordinator hook, not a visual layer - it manages behavior without rendering.
 */

import type {
  UseEventCoordinatorOptions,
  SyntheticPointerEvent,
  PendingToolAction,
  PanStartPosition,
  AreaSelectPending,
} from '#types/hooks/eventCoordinator.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useRegisteredHandlers } from '../../context/EventHandlerContext';
import { useGroupDrag } from '../objects/useGroupDrag';

const DRAWING_TOOL_SET: Set<string> = new Set([
  'draw', 'erase', 'rectangle', 'circle', 'clearArea',
  'edgeDraw', 'edgeErase', 'edgeLine', 'segmentDraw'
]);











const useEventCoordinator = ({
  isColorPickerOpen,
  showObjectColorPicker = false,
  isAlignmentMode = false
}: UseEventCoordinatorOptions): void => {
  const { canvasRef, currentTool, screenToGrid, screenToWorld, geometry } = useMapState();
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, layerVisibility, hasMultiSelection, isGroupDragging, clearSelection } = useMapSelection();
  const { getHandlers } = useRegisteredHandlers();

  const { getClickedSelectedItem, startGroupDrag, handleGroupDrag, stopGroupDrag } = useGroupDrag();

  const [recentMultiTouch, setRecentMultiTouch] = useState<boolean>(false);
  const [, setPendingToolAction] = useState<PendingToolAction | null>(null);
  const pendingToolTimeoutRef = useRef<number | null>(null);
  const touchActiveRef = useRef(false);

  const panStartPositionRef = useRef<PanStartPosition | null>(null);
  const panMoveThreshold = 5;

  const areaSelectPendingRef = useRef<AreaSelectPending | null>(null);

  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const notePinHandlers = getHandlers('notePin');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    const fogHandlers = getHandlers('fogOfWar');
    const diagonalFillHandlers = getHandlers('diagonalFill');

    if (!panZoomHandlers) return;

    const touchEvent = e as TouchEvent;
    if (isAlignmentMode && (touchEvent.touches == null || touchEvent.touches.length === 1)) {
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
      const pickerElement = target.closest('.windrose-color-picker');
      const toolBtnElement = target.closest('.windrose-color-tool-btn');
      const objectBtnElement = target.closest('.windrose-object-color-button');

      if (!pickerElement && !toolBtnElement && !objectBtnElement) {
        return;
      }
    }

    if (touchEvent.touches != null && touchEvent.touches.length === 2) {
      if (isColorPickerOpen || showObjectColorPicker) {
        const touch1Target = activeDocument.elementFromPoint(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
        const touch2Target = activeDocument.elementFromPoint(touchEvent.touches[1].clientX, touchEvent.touches[1].clientY);

        const pickerOrButton1 = touch1Target?.closest('.windrose-color-picker, .windrose-color-tool-btn, .windrose-object-color-button');
        const pickerOrButton2 = touch2Target?.closest('.windrose-color-picker, .windrose-color-tool-btn, .windrose-object-color-button');

        if (pickerOrButton1 || pickerOrButton2) {
          return;
        }
      }

      e.preventDefault();
      e.stopPropagation();

      if (pendingToolTimeoutRef.current != null) {
        window.clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }

      setRecentMultiTouch(true);
      const center = getTouchCenter(touchEvent.touches);
      const distance = getTouchDistance(touchEvent.touches);
      if (center != null && distance != null) {
        startTouchPan(center);
        setInitialPinchDistance(distance);
      }
      return;
    }

    if (recentMultiTouch || panZoomHandlers.isTouchPanningRef?.current === true) {
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
    const isTouchEvent = touchEvent.touches != null;
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

        const touchEnded = isTouchEvent && !touchActiveRef.current;

        if (layerVisibility.objects && objectHandlers?.handleObjectSelection) {
          const objectHandled = objectHandlers.handleObjectSelection(clientX, clientY, gridX, gridY, touchEnded ? false : undefined);
          if (objectHandled) return;
        }

        if (layerVisibility.textLabels && textHandlers?.handleTextSelection) {
          const textHandled = textHandlers.handleTextSelection(clientX, clientY);
          if (textHandled) return;
        }

        const shapeHandlers = getHandlers('shapeOverlay');
        if (shapeHandlers?.handleShapeSelection) {
          const shapeHandled = shapeHandlers.handleShapeSelection(clientX, clientY);
          if (shapeHandled) return;
        }

        if (touchEnded && selectedItem) {
          setSelectedItem(null);
          return;
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

        const areaSelectHandlers = getHandlers('areaSelect');
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

      } else if (currentTool != null && DRAWING_TOOL_SET.has(currentTool)) {
        if (hasMultiSelection) clearSelection();

        if (drawingHandlers?.handleDrawingPointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          drawingHandlers.handleDrawingPointerDown(eventToUse, gridX, gridY, isTouchEvent);
        }

      } else if (currentTool === 'addNote') {
        if (hasMultiSelection) clearSelection();
        if (!layerVisibility.objects) return;

        if (notePinHandlers?.handleNotePinPlacement) {
          notePinHandlers.handleNotePinPlacement(gridX, gridY);
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

      } else if (currentTool === 'freehand') {
        if (hasMultiSelection) clearSelection();

        const freehandHandlers = getHandlers('freehand');
        if (freehandHandlers?.handlePointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          freehandHandlers.handlePointerDown(eventToUse, gridX, gridY, isTouchEvent);
        }

      } else if (currentTool === 'regionPaint' || currentTool === 'regionBoundary') {
        if (hasMultiSelection) clearSelection();

        const regionHandlers = getHandlers('region');
        if (regionHandlers?.handlePointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          regionHandlers.handlePointerDown(eventToUse);
        }
      } else if (currentTool === 'outline') {
        if (hasMultiSelection) clearSelection();

        const outlineHandlers = getHandlers('outline');
        if (outlineHandlers?.handlePointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          outlineHandlers.handlePointerDown(eventToUse);
        }
      } else if (currentTool === 'tilePaint') {
        if (hasMultiSelection) clearSelection();

        // Both tile layers listen on tilePaint; they self-gate on the armed
        // subtool (TerrainBrushLayer acts only for 'brush', TilePlacementLayer
        // yields it), so exactly one handles the event.
        const eventToUse = isTouchEvent ? syntheticEvent : e;
        const brushHandlers = getHandlers('terrainBrush');
        if (brushHandlers?.handlePointerDown) {
          brushHandlers.handlePointerDown(eventToUse);
        }
        const tileHandlers = getHandlers('tilePlacement');
        if (tileHandlers?.handlePointerDown) {
          tileHandlers.handlePointerDown(eventToUse);
        }
      } else if (currentTool === 'wall') {
        if (hasMultiSelection) clearSelection();

        const wallHandlers = getHandlers('wall');
        if (wallHandlers?.handlePointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          wallHandlers.handlePointerDown(eventToUse);
        }
      } else if (currentTool === 'shape') {
        if (hasMultiSelection) clearSelection();

        const shapeHandlers = getHandlers('shapeOverlay');
        if (shapeHandlers?.handlePointerDown) {
          const eventToUse = isTouchEvent ? syntheticEvent : e;
          shapeHandlers.handlePointerDown(eventToUse);
        }
      }
    };

    if (isTouchEvent) {
      touchActiveRef.current = true;
      setPendingToolAction({ execute: executeToolAction });
      pendingToolTimeoutRef.current = window.setTimeout(() => {
        executeToolAction();
        setPendingToolAction(null);
        pendingToolTimeoutRef.current = null;
      }, 50);
    } else {
      executeToolAction();
    }
  }, [currentTool, isColorPickerOpen, showObjectColorPicker, recentMultiTouch, selectedItem, hasMultiSelection, clearSelection, screenToWorld, getClickedSelectedItem, startGroupDrag, getHandlers, layerVisibility, isAlignmentMode, setSelectedItem]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const measureHandlers = getHandlers('measure');
    const fogHandlers = getHandlers('fogOfWar');
    const diagonalFillHandlers = getHandlers('diagonalFill');

    if (!panZoomHandlers) return;

    const touchEvent = e as TouchEvent;
    if (isAlignmentMode && (touchEvent.touches == null || touchEvent.touches.length !== 2)) {
      return;
    }

    const {
      getClientCoords: getCoords,
      isTouchPanningRef,
      updateTouchPan,
      isPanning,
      updatePan,
      panStart,
      screenToGrid: toGrid
    } = panZoomHandlers;

    const { clientX, clientY } = getCoords(e);

    if (touchEvent.touches != null && touchEvent.touches.length === 2) {
      e.preventDefault();
      e.stopPropagation();
      if (isTouchPanningRef?.current === true) {
        if (pendingToolTimeoutRef.current != null) {
          window.clearTimeout(pendingToolTimeoutRef.current);
          pendingToolTimeoutRef.current = null;
          setPendingToolAction(null);
        }
        updateTouchPan(touchEvent.touches);
      }
      return;
    }

    if (isPanning && panStart != null) {
      e.preventDefault();
      updatePan(clientX, clientY);
      return;
    }

    if (touchEvent.touches != null && touchEvent.touches.length > 1) {
      if (pendingToolTimeoutRef.current != null) {
        window.clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
        setPendingToolAction(null);
      }
    }

    if (layerVisibility.objects && objectHandlers?.isResizing === true && selectedItem?.type === 'object') {
      if (objectHandlers.handleObjectResizing) {
        objectHandlers.handleObjectResizing(e);
      }
      return;
    }

    if (isDraggingSelection && dragStart?.isGroupDrag === true) {
      handleGroupDrag(e);
      return;
    }

    if (isDraggingSelection && selectedItem) {
      if (selectedItem.type === 'object' && layerVisibility.objects && objectHandlers?.handleObjectDragging) {
        objectHandlers.handleObjectDragging(e);
      } else if (selectedItem.type === 'text' && layerVisibility.textLabels && textHandlers?.handleTextDragging) {
        textHandlers.handleTextDragging(e);
      } else if (selectedItem.type === 'shapeOverlay') {
        const shapeHandlers = getHandlers('shapeOverlay');
        if (shapeHandlers?.handleShapeDragging) {
          shapeHandlers.handleShapeDragging(e);
        }
      }
      return;
    }

    if (fogHandlers?.handlePointerMove) {
      fogHandlers.handlePointerMove(e);
    }

    if (currentTool === 'areaSelect') {
      const isTouch = touchEvent.touches !== undefined || (e as PointerEvent).pointerType === 'touch';
      if (!isTouch) {
        const areaSelectHandlers = getHandlers('areaSelect');
        if (areaSelectHandlers?.areaSelectStart != null && areaSelectHandlers.updateAreaSelectHover != null && toGrid != null) {
          const coords = toGrid(clientX, clientY);
          if (coords) {
            areaSelectHandlers.updateAreaSelectHover(coords.x, coords.y);
          }
        }
      }
      if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
        objectHandlers.handleHoverUpdate(e);
      }
      return;
    }

    if (currentTool != null && DRAWING_TOOL_SET.has(currentTool)) {

      if (drawingHandlers?.handleDrawingPointerMove) {
        drawingHandlers.handleDrawingPointerMove(e);
      }

      const isTouch = touchEvent.touches !== undefined || (e as PointerEvent).pointerType === 'touch';
      if (!isTouch && drawingHandlers?.previewEnabled === true && drawingHandlers?.updateShapeHover != null) {

        if (currentTool === 'edgeLine' && drawingHandlers.edgeLineStart != null && panZoomHandlers.screenToWorld != null) {
          const worldCoords = panZoomHandlers.screenToWorld(clientX, clientY);
          if (worldCoords != null && geometry != null) {
            const cellSize = geometry.cellSize;
            const nearestX = Math.round(worldCoords.worldX / cellSize);
            const nearestY = Math.round(worldCoords.worldY / cellSize);
            if (drawingHandlers.updateEdgeLineHover) {
              drawingHandlers.updateEdgeLineHover(nearestX, nearestY);
            }
          }
        }
        else if ((currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') && toGrid != null) {
          const hasStart = (currentTool === 'circle' && drawingHandlers.circleStart != null) ||
                           ((currentTool === 'rectangle' || currentTool === 'clearArea') && drawingHandlers.rectangleStart != null);
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
        if (screenToWorld != null && geometry != null) {
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
      if (toGrid != null) {
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

    if (currentTool === 'freehand') {
      const freehandHandlers = getHandlers('freehand');
      if (freehandHandlers?.handlePointerMove) {
        freehandHandlers.handlePointerMove(e);
      }
      return;
    }

    if (currentTool === 'regionPaint' || currentTool === 'regionBoundary') {
      const regionHandlers = getHandlers('region');
      if (regionHandlers?.handlePointerMove) {
        regionHandlers.handlePointerMove(e);
      }
      return;
    }

    if (currentTool === 'outline') {
      const outlineHandlers = getHandlers('outline');
      if (outlineHandlers?.handlePointerMove) {
        outlineHandlers.handlePointerMove(e);
      }
      return;
    }

    if (currentTool === 'wall') {
      const wallHandlers = getHandlers('wall');
      if (wallHandlers?.handlePointerMove) {
        wallHandlers.handlePointerMove(e);
      }
      return;
    }

    if (currentTool === 'tilePaint') {
      const brushHandlers = getHandlers('terrainBrush');
      if (brushHandlers?.handlePointerMove) {
        brushHandlers.handlePointerMove(e);
      }
      const tileHandlers = getHandlers('tilePlacement');
      if (tileHandlers?.handlePointerMove) {
        tileHandlers.handlePointerMove(e);
      }
      return;
    }

    if (currentTool === 'shape') {
      const shapeHandlers = getHandlers('shapeOverlay');
      if (shapeHandlers?.handlePointerMove) {
        shapeHandlers.handlePointerMove(e);
      }
      return;
    }

    if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
      objectHandlers.handleHoverUpdate(e);
    }
  }, [currentTool, isDraggingSelection, dragStart, selectedItem, handleGroupDrag, getHandlers, layerVisibility, isAlignmentMode, geometry, screenToWorld]);

  const handlePointerUp = useCallback((e: MouseEvent | TouchEvent): void => {
    const drawingHandlers = getHandlers('drawing');
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const fogHandlers = getHandlers('fogOfWar');

    if (!panZoomHandlers) return;

    const touchEvent = e as TouchEvent;
    if (touchEvent.changedTouches != null) {
      touchActiveRef.current = false;
    }

    if (isAlignmentMode) {
      return;
    }

    const {
      getClientCoords: getCoords,
      stopPan,
      isPanning
    } = panZoomHandlers;

    if (recentMultiTouch) {
      window.setTimeout(() => setRecentMultiTouch(false), 300);
    }

    if (isPanning) {
      stopPan();

      if (currentTool === 'select' && panStartPositionRef.current) {
        const { clientX, clientY } = getCoords(e);
        const deltaX = Math.abs(clientX - panStartPositionRef.current.x);
        const deltaY = Math.abs(clientY - panStartPositionRef.current.y);

        if (deltaX < panMoveThreshold && deltaY < panMoveThreshold && selectedItem) {
          if (selectedItem.type === 'object' && objectHandlers?.edgeSnapMode === true) {
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
          const areaSelectHandlers = getHandlers('areaSelect');
          if (areaSelectHandlers?.handleAreaSelectClick) {
            areaSelectHandlers.handleAreaSelectClick(areaSelectPendingRef.current.syntheticEvent);
          }
        }

        areaSelectPendingRef.current = null;
        panStartPositionRef.current = null;
      }

      return;
    }

    if (objectHandlers?.isResizing === true && selectedItem?.type === 'object') {
      if (objectHandlers.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }
      return;
    }

    if (isDraggingSelection && dragStart?.isGroupDrag === true) {
      stopGroupDrag();
      return;
    }

    if (isDraggingSelection) {
      if (selectedItem?.type === 'object' && objectHandlers?.stopObjectDragging) {
        objectHandlers.stopObjectDragging();
      } else if (selectedItem?.type === 'text' && textHandlers?.stopTextDragging) {
        textHandlers.stopTextDragging();
      } else if (selectedItem?.type === 'shapeOverlay') {
        const shapeHandlers = getHandlers('shapeOverlay');
        if (shapeHandlers?.stopShapeDragging) {
          shapeHandlers.stopShapeDragging();
        }
      }

      return;
    }

    if (currentTool != null && DRAWING_TOOL_SET.has(currentTool)) {
      if (drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing(e);
      }
    }

    if (currentTool === 'freehand') {
      const freehandHandlers = getHandlers('freehand');
      if (freehandHandlers?.stopDrawing) {
        freehandHandlers.stopDrawing();
      }
    }

    if (currentTool === 'tilePaint') {
      const brushHandlers = getHandlers('terrainBrush');
      if (brushHandlers?.handlePointerUp) {
        brushHandlers.handlePointerUp(e);
      }
      const tileHandlers = getHandlers('tilePlacement');
      if (tileHandlers?.handlePointerUp) {
        tileHandlers.handlePointerUp(e);
      }
    }

    if (currentTool === 'outline') {
      const outlineHandlers = getHandlers('outline');
      if (outlineHandlers?.handlePointerUp) {
        outlineHandlers.handlePointerUp(e);
      }
    }

    if (currentTool === 'wall') {
      const wallHandlers = getHandlers('wall');
      if (wallHandlers?.handlePointerUp) {
        wallHandlers.handlePointerUp(e);
      }
    }

    if (fogHandlers?.handlePointerUp) {
      fogHandlers.handlePointerUp(e);
    }
  }, [currentTool, recentMultiTouch, isDraggingSelection, dragStart, selectedItem, setSelectedItem, stopGroupDrag, getHandlers, isAlignmentMode]);

  const handlePointerLeave = useCallback((_e: MouseEvent): void => {
    const drawingHandlers = getHandlers('drawing');
    const diagonalFillHandlers = getHandlers('diagonalFill');

    if (pendingToolTimeoutRef.current != null) {
      window.clearTimeout(pendingToolTimeoutRef.current);
      pendingToolTimeoutRef.current = null;
      setPendingToolAction(null);
    }

    if (currentTool != null && DRAWING_TOOL_SET.has(currentTool)) {
      if (drawingHandlers?.cancelDrawing) {
        drawingHandlers.cancelDrawing();
      }
    }

    if (currentTool === 'diagonalFill' && diagonalFillHandlers?.cancelFill) {
      diagonalFillHandlers.cancelFill();
    }
  }, [currentTool, getHandlers]);

  const handlePanStart = useCallback((e: MouseEvent): void => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;

    if (e.button === 1) {
      e.preventDefault();
      panZoomHandlers.startPan(e.clientX, e.clientY);
    }
  }, [getHandlers]);

  const handlePanEnd = useCallback((e: MouseEvent): void => {
    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers) return;

    if (panZoomHandlers.isPanning && e.button === 1) {
      e.preventDefault();
      panZoomHandlers.stopPan();
    }
  }, [getHandlers]);

  const handleWheel = useCallback((e: WheelEvent): void => {
    const objectHandlers = getHandlers('object');
    if (objectHandlers?.handleObjectWheel) {
      const handled = objectHandlers.handleObjectWheel(e);
      if (handled) return;
    }

    const panZoomHandlers = getHandlers('panZoom');
    if (!panZoomHandlers?.handleWheel) return;

    if (panZoomHandlers.isPanning) {
      return;
    }

    panZoomHandlers.handleWheel(e);
  }, [getHandlers]);

  const handleCanvasDoubleClick = useCallback((e: MouseEvent): void => {
    // Sub-hex entry: double-click on hex in select mode
    if (currentTool === 'select' && geometry?.type === 'hex' && screenToGrid != null) {
      const coords = screenToGrid(e.clientX, e.clientY);
      if (coords) {
        activeDocument.dispatchEvent(new CustomEvent('windrose:enter-sub-hex', {
          detail: { q: coords.x, r: coords.y }
        }));
        return;
      }
    }

    // Region boundary mode: double-click closes the polygon
    if (currentTool === 'regionBoundary') {
      const regionHandlers = getHandlers('region');
      if (regionHandlers?.handleDoubleClick) {
        regionHandlers.handleDoubleClick(e);
        return;
      }
    }

    // Outline mode: double-click closes the polygon
    if (currentTool === 'outline') {
      const outlineHandlers = getHandlers('outline');
      if (outlineHandlers?.handleDoubleClick) {
        outlineHandlers.handleDoubleClick(e);
        return;
      }
    }

    // Wall mode: double-click finishes the wall
    if (currentTool === 'wall') {
      const wallHandlers = getHandlers('wall');
      if (wallHandlers?.handleDoubleClick) {
        wallHandlers.handleDoubleClick(e);
        return;
      }
    }

    const textHandlers = getHandlers('text');
    if (!textHandlers?.handleCanvasDoubleClick) return;

    textHandlers.handleCanvasDoubleClick(e);
  }, [currentTool, getHandlers, geometry, screenToGrid]);

  const handleContextMenu = useCallback((e: MouseEvent): void => {
    e.preventDefault();

    // Try object/text context menu first — dispatch event for handlers to claim
    const contextDetail = { screenX: e.clientX, screenY: e.clientY, clientX: e.clientX, clientY: e.clientY, handled: false };
    const contextEvent = new CustomEvent('windrose:selection-context-menu', { detail: contextDetail });
    activeDocument.dispatchEvent(contextEvent);
    if (contextDetail.handled) return;

    // General hex context menu (dispatch for DungeonMapTracker to handle)
    if (geometry?.type === 'hex' && screenToGrid != null) {
      const coords = screenToGrid(e.clientX, e.clientY);
      if (coords) {
        activeDocument.dispatchEvent(new CustomEvent('windrose:hex-context-menu', {
          detail: { q: coords.x, r: coords.y, screenX: e.clientX, screenY: e.clientY }
        }));
        return;
      }
    }

    // Region context menu for non-hex maps (fallback)
    const regionHandlers = getHandlers('region');
    if (regionHandlers?.handleContextMenu) {
      regionHandlers.handleContextMenu(e);
    }

    const drawingHandlers = getHandlers('drawing');
    if (drawingHandlers?.cancelShapePreview) {
      drawingHandlers.cancelShapePreview();
    }
  }, [getHandlers, geometry, screenToGrid]);

  // Long-press timer for touch context menu
  const longPressTimerRef = useRef<number | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const handleMouseDown = (e: MouseEvent): void => {
      if (e.button === 1) {
        // Middle-click: pan
        handlePanStart(e);
      } else if (e.button === 2) {
        // Right-click: context menu only (do NOT start pan)
        return;
      } else {
        handlePointerDown(e);
      }
    };

    const handleMouseUp = (e: MouseEvent): void => {
      handlePanEnd(e);
      handlePointerUp(e);
    };

    // Touch long-press handler for hex context menu (500ms)
    const handleTouchStartForLongPress = (e: TouchEvent): void => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      const startX = touch.clientX;
      const startY = touch.clientY;

      if (longPressTimerRef.current != null) window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = window.setTimeout(() => {
        longPressTimerRef.current = null;
        // Dispatch as context menu event
        handleContextMenu(new MouseEvent('contextmenu', { clientX: startX, clientY: startY }));
      }, 500);
    };

    const cancelLongPress = (): void => {
      if (longPressTimerRef.current != null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      lastTapRef.current = null;
    };

    const handleTouchEndDoubleTap = (e: TouchEvent): void => {
      if (e.changedTouches.length !== 1) return;
      const touch = e.changedTouches[0];
      const now = Date.now();
      const last = lastTapRef.current;

      if (last && now - last.time < 300) {
        const dx = touch.clientX - last.x;
        const dy = touch.clientY - last.y;
        if (dx * dx + dy * dy < 900) {
          lastTapRef.current = null;
          handleCanvasDoubleClick(new MouseEvent('dblclick', { clientX: touch.clientX, clientY: touch.clientY }));
          return;
        }
      }

      lastTapRef.current = { time: now, x: touch.clientX, y: touch.clientY };
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('mouseup', handleMouseUp);
    canvas.addEventListener('touchstart', handlePointerDown as EventListener, { passive: false });
    canvas.addEventListener('touchstart', handleTouchStartForLongPress as EventListener, { passive: false });
    canvas.addEventListener('touchmove', cancelLongPress, { passive: false });
    canvas.addEventListener('touchend', cancelLongPress, { passive: true });
    canvas.addEventListener('touchend', handleTouchEndDoubleTap, { passive: true });
    canvas.addEventListener('mousemove', handlePointerMove as EventListener);
    canvas.addEventListener('touchmove', handlePointerMove as EventListener, { passive: false });
    canvas.addEventListener('touchend', handlePointerUp as EventListener);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    canvas.addEventListener('wheel', handleWheel);
    canvas.addEventListener('dblclick', handleCanvasDoubleClick);
    canvas.addEventListener('contextmenu', handleContextMenu);

    return () => {
      cancelLongPress();
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('mouseup', handleMouseUp);
      canvas.removeEventListener('touchstart', handlePointerDown as EventListener);
      canvas.removeEventListener('touchstart', handleTouchStartForLongPress as EventListener);
      canvas.removeEventListener('touchmove', cancelLongPress);
      canvas.removeEventListener('touchend', cancelLongPress);
      canvas.removeEventListener('touchend', handleTouchEndDoubleTap);
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

  useEffect(() => {
    const handleGlobalPointerUp = (e: MouseEvent | TouchEvent): void => {
      const drawingHandlers = getHandlers('drawing');
      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');
      const panZoomHandlers = getHandlers('panZoom');

      if (drawingHandlers?.isDrawing === true && drawingHandlers?.stopDrawing) {
        drawingHandlers.stopDrawing();
      }

      if (panZoomHandlers?.isPanning === true && (e as MouseEvent).button === 1) {
        panZoomHandlers.stopPan();
      }

      if (panZoomHandlers?.isTouchPanningRef?.current === true) {
        panZoomHandlers.stopTouchPan();
        window.setTimeout(() => setRecentMultiTouch(false), 100);
      }

      if (objectHandlers?.stopObjectResizing) {
        objectHandlers.stopObjectResizing();
      }

      if (isDraggingSelection && dragStart?.isGroupDrag === true) {
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
      // The canvas's own mousemove handler already drives the pan while the
      // cursor is over it; this window-level net only takes over once the
      // cursor leaves the canvas. Reacting to both ran updatePan twice per
      // physical mouse event.
      const canvas = canvasRef.current;
      if (canvas != null && e.target instanceof Node && canvas.contains(e.target)) return;
      const panZoomHandlers = getHandlers('panZoom');
      if (panZoomHandlers?.isPanning === true && panZoomHandlers?.updatePan != null) {
        panZoomHandlers.updatePan(e.clientX, e.clientY);
      }
    };

    const handleGlobalTouchMove = (e: TouchEvent): void => {
      const panZoomHandlers = getHandlers('panZoom');
      if (panZoomHandlers?.isTouchPanningRef?.current === true && panZoomHandlers?.updateTouchPan != null && e.touches.length === 2) {
        e.preventDefault();
        panZoomHandlers.updateTouchPan(e.touches);
      }
    };

    window.addEventListener('mouseup', handleGlobalPointerUp);
    window.addEventListener('touchend', handleGlobalPointerUp as EventListener, { passive: true });
    window.addEventListener('mousemove', handleGlobalMouseMove);
    window.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });

    return () => {
      window.removeEventListener('mouseup', handleGlobalPointerUp);
      window.removeEventListener('touchend', handleGlobalPointerUp as EventListener);
      window.removeEventListener('mousemove', handleGlobalMouseMove);
      window.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, [isDraggingSelection, dragStart, setIsDraggingSelection, setDragStart, isGroupDragging, stopGroupDrag, getHandlers, canvasRef]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        return;
      }

      const objectHandlers = getHandlers('object');
      const textHandlers = getHandlers('text');

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

  useEffect(() => {
    return () => {
      if (pendingToolTimeoutRef.current != null) {
        window.clearTimeout(pendingToolTimeoutRef.current);
      }
    };
  }, []);
};

export { useEventCoordinator };