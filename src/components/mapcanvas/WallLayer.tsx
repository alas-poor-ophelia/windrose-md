/**
 * WallLayer.tsx
 *
 * Wall/path tool: draw and edit texture strips along polylines.
 *
 * DRAW: click places vertices (grid/hex snap); dragging before release bows
 * the new segment through the drag point; Enter/double-click/Done commits;
 * clicking the first vertex closes a loop; Escape cancels; Backspace steps back.
 *
 * EDIT: with the tool active and nothing being drawn, clicking an existing
 * wall selects it — vertex squares and midpoint bow diamonds appear. Drag a
 * vertex to move it, drag a diamond to bow/straighten that segment,
 * double-click a segment to insert a vertex, Delete removes the clicked
 * vertex (or the whole wall when no vertex is active). All drags use
 * suppress-then-commit history (one undo entry per gesture).
 */

import type { WallPath, WallVertex, WallToolSurface } from '#types/core/wallpath.types';
import type { VNode } from 'preact';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { renderWallPaths, flattenWallPath, quadPoint } from '../../geometry/renderers/wallPathRenderer';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { getCachedImage, preloadImage } from '../../assets/imageOperations';
import { createWallPath, distanceToWallPath as distanceToWall } from '../../drawing/wallPathOperations';
import {
  planGapInsert,
  gapHandleAnchors,
  findGapOnWallAtPoint,
  resolveGapMove,
  resolveGapEdgeResize,
  remapGapsAfterInsertVertex,
  remapGapsAfterDeleteVertex,
  snapInsertPointOutsideGaps,
  MIN_GAP_CELLS,
} from '../../drawing/wallGapOperations';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { useApp } from '../../context/AppContext';
import { Notice } from 'obsidian';

export interface WallLayerProps {
  currentTool: string;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onWallPathsChange: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  /**
   * Reports the wall currently being edit-dragged (null when idle). The parent
   * threads this to the renderer so the static raster drops the dragged wall —
   * the live overlay owns it during the gesture, and mapData is untouched until
   * the single commit on pointerup.
   */
  onDragStateChange?: (wallId: string | null) => void;
  /**
   * Publishes the wall-tool control surface (draw/edit state + actions) so the
   * tile-drawer footer can render the tool's controls. WallLayer renders no DOM
   * of its own — its controls live in the drawer. Null when the tool is idle.
   */
  onSurfaceChange?: (surface: WallToolSurface | null) => void;
  /**
   * Arms the built-in "Threshold" placement mode (§5.3 primary trigger): every
   * click cuts a BARE gap (no seated art) at a default 1-cell width, regardless
   * of whether a portal asset is also armed. Independent of the Alt-click bare
   * path (which uses the armed asset's derived width).
   */
  bareThresholdArmed?: boolean;
  /** Called on Escape while bare-threshold placement is armed, to disarm it. */
  onDisarmOpening?: () => void;
  /**
   * Tile-brush Scale slider value (1 = natural size). Multiplies the armed
   * portal art's derived width at placement time — baked into the gap's
   * `widthCells`, so the seated art (aspect-preserving) scales uniformly and
   * later edge-handle resizes compose on top. Bare thresholds ignore it.
   */
  tileScale?: number;
}

/** Default gap width (grid cells) for a bare Threshold placement (§5.3). */
const BARE_THRESHOLD_WIDTH_CELLS = 1;

/** Hide edit handles below this zoom — too small to grab, pure clutter. */
const MIN_HANDLE_ZOOM = 0.3;

/**
 * Perpendicular offset (screen px) of a gap's CENTER handle off the centerline.
 * Moves it clear of the segment-midpoint bow diamond so a mid-segment door and
 * its bow are both grabbable (geometry F5). MUST exceed the handle hit radius
 * (22/zoom) or the offset handle's hit circle still covers the centerline
 * midpoint and masks the bow — so clicking the bow would select the gap instead.
 */
const GAP_CENTER_PERP = 30;

type DragState =
  | { type: 'vertex'; wallId: string; index: number }
  | { type: 'bow'; wallId: string; index: number }
  | { type: 'gapMove'; wallId: string; gapId: string }
  | { type: 'gapEdge'; wallId: string; gapId: string; edge: 'lo' | 'hi' };

/** A gap center handle sits offset perpendicular to the wall tangent. */
function gapCenterHandlePos(
  anchor: { x: number; y: number; angle: number },
  perpWorld: number,
): { x: number; y: number } {
  return {
    x: anchor.x - Math.sin(anchor.angle) * perpWorld,
    y: anchor.y + Math.cos(anchor.angle) * perpWorld,
  };
}

/** Midpoint of segment i (curve point at t=0.5 when arced, else chord midpoint). */
function segmentMidpoint(wall: WallPath, i: number): { x: number; y: number } {
  const a = wall.vertices[i];
  const b = wall.vertices[(i + 1) % wall.vertices.length];
  if (a.arc != null) {
    const [x, y] = quadPoint(a.x, a.y, a.arc[0], a.arc[1], b.x, b.y, 0.5);
    return { x, y };
  }
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function segmentCount(wall: WallPath): number {
  return wall.closed ? wall.vertices.length : wall.vertices.length - 1;
}

/** True if two walls differ geometrically (vertex count, position, or arc). */
function wallGeometryChanged(a: WallPath, b: WallPath): boolean {
  if (a.vertices.length !== b.vertices.length) return true;
  for (let i = 0; i < a.vertices.length; i++) {
    const va = a.vertices[i];
    const vb = b.vertices[i];
    if (Math.abs(va.x - vb.x) > 1e-3 || Math.abs(va.y - vb.y) > 1e-3) return true;
    const aa = va.arc;
    const ab = vb.arc;
    if ((aa == null) !== (ab == null)) return true;
    if (aa != null && ab != null && (Math.abs(aa[0] - ab[0]) > 1e-3 || Math.abs(aa[1] - ab[1]) > 1e-3)) return true;
  }
  return false;
}

/**
 * Axis-aligned bounds over a wall's vertices and arc control points. Control
 * points are included because an arc can bow beyond the vertex hull; the
 * flattened polyline stays inside {vertices ∪ control points}.
 */
function wallBounds(wall: WallPath): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const v of wall.vertices) {
    if (v.x < minX) minX = v.x;
    if (v.y < minY) minY = v.y;
    if (v.x > maxX) maxX = v.x;
    if (v.y > maxY) maxY = v.y;
    if (v.arc != null) {
      if (v.arc[0] < minX) minX = v.arc[0];
      if (v.arc[1] < minY) minY = v.arc[1];
      if (v.arc[0] > maxX) maxX = v.arc[0];
      if (v.arc[1] > maxY) maxY = v.arc[1];
    }
  }
  return { minX, minY, maxX, maxY };
}

const WallLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  onWallPathsChange,
  onDragStateChange,
  onSurfaceChange,
  bareThresholdArmed,
  onDisarmOpening,
  tileScale,
}: WallLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();

  // ---- Draw state ----
  const [vertices, setVertices] = useState<WallVertex[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const verticesRef = useRef<WallVertex[]>(vertices);
  verticesRef.current = vertices;
  const snapRef = useRef(snapEnabled);
  snapRef.current = snapEnabled;
  const angleSnapRef = useRef(angleSnapEnabled);
  angleSnapRef.current = angleSnapEnabled;
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const pressActiveRef = useRef(false);

  // ---- Edit state ----
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedVertexIndex, setSelectedVertexIndex] = useState<number | null>(null);
  const [selectedGapId, setSelectedGapId] = useState<string | null>(null);
  const selectedWallIdRef = useRef(selectedWallId);
  selectedWallIdRef.current = selectedWallId;
  const selectedVertexRef = useRef(selectedVertexIndex);
  selectedVertexRef.current = selectedVertexIndex;
  const selectedGapRef = useRef(selectedGapId);
  selectedGapRef.current = selectedGapId;
  const dragRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);
  // Working copy of the wall under drag. Mutated per-frame in place of mapData,
  // rendered live on the overlay, and committed to mapData once on pointerup.
  const dragWorkingRef = useRef<WallPath | null>(null);

  const isWallTool = currentTool === 'wall';
  const isDrawing = vertices.length > 0;
  const cellSize = geometry != null ? geometry.cellSize : 32;
  const snapDistance = cellSize * 0.5;

  const getWalls = useCallback((): WallPath[] => {
    if (mapData == null) return [];
    return getActiveLayer(mapData).wallPaths ?? [];
  }, [mapData]);

  const selectedWall = selectedWallId != null
    ? getWalls().find(w => w.id === selectedWallId) ?? null
    : null;
  const selectedGap = selectedGapId != null
    ? selectedWall?.gaps?.find(g => g.id === selectedGapId) ?? null
    : null;

  // ---- Asset resolution for drawing ----
  const selectedEntry = (() => {
    if (selectedTilesetId == null || selectedTileId == null || mapData?.tilesets == null) return null;
    const ts = mapData.tilesets.find(t => t.id === selectedTilesetId);
    return ts?.tiles.find(t => t.id === selectedTileId) ?? null;
  })();
  const selectedMeta = selectedEntry != null ? getTileMetadataForRender()[selectedEntry.vaultPath] : undefined;
  const isStripAsset = selectedMeta?.ddSourceType === 'walls' || selectedMeta?.ddSourceType === 'paths';
  // Opening mode: a DD portal is armed → click a wall to seat a door/window.
  // Detected via metadata (mirrors isStripAsset), NOT the 'opening' subtool —
  // that literal isn't a TileSubtoolId until P3 lands (see GOTCHAS).
  const isOpeningAsset = selectedMeta?.ddSourceType === 'portals';
  // Opening PLACEMENT mode is active for either an armed portal (seated art) or
  // the built-in bare Threshold entry (no art). Both route clicks to gap inserts
  // and own the hover ghost; bare-threshold just forces an empty gap.
  const isBareThreshold = bareThresholdArmed === true;
  const isOpeningMode = isOpeningAsset || isBareThreshold;

  useEffect(() => {
    if (selectedEntry?.vaultPath != null && (isStripAsset || isOpeningAsset)) {
      void preloadImage(app, selectedEntry.vaultPath);
      if (isStripAsset) {
        const cap = selectedMeta?.wallEndCapPath;
        if (cap != null) void preloadImage(app, cap);
      }
    }
  }, [app, selectedEntry?.vaultPath, isStripAsset, isOpeningAsset, selectedMeta?.wallEndCapPath]);

  // ---- Snapping ----
  const snapWorld = useCallback((wx: number, wy: number): { x: number; y: number } => {
    if (!snapRef.current || geometry == null) return { x: wx, y: wy };
    if (geometry.type === 'grid') {
      const cs = geometry.cellSize;
      return { x: Math.round(wx / cs) * cs, y: Math.round(wy / cs) * cs };
    }
    const grid = geometry.worldToGrid(wx, wy);
    const world = geometry.gridToWorld(grid.x, grid.y);
    return { x: world.worldX, y: world.worldY };
  }, [geometry]);

  const angleSnap = useCallback((wx: number, wy: number, altKey: boolean): { x: number; y: number } => {
    if (!angleSnapRef.current && !altKey) return { x: wx, y: wy };
    const verts = verticesRef.current;
    if (verts.length === 0) return { x: wx, y: wy };
    const prev = verts[verts.length - 1];
    const dx = wx - prev.x;
    const dy = wy - prev.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return { x: wx, y: wy };
    const step = Math.PI / 4;
    const angle = Math.round(Math.atan2(dy, dx) / step) * step;
    return { x: prev.x + len * Math.cos(angle), y: prev.y + len * Math.sin(angle) };
  }, []);

  // ---- Overlay ----
  const createOverlay = useCallback((): HTMLCanvasElement | null => {
    if (overlayRef.current != null) return overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement) return null;
    const overlay = activeWindow.createEl('canvas');
    overlay.width = mainCanvas.width;
    overlay.height = mainCanvas.height;
    overlay.classList.add('windrose-overlay-layer');
    mainCanvas.parentElement.appendChild(overlay);
    overlayRef.current = overlay;
    return overlay;
  }, [canvasRef]);

  const removeOverlay = useCallback(() => {
    if (overlayRef.current?.parentElement != null) {
      overlayRef.current.parentElement.removeChild(overlayRef.current);
    }
    overlayRef.current = null;
  }, []);

  const getViewTransform = useCallback((overlay: HTMLCanvasElement): { offsetX: number; offsetY: number; zoom: number } | null => {
    if (mapData == null || geometry == null) return null;
    const { zoom, center } = mapData.viewState ?? { zoom: 1, center: { x: 0, y: 0 } };
    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, center, { width: overlay.width, height: overlay.height }, zoom,
    );
    return { offsetX, offsetY, zoom };
  }, [mapData, geometry]);

  // ---- Draw-mode preview ----
  const drawPreview = useCallback(() => {
    const overlay = overlayRef.current;
    if (overlay == null || mapData == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const verts = verticesRef.current;
    if (verts.length === 0) return;
    const view = getViewTransform(overlay);
    if (view == null) return;
    const { offsetX, offsetY, zoom } = view;
    const viewState = { x: offsetX, y: offsetY, zoom };

    const cursor = cursorRef.current;
    const previewVerts: WallVertex[] = cursor != null ? [...verts, { x: cursor.x, y: cursor.y }] : verts;
    if (previewVerts.length >= 2 && selectedEntry != null && selectedTilesetId != null && selectedTileId != null && mapData.tilesets != null) {
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
  }, [mapData, getViewTransform, selectedEntry, selectedTilesetId, selectedTileId, cellSize, snapDistance]);

  // ---- Edit-mode handles ----
  // `append` skips the clear so opening mode can layer handles ON TOP of the
  // insert ghost (each draw otherwise owns the whole overlay).
  const drawEditHandles = useCallback((opts?: { append?: boolean }) => {
    const overlay = overlayRef.current;
    if (overlay == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    if (opts?.append !== true) ctx.clearRect(0, 0, overlay.width, overlay.height);

    // During a drag the working copy is the source of truth (mapData is untouched
    // and the wall is excluded from the static raster); otherwise read from mapData.
    const dragging = dragWorkingRef.current;
    const wall = dragging ?? (selectedWallIdRef.current != null
      ? (mapData != null ? (getActiveLayer(mapData).wallPaths ?? []).find(w => w.id === selectedWallIdRef.current) : null)
      : null);
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
          ctx.fillStyle = selectedVertexRef.current === i ? '#ffd700' : '#ffffff';
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
        ctx.fillStyle = selectedGapRef.current === g.id ? '#ffd700' : '#4a9eff';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1 / zoom;
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.restore();
  }, [mapData, getViewTransform, cellSize, isOpeningMode]);

  // Keep handles in sync with selection, data, and view changes.
  useEffect(() => {
    if (!isWallTool || isDrawing) return;
    // Opening mode: a selected wall shows its gap handles (click-to-edit);
    // without one, the ghost overlay is pointer-move-owned — don't nuke it.
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

  // ---- Wall mutation helpers ----
  const updateWall = useCallback((wallId: string, mutate: (w: WallPath) => WallPath, suppress: boolean) => {
    const walls = getWalls();
    const idx = walls.findIndex(w => w.id === wallId);
    if (idx < 0) return;
    const next = walls.slice();
    next[idx] = mutate(walls[idx]);
    onWallPathsChange(next, suppress);
  }, [getWalls, onWallPathsChange]);

  // Enter an ephemeral edit-drag: seed the working copy, tell the parent to drop
  // this wall from the static raster, and paint it live on the overlay. No
  // mapData writes happen until the single commit on pointerup.
  const beginDrag = useCallback((wall: WallPath) => {
    dragWorkingRef.current = wall;
    dragMovedRef.current = false;
    onDragStateChange?.(wall.id);
    drawEditHandles();
  }, [onDragStateChange, drawEditHandles]);

  // ---- Opening mode (portal armed → seat a door/window in a wall gap) ----
  // Width from the armed art (§3.3): naturalWidth ÷ the tileset's authoring
  // resolution, × the brush Scale slider; planGapInsert clamps it to the host
  // segment. Falls back to 1 cell (a spec 256-px portal) until the image decodes.
  const deriveOpeningWidthCells = useCallback((): number => {
    const vp = selectedEntry?.vaultPath;
    const img = vp != null ? getCachedImage(vp) : null;
    const ts = mapData?.tilesets?.find(t => t.id === selectedTilesetId);
    const ppc = ts?.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;
    const natW = img?.naturalWidth ?? 0;
    const scale = tileScale != null && tileScale > 0 ? tileScale : 1;
    return (natW > 0 ? natW / ppc : 1) * scale;
  }, [selectedEntry?.vaultPath, mapData?.tilesets, selectedTilesetId, tileScale]);

  // Nearest kind:'wall' strip whose corridor contains the point (paths are not
  // openable — §5.1). Reuses the edit-mode bbox pre-filter + distanceToWall.
  const nearestOpeningWall = useCallback((wx: number, wy: number, corridor: number): WallPath | null => {
    let best: WallPath | null = null;
    let bestDist = Infinity;
    for (const w of getWalls()) {
      if (w.kind !== 'wall') continue;
      const bb = wallBounds(w);
      if (wx < bb.minX - corridor || wx > bb.maxX + corridor ||
          wy < bb.minY - corridor || wy > bb.maxY + corridor) continue;
      const d = distanceToWall(w, wx, wy);
      if (d < bestDist) { bestDist = d; best = w; }
    }
    return best != null && bestDist < corridor ? best : null;
  }, [getWalls]);

  // WYSIWYG hover ghost (§5.2): render the target wall WITH the pending gap at
  // 50% alpha via the real render path. Off any wall → cleared overlay, no ghost.
  const drawOpeningGhost = useCallback((wx: number, wy: number) => {
    const overlay = overlayRef.current;
    if (overlay == null || mapData?.tilesets == null || mapData.tilesets.length === 0) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const view = getViewTransform(overlay);
    if (view == null) return;
    const corridor = Math.max(cellSize * 0.4, 22 / view.zoom);
    const wall = nearestOpeningWall(wx, wy, corridor);
    if (wall == null) return;
    // Hovering an existing opening: no insert ghost — a click there selects it
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
  }, [mapData?.tilesets, getViewTransform, cellSize, nearestOpeningWall, selectedTilesetId, selectedTileId, deriveOpeningWidthCells, isBareThreshold]);

  // Click commits a single gap insert (one undo entry via suppress=false, G-F2).
  // Alt-click omits the art → a bare capped threshold (§5.3 secondary trigger).
  const commitOpeningInsert = useCallback((wx: number, wy: number, bare: boolean) => {
    const zoom = mapData?.viewState?.zoom ?? 1;
    const corridor = Math.max(cellSize * 0.4, 22 / zoom);
    const wall = nearestOpeningWall(wx, wy, corridor);
    if (wall == null) { new Notice('Click on a wall to place a door'); return; }
    // Bare threshold (ribbon entry OR Alt-click) omits the art. The ribbon entry
    // uses a default 1-cell width; Alt-click keeps the armed asset's derived width.
    const bareEffective = bare || isBareThreshold;
    const tile = bareEffective || selectedTilesetId == null || selectedTileId == null
      ? undefined
      : { tilesetId: selectedTilesetId, tileId: selectedTileId };
    const widthCells = isBareThreshold ? BARE_THRESHOLD_WIDTH_CELLS : deriveOpeningWidthCells();
    const plan = planGapInsert(wall, wx, wy, widthCells, cellSize, tile);
    if (plan == null) { new Notice('Not enough room on this wall segment for a door'); return; }
    // suppress=false → exactly one history entry; the wall stays in the static
    // raster (passing true would drop it AND write no undo entry — G-F2).
    updateWall(wall.id, w => ({ ...w, gaps: [...(w.gaps ?? []), plan.gap] }), false);
    // Place-and-adjust: the fresh opening is immediately selected, so its
    // move/resize handles and the footer door controls appear without a click.
    setSelectedWallId(wall.id);
    setSelectedGapId(plan.gap.id);
    setSelectedVertexIndex(null);
  }, [mapData?.viewState?.zoom, cellSize, nearestOpeningWall, selectedTilesetId, selectedTileId, deriveOpeningWidthCells, updateWall, isBareThreshold]);

  // ---- Draw-mode actions ----
  const cancelDrawing = useCallback(() => {
    setVertices([]);
    cursorRef.current = null;
    removeOverlay();
  }, [removeOverlay]);

  const commitWall = useCallback((closeLoop: boolean) => {
    const verts = verticesRef.current;
    const cleaned: WallVertex[] = [];
    for (const v of verts) {
      const prev = cleaned[cleaned.length - 1];
      if (prev != null && Math.hypot(v.x - prev.x, v.y - prev.y) < 0.5) continue;
      cleaned.push(v);
    }
    if (cleaned.length < 2 || mapData == null || selectedTilesetId == null || selectedTileId == null) {
      cancelDrawing();
      return;
    }
    const kind = selectedMeta?.ddSourceType === 'paths' ? 'path' as const : 'wall' as const;
    const wallPath = createWallPath({
      vertices: cleaned,
      tilesetId: selectedTilesetId,
      tileId: selectedTileId,
      kind,
      closed: closeLoop,
    });
    const current = getActiveLayer(mapData).wallPaths ?? [];
    onWallPathsChange([...current, wallPath]);
    cancelDrawing();
  }, [mapData, selectedTilesetId, selectedTileId, selectedMeta?.ddSourceType, onWallPathsChange, cancelDrawing]);

  // ---- Control-surface actions (rendered by the drawer footer) ----
  const toggleSnap = useCallback(() => setSnapEnabled(v => !v), []);
  const toggleAngleSnap = useCallback(() => setAngleSnapEnabled(v => !v), []);
  const finishWall = useCallback(() => commitWall(false), [commitWall]);
  const undoLastPoint = useCallback(() => {
    const verts = verticesRef.current;
    if (verts.length <= 1) { cancelDrawing(); return; }
    const next = verts.slice(0, -1);
    setVertices(next);
    verticesRef.current = next;
    drawPreview();
  }, [cancelDrawing, drawPreview]);
  const deselect = useCallback(() => { setSelectedWallId(null); setSelectedVertexIndex(null); setSelectedGapId(null); }, []);
  const deleteSelectedWall = useCallback((wallId: string) => {
    onWallPathsChange(getWalls().filter(w => w.id !== wallId), false);
    setSelectedWallId(null);
    setSelectedVertexIndex(null);
    setSelectedGapId(null);
  }, [getWalls, onWallPathsChange]);
  const deselectGap = useCallback(() => setSelectedGapId(null), []);

  // Stable action wrappers for the published control surface. The wrappers keep
  // a fixed identity (created once) and dispatch through a ref that always holds
  // the latest closures + selected wall. This keeps them OUT of the publish
  // effect's dependency list — depending on the raw callbacks made the effect
  // re-fire after each setWallSurface (which re-renders this layer), an infinite
  // render loop while drawing (Preact doesn't guard against it).
  const liveRef = useRef({
    toggleSnap, toggleAngleSnap, undoLastPoint, cancelDrawing, finishWall,
    updateWall, deleteSelectedWall, deselect, deselectGap,
    selectedWallId: null as string | null, selectedGapId: null as string | null,
  });
  liveRef.current = {
    toggleSnap, toggleAngleSnap, undoLastPoint, cancelDrawing, finishWall,
    updateWall, deleteSelectedWall, deselect, deselectGap,
    selectedWallId, selectedGapId,
  };
  const surfaceActions = useRef({
    toggleSnap: () => liveRef.current.toggleSnap(),
    toggleAngleSnap: () => liveRef.current.toggleAngleSnap(),
    undoLastPoint: () => liveRef.current.undoLastPoint(),
    cancelDrawing: () => liveRef.current.cancelDrawing(),
    finishWall: () => liveRef.current.finishWall(),
    setWidth: (v: number) => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.updateWall(id, w => ({ ...w, widthScale: v }), false);
    },
    toggleFlip: () => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.updateWall(id, w => ({ ...w, flip: w.flip !== true }), false);
    },
    deleteWall: () => {
      const id = liveRef.current.selectedWallId;
      if (id != null) liveRef.current.deleteSelectedWall(id);
    },
    deselect: () => liveRef.current.deselect(),
    // --- selected-gap actions ---
    setGapWidth: (cells: number) => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      const w = Math.max(MIN_GAP_CELLS, cells);
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g => (g.id === gid ? { ...g, widthCells: w, widthLocked: true } : g)),
      }), false);
    },
    toggleGapFlip: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g =>
          g.id === gid && g.tile != null ? { ...g, tile: { ...g.tile, flip: g.tile.flip !== true } } : g),
      }), false);
    },
    unbindGap: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).map(g => {
          if (g.id !== gid) return g;
          const next = { ...g };
          delete next.tile;
          return next;
        }),
      }), false);
    },
    deleteGap: () => {
      const id = liveRef.current.selectedWallId;
      const gid = liveRef.current.selectedGapId;
      if (id == null || gid == null) return;
      liveRef.current.updateWall(id, wall => ({
        ...wall,
        gaps: (wall.gaps ?? []).filter(g => g.id !== gid),
      }), false);
      liveRef.current.deselectGap();
    },
    deselectGap: () => liveRef.current.deselectGap(),
  }).current;

  // ---- Pointer handlers ----
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = mapData?.viewState?.zoom ?? 1;
    const verts = verticesRef.current;

    // ---- OPENING MODE (portal armed) ----
    // Place-and-adjust: gap handles on the selected wall win first (same
    // precedence as edit mode: edge → center), then a click on an existing
    // opening's footprint selects it, then a click on bare wall inserts.
    // Alt-click cuts a bare threshold (§5.2/§5.3). Never draws a wall.
    if (isOpeningMode) {
      const walls = getWalls();
      const hitR = Math.max(8 / zoom, 22 / zoom);
      const selWall = selectedWallIdRef.current != null ? walls.find(w => w.id === selectedWallIdRef.current) : null;
      if (selWall != null && zoom >= MIN_HANDLE_ZOOM) {
        const perpWorld = GAP_CENTER_PERP / zoom;
        for (const g of selWall.gaps ?? []) {
          const a = gapHandleAnchors(selWall, g, cellSize);
          if (a == null) continue;
          if (Math.hypot(coords.worldX - a.lo.x, coords.worldY - a.lo.y) < hitR) {
            dragRef.current = { type: 'gapEdge', wallId: selWall.id, gapId: g.id, edge: 'lo' };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
          if (Math.hypot(coords.worldX - a.hi.x, coords.worldY - a.hi.y) < hitR) {
            dragRef.current = { type: 'gapEdge', wallId: selWall.id, gapId: g.id, edge: 'hi' };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
        }
        for (const g of selWall.gaps ?? []) {
          const a = gapHandleAnchors(selWall, g, cellSize);
          if (a == null) continue;
          const cp = gapCenterHandlePos(a.center, perpWorld);
          if (Math.hypot(coords.worldX - cp.x, coords.worldY - cp.y) < hitR) {
            dragRef.current = { type: 'gapMove', wallId: selWall.id, gapId: g.id };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
        }
      }
      // Click on an existing opening → select it for editing, don't insert.
      const corridor = Math.max(cellSize * 0.4, 22 / zoom);
      const nearWall = nearestOpeningWall(coords.worldX, coords.worldY, corridor);
      if (nearWall != null) {
        const gapId = findGapOnWallAtPoint(nearWall, coords.worldX, coords.worldY, cellSize, corridor);
        if (gapId != null) {
          setSelectedWallId(nearWall.id);
          setSelectedGapId(gapId);
          setSelectedVertexIndex(null);
          return;
        }
      } else if (selectedWallIdRef.current != null || selectedGapRef.current != null) {
        // Off-wall click with a selection: click-away deselects (no Notice).
        setSelectedWallId(null);
        setSelectedGapId(null);
        setSelectedVertexIndex(null);
        return;
      }
      commitOpeningInsert(coords.worldX, coords.worldY, (e as MouseEvent).altKey === true);
      return;
    }

    // ---- EDIT MODE (not drawing) ----
    if (verts.length === 0) {
      const walls = getWalls();
      const hitR = Math.max(8 / zoom, 22 / zoom);

      // Handle hit-test on the selected wall first. Precedence (geometry F5):
      // gap-edge → gap-center → vertex → bow → centerline.
      const selWall = selectedWallIdRef.current != null ? walls.find(w => w.id === selectedWallIdRef.current) : null;
      if (selWall != null && zoom >= MIN_HANDLE_ZOOM) {
        const perpWorld = GAP_CENTER_PERP / zoom;
        // Gap edges first, then gap centers (edges win where they overlap).
        for (const g of selWall.gaps ?? []) {
          const a = gapHandleAnchors(selWall, g, cellSize);
          if (a == null) continue;
          if (Math.hypot(coords.worldX - a.lo.x, coords.worldY - a.lo.y) < hitR) {
            dragRef.current = { type: 'gapEdge', wallId: selWall.id, gapId: g.id, edge: 'lo' };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
          if (Math.hypot(coords.worldX - a.hi.x, coords.worldY - a.hi.y) < hitR) {
            dragRef.current = { type: 'gapEdge', wallId: selWall.id, gapId: g.id, edge: 'hi' };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
        }
        for (const g of selWall.gaps ?? []) {
          const a = gapHandleAnchors(selWall, g, cellSize);
          if (a == null) continue;
          const cp = gapCenterHandlePos(a.center, perpWorld);
          if (Math.hypot(coords.worldX - cp.x, coords.worldY - cp.y) < hitR) {
            dragRef.current = { type: 'gapMove', wallId: selWall.id, gapId: g.id };
            setSelectedGapId(g.id); setSelectedVertexIndex(null);
            beginDrag(selWall);
            return;
          }
        }
        for (let i = 0; i < selWall.vertices.length; i++) {
          const v = selWall.vertices[i];
          if (Math.hypot(coords.worldX - v.x, coords.worldY - v.y) < hitR) {
            dragRef.current = { type: 'vertex', wallId: selWall.id, index: i };
            setSelectedGapId(null);
            beginDrag(selWall);
            return;
          }
        }
        for (let i = 0; i < segmentCount(selWall); i++) {
          const m = segmentMidpoint(selWall, i);
          if (Math.hypot(coords.worldX - m.x, coords.worldY - m.y) < hitR) {
            dragRef.current = { type: 'bow', wallId: selWall.id, index: i };
            setSelectedGapId(null);
            beginDrag(selWall);
            return;
          }
        }
      }

      // Centerline hit-test across all walls (nearest within corridor wins).
      // A cheap bbox pre-filter skips the expensive polyline flatten for any
      // wall whose bounds (+ corridor margin) can't contain the pointer.
      const corridor = Math.max(cellSize * 0.4, 22 / zoom);
      let bestWall: WallPath | null = null;
      let bestDist = Infinity;
      for (const w of walls) {
        const bb = wallBounds(w);
        if (coords.worldX < bb.minX - corridor || coords.worldX > bb.maxX + corridor ||
            coords.worldY < bb.minY - corridor || coords.worldY > bb.maxY + corridor) {
          continue;
        }
        const d = distanceToWall(w, coords.worldX, coords.worldY);
        if (d < bestDist) { bestDist = d; bestWall = w; }
      }
      if (bestWall != null && bestDist < corridor) {
        setSelectedWallId(bestWall.id);
        setSelectedVertexIndex(null);
        setSelectedGapId(null);
        return;
      }

      // Empty space: deselect first; a second empty click starts drawing.
      if (selectedWallIdRef.current != null) {
        setSelectedWallId(null);
        setSelectedVertexIndex(null);
        setSelectedGapId(null);
        return;
      }

      if (selectedEntry == null || !isStripAsset) return;
      // fall through to start drawing
    }

    // ---- DRAW MODE ----
    if (selectedEntry == null || !isStripAsset) return;

    if (verts.length >= 3) {
      const d = Math.hypot(coords.worldX - verts[0].x, coords.worldY - verts[0].y);
      if (d < snapDistance) {
        commitWall(true);
        return;
      }
    }

    const constrained = angleSnap(coords.worldX, coords.worldY, (e as MouseEvent).altKey === true);
    const snapped = snapWorld(constrained.x, constrained.y);
    createOverlay();
    const next = [...verts, { x: snapped.x, y: snapped.y }];
    setVertices(next);
    cursorRef.current = snapped;
    verticesRef.current = next;
    pressActiveRef.current = next.length >= 2;
    drawPreview();
  }, [currentTool, mapData, getWalls, selectedEntry, isStripAsset, isOpeningMode, commitOpeningInsert, nearestOpeningWall, getClientCoords, screenToWorld, cellSize, snapDistance, snapWorld, angleSnap, createOverlay, commitWall, drawPreview, beginDrag]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = mapData?.viewState?.zoom ?? 1;

    // ---- EDIT DRAG (checked before the opening ghost: opening mode's gap
    // move/resize drags resolve through this same path) ----
    // Mutate the working copy only — mapData stays untouched for the whole gesture
    // (no per-frame state write, no static-cache bust, no context cascade).
    const drag = dragRef.current;
    if (drag == null && isOpeningMode) {
      // ---- OPENING MODE hover ghost + gap handles on the selected wall ----
      createOverlay();
      drawOpeningGhost(coords.worldX, coords.worldY);
      if (selectedWallIdRef.current != null) drawEditHandles({ append: true });
      return;
    }
    if (drag != null) {
      const base = dragWorkingRef.current;
      if (base == null) return;
      dragMovedRef.current = true;
      if (drag.type === 'gapMove' || drag.type === 'gapEdge') {
        const gaps = base.gaps;
        if (gaps == null) return;
        const gi = gaps.findIndex(g => g.id === drag.gapId);
        if (gi < 0) return;
        const nextGap = drag.type === 'gapMove'
          ? resolveGapMove(base, gaps[gi], coords.worldX, coords.worldY, cellSize)
          : resolveGapEdgeResize(base, gaps[gi], drag.edge, coords.worldX, coords.worldY, cellSize);
        const nextGaps = gaps.slice();
        nextGaps[gi] = nextGap;
        dragWorkingRef.current = { ...base, gaps: nextGaps };
      } else if (drag.type === 'vertex') {
        const snapped = snapWorld(coords.worldX, coords.worldY);
        const nextVerts = base.vertices.slice();
        nextVerts[drag.index] = { ...nextVerts[drag.index], x: snapped.x, y: snapped.y };
        dragWorkingRef.current = { ...base, vertices: nextVerts };
      } else {
        // Bow: arc passes through the cursor; near the chord straightens.
        const a = base.vertices[drag.index];
        const b = base.vertices[(drag.index + 1) % base.vertices.length];
        const mx = coords.worldX;
        const my = coords.worldY;
        const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
        let chordDist = Infinity;
        if (len2 > 0) {
          const t = Math.max(0, Math.min(1, ((mx - a.x) * (b.x - a.x) + (my - a.y) * (b.y - a.y)) / len2));
          chordDist = Math.hypot(mx - (a.x + t * (b.x - a.x)), my - (a.y + t * (b.y - a.y)));
        }
        const nextVerts = base.vertices.slice();
        const va = { ...a };
        if (chordDist > 4 / zoom) {
          va.arc = [2 * mx - (a.x + b.x) / 2, 2 * my - (a.y + b.y) / 2];
        } else {
          delete va.arc;
        }
        nextVerts[drag.index] = va;
        dragWorkingRef.current = { ...base, vertices: nextVerts };
      }
      drawEditHandles();
      return;
    }

    if (verticesRef.current.length === 0) return;

    const verts = verticesRef.current;

    // ---- DRAW: press-drag bows the just-placed segment ----
    if (pressActiveRef.current && verts.length >= 2) {
      const p0 = verts[verts.length - 2];
      const p1 = verts[verts.length - 1];
      const mx = coords.worldX;
      const my = coords.worldY;
      const chordLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      let chordDist = Math.hypot(mx - p1.x, my - p1.y);
      if (chordLen > 0) {
        const t = ((mx - p0.x) * (p1.x - p0.x) + (my - p0.y) * (p1.y - p0.y)) / (chordLen * chordLen);
        const ct = Math.max(0, Math.min(1, t));
        chordDist = Math.hypot(mx - (p0.x + ct * (p1.x - p0.x)), my - (p0.y + ct * (p1.y - p0.y)));
      }
      const next = verts.slice();
      const last = { ...next[next.length - 2] };
      if (chordDist > 6 / zoom) {
        last.arc = [2 * mx - (p0.x + p1.x) / 2, 2 * my - (p0.y + p1.y) / 2];
      } else {
        delete last.arc;
      }
      next[next.length - 2] = last;
      verticesRef.current = next;
      setVertices(next);
      drawPreview();
      return;
    }

    const constrained = angleSnap(coords.worldX, coords.worldY, (e as MouseEvent).altKey === true);
    cursorRef.current = snapWorld(constrained.x, constrained.y);
    drawPreview();
  }, [currentTool, mapData, cellSize, getClientCoords, screenToWorld, snapWorld, angleSnap, drawEditHandles, drawPreview, isOpeningMode, createOverlay, drawOpeningGhost]);

  const handlePointerUp = useCallback((_e: MouseEvent | TouchEvent | PointerEvent) => {
    pressActiveRef.current = false;
    const drag = dragRef.current;
    if (drag != null) {
      dragRef.current = null;
      const working = dragWorkingRef.current;
      dragWorkingRef.current = null;
      if (dragMovedRef.current && working != null) {
        // Commit the working copy as ONE history entry — but skip a sub-epsilon
        // twitch (no geometry change ⇒ no history write, no re-render).
        // Gap drags mutate `gaps` (not vertices), so wallGeometryChanged can't
        // see them — always commit a moved gap drag (suppress=false, geometry F2).
        const isGapDrag = drag.type === 'gapMove' || drag.type === 'gapEdge';
        const orig = getWalls().find(w => w.id === working.id);
        if (isGapDrag || orig == null || wallGeometryChanged(orig, working)) {
          onWallPathsChange(getWalls().map(w => (w.id === working.id ? working : w)), false);
        }
      } else if (drag.type === 'vertex') {
        // Click without movement selects the vertex (Delete then removes it).
        setSelectedVertexIndex(drag.index);
      }
      dragMovedRef.current = false;
      onDragStateChange?.(null);
      drawEditHandles();
    }
  }, [getWalls, onWallPathsChange, onDragStateChange, drawEditHandles]);

  const handleDoubleClick = useCallback((e: MouseEvent) => {
    if (currentTool !== 'wall') return;

    // Drawing: double-click commits.
    if (verticesRef.current.length >= 2) {
      commitWall(false);
      return;
    }

    // Edit: double-click a segment of the selected wall inserts a vertex.
    const selId = selectedWallIdRef.current;
    if (selId == null || mapData == null) return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const wall = getWalls().find(w => w.id === selId);
    if (wall == null) return;
    const zoom = mapData.viewState?.zoom ?? 1;
    const corridor = Math.max(cellSize * 0.4, 22 / zoom);
    if (distanceToWall(wall, coords.worldX, coords.worldY) > corridor) return;

    // Nearest segment by chord projection
    let bestSeg = -1;
    let bestDist = Infinity;
    for (let i = 0; i < segmentCount(wall); i++) {
      const a = wall.vertices[i];
      const b = wall.vertices[(i + 1) % wall.vertices.length];
      const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
      let t = 0;
      if (len2 > 0) {
        t = Math.max(0, Math.min(1, ((coords.worldX - a.x) * (b.x - a.x) + (coords.worldY - a.y) * (b.y - a.y)) / len2));
      }
      const d = Math.hypot(coords.worldX - (a.x + t * (b.x - a.x)), coords.worldY - (a.y + t * (b.y - a.y)));
      if (d < bestDist) { bestDist = d; bestSeg = i; }
    }
    if (bestSeg < 0) return;

    const snapped = snapWorld(coords.worldX, coords.worldY);
    // If the snapped point lands inside an existing gap's span on this
    // segment, snap it to the gap's nearer edge instead — invariant 3 forbids
    // straddling a door, and splitting through its middle would otherwise
    // silently shift it rather than preserve it (§2.3 insert row).
    const insertPoint = wall.gaps != null && wall.gaps.length > 0
      ? snapInsertPointOutsideGaps(wall, bestSeg, snapped.x, snapped.y, cellSize)
      : snapped;
    updateWall(selId, w => {
      const nextVerts = w.vertices.slice();
      // Inserting flattens the split segment (its arc no longer fits both halves).
      const va = { ...nextVerts[bestSeg] };
      delete va.arc;
      nextVerts[bestSeg] = va;
      nextVerts.splice(bestSeg + 1, 0, { x: insertPoint.x, y: insertPoint.y });
      const next = { ...w, vertices: nextVerts };
      // Re-home gaps via reprojectGap: the insert flattens the split segment's
      // arc, so an analytic t/p split would slide the door (geometry F4, §2.3).
      if (w.gaps != null && w.gaps.length > 0) {
        next.gaps = remapGapsAfterInsertVertex(w.gaps, w, next, cellSize);
      }
      return next;
    }, false);
    setSelectedVertexIndex(bestSeg + 1);
    setSelectedGapId(null);
  }, [currentTool, mapData, getWalls, getClientCoords, screenToWorld, cellSize, snapWorld, updateWall, commitWall]);

  // ---- Keyboard ----
  useEffect(() => {
    if (!isWallTool) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      // Bare-threshold placement: Escape disarms the mode — but a selected
      // opening/wall deselects first (the Editing branch below), so Escape
      // steps out gradually: gap → wall → disarm.
      if (isBareThreshold && e.key === 'Escape' && verticesRef.current.length === 0
          && selectedWallIdRef.current == null) {
        e.preventDefault();
        onDisarmOpening?.();
        return;
      }

      if (verticesRef.current.length > 0) {
        // Drawing
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelDrawing();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commitWall(false);
        } else if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          const verts = verticesRef.current;
          if (verts.length <= 1) {
            cancelDrawing();
          } else {
            const next = verts.slice(0, -1);
            setVertices(next);
            verticesRef.current = next;
            drawPreview();
          }
        }
        return;
      }

      // Editing
      const selId = selectedWallIdRef.current;
      if (selId == null) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        // A selected gap deselects first (keeps the wall selected); a second
        // Escape then deselects the wall.
        if (selectedGapRef.current != null) {
          setSelectedGapId(null);
        } else {
          setSelectedWallId(null);
          setSelectedVertexIndex(null);
        }
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        // Opening mode edits doors, not walls: without a selected gap, Delete
        // is a no-op (deleting a whole wall from portal placement would be a
        // destructive surprise).
        if (isOpeningMode && selectedGapRef.current == null) return;
        e.preventDefault();
        const gapId = selectedGapRef.current;
        const vIdx = selectedVertexRef.current;
        const wall = getWalls().find(w => w.id === selId);
        if (wall == null) return;
        // Delete precedence: selected gap → vertex → whole wall.
        if (gapId != null) {
          updateWall(selId, w => ({ ...w, gaps: (w.gaps ?? []).filter(g => g.id !== gapId) }), false);
          setSelectedGapId(null);
        } else if (vIdx != null && wall.vertices.length > 2) {
          updateWall(selId, w => {
            const nextVerts = w.vertices.slice();
            nextVerts.splice(vIdx, 1);
            const next = { ...w, vertices: nextVerts };
            // Merging two segments can drop a corner between two doors — remap
            // via reprojectGap + overlap resolver (§2.3 delete row, integrity F3).
            if (w.gaps != null && w.gaps.length > 0) {
              next.gaps = remapGapsAfterDeleteVertex(w.gaps, w, next, cellSize);
            }
            return next;
          }, false);
          setSelectedVertexIndex(null);
        } else {
          onWallPathsChange(getWalls().filter(w => w.id !== selId), false);
          setSelectedWallId(null);
          setSelectedVertexIndex(null);
          setSelectedGapId(null);
        }
      }
    };
    activeDocument.addEventListener('keydown', onKeyDown);
    return () => activeDocument.removeEventListener('keydown', onKeyDown);
  }, [isWallTool, getWalls, updateWall, onWallPathsChange, cancelDrawing, commitWall, drawPreview, cellSize, isBareThreshold, isOpeningMode, onDisarmOpening]);

  // Reset transient state when the tool changes away.
  useEffect(() => {
    if (!isWallTool) {
      if (verticesRef.current.length > 0) cancelDrawing();
      setSelectedWallId(null);
      setSelectedVertexIndex(null);
      setSelectedGapId(null);
      removeOverlay();
    }
  }, [isWallTool, cancelDrawing, removeOverlay]);

  // Opening-mode boundary: crossing into or out of portal placement clears any
  // wall/gap selection. A gap auto-selected at placement must not survive an
  // exit taken by arming a different tile — the footer would show no door
  // controls while Delete stayed silently armed for the hidden selection.
  const prevOpeningModeRef = useRef(isOpeningMode);
  useEffect(() => {
    if (prevOpeningModeRef.current === isOpeningMode) return;
    prevOpeningModeRef.current = isOpeningMode;
    setSelectedWallId(null);
    setSelectedVertexIndex(null);
    setSelectedGapId(null);
  }, [isOpeningMode]);
  useEffect(() => () => removeOverlay(), [removeOverlay]);

  useLayerHandlers('wall', { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick });

  // ---- Publish the control surface to the drawer footer ----
  // WallLayer owns the wall-tool state but renders no chrome; the footer draws
  // the controls from this snapshot. Deps are PRIMITIVES ONLY (+ the stable
  // surfaceActions) so publishing — which sets state in the parent and re-renders
  // this layer — can't re-trigger itself into an infinite loop.
  const hasAsset = selectedEntry != null && isStripAsset;
  const assetForm: 'strip' | 'opening' = isOpeningMode ? 'opening' : 'strip';
  const assetKind: 'wall' | 'path' = selectedMeta?.ddSourceType === 'paths' ? 'path' : 'wall';
  const hasSelectedWall = selectedWall != null;
  const editVertexCount = selectedWall?.vertices.length ?? 0;
  const editWidthScale = selectedWall?.widthScale ?? 1;
  const editFlip = selectedWall?.flip === true;
  // Selected-gap footer state (primitives only, per the loop-safety note).
  const hasSelectedGap = selectedGap != null;
  const gapWidthCells = selectedGap?.widthCells ?? 1;
  const gapBound = selectedGap?.tile != null;
  const gapFlip = selectedGap?.tile?.flip === true;
  useEffect(() => {
    if (onSurfaceChange == null) return;
    if (!isWallTool) { onSurfaceChange(null); return; }
    const inEdit = !isDrawing && hasSelectedWall;
    onSurfaceChange({
      mode: inEdit ? 'edit' : 'draw',
      hasAsset,
      assetForm,
      assetKind,
      isDrawing,
      vertexCount: vertices.length,
      snapEnabled,
      angleSnapEnabled,
      canFinish: vertices.length >= 2,
      toggleSnap: surfaceActions.toggleSnap,
      toggleAngleSnap: surfaceActions.toggleAngleSnap,
      undoLastPoint: surfaceActions.undoLastPoint,
      cancelDrawing: surfaceActions.cancelDrawing,
      finishWall: surfaceActions.finishWall,
      edit: inEdit
        ? {
            vertexCount: editVertexCount,
            widthScale: editWidthScale,
            flip: editFlip,
            setWidth: surfaceActions.setWidth,
            toggleFlip: surfaceActions.toggleFlip,
            deleteWall: surfaceActions.deleteWall,
            deselect: surfaceActions.deselect,
            gap: inEdit && hasSelectedGap
              ? {
                  widthCells: gapWidthCells,
                  flip: gapFlip,
                  bound: gapBound,
                  setWidth: surfaceActions.setGapWidth,
                  toggleFlip: surfaceActions.toggleGapFlip,
                  unbind: surfaceActions.unbindGap,
                  deleteGap: surfaceActions.deleteGap,
                  deselectGap: surfaceActions.deselectGap,
                }
              : null,
          }
        : null,
    });
  }, [
    onSurfaceChange, isWallTool, isDrawing, vertices.length, snapEnabled, angleSnapEnabled,
    hasAsset, assetForm, assetKind, hasSelectedWall, editVertexCount, editWidthScale, editFlip,
    hasSelectedGap, gapWidthCells, gapBound, gapFlip,
    surfaceActions,
  ]);
  // Clear the surface on unmount so a stale footer can't linger.
  useEffect(() => () => onSurfaceChange?.(null), [onSurfaceChange]);

  // No chrome: the tool's controls live in the drawer footer, its handles on
  // the canvas overlay. Nothing to render here.
  return null;
};

export { WallLayer };
