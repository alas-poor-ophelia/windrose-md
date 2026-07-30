/**
 * PartyPinOverlay.tsx
 *
 * SVG overlay rendering the party pin and its range ring. The ring renders
 * whenever a pin exists, in one of two styles:
 * - 'circle': geometric ring at the range radius in world space
 * - 'cells': highlight of the cells actually within range under the map's
 *   distance rules (diagonal rule on grids, hex distance on hex maps)
 *
 * All shapes are drawn in world coordinates inside a single group whose
 * transform reproduces the cellToScreen pipeline (pan/zoom, rotation,
 * canvas display scale), so per-vertex conversion is unnecessary.
 */

import { useMemo, useRef } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry, Point, WorldCoords } from '#types/core/geometry.types';
import type { MapData, PartyPin } from '#types/core/map.types';
import type { DiagonalRule } from '#types/settings/settings.types';
import type { ViewController } from '#types/hooks/viewController.types';
import { getCellsWithinRange } from '../../drawing/rangeOperations';
import { resolvePinIconGlyph } from '../../objects/partyPinOperations';
import {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { Z_INDEX } from '../../core/dmtConstants';

/** Concrete geometry surface used for world-space rendering */
interface PartyPinGeometry extends IGeometry {
  cellSize: number;
  getHexVertices?: (q: number, r: number) => WorldCoords[];
}

interface PartyPinOverlayProps {
  pin: PartyPin;
  /** Pin range converted to cells via the map's distance-per-cell */
  rangeInCells: number;
  diagonalRule: DiagonalRule;
  /** Cell positions of markers currently within range (rendered with a glow) */
  inRangeMarkers?: Point[];
  /** Cell to pulse-highlight (transient, from "show on map") */
  flashMarker?: Point | null;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  /** Live pan/zoom controller — the ring tracks gestures via imperative transform updates */
  viewController?: ViewController;
}

/** Classic map-pin silhouette: tip at the origin, head circle above */
const PIN_PATH = 'M0 0C-5-7-11-11.5-11-19a11 11 0 1 1 22 0C11-11.5 5-7 0 0Z';
const PIN_NATIVE_HEIGHT = 30;

/**
 * World-space distance between adjacent cell centers — converts a radius in
 * cells to world pixels for the circle ring style.
 */
function getCellSpacing(geometry: PartyPinGeometry, position: Point): number {
  const neighbors = geometry.getNeighbors(position.x, position.y);
  if (neighbors.length === 0) return geometry.cellSize;
  const own = geometry.getCellCenter(position.x, position.y);
  const other = geometry.getCellCenter(neighbors[0].x, neighbors[0].y);
  return Math.hypot(other.worldX - own.worldX, other.worldY - own.worldY);
}

const PartyPinOverlay = ({
  pin,
  rangeInCells,
  diagonalRule,
  inRangeMarkers = [],
  flashMarker = null,
  geometry,
  mapData,
  canvasRef,
  viewController
}: PartyPinOverlayProps): VNode | null => {
  const geo = geometry as PartyPinGeometry | null;
  const { x: pinX, y: pinY } = pin.position;
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const northDirection = mapData?.northDirection ?? 0;

  const rangeCells = useMemo(() => {
    if (!geo || pin.rangeStyle !== 'cells' || rangeInCells <= 0) return [];
    return getCellsWithinRange(geo, { x: pinX, y: pinY }, rangeInCells, { diagonalRule });
  }, [geo, pin.rangeStyle, pinX, pinY, rangeInCells, diagonalRule]);

  // Mid-gesture pan/zoom ticks rewrite the group transform imperatively
  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry: geo, northDirection, viewController });

  if (!geo || !mapData?.viewState || !canvasRef?.current) {
    return null;
  }

  const metrics = computeOverlayMetrics(canvasRef.current);
  if (!metrics) return null;

  // Render from the LIVE viewState (matches the canvas mid-gesture; equals the
  // committed mapData.viewState otherwise)
  const viewState = viewController?.getLive() ?? mapData.viewState;
  const { zoom } = viewState;
  const worldTransform = computeWorldTransform(viewState, geo, northDirection, metrics);
  const counterScale = computeCounterScale(zoom, metrics.displayScale);

  const pinCenter = geo.getCellCenter(pin.position.x, pin.position.y);
  const cellSpacing = getCellSpacing(geo, pin.position);
  const circleRadius = rangeInCells * cellSpacing;
  const pinScale = (geo.cellSize * 0.9) / PIN_NATIVE_HEIGHT;

  return (
    <svg
      className="windrose-party-pin-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: Z_INDEX.CANVAS_OVERLAY
      }}
    >
      <g ref={worldGroupRef} transform={worldTransform}>
        {/* Range ring */}
        {pin.rangeStyle === 'circle' && circleRadius > 0 && (
          <circle
            className="windrose-party-pin-ring"
            cx={pinCenter.worldX}
            cy={pinCenter.worldY}
            r={circleRadius}
            fill={pin.color}
            fillOpacity={0.07}
            stroke={pin.color}
            strokeOpacity={0.85}
            strokeWidth={2}
            vector-effect="non-scaling-stroke"
          />
        )}
        {pin.rangeStyle === 'cells' && rangeCells.map(cell => (
          geo.type === 'hex' && geo.getHexVertices ? (
            <polygon
              key={`${cell.x},${cell.y}`}
              className="windrose-party-pin-range-cell"
              points={geo.getHexVertices(cell.x, cell.y).map(v => `${v.worldX},${v.worldY}`).join(' ')}
              fill={pin.color}
              fillOpacity={0.16}
              stroke={pin.color}
              strokeOpacity={0.3}
              strokeWidth={1}
              vector-effect="non-scaling-stroke"
            />
          ) : (
            <rect
              key={`${cell.x},${cell.y}`}
              className="windrose-party-pin-range-cell"
              x={cell.x * geo.cellSize}
              y={cell.y * geo.cellSize}
              width={geo.cellSize}
              height={geo.cellSize}
              fill={pin.color}
              fillOpacity={0.16}
              stroke={pin.color}
              strokeOpacity={0.3}
              strokeWidth={1}
              vector-effect="non-scaling-stroke"
            />
          )
        ))}

        {/* In-range marker glow ticks */}
        {inRangeMarkers.map((marker, index) => {
          const center = geo.getCellCenter(marker.x, marker.y);
          return (
            <g key={`${marker.x},${marker.y},${index}`} className="windrose-party-pin-marker-glow">
              <circle
                cx={center.worldX}
                cy={center.worldY}
                r={geo.cellSize * 0.45}
                fill={pin.color}
                fillOpacity={0.18}
              />
              <circle
                cx={center.worldX}
                cy={center.worldY}
                r={geo.cellSize * 0.45}
                fill="none"
                stroke={pin.color}
                strokeOpacity={0.6}
                strokeWidth={1.5}
                vector-effect="non-scaling-stroke"
              />
            </g>
          );
        })}

        {/* Show-on-map flash pulse */}
        {flashMarker && (() => {
          const center = geo.getCellCenter(flashMarker.x, flashMarker.y);
          return (
            <circle
              key={`flash-${flashMarker.x},${flashMarker.y}`}
              className="windrose-party-pin-flash"
              cx={center.worldX}
              cy={center.worldY}
              r={geo.cellSize * 0.6}
              fill="none"
              stroke={pin.color}
              strokeWidth={3}
              vector-effect="non-scaling-stroke"
            />
          );
        })()}

        {/* Pin marker; an icon glyph replaces the head dot when set (PP-2) */}
        <g transform={`translate(${pinCenter.worldX} ${pinCenter.worldY}) scale(${pinScale})`}>
          <path
            d={PIN_PATH}
            fill={pin.color}
            stroke="rgba(26, 26, 26, 0.85)"
            strokeWidth={2}
          />
          {(() => {
            const iconGlyph = resolvePinIconGlyph(pin.icon);
            if (iconGlyph == null) {
              return <circle cx={0} cy={-19} r={4.5} fill="rgba(26, 26, 26, 0.85)" />;
            }
            return (
              <text
                x={0}
                y={-19}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={13}
                fontFamily={iconGlyph.isRaIcon
                  ? 'rpgawesome'
                  : 'var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)'}
                fill="#ffffff"
                stroke="rgba(26, 26, 26, 0.85)"
                strokeWidth={0.75}
                paintOrder="stroke"
              >
                {iconGlyph.glyph}
              </text>
            );
          })()}
        </g>

        {/* Label — counter-scaled so it holds a constant on-screen size at
            every zoom (the ring strokes get the same via non-scaling-stroke) */}
        {pin.label !== '' && (
          <g
            data-counter-scale-x={pinCenter.worldX}
            data-counter-scale-y={pinCenter.worldY + geo.cellSize * 0.42}
            transform={counterScaleTransform(pinCenter.worldX, pinCenter.worldY + geo.cellSize * 0.42, counterScale)}
          >
            <text
              className="windrose-party-pin-label"
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="hanging"
              fill="#ffffff"
              stroke="rgba(26, 26, 26, 0.9)"
              strokeWidth={3}
              paintOrder="stroke"
              fontSize={12.5}
              fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
              fontWeight="600"
            >
              {pin.label}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
};

export { PartyPinOverlay };
