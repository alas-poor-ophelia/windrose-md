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
    handleDrawingPointerDown,
    handleDrawingPointerMove,
    stopDrawing,
    cancelDrawing
  } = useDrawingTools(
    currentTool,
    selectedColor
  );
  
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('drawing', {
      handleDrawingPointerDown,
      handleDrawingPointerMove,
      stopDrawing,
      cancelDrawing,
      isDrawing,
      rectangleStart,
      circleStart
    });
    
    return () => unregisterHandlers('drawing');
  }, [registerHandlers, unregisterHandlers, handleDrawingPointerDown, handleDrawingPointerMove, stopDrawing, cancelDrawing, isDrawing, rectangleStart, circleStart]);
  
  dc.useEffect(() => {
    if (onDrawingStateChange) {
      onDrawingStateChange({
        isDrawing,
        rectangleStart,
        circleStart,
        handlers: {
          handleDrawingPointerDown,
          handleDrawingPointerMove,
          stopDrawing,
          cancelDrawing
        }
      });
    }
  }, [isDrawing, rectangleStart, circleStart, onDrawingStateChange]);
  
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
    
    return overlays.length > 0 ? <>{overlays}</> : null;
  };
  
  return renderPreviewOverlay();
};

return { DrawingLayer };