/**
 * RouteLayer.tsx
 *
 * Layer component for saved measurement routes. Renders every saved route
 * as a styled polyline with an optional name/distance label, on every tool
 * (saved routes are permanent map elements). While the measure tool is
 * active, routes accept clicks for deletion (confirm-guarded — saved-route
 * changes are not undoable).
 */

import type { VNode } from 'preact';
import type { ToolId } from '#types/tools/tool.types';
import type { SavedRoute } from '#types/core/map.types';
import type { Point } from '#types/core/geometry.types';
import type { MapDistanceOverrides } from '../../drawing/distanceOperations';

import { formatDistance, getEffectiveDistanceSettings } from '../../drawing/distanceOperations';
import { computeSegmentDistances, removeSavedRoute, sumDistances } from '../../drawing/routeOperations';
import { cellToScreen } from '../../drawing/cellToScreenConverter';
import { getSettings } from '../../core/settingsAccessor';
import { ConfirmModal } from '../../settings/modals/ConfirmModal';
import { Z_INDEX } from '../../core/dmtConstants';
import { useApp } from '../../context/AppContext';
import { useMapState } from '../../context/MapContext';

/** Props for RouteLayer component */
export interface RouteLayerProps {
  /** Current active tool (routes are clickable for deletion while measuring) */
  currentTool: ToolId;
  /** Persists saved-route changes (deletion) */
  onSavedRoutesChange?: (routes: SavedRoute[]) => void;
}

const RouteLayer = ({ currentTool, onSavedRoutesChange }: RouteLayerProps): VNode | null => {
  const app = useApp();
  const { mapData, geometry, canvasRef } = useMapState();

  const routes = mapData?.savedRoutes ?? [];
  if (routes.length === 0 || !geometry || !mapData || !canvasRef?.current) {
    return null;
  }

  const canvas = canvasRef.current;
  const { width: canvasWidth, height: canvasHeight } = canvas;
  const canvasRect = canvas.getBoundingClientRect();
  const displayScale = canvasRect.width / canvasWidth;

  let flexContainer = canvas.parentElement;
  let traversalCount = 0;
  while (flexContainer?.classList && !flexContainer.classList.contains('windrose-canvas-container')) {
    flexContainer = flexContainer.parentElement;
    traversalCount++;
    if (traversalCount > 10) break;
  }
  const containerRect = flexContainer?.getBoundingClientRect();
  const canvasOffsetX = containerRect ? canvasRect.left - containerRect.left : 0;
  const canvasOffsetY = containerRect ? canvasRect.top - containerRect.top : 0;

  const toScreen = (point: Point): { x: number; y: number } => {
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

  const distanceSettings = getEffectiveDistanceSettings(
    mapData.mapType,
    getSettings(),
    (mapData.settings?.distanceSettings ?? null) as MapDistanceOverrides | null
  );

  const deletable = currentTool === 'measure';

  const handleRouteClick = (route: SavedRoute): void => {
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
        zIndex: Z_INDEX.DRAWING_LAYER,
        overflow: 'visible'
      }}
    >
      {routes.map(route => {
        const screenPoints = route.points.map(toScreen);
        const polylinePoints = screenPoints.map(p => `${p.x},${p.y}`).join(' ');

        const labelParts: string[] = [];
        if (route.name != null && route.name !== '') labelParts.push(route.name);
        if (route.showLabel) {
          const total = sumDistances(computeSegmentDistances(
            route.points, geometry, distanceSettings.gridDiagonalRule
          ));
          labelParts.push(formatDistance(
            total,
            distanceSettings.distancePerCell,
            distanceSettings.distanceUnit,
            distanceSettings.displayFormat
          ));
        }
        const label = labelParts.join(' · ');
        const labelAnchor = screenPoints[Math.floor(screenPoints.length / 2)];

        return (
          <g key={route.id}>
            {/* Wide transparent hit target for deletion (touch-friendly) */}
            {deletable && (
              <polyline
                points={polylinePoints}
                fill="none"
                stroke="transparent"
                strokeWidth={Math.max(route.width, 14)}
                style={{ pointerEvents: 'visibleStroke', cursor: 'pointer' }}
                onClick={() => handleRouteClick(route)}
              />
            )}
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={route.color}
              strokeWidth={route.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.85}
            />
            {label !== '' && labelAnchor != null && (
              <text
                x={labelAnchor.x}
                y={labelAnchor.y - 10}
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
            )}
          </g>
        );
      })}
    </svg>
  );
};

export { RouteLayer };
