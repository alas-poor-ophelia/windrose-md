/**
 * AreaSelectLayer.tsx
 *
 * Handles area selection tool:
 * - Registers handlers with EventHandlerContext
 * - Renders start marker overlay (similar to rectangle tool)
 * - Coordinates with MapSelectionContext for multi-select
 */

import type { ToolId } from '#types/tools/tool.types';
import type { VNode } from 'preact';

import { useEffect, useRef } from 'preact/hooks';
import { useAreaSelect } from '../../hooks/interactions/useAreaSelect';
import { useMapState } from '../../context/MapContext';
import { useMapSelection } from '../../context/MapSelectionContext';
import { useEventHandlerRegistration } from '../../context/EventHandlerContext';
import { ShapePreviewOverlay } from './ShapePreviewOverlay';
import { getSettings } from '../../core/settingsAccessor';
import { Z_INDEX } from '../../core/dmtConstants';












/** Props for AreaSelectLayer component */
export interface AreaSelectLayerProps {
  /** Current active tool */
  currentTool: ToolId;
}

const AreaSelectLayer = ({ currentTool }: AreaSelectLayerProps): VNode | null => {
  const { canvasRef, containerRef, mapData, geometry } = useMapState();
  const { areaSelectStart, setAreaSelectStart, clearSelection } = useMapSelection();

  const {
    handleAreaSelectClick,
    cancelAreaSelect,
    isAreaSelecting,
    areaSelectHoverPosition,
    updateAreaSelectHover
  } = useAreaSelect(currentTool);

  const { registerHandlers, unregisterHandlers } = useEventHandlerRegistration();

  const areaSelectHandlersRef = useRef<Record<string, unknown> | null>(null);
  areaSelectHandlersRef.current = {
    handleAreaSelectClick, cancelAreaSelect,
    isAreaSelecting, areaSelectStart, updateAreaSelectHover
  };

  useEffect(() => {
    const proxy = new Proxy({} as Record<string, unknown>, {
      get(_target, prop: string) {
        return areaSelectHandlersRef.current?.[prop];
      }
    });
    registerHandlers('areaSelect', proxy);
    return () => unregisterHandlers('areaSelect');
  }, [registerHandlers, unregisterHandlers]);

  useEffect(() => {
    if (currentTool !== 'areaSelect' && areaSelectStart) {
      setAreaSelectStart(null);
    }
    if (currentTool !== 'areaSelect' && currentTool !== 'select') {
      clearSelection();
    }
  }, [currentTool, areaSelectStart, setAreaSelectStart, clearSelection]);

  const renderStartMarker = (): VNode | null => {
    if (!areaSelectStart || !canvasRef.current || !containerRef?.current || !geometry || !mapData) {
      return null;
    }

    const canvas = canvasRef.current;
    const { viewState, northDirection } = mapData;
    if (!viewState) return null;
    const { zoom, center } = viewState;
    const { width, height } = canvas;

    let scaledSize: number;
    let offsetX: number;
    let offsetY: number;

    if (geometry.type === 'grid') {
      scaledSize = geometry.getScaledCellSize(zoom);
      offsetX = width / 2 - center.x * scaledSize;
      offsetY = height / 2 - center.y * scaledSize;
    } else {
      scaledSize = geometry.getScaledHexSize(zoom);
      offsetX = width / 2 - center.x * zoom;
      offsetY = height / 2 - center.y * zoom;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    const canvasOffsetX = canvasRect.left - containerRect.left;
    const canvasOffsetY = canvasRect.top - containerRect.top;

    const displayScale = canvasRect.width / width;

    const gridX = areaSelectStart.x;
    const gridY = areaSelectStart.y;

    let screenX: number;
    let screenY: number;

    if (geometry.type === 'grid') {
      const cellWorldX = (gridX + 0.5) * geometry.cellSize;
      const cellWorldY = (gridY + 0.5) * geometry.cellSize;
      screenX = offsetX + cellWorldX * zoom;
      screenY = offsetY + cellWorldY * zoom;
    } else {
      const hexCenter = geometry.hexToWorld(gridX, gridY);
      screenX = offsetX + hexCenter.worldX * zoom;
      screenY = offsetY + hexCenter.worldY * zoom;
    }

    if ((northDirection ?? 0) !== 0) {
      const centerX = width / 2;
      const centerY = height / 2;

      screenX -= centerX;
      screenY -= centerY;

      const angleRad = ((northDirection ?? 0) * Math.PI) / 180;
      const rotatedX = screenX * Math.cos(angleRad) - screenY * Math.sin(angleRad);
      const rotatedY = screenX * Math.sin(angleRad) + screenY * Math.cos(angleRad);

      screenX = rotatedX + centerX;
      screenY = rotatedY + centerY;
    }

    screenX *= displayScale;
    screenY *= displayScale;

    const displayScaledSize = scaledSize * displayScale;
    const cellHalfSize = displayScaledSize / 2;

    const markerX = canvasOffsetX + screenX - cellHalfSize;
    const markerY = canvasOffsetY + screenY - cellHalfSize;

    const highlightColor = '#4a9eff';

    return (
      <div
        key="area-select-start"
        className="windrose-area-select-marker"
        style={{
          position: 'absolute',
          left: `${markerX}px`,
          top: `${markerY}px`,
          width: `${displayScaledSize}px`,
          height: `${displayScaledSize}px`,
          border: `2px dashed ${highlightColor}`,
          backgroundColor: 'rgba(74, 158, 255, 0.15)',
          boxSizing: 'border-box',
          pointerEvents: 'none',
          zIndex: Z_INDEX.DRAWING_LAYER,
          borderRadius: '2px'
        }}
      />
    );
  };

  const renderRectanglePreview = (): VNode | null => {
    if (!areaSelectStart || !areaSelectHoverPosition) return null;

    const settings = getSettings();
    const previewEnabled = settings.shapePreviewKbm !== false;
    if (!previewEnabled) return null;

    return (
      <ShapePreviewOverlay
        shapeType="areaSelect"
        startPoint={{ x: areaSelectStart.x, y: areaSelectStart.y }}
        endPoint={areaSelectHoverPosition}
        geometry={geometry}
        mapData={mapData}
        canvasRef={canvasRef}
        containerRef={containerRef}
      />
    );
  };

  const showPreview = areaSelectHoverPosition && areaSelectStart;

  return (
    <>
      {!showPreview && renderStartMarker()}
      {renderRectanglePreview()}
    </>
  );
};

export { AreaSelectLayer };