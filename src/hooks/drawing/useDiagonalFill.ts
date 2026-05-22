/**
 * useDiagonalFill.ts
 *
 * Hook for managing diagonal fill tool state and operations.
 * Handles corner detection, path preview, and segment fill execution.
 *
 * Interaction Model:
 * - Desktop: Click start corner → hover preview → click end corner → fill
 * - Touch: Tap start → tap end → tap confirm/cancel
 *
 * The tool fills "concave corners" along a staircase diagonal by painting
 * 4 segments (half-cell) in each gap, creating smooth diagonal edges.
 */

// Type-only imports
import type { ToolId } from '#types/tools/tool.types';
import type { CellMap } from '#types/core/cell.types';
import type {
  CornerName,
  DiagonalFillStart,
  DiagonalFillEnd,
  DiagonalFillPreview,
  ScreenPosition,
  DiagonalFillViewState,
  UseDiagonalFillResult,
} from '#types/hooks/diagonalFill.types';



import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { buildCellMap, setSegments } from '../../geometry/core/cellAccessor';
import { getNearestCorner, getLocalPosition, findValidCornerForCell, findNearestValidCorner, validateDiagonalPath, getValidCornersAlongDiagonal, getInheritedColor, getSegmentsForCorner } from '../../drawing/diagonalFillOperations';













/**
 * Hook for diagonal fill tool
 */
const useDiagonalFill = (currentTool: ToolId): UseDiagonalFillResult => {
  const {
    geometry,
    mapData,
    screenToWorld,
    screenToGrid,
    getClientCoords
  } = useMapState();

  const { onCellsChange } = useMapOperations();

  const [fillStart, setFillStart] = useState<DiagonalFillStart | null>(null);
  const [fillEnd, setFillEnd] = useState<DiagonalFillEnd | null>(null);
  const [isEndLocked, setIsEndLocked] = useState<boolean>(false);
  const [previewEnd, setPreviewEnd] = useState<DiagonalFillPreview | null>(null);

  const cellMap = useMemo((): CellMap => {
    if (!mapData || !geometry) return new Map();
    const activeLayer = getActiveLayer(mapData);
    return buildCellMap(activeLayer.cells || [], geometry);
  }, [mapData, geometry]);

  useEffect(() => {
    if (currentTool !== 'diagonalFill') {
      setFillStart(null);
      setFillEnd(null);
      setIsEndLocked(false);
      setPreviewEnd(null);
    }
  }, [currentTool]);

  const resetState = useCallback((): void => {
    setFillStart(null);
    setFillEnd(null);
    setIsEndLocked(false);
    setPreviewEnd(null);
  }, []);

  const executeFillPath = useCallback(
    (start: DiagonalFillStart, end: DiagonalFillEnd): void => {
      if (!start || !end || !geometry || !mapData) return;

      const activeLayer = getActiveLayer(mapData);
      const currentCellMap = buildCellMap(activeLayer.cells || [], geometry);

      const validCorners = getValidCornersAlongDiagonal(
        currentCellMap, start.x, start.y, end.x, end.y, start.corner
      );

      if (validCorners.length === 0) return;

      const colorInfo = getInheritedColor(currentCellMap, start.x, start.y, start.corner);
      if (!colorInfo) return;

      const segments = getSegmentsForCorner(start.corner);
      if (segments.length === 0) return;

      let updatedCells = [...(activeLayer.cells || [])];

      for (const { x, y } of validCorners) {
        updatedCells = setSegments(
          updatedCells,
          { x, y },
          segments,
          colorInfo.color,
          colorInfo.opacity,
          geometry
        );
      }

      onCellsChange(updatedCells, false);
    },
    [geometry, mapData, onCellsChange]
  );

  const handleDiagonalFillClick = useCallback(
    (e: PointerEvent | MouseEvent | TouchEvent, isTouch: boolean = false): boolean => {
      if (currentTool !== 'diagonalFill' || !geometry || !mapData) {
        return false;
      }

      const { clientX, clientY } = getClientCoords(e);
      const worldCoords = screenToWorld(clientX, clientY);
      if (!worldCoords) return false;

      const gridCoords = screenToGrid(clientX, clientY);
      if (!gridCoords) return false;

      const { x, y } = gridCoords;

      const cellSize = geometry.cellSize;
      const { localX, localY } = getLocalPosition(
        worldCoords.worldX, worldCoords.worldY,
        x, y, cellSize
      );

      const corner = getNearestCorner(localX, localY);

      // Touch confirmation mode
      if (isTouch && isEndLocked && fillEnd) {
        const distToEnd = Math.sqrt(
          Math.pow(x - fillEnd.x, 2) + Math.pow(y - fillEnd.y, 2)
        );

        if (distToEnd <= 1.5) {
          executeFill();
          return true;
        } else {
          setFillEnd(null);
          setIsEndLocked(false);
          setPreviewEnd(null);
          return true;
        }
      }

      if (!fillStart) {
        const validCorner = findValidCornerForCell(cellMap, x, y, corner);

        if (!validCorner) {
          return false;
        }

        setFillStart({ x, y, corner: validCorner });
        setPreviewEnd(null);
        return true;
      }

      const validation = validateDiagonalPath(cellMap, fillStart, x, y);

      if (!validation || !validation.valid) {
        if (isTouch) {
          const snapped = findNearestValidCorner(cellMap, x, y, fillStart.corner, 3);
          if (snapped) {
            const revalidation = validateDiagonalPath(cellMap, fillStart, snapped.x, snapped.y);
            if (revalidation && revalidation.valid) {
              if (isTouch) {
                setFillEnd({ x: revalidation.endX, y: revalidation.endY });
                setIsEndLocked(true);
              } else {
                executeFillPath(fillStart, { x: revalidation.endX, y: revalidation.endY });
                resetState();
              }
              return true;
            }
          }
        }
        return false;
      }

      if (isTouch) {
        setFillEnd({ x: validation.endX, y: validation.endY });
        setIsEndLocked(true);
      } else {
        executeFillPath(fillStart, { x: validation.endX, y: validation.endY });
        resetState();
      }

      return true;
    },
    [currentTool, geometry, mapData, cellMap, fillStart, fillEnd, isEndLocked, getClientCoords, screenToWorld, screenToGrid, executeFillPath, resetState]
  );

  const handleDiagonalFillMove = useCallback(
    (e: PointerEvent | MouseEvent): void => {
      if (currentTool !== 'diagonalFill' || !geometry || !fillStart || isEndLocked) {
        return;
      }

      const { clientX, clientY } = getClientCoords(e);
      const gridCoords = screenToGrid(clientX, clientY);

      if (!gridCoords) {
        setPreviewEnd(null);
        return;
      }

      const { x, y } = gridCoords;

      const validation = validateDiagonalPath(cellMap, fillStart, x, y);

      if (validation && validation.valid) {
        setPreviewEnd({ x: validation.endX, y: validation.endY });
      } else {
        setPreviewEnd(null);
      }
    },
    [currentTool, geometry, fillStart, isEndLocked, cellMap, getClientCoords, screenToGrid]
  );

  const executeFill = useCallback((): void => {
    if (!fillStart || !fillEnd) return;
    executeFillPath(fillStart, fillEnd);
    resetState();
  }, [fillStart, fillEnd, executeFillPath, resetState]);

  const cancelFill = useCallback((): void => {
    resetState();
  }, [resetState]);

  const getCornerScreenPosition = useCallback(
    (
      cellX: number,
      cellY: number,
      corner: CornerName,
      viewState: DiagonalFillViewState,
      canvasWidth: number,
      canvasHeight: number
    ): ScreenPosition => {
      if (!geometry) return { x: 0, y: 0 };

      const { zoom, center } = viewState;
      const cellSize = geometry.cellSize;
      const scaledCellSize = cellSize * zoom;

      const offsetX = canvasWidth / 2 - center.x * scaledCellSize;
      const offsetY = canvasHeight / 2 - center.y * scaledCellSize;

      const { screenX, screenY } = geometry.gridToScreen(
        cellX, cellY, offsetX, offsetY, zoom
      );

      const cornerOffsets: Record<CornerName, { x: number; y: number }> = {
        'TL': { x: 0, y: 0 },
        'TR': { x: scaledCellSize, y: 0 },
        'BR': { x: scaledCellSize, y: scaledCellSize },
        'BL': { x: 0, y: scaledCellSize }
      };

      const offset = cornerOffsets[corner] || { x: 0, y: 0 };

      return {
        x: screenX + offset.x,
        y: screenY + offset.y
      };
    },
    [geometry]
  );

  return {
    fillStart,
    fillEnd,
    isEndLocked,
    previewEnd,
    handleDiagonalFillClick,
    handleDiagonalFillMove,
    executeFill,
    cancelFill,
    getCornerScreenPosition,
    resetState
  };
};

export { useDiagonalFill };