/**
 * AreaSelectLayer.jsx
 * 
 * Handles area selection tool:
 * - Registers handlers with EventHandlerContext
 * - Renders start marker overlay (similar to rectangle tool)
 * - Coordinates with MapSelectionContext for multi-select
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { useAreaSelect } = await requireModuleByName("useAreaSelect.ts");
const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useMapSelection } = await requireModuleByName("MapSelectionContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");
const { GridGeometry } = await requireModuleByName("GridGeometry.ts");

/**
 * AreaSelectLayer Component
 * 
 * @param {string} currentTool - Current active tool
 */
const AreaSelectLayer = ({ currentTool }) => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { areaSelectStart, setAreaSelectStart, clearSelection } = useMapSelection();
  
  const {
    handleAreaSelectClick,
    cancelAreaSelect,
    isAreaSelecting
  } = useAreaSelect(currentTool);
  
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  // Register handlers with event coordinator
  dc.useEffect(() => {
    registerHandlers('areaSelect', {
      handleAreaSelectClick,
      cancelAreaSelect,
      isAreaSelecting,
      areaSelectStart
    });
    
    return () => unregisterHandlers('areaSelect');
  }, [registerHandlers, unregisterHandlers, handleAreaSelectClick, cancelAreaSelect, isAreaSelecting, areaSelectStart]);
  
  // Cancel area selection when tool changes away from areaSelect
  dc.useEffect(() => {
    if (currentTool !== 'areaSelect' && areaSelectStart) {
      setAreaSelectStart(null);
    }
    // Clear selection when switching away from select/areaSelect tools
    if (currentTool !== 'areaSelect' && currentTool !== 'select') {
      clearSelection();
    }
  }, [currentTool, areaSelectStart, setAreaSelectStart, clearSelection]);
  
  /**
   * Render the start marker overlay
   * Shows a highlighted cell at the first corner position
   */
  const renderStartMarker = () => {
    if (!areaSelectStart || !canvasRef.current || !containerRef?.current || !geometry || !mapData) {
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
      scaledSize = geometry.getScaledHexSize ? geometry.getScaledHexSize(zoom) : zoom * 30;
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }
    
    // Use containerRef for proper positioning relative to parent container
    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    
    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;
    
    const displayScale = canvasRect.width / width;
    
    // Get grid cell for the start position
    const gridX = areaSelectStart.x;
    const gridY = areaSelectStart.y;
    
    // Convert grid cell center to screen position
    let screenX, screenY;
    
    if (isGrid) {
      // Grid: use cell center
      const cellWorldX = (gridX + 0.5) * geometry.cellSize;
      const cellWorldY = (gridY + 0.5) * geometry.cellSize;
      screenX = offsetX + cellWorldX * zoom;
      screenY = offsetY + cellWorldY * zoom;
    } else {
      // Hex: use hex center from geometry
      const hexCenter = geometry.hexToWorld(gridX, gridY);
      screenX = offsetX + hexCenter.worldX * zoom;
      screenY = offsetY + hexCenter.worldY * zoom;
    }
    
    // Apply rotation around canvas center
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
    
    // Calculate marker size
    const displayScaledSize = scaledSize * displayScale;
    const cellHalfSize = displayScaledSize / 2;
    
    // Position at cell top-left
    const markerX = canvasOffsetX + screenX - cellHalfSize;
    const markerY = canvasOffsetY + screenY - cellHalfSize;
    
    const highlightColor = '#4a9eff'; // Blue for area select
    
    return (
      <div
        key="area-select-start"
        className="dmt-area-select-marker"
        style={{
          position: 'absolute',
          left: `${markerX}px`,
          top: `${markerY}px`,
          width: `${displayScaledSize}px`,
          height: `${displayScaledSize}px`,
          border: `2px dashed ${highlightColor}`,
          backgroundColor: 'rgba(74, 158, 255, 0.15)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: 100,
          borderRadius: '2px'
        }}
      />
    );
  };
  
  return renderStartMarker();
};

return { AreaSelectLayer };