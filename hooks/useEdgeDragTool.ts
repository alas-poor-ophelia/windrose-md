/**
 * useEdgeDragTool.ts
 *
 * Manages edge painting/erasing via drag.
 * Owns its own isDrawing state for edge drag strokes.
 */

import type { IGeometry } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { ToolId } from '#types/tools/tool.types';
import type { Edge, MapStateContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

interface EdgeInfo {
  x: number;
  y: number;
  side: string;
}

const { addEdge, removeEdge, getEdgeAt } = await requireModuleByName("edgeOperations.ts") as {
  addEdge: (edges: Edge[], x: number, y: number, side: string, color: string, opacity: number) => Edge[];
  removeEdge: (edges: Edge[], x: number, y: number, side: string) => Edge[];
  getEdgeAt: (edges: Edge[], x: number, y: number, side: string) => Edge | null;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

interface UseEdgeDragToolOptions {
  currentTool: ToolId;
  mapData: MapData | null;
  geometry: IGeometry | null;
  GridGeometry: any;
  selectedColor: string;
  selectedOpacity: number;
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
}

interface UseEdgeDragToolResult {
  edgeIsDrawing: boolean;
  processedEdges: Set<string>;
  toggleEdge: (worldX: number, worldY: number, shouldPaint: boolean) => void;
  processEdgeDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  startEdgeDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  stopEdgeDrawing: () => void;
  cancelEdgeDrawing: () => void;
  setProcessedEdges: (v: Set<string>) => void;
}

function useEdgeDragTool({
  currentTool, mapData, geometry, GridGeometry, selectedColor, selectedOpacity,
  screenToWorld, getClientCoords, onEdgesChange
}: UseEdgeDragToolOptions): UseEdgeDragToolResult {

  const [edgeIsDrawing, setEdgeIsDrawing] = dc.useState<boolean>(false);
  const [processedEdges, setProcessedEdges] = dc.useState<Set<string>>(new Set());
  const strokeInitialEdgesRef = dc.useRef<Edge[] | null>(null);

  const toggleEdge = (worldX: number, worldY: number, shouldPaint: boolean): void => {
    if (!mapData || !geometry || !onEdgesChange) return;
    if (!(geometry instanceof GridGeometry)) return;

    const activeLayer = getActiveLayer(mapData);

    const edgeGeometry = geometry as { screenToEdge: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null };
    const edgeInfo = edgeGeometry.screenToEdge(worldX, worldY, 0.15);
    if (!edgeInfo) return;

    const { x, y, side } = edgeInfo;

    const isBatchedStroke = strokeInitialEdgesRef.current !== null;

    if (shouldPaint) {
      const newEdges = addEdge(activeLayer.edges || [], x, y, side, selectedColor, selectedOpacity);
      onEdgesChange(newEdges, isBatchedStroke);
    } else {
      const newEdges = removeEdge(activeLayer.edges || [], x, y, side);
      onEdgesChange(newEdges, isBatchedStroke);
    }
  };

  const processEdgeDuringDrag = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!geometry || !(geometry instanceof GridGeometry)) return;

    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return;

    const edgeGeometry = geometry as { screenToEdge: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null };
    const edgeInfo = edgeGeometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
    if (!edgeInfo) return;

    const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;

    if (processedEdges.has(edgeKey)) return;

    setProcessedEdges((prev: Set<string>) => new Set([...prev, edgeKey]));

    const shouldPaint = currentTool === 'edgeDraw';
    toggleEdge(worldCoords.worldX, worldCoords.worldY, shouldPaint);
  };

  const startEdgeDrawing = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);

    setEdgeIsDrawing(true);
    setProcessedEdges(new Set());
    strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
    processEdgeDuringDrag(e);
  };

  const stopEdgeDrawing = (): void => {
    if (!edgeIsDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setEdgeIsDrawing(false);
    setProcessedEdges(new Set());

    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(activeLayer.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };

  const cancelEdgeDrawing = (): void => {
    if (edgeIsDrawing) {
      setEdgeIsDrawing(false);
      setProcessedEdges(new Set());
      strokeInitialEdgesRef.current = null;
    }
  };

  return {
    edgeIsDrawing, processedEdges,
    toggleEdge, processEdgeDuringDrag,
    startEdgeDrawing, stopEdgeDrawing, cancelEdgeDrawing,
    setProcessedEdges
  };
}

return { useEdgeDragTool };
