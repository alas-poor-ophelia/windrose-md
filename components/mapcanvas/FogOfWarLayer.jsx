/**
 * FogOfWarLayer.jsx
 * 
 * Interaction layer for Fog of War painting and erasing.
 * 
 * This is a thin wrapper component that:
 * - Uses useFogTools hook for all logic
 * - Registers handlers with EventHandlerContext
 * - Renders preview overlay for rectangle start point
 * 
 * Follows the same pattern as DrawingLayer.jsx for consistency.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useFogTools } = await requireModuleByName("useFogTools.js");
const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");
const { GridGeometry } = await requireModuleByName("GridGeometry.js");

/**
 * FogOfWarLayer Component
 * @param {string|null} activeTool - Current FoW tool: 'paint', 'erase', 'rectangle', or null
 * @param {Function} onFogChange - Callback when fog data changes: (updatedFogOfWar) => void
 * @param {Function} onInitializeFog - Callback to initialize fog if needed
 */
const FogOfWarLayer = ({
  activeTool,
  onFogChange,
  onInitializeFog
}) => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Use the fog tools hook for all logic
  const {
    isDrawing,
    rectangleStart,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleKeyDown,
    cancelFog
  } = useFogTools(activeTool, onFogChange, onInitializeFog);
  
  // Register event handlers when tool is active
  dc.useEffect(() => {
    if (!activeTool) {
      unregisterHandlers('fogOfWar');
      return;
    }
    
    registerHandlers('fogOfWar', {
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      handleKeyDown,
      isDrawing,
      rectangleStart
    });
    
    return () => unregisterHandlers('fogOfWar');
  }, [activeTool, registerHandlers, unregisterHandlers, 
      handlePointerDown, handlePointerMove, handlePointerUp, handleKeyDown,
      isDrawing, rectangleStart]);
  
  /**
   * Render preview overlay for rectangle start point
   */
  const renderPreviewOverlay = () => {
    if (!activeTool || !rectangleStart || !canvasRef.current || !containerRef?.current || !geometry) {
      return null;
    }
    
    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    const { zoom, center } = viewState;
    const { width, height } = canvas;
    
    // Calculate viewport parameters based on geometry type
    // Use instanceof for reliable type detection
    let scaledSize, offsetX, offsetY;
    
    const isGrid = geometry instanceof GridGeometry;
    if (isGrid) {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      // Hex: center is in world pixel coordinates
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
      scaledSize = geometry.getScaledCellSize(zoom);
    }
    
    // Use containerRef for proper positioning relative to dmt-canvas-container
    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    
    const displayScale = canvasRect.width / width;
    
    // Convert grid coordinates to screen position
    // For fog, we store offset coords (col, row), need to convert back to screen
    const { col, row } = rectangleStart;
    
    let screenX, screenY;
    
    if (isGrid) {
      // Grid: col/row map directly to grid coords
      const worldX = (col + 0.5) * geometry.cellSize;
      const worldY = (row + 0.5) * geometry.cellSize;
      screenX = offsetX + worldX * zoom;
      screenY = offsetY + worldY * zoom;
    } else {
      // Hex: need to convert offset back to axial, then to world
      if (geometry.offsetToAxial) {
        // If geometry has the method, use it
        const axial = geometry.offsetToAxial(col, row);
        const world = geometry.gridToWorld(axial.q, axial.r);
        screenX = offsetX + world.worldX * zoom;
        screenY = offsetY + world.worldY * zoom;
      } else {
        // Fallback: treat as grid coords
        screenX = offsetX + col * scaledSize;
        screenY = offsetY + row * scaledSize;
      }
    }
    
    // Apply rotation if needed
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
    
    // Apply display scale and offset
    const displayX = canvasOffsetX + screenX * displayScale;
    const displayY = canvasOffsetY + screenY * displayScale;
    const displaySize = scaledSize * displayScale;
    
    // Center on cell
    const halfSize = displaySize / 2;
    
    return (
      <div
        className="dmt-fow-preview"
        style={{
          position: 'absolute',
          left: `${displayX - halfSize}px`,
          top: `${displayY - halfSize}px`,
          width: `${displaySize}px`,
          height: `${displaySize}px`,
          border: '2px dashed #00ff00',
          backgroundColor: 'rgba(0, 255, 0, 0.1)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 100
        }}
      />
    );
  };
  
  return renderPreviewOverlay();
};

return { FogOfWarLayer };