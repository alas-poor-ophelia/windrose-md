/**
 * useCanvasInteraction.ts
 *
 * Custom hook that handles all canvas interaction state and logic including:
 * - Pan state (mouse pan, touch pan, space key pan)
 * - Zoom state (wheel zoom, pinch zoom)
 * - Coordinate transformation helpers
 * - Touch event helpers
 *
 * This hook manages the viewport state (zoom, center) and provides
 * helper functions for coordinate conversions that depend on viewport.
 */

// Type-only imports
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type {
  PanStart,
  TouchCenter,
  ClientCoords,
  WorldCoords,
  UseCanvasInteractionResult,
} from '#types/hooks/canvasInteraction.types';
import type { ViewController } from '#types/hooks/viewController.types';

import { useEffect, useRef, useState } from 'preact/hooks';
import { DEFAULTS } from '../../core/dmtConstants';

/**
 * Wheel zoom has no natural gesture "end": it fires a burst of discrete ticks.
 * We open a ViewController gesture on the first tick and commit once the ticks
 * stop for this long — mirroring the static-layer cache's own settle window.
 */
const ZOOM_SETTLE_MS = 150;








interface CanvasRef {
  current: HTMLCanvasElement | null;
}

function useCanvasInteraction(
  canvasRef: CanvasRef,
  mapData: MapData | null,
  geometry: (IGeometry & { getScaledCellSize?: (zoom: number) => number }) | null,
  focused: boolean,
  viewController: ViewController
): UseCanvasInteractionResult {
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [isTouchPanning, setIsTouchPanning] = useState<boolean>(false);
  // `panStart` state stays only as an exposed non-null GATE (useEventCoordinator
  // reads it to decide whether to call updatePan). The live per-tick anchor is
  // rolled forward through `panStartRef` so panning no longer setStates per
  // pointermove — that reconciliation was the measured lag.
  const [panStart, setPanStart] = useState<PanStart | null>(null);
  const [touchPanStart, setTouchPanStart] = useState<TouchCenter | null>(null);

  const [initialPinchDistance, setInitialPinchDistance] = useState<number | null>(null);

  const [spaceKeyPressed, setSpaceKeyPressed] = useState<boolean>(false);

  // Refs for reading current state inside stable event handlers (avoids effect churn)
  const isPanningRef = useRef<boolean>(false);
  const spaceKeyPressedRef = useRef<boolean>(false);
  const isTouchPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<PanStart | null>(null);
  const touchPanStartRef = useRef<TouchCenter | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);

  // Active ViewController gesture token (pan / wheel-settle / pinch). Guards the
  // eventual commit so a stale settle timer can't clobber a newer gesture.
  const gestureIdRef = useRef<number | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);

  // Keep refs in sync with state for stable effect closures
  isPanningRef.current = isPanning;
  spaceKeyPressedRef.current = spaceKeyPressed;
  isTouchPanningRef.current = isTouchPanning;
  touchPanStartRef.current = touchPanStart;
  initialPinchDistanceRef.current = initialPinchDistance;

  // Commit any in-flight gesture to mapData. Called from stopPan/stopTouchPan,
  // the wheel-settle timer, and the blur/pointercancel/unmount safety nets.
  const commitActiveGesture = (): void => {
    if (gestureIdRef.current != null) {
      viewController.commitIfCurrent(gestureIdRef.current, viewController.getLive());
      gestureIdRef.current = null;
    }
  };

  // Cancel a pending wheel-settle commit. Called when a pan/pinch takes over from
  // an in-flight wheel gesture so the old settle timer can't fire as a ghost
  // holding the new gesture's token.
  const clearWheelSettle = (): void => {
    if (wheelSettleTimerRef.current != null) {
      window.clearTimeout(wheelSettleTimerRef.current);
      wheelSettleTimerRef.current = null;
    }
  };

  // Track recent touch to ignore synthetic mouse events
  const lastTouchTimeRef = useRef<number>(0);

  const getClientCoords = (e: PointerEvent | MouseEvent | TouchEvent): ClientCoords => {
    const touchEvent = e as TouchEvent;
    if (touchEvent.touches != null && touchEvent.touches.length > 0) {
      return {
        clientX: touchEvent.touches[0].clientX,
        clientY: touchEvent.touches[0].clientY
      };
    } else if (touchEvent.changedTouches != null && touchEvent.changedTouches.length > 0) {
      return {
        clientX: touchEvent.changedTouches[0].clientX,
        clientY: touchEvent.changedTouches[0].clientY
      };
    } else {
      const mouseEvent = e as MouseEvent;
      return {
        clientX: mouseEvent.clientX,
        clientY: mouseEvent.clientY
      };
    }
  };

  const getTouchCenter = (touches: TouchList): TouchCenter | null => {
    if (touches.length < 2) return null;
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2,
      y: (touches[0].clientY + touches[1].clientY) / 2
    };
  };

  const getTouchDistance = (touches: TouchList): number | null => {
    if (touches.length < 2) return null;
    const dx = touches[1].clientX - touches[0].clientX;
    const dy = touches[1].clientY - touches[0].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const screenToGrid = (clientX: number, clientY: number): Point | null => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { zoom, center } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      x -= centerX;
      y -= centerY;

      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);

      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }

    let offsetX: number, offsetY: number;
    if (geometry.type === 'grid') {
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }

    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;

    return geometry.worldToGrid(worldX, worldY);
  };

  const screenToWorld = (clientX: number, clientY: number): WorldCoords | null => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();

    let x = clientX - rect.left;
    let y = clientY - rect.top;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    x *= scaleX;
    y *= scaleY;

    const { zoom, center } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    let offsetX: number, offsetY: number;
    if (geometry.type === 'grid') {
      const scaledCellSize = geometry.getScaledCellSize(zoom);
      offsetX = canvas.width / 2 - center.x * scaledCellSize;
      offsetY = canvas.height / 2 - center.y * scaledCellSize;
    } else {
      offsetX = canvas.width / 2 - center.x * zoom;
      offsetY = canvas.height / 2 - center.y * zoom;
    }

    if (northDirection !== 0) {
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;

      x -= centerX;
      y -= centerY;

      const angleRad = (-northDirection * Math.PI) / 180;
      const rotatedX = x * Math.cos(angleRad) - y * Math.sin(angleRad);
      const rotatedY = x * Math.sin(angleRad) + y * Math.cos(angleRad);

      x = rotatedX + centerX;
      y = rotatedY + centerY;
    }

    const worldX = (x - offsetX) / zoom;
    const worldY = (y - offsetY) / zoom;

    return { worldX, worldY };
  };

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const viewState = viewController.getLive();

    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    const newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, viewState.zoom + delta));

    const { zoom: oldZoom, center: oldCenter } = viewState;

    // Use the same offset formula as screenToWorld/screenToGrid:
    // Grid maps: offset = canvas/2 - center * cellSize * zoom
    // Hex maps:  offset = canvas/2 - center * zoom
    let oldScale: number, newScale: number;
    if (geometry.type === 'grid') {
      oldScale = geometry.getScaledCellSize(oldZoom);
      newScale = geometry.getScaledCellSize(newZoom);
    } else {
      oldScale = oldZoom;
      newScale = newZoom;
    }

    const offsetX = canvas.width / 2 - oldCenter.x * oldScale;
    const offsetY = canvas.height / 2 - oldCenter.y * oldScale;

    const worldX = (mouseX - offsetX) / oldScale;
    const worldY = (mouseY - offsetY) / oldScale;

    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = mouseY - worldY * newScale;

    const newCenterX = (canvas.width / 2 - newOffsetX) / newScale;
    const newCenterY = (canvas.height / 2 - newOffsetY) / newScale;

    // Wheel has no natural end — open a gesture on the first tick (reusing any
    // in-flight one) and (re)arm a settle timer that commits once ticks stop.
    gestureIdRef.current ??= viewController.beginGesture();
    const wheelGestureId = gestureIdRef.current;

    viewController.setLive({
      zoom: newZoom,
      center: { x: newCenterX, y: newCenterY }
    });

    if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
    wheelSettleTimerRef.current = window.setTimeout(() => {
      wheelSettleTimerRef.current = null;
      viewController.commitIfCurrent(wheelGestureId, viewController.getLive());
      if (gestureIdRef.current === wheelGestureId) gestureIdRef.current = null;
    }, ZOOM_SETTLE_MS);
  };

  const startPan = (clientX: number, clientY: number): void => {
    if (!mapData) return;
    clearWheelSettle(); // a pan takes over any in-flight wheel gesture
    const viewState = viewController.getLive();
    setIsPanning(true);
    const anchor: PanStart = {
      x: clientX,
      y: clientY,
      centerX: viewState.center.x,
      centerY: viewState.center.y
    };
    panStartRef.current = anchor;
    setPanStart(anchor); // exposed non-null gate (one render at gesture start)
    gestureIdRef.current = viewController.beginGesture();
  };

  const updatePan = (clientX: number, clientY: number): void => {
    if (!isPanningRef.current || !panStartRef.current || !mapData) return;
    if (!geometry) return;

    const anchor = panStartRef.current;
    const deltaX = clientX - anchor.x;
    const deltaY = clientY - anchor.y;

    const { zoom, center } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);

    let gridDeltaX: number, gridDeltaY: number;
    if (geometry.type === 'grid') {
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }

    viewController.setLive({
      zoom,
      center: {
        x: center.x + gridDeltaX,
        y: center.y + gridDeltaY
      }
    });

    // Roll the anchor forward through the ref only — no per-tick setState.
    panStartRef.current = { x: clientX, y: clientY, centerX: center.x + gridDeltaX, centerY: center.y + gridDeltaY };
  };

  const stopPan = (): void => {
    setIsPanning(false);
    panStartRef.current = null;
    setPanStart(null);
    commitActiveGesture();
  };

  const startTouchPan = (center: TouchCenter): void => {
    clearWheelSettle(); // a pinch/two-finger pan takes over any in-flight wheel gesture
    setIsTouchPanning(true);
    isTouchPanningRef.current = true;
    setTouchPanStart(center);
    touchPanStartRef.current = center;
    gestureIdRef.current = viewController.beginGesture();
  };

  const updateTouchPan = (touches: TouchList): void => {
    if (!isTouchPanningRef.current || !touchPanStartRef.current || !mapData) {
      return;
    }
    if (!geometry) return;

    const center = getTouchCenter(touches);
    const distance = getTouchDistance(touches);
    if (center == null || distance == null) return;

    const startCenter = touchPanStartRef.current;
    const deltaX = center.x - startCenter.x;
    const deltaY = center.y - startCenter.y;

    const { zoom, center: viewCenter } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = deltaX * Math.cos(angleRad) - deltaY * Math.sin(angleRad);
    const rotatedDeltaY = deltaX * Math.sin(angleRad) + deltaY * Math.cos(angleRad);

    let gridDeltaX: number, gridDeltaY: number;
    if (geometry.type === 'grid') {
      const scaledGridSize = geometry.getScaledCellSize(zoom);
      gridDeltaX = -rotatedDeltaX / scaledGridSize;
      gridDeltaY = -rotatedDeltaY / scaledGridSize;
    } else {
      gridDeltaX = -rotatedDeltaX / zoom;
      gridDeltaY = -rotatedDeltaY / zoom;
    }
    let newZoom = zoom;
    if (initialPinchDistanceRef.current != null) {
      const scale = distance / initialPinchDistanceRef.current;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(4, zoom * scale));
    }

    const newViewState = {
      zoom: newZoom,
      center: {
        x: viewCenter.x + gridDeltaX,
        y: viewCenter.y + gridDeltaY
      }
    };
    viewController.setLive(newViewState);

    // Roll both anchors forward through refs only — drop the per-frame setState
    // mirrors that used to reconcile the whole tree on every pinch/pan tick.
    touchPanStartRef.current = center;
    initialPinchDistanceRef.current = distance;
  };

  const stopTouchPan = (): void => {
    setIsTouchPanning(false);
    isTouchPanningRef.current = false;
    setTouchPanStart(null);
    touchPanStartRef.current = null;
    setInitialPinchDistance(null);
    initialPinchDistanceRef.current = null;
    commitActiveGesture();
  };

  useEffect(() => {
    if (!focused) {
      if (spaceKeyPressedRef.current) {
        setSpaceKeyPressed(false);
        if (isPanningRef.current) {
          stopPan();
        }
      }
      return undefined;
    }

    const handleSpaceDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (e.key === ' ' && target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        setSpaceKeyPressed(true);
      }
    };

    const handleSpaceUp = (e: KeyboardEvent): void => {
      if (e.key === ' ') {
        setSpaceKeyPressed(false);
        if (isPanningRef.current) {
          stopPan();
        }
      }
    };

    window.addEventListener('keydown', handleSpaceDown);
    window.addEventListener('keyup', handleSpaceUp);
    return () => {
      window.removeEventListener('keydown', handleSpaceDown);
      window.removeEventListener('keyup', handleSpaceUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resubscribe on focus only; stopPan called with current-closure semantics via refs
  }, [focused]);

  // Safety nets for gestures that never see a normal pointerup: a window blur
  // (alt-tab / OS focus steal) or a pointercancel (browser aborts the pointer)
  // mid-drag, and unmount mid-gesture. Each commits the live viewState so it is
  // never stranded off the mapData path — an uncommitted gesture would make
  // syncCommitted no-op forever and freeze external navigate/undo/load.
  useEffect(() => {
    const finish = (): void => {
      if (isPanningRef.current) stopPan();
      else if (isTouchPanningRef.current) stopTouchPan();
      else commitActiveGesture();
    };
    window.addEventListener('blur', finish);
    window.addEventListener('pointercancel', finish);
    return () => {
      window.removeEventListener('blur', finish);
      window.removeEventListener('pointercancel', finish);
      // On unmount, commit the live viewState directly — skip stopPan's setState
      // calls (the component is going away; state cleanup is meaningless and would
      // warn), but still persist any in-flight gesture so it isn't lost.
      commitActiveGesture();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only; handlers read live state via refs/stable controller
  }, []);

  return {
    isPanning,
    isTouchPanning,
    isTouchPanningRef,
    touchPanStartRef,
    initialPinchDistanceRef,
    panStart,
    touchPanStart,
    spaceKeyPressed,
    initialPinchDistance,
    lastTouchTimeRef,

    getClientCoords,
    getTouchCenter,
    getTouchDistance,
    screenToGrid,
    screenToWorld,

    handleWheel,

    startPan,
    updatePan,
    stopPan,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,

    setIsPanning,
    setIsTouchPanning,
    setPanStart,
    setTouchPanStart,
    setInitialPinchDistance,
    setSpaceKeyPressed
  };
}

export { useCanvasInteraction };