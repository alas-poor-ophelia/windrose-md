/**
 * MeasurementDayRibbon.tsx
 *
 * The measure tool's route ribbon: a soft band under the measured route,
 * tinted per travel day of the forecast walk, with a small day marker
 * ("D2", "D3", ...) where each day after the first begins. Rendered by
 * MeasurementLayer just before MeasurementOverlay so the route line, its
 * markers and labels stay on top.
 *
 * Same world-space group + live pan/zoom transform as MeasurementOverlay;
 * markers ride counter-scaled groups so they keep their screen size.
 */

import { useRef } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { DayStretch } from '../../weather/forecastRoute';
import {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { useMapState } from '../../context/MapContext';
import { Z_INDEX } from '../../core/dmtConstants';

/** Tints cycle through this many classes (see scss/_measurement.scss) */
const DAY_TINTS = 4;

interface MeasurementDayRibbonProps {
  stretches: DayStretch[];
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
}

const MeasurementDayRibbon = ({ stretches, geometry, mapData, canvasRef }: MeasurementDayRibbonProps): VNode | null => {
  const { viewController } = useMapState();
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const northDirection = mapData?.northDirection ?? 0;

  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry, northDirection, viewController });

  if (stretches.length === 0 || geometry == null || mapData?.viewState == null || canvasRef?.current == null) return null;
  const metrics = computeOverlayMetrics(canvasRef.current);
  if (!metrics) return null;

  const viewState = viewController?.getLive() ?? mapData.viewState;
  const worldTransform = computeWorldTransform(viewState, geometry, northDirection, metrics);
  const counterScale = computeCounterScale(viewState.zoom, metrics.displayScale);

  return (
    <svg
      className="windrose-measure-day-ribbon"
      aria-hidden="true"
      style={{ zIndex: Z_INDEX.DRAWING_LAYER }}
    >
      <g ref={worldGroupRef} transform={worldTransform}>
        {stretches.map(stretch => (
          <polyline
            key={`day-${stretch.index}`}
            className={`windrose-measure-day-ribbon-stretch is-tint-${stretch.index % DAY_TINTS}`}
            points={stretch.points.map(p => `${p.x},${p.y}`).join(' ')}
            vector-effect="non-scaling-stroke"
          />
        ))}
        {stretches.slice(1).map(stretch => {
          const start = stretch.points[0];
          return (
            <g
              key={`marker-${stretch.index}`}
              data-counter-scale-x={start.x}
              data-counter-scale-y={start.y}
              transform={counterScaleTransform(start.x, start.y, counterScale)}
            >
              <g className={`windrose-measure-day-marker is-tint-${stretch.index % DAY_TINTS}`}>
                <rect x={-12} y={9} width={24} height={15} rx={4} />
                <text x={0} y={20} textAnchor="middle">{`D${stretch.index + 1}`}</text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export { MeasurementDayRibbon };
