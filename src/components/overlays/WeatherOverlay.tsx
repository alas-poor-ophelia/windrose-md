/**
 * WeatherOverlay.tsx
 *
 * SVG overlay showing the weather over a hex map's weather-bound regions:
 * a tint (and, for falling or obscuring weather, a texture) across the
 * region's hexes, and a constant-size badge with a glyph and temperature.
 *
 * Lives outside the canvas's cached static surface on purpose — weather
 * changes with the world's day, not with map edits, and must not rebuild
 * the surface. Shapes are drawn in world coordinates inside one group that
 * tracks live pan/zoom, as PartyPinOverlay does.
 */

import { useMemo, useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry, Point, WorldCoords } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';
import type { WeatherVisual, WeatherVisualKind } from '../../weather/weatherVisuals';
import { getWeatherTint } from '../../weather/weatherVisuals';
import { getRegionLabelHalfHeight } from '../../geometry/renderers/regionRenderer';
import {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { Z_INDEX } from '../../core/dmtConstants';

/** One region's weather, resolved and ready to draw */
export interface WeatherRegionVisual {
  regionId: string;
  /** Hexes to tint — fogged hexes already removed */
  hexes: Point[];
  visual: WeatherVisual;
  /** Badge anchor in world space; null draws no badge */
  badgeAnchor: WorldCoords | null;
  badgeText: string;
}

/** Hex geometry surface used for world-space rendering */
interface WeatherGeometry extends IGeometry {
  hexSize: number;
  getHexVertices: (q: number, r: number) => WorldCoords[];
}

interface WeatherOverlayProps {
  regions: WeatherRegionVisual[];
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  /** Live pan/zoom controller — the overlay tracks gestures via imperative transform updates */
  viewController?: ViewController;
}

/** Kinds drawn with a texture over the tint */
const TEXTURED_KINDS: WeatherVisualKind[] = ['drizzle', 'rain', 'sleet', 'snow', 'fog'];

/** Screen-px gap between the region's name label and the badge under it */
const BADGE_GAP = 4;
const BADGE_HEIGHT = 20;
const BADGE_GLYPH_WIDTH = 22;
const BADGE_CHAR_WIDTH = 7;

const GLYPH_STROKE = { fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const CLOUD_PATH = 'M-5 1.5a2.6 2.6 0 0 1 .3-5.18A4.1 4.1 0 0 1 3.4-4.1 3 3 0 0 1 4.2 1.5Z';

let overlayInstanceCount = 0;

/** All of a region's hexes as one path, so shared edges do not show as seams under a translucent fill */
function buildHexesPath(geo: WeatherGeometry, hexes: Point[]): string {
  const parts: string[] = [];
  for (const hex of hexes) {
    const vertices = geo.getHexVertices(hex.x, hex.y);
    parts.push('M' + vertices.map(v => `${v.worldX} ${v.worldY}`).join('L') + 'Z');
  }
  return parts.join('');
}

/** Texture tile for a weather kind, sized against the hex so density holds at every zoom */
function renderPattern(kind: WeatherVisualKind, id: string, u: number): VNode | null {
  switch (kind) {
    case 'drizzle':
      return (
        <pattern key={id} id={id} width={u * 0.5} height={u * 0.5} patternUnits="userSpaceOnUse">
          <line x1={u * 0.3} y1={u * 0.12} x2={u * 0.24} y2={u * 0.28} stroke="#e6f1ff" strokeOpacity={0.5} strokeWidth={u * 0.025} strokeLinecap="round" />
        </pattern>
      );
    case 'rain':
      return (
        <pattern key={id} id={id} width={u * 0.4} height={u * 0.5} patternUnits="userSpaceOnUse">
          <line x1={u * 0.28} y1={u * 0.06} x2={u * 0.14} y2={u * 0.42} stroke="#e6f1ff" strokeOpacity={0.55} strokeWidth={u * 0.035} strokeLinecap="round" />
        </pattern>
      );
    case 'sleet':
      return (
        <pattern key={id} id={id} width={u * 0.5} height={u * 0.5} patternUnits="userSpaceOnUse">
          <line x1={u * 0.2} y1={u * 0.06} x2={u * 0.1} y2={u * 0.3} stroke="#e6f1ff" strokeOpacity={0.55} strokeWidth={u * 0.035} strokeLinecap="round" />
          <circle cx={u * 0.37} cy={u * 0.36} r={u * 0.03} fill="#ffffff" fillOpacity={0.7} />
        </pattern>
      );
    case 'snow':
      return (
        <pattern key={id} id={id} width={u * 0.5} height={u * 0.5} patternUnits="userSpaceOnUse">
          <circle cx={u * 0.12} cy={u * 0.14} r={u * 0.035} fill="#ffffff" fillOpacity={0.85} />
          <circle cx={u * 0.37} cy={u * 0.38} r={u * 0.028} fill="#ffffff" fillOpacity={0.7} />
        </pattern>
      );
    case 'fog':
      return (
        <pattern key={id} id={id} width={u} height={u * 0.36} patternUnits="userSpaceOnUse">
          <rect x={0} y={u * 0.1} width={u} height={u * 0.08} fill="#ffffff" fillOpacity={0.3} />
        </pattern>
      );
    default:
      return null;
  }
}

/** Badge glyph for a weather kind, drawn in a 16px box centred on the origin */
function renderGlyph(kind: WeatherVisualKind): VNode {
  switch (kind) {
    case 'clear':
      return (
        <g {...GLYPH_STROKE}>
          <circle cx={0} cy={0} r={3} />
          <path d="M0-7v2M0 5v2M-7 0h2M5 0h2M-4.95-4.95l1.4 1.4M3.55 3.55l1.4 1.4M-4.95 4.95l1.4-1.4M3.55-3.55l1.4-1.4" />
        </g>
      );
    case 'wind':
      return (
        <g {...GLYPH_STROKE}>
          <path d="M-7-3h7a2.2 2.2 0 1 0-2.2-2.2M-7 1h11a2.2 2.2 0 1 1-2.2 2.2M-7 5h4" />
        </g>
      );
    case 'fog':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 -2)" />
          <path d="M-5 3.5h10M-3 6.5h6" />
        </g>
      );
    case 'snow':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 -2)" />
          <path d="M-3 4.5v.01M0 6.5v.01M3 4.5v.01" strokeWidth={2} />
        </g>
      );
    case 'sleet':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 -2)" />
          <path d="M-2.5 3.5l-1 3M3.5 3.5l-1 3" />
          <path d="M0.5 5.5v.01" strokeWidth={2} />
        </g>
      );
    case 'rain':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 -2)" />
          <path d="M-2.5 3.5l-1 3M0.5 3.5l-1 3M3.5 3.5l-1 3" />
        </g>
      );
    case 'drizzle':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 -2)" />
          <path d="M-2 4l-.6 2M2 4l-.6 2" />
        </g>
      );
    case 'cloudy':
      return (
        <g {...GLYPH_STROKE}>
          <path d={CLOUD_PATH} transform="translate(0 1)" />
        </g>
      );
  }
}

const WeatherOverlay = ({
  regions,
  geometry,
  mapData,
  canvasRef,
  viewController
}: WeatherOverlayProps): VNode | null => {
  const geo = geometry as WeatherGeometry | null;
  const worldGroupRef = useRef<SVGGElement | null>(null);
  const northDirection = mapData?.northDirection ?? 0;

  // Pattern ids are document-global; several maps can be open at once, each
  // with its own hex size
  const [instanceId] = useState(() => ++overlayInstanceCount);
  const patternId = (kind: WeatherVisualKind): string => `windrose-weather-${instanceId}-${kind}`;

  // Mid-gesture pan/zoom ticks rewrite the group transform imperatively
  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry: geo, northDirection, viewController });

  // World-space outlines change only with the regions, not with the view
  const hexPaths = useMemo(() => {
    const paths = new Map<string, string>();
    if (geo == null || geo.type !== 'hex') return paths;
    for (const region of regions) paths.set(region.regionId, buildHexesPath(geo, region.hexes));
    return paths;
  }, [regions, geo]);

  if (regions.length === 0 || !geo || geo.type !== 'hex' || !mapData?.viewState || !canvasRef?.current) {
    return null;
  }

  const metrics = computeOverlayMetrics(canvasRef.current);
  if (!metrics) return null;

  // Render from the LIVE viewState (matches the canvas mid-gesture; equals the
  // committed mapData.viewState otherwise)
  const viewState = viewController?.getLive() ?? mapData.viewState;
  const worldTransform = computeWorldTransform(viewState, geo, northDirection, metrics);
  const counterScale = computeCounterScale(viewState.zoom, metrics.displayScale);
  // The name label is drawn on the canvas, centred on the same anchor, at a
  // size that depends on zoom; the badge hangs just below it in screen px
  const badgeOffsetY = getRegionLabelHalfHeight(viewState.zoom) * metrics.displayScale + BADGE_GAP;

  const texturedKinds = TEXTURED_KINDS.filter(kind => regions.some(r => r.visual.kind === kind));

  return (
    <svg
      className="windrose-weather-overlay"
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
      <defs>
        {texturedKinds.map(kind => renderPattern(kind, patternId(kind), geo.hexSize))}
      </defs>
      <g ref={worldGroupRef} transform={worldTransform}>
        {regions.map(region => {
          const tint = getWeatherTint(region.visual);
          const path = hexPaths.get(region.regionId) ?? '';
          return (
            <g key={region.regionId} className={`windrose-weather-region is-${region.visual.kind}`}>
              <path d={path} fill={tint.color} fillOpacity={tint.opacity} />
              {texturedKinds.includes(region.visual.kind) && (
                <path d={path} fill={`url(#${patternId(region.visual.kind)})`} />
              )}
            </g>
          );
        })}

        {/* Badges — counter-scaled so they hold a constant on-screen size */}
        {regions.map(region => {
          if (region.badgeAnchor == null) return null;
          const x = region.badgeAnchor.worldX;
          const y = region.badgeAnchor.worldY;
          const width = BADGE_GLYPH_WIDTH + region.badgeText.length * BADGE_CHAR_WIDTH + 8;
          return (
            <g
              key={`badge-${region.regionId}`}
              data-counter-scale-x={x}
              data-counter-scale-y={y}
              transform={counterScaleTransform(x, y, counterScale)}
            >
              <g transform={`translate(0 ${badgeOffsetY})`}>
                <rect
                  className="windrose-weather-badge"
                  x={-width / 2}
                  y={0}
                  width={width}
                  height={BADGE_HEIGHT}
                  rx={BADGE_HEIGHT / 2}
                  fill="rgba(20, 24, 30, 0.78)"
                />
                <g transform={`translate(${-width / 2 + 12} ${BADGE_HEIGHT / 2})`}>
                  {renderGlyph(region.visual.kind)}
                </g>
                <text
                  x={-width / 2 + BADGE_GLYPH_WIDTH}
                  y={BADGE_HEIGHT / 2}
                  textAnchor="start"
                  dominantBaseline="central"
                  fill="#ffffff"
                  fontSize={12}
                  fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
                  fontWeight="600"
                >
                  {region.badgeText}
                </text>
              </g>
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export { WeatherOverlay };
