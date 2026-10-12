/**
 * useShapeTools.ts
 *
 * Manages rectangle, circle, clear area, and edge line shape tools.
 * Handles 2-click shape placement, touch preview/confirm, and hover preview.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point } from '#types/core/geometry.types';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import type { Cell } from '#types/core/cell.types';
import type { MapData } from '#types/core/map.types';
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
import type { Edge } from '#types/core/rendering.types';
import type { MapStateContextValue } from '#types/contexts/context.types';
import type { HandleLevelCellsChange } from '#types/hooks/dataHandlers.types';
import type { GeometryLadder } from '../../geometry/core/createGeometryLadder';

import { useCallback, useState } from 'preact/hooks';
import { setCells, removeCellsInBounds } from '../../geometry/core/cellAccessor';
import { generateEdgeLine, mergeEdges } from '../../drawing/edgeOperations';
import { eraseRectangleFromCurves } from '../../geometry/curves/curveBoolean';
import { Notice } from 'obsidian';
import { authoredCells } from '../../persistence/layerAccessor';
import { canBeginDepthAuthoring, guardDepthWrite } from '../../persistence/depthAuthoring';
import { withCellsPainted, withCellsErased, depthRefusalMessage } from '../../drawing/depthCellOps';
import { getActiveLayer } from '../../persistence/layerAccessor';




interface CellUpdate {
  coords: Point;
  color: string;
  opacity: number;
}









interface UseShapeToolsOptions {
  currentTool: ToolId;
  selectedColor: string;
  selectedOpacity: number;
  /** Per-stroke edge thickness in px; null = automatic (theme-derived). */
  edgeWidth?: number | null;
  previewSettings: PreviewSettings;
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  removeObjectsInRectangle: (objects: MapObject[], x1: number, y1: number, x2: number, y2: number, homeLevel?: number) => MapObject[];
  /** Lattice ladder (null/absent on classic maps). Deep shapes need all four ladder options. */
  ladder?: GeometryLadder | null;
  getActiveLevel?: () => number;
  screenToLevelCell?: MapStateContextValue['screenToLevelCell'];
  onLevelCellsChange?: HandleLevelCellsChange;
}

interface UseShapeToolsResult {
  rectangleStart: RectangleStart | null;
  circleStart: CircleStart | null;
  edgeLineStart: EdgeLineStart | null;
  shapeHoverPosition: ShapeHoverPosition;
  touchConfirmPending: boolean;
  pendingEndPoint: PendingEndPoint | null;
  fillRectangle: (x1: number, y1: number, x2: number, y2: number, level?: number) => void;
  fillCircle: (edgeX: number, edgeY: number, centerX: number, centerY: number, level?: number) => void;
  clearRectangle: (x1: number, y1: number, x2: number, y2: number, level?: number) => void;
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
  currentTool, selectedColor, selectedOpacity, edgeWidth = null, previewSettings,
  mapData, geometry, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  removeObjectsInRectangle,
  ladder = null, getActiveLevel, screenToLevelCell, onLevelCellsChange
}: UseShapeToolsOptions): UseShapeToolsResult {

  const [rectangleStart, setRectangleStart] = useState<RectangleStart | null>(null);
  const [circleStart, setCircleStart] = useState<CircleStart | null>(null);
  const [edgeLineStart, setEdgeLineStart] = useState<EdgeLineStart | null>(null);
  const [shapeHoverPosition, setShapeHoverPosition] = useState<ShapeHoverPosition>(null);
  const [touchConfirmPending, setTouchConfirmPending] = useState<boolean>(false);
  const [pendingEndPoint, setPendingEndPoint] = useState<PendingEndPoint | null>(null);

  // Rung for a NEW shape, read once at its first pointerdown. 0 whenever the
  // map cannot take deep edits (flag off, classic map, quarantine).
  const latchShapeLevel = (): number =>
    (ladder !== null && getActiveLevel !== undefined && canBeginDepthAuthoring(mapData) ? getActiveLevel() : 0);

  // Write rung `level` through the guarded deep handler (one undo entry). A
  // refusal shows one notice and changes nothing.
  const writeRung = useCallback((level: number, next: (cells: Cell[]) => Cell[]): void => {
    if (!mapData || onLevelCellsChange === undefined) return;
    const layer = getActiveLayer(mapData);
    const current = authoredCells(layer, level);
    const proposed = next(current);
    if (proposed === current) return;
    const refusal = guardDepthWrite(mapData, layer.id, level, proposed);
    if (refusal !== null) {
      new Notice(depthRefusalMessage(refusal));
      return;
    }
    onLevelCellsChange(level, next, false);
  }, [mapData, onLevelCellsChange]);

  // Existing cells of a shape on rung `level`, from that rung's geometry.
  const deepShapeCells = useCallback((level: number, cells: Point[]): Point[] =>
    (ladder === null ? [] : cells.filter((c: Point) => ladder.existsAt(level, c.x, c.y))), [ladder]);

  const fillRectangle = useCallback((x1: number, y1: number, x2: number, y2: number, level: number = 0): void => {
    if (level > 0) {
      if (ladder === null) return;
      const coords = deepShapeCells(level, ladder.geometryForLevel(level).getCellsInRectangle(x1, y1, x2, y2));
      const color = selectedColor;
      const opacity = selectedOpacity;
      writeRung(level, (cells: Cell[]) => withCellsPainted(cells, coords, color, opacity));
      return;
    }
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
  }, [mapData, geometry, selectedColor, selectedOpacity, onCellsChange, ladder, deepShapeCells, writeRung]);

  const fillCircle = useCallback((edgeX: number, edgeY: number, centerX: number, centerY: number, level: number = 0): void => {
    const radius = Math.max(Math.abs(edgeX - centerX), Math.abs(edgeY - centerY));
    if (level > 0) {
      if (ladder === null) return;
      const coords = deepShapeCells(level, ladder.geometryForLevel(level).getCellsInCircle(centerX, centerY, radius));
      const color = selectedColor;
      const opacity = selectedOpacity;
      writeRung(level, (cells: Cell[]) => withCellsPainted(cells, coords, color, opacity));
      return;
    }
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);
    const cellsInCircle = geometry.getCellsInCircle(centerX, centerY, radius);
    const cellUpdates: CellUpdate[] = cellsInCircle.map((cellCoords: Point) => ({
      coords: cellCoords,
      color: selectedColor,
      opacity: selectedOpacity
    }));
    const newCells = setCells(activeLayer.cells, cellUpdates, geometry);
    onCellsChange(newCells);
  }, [mapData, geometry, selectedColor, selectedOpacity, onCellsChange, ladder, deepShapeCells, writeRung]);

  const clearRectangle = useCallback((x1: number, y1: number, x2: number, y2: number, level: number = 0): void => {
    // At depth the erase touches ONLY the rung's authored cells (design
    // section 19 item 4): no objects, text, edges or curves, never layer.cells.
    if (level > 0) {
      if (ladder === null) return;
      const coords = ladder.geometryForLevel(level).getCellsInRectangle(x1, y1, x2, y2);
      writeRung(level, (cells: Cell[]) => withCellsErased(cells, coords));
      return;
    }
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    // Level-0 clear (deep shapes write cells only): objects on other rungs stay.
    const newObjects = removeObjectsInRectangle(activeLayer.objects, x1, y1, x2, y2, 0);
    onObjectsChange(newObjects);

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const { worldX: worldMinX, worldY: worldMinY } = geometry.gridToWorld(minX, minY);
    const { worldX: worldMaxX, worldY: worldMaxY } = geometry.gridToWorld(maxX + 1, maxY + 1);

    const newTextLabels = activeLayer.textLabels.filter((label: TextLabel) => {
      return !(label.position.x >= worldMinX && label.position.x <= worldMaxX &&
               label.position.y >= worldMinY && label.position.y <= worldMaxY);
    });
    onTextLabelsChange(newTextLabels);

    const newCells = removeCellsInBounds(activeLayer.cells, x1, y1, x2, y2, geometry);
    onCellsChange(newCells);

    if (activeLayer.edges.length > 0) {
      const newEdges = activeLayer.edges.filter((edge: Edge) =>
        !(edge.x >= minX && edge.x <= maxX && edge.y >= minY && edge.y <= maxY)
      );
      if (newEdges.length !== activeLayer.edges.length) {
        onEdgesChange(newEdges);
      }
    }

    if (activeLayer.curves.length > 0) {
      const newCurves = eraseRectangleFromCurves(
        activeLayer.curves,
        worldMinX, worldMinY,
        worldMaxX, worldMaxY
      );
      if (newCurves) {
        onCurvesChange(newCurves);
      }
    }
  }, [mapData, geometry, removeObjectsInRectangle, onObjectsChange, onTextLabelsChange, onCellsChange, onEdgesChange, onCurvesChange, ladder, writeRung]);

  const fillEdgeLine = useCallback((x1: number, y1: number, x2: number, y2: number): void => {
    if (!mapData) return;
    if (!geometry || geometry.type !== 'grid') return;

    const activeLayer = getActiveLayer(mapData);

    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);

    let lineX1: number, lineY1: number, lineX2: number, lineY2: number;

    if (dx >= dy) {
      lineX1 = x1; lineY1 = y1; lineX2 = x2; lineY2 = y1;
    } else {
      lineX1 = x1; lineY1 = y1; lineX2 = x1; lineY2 = y2;
    }

    const newEdgesData = generateEdgeLine(lineX1, lineY1, lineX2, lineY2, selectedColor, edgeWidth ?? undefined);
    const newEdges = mergeEdges(activeLayer.edges, newEdgesData);
    onEdgesChange(newEdges);
  }, [mapData, geometry, selectedColor, edgeWidth, onEdgesChange]);

  const updateShapeHover = useCallback((gridX: number, gridY: number, clientX?: number, clientY?: number): void => {
    if (touchConfirmPending) return;

    const hasStart = (currentTool === 'circle' && circleStart != null) ||
                     ((currentTool === 'rectangle' || currentTool === 'clearArea') && rectangleStart != null) ||
                     (currentTool === 'edgeLine' && edgeLineStart != null);
    if (!hasStart) return;

    // A shape started on a ladder rung hovers in that rung's cells (the
    // preview draws with that rung's geometry); the root cell is only right
    // for a root start. Without client coords the rung cell cannot be
    // resolved, so the hover simply does not move.
    const activeStart = currentTool === 'circle' ? circleStart : rectangleStart;
    const level = activeStart?.level ?? 0;
    if (level > 0) {
      if (clientX === undefined || clientY === undefined) return;
      const cell = screenToLevelCell?.(clientX, clientY, level) ?? null;
      if (cell === null) return;
      setShapeHoverPosition({ x: cell.x, y: cell.y });
      return;
    }
    setShapeHoverPosition({ x: gridX, y: gridY });
  }, [currentTool, circleStart, rectangleStart, edgeLineStart, touchConfirmPending, screenToLevelCell]);

  const updateEdgeLineHover = useCallback((intX: number, intY: number): void => {
    if (touchConfirmPending) return;
    if (currentTool === 'edgeLine' && edgeLineStart) {
      setShapeHoverPosition({ x: intX, y: intY });
    }
  }, [currentTool, edgeLineStart, touchConfirmPending]);

  const isPointInShapeBounds = useCallback((x: number, y: number): boolean => {
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

  const confirmTouchShape = useCallback((): void => {
    if (!touchConfirmPending || !pendingEndPoint) return;

    if (currentTool === 'circle' && circleStart) {
      fillCircle(pendingEndPoint.x, pendingEndPoint.y, circleStart.x, circleStart.y, circleStart.level ?? 0);
      setCircleStart(null);
    } else if (currentTool === 'rectangle' && rectangleStart) {
      fillRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y, rectangleStart.level ?? 0);
      setRectangleStart(null);
    } else if (currentTool === 'clearArea' && rectangleStart) {
      clearRectangle(rectangleStart.x, rectangleStart.y, pendingEndPoint.x, pendingEndPoint.y, rectangleStart.level ?? 0);
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

  const cancelShapePreview = useCallback((): void => {
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
      // Edit level: the stored start's rung, else latched now. At depth the
      // caller's root-level cell is replaced by the latched rung's cell.
      const activeStart = currentTool === 'circle' ? circleStart : rectangleStart;
      const shapeLevel = activeStart != null ? (activeStart.level ?? 0) : latchShapeLevel();
      let sx = gridX;
      let sy = gridY;
      if (shapeLevel > 0) {
        const { clientX, clientY } = getClientCoords(e);
        const deep = screenToLevelCell?.(clientX, clientY, shapeLevel) ?? null;
        if (deep === null) return true;
        sx = deep.x;
        sy = deep.y;
      }
      if (touchConfirmPending && pendingEndPoint) {
        if (isPointInShapeBounds(sx, sy)) {
          confirmTouchShape();
        } else {
          cancelShapePreview();
        }
        return true;
      }

      if (currentTool === 'circle') {
        if (!circleStart) {
          setCircleStart({ x: sx, y: sy, level: shapeLevel });
          setShapeHoverPosition(null);
        } else if (touchPreviewEnabled) {
          setPendingEndPoint({ x: sx, y: sy });
          setTouchConfirmPending(true);
          setShapeHoverPosition({ x: sx, y: sy });
        } else {
          fillCircle(sx, sy, circleStart.x, circleStart.y, shapeLevel);
          setCircleStart(null);
          setShapeHoverPosition(null);
        }
      } else if (!rectangleStart) {
        setRectangleStart({ x: sx, y: sy, level: shapeLevel });
        setShapeHoverPosition(null);
      } else if (touchPreviewEnabled) {
        setPendingEndPoint({ x: sx, y: sy });
        setTouchConfirmPending(true);
        setShapeHoverPosition({ x: sx, y: sy });
      } else {
        if (currentTool === 'rectangle') {
          fillRectangle(rectangleStart.x, rectangleStart.y, sx, sy, shapeLevel);
        } else {
          clearRectangle(rectangleStart.x, rectangleStart.y, sx, sy, shapeLevel);
        }
        setRectangleStart(null);
        setShapeHoverPosition(null);
      }
      return true;
    }

    if (currentTool === 'edgeLine') {
      if (!geometry || geometry.type !== 'grid') return false;

      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return false;

      const cellSize = geometry.cellSize;
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

export { useShapeTools };