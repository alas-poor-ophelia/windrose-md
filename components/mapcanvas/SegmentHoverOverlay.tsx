/**
 * SegmentHoverOverlay.tsx
 *
 * Visual overlay showing which segment will be painted on click.
 * Only shown on desktop (mouse/pointer) when segment paint tool is active.
 */

import type { HexColor } from '#types/core/common.types';
import type { Point } from '#types/core/geometry.types';
import type { IGeometry } from '#types/core/geometry.types';

const pathResolverPath = dc.resolvePath("pathResolver.ts");
const { requireModuleByName } = await dc.require(pathResolverPath);

const { cellToScreen } = await requireModuleByName("cellToScreenConverter.ts");
const { SEGMENT_VERTICES, SEGMENT_TRIANGLES } = await requireModuleByName("dmtConstants.ts");

/** Segment name type */
type SegmentName = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

/** Map data structure for segment overlay */
interface MapData {
  viewState: {
    zoom: number;
    center: Point;
  };
  northDirection?: number;
}

/** Hover info for segment */
interface SegmentHoverInfo {
  cellX: number;
  cellY: number;
  segment: SegmentName;
}

/** Props for SegmentHoverOverlay component */
export interface SegmentHoverOverlayProps {
  /** Hover information or null */
  hoverInfo: SegmentHoverInfo | null;
  /** Currently selected paint color */
  selectedColor: HexColor;
  /** Geometry instance */
  geometry: IGeometry | null;
  /** Map data */
  mapData: MapData | null;
  /** Reference to canvas element */
  canvasRef: { current: HTMLCanvasElement | null } | null;
  /** Reference to container element */
  containerRef: { current: HTMLElement | null } | null;
}

/**
 * Get SVG path for a segment triangle
 */
function getSegmentPath(segmentName: SegmentName, cellSize: number): string {
  const [v1Name, v2Name, v3Name] = SEGMENT_TRIANGLES[segmentName];

  const getPoint = (vertexName: string): Point => {
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

const SegmentHoverOverlay = ({
  hoverInfo,
  selectedColor,
  geometry,
  mapData,
  canvasRef,
  containerRef
}: SegmentHoverOverlayProps): React.ReactElement | null => {
  if (!hoverInfo || !geometry || !mapData || !(geometry instanceof GridGeometry)) {
    return null;
  }

  const { cellX, cellY, segment } = hoverInfo;

  const canvas = canvasRef?.current;
  const container = containerRef?.current;
  if (!canvas || !container) return null;

  const canvasWidth = canvas.width;
  const canvasHeight = canvas.height;

  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;

  const canvasOffsetX = canvasRect.left - containerRect.left;
  const canvasOffsetY = canvasRect.top - containerRect.top;

  const cellTopLeft = cellToScreen(
    cellX,
    cellY,
    geometry,
    mapData,
    canvasWidth,
    canvasHeight,
    false
  );

  const scaledTopLeft = {
    x: cellTopLeft.x * displayScale + canvasOffsetX,
    y: cellTopLeft.y * displayScale + canvasOffsetY
  };

  const scaledCellSize = geometry.getScaledCellSize(mapData.viewState.zoom) * displayScale;
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
