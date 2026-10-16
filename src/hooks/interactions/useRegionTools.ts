/**
 * useRegionTools.ts
 *
 * Hook for region creation and editing on hex maps.
 * Supports two modes:
 * - Paint: click hexes to toggle them in/out of a pending selection
 * - Boundary: click to place polygon vertices, close to select enclosed hexes
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point } from '#types/core/geometry.types';
import type { MapData, Region } from '#types/core/map.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { updateById, removeById } from '../../objects/entityList';
import { mintId } from '../../core/ids';
import { getRegionLabelWorldPosition, computeCentroid } from '../../geometry/renderers/regionRenderer';
import { hexKey, pointInPolygon, forEachHexInBounds } from '../../geometry/hex/hexRegionMath';

interface RegionToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  /** suppressHistory: a live label-drag move (pins the pre-drag value; the drop commits one step). */
  onRegionsChange: (regions: Region[], suppressHistory?: boolean) => void;
  /** Drops held transient-history pins (useLayerHistory.clearTransient). */
  clearTransient?: () => void;
}

interface ContextMenuState {
  regionId: string;
  screenX: number;
  screenY: number;
}

interface UseRegionToolsResult {
  pendingHexes: Point[];
  boundaryVertices: Point[];
  isActive: boolean;
  editingRegionId: string | null;
  editingRegion: Region | null;
  contextMenu: ContextMenuState | null;
  handlePointerDown: (e: PointerEvent) => void;
  handlePointerMove: (e: PointerEvent) => void;
  handlePointerUp: (e: PointerEvent) => void;
  handleDoubleClick: (e: MouseEvent) => void;
  handleContextMenu: (e: MouseEvent) => void;
  confirmRegion: (name: string, linkedNote?: string) => void;
  cancelRegion: () => void;
  deleteRegion: (regionId: string) => void;
  updateRegion: (regionId: string, updates: Partial<Region>) => void;
  startEditingRegion: (regionId: string) => void;
  stopEditingRegion: () => void;
  dismissContextMenu: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────────

function generateRegionId(): string {
  return mintId('region', { randomLength: 6 });
}


// ── Hook ─────────────────────────────────────────────────────────────

function useRegionTools(options: RegionToolsOptions): UseRegionToolsResult {
  const {
    currentTool,
    selectedColor,
    mapData,
    geometry,
    screenToWorld,
    screenToGrid,
    onRegionsChange,
    clearTransient
  } = options;

  const isActive = currentTool === 'regionPaint' || currentTool === 'regionBoundary';
  const isPaintMode = currentTool === 'regionPaint';
  const isBoundaryMode = currentTool === 'regionBoundary';

  // Pending hex selection (axial coords) — for new region creation
  const [pendingHexes, setPendingHexes] = useState<Point[]>([]);
  // Boundary polygon vertices (world coords)
  const [boundaryVertices, setBoundaryVertices] = useState<Array<{ x: number; y: number }>>([]);
  // Editing state — when set, paint mode modifies an existing region
  const [editingRegionId, setEditingRegionId] = useState<string | null>(null);
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Label drag state
  const [draggingLabelRegionId, setDraggingLabelRegionId] = useState<string | null>(null);
  const labelDragStartRef = useRef<{ worldX: number; worldY: number } | null>(null);
  const labelDragCleanupRef = useRef<(() => void) | null>(null);
  // Document that owns the element the label drag started on (popout-safe
  // target for the document-level move/up listeners below).
  const labelDragDocRef = useRef<Document | null>(null);
  // Regions after the last live label-drag move; committed once at drop.
  const labelDragRegionsRef = useRef<Region[] | null>(null);
  const handlePointerMoveRef = useRef<((e: PointerEvent) => void) | null>(null);
  const handlePointerUpRef = useRef<((e: PointerEvent) => void) | null>(null);

  const editingRegion = useMemo(() => {
    if (editingRegionId == null || editingRegionId === '' || !mapData?.regions) return null;
    return mapData.regions.find(r => r.id === editingRegionId) ?? null;
  }, [editingRegionId, mapData?.regions]);

  // Reset state when switching away from region tools
  useEffect(() => {
    if (!isActive) {
      setPendingHexes([]);
      setBoundaryVertices([]);
      setEditingRegionId(null);
      setContextMenu(null);
    }
  }, [isActive]);

  const getHexCoords = useCallback((e: PointerEvent | MouseEvent): { q: number; r: number } | null => {
    if (!geometry || geometry.type !== 'hex') return null;
    const grid = screenToGrid(e.clientX, e.clientY);
    if (!grid) return null;
    return { q: grid.x, r: grid.y };
  }, [geometry, screenToGrid]);

  const getWorldCoords = useCallback((e: PointerEvent | MouseEvent): { worldX: number; worldY: number } | null => {
    return screenToWorld(e.clientX, e.clientY);
  }, [screenToWorld]);

  // ── Helper: find which region a hex belongs to ─────────────────────

  const findRegionForHex = useCallback((q: number, r: number): Region | null => {
    if (!mapData?.regions) return null;
    const key = hexKey(q, r);
    return mapData.regions.find(region =>
      region.hexes.some(h => hexKey(h.x, h.y) === key)
    ) ?? null;
  }, [mapData?.regions]);

  // ── Paint Mode Handlers ────────────────────────────────────────────

  // Check if a click hits a region label (world-space proximity)
  const checkLabelHit = useCallback((worldX: number, worldY: number): Region | null => {
    if (!mapData?.regions || !geometry || geometry.type !== 'hex') return null;
    const hexGeom = geometry;
    const hitRadius = hexGeom.hexSize * 0.6;

    for (const region of mapData.regions) {
      const labelPos = getRegionLabelWorldPosition(region, hexGeom);
      if (!labelPos) continue;
      const dx = worldX - labelPos.worldX;
      const dy = worldY - labelPos.worldY;
      if (dx * dx + dy * dy < hitRadius * hitRadius) return region;
    }
    return null;
  }, [mapData?.regions, geometry]);

  const handlePaintPointerDown = useCallback((e: PointerEvent) => {
    // Check for label drag first
    const world = getWorldCoords(e);
    if (world) {
      const hitRegion = checkLabelHit(world.worldX, world.worldY);
      if (hitRegion) {
        labelDragDocRef.current = e.target instanceof Node ? e.target.ownerDocument : null;
        setDraggingLabelRegionId(hitRegion.id);
        labelDragStartRef.current = { worldX: world.worldX, worldY: world.worldY };
        e.preventDefault();
        return;
      }
    }

    const hex = getHexCoords(e);
    if (!hex || !geometry || geometry.type !== 'hex') return;

    if (!geometry.isWithinBounds(hex.q, hex.r)) return;

    // If editing an existing region, add/remove hex from it directly
    if (editingRegionId != null && editingRegionId !== '' && mapData) {
      const key = hexKey(hex.q, hex.r);
      const regions = mapData.regions ?? [];
      const regionIdx = regions.findIndex(r => r.id === editingRegionId);
      if (regionIdx === -1) return;

      const region = regions[regionIdx];
      const hexInRegion = region.hexes.some(h => hexKey(h.x, h.y) === key);

      const updatedRegion = {
        ...region,
        hexes: hexInRegion
          ? region.hexes.filter(h => hexKey(h.x, h.y) !== key)
          : [...region.hexes, { x: hex.q, y: hex.r }]
      };

      // If adding, remove hex from any other region (exclusive)
      const updatedRegions = regions.map((r, i) => {
        if (i === regionIdx) return updatedRegion;
        if (!hexInRegion) {
          return { ...r, hexes: r.hexes.filter(h => hexKey(h.x, h.y) !== key) };
        }
        return r;
      });

      onRegionsChange(updatedRegions);
      return;
    }

    // If no editing and no pending selection, check if clicking on an existing region
    if (pendingHexes.length === 0) {
      const existingRegion = findRegionForHex(hex.q, hex.r);
      if (existingRegion) {
        setEditingRegionId(existingRegion.id);
        return;
      }
    }

    // Normal pending hex toggle for new region creation
    setPendingHexes(prev => {
      const key = hexKey(hex.q, hex.r);
      const exists = prev.some(h => hexKey(h.x, h.y) === key);
      if (exists) {
        return prev.filter(h => hexKey(h.x, h.y) !== key);
      }
      return [...prev, { x: hex.q, y: hex.r }];
    });
  }, [getHexCoords, getWorldCoords, checkLabelHit, geometry, editingRegionId, mapData, pendingHexes.length, findRegionForHex, onRegionsChange]);

  // ── Boundary Mode Handlers ─────────────────────────────────────────

  const handleBoundaryPointerDown = useCallback((e: PointerEvent) => {
    const world = getWorldCoords(e);
    if (!world) return;

    // Check for label drag first
    const hitRegion = checkLabelHit(world.worldX, world.worldY);
    if (hitRegion) {
      labelDragDocRef.current = e.target instanceof Node ? e.target.ownerDocument : null;
      setDraggingLabelRegionId(hitRegion.id);
      labelDragStartRef.current = { worldX: world.worldX, worldY: world.worldY };
      e.preventDefault();
      return;
    }

    setBoundaryVertices(prev => [...prev, { x: world.worldX, y: world.worldY }]);
  }, [getWorldCoords, checkLabelHit]);

  const closeBoundaryAndSelectHexes = useCallback(() => {
    if (boundaryVertices.length < 3 || !geometry || geometry.type !== 'hex' || !mapData) return;

    const hexGeom = geometry;
    const bounds = mapData.hexBounds;
    if (!bounds) return;

    // Find all hexes whose centers fall inside the polygon
    const selected: Point[] = [];
    forEachHexInBounds(hexGeom, bounds, mapData.orientation ?? 'flat', (q, r) => {
      const center = hexGeom.hexToWorld(q, r);
      if (pointInPolygon(center.worldX, center.worldY, boundaryVertices)) {
        selected.push({ x: q, y: r });
      }
    });

    setPendingHexes(selected);
    setBoundaryVertices([]);
  }, [boundaryVertices, geometry, mapData]);

  // Double-click closes the boundary polygon
  const handleDoubleClick = useCallback((_e: MouseEvent) => {
    if (!isBoundaryMode || boundaryVertices.length < 3) return;
    closeBoundaryAndSelectHexes();
  }, [isBoundaryMode, boundaryVertices.length, closeBoundaryAndSelectHexes]);

  // ── Unified Handlers ───────────────────────────────────────────────

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isActive) return;
    if (isPaintMode) handlePaintPointerDown(e);
    if (isBoundaryMode) handleBoundaryPointerDown(e);
  }, [isActive, isPaintMode, isBoundaryMode, handlePaintPointerDown, handleBoundaryPointerDown]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (draggingLabelRegionId == null || draggingLabelRegionId === '' || !labelDragStartRef.current) return;
    const world = getWorldCoords(e);
    if (!world || !mapData?.regions || !geometry || geometry.type !== 'hex') return;

    const hexGeom = geometry;
    const region = mapData.regions.find(r => r.id === draggingLabelRegionId);
    if (!region) return;

    const currentLabelPos = region.labelPosition
      ? { worldX: region.labelPosition.x, worldY: region.labelPosition.y }
      : computeCentroid(region.hexes, hexGeom);

    const deltaX = world.worldX - labelDragStartRef.current.worldX;
    const deltaY = world.worldY - labelDragStartRef.current.worldY;

    let newPos = { x: currentLabelPos.worldX + deltaX, y: currentLabelPos.worldY + deltaY };
    labelDragStartRef.current = { worldX: world.worldX, worldY: world.worldY };

    // Constrain: label must stay within maxDist of the nearest hex in the region
    const maxDist = hexGeom.hexSize * 2.5;
    let nearestDistSq = Infinity;
    let nearestWorld = { worldX: 0, worldY: 0 };
    for (const h of region.hexes) {
      const hw = hexGeom.hexToWorld(h.x, h.y);
      const dx = newPos.x - hw.worldX;
      const dy = newPos.y - hw.worldY;
      const distSq = dx * dx + dy * dy;
      if (distSq < nearestDistSq) {
        nearestDistSq = distSq;
        nearestWorld = hw;
      }
    }
    if (nearestDistSq > maxDist * maxDist) {
      const dist = Math.sqrt(nearestDistSq);
      const scale = maxDist / dist;
      newPos = {
        x: nearestWorld.worldX + (newPos.x - nearestWorld.worldX) * scale,
        y: nearestWorld.worldY + (newPos.y - nearestWorld.worldY) * scale
      };
    }

    // Update region with new label position (running delta)
    // Live move: suppressed, so the whole drag is one undo step committed at drop.
    const regions = updateById<Region>(mapData.regions, draggingLabelRegionId, { labelPosition: newPos });
    labelDragRegionsRef.current = regions;
    onRegionsChange(regions, true);
  }, [draggingLabelRegionId, getWorldCoords, mapData, geometry, onRegionsChange]);

  const handlePointerUp = useCallback((_e: PointerEvent): void => {
    if (draggingLabelRegionId != null && draggingLabelRegionId !== '') {
      setDraggingLabelRegionId(null);
      labelDragStartRef.current = null;
      // Commit the drag as one history step (a click without a move commits nothing).
      const dragged = labelDragRegionsRef.current;
      labelDragRegionsRef.current = null;
      if (dragged != null) onRegionsChange(dragged, false);
      else clearTransient?.(); // no commit: drop any stray pin
      if (labelDragCleanupRef.current) {
        labelDragCleanupRef.current();
        labelDragCleanupRef.current = null;
      }
    }
  }, [draggingLabelRegionId, onRegionsChange, clearTransient]);

  // Keep refs in sync for document-level listeners
  handlePointerMoveRef.current = handlePointerMove;
  handlePointerUpRef.current = handlePointerUp;

  // Start document-level drag listeners when label drag begins
  useEffect(() => {
    if (draggingLabelRegionId == null || draggingLabelRegionId === '') return undefined;

    const onMove = (e: PointerEvent): void => { handlePointerMoveRef.current?.(e); };
    const onUp = (e: PointerEvent): void => { handlePointerUpRef.current?.(e); };

    const doc = labelDragDocRef.current ?? activeDocument;
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    // A cancelled pointer ends the drag through the same path as a release.
    doc.addEventListener('pointercancel', onUp);

    labelDragCleanupRef.current = () => {
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onUp);
    };

    return () => {
      doc.removeEventListener('pointermove', onMove);
      doc.removeEventListener('pointerup', onUp);
      doc.removeEventListener('pointercancel', onUp);
    };
  }, [draggingLabelRegionId]);

  // ── Region Creation ────────────────────────────────────────────────

  const confirmRegion = useCallback((name: string, linkedNote?: string) => {
    if (pendingHexes.length === 0 || !mapData) return;

    const existingRegions = mapData.regions ?? [];

    // Remove pending hexes from any existing region (exclusive)
    const pendingKeys = new Set(pendingHexes.map(h => hexKey(h.x, h.y)));
    const updatedExisting = existingRegions.map(region => ({
      ...region,
      hexes: region.hexes.filter(h => !pendingKeys.has(hexKey(h.x, h.y)))
    }));

    const newRegion: Region = {
      id: generateRegionId(),
      name,
      hexes: [...pendingHexes],
      color: selectedColor,
      opacity: 0.25,
      borderColor: selectedColor,
      borderWidth: 2,
      visible: true,
      order: updatedExisting.length,
      ...(linkedNote != null && linkedNote !== '' ? { linkedNote } : {})
    };

    onRegionsChange([...updatedExisting, newRegion]);
    setPendingHexes([]);
    setBoundaryVertices([]);
  }, [pendingHexes, mapData, selectedColor, onRegionsChange]);

  const cancelRegion = useCallback(() => {
    setPendingHexes([]);
    setBoundaryVertices([]);
    setEditingRegionId(null);
  }, []);

  // ── Region Editing ─────────────────────────────────────────────────

  const deleteRegion = useCallback((regionId: string) => {
    if (!mapData) return;
    const regions = removeById<Region>(mapData.regions, regionId);
    onRegionsChange(regions);
    if (editingRegionId === regionId) setEditingRegionId(null);
  }, [mapData, onRegionsChange, editingRegionId]);

  const updateRegion = useCallback((regionId: string, updates: Partial<Region>) => {
    if (!mapData) return;
    const regions = updateById<Region>(mapData.regions, regionId, updates);
    onRegionsChange(regions);
  }, [mapData, onRegionsChange]);

  const startEditingRegion = useCallback((regionId: string) => {
    setPendingHexes([]);
    setBoundaryVertices([]);
    setEditingRegionId(regionId);
  }, []);

  const stopEditingRegion = useCallback(() => {
    setEditingRegionId(null);
  }, []);

  // ── Context Menu ───────────────────────────────────────────────────

  const handleContextMenu = useCallback((e: MouseEvent) => {
    const hex = getHexCoords(e);
    if (!hex) return;

    const region = findRegionForHex(hex.q, hex.r);
    if (region) {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ regionId: region.id, screenX: e.clientX, screenY: e.clientY });
    }
  }, [getHexCoords, findRegionForHex]);

  const dismissContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  return {
    pendingHexes,
    boundaryVertices,
    isActive,
    editingRegionId,
    editingRegion,
    contextMenu,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleContextMenu,
    confirmRegion,
    cancelRegion,
    deleteRegion,
    updateRegion,
    startEditingRegion,
    stopEditingRegion,
    dismissContextMenu
  };
}

export { useRegionTools };