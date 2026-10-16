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
import { guardDepthWrite, depthBudgetBytesOf, type DepthWriteContext, type DepthWriteRefusal } from '../../persistence/depthAuthoring';
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
  getObjectAtPosition: (objects: MapObject[], x: number, y: number, homeLevel?: number) => MapObject | null;
  /** Lattice ladder (null/absent on classic maps). Deep strokes need all four ladder options. */
  ladder?: GeometryLadder | null;
  /** Edit rung (camera rung, or the shallower locked rung); latched once per stroke at pointerdown. */
  getEditLevel?: () => number;
  screenToLevelCell?: MapStateContextValue['screenToLevelCell'];
  onLevelCellsChange?: HandleLevelCellsChange;
}

interface UsePaintToolResult {
  paintIsDrawing: boolean;
  toggleCell: (coords: Point, shouldFill: boolean, dragStart?: DragStartContext | null) => void;
  processCellDuringDrag: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  startDrawing: (e: PointerEvent | MouseEvent | TouchEvent, dragStart?: DragStartContext | null) => void;
  stopDrawing: () => void;
  cancelPaintDrawing: () => void;
  /** Replace the per-stroke dedupe set (ref-backed; never re-renders). */
  setProcessedCells: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setProcessedEdges: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  setIsDrawing: (v: boolean) => void;
}

function usePaintTool({
  currentTool, mapData, geometry, selectedColor, selectedOpacity,
  canvasRef, screenToGrid, screenToWorld, getClientCoords,
  onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
  onTilesChange, onLayerSelect, onWallPathsChange, onTerrainStrokesChange,
  getTextLabelAtPosition, removeTextLabel, getObjectAtPosition,
  ladder = null, getEditLevel, screenToLevelCell, onLevelCellsChange
}: UsePaintToolOptions): UsePaintToolResult {

  const [paintIsDrawing, setPaintIsDrawing] = useState<boolean>(false);
  // Per-stroke dedupe sets. Refs mutated in place: a state Set cost a
  // re-render plus an O(n) copy per new cell, and .has() read the previous
  // render's set, so two events before a re-render could toggle a cell twice.
  const processedCellsRef = useRef<Set<string>>(new Set());
  const processedEdgesRef = useRef<Set<string>>(new Set());
  const resetProcessed = (): void => {
    processedCellsRef.current.clear();
    processedEdgesRef.current.clear();
  };
  const setProcessedCells = (v: Set<string> | ((prev: Set<string>) => Set<string>)): void => {
    processedCellsRef.current = typeof v === 'function' ? v(processedCellsRef.current) : v;
  };
  const setProcessedEdges = (v: Set<string> | ((prev: Set<string>) => Set<string>)): void => {
    processedEdgesRef.current = typeof v === 'function' ? v(processedEdgesRef.current) : v;
  };

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
  // A refused deep stroke shows one notice and paints nothing more until the
  // pointer lifts: past the cap or the budget, every further tick would refuse too.
  const strokeRefusedRef = useRef<boolean>(false);
  // Serialised map size at deep-stroke start: the budget check adds a per-cell
  // estimate to it instead of stringifying the whole map on every tick (kgc.23).
  const strokeBytesRef = useRef<number | null>(null);
  /** Whether the map had no lod block at stroke start (DepthWriteContext.lodAbsentAtStart). */
  const strokeLodAbsentRef = useRef(false);

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
    if (strokeRefusedRef.current) return;
    const q = coords.x;
    const r = coords.y;
    if (!ladder.existsAt(level, q, r)) return;

    const layer = getActiveLayer(mapData);
    const current = authoredCells(layer, level);
    const next = shouldFill
      ? withCellPainted(current, q, r, selectedColor, selectedOpacity)
      : withCellErased(current, q, r);
    if (next === current) return;

    // Within a stroke the per-op cap and the budget count from the stroke's
    // start, so a brush cannot add MAX_CELLS_PER_DEPTH_OP cells one tick at a time.
    const baseline = strokeInitialLevelCellsRef.current;
    const context: DepthWriteContext = baseline !== null && strokeBytesRef.current !== null
      ? { baseline, serialisedBytes: strokeBytesRef.current, lodAbsentAtStart: strokeLodAbsentRef.current }
      : {};
    const refuse = (reason: DepthWriteRefusal): void => {
      strokeRefusedRef.current = true;
      new Notice(depthRefusalMessage(reason));
    };
    const refusal = guardDepthWrite(mapData, layer.id, level, next, context);
    if (refusal !== null) {
      refuse(refusal);
      return;
    }

    const isBatchedStroke = baseline !== null;
    const color = selectedColor;
    const opacity = selectedOpacity;
    const outcome = onLevelCellsChange(
      level,
      (cells: Cell[]) => (shouldFill ? withCellPainted(cells, q, r, color, opacity) : withCellErased(cells, q, r)),
      isBatchedStroke,
      context
    );
    // The writer re-guards against the LIVE map; honour its verdict too.
    if (outcome !== null && !outcome.ok) refuse(outcome.reason);
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

            if (!processedEdgesRef.current.has(edgeKey)) {
              const existingEdge = getEdgeAt(activeLayer.edges, edgeInfo.x, edgeInfo.y, edgeInfo.side);
              if (existingEdge) {
                strokeInitialEdgesRef.current ??= [...activeLayer.edges];
                processedEdgesRef.current.add(edgeKey);
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
      // This is the level-0 erase (deep strokes go through toggleDeepCell and
      // touch cells only): an index match on another rung is a different place.
      const obj = getObjectAtPosition(activeLayer.objects, coordX, coordY, 0);
      if (obj != null) {
        const mapType = mapData.mapType ?? 'grid';
        const result = eraseObjectAt(activeLayer.objects, coordX, coordY, mapType, 0);
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
          const hit = findTileHitInLayers(searchLayers, coordX, coordY, 0);
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

    if (processedCellsRef.current.has(cellKey)) return;

    processedCellsRef.current.add(cellKey);

    const shouldFill = currentTool === 'draw';
    toggleCell(coords, shouldFill, { clientX, clientY });
  };

  const startDrawing = (e: PointerEvent | MouseEvent | TouchEvent, dragStart: DragStartContext | null = null): void => {
    if (!mapData) return;

    const activeLayer = getActiveLayer(mapData);

    // Zoomed onto a rung but the map cannot take this deep write: refuse with
    // the real reason and consume the press, never painting level 0 instead
    // (parity with objects, tiles and text; kgc.25). Classic maps (no ladder)
    // stay on level 0 untouched.
    const level = ladder !== null && getEditLevel !== undefined ? getEditLevel() : 0;
    if (level > 0) {
      const refusal = guardDepthWrite(mapData, activeLayer.id, level, authoredCells(activeLayer, level));
      if (refusal !== null) {
        new Notice(depthRefusalMessage(refusal));
        return;
      }
    }

    setPaintIsDrawing(true);
    resetProcessed();
    strokeLevelRef.current = level;
    strokeRefusedRef.current = false;
    // Journal payload size, measured once per stroke (one stringify plus, on a
    // large map, one deflate); every tick budgets against it (DATA-01).
    strokeBytesRef.current = level > 0 ? depthBudgetBytesOf(mapData) : null;
    strokeLodAbsentRef.current = mapData.lod === undefined;
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
    resetProcessed();

    const level = strokeLevelRef.current;
    const initialLevelCells = strokeInitialLevelCellsRef.current;
    strokeLevelRef.current = 0;
    strokeInitialLevelCellsRef.current = null;
    strokeBytesRef.current = null;

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
      if (strokeChanged(finalLevelCells, initialLevelCells)) {
        onLevelCellsChange(level, (cells: Cell[]) => cells, false);
      }
    }

    flushStrokeHistory(layer);
  };

  const cancelPaintDrawing = (): void => {
    if (paintIsDrawing) {
      setPaintIsDrawing(false);
      resetProcessed();
      strokeInitialStateRef.current = null;
      strokeInitialEdgesRef.current = null;
      strokeInitialCurvesRef.current = null;
      strokeInitialTilesRef.current = null;
      strokeInitialWallPathsRef.current = null;
      strokeInitialTerrainStrokesRef.current = null;
    }
    strokeLevelRef.current = 0;
    strokeInitialLevelCellsRef.current = null;
    strokeBytesRef.current = null;
  };

  return {
    paintIsDrawing,
    toggleCell, processCellDuringDrag, startDrawing, stopDrawing,
    cancelPaintDrawing,
    setProcessedCells, setProcessedEdges,
    setIsDrawing: setPaintIsDrawing
  };
}

export { usePaintTool };