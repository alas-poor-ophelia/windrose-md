/**
 * MeasurementOverlay.tsx
 *
 * Visual overlay for the multi-waypoint distance measurement tool.
 * Draws the committed route as a solid polyline, a dashed preview segment
 * from the last waypoint to the cursor, per-segment distance labels at
 * segment midpoints, and the running total in an auto-sized tooltip
 * anchored near the live end of the route.
 *
 * Shapes are drawn in WORLD coordinates inside a group whose transform
 * tracks the live pan/zoom controller (same pattern as RouteLayer) — the
 * in-progress ruler moves with the map mid-gesture instead of freezing at
 * the last committed viewState. Constant-screen-size nodes (markers,
 * labels, tooltip) ride counter-scaled sub-groups.
 */


import { useEffect, useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { MeasurementPoint } from '#types/hooks/distanceMeasurement.types';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import {
	computeCounterScale,
	computeOverlayMetrics,
	computeWorldTransform,
	counterScaleTransform,
	findCanvasContainer,
	useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { useMapState } from '../../context/MapContext';
import { Z_INDEX } from '../../core/dmtConstants';

interface MeasurementOverlayProps {
  waypoints: MeasurementPoint[];
  previewTarget: MeasurementPoint | null;
  formattedTotal: string | null;
  /** True Euclidean ("as the crow flies") running total; null hides the suffix */
  formattedEuclideanTotal?: string | null;
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

interface WorldPoint {
  x: number;
  y: number;
}

const MeasurementOverlay = ({
  waypoints,
  previewTarget,
  formattedTotal,
  formattedEuclideanTotal,
  formattedSegments,
  segmentColors,
  onSegmentClick,
  geometry,
  mapData,
  canvasRef
}: MeasurementOverlayProps): VNode | null => {
  const { viewController } = useMapState();
  const textRef = useRef<SVGTextElement | null>(null);
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const [textWidth, setTextWidth] = useState(80);

  const northDirection = mapData?.northDirection ?? 0;

  // Mid-gesture pan/zoom ticks rewrite the group transform imperatively
  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry, northDirection, viewController });

  // The hex/cell-count total, with the true "as the crow flies" total
  // appended when available — a straight route makes the two agree; a
  // bent one reads visibly longer.
  const totalDisplay = formattedTotal != null && formattedEuclideanTotal != null && formattedEuclideanTotal !== ''
    ? `${formattedTotal} · ${formattedEuclideanTotal} direct`
    : formattedTotal;

  // Measure text width for auto-sizing tooltip
  useEffect(() => {
    if (textRef.current && totalDisplay != null && totalDisplay !== '') {
      const bbox = textRef.current.getBBox();
      setTextWidth(Math.max(bbox.width + 20, 60));
    }
  }, [totalDisplay]);

  if (waypoints.length === 0 || !geometry || !mapData?.viewState || !canvasRef?.current) {
    return null;
  }

  const canvas = canvasRef.current;
  const metrics = computeOverlayMetrics(canvas);
  if (!metrics) return null;

  // Render from the LIVE viewState (matches the canvas mid-gesture; equals
  // the committed mapData.viewState otherwise)
  const viewState = viewController?.getLive() ?? mapData.viewState;
  const worldTransform = computeWorldTransform(viewState, geometry, northDirection, metrics);
  const counterScale = computeCounterScale(viewState.zoom, metrics.displayScale);

  const toWorld = (point: MeasurementPoint): WorldPoint => {
    const c = geometry.getCellCenter(point.x, point.y);
    return { x: c.worldX, y: c.worldY };
  };

  const worldPoints = waypoints.map(toWorld);
  const lastWorld = worldPoints[worldPoints.length - 1];

  // Preview segment ends at the cursor cell when it differs from the last waypoint
  const lastWaypoint = waypoints[waypoints.length - 1];
  const hasPreview = previewTarget != null
    && (previewTarget.x !== lastWaypoint.x || previewTarget.y !== lastWaypoint.y);
  const previewWorld = hasPreview && previewTarget != null ? toWorld(previewTarget) : null;

  // Tooltip anchors to the live end of the route (offset applied in CSS px
  // inside the counter-scaled group)
  const anchor = previewWorld ?? lastWorld;

  // Inline per-segment labels earn their space once the route has more than
  // one distance in play (2+ segments, or 1 segment plus a live preview)
  const showSegmentLabels = formattedSegments.length >= 2
    || (formattedSegments.length >= 1 && previewWorld != null);

  // Popup anchor for terrain assignment: container-relative click position
  const containerPoint = (e: MouseEvent): { x: number; y: number } => {
    const container = findCanvasContainer(canvas);
    const rect = container?.getBoundingClientRect();
    return rect != null
      ? { x: e.clientX - rect.left, y: e.clientY - rect.top }
      : { x: e.clientX, y: e.clientY };
  };

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
      <g ref={worldGroupRef} transform={worldTransform}>
        {/* Committed route - one line per segment so terrains can color them.
            A polyline would be simpler but cannot vary stroke per segment. */}
        {worldPoints.slice(0, -1).map((a, i) => {
          const b = worldPoints[i + 1];
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
              vector-effect="non-scaling-stroke"
            />
          );
        })}

        {/* Wide transparent hit targets for terrain assignment (touch-friendly).
            Sitting above the canvas, a click here never reaches the waypoint
            handler — assigning terrain does not extend the route. */}
        {onSegmentClick != null && worldPoints.slice(0, -1).map((a, i) => {
          const b = worldPoints[i + 1];
          return (
            <line
              key={`hit-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke="transparent"
              strokeWidth={14}
              vector-effect="non-scaling-stroke"
              style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                const p = containerPoint(e);
                onSegmentClick(i, p.x, p.y);
              }}
            />
          );
        })}

        {/* Preview segment - dashed from last waypoint to cursor */}
        {previewWorld && (
          <line
            x1={lastWorld.x}
            y1={lastWorld.y}
            x2={previewWorld.x}
            y2={previewWorld.y}
            stroke="#c4a57b"
            strokeWidth={2}
            strokeDasharray="8,4"
            strokeLinecap="round"
            vector-effect="non-scaling-stroke"
          />
        )}

        {/* Waypoint markers - origin slightly larger; constant screen size */}
        {worldPoints.map((p, i) => (
          <g
            key={i}
            data-counter-scale-x={p.x}
            data-counter-scale-y={p.y}
            transform={counterScaleTransform(p.x, p.y, counterScale)}
          >
            <circle
              cx={0}
              cy={0}
              r={i === 0 ? 8 : 5}
              fill={i === 0 ? 'rgba(196, 165, 123, 0.8)' : 'rgba(196, 165, 123, 0.9)'}
              stroke="#c4a57b"
              strokeWidth={i === 0 ? 2 : 1.5}
            />
          </g>
        ))}

        {/* Preview cursor marker */}
        {previewWorld && (
          <g
            data-counter-scale-x={previewWorld.x}
            data-counter-scale-y={previewWorld.y}
            transform={counterScaleTransform(previewWorld.x, previewWorld.y, counterScale)}
          >
            <circle
              cx={0}
              cy={0}
              r={5}
              fill="rgba(196, 165, 123, 0.6)"
              stroke="#c4a57b"
              strokeWidth={1.5}
            />
          </g>
        )}

        {/* Per-segment distance labels at segment midpoints */}
        {showSegmentLabels && formattedSegments.map((label, i) => {
          const a = worldPoints[i];
          const b = worldPoints[i + 1];
          if (a == null || b == null) return null;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g
              key={`seg-${i}`}
              data-counter-scale-x={mx}
              data-counter-scale-y={my}
              transform={counterScaleTransform(mx, my, counterScale)}
            >
              <text
                x={0}
                y={-8}
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
            </g>
          );
        })}

        {/* Running total tooltip - constant screen size near the route end */}
        {totalDisplay != null && totalDisplay !== '' && (
          <g
            data-counter-scale-x={anchor.x}
            data-counter-scale-y={anchor.y}
            transform={counterScaleTransform(anchor.x, anchor.y, counterScale)}
          >
            <g transform="translate(15, -30)">
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
                {totalDisplay}
              </text>
            </g>
          </g>
        )}
      </g>
    </svg>
  );
};

export { MeasurementOverlay };
