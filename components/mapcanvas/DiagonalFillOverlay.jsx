/**
 * DiagonalFillOverlay.jsx
 * 
 * Overlay component for diagonal fill tool.
 * Manages tool state via useDiagonalFill hook, registers event handlers,
 * and renders SVG preview showing where the diagonal fill will be applied.
 * 
 * The diagonal fill tool fills "concave corners" along staircase diagonals
 * by painting 4 segments (half-cell) in each gap, creating smooth diagonal edges.
 * 
 * Usage:
 * <MapCanvas.DiagonalFillOverlay currentTool={currentTool} />
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { GridGeometry } = await requireModuleByName("GridGeometry.js");
const { useDiagonalFill } = await requireModuleByName("useDiagonalFill.js");
const { useMapState } = await requireModuleByName("MapContext.jsx");
const { useEventHandlerRegistration } = await requireModuleByName("EventHandlerContext.jsx");

/**
 * Convert cell corner to screen coordinates
 * Uses the same approach as MeasurementOverlay's cellToScreen
 * 
 * @param {number} cellX - Cell X coordinate
 * @param {number} cellY - Cell Y coordinate
 * @param {string} corner - Corner name ('TL', 'TR', 'BR', 'BL')
 * @param {Object} geometry - GridGeometry instance
 * @param {Object} mapData - Map data with viewState
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {{x: number, y: number}} Screen coordinates
 */
function cornerToScreen(cellX, cellY, corner, geometry, mapData, canvasWidth, canvasHeight) {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection || 0;
  const cellSize = geometry.cellSize;
  
  // Get corner position in world coordinates (not cell center!)
  // TL = top-left of cell, TR = top-right, etc.
  const cornerWorldOffsets = {
    'TL': { x: 0, y: 0 },
    'TR': { x: 1, y: 0 },
    'BR': { x: 1, y: 1 },
    'BL': { x: 0, y: 1 }
  };
  
  const cornerOffset = cornerWorldOffsets[corner] || { x: 0, y: 0 };
  const worldX = (cellX + cornerOffset.x) * cellSize;
  const worldY = (cellY + cornerOffset.y) * cellSize;
  
  // Calculate offset (same as MeasurementOverlay and useCanvasRenderer)
  const scaledCellSize = geometry.getScaledCellSize(zoom);
  const offsetX = canvasWidth / 2 - center.x * scaledCellSize;
  const offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  
  // Convert world to screen (same as MeasurementOverlay)
  let screenX = offsetX + worldX * zoom;
  let screenY = offsetY + worldY * zoom;
  
  // Apply rotation if needed (same as MeasurementOverlay)
  if (northDirection !== 0) {
    const centerX = canvasWidth / 2;
    const centerY = canvasHeight / 2;
    
    screenX -= centerX;
    screenY -= centerY;
    
    const angleRad = (northDirection * Math.PI) / 180;
    const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
    const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);
    
    screenX = rotatedX + centerX;
    screenY = rotatedY + centerY;
  }
  
  return { x: screenX, y: screenY };
}

/**
 * Small triangle indicator showing which corner was clicked
 */
const CornerIndicator = ({ x, y, corner, size = 12 }) => {
  // Triangle points outward from the corner
  const halfSize = size / 2;
  
  // Calculate triangle points based on corner
  // Points away from the cell interior
  const trianglePoints = {
    'TL': `${x},${y} ${x - halfSize},${y - size} ${x - size},${y - halfSize}`,
    'TR': `${x},${y} ${x + halfSize},${y - size} ${x + size},${y - halfSize}`,
    'BR': `${x},${y} ${x + halfSize},${y + size} ${x + size},${y + halfSize}`,
    'BL': `${x},${y} ${x - halfSize},${y + size} ${x - size},${y + halfSize}`
  };
  
  const points = trianglePoints[corner];
  if (!points) return null;
  
  return (
    <polygon
      points={points}
      fill="rgba(0, 212, 255, 0.6)"
      stroke="#00d4ff"
      strokeWidth={1}
    />
  );
};

const DiagonalFillOverlay = ({ currentTool }) => {
  // Get map state from context
  const { 
    mapData, 
    geometry,
    canvasRef
  } = useMapState();
  
  // Use the diagonal fill hook for state and handlers
  const {
    fillStart,
    fillEnd,
    isEndLocked,
    previewEnd,
    handleDiagonalFillClick,
    handleDiagonalFillMove,
    cancelFill
  } = useDiagonalFill(currentTool);
  
  // Register handlers with event coordinator
  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();
  
  dc.useEffect(() => {
    registerHandlers('diagonalFill', {
      handleDiagonalFillClick,
      handleDiagonalFillMove,
      cancelFill,
      fillStart
    });
    return () => unregisterHandlers('diagonalFill');
  }, [registerHandlers, unregisterHandlers, handleDiagonalFillClick, handleDiagonalFillMove, cancelFill, fillStart]);
  
  // Don't render if tool not active, no start point, or missing dependencies
  if (currentTool !== 'diagonalFill' || !fillStart || !geometry || !mapData || !canvasRef?.current) {
    return null;
  }
  
  // Only works for grid geometry
  if (!(geometry instanceof GridGeometry)) {
    return null;
  }
  
  // Determine end point to display
  const displayEnd = fillEnd || previewEnd;
  
  // Get canvas dimensions
  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;
  
  // Get canvas offset within the flex container (dmt-canvas-container)
  // The SVG is positioned relative to dmt-canvas-container, not the canvas's immediate parent
  // We need to find dmt-canvas-container and calculate offset from there
  let flexContainer = canvas.parentElement;
  while (flexContainer && !flexContainer.classList.contains('dmt-canvas-container')) {
    flexContainer = flexContainer.parentElement;
  }
  const containerRect = flexContainer?.getBoundingClientRect();
  const canvasOffsetX = containerRect ? canvasRect.left - containerRect.left : 0;
  const canvasOffsetY = containerRect ? canvasRect.top - containerRect.top : 0;
  
  // Calculate screen positions for start corner
  const startScreen = cornerToScreen(
    fillStart.x, fillStart.y, fillStart.corner,
    geometry, mapData, canvasWidth, canvasHeight
  );
  
  // Apply display scale and canvas offset
  const scaledStart = {
    x: startScreen.x * displayScale + canvasOffsetX,
    y: startScreen.y * displayScale + canvasOffsetY
  };
  
  // Calculate end position if we have one
  let scaledEnd = null;
  if (displayEnd) {
    const endScreen = cornerToScreen(
      displayEnd.x, displayEnd.y, fillStart.corner,
      geometry, mapData, canvasWidth, canvasHeight
    );
    
    scaledEnd = {
      x: endScreen.x * displayScale + canvasOffsetX,
      y: endScreen.y * displayScale + canvasOffsetY
    };
  }
  
  return (
    <svg 
      className="dmt-diagonal-fill-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 100,
        overflow: 'visible'
      }}
    >
      {/* Preview line - dashed when hovering, solid when end is locked */}
      {scaledEnd && (
        <line
          x1={scaledStart.x}
          y1={scaledStart.y}
          x2={scaledEnd.x}
          y2={scaledEnd.y}
          stroke="#00d4ff"
          strokeWidth={2.5}
          strokeDasharray={isEndLocked ? "none" : "8,4"}
          strokeLinecap="round"
        />
      )}
      
      {/* Start corner marker */}
      <circle
        cx={scaledStart.x}
        cy={scaledStart.y}
        r={8}
        fill="rgba(0, 212, 255, 0.8)"
        stroke="#00d4ff"
        strokeWidth={2}
      />
      
      {/* Corner indicator - small triangle showing which corner was selected */}
      <CornerIndicator 
        x={scaledStart.x} 
        y={scaledStart.y} 
        corner={fillStart.corner}
        size={12}
      />
      
      {/* End corner marker (if valid path exists) */}
      {scaledEnd && (
        <>
          <circle
            cx={scaledEnd.x}
            cy={scaledEnd.y}
            r={isEndLocked ? 7 : 5}
            fill={isEndLocked ? "rgba(0, 212, 255, 0.9)" : "rgba(0, 212, 255, 0.6)"}
            stroke="#00d4ff"
            strokeWidth={isEndLocked ? 2 : 1.5}
          />
          
          {/* Confirmation hint for touch (when end is locked) */}
          {isEndLocked && (
            <g transform={`translate(${scaledEnd.x + 15}, ${scaledEnd.y - 20})`}>
              <rect
                x={0}
                y={-12}
                width={70}
                height={24}
                rx={4}
                fill="rgba(26, 26, 26, 0.95)"
                stroke="#00d4ff"
                strokeWidth={1}
              />
              <text
                x={35}
                y={4}
                textAnchor="middle"
                fill="#ffffff"
                fontSize={11}
                fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
                fontWeight="500"
              >
                Tap to fill
              </text>
            </g>
          )}
        </>
      )}
    </svg>
  );
};

return { DiagonalFillOverlay };