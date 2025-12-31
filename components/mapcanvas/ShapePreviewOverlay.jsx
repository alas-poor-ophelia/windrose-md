/**
 * ShapePreviewOverlay.jsx
 * 
 * Visual overlay for shape drawing tool previews.
 * Shows the outline of rectangle, circle, or edge line shapes
 * with dimensions displayed in the user's selected units.
 * 
 * Used by DrawingLayer to show live preview while hovering (KBM)
 * or static preview for touch confirmation flow.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { GridGeometry } = await requireModuleByName("GridGeometry.ts");
const { formatDistance } = await requireModuleByName("distanceOperations.ts");

/**
 * Convert cell coordinates to screen coordinates
 * Handles both cell centers and grid intersections
 * 
 * @param {number} cellX - Cell X coordinate
 * @param {number} cellY - Cell Y coordinate
 * @param {Object} geometry - GridGeometry or HexGeometry instance
 * @param {Object} mapData - Map data containing viewState
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @param {boolean} useCenter - If true, target cell center; if false, target corner/intersection
 * @returns {{x: number, y: number}} Screen coordinates
 */
function cellToScreen(cellX, cellY, geometry, mapData, canvasWidth, canvasHeight, useCenter = true) {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection || 0;
  
  // Get position in world coordinates
  let worldX, worldY;
  if (useCenter) {
    // Cell center
    if (geometry.getCellCenter) {
      const cellCenter = geometry.getCellCenter(cellX, cellY);
      worldX = cellCenter.worldX;
      worldY = cellCenter.worldY;
    } else {
      worldX = (cellX + 0.5) * geometry.cellSize;
      worldY = (cellY + 0.5) * geometry.cellSize;
    }
  } else {
    // Grid intersection (corner)
    worldX = cellX * geometry.cellSize;
    worldY = cellY * geometry.cellSize;
  }
  
  // Calculate offset based on geometry type
  let offsetX, offsetY;
  if (geometry instanceof GridGeometry) {
    const scaledCellSize = geometry.getScaledCellSize(zoom);
    offsetX = canvasWidth / 2 - center.x * scaledCellSize;
    offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  } else {
    // HexGeometry: center is in world pixel coordinates
    offsetX = canvasWidth / 2 - center.x * zoom;
    offsetY = canvasHeight / 2 - center.y * zoom;
  }
  
  // Convert world to screen
  let screenX = offsetX + worldX * zoom;
  let screenY = offsetY + worldY * zoom;
  
  // Apply rotation if needed
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
 * Format dimension text for display
 * @param {number} widthCells - Width in cells
 * @param {number} heightCells - Height in cells
 * @param {Object} distanceSettings - Distance settings from plugin
 * @returns {string} Formatted dimension string (e.g., "25×15 ft")
 */
function formatRectDimensions(widthCells, heightCells, distanceSettings) {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const widthUnits = widthCells * distancePerCell;
  const heightUnits = heightCells * distancePerCell;
  
  // Round for cleaner display
  const roundedWidth = Number.isInteger(widthUnits) ? widthUnits : Math.round(widthUnits * 10) / 10;
  const roundedHeight = Number.isInteger(heightUnits) ? heightUnits : Math.round(heightUnits * 10) / 10;
  
  return `${roundedWidth}×${roundedHeight} ${distanceUnit}`;
}

/**
 * Format radius for circle display
 * @param {number} radiusCells - Radius in cells
 * @param {Object} distanceSettings - Distance settings
 * @returns {string} Formatted radius string (e.g., "r: 15 ft")
 */
function formatCircleRadius(radiusCells, distanceSettings) {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const radiusUnits = radiusCells * distancePerCell;
  const rounded = Number.isInteger(radiusUnits) ? radiusUnits : Math.round(radiusUnits * 10) / 10;
  return `r: ${rounded} ${distanceUnit}`;
}

/**
 * Format edge line length
 * @param {number} lengthCells - Length in cells
 * @param {Object} distanceSettings - Distance settings
 * @returns {string} Formatted length string
 */
function formatEdgeLength(lengthCells, distanceSettings) {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const lengthUnits = lengthCells * distancePerCell;
  const rounded = Number.isInteger(lengthUnits) ? lengthUnits : Math.round(lengthUnits * 10) / 10;
  return `${rounded} ${distanceUnit}`;
}

/**
 * ShapePreviewOverlay Component
 * 
 * @param {string} shapeType - 'rectangle' | 'circle' | 'clearArea' | 'edgeLine'
 * @param {Object} startPoint - Starting point {x, y}
 * @param {Object} endPoint - End/hover point {x, y}
 * @param {Object} geometry - GridGeometry instance
 * @param {Object} mapData - Map data
 * @param {HTMLCanvasElement} canvasRef - Reference to canvas element
 * @param {Object} containerRef - Reference to container element
 * @param {Object} distanceSettings - Distance settings for formatting
 * @param {boolean} isConfirmable - If true (touch mode), show as confirmable preview
 */
const ShapePreviewOverlay = ({
  shapeType,
  startPoint,
  endPoint,
  geometry,
  mapData,
  canvasRef,
  containerRef,
  distanceSettings,
  isConfirmable = false
}) => {
  const textRef = dc.useRef(null);
  const [textWidth, setTextWidth] = dc.useState(80);
  
  // Measure text width for auto-sizing tooltip
  dc.useEffect(() => {
    if (textRef.current) {
      try {
        const bbox = textRef.current.getBBox();
        setTextWidth(Math.max(bbox.width + 20, 60));
      } catch (e) {
        // getBBox can fail if element not rendered yet
      }
    }
  }, [startPoint, endPoint, shapeType]);
  
  if (!startPoint || !endPoint || !geometry || !mapData || !canvasRef?.current || !containerRef?.current) {
    return null;
  }
  
  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = containerRef.current.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;
  
  // Canvas offset within container
  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;
  
  // Get scaled cell size for rectangle dimensions
  const { zoom } = mapData.viewState;
  const scaledCellSize = geometry.getScaledCellSize(zoom) * displayScale;
  
  // Define colors based on shape type
  const colors = {
    rectangle: '#00ff00',
    clearArea: '#ff0000', 
    circle: '#00aaff',
    edgeLine: '#ff9500'
  };
  const strokeColor = colors[shapeType] || '#00ff00';
  
  // Calculate screen positions
  let overlayContent = null;
  let dimensionText = '';
  let tooltipPosition = { x: 0, y: 0 };
  
  if (shapeType === 'rectangle' || shapeType === 'clearArea') {
    // Rectangle preview
    const startScreen = cellToScreen(startPoint.x, startPoint.y, geometry, mapData, canvasWidth, canvasHeight, true);
    const endScreen = cellToScreen(endPoint.x, endPoint.y, geometry, mapData, canvasWidth, canvasHeight, true);
    
    // Apply display scale and canvas offset
    const scaledStart = {
      x: startScreen.x * displayScale + canvasOffsetX,
      y: startScreen.y * displayScale + canvasOffsetY
    };
    const scaledEnd = {
      x: endScreen.x * displayScale + canvasOffsetX,
      y: endScreen.y * displayScale + canvasOffsetY
    };
    
    // Calculate rectangle bounds (cells are inclusive)
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);
    
    const widthCells = maxX - minX + 1;
    const heightCells = maxY - minY + 1;
    
    // Rectangle corners in screen space (top-left corner of cells)
    const topLeftScreen = cellToScreen(minX, minY, geometry, mapData, canvasWidth, canvasHeight, true);
    const rectX = topLeftScreen.x * displayScale + canvasOffsetX - scaledCellSize / 2;
    const rectY = topLeftScreen.y * displayScale + canvasOffsetY - scaledCellSize / 2;
    const rectWidth = widthCells * scaledCellSize;
    const rectHeight = heightCells * scaledCellSize;
    
    dimensionText = distanceSettings ? formatRectDimensions(widthCells, heightCells, distanceSettings) : `${widthCells}×${heightCells}`;
    tooltipPosition = { x: rectX + rectWidth / 2, y: rectY - 10 };
    
    overlayContent = (
      <rect
        x={rectX}
        y={rectY}
        width={rectWidth}
        height={rectHeight}
        fill={isConfirmable ? `${strokeColor}22` : 'none'}
        stroke={strokeColor}
        strokeWidth={2}
        strokeDasharray={isConfirmable ? "none" : "8,4"}
        rx={2}
      />
    );
    
  } else if (shapeType === 'circle') {
    // Circle preview
    const centerScreen = cellToScreen(startPoint.x, startPoint.y, geometry, mapData, canvasWidth, canvasHeight, true);
    
    const scaledCenter = {
      x: centerScreen.x * displayScale + canvasOffsetX,
      y: centerScreen.y * displayScale + canvasOffsetY
    };
    
    // Calculate radius in cells (Euclidean distance)
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const radiusCells = Math.sqrt(dx * dx + dy * dy);
    
    // Convert radius to screen pixels
    const radiusScreen = radiusCells * scaledCellSize;
    
    dimensionText = distanceSettings ? formatCircleRadius(radiusCells, distanceSettings) : `r: ${Math.round(radiusCells * 10) / 10}`;
    tooltipPosition = { x: scaledCenter.x, y: scaledCenter.y - radiusScreen - 15 };
    
    overlayContent = (
      <circle
        cx={scaledCenter.x}
        cy={scaledCenter.y}
        r={radiusScreen}
        fill={isConfirmable ? `${strokeColor}22` : 'none'}
        stroke={strokeColor}
        strokeWidth={2}
        strokeDasharray={isConfirmable ? "none" : "8,4"}
      />
    );
    
  } else if (shapeType === 'edgeLine') {
    // Edge line preview (connects grid intersections)
    const startScreen = cellToScreen(startPoint.x, startPoint.y, geometry, mapData, canvasWidth, canvasHeight, false);
    const endScreen = cellToScreen(endPoint.x, endPoint.y, geometry, mapData, canvasWidth, canvasHeight, false);
    
    const scaledStart = {
      x: startScreen.x * displayScale + canvasOffsetX,
      y: startScreen.y * displayScale + canvasOffsetY
    };
    const scaledEnd = {
      x: endScreen.x * displayScale + canvasOffsetX,
      y: endScreen.y * displayScale + canvasOffsetY
    };
    
    // Calculate length (Manhattan distance for edge lines)
    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    const lengthCells = dx + dy; // Edge lines follow grid edges
    
    dimensionText = distanceSettings ? formatEdgeLength(lengthCells, distanceSettings) : `${lengthCells}`;
    
    // Position tooltip at midpoint
    tooltipPosition = {
      x: (scaledStart.x + scaledEnd.x) / 2,
      y: (scaledStart.y + scaledEnd.y) / 2 - 25
    };
    
    overlayContent = (
      <>
        <line
          x1={scaledStart.x}
          y1={scaledStart.y}
          x2={scaledEnd.x}
          y2={scaledEnd.y}
          stroke={strokeColor}
          strokeWidth={3}
          strokeDasharray={isConfirmable ? "none" : "8,4"}
          strokeLinecap="round"
        />
        {/* Start marker */}
        <circle cx={scaledStart.x} cy={scaledStart.y} r={6} fill={strokeColor} />
        {/* End marker */}
        <circle cx={scaledEnd.x} cy={scaledEnd.y} r={5} fill={`${strokeColor}aa`} stroke={strokeColor} strokeWidth={1.5} />
      </>
    );
  }
  
  if (!overlayContent) return null;
  
  return (
    <svg 
      className="dmt-shape-preview-overlay"
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
      {overlayContent}
      
      {/* Dimension tooltip */}
      {dimensionText && (
        <g transform={`translate(${tooltipPosition.x}, ${tooltipPosition.y})`}>
          <rect
            x={-textWidth / 2}
            y={-14}
            width={textWidth}
            height={28}
            rx={4}
            fill="rgba(26, 26, 26, 0.95)"
            stroke={strokeColor}
            strokeWidth={1}
          />
          <text
            ref={textRef}
            x={0}
            y={5}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={13}
            fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
            fontWeight="500"
          >
            {dimensionText}
          </text>
        </g>
      )}
      
      {/* Confirmation hint for touch mode */}
      {isConfirmable && (
        <g transform={`translate(${tooltipPosition.x}, ${tooltipPosition.y + 40})`}>
          <text
            x={0}
            y={0}
            textAnchor="middle"
            fill="#888888"
            fontSize={11}
            fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
          >
            Tap inside to confirm
          </text>
        </g>
      )}
    </svg>
  );
};

return { ShapePreviewOverlay };