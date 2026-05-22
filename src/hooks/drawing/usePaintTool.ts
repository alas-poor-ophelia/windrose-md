/**
 * usePaintTool.ts
 *
 * Manages the paint/erase drag tool for cells, edges, objects, text labels, and curves.
 * Owns its own isDrawing state for paint/erase strokes.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point, IGeometry } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { Curve } from '#types/core/curve.types';
import type { TextLabel } from '#types/objects/note.types';
import type { HexTileAssignment } from '#types/tiles/tile.types';
import type { DragStartContext } from '#types/hooks/drawingTools.types';
import type { Edge, ExtendedGeometry, MapStateContextValue } from '#types/contexts/context.types';

import { useRef, useState } from 'preact/hooks';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, getCellIndex } from '../../geometry/core/cellAccessor';
import { removeEdge, getEdgeAt } from '../../drawing/edgeOperations';
import { eraseObjectAt } from '../../objects/objectOperations';
import { eraseCellFromCurves, eraseWorldPolygonFromCurves } from '../../geometry/curves/curveBoolean';
import { getActiveLayer } from '../../persistence/layerAccessor';















interface UsePaintToolOptions {
  currentTool: ToolId;
  mapData: MapData | null;
  geometry: IGeometry | null;
  GridGeometry: (new (...args: unknown[]) => ExtendedGeometry) | undefined;
  selectedColor: string;
  selectedOpacity: number;
  canvasRef: { current: HTMLCanvasElement | null };
  screenToGrid: MapStateContextValue['screenToGrid'];
  screenToWorld: MapStateContextValue['screenToWorld'];
  getClientCoords: MapStateContextValue['getClientCoords'];
  onCellsChange: (cells: Cell[], skipHistory?: boolean) => void;
  onCurvesChange: (curves: Curve[], skipHistory?: boolean) => void;
  onObjectsChange: (objects: MapObject[]) => void;
  onTextLabelsChange: (labels: TextLabel[]) => void;
  onEdgesChange: (edges: Edge[], skipHistory?: boolean) => void;
  onTilesChange?: (tiles: HexTileAssignment[], suppressHistory?: boolean) => void;
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
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
  onTilesChange, getTextLabelAtPosition, removeTextLabel, getObjectAtPosition
}: UsePaintToolOptions): UsePaintToolResult {

  const [paintIsDrawing, setPaintIsDrawing] = useState<boolean>(false);
  const [processedCells, setProcessedCells] = useState<Set<string>>(new Set());
  const [processedEdges, setProcessedEdges] = useState<Set<string>>(new Set());

  const strokeInitialStateRef = useRef<Cell[] | null>(null);
  const strokeInitialEdgesRef = useRef<Edge[] | null>(null);
  const strokeInitialCurvesRef = useRef<Curve[] | null>(null);
  const strokeInitialTilesRef = useRef<HexTileAssignment[] | null>(null);

  const toggleCell = (coords: Point, shouldFill: boolean, dragStart: DragStartContext | null = null): void => {
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const q = coords.x;
    const r = coords.y;

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

        if (GridGeometry && geometry instanceof GridGeometry && onEdgesChange) {
          const edgeGeometry = geometry as ExtendedGeometry;
          const edgeInfo = edgeGeometry.screenToEdge?.(worldCoords.worldX, worldCoords.worldY, 0.15);
          if (edgeInfo) {
            const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;

            if (!processedEdges.has(edgeKey)) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const existingEdge = getEdgeAt(activeLayer.edges as any, edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                if (strokeInitialEdgesRef.current === null) {
                  strokeInitialEdgesRef.current = [...(activeLayer.edges || [])];
                }
                setProcessedEdges((prev: Set<string>) => new Set([...prev, edgeKey]));
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const newEdges = removeEdge(activeLayer.edges as any, edgeInfo.x, edgeInfo.y, edgeInfo.side);
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
        // Erase tile at hex coords (overlay first, then base)
        let tileErased = false;
        if (geometry?.type === 'hex' && onTilesChange && activeLayer.tiles?.length) {
          const tiles = activeLayer.tiles as HexTileAssignment[];
          const overlayIdx = tiles.findIndex((t: HexTileAssignment) => t.q === coordX && t.r === coordY && t.layer === 'overlay');
          if (overlayIdx >= 0) {
            if (strokeInitialTilesRef.current === null) {
              strokeInitialTilesRef.current = [...tiles];
            }
            onTilesChange(tiles.filter((_: HexTileAssignment, i: number) => i !== overlayIdx), isBatchedStroke);
            tileErased = true;
          } else {
            const baseIdx = tiles.findIndex((t: HexTileAssignment) => t.q === coordX && t.r === coordY);
            if (baseIdx >= 0) {
              if (strokeInitialTilesRef.current === null) {
                strokeInitialTilesRef.current = [...tiles];
              }
              onTilesChange(tiles.filter((_: HexTileAssignment, i: number) => i !== baseIdx), isBatchedStroke);
              tileErased = true;
            }
          }
        }
        if (!tileErased) {
        let curveErased = false;
        if (activeLayer.curves && activeLayer.curves.length > 0 && geometry) {
          let newCurves: Curve[] | null = null;
          if (geometry.type === 'hex') {
            const hexGeo = geometry as unknown as { getHexVertices(q: number, r: number): { worldX: number; worldY: number }[] };
            const verts = hexGeo.getHexVertices(coordX, coordY);
            const clipPoly = verts.map((v: { worldX: number; worldY: number }) => [v.worldX, v.worldY] as [number, number]);
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
    }
  };

  const processCellDuringDrag = (e: PointerEvent | MouseEvent | TouchEvent, _dragStart: DragStartContext | null = null): void => {
    const { clientX, clientY } = getClientCoords(e);
    const coords = screenToGrid(clientX, clientY);
    if (!coords) return;

    const cellKey = `${coords.x},${coords.y}`;

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
    strokeInitialTilesRef.current = null;
    processCellDuringDrag(e, dragStart);
  };

  const stopDrawing = (): void => {
    if (!paintIsDrawing) return;

    const activeLayer = getActiveLayer(mapData!);

    setPaintIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());

    if (strokeInitialStateRef.current !== null && mapData) {
      if (JSON.stringify(activeLayer.cells) !== JSON.stringify(strokeInitialStateRef.current)) {
        onCellsChange(activeLayer.cells, false);
      }
      strokeInitialStateRef.current = null;
    }
    if (strokeInitialEdgesRef.current !== null && mapData && onEdgesChange) {
      if (JSON.stringify(activeLayer.edges || []) !== JSON.stringify(strokeInitialEdgesRef.current)) {
        onEdgesChange(activeLayer.edges || [], false);
      }
      strokeInitialEdgesRef.current = null;
    }
    if (strokeInitialCurvesRef.current !== null && mapData) {
      if (JSON.stringify(activeLayer.curves || []) !== JSON.stringify(strokeInitialCurvesRef.current)) {
        onCurvesChange(activeLayer.curves || [], false);
      }
      strokeInitialCurvesRef.current = null;
    }
    if (strokeInitialTilesRef.current !== null && mapData && onTilesChange) {
      if (JSON.stringify(activeLayer.tiles || []) !== JSON.stringify(strokeInitialTilesRef.current)) {
        onTilesChange(activeLayer.tiles || [], false);
      }
      strokeInitialTilesRef.current = null;
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
      strokeInitialTilesRef.current = null;
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

export { usePaintTool };