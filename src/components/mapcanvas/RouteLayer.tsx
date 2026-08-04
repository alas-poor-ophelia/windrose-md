/**
 * RouteLayer.tsx
 *
 * Layer component for saved measurement routes. Renders every saved route
 * as a styled polyline in world space, inside a group whose transform tracks
 * the live pan/zoom controller — routes move with the map mid-gesture, like
 * the canvas itself. Name/distance labels are hidden by default and revealed
 * on hover (mouse) or tap (touch) via container-level hit-testing, so routes
 * never intercept pointer events meant for the canvas. While the measure tool
 * is active, clicking a route opens a menu to edit its name/style or delete
 * it; both changes participate in undo history.
 */

import type { VNode } from 'preact';
import type { ToolId } from '#types/tools/tool.types';
import type { SavedRoute } from '#types/core/map.types';
import type { IGeometry, Point } from '#types/core/geometry.types';

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Menu } from 'obsidian';
import { formatDistance, getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import {
  computeSegmentDistances,
  distanceToSegment,
  removeSavedRoute,
  sumDistances,
  updateSavedRoute
} from '../../drawing/routeOperations';
import { SaveRouteModal } from '../modals/SaveRouteModal';
import { getEnabledTravelPacks } from '../../travel/travelPackOperations';
import { findTerrainById } from '../../travel/travelTimeOperations';
import {
  computeCounterScale,
  computeOverlayMetrics,
  computeWorldTransform,
  counterScaleTransform,
  findCanvasContainer,
  useLiveOverlayTransform
} from '../../hooks/canvas/useLiveOverlayTransform';
import { getSettings } from '../../core/settingsAccessor';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { Z_INDEX } from '../../core/dmtConstants';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';

/** Geometry surface for cell→world conversion */
interface RouteGeometry extends IGeometry {
  cellSize: number;
}

/** Hover/tap hit distance from a route line, in CSS pixels */
const REVEAL_HIT_PX = 12;
/** How long a touch tap keeps a route's label revealed */
const TOUCH_REVEAL_MS = 3000;

/** Props for RouteLayer component */
export interface RouteLayerProps {
  /** Current active tool (routes are clickable for edit/delete while measuring) */
  currentTool: ToolId;
  /** Persists saved-route changes (edit and deletion) */
  onSavedRoutesChange?: (routes: SavedRoute[]) => void;
}

const RouteLayer = ({ currentTool, onSavedRoutesChange }: RouteLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, canvasRef, screenToWorld, viewController, distanceOverrides } = useMapState();

  const worldGroupRef = useRef<SVGGElement | null>(null);
  const [revealedRouteId, setRevealedRouteId] = useState<string | null>(null);
  const touchRevealTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (touchRevealTimerRef.current != null) window.clearTimeout(touchRevealTimerRef.current);
  }, []);

  const geo = geometry as RouteGeometry | null;
  const savedRoutes = mapData?.savedRoutes;
  const routes = useMemo(() => savedRoutes ?? [], [savedRoutes]);
  const northDirection = mapData?.northDirection ?? 0;

  // Mid-gesture pan/zoom ticks rewrite the group transform imperatively
  useLiveOverlayTransform({ groupRef: worldGroupRef, canvasRef, geometry: geo, northDirection, viewController });

  const toWorld = useCallback((point: Point): { x: number; y: number } => {
    if (geo == null) return { x: 0, y: 0 };
    const c = geo.getCellCenter(point.x, point.y);
    return { x: c.worldX, y: c.worldY };
  }, [geo]);

  // Label reveal: container-level hit-testing (never intercepts canvas input).
  // Mouse hover reveals while near a route; a touch tap reveals for a moment.
  useEffect(() => {
    const canvas = canvasRef?.current;
    if (!canvas || !geo || routes.length === 0 || screenToWorld == null) return undefined;
    const container = findCanvasContainer(canvas);
    if (!container) return undefined;

    const routeNear = (clientX: number, clientY: number): string | null => {
      if (viewController?.isGesturing() === true) return null;
      const world = screenToWorld(clientX, clientY);
      if (!world) return null;
      const zoom = viewController?.getLive().zoom ?? mapData?.viewState?.zoom ?? 1;
      const displayScale = computeOverlayMetrics(canvas)?.displayScale ?? 1;
      const threshold = REVEAL_HIT_PX / Math.max(zoom * displayScale, 1e-6);
      for (const route of routes) {
        const pts = route.points.map(toWorld);
        for (let i = 1; i < pts.length; i++) {
          if (distanceToSegment(world.worldX, world.worldY, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= threshold) {
            return route.id;
          }
        }
      }
      return null;
    };

    const handleMove = (e: PointerEvent): void => {
      if (e.pointerType === 'touch') return;
      setRevealedRouteId(routeNear(e.clientX, e.clientY));
    };
    const handleLeave = (): void => setRevealedRouteId(null);
    const handleDown = (e: PointerEvent): void => {
      if (e.pointerType !== 'touch') return;
      const id = routeNear(e.clientX, e.clientY);
      if (id == null) return;
      setRevealedRouteId(id);
      if (touchRevealTimerRef.current != null) window.clearTimeout(touchRevealTimerRef.current);
      touchRevealTimerRef.current = window.setTimeout(() => setRevealedRouteId(null), TOUCH_REVEAL_MS);
    };

    container.addEventListener('pointermove', handleMove);
    container.addEventListener('pointerleave', handleLeave);
    container.addEventListener('pointerdown', handleDown);
    return () => {
      container.removeEventListener('pointermove', handleMove);
      container.removeEventListener('pointerleave', handleLeave);
      container.removeEventListener('pointerdown', handleDown);
    };
  }, [routes, geo, canvasRef, screenToWorld, viewController, mapData, toWorld]);

  if (routes.length === 0 || !geo || !mapData?.viewState || !canvasRef?.current) {
    return null;
  }

  const metrics = computeOverlayMetrics(canvasRef.current);
  if (!metrics) return null;

  // Render from the LIVE viewState (matches the canvas mid-gesture; equals
  // the committed mapData.viewState otherwise)
  const viewState = viewController?.getLive() ?? mapData.viewState;
  const worldTransform = computeWorldTransform(viewState, geo, northDirection, metrics);
  const counterScale = computeCounterScale(viewState.zoom, metrics.displayScale);

  const distanceSettings = getEffectiveDistanceSettings(
    mapData.mapType,
    getSettings(),
    (distanceOverrides ?? null)
  );

  // Terrain colors resolve against enabled packs; a vanished terrain simply
  // falls back to the route's own color
  const enabledPacks = getEnabledTravelPacks(getSettings().travelPacks);

  const interactive = currentTool === 'measure';

  const handleEditRoute = (route: SavedRoute): void => {
    void new SaveRouteModal(app, {
      initial: {
        name: route.name ?? '',
        color: route.color,
        width: route.width,
        showLabel: route.showLabel
      },
      title: 'Edit route',
      submitText: 'Save changes'
    }).openAndGetValue().then(options => {
      if (options == null) return;
      onSavedRoutesChange?.(updateSavedRoute(mapData.savedRoutes ?? [], route.id, options));
    });
  };

  const handleDeleteRoute = (route: SavedRoute): void => {
    const label = route.name != null && route.name !== '' ? `"${route.name}"` : 'this route';
    void new ConfirmModal(app, {
      message: `Delete ${label} from the map?`,
      confirmText: 'Delete route',
      isDestructive: true
    }).openAndGetValue().then(confirmed => {
      if (!confirmed) return;
      onSavedRoutesChange?.(removeSavedRoute(mapData.savedRoutes ?? [], route.id));
    });
  };

  const handleRouteClick = (route: SavedRoute, event: MouseEvent): void => {
    const menu = new Menu();
    menu.addItem(item => item
      .setTitle('Edit route…')
      .setIcon('pencil')
      .onClick(() => handleEditRoute(route)));
    menu.addItem(item => item
      .setTitle('Delete route')
      .setIcon('trash')
      .onClick(() => handleDeleteRoute(route)));
    menu.showAtMouseEvent(event);
  };

  return (
    <svg
      className="windrose-route-layer"
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
        {routes.map(route => {
          const worldPoints = route.points.map(toWorld);
          const polylinePoints = worldPoints.map(p => `${p.x},${p.y}`).join(' ');

          const labelParts: string[] = [];
          if (route.name != null && route.name !== '') labelParts.push(route.name);
          if (route.showLabel || labelParts.length === 0) {
            const total = sumDistances(computeSegmentDistances(
              route.points, geo, distanceSettings.gridDiagonalRule
            ));
            labelParts.push(formatDistance(
              total,
              distanceSettings.distancePerCell,
              distanceSettings.distanceUnit,
              distanceSettings.displayFormat
            ));
          }
          const label = labelParts.join(' · ');
          const labelAnchor = worldPoints[Math.floor(worldPoints.length / 2)];
          const revealed = route.id === revealedRouteId;

          return (
            <g key={route.id}>
              {/* Wide transparent hit target for the edit/delete menu (touch-friendly) */}
              {interactive && (
                <polyline
                  points={polylinePoints}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(route.width, 14)}
                  vector-effect="non-scaling-stroke"
                  style={{ pointerEvents: 'visibleStroke', cursor: 'pointer' }}
                  onClick={(e: MouseEvent) => handleRouteClick(route, e)}
                />
              )}
              {/* Per-segment lines when terrain assignments exist (colors
                  preserve the terrain-aware meaning); plain polyline otherwise */}
              {route.segmentTerrains?.some(t => t != null) === true
                ? worldPoints.slice(0, -1).map((a, i) => {
                  const b = worldPoints[i + 1];
                  const terrain = findTerrainById(enabledPacks, route.segmentTerrains?.[i]);
                  return (
                    <line
                      key={`${route.id}-seg-${i}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={terrain?.color ?? route.color}
                      strokeWidth={route.width}
                      strokeLinecap="round"
                      vector-effect="non-scaling-stroke"
                      opacity={0.85}
                    />
                  );
                })
                : (
                  <polyline
                    points={polylinePoints}
                    fill="none"
                    stroke={route.color}
                    strokeWidth={route.width}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    vector-effect="non-scaling-stroke"
                    opacity={0.85}
                  />
                )}
              {revealed && label !== '' && labelAnchor != null && (
                <g
                  data-counter-scale-x={labelAnchor.x}
                  data-counter-scale-y={labelAnchor.y}
                  transform={counterScaleTransform(labelAnchor.x, labelAnchor.y, counterScale)}
                >
                  <text
                    x={0}
                    y={-12}
                    textAnchor="middle"
                    fill="#ffffff"
                    stroke="rgba(26, 26, 26, 0.9)"
                    strokeWidth={3}
                    paintOrder="stroke"
                    fontSize={12}
                    fontFamily="var(--font-interface, -apple-system, BlinkMacSystemFont, sans-serif)"
                    fontWeight="500"
                  >
                    {label}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
};

export { RouteLayer };
