/**
 * useSegmentDragTool.ts
 *
 * Manages segment painting via drag (desktop only).
 * Owns its own isDrawing state for segment drag strokes.
 */

import type { Cell } from '#types/core/cell.types';
import type { MapData } from '#types/core/map.types';
import type { ExtendedGeometry, MapStateContextValue } from '#types/contexts/context.types';

import { useRef, useState } from 'preact/hooks';
import { setSegments, getSegmentAtPosition } from '../../geometry/core/cellAccessor';
import { getActiveLayer } from '../../persistence/layerAccessor';








interface UseSegmentDragToolOptions {
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
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
  mapData, geometry, selectedColor, selectedOpacity,
  screenToWorld, getClientCoords, onCellsChange
}: UseSegmentDragToolOptions): UseSegmentDragToolResult {

  const [segmentIsDrawing, setSegmentIsDrawing] = useState<boolean>(false);
  const [processedSegments, setProcessedSegments] = useState<Set<string>>(new Set());
  const strokeInitialStateRef = useRef<Cell[] | null>(null);

  const toggleSegment = (worldX: number, worldY: number): void => {
    if (!mapData || !geometry) return;
    if (geometry.type !== 'grid') return;

    const activeLayer = getActiveLayer(mapData);

    const gridCoords = geometry.worldToGrid(worldX, worldY);
    const cellX = gridCoords.x;
    const cellY = gridCoords.y;

    const cellWorldX = cellX * geometry.cellSize;
    const cellWorldY = cellY * geometry.cellSize;
    const localX = (worldX - cellWorldX) / geometry.cellSize;
    const localY = (worldY - cellWorldY) / geometry.cellSize;

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
    if (!geometry || geometry.type !== 'grid') return;

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

    setSegmentIsDrawing(false);
    setProcessedSegments(new Set());

    if (strokeInitialStateRef.current !== null && mapData != null) {
      const activeLayer = getActiveLayer(mapData);
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

export { useSegmentDragTool };