/**
 * usePaintTool.ts
 *
 * Manages the paint/erase drag tool for cells, edges, objects, text labels, and curves.
 * Owns its own isDrawing state for paint/erase strokes.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { Curve } from '#types/core/curve.types';
import type { DragStartContext } from '#types/hooks/drawingTools.types';
import type { Edge, EdgeInfo, MapStateContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const {
  setCell: accessorSetCell,
  removeCell: accessorRemoveCell,
  getCellIndex
} = await requireModuleByName("cellAccessor.ts") as {
  setCell: (cells: Cell[], coords: Point, color: string, opacity: number, geometry: IGeometry) => Cell[];
  removeCell: (cells: Cell[], coords: Point, geometry: IGeometry) => Cell[];
  getCellIndex: (cells: Cell[], coords: Point, geometry: IGeometry) => number;
};

interface EraseResult {
  success: boolean;
  objects: MapObject[];
}

const { removeEdge, getEdgeAt } = await requireModuleByName("edgeOperations.ts") as {
  removeEdge: (edges: Edge[], x: number, y: number, side: string) => Edge[];
  getEdgeAt: (edges: Edge[], x: number, y: number, side: string) => Edge | null;
};

const { eraseObjectAt } = await requireModuleByName("objectOperations.ts") as {
  eraseObjectAt: (objects: MapObject[], x: number, y: number, mapType: string) => EraseResult;
};

const { eraseCellFromCurves, eraseWorldPolygonFromCurves } = await requireModuleByName("curveBoolean.ts") as {
  eraseCellFromCurves: (curves: Curve[], cellX: number, cellY: number, cellSize: number) => Curve[] | null;
  eraseWorldPolygonFromCurves: (curves: Curve[], clipVertices: [number, number][]) => Curve[] | null;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

interface UsePaintToolOptions {
  currentTool: ToolId;
  mapData: MapData | null;
  geometry: IGeometry | null;
  GridGeometry: any;
  selectedColor: string;
  selectedOpacity: number;
  canvasRef: { current: HTMLCanvasElement | null };
  screenToGrid: MapStateContextValue['screenToGrid'];
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: any[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  getTextLabelAtPosition: (labels: any[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => any;
  removeTextLabel: (labels: any[], id: string) => any[];
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
}

interface UsePaintToolResult {
  paintIsDrawing: boolean;
  processedCells: Set<string>;
  processedEdges: Set<string>;
  toggleCell: (coords: Point, shouldFill: boolean, dragStart?: DragStartContext | null) => void;
  processCellDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  startDrawing: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  stopDrawing: () => void;
  cancelPaintDrawing: () => void;
  setProcessedCells: (v: Set<string>) => void;
  setProcessedEdges: (v: Set<string>) => void;
  setIsDrawing: (v: boolean) => void;
}

function usePaintTool({
  currentTool, mapData, geometry, GridGeometry, selectedColor, selectedOpacity,
  canvasRef, screenToGrid, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  getTextLabelAtPosition, removeTextLabel, getObjectAtPosition
}: UsePaintToolOptions): UsePaintToolResult {

  const [paintIsDrawing, setPaintIsDrawing] = dc.useState<boolean>(false);
  const [processedCells, setProcessedCells] = dc.useState<Set<string>>(new Set());
  const [processedEdges, setProcessedEdges] = dc.useState<Set<string>>(new Set());

  const strokeInitialStateRef = dc.useRef<Cell[] | null>(null);
  const strokeInitialEdgesRef = dc.useRef<Edge[] | null>(null);
  const strokeInitialCurvesRef = dc.useRef<Curve[] | null>(null);

  const toggleCell = (coords: Point, shouldFill: boolean, dragStart: DragStartContext | null = null): void => {
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const q = (coords as { q?: number }).q !== undefined ? (coords as { q: number }).q : coords.x;
    const r = (coords as { r?: number }).r !== undefined ? (coords as { r: number }).r : coords.y;

    if ((geometry as { isWithinBounds?: (q: number, r: number) => boolean }).isWithinBounds &&
        !(geometry as { isWithinBounds: (q: number, r: number) => boolean }).isWithinBounds(q, r)) {
      return;
    }

    const isBatchedStroke = strokeInitialStateRef.current !== null;

    if (shouldFill) {
      const newCells = accessorSetCell(activeLayer.cells, coords, selectedColor, selectedOpacity, geometry);
      onCellsChange(newCells, isBatchedStroke);
    } else {
      const { clientX, clientY } = dragStart || { clientX: 0, clientY: 0 };
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;
        const textLabel = getTextLabelAtPosition(
          activeLayer.textLabels || [],
          worldCoords.worldX,
          worldCoords.worldY,
          ctx
        );
        if (textLabel) {
          const newLabels = removeTextLabel(activeLayer.textLabels || [], textLabel.id);
          onTextLabelsChange(newLabels);
          return;
        }

        if (geometry instanceof GridGeometry && onEdgesChange) {
          const edgeGeometry = geometry as { screenToEdge: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null };
          const edgeInfo = edgeGeometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
          if (edgeInfo) {
            const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;

            if (!processedEdges.has(edgeKey)) {
              const existingEdge = getEdgeAt(activeLayer.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                if (strokeInitialEdgesRef.current === null) {
                  strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
                }
                setProcessedEdges((prev: Set<string>) => new Set([...prev, edgeKey]));
                const newEdges = removeEdge(activeLayer.edges || [], edgeInfo.x, edgeInfo.y, edgeInfo.side);
                onEdgesChange(newEdges, isBatchedStroke);
                return;
              }
            }
          }
        }
      }

      const coordX = coords.x;
      const coordY = coords.y;
      const obj = getObjectAtPosition(activeLayer.objects || [], coordX, coordY);
      if (obj) {
        const mapType = mapData.mapType || 'grid';
        const result = eraseObjectAt(activeLayer.objects || [], coordX, coordY, mapType);
        if (result.success) {
          onObjectsChange(result.objects);
        }
      } else {
        let curveErased = false;
        if (activeLayer.curves && activeLayer.curves.length > 0 && geometry) {
          let newCurves: Curve[] | null = null;
          if (geometry.type === 'hex') {
            const hexGeo = geometry as { getHexVertices: (q: number, r: number) => { worldX: number; worldY: number }[] };
            const verts = hexGeo.getHexVertices(coordX, coordY);
            const clipPoly = verts.map(v => [v.worldX, v.worldY] as [number, number]);
            newCurves = eraseWorldPolygonFromCurves(activeLayer.curves, clipPoly);
          } else {
            const cellSize = (geometry as { cellSize: number }).cellSize;
            if (cellSize) {
              newCurves = eraseCellFromCurves(activeLayer.curves, coordX, coordY, cellSize);
            }
          }
          if (newCurves) {
            if (strokeInitialCurvesRef.current === null) {
              strokeInitialCurvesRef.current = activeLayer.curves;
            }
            onCurvesChange(newCurves, isBatchedStroke);
            curveErased = true;
          }
        }
        if (!curveErased && getCellIndex(activeLayer.cells, coords, geometry) !== -1) {
          const newCells = accessorRemoveCell(activeLayer.cells, coords, geometry);
          onCellsChange(newCells, isBatchedStroke);
        }
      }
    }
  };

  const processCellDuringDrag = (e: PointerEvent | MouseEvent | TouchEvent, dragStart: DragStartContext | null = null): void => {
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;

    const cellKey = coords.x !== undefined
      ? `${coords.x},${coords.y}`
      : `${(coords as { q: number }).q},${(coords as { r: number }).r}`;

    if (processedCells.has(cellKey)) return;

    setProcessedCells((prev: Set<string>) => new Set([...prev, cellKey]));

    const shouldFill = currentTool === 'draw';
    toggleCell(coords, shouldFill, { clientX, clientY });
  };

  const startDrawing = (e: PointerEvent | MouseEvent | TouchEvent, dragStart: DragStartContext | null = null): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);

    setPaintIsDrawing(true);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());
    strokeInitialStateRef.current = [...activeLayer.cells];
    strokeInitialEdgesRef.current = null;
    strokeInitialCurvesRef.current = null;
    processCellDuringDrag(e, dragStart);
  };

  const stopDrawing = (): void => {
    if (!paintIsDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setPaintIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());

    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(activeLayer.cells, false);
      strokeInitialStateRef.current = null;
    }
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(activeLayer.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
    if (strokeInitialCurvesRef.current !== null && mapData) {
      onCurvesChange(activeLayer.curves || [], false);
      strokeInitialCurvesRef.current = null;
    }
  };

  const cancelPaintDrawing = (): void => {
    if (paintIsDrawing) {
      setPaintIsDrawing(false);
      setProcessedCells(new Set());
      setProcessedEdges(new Set());
      strokeInitialStateRef.current = null;
      strokeInitialEdgesRef.current = null;
      strokeInitialCurvesRef.current = null;
    }
  };

  return {
    paintIsDrawing, processedCells, processedEdges,
    toggleCell, processCellDuringDrag, startDrawing, stopDrawing,
    cancelPaintDrawing,
    setProcessedCells, setProcessedEdges,
    setIsDrawing: setPaintIsDrawing
  };
}

return { usePaintTool };
