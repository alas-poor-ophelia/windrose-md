/**
 * useCanvasRenderer.ts
 *
 * React side of the map canvas render: coalesces every render trigger (input
 * changes, ViewController live pan/zoom ticks, static-cache zoom settles,
 * MapCanvas resizes) into at most one renderCanvas per animation frame, and
 * owns the static-layer cache lifecycle for its canvas (settle-callback
 * registration, release on canvas swap and unmount).
 *
 * The pure renderer lives in src/geometry/renderers/: mapRenderer.ts
 * (renderCanvas), staticPasses.ts (named static passes over a RenderFrame),
 * staticLayerCache.ts (offscreen snapshot cache), layerCellsRenderer.ts.
 * renderCanvas is re-exported here for existing importers.
 */

import type { UseCanvasRenderer } from '#types/hooks/canvasRenderer.types';

import { useCallback, useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { renderCanvas } from '../../geometry/renderers/mapRenderer';
import { setStaticSettleCallback, releaseStaticLayerCache } from '../../geometry/renderers/staticLayerCache';

const useCanvasRenderer: UseCanvasRenderer = (canvasRef, fogCanvasRef, mapData, geometry, selectedItems = [], options = {}, viewController) => {
  const { isResizeMode = false, theme = null, showCoordinates = false, layerVisibility = null, tileImagesReady = false, adjacentSubHexes = null, adjacentEmptySlots = null, hiddenTileLayers = undefined, draggingWallId = null, subHexPath = null, ladder = null } = options;
  // Coalesce renders to at most one per animation frame. Input changes, the
  // ViewController's live pan/zoom ticks (setLive -> scheduleRender), static-cache
  // settles and MapCanvas resizes all funnel into scheduleRender; rapid triggers
  // collapse into one draw per frame, and the queued frame reads the latest inputs.
  const rafIdRef = useRef<number | null>(null);
  // The canvas the settle callback was registered on; canvasRef may already be
  // detached by the time the unmount cleanup runs.
  const settleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderInputsRef = useRef<{
    mapData: typeof mapData;
    geometry: typeof geometry;
    selectedItems: typeof selectedItems;
    isResizeMode: boolean;
    theme: typeof theme;
    showCoordinates: boolean;
    layerVisibility: typeof layerVisibility;
    adjacentSubHexes: typeof adjacentSubHexes;
    adjacentEmptySlots: typeof adjacentEmptySlots;
    hiddenTileLayers: typeof hiddenTileLayers;
    tileImagesReady: boolean;
    draggingWallId: typeof draggingWallId;
    subHexPath: typeof subHexPath;
    ladder: typeof ladder;
  } | null>(null);

  // Latest canvas refs + controller, read by the stable scheduleRender below.
  const hostRef = useRef({ canvasRef, fogCanvasRef, viewController });
  hostRef.current = { canvasRef, fogCanvasRef, viewController };

  // Identity-stable: returned to callers (MapCanvas resize path) and handed to
  // the ViewController / static-cache settle hooks. A queued frame always reads
  // the most recent inputs from renderInputsRef at fire time.
  const scheduleRender = useCallback((): void => {
    // A frame is already queued — it will pick up the latest inputs from the ref.
    if (rafIdRef.current != null) return;
    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;
      const a = renderInputsRef.current;
      const host = hostRef.current;
      const canvas = host.canvasRef.current;
      if (a && a.mapData && a.geometry && canvas) {
        const fogCanvas = host.fogCanvasRef?.current ?? null;
        // Read the live viewState at FIRE time so a gesture's setLive→scheduleRender
        // path paints the current pan/zoom even though mapData hasn't changed.
        renderCanvas(canvas, fogCanvas, a.mapData, a.geometry, a.selectedItems, { isResizeMode: a.isResizeMode, theme: a.theme, showCoordinates: a.showCoordinates, layerVisibility: a.layerVisibility, adjacentSubHexes: a.adjacentSubHexes, adjacentEmptySlots: a.adjacentEmptySlots, hiddenTileLayers: a.hiddenTileLayers, tileImagesReady: a.tileImagesReady, draggingWallId: a.draggingWallId, subHexPath: a.subHexPath, ladder: a.ladder, liveViewState: host.viewController.getLive() });
      }
    });
  }, []);

  // useLayoutEffect (not useEffect): the inputs ref must refresh at COMMIT,
  // before any already-scheduled rAF can fire. The sub-hex swap boundary
  // (useCanvasInteraction) syncs the new map's view into the ViewController
  // in its own layout effect, which schedules a render — with a deferred
  // useEffect here, that frame painted the OLD map at the NEW view (the
  // "giant grid" ghost frame on surfacing, windrose-1mc trace 2026-08-20).
  useLayoutEffect(() => {
    renderInputsRef.current = { mapData, geometry, selectedItems, isResizeMode, theme, showCoordinates, layerVisibility, adjacentSubHexes, adjacentEmptySlots, hiddenTileLayers, tileImagesReady, draggingWallId, subHexPath, ladder };
    // The static-layer cache requests a follow-up render to redraw crisp after
    // a zoom gesture settles.
    if (canvasRef.current) {
      if (settleCanvasRef.current != null && settleCanvasRef.current !== canvasRef.current) {
        releaseStaticLayerCache(settleCanvasRef.current);
      }
      settleCanvasRef.current = canvasRef.current;
      setStaticSettleCallback(canvasRef.current, scheduleRender);
    }
    // The ViewController drives imperative renders on setLive() during a gesture.
    viewController.setRenderCallback(scheduleRender);
    scheduleRender();
  }, [mapData, geometry, selectedItems, isResizeMode, theme, canvasRef, fogCanvasRef, showCoordinates, layerVisibility, tileImagesReady, adjacentSubHexes, adjacentEmptySlots, hiddenTileLayers, draggingWallId, subHexPath, ladder, viewController, scheduleRender]);

  // Cancel any frame still pending when the component unmounts, plus the
  // static-layer settle timer and its callback for this canvas.
  useEffect(() => () => {
    if (rafIdRef.current != null) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    if (settleCanvasRef.current != null) {
      releaseStaticLayerCache(settleCanvasRef.current);
      settleCanvasRef.current = null;
    }
  }, []);

  return { scheduleRender };
};

export { useCanvasRenderer, renderCanvas };
