const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useDrawingTools } = await requireModuleByName("useDrawingTools.js");
const { useMapState, useMapOperations } = await requireModuleByName("MapContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

/**
 * DrawingLayer.jsx
 * FIX v3: Use inverse screenToGrid transformation instead of gridToScreen
 */
const DrawingLayer = ({
  currentTool,
  selectedColor,
  onDrawingStateChange
}) => {
  const { 
    canvasRef, 
    mapData, 
    screenToGrid, 
    screenToWorld, 
    getClientCoords, 
    GridGeometry,
    geometry
  } = useMapState();
  
  const { 
    getTextLabelAtPosition, 
    removeTextLabel, 
    getObjectAtPosition, 
    removeObjectAtPosition, 
    removeObjectsInRectangle 
  } = useMapOperations();
  
  const {
    isDrawing,
    rectangleStart,
    circleStart,
    edgeLineStart,
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    stopDrawing,
    stopEdgeDrawing,
    cancelDrawing
  } = useDrawingTools(
    currentTool,
    selectedColor
  );
  
  // Combined stop function that handles both cell and edge drawing
  const handleStopDrawing = dc.useCallback(() => {
    if (currentTool === 'edgeDraw' || currentTool === 'edgeErase') {
      stopEdgeDrawing();
    } else {
      stopDrawing();
    }
  }, [currentTool, stopDrawing, stopEdgeDrawing]);
  
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
      edgeLineStart
    });
    
    return () => unregisterHandlers('drawing');
  }, [registerHandlers, unregisterHandlers, handleDrawingPointerDown, handleDrawingPointerMove, handleStopDrawing, cancelDrawing, isDrawing, rectangleStart, circleStart, edgeLineStart]);
  
  dc.useEffect(() => {
    if (onDrawingStateChange) {
      onDrawingStateChange({
        isDrawing,
        rectangleStart,
        circleStart,
        edgeLineStart,
        handlers: {
          handleDrawingPointerDown,
          handleDrawingPointerMove,
          stopDrawing: handleStopDrawing,
          cancelDrawing
        }
      });
    }
  }, [isDrawing, rectangleStart, circleStart, edgeLineStart, onDrawingStateChange, handleStopDrawing]);
  
  const renderPreviewOverlay = () => {
    if (!canvasRef.current || !geometry) return null;
    
    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;
    
    // Calculate viewport parameters based on geometry type
    let scaledSize, offsetX, offsetY;
    
    if (geometry.constructor.name === 'GridGeometry') {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      // Hex: center is in world pixel coordinates, not hex coordinates
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }
    
    const containerRect = canvas.parentElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    
    const displayScale = canvasRect.width / width;
    
    // NEW APPROACH: Use the inverse of screenToGrid transformation
    // This ensures perfect symmetry with how clicks are converted to grid cells
    const gridToCanvasPosition = (gridX, gridY) => {
      // Convert grid to world coordinates (cell center for better accuracy)
      const worldX = (gridX + 0.5) * geometry.cellSize;
      const worldY = (gridY + 0.5) * geometry.cellSize;
      
      // Convert world to canvas coordinates (non-rotated)
      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;
      
      // Apply rotation around canvas center (matching canvas rendering)
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
      
      // Scale to display coordinates
      screenX *= displayScale;
      screenY *= displayScale;
      
      // Add canvas offset and adjust back to top-left corner
      const cellHalfSize = (scaledSize * displayScale) / 2;
      return { 
        x: canvasOffsetX + screenX - cellHalfSize, 
        y: canvasOffsetY + screenY - cellHalfSize
      };
    };
    
    // Convert grid intersection point to canvas position
    // Unlike gridToCanvasPosition, this targets the corner/intersection, not cell center
    const intersectionToCanvasPosition = (intX, intY) => {
      // Intersection point - no +0.5 offset since we want the corner
      const worldX = intX * geometry.cellSize;
      const worldY = intY * geometry.cellSize;
      
      // Convert world to canvas coordinates (non-rotated)
      let screenX = offsetX + worldX * zoom;
      let screenY = offsetY + worldY * zoom;
      
      // Apply rotation around canvas center (matching canvas rendering)
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
      
      // Scale to display coordinates
      screenX *= displayScale;
      screenY *= displayScale;
      
      return { 
        x: canvasOffsetX + screenX, 
        y: canvasOffsetY + screenY
      };
    };
    
    const overlays = [];
    const displayScaledSize = scaledSize * displayScale;
    
    // Rectangle start indicator  
    if (rectangleStart) {
      const pos = gridToCanvasPosition(rectangleStart.x, rectangleStart.y);
      
      const highlightColor = currentTool === 'clearArea' ? '#ff0000' : '#00ff00';
      
      overlays.push(
        <div
          key="rectangle-preview"
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
    
    if (circleStart) {
      const pos = gridToCanvasPosition(circleStart.x, circleStart.y);
      
      const highlightColor = '#00aaff';
      
      overlays.push(
        <div
          key="circle-preview"
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
    
    // Edge line start indicator - X marker at grid intersection
    if (edgeLineStart) {
      // Use intersection positioning since edgeLineStart stores intersection coords
      const pos = intersectionToCanvasPosition(edgeLineStart.x, edgeLineStart.y);
      
      const highlightColor = '#ff9500'; // Orange for edge line
      const markerSize = Math.max(16, displayScaledSize * 0.4); // Scale with zoom but min 16px
      const halfMarker = markerSize / 2;
      const strokeWidth = Math.max(2, markerSize / 8);
      
      overlays.push(
        <svg
          key="edgeline-preview"
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
          {/* X mark centered on intersection */}
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
  
  return renderPreviewOverlay();
};

return { DrawingLayer };