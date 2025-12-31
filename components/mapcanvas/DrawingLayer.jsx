const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useDrawingTools } = await requireModuleByName("useDrawingTools.js");
const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");
const { ShapePreviewOverlay } = await requireModuleByName("ShapePreviewOverlay.jsx");
const { SegmentPickerOverlay } = await requireModuleByName("SegmentPickerOverlay.jsx");
const { SegmentHoverOverlay } = await requireModuleByName("SegmentHoverOverlay.jsx");
const { getSettings } = await requireModuleByName("settingsAccessor.ts");
const { getEffectiveDistanceSettings } = await requireModuleByName("distanceOperations.js");

/**
 * DrawingLayer.jsx
 * 
 * Handles drawing tool interactions and preview overlays.
 * Supports live shape preview for KBM (hover) and touch (3-tap confirmation).
 */
const DrawingLayer = ({
  currentTool,
  selectedColor,
  selectedOpacity = 1,
  onDrawingStateChange,
  globalSettings,
  mapDistanceOverrides
}) => {
  const { 
    canvasRef,
    containerRef,
    mapData, 
    GridGeometry,
    geometry
  } = useMapState();
  
  // Get preview settings from plugin settings
  const previewSettings = dc.useMemo(() => {
    const settings = globalSettings || getSettings();
    return {
      kbmEnabled: settings.shapePreviewKbm !== false, // Default true
      touchEnabled: settings.shapePreviewTouch === true // Default false
    };
  }, [globalSettings]);
  
  // Get distance settings for dimension display
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
    // Segment picker (mobile/touch UI)
    segmentPickerOpen,
    segmentPickerCell,
    segmentPickerExistingCell,
    closeSegmentPicker,
    applySegmentSelection,
    savedSegments,
    rememberSegments,
    // Segment hover (desktop preview)
    segmentHoverInfo,
    updateSegmentHover,
    clearSegmentHover
  } = useDrawingTools(
    currentTool,
    selectedColor,
    selectedOpacity,
    previewSettings
  );
  
  // Combined stop function that handles both cell and edge drawing
  const handleStopDrawing = dc.useCallback(() => {
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      stopEdgeDrawing();
    } else if (currentTool === 'segmentDraw') {
      stopSegmentDrawing();
    } else {
      stopDrawing();
    }
  }, [currentTool, stopDrawing, stopEdgeDrawing, stopSegmentDrawing]);
  
  // Handle escape key to cancel
  const handleKeyDown = dc.useCallback((e) => {
    if (e.key === 'Escape') {
      if (segmentPickerOpen) {
        closeSegmentPicker();
      } else if (rectangleStart || circleStart || edgeLineStart || touchConfirmPending) {
        cancelShapePreview();
      }
    }
  }, [rectangleStart, circleStart, edgeLineStart, touchConfirmPending, cancelShapePreview, segmentPickerOpen, closeSegmentPicker]);
  
  // Register keyboard handler
  dc.useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown]);
  
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('drawing', {
      handleDrawingPointerDown,
      handleDrawingPointerMove,
      stopDrawing: handleStopDrawing,
      cancelDrawing,
      isDrawing,
      rectangleStart,
      circleStart,
      edgeLineStart,
      // Shape preview handlers
      updateShapeHover,
      updateEdgeLineHover,
      shapeHoverPosition,
      touchConfirmPending,
      cancelShapePreview,
      previewEnabled: previewSettings.kbmEnabled,
      // Segment hover handlers
      updateSegmentHover,
      clearSegmentHover
    });
    
    return () => unregisterHandlers('drawing');
  }, [registerHandlers, unregisterHandlers, handleDrawingPointerDown, handleDrawingPointerMove, 
      handleStopDrawing, cancelDrawing, isDrawing, rectangleStart, circleStart, edgeLineStart,
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
  
  /**
   * Render the start marker overlay (small indicator on first click point)
   */
  const renderStartMarker = () => {
    if (!canvasRef.current || !containerRef?.current || !geometry) return null;
    
    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;
    
    // Calculate viewport parameters based on geometry type
    let scaledSize, offsetX, offsetY;
    
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
    
    const gridToCanvasPosition = (gridX, gridY) => {
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
    
    const intersectionToCanvasPosition = (intX, intY) => {
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
    
    const overlays = [];
    const displayScaledSize = scaledSize * displayScale;
    
    // Only show start marker if we don't have a full shape preview showing
    const showFullPreview = shapeHoverPosition && previewSettings.kbmEnabled;
    const showTouchPreview = touchConfirmPending && pendingEndPoint;
    
    // Rectangle start indicator (only if not showing full preview)
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
    
    // Circle start indicator (only if not showing full preview)
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
    
    // Edge line start indicator - X marker (only if not showing full preview)
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
  
  /**
   * Render the full shape preview overlay
   */
  const renderShapePreview = () => {
    // Determine the end point - either hover position or pending touch end point
    const endPoint = touchConfirmPending ? pendingEndPoint : shapeHoverPosition;
    
    // Check if we should show the preview
    const shouldShowPreview = endPoint && (
      (previewSettings.kbmEnabled && shapeHoverPosition && !touchConfirmPending) ||
      (touchConfirmPending && pendingEndPoint)
    );
    
    if (!shouldShowPreview) return null;
    
    // Determine shape type
    let shapeType = null;
    let startPoint = null;
    
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
      
      {/* Segment Hover Overlay (desktop preview for segment painting) */}
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
      
      {/* Segment Picker Overlay (mobile/touch UI for segment painting) */}
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