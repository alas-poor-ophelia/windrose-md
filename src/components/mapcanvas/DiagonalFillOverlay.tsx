/**
 * DiagonalFillOverlay.tsx
 *
 * Overlay component for diagonal fill tool.
 * Manages tool state via useDiagonalFill hook, registers event handlers,
 * and renders SVG preview showing where the diagonal fill will be applied.
 *
 * The diagonal fill tool fills "concave corners" along staircase diagonals
 * by painting 4 segments (half-cell) in each gap, creating smooth diagonal edges.
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';
import type { Point } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';

import type { ExtendedGridGeometry } from '#types/contexts/context.types';
import { useDiagonalFill } from '../../hooks/drawing/useDiagonalFill';
import { useMapState } from '../../context/MapContext';
import { useLayerHandlers } from '../../hooks/canvas/useLayerHandlers';
import { createViewportTransform, getCanvasDisplayMetrics } from './viewportTransform';
import { Z_INDEX } from '../../core/dmtConstants';









/** Corner names for cell corners */
type CornerName = 'TL' | 'TR' | 'BR' | 'BL';

/** Fill start point with corner info */

/** Fill end point */
interface FillEndPoint {
  x: number;
  y: number;
}

/** Props for DiagonalFillOverlay component */
export interface DiagonalFillOverlayProps {
  /** Current active tool */
  currentTool: ToolId;
}

/** Props for CornerIndicator component */
interface CornerIndicatorProps {
  x: number;
  y: number;
  corner: CornerName;
  size?: number;
}

/**
 * Convert cell corner to screen coordinates
 */
function cornerToScreen(
  cellX: number,
  cellY: number,
  corner: CornerName,
  geometry: ExtendedGridGeometry,
  mapData: MapData,
  canvasWidth: number,
  canvasHeight: number
): Point {
  if (!mapData.viewState) return { x: 0, y: 0 };
  const { zoom, center } = mapData.viewState;
  const cellSize = geometry.cellSize;

  const cornerWorldOffsets: Record<CornerName, Point> = {
    'TL': { x: 0, y: 0 },
    'TR': { x: 1, y: 0 },
    'BR': { x: 1, y: 1 },
    'BL': { x: 0, y: 1 }
  };

  const cornerOffset = cornerWorldOffsets[corner];
  const { worldToBuffer } = createViewportTransform({
    geometry,
    width: canvasWidth,
    height: canvasHeight,
    zoom,
    center,
    northDirection: mapData.northDirection
  });

  return worldToBuffer(
    (cellX + cornerOffset.x) * cellSize,
    (cellY + cornerOffset.y) * cellSize
  );
}

/**
 * Small triangle indicator showing which corner was clicked
 */
const CornerIndicator = ({ x, y, corner, size = 12 }: CornerIndicatorProps): VNode | null => {
  const halfSize = size / 2;

  const trianglePoints: Record<CornerName, string> = {
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

const DiagonalFillOverlay = ({ currentTool }: DiagonalFillOverlayProps): VNode | null => {
  const {
    mapData,
    geometry,
    canvasRef
  } = useMapState();

  const {
    fillStart,
    fillEnd,
    isEndLocked,
    previewEnd,
    handleDiagonalFillClick,
    handleDiagonalFillMove,
    cancelFill
  } = useDiagonalFill(currentTool);

  useLayerHandlers('diagonalFill', { handleDiagonalFillClick, handleDiagonalFillMove, cancelFill, fillStart });

  if (currentTool !== 'diagonalFill' || !fillStart || !geometry || !mapData || !mapData.viewState || !canvasRef?.current) {
    return null;
  }

  if (geometry.type !== 'grid') {
    return null;
  }

  const displayEnd: FillEndPoint | null = fillEnd ?? previewEnd;

  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;

  let flexContainer: HTMLElement | null = canvas.parentElement;
  while (flexContainer && !flexContainer.classList.contains('windrose-canvas-container')) {
    flexContainer = flexContainer.parentElement;
  }
  const { canvasOffsetX, canvasOffsetY, scaleX: displayScale } = getCanvasDisplayMetrics(canvas, flexContainer);

  const startScreen = cornerToScreen(
    fillStart.x,
    fillStart.y,
    fillStart.corner,
    geometry,
    mapData,
    canvasWidth,
    canvasHeight
  );

  const scaledStart = {
    x: startScreen.x * displayScale + canvasOffsetX,
    y: startScreen.y * displayScale + canvasOffsetY
  };

  let scaledEnd: Point | null = null;
  if (displayEnd) {
    const endScreen = cornerToScreen(
      displayEnd.x,
      displayEnd.y,
      fillStart.corner,
      geometry,
      mapData,
      canvasWidth,
      canvasHeight
    );

    scaledEnd = {
      x: endScreen.x * displayScale + canvasOffsetX,
      y: endScreen.y * displayScale + canvasOffsetY
    };
  }

  return (
    <svg
      className="windrose-diagonal-fill-overlay"
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

      <circle
        cx={scaledStart.x}
        cy={scaledStart.y}
        r={8}
        fill="rgba(0, 212, 255, 0.8)"
        stroke="#00d4ff"
        strokeWidth={2}
      />

      <CornerIndicator
        x={scaledStart.x}
        y={scaledStart.y}
        corner={fillStart.corner}
        size={12}
      />

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

export { DiagonalFillOverlay };