/**
 * useShapeOverlayTools.ts
 *
 * Hook for placing and managing shape overlays (rectangle/circle).
 * Uses a 2-click placement pattern: rectangles take two opposite corners,
 * circles take the center and then a point on the edge.
 *
 * Placement snaps to the grid by default (cell centers, whole-cell extents);
 * holding Alt+Shift or enabling the sidebar freeform mode places freely.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, ShapeOverlay, ShapeOverlayType } from '#types/core/map.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDistance } from '../../drawing/distanceOperations';
import { snapShapeOverlayToGrid, hitTestShapeOverlay } from '../../objects/shapeOverlayOperations';
import { useMapSelection } from '../../context/MapSelectionContext';


interface ShapeOverlayToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  mapData: MapData | null;
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  onShapeOverlaysChange: (shapeOverlays: ShapeOverlay[]) => void;
  /** Sidebar freeform toggle: places at exact world coordinates when on */
  freeformPlacementMode?: boolean;
}

interface ShapePreviewState {
  center: Point;
  currentSize: number;
  shape: ShapeOverlayType;
  formattedDistance: string;
  corner1?: Point;
  corner2?: Point;
  circleEdge?: Point;
  circleCenter?: Point;
  freeform: boolean;
}

interface UseShapeOverlayToolsResult {
  isActive: boolean;
  preview: ShapePreviewState | null;
  handlePointerDown: (e: PointerEvent) => void;
  handlePointerMove: (e: PointerEvent) => void;
  cancelPlacement: () => void;
  deleteShapeOverlay: (id: string) => void;
  updateShapeOverlay: (id: string, updates: Partial<ShapeOverlay>) => void;
  handleShapeSelection: (clientX: number, clientY: number) => boolean;
  handleShapeDragging: (e: MouseEvent | TouchEvent) => void;
  stopShapeDragging: () => void;
  activeShape: ShapeOverlayType;
  setActiveShape: (shape: ShapeOverlayType) => void;
  isFreeformPlacement: boolean;
}

function generateShapeId(): string {
  return `shape-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function useShapeOverlayTools(options: ShapeOverlayToolsOptions): UseShapeOverlayToolsResult {
  const {
    currentTool,
    selectedColor,
    selectedOpacity,
    mapData,
    geometry,
    screenToWorld,
    onShapeOverlaysChange,
    freeformPlacementMode = false
  } = options;

  const { selectItem, selectedItem: currentSelectedItem, setIsDraggingSelection, setDragStart } = useMapSelection();

  const isShapeTool = currentTool === 'shape';
  const [activeShape, setActiveShape] = useState<ShapeOverlayType>('square');

  const [firstClick, setFirstClick] = useState<Point | null>(null);
  const [currentWorldPos, setCurrentWorldPos] = useState<Point | null>(null);
  // Alt+Shift held on the most recent pointer event (mirrors object placement)
  const [modifierFreeform, setModifierFreeform] = useState(false);

  // Freeform when the modifier is held or the sidebar toggle is on; otherwise snap
  const isFreeformPlacement = modifierFreeform || freeformPlacementMode;

  useEffect(() => {
    if (!isShapeTool) {
      setFirstClick(null);
      setCurrentWorldPos(null);
      setModifierFreeform(false);
    }
  }, [isShapeTool]);

  const getWorldCoords = useCallback((e: PointerEvent | MouseEvent): { worldX: number; worldY: number } | null => {
    return screenToWorld(e.clientX, e.clientY);
  }, [screenToWorld]);

  const sizeToFormattedDistance = useCallback((size: number): string => {
    if (!geometry || !mapData) return '';
    const cellSize = geometry.cellSize ?? 1;
    const cellDistance = size / cellSize;
    const settings = mapData.settings?.overrides ?? {};
    const distancePerCell = (settings.distancePerCell as number) || 5;
    const distanceUnit = (settings.distanceUnit as string) || 'ft';
    return formatDistance(cellDistance, distancePerCell, distanceUnit, 'both');
  }, [geometry, mapData]);

  /**
   * Turn the two click points into a shape. Rectangles take opposite corners;
   * circles take the first click as the center and the second as a point on
   * the edge. Unless placement is freeform, the result is snapped to the grid.
   */
  const computeShapeFromClicks = useCallback((
    p1: Point,
    p2: Point,
    freeform: boolean
  ): { center: Point; halfWidth: number; halfHeight: number; freeform: boolean } | null => {
    let center: Point;
    let halfWidth: number;
    let halfHeight: number;

    if (activeShape === 'square') {
      center = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
      halfWidth = Math.abs(p2.x - p1.x) / 2;
      halfHeight = Math.abs(p2.y - p1.y) / 2;
    } else {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      center = { x: p1.x, y: p1.y };
      halfWidth = Math.sqrt(dx * dx + dy * dy);
      halfHeight = halfWidth;
    }

    // Two clicks in the same spot (or on the same row/column, which would give a
    // zero-area rectangle) cancel placement, snapped or not
    if (halfWidth < 1 || halfHeight < 1) return null;

    if (!freeform) {
      // Snapped placement needs geometry; never fall back to a freeform shape
      // the user did not ask for.
      if (!geometry) return null;
      const snapped = snapShapeOverlayToGrid({ worldPosition: center, size: halfWidth, halfWidth, halfHeight }, geometry);
      return {
        center: snapped.worldPosition,
        halfWidth: snapped.halfWidth ?? snapped.size,
        halfHeight: snapped.halfHeight ?? snapped.size,
        freeform: false
      };
    }

    return { center, halfWidth, halfHeight, freeform: true };
  }, [activeShape, geometry]);

  // The ghost is derived from the committed result, so it shows exactly what
  // placement will store (including the snap).
  const preview = useMemo((): ShapePreviewState | null => {
    if (!firstClick || !currentWorldPos) return null;
    const result = computeShapeFromClicks(firstClick, currentWorldPos, isFreeformPlacement);
    if (!result) return null;
    const { center, halfWidth, halfHeight } = result;
    const size = Math.max(halfWidth, halfHeight);
    return {
      center,
      currentSize: size,
      shape: activeShape,
      formattedDistance: sizeToFormattedDistance(activeShape === 'square' ? halfWidth * 2 : halfWidth),
      corner1: activeShape === 'square' ? { x: center.x - halfWidth, y: center.y - halfHeight } : undefined,
      corner2: activeShape === 'square' ? { x: center.x + halfWidth, y: center.y + halfHeight } : undefined,
      circleEdge: activeShape === 'circle' ? { x: center.x + halfWidth, y: center.y } : undefined,
      circleCenter: activeShape === 'circle' ? center : undefined,
      freeform: result.freeform
    };
  }, [firstClick, currentWorldPos, activeShape, computeShapeFromClicks, isFreeformPlacement, sizeToFormattedDistance]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isShapeTool) return;
    const world = getWorldCoords(e);
    if (!world || !mapData) return;

    const freeform = (e.altKey && e.shiftKey) || freeformPlacementMode;
    setModifierFreeform(e.altKey && e.shiftKey);

    if (!firstClick) {
      setFirstClick({ x: world.worldX, y: world.worldY });
      setCurrentWorldPos({ x: world.worldX, y: world.worldY });
    } else {
      const result = computeShapeFromClicks(firstClick, { x: world.worldX, y: world.worldY }, freeform);
      if (!result) {
        cancelPlacement();
        return;
      }

      const newShape: ShapeOverlay = {
        id: generateShapeId(),
        shape: activeShape,
        worldPosition: result.center,
        // `size` stays the circle radius / the larger rectangle half-extent so
        // pre-2.4.0 builds still draw something sensible
        size: Math.max(result.halfWidth, result.halfHeight),
        halfWidth: result.halfWidth,
        halfHeight: result.halfHeight,
        color: selectedColor,
        opacity: selectedOpacity,
        freeform: result.freeform,
        visible: true
      };

      onShapeOverlaysChange([...(mapData.shapeOverlays ?? []), newShape]);
      setFirstClick(null);
      setCurrentWorldPos(null);
    }
  }, [isShapeTool, getWorldCoords, mapData, firstClick, activeShape, selectedColor, selectedOpacity, computeShapeFromClicks, freeformPlacementMode, onShapeOverlaysChange]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isShapeTool || !firstClick) return;
    const world = getWorldCoords(e);
    if (!world) return;
    setModifierFreeform(e.altKey && e.shiftKey);
    setCurrentWorldPos({ x: world.worldX, y: world.worldY });
  }, [isShapeTool, firstClick, getWorldCoords]);

  const cancelPlacement = useCallback(() => {
    setFirstClick(null);
    setCurrentWorldPos(null);
    setModifierFreeform(false);
  }, []);

  const deleteShapeOverlay = useCallback((id: string) => {
    if (!mapData) return;
    const shapes = (mapData.shapeOverlays ?? []).filter(s => s.id !== id);
    onShapeOverlaysChange(shapes);
  }, [mapData, onShapeOverlaysChange]);

  const updateShapeOverlay = useCallback((id: string, updates: Partial<ShapeOverlay>) => {
    if (!mapData) return;
    const shapes = (mapData.shapeOverlays ?? []).map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    onShapeOverlaysChange(shapes);
  }, [mapData, onShapeOverlaysChange]);

  const hitTestShape = useCallback((worldX: number, worldY: number): ShapeOverlay | null => {
    if (!mapData?.shapeOverlays) return null;
    for (let i = mapData.shapeOverlays.length - 1; i >= 0; i--) {
      const shape = mapData.shapeOverlays[i];
      if (!shape.visible) continue;
      if (hitTestShapeOverlay(shape, worldX, worldY)) return shape;
    }
    return null;
  }, [mapData?.shapeOverlays]);

  const handleShapeSelection = useCallback((clientX: number, clientY: number): boolean => {
    const world = screenToWorld(clientX, clientY);
    if (!world) return false;
    const hit = hitTestShape(world.worldX, world.worldY);
    if (hit) {
      selectItem({ type: 'shapeOverlay', id: hit.id, data: hit });
      setIsDraggingSelection(true);
      setDragStart({ x: 0, y: 0, clientX, clientY, worldX: world.worldX, worldY: world.worldY });
      return true;
    }
    return false;
  }, [screenToWorld, hitTestShape, selectItem, setIsDraggingSelection, setDragStart]);

  const dragPrevRef = useRef<{ worldX: number; worldY: number } | null>(null);

  const handleShapeDragging = useCallback((e: MouseEvent | TouchEvent) => {
    if (!mapData || !currentSelectedItem || currentSelectedItem.type !== 'shapeOverlay') return;
    const clientX = (e as MouseEvent).clientX ?? ((e as TouchEvent).touches?.[0]?.clientX || 0);
    const clientY = (e as MouseEvent).clientY ?? ((e as TouchEvent).touches?.[0]?.clientY || 0);
    const world = screenToWorld(clientX, clientY);
    if (!world) return;

    if (!dragPrevRef.current) {
      dragPrevRef.current = { worldX: world.worldX, worldY: world.worldY };
      return;
    }

    const dx = world.worldX - dragPrevRef.current.worldX;
    const dy = world.worldY - dragPrevRef.current.worldY;
    dragPrevRef.current = { worldX: world.worldX, worldY: world.worldY };

    const selectedId = currentSelectedItem.id;
    onShapeOverlaysChange((mapData.shapeOverlays ?? []).map(s =>
      s.id === selectedId
        ? { ...s, worldPosition: { x: s.worldPosition.x + dx, y: s.worldPosition.y + dy } }
        : s
    ));
  }, [screenToWorld, mapData, currentSelectedItem, onShapeOverlaysChange]);

  const stopShapeDragging = useCallback(() => {
    dragPrevRef.current = null;
    setIsDraggingSelection(false);
  }, [setIsDraggingSelection]);

  return {
    isActive: isShapeTool,
    preview,
    handlePointerDown,
    handlePointerMove,
    cancelPlacement,
    deleteShapeOverlay,
    updateShapeOverlay,
    handleShapeSelection,
    handleShapeDragging,
    stopShapeDragging,
    activeShape,
    setActiveShape,
    isFreeformPlacement
  };
}

export { useShapeOverlayTools };