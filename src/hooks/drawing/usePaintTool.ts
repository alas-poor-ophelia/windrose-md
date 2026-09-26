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
import type { MapData, LayerId, MapLayer } from '#types/core/map.types';
import type { MapObject } from '#types/objects/object.types';
import type { Curve } from '#types/core/curve.types';
import type { TextLabel } from '#types/objects/note.types';
import type { TileAssignment } from '#types/tiles/tile.types';
import type { WallPath } from '#types/core/wallpath.types';
import type { TerrainStroke } from '#types/core/terrainstroke.types';
import type { DragStartContext } from '#types/hooks/drawingTools.types';
import type { Edge } from '#types/core/rendering.types';
import type { ExtendedGeometry, MapStateContextValue } from '#types/contexts/context.types';
import type { HandleLevelCellsChange } from '#types/hooks/dataHandlers.types';
import type { GeometryLadder } from '../../geometry/core/createGeometryLadder';

import { useRef, useState } from 'preact/hooks';
import { setCell as accessorSetCell, removeCell as accessorRemoveCell, getCellIndex } from '../../geometry/core/cellAccessor';
import { removeEdge, getEdgeAt } from '../../drawing/edgeOperations';
import { eraseObjectAt } from '../../objects/objectOperations';
import { eraseCellFromCurves, eraseWorldPolygonFromCurves } from '../../geometry/curves/curveBoolean';
import { Notice } from 'obsidian';
import { getActiveLayer, getActiveBoardLayers, authoredCells } from '../../persistence/layerAccessor';
import { canBeginDepthAuthoring, guardDepthWrite } from '../../persistence/depthAuthoring';
import { withCellPainted, withCellErased, depthRefusalMessage } from '../../drawing/depthCellOps';
import { findTileHitInLayers } from '../../assets/tileFootprint';
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
  /**
   * Arms a layer (the real layer-select handler: saves the outgoing layer's
   * history, sets the active layer, swaps in the incoming layer's stack).
   * Required for cross-stratum tile erase — see toggleCell.
   */
  onLayerSelect?: (layerId: LayerId) => void;
  onWallPathsChange?: (wallPaths: WallPath[], suppressHistory?: boolean) => void;
  onTerrainStrokesChange?: (strokes: TerrainStroke[], suppressHistory?: boolean) => void;
  getTextLabelAtPosition: (labels: TextLabel[], worldX: number, worldY: number, ctx: CanvasRenderingContext2D | null) => TextLabel | null;
  removeTextLabel: (labels: TextLabel[], id: string) => TextLabel[];
  getObjectAtPosition: (objects: MapObject[], x: number, y: number) => MapObject | null;
  /** Lattice ladder (null/absent on classic maps). Deep strokes need all four ladder options. */
  ladder?: GeometryLadder | null;
  /** Live camera rung; latched once per stroke at pointerdown. */
  getActiveLevel?: () => number;
  screenToLevelCell?: MapStateContextValue['screenToLevelCell'];
  onLevelCellsChange?: HandleLevelCellsChange;
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

/** Same cells in the same order with the same fill; a cheap content fallback for the stroke-end check. */
function sameCells(a: Cell[], b: Cell[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as unknown as Record<string, unknown>;
    const y = b[i] as unknown as Record<string, unknown>;
    if (x.q !== y.q || x.r !== y.r || x.x !== y.x || x.y !== y.y || x.color !== y.color || x.opacity !== y.opacity) return false;
  }
  return true;
}

function usePaintTool({
  currentTool, mapData, geometry, selectedColor, selectedOpacity,
  canvasRef, screenToGrid, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  onTilesChange, onLayerSelect, onWallPathsChange, onTerrainStrokesChange,
  getTextLabelAtPosition, removeTextLabel, getObjectAtPosition,
  ladder = null, getActiveLevel, screenToLevelCell, onLevelCellsChange
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
  // Edit level, latched at pointerdown (design section 4.2): a stroke that
  // crosses a rung boundary mid-drag stays on its starting rung. Always 0 when
  // the map cannot take deep edits (flag off, classic map, quarantine).
  const strokeLevelRef = useRef<number>(0);
  // The rung's authored cells at stroke start (by reference), for the one
  // undo entry per deep stroke. Null outside a deep stroke.
  const strokeInitialLevelCellsRef = useRef<Cell[] | null>(null);
  // One refusal notice per stroke, not one per cell.
  const refusalNoticedRef = useRef<boolean>(false);

  /**
   * Commit history for whatever this stroke touched on `layer`, then clear the
   * snapshots. Every call passes the layer's CURRENT arrays, so the writes are
   * data-identical and only exist to record one undo entry per stroke.
   */
  const flushStrokeHistory = (layer: MapLayer): void => {
    if (strokeInitialStateRef.current !== null) {
      if (strokeChanged(layer.cells, strokeInitialStateRef.current)) {
        onCellsChange(layer.cells, false);
      }
      strokeInitialStateRef.current = null;
    }
    if (strokeInitialEdgesRef.current !== null) {
      if (strokeChanged(layer.edges, strokeInitialEdgesRef.current)) {
        onEdgesChange(layer.edges, false);
      }
      strokeInitialEdgesRef.current = null;
    }
    if (strokeInitialCurvesRef.current !== null) {
      if (strokeChanged(layer.curves, strokeInitialCurvesRef.current)) {
        onCurvesChange(layer.curves, false);
      }
      strokeInitialCurvesRef.current = null;
    }
    if (strokeInitialTilesRef.current !== null && onTilesChange != null) {
      if (strokeChanged(layer.tiles ?? [], strokeInitialTilesRef.current)) {
        onTilesChange(layer.tiles ?? [], false);
      }
      strokeInitialTilesRef.current = null;
    }
    if (strokeInitialWallPathsRef.current !== null && onWallPathsChange != null) {
      if (strokeChanged(layer.wallPaths ?? [], strokeInitialWallPathsRef.current)) {
        onWallPathsChange(layer.wallPaths ?? [], false);
      }
      strokeInitialWallPathsRef.current = null;
    }
    if (strokeInitialTerrainStrokesRef.current !== null && onTerrainStrokesChange != null) {
      if (strokeChanged(layer.terrainStrokes ?? [], strokeInitialTerrainStrokesRef.current)) {
        onTerrainStrokesChange(layer.terrainStrokes ?? [], false);
      }
      strokeInitialTerrainStrokesRef.current = null;
    }
  };

  /**
   * Paint or erase one cell on ladder rung `level` (>= 1). Touches ONLY the
   * rung's authored cells (design section 19 item 4): no text, edge, object,
   * tile, wall, curve or terrain hit-tests, and never `layer.cells`.
   */
  const toggleDeepCell = (coords: Point, shouldFill: boolean, level: number): void => {
    if (!mapData || ladder === null || onLevelCellsChange === undefined) return;
    const q = coords.x;
    const r = coords.y;
    if (!ladder.existsAt(level, q, r)) return;

    const layer = getActiveLayer(mapData);
    const current = authoredCells(layer, level);
    const next = shouldFill
      ? withCellPainted(current, q, r, selectedColor, selectedOpacity)
      : withCellErased(current, q, r);
    if (next === current) return;

    const refusal = guardDepthWrite(mapData, layer.id, level, next);
    if (refusal !== null) {
      if (!refusalNoticedRef.current) {
        refusalNoticedRef.current = true;
        new Notice(depthRefusalMessage(refusal));
      }
      return;
    }

    const isBatchedStroke = strokeInitialLevelCellsRef.current !== null;
    const color = selectedColor;
    const opacity = selectedOpacity;
    onLevelCellsChange(
      level,
      (cells: Cell[]) => (shouldFill ? withCellPainted(cells, q, r, color, opacity) : withCellErased(cells, q, r)),
      isBatchedStroke
    );
  };

  const toggleCell = (coords: Point, shouldFill: boolean, dragStart: DragStartContext | null = null): void => {
    if (!mapData || !geometry) return;

    const strokeLevel = strokeLevelRef.current;
    if (strokeLevel > 0) {
      toggleDeepCell(coords, shouldFill, strokeLevel);
      return;
    }

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
        // Erase tile at cell coords. In strata mode every depth band is its own
        // layer, so the search spans the whole active board (top stratum first,
        // overlay before fill) — otherwise only the armed band could be erased.
        // Hidden layers are excluded, except the active one: erasing into a
        // layer you hid yourself is long-standing behaviour.
        let tileErased = false;
        if (onTilesChange != null) {
          const searchLayers = getActiveBoardLayers(mapData)
            .filter(l => l.visible !== false || l.id === activeLayer.id);
          const hit = findTileHitInLayers(searchLayers, coordX, coordY);
          if (hit != null) {
            const layerTiles = hit.layer.tiles ?? [];
            const nextTiles = layerTiles.filter((_: TileAssignment, i: number) => i !== hit.index);
            if (hit.layer.id === activeLayer.id) {
              strokeInitialTilesRef.current ??= [...layerTiles];
              onTilesChange(nextTiles, isBatchedStroke);
              tileErased = true;
            } else if (onLayerSelect != null) {
              // Cross-stratum: history stacks are per layer and undo restores
              // into the ACTIVE layer, so arm the owning layer through the real
              // select handler FIRST (it saves the outgoing stack and restores
              // the incoming one), then commit. handleTilesChange's functional
              // updater then sees the owning layer as active and snapshots the
              // erase into that layer's stack.
              //
              // The erase is committed immediately rather than batched into the
              // stroke, and every stroke snapshot is re-armed against the newly
              // active layer so stopDrawing cannot commit an old layer's array
              // into the new one. Anything this stroke already did to the
              // outgoing layer keeps its data but loses its pending undo entry:
              // it cannot be flushed here, because saveCurrentLayerHistory reads
              // the history state from a closure that a same-tick write has not
              // updated yet, so the entry would be cached away and dropped.
              onLayerSelect(hit.layer.id);
              onTilesChange(nextTiles, false);
              strokeInitialStateRef.current = isBatchedStroke ? [...hit.layer.cells] : null;
              strokeInitialEdgesRef.current = null;
              strokeInitialCurvesRef.current = null;
              strokeInitialTilesRef.current = null;
              strokeInitialWallPathsRef.current = null;
              strokeInitialTerrainStrokesRef.current = null;
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
    // Level 0 is screenToGrid exactly; a deep stroke resolves on its latched rung.
    const strokeLevel = strokeLevelRef.current;
    const coords = strokeLevel > 0
      ? (screenToLevelCell?.(clientX, clientY, strokeLevel) ?? null)
      : screenToGrid(clientX, clientY);
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
    const level = ladder !== null && getActiveLevel !== undefined && canBeginDepthAuthoring(mapData)
      ? getActiveLevel()
      : 0;
    strokeLevelRef.current = level;
    refusalNoticedRef.current = false;
    // A deep stroke never touches layer.cells, so it snapshots only its rung.
    strokeInitialStateRef.current = level > 0 ? null : [...activeLayer.cells];
    strokeInitialLevelCellsRef.current = level > 0 ? authoredCells(activeLayer, level) : null;
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

    const level = strokeLevelRef.current;
    const initialLevelCells = strokeInitialLevelCellsRef.current;
    strokeLevelRef.current = 0;
    strokeInitialLevelCellsRef.current = null;

    if (mapData == null) return;

    const layer = getActiveLayer(mapData);
    // Deep stroke: one undo entry when the rung changed (reference compare;
    // every rung writer returns the prior array on a no-op). The identity
    // update re-writes the current rung only to record the snapshot.
    if (level > 0 && initialLevelCells !== null && onLevelCellsChange !== undefined) {
      // Reference first (a no-op stroke keeps the array), then content: a stroke
      // that paints and erases the same cell ends on a new array with the old
      // content and must not record a no-op undo entry.
      const finalLevelCells = authoredCells(layer, level);
      if (finalLevelCells !== initialLevelCells && !sameCells(finalLevelCells, initialLevelCells)) {
        onLevelCellsChange(level, (cells: Cell[]) => cells, false);
      }
    }

    flushStrokeHistory(layer);
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
    strokeLevelRef.current = 0;
    strokeInitialLevelCellsRef.current = null;
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