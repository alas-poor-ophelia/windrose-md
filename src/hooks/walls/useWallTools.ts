/**
 * useWallTools.ts
 *
 * State and pointer/keyboard handling for the wall/path tool. Three modes:
 *
 * DRAW: click places vertices (grid/hex snap); dragging before release bows
 * the new segment through the drag point; Enter/double-click/Done commits;
 * clicking the first vertex closes a loop; Escape cancels; Backspace steps back.
 *
 * EDIT: with nothing being drawn, clicking an existing wall selects it; vertex
 * squares, midpoint bow diamonds and gap handles appear. Drag a vertex to move
 * it, a diamond to bow/straighten that segment, a gap edge to resize the
 * opening, a gap center to slide it; double-click a segment to insert a
 * vertex; Delete removes the selected gap, else the selected vertex, else the
 * whole wall.
 *
 * OPENING: a portal tile (or the bare Threshold entry) is armed; clicks seat
 * a gap in the nearest wall, click an existing opening to edit it.
 *
 * Edit-drags are ephemeral: the working copy lives in a ref, is painted live
 * on the overlay (useWallOverlay), and is committed to mapData ONCE on
 * pointerup (one undo entry, no per-frame state write). Pure geometry lives
 * in drawing/wallEditGeometry.ts.
 */

import type { WallPath, WallVertex } from '#types/core/wallpath.types';
import type { WallLayerProps } from '../../components/mapcanvas/WallLayer';
import type { WallSurfaceLive, WallSurfaceSnapshot } from './useWallToolSurface';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Notice } from 'obsidian';
import { useMapState } from '../../context/MapContext';
import { useApp } from '../../context/AppContext';
import { useTileMetadata } from '../state/useTileMetadata';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { getCachedImage, preloadImage } from '../../assets/imageOperations';
import { resolveTileEntry } from '../../assets/tilesetOperations';
import { DEFAULT_PIXELS_PER_CELL } from '../../assets/spanPredictor';
import { createWallPath, distanceToWallPath as distanceToWall } from '../../drawing/wallPathOperations';
import {
  planGapInsert,
  findGapOnWallAtPoint,
  remapGapsAfterInsertVertex,
  remapGapsAfterDeleteVertex,
  snapInsertPointOutsideGaps,
} from '../../drawing/wallGapOperations';
import {
  DRAW_BOW_STRAIGHTEN_PX,
  applyWallDrag,
  bowArcThrough,
  chordDistance,
  hitTestWallHandles,
  isOpenableWall,
  nearestSegmentIndex,
  nearestWallInCorridor,
  wallGeometryChanged,
  wallHitCorridor,
} from '../../drawing/wallEditGeometry';
import type { WallDragState } from '../../drawing/wallEditGeometry';
import { shouldHandleMapKey } from '../../utils/keyboardTargets';
import { useWallOverlay, BARE_THRESHOLD_WIDTH_CELLS } from './useWallOverlay';
import type { WallToolRefs } from './useWallOverlay';

type PointerLike = MouseEvent | TouchEvent | PointerEvent;

interface WallToolHandlers {
  handlePointerDown: (e: PointerLike) => void;
  handlePointerMove: (e: PointerLike) => void;
  handlePointerUp: (e: PointerLike) => void;
  handleDoubleClick: (e: MouseEvent) => void;
}

interface WallTools {
  handlers: WallToolHandlers;
  /** Inputs for useWallToolSurface (latest closures + primitive snapshot). */
  surfaceLive: WallSurfaceLive;
  surfaceSnapshot: WallSurfaceSnapshot;
}

function useWallTools({
  currentTool,
  selectedTilesetId,
  selectedTileId,
  onWallPathsChange,
  onDragStateChange,
  bareThresholdArmed,
  onDisarmOpening,
  tileScale,
}: WallLayerProps): WallTools {
  const app = useApp();
  const { mapData, geometry, screenToWorld, getClientCoords, canvasRef } = useMapState();
  // Subscribed, so a classification change re-renders the layer (STRUCT-A-20).
  const tileMetadata = useTileMetadata(app);

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
  const dragRef = useRef<WallDragState | null>(null);
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
    // resolveTileEntry also accepts legacy basename ids (recents / MCP selects).
    return resolveTileEntry(ts, selectedTileId) ?? null;
  })();
  const selectedMeta = selectedEntry != null ? tileMetadata[selectedEntry.vaultPath] : undefined;
  const isStripAsset = selectedMeta?.ddSourceType === 'walls' || selectedMeta?.ddSourceType === 'paths';
  // Opening mode: a DD portal is armed, so click a wall to seat a door/window.
  // Detected via metadata (mirrors isStripAsset), NOT the 'opening' subtool:
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

  // ---- Opening width ----
  // Width from the armed art (spec 3.3): naturalWidth / the tileset's authoring
  // resolution, times the brush Scale slider; planGapInsert clamps it to the
  // host segment. Falls back to 1 cell (a spec 256-px portal) until the image decodes.
  const deriveOpeningWidthCells = useCallback((): number => {
    const vp = selectedEntry?.vaultPath;
    const img = vp != null ? getCachedImage(vp) : null;
    const ts = mapData?.tilesets?.find(t => t.id === selectedTilesetId);
    const ppc = ts?.pixelsPerCell ?? DEFAULT_PIXELS_PER_CELL;
    const natW = img?.naturalWidth ?? 0;
    const scale = tileScale != null && tileScale > 0 ? tileScale : 1;
    return (natW > 0 ? natW / ppc : 1) * scale;
  }, [selectedEntry?.vaultPath, mapData?.tilesets, selectedTilesetId, tileScale]);

  // ---- Overlay ----
  const refs = useMemo<WallToolRefs>(() => ({
    vertices: verticesRef,
    cursor: cursorRef,
    dragWorking: dragWorkingRef,
    selectedWallId: selectedWallIdRef,
    selectedVertex: selectedVertexRef,
    selectedGap: selectedGapRef,
  }), []);
  const {
    createOverlay, removeOverlay, drawPreview, drawEditHandles, drawOpeningGhost, getLiveZoom,
  } = useWallOverlay({
    refs, getWalls, cellSize, snapDistance,
    hasSelectedEntry: selectedEntry != null,
    selectedTilesetId, selectedTileId,
    isWallTool, isDrawing, isOpeningMode, isBareThreshold,
    selectedWallId, selectedVertexIndex, selectedGapId,
    deriveOpeningWidthCells,
  });

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

  // Click commits a single gap insert (one undo entry via suppress=false, G-F2).
  // Alt-click omits the art: a bare capped threshold (spec 5.3 secondary trigger).
  const commitOpeningInsert = useCallback((wx: number, wy: number, bare: boolean) => {
    const corridor = wallHitCorridor(cellSize, getLiveZoom());
    const wall = nearestWallInCorridor(getWalls(), wx, wy, corridor, isOpenableWall);
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
    // suppress=false: exactly one history entry; the wall stays in the static
    // raster (passing true would drop it AND write no undo entry, G-F2).
    updateWall(wall.id, w => ({ ...w, gaps: [...(w.gaps ?? []), plan.gap] }), false);
    // Place-and-adjust: the fresh opening is immediately selected, so its
    // move/resize handles and the footer door controls appear without a click.
    setSelectedWallId(wall.id);
    setSelectedGapId(plan.gap.id);
    setSelectedVertexIndex(null);
  }, [getLiveZoom, cellSize, getWalls, selectedTilesetId, selectedTileId, deriveOpeningWidthCells, updateWall, isBareThreshold]);

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

  // Arm a handle drag found by hitTestWallHandles on the selected wall.
  const startHandleDrag = useCallback((hit: WallDragState, wall: WallPath) => {
    dragRef.current = hit;
    if (hit.type === 'gapEdge' || hit.type === 'gapMove') {
      setSelectedGapId(hit.gapId);
      setSelectedVertexIndex(null);
    } else {
      setSelectedGapId(null);
    }
    beginDrag(wall);
  }, [beginDrag]);

  // ---- Pointer handlers ----
  const handlePointerDown = useCallback((e: PointerLike) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = getLiveZoom();
    const verts = verticesRef.current;

    // ---- OPENING MODE (portal armed) ----
    // Place-and-adjust: gap handles on the selected wall win first (same
    // precedence as edit mode: edge, then center), then a click on an existing
    // opening's footprint selects it, then a click on bare wall inserts.
    // Alt-click cuts a bare threshold (spec 5.2/5.3). Never draws a wall.
    if (isOpeningMode) {
      const walls = getWalls();
      const selWall = selectedWallIdRef.current != null ? walls.find(w => w.id === selectedWallIdRef.current) : null;
      if (selWall != null) {
        const hit = hitTestWallHandles(selWall, coords.worldX, coords.worldY, zoom, cellSize, { gapsOnly: true });
        if (hit != null) { startHandleDrag(hit, selWall); return; }
      }
      // Click on an existing opening: select it for editing, don't insert.
      const corridor = wallHitCorridor(cellSize, zoom);
      const nearWall = nearestWallInCorridor(walls, coords.worldX, coords.worldY, corridor, isOpenableWall);
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

      // Handle hit-test on the selected wall first. Precedence (geometry F5):
      // gap-edge, gap-center, vertex, bow, then centerline.
      const selWall = selectedWallIdRef.current != null ? walls.find(w => w.id === selectedWallIdRef.current) : null;
      if (selWall != null) {
        const hit = hitTestWallHandles(selWall, coords.worldX, coords.worldY, zoom, cellSize);
        if (hit != null) { startHandleDrag(hit, selWall); return; }
      }

      // Centerline hit-test across all walls (nearest within corridor wins).
      const bestWall = nearestWallInCorridor(walls, coords.worldX, coords.worldY, wallHitCorridor(cellSize, zoom));
      if (bestWall != null) {
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
  }, [currentTool, getWalls, selectedEntry, isStripAsset, isOpeningMode, commitOpeningInsert, getClientCoords, screenToWorld, cellSize, snapDistance, snapWorld, angleSnap, createOverlay, commitWall, drawPreview, startHandleDrag, getLiveZoom]);

  const handlePointerMove = useCallback((e: PointerLike) => {
    if (currentTool !== 'wall') return;
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToWorld(clientX, clientY);
    if (!coords) return;
    const zoom = getLiveZoom();

    // ---- EDIT DRAG (checked before the opening ghost: opening mode's gap
    // move/resize drags resolve through this same path) ----
    // Hot path: mutate the working copy only. mapData stays untouched for the
    // whole gesture (no per-frame state write, no static-cache bust, no
    // context cascade); see .claude/WALL-PERF-FIX-HANDOFF.md.
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
      const next = applyWallDrag(base, drag, coords.worldX, coords.worldY, zoom, cellSize, snapWorld);
      if (next == null) return;
      dragWorkingRef.current = next;
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
      // Degenerate chord (both points coincide): distance to the placed point.
      const chordDist = chordDistance(p0, p1, mx, my) ?? Math.hypot(mx - p1.x, my - p1.y);
      const next = verts.slice();
      const last = { ...next[next.length - 2] };
      if (chordDist > DRAW_BOW_STRAIGHTEN_PX / zoom) {
        last.arc = bowArcThrough(p0, p1, mx, my);
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
  }, [currentTool, cellSize, getClientCoords, screenToWorld, snapWorld, angleSnap, drawEditHandles, drawPreview, isOpeningMode, createOverlay, drawOpeningGhost, getLiveZoom]);

  const handlePointerUp = useCallback((_e: PointerLike) => {
    pressActiveRef.current = false;
    const drag = dragRef.current;
    if (drag != null) {
      dragRef.current = null;
      const working = dragWorkingRef.current;
      dragWorkingRef.current = null;
      if (dragMovedRef.current && working != null) {
        // Commit the working copy as ONE history entry, but skip a sub-epsilon
        // twitch (no geometry change: no history write, no re-render).
        // Gap drags mutate `gaps` (not vertices), so wallGeometryChanged can't
        // see them; always commit a moved gap drag (suppress=false, geometry F2).
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
    const corridor = wallHitCorridor(cellSize, getLiveZoom());
    if (distanceToWall(wall, coords.worldX, coords.worldY) > corridor) return;

    const bestSeg = nearestSegmentIndex(wall, coords.worldX, coords.worldY);
    if (bestSeg < 0) return;

    const snapped = snapWorld(coords.worldX, coords.worldY);
    // If the snapped point lands inside an existing gap's span on this
    // segment, snap it to the gap's nearer edge instead: invariant 3 forbids
    // straddling a door, and splitting through its middle would otherwise
    // silently shift it rather than preserve it (spec 2.3 insert row).
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
      // arc, so an analytic t/p split would slide the door (geometry F4, spec 2.3).
      if (w.gaps != null && w.gaps.length > 0) {
        next.gaps = remapGapsAfterInsertVertex(w.gaps, w, next, cellSize);
      }
      return next;
    }, false);
    setSelectedVertexIndex(bestSeg + 1);
    setSelectedGapId(null);
  }, [currentTool, mapData, getWalls, getClientCoords, screenToWorld, cellSize, snapWorld, updateWall, commitWall, getLiveZoom]);

  // ---- Keyboard ----
  useEffect(() => {
    if (!isWallTool) return;
    const onKeyDown = (e: KeyboardEvent): void => {
      // Ignore typing surfaces (the CodeMirror note editor is contenteditable,
      // not an INPUT) and keys aimed at another map on the page.
      if (!shouldHandleMapKey(e, canvasRef.current)) return;

      // Bare-threshold placement: Escape disarms the mode, but a selected
      // opening/wall deselects first (the Editing branch below), so Escape
      // steps out gradually: gap, wall, disarm.
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
        // Delete precedence: selected gap, then vertex, then whole wall.
        if (gapId != null) {
          updateWall(selId, w => ({ ...w, gaps: (w.gaps ?? []).filter(g => g.id !== gapId) }), false);
          setSelectedGapId(null);
        } else if (vIdx != null && wall.vertices.length > 2) {
          updateWall(selId, w => {
            const nextVerts = w.vertices.slice();
            nextVerts.splice(vIdx, 1);
            const next = { ...w, vertices: nextVerts };
            // Merging two segments can drop a corner between two doors: remap
            // via reprojectGap + overlap resolver (spec 2.3 delete row, integrity F3).
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
    // Popout-safe: the document that owns this canvas, captured once per run.
    const doc = canvasRef.current?.ownerDocument ?? activeDocument;
    doc.addEventListener('keydown', onKeyDown);
    return () => doc.removeEventListener('keydown', onKeyDown);
  }, [isWallTool, getWalls, updateWall, onWallPathsChange, cancelDrawing, commitWall, drawPreview, cellSize, isBareThreshold, isOpeningMode, onDisarmOpening, canvasRef]);

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
  // exit taken by arming a different tile: the footer would show no door
  // controls while Delete stayed silently armed for the hidden selection.
  const prevOpeningModeRef = useRef(isOpeningMode);
  useEffect(() => {
    if (prevOpeningModeRef.current === isOpeningMode) return;
    prevOpeningModeRef.current = isOpeningMode;
    setSelectedWallId(null);
    setSelectedVertexIndex(null);
    setSelectedGapId(null);
  }, [isOpeningMode]);

  return {
    handlers: { handlePointerDown, handlePointerMove, handlePointerUp, handleDoubleClick },
    surfaceLive: {
      toggleSnap, toggleAngleSnap, undoLastPoint, cancelDrawing, finishWall,
      updateWall, deleteSelectedWall, deselect, deselectGap,
      selectedWallId, selectedGapId,
    },
    surfaceSnapshot: {
      isWallTool,
      isDrawing,
      vertexCount: vertices.length,
      snapEnabled,
      angleSnapEnabled,
      hasAsset: selectedEntry != null && isStripAsset,
      assetForm: isOpeningMode ? 'opening' : 'strip',
      assetKind: selectedMeta?.ddSourceType === 'paths' ? 'path' : 'wall',
      selectedWall,
      selectedGap,
    },
  };
}

export { useWallTools };
export type { WallTools, WallToolHandlers };
