/**
 * WallLayer.tsx
 *
 * Wall/path drawing tool: click-click-click polyline creation with a live
 * textured preview (the actual strip renderer draws the in-progress wall on
 * an overlay canvas). Finish with double-click/Enter/Done; close a loop by
 * clicking the first vertex; Escape cancels; Backspace removes the last
 * vertex. Curving (arc bow handles) arrives with the edit phase.
 */

import type { WallPath, WallVertex } from '#types/core/wallpath.types';
import type { VNode } from 'preact';

import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { useMapState } from '../../context/MapContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { calculateViewportOffset } from '../../geometry/core/BaseGeometry';
import { renderWallPaths } from '../../geometry/renderers/wallPathRenderer';
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

const WallLayer = ({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  onWallPathsChange,
}: WallLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  // Committed vertices of the in-progress wall (state: drives the floating bar).
  const [vertices, setVertices] = useState<WallVertex[]>([]);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const verticesRef = useRef<WallVertex[]>(vertices);
  verticesRef.current = vertices;
  const snapRef = useRef(snapEnabled);
  snapRef.current = snapEnabled;
  const cursorRef = useRef<{ x: number; y: number } | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  // Press-drag bowing: while the pointer is down after placing a vertex,
  // dragging bows the segment that ends at that vertex.
  const pressActiveRef = useRef(false);
  const [angleSnapEnabled, setAngleSnapEnabled] = useState(false);
  const angleSnapRef = useRef(angleSnapEnabled);
  angleSnapRef.current = angleSnapEnabled;

  const isWallTool = currentTool === 'wall';
  const cellSize = geometry != null
    ? (geometry.type === 'grid' ? (geometry as unknown as { cellSize: number }).cellSize : (geometry as unknown as { hexSize: number }).hexSize)
    : 32;
  const snapDistance = cellSize * 0.5;

  // Resolve the armed strip asset (and make sure its image is decoding).
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

  /** Snap a world coordinate to the grid (intersections on grid, centers on hex). */
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

  /** Constrain a point to 45° rays from the previous vertex (Alt or bar toggle). */
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

  const createOverlay = useCallback((): HTMLCanvasElement | null => {
    if (overlayRef.current != null) return overlayRef.current;
    const mainCanvas = canvasRef.current;
    if (!mainCanvas || !mainCanvas.parentElement) return null;
    const overlay = document.createElement('canvas');
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

  /** Redraw the in-progress wall: textured strip preview + vertex affordances. */
  const drawPreview = useCallback(() => {
    const overlay = overlayRef.current;
    if (overlay == null || mapData == null || geometry == null) return;
    const ctx = overlay.getContext('2d');
    if (ctx == null) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    const verts = verticesRef.current;
    if (verts.length === 0) return;

    const { zoom, center } = mapData.viewState ?? { zoom: 1, center: { x: 0, y: 0 } };
    const { offsetX, offsetY } = calculateViewportOffset(
      geometry, center, { width: overlay.width, height: overlay.height }, zoom,
    );
    const viewState = { x: offsetX, y: offsetY, zoom };

    // Textured preview of the wall as drawn so far + rubber segment to cursor.
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

    // Affordances in world space (sizes divided by zoom for constant screen size).
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    // Centerline hint (visible even before the texture decodes)
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

    // Vertex squares
    const vs = 4 / zoom;
    for (let i = 0; i < verts.length; i++) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1 / zoom;
      ctx.fillRect(verts[i].x - vs, verts[i].y - vs, vs * 2, vs * 2);
      ctx.strokeRect(verts[i].x - vs, verts[i].y - vs, vs * 2, vs * 2);
    }

    // Close-loop ring when the cursor is near the first vertex
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
  }, [mapData, geometry, selectedEntry, selectedTilesetId, selectedTileId, cellSize, snapDistance]);

  const cancelDrawing = useCallback(() => {
    setVertices([]);
    cursorRef.current = null;
    removeOverlay();
  }, [removeOverlay]);

  /** Commit the in-progress wall (open, or closed when `closeLoop`). */
  const commitWall = useCallback((closeLoop: boolean) => {
    const verts = verticesRef.current;
    // Drop consecutive duplicates (double-click places its final vertex twice).
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

  const handlePointerDown = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall') return;
    if (selectedEntry == null || !isStripAsset) return;

    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;

    const verts = verticesRef.current;

    // Clicking the first vertex with 3+ points closes the loop.
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
    // setVertices is async; draw with the appended list immediately.
    verticesRef.current = next;
    // Press-drag bows the segment that ends at this vertex (released = confirm).
    pressActiveRef.current = next.length >= 2;
    drawPreview();
  }, [currentTool, selectedEntry, isStripAsset, getClientCoords, screenToWorld, snapDistance, snapWorld, angleSnap, createOverlay, commitWall, drawPreview]);

  const handlePointerMove = useCallback((e: MouseEvent | TouchEvent | PointerEvent) => {
    if (currentTool !== 'wall' || verticesRef.current.length === 0) return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;

    const verts = verticesRef.current;
    const zoom = mapData?.viewState?.zoom ?? 1;

    // While pressing after a vertex placement, drag bows the new segment:
    // the quadratic passes through the drag point at t=0.5. Dragging back to
    // the chord straightens it again.
    if (pressActiveRef.current && verts.length >= 2) {
      const p0 = verts[verts.length - 2];
      const p1 = verts[verts.length - 1];
      const mx = coords.worldX;
      const my = coords.worldY;
      // Distance from drag point to the chord
      const chordLen = Math.hypot(p1.x - p0.x, p1.y - p0.y);
      let chordDist = Math.hypot(mx - p1.x, my - p1.y);
      if (chordLen > 0) {
        const t = ((mx - p0.x) * (p1.x - p0.x) + (my - p0.y) * (p1.y - p0.y)) / (chordLen * chordLen);
        const ct = Math.max(0, Math.min(1, t));
        chordDist = Math.hypot(mx - (p0.x + ct * (p1.x - p0.x)), my - (p0.y + ct * (p1.y - p0.y)));
      }
      const engage = 6 / zoom;
      const next = verts.slice();
      const last = { ...next[next.length - 2] };
      if (chordDist > engage) {
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
  }, [currentTool, mapData, getClientCoords, screenToWorld, snapWorld, angleSnap, drawPreview]);

  const handlePointerUp = useCallback((_e: MouseEvent | TouchEvent | PointerEvent) => {
    pressActiveRef.current = false;
  }, []);

  const handleDoubleClick = useCallback((_e: MouseEvent) => {
    if (currentTool !== 'wall') return;
    if (verticesRef.current.length >= 2) {
      commitWall(false);
    }
  }, [currentTool, commitWall]);

  // Keyboard: Enter commits, Escape cancels, Backspace removes the last vertex.
  const isDrawing = vertices.length > 0;
  useEffect(() => {
    if (!isWallTool || !isDrawing) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
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
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isWallTool, isDrawing, cancelDrawing, commitWall, drawPreview]);

  // Cancel drawing when the tool changes away; clean overlay on unmount.
  useEffect(() => {
    if (!isWallTool && verticesRef.current.length > 0) cancelDrawing();
  }, [isWallTool, cancelDrawing]);
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

  return (
    <div className="windrose-floating-bar windrose-wall-bar">
      <CornerBrackets classPrefix="windrose-wallbar-bracket" variant="compact" filterId="wallbar-bracket" />
      {selectedEntry == null || !isStripAsset ? (
        <span className="windrose-wall-bar-hint">
          <Icon icon="lucide-brick-wall" size={14} />
          Pick a wall or path in the tile browser's Walls tab
        </span>
      ) : (
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
      )}
    </div>
  );
};

export { WallLayer };
