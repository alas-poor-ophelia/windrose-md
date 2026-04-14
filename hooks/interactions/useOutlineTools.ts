/**
 * useOutlineTools.ts
 *
 * Hook for drawing and editing polygon outlines on hex maps.
 * Handles vertex placement, double-click closure, selection, and editing.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { MapData, Outline } from '#types/core/map.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

const { HexGeometry } = await requireModuleByName("HexGeometry.ts") as {
  HexGeometry: new (...args: unknown[]) => IGeometry & {
    hexSize: number;
    worldToHex: (worldX: number, worldY: number) => { q: number; r: number };
    hexToWorld: (q: number, r: number) => { worldX: number; worldY: number };
    isWithinBounds: (q: number, r: number) => boolean;
  };
};

interface OutlineToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  mapData: MapData | null;
  geometry: IGeometry | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  onOutlinesChange: (outlines: Outline[]) => void;
}

interface UseOutlineToolsResult {
  drawingVertices: Point[];
  selectedOutlineId: string | null;
  isActive: boolean;
  handlePointerDown: (e: PointerEvent) => void;
  handlePointerMove: (e: PointerEvent) => void;
  handlePointerUp: (e: PointerEvent) => void;
  handleDoubleClick: (e: MouseEvent) => void;
  handleContextMenu: (e: MouseEvent) => void;
  cancelDrawing: () => void;
  deleteOutline: (outlineId: string) => void;
  updateOutline: (outlineId: string, updates: Partial<Outline>) => void;
  deselectOutline: () => void;
  outlineSettings: OutlineSettings;
  setOutlineSettings: (settings: Partial<OutlineSettings>) => void;
}

interface OutlineSettings {
  lineStyle: 'solid' | 'dashed' | 'dotted';
  lineWidth: number;
  filled: boolean;
  fillOpacity: number;
  snapMode: 'straight' | 'hex';
}

const DEFAULT_SETTINGS: OutlineSettings = {
  lineStyle: 'solid',
  lineWidth: 2,
  filled: false,
  fillOpacity: 0.25,
  snapMode: 'straight'
};

function generateOutlineId(): string {
  return `outline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function distanceToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((px - ax) * (px - ax) + (py - ay) * (py - ay));
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = ax + t * dx;
  const projY = ay + t * dy;
  return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
}

function useOutlineTools(options: OutlineToolsOptions): UseOutlineToolsResult {
  const {
    currentTool,
    selectedColor,
    mapData,
    geometry,
    screenToWorld,
    onOutlinesChange
  } = options;

  const isActive = currentTool === 'outline';

  const [drawingVertices, setDrawingVertices] = dc.useState<Point[]>([]);
  const [selectedOutlineId, setSelectedOutlineId] = dc.useState<string | null>(null);
  const [outlineSettings, setOutlineSettingsState] = dc.useState<OutlineSettings>(DEFAULT_SETTINGS);
  const [draggingVertexIndex, setDraggingVertexIndex] = dc.useState<number>(-1);
  const dragStartRef = dc.useRef<{ worldX: number; worldY: number } | null>(null);

  dc.useEffect(() => {
    if (!isActive) {
      setDrawingVertices([]);
      setSelectedOutlineId(null);
      setDraggingVertexIndex(-1);
    }
  }, [isActive]);

  const setOutlineSettings = dc.useCallback((updates: Partial<OutlineSettings>) => {
    setOutlineSettingsState((prev: OutlineSettings) => {
      const next = { ...prev, ...updates };
      // Apply changes to selected outline immediately
      if (selectedOutlineId && mapData?.outlines) {
        const outlines = (mapData.outlines || []).map(o =>
          o.id === selectedOutlineId ? { ...o, ...updates } : o
        );
        onOutlinesChange(outlines);
      }
      return next;
    });
  }, [selectedOutlineId, mapData, onOutlinesChange]);

  const getWorldCoords = dc.useCallback((e: PointerEvent | MouseEvent) => {
    if (!screenToWorld) return null;
    return screenToWorld(e.clientX, e.clientY);
  }, [screenToWorld]);

  // Hit-test: find outline nearest to a world-space point
  const findOutlineAtPoint = dc.useCallback((worldX: number, worldY: number): Outline | null => {
    if (!mapData?.outlines || !geometry || geometry.type !== 'hex') return null;
    const hexGeom = geometry as InstanceType<typeof HexGeometry>;
    const hitRadius = hexGeom.hexSize * 0.5;

    for (let i = (mapData.outlines.length - 1); i >= 0; i--) {
      const outline = mapData.outlines[i];
      if (!outline.visible || outline.vertices.length < 3) continue;

      for (let j = 0; j < outline.vertices.length; j++) {
        const a = outline.vertices[j];
        const b = outline.vertices[(j + 1) % outline.vertices.length];
        const dist = distanceToSegment(worldX, worldY, a.x, a.y, b.x, b.y);
        if (dist < hitRadius) return outline;
      }
    }
    return null;
  }, [mapData?.outlines, geometry]);

  // Find vertex near a world-space point (for editing)
  const findVertexAtPoint = dc.useCallback((worldX: number, worldY: number, outline: Outline): number => {
    if (!geometry || geometry.type !== 'hex') return -1;
    const hexGeom = geometry as InstanceType<typeof HexGeometry>;
    const hitRadius = hexGeom.hexSize * 0.4;

    for (let i = 0; i < outline.vertices.length; i++) {
      const v = outline.vertices[i];
      const dx = worldX - v.x;
      const dy = worldY - v.y;
      if (dx * dx + dy * dy < hitRadius * hitRadius) return i;
    }
    return -1;
  }, [geometry]);

  const handlePointerDown = dc.useCallback((e: PointerEvent) => {
    const world = getWorldCoords(e);
    if (!world) return;

    // If editing a selected outline, check for vertex drag
    if (selectedOutlineId && mapData?.outlines) {
      const outline = mapData.outlines.find(o => o.id === selectedOutlineId);
      if (outline) {
        const vertexIdx = findVertexAtPoint(world.worldX, world.worldY, outline);
        if (vertexIdx >= 0) {
          setDraggingVertexIndex(vertexIdx);
          dragStartRef.current = { worldX: world.worldX, worldY: world.worldY };
          e.preventDefault();
          return;
        }
      }
    }

    // If currently drawing, add vertex
    if (drawingVertices.length > 0) {
      setDrawingVertices(prev => [...prev, { x: world.worldX, y: world.worldY }]);
      return;
    }

    // Check if clicking an existing outline
    const hitOutline = findOutlineAtPoint(world.worldX, world.worldY);
    if (hitOutline) {
      setSelectedOutlineId(hitOutline.id);
      setOutlineSettingsState({
        lineStyle: hitOutline.lineStyle,
        lineWidth: hitOutline.lineWidth,
        filled: hitOutline.filled,
        fillOpacity: hitOutline.fillOpacity,
        snapMode: hitOutline.snapMode
      });
      return;
    }

    // Deselect if clicking empty space with an outline selected
    if (selectedOutlineId) {
      setSelectedOutlineId(null);
      return;
    }

    // Start new outline drawing
    setDrawingVertices([{ x: world.worldX, y: world.worldY }]);
  }, [getWorldCoords, drawingVertices.length, selectedOutlineId, mapData, findOutlineAtPoint, findVertexAtPoint]);

  const handlePointerMove = dc.useCallback((e: PointerEvent) => {
    if (draggingVertexIndex < 0 || !dragStartRef.current || !selectedOutlineId || !mapData?.outlines) return;
    const world = getWorldCoords(e);
    if (!world) return;

    const deltaX = world.worldX - dragStartRef.current.worldX;
    const deltaY = world.worldY - dragStartRef.current.worldY;
    dragStartRef.current = { worldX: world.worldX, worldY: world.worldY };

    const outlines = (mapData.outlines || []).map(o => {
      if (o.id !== selectedOutlineId) return o;
      const newVertices = [...o.vertices];
      const v = newVertices[draggingVertexIndex];
      newVertices[draggingVertexIndex] = { x: v.x + deltaX, y: v.y + deltaY };
      return { ...o, vertices: newVertices };
    });
    onOutlinesChange(outlines);
  }, [draggingVertexIndex, selectedOutlineId, mapData, getWorldCoords, onOutlinesChange]);

  const handlePointerUp = dc.useCallback((_e: PointerEvent) => {
    if (draggingVertexIndex >= 0) {
      setDraggingVertexIndex(-1);
      dragStartRef.current = null;
    }
  }, [draggingVertexIndex]);

  const handleDoubleClick = dc.useCallback((_e: MouseEvent) => {
    if (drawingVertices.length < 3 || !mapData) return;

    const newOutline: Outline = {
      id: generateOutlineId(),
      vertices: [...drawingVertices],
      color: selectedColor,
      lineStyle: outlineSettings.lineStyle,
      lineWidth: outlineSettings.lineWidth,
      filled: outlineSettings.filled,
      fillOpacity: outlineSettings.fillOpacity,
      snapMode: outlineSettings.snapMode,
      visible: true,
      order: (mapData.outlines || []).length
    };

    onOutlinesChange([...(mapData.outlines || []), newOutline]);
    setDrawingVertices([]);
  }, [drawingVertices, mapData, selectedColor, outlineSettings, onOutlinesChange]);

  const handleContextMenu = dc.useCallback((_e: MouseEvent) => {
    // Context menu handled by OutlineLayer via windrose:hex-context-menu
  }, []);

  const cancelDrawing = dc.useCallback(() => {
    setDrawingVertices([]);
    setSelectedOutlineId(null);
    setDraggingVertexIndex(-1);
  }, []);

  const deleteOutline = dc.useCallback((outlineId: string) => {
    if (!mapData) return;
    const outlines = (mapData.outlines || []).filter(o => o.id !== outlineId);
    onOutlinesChange(outlines);
    if (selectedOutlineId === outlineId) setSelectedOutlineId(null);
  }, [mapData, onOutlinesChange, selectedOutlineId]);

  const updateOutline = dc.useCallback((outlineId: string, updates: Partial<Outline>) => {
    if (!mapData) return;
    const outlines = (mapData.outlines || []).map(o =>
      o.id === outlineId ? { ...o, ...updates } : o
    );
    onOutlinesChange(outlines);
  }, [mapData, onOutlinesChange]);

  const deselectOutline = dc.useCallback(() => {
    setSelectedOutlineId(null);
  }, []);

  return {
    drawingVertices,
    selectedOutlineId,
    isActive,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleDoubleClick,
    handleContextMenu,
    cancelDrawing,
    deleteOutline,
    updateOutline,
    deselectOutline,
    outlineSettings,
    setOutlineSettings
  };
}

return { useOutlineTools };
