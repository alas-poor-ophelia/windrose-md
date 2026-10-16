/**
 * useWallOverlay.ts
 *
 * The wall tool's private overlay <canvas>: lifecycle (via useOverlayCanvas),
 * the live view transform, and the three overlay paints:
 * - draw-mode preview (pending vertices, cursor segment, close-loop ring),
 * - edit handles on the selected wall (and the live strip of a wall under
 *   edit-drag, which the static raster drops for the gesture),
 * - the opening-mode WYSIWYG insert ghost.
 *
 * Also keeps the handles in sync with selection/data changes and live
 * pan/zoom ticks. State lives in useWallTools; this hook reads it through the
 * refs it is handed so paints always see the latest values mid-gesture.
 */

import type { WallPath, WallVertex } from '#types/core/wallpath.types';
import type { MutableRef } from 'preact/hooks';

import { useCallback, useEffect } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { calculateViewportOffset } from '../../geometry/core/viewportMath';
import { renderWallPaths, flattenWallPath } from '../../geometry/renderers/wallPathRenderer';
import { getCachedImage } from '../../assets/imageOperations';
import { gapHandleAnchors, findGapOnWallAtPoint, planGapInsert } from '../../drawing/wallGapOperations';
import {
  MIN_HANDLE_ZOOM,
  GAP_CENTER_PERP,
  gapCenterHandlePos,
  isOpenableWall,
  nearestWallInCorridor,
  segmentCount,
  segmentMidpoint,
  wallHitCorridor,
} from '../../drawing/wallEditGeometry';
import { useLiveOverlayRedraw } from '../canvas/useLiveOverlayRedraw';
import { useOverlayCanvas } from '../canvas/useOverlayCanvas';

/** Default gap width (grid cells) for a bare Threshold placement (spec 5.3). */
const BARE_THRESHOLD_WIDTH_CELLS = 1;

/** Mutable wall-tool state the paints read (owned by useWallTools). */
interface WallToolRefs {
  vertices: MutableRef<WallVertex[]>;
  cursor: MutableRef<{ x: number; y: number } | null>;
  dragWorking: MutableRef<WallPath | null>;
  selectedWallId: MutableRef<string | null>;
  selectedVertex: MutableRef<number | null>;
  selectedGap: MutableRef<string | null>;
}

interface WallOverlayOptions {
  refs: WallToolRefs;
  getWalls: () => WallPath[];
  cellSize: number;
  snapDistance: number;
  /** A strip/portal tile is armed (draw preview renders its texture). */
  hasSelectedEntry: boolean;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  isWallTool: boolean;
  isDrawing: boolean;
  isOpeningMode: boolean;
  isBareThreshold: boolean;
  selectedWallId: string | null;
  selectedVertexIndex: number | null;
  selectedGapId: string | null;
  deriveOpeningWidthCells: () => number;
}

interface WallOverlay {
  createOverlay: () => void;
  removeOverlay: () => void;
  drawPreview: () => void;
  drawEditHandles: (opts?: { append?: boolean }) => void;
  drawOpeningGhost: (wx: number, wy: number) => void;
  /** Live zoom (ViewController), the same basis the overlay draws with. */
  getLiveZoom: () => number;
}

function useWallOverlay(options: WallOverlayOptions): WallOverlay {
  const {
    refs, getWalls, cellSize, snapDistance, hasSelectedEntry, selectedTilesetId, selectedTileId,
    isWallTool, isDrawing, isOpeningMode, isBareThreshold,
    selectedWallId, selectedVertexIndex, selectedGapId, deriveOpeningWidthCells,
  } = options;
  const { mapData, geometry, canvasRef, viewController } = useMapState();

  // Shared lifecycle; follows the main canvas size (it used to be sized once at
  // creation, STRUCT-A-20). A resize clears it, so repaint what owns it.
  const { overlayRef, ensure: createOverlay, remove: removeOverlay, sized: sizedOverlay } = useOverlayCanvas(canvasRef, {
    onResize: () => { redrawAfterResize(); },
  });

  const getViewTransform = useCallback((overlay: HTMLCanvasElement): { offsetX: number; offsetY: number; zoom: number } | null => {
    if (mapData == null || geometry == null) return null;
    // Live basis: during a pan/zoom gesture the ViewController updates
    // without touching React state; drawing from the committed viewState
    // froze the edit handles mid-gesture.
    const { zoom, center } = viewController?.getLive() ?? mapData.viewState ?? { zoom: 1, center: { x: 0, y: 0 } };
    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, center, { width: overlay.width, height: overlay.height }, zoom,
    );
    return { offsetX, offsetY, zoom };
  }, [mapData, geometry, viewController]);

  // Hit-testing reads the same live zoom the overlay draws with; the committed
  // viewState lags during a pinch/wheel gesture.
  const committedZoom = mapData?.viewState?.zoom;
  const getLiveZoom = useCallback((): number => {
    return viewController?.getLive().zoom ?? committedZoom ?? 1;
  }, [viewController, committedZoom]);

  // ---- Draw-mode preview ----
  const drawPreview = useCallback(() => {
    const overlay = sizedOverlay();
    if (overlay == null || mapData == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const verts = refs.vertices.current;
    if (verts.length === 0) return;
    const view = getViewTransform(overlay);
    if (view == null) return;
    const { offsetX, offsetY, zoom } = view;
    const viewState = { x: offsetX, y: offsetY, zoom };

    const cursor = refs.cursor.current;
    const previewVerts: WallVertex[] = cursor != null ? [...verts, { x: cursor.x, y: cursor.y }] : verts;
    if (previewVerts.length >= 2 && hasSelectedEntry && selectedTilesetId != null && selectedTileId != null && mapData.tilesets != null) {
      const transient: WallPath = {
        id: '__preview__',
        vertices: previewVerts,
        closed: false,
        tilesetId: selectedTilesetId,
        tileId: selectedTileId,
        kind: 'wall',
        widthScale: 1,
      };
      renderWallPaths(ctx, [transient], mapData.tilesets, viewState, cellSize, {
        opacity: 0.85,
        getCachedImage,
      });
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    if (previewVerts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(previewVerts[0].x, previewVerts[0].y);
      for (let i = 1; i < previewVerts.length; i++) ctx.lineTo(previewVerts[i].x, previewVerts[i].y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1 / zoom;
      ctx.setLineDash([6 / zoom, 4 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const vs = 4 / zoom;
    for (const v of verts) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(v.x - vs, v.y - vs, vs * 2, vs * 2);
      ctx.strokeRect(v.x - vs, v.y - vs, vs * 2, vs * 2);
    }

    if (verts.length >= 3 && cursor != null) {
      const d = Math.hypot(cursor.x - verts[0].x, cursor.y - verts[0].y);
      if (d < snapDistance) {
        ctx.beginPath();
        ctx.arc(verts[0].x, verts[0].y, snapDistance * 0.5, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2 / zoom;
        ctx.stroke();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [mapData, getViewTransform, hasSelectedEntry, selectedTilesetId, selectedTileId, cellSize, snapDistance, sizedOverlay, refs]);

  // ---- Edit-mode handles ----
  // `append` skips the clear so opening mode can layer handles ON TOP of the
  // insert ghost (each draw otherwise owns the whole overlay).
  // This is the edit-drag hot path (every pointermove): it reads the working
  // copy, never mapData, so a drag writes no React state until pointerup.
  const drawEditHandles = useCallback((opts?: { append?: boolean }) => {
    const overlay = sizedOverlay();
    if (overlay == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    if (opts?.append !== true) ctx.clearRect(0, 0, overlay.width, overlay.height);

    // During a drag the working copy is the source of truth (mapData is untouched
    // and the wall is excluded from the static raster); otherwise read from mapData.
    const dragging = refs.dragWorking.current;
    const selId = refs.selectedWallId.current;
    const wall = dragging ?? (selId != null ? getWalls().find(w => w.id === selId) : null);
    if (wall == null) return;
    const view = getViewTransform(overlay);
    if (view == null) return;
    const { offsetX, offsetY, zoom } = view;

    // While dragging, the wall is dropped from the static raster, so paint its
    // textured strip live here. renderWallPaths manages its own transform.
    if (dragging != null && mapData?.tilesets != null && mapData.tilesets.length > 0) {
      renderWallPaths(ctx, [dragging], mapData.tilesets, { x: offsetX, y: offsetY, zoom }, cellSize, {
        getCachedImage,
      });
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // Centerline highlight
    const flat = flattenWallPath(wall);
    if (flat.points.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(flat.points[0][0], flat.points[0][1]);
      for (let i = 1; i < flat.points.length; i++) ctx.lineTo(flat.points[i][0], flat.points[i][1]);
      ctx.strokeStyle = 'rgba(74, 158, 255, 0.85)';
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (zoom >= MIN_HANDLE_ZOOM) {
      // Opening mode edits doors only: no bow/vertex handles (their drags are
      // not reachable from opening mode's pointer-down, so drawing them would
      // advertise dead controls). Gap handles below stay.
      if (!isOpeningMode) {
        // Bow diamonds at segment midpoints
        const ds = 5 / zoom;
        for (let i = 0; i < segmentCount(wall); i++) {
          const m = segmentMidpoint(wall, i);
          ctx.save();
          ctx.translate(m.x, m.y);
          ctx.rotate(Math.PI / 4);
          ctx.fillStyle = wall.vertices[i].arc != null ? '#4a9eff' : '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 / zoom;
          ctx.fillRect(-ds, -ds, ds * 2, ds * 2);
          ctx.strokeRect(-ds, -ds, ds * 2, ds * 2);
          ctx.restore();
        }

        // Vertex squares
        const vsz = 4.5 / zoom;
        for (let i = 0; i < wall.vertices.length; i++) {
          const v = wall.vertices[i];
          ctx.fillStyle = refs.selectedVertex.current === i ? '#ffd700' : '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 / zoom;
          ctx.fillRect(v.x - vsz, v.y - vsz, vsz * 2, vsz * 2);
          ctx.strokeRect(v.x - vsz, v.y - vsz, vsz * 2, vsz * 2);
        }
      }

      // Gap handles: two edge dots on the centerline + a center dot offset
      // perpendicular (clear of the bow diamond, geometry F5).
      const gr = 4 / zoom;
      const perpWorld = GAP_CENTER_PERP / zoom;
      for (const g of wall.gaps ?? []) {
        const a = gapHandleAnchors(wall, g, cellSize);
        if (a == null) continue;
        // Edge dots
        for (const edge of [a.lo, a.hi]) {
          ctx.beginPath();
          ctx.arc(edge.x, edge.y, gr, 0, Math.PI * 2);
          ctx.fillStyle = '#4a9eff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 / zoom;
          ctx.fill();
          ctx.stroke();
        }
        // Center dot (offset), a connector stub back to the centerline.
        const cp = gapCenterHandlePos(a.center, perpWorld);
        ctx.beginPath();
        ctx.moveTo(a.center.x, a.center.y);
        ctx.lineTo(cp.x, cp.y);
        ctx.strokeStyle = 'rgba(74, 158, 255, 0.7)';
        ctx.lineWidth = 1 / zoom;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cp.x, cp.y, gr * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = refs.selectedGap.current === g.id ? '#ffd700' : '#4a9eff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / zoom;
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [mapData, getWalls, getViewTransform, cellSize, isOpeningMode, sizedOverlay, refs]);

  // ---- Opening-mode hover ghost ----
  // WYSIWYG (spec 5.2): render the target wall WITH the pending gap at 50%
  // alpha via the real render path. Off any wall: cleared overlay, no ghost.
  const drawOpeningGhost = useCallback((wx: number, wy: number) => {
    const overlay = sizedOverlay();
    if (overlay == null || mapData?.tilesets == null || mapData.tilesets.length === 0) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const view = getViewTransform(overlay);
    if (view == null) return;
    const corridor = wallHitCorridor(cellSize, view.zoom);
    const wall = nearestWallInCorridor(getWalls(), wx, wy, corridor, isOpenableWall);
    if (wall == null) return;
    // Hovering an existing opening: no insert ghost; a click there selects it
    // for editing (click-to-edit), so previewing an insert would lie.
    if (findGapOnWallAtPoint(wall, wx, wy, cellSize, corridor) != null) return;
    // Bare Threshold: empty gap at a default 1-cell width, ignoring any armed art.
    const tile = isBareThreshold || selectedTilesetId == null || selectedTileId == null
      ? undefined
      : { tilesetId: selectedTilesetId, tileId: selectedTileId };
    const widthCells = isBareThreshold ? BARE_THRESHOLD_WIDTH_CELLS : deriveOpeningWidthCells();
    const plan = planGapInsert(wall, wx, wy, widthCells, cellSize, tile);
    if (plan == null) return;
    const ghost: WallPath = { ...wall, gaps: [...(wall.gaps ?? []), plan.gap] };
    renderWallPaths(ctx, [ghost], mapData.tilesets, { x: view.offsetX, y: view.offsetY, zoom: view.zoom }, cellSize, {
      opacity: 0.5,
      getCachedImage,
    });
  }, [mapData?.tilesets, getViewTransform, cellSize, getWalls, selectedTilesetId, selectedTileId, deriveOpeningWidthCells, isBareThreshold, sizedOverlay]);

  // Keep handles in sync with selection, data, and view changes.
  useEffect(() => {
    if (!isWallTool || isDrawing) return;
    // Opening mode: a selected wall shows its gap handles (click-to-edit);
    // without one, the ghost overlay is pointer-move-owned, so don't nuke it.
    // When isOpeningMode flips false this effect re-runs and cleans it up.
    if (isOpeningMode) {
      if (selectedWallId != null) {
        createOverlay();
        drawEditHandles();
      }
      return;
    }
    if (selectedWallId == null) {
      if (!isDrawing) removeOverlay();
      return;
    }
    createOverlay();
    drawEditHandles();
  }, [isWallTool, isDrawing, isOpeningMode, selectedWallId, selectedVertexIndex, selectedGapId, mapData, drawEditHandles, createOverlay, removeOverlay]);

  // Redraw selected-wall edit handles on live pan/zoom ticks (getViewTransform
  // reads getLive(), so the handles track the gesture instead of freezing).
  // Mid-draw the overlay is pointer-move-owned, so leave it alone. Opening mode
  // is excluded too: its insert ghost shares this overlay and is drawn by
  // pointermove; drawEditHandles() without { append: true } clears the canvas
  // and would wipe the ghost until the next pointer move. Frozen-but-intact
  // beats live-but-erased there.
  const redrawHandlesLive = useCallback(() => {
    if (!isWallTool || isDrawing || isOpeningMode || selectedWallId == null || overlayRef.current == null) return;
    drawEditHandles();
  }, [isWallTool, isDrawing, isOpeningMode, selectedWallId, drawEditHandles, overlayRef]);
  useLiveOverlayRedraw(viewController, redrawHandlesLive);
  // Mid-draw the preview owns the overlay; otherwise the edit handles. The
  // opening ghost is pointer-move-owned and returns on the next move.
  const redrawAfterResize = (): void => {
    if (isDrawing) drawPreview();
    else redrawHandlesLive();
  };

  return { createOverlay, removeOverlay, drawPreview, drawEditHandles, drawOpeningGhost, getLiveZoom };
}

export { useWallOverlay, BARE_THRESHOLD_WIDTH_CELLS };
export type { WallToolRefs, WallOverlayOptions, WallOverlay };
