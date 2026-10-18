/**
 * WeatherOverlay.tsx
 *
 * SVG overlay showing the weather over a map's weather areas (bound
 * regions and the whole-map area): a tint, a static texture for falling or
 * obscuring weather when the animated Sky is off, a subtle ground sheen
 * (snow cover, mud) when the store derives ground state, and for regions a
 * constant-size badge with a glyph and temperature.
 *
 * Lives outside the canvas's cached static surface on purpose — weather
 * changes with the world's day, not with map edits, and must not rebuild
 * the surface. Shapes are drawn in world coordinates inside one group that
 * tracks live pan/zoom, as PartyPinOverlay does.
 *
 * Region name plates are drawn on the map canvas UNDER this overlay; a mask
 * keeps the weather off them so a snowy or foggy region's name stays
 * readable. Static presentation (position, colours, fonts) lives in
 * scss/_map-layers.scss.
 */

import { useRef, useState } from 'preact/hooks';
import type { RefObject, VNode } from 'preact';
import type { IGeometry, WorldCoords } from '#types/core/geometry.types';
import type { MapData } from '#types/core/map.types';
import type { ViewController } from '#types/hooks/viewController.types';
import type { WeatherVisual, WeatherVisualKind } from '../../weather/weatherVisuals';
import type { RegionLabelSpot } from '../../weather/skyCells';
import { getWeatherTint } from '../../weather/weatherVisuals';
import { regionLabelPlateSize } from '../../weather/skyCells';
import { getRegionLabelHalfHeight } from '../../geometry/renderers/regionRenderer';
import {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { Z_INDEX } from '../../core/dmtConstants';

/** Ground cover shown as a sheen, each 0..1 (0 = none) */
export interface WeatherGroundVisual {
  snow: number;
  mud: number;
}

/** One weather area, resolved and ready to draw */
export interface WeatherAreaVisual {
  /** The weather area's id */
  id: string;
  /** World-space outline (nonzero fill); fogged cells already removed */
  path: string;
  visual: WeatherVisual;
  /** Scales the tint opacity (the whole-map area is tinted more lightly) */
  tintScale: number;
  ground: WeatherGroundVisual | null;
  /** Badge anchor in world space; null draws no badge */
  badgeAnchor: WorldCoords | null;
  badgeText: string;
}

/** Geometry surface used for world-space rendering */
interface WeatherGeometry extends IGeometry {
  cellSize: number;
  hexSize?: number;
}

interface WeatherOverlayProps {
  areas: WeatherAreaVisual[];
  /** Region name plates to keep clear of the weather (world-space anchors) */
  labels?: RegionLabelSpot[];
  /** Draw the static precipitation/fog textures (the animated Sky is off) */
  textured: boolean;
  geometry: IGeometry | null;
  mapData: MapData | null;
  canvasRef: RefObject<HTMLCanvasElement> | null;
  /** Live pan/zoom controller — the overlay tracks gestures via imperative transform updates */
  viewController?: ViewController;
}

/** Kinds drawn with a texture over the tint */
const TEXTURED_KINDS: WeatherVisualKind[] = ['drizzle', 'rain', 'sleet', 'snow', 'fog'];

/** Mask extent in world px: far beyond any reachable view */
const MASK_EXTENT = 1e7;

/** Screen-px gap between the region's name label and the badge under it */
const BADGE_GAP = 4;
const BADGE_HEIGHT = 20;
const BADGE_GLYPH_WIDTH = 22;
const BADGE_CHAR_WIDTH = 7;

const GLYPH_STROKE = { fill: 'none', stroke: '#ffffff', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const CLOUD_PATH = 'M-5 1.5a2.6 2.6 0 0 1 .3-5.18A4.1 4.1 0 0 1 3.4-4.1 3 3 0 0 1 4.2 1.5Z';

let overlayInstanceCount = 0;

/** Ground sheen tiles, sized against the cell like the textures */
function renderGroundPatterns(snowId: string | null, mudId: string | null, u: number): VNode[] {
  const out: VNode[] = [];
  if (snowId != null) {
    out.push(
      <pattern key={snowId} id={snowId} width={u * 0.6} height={u * 0.6} patternUnits="userSpaceOnUse">
        {/* A light veil, not a white-out: the painted terrain must still read through it */}
        <rect width={u * 0.6} height={u * 0.6} fill="#eef4fc" fillOpacity={0.16} />
        <circle cx={u * 0.12} cy={u * 0.18} r={u * 0.02} fill="#ffffff" fillOpacity={0.7} />
        <path d={`M${u * 0.3} ${u * 0.47}q${u * 0.12} ${-u * 0.05} ${u * 0.24} 0`} stroke="#ffffff" strokeOpacity={0.45} strokeWidth={u * 0.014} fill="none" />
      </pattern>
    );
  }
  if (mudId != null) {
    out.push(
      // Sparse and light: a whole-map area lays this over every cell
      <pattern key={mudId} id={mudId} width={u * 0.8} height={u * 0.8} patternUnits="userSpaceOnUse">
        <circle cx={u * 0.14} cy={u * 0.18} r={u * 0.022} fill="#5b4126" fillOpacity={0.45} />
        <circle cx={u * 0.55} cy={u * 0.42} r={u * 0.018} fill="#6e5032" fillOpacity={0.4} />
        <circle cx={u * 0.3} cy={u * 0.66} r={u * 0.02} fill="#4f3820" fillOpacity={0.42} />
      </pattern>
    );
  }
  return out;
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
  areas,
  labels = [],
  textured,
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
  const patternId = (kind: WeatherVisualKind | 'ground-snow' | 'ground-mud' | 'labels'): string => `windrose-weather-${instanceId}-${kind}`;

  // Mid-gesture pan/zoom ticks rewrite the group transform imperatively
  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry: geo, northDirection, viewController });

  if (areas.length === 0 || !geo || !mapData?.viewState || !canvasRef?.current) {
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

  const texturedKinds = textured ? TEXTURED_KINDS.filter(kind => areas.some(a => a.visual.kind === kind)) : [];
  const hasSnow = areas.some(a => (a.ground?.snow ?? 0) > 0);
  const hasMud = areas.some(a => (a.ground?.mud ?? 0) > 0);
  const unit = geo.hexSize ?? geo.cellSize;
  const zoom = viewState.zoom > 0 ? viewState.zoom : 1;

  return (
    <svg
      className="windrose-weather-overlay"
      style={{ zIndex: Z_INDEX.CANVAS_OVERLAY }}
    >
      <defs>
        {texturedKinds.map(kind => renderPattern(kind, patternId(kind), unit))}
        {renderGroundPatterns(hasSnow ? patternId('ground-snow') : null, hasMud ? patternId('ground-mud') : null, unit)}
      </defs>
      <g ref={worldGroupRef} transform={worldTransform}>
        {/* Name plates cut out of the weather; plate size is canvas px, so /zoom in world px */}
        {labels.length > 0 && (
          <mask
            id={patternId('labels')}
            maskUnits="userSpaceOnUse"
            x={-MASK_EXTENT}
            y={-MASK_EXTENT}
            width={2 * MASK_EXTENT}
            height={2 * MASK_EXTENT}
          >
            <rect x={-MASK_EXTENT} y={-MASK_EXTENT} width={2 * MASK_EXTENT} height={2 * MASK_EXTENT} fill="#ffffff" />
            {labels.map(label => {
              const plate = regionLabelPlateSize(label.text, zoom);
              const w = plate.width / zoom;
              const h = plate.height / zoom;
              return <rect key={label.regionId} x={label.worldX - w / 2} y={label.worldY - h / 2} width={w} height={h} fill="#000000" />;
            })}
          </mask>
        )}
        <g mask={labels.length > 0 ? `url(#${patternId('labels')})` : undefined}>
          {areas.map(area => {
            const tint = getWeatherTint(area.visual);
            const snow = area.ground?.snow ?? 0;
            const mud = area.ground?.mud ?? 0;
            return (
              <g key={area.id} className={`windrose-weather-area is-${area.visual.kind}`}>
                {snow > 0 && (
                  <path className="windrose-weather-ground is-snow" d={area.path} fill={`url(#${patternId('ground-snow')})`} fillOpacity={snow} />
                )}
                {mud > 0 && (
                  <path className="windrose-weather-ground is-mud" d={area.path} fill={`url(#${patternId('ground-mud')})`} fillOpacity={mud} />
                )}
                <path d={area.path} fill={tint.color} fillOpacity={tint.opacity * area.tintScale} />
                {texturedKinds.includes(area.visual.kind) && (
                  <path d={area.path} fill={`url(#${patternId(area.visual.kind)})`} fillOpacity={area.tintScale} />
                )}
              </g>
            );
          })}
        </g>

        {/* Badges — counter-scaled so they hold a constant on-screen size */}
        {areas.map(region => {
          if (region.badgeAnchor == null) return null;
          const x = region.badgeAnchor.worldX;
          const y = region.badgeAnchor.worldY;
          const width = BADGE_GLYPH_WIDTH + region.badgeText.length * BADGE_CHAR_WIDTH + 8;
          return (
            <g
              key={`badge-${region.id}`}
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
                />
                <g transform={`translate(${-width / 2 + 12} ${BADGE_HEIGHT / 2})`}>
                  {renderGlyph(region.visual.kind)}
                </g>
                <text
                  className="windrose-weather-badge-text"
                  x={-width / 2 + BADGE_GLYPH_WIDTH}
                  y={BADGE_HEIGHT / 2}
                  textAnchor="start"
                  dominantBaseline="central"
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
