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

import type { WallPath, WallVertex } from '#types/core/wallpath.types';
import type { VNode } from 'preact';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { renderWallPaths, flattenWallPath, quadPoint } from '../../geometry/renderers/wallPathRenderer';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { getTileMetadataForRender } from '../../persistence/tileMetadata';
import { getCachedImage, preloadImage } from '../../assets/imageOperations';
import { createWallPath } from '../../drawing/wallPathOperations';
import { useApp } from '../../context/AppContext';
import { Icon } from '../shared/Icon';
import { CornerBrackets } from '../shared/CornerBrackets';

export interface WallLayerProps {
  currentTool: string;
  selectedTilesetId: string | null;
  selectedTileId: string | null;
  onWallPathsChange: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
}

/** Hide edit handles below this zoom — too small to grab, pure clutter. */
const MIN_HANDLE_ZOOM = 0.3;

type DragState =
  | { type: 'vertex'; wallId: string; index: number }
  | { type: 'bow'; wallId: string; index: number };

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

/** Min distance from a point to a wall's flattened centerline. */
function distanceToWall(wall: WallPath, wx: number, wy: number): number {
  const flat = flattenWallPath(wall);
  let best = Infinity;
  const pts = flat.points;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const len2 = (x1 - x0) ** 2 + (y1 - y0) ** 2;
    let t = 0;
    if (len2 > 0) {
      t = Math.max(0, Math.min(1, ((wx - x0) * (x1 - x0) + (wy - y0) * (y1 - y0)) / len2));
    }
    const d = Math.hypot(wx - (x0 + t * (x1 - x0)), wy - (y0 + t * (y1 - y0)));
    if (d < best) best = d;
  }
  return best;
}

const WallLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  onWallPathsChange,
}: WallLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

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
  const selectedWallIdRef = useRef(selectedWallId);
  selectedWallIdRef.current = selectedWallId;
  const selectedVertexRef = useRef(selectedVertexIndex);
  selectedVertexRef.current = selectedVertexIndex;
  const dragRef = useRef<DragState | null>(null);
  const dragMovedRef = useRef(false);

  const isWallTool = currentTool === 'wall';
  const isDrawing = vertices.length > 0;
  const cellSize = geometry != null
    ? (geometry.type === 'grid' ? (geometry as unknown as { cellSize: number }).cellSize : (geometry as unknown as { hexSize: number }).hexSize)
    : 32;
  const snapDistance = cellSize * 0.5;

  const getWalls = useCallback((): WallPath[] => {
    if (mapData == null) return [];
    return getActiveLayer(mapData).wallPaths ?? [];
  }, [mapData]);

  const selectedWall = selectedWallId != null
    ? getWalls().find(w => w.id === selectedWallId) ?? null
    : null;

  // ---- Asset resolution for drawing ----
  const selectedEntry = (() => {
    if (selectedTilesetId == null || selectedTileId == null || mapData?.tilesets == null) return null;
    const ts = mapData.tilesets.find(t => t.id === selectedTilesetId);
    return ts?.tiles.find(t => t.id === selectedTileId) ?? null;
  })();
  const selectedMeta = selectedEntry != null ? getTileMetadataForRender()[selectedEntry.vaultPath] : undefined;
  const isStripAsset = selectedMeta?.ddSourceType === 'walls' || selectedMeta?.ddSourceType === 'paths';

  useEffect(() => {
    if (selectedEntry?.vaultPath != null && isStripAsset) {
      void preloadImage(app, selectedEntry.vaultPath);
      const cap = selectedMeta?.wallEndCapPath;
      if (cap != null) void preloadImage(app, cap);
    }
  }, [app, selectedEntry?.vaultPath, isStripAsset, selectedMeta?.wallEndCapPath]);

  // ---- Snapping ----
  const snapWorld = useCallback((wx: number, wy: number): { x: number; y: number } => {
    if (!snapRef.current || geometry == null) return { x: wx, y: wy };
    if (geometry.type === 'grid') {
      const cs = (geometry as unknown as { cellSize: number }).cellSize;
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
    const overlay = activeDocument.createElement('canvas');
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
  const drawEditHandles = useCallback(() => {
    const overlay = overlayRef.current;
    if (overlay == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const wall = selectedWallIdRef.current != null
      ? (mapData != null ? (getActiveLayer(mapData).wallPaths ?? []).find(w => w.id === selectedWallIdRef.current) : null)
      : null;
    if (wall == null) return;
    const view = getViewTransform(overlay);
    if (view == null) return;
    const { offsetX, offsetY, zoom } = view;

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

    ctx.restore();
  }, [mapData, getViewTransform]);

  // Keep handles in sync with selection, data, and view changes.
  useEffect(() => {
    if (!isWallTool || isDrawing) return;
    if (selectedWallId == null) {
      if (!isDrawing) removeOverlay();
      return;
    }
    createOverlay();
    drawEditHandles();
  }, [isWallTool, isDrawing, selectedWallId, selectedVertexIndex, mapData, drawEditHandles, createOverlay, removeOverlay]);

  // ---- Wall mutation helpers ----
  const updateWall = useCallback((wallId: string, mutate: (w: WallPath) => WallPath, suppress: boolean) => {
    const walls = getWalls();
    const idx = walls.findIndex(w => w.id === wallId);
    if (idx < 0) return;
    const next = walls.slice();
    next[idx] = mutate(walls[idx]);
    onWallPathsChange(next, suppress);
  }, [getWalls, onWallPathsChange]);

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

  // ---- Pointer handlers ----
  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = mapData?.viewState?.zoom ?? 1;
    const verts = verticesRef.current;

    // ---- EDIT MODE (not drawing) ----
    if (verts.length === 0) {
      const walls = getWalls();
      const hitR = Math.max(8 / zoom, 22 / zoom);

      // Handle hit-test on the selected wall first
      const selWall = selectedWallIdRef.current != null ? walls.find(w => w.id === selectedWallIdRef.current) : null;
      if (selWall != null && zoom >= MIN_HANDLE_ZOOM) {
        for (let i = 0; i < selWall.vertices.length; i++) {
          const v = selWall.vertices[i];
          if (Math.hypot(coords.worldX - v.x, coords.worldY - v.y) < hitR) {
            dragRef.current = { type: 'vertex', wallId: selWall.id, index: i };
            dragMovedRef.current = false;
            return;
          }
        }
        for (let i = 0; i < segmentCount(selWall); i++) {
          const m = segmentMidpoint(selWall, i);
          if (Math.hypot(coords.worldX - m.x, coords.worldY - m.y) < hitR) {
            dragRef.current = { type: 'bow', wallId: selWall.id, index: i };
            dragMovedRef.current = false;
            return;
          }
        }
      }

      // Centerline hit-test across all walls (nearest within corridor wins)
      let bestWall: WallPath | null = null;
      let bestDist = Infinity;
      for (const w of walls) {
        const d = distanceToWall(w, coords.worldX, coords.worldY);
        if (d < bestDist) { bestDist = d; bestWall = w; }
      }
      const corridor = Math.max(cellSize * 0.4, 22 / zoom);
      if (bestWall != null && bestDist < corridor) {
        setSelectedWallId(bestWall.id);
        setSelectedVertexIndex(null);
        return;
      }

      // Empty space: deselect first; a second empty click starts drawing.
      if (selectedWallIdRef.current != null) {
        setSelectedWallId(null);
        setSelectedVertexIndex(null);
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
  }, [currentTool, mapData, getWalls, selectedEntry, isStripAsset, getClientCoords, screenToWorld, cellSize, snapDistance, snapWorld, angleSnap, createOverlay, commitWall, drawPreview]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = mapData?.viewState?.zoom ?? 1;

    // ---- EDIT DRAG ----
    const drag = dragRef.current;
    if (drag != null) {
      dragMovedRef.current = true;
      if (drag.type === 'vertex') {
        const snapped = snapWorld(coords.worldX, coords.worldY);
        updateWall(drag.wallId, w => {
          const nextVerts = w.vertices.slice();
          nextVerts[drag.index] = { ...nextVerts[drag.index], x: snapped.x, y: snapped.y };
          return { ...w, vertices: nextVerts };
        }, true);
      } else {
        // Bow: arc passes through the cursor; near the chord straightens.
        updateWall(drag.wallId, w => {
          const a = w.vertices[drag.index];
          const b = w.vertices[(drag.index + 1) % w.vertices.length];
          const mx = coords.worldX;
          const my = coords.worldY;
          const len2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
          let chordDist = Infinity;
          if (len2 > 0) {
            const t = Math.max(0, Math.min(1, ((mx - a.x) * (b.x - a.x) + (my - a.y) * (b.y - a.y)) / len2));
            chordDist = Math.hypot(mx - (a.x + t * (b.x - a.x)), my - (a.y + t * (b.y - a.y)));
          }
          const nextVerts = w.vertices.slice();
          const va = { ...a };
          if (chordDist > 4 / zoom) {
            va.arc = [2 * mx - (a.x + b.x) / 2, 2 * my - (a.y + b.y) / 2];
          } else {
            delete va.arc;
          }
          nextVerts[drag.index] = va;
          return { ...w, vertices: nextVerts };
        }, true);
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
  }, [currentTool, mapData, getClientCoords, screenToWorld, snapWorld, angleSnap, updateWall, drawEditHandles, drawPreview]);

  const handlePointerUp = useCallback((_e: MouseEvent | TouchEvent | PointerEvent) => {
    pressActiveRef.current = false;
    const drag = dragRef.current;
    if (drag != null) {
      dragRef.current = null;
      if (dragMovedRef.current) {
        // Commit the gesture as ONE history entry.
        onWallPathsChange(getWalls(), false);
      } else if (drag.type === 'vertex') {
        // Click without movement selects the vertex (Delete then removes it).
        setSelectedVertexIndex(drag.index);
      }
      dragMovedRef.current = false;
      drawEditHandles();
    }
  }, [getWalls, onWallPathsChange, drawEditHandles]);

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
    updateWall(selId, w => {
      const nextVerts = w.vertices.slice();
      // Inserting flattens the split segment (its arc no longer fits both halves).
      const va = { ...nextVerts[bestSeg] };
      delete va.arc;
      nextVerts[bestSeg] = va;
      nextVerts.splice(bestSeg + 1, 0, { x: snapped.x, y: snapped.y });
      return { ...w, vertices: nextVerts };
    }, false);
    setSelectedVertexIndex(bestSeg + 1);
  }, [currentTool, mapData, getWalls, getClientCoords, screenToWorld, cellSize, snapWorld, updateWall, commitWall]);

  // ---- Keyboard ----
  useEffect(() => {
    if (!isWallTool) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

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
        setSelectedWallId(null);
        setSelectedVertexIndex(null);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault();
        const vIdx = selectedVertexRef.current;
        const wall = getWalls().find(w => w.id === selId);
        if (wall == null) return;
        if (vIdx != null && wall.vertices.length > 2) {
          updateWall(selId, w => {
            const nextVerts = w.vertices.slice();
            nextVerts.splice(vIdx, 1);
            return { ...w, vertices: nextVerts };
          }, false);
          setSelectedVertexIndex(null);
        } else {
          onWallPathsChange(getWalls().filter(w => w.id !== selId), false);
          setSelectedWallId(null);
          setSelectedVertexIndex(null);
        }
      }
    };
    activeDocument.addEventListener('keydown', onKeyDown);
    return () => activeDocument.removeEventListener('keydown', onKeyDown);
  }, [isWallTool, getWalls, updateWall, onWallPathsChange, cancelDrawing, commitWall, drawPreview]);

  // Reset transient state when the tool changes away.
  useEffect(() => {
    if (!isWallTool) {
      if (verticesRef.current.length > 0) cancelDrawing();
      setSelectedWallId(null);
      setSelectedVertexIndex(null);
      removeOverlay();
    }
  }, [isWallTool, cancelDrawing, removeOverlay]);
  useEffect(() => () => removeOverlay(), [removeOverlay]);

  // Register event handlers (ref + proxy to avoid re-registration churn)
  const handlersRef = useRef<Record<string, unknown> | null>(null);
  handlersRef.current = { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick };

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return handlersRef.current?.[prop];
      },
    });
    registerHandlers('wall', proxy);
    return () => unregisterHandlers('wall');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!isWallTool) return null;

  // ---- Floating bar ----
  const barContent = (() => {
    if (isDrawing || selectedWall == null) {
      // Draw mode (or idle with nothing selected)
      if (selectedEntry == null || !isStripAsset) {
        return (
          <span className="windrose-wall-bar-hint">
            <Icon icon="lucide-brick-wall" size={14} />
            Pick a wall or path in the tile browser's Walls tab — or click an existing wall to edit it
          </span>
        );
      }
      return (
        <>
          <span className="windrose-wall-bar-name" title={selectedEntry.filename}>
            <Icon icon={selectedMeta?.ddSourceType === 'paths' ? 'lucide-route' : 'lucide-brick-wall'} size={14} />
            {selectedEntry.filename.replace(/\.(webp|png)$/i, '')}
          </span>
          <span className="windrose-wall-bar-count">{vertices.length} pts</span>
          <button
            className={`windrose-tb-iconbtn ${snapEnabled ? 'active' : ''}`}
            title={snapEnabled ? 'Grid snap: ON' : 'Grid snap: OFF'}
            onClick={() => setSnapEnabled(!snapEnabled)}
          >
            <Icon icon="lucide-magnet" size={14} />
          </button>
          <button
            className={`windrose-tb-iconbtn ${angleSnapEnabled ? 'active' : ''}`}
            title={angleSnapEnabled ? '45° angle snap: ON (or hold Alt)' : '45° angle snap: OFF (or hold Alt)'}
            onClick={() => setAngleSnapEnabled(!angleSnapEnabled)}
          >
            <Icon icon="lucide-triangle-right" size={14} />
          </button>
          <button
            className="windrose-tb-iconbtn"
            title="Undo last point (Backspace)"
            disabled={!isDrawing}
            onClick={() => {
              const verts = verticesRef.current;
              if (verts.length <= 1) { cancelDrawing(); return; }
              const next = verts.slice(0, -1);
              setVertices(next);
              verticesRef.current = next;
              drawPreview();
            }}
          >
            <Icon icon="lucide-undo-2" size={14} />
          </button>
          <button
            className="windrose-tb-iconbtn"
            title="Cancel (Escape)"
            disabled={!isDrawing}
            onClick={cancelDrawing}
          >
            <Icon icon="lucide-x" size={14} />
          </button>
          <button
            className="windrose-tb-iconbtn active"
            title="Finish wall (Enter or double-click)"
            disabled={vertices.length < 2}
            onClick={() => commitWall(false)}
          >
            <Icon icon="lucide-check" size={14} />
          </button>
        </>
      );
    }

    // Edit mode — a wall is selected
    return (
      <>
        <span className="windrose-wall-bar-name" title={selectedWall.tileId}>
          <Icon icon={selectedWall.kind === 'path' ? 'lucide-route' : 'lucide-brick-wall'} size={14} />
          {selectedWall.tileId}
        </span>
        <span className="windrose-wall-bar-count">{selectedWall.vertices.length} pts</span>
        <span className="label" style={{ fontSize: 11 }}>Width</span>
        <input
          className="windrose-tb-range"
          type="range"
          min="0.25"
          max="3"
          step="0.25"
          value={selectedWall.widthScale}
          onInput={(e: Event) => {
            const v = parseFloat((e.target as HTMLInputElement).value);
            updateWall(selectedWall.id, w => ({ ...w, widthScale: v }), false);
          }}
          style={{ width: 80 }}
        />
        <span className="windrose-wall-bar-count">{selectedWall.widthScale}×</span>
        <button
          className={`windrose-tb-iconbtn ${selectedWall.flip === true ? 'active' : ''}`}
          title="Flip texture direction"
          onClick={() => updateWall(selectedWall.id, w => ({ ...w, flip: w.flip !== true }), false)}
        >
          <Icon icon="lucide-flip-vertical" size={14} />
        </button>
        <button
          className="windrose-tb-iconbtn"
          title="Delete wall (Delete)"
          onClick={() => {
            onWallPathsChange(getWalls().filter(w => w.id !== selectedWall.id), false);
            setSelectedWallId(null);
            setSelectedVertexIndex(null);
          }}
        >
          <Icon icon="lucide-trash-2" size={14} />
        </button>
        <button
          className="windrose-tb-iconbtn"
          title="Deselect (Escape)"
          onClick={() => { setSelectedWallId(null); setSelectedVertexIndex(null); }}
        >
          <Icon icon="lucide-x" size={14} />
        </button>
      </>
    );
  })();

  return (
    <div className="windrose-floating-bar windrose-wall-bar">
      <CornerBrackets classPrefix="windrose-wallbar-bracket" variant="compact" filterId="wallbar-bracket" />
      {barContent}
    </div>
  );
};

export { WallLayer };
