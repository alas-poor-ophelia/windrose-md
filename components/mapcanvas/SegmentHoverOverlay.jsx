/**
 * SegmentHoverOverlay.jsx
 * 
 * Visual overlay showing which segment will be painted on click.
 * Only shown on desktop (mouse/pointer) when segment paint tool is active.
 */

const pathResolverPath = dc.resolvePath("pathResolver.js");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { GridGeometry } = await requireModuleByName("GridGeometry.ts");
const { SEGMENT_VERTICES, SEGMENT_TRIANGLES } = await requireModuleByName("dmtConstants.ts");

/**
 * Convert cell coordinates to screen coordinates
 * 
 * @param {number} cellX - Cell X coordinate
 * @param {number} cellY - Cell Y coordinate
 * @param {Object} geometry - GridGeometry instance
 * @param {Object} mapData - Map data containing viewState
 * @param {number} canvasWidth - Canvas width in pixels
 * @param {number} canvasHeight - Canvas height in pixels
 * @returns {{x: number, y: number}} Screen coordinates of cell's top-left corner
 */
function cellToScreen(cellX, cellY, geometry, mapData, canvasWidth, canvasHeight) {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection || 0;
  
  // Get world coordinates for cell's top-left corner
  const worldX = cellX * geometry.cellSize;
  const worldY = cellY * geometry.cellSize;
  
  // Calculate offset
  const scaledCellSize = geometry.getScaledCellSize(zoom);
  const offsetX = canvasWidth / 2 - center.x * scaledCellSize;
  const offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  
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
 * Get SVG path for a segment triangle
 * 
 * @param {string} segmentName - Segment name (nw, n, ne, etc.)
 * @param {number} cellSize - Size of cell in screen pixels
 * @returns {string} SVG path d attribute
 */
function getSegmentPath(segmentName, cellSize) {
  const [v1Name, v2Name, v3Name] = SEGMENT_TRIANGLES[segmentName];
  
  const getPoint = (vertexName) => {
    const vertex = SEGMENT_VERTICES[vertexName];
    return {
      x: vertex.xRatio * cellSize,
      y: vertex.yRatio * cellSize
    };
  };
  
  const v1 = getPoint(v1Name);
  const v2 = getPoint(v2Name);
  const v3 = getPoint(v3Name);
  
  return `M ${v1.x} ${v1.y} L ${v2.x} ${v2.y} L ${v3.x} ${v3.y} Z`;
}

/**
 * SegmentHoverOverlay Component
 * 
 * @param {Object} hoverInfo - {cellX, cellY, segment} or null
 * @param {string} selectedColor - Currently selected paint color
 * @param {Object} geometry - GridGeometry instance
 * @param {Object} mapData - Map data
 * @param {HTMLCanvasElement} canvasRef - Reference to canvas element
 * @param {Object} containerRef - Reference to container element
 */
const SegmentHoverOverlay = ({
  hoverInfo,
  selectedColor,
  geometry,
  mapData,
  canvasRef,
  containerRef
}) => {
  // Don't render if no hover info or not a grid map
  if (!hoverInfo || !geometry || !mapData || !(geometry instanceof GridGeometry)) {
    return null;
  }
  
  const { cellX, cellY, segment } = hoverInfo;
  
  // Get canvas and container references
  const canvas = canvasRef?.current;
  const container = containerRef?.current;
  if (!canvas || !container) return null;
  
  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;
  
  // Account for high-DPI displays and canvas position
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;
  
  // Canvas offset within container
  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;
  
  // Calculate screen position of the cell (in canvas coordinates)
  const cellTopLeft = cellToScreen(cellX, cellY, geometry, mapData, canvasWidth, canvasHeight);
  
  // Apply display scale and offset to get final screen position
  const scaledTopLeft = {
    x: cellTopLeft.x * displayScale + canvasOffsetX,
    y: cellTopLeft.y * displayScale + canvasOffsetY
  };
  
  // Calculate cell size in screen pixels (accounting for display scale)
  const scaledCellSize = geometry.getScaledCellSize(mapData.viewState.zoom) * displayScale;
  
  // Get segment path
  const segmentPath = getSegmentPath(segment, scaledCellSize);
  
  return (
    <svg
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible'
      }}
    >
      <g transform={`translate(${scaledTopLeft.x}, ${scaledTopLeft.y})`}>
        {/* Highlight fill */}
        <path
          d={segmentPath}
          fill={selectedColor}
          fillOpacity={0.4}
          stroke={selectedColor}
          strokeWidth={2}
          strokeOpacity={0.8}
        />
      </g>
    </svg>
  );
};

return { SegmentHoverOverlay };