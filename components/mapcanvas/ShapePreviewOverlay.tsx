/**
 * ShapePreviewOverlay.tsx
 *
 * Visual overlay for shape drawing tool previews.
 * Shows the outline of rectangle, circle, or edge line shapes
 * with dimensions displayed in the user's selected units.
 *
 * Used by DrawingLayer to show live preview while hovering (KBM)
 * or static preview for touch confirmation flow.
 */

import type { Point } from '#types/core/geometry.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { GridGeometry } = await requireModuleByName("GridGeometry.ts");

/** Shape type for preview */
type ShapeType = 'rectangle' | 'circle' | 'clearArea' | 'edgeLine';

/** Map data structure */
interface MapData {
  viewState: {
    zoom: number;
    center: Point;
  };
  northDirection?: number;
}

/** Geometry with optional methods */
interface GeometryWithMethods extends IGeometry {
  cellSize: number;
  getCellCenter?: (x: number, y: number) => { worldX: number; worldY: number };
}

/** Props for ShapePreviewOverlay component */
export interface ShapePreviewOverlayProps {
  /** Shape type to preview */
  shapeType: ShapeType | string | null;
  /** Starting point */
  startPoint: Point | null;
  /** End/hover point */
  endPoint: Point | null;
  /** Geometry instance */
  geometry: IGeometry | null;
  /** Map data */
  mapData: MapData | null;
  /** Reference to canvas element */
  canvasRef: { current: HTMLCanvasElement | null } | null;
  /** Reference to container element */
  containerRef: { current: HTMLElement | null } | null;
  /** Distance settings for formatting */
  distanceSettings?: EffectiveDistanceSettings | null;
  /** If true (touch mode), show as confirmable preview */
  isConfirmable?: boolean;
}

/**
 * Convert cell coordinates to screen coordinates
 */
function cellToScreen(
  cellX: number,
  cellY: number,
  geometry: GeometryWithMethods,
  mapData: MapData,
  canvasWidth: number,
  canvasHeight: number,
  useCenter = true
): Point {
  const { zoom, center } = mapData.viewState;
  const northDirection = mapData.northDirection || 0;

  let worldX: number, worldY: number;
  if (useCenter) {
    if (geometry.getCellCenter) {
      const cellCenter = geometry.getCellCenter(cellX, cellY);
      worldX = cellCenter.worldX;
      worldY = cellCenter.worldY;
    } else {
      worldX = (cellX + 0.5) * geometry.cellSize;
      worldY = (cellY + 0.5) * geometry.cellSize;
    }
  } else {
    worldX = cellX * geometry.cellSize;
    worldY = cellY * geometry.cellSize;
  }

  let offsetX: number, offsetY: number;
  if (geometry instanceof GridGeometry) {
    const scaledCellSize = geometry.getScaledCellSize(zoom);
    offsetX = canvasWidth / 2 - center.x * scaledCellSize;
    offsetY = canvasHeight / 2 - center.y * scaledCellSize;
  } else {
    offsetX = canvasWidth / 2 - center.x * zoom;
    offsetY = canvasHeight / 2 - center.y * zoom;
  }

  let screenX = offsetX + worldX * zoom;
  let screenY = offsetY + worldY * zoom;

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
 */
function formatRectDimensions(
  widthCells: number,
  heightCells: number,
  distanceSettings: EffectiveDistanceSettings
): string {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const widthUnits = widthCells * distancePerCell;
  const heightUnits = heightCells * distancePerCell;

  const roundedWidth = Number.isInteger(widthUnits) ? widthUnits : Math.round(widthUnits * 10) / 10;
  const roundedHeight = Number.isInteger(heightUnits) ? heightUnits : Math.round(heightUnits * 10) / 10;

  return `${roundedWidth}×${roundedHeight} ${distanceUnit}`;
}

/**
 * Format radius for circle display
 */
function formatCircleRadius(radiusCells: number, distanceSettings: EffectiveDistanceSettings): string {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const radiusUnits = radiusCells * distancePerCell;
  const rounded = Number.isInteger(radiusUnits) ? radiusUnits : Math.round(radiusUnits * 10) / 10;
  return `r: ${rounded} ${distanceUnit}`;
}

/**
 * Format edge line length
 */
function formatEdgeLength(lengthCells: number, distanceSettings: EffectiveDistanceSettings): string {
  const { distancePerCell, distanceUnit } = distanceSettings;
  const lengthUnits = lengthCells * distancePerCell;
  const rounded = Number.isInteger(lengthUnits) ? lengthUnits : Math.round(lengthUnits * 10) / 10;
  return `${rounded} ${distanceUnit}`;
}

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
}: ShapePreviewOverlayProps): React.ReactElement | null => {
  const textRef = dc.useRef<SVGTextElement | null>(null);
  const [textWidth, setTextWidth] = dc.useState(80);

  dc.useEffect(() => {
    if (textRef.current) {
      try {
        const bbox = textRef.current.getBBox();
        setTextWidth(Math.max(bbox.width + 20, 60));
      } catch {
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

  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;

  const { zoom } = mapData.viewState;
  const scaledCellSize = geometry.getScaledCellSize(zoom) * displayScale;

  const colors: Record<string, string> = {
    rectangle: '#00ff00',
    clearArea: '#ff0000',
    circle: '#00aaff',
    edgeLine: '#ff9500'
  };
  const strokeColor = colors[shapeType || ''] || '#00ff00';

  let overlayContent: React.ReactElement | null = null;
  let dimensionText = '';
  let tooltipPosition = { x: 0, y: 0 };

  const geo = geometry as GeometryWithMethods;

  if (shapeType === 'rectangle' || shapeType === 'clearArea') {
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    const widthCells = maxX - minX + 1;
    const heightCells = maxY - minY + 1;

    // Compute all four corners in grid space, rotate each through cellToScreen
    const halfCell = 0.5;
    const corners = [
      cellToScreen(minX - halfCell, minY - halfCell, geo, mapData, canvasWidth, canvasHeight, false), // TL
      cellToScreen(maxX + halfCell, minY - halfCell, geo, mapData, canvasWidth, canvasHeight, false), // TR
      cellToScreen(maxX + halfCell, maxY + halfCell, geo, mapData, canvasWidth, canvasHeight, false), // BR
      cellToScreen(minX - halfCell, maxY + halfCell, geo, mapData, canvasWidth, canvasHeight, false), // BL
    ].map(p => ({
      x: p.x * displayScale + canvasOffsetX,
      y: p.y * displayScale + canvasOffsetY
    }));

    const polygonPoints = corners.map(c => `${c.x},${c.y}`).join(' ');

    // Tooltip at midpoint of top edge
    tooltipPosition = {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2 - 10
    };

    dimensionText = distanceSettings
      ? formatRectDimensions(widthCells, heightCells, distanceSettings)
      : `${widthCells}×${heightCells}`;

    overlayContent = (
      <polygon
        points={polygonPoints}
        fill={isConfirmable ? `${strokeColor}22` : 'none'}
        stroke={strokeColor}
        strokeWidth={2}
        strokeDasharray={isConfirmable ? "none" : "8,4"}
        strokeLinejoin="round"
      />
    );

  } else if (shapeType === 'circle') {
    const centerScreen = cellToScreen(startPoint.x, startPoint.y, geo, mapData, canvasWidth, canvasHeight, true);

    const scaledCenter = {
      x: centerScreen.x * displayScale + canvasOffsetX,
      y: centerScreen.y * displayScale + canvasOffsetY
    };

    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const radiusCells = Math.max(Math.abs(dx), Math.abs(dy));
    const radiusScreen = radiusCells * scaledCellSize;

    dimensionText = distanceSettings
      ? formatCircleRadius(radiusCells, distanceSettings)
      : `r: ${Math.round(radiusCells * 10) / 10}`;
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
    const startScreen = cellToScreen(startPoint.x, startPoint.y, geo, mapData, canvasWidth, canvasHeight, false);
    const endScreen = cellToScreen(endPoint.x, endPoint.y, geo, mapData, canvasWidth, canvasHeight, false);

    const scaledStart = {
      x: startScreen.x * displayScale + canvasOffsetX,
      y: startScreen.y * displayScale + canvasOffsetY
    };
    const scaledEnd = {
      x: endScreen.x * displayScale + canvasOffsetX,
      y: endScreen.y * displayScale + canvasOffsetY
    };

    const dx = Math.abs(endPoint.x - startPoint.x);
    const dy = Math.abs(endPoint.y - startPoint.y);
    const lengthCells = dx + dy;

    dimensionText = distanceSettings ? formatEdgeLength(lengthCells, distanceSettings) : `${lengthCells}`;

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
        <circle cx={scaledStart.x} cy={scaledStart.y} r={6} fill={strokeColor} />
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
