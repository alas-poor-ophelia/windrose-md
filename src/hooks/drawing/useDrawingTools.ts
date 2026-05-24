/**
 * useDrawingTools.ts
 *
 * Orchestrator hook that composes 6 focused drawing tool hooks:
 * - usePaintTool: paint/erase cells, objects, text labels, curves, edges
 * - useEdgeDragTool: edge paint/erase via drag
 * - useSegmentDragTool: segment paint via drag
 * - useShapeTools: rectangle, circle, clear area, edge line (2-click shapes)
 * - useSegmentPicker: touch segment selection modal
 * - useSegmentHover: segment hover preview
 */

import type { ToolId } from '#types/tools/tool.types';
import type {
  PreviewSettings,
  DragStartContext,
  UseDrawingToolsResult,
  RectangleStart,
  CircleStart,
  EdgeLineStart,
  ShapeHoverPosition,
  PendingEndPoint,
} from '#types/hooks/drawingTools.types';
import type { StateUpdater } from 'preact/hooks';

import { useEffect } from 'preact/hooks';
import { useMapState, useMapOperations } from '../../context/MapContext';
import { usePaintTool } from './usePaintTool';
import { useEdgeDragTool } from './useEdgeDragTool';
import { useSegmentDragTool } from './useSegmentDragTool';
import { useShapeTools } from './useShapeTools';
import { useSegmentPicker } from './useSegmentPicker';
import { useSegmentHover } from './useSegmentHover';













/**
 * Orchestrator hook for all drawing tools
 */
const useDrawingTools = (
  currentTool: ToolId,
  selectedColor: string,
  selectedOpacity: number = 1,
  previewSettings: PreviewSettings = { kbmEnabled: true, touchEnabled: false }
): UseDrawingToolsResult => {
  const {
    geometry,
    canvasRef,
    mapData,
    screenToGrid,
    screenToWorld,
    getClientCoords,
  } = useMapState();

  const {
    onCellsChange,
    onCurvesChange,
    onObjectsChange,
    onTextLabelsChange,
    onEdgesChange,
    onTilesChange,
    getTextLabelAtPosition,
    removeTextLabel,
    getObjectAtPosition,
    removeObjectsInRectangle
  } = useMapOperations();

  // Compose sub-hooks
  const paint = usePaintTool({
    currentTool, mapData, geometry, selectedColor, selectedOpacity,
    canvasRef, screenToGrid, screenToWorld, getClientCoords,
    onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
    onTilesChange, getTextLabelAtPosition, removeTextLabel, getObjectAtPosition
  });

  const edgeDrag = useEdgeDragTool({
    currentTool, mapData, geometry, selectedColor, selectedOpacity,
    screenToWorld, getClientCoords, onEdgesChange
  });

  const segmentDrag = useSegmentDragTool({
    mapData, geometry, selectedColor, selectedOpacity,
    screenToWorld, getClientCoords, onCellsChange
  });

  const shapes = useShapeTools({
    currentTool, selectedColor, selectedOpacity, previewSettings,
    mapData, geometry, screenToWorld, getClientCoords,
    onCellsChange, onCurvesChange, onObjectsChange, onTextLabelsChange, onEdgesChange,
    removeObjectsInRectangle
  });

  const segmentPicker = useSegmentPicker({
    mapData, geometry, selectedColor, selectedOpacity, onCellsChange
  });

  // Derive composite isDrawing
  const isDrawing = paint.paintIsDrawing || edgeDrag.edgeIsDrawing || segmentDrag.segmentIsDrawing;

  const segmentHoverHook = useSegmentHover({ currentTool, isDrawing });

  // Dispatcher: handleDrawingPointerDown
  const handleDrawingPointerDown = (
    e: PointerEvent | MouseEvent | TouchEvent,
    gridX: number,
    gridY: number,
    isTouchEvent: boolean = false
  ): boolean => {
    if (!mapData) return false;
    if ((e as MouseEvent).button === 2) return false;

    // Try shapes first (rectangle, circle, clearArea, edgeLine)
    if (shapes.handleShapePointerDown(e, gridX, gridY, isTouchEvent)) {
      return true;
    }

    // Edge draw/erase
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      edgeDrag.startEdgeDrawing(e);
      return true;
    }

    // Segment draw
    if (currentTool === 'segmentDraw') {
      const isTouch = isTouchEvent || (e as TouchEvent).touches !== undefined || (e as PointerEvent).pointerType === 'touch';
      if (isTouch) {
        if (geometry && geometry.type === 'grid') {
          segmentPicker.openSegmentPicker(gridX, gridY);
        }
      } else {
        segmentDrag.startSegmentDrawing(e);
      }
      return true;
    }

    // Paint/erase
    if (currentTool === 'draw' || currentTool === 'erase') {
      paint.startDrawing(e);
      return true;
    }

    return false;
  };

  // Dispatcher: handleDrawingPointerMove
  const handleDrawingPointerMove = (e: PointerEvent | MouseEvent | TouchEvent, dragStart: DragStartContext | null = null): boolean => {
    if (edgeDrag.edgeIsDrawing && (currentTool === 'edgeDraw' || currentTool === 'edgeErase')) {
      edgeDrag.processEdgeDuringDrag(e);
      return true;
    }

    if (segmentDrag.segmentIsDrawing && currentTool === 'segmentDraw') {
      segmentDrag.processSegmentDuringDrag(e);
      return true;
    }

    if (paint.paintIsDrawing && (currentTool === 'draw' || currentTool === 'erase')) {
      paint.processCellDuringDrag(e, dragStart);
      return true;
    }
    return false;
  };

  // Cancel all drawing
  const cancelDrawing = (): void => {
    paint.cancelPaintDrawing();
    edgeDrag.cancelEdgeDrawing();
    segmentDrag.cancelSegmentDrawing();
  };

  // Reset all drawing state (on tool change)
  const resetDrawingState = (): void => {
    shapes.resetShapeState();
    cancelDrawing();
  };

  useEffect(() => {
    resetDrawingState();
  }, [currentTool]);

  return {
    isDrawing,
    rectangleStart: shapes.rectangleStart,
    circleStart: shapes.circleStart,
    edgeLineStart: shapes.edgeLineStart,

    shapeHoverPosition: shapes.shapeHoverPosition,
    touchConfirmPending: shapes.touchConfirmPending,
    pendingEndPoint: shapes.pendingEndPoint,

    toggleCell: paint.toggleCell,
    fillRectangle: shapes.fillRectangle,
    fillCircle: shapes.fillCircle,
    clearRectangle: shapes.clearRectangle,
    processCellDuringDrag: paint.processCellDuringDrag,
    startDrawing: paint.startDrawing,
    stopDrawing: paint.stopDrawing,

    toggleEdge: edgeDrag.toggleEdge,
    processEdgeDuringDrag: edgeDrag.processEdgeDuringDrag,
    startEdgeDrawing: edgeDrag.startEdgeDrawing,
    stopEdgeDrawing: edgeDrag.stopEdgeDrawing,
    fillEdgeLine: shapes.fillEdgeLine,

    toggleSegment: segmentDrag.toggleSegment,
    processSegmentDuringDrag: segmentDrag.processSegmentDuringDrag,
    startSegmentDrawing: segmentDrag.startSegmentDrawing,
    stopSegmentDrawing: segmentDrag.stopSegmentDrawing,

    segmentPickerOpen: segmentPicker.segmentPickerOpen,
    segmentPickerCell: segmentPicker.segmentPickerCell,
    segmentPickerExistingCell: segmentPicker.segmentPickerExistingCell,
    openSegmentPicker: segmentPicker.openSegmentPicker,
    closeSegmentPicker: segmentPicker.closeSegmentPicker,
    applySegmentSelection: segmentPicker.applySegmentSelection,
    savedSegments: segmentPicker.savedSegments,
    rememberSegments: segmentPicker.rememberSegments,

    handleDrawingPointerDown,
    handleDrawingPointerMove,
    cancelDrawing,
    resetDrawingState,

    updateShapeHover: shapes.updateShapeHover,
    updateEdgeLineHover: shapes.updateEdgeLineHover,
    isPointInShapeBounds: shapes.isPointInShapeBounds,
    confirmTouchShape: shapes.confirmTouchShape,
    cancelShapePreview: shapes.cancelShapePreview,

    segmentHoverInfo: segmentHoverHook.segmentHoverInfo,
    updateSegmentHover: segmentHoverHook.updateSegmentHover,
    clearSegmentHover: segmentHoverHook.clearSegmentHover,

    setIsDrawing: paint.setIsDrawing as StateUpdater<boolean>,
    setProcessedCells: paint.setProcessedCells as StateUpdater<Set<string>>,
    setProcessedEdges: paint.setProcessedEdges as StateUpdater<Set<string>>,
    setProcessedSegments: segmentDrag.setProcessedSegments as StateUpdater<Set<string>>,
    setRectangleStart: shapes.setRectangleStart as StateUpdater<RectangleStart | null>,
    setCircleStart: shapes.setCircleStart as StateUpdater<CircleStart | null>,
    setEdgeLineStart: shapes.setEdgeLineStart as StateUpdater<EdgeLineStart | null>,
    setShapeHoverPosition: shapes.setShapeHoverPosition as StateUpdater<ShapeHoverPosition>,
    setTouchConfirmPending: shapes.setTouchConfirmPending as StateUpdater<boolean>,
    setPendingEndPoint: shapes.setPendingEndPoint as StateUpdater<PendingEndPoint | null>
  };
};

export { useDrawingTools };