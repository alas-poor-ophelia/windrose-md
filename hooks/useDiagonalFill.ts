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
import type { Point, ScreenCoords, IGeometry } from '#types/core/geometry.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { Cell, CellMap, SegmentName } from '#types/core/cell.types';
import type {
  CornerName,
  DiagonalFillStart,
  DiagonalFillEnd,
  DiagonalFillPreview,
  ScreenPosition,
  DiagonalFillViewState,
  UseDiagonalFillResult,
} from '#types/hooks/diagonalFill.types';

// Datacore imports
const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath) as {
  requireModuleByName: (name: string) => Promise<unknown>
};

// Context types
interface MapStateValue {
  geometry: (IGeometry & { cellSize: number }) | null;
  mapData: MapData | null;
  screenToWorld: (clientX: number, clientY: number) => { worldX: number; worldY: number } | null;
  screenToGrid: (clientX: number, clientY: number) => Point | null;
  getClientCoords: (e: PointerEvent | MouseEvent | TouchEvent) => { clientX: number; clientY: number };
}

interface MapOperationsValue {
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
}

const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx") as {
  useMapState: () => MapStateValue;
  useMapOperations: () => MapOperationsValue;
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

const { buildCellMap, setSegments } = await requireModuleByName("cellAccessor.ts") as {
  buildCellMap: (cells: Cell[], geometry: IGeometry) => CellMap;
  setSegments: (cells: Cell[], coords: Point, segments: SegmentName[], color: string, opacity: number, geometry: IGeometry) => Cell[];
};

interface LocalPosition {
  localX: number;
  localY: number;
}

interface ColorInfo {
  color: string;
  opacity: number;
}

interface ValidCorner {
  x: number;
  y: number;
}

interface PathValidation {
  valid: boolean;
  endX: number;
  endY: number;
}

const {
  getNearestCorner,
  getLocalPosition,
  isValidConcaveCorner,
  findValidCornerForCell,
  findNearestValidCorner,
  validateDiagonalPath,
  getValidCornersAlongDiagonal,
  getInheritedColor,
  getSegmentsForCorner
} = await requireModuleByName("diagonalFillOperations.ts") as {
  getNearestCorner: (localX: number, localY: number) => CornerName;
  getLocalPosition: (worldX: number, worldY: number, cellX: number, cellY: number, cellSize: number) => LocalPosition;
  isValidConcaveCorner: (cellMap: CellMap, x: number, y: number, corner: CornerName) => boolean;
  findValidCornerForCell: (cellMap: CellMap, x: number, y: number, hintCorner: CornerName) => CornerName | null;
  findNearestValidCorner: (cellMap: CellMap, x: number, y: number, corner: CornerName, radius: number) => ValidCorner | null;
  validateDiagonalPath: (cellMap: CellMap, start: DiagonalFillStart, endX: number, endY: number) => PathValidation | null;
  getValidCornersAlongDiagonal: (cellMap: CellMap, startX: number, startY: number, endX: number, endY: number, corner: CornerName) => ValidCorner[];
  getInheritedColor: (cellMap: CellMap, x: number, y: number, corner: CornerName) => ColorInfo | null;
  getSegmentsForCorner: (corner: CornerName) => SegmentName[];
};

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

  const [fillStart, setFillStart] = dc.useState<DiagonalFillStart | null>(null);
  const [fillEnd, setFillEnd] = dc.useState<DiagonalFillEnd | null>(null);
  const [isEndLocked, setIsEndLocked] = dc.useState<boolean>(false);
  const [previewEnd, setPreviewEnd] = dc.useState<DiagonalFillPreview | null>(null);

  const cellMap = dc.useMemo((): CellMap => {
    if (!mapData || !geometry) return new Map();
    const activeLayer = getActiveLayer(mapData);
    return buildCellMap(activeLayer.cells || [], geometry);
  }, [mapData, geometry]);

  dc.useEffect(() => {
    if (currentTool !== 'diagonalFill') {
      setFillStart(null);
      setFillEnd(null);
      setIsEndLocked(false);
      setPreviewEnd(null);
    }
  }, [currentTool]);

  const resetState = dc.useCallback((): void => {
    setFillStart(null);
    setFillEnd(null);
    setIsEndLocked(false);
    setPreviewEnd(null);
  }, []);

  const executeFillPath = dc.useCallback(
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

  const handleDiagonalFillClick = dc.useCallback(
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

  const handleDiagonalFillMove = dc.useCallback(
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

  const executeFill = dc.useCallback((): void => {
    if (!fillStart || !fillEnd) return;
    executeFillPath(fillStart, fillEnd);
    resetState();
  }, [fillStart, fillEnd, executeFillPath, resetState]);

  const cancelFill = dc.useCallback((): void => {
    resetState();
  }, [resetState]);

  const getCornerScreenPosition = dc.useCallback(
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

return { useDiagonalFill };
