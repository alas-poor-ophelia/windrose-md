/**
 * MeasurementOverlay.jsx
 * 
 * Visual overlay for distance measurement tool.
 * Draws a dashed line from origin to current cursor position
 * and displays the calculated distance in an auto-sized tooltip
 * anchored near the target cell.
 */

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { cellToScreen } = await requireModuleByName("cellToScreenConverter.ts");

const MeasurementOverlay = ({
  measureOrigin,
  currentTarget,
  formattedDistance,
  isTargetLocked = false,
  geometry,
  mapData,
  canvasRef
}) => {
  const textRef = dc.useRef(null);
  const [textWidth, setTextWidth] = dc.useState(80);
  
  // Measure text width for auto-sizing tooltip
  dc.useEffect(() => {
    if (textRef.current && formattedDistance) {
      const bbox = textRef.current.getBBox();
      setTextWidth(Math.max(bbox.width + 20, 60));
    }
  }, [formattedDistance]);
  
  if (!measureOrigin || !currentTarget || !geometry || !mapData || !canvasRef?.current) {
    return null;
  }
  
  // Get canvas dimensions (same approach as DrawingLayer)
  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;
  
  // Find the flex container (dmt-canvas-container) that the SVG is positioned relative to
  // Canvas may be nested inside wrapper divs, so traverse up to find the actual container
  let flexContainer = canvas.parentElement;
  let traversalCount = 0;
  while (flexContainer?.classList && !flexContainer.classList.contains('dmt-canvas-container')) {
    flexContainer = flexContainer.parentElement;
    traversalCount++;
    if (traversalCount > 10) {
      console.warn('[MeasurementOverlay] Could not find dmt-canvas-container after 10 levels');
      break;
    }
  }
  const containerRect = flexContainer?.getBoundingClientRect();
  const canvasOffsetX = containerRect ? canvasRect.left - containerRect.left : 0;
  const canvasOffsetY = containerRect ? canvasRect.top - containerRect.top : 0;

  // Calculate screen coordinates for origin and target
  const originScreen = cellToScreen(
    measureOrigin.x, measureOrigin.y,
    geometry, mapData, canvasWidth, canvasHeight
  );
  const targetScreen = cellToScreen(
    currentTarget.x, currentTarget.y,
    geometry, mapData, canvasWidth, canvasHeight
  );
  
  // Apply display scale and canvas offset (canvas may be offset within container due to sidebar)
  const scaledOrigin = {
    x: originScreen.x * displayScale + canvasOffsetX,
    y: originScreen.y * displayScale + canvasOffsetY
  };
  const scaledTarget = {
    x: targetScreen.x * displayScale + canvasOffsetX,
    y: targetScreen.y * displayScale + canvasOffsetY
  };

  const tooltipX = scaledTarget.x + 15;
  const tooltipY = scaledTarget.y - 30;
  
  return (
    <svg 
      className="dmt-measurement-overlay"
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
      {/* Measurement line - solid when locked, dashed when live */}
      <line
        x1={scaledOrigin.x}
        y1={scaledOrigin.y}
        x2={scaledTarget.x}
        y2={scaledTarget.y}
        stroke="#c4a57b"
        strokeWidth={2}
        strokeDasharray={isTargetLocked ? "none" : "8,4"}
        strokeLinecap="round"
      />
      
      {/* Origin marker */}
      <circle
        cx={scaledOrigin.x}
        cy={scaledOrigin.y}
        r={8}
        fill="rgba(196, 165, 123, 0.8)"
        stroke="#c4a57b"
        strokeWidth={2}
      />
      
      {/* Target marker - larger and more opaque when locked */}
      <circle
        cx={scaledTarget.x}
        cy={scaledTarget.y}
        r={isTargetLocked ? 6 : 5}
        fill={isTargetLocked ? "rgba(196, 165, 123, 0.9)" : "rgba(196, 165, 123, 0.6)"}
        stroke="#c4a57b"
        strokeWidth={isTargetLocked ? 2 : 1.5}
      />
      
      {/* Distance tooltip */}
      {formattedDistance && (
        <g transform={`translate(${tooltipX}, ${tooltipY})`}>
          <rect
            x={0}
            y={-14}
            width={textWidth}
            height={28}
            rx={4}
            fill="rgba(26, 26, 26, 0.95)"
            stroke="#c4a57b"
            strokeWidth={1}
          />
          <text
            ref={textRef}
            x={textWidth / 2}
            y={5}
            textAnchor="middle"
            fill="#ffffff"
            fontSize={13}
            fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
            fontWeight="500"
          >
            {formattedDistance}
          </text>
        </g>
      )}
    </svg>
  );
};

return { MeasurementOverlay };