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
import type { SubHexCoordDetail } from '../../core/windroseEvents';
import type { SubHexExitDetail } from '#types/hooks/canvasInteraction.types';

import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { DEFAULTS } from '../../core/dmtConstants';
import { useSeamlessSubHex, MAX_WHEEL_ZOOM } from './useSeamlessSubHex';
import { traceZoom } from '../../utils/zoomTraceProbe';
import {
  anchoredZoomCenter,
  clientToCanvasPx,
  clientToWorld,
  screenDeltaToCenterUnits
} from '../../geometry/core/viewportMath';

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

/**
 * Mouse-wheel notch zoom step, multiplicative (~12% per notch). A multiplicative
 * step keeps the perceived zoom speed uniform at every scale — an additive step
 * crawls near max zoom (2.5%/tick at 4.0) and lurches at low zoom (37%/tick at
 * 0.27), which made seamless sub-hex dives feel dead-then-sudden.
 */
const WHEEL_ZOOM_STEP_FACTOR = 1.12;

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

/**
 * WebKit's proprietary trackpad-pinch events (iPadOS / macOS Safari). WebKit
 * does NOT synthesize the ctrl+wheel that Chromium sends for trackpad pinch —
 * without listening for these, a Magic Keyboard / Magic Trackpad pinch is
 * inert on iPad. Chromium never fires them, so the listeners attach
 * unconditionally and are no-ops there.
 */
interface WebKitGestureEvent extends UIEvent {
  readonly scale: number;
  readonly clientX: number;
  readonly clientY: number;
}

function useCanvasInteraction(
  canvasRef: CanvasRef,
  mapData: MapData | null,
  geometry: (IGeometry & { getScaledCellSize?: (zoom: number) => number }) | null,
  focused: boolean,
  viewController: ViewController,
  isInSubHex: boolean = false,
  subHexPath: string | null = null,
  // Direct sub-hex dive/surface callbacks for THIS mount (replaced the
  // windrose:enter/exit-sub-hex document events, which every co-mounted hex
  // map obeyed). Absent on the coordinate-utility instantiation in MapCanvas
  // when unwired — seamless transitions simply don't fire there.
  requestEnterSubHex?: (detail: SubHexCoordDetail) => void,
  requestExitSubHex?: (detail: SubHexExitDetail | null) => void
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
  // Set when a multi-touch is observed while a single-pointer pan is armed
  // (1→2→1 finger transition): the pan anchor froze at the pre-pinch finger
  // position while the fingers kept moving, so the next updatePan would compute
  // one huge delta from it. updatePan re-anchors (zero delta) instead. This is
  // ref-only by design — marking staleness must not trigger a render in the
  // middle of a live gesture.
  const panAnchorStaleRef = useRef<boolean>(false);

  // Active ViewController gesture token (pan / wheel-settle / pinch). Guards the
  // eventual commit so a stale settle timer can't clobber a newer gesture.
  const gestureIdRef = useRef<number | null>(null);
  const wheelSettleTimerRef = useRef<number | null>(null);
  // Wheel routing decided on the first tick of a wheel gesture and held until
  // it settles: a fast trackpad fling ramps past any magnitude threshold, and
  // re-classifying mid-gesture would flip a pan into a zoom.
  const wheelModeRef = useRef<'pan' | 'zoom' | null>(null);
  // Set when a touch pinch rides THROUGH a seamless dive/surface: the next
  // updateTouchPan tick re-anchors (fresh center/distance baselines, fresh
  // gesture) on the new map instead of applying a delta, so the pinch's
  // momentum carries across the swap. Ref-only — no mid-gesture setState.
  const touchReanchorRef = useRef<boolean>(false);
  // Zoom at gesturestart of a WebKit trackpad pinch (null = no pinch active).
  // GestureEvent `scale` is cumulative from the gesture's start.
  const webkitGestureStartZoomRef = useRef<number | null>(null);

  // iPad Magic Keyboard: WKWebView strips modifier flags from wheel events
  // (probe-verified: ctrl/cmd+scroll arrives with ctrlKey/metaKey false), so
  // scroll-to-zoom can never trigger off the event flags there. Track the
  // modifier state from keyboard events instead and OR it into the pinch
  // decision. Cleared on window blur so a lost keyup can't wedge zoom mode.
  const zoomModifierHeldRef = useRef<boolean>(false);
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Meta' || e.key === 'Control' || e.metaKey || e.ctrlKey) {
        zoomModifierHeldRef.current = true;
      }
    };
    const onKeyUp = (e: KeyboardEvent): void => {
      if (!e.metaKey && !e.ctrlKey) zoomModifierHeldRef.current = false;
    };
    const onBlur = (): void => {
      zoomModifierHeldRef.current = false;
    };
    // Popout-safe: listen on the window that owns this canvas, captured once
    // so add and remove always target the same document.
    const doc = canvasRef.current?.ownerDocument ?? activeDocument;
    const win = doc.defaultView ?? window;
    doc.addEventListener('keydown', onKeyDown, true);
    doc.addEventListener('keyup', onKeyUp, true);
    win.addEventListener('blur', onBlur);
    return () => {
      doc.removeEventListener('keydown', onKeyDown, true);
      doc.removeEventListener('keyup', onKeyUp, true);
      win.removeEventListener('blur', onBlur);
    };
  }, [canvasRef]);

  // Keep boolean gate refs in sync with state for stable effect closures.
  // The ROLLED anchors (touchPanStartRef / initialPinchDistanceRef /
  // panStartRef) must NEVER be re-seeded from state here: state holds only
  // gesture-START values while the refs roll forward every tick, and any
  // mid-gesture render (e.g. the recentMultiTouch reset timer ~100-300ms in)
  // would snap the refs back to gesture start — the next tick then applies a
  // CUMULATIVE scale/delta on top of the already-advanced view, compounding
  // zoom straight to the ceiling (the iPad "instant 400% into a sub-hex"
  // bug; same failure family as the 2026-08-13 runaway-zoom incident).
  // Every writer sets ref and state together instead.
  isPanningRef.current = isPanning;
  spaceKeyPressedRef.current = spaceKeyPressed;
  isTouchPanningRef.current = isTouchPanning;

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

  // A seamless dive/surface swaps the map identity under this hook — and under
  // the SHARED ViewController — without a remount. A trackpad pinch keeps
  // streaming ctrl+wheel ticks after the dive tick; each tail tick reopens a
  // gesture against the OLD map's live view (zooming it back toward the
  // ceiling in parent space), which starves syncCommitted from ever applying
  // the child's continuity view, and the tail's settle timer then commits that
  // parent-space near-max view into the CHILD's store (the "enter at 400% /
  // teleport" bug). At the identity boundary: abandon any in-flight gesture
  // UNCOMMITTED, drop the stale drag-pan anchor (updatePan no-ops until the
  // pointer lifts), and apply the new map's stored view — enterSubHex/exitSubHex
  // bake the continuity view into it — to the live controller. Tail ticks that
  // arrive after this open fresh gestures on the new map from the continuity
  // view, so a pinch flows through the swap instead of rocketing to max.
  // useLayoutEffect (not useEffect): it must run before the next input event
  // can be processed, or a tick lands in the render→effect gap holding the
  // stale gesture token.
  const prevSubHexPathRef = useRef<string | null | undefined>(undefined);
  useLayoutEffect(() => {
    const prev = prevSubHexPathRef.current;
    prevSubHexPathRef.current = subHexPath;
    if (prev === undefined || prev === subHexPath) return; // mount / no swap
    traceZoom('boundary', { path: subHexPath, storedZoom: mapData?.viewState?.zoom });
    clearWheelSettle();
    if (gestureIdRef.current != null) {
      viewController.cancelIfCurrent(gestureIdRef.current);
      gestureIdRef.current = null;
    }
    // A mouse drag-pan live at the swap also rides through: re-anchor on the
    // next updatePan tick (its stale branch re-opens a gesture if needed).
    if (isPanningRef.current) panAnchorStaleRef.current = true;
    // Hex keys are per-map — a "0,0" in the new map is a different sub-hex.
    resetPrewarm();
    // A touch pinch live at the swap rides THROUGH it: mark it for re-anchor
    // (fresh baselines + fresh gesture on the next tick) instead of killing
    // it, so the zoom's momentum carries into the new map. The stale anchors
    // stay non-null on purpose — updateTouchPan's entry guard must pass so
    // the re-anchor branch can run; it overwrites them before any delta math.
    if (isTouchPanningRef.current) {
      touchReanchorRef.current = true;
    }
    // Deliberate duplicate of MapCanvas's viewState-sync effect: that one is a
    // post-paint useEffect and no-ops against an open gesture — here the
    // gesture was just cancelled and the sync must land pre-paint.
    if (mapData?.viewState != null) viewController.syncCommitted(mapData.viewState);
  });

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
    if (!geometry) return null;
    const world = screenToWorld(clientX, clientY);
    return world ? geometry.worldToGrid(world.worldX, world.worldY) : null;
  };

  // One transform for every pointer -> map conversion: CSS scaling, inverse
  // north rotation, then the view offset (unit rule owned by viewportMath).
  const screenToWorld = (clientX: number, clientY: number): WorldCoords | null => {
    if (!mapData) return null;
    if (!geometry) return null;
    if (!canvasRef.current) return null;
    return clientToWorld(
      geometry, canvasRef.current, clientX, clientY,
      viewController.getLive(), mapData.northDirection ?? 0
    );
  };

  // Seamless sub-hex dive/surface (zoom-driven map swap): fires from the wheel
  // and touch-pinch zoom paths below.
  const { maybeSeamlessSubHexTransition, resetPrewarm } = useSeamlessSubHex({
    canvasRef,
    mapData,
    geometry,
    viewController,
    isInSubHex,
    subHexPath,
    requestEnterSubHex,
    requestExitSubHex,
    screenToGrid,
    screenToWorld,
    clearWheelSettle,
    commitActiveGesture
  });

  // Trackpad two-finger scroll: pan the view by the wheel deltas, using the
  // same rotation/scale math as pointer-drag panning. Content follows document
  // scroll conventions (scroll down → content moves up).
  const wheelPan = (e: WheelEvent): void => {
    if (!mapData || !geometry) return;

    const { zoom, center } = viewController.getLive();
    const d = screenDeltaToCenterUnits(geometry, e.deltaX, e.deltaY, zoom, mapData.northDirection ?? 0);

    gestureIdRef.current ??= viewController.beginGesture();
    viewController.setLive({
      zoom,
      center: { x: center.x + d.x, y: center.y + d.y }
    });
    armWheelSettle();
  };

  /**
   * Apply `newZoom` keeping the world point under (clientX, clientY) fixed,
   * inside an open (or newly opened) ViewController gesture. Shared by the
   * wheel/ctrl-wheel path and the WebKit GestureEvent pinch path.
   */
  const applyAnchoredZoom = (clientX: number, clientY: number, newZoom: number): void => {
    const canvas = canvasRef.current;
    if (!canvas || !geometry) return;

    // Anchor in canvas buffer px (CSS scaling) and solved in the map frame
    // (north rotation), the same chain screenToWorld uses.
    const anchor = clientToCanvasPx(canvas, clientX, clientY);
    const center = anchoredZoomCenter(
      geometry, anchor, { width: canvas.width, height: canvas.height },
      viewController.getLive(), newZoom, mapData?.northDirection ?? 0
    );

    gestureIdRef.current ??= viewController.beginGesture();
    viewController.setLive({ zoom: newZoom, center });
  };

  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault();

    if (!mapData) return;
    if (!geometry) return;
    if (!canvasRef.current) return;

    // A WebKit trackpad pinch is in flight — its GestureEvents carry the
    // zoom; swallow any wheel events WebKit also emits for the same gesture
    // so the pinch isn't double-applied.
    if (webkitGestureStartZoomRef.current != null) {
      traceZoom('wheelSwallowed', { dY: e.deltaY });
      return;
    }

    // Route the event: ctrl/meta+wheel is pinch-zoom (macOS trackpads deliver
    // pinch as ctrl+wheel), trackpad-shaped plain wheel is two-finger pan,
    // discrete mouse notches keep the classic step zoom. The mode is decided
    // on the gesture's first tick and held until it settles. The tracked
    // modifier ref covers WebViews that strip flags from wheel events (iPad).
    const isPinch = e.ctrlKey || e.metaKey || zoomModifierHeldRef.current;
    const mode = isPinch
      ? 'zoom'
      : wheelModeRef.current ?? (isTrackpadPanWheel(e) ? 'pan' : 'zoom');
    wheelModeRef.current = mode;

    if (mode === 'pan') {
      wheelPan(e);
      return;
    }

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

    traceZoom('wheel', { mode, pinch: isPinch, dY: e.deltaY, zoom: viewState.zoom, newZoom });

    // Seamless sub-hex dive/surface takes over the tick when it fires.
    if (maybeSeamlessSubHexTransition(e.deltaY < 0, viewState.zoom, newZoom, e.clientX, e.clientY)) {
      return;
    }

    // Wheel has no natural end — applyAnchoredZoom opens a gesture on the
    // first tick (reusing any in-flight one) and the settle timer commits
    // once ticks stop.
    applyAnchoredZoom(e.clientX, e.clientY, newZoom);
    armWheelSettle();
  };

  // On iPadOS, WebKit GestureEvents fire for SCREEN pinches too (zoom-trace
  // verified 2026-08-20; the older "never dispatched" probe only covered
  // trackpad pinches). A screen pinch is already fully handled by the touch
  // path — letting the gesture path run in parallel double-drives the zoom
  // with an ABSOLUTE parent-baseline write (startZoom * cumulative scale)
  // that fights the touch ticks and, across a seamless dive, slams the
  // freshly-opened child straight to max zoom. Trackpad pinches — the reason
  // these handlers exist — produce no TouchEvents, so recent touch activity
  // means "not a trackpad": stand down.
  const WEBKIT_GESTURE_TOUCH_SUPPRESS_MS = 500;
  const isTouchDrivenGesture = (): boolean =>
    isTouchPanningRef.current ||
    Date.now() - lastTouchTimeRef.current < WEBKIT_GESTURE_TOUCH_SUPPRESS_MS;

  // WebKit trackpad pinch (see WebKitGestureEvent above). `scale` is
  // cumulative from gesture start, so zoom = startZoom * scale; the gesture
  // has a real end, so it commits at gestureend rather than via settle timer.
  const handleGestureStart = (e: Event): void => {
    if (!mapData || !geometry) return;
    e.preventDefault();
    if (isTouchDrivenGesture()) {
      traceZoom('gestStartSuppressed', { zoom: viewController.getLive().zoom });
      return;
    }
    clearWheelSettle();
    traceZoom('gestStart', { zoom: viewController.getLive().zoom });
    webkitGestureStartZoomRef.current = viewController.getLive().zoom;
    gestureIdRef.current ??= viewController.beginGesture();
  };

  const handleGestureChange = (e: Event): void => {
    const startZoom = webkitGestureStartZoomRef.current;
    if (startZoom == null || !mapData || !geometry) return;
    e.preventDefault();
    if (isTouchDrivenGesture()) {
      // A touch pinch took over after this gesture opened — abandon the
      // gesture's baseline entirely; the touch path owns the zoom now.
      webkitGestureStartZoomRef.current = null;
      traceZoom('gestChangeSuppressed', { startZoom });
      return;
    }
    const ge = e as WebKitGestureEvent;
    const currentZoom = viewController.getLive().zoom;
    const newZoom = Math.max(DEFAULTS.minZoom, Math.min(MAX_WHEEL_ZOOM, startZoom * ge.scale));
    traceZoom('gestChange', { scale: ge.scale, startZoom, zoom: currentZoom, newZoom });

    // Seamless sub-hex dive/surface: end the pinch cleanly when it fires —
    // the map is about to swap under the cursor.
    if (newZoom !== currentZoom &&
        maybeSeamlessSubHexTransition(newZoom > currentZoom, currentZoom, newZoom, ge.clientX, ge.clientY)) {
      webkitGestureStartZoomRef.current = null;
      return;
    }

    applyAnchoredZoom(ge.clientX, ge.clientY, newZoom);
  };

  const handleGestureEnd = (e: Event): void => {
    if (webkitGestureStartZoomRef.current == null) return;
    e.preventDefault();
    webkitGestureStartZoomRef.current = null;
    commitActiveGesture();
  };

  const startPan = (clientX: number, clientY: number): void => {
    if (!mapData) return;
    clearWheelSettle(); // a pan takes over any in-flight wheel gesture
    const viewState = viewController.getLive();
    panAnchorStaleRef.current = false;
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

    if (panAnchorStaleRef.current) {
      // A multi-touch intervened since the anchor was last rolled, or the map
      // swapped under the drag (seamless dive/surface) — re-anchor at the
      // current pointer and apply no delta this tick. After a swap the old
      // gesture token was cancelled at the boundary; reopen one so the
      // continued drag can commit (?? keeps a still-valid token intact).
      panAnchorStaleRef.current = false;
      gestureIdRef.current ??= viewController.beginGesture();
      const { center } = viewController.getLive();
      panStartRef.current = { x: clientX, y: clientY, centerX: center.x, centerY: center.y };
      return;
    }

    const anchor = panStartRef.current;
    const deltaX = clientX - anchor.x;
    const deltaY = clientY - anchor.y;

    const { zoom, center } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    // Client-px delta (not buffer px), as before; content follows the finger.
    const d = screenDeltaToCenterUnits(geometry, deltaX, deltaY, zoom, northDirection);
    const gridDeltaX = -d.x;
    const gridDeltaY = -d.y;

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
    panAnchorStaleRef.current = false;
    setPanStart(null);
    commitActiveGesture();
  };

  // Ref-only: the event coordinator calls this whenever it sees a multi-touch
  // event while a single-pointer pan may be armed. No setState — see
  // panAnchorStaleRef.
  const markPanAnchorStale = (): void => {
    if (isPanningRef.current) panAnchorStaleRef.current = true;
  };

  const startTouchPan = (center: TouchCenter): void => {
    clearWheelSettle(); // a pinch/two-finger pan takes over any in-flight wheel gesture
    traceZoom('touchStart', { zoom: viewController.getLive().zoom });
    touchReanchorRef.current = false;
    setIsTouchPanning(true);
    isTouchPanningRef.current = true;
    setTouchPanStart(center);
    touchPanStartRef.current = center;
    gestureIdRef.current = viewController.beginGesture();
  };

  // Seed the pinch baseline into ref AND state together (the render body no
  // longer re-seeds rolled refs from state — see the comment on the gate-ref
  // sync above). The ref is the live per-tick baseline; the state is only the
  // gesture-start gate. Internal: callers go through startPinch.
  const seedInitialPinchDistance = (distance: number | null): void => {
    initialPinchDistanceRef.current = distance;
    setInitialPinchDistance(distance);
  };

  // Two-finger gesture start: open the touch pan and seed the pinch baseline
  // in one call, so callers never touch the baseline setter directly.
  const startPinch = (center: TouchCenter, distance: number): void => {
    startTouchPan(center);
    seedInitialPinchDistance(distance);
  };

  const updateTouchPan = (touches: TouchList): void => {
    if (!isTouchPanningRef.current || !touchPanStartRef.current || !mapData) {
      return;
    }
    if (!geometry) return;

    const center = getTouchCenter(touches);
    const distance = getTouchDistance(touches);
    if (center == null || distance == null) return;

    if (touchReanchorRef.current) {
      // The pinch just crossed a seamless dive/surface — re-anchor its
      // baselines at the current fingers and open a fresh gesture on the
      // new map's view (the old token was cancelled at the boundary). Zero
      // delta this tick; momentum resumes on the next.
      touchReanchorRef.current = false;
      touchPanStartRef.current = center;
      initialPinchDistanceRef.current = distance;
      gestureIdRef.current = viewController.beginGesture();
      return;
    }

    const startCenter = touchPanStartRef.current;
    const deltaX = center.x - startCenter.x;
    const deltaY = center.y - startCenter.y;

    const { zoom, center: viewCenter } = viewController.getLive();
    const northDirection = mapData.northDirection ?? 0;

    // Client-px delta (not buffer px), as before; content follows the finger.
    const d = screenDeltaToCenterUnits(geometry, deltaX, deltaY, zoom, northDirection);
    const gridDeltaX = -d.x;
    const gridDeltaY = -d.y;
    let newZoom = zoom;
    if (initialPinchDistanceRef.current != null) {
      const scale = distance / initialPinchDistanceRef.current;
      newZoom = Math.max(DEFAULTS.minZoom, Math.min(MAX_WHEEL_ZOOM, zoom * scale));
      traceZoom('touchTick', { d: distance, d0: initialPinchDistanceRef.current, scale, zoom, newZoom });

      // Seamless sub-hex dive/surface: the pinch rides through the swap.
      // (An earlier hard stopTouchPan() here guarded the swap race that the
      // subHexPath boundary effect now actually fixes — killing the gesture
      // halted the zoom's momentum at every transition.) The transition
      // already committed the outgoing view; mark the anchors for re-anchor
      // so the remaining pinch continues on the new map from its continuity
      // view. Physically feel-test any change here — this is live-gesture code.
      if (scale !== 1 && maybeSeamlessSubHexTransition(scale > 1, zoom, newZoom, center.x, center.y)) {
        touchReanchorRef.current = true;
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
    traceZoom('touchStop', { zoom: viewController.getLive().zoom });
    touchReanchorRef.current = false;
    setIsTouchPanning(false);
    isTouchPanningRef.current = false;
    setTouchPanStart(null);
    touchPanStartRef.current = null;
    setInitialPinchDistance(null);
    initialPinchDistanceRef.current = null;
    commitActiveGesture();
  };

  // Latest-ref proxy for the gesture-end actions read by the long-lived
  // listeners below, so those effects attach once per mount/focus change and
  // still call the current closures.
  const gestureEndRef = useRef({ stopPan, stopTouchPan, commitActiveGesture });
  gestureEndRef.current = { stopPan, stopTouchPan, commitActiveGesture };

  useEffect(() => {
    if (!focused) {
      if (spaceKeyPressedRef.current) {
        setSpaceKeyPressed(false);
        if (isPanningRef.current) {
          gestureEndRef.current.stopPan();
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
          gestureEndRef.current.stopPan();
        }
      }
    };

    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('keydown', handleSpaceDown);
    win.addEventListener('keyup', handleSpaceUp);
    return () => {
      win.removeEventListener('keydown', handleSpaceDown);
      win.removeEventListener('keyup', handleSpaceUp);
    };
  }, [focused, canvasRef]);

  // Safety nets for gestures that never see a normal pointerup: a window blur
  // (alt-tab / OS focus steal) or a pointercancel (browser aborts the pointer)
  // mid-drag, and unmount mid-gesture. Each commits the live viewState so it is
  // never stranded off the mapData path — an uncommitted gesture would make
  // syncCommitted no-op forever and freeze external navigate/undo/load.
  useEffect(() => {
    const finish = (): void => {
      const end = gestureEndRef.current;
      if (isPanningRef.current) end.stopPan();
      else if (isTouchPanningRef.current) end.stopTouchPan();
      else end.commitActiveGesture();
    };
    const win = canvasRef.current?.ownerDocument.defaultView ?? window;
    win.addEventListener('blur', finish);
    win.addEventListener('pointercancel', finish);
    return () => {
      win.removeEventListener('blur', finish);
      win.removeEventListener('pointercancel', finish);
      // On unmount, commit the live viewState directly — skip stopPan's setState
      // calls (the component is going away; state cleanup is meaningless and would
      // warn), but still persist any in-flight gesture so it isn't lost.
      gestureEndRef.current.commitActiveGesture();
    };
  }, [canvasRef]);

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
    handleGestureStart,
    handleGestureChange,
    handleGestureEnd,

    startPan,
    updatePan,
    stopPan,
    markPanAnchorStale,
    startTouchPan,
    updateTouchPan,
    stopTouchPan,

    startPinch
  };
}

export { useCanvasInteraction, isTrackpadPanWheel };