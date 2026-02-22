/**
 * useDrawingTools.ts
 *
 * Custom hook for managing drawing tools (paint, rectangle, circle, clear area, edge paint).
 * Handles all drawing-related state and operations including:
 * - Paint tool (draw/erase) with cell tracking
 * - Edge paint tool for painting grid edges
 * - Rectangle drawing
 * - Circle drawing
 * - Clear area tool
 * - Batched history management for strokes
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { Cell, SegmentName } from '#types/core/cell.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Edge } from '#types/core/edge.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/core/textLabel.types';
import type { Curve } from '#types/core/curve.types';
import type {
  PreviewSettings,
  RectangleStart,
  CircleStart,
  EdgeLineStart,
  PendingEndPoint,
  ShapeHoverPosition,
  SegmentPickerCell,
  SegmentHoverInfo,
  DragStartContext,
  UseDrawingToolsResult,
} from '#types/hooks/drawingTools.types';
import type { EdgeInfo } from '#types/contexts/context.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types - inline until contexts are fully typed
interface MapStateValue {
  geometry: (IGeometry & { cellSize: number; screenToEdge?: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null }) | null;
  canvasRef: { current: HTMLCanvasElement | null };
  mapData: MapData | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
  GridGeometry: GridGeometryConstructor;
}

interface GridGeometryConstructor {
  new (...args: unknown[]): IGeometry & {
    cellSize: number;
    screenToEdge: (worldX: number, worldY: number, threshold: number) => EdgeInfo | null;
    worldToGrid: (worldX: number, worldY: number) => Point;
  };
}

interface MapOperationsValue {
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
  removeObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject[];
  removeObjectsInRectangle: (objects: MapObject[], x1: number, y1: number, x2: number, y2: number) => MapObject[];
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.tsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => MapOperationsValue;
};

const { addEdge, removeEdge, getEdgeAt, generateEdgeLine, mergeEdges } = await requireModuleByName("edgeOperations.ts") as {
  addEdge: (edges: Edge[], x: number, y: number, side: string, color: string, opacity: number) => Edge[];
  removeEdge: (edges: Edge[], x: number, y: number, side: string) => Edge[];
  getEdgeAt: (edges: Edge[], x: number, y: number, side: string) => Edge | null;
  generateEdgeLine: (x1: number, y1: number, x2: number, y2: number, color: string) => Edge[];
  mergeEdges: (existing: Edge[], newEdges: Edge[]) => Edge[];
};

interface EraseResult {
  success: boolean;
  objects: MapObject[];
}

const { eraseObjectAt } = await requireModuleByName("objectOperations.ts") as {
  eraseObjectAt: (objects: MapObject[], x: number, y: number, mapType: string) => EraseResult;
};

const { eraseCellFromCurves } = await requireModuleByName("curveBoolean.ts") as {
  eraseCellFromCurves: (curves: Curve[], cellX: number, cellY: number, cellSize: number) => Curve[] | null;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

interface CellUpdate {
  coords: Point;
  color: string;
  opacity: number;
}

const {
  setCell: accessorSetCell,
  removeCell: accessorRemoveCell,
  setCells,
  removeCellsInBounds,
  getCellIndex,
  setSegments,
  removeSegments,
  getSegmentAtPosition,
  getLocalCellPosition
} = await requireModuleByName("cellAccessor.ts") as {
  setCell: (cells: Cell[], coords: Point, color: string, opacity: number, geometry: IGeometry) => Cell[];
  removeCell: (cells: Cell[], coords: Point, geometry: IGeometry) => Cell[];
  setCells: (cells: Cell[], updates: CellUpdate[], geometry: IGeometry) => Cell[];
  removeCellsInBounds: (cells: Cell[], x1: number, y1: number, x2: number, y2: number, geometry: IGeometry) => Cell[];
  getCellIndex: (cells: Cell[], coords: Point, geometry: IGeometry) => number;
  setSegments: (cells: Cell[], coords: Point, segments: SegmentName[], color: string, opacity: number, geometry: IGeometry) => Cell[];
  removeSegments: (cells: Cell[], coords: Point, segments: SegmentName[], geometry: IGeometry) => Cell[];
  getSegmentAtPosition: (localX: number, localY: number) => SegmentName;
  getLocalCellPosition: (worldX: number, worldY: number, cellX: number, cellY: number, cellSize: number) => { localX: number; localY: number };
};

/**
 * Hook for managing drawing tools
 */
const useDrawingTools = (
  currentTool: ToolId,
  selectedColor: string,
  selectedOpacity: number = 1,
  previewSettings: PreviewSettings = { kbmEnabled: true, touchEnabled: false }
): UseDrawingToolsResult => {
  const {
    geometry,
    canvasRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
    GridGeometry
  } = useMapState();

  const {
    onCellsChange,
    onCurvesChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    getTextLabelAtPosition,
    removeTextLabel,
    getObjectAtPosition,
    removeObjectsInRectangle
  } = useMapOperations();

  const [isDrawing, setIsDrawing] = dc.useState<boolean>(false);
  const [processedCells, setProcessedCells] = dc.useState<Set<string>>(new Set());
  const [processedEdges, setProcessedEdges] = dc.useState<Set<string>>(new Set());
  const [processedSegments, setProcessedSegments] = dc.useState<Set<string>>(new Set());
  const [rectangleStart, setRectangleStart] = dc.useState<RectangleStart | null>(null);
  const [circleStart, setCircleStart] = dc.useState<CircleStart | null>(null);
  const [edgeLineStart, setEdgeLineStart] = dc.useState<EdgeLineStart | null>(null);

  const [shapeHoverPosition, setShapeHoverPosition] = dc.useState<ShapeHoverPosition>(null);
  const [touchConfirmPending, setTouchConfirmPending] = dc.useState<boolean>(false);
  const [pendingEndPoint, setPendingEndPoint] = dc.useState<PendingEndPoint | null>(null);

  const [segmentPickerOpen, setSegmentPickerOpen] = dc.useState<boolean>(false);
  const [segmentPickerCell, setSegmentPickerCell] = dc.useState<SegmentPickerCell | null>(null);
  const [segmentPickerExistingCell, setSegmentPickerExistingCell] = dc.useState<Cell | null>(null);

  const [savedSegments, setSavedSegments] = dc.useState<SegmentName[]>([]);
  const [rememberSegments, setRememberSegments] = dc.useState<boolean>(true);

  const [segmentHoverInfo, setSegmentHoverInfo] = dc.useState<SegmentHoverInfo | null>(null);

  // Track initial state for batched history
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
      } else if (getCellIndex(activeLayer.cells, coords, geometry) !== -1) {
        const newCells = accessorRemoveCell(activeLayer.cells, coords, geometry);
        onCellsChange(newCells, isBatchedStroke);
      } else if (activeLayer.curves && activeLayer.curves.length > 0 && geometry) {
        // Try erasing from curves
        const cellSize = (geometry as { cellSize: number }).cellSize;
        if (cellSize) {
          const newCurves = eraseCellFromCurves(activeLayer.curves, coordX, coordY, cellSize);
          if (newCurves) {
            if (strokeInitialCurvesRef.current === null) {
              strokeInitialCurvesRef.current = activeLayer.curves;
            }
            onCurvesChange(newCurves, isBatchedStroke);
          }
        }
      }
    }
  };

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

    setIsDrawing(true);
    setProcessedEdges(new Set());
    strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
    processEdgeDuringDrag(e);
  };

  const stopEdgeDrawing = (): void => {
    if (!isDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setIsDrawing(false);
    setProcessedEdges(new Set());

    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      onEdgesChange(activeLayer.edges || [], false);
      strokeInitialEdgesRef.current = null;
    }
  };

  const toggleSegment = (worldX: number, worldY: number): void => {
    if (!mapData || !geometry) return;

    if (!(geometry instanceof GridGeometry)) return;

    const activeLayer = getActiveLayer(mapData);

    const gridGeometry = geometry as { worldToGrid: (worldX: number, worldY: number) => Point; cellSize: number };
    const gridCoords = gridGeometry.worldToGrid(worldX, worldY);
    const cellX = gridCoords.x;
    const cellY = gridCoords.y;

    const cellWorldX = cellX * gridGeometry.cellSize;
    const cellWorldY = cellY * gridGeometry.cellSize;
    const localX = (worldX - cellWorldX) / gridGeometry.cellSize;
    const localY = (worldY - cellWorldY) / gridGeometry.cellSize;

    const segment = getSegmentAtPosition(localX, localY);

    const segmentKey = `${cellX},${cellY},${segment}`;

    if (processedSegments.has(segmentKey)) return;

    setProcessedSegments((prev: Set<string>) => new Set([...prev, segmentKey]));

    const isBatchedStroke = strokeInitialStateRef.current !== null;

    const newCells = setSegments(
      activeLayer.cells,
      { x: cellX, y: cellY },
      [segment],
      selectedColor,
      selectedOpacity,
      geometry
    );
    onCellsChange(newCells, isBatchedStroke);
  };

  const processSegmentDuringDrag = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!geometry || !(geometry instanceof GridGeometry)) return;

    const { clientX, clientY } = getClientCoords(e);
    const worldCoords = screenToWorld(clientX, clientY);
    if (!worldCoords) return;

    toggleSegment(worldCoords.worldX, worldCoords.worldY);
  };

  const startSegmentDrawing = (e: PointerEvent | MouseEvent | TouchEvent): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);

    setIsDrawing(true);
    setProcessedSegments(new Set());
    strokeInitialStateRef.current = [...activeLayer.cells];
    processSegmentDuringDrag(e);
  };

  const stopSegmentDrawing = (): void => {
    if (!isDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setIsDrawing(false);
    setProcessedSegments(new Set());

    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(activeLayer.cells, false);
      strokeInitialStateRef.current = null;
    }
  };

  const openSegmentPicker = (cellX: number, cellY: number): void => {
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const existingCell = activeLayer.cells.find((c: Cell) => {
      const cx = (c as { x?: number }).x;
      const cy = (c as { y?: number }).y;
      return cx === cellX && cy === cellY;
    });

    setSegmentPickerCell({ x: cellX, y: cellY });
    setSegmentPickerExistingCell(existingCell || null);
    setSegmentPickerOpen(true);
  };

  const closeSegmentPicker = (): void => {
    setSegmentPickerOpen(false);
    setSegmentPickerCell(null);
    setSegmentPickerExistingCell(null);
  };

  const applySegmentSelection = (selectedSegments: SegmentName[], shouldRemember: boolean = true): void => {
    if (!mapData || !geometry || !segmentPickerCell) return;

    if (shouldRemember) {
      setSavedSegments(selectedSegments);
      setRememberSegments(true);
    } else {
      setRememberSegments(false);
    }

    const activeLayer = getActiveLayer(mapData);

    let newCells = activeLayer.cells.filter((c: Cell) => {
      const cx = (c as { x?: number }).x;
      const cy = (c as { y?: number }).y;
      return !(cx === segmentPickerCell.x && cy === segmentPickerCell.y);
    });

    if (selectedSegments.length > 0) {
      const coords = { x: segmentPickerCell.x, y: segmentPickerCell.y };

      newCells = setSegments(
        newCells,
        coords,
        selectedSegments,
        selectedColor,
        selectedOpacity,
        geometry
      );
    }

    onCellsChange(newCells);

    closeSegmentPicker();
  };

  const fillEdgeLine = (x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData || !onEdgesChange) return;
    if (!(geometry instanceof GridGeometry)) return;

    const activeLayer = getActiveLayer(mapData);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    let lineX1: number, lineY1: number, lineX2: number, lineY2: number;

    if (dx >= dy) {
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x2;
      lineY2 = y1;
    } else {
      lineX1 = x1;
      lineY1 = y1;
      lineX2 = x1;
      lineY2 = y2;
    }

    const newEdgesData = generateEdgeLine(lineX1, lineY1, lineX2, lineY2, selectedColor);

    const newEdges = mergeEdges(activeLayer.edges || [], newEdgesData);
    onEdgesChange(newEdges);
  };

  const fillRectangle = (x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData) return;
    if (!geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const cellsInRect = geometry.getCellsInRectangle(x1, y1, x2, y2);

    const cellUpdates: CellUpdate[] = cellsInRect.map((cellCoords: Point) => ({
      coords: cellCoords,
      color: selectedColor,
      opacity: selectedOpacity
    }));

    const newCells = setCells(activeLayer.cells, cellUpdates, geometry);
    onCellsChange(newCells);
  };

  const fillCircle = (edgeX: number, edgeY: number, centerX: number, centerY: number): void => {
    if (!mapData) return;

    if (!geometry) return;

    const activeLayer = getActiveLayer(mapData);

    // Use Chebyshev distance (max of |dx|, |dy|) so diagonal drags
    // give the same radius as orthogonal drags of the same cell count
    const radius = Math.max(Math.abs(edgeX - centerX), Math.abs(edgeY - centerY));
    const cellsInCircle = geometry.getCellsInCircle(centerX, centerY, radius);

    const cellUpdates: CellUpdate[] = cellsInCircle.map((cellCoords: Point) => ({
      coords: cellCoords,
      color: selectedColor,
      opacity: selectedOpacity
    }));

    const newCells = setCells(activeLayer.cells, cellUpdates, geometry);
    onCellsChange(newCells);
  };

  const clearRectangle = (x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData) return;

    if (!geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const newObjects = removeObjectsInRectangle(activeLayer.objects || [], x1, y1, x2, y2);
    onObjectsChange(newObjects);

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const { worldX: worldMinX, worldY: worldMinY } = geometry.gridToWorld(minX, minY);
    const { worldX: worldMaxX, worldY: worldMaxY } = geometry.gridToWorld(maxX + 1, maxY + 1);

    const newTextLabels = (activeLayer.textLabels || []).filter((label: TextLabel) => {
      return !(label.position.x >= worldMinX && label.position.x <= worldMaxX &&
               label.position.y >= worldMinY && label.position.y <= worldMaxY);
    });
    onTextLabelsChange(newTextLabels);

    const newCells = removeCellsInBounds(activeLayer.cells, x1, y1, x2, y2, geometry);
    onCellsChange(newCells);
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

    setIsDrawing(true);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());
    strokeInitialStateRef.current = [...activeLayer.cells];
    strokeInitialEdgesRef.current = null;
    strokeInitialCurvesRef.current = null;
    processCellDuringDrag(e, dragStart);
  };

  const stopDrawing = (): void => {
    if (!isDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setIsDrawing(false);
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

  const updateShapeHover = dc.useCallback((gridX: number, gridY: number): void => {
    if (touchConfirmPending) return;

    const hasStart = (currentTool === 'circle' && circleStart) ||
                     ((currentTool === 'rectangle' || currentTool === 'clearArea') && rectangleStart) ||
                     (currentTool === 'edgeLine' && edgeLineStart);

    if (hasStart) {
      setShapeHoverPosition({ x: gridX, y: gridY });
    }
  }, [currentTool, circleStart, rectangleStart, edgeLineStart, touchConfirmPending]);

  const updateEdgeLineHover = dc.useCallback((intX: number, intY: number): void => {
    if (touchConfirmPending) return;
    if (currentTool === 'edgeLine' && edgeLineStart) {
      setShapeHoverPosition({ x: intX, y: intY });
    }
  }, [currentTool, edgeLineStart, touchConfirmPending]);

  const updateSegmentHover = dc.useCallback((cellX: number, cellY: number, localX: number, localY: number): void => {
    if (isDrawing) {
      setSegmentHoverInfo(null);
      return;
    }

    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
      return;
    }

    const segment = getSegmentAtPosition(localX, localY);

    if (segment) {
      setSegmentHoverInfo({ cellX, cellY, segment });
    } else {
      setSegmentHoverInfo(null);
    }
  }, [currentTool, isDrawing]);

  dc.useEffect(() => {
    if (currentTool !== 'segmentDraw') {
      setSegmentHoverInfo(null);
    }
  }, [currentTool]);

  const clearSegmentHover = dc.useCallback((): void => {
    setSegmentHoverInfo(null);
  }, []);

  const isPointInShapeBounds = dc.useCallback((x: number, y: number): boolean => {
    if (!pendingEndPoint) return false;

    if (currentTool === 'circle' && circleStart) {
      const dx = pendingEndPoint.x - circleStart.x;
      const dy = pendingEndPoint.y - circleStart.y;
      const radius = Math.sqrt(dx * dx + dy * dy);

      const distFromCenter = Math.sqrt(
        Math.pow(x - circleStart.x, 2) + Math.pow(y - circleStart.y, 2)
      );
      return distFromCenter <= radius;
    }

    if ((currentTool === 'rectangle' || currentTool === 'clearArea') && rectangleStart) {
      const minX = Math.min(rectangleStart.x, pendingEndPoint.x);
      const maxX = Math.max(rectangleStart.x, pendingEndPoint.x);
      const minY = Math.min(rectangleStart.y, pendingEndPoint.y);
      const maxY = Math.max(rectangleStart.y, pendingEndPoint.y);

      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    if (currentTool === 'edgeLine' && edgeLineStart) {
      const minX = Math.min(edgeLineStart.x, pendingEndPoint.x) - 1;
      const maxX = Math.max(edgeLineStart.x, pendingEndPoint.x) + 1;
      const minY = Math.min(edgeLineStart.y, pendingEndPoint.y) - 1;
      const maxY = Math.max(edgeLineStart.y, pendingEndPoint.y) + 1;

      return x >= minX && x <= maxX && y >= minY && y <= maxY;
    }

    return false;
  }, [currentTool, circleStart, rectangleStart, edgeLineStart, pendingEndPoint]);

  const confirmTouchShape = dc.useCallback((): void => {
    if (!touchConfirmPending || !pendingEndPoint) return;

    if (currentTool === 'circle' && circleStart) {
      fillCircle(pendingEndPoint.x, pendingEndPoint.y, circleStart.x, circleStart.y);
      setCircleStart(null);
    } else if (currentTool === 'rectangle' && rectangleStart) {
      fillRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setRectangleStart(null);
    } else if (currentTool === 'clearArea' && rectangleStart) {
      clearRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setRectangleStart(null);
    } else if (currentTool === 'edgeLine' && edgeLineStart) {
      fillEdgeLine(edgeLineStart.x, edgeLineStart.y, pendingEndPoint.x, pendingEndPoint.y);
      setEdgeLineStart(null);
    }

    setTouchConfirmPending(false);
    setPendingEndPoint(null);
    setShapeHoverPosition(null);
  }, [touchConfirmPending, pendingEndPoint, currentTool, circleStart, rectangleStart, edgeLineStart,
      fillCircle, fillRectangle, clearRectangle, fillEdgeLine]);

  const cancelShapePreview = dc.useCallback((): void => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
    setShapeHoverPosition(null);
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
  }, []);

  const handleDrawingPointerDown = (
    e: PointerEvent | MouseEvent | TouchEvent,
    gridX: number,
    gridY: number,
    isTouchEvent: boolean = false
  ): boolean => {
    if (!mapData) return false;

    if ((e as MouseEvent).button === 2) return false;

    const isTouch = isTouchEvent || (e as TouchEvent).touches !== undefined || (e as PointerEvent).pointerType === 'touch';
    const touchPreviewEnabled = previewSettings.touchEnabled && isTouch;

    if (currentTool === 'rectangle' || currentTool === 'clearArea' || currentTool === 'circle') {

      if (touchConfirmPending && pendingEndPoint) {
        if (isPointInShapeBounds(gridX, gridY)) {
          confirmTouchShape();
        } else {
          cancelShapePreview();
        }
        return true;
      }

      if (currentTool === 'circle') {
        if (!circleStart) {
          setCircleStart({ x: gridX, y: gridY });
          setShapeHoverPosition(null);
        } else if (touchPreviewEnabled) {
          setPendingEndPoint({ x: gridX, y: gridY });
          setTouchConfirmPending(true);
          setShapeHoverPosition({ x: gridX, y: gridY });
        } else {
          fillCircle(gridX, gridY, circleStart.x, circleStart.y);
          setCircleStart(null);
          setShapeHoverPosition(null);
        }
      } else if (!rectangleStart) {
        setRectangleStart({ x: gridX, y: gridY });
        setShapeHoverPosition(null);
      } else if (touchPreviewEnabled) {
        setPendingEndPoint({ x: gridX, y: gridY });
        setTouchConfirmPending(true);
        setShapeHoverPosition({ x: gridX, y: gridY });
      } else {
        if (currentTool === 'rectangle') {
          fillRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        } else {
          clearRectangle(rectangleStart.x, rectangleStart.y, gridX, gridY);
        }
        setRectangleStart(null);
        setShapeHoverPosition(null);
      }
      return true;
    }

    if (currentTool === 'edgeLine') {
      if (!(geometry instanceof GridGeometry)) return false;

      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return false;

      const gridGeometry = geometry as { cellSize: number };
      const cellSize = gridGeometry.cellSize;
      const nearestX = Math.round(worldCoords.worldX / cellSize);
      const nearestY = Math.round(worldCoords.worldY / cellSize);

      if (touchConfirmPending && pendingEndPoint) {
        if (isPointInShapeBounds(nearestX, nearestY)) {
          confirmTouchShape();
        } else {
          cancelShapePreview();
        }
        return true;
      }

      if (!edgeLineStart) {
        setEdgeLineStart({ x: nearestX, y: nearestY });
        setShapeHoverPosition(null);
      } else if (touchPreviewEnabled) {
        setPendingEndPoint({ x: nearestX, y: nearestY });
        setTouchConfirmPending(true);
        setShapeHoverPosition({ x: nearestX, y: nearestY });
      } else {
        fillEdgeLine(edgeLineStart.x, edgeLineStart.y, nearestX, nearestY);
        setEdgeLineStart(null);
        setShapeHoverPosition(null);
      }
      return true;
    }

    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      startEdgeDrawing(e);
      return true;
    }

    if (currentTool === 'segmentDraw') {
      if (isTouch) {
        if (geometry instanceof GridGeometry) {
          openSegmentPicker(gridX, gridY);
        }
      } else {
        startSegmentDrawing(e);
      }
      return true;
    }

    if (currentTool === 'draw' || currentTool === 'erase') {
      startDrawing(e);
      return true;
    }

    return false;
  };

  const handleDrawingPointerMove = (e: PointerEvent | MouseEvent | TouchEvent, dragStart: DragStartContext | null = null): boolean => {
    if (isDrawing && (currentTool === 'edgeDraw' || currentTool === 'edgeErase')) {
      processEdgeDuringDrag(e);
      return true;
    }

    if (isDrawing && currentTool === 'segmentDraw') {
      processSegmentDuringDrag(e);
      return true;
    }

    if (isDrawing && (currentTool === 'draw' || currentTool === 'erase')) {
      processCellDuringDrag(e, dragStart);
      return true;
    }
    return false;
  };

  const cancelDrawing = (): void => {
    if (isDrawing) {
      setIsDrawing(false);
      setProcessedCells(new Set());
      setProcessedEdges(new Set());
      setProcessedSegments(new Set());
      strokeInitialStateRef.current = null;
      strokeInitialEdgesRef.current = null;
    }
  };

  const resetDrawingState = (): void => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
    setShapeHoverPosition(null);
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
    cancelDrawing();
  };

  dc.useEffect(() => {
    resetDrawingState();
  }, [currentTool]);

  return {
    isDrawing,
    rectangleStart,
    circleStart,
    edgeLineStart,

    shapeHoverPosition,
    touchConfirmPending,
    pendingEndPoint,

    toggleCell,
    fillRectangle,
    fillCircle,
    clearRectangle,
    processCellDuringDrag,
    startDrawing,
    stopDrawing,

    toggleEdge,
    processEdgeDuringDrag,
    startEdgeDrawing,
    stopEdgeDrawing,
    fillEdgeLine,

    toggleSegment,
    processSegmentDuringDrag,
    startSegmentDrawing,
    stopSegmentDrawing,

    segmentPickerOpen,
    segmentPickerCell,
    segmentPickerExistingCell,
    openSegmentPicker,
    closeSegmentPicker,
    applySegmentSelection,
    savedSegments,
    rememberSegments,

    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,

    updateShapeHover,
    updateEdgeLineHover,
    isPointInShapeBounds,
    confirmTouchShape,
    cancelShapePreview,

    segmentHoverInfo,
    updateSegmentHover,
    clearSegmentHover,

    setIsDrawing,
    setProcessedCells,
    setProcessedEdges,
    setProcessedSegments,
    setRectangleStart,
    setCircleStart,
    setEdgeLineStart,
    setShapeHoverPosition,
    setTouchConfirmPending,
    setPendingEndPoint
  };
};

return { useDrawingTools };
