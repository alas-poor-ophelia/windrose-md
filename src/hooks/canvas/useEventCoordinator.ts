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
  PanStartPosition,
  AreaSelectPending,
} from '#types/hooks/eventCoordinator.types';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useRegisteredHandlers } from '../../context/EventHandlerContext';
import { useGroupDrag } from '../objects/useGroupDrag';
import { captureSubHexBackdrop } from '../../core/subHexBackdropStore';
import { shouldHandleMapKey } from '../../utils/keyboardTargets';
import { TOOL_ROUTES } from './toolDispatch';


const useEventCoordinator = ({
  isColorPickerOpen,
  showObjectColorPicker = false,
  isAlignmentMode = false,
  interactionLocked = false
}: UseEventCoordinatorOptions): void => {
  const { canvasRef, currentTool, screenToGrid, screenToWorld, geometry, mapData, viewController, subHexPath, instanceId, requestEnterSubHex } = useMapState();

  // Read by the double-click sub-hex dive when it snapshots the parent map.
  // Held in a ref because mapData changes on every edit: as a dependency it
  // would re-run the canvas listener effect (14 listeners) per stroke.
  // requestEnterSubHex rides in the same ref for the same reason (its
  // identity follows mapData's).
  const subHexDiveRef = useRef({ mapData, viewController, subHexPath, requestEnterSubHex });
  subHexDiveRef.current = { mapData, viewController, subHexPath, requestEnterSubHex };
  const { selectedItem, setSelectedItem, isDraggingSelection, setIsDraggingSelection, dragStart, setDragStart, layerVisibility, hasMultiSelection, isGroupDragging, clearSelection } = useMapSelection();
  // Read through a ref by the pointer callbacks: the selection context hands
  // out a fresh layerVisibility object on every provider render (hover moves
  // included), so as a dependency it rebound all canvas listeners per move.
  const layerVisibilityRef = useRef(layerVisibility);
  layerVisibilityRef.current = layerVisibility;
  const { getHandlers } = useRegisteredHandlers();
  // Gesture-boundary guard for transient (live drag) history pins: see
  // useLayerHistory.clearTransient. Optional: absent outside DungeonMapTracker.
  const { clearTransient } = useMapOperations();

  const { getClickedSelectedItem, startGroupDrag, handleGroupDrag, stopGroupDrag } = useGroupDrag();

  const [recentMultiTouch, setRecentMultiTouch] = useState<boolean>(false);
  const pendingToolTimeoutRef = useRef<number | null>(null);
  const touchActiveRef = useRef(false);
  // Pending recentMultiTouch resets (pointer-up and global touchend); cleared on unmount.
  const multiTouchResetTimeoutsRef = useRef<Set<number>>(new Set());
  const scheduleMultiTouchReset = useCallback((delayMs: number): void => {
    const id = window.setTimeout(() => {
      multiTouchResetTimeoutsRef.current.delete(id);
      setRecentMultiTouch(false);
    }, delayMs);
    multiTouchResetTimeoutsRef.current.add(id);
  }, []);

  const panStartPositionRef = useRef<PanStartPosition | null>(null);
  const panMoveThreshold = 5;

  const areaSelectPendingRef = useRef<AreaSelectPending | null>(null);

  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent): void => {
    const layerVisibility = layerVisibilityRef.current;
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const fogHandlers = getHandlers('fogOfWar');

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
      startPinch,
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
        const hitDoc = canvasRef.current?.ownerDocument ?? activeDocument;
        const touch1Target = hitDoc.elementFromPoint(touchEvent.touches[0].clientX, touchEvent.touches[0].clientY);
        const touch2Target = hitDoc.elementFromPoint(touchEvent.touches[1].clientX, touchEvent.touches[1].clientY);

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
      }

      setRecentMultiTouch(true);
      // The second finger doesn't end an armed single-finger pan; it freezes
      // its anchor. Mark it stale so the pan re-anchors instead of jumping.
      panZoomHandlers.markPanAnchorStale?.();
      const center = getTouchCenter(touchEvent.touches);
      const distance = getTouchDistance(touchEvent.touches);
      if (center != null && distance != null) {
        startPinch(center, distance);
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

    // A new gesture starts: drop pins an abandoned drag left behind, so the
    // next commit cannot absorb its move. A tile stroke that lost its release
    // is closed first (same as the tile layer's own pointer-down backstop),
    // because its commit needs its pin.
    getHandlers('tilePlacement')?.handlePointerUp?.(e);
    clearTransient?.();

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
      // Picture frame mode: the map is view-only. Any pointer-down becomes a
      // pan start; pinch/wheel zoom are handled upstream and stay live.
      if (interactionLocked) {
        panStartPositionRef.current = { x: clientX, y: clientY };
        startPan(clientX, clientY);
        return;
      }

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
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY, clientX, clientY);
            if (clickedItem) {
              startGroupDrag(clientX, clientY, gridX, gridY);
              return;
            }
          }
        }

        const touchEnded = isTouchEvent && !touchActiveRef.current;

        // Party pin renders above objects — a press on its cell grabs it
        // (and starts a drag); a miss deselects and falls through
        const partyPinSelectHandlers = getHandlers('partyPin');
        if (partyPinSelectHandlers?.handlePartyPinSelectPointerDown) {
          const pinHandled = partyPinSelectHandlers.handlePartyPinSelectPointerDown(gridX, gridY, clientX, clientY);
          if (pinHandled) return;
        }

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
            const clickedItem = getClickedSelectedItem(gridX, gridY, worldCoords.worldX, worldCoords.worldY, clientX, clientY);
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

      } else if (currentTool != null) {
        const route = TOOL_ROUTES[currentTool];
        if (route.down == null) return;
        if (hasMultiSelection) clearSelection();
        route.down({
          getHandlers, e, eventToUse: isTouchEvent ? syntheticEvent : e,
          gridX, gridY, clientX, clientY, isTouchEvent, layerVisibility
        });
      }
    };

    if (isTouchEvent) {
      touchActiveRef.current = true;
      pendingToolTimeoutRef.current = window.setTimeout(() => {
        executeToolAction();
        pendingToolTimeoutRef.current = null;
      }, 50);
    } else {
      executeToolAction();
    }
  }, [currentTool, isColorPickerOpen, showObjectColorPicker, recentMultiTouch, selectedItem, hasMultiSelection, clearSelection, screenToWorld, getClickedSelectedItem, startGroupDrag, getHandlers, isAlignmentMode, setSelectedItem, interactionLocked, canvasRef, clearTransient]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent): void => {
    const layerVisibility = layerVisibilityRef.current;
    const objectHandlers = getHandlers('object');
    const textHandlers = getHandlers('text');
    const panZoomHandlers = getHandlers('panZoom');
    const fogHandlers = getHandlers('fogOfWar');

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
      // Covers multi-touches the pointer-down path never saw (e.g. the second
      // finger landed on an overlay, so no canvas touchstart fired): any
      // 2-touch move while a pan is armed means its anchor is frozen/stale.
      panZoomHandlers.markPanAnchorStale?.();
      if (isTouchPanningRef?.current === true) {
        if (pendingToolTimeoutRef.current != null) {
          window.clearTimeout(pendingToolTimeoutRef.current);
          pendingToolTimeoutRef.current = null;
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
      panZoomHandlers.markPanAnchorStale?.();
      if (pendingToolTimeoutRef.current != null) {
        window.clearTimeout(pendingToolTimeoutRef.current);
        pendingToolTimeoutRef.current = null;
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

    if (currentTool != null) {
      const consumed = TOOL_ROUTES[currentTool].move({
        getHandlers, e, tool: currentTool, clientX, clientY,
        isTouch: touchEvent.touches !== undefined || (e as PointerEvent).pointerType === 'touch',
        toGrid, screenToWorld, cellSize: geometry?.cellSize ?? null
      });
      if (consumed) return;
    }

    // Tools that do not consume the move (selection, placement, drawing)
    // still drive the object hover highlight.
    if (layerVisibility.objects && objectHandlers?.handleHoverUpdate) {
      objectHandlers.handleHoverUpdate(e);
    }
  }, [currentTool, isDraggingSelection, dragStart, selectedItem, handleGroupDrag, getHandlers, isAlignmentMode, geometry, screenToWorld]);

  const handlePointerUp = useCallback((e: MouseEvent | TouchEvent): void => {
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
      scheduleMultiTouchReset(300);
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

    if (currentTool != null) {
      TOOL_ROUTES[currentTool].up({ getHandlers, e });
    }

    if (fogHandlers?.handlePointerUp) {
      fogHandlers.handlePointerUp(e);
    }
  }, [currentTool, recentMultiTouch, isDraggingSelection, dragStart, selectedItem, setSelectedItem, stopGroupDrag, getHandlers, isAlignmentMode, scheduleMultiTouchReset]);

  const handlePointerLeave = useCallback((_e: MouseEvent): void => {
    if (pendingToolTimeoutRef.current != null) {
      window.clearTimeout(pendingToolTimeoutRef.current);
      pendingToolTimeoutRef.current = null;
    }

    if (currentTool != null) {
      TOOL_ROUTES[currentTool].leave({ getHandlers });
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

  // WebKit trackpad pinch (iPadOS Magic Keyboard / macOS Safari): pinch
  // arrives as proprietary GestureEvents, never as Chromium's ctrl+wheel.
  // Chromium never fires these, so the listeners are inert no-ops there.
  const handleGestureStart = useCallback((e: Event): void => {
    getHandlers('panZoom')?.handleGestureStart?.(e);
  }, [getHandlers]);

  const handleGestureChange = useCallback((e: Event): void => {
    getHandlers('panZoom')?.handleGestureChange?.(e);
  }, [getHandlers]);

  const handleGestureEnd = useCallback((e: Event): void => {
    getHandlers('panZoom')?.handleGestureEnd?.(e);
  }, [getHandlers]);

  const handleCanvasDoubleClick = useCallback((e: MouseEvent): void => {
    // Sub-hex entry: double-click on hex in select mode (or any tool while the
    // map is view-locked — picture frame allows navigation, never edits)
    if ((currentTool === 'select' || interactionLocked) && geometry?.type === 'hex' && screenToGrid != null) {
      const coords = screenToGrid(e.clientX, e.clientY);
      // Out-of-bounds double-clicks (e.g. over an adjacent-sibling ghost
      // region in sub-hex view) must not dive: screenToGrid happily returns
      // far-outside coordinates, and diving there would create a sub-map of
      // the CURRENT map at that stray hex.
      if (coords && geometry.isWithinBounds(coords.x, coords.y)) {
        // Pass the clicked world point so the listener can open the sub-map
        // centered on it (same anchor-preserving remap as the seamless dive),
        // and the live canvas size so it can fit-zoom against the real pane.
        const anchor = screenToWorld?.(e.clientX, e.clientY) ?? undefined;
        const dblCanvas = canvasRef.current;
        // Freeze the parent map behind the sub-map (see subHexBackdropStore).
        const dive = subHexDiveRef.current;
        if (dive.mapData != null && dive.viewController != null) {
          captureSubHexBackdrop({
            canvas: dblCanvas,
            parentMapData: dive.mapData,
            geometry,
            q: coords.x,
            r: coords.y,
            parentView: dive.viewController.getLive(),
            parentSubHexPath: dive.subHexPath ?? null
          });
        }
        dive.requestEnterSubHex?.({
          q: coords.x,
          r: coords.y,
          anchor,
          canvasSize: dblCanvas != null ? { width: dblCanvas.width, height: dblCanvas.height } : undefined
        });
        return;
      }
    }

    // View-locked: no polygon closers, no text-label editing
    if (interactionLocked) return;

    // Polygon/wall tools: double-click closes the polygon or finishes the wall
    if (currentTool != null && TOOL_ROUTES[currentTool].doubleClick({ getHandlers, e })) return;

    const textHandlers = getHandlers('text');
    if (!textHandlers?.handleCanvasDoubleClick) return;

    textHandlers.handleCanvasDoubleClick(e);
  }, [currentTool, getHandlers, geometry, screenToGrid, screenToWorld, interactionLocked, canvasRef]);

  const handleContextMenu = useCallback((e: MouseEvent): void => {
    e.preventDefault();

    // View-locked: context menus are edit surfaces
    if (interactionLocked) return;

    // Try object/text context menu first — dispatch event for handlers to claim
    const contextDetail = { screenX: e.clientX, screenY: e.clientY, clientX: e.clientX, clientY: e.clientY, handled: false, instanceId: instanceId ?? undefined };
    const contextEvent = new CustomEvent('windrose:selection-context-menu', { detail: contextDetail });
    // Popout-safe: dispatch on the document that owns this canvas.
    const ownerDoc = canvasRef.current?.ownerDocument ?? activeDocument;
    ownerDoc.dispatchEvent(contextEvent);
    if (contextDetail.handled) return;

    // General hex context menu (dispatch for DungeonMapTracker to handle)
    if (geometry?.type === 'hex' && screenToGrid != null) {
      const coords = screenToGrid(e.clientX, e.clientY);
      if (coords) {
        const ctxCanvas = canvasRef.current;
        ownerDoc.dispatchEvent(new CustomEvent('windrose:hex-context-menu', {
          detail: {
            q: coords.x,
            r: coords.y,
            screenX: e.clientX,
            screenY: e.clientY,
            canvasSize: ctxCanvas != null ? { width: ctxCanvas.width, height: ctxCanvas.height } : undefined,
            instanceId: instanceId ?? undefined
          }
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
  }, [getHandlers, geometry, screenToGrid, interactionLocked, canvasRef, instanceId]);

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
    // A cancelled touch runs the release's stop paths (the window-level cancel
    // handler then clears any pin left behind).
    canvas.addEventListener('touchcancel', handlePointerUp as EventListener);
    canvas.addEventListener('mouseleave', handlePointerLeave);
    // Explicitly non-passive: WebKit needs preventDefault on the first wheel
    // of a trackpad scroll sequence or it hands the stream to native scrolling.
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('gesturestart', handleGestureStart, { passive: false });
    canvas.addEventListener('gesturechange', handleGestureChange, { passive: false });
    canvas.addEventListener('gestureend', handleGestureEnd, { passive: false });
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
      canvas.removeEventListener('touchcancel', handlePointerUp as EventListener);
      canvas.removeEventListener('mouseleave', handlePointerLeave);
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('gesturestart', handleGestureStart);
      canvas.removeEventListener('gesturechange', handleGestureChange);
      canvas.removeEventListener('gestureend', handleGestureEnd);
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
    handleGestureStart,
    handleGestureChange,
    handleGestureEnd,
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
        scheduleMultiTouchReset(100);
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

      const partyPinHandlers = getHandlers('partyPin');
      if (partyPinHandlers?.stopPartyPinDrag) {
        partyPinHandlers.stopPartyPinDrag();
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

    // pointercancel / touchcancel: the gesture ended without a release. Run
    // the same stop paths as a release, then drop any transient pin that no
    // stop path committed (an abandoned drag must not ride the next commit).
    const handleGlobalPointerCancel = (e: Event): void => {
      handleGlobalPointerUp(e as MouseEvent | TouchEvent);
      clearTransient?.();
    };

    // Popout-safe: the window that owns this canvas, captured once per run.
    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('mouseup', handleGlobalPointerUp);
    win.addEventListener('touchcancel', handleGlobalPointerCancel, { passive: true });
    win.addEventListener('pointercancel', handleGlobalPointerCancel);
    win.addEventListener('touchend', handleGlobalPointerUp as EventListener, { passive: true });
    win.addEventListener('mousemove', handleGlobalMouseMove);
    win.addEventListener('touchmove', handleGlobalTouchMove, { passive: false });

    return () => {
      win.removeEventListener('mouseup', handleGlobalPointerUp);
      win.removeEventListener('touchcancel', handleGlobalPointerCancel);
      win.removeEventListener('pointercancel', handleGlobalPointerCancel);
      win.removeEventListener('touchend', handleGlobalPointerUp as EventListener);
      win.removeEventListener('mousemove', handleGlobalMouseMove);
      win.removeEventListener('touchmove', handleGlobalTouchMove);
    };
  }, [isDraggingSelection, dragStart, setIsDraggingSelection, setDragStart, isGroupDragging, stopGroupDrag, getHandlers, canvasRef, scheduleMultiTouchReset, clearTransient]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Ignore typing surfaces (form fields, the CodeMirror note editor) and
      // keys aimed at another map: only the focused (pressed) or hovered map
      // acts. Rule in utils/keyboardTargets.ts.
      if (!shouldHandleMapKey(e, canvasRef.current)) return;

      // An in-progress fog rectangle takes Escape before selection handling
      // (the fog layer registers only while a fog tool is active).
      const fogHandlers = getHandlers('fogOfWar');
      if (e.key === 'Escape' && fogHandlers?.rectangleStart != null && fogHandlers.handleKeyDown) {
        fogHandlers.handleKeyDown(e);
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

    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', handleKeyDown);

    return () => {
      win.removeEventListener('keydown', handleKeyDown);
    };
  }, [getHandlers, canvasRef]);

  useEffect(() => {
    // The Set is created once and mutated in place, so capturing it here is
    // the same object the cleanup must drain.
    const resets = multiTouchResetTimeoutsRef.current;
    return () => {
      if (pendingToolTimeoutRef.current != null) {
        window.clearTimeout(pendingToolTimeoutRef.current);
      }
      resets.forEach((id) => window.clearTimeout(id));
      resets.clear();
    };
  }, []);
};

export { useEventCoordinator };