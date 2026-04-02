/**
 * useShapeTools.ts
 *
 * Manages rectangle, circle, clear area, and edge line shape tools.
 * Handles 2-click shape placement, touch preview/confirm, and hover preview.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { TextLabel } from '#types/objects/note.types';
import type { Curve } from '#types/core/curve.types';
import type {
  PreviewSettings,
  RectangleStart,
  CircleStart,
  EdgeLineStart,
  PendingEndPoint,
  ShapeHoverPosition,
} from '#types/hooks/drawingTools.types';
import type { Edge, MapStateContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

interface CellUpdate {
  coords: Point;
  color: string;
  opacity: number;
}

const { setCells, removeCellsInBounds } = await requireModuleByName("cellAccessor.ts") as {
  setCells: (cells: Cell[], updates: CellUpdate[], geometry: IGeometry) => Cell[];
  removeCellsInBounds: (cells: Cell[], x1: number, y1: number, x2: number, y2: number, geometry: IGeometry) => Cell[];
};

const { generateEdgeLine, mergeEdges } = await requireModuleByName("edgeOperations.ts") as {
  generateEdgeLine: (x1: number, y1: number, x2: number, y2: number, color: string) => Edge[];
  mergeEdges: (existing: Edge[], newEdges: Edge[]) => Edge[];
};

const { eraseRectangleFromCurves } = await requireModuleByName("curveBoolean.ts") as {
  eraseRectangleFromCurves: (curves: Curve[], worldMinX: number, worldMinY: number, worldMaxX: number, worldMaxY: number) => Curve[] | null;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

interface UseShapeToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  previewSettings: PreviewSettings;
  mapData: MapData | null;
  geometry: IGeometry | null;
  GridGeometry: any;
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  removeObjectsInRectangle: (objects: MapObject[], x1: number, y1: number, x2: number, y2: number) => MapObject[];
}

interface UseShapeToolsResult {
  rectangleStart: RectangleStart | null;
  circleStart: CircleStart | null;
  edgeLineStart: EdgeLineStart | null;
  shapeHoverPosition: ShapeHoverPosition;
  touchConfirmPending: boolean;
  pendingEndPoint: PendingEndPoint | null;
  fillRectangle: (x1: number, y1: number, x2: number, y2: number) => void;
  fillCircle: (edgeX: number, edgeY: number, centerX: number, centerY: number) => void;
  clearRectangle: (x1: number, y1: number, x2: number, y2: number) => void;
  fillEdgeLine: (x1: number, y1: number, x2: number, y2: number) => void;
  updateShapeHover: (gridX: number, gridY: number) => void;
  updateEdgeLineHover: (intX: number, intY: number) => void;
  isPointInShapeBounds: (x: number, y: number) => boolean;
  confirmTouchShape: () => void;
  cancelShapePreview: () => void;
  handleShapePointerDown: (
    e: PointerEvent | MouseEvent | TouchEvent,
    gridX: number,
    gridY: number,
    isTouchEvent?: boolean
  ) => boolean;
  resetShapeState: () => void;
  setRectangleStart: (v: RectangleStart | null) => void;
  setCircleStart: (v: CircleStart | null) => void;
  setEdgeLineStart: (v: EdgeLineStart | null) => void;
  setShapeHoverPosition: (v: ShapeHoverPosition) => void;
  setTouchConfirmPending: (v: boolean) => void;
  setPendingEndPoint: (v: PendingEndPoint | null) => void;
}

function useShapeTools({
  currentTool, selectedColor, selectedOpacity, previewSettings,
  mapData, geometry, GridGeometry, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  removeObjectsInRectangle
}: UseShapeToolsOptions): UseShapeToolsResult {

  const [rectangleStart, setRectangleStart] = dc.useState<RectangleStart | null>(null);
  const [circleStart, setCircleStart] = dc.useState<CircleStart | null>(null);
  const [edgeLineStart, setEdgeLineStart] = dc.useState<EdgeLineStart | null>(null);
  const [shapeHoverPosition, setShapeHoverPosition] = dc.useState<ShapeHoverPosition>(null);
  const [touchConfirmPending, setTouchConfirmPending] = dc.useState<boolean>(false);
  const [pendingEndPoint, setPendingEndPoint] = dc.useState<PendingEndPoint | null>(null);

  const fillRectangle = (x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData || !geometry) return;

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
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);
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
    if (!mapData || !geometry) return;

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

    if (activeLayer.curves && activeLayer.curves.length > 0) {
      const newCurves = eraseRectangleFromCurves(
        activeLayer.curves,
        worldMinX, worldMinY,
        worldMaxX, worldMaxY
      );
      if (newCurves) {
        onCurvesChange(newCurves);
      }
    }
  };

  const fillEdgeLine = (x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData || !onEdgesChange) return;
    if (!(geometry instanceof GridGeometry)) return;

    const activeLayer = getActiveLayer(mapData);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    let lineX1: number, lineY1: number, lineX2: number, lineY2: number;

    if (dx >= dy) {
      lineX1 = x1; lineY1 = y1; lineX2 = x2; lineY2 = y1;
    } else {
      lineX1 = x1; lineY1 = y1; lineX2 = x1; lineY2 = y2;
    }

    const newEdgesData = generateEdgeLine(lineX1, lineY1, lineX2, lineY2, selectedColor);
    const newEdges = mergeEdges(activeLayer.edges || [], newEdgesData);
    onEdgesChange(newEdges);
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

  const handleShapePointerDown = (
    e: PointerEvent | MouseEvent | TouchEvent,
    gridX: number,
    gridY: number,
    isTouchEvent: boolean = false
  ): boolean => {
    if (!mapData) return false;

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

    return false;
  };

  const resetShapeState = (): void => {
    setRectangleStart(null);
    setCircleStart(null);
    setEdgeLineStart(null);
    setShapeHoverPosition(null);
    setTouchConfirmPending(false);
    setPendingEndPoint(null);
  };

  return {
    rectangleStart, circleStart, edgeLineStart,
    shapeHoverPosition, touchConfirmPending, pendingEndPoint,
    fillRectangle, fillCircle, clearRectangle, fillEdgeLine,
    updateShapeHover, updateEdgeLineHover,
    isPointInShapeBounds, confirmTouchShape, cancelShapePreview,
    handleShapePointerDown, resetShapeState,
    setRectangleStart, setCircleStart, setEdgeLineStart,
    setShapeHoverPosition, setTouchConfirmPending, setPendingEndPoint
  };
}

return { useShapeTools };
