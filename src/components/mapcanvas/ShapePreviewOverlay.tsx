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
import type { VNode } from 'preact';
import type { MapData } from '#types/core/map.types';
import type { EffectiveDistanceSettings } from '#types/hooks/distanceMeasurement.types';

import { useEffect, useRef, useState } from 'preact/hooks';
import { cellToScreen } from '../../drawing/cellToScreenConverter';
import { createViewportTransform } from './viewportTransform';
import type { ExtendedGeometry } from '#types/contexts/context.types';
import { Z_INDEX } from '../../core/dmtConstants';







/** Shape type for preview */
type ShapeType = 'rectangle' | 'circle' | 'clearArea' | 'edgeLine';

/** Props for ShapePreviewOverlay component */
export interface ShapePreviewOverlayProps {
  /** Shape type to preview */
  // Callers pass values beyond ShapeType (e.g. 'areaSelect', 'shapeSquare', or a
  // raw string from DrawingLayer); `string & {}` keeps literal hints without
  // collapsing to bare string.
  shapeType: ShapeType | (string & {}) | null;
  /** Starting point */
  startPoint: Point | null;
  /** End/hover point */
  endPoint: Point | null;
  /** Geometry instance */
  geometry: ExtendedGeometry | null;
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
 * Convert world coordinates directly to buffer-space screen coordinates.
 * Used for hex bounding-box corners where we bypass cell-to-world conversion.
 */
function worldToScreen(
  worldX: number,
  worldY: number,
  geometry: ExtendedGeometry,
  mapData: MapData,
  canvasWidth: number,
  canvasHeight: number
): Point {
  if (!mapData.viewState) return { x: 0, y: 0 };
  const { zoom, center } = mapData.viewState;

  const { worldToBuffer } = createViewportTransform({
    geometry,
    width: canvasWidth,
    height: canvasHeight,
    zoom,
    center,
    northDirection: mapData.northDirection
  });

  return worldToBuffer(worldX, worldY);
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
}: ShapePreviewOverlayProps): VNode | null => {
  const textRef = useRef<SVGTextElement | null>(null);
  const [textWidth, setTextWidth] = useState(80);

  useEffect(() => {
    if (textRef.current) {
      try {
        const bbox = textRef.current.getBBox();
        setTextWidth(Math.max(bbox.width + 20, 60));
      } catch {
        // getBBox can fail if element not rendered yet
      }
    }
  }, [startPoint, endPoint, shapeType]);

  if (!startPoint || !endPoint || !geometry || !mapData || !mapData.viewState || !canvasRef?.current || !containerRef?.current) {
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
    edgeLine: '#ff9500',
    areaSelect: '#4a9eff'
  };
  const strokeColor = colors[shapeType ?? ''] ?? '#00ff00';

  let overlayContent: VNode | null = null;
  let dimensionText = '';
  let tooltipPosition = { x: 0, y: 0 };

  const geo = geometry;
  const md = mapData as MapData & { viewState: NonNullable<MapData['viewState']> };

  if (shapeType === 'rectangle' || shapeType === 'clearArea' || shapeType === 'areaSelect') {
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    const widthCells = maxX - minX + 1;
    const heightCells = maxY - minY + 1;

    let corners: { x: number; y: number }[];

    const isHex = geo.type === 'hex';
    if (isHex && geo.getCellCenter != null) {
      // Hex: compute axis-aligned bounding box from corner cell world centers,
      // then draw a clean rectangle (hex cells don't have rectangular corners)
      const cellCenters = [
        geo.getCellCenter(minX, minY),
        geo.getCellCenter(maxX, minY),
        geo.getCellCenter(minX, maxY),
        geo.getCellCenter(maxX, maxY),
      ];
      const hexSize = geo.getScaledCellSize(1);
      const wMinX = Math.min(...cellCenters.map(c => c.worldX)) - hexSize;
      const wMaxX = Math.max(...cellCenters.map(c => c.worldX)) + hexSize;
      const wMinY = Math.min(...cellCenters.map(c => c.worldY)) - hexSize;
      const wMaxY = Math.max(...cellCenters.map(c => c.worldY)) + hexSize;

      corners = [
        worldToScreen(wMinX, wMinY, geo, mapData, canvasWidth, canvasHeight),
        worldToScreen(wMaxX, wMinY, geo, mapData, canvasWidth, canvasHeight),
        worldToScreen(wMaxX, wMaxY, geo, mapData, canvasWidth, canvasHeight),
        worldToScreen(wMinX, wMaxY, geo, mapData, canvasWidth, canvasHeight),
      ].map(p => ({
        x: p.x * displayScale + canvasOffsetX,
        y: p.y * displayScale + canvasOffsetY
      }));
    } else {
      // Grid: compute corners directly from grid-edge world coordinates.
      // minX gives the left edge, maxX+1 gives the right edge of the region.
      if (!geo.cellSize) return null;
      const gridCornerWorlds = [
        { wx: minX * geo.cellSize, wy: minY * geo.cellSize },             // TL
        { wx: (maxX + 1) * geo.cellSize, wy: minY * geo.cellSize },       // TR
        { wx: (maxX + 1) * geo.cellSize, wy: (maxY + 1) * geo.cellSize }, // BR
        { wx: minX * geo.cellSize, wy: (maxY + 1) * geo.cellSize },       // BL
      ];
      corners = gridCornerWorlds.map(({ wx, wy }) => {
        const p = worldToScreen(wx, wy, geo, mapData, canvasWidth, canvasHeight);
        return {
          x: p.x * displayScale + canvasOffsetX,
          y: p.y * displayScale + canvasOffsetY
        };
      });
    }

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
    const centerScreen = cellToScreen(startPoint.x, startPoint.y, geo, md, canvasWidth, canvasHeight, true);

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

  } else if (shapeType === 'shapeSquare') {
    const minX = Math.min(startPoint.x, endPoint.x);
    const maxX = Math.max(startPoint.x, endPoint.x);
    const minY = Math.min(startPoint.y, endPoint.y);
    const maxY = Math.max(startPoint.y, endPoint.y);

    const corners = [
      worldToScreen(minX, minY, geo, mapData, canvasWidth, canvasHeight),
      worldToScreen(maxX, minY, geo, mapData, canvasWidth, canvasHeight),
      worldToScreen(maxX, maxY, geo, mapData, canvasWidth, canvasHeight),
      worldToScreen(minX, maxY, geo, mapData, canvasWidth, canvasHeight),
    ].map(p => ({
      x: p.x * displayScale + canvasOffsetX,
      y: p.y * displayScale + canvasOffsetY
    }));

    const polygonPoints = corners.map(c => `${c.x},${c.y}`).join(' ');
    tooltipPosition = {
      x: (corners[0].x + corners[1].x) / 2,
      y: (corners[0].y + corners[1].y) / 2 - 10
    };

    const cellSize = geo.cellSize;
    const widthCells = Math.abs(maxX - minX) / cellSize;
    const heightCells = Math.abs(maxY - minY) / cellSize;
    dimensionText = distanceSettings
      ? formatRectDimensions(widthCells, heightCells, distanceSettings)
      : `${Math.round(widthCells * 10) / 10}×${Math.round(heightCells * 10) / 10}`;

    overlayContent = (
      <polygon
        points={polygonPoints}
        fill="#c4a57b22"
        stroke="#c4a57b"
        strokeWidth={2}
        strokeDasharray="8,4"
        strokeLinejoin="round"
      />
    );

  } else if (shapeType === 'shapeCircle') {
    const centerScreen = worldToScreen(endPoint.x, endPoint.y, geo, mapData, canvasWidth, canvasHeight);
    const edgeScreen = worldToScreen(startPoint.x, startPoint.y, geo, mapData, canvasWidth, canvasHeight);

    const scaledCenter = {
      x: centerScreen.x * displayScale + canvasOffsetX,
      y: centerScreen.y * displayScale + canvasOffsetY
    };
    const scaledEdge = {
      x: edgeScreen.x * displayScale + canvasOffsetX,
      y: edgeScreen.y * displayScale + canvasOffsetY
    };

    const dx = scaledEdge.x - scaledCenter.x;
    const dy = scaledEdge.y - scaledCenter.y;
    const radiusScreen = Math.sqrt(dx * dx + dy * dy);

    const cellSize = geo.cellSize;
    const worldDx = startPoint.x - endPoint.x;
    const worldDy = startPoint.y - endPoint.y;
    const radiusCells = Math.sqrt(worldDx * worldDx + worldDy * worldDy) / cellSize;
    dimensionText = distanceSettings
      ? formatCircleRadius(radiusCells, distanceSettings)
      : `r: ${Math.round(radiusCells * 10) / 10}`;
    tooltipPosition = { x: scaledCenter.x, y: scaledCenter.y - radiusScreen - 15 };

    overlayContent = (
      <circle
        cx={scaledCenter.x}
        cy={scaledCenter.y}
        r={radiusScreen}
        fill="#c4a57b22"
        stroke="#c4a57b"
        strokeWidth={2}
        strokeDasharray="8,4"
      />
    );

  } else if (shapeType === 'edgeLine') {
    const startScreen = cellToScreen(startPoint.x, startPoint.y, geo, md, canvasWidth, canvasHeight, false);
    const endScreen = cellToScreen(endPoint.x, endPoint.y, geo, md, canvasWidth, canvasHeight, false);

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
      className="windrose-shape-preview-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: Z_INDEX.DRAWING_LAYER,
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

export { ShapePreviewOverlay };