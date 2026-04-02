/**
 * useSegmentDragTool.ts
 *
 * Manages segment painting via drag (desktop only).
 * Owns its own isDrawing state for segment drag strokes.
 */

import type { Point, IGeometry } from '#types/core/geometry.types';
import type { Cell, SegmentName } from '#types/core/cell.types';
import type { MapData, MapLayer } from '#types/core/map.types';
import type { MapStateContextValue } from '#types/contexts/context.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { setSegments, getSegmentAtPosition, getLocalCellPosition } = await requireModuleByName("cellAccessor.ts") as {
  setSegments: (cells: Cell[], coords: Point, segments: SegmentName[], color: string, opacity: number, geometry: IGeometry) => Cell[];
  getSegmentAtPosition: (localX: number, localY: number) => SegmentName;
  getLocalCellPosition: (worldX: number, worldY: number, cellX: number, cellY: number, cellSize: number) => { localX: number; localY: number };
};

const { getActiveLayer } = await requireModuleByName("layerAccessor.ts") as {
  getActiveLayer: (mapData: MapData) => MapLayer;
};

interface UseSegmentDragToolOptions {
  mapData: MapData | null;
  geometry: IGeometry | null;
  GridGeometry: any;
  selectedColor: string;
  selectedOpacity: number;
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
}

interface UseSegmentDragToolResult {
  segmentIsDrawing: boolean;
  processedSegments: Set<string>;
  toggleSegment: (worldX: number, worldY: number) => void;
  processSegmentDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  startSegmentDrawing: (e: PointerEvent | MouseEvent | TouchEvent) => void;
  stopSegmentDrawing: () => void;
  cancelSegmentDrawing: () => void;
  setProcessedSegments: (v: Set<string>) => void;
}

function useSegmentDragTool({
  mapData, geometry, GridGeometry, selectedColor, selectedOpacity,
  screenToWorld, getClientCoords, onCellsChange
}: UseSegmentDragToolOptions): UseSegmentDragToolResult {

  const [segmentIsDrawing, setSegmentIsDrawing] = dc.useState<boolean>(false);
  const [processedSegments, setProcessedSegments] = dc.useState<Set<string>>(new Set());
  const strokeInitialStateRef = dc.useRef<Cell[] | null>(null);

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

    setSegmentIsDrawing(true);
    setProcessedSegments(new Set());
    strokeInitialStateRef.current = [...activeLayer.cells];
    processSegmentDuringDrag(e);
  };

  const stopSegmentDrawing = (): void => {
    if (!segmentIsDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setSegmentIsDrawing(false);
    setProcessedSegments(new Set());

    if (strokeInitialStateRef.current !== null && mapData) {
      onCellsChange(activeLayer.cells, false);
      strokeInitialStateRef.current = null;
    }
  };

  const cancelSegmentDrawing = (): void => {
    if (segmentIsDrawing) {
      setSegmentIsDrawing(false);
      setProcessedSegments(new Set());
      strokeInitialStateRef.current = null;
    }
  };

  return {
    segmentIsDrawing, processedSegments,
    toggleSegment, processSegmentDuringDrag,
    startSegmentDrawing, stopSegmentDrawing, cancelSegmentDrawing,
    setProcessedSegments
  };
}

return { useSegmentDragTool };
