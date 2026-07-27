/**
 * MeasurementOverlay.tsx
 *
 * Visual overlay for the multi-waypoint distance measurement tool.
 * Draws the committed route as a solid polyline, a dashed preview segment
 * from the last waypoint to the cursor, per-segment distance labels at
 * segment midpoints, and the running total in an auto-sized tooltip
 * anchored near the live end of the route.
 */


import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { MeasurementPoint } from '#types/hooks/distanceMeasurement.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import { cellToScreen } from '../../drawing/cellToScreenConverter';
import { Z_INDEX } from '../../core/dmtConstants';

interface MeasurementOverlayProps {
  waypoints: MeasurementPoint[];
  previewTarget: MeasurementPoint | null;
  formattedTotal: string | null;
  formattedSegments: string[];
  /** Resolved terrain color per segment (null = default measure color) */
  segmentColors?: (string | null)[];
  /** When set, segments are clickable (terrain assignment); coords are container-relative */
  onSegmentClick?: (segmentIndex: number, x: number, y: number) => void;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
}

const MEASURE_COLOR = '#c4a57b';

interface ScreenPoint {
  x: number;
  y: number;
}

const MeasurementOverlay = ({
  waypoints,
  previewTarget,
  formattedTotal,
  formattedSegments,
  segmentColors,
  onSegmentClick,
  geometry,
  mapData,
  canvasRef
}: MeasurementOverlayProps): VNode | null => {
  const textRef = useRef<SVGTextElement | null>(null);
  const [textWidth, setTextWidth] = useState(80);

  // Measure text width for auto-sizing tooltip
  useEffect(() => {
    if (textRef.current && formattedTotal != null && formattedTotal !== '') {
      const bbox = textRef.current.getBBox();
      setTextWidth(Math.max(bbox.width + 20, 60));
    }
  }, [formattedTotal]);

  if (waypoints.length === 0 || !geometry || !mapData || !canvasRef?.current) {
    return null;
  }

  // Get canvas dimensions (same approach as DrawingLayer)
  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;

  // Find the flex container (windrose-canvas-container) that the SVG is positioned relative to
  // Canvas may be nested inside wrapper divs, so traverse up to find the actual container
  let flexContainer = canvas.parentElement;
  let traversalCount = 0;
  while (flexContainer?.classList && !flexContainer.classList.contains('windrose-canvas-container')) {
    flexContainer = flexContainer.parentElement;
    traversalCount++;
    if (traversalCount > 10) {
      console.warn('[MeasurementOverlay] Could not find windrose-canvas-container after 10 levels');
      break;
    }
  }
  const containerRect = flexContainer?.getBoundingClientRect();
  const canvasOffsetX = containerRect ? canvasRect.left - containerRect.left : 0;
  const canvasOffsetY = containerRect ? canvasRect.top - containerRect.top : 0;

  const toScreen = (point: MeasurementPoint): ScreenPoint => {
    const screen = cellToScreen(
      point.x, point.y,
      geometry as Parameters<typeof cellToScreen>[2],
      mapData as Parameters<typeof cellToScreen>[3],
      canvasWidth, canvasHeight
    );
    return {
      x: screen.x * displayScale + canvasOffsetX,
      y: screen.y * displayScale + canvasOffsetY
    };
  };

  const screenPoints = waypoints.map(toScreen);
  const lastScreen = screenPoints[screenPoints.length - 1];

  // Preview segment ends at the cursor cell when it differs from the last waypoint
  const lastWaypoint = waypoints[waypoints.length - 1];
  const hasPreview = previewTarget != null
    && (previewTarget.x !== lastWaypoint.x || previewTarget.y !== lastWaypoint.y);
  const previewScreen = hasPreview && previewTarget != null ? toScreen(previewTarget) : null;

  // Tooltip anchors to the live end of the route
  const anchor = previewScreen ?? lastScreen;
  const tooltipX = anchor.x + 15;
  const tooltipY = anchor.y - 30;

  // Inline per-segment labels earn their space once the route has more than
  // one distance in play (2+ segments, or 1 segment plus a live preview)
  const showSegmentLabels = formattedSegments.length >= 2
    || (formattedSegments.length >= 1 && previewScreen != null);

  return (
    <svg
      className="windrose-measurement-overlay"
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
      {/* Committed route - one line per segment so terrains can color them.
          A polyline would be simpler but cannot vary stroke per segment. */}
      {screenPoints.slice(0, -1).map((a, i) => {
        const b = screenPoints[i + 1];
        return (
          <line
            key={`route-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={segmentColors?.[i] ?? MEASURE_COLOR}
            strokeWidth={2}
            strokeLinecap="round"
          />
        );
      })}

      {/* Wide transparent hit targets for terrain assignment (touch-friendly).
          Sitting above the canvas, a click here never reaches the waypoint
          handler — assigning terrain does not extend the route. */}
      {onSegmentClick != null && screenPoints.slice(0, -1).map((a, i) => {
        const b = screenPoints[i + 1];
        return (
          <line
            key={`hit-${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="transparent"
            strokeWidth={14}
            style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation();
              onSegmentClick(i, (a.x + b.x) / 2, (a.y + b.y) / 2);
            }}
          />
        );
      })}

      {/* Preview segment - dashed from last waypoint to cursor */}
      {previewScreen && (
        <line
          x1={lastScreen.x}
          y1={lastScreen.y}
          x2={previewScreen.x}
          y2={previewScreen.y}
          stroke="#c4a57b"
          strokeWidth={2}
          strokeDasharray="8,4"
          strokeLinecap="round"
        />
      )}

      {/* Waypoint markers - origin slightly larger */}
      {screenPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={i === 0 ? 8 : 5}
          fill={i === 0 ? 'rgba(196, 165, 123, 0.8)' : 'rgba(196, 165, 123, 0.9)'}
          stroke="#c4a57b"
          strokeWidth={i === 0 ? 2 : 1.5}
        />
      ))}

      {/* Preview cursor marker */}
      {previewScreen && (
        <circle
          cx={previewScreen.x}
          cy={previewScreen.y}
          r={5}
          fill="rgba(196, 165, 123, 0.6)"
          stroke="#c4a57b"
          strokeWidth={1.5}
        />
      )}

      {/* Per-segment distance labels at segment midpoints */}
      {showSegmentLabels && formattedSegments.map((label, i) => {
        const a = screenPoints[i];
        const b = screenPoints[i + 1];
        if (a == null || b == null) return null;
        return (
          <text
            key={`seg-${i}`}
            x={(a.x + b.x) / 2}
            y={(a.y + b.y) / 2 - 8}
            textAnchor="middle"
            fill="#ffffff"
            stroke="rgba(26, 26, 26, 0.9)"
            strokeWidth={3}
            paintOrder="stroke"
            fontSize={11}
            fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
            fontWeight="500"
          >
            {label}
          </text>
        );
      })}

      {/* Running total tooltip */}
      {formattedTotal != null && formattedTotal !== '' && (
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
            {formattedTotal}
          </text>
        </g>
      )}
    </svg>
  );
};

export { MeasurementOverlay };
