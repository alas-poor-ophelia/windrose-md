/**
 * useShapeOverlayTools.ts
 *
 * Hook for placing and managing shape overlays (square/circle).
 * Uses a 2-click placement pattern: click center, then click to set size.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, ShapeOverlay, ShapeOverlayType } from '#types/core/map.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { formatDistance } from '../../drawing/distanceOperations';
import { useMapSelection } from '../../context/MapSelectionContext';


interface ShapeOverlayToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  mapData: MapData | null;
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  onShapeOverlaysChange: (shapeOverlays: ShapeOverlay[]) => void;
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
    onShapeOverlaysChange
  } = options;

  const { selectItem, selectedItem: currentSelectedItem, setIsDraggingSelection, setDragStart } = useMapSelection();

  const isShapeTool = currentTool === 'shape';
  const [activeShape, setActiveShape] = useState<ShapeOverlayType>('square');

  const [firstClick, setFirstClick] = useState<Point | null>(null);
  const [currentWorldPos, setCurrentWorldPos] = useState<Point | null>(null);

  useEffect(() => {
    if (!isShapeTool) {
      setFirstClick(null);
      setCurrentWorldPos(null);
    }
  }, [isShapeTool]);

  const getWorldCoords = useCallback((e: PointerEvent | MouseEvent) => {
    if (!screenToWorld) return null;
    return screenToWorld(e.clientX, e.clientY);
  }, [screenToWorld]);

  const sizeToFormattedDistance = useCallback((size: number): string => {
    if (!geometry || !mapData) return '';
    const cellSize = (geometry as { cellSize?: number; hexSize?: number }).cellSize ||
                     (geometry as { hexSize?: number }).hexSize || 1;
    const cellDistance = size / cellSize;
    const settings = mapData.settings?.overrides || {};
    const distancePerCell = (settings.distancePerCell as number) || 5;
    const distanceUnit = (settings.distanceUnit as string) || 'ft';
    return formatDistance(cellDistance, distancePerCell, distanceUnit, 'both');
  }, [geometry, mapData]);

  const computeShapeFromClicks = useCallback((p1: Point, p2: Point): { center: Point; size: number } | null => {
    if (activeShape === 'square') {
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;
      const halfW = Math.abs(p2.x - p1.x) / 2;
      const halfH = Math.abs(p2.y - p1.y) / 2;
      const size = Math.max(halfW, halfH);
      if (size < 1) return null;
      return { center: { x: cx, y: cy }, size };
    } else {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const radius = Math.sqrt(dx * dx + dy * dy);
      if (radius < 1) return null;
      return { center: { x: p2.x, y: p2.y }, size: radius };
    }
  }, [activeShape]);

  const preview = useMemo((): ShapePreviewState | null => {
    if (!firstClick || !currentWorldPos) return null;
    const result = computeShapeFromClicks(firstClick, currentWorldPos);
    if (!result) return null;
    return {
      center: result.center,
      currentSize: result.size,
      shape: activeShape,
      formattedDistance: sizeToFormattedDistance(activeShape === 'square' ? result.size * 2 : result.size),
      corner1: activeShape === 'square' ? firstClick : undefined,
      corner2: activeShape === 'square' ? currentWorldPos : undefined,
      circleEdge: activeShape === 'circle' ? firstClick : undefined,
      circleCenter: activeShape === 'circle' ? currentWorldPos : undefined
    };
  }, [firstClick, currentWorldPos, activeShape, computeShapeFromClicks, sizeToFormattedDistance]);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    if (!isShapeTool) return;
    const world = getWorldCoords(e);
    if (!world || !mapData) return;

    if (!firstClick) {
      setFirstClick({ x: world.worldX, y: world.worldY });
      setCurrentWorldPos({ x: world.worldX, y: world.worldY });
    } else {
      const result = computeShapeFromClicks(firstClick, { x: world.worldX, y: world.worldY });
      if (!result) {
        cancelPlacement();
        return;
      }

      const newShape: ShapeOverlay = {
        id: generateShapeId(),
        shape: activeShape,
        worldPosition: result.center,
        size: result.size,
        color: selectedColor,
        opacity: selectedOpacity,
        freeform: true,
        visible: true
      };

      onShapeOverlaysChange([...(mapData.shapeOverlays || []), newShape]);
      setFirstClick(null);
      setCurrentWorldPos(null);
    }
  }, [isShapeTool, getWorldCoords, mapData, firstClick, activeShape, selectedColor, selectedOpacity, computeShapeFromClicks, onShapeOverlaysChange]);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!isShapeTool || !firstClick) return;
    const world = getWorldCoords(e);
    if (!world) return;
    setCurrentWorldPos({ x: world.worldX, y: world.worldY });
  }, [isShapeTool, firstClick, getWorldCoords]);

  const cancelPlacement = useCallback(() => {
    setFirstClick(null);
    setCurrentWorldPos(null);
  }, []);

  const deleteShapeOverlay = useCallback((id: string) => {
    if (!mapData) return;
    const shapes = (mapData.shapeOverlays || []).filter(s => s.id !== id);
    onShapeOverlaysChange(shapes);
  }, [mapData, onShapeOverlaysChange]);

  const updateShapeOverlay = useCallback((id: string, updates: Partial<ShapeOverlay>) => {
    if (!mapData) return;
    const shapes = (mapData.shapeOverlays || []).map(s =>
      s.id === id ? { ...s, ...updates } : s
    );
    onShapeOverlaysChange(shapes);
  }, [mapData, onShapeOverlaysChange]);

  const hitTestShape = useCallback((worldX: number, worldY: number): ShapeOverlay | null => {
    if (!mapData?.shapeOverlays) return null;
    for (let i = mapData.shapeOverlays.length - 1; i >= 0; i--) {
      const shape = mapData.shapeOverlays[i];
      if (!shape.visible) continue;
      const dx = worldX - shape.worldPosition.x;
      const dy = worldY - shape.worldPosition.y;
      if (shape.shape === 'circle') {
        if (dx * dx + dy * dy <= shape.size * shape.size) return shape;
      } else {
        if (Math.abs(dx) <= shape.size && Math.abs(dy) <= shape.size) return shape;
      }
    }
    return null;
  }, [mapData?.shapeOverlays]);

  const handleShapeSelection = useCallback((clientX: number, clientY: number): boolean => {
    if (!screenToWorld) return false;
    const world = screenToWorld(clientX, clientY);
    if (!world) return false;
    const hit = hitTestShape(world.worldX, world.worldY);
    if (hit) {
      selectItem({ type: 'shapeOverlay', id: hit.id, data: hit as unknown as Record<string, unknown> });
      setIsDraggingSelection(true);
      setDragStart({ x: 0, y: 0, clientX, clientY, worldX: world.worldX, worldY: world.worldY });
      return true;
    }
    return false;
  }, [screenToWorld, hitTestShape, selectItem, setIsDraggingSelection, setDragStart]);

  const dragPrevRef = useRef<{ worldX: number; worldY: number } | null>(null);

  const handleShapeDragging = useCallback((e: MouseEvent | TouchEvent) => {
    if (!screenToWorld || !mapData || !currentSelectedItem || currentSelectedItem.type !== 'shapeOverlay') return;
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
    onShapeOverlaysChange((mapData.shapeOverlays || []).map(s =>
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
    setActiveShape
  };
}

export { useShapeOverlayTools };