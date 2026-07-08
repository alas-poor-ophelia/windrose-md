/**
 * usePaintTool.ts
 *
 * Manages the paint/erase drag tool for cells, edges, objects, text labels, curves,
 * tiles, wall/path strips, and terrain strokes (the latter three erase whole entries).
 * Owns its own isDrawing state for paint/erase strokes.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { Point } from '#types/core/geometry.types';
import type { Cell } from '#types/core/cell.types';
import type { MapData } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { Curve } from '#types/core/curve.types';
import type { TextLabel } from '#types/objects/note.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';
import type { DragStartContext } from '#types/hooks/drawingTools.types';
import type { Edge } from '#types/core/rendering.types';
import type { ExtendedGeometry, MapStateContextValue } from '#types/contexts/context.types';

import { useRef, useState } from 'preact/hooks';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, getCellIndex } from '../../geometry/core/cellAccessor';
import { removeEdge, getEdgeAt } from '../../drawing/edgeOperations';
import { eraseObjectAt } from '../../objects/objectOperations';
import { eraseCellFromCurves, eraseWorldPolygonFromCurves } from '../../geometry/curves/curveBoolean';
import { getActiveLayer } from '../../persistence/layerAccessor';
import { assignmentCoversCell } from '../../assets/tileFootprint';
import { distanceToWallPath } from '../../drawing/wallPathOperations';
import { distancePointToPolyline } from '../../geometry/strokes/terrainStrokeGeometry';

/**
 * Detects whether a stroke changed layer data against its start-of-stroke
 * snapshot. Cheap reference/length checks first; deep compare only as fallback
 * (equal-length arrays can still differ, e.g. a recolor).
 */
function strokeChanged<T>(current: readonly T[], initial: readonly T[]): boolean {
  if (current === initial) return false;
  if (current.length !== initial.length) return true;
  return JSON.stringify(current) !== JSON.stringify(initial);
}

interface UsePaintToolOptions {
  currentTool: ToolId;
  mapData: MapData | null;
  geometry: ExtendedGeometry | null;
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
  onTilesChange?: (tiles: TileAssignment[], suppressHistory?: boolean) => void;
  onWallPathsChange?: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  onTerrainStrokesChange?: (strokes: TerrainStroke[], suppressHistory?: boolean) => void;
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
  currentTool, mapData, geometry, selectedColor, selectedOpacity,
  canvasRef, screenToGrid, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  onTilesChange, onWallPathsChange, onTerrainStrokesChange,
  getTextLabelAtPosition, removeTextLabel, getObjectAtPosition
}: UsePaintToolOptions): UsePaintToolResult {

  const [paintIsDrawing, setPaintIsDrawing] = useState<boolean>(false);
  const [processedCells, setProcessedCells] = useState<Set<string>>(new Set());
  const [processedEdges, setProcessedEdges] = useState<Set<string>>(new Set());

  const strokeInitialStateRef = useRef<Cell[] | null>(null);
  const strokeInitialEdgesRef = useRef<Edge[] | null>(null);
  const strokeInitialCurvesRef = useRef<Curve[] | null>(null);
  const strokeInitialTilesRef = useRef<TileAssignment[] | null>(null);
  const strokeInitialWallPathsRef = useRef<WallPath[] | null>(null);
  const strokeInitialTerrainStrokesRef = useRef<TerrainStroke[] | null>(null);

  const toggleCell = (coords: Point, shouldFill: boolean, dragStart: DragStartContext | null = null): void => {
    if (!mapData || !geometry) return;

    const activeLayer = getActiveLayer(mapData);

    const q = coords.x;
    const r = coords.y;

    if (!geometry.isWithinBounds(q, r)) {
      return;
    }

    const isBatchedStroke = strokeInitialStateRef.current !== null;

    if (shouldFill) {
      const newCells = accessorSetCell(activeLayer.cells, coords, selectedColor, selectedOpacity, geometry);
      onCellsChange(newCells, isBatchedStroke);
    } else {
      const { clientX, clientY } = dragStart ?? { clientX: 0, clientY: 0 };
      const worldCoords = screenToWorld(clientX, clientY);
      if (worldCoords) {
        const canvas = canvasRef.current;
        const ctx = canvas ? canvas.getContext('2d') : null;
        const textLabel = getTextLabelAtPosition(
          activeLayer.textLabels ?? [],
          worldCoords.worldX,
          worldCoords.worldY,
          ctx
        );
        if (textLabel != null) {
          const newLabels = removeTextLabel(activeLayer.textLabels ?? [], textLabel.id);
          onTextLabelsChange(newLabels);
          return;
        }

        if (geometry.type === 'grid') {
          const edgeInfo = geometry.screenToEdge(worldCoords.worldX, worldCoords.worldY, 0.15);
          if (edgeInfo) {
            const edgeKey = `${edgeInfo.x},${edgeInfo.y},${edgeInfo.side}`;

            if (!processedEdges.has(edgeKey)) {
              const existingEdge = getEdgeAt(activeLayer.edges, edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                strokeInitialEdgesRef.current ??= [...activeLayer.edges];
                setProcessedEdges((prev: Set<string>) => new Set([...prev, edgeKey]));
                const newEdges = removeEdge(activeLayer.edges, edgeInfo.x, edgeInfo.y, edgeInfo.side);
                onEdgesChange(newEdges, isBatchedStroke);
                return;
              }
            }
          }
        }
      }

      const coordX = coords.x;
      const coordY = coords.y;
      const obj = getObjectAtPosition(activeLayer.objects, coordX, coordY);
      if (obj != null) {
        const mapType = mapData.mapType ?? 'grid';
        const result = eraseObjectAt(activeLayer.objects, coordX, coordY, mapType);
        if (result.success) {
          onObjectsChange(result.objects);
        }
      } else {
        // Erase tile at cell coords (overlay first, then fill)
        let tileErased = false;
        if (onTilesChange != null && activeLayer.tiles != null && activeLayer.tiles.length > 0) {
          const tiles = activeLayer.tiles;
          // Footprint-aware: a click anywhere inside a multi-cell prop erases it;
          // freeform stamps still erase by their drop cell.
          const covers = (t: TileAssignment): boolean =>
            t.freeform === true ? (t.col === coordX && t.row === coordY) : assignmentCoversCell(t, coordX, coordY);
          const overlayIdx = tiles.findIndex((t: TileAssignment) => covers(t) && t.placement === 'overlay');
          if (overlayIdx >= 0) {
            strokeInitialTilesRef.current ??= [...tiles];
            onTilesChange(tiles.filter((_: TileAssignment, i: number) => i !== overlayIdx), isBatchedStroke);
            tileErased = true;
          } else {
            const baseIdx = tiles.findIndex((t: TileAssignment) => covers(t));
            if (baseIdx >= 0) {
              strokeInitialTilesRef.current ??= [...tiles];
              onTilesChange(tiles.filter((_: TileAssignment, i: number) => i !== baseIdx), isBatchedStroke);
              tileErased = true;
            }
          }
        }
        // Wall/path strips: a click inside a strip's corridor erases the whole
        // polyline (last-drawn wins). Same corridor as wall-edit selection.
        let wallErased = false;
        if (!tileErased && onWallPathsChange != null && worldCoords != null) {
          const walls = activeLayer.wallPaths ?? [];
          if (walls.length > 0) {
            const zoom = mapData.viewState?.zoom ?? 1;
            const corridor = Math.max((geometry.cellSize ?? 32) * 0.4, 22 / zoom);
            for (let i = walls.length - 1; i >= 0; i--) {
              if (distanceToWallPath(walls[i], worldCoords.worldX, worldCoords.worldY) <= corridor) {
                strokeInitialWallPathsRef.current ??= [...walls];
                onWallPathsChange(walls.filter((_: WallPath, j: number) => j !== i), isBatchedStroke);
                wallErased = true;
                break;
              }
            }
          }
        }
        if (!tileErased && !wallErased) {
        let curveErased = false;
        if (activeLayer.curves.length > 0) {
          let newCurves: Curve[] | null = null;
          if (geometry.type === 'hex') {
            const verts = geometry.getHexVertices(coordX, coordY);
            if (verts != null) {
              const clipPoly = verts.map((v: { worldX: number; worldY: number }) => [v.worldX, v.worldY] as [number, number]);
              newCurves = eraseWorldPolygonFromCurves(activeLayer.curves, clipPoly);
            }
          } else {
            const cellSize = geometry.cellSize;
            if (cellSize) {
              newCurves = eraseCellFromCurves(activeLayer.curves, coordX, coordY, cellSize);
            }
          }
          if (newCurves) {
            strokeInitialCurvesRef.current ??= [...activeLayer.curves];
            onCurvesChange(newCurves, isBatchedStroke);
            curveErased = true;
          }
        }
        let cellErased = false;
        if (!curveErased && getCellIndex(activeLayer.cells, coords, geometry) !== -1) {
          const newCells = accessorRemoveCell(activeLayer.cells, coords, geometry);
          onCellsChange(newCells, isBatchedStroke);
          cellErased = true;
        }
        // Terrain strokes last: their capsule hit area is broad, so precision
        // targets (tiles, walls, curves, cells) win first. A hit deletes the
        // whole stroke — matching the brush tool's Alt+drag whole-stroke erase.
        if (!curveErased && !cellErased && onTerrainStrokesChange != null && worldCoords != null) {
          const strokes = activeLayer.terrainStrokes ?? [];
          for (let i = strokes.length - 1; i >= 0; i--) {
            if (distancePointToPolyline(worldCoords.worldX, worldCoords.worldY, strokes[i].points) <= strokes[i].radius) {
              strokeInitialTerrainStrokesRef.current ??= [...strokes];
              onTerrainStrokesChange(strokes.filter((_: TerrainStroke, j: number) => j !== i), isBatchedStroke);
              break;
            }
          }
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
    strokeInitialWallPathsRef.current = null;
    strokeInitialTerrainStrokesRef.current = null;
    processCellDuringDrag(e, dragStart);
  };

  const stopDrawing = (): void => {
    if (!paintIsDrawing) return;

    setPaintIsDrawing(false);
    setProcessedCells(new Set());
    setProcessedEdges(new Set());

    if (mapData == null) return;

    const activeLayer = getActiveLayer(mapData);

    if (strokeInitialStateRef.current !== null) {
      if (strokeChanged(activeLayer.cells, strokeInitialStateRef.current)) {
        onCellsChange(activeLayer.cells, false);
      }
      strokeInitialStateRef.current = null;
    }
    if (strokeInitialEdgesRef.current !== null) {
      if (strokeChanged(activeLayer.edges, strokeInitialEdgesRef.current)) {
        onEdgesChange(activeLayer.edges, false);
      }
      strokeInitialEdgesRef.current = null;
    }
    if (strokeInitialCurvesRef.current !== null) {
      if (strokeChanged(activeLayer.curves, strokeInitialCurvesRef.current)) {
        onCurvesChange(activeLayer.curves, false);
      }
      strokeInitialCurvesRef.current = null;
    }
    if (strokeInitialTilesRef.current !== null && onTilesChange != null) {
      if (strokeChanged(activeLayer.tiles ?? [], strokeInitialTilesRef.current)) {
        onTilesChange(activeLayer.tiles ?? [], false);
      }
      strokeInitialTilesRef.current = null;
    }
    if (strokeInitialWallPathsRef.current !== null && onWallPathsChange != null) {
      if (strokeChanged(activeLayer.wallPaths ?? [], strokeInitialWallPathsRef.current)) {
        onWallPathsChange(activeLayer.wallPaths ?? [], false);
      }
      strokeInitialWallPathsRef.current = null;
    }
    if (strokeInitialTerrainStrokesRef.current !== null && onTerrainStrokesChange != null) {
      if (strokeChanged(activeLayer.terrainStrokes ?? [], strokeInitialTerrainStrokesRef.current)) {
        onTerrainStrokesChange(activeLayer.terrainStrokes ?? [], false);
      }
      strokeInitialTerrainStrokesRef.current = null;
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
      strokeInitialWallPathsRef.current = null;
      strokeInitialTerrainStrokesRef.current = null;
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