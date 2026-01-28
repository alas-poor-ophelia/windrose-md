/**
 * DrawingLayer.tsx
 *
 * Handles drawing tool interactions and preview overlays.
 * Supports live shape preview for KBM (hover) and touch (3-tap confirmation).
 */

import type { ToolId } from '#types/tools/tool.types';
import type { HexColor } from '#types/core/common.types';
import type { OffsetCoords } from '#types/core/geometry.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useDrawingTools } = await requireModuleByName("useDrawingTools.ts");
const { useMapState } = await requireModuleByName("MapContext.tsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.tsx");
const { ShapePreviewOverlay } = await requireModuleByName("ShapePreviewOverlay.tsx");
const { SegmentPickerOverlay } = await requireModuleByName("SegmentPickerOverlay.tsx");
const { SegmentHoverOverlay } = await requireModuleByName("SegmentHoverOverlay.tsx");
const { getSettings } = await requireModuleByName("settingsAccessor.ts");
const { getEffectiveDistanceSettings } = await requireModuleByName("distanceOperations.ts");

/** Preview settings for shapes */
interface PreviewSettings {
  kbmEnabled: boolean;
  touchEnabled: boolean;
}

/** Drawing state change callback data */
interface DrawingStateChangeData {
  isDrawing: boolean;
  rectangleStart: OffsetCoords | null;
  circleStart: OffsetCoords | null;
  edgeLineStart: OffsetCoords | null;
  shapeHoverPosition: OffsetCoords | null;
  touchConfirmPending: boolean;
  handlers: {
    handleDrawingPointerDown: (e: PointerEvent) => void;
    handleDrawingPointerMove: (e: PointerEvent) => void;
    stopDrawing: () => void;
    cancelDrawing: () => void;
    cancelShapePreview: () => void;
  };
}

/** Props for DrawingLayer component */
export interface DrawingLayerProps {
  /** Current active tool */
  currentTool: ToolId;
  /** Selected color for drawing */
  selectedColor: HexColor | null;
  /** Selected opacity (0-1) */
  selectedOpacity?: number;
  /** Callback when drawing state changes */
  onDrawingStateChange?: (state: DrawingStateChangeData) => void;
  /** Global plugin settings */
  globalSettings?: Record<string, unknown>;
  /** Per-map distance setting overrides */
  mapDistanceOverrides?: Partial<EffectiveDistanceSettings>;
}

const DrawingLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity = 1,
  onDrawingStateChange,
  globalSettings,
  mapDistanceOverrides
}: DrawingLayerProps): React.ReactElement => {
  const {
    canvasRef,
    containerRef,
    mapData,
    GridGeometry,
    geometry
  } = useMapState();

  const previewSettings = dc.useMemo((): PreviewSettings => {
    const settings = globalSettings || getSettings();
    return {
      kbmEnabled: (settings as Record<string, unknown>).shapePreviewKbm !== false,
      touchEnabled: (settings as Record<string, unknown>).shapePreviewTouch === true
    };
  }, [globalSettings]);

  const distanceSettings = dc.useMemo(() => {
    const mapType = mapData?.mapType || 'grid';
    const settings = globalSettings || getSettings();
    return getEffectiveDistanceSettings(mapType, settings, mapDistanceOverrides);
  }, [mapData?.mapType, globalSettings, mapDistanceOverrides]);

  const {
    isDrawing,
    rectangleStart,
    circleStart,
    edgeLineStart,
    shapeHoverPosition,
    touchConfirmPending,
    pendingEndPoint,
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    stopDrawing,
    stopEdgeDrawing,
    stopSegmentDrawing,
    cancelDrawing,
    updateShapeHover,
    updateEdgeLineHover,
    cancelShapePreview,
    segmentPickerOpen,
    segmentPickerCell,
    segmentPickerExistingCell,
    closeSegmentPicker,
    applySegmentSelection,
    savedSegments,
    rememberSegments,
    segmentHoverInfo,
    updateSegmentHover,
    clearSegmentHover,
    // Freehand drawing
    isFreehandDrawing,
    freehandPreviewPoints,
    finishFreehandDrawing,
    cancelFreehandDrawing
  } = useDrawingTools(currentTool, selectedColor, selectedOpacity, previewSettings);

  const handleStopDrawing = dc.useCallback(() => {
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      stopEdgeDrawing();
    } else if (currentTool === 'segmentDraw') {
      stopSegmentDrawing();
    } else if (currentTool === 'freehandDraw') {
      finishFreehandDrawing();
    } else {
      stopDrawing();
    }
  }, [currentTool, stopDrawing, stopEdgeDrawing, stopSegmentDrawing, finishFreehandDrawing]);

  const handleKeyDown = dc.useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (segmentPickerOpen) {
        closeSegmentPicker();
      } else if (isFreehandDrawing) {
        cancelFreehandDrawing();
      } else if (rectangleStart || circleStart || edgeLineStart || touchConfirmPending) {
        cancelShapePreview();
      }
    }
  }, [rectangleStart, circleStart, edgeLineStart, touchConfirmPending, cancelShapePreview, segmentPickerOpen, closeSegmentPicker, isFreehandDrawing, cancelFreehandDrawing]);

  dc.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  dc.useEffect(() => {
    registerHandlers('drawing', {
      handleDrawingPointerDown,
      handleDrawingPointerMove,
      stopDrawing: handleStopDrawing,
      cancelDrawing,
      isDrawing,
      isFreehandDrawing,
      rectangleStart,
      circleStart,
      edgeLineStart,
      updateShapeHover,
      updateEdgeLineHover,
      shapeHoverPosition,
      touchConfirmPending,
      cancelShapePreview,
      previewEnabled: previewSettings.kbmEnabled,
      updateSegmentHover,
      clearSegmentHover
    });

    return () => unregisterHandlers('drawing');
  }, [registerHandlers, unregisterHandlers, handleDrawingPointerDown, handleDrawingPointerMove,
    handleStopDrawing, cancelDrawing, isDrawing, isFreehandDrawing, rectangleStart, circleStart, edgeLineStart,
    updateShapeHover, updateEdgeLineHover, shapeHoverPosition, touchConfirmPending,
    cancelShapePreview, previewSettings.kbmEnabled, updateSegmentHover, clearSegmentHover]);

  dc.useEffect(() => {
    if (onDrawingStateChange) {
      onDrawingStateChange({
        isDrawing,
        rectangleStart,
        circleStart,
        edgeLineStart,
        shapeHoverPosition,
        touchConfirmPending,
        handlers: {
          handleDrawingPointerDown,
          handleDrawingPointerMove,
          stopDrawing: handleStopDrawing,
          cancelDrawing,
          cancelShapePreview
        }
      });
    }
  }, [isDrawing, rectangleStart, circleStart, edgeLineStart, shapeHoverPosition,
    touchConfirmPending, onDrawingStateChange, handleStopDrawing, cancelShapePreview]);

  const renderStartMarker = (): React.ReactElement | null => {
    if (!canvasRef.current || !containerRef?.current || !geometry) return null;

    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;

    let scaledSize: number;
    let offsetX: number;
    let offsetY: number;

    const isGrid = geometry instanceof GridGeometry;
    if (isGrid) {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      scaledSize = geometry.hexSize * zoom;
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    const displayScale = canvasRect.width / width;

    const gridToCanvasPosition = (gridX: number, gridY: number): { x: number; y: number } => {
      const worldX = (gridX + 0.5) * geometry.cellSize;
      const worldY = (gridY + 0.5) * geometry.cellSize;

      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;

      if (northDirection !== 0) {
        const centerX = width / 2;
        const centerY = height / 2;
        screenX -= centerX;
        screenY -= centerY;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
        const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
        screenX = rotatedX + centerX;
        screenY = rotatedY + centerY;
      }

      screenX *= displayScale;
      screenY *= displayScale;

      const cellHalfSize = (scaledSize * displayScale) / 2;
      return {
        x: canvasOffsetX + screenX - cellHalfSize,
        y: canvasOffsetY + screenY - cellHalfSize
      };
    };

    const intersectionToCanvasPosition = (intX: number, intY: number): { x: number; y: number } => {
      const worldX = intX * geometry.cellSize;
      const worldY = intY * geometry.cellSize;

      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;

      if (northDirection !== 0) {
        const centerX = width / 2;
        const centerY = height / 2;
        screenX -= centerX;
        screenY -= centerY;
        const angleRad = (northDirection * Math.PI) / 180;
        const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
        const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
        screenX = rotatedX + centerX;
        screenY = rotatedY + centerY;
      }

      screenX *= displayScale;
      screenY *= displayScale;

      return {
        x: canvasOffsetX + screenX,
        y: canvasOffsetY + screenY
      };
    };

    const overlays: React.ReactElement[] = [];
    const displayScaledSize = scaledSize * displayScale;

    const showFullPreview = shapeHoverPosition && previewSettings.kbmEnabled;
    const showTouchPreview = touchConfirmPending && pendingEndPoint;

    if (rectangleStart && !showFullPreview && !showTouchPreview) {
      const pos = gridToCanvasPosition(rectangleStart.x, rectangleStart.y);
      const highlightColor = currentTool === 'clearArea' ? '#ff0000' : '#00ff00';

      overlays.push(
        <div
          key="rectangle-start"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${displayScaledSize}px`,
            height: `${displayScaledSize}px`,
            border: `2px solid ${highlightColor}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 100
          }}
        />
      );
    }

    if (circleStart && !showFullPreview && !showTouchPreview) {
      const pos = gridToCanvasPosition(circleStart.x, circleStart.y);
      const highlightColor = '#00aaff';

      overlays.push(
        <div
          key="circle-start"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x}px`,
            top: `${pos.y}px`,
            width: `${displayScaledSize}px`,
            height: `${displayScaledSize}px`,
            border: `2px solid ${highlightColor}`,
            boxSizing: 'border-box',
            pointerEvents: 'none',
            zIndex: 100
          }}
        />
      );
    }

    if (edgeLineStart && !showFullPreview && !showTouchPreview) {
      const pos = intersectionToCanvasPosition(edgeLineStart.x, edgeLineStart.y);
      const highlightColor = '#ff9500';
      const markerSize = Math.max(16, displayScaledSize * 0.4);
      const halfMarker = markerSize / 2;
      const strokeWidth = Math.max(2, markerSize / 8);

      overlays.push(
        <svg
          key="edgeline-start"
          className="dmt-drawing-preview"
          style={{
            position: 'absolute',
            left: `${pos.x - halfMarker}px`,
            top: `${pos.y - halfMarker}px`,
            width: `${markerSize}px`,
            height: `${markerSize}px`,
            pointerEvents: 'none',
            zIndex: 100,
            overflow: 'visible'
          }}
          viewBox={`0 0 ${markerSize} ${markerSize}`}
        >
          <line
            x1={strokeWidth}
            y1={strokeWidth}
            x2={markerSize - strokeWidth}
            y2={markerSize - strokeWidth}
            stroke={highlightColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
          <line
            x1={markerSize - strokeWidth}
            y1={strokeWidth}
            x2={strokeWidth}
            y2={markerSize - strokeWidth}
            stroke={highlightColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        </svg>
      );
    }

    return overlays.length > 0 ? <>{overlays}</> : null;
  };

  const renderShapePreview = (): React.ReactElement | null => {
    const endPoint = touchConfirmPending ? pendingEndPoint : shapeHoverPosition;

    const shouldShowPreview = endPoint && (
      (previewSettings.kbmEnabled && shapeHoverPosition && !touchConfirmPending) ||
      (touchConfirmPending && pendingEndPoint)
    );

    if (!shouldShowPreview) return null;

    let shapeType: string | null = null;
    let startPoint: OffsetCoords | null = null;

    if (circleStart) {
      shapeType = 'circle';
      startPoint = circleStart;
    } else if (rectangleStart) {
      shapeType = currentTool === 'clearArea' ? 'clearArea' : 'rectangle';
      startPoint = rectangleStart;
    } else if (edgeLineStart) {
      shapeType = 'edgeLine';
      startPoint = edgeLineStart;
    }

    if (!shapeType || !startPoint) return null;

    return (
      <ShapePreviewOverlay
        shapeType={shapeType}
        startPoint={startPoint}
        endPoint={endPoint}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
        containerRef={containerRef}
        distanceSettings={distanceSettings}
        isConfirmable={touchConfirmPending}
      />
    );
  };

  return (
    <>
      {renderStartMarker()}
      {renderShapePreview()}

      {currentTool === 'segmentDraw' && segmentHoverInfo && (
        <SegmentHoverOverlay
          hoverInfo={segmentHoverInfo}
          selectedColor={selectedColor}
          geometry={geometry}
          mapData={mapData}
          canvasRef={canvasRef}
          containerRef={containerRef}
        />
      )}

      <SegmentPickerOverlay
        isOpen={segmentPickerOpen}
        cellCoords={segmentPickerCell}
        existingCell={segmentPickerExistingCell}
        selectedColor={selectedColor}
        selectedOpacity={selectedOpacity}
        onConfirm={applySegmentSelection}
        onCancel={closeSegmentPicker}
        savedSegments={savedSegments}
        initialRememberState={rememberSegments}
      />
    </>
  );
};

return { DrawingLayer };
