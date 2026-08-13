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
import { calculateFitZoom, subHexAnchorToChildCenter, subHexContinuityZoom } from '../../geometry/core/hexMeasurements';

/**
 * Wheel zoom has no natural gesture "end": it fires a burst of discrete ticks.
 * We open a ViewController gesture on the first tick and commit once the ticks
 * stop for this long — mirroring the static-layer cache's own settle window.
 */
const ZOOM_SETTLE_MS = 150;

/**
 * Trackpad two-finger scrolls arrive as pixel-mode wheel events with small
 * continuous deltas (and often a horizontal component). Mouse wheel notches
 * are line/page-mode, or large quantized verticals (Chromium: ≥100 per notch).
 * Vertical-only pixel deltas below this threshold are treated as trackpad pan.
 */
const TRACKPAD_PAN_MAX_DELTA = 50;

/** Pinch (ctrl+wheel) zoom rate: multiplicative factor per delta pixel. */
const PINCH_ZOOM_RATE = 0.005;
/** Per-event clamp so a discrete ctrl+mouse-wheel notch stays a gentle step. */
const PINCH_ZOOM_FACTOR_MIN = 0.8;
const PINCH_ZOOM_FACTOR_MAX = 1.25;

/** Upper zoom clamp for wheel and pinch zooming. */
const MAX_WHEEL_ZOOM = 4;

/**
 * Mouse-wheel notch zoom step, multiplicative (~12% per notch). A multiplicative
 * step keeps the perceived zoom speed uniform at every scale — an additive step
 * crawls near max zoom (2.5%/tick at 4.0) and lurches at low zoom (37%/tick at
 * 0.27), which made seamless sub-hex dives feel dead-then-sudden.
 */
const WHEEL_ZOOM_STEP_FACTOR = 1.12;

/**
 * Seamless sub-hex zoom: dive when a zoom-in tick reaches the max-zoom ceiling
 * over a hex that has a sub-map; surface when a zoom-out tick drops below the
 * visual-continuity zoom (where the sub-map has shrunk back to the parent
 * hex's max-zoom footprint). Both swaps are footprint-matched, so entry sits
 * just above the surface threshold — the cooldown below is what keeps a
 * single wheel burst from ping-ponging across it.
 */
const SEAMLESS_DIVE_EPSILON = 0.001;
// Legacy surface threshold (fraction of the sub-map's fit zoom), used only
// for sub-maps without ring bounds where continuity can't be derived.
const SEAMLESS_SURFACE_FIT_FRACTION = 0.5;
/** Ignore further transitions briefly after one fires (wheel bursts re-tick). */
const SEAMLESS_COOLDOWN_MS = 600;

/**
 * Heuristic: does this wheel event come from a trackpad two-finger scroll
 * (pan intent) rather than a mouse wheel (zoom intent)?
 */
function isTrackpadPanWheel(e: WheelEvent): boolean {
  if (e.deltaMode !== 0) return false; // line/page deltas come from mice
  if (e.deltaX !== 0) return true; // horizontal component: two-axis gesture
  return Math.abs(e.deltaY) < TRACKPAD_PAN_MAX_DELTA;
}








interface CanvasRef {
  current: HTMLCanvasElement | null;
}

function useCanvasInteraction(
  canvasRef: CanvasRef,
  mapData: MapData | null,
  geometry: (IGeometry & { getScaledCellSize?: (zoom: number) => number }) | null,
  focused: boolean,
  viewController: ViewController,
  isInSubHex: boolean = false
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
  // Wheel routing decided on the first tick of a wheel gesture and held until
  // it settles: a fast trackpad fling ramps past any magnitude threshold, and
  // re-classifying mid-gesture would flip a pan into a zoom.
  const wheelModeRef = useRef<'pan' | 'zoom' | null>(null);
  // Timestamp of the last seamless sub-hex dive/surface, for the cooldown.
  const seamlessTransitionAtRef = useRef<number>(0);

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
    wheelModeRef.current = null;
  };

  // (Re)arm the settle timer that commits the in-flight wheel gesture once
  // ticks stop. Shared by wheel zoom, pinch zoom, and trackpad wheel pan.
  // A drag/touch pan owns the active gesture and commits it in stopPan — a
  // wheel tick mid-pan must not arm a settle timer against the pan's token:
  // firing mid-drag would commit a stale position, null the token so stopPan's
  // commit no-ops, and re-enable syncCommitted's snap-back during the drag.
  const armWheelSettle = (): void => {
    if (isPanningRef.current || isTouchPanningRef.current) return;
    const gid = gestureIdRef.current;
    if (gid == null) return;
    if (wheelSettleTimerRef.current != null) window.clearTimeout(wheelSettleTimerRef.current);
    wheelSettleTimerRef.current = window.setTimeout(() => {
      wheelSettleTimerRef.current = null;
      wheelModeRef.current = null;
      viewController.commitIfCurrent(gid, viewController.getLive());
      if (gestureIdRef.current === gid) gestureIdRef.current = null;
    }, ZOOM_SETTLE_MS);
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

  /**
   * Seamless sub-hex transitions, called from the wheel and touch-pinch zoom
   * paths. Returns true when a transition fired (the caller should stop
   * processing the tick — the map is about to swap).
   *
   * Dive: a zoom-in tick reaches the ceiling and the hex under the zoom
   * anchor has an EXISTING sub-map → enter it (never creates one), opening at
   * the visual-continuity view (child grid in the parent hex's footprint,
   * anchor point kept under the cursor).
   * Surface: inside a sub-hex, a zoom-out tick drops below the continuity
   * zoom → exit to the parent at the mirrored continuity view.
   */
  const maybeSeamlessSubHexTransition = (
    zoomingIn: boolean,
    currentZoom: number,
    newZoom: number,
    anchorClientX: number,
    anchorClientY: number
  ): boolean => {
    if (!mapData || geometry?.type !== 'hex') return false;
    if (Date.now() - seamlessTransitionAtRef.current < SEAMLESS_COOLDOWN_MS) return false;

    if (zoomingIn) {
      // Fire on the tick that REACHES the ceiling (not the one after it), so
      // there are no dead ticks pinned at max zoom before the dive.
      if (newZoom < MAX_WHEEL_ZOOM - SEAMLESS_DIVE_EPSILON) return false;
      const coords = screenToGrid(anchorClientX, anchorClientY);
      if (!coords) return false;
      const subHex = mapData.subHexMaps?.[`${coords.x},${coords.y}`];
      const canvas = canvasRef.current;
      if (subHex == null || canvas == null) return false;

      // Open the sub-map at VISUAL CONTINUITY: the child grid occupies the
      // same screen footprint the parent hex has right now, and the world
      // point under the zoom anchor stays under the anchor. The swap is
      // pixel-continuous; the user just keeps zooming in from there.
      const child = subHex.mapData;
      const rings = subHex.subdivisionRings ?? 7;
      const parentHexSize = mapData.hexSize ?? DEFAULTS.hexSize;
      const childHexSize = child.hexSize ?? mapData.hexSize ?? DEFAULTS.hexSize;
      const orientation = child.orientation ?? mapData.orientation ?? DEFAULTS.hexOrientation;
      const childZoom = Math.max(
        DEFAULTS.minZoom,
        subHexContinuityZoom(currentZoom, parentHexSize, childHexSize, rings)
      );

      // The anchor point, mapped into the child map's extent…
      const anchorWorld = screenToWorld(anchorClientX, anchorClientY);
      const parentCenter = geometry.gridToWorld(coords.x, coords.y);
      const childAnchor = anchorWorld != null
        ? subHexAnchorToChildCenter(
            anchorWorld.worldX - parentCenter.worldX,
            anchorWorld.worldY - parentCenter.worldY,
            parentHexSize,
            childHexSize,
            orientation,
            rings
          )
        : { x: 0, y: 0 };

      // …placed at the anchor's SCREEN position, not the canvas center:
      // center = anchor − screenOffset/zoom (screen offset rotated into the
      // child's world axes when the child map is rotated).
      const rect = canvas.getBoundingClientRect();
      const dx = (anchorClientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2;
      const dy = (anchorClientY - rect.top) * (canvas.height / rect.height) - canvas.height / 2;
      const childAngleRad = (-(child.northDirection ?? 0) * Math.PI) / 180;
      const rotDx = dx * Math.cos(childAngleRad) - dy * Math.sin(childAngleRad);
      const rotDy = dx * Math.sin(childAngleRad) + dy * Math.cos(childAngleRad);
      const childCenter = {
        x: childAnchor.x - rotDx / childZoom,
        y: childAnchor.y - rotDy / childZoom
      };

      seamlessTransitionAtRef.current = Date.now();
      // Commit the in-flight zoom so the parent's stored view (what a
      // non-seamless exit restores) is the view the user dove from.
      clearWheelSettle();
      commitActiveGesture();
      activeDocument.dispatchEvent(new CustomEvent('windrose:enter-sub-hex', {
        detail: {
          q: coords.x,
          r: coords.y,
          viewOverride: { zoom: childZoom, center: childCenter }
        }
      }));
      return true;
    }

    if (!isInSubHex) return false;
    const canvas = canvasRef.current;
    if (!canvas) return false;

    // Surface at the visual-continuity zoom — the point where the sub-map has
    // shrunk back to the parent hex's max-zoom footprint — so the exit swap is
    // as continuous as the dive. Sub-maps inherit the parent's hex size, so
    // the parent/child sizes cancel out of the threshold. Legacy sub-maps
    // without ring bounds fall back to the old fit-fraction threshold.
    const ownRings = mapData.hexBounds?.maxRing;
    let surfaceThreshold: number;
    if (ownRings != null && ownRings > 0) {
      surfaceThreshold = subHexContinuityZoom(MAX_WHEEL_ZOOM, 1, 1, ownRings);
    } else {
      if (mapData.hexBounds == null) return false;
      surfaceThreshold = SEAMLESS_SURFACE_FIT_FRACTION * calculateFitZoom(
        mapData.hexSize ?? DEFAULTS.hexSize,
        mapData.orientation ?? DEFAULTS.hexOrientation,
        mapData.hexBounds,
        canvas.width,
        canvas.height
      );
    }
    if (newZoom >= surfaceThreshold) return false;

    // Hand the exit the child view at this instant so it can restore a
    // visually-continuous parent view (same spot, matched footprint).
    const anchorWorld = screenToWorld(anchorClientX, anchorClientY);
    const rect = canvas.getBoundingClientRect();
    const exitDetail = anchorWorld != null
      ? {
          childZoom: newZoom,
          childAnchor: { x: anchorWorld.worldX, y: anchorWorld.worldY },
          anchorOffset: {
            dx: (anchorClientX - rect.left) * (canvas.width / rect.width) - canvas.width / 2,
            dy: (anchorClientY - rect.top) * (canvas.height / rect.height) - canvas.height / 2
          }
        }
      : null;

    seamlessTransitionAtRef.current = Date.now();
    clearWheelSettle();
    commitActiveGesture();
    activeDocument.dispatchEvent(new CustomEvent('windrose:exit-sub-hex', { detail: exitDetail }));
    return true;
  };

  // Trackpad two-finger scroll: pan the view by the wheel deltas, using the
  // same rotation/scale math as pointer-drag panning. Content follows document
  // scroll conventions (scroll down → content moves up).
  const wheelPan = (e: WheelEvent): void => {
    if (!mapData || !geometry) return;

    const { zoom, center } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    const angleRad = (-northDirection * Math.PI) / 180;
    const rotatedDeltaX = e.deltaX * Math.cos(angleRad) - e.deltaY * Math.sin(angleRad);
    const rotatedDeltaY = e.deltaX * Math.sin(angleRad) + e.deltaY * Math.cos(angleRad);

    const scale = geometry.type === 'grid' && geometry.getScaledCellSize != null
      ? geometry.getScaledCellSize(zoom)
      : zoom;

    gestureIdRef.current ??= viewController.beginGesture();
    viewController.setLive({
      zoom,
      center: {
        x: center.x + rotatedDeltaX / scale,
        y: center.y + rotatedDeltaY / scale
      }
    });
    armWheelSettle();
  };

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;

    // Route the event: ctrl/meta+wheel is pinch-zoom (macOS trackpads deliver
    // pinch as ctrl+wheel), trackpad-shaped plain wheel is two-finger pan,
    // discrete mouse notches keep the classic step zoom. The mode is decided
    // on the gesture's first tick and held until it settles.
    const isPinch = e.ctrlKey || e.metaKey;
    const mode = isPinch
      ? 'zoom'
      : wheelModeRef.current ?? (isTrackpadPanWheel(e) ? 'pan' : 'zoom');
    wheelModeRef.current = mode;

    if (mode === 'pan') {
      wheelPan(e);
      return;
    }

    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const viewState = viewController.getLive();

    let newZoom: number;
    if (isPinch) {
      // Pinch streams many small deltas — zoom multiplicatively for smoothness,
      // clamped per event so a discrete ctrl+mouse-notch stays a gentle step.
      const factor = Math.min(
        PINCH_ZOOM_FACTOR_MAX,
        Math.max(PINCH_ZOOM_FACTOR_MIN, Math.exp(-e.deltaY * PINCH_ZOOM_RATE))
      );
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(MAX_WHEEL_ZOOM, viewState.zoom * factor));
    } else {
      const factor = e.deltaY > 0 ? 1 / WHEEL_ZOOM_STEP_FACTOR : WHEEL_ZOOM_STEP_FACTOR;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(MAX_WHEEL_ZOOM, viewState.zoom * factor));
    }

    // Seamless sub-hex dive/surface takes over the tick when it fires.
    if (maybeSeamlessSubHexTransition(e.deltaY < 0, viewState.zoom, newZoom, e.clientX, e.clientY)) {
      return;
    }

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

    viewController.setLive({
      zoom: newZoom,
      center: { x: newCenterX, y: newCenterY }
    });

    armWheelSettle();
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
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(MAX_WHEEL_ZOOM, zoom * scale));

      // Seamless sub-hex dive/surface: end the touch gesture cleanly when it
      // fires — the map is about to swap under the user's fingers.
      if (scale !== 1 && maybeSeamlessSubHexTransition(scale > 1, zoom, newZoom, center.x, center.y)) {
        stopTouchPan();
        return;
      }
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

export { useCanvasInteraction, isTrackpadPanWheel };